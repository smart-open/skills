#!/usr/bin/env python3
"""
qa_frames.py — 关键帧多模态质检（针对人物/场景一致性）

背景：跨镜头一致性是最容易翻车的点。帧链生成后，用 agnes-3.0-flash 的图像输入能力，
把“角色定妆照 + 待检关键帧(+上一帧)”一起喂给它，让其按固定 JSON 维度逐项判定，
自动找出变脸/换装/穿帮/镜头断连的坏帧，输出报告并可删除坏帧触发补缺重生成。

判定维度（对应方案模板 E）：
  face_match 特征/年龄一致；feature_match 强识别特征(痣/疤)；hair_match；outfit_match；
  scene_continuity 与上一帧布局/光线连续；pose_bridge 姿态能接住前后动作；
  extra_hands 多指/畸形手；watermark_or_text 水印/乱码文字。
  前三类(face/feature/hair/outfit/scene/pose)必须为 true，后两类必须为 false，才算通过。

用法：
  python3 qa_frames.py production.json                    # 质检全部关键帧
  python3 qa_frames.py production.json --only kf03,kf05   # 只查某些帧
  python3 qa_frames.py production.json --delete-bad       # 把不合格帧的本地文件删掉并清 assets，重跑 frames 可补缺
  python3 qa_frames.py production.json --offline          # 不调 API，只打印将要检查的清单（dry-run）
"""
import argparse
import base64
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import agnes_client as ag  # noqa: E402

HARD_TRUE_BASE = ("face_match", "feature_match", "hair_match", "outfit_match",
                  "person_presence", "scene_match")
HARD_TRUE_CHAIN = HARD_TRUE_BASE + ("scene_continuity", "pose_bridge")
HARD_FALSE = ("extra_person", "extra_hands", "watermark_or_text")

SYSTEM = (
    "你是电影美术监督，负责逐帧质检 AI 短剧关键帧的「人物一致性」与「场景一致性」。"
    "输入：<Picture 1..M> 为角色定妆照（外貌唯一基准），部分图片为同一镜内的另一张关键帧（用于判断连续性），"
    "最后一张通常为待检帧。user 消息会给出本镜的【预期场景】【预期出场角色】【镜头说明】，以此为准判定。"
    "判定原则：人物一致性 = 每个预期角色的脸/发型/服装/特征与定妆照一致、该出现的角色不缺失；"
    "场景一致性 = 画面环境与预期场景相符、时间/光线/构图合理、同镜两帧连续不跳戏。"
    "逐项判定 true/false 并给出证据与一句修改建议。只输出合法 JSON，不要 Markdown 代码块。"
    "JSON 字段：face_match、feature_match、hair_match、outfit_match、person_presence、"
    "scene_match、scene_continuity、pose_bridge、extra_person、extra_hands、watermark_or_text、reason、suggestion"
    "。person_presence=true 表示预期角色都出场且无应为空场的镜头出现主角；"
    "extra_person=true 表示画面出现剧本未约定的多余人物；"
    "scene_match=true 表示场景与预期场景相符。"
    "【recast 例外】：若 user 消息中注明某角色为「recast 角色（允许改变发型/服装）」，"
    "则 hair_match 和 outfit_match 仅需判断脸/体型/年龄/胡须等身份特征一致，"
    "发型与服装按本镜文字描述变化是正常的，不应判定为不一致。")


def _file_for_url(data, url):
    """尽量把 CDN URL 映射到本地文件，返回文件路径或 None（避免质检走会过期的 CDN）。"""
    if not url:
        return None
    for c in data.get("characters", []):
        if c.get("portrait_url") == url and c.get("portrait_file"):
            return Path(c["portrait_file"])
    for s in data.get("shots", []):
        for pole in ("first", "last"):
            a = s.get("assets", {})
            if a.get(f"{pole}_frame_url") == url and a.get(f"{pole}_frame_file"):
                return Path(a[f"{pole}_frame_file"])
    return None


def _b64_or_url(data, url, max_width=512):
    """本地文件存在则返回 data URI（先缩放到 max_width 防 payload 过大超时），否则回退原 URL。"""
    fp = _file_for_url(data, url)
    if fp and Path(fp).exists():
        try:
            from PIL import Image
            import io
            img = Image.open(fp)
            w, h = img.size
            if w > max_width:
                ratio = max_width / w
                new_h = int(h * ratio)
                img = img.resize((max_width, new_h), Image.LANCZOS)
            buf = io.BytesIO()
            # 统一转 JPEG，质量 80 足够识别人物/场景
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            img.save(buf, format='JPEG', quality=80, optimize=True)
            return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
        except Exception:
            # PIL 不可用时回退原始编码
            return "data:image/png;base64," + base64.b64encode(Path(fp).read_bytes()).decode()
    return url


