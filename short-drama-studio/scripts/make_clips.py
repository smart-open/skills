#!/usr/bin/env python3
"""
make_clips.py — 用首尾帧（keyframe 模式）批量生成每个分镜的 10s 视频并下载

特性：
  - 断点续跑：已有 out/clips/sNN.mp4 默认跳过
  - 有界并发（默认 3 个任务），429/5xx 由客户端指数退避
  - 单镜 3 次重试：原样 → 换 seed → 仅首帧（last_frame 置空）
  - 每完成一镜立即回填 production.json

用法：
  python3 make_clips.py production.json
  python3 make_clips.py production.json --workers 4 --only s03,s04
  python3 make_clips.py production.json --force --only s05-s09
"""
import argparse
import json
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import agnes_client as ag  # noqa: E402
from plan_production import pov_instruction  # noqa: E402
from cost_tracker import tracker  # noqa: E402
from versioned import archive_old_file, pending_guard  # noqa: E402

_lock = threading.Lock()


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def save(p, data):
    tmp = p.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(p)


def build_video_prompt(shot, loc, style, project):
    pov = pov_instruction(project, shot)
    if shot.get("video_prompt", "").strip():
        vp = shot["video_prompt"]
        if "首尾帧" not in vp:
            vp += ("\n一致性：人物外貌、服装、场景陈设与光线与首尾帧完全一致，"
                   "不新增角色，不切换场景。")
        if style[:12] not in vp:
            vp += "\n" + style
        if pov:
            vp += "\n" + pov
        return vp
    loc_anchor = loc["anchor"] if loc else "与首尾帧一致的场景"
    sfx = shot.get("sfx", "自然环境声")
    base = (
        f"场景：{loc_anchor}，{shot.get('time_of_day', '')}。\n"
        f"画面与动作：{shot['scene_cn']}。\n"
        f"镜头：{shot.get('shot_size', '中景')}，{shot.get('camera', '固定镜头')}，"
        f"单镜 {shot.get('seconds', 10)} 秒内保持一个连贯运动，节奏平稳。\n"
        f"视觉风格：{style}。\n"
        f"声音：环境声与动作声（{sfx}）；人物对白由后期配音完成，"
        f"人物只做说话的表情与动作，不发出清晰人声。\n"
        f"一致性：人物脸型、发型、识别特征、服装与首尾帧完全一致，"
        f"场景布局、道具、光线方向延续首尾帧，不新增角色，不切换场景。"
    )
    if pov:
        base += "\n" + pov
    return base


def parse_only(spec, shots):
    if not spec:
        return [s["id"] for s in shots]
    wanted = set()
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            nums = range(int(a.lstrip("sS")), int(b.lstrip("sS")) + 1)
            wanted.update(f"s{n:02d}" for n in nums)
        else:
            wanted.add(part if part.startswith("s") else f"s{int(part):02d}")
    return [s["id"] for s in shots if s["id"] in wanted]


def render_one(shot, loc, ratio, style, clips_dir, poll_timeout, force, log, project):
    sid = shot["id"]
    out = clips_dir / f"{sid}.mp4"
    assets = shot.setdefault("assets", {})
    if out.exists() and assets.get("clip_file") and not force:
        return sid, "skip", out
    first = assets.get("first_frame_url")
    last = assets.get("last_frame_url")
    if not first:
        return sid, "fail-missing-frame", None
    prompt = build_video_prompt(shot, loc, style, project)
    seconds = str(shot.get("seconds", 10))
    seed = shot.get("seed")

    # 版本历史：--force 时归档旧版
    if force and out.exists():
        archive_old_file(out, keep=3)

    with pending_guard(out) as guard:
        if guard.already_done and not force:
            assets["clip_url"] = guard.done_url
            assets["clip_file"] = str(out)
            assets["task_status"] = "completed"
            return sid, "skip", out

        attempts = [
            {"first": first, "last": last, "seed": seed},
            # seed 接口范围 -1..999，失败换 seed 须取模否则二次/三次重试会超界
            {"first": first, "last": last, "seed": ((seed or 100) + 177) % 999},
            {"first": first, "last": None, "seed": ((seed or 100) + 355) % 999},  # 兜底：仅首帧
        ]
        last_err = None
        for k, att in enumerate(attempts, 1):
            try:
                log(f"[{sid}] 创建视频任务（尝试 {k}/3，首帧{'有' if att['first'] else '无'}/"
                    f"尾帧{'有' if att['last'] else '无'}）...")
                vid, _ = ag.video_create(
                    prompt, mode="keyframe", seconds=seconds, aspect_ratio=ratio,
                    first_frame=att["first"], last_frame=att["last"], seed=att["seed"])
                assets["video_id"] = vid
                assets["task_status"] = "queued"

                def prog(d, _sid=sid):
                    assets["task_status"] = d.get("status", "")

                final = ag.video_poll(vid, max_wait=poll_timeout, on_progress=prog)
                url = final["metadata"]["url"]
                ag.download(url, out)
                assets["task_status"] = "completed"
                assets["clip_url"] = url
                assets["clip_file"] = str(out)
                guard.mark_done(url, extra={"seed": att["seed"], "shot": sid,
                                           "attempt": k, "seconds": seconds})
                return sid, "ok", out
            except Exception as e:  # noqa: BLE001
                last_err = e
                assets["task_status"] = f"retry:{e}"[:200]
                log(f"[{sid}] 尝试 {k} 失败：{e}")
                time.sleep(2)
        assets["task_status"] = f"failed:{last_err}"[:200]
        return sid, f"fail:{last_err}", None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("production")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--poll-timeout", type=int, default=1200)
    ap.add_argument("--only", default="", help="如 s03,s04 或 s05-s09")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    p = Path(args.production).resolve()
    from paths import project_paths
    pp = project_paths(p)
    pp.mkdirs()
    data = load(p)
    ratio = data["project"]["orientation"]
    style = data["project"]["style_suffix"]
    locs = {l["id"]: l for l in data.get("locations", [])}
    shots = data["shots"]

    # 成本追踪
    tracker.set_output_file(pp.work_dir / "cost_tracking.json")
    wanted = parse_only(args.only, shots)
    todo = [s for s in shots if s["id"] in wanted]
    if not todo:
        print("没有匹配的镜头"); sys.exit(1)

    def log(msg):
        with _lock:
            print(msg, flush=True)

    results = {}
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(render_one, s, locs.get(s.get("location_id", "")),
                          ratio, style, pp.clips_dir, args.poll_timeout, args.force, log,
                          data["project"]): s
                for s in todo}
        for fut in as_completed(futs):
            sid, status, out = fut.result()
            results[sid] = status
            log(f"[{sid}] => {status}")
            with _lock:
                save(p, data)

    ok = [k for k, v in results.items() if v in ("ok", "skip")]
    fail = [f"{k}({v})" for k, v in results.items() if v not in ("ok", "skip")]
    print(f"完成 {len(ok)}/{len(todo)}")
    if fail:
        print("失败镜头：", "; ".join(fail), file=sys.stderr)
        sys.exit(2)
    missing = [s["id"] for s in shots if not (pp.clips_dir / f"{s['id']}.mp4").exists()]
    if missing:
        print("全片仍缺镜头：", missing, file=sys.stderr)
        sys.exit(2)
    print("全部镜头视频就绪。")


if __name__ == "__main__":
    main()
