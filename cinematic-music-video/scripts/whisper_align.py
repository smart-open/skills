# -*- coding: utf-8 -*-
"""whisper_align.py — ASR 实测歌词时间轴，修正 AI 估算的 LRC。

流程:
  1. faster-whisper(small/int8) 转写歌曲，带句级+词级时间戳；
     initial_prompt 注入真实歌词文本，把识别偏置到正确歌词上。
  2. 歌词行与识别段做有序最优匹配（DP，difflib 相似度）。
  3. 命中行取识别段起点；同段多行按字符数比例切分；未命中行在邻句间插值。
  4. 输出修正后的 LRC + 对照报告。

用法:
  python whisper_align.py <audio> <lyrics.txt|lrc> <out.lrc> <report.txt> [hf_endpoint] [model_dir_or_name]
"""
import difflib
import os
import re
import sys

AUDIO, LYRICS_IN, OUT_LRC, REPORT = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
MODEL_REF = sys.argv[6] if len(sys.argv) > 6 else "small"
if len(sys.argv) > 5:
    os.environ["HF_ENDPOINT"] = sys.argv[5]

TIME_TAG = re.compile(r"\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]")
META_TAG = re.compile(r"^\[(ti|ar|al|by|offset|re|ve|length):(.*)\]$", re.I)

def load_lines(path):
    lines = []
    for raw in open(path, encoding="utf-8"):
        s = raw.strip()
        if not s or META_TAG.match(s):
            continue
        text = TIME_TAG.sub("", s).strip()
        if text:
            lines.append(text)
    return lines

def norm(s):
    return re.sub(r"[^\w\u4e00-\u9fff]", "", s).lower()

def fmt(sec):
    if sec < 0:
        sec = 0.0
    cs = int(round(sec * 100))
    mm = cs // 6000
    ss = (cs % 6000) // 100
    cc = cs % 100
    return f"{mm:02d}:{ss:02d}.{cc:02d}"

# ---------- 1. ASR ----------
from faster_whisper import WhisperModel

lyric_lines = load_lines(LYRICS_IN)
prompt = "以下是普通话歌曲的歌词，请对照识别：" + "，".join(lyric_lines[:15])
model = WhisperModel(MODEL_REF, device="cpu", compute_type="int8")
segments, info = model.transcribe(
    AUDIO, language="zh", beam_size=5, vad_filter=False,
    word_timestamps=True, initial_prompt=prompt,
)
segs = []  # {start, end, text, words:[(w,start,end)]}
for seg in segments:
    words = [(w.word.strip(), w.start, w.end) for w in (seg.words or []) if w.word.strip()]
    segs.append({"start": seg.start, "end": seg.end, "text": seg.text.strip(), "words": words})

# ---------- 2. 单调 DP 匹配（允许连续多行共用同一识别段）----------
n, m = len(lyric_lines), len(segs)
nl = [norm(t) for t in lyric_lines]
ns = [norm(s["text"]) for s in segs]

def sim(i, j):
    if not nl[i] or not ns[j]:
        return 0.0
    return difflib.SequenceMatcher(None, nl[i], ns[j]).ratio()

NEG = -1e9
# 转移: 0=跳过识别段j  1=歌词行i未命中  2=歌词行i命中识别段j(可与前行共段)
dp = [[NEG] * (m + 1) for _ in range(n + 1)]
bk = [[0] * (m + 1) for _ in range(n + 1)]
dp[0][0] = 0.0
for j in range(1, m + 1):
    dp[0][j] = 0.0  # 段可以全部不用
    bk[0][j] = 0
for i in range(1, n + 1):
    for j in range(0, m + 1):
        best, arg = NEG, -1
        if j >= 1 and dp[i][j - 1] > best:            # 跳过段 j
            best, arg = dp[i][j - 1], 0
        if j >= 1 and dp[i - 1][j - 1] > best:        # 行 i 未命中
            best, arg = dp[i - 1][j - 1], 1
        s = sim(i - 1, j - 1) if j >= 1 else 0.0
        if j >= 1 and s >= 0.30 and dp[i - 1][j] + s > best:  # 行 i -> 段 j
            best, arg = dp[i - 1][j] + s, 2
        dp[i][j], bk[i][j] = best, arg