def shot_context(data, sid):
    """返回该镜的剧本上下文：预期场景名、预期出场角色名、镜头说明。"""
    s = next((x for x in data["shots"] if x["id"] == sid), None)
    if not s:
        return "（未找到镜头）"
    locs = {l["id"]: l.get("name", l["id"]) for l in data.get("locations", [])}
    chars = {c["id"]: c.get("name", c["id"]) for c in data.get("characters", [])}
    scene = locs.get(s.get("location_id"), s.get("location_id", "?"))
    expected = "、".join(chars.get(cid, cid) for cid in s.get("char_ids", [])) or "（空场/无角色）"
    return f"预期场景：{scene}；预期出场角色：{expected}；镜头说明：{s.get('scene_cn','')}"


def frame_inputs(data, i):
    """chain 模式：kf i 的参考图 URL 列表：出场角色定妆照 + (上一帧 URL 若存在)。"""
    shots = data["shots"]
    chars = {c["id"]: c for c in data.get("characters", [])}
    if i == 0:
        ids = shots[0].get("char_ids", [])
    elif i == len(shots):
        ids = shots[-1].get("char_ids", [])
    else:
        ids = list(dict.fromkeys(shots[i - 1].get("char_ids", []) +
                                 shots[i].get("char_ids", [])))
    urls = []
    for cid in ids:
        if cid in chars:
            c = chars[cid]
            # 优先用角色卡（和生成时的参考图一致），缺省回退定妆照
            ref = c.get("character_sheet_url") or c.get("portrait_url")
            if ref:
                urls.append(ref)
    if i == 0:
        target = shots[0]["assets"].get("first_frame_url")
    else:
        target = shots[i - 1]["assets"].get("last_frame_url")
        prev = shots[i - 2]["assets"].get("last_frame_url") if i >= 2 else None
    if target:
        urls.append(target)          # 待检帧放最后一个
        if i >= 2 and prev:
            urls.insert(len(urls) - 1, prev)  # 上一帧插在待检帧前
    return urls, target


