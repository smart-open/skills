#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
stabilize-color —— 镜内「时间色调稳定化」（本地、零 API、零额度）

用途：修「首帧暮色 -> 模型自发入夜 / 过曝」这类**镜内光线漂移**（drift-check 判定为真漂移的镜）。
原理：本镜首帧就是已验收的关键帧，所以把整段时间轴的色彩/亮度拉回**本镜起始若干帧**的水平：
  1) 抽全部帧；
  2) 逐帧求 LAB 均值/标准差；对均值序列做**滑动平均**（默认窗口 9 帧）——
     先平滑再校正，避免逐帧校正产生闪烁；
  3) 以起始 N 帧（默认 12）的均值/方差为目标，逐帧做 LAB 均值+方差迁移；
  4) 以原帧率重新编码为无音轨片段（assemble 阶段会用原曲）。
局限：**过曝不可逆**。高光细节已丢失的帧，只能把亮度拉回，找不回信息 —— 优先别让它过曝。

用法：
  python assets/stabilize-color.py --project <项目目录> --shots S14,S19,S24
输出：<project>/_qa/stab/shot_<ID>_stab.mp4
      复核后自行替换 <project>/03_clips/shot_<ID>.mp4（**先备份原件**），再重跑 assemble.js。

需要：python3 + Pillow + ffmpeg 在 PATH。
"""
import subprocess, os, sys, argparse, shutil
from PIL import Image, ImageStat

def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)

def smooth(seq, w):
    n = len(seq); out = []
    for i in range(n):
        a = max(0, i - w // 2); b = min(n, i + w // 2 + 1)
        chunk = seq[a:b]
        out.append([sum(c[k] for c in chunk) / len(chunk) for k in range(3)])
    return out

def process(PROJ, shot, smooth_w, head_n, fps, quality):
    src = "%s/03_clips/shot_%s.mp4" % (PROJ, shot)
    if not os.path.exists(src):
        print("  缺文件:", src); return None
    fdir = "%s/_qa/_stabwork/%s" % (PROJ, shot)
    if os.path.exists(fdir): shutil.rmtree(fdir)
    os.makedirs(fdir, exist_ok=True)
    if run(["ffmpeg", "-y", "-v", "error", "-i", src, "-vsync", "0", "%s/%%04d.png" % fdir]).returncode:
        print("  抽帧失败:", shot); return None
    frames = sorted(os.listdir(fdir))
    if not frames: print("  抽帧失败:", shot); return None

    means, sds, imgs = [], [], []
    for f in frames:
        im = Image.open(os.path.join(fdir, f)).convert("RGB")
        lab = im.convert("LAB")
        st = ImageStat.Stat(lab)
        means.append(st.mean); sds.append(st.stddev); imgs.append(im)

    sm = smooth(means, smooth_w)
    k = min(head_n, len(frames))
    tgt_m = [sum(m[c] for m in means[:k]) / k for c in range(3)]
    tgt_s = [sum(s[c] for s in sds[:k]) / k for c in range(3)]

    odir = "%s/_qa/_stabwork/%s_out" % (PROJ, shot)
    os.makedirs(odir, exist_ok=True)
    for i, im in enumerate(imgs):
        bands = list(im.convert("LAB").split())
        outb = []
        for c in range(3):
            scale = tgt_s[c] / (sds[i][c] + 1e-6)
            off = tgt_m[c] - sm[i][c] * scale
            lut = [max(0, min(255, int(round(v * scale + off)))) for v in range(256)]
            outb.append(bands[c].point(lut))
        Image.merge("LAB", outb).convert("RGB").save("%s/%04d.png" % (odir, i + 1))

    dst = "%s/_qa/stab/shot_%s_stab.mp4" % (PROJ, shot)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    run(["ffmpeg", "-y", "-v", "error", "-framerate", str(fps), "-i", "%s/%%04d.png" % odir,
         "-c:v", "libx264", "-preset", "medium", "-crf", str(quality),
         "-pix_fmt", "yuv420p", dst])

    # 自检：头尾亮度是否拉平
    a_p = "%s/_qa/_stabwork/%s_head.png" % (PROJ, shot)
    b_p = "%s/_qa/_stabwork/%s_tail.png" % (PROJ, shot)
    run(["ffmpeg", "-y", "-v", "error", "-ss", "0.05", "-i", dst, "-frames:v", "1", a_p])
    d = float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                   "-of", "csv=p=0", dst]).stdout.strip() or 0)
    run(["ffmpeg", "-y", "-v", "error", "-ss", "%.3f" % max(0.1, d - 0.3), "-i", dst,
         "-frames:v", "1", b_p])
    def L(p):
        m = ImageStat.Stat(Image.open(p).convert("RGB")).mean
        return 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]
    if os.path.exists(a_p) and os.path.exists(b_p):
        ha, ta = L(a_p), L(b_p)
        if abs(ha - ta) > 6:
            print("  !! %s 校正后首尾仍差 %.1f（可能过曝/欠曝过深，建议重跑该镜）" % (shot, abs(ha - ta)))
        else:
            print("  ok %s 帧=%d 校正后首/尾=%.1f/%.1f" % (shot, len(frames), ha, ta))
    return dst

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--shots", required=True, help="逗号分隔，如 S14,S19,S24")
    ap.add_argument("--smooth", type=int, default=9, help="均值滑动平均窗口（帧）")
    ap.add_argument("--head", type=int, default=12, help="以起始 N 帧为目标")
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--crf", type=int, default=18)
    a = ap.parse_args()
    PROJ = os.path.abspath(a.project).replace("\\", "/")
    shots = [s.strip() for s in a.shots.split(",") if s.strip()]
    print("稳定化:", shots)
    for s in shots:
        process(PROJ, s, a.smooth, a.head, a.fps, a.crf)
    print("输出目录:", PROJ + "/_qa/stab")

if __name__ == "__main__":
    main()
