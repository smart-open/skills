#!/usr/bin/env python3
"""
agnes_client.py — Agnes AI 三模型 HTTP 客户端（短剧流水线共用）

依赖：requests（标准环境自带）
环境变量：
  AGNES_API_KEY   必填
  AGNES_BASE_URL  可选，默认 https://api.agnes-ai.cn/v1

模型：
  文本 agnes-3.0-flash | 图像 agnes-image-2.5-flash | 视频 agnes-video-2.5-flash

可作为模块导入，也可命令行自测：
  python3 agnes_client.py ping
  python3 agnes_client.py chat "用一句话介绍雨夜便利店"
  python3 agnes_client.py image "雨夜便利店霓虹灯" --ratio 9:16 --out kf.png
  python3 agnes_client.py video-create --first-frame http://x/a.png --last-frame http://x/b.png \
      --prompt "..." --ratio 9:16
  python3 agnes_client.py video-poll <video_id>
"""
import argparse
import base64
import json
import os
import random
import re
import sys
import threading
import time
from pathlib import Path

import requests

from cost_tracker import tracker  # noqa: E402 成本追踪

BASE_URL = os.environ.get("AGNES_BASE_URL", "https://api.agnes-ai.cn/v1").rstrip("/")
TEXT_MODEL = "agnes-3.0-flash"
IMAGE_MODEL = "agnes-image-2.5-flash"
VIDEO_MODEL = "agnes-video-2.5-flash"

# 多 key 轮询：AGNES_API_KEYS 逗号/分号/换行分隔；缺省回退 AGNES_API_KEY（单 key 兼容）
def _parse_keys():
    raw = os.environ.get("AGNES_API_KEYS") or os.environ.get("AGNES_API_KEY", "")
    keys = [k.strip() for k in re.split(r"[,;\s]+", raw) if k.strip()]
    return keys


API_KEYS = _parse_keys()
_index = 0
_key_lock = threading.Lock()


def _next_key():
    """线程安全轮询取 key；无 key 抛错。"""
    global _index
    if not API_KEYS:
        raise AgnesError("缺少环境变量 AGNES_API_KEY / AGNES_API_KEYS")
    with _key_lock:
        k = API_KEYS[_index % len(API_KEYS)]
        _index += 1
    return k


def _rotate_to_next_key():
    """让下一次请求使用下一个 key（限流/5xx 时跳过当前 key）。"""
    global _index
    with _key_lock:
        _index += 1


# 各画幅统一规格（关键帧 2K；Flash 视频 720P）
RATIO_VIDEO_SIZE = {
    "21:9": "1680x720", "16:9": "1280x704", "4:3": "960x720",
    "1:1": "720x720", "3:4": "720x960", "9:16": "720x1280",
}


class AgnesError(RuntimeError):
    pass


def _headers(key=None):
    k = key or _next_key()
    return {"Authorization": f"Bearer {k}", "Content-Type": "application/json"}


def _request(method, url, *, json_body=None, max_retry=5, timeout=180, stream_ok=False):
    """带指数退避的请求；429/5xx/网络错误重试；多 key 时换下一个 key 重试，4xx（除429）直接抛错。"""
    delay = 2
    last_err = None
    for attempt in range(max_retry + 1):
        key = _next_key()
        try:
            r = requests.request(method, url, headers=_headers(key), json=json_body,
                                 timeout=timeout)
            if r.status_code == 429 or r.status_code >= 500:
                last_err = AgnesError(f"HTTP {r.status_code}: {r.text[:300]}")
                _rotate_to_next_key()  # 限流/服务端错，跳过当前 key
            else:
                if r.status_code >= 400:
                    raise AgnesError(f"HTTP {r.status_code}: {r.text[:500]}")
                return r
        except requests.RequestException as e:
            last_err = AgnesError(f"网络错误: {e}")
            _rotate_to_next_key()
        if attempt == max_retry:
            break
        time.sleep(delay + random.random())
        delay = min(delay * 2, 30)
    raise last_err or AgnesError("请求失败")


# ---------------- 文本 ----------------

