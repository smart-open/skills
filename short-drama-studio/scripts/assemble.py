#!/usr/bin/env python3
"""
assemble.py — 拼接全部镜头，烧录字幕，混合配音/BGM/环境声，输出成片

输入（都在 out/ 下，均可选，存在即启用）：
  out/clips/sNN.mp4        单镜视频（必需，由 make_clips.py 产出，保留模型生成的环境声）
  out/audio/sNN.wav        该镜配音轨（对白+旁白，长度建议 ≤ 镜头秒数）
  out/audio/bgm.m4a|.mp3   整段背景音乐（自动循环）
  out/subtitles/full.srt   不存在时按分镜台词/旁白自动生成

输出：
  out/final/<片名>_<时间戳>.mp4

用法：
  python3 assemble.py production.json
  python3 assemble.py production.json --no-subs --no-bgm
  python3 assemble.py production.json --workdir work

⚠ 依赖“全功能” ffmpeg：拼接需要 concat demuxer，烧字幕需要 subtitles/ass 滤镜，
混音需要 amix/loudnorm/apad/aresample 等等。若 PATH 中的 ffmpeg 是精简版（如某些
应用自带的 --disable-everything 构建），本脚本会自动探测并切换到可用的全功能版本，
找不着则给出明确报错而不是生成损坏的成片。
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from agnes_client import RATIO_VIDEO_SIZE  # noqa: E402

# 能力探测用的一条足够小的合成输入：能跑通说明具备 lavfi/anullsrc（完整构建标志）
_PROBE_INPUT = "-f lavfi -i anullsrc=r=48000:cl=stereo -t 0.01 -f null -"
_FILTERS_NEEDED = ("ass", "amix", "loudnorm")     # 字幕 / 混音 / 响度
_DEMUXERS_NEEDED = ("concat",)                     # 拼接

_tool_cache = {"ffmpeg": None, "ffprobe": None}


def _full_capable(ff):
    """返回 True 当 ffmpeg 具备本流水线所需全部能力。"""
    try:
        r_filters = subprocess.run([ff, "-hide_banner", "-filters"],
                                   capture_output=True, text=True, timeout=30)
        r_demux = subprocess.run([ff, "-hide_banner", "-demuxers"],
                                 capture_output=True, text=True, timeout=30)
        r_lavfi = subprocess.run(ff.split() + _PROBE_INPUT.split(),
                                 capture_output=True, timeout=30)
    except (subprocess.TimeoutExpired, OSError):
        return False
    if r_lavfi.returncode != 0:
        return False
    # 滤镜/解封装条目形如 " T. adelay  A->A  Delay..."（滤镜名为第 2 个 token）
    names = {l.split()[1] for l in r_filters.stdout.splitlines()
             if l.startswith(" ") and len(l.split()) >= 2}
    dnames = {l.split()[1] for l in r_demux.stdout.splitlines()
              if len(l.split()) >= 2 and l.split()[0] in ("D", "A", "B")}
    return all(n in names for n in _FILTERS_NEEDED) and all(
        n in dnames for n in _DEMUXERS_NEEDED)


def _candidates():
    own = os.environ.get("AGNES_FFMPEG")
    if own:
        yield own
    seen = set()
    # WinGet 的 Gyan FFmpeg 全功能构建（常见于 Windows 机器）
    packages = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
    if packages.exists():
        for ff in packages.glob("Gyan.FFmpeg_*/*/bin/ffmpeg.exe"):
            if str(ff) not in seen:
                seen.add(str(ff))
                yield str(ff)
        for ff in packages.glob("Gyan.FFmpeg_*/*/*/bin/ffmpeg.exe"):
            if str(ff) not in seen:
                seen.add(str(ff))
                yield str(ff)
    via_path = shutil.which("ffmpeg")
    if via_path and via_path not in seen:
        yield via_path


def get_ffmpeg():
    if _tool_cache["ffmpeg"]:
        return _tool_cache["ffmpeg"]
    chosen = None
    for cand in _candidates():
        if _full_capable(cand):
            chosen = cand
            break
    if not chosen:
        raise RuntimeError(
            "未找到具备全功能（concat demuxer / subtitles、ass 滤镜 / amix、loudnorm / "
            "lavfi anullsrc）的 ffmpeg。当前 PATH 中的 ffmpeg 无法完成拼接/字幕/混音。\n"
            "安装完整版 ffmpeg 后用 AGNES_FFMPEG 环境变量指向它，例如：\n"
            "  winget install Gyan.FFmpeg\n"
            "  $env:AGNES_FFMPEG='C:\\...\\ffmpeg-*\\bin\\ffmpeg.exe'")
    _tool_cache["ffmpeg"] = chosen
    # 用同名目录下的 ffprobe，取不到就按 PATH
    fp = str(Path(chosen).with_name("ffprobe.exe")) if Path(
        chosen).with_name("ffprobe.exe").exists() else "ffprobe"
    _tool_cache["ffprobe"] = fp
    return chosen


def get_ffprobe():
    get_ffmpeg()
    return _tool_cache["ffprobe"]


def run(cmd, desc=""):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"ffmpeg 失败（{desc}）:\n{' '.join(cmd[:6])}...\n{p.stderr[-1500:]}")
    return p


def has_audio(path):
    p = subprocess.run([get_ffprobe(), "-v", "error", "-select_streams", "a",
                        "-show_entries", "stream=codec_type", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True)
    return "audio" in p.stdout


def probe_duration(path):
    """返回视频真实时长（秒）；失败返回 None。配音/字幕定位必须以真实时长为准，
    因为视频模型实际产出时长可能偏离 production.json 里的名义 seconds。"""
    try:
        p = subprocess.run([get_ffprobe(), "-v", "error", "-show_entries",
                            "format=duration", "-of",
                            "default=noprint_wrappers=1:nokey=1", str(path)],
                           capture_output=True, text=True, timeout=30)
        return float(p.stdout.split()[0])
    except (ValueError, IndexError, subprocess.TimeoutExpired, OSError):
        return None


def fmt_ts(sec):
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_srt(data, eff=None):
    lines, t = [], 0.0
    for i, s in enumerate(data["shots"]):
        dur = eff[i] if eff else s.get("seconds", data["project"].get("shot_seconds", 10))
        texts = []
        for d in s.get("dialogue", []):
            if d.get("text"):
                texts.append(f"{d.get('speaker', '')}：{d['text']}".strip("："))
        if s.get("vo"):
            texts.append(s["vo"])
        if texts:
            idx = len(lines) // 4 + 1
            lines += [str(idx), f"{fmt_ts(t)} --> {fmt_ts(t + dur)}", "\n".join(texts), ""]
        t += dur
    return "\n".join(lines)


def cjk_font():
    """返回一个可用的中文字体族名；找不到返回 None（退软字幕）。"""
    try:
        p = subprocess.run(["fc-list", ":lang=zh", "family"], capture_output=True, text=True)
        for line in p.stdout.splitlines():
            name = line.split(",")[0].strip()
            if name:
                return name
    except (FileNotFoundError, OSError):
        pass
    # Windows 内置中文字体
    for fam, pat in (("Microsoft YaHei", r"C:\Windows\Fonts\msyh.ttc"),
                     ("Microsoft YaHei", r"C:\Windows\Fonts\msyh.ttf"),
                     ("SimHei", r"C:\Windows\Fonts\simhei.ttf")):
        if Path(pat).exists():
            return fam
    return None


def ffmpeg_path(p):
    """把过滤器参数里的本地路径转义成 ffmpeg filtergraph 可用的形式。
    Windows 盘符冒号(会当选项分隔符)与反斜杠必须处理：正斜杠 + 冒号转义 \\:。"""
    return str(p).replace("\\", "/").replace(":", "\\:")


def normalize_clips(data, clips_dir, work, w, h):
    """逐镜统一为 WxH / 24fps / yuv420p / AAC48k 立体声。"""
    ff = get_ffmpeg()
    norm = []
    vf = (f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
          f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p")
    for s in data["shots"]:
        src = clips_dir / f"{s['id']}.mp4"
        dst = work / f"{s['id']}.norm.mp4"
        if dst.exists():
            norm.append(dst)
            continue
        if not src.exists():
            raise RuntimeError(f"缺少镜头文件 {src}")
        if has_audio(src):
            cmd = [ff, "-y", "-i", str(src), "-vf", vf,
                   "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                   "-force_key_frames", "expr:gte(t,0)",
                   "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "128k", str(dst)]
        else:
            cmd = [ff, "-y", "-i", str(src),
                   "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
                   "-vf", vf, "-c:v", "libx264", "-crf", "19", "-preset", "medium",
                   "-force_key_frames", "expr:gte(t,0)",
                   "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-shortest", str(dst)]
        run(cmd, f"规范化 {s['id']}")
        norm.append(dst)
    return norm


def concat(norm_list, work):
    ff = get_ffmpeg()
    lst = work / "concat.txt"
    lst.write_text("\n".join(f"file '{p}'" for p in norm_list), encoding="utf-8")
    out = work / "concat.mp4"
    if not out.exists():
        run([ff, "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
             "-c", "copy", str(out)], "拼接")
    return out


def mix_audio(data, concat_file, audio_dir, work, total, use_bgm, eff=None):
    """环境声（视频原声）+ 每镜配音 + BGM → final_audio.m4a；无素材则返回 None。
    eff：每个镜头的真实时长列表（与 data["shots"] 同序），配音按其累计定位；
    缺省退回名义 seconds。"""
    ff = get_ffmpeg()
    dubs = sorted(audio_dir.glob("s*.wav")) if audio_dir.exists() else []
    bgm = None
    if use_bgm and audio_dir.exists():
        for ext in (".m4a", ".mp3", ".wav", ".aac"):
            hit = list(audio_dir.glob(f"bgm{ext}"))
            if hit:
                bgm = hit[0]
                break
    if not dubs and not bgm:
        return None

    cmd = [ff, "-y", "-i", str(concat_file)]
    for d in dubs:
        cmd += ["-i", str(d)]
    if bgm:
        cmd += ["-stream_loop", "-1", "-i", str(bgm)]

    fc, mix_inputs = [], []
    # 原声环境声压低
    fc.append("[0:a]aresample=48000,volume=0.55,apad[amb]")
    mix_inputs.append("[amb]")
    # 每镜配音定位到对应起点（用真实时长累计，避免模型时长漂移导致音画错位）
    t = 0.0
    shot_secs = eff if eff else [s.get("seconds", 10) for s in data["shots"]]
    for n, s in enumerate(data["shots"]):
        f = audio_dir / f"{s['id']}.wav"
        if f in dubs:
            dur = shot_secs[n]
            ms = int(t * 1000)
            label = f"d{n}"
            fc.append(f"[{n+1}:a]aresample=48000,atrim=0:{dur},asetpts=PTS-STARTPTS,"
                      f"adelay={ms}|{ms},volume=1.0[{label}]")
            mix_inputs.append(f"[{label}]")
        t += shot_secs[n]
    if bgm:
        idx = len(dubs) + 1
        fc.append(f"[{idx}:a]aresample=48000,volume=0.12,atrim=0:{total}[bgm]")
        mix_inputs.append("[bgm]")
    fc.append(f"{''.join(mix_inputs)}amix=inputs={len(mix_inputs)}:duration=first:"
              f"dropout_transition=0,loudnorm=I=-14:TP=-1.5:LRA=11[aout]")
    out = work / "final_audio.m4a"
    cmd += ["-filter_complex", ";".join(fc), "-map", "[aout]",
            "-c:a", "aac", "-ar", "48000", "-b:a", "160k", "-t", str(total), str(out)]
    run(cmd, "混音")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("production")
    ap.add_argument("--no-subs", action="store_true")
    ap.add_argument("--no-bgm", action="store_true")
    ap.add_argument("--workdir", default="work")
    args = ap.parse_args()

    p = Path(args.production).resolve()
    from paths import project_paths
    pp = project_paths(p)
    pp.mkdirs()
    data = json.loads(p.read_text(encoding="utf-8"))
    ratio = data["project"]["orientation"]
    w, h = (int(x) for x in RATIO_VIDEO_SIZE[ratio].split("x"))
    total = sum(s.get("seconds", data["project"].get("shot_seconds", 10)) for s in data["shots"])

    ff = get_ffmpeg()
    print(f"[工具] ffmpeg: {ff}")
    work = pp.work_dir
    clips_dir, audio_dir = pp.clips_dir, pp.audio_dir
    out_dir = pp.final_dir
    out_dir.mkdir(exist_ok=True)

    print("[1/4] 统一镜头规格...")
    norm = normalize_clips(data, clips_dir, work, w, h)
    # 用规范化后的真实时长累计（配音/字幕定位基准）；探测失败退回名义 seconds
    eff = [probe_duration(c) for c in norm]
    nominal_s = [s.get("seconds", data["project"].get("shot_seconds", 10))
                 for s in data["shots"]]
    eff = [r if r is not None else n for r, n in zip(eff, nominal_s)]
    total = sum(eff)
    print(f"      真实总时长 {total:.2f}s（名义 {sum(nominal_s)}s），用于配音/字幕定位")
    print("[2/4] 拼接...")
    concat_file = concat(norm, work)

    print("[3/4] 字幕与混音...")
    sub_path = pp.subtitles_dir / "full.srt"
    burn_sub = False
    if not args.no_subs and data["project"].get("subtitles", True):
        sub_path.parent.mkdir(exist_ok=True)
        if not sub_path.exists():
            sub_path.write_text(build_srt(data, eff), encoding="utf-8")
        if sub_path.stat().st_size > 0:
            font = cjk_font()
            burn_sub = bool(font)
            if not font:
                print("  [WARN] 未找到中文字体，改用软字幕（mov_text）封装")

    audio_track = mix_audio(data, concat_file, audio_dir, work, total, not args.no_bgm, eff)

    print("[4/4] 输出成片...")
    stamp = __import__("datetime").datetime.now().strftime("%Y%m%d_%H%M")
    title = "".join(c for c in data["project"]["title"] if c not in r'\/:*?"<>|').strip() or "short_drama"
    final = out_dir / f"{title}_{stamp}.mp4"

    cmd = [ff, "-y", "-i", str(concat_file)]
    if audio_track:
        cmd += ["-i", str(audio_track)]
    if burn_sub:
        font = cjk_font()
        sf = f"subtitles='{ffmpeg_path(sub_path)}':force_style='FontName={font},FontSize=15," \
             f"Outline=1,Shadow=0,MarginV=28'"
        cmd += ["-vf", sf]
    cmd += ["-map", "0:v"]
    if audio_track:
        cmd += ["-map", "1:a", "-c:a", "aac", "-ar", "48000", "-b:a", "160k"]
    else:
        cmd += ["-map", "0:a?", "-c:a", "aac"]
    if not burn_sub:
        cmd += ["-c:v", "copy"]
    else:
        cmd += ["-c:v", "libx264", "-crf", "19", "-preset", "medium"]
    if not burn_sub and not args.no_subs and sub_path.exists() and sub_path.stat().st_size > 0:
        cmd += ["-i", str(sub_path), "-map", "2", "-c:s", "mov_text",
                "-metadata:s:s:0", "language=chi"]
    cmd += ["-movflags", "+faststart", "-shortest", str(final)]
    run(cmd, "最终封装")
    print(f"成片输出：{final}（{total}s，{w}x{h}）")


if __name__ == "__main__":
    main()