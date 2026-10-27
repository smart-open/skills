#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
drift-check —— 逐镜「镜内色调漂移」检测（本地、零 API、零额度）

为什么需要：首帧若是暮色 / 月光调，视频模型常会在 6-10 秒内**自发演出入夜**，
甚至渐进过曝。prompt 层拦不住（实测连写两版"光照与首帧一致、不得入夜"仍漂移）。
所以必须在成片前做一次客观检测，并对真漂移的镜做后期兜底（见 stabilize-color.py）。

关键判据：**先排除「运镜导致的内容变化」**。
  缓慢拉远会让天空/暗部占比变大 —— 画面自然变暗变蓝，那不是漂移。
  **固定机位（static）下出现的任何亮度/色温变化才是真漂移。**

用法：
  python assets/drift-check.py --project <项目目录> [--clips 03_clips] [--out _qa]
输出：控制台表格 + <out>/drift_check.json
      （含每镜 head/tail 抽帧，落在 <out>/_drift/ 供人眼复核）

需要：python3 + Pillow + ffmpeg/ffprobe 在 PATH。
"""
import subprocess, os, glob, json, sys, argparse
from PIL import Image, ImageStat

def dur(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", p], capture_output=True, text=True)
    return float(r.stdout.strip())

def frame(video, t, out):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "%.3f" % t, "-i", video,
                    "-frames:v", "1", out], capture_output=True)
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True, help="项目目录")
    ap.add_argument("--clips", default="03_clips", help="片段子目录（默认 03_clips）")
    ap.add_argument("--out", default="_qa", help="输出子目录（默认 _qa）")
    ap.add_argument("--dark-th", type=float, default=15.0, help="判定变暗的 dL 阈值")
    ap.add_argument("--color-th", type=float, default=8.0, help="判定偏色的 |db*| 阈值")
    a = ap.parse_args()

    PROJ = os.path.abspath(a.project).replace("\\", "/")
    CLIPS = PROJ + "/" + a.clips
    OUTDIR = PROJ + "/" + a.out
    TMP = OUTDIR + "/_drift"
    os.makedirs(TMP, exist_ok=True)

    rows, need = [], []
    for f in sorted(glob.glob(CLIPS + "/shot_S*.mp4")):
        sid = os.path.basename(f)[5:-4]              # shot_S07.mp4 -> S07
        d = dur(f)
        a_p = frame(f, 0.05, "%s/%s_head.png" % (TMP, sid))
        b_p = frame(f, max(0.1, d - 0.30), "%s/%s_tail.png" % (TMP, sid))
        if not (os.path.exists(a_p) and os.path.exists(b_p)):
            rows.append({"shot": sid, "err": "抽帧失败"}); continue
        ia = Image.open(a_p).convert("RGB"); ib = Image.open(b_p).convert("RGB")
        la = ImageStat.Stat(ia.convert("LAB")).mean
        lb = ImageStat.Stat(ib.convert("LAB")).mean
        ma = ImageStat.Stat(ia).mean; mb = ImageStat.Stat(ib).mean
        lum_a = 0.299 * ma[0] + 0.587 * ma[1] + 0.114 * ma[2]
        lum_b = 0.299 * mb[0] + 0.587 * mb[1] + 0.114 * mb[2]
        dL = la[0] - lb[0]; dB = la[2] - lb[2]
        flag = ""
        if dL >= a.dark_th: flag = "DARKENING"
        elif dL <= -a.dark_th: flag = "BRIGHTENING"
        if abs(dB) >= a.color_th: flag += " +BLUING"
        if flag: need.append(sid)
        rows.append({"shot": sid, "dur": round(d, 2), "lum_head": round(lum_a, 1),
                     "lum_tail": round(lum_b, 1), "dL": round(dL, 1),
                     "da": round(la[1] - lb[1], 1), "db": round(dB, 1), "flag": flag})

    print("%-6s %6s %9s %9s %7s %7s  %s" %
          ("shot", "dur", "lumHead", "lumTail", "dL", "db*", "flag"))
    for r in rows:
        if r.get("err"):
            print("%-6s %s" % (r["shot"], r["err"]))
        else:
            print("%-6s %6.2f %9.1f %9.1f %7.1f %7.1f  %s" %
                  (r["shot"], r["dur"], r["lum_head"], r["lum_tail"], r["dL"], r["db"], r["flag"]))
    print("\n可疑镜头: %d  %s" % (len(need), need))
    print("注意：有运镜的镜天然会随景别变化而变亮/变暗，请对照 %s/<shot>_head|tail.png 人眼判别；"
          "\n      固定机位(static)下的任何漂移都是真漂移。" % TMP.replace(PROJ + "/", ""))
    json.dump(rows, open(OUTDIR + "/drift_check.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

if __name__ == "__main__":
    main()
