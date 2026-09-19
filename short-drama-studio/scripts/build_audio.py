#!/usr/bin/env python3
"""
build_audio.py — 按角色固定音色编排对白/旁白配音，产出每镜 out/audio/sNN.wav

背景：三个 Agnes 接口（文本/图像/视频）均不提供 TTS，声音一致性无法靠视频模型保证。
本脚本把“配音”从口头约定落地为确定性步骤：
  1. 读取 production.json，扫描所有 shots 的对白/旁白，建立“角色 → 台词列表”；
  2. 依赖 edge-tts（微软 Edge 神经语音，免费、确定性、同角色固定 voice）逐句合成；
  3. 按镜号拼接成 out/audio/s01.wav … out/audio/sNN.wav（长度 ≤ 该镜秒数），供 assemble 混音。
  4. 若未安装 edge-tts，则生成 out/audio/dub_plan.json 清单并给出可执行的降级指引。

每条台词都用该角色行为捕捉的同一把 voice 生成，保证跨镜头同音色。
voice 选择：优先取 characters[].tts.edge_voice（显式指定，最稳）；否则按 voice 字段里
性别/年龄关键词启发式映射到常用 zh-CN 声线。用户可在角色圣经里写死声线获得精确控制。

用法：
  python3 build_audio.py production.json                  # 生成全部配音轨
  python3 build_audio.py production.json --only s01,s03   # 只配指定镜
  python3 build_audio.py production.json --ao --out-dir audio 2>NUL   # --ao 不透明等

依赖（可选）：pip install edge-tts。未安装时优雅降级为清单输出。
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

# 启发式声线选择：性别+年龄段 → edge-tts zh 声线（可被 characters[].tts.edge_voice 覆盖）
VOICE_HEURISTIC = [
    (("童", "孩子", "小孩", "幼"), "zh-CN-XiaoxiaoNeural"),
    (("中老年", "老年", "老", "沧桑", "沙哑", "低沉"), "zh-CN-YunyeNeural"),
    (("女", "少女", "女性", "女生", "软糯", "清亮"), "zh-CN-XiaoxiaoNeural"),
    (("男", "男性", "男生", "磁性"), "zh-CN-YunyangNeural"),
]
DEFAULT_VOICE = "zh-CN-YunyangNeural"

# 常见语速/音调关键字 → edge 参数
RATE_HINTS = {"慢": "-10%", "快": "+8%", "急": "+15%"}
PITCH_HINTS = {"软": "-5Hz", "嗲": "+5Hz"}

# 六类情绪 → (rate, pitch) 预设（借鉴 cyuanxv/ai-mandrama 6 类情绪表，解决"念稿感"）。
# 优先级：characters[].tts.edge_rate/edge_pitch 显式值 > tts.emotion/characters[].emotion 预设 > 关键词启发式。
EMOTION_PRESETS = {
    "neutral": ("+0%", "+0Hz"),     # 平叙/旁白
    "happy":   ("+8%", "+5Hz"),     # 开心
    "excited": ("+15%", "+8Hz"),    # 激动/高能
    "sad":     ("-15%", "-8Hz"),    # 悲伤/低落
    "angry":   ("+12%", "-3Hz"),    # 愤怒/压喉
    "tense":   ("+10%", "-5Hz"),    # 紧张/悬疑
    "gentle":  ("-8%", "+3Hz"),     # 温柔/亲密
}


def pick_voice(char):
    """返回 (voice, rate, pitch)。显式 tts.edge_voice 优先。"""
    tts = (char.get("tts") or {})
    voice = tts.get("edge_voice") or DEFAULT_VOICE
    text = (char.get("voice") or "") + (char.get("age_role") or "")
    if not tts.get("edge_voice"):
        for keys, v in VOICE_HEURISTIC:
            if any(k in text for k in keys):
                voice = v
                break
    emotion = str(tts.get("emotion") or char.get("emotion") or "").strip().lower()
    preset = EMOTION_PRESETS.get(emotion)
    rate = tts.get("edge_rate") or (preset[0] if preset else next((RATE_HINTS[k] for k in RATE_HINTS if k in text), "+0%"))
    pitch = tts.get("edge_pitch") or (preset[1] if preset else next((PITCH_HINTS[k] for k in PITCH_HINTS if k in text), "+0Hz"))
    return voice, rate, pitch


def collect_lines(data):
    """返回 {shot_id: [(speaker_or_None, text)]} 保留台词顺序（含旁白标为 None 用 narrator）"""
    out = {}
    for s in data["shots"]:
        lines = []
        for d in s.get("dialogue", []):
            if d.get("text"):
                lines.append((d.get("speaker") or "旁白", d["text"]))
        if s.get("vo"):
            lines.append(("旁白", s["vo"]))
        out[s["id"]] = lines
    return out


def edge_tts_available():
    try:
        import edge_tts  # noqa: F401
        return True
    except ImportError:
        return False


def synth(provider_text, voice, rate, pitch, mp3_out):
    """同步合成单句文本为 mp3。返回 True/False。"""
    ok = subprocess.run(
        # 注意：--rate/-10% 这类以 - 开头的值必须用等号连接，否则 argparse 会把
        # "-10%" 当成选项报错 "argument --rate: expected one argument"
        [sys.executable, "-m", "edge_tts", "--voice", voice, f"--rate={rate}",
         f"--pitch={pitch}", "--text", provider_text, "--write-media", str(mp3_out)],
        capture_output=True, text=True, timeout=120)
    return ok.returncode == 0 and mp3_out.exists()


def concat_mp3_to_wav(mp3s, wav_out, total_sec):
    """用 ffmpeg 拼接各句 mp3 并对齐为 ≤total_sec 的 44.1k mono wav。"""
    if not mp3s:
        return False
    ff = which_ffmpeg()
    if not ff:
        return False
    cmd = [ff, "-y"]
    for m in mp3s:
        cmd += ["-i", str(m)]
    # 每路输入处理后标记为 [s{i}]，再统一 concat（原实现把输入标签 [i:a]
    # 误拼在处理链之前且与 concat 参数粘连，导致 filter 解析必败）
    # ffmpeg filter_complex 语法：同一链内 filter 用逗号连接，多条链之间必须用分号
    # 分隔。原实现用 "+" 连接且与 concat 的输入标签粘连，导致 "Trailing garbage"。
    filts = ";".join(f"[{i}:a]aresample=44100,atrim=0:{total_sec},asetpts=PTS-STARTPTS[s{i}]"
                     for i in range(len(mp3s)))
    inputs = "".join(f"[s{i}]" for i in range(len(mp3s)))
    filt_complex = f"{filts};{inputs}concat=n={len(mp3s)}:v=0:a=1[a]"
    cmd += ["-filter_complex", filt_complex, "-map", "[a]",
            "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "1", str(wav_out)]
    return subprocess.run(cmd, capture_output=True, text=True).returncode == 0


def which_ffmpeg():
    # 复用 assemble 的全功能 ffmpeg 探测以支持 Windows（简陋版：方向一致）
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import agnes_client  # noqa: F401
    try:
        import assemble as A
        return A.get_ffmpeg()
    except Exception:
        import shutil
        return shutil.which("ffmpeg")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("production")
    ap.add_argument("--only", default="")
    ap.add_argument("--out-dir", default=None, help="配音输出目录（默认 out/audio）")
    ap.add_argument("--mp3-workdir", default=None, help="TTS 中间 mp3 目录（默认 out/work/tts）")
    args = ap.parse_args()

    p = Path(args.production).resolve()
    from paths import project_paths
    pp = project_paths(p)
    pp.mkdirs()
    data = json.loads(p.read_text(encoding="utf-8"))
    aud = pp.audio_dir if not args.out_dir else pp.out_dir / args.out_dir
    aud.mkdir(parents=True, exist_ok=True)

    shots = data["shots"]
    wanted = args.only.split(",") if args.only else [s["id"] for s in shots]
    lines_all = collect_lines(data)

    voice_mem = {}
    manifest = []
    total_lines = 0
    for s in shots:
        if s["id"] not in wanted:
            continue
        lines = lines_all.get(s["id"], [])
        total_lines += len(lines)

    if total_lines == 0:
        print("无对白/旁白，跳过配音。（成片保留模型生成的环境声）")
        return

    if not edge_tts_available():
        # 降级：输出清单 + 指引
        manifest_path = aud / "dub_plan.json"
        plan = {"note": "未检测到 edge-tts，列出需人工/Agent 放置的配音轨",
                "howto": "pip install edge-tts 后重跑；或按角色 in :voice 生成 WAV 放入 out/audio/sNN.wav",
                "shots": []}
        for s in shots:
            if s["id"] not in wanted:
                continue
            lines = lines_all.get(s["id"], [])
            if not lines:
                continue
            plan["shots"].append({"shot": s["id"], "seconds": s.get("seconds", 10),
                                  "lines": [{"speaker": sp, "text": tx} for sp, tx in lines]})
        manifest_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"未安装 edge-tts，跳过自动合成。已生成清单 {manifest_path}")
        print("降级办法：pip install edge-tts 后重跑本脚本；或由 Agent 用任意 TTS 按清单产出 out/audio/sNN.wav")
        return

    mp3_dir = pp.tts_work_dir if not args.mp3_workdir else pp.out_dir / args.mp3_workdir
    mp3_dir.mkdir(parents=True, exist_ok=True)
    for s in shots:
        if s["id"] not in wanted:
            continue
        lines = lines_all.get(s["id"], [])
        if not lines:
            continue
        total_sec = s.get("seconds", 10)
        mp3s = []
        for sp, tx in lines:
            vid = (voice_mem.get(sp) or pick_voice(next(
                (c for c in data["characters"] if c.get("name") == sp), {})))
            voice_mem.setdefault(sp, vid)
            voice, rate, pitch = vid
            mp3 = mp3_dir / f"{s['id']}_{'narr' if sp == '旁白' else sp}_{len(mp3s)}.mp3"
            if not mp3.exists():
                if not synth(tx, voice, rate, pitch, mp3):
                    print(f"  [WARN] 合成失败 {mp3.name}: {tx}")
                    continue
            mp3s.append(mp3)
        wav = aud / f"{s['id']}.wav"
        if mp3s and concat_mp3_to_wav(mp3s, wav, total_sec):
            print(f"  - {s['id']}.wav 由 {len(mp3s)} 句拼成（{voice_mem.get(lines[0][0], ('?',))[0]}）")
        else:
            print(f"  [WARN] {s['id']} 配音未生成")

    print(f"配音完成，输出目录：{aud}")


if __name__ == "__main__":
    main()