def frame_inputs_independent(data, sid, pole):
    """independent 模式：某镜 first/last 帧的参考图 = 本镜角色卡（优先）/定妆照 + 同镜另一帧（对比连续性）。"""
    s = next(x for x in data["shots"] if x["id"] == sid)
    chars = {c["id"]: c for c in data.get("characters", [])}
    urls = []
    for cid in s.get("char_ids", []):
        if cid in chars:
            c = chars[cid]
            # 优先用角色卡（和生成时的参考图一致），缺省回退定妆照
            ref = c.get("character_sheet_url") or c.get("portrait_url")
            if ref:
                urls.append(ref)
    other = s["assets"].get("last_frame_url" if pole == "first" else "first_frame_url")
    target = s["assets"].get(f"{pole}_frame_url")
    if target:
        urls.append(target)
        if other:
            urls.insert(len(urls) - 1, other)
    return urls, target


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("production")
    ap.add_argument("--only", default="")
    ap.add_argument("--delete-bad", action="store_true")
    ap.add_argument("--offline", action="store_true")
    args = ap.parse_args()

    p = Path(args.production).resolve()
    from paths import project_paths
    pp = project_paths(p)
    pp.mkdirs()
    data = json.loads(p.read_text(encoding="utf-8"))
    n = len(data["shots"])
    mode = data.get("project", {}).get("frame_mode", "chain")

    wanted = set()
    if args.only:
        wanted = {x.strip() for x in args.only.split(",")}
    if mode == "independent":
        items = [(f"{s['id']}_{pole}", s["id"], pole) for s in data["shots"]
                 for pole in ("first", "last")]
    else:
        items = [(f"kf{i:02d}", None, None) for i in range(n + 1)]

    report = {"checked": [], "passed": [], "failed": []}
    for i, item in enumerate(items):
        fid, sid, pole = item
        if args.only and fid not in wanted:
            continue
        fr = pp.frames_dir / f"{fid}.png"
        if not fr.exists():
            print(f"  [SKIP] {fid} 本地文件不存在，跳过")
            continue
        urls, target = (frame_inputs_independent(data, sid, pole) if mode == "independent"
                        else frame_inputs(data, i))
        entry = {"frame": fid}
        if sid:
            entry["char_ids"] = next((s.get("char_ids") for s in data["shots"]
                                      if s["id"] == sid), None)
        else:
            entry["char_ids"] = None
        entry["context"] = shot_context(data, sid) if sid else ""
        entry["present"] = list(urls)
        if args.offline:
            entry["mode"] = "dry"
            entry["verdict"] = "pending"
            report["checked"].append(entry)
            print(f"  [DRY] {fid} 将用 {len(urls)} 张参考图做一致性质检")
            continue
        if not ag.API_KEYS:
            print("  [SKIP] 无 AGNES_API_KEY / AGNES_API_KEYS，无法调用质检模型（加 --offline 看清单）")
            continue
        # 本地文件转 base64 再传给多模态模型，避免走会过期的 CDN URL 导致超时
        model_imgs = [_b64_or_url(data, u) for u in urls]
        pole_cn = "首帧" if pole == "first" or fid == "kf00" else "末帧"
        ctx = shot_context(data, sid) if sid else ""
        # recast 白名单：这些角色的 hair_match/outfit_match 不参与硬判定（允许改变）
        recast_chars = set()
        shot_obj = None
        if sid:
            shot_obj = next((s for s in data["shots"] if s["id"] == sid), None)
            if shot_obj and shot_obj.get("recast"):
                recast_chars = set(shot_obj["recast"].keys())
        # recast 信息：告诉 QA 哪些角色允许改变发型/服装
        recast_note = ""
        if recast_chars and shot_obj:
            parts = [f"{cid}（{desc}）" for cid, desc in shot_obj["recast"].items()]
            recast_note = f"\n【recast 白名单】以下角色允许改变发型/服装：{', '.join(parts)}。发型服装变化是正常的，只需检查脸/年龄/体型/胡须等身份特征是否一致。"
        user = (f"请质检第 {i+1}/{len(items)} 张关键帧（{fid}），该帧为{pole_cn}。"
                + (f"\n【本镜】{ctx}" if ctx else "")
                + recast_note
                + "\n请按【人物一致性】【场景一致性】两大维度逐项判定并输出 JSON。")
        try:
            v = ag.chat_json(SYSTEM, user, image_urls=model_imgs,
                             temperature=0.2, max_tokens=1024)
        except ag.AgnesError as e:
            entry["verdict"] = "error"
            entry["reason"] = str(e)
            report["failed"].append(entry)
            print(f"  [ERR]  {fid}: {e}")
            continue
        hard_true_list = HARD_TRUE_BASE if mode == "independent" else HARD_TRUE_CHAIN
        if recast_chars:
            # 有 recast 时，hair/outfit 不作为硬失败项
            hard_true_list = tuple(k for k in hard_true_list
                                   if k not in ("hair_match", "outfit_match"))
        hard_true = all(v.get(k) is True for k in hard_true_list)
        hard_false = all(v.get(k) is False for k in HARD_FALSE)
        ok = hard_true and hard_false
        v["_pass"] = ok
        entry.update(v)
        report["checked"].append(entry)
        if ok:
            report["passed"].append(fid)
            print(f"  [PASS] {fid}")
        else:
            report["failed"].append(entry)
            print(f"  [FAIL] {fid}: {v.get('reason','')} → {v.get('suggestion','')}")
            if args.delete_bad:
                try:
                    fr.unlink()
                    if i == 0:
                        data["shots"][0]["assets"]["first_frame_url"] = ""
                    else:
                        data["shots"][i - 1]["assets"]["last_frame_url"] = ""
                        if i < n:
                            data["shots"][i]["assets"]["first_frame_url"] = ""
                    print(f"         已删除本地文件并将 assets 置空，重跑 frames 阶段可补缺")
                except OSError as e:
                    print(f"         删除失败：{e}")

    if args.delete_bad and report["failed"]:
        Path(p).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    out = pp.work_dir / "frame_qa.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "summary": {"checked": len(report["checked"]), "passed": len(report["passed"]),
                    "failed": len(report["failed"])},
        **report}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n报告：{out}  通过 {len(report['passed'])}，失败 {len(report['failed'])}"
          f"{'（失败帧已删除，等待补缺）' if args.delete_bad and report['failed'] else ''}")
    if report["failed"]:
        sys.exit(2)


if __name__ == "__main__":
    main()