# 回溯: 每行歌词 -> 命中的段 index 或 -1
match = [-1] * n
i, j = n, m
while i > 0:
    a = bk[i][j]
    if a == 2:
        match[i - 1] = j - 1
        i -= 1
    elif a == 1:
        i -= 1
        j -= 1
    else:
        j -= 1
        if j < 0:
            break

# ---------- 3. 时间赋值 ----------
def word_start(line_i, seg, from_idx=0):
    """词级细化: 从 from_idx 起找该行首两个字符对应的词起点。"""
    if not seg["words"]:
        return seg["start"]
    head2 = nl[line_i][:2]
    for wi in range(from_idx, len(seg["words"])):
        wn = norm(seg["words"][wi][0])
        if wn and (wn[:2] == head2 or wn[0] == head2[0]):
            return seg["words"][wi][1]
    return seg["start"]

starts = [None] * n
by_seg = {}
for i, j in enumerate(match):
    if j >= 0:
        by_seg.setdefault(j, []).append(i)

for j, group in by_seg.items():
    seg = segs[j]
    if len(group) == 1:
        starts[group[0]] = word_start(group[0], seg, 0)
        continue
    # 多行共段: 先用词级游标按行首字符定位, 失败者按字符数比例兜底
    words = seg["words"]
    cur_w = 0
    fails = []
    for k in group:
        head2 = nl[k][:2]
        found = None
        for wi in range(cur_w, len(words)):
            wn = norm(words[wi][0])
            if wn and (wn[:2] == head2 or wn[0] == head2[0] or (len(wn) > 1 and wn[1] == head2[1])):
                found = wi
                break
        if found is not None:
            starts[k] = words[found][1]
            cur_w = found + 1
        else:
            fails.append(k)
    if fails:
        total = sum(len(nl[k]) or 1 for k in group)
        cur = seg["start"]
        for k in group:
            share = (len(nl[k]) or 1) / total
            if k in fails and starts[k] is None:
                starts[k] = cur
            cur += (seg["end"] - seg["start"]) * share

# 未命中行: 邻句间线性插值
known = [(k, v) for k, v in enumerate(starts) if v is not None]
for k, v in enumerate(starts):
    if v is not None:
        continue
    prev_pair = [(p, s) for p, s in known if p < k]
    next_pair = [(p, s) for p, s in known if p > k]
    if prev_pair and next_pair:
        (p0, s0), (p1, s1) = prev_pair[-1], next_pair[0]
        frac = (k - p0) / (p1 - p0)
        starts[k] = s0 + (s1 - s0) * frac
    elif next_pair:
        p1, s1 = next_pair[0]
        step = 2.7
        if len(next_pair) > 1:
            step = (next_pair[1][1] - s1) / max(1, next_pair[1][0] - p1)
        starts[k] = s1 - step * (p1 - k)
    elif prev_pair:
        p0, s0 = prev_pair[-1]
        step = 2.7
        if len(prev_pair) > 1:
            q0, q1 = prev_pair[-2], prev_pair[-1]
            step = (q1[1] - q0[1]) / max(1, q1[0] - q0[0])
        starts[k] = s0 + step * (k - p0)
    else:
        starts[k] = 1.19 + k * 2.7

# 单调性兜底
for k in range(1, n):
    if starts[k] < starts[k - 1]:
        starts[k] = starts[k - 1]

# ---------- 4. 输出 ----------
with open(OUT_LRC, "w", encoding="utf-8") as f:
    for t, s in zip(lyric_lines, starts):
        f.write(f"[{fmt(s)}]{t}\n")

with open(REPORT, "w", encoding="utf-8") as f:
    f.write("== 识别段（faster-whisper small/int8）==\n")
    for j, s in enumerate(segs):
        f.write(f"  #{j:02d} {s['start']:7.2f}-{s['end']:7.2f}  {s['text']}\n")
    f.write("\n== 歌词对齐结果 ==\n")
    for i, (t, s) in enumerate(zip(lyric_lines, starts)):
        mark = f"seg{match[i]:02d}" if match[i] >= 0 else " 插值"
        f.write(f"  #{i+1:02d} {fmt(s)}  [{mark}]  {t}\n")
print("ALIGN_DONE")