def chat(messages, *, temperature=0.7, max_tokens=4096, thinking=False, model=TEXT_MODEL):
    body = {"model": model, "messages": messages,
            "temperature": temperature, "max_tokens": max_tokens, "stream": False}
    if thinking:
        body["chat_template_kwargs"] = {"enable_thinking": True}
    r = _request("POST", f"{BASE_URL}/chat/completions", json_body=body)
    data = r.json()
    try:
        content = data["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError):
        raise AgnesError(f"聊天响应异常: {json.dumps(data, ensure_ascii=False)[:500]}")
    # 成本追踪（usage 可能不在响应里，缺失则按 max_tokens 估算）
    usage = data.get("usage") or {}
    pt = usage.get("prompt_tokens", len(json.dumps(messages, ensure_ascii=False)) // 4)
    ct = usage.get("completion_tokens", len(content) // 4)
    tracker.record("text", model=model, prompt_tokens=pt, completion_tokens=ct,
                   has_thinking=thinking)
    return content


def chat_json(system_prompt, user_content, *, temperature=0.3, max_tokens=8192,
              image_urls=None, thinking=False):
    """要求模型只输出 JSON，返回解析后的对象。user_content 可为字符串。"""
    user_blocks = [{"type": "text", "text": user_content}]
    for u in (image_urls or []):
        user_blocks.append({"type": "image_url", "image_url": {"url": u}})
    messages = [
        {"role": "system", "content": system_prompt
            + "\n\n只输出合法 JSON，不要输出 Markdown 代码块、解释或注释。"},
        {"role": "user", "content": user_blocks if image_urls else user_content},
    ]
    raw = chat(messages, temperature=temperature, max_tokens=max_tokens, thinking=thinking)
    return parse_json_lenient(raw)


def parse_json_lenient(raw):
    """容错解析：剥离 ```json 围栏，截取首个 {/[ 到末个 }/]。"""
    if not isinstance(raw, str):
        return raw
    s = raw.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[-1]
        if s.endswith("```"):
            s = s[: s.rfind("```")]
        s = s.strip()
    for open_c, close_c in (("{", "}"), ("[", "]")):
        i, j = s.find(open_c), s.rfind(close_c)
        if i != -1 and j > i:
            try:
                return json.loads(s[i:j + 1])
            except json.JSONDecodeError:
                continue
    raise AgnesError(f"无法从模型输出中解析 JSON: {raw[:300]}")


# ---------------- 图像 ----------------

def image_generate(prompt, *, ratio="9:16", size="2K", ref_urls=None,
                   response_format="url", seed=None, max_retry=3):
    """生成一张图，返回 URL。ref_urls 走多图合成（extra_body.image，失败兜底顶层 image）。"""
    body = {
        "model": IMAGE_MODEL, "prompt": prompt, "size": size, "ratio": ratio,
        "extra_body": {"response_format": response_format},
    }
    if seed is not None:
        body["seed"] = seed
    refs = list(ref_urls or [])
    last_err = None
    attempts = []
    if refs:
        # 官方“重要说明”：图生图/多图合成参考图放 extra_body.image
        body["extra_body"]["image"] = refs
        attempts.append("extra_body.image")
        # 兜底：参数表中的顶层 image
        attempts.append("top-level image")
    else:
        attempts.append("text2img")
    for idx, mode in enumerate(attempts):
        b = json.loads(json.dumps(body))
        if mode == "top-level image":
            b["extra_body"].pop("image", None)
            b["image"] = refs
        try:
            r = _request("POST", f"{BASE_URL}/images/generations", json_body=b,
                         max_retry=max_retry, timeout=300)
            d = r.json()
            item = d["data"][0]
            if item.get("url"):
                tracker.record("image", model=IMAGE_MODEL, size=size, ratio=ratio,
                               ref_count=len(refs), mode=mode)
                return item["url"]
            if item.get("b64_json"):
                tracker.record("image", model=IMAGE_MODEL, size=size, ratio=ratio,
                               ref_count=len(refs), mode=mode)
                return "data:image/png;base64," + item["b64_json"]
            raise AgnesError(f"图像响应无 url/b64_json: {json.dumps(d)[:300]}")
        except AgnesError as e:
            last_err = e
            msg = str(e)
            # 仅对参考图位置类 400 尝试兜底，其余直接失败
            if refs and idx == 0 and ("400" in msg or "image" in msg.lower()):
                continue
            raise
    raise last_err or AgnesError("图像生成失败")


def download(url, out_path, *, timeout=300):
    """下载 URL 或 data URI 到本地，返回 Path。"""
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    if url.startswith("data:"):
        header, b64 = url.split(",", 1)
        out.write_bytes(base64.b64decode(b64))
        return out
    r = requests.get(url, timeout=timeout, stream=True)
    if r.status_code != 200:
        raise AgnesError(f"下载失败 {r.status_code}: {url[:120]}")
    out.write_bytes(r.content)
    return out


# ---------------- 视频 ----------------

def video_create(prompt, *, mode="keyframe", seconds="10", aspect_ratio="9:16",
                 first_frame=None, last_frame=None, images=None, audios=None,
                 seed=None, size="720P"):
    body = {
        "model": VIDEO_MODEL, "prompt": prompt, "mode": mode,
        "seconds": str(seconds), "size": "720P", "aspect_ratio": aspect_ratio, "n": 1,
    }
    if mode == "keyframe":
        if not first_frame and not last_frame:
            raise AgnesError("keyframe 模式必须提供 first_frame 或 last_frame")
        if first_frame:
            body["first_frame"] = first_frame
        if last_frame:
            body["last_frame"] = last_frame
    elif mode == "reference":
        imgs, auds = images or [], audios or []
        if not imgs and not auds:
            raise AgnesError("reference 模式必须提供 images 或 audios")
        if len(imgs) > 5:
            raise AgnesError("Flash reference 图片最多 5 张")
        if len(auds) > 3:
            raise AgnesError("Flash reference 音频最多 3 段")
        if imgs:
            body["images"] = imgs
        if auds:
            body["audios"] = auds
    elif mode == "text":
        pass
    else:
        raise AgnesError(f"未知 mode: {mode}")
    if seed is not None:
        body["seed"] = seed
    if aspect_ratio not in RATIO_VIDEO_SIZE:
        raise AgnesError(f"不支持的画幅 {aspect_ratio}")
    r = _request("POST", f"{BASE_URL}/videos", json_body=body, timeout=120)
    d = r.json()
    vid = d.get("video_id") or d.get("id")
    if not vid:
        raise AgnesError(f"视频任务创建响应缺少 video_id: {json.dumps(d, ensure_ascii=False)[:300]}")
    return vid, d


def video_poll(video_id, *, model=VIDEO_MODEL, interval=2, max_wait=1200, on_progress=None):
    """轮询直到 completed/failed/超时，返回最终任务对象。"""
    url = (f"https://api.agnes-ai.cn/agnesapi?video_id={video_id}"
           f"&model_name={model}")
    start = time.time()
    last_status = None
    while time.time() - start < max_wait:
        r = _request("GET", url, timeout=60, max_retry=3)
        d = r.json()
        status = d.get("status")
        if status != last_status or (on_progress and d.get("progress")):
            if on_progress:
                on_progress(d)
        last_status = status
        if status == "completed":
            if not (d.get("metadata") or {}).get("url"):
                raise AgnesError(f"任务完成但缺少 metadata.url: {json.dumps(d)[:300]}")
            # 成本追踪（成功才记录，失败不扣）
            meta = d.get("metadata") or {}
            secs = meta.get("duration_seconds") or meta.get("seconds") or 0
            tracker.record("video", model=model, seconds=secs or 10,
                           resolution="720P", video_id=video_id)
            return d
        if status == "failed":
            msg = (d.get("error") or {}).get("message", "视频生成失败")
            raise AgnesError(f"任务 {video_id} 失败: {msg}")
        time.sleep(interval)
    raise AgnesError(f"任务 {video_id} 轮询超时（{max_wait}s）")


# ---------------- CLI 自测 ----------------

def _main():
    ap = argparse.ArgumentParser(description="Agnes API 客户端自测")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("ping")
    c = sub.add_parser("chat"); c.add_argument("text")
    i = sub.add_parser("image"); i.add_argument("prompt")
    i.add_argument("--ratio", default="9:16"); i.add_argument("--out", default="out.png")
    i.add_argument("--ref", action="append", default=[])
    v = sub.add_parser("video-create")
    v.add_argument("--prompt", required=True); v.add_argument("--ratio", default="9:16")
    v.add_argument("--first-frame"); v.add_argument("--last-frame")
    v.add_argument("--seconds", default="10"); v.add_argument("--seed", type=int)
    p = sub.add_parser("video-poll"); p.add_argument("video_id")
    args = ap.parse_args()

    if args.cmd == "ping":
        print(json.dumps({"base_url": BASE_URL, "has_key": bool(API_KEYS), "n_keys": len(API_KEYS)}, ensure_ascii=False))
    elif args.cmd == "chat":
        print(chat([{"role": "user", "content": args.text}], temperature=0.8))
    elif args.cmd == "image":
        u = image_generate(args.prompt, ratio=args.ratio, ref_urls=args.ref or None)
        out = download(u, args.out)
        print(f"saved: {out} ({u[:100]})")
    elif args.cmd == "video-create":
        vid, d = video_create(args.prompt, seconds=args.seconds, aspect_ratio=args.ratio,
                              first_frame=args.first_frame, last_frame=args.last_frame,
                              seed=args.seed)
        print(json.dumps({"video_id": vid, "raw": d}, ensure_ascii=False, indent=2))
    elif args.cmd == "video-poll":
        d = video_poll(args.video_id, on_progress=lambda x:
                       print(f"  {x.get('status')} {x.get('progress')}%", file=sys.stderr))
        print(json.dumps(d, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _main()
