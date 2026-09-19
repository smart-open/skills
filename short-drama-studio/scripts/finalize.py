#!/usr/bin/env python3
"""
finalize.py — 成片的封面帧与交付信息

封面是分发时的“第一钩子”：提取情绪最高点那一镜的画面作为封面，
可选地在底部叠加大标题文字（用于信息流图）。同时输出一份交付摘要
（final/delivery.json）供 Agent/用户核对与发布。

封面镜选择：优先 project.cover.shot_id（显式指定）；否则取分镜里
emotion_tag 含“高潮/反转/悬念”的第一个镜头；再退到成片时间轴约 40% 处。

用法：
  python3 finalize.py final/<片名>.mp4 production.json [--cover-shot s15] [--title 片名]
  python3 finalize.py final/<片名>.mp4 production.json --no-title
"""
import argparse
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import assemble as A  # noqa: E402


def pick_shot(data, explicit):
    if explicit:
        return explicit
    for s in data["shots"]:
        tag = (s.get("emotion_tag") or "") + (s.get("beat") or "")
        if any(k in tag for k in ("高潮", "反转", "悬念")):
            return s["id"]
    return None


def shot_start_and_dur(data, shot_id):
    t = 0.0
    for s in data["shots"]:
        dur = s.get("seconds", data["project"].get("shot_seconds", 10))
        if s["id"] == shot_id:
            return t, dur
        t += dur
    return min(0.4 * sum(s.get("seconds", 10) for s in data["shots"]), 5.0), 5.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("production")
    ap.add_argument("--cover-shot", default="")
    ap.add_argument("--title", default="")
    ap.add_argument("--no-title", action="store_true")
    args = ap.parse_args()

    vid = Path(args.video).resolve()
    if not vid.exists():
        sys.exit(f"找不到成片：{vid}")
    data = json.loads(Path(args.production).read_text(encoding="utf-8"))
    root = vid.parent

    shot_id = pick_shot(data, args.cover_shot)
    start, dur = shot_start_and_dur(data, shot_id) if shot_id else (0.0, 5.0)
    ts = start + 0.5 * dur  # 取镜头中段，姿态最完整的瞬间

    title = args.title or data["project"].get("title", "")
    cover = root / f"{vid.stem}_cover.jpg"
    ff = A.get_ffmpeg()
    vf = "scale=-2:1080"
    if title and not args.no_title:
        safe = str(title).replace(":", "\\:").replace("'", "\\'")
        vf += (f",drawtext=text='{safe}':x=(w-text_w)/2:y=h-text_h-120:"
               f"fontsize=72:fontcolor=white:borderw=3:bordercolor=black@0.7:"
               f"shadow=1:shadowcolor=black@0.6")
        fc = A.cjk_font()
        if fc:
            vf += f":font={fc}"
    cmd = [ff, "-y", "-ss", str(ts), "-i", str(vid), "-frames:v", "1",
           "-vf", vf, "-q:v", "3", str(cover)]
    A.run(cmd, "封面帧")
    print(f"封面：{cover}（取自镜 {shot_id or '默认'}，@{round(ts,1)}s，标题：{'开' if title and not args.no_title else '关'}）")

    delivery = root / "delivery.json"
    delivery.write_text(json.dumps({
        "title": data["project"].get("title", ""),
        "file": str(vid), "size_bytes": vid.stat().st_size,
        "cover": str(cover) if cover.exists() else "",
        "cover_shot": shot_id, "cover_time": round(ts, 1),
        "duration_sec": sum(s.get("seconds", 10) for s in data["shots"]),
        "orientation": data["project"].get("orientation", "9:16"),
        "shots": len(data["shots"]),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"交付摘要：{delivery}")


if __name__ == "__main__":
    main()