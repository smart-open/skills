#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * lib/lyrics.js — Lyric ingestion, LRC parsing and shot-timeline fitting.
 *
 * Two jobs:
 *
 *  1. Turn whatever the user supplies (plain lyrics, LRC with timestamps, or a
 *     separate .lrc file next to the audio) into a normalised structure of
 *     lines, optionally carrying exact start times from the LRC timestamps.
 *     LRC timestamps let the planner pin shots to the real song timeline, which
 *     is the strongest possible guarantee of lyric/visual synchronisation.
 *
 *  2. Fit a requested shot list onto the song's real duration. The video API
 *     only accepts whole-second clip lengths in the range 4..12s, so the
 *     planner's ideal timing can never be used literally. `fitTimeline()`
 *     reconciles this by adjusting shot boundaries, splitting over-long shots
 *     and merging over-short ones, while keeping the total exactly equal to the
 *     audio duration.
 */

const fs = require("fs");
const path = require("path");

const MIN_SHOT_DUR = 4;    // seconds — API minimum clip length
const MAX_SHOT_DUR = 12;   // seconds — API maximum clip length

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const META_TAG = /^\[(ti|ar|al|by|offset|re|ve|length):(.*)\]$/i;

// ---------------------------------------------------------------------------
// Lyric text normalisation
//
// 中文歌词站的 LRC 有两处"看着像歌词、其实不是"的写法，两处都会直接把字幕烧坏：
//
//  1. 行内段落标记 —— "[Verse 1]镜 子 里 的 女 孩…" / "【副歌】…"。
//     这是结构提示，不是歌词。烧进画面很突兀，而且白白撑宽行宽。
//  2. 逐字空格 —— "从 从 容 容 才 是 真 本 事"（KTV 逐字高亮留下的空格）。
//     每条空格都吃掉一个字宽，长句会直接顶出画面外。
//
// 配合 subtitles.js 的 `WrapStyle: 2`（不换行），这两条会让字幕左右被裁掉。
// 因此在解析阶段就规范化：段落标记单独存成 `section`（给规划器当结构提示用），
// `text` 只保留纯歌词、且折叠掉字间空格。
// ---------------------------------------------------------------------------

/**
 * 行内段落标记：[Verse 1] / [Pre-Chorus] / [Rap] / (Bridge) / 【副歌】 等。
 *
 * 候选名要尽量全 —— 漏一个就会把整段标记当歌词烧进画面。
 * 实测漏过 `rap`：《月饼卖不动》的 `[Rap]哎 —— 别卷包装卷到老` 因此原样进了字幕。
 * 复合名（pre-chorus / post-chorus）必须排在 chorus 前面，否则只会匹配到后半截。
 */
const SECTION_TAG = /^\s*[\[(【]\s*(?:intro|outro|interlude|instrumental|pre[\s-]?chorus|post[\s-]?chorus|chorus|verse|bridge|refrain|hook|rap|spoken|solo|tag|coda|drop|break|final|主歌|副歌|前奏|间奏|尾奏|尾声|桥段|过渡|合唱|独唱|念白|说唱)\s*\d*\s*[^\])】]*[\])】]\s*/i;

/**
 * 折叠"字与字之间"的空格："从 从 容 容" -> "从从容容"。
 * 只删两个 CJK 字符之间的空白，因此夹在英文/数字旁边的空格不受影响。
 */
function collapseCjkSpaces(s) {
  const CJK = "\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff";
  const re = new RegExp(`([${CJK}])[ \\t]+(?=[${CJK}])`, "g");
  let prev;
  let out = String(s == null ? "" : s);
  // 单次替换在重叠匹配（"A B C"）上会漏，循环到稳定。
  do { prev = out; out = out.replace(re, "$1"); } while (out !== prev);
  return out;
}

/** 取出行首段落标记的纯文本（无括号），没有则返回 null。 */
function lyricSection(raw) {
  const m = String(raw == null ? "" : raw).match(SECTION_TAG);
  return m ? m[0].replace(/[\[\]()【】\s]+/g, "") : null;
}

/**
 * 单行歌词的规范化：去段落标记 -> 折叠字间空格 -> 收拢标点两侧空白。
 * 规划器与字幕烧录共用同一个函数，保证"看到的"和"烧进去的"完全一致。
 */
function cleanLyricText(raw) {
  let s = String(raw == null ? "" : raw);
  s = s.replace(SECTION_TAG, "");
  s = collapseCjkSpaces(s);
  s = s
    .replace(/[ \t]{2,}/g, " ")
    // 标点内外侧空白收拢。全角引号必须在内 —— 实测 `点下 “ 购”` 的引号内侧空格
    // 会白白撑宽行宽（逐字空格的折叠只覆盖"字与字之间"，盖不到标点旁）。
    .replace(/\s+([，。！？、；：…）】」』》〕”’"'])/g, "$1")
    .replace(/([（【「『《〔“‘"'])\s+/g, "$1")
    .trim();
  return s;
}

/**
 * Parse LRC content into { meta, lines: [{ time, text, section }] }.
 * Lines with several time tags expand into several entries.
 */
function parseLrc(content) {
  const meta = {};
  const lines = [];
  for (const rawLine of String(content).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(META_TAG);
    if (m) {
      meta[m[1].toLowerCase()] = m[2].trim();
      continue;
    }
    TIME_TAG.lastIndex = 0;
    const times = [];
    let t;
    while ((t = TIME_TAG.exec(line)) !== null) {
      const mm = parseInt(t[1], 10);
      const ss = parseInt(t[2], 10);
      let frac = t[3] || "0";
      // Normalise fractional part to milliseconds regardless of digit count.
      frac = (frac + "000").slice(0, 3);
      times.push(mm * 60 + ss + parseInt(frac, 10) / 1000);
    }
    if (!times.length) continue;
    const rawText = line.replace(TIME_TAG, "").trim();
    // 规范化：段落标记另存 section，text 只留纯歌词（详见上方注释）。
    const text = cleanLyricText(rawText);
    if (!text) continue;
    const section = lyricSection(rawText);
    for (const time of times) lines.push({ time, text, section });
  }
  lines.sort((a, b) => a.time - b.time);
  return { meta, lines };
}

/**
 * Parse plain-text lyrics: one entry per non-empty line, no timestamps.
 * Leading/trailing markers like [Verse 1] are preserved as section hints.
 */
function parsePlainLyrics(content) {
  const lines = [];
  for (const rawLine of String(content).split(/\r?\n/)) {
    const raw = rawLine.trim();
    if (!raw) continue;
    // 与 parseLrc 保持一致：段落标记归到 section，text 只留纯歌词。
    const text = cleanLyricText(raw);
    if (!text) continue;
    lines.push({ time: null, text, section: lyricSection(raw) });
  }
  return { meta: {}, lines };
}

/** Load lyrics from an inline string or a file path; auto-detect LRC. */
function loadLyrics(lyricsInput, songPath) {
  let content = null;
  let source = null;

  if (lyricsInput && lyricsInput !== "auto") {
    if (fs.existsSync(lyricsInput) && fs.statSync(lyricsInput).isFile()) {
      content = fs.readFileSync(lyricsInput, "utf8");
      source = lyricsInput;
    } else {
      content = lyricsInput; // inline lyrics
      source = "inline";
    }
  } else if (songPath) {
    // Try a sidecar .lrc / .txt next to the audio.
    const base = songPath.replace(/\.[^.]+$/, "");
    for (const ext of [".lrc", ".LRC", ".txt", ".lyrics"]) {
      if (fs.existsSync(base + ext)) {
        content = fs.readFileSync(base + ext, "utf8");
        source = base + ext;
        break;
      }
    }
  }
  if (content === null) {
    return { meta: {}, lines: [], source: null, hasTimestamps: false };
  }

  const looksLrc = /\[\d{1,3}:\d{1,2}/.test(content);
  const parsed = looksLrc ? parseLrc(content) : parsePlainLyrics(content);
  const hasTimestamps = parsed.lines.some((l) => l.time !== null);
  return { ...parsed, source, hasTimestamps, raw: content };
}

/**
 * Condense lyric lines into numbered lines for the planner prompt.
 * Blank/instrumental gaps are kept as explicit markers so the planner can
 * place instrumental shots.
 */
function lyricsForPlanner(parsed, opts) {
  opts = opts || {};
  const lines = parsed.lines || [];
  if (!lines.length) return "(no lyrics supplied — plan an instrumental narrative MV)";
  let i = 0;
  const out = [];
  for (const l of lines) {
    i++;
    // Skip obvious non-lyric markers such as "作词：xxx".
    if (/^\[?(作词|作曲|编曲|混音|制作人|录音|母带|OP|SP|出品)[:：]/.test(l.text)) continue;
    // 段落标记（Verse/Chorus…）对规划器是有效的结构提示，规范化时被拆出去了，
    // 这里再拼回行首——字幕端不带它，规划端看得到它。
    const body = l.section ? `[${l.section}] ${l.text}` : l.text;
    if (opts.withTimestamps && l.time !== null) {
      out.push(`#${i} [${formatTime(l.time)}] ${body}`);
    } else {
      out.push(`#${i} ${body}`);
    }
  }
  return out.join("\n");
}

function formatTime(sec) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, "0")}:${r.toFixed(2).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------------
// Timeline fitting
// ---------------------------------------------------------------------------

/**
 * Give `base` a suffix letter that is not already used in `list`.
 * Used when a shot has to be split after the planner's own ids are in place.
 */
function uniqueShotId(base, list) {
  const taken = new Set((list || []).map((s) => s.id));
  for (let k = 0; k < 26; k++) {
    const cand = `${base}${String.fromCharCode(97 + k)}`;
    if (!taken.has(cand)) return cand;
  }
  return `${base}_x${(list || []).length}`;
}

/**
 * Make a shot list numerically capable of covering `totalDuration`.
 *
 * n shots span [n*minDur, n*maxDur] seconds. A list outside that window can never
 * be fitted, so the COUNT itself has to change:
 *   - too many shots → merge the cheapest adjacent pair. A pair sharing a
 *     `scene_id` is preferred (the merged shot then needs no location change).
 *     The FIRST shot stays authoritative for visual / camera / framing; the
 *     second shot's lyric line is folded into `extra_lyrics` so the subtitle
 *     pass still renders both lines across the longer slot.
 *   - too few shots  → split the longest shot in half, carrying the camera move
 *     across the two parts so the sequence reads as one sustained gesture.
 *
 * Mutates the input array and appends human-readable notes to `notes` (optional).
 */
function reconcileShotCount(work, totalDuration, minDur, maxDur, notes) {
  const log = (msg) => { if (notes) notes.push(msg); };
  const maxCount = Math.max(1, Math.floor(totalDuration / minDur + 1e-9));
  const minCount = Math.max(1, Math.ceil(totalDuration / maxDur - 1e-9));
  const started = work.length;
  let guard = 0;

  while (work.length > maxCount && work.length > 1 && guard++ < 400) {
    let bestI = 0;
    let bestScore = Infinity;
    for (let i = 0; i < work.length - 1; i++) {
      const bonus = work[i].scene_id && work[i].scene_id === work[i + 1].scene_id ? minDur : 0;
      const score = work[i].duration + work[i + 1].duration - bonus;
      if (score < bestScore) { bestScore = score; bestI = i; }
    }
    const a = work[bestI];
    const b = work[bestI + 1];
    a.duration += b.duration;
    a.extra_lyrics = [a.extra_lyrics, b.lyrics_line].filter(Boolean);
    a._mergedFrom = (a._mergedFrom || [a.id]).concat(b.id);
    if (!a.subject_action && b.subject_action) a.subject_action = b.subject_action;
    work.splice(bestI + 1, 1);
  }

  guard = 0;
  while (work.length < minCount && guard++ < 400) {
    let bestI = -1;
    let bestDur = 0;
    work.forEach((s, i) => { if (s.duration > bestDur) { bestDur = s.duration; bestI = i; } });
    if (bestI < 0 || bestDur < minDur * 2) break;   // nothing left that can be split legally
    const s = work[bestI];
    const half = s.duration / 2;
    work.splice(bestI, 1,
      { ...s, duration: half },
      {
        ...s,
        id: uniqueShotId(s.id, work),
        duration: half,
        camera_movement: withSuffix(s.camera_movement, " (continued)"),
        subject_action: withSuffix(s.subject_action, " (continues)"),
        _splitOf: s.id,
      }
    );
  }

  if (work.length !== started) {
    log(
      `${started} shots is outside the legal range for ${totalDuration.toFixed(1)}s ` +
      `(${minCount}-${maxCount} shots) — reconciled to ${work.length}`
    );
  }
  return work;
}

/**
 * Fit a shot list onto the exact song duration.
 *
 * Input shots each have a `duration` (ideal) — the planner's poetic timing.
 * Output shots have integer-friendly boundaries whose durations lie in
 * [MIN_SHOT_DUR, MAX_SHOT_DUR] and whose total is exactly `totalDuration`.
 *
 * Algorithm:
 *   1. Clamp each ideal duration into the legal range.
 *   2. Scale all durations so the sum equals the target.
 *   3. Split shots that exceed MAX_SHOT_DUR (duplicate the shot, splitting the
 *      action across the two halves).
 *   4. Merge shots that fall below MIN_SHOT_DUR into their neighbour, keeping
 *      the longer neighbour's content as the primary visual.
 *   5. Fine-tune the tail so the residual lands on the shot with the most
 *      headroom, iterating a bounded number of times.
 */
function fitTimeline(shots, totalDuration, opts) {
  opts = opts || {};
  const minDur = opts.minDur || MIN_SHOT_DUR;
  const maxDur = opts.maxDur || MAX_SHOT_DUR;

  if (!shots || !shots.length) throw new Error("fitTimeline: no shots to fit");
  if (!totalDuration || totalDuration <= 0) throw new Error("fitTimeline: invalid total duration");

  // --- 1. clamp -----------------------------------------------------------
  let work = shots.map((s, i) => ({
    ...s,
    _i: i,
    duration: Math.min(maxDur, Math.max(minDur, Number(s.duration) || minDur)),
  }));

  // --- 2. scale -----------------------------------------------------------
  let sum = work.reduce((a, s) => a + s.duration, 0);
  const scale = totalDuration / sum;
  work.forEach((s) => { s.duration = Math.min(maxDur, Math.max(minDur, s.duration * scale)); });

  // --- 3. split over-long shots ------------------------------------------
  const splitNotes = [];
  const split = [];
  for (const s of work) {
    const parts = Math.ceil(s.duration / maxDur);
    if (parts <= 1) { split.push(s); continue; }
    const per = s.duration / parts;
    if (per < minDur) {
      // Cannot split evenly within the legal range — let the clamp handle it later.
      s.duration = maxDur;
      split.push(s);
      continue;
    }
    for (let p = 0; p < parts; p++) {
      split.push({
        ...s,
        duration: per,
        id: p === 0 ? s.id : `${s.id}${String.fromCharCode(97 + p)}`,
        _splitOf: s.id,
        _splitPart: p + 1,
        _splitTotal: parts,
        // Split the camera move across the parts so the sequence reads as one
        // sustained gesture rather than a repeated action.
        camera_movement: p === 0 ? s.camera_movement : withSuffix(s.camera_movement, " (continued)"),
        subject_action: p === 0 ? s.subject_action : withSuffix(s.subject_action, " (continues)"),
      });
    }
    splitNotes.push(`${s.id} split into ${parts} shots of ~${per.toFixed(1)}s`);
  }
  work = split;

  // --- 3.5 reconcile the shot COUNT with the duration ---------------------
  // n shots can only cover [n*minDur, n*maxDur] seconds. When the planner returns
  // a count outside that window the target is unreachable no matter how the
  // durations are redistributed — and the water-filling pass below (step 5) used
  // to find zero capacity and THROW, discarding the entire planning run (ten
  // minutes of model calls, nothing on disk). The count is a soft creative
  // preference; the duration is a hard physical constraint. Repair the count.
  work = reconcileShotCount(work, totalDuration, minDur, maxDur, splitNotes);

  // --- 4. merge under-length shots ---------------------------------------
  const merged = [];
  for (let i = 0; i < work.length; i++) {
    const s = work[i];
    if (s.duration >= minDur || work.length === 1) { merged.push(s); continue; }
    const prev = merged[merged.length - 1];
    const next = work[i + 1];
    if (prev && prev.duration < minDur * 1.6) {
      prev.duration += s.duration;
      prev.extra_lyrics = [prev.extra_lyrics, s.lyrics_line].filter(Boolean);
      i++;
    } else if (next) {
      next.duration = Math.min(maxDur, next.duration + s.duration);
      next.lyrics_line = next.lyrics_line || s.lyrics_line;
    } else if (prev) {
      prev.duration = Math.min(maxDur, prev.duration + s.duration);
    } else {
      merged.push(s);
    }
  }
  work = merged;

  // --- 5. reconcile the total exactly ------------------------------------
  // Adjust durations using a water-filling approach: spread the residual across
  // all shots proportionally to their spare capacity, then fix rounding residue
  // on a single shot.
  for (let pass = 0; pass < 60; pass++) {
    sum = work.reduce((a, s) => a + s.duration, 0);
    let residual = totalDuration - sum;
    if (Math.abs(residual) < 1e-6) break;

    const dir = residual > 0 ? 1 : -1;
    // Capacity of each shot to absorb the residual in the needed direction.
    const caps = work.map((s) => (dir > 0 ? maxDur - s.duration : s.duration - minDur));
    const totalCap = caps.reduce((a, c) => a + Math.max(0, c), 0);
    if (totalCap <= 1e-9) {
      // Step 3.5 already reconciled the count, so reaching here means the list
      // mutated into an infeasible shape afterwards. Try the reconciliation once
      // more rather than throwing away the run.
      const before = work.length;
      work = reconcileShotCount(work, totalDuration, minDur, maxDur, splitNotes);
      if (work.length !== before) continue;
      throw new Error(
        `fitTimeline: cannot fit ${totalDuration.toFixed(2)}s into ${work.length} shots ` +
        `(legal range ${minDur}-${maxDur}s → total ${(work.length * minDur).toFixed(0)}-${(work.length * maxDur).toFixed(0)}s). ` +
        `Ask the planner for roughly ${Math.ceil(totalDuration / maxDur)}-${Math.floor(totalDuration / minDur)} shots.`
      );
    }
    const take = Math.min(Math.abs(residual), totalCap) * dir;
    work.forEach((s, i) => {
      const c = Math.max(0, caps[i]);
      if (c <= 0) return;
      s.duration += (c / totalCap) * take;
      s.duration = Math.min(maxDur, Math.max(minDur, s.duration));
    });
  }

  sum = work.reduce((a, s) => a + s.duration, 0);
  const tailResidual = totalDuration - sum;
  if (Math.abs(tailResidual) > 1e-6) {
    // Put the residue on the shot with the most room in the right direction.
    const dir = tailResidual > 0 ? 1 : -1;
    let bestIdx = -1, bestCap = -1;
    work.forEach((s, i) => {
      const cap = dir > 0 ? maxDur - s.duration : s.duration - minDur;
      if (cap > bestCap) { bestCap = cap; bestIdx = i; }
    });
    if (bestIdx >= 0) {
      work[bestIdx].duration = Math.min(maxDur, Math.max(minDur, work[bestIdx].duration + tailResidual));
    }
  }

  // --- 6. materialise absolute boundaries --------------------------------
  let cursor = 0;
  const fitted = work.map((s, i) => {
    const start = cursor;
    const end = cursor + s.duration;
    cursor = end;
    const dur = s.duration;
    return {
      ...s,
      index: i,
      start: round3(start),
      end: round3(end),
      duration: round3(dur),
      // The API only accepts whole seconds in 4..12; request the ceiling so the
      // clip is always long enough, then trim to the exact slot at assembly.
      api_seconds: Math.min(MAX_SHOT_DUR, Math.max(MIN_SHOT_DUR, Math.ceil(dur))),
    };
  });

  // Final total correction: nudge the last shot so end == totalDuration exactly.
  const last = fitted[fitted.length - 1];
  if (last) {
    const drift = totalDuration - last.end;
    if (Math.abs(drift) > 1e-9) {
      last.end = round3(totalDuration);
      last.duration = round3(last.end - last.start);
      last.api_seconds = Math.min(MAX_SHOT_DUR, Math.max(MIN_SHOT_DUR, Math.ceil(last.duration)));
    }
  }

  return { shots: fitted, notes: splitNotes, count: fitted.length };
}

function withSuffix(str, suffix) {
  if (!str) return suffix.trim();
  if (String(str).toLowerCase().includes(suffix.trim().toLowerCase())) return str;
  return String(str) + suffix;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Which lyric line is on screen at time `t`?
 * Uses LRC timestamps when present, otherwise nothing.
 */
function lyricAt(parsed, t) {
  if (!parsed || !parsed.lines || !parsed.lines.length) return null;
  let found = null;
  for (const l of parsed.lines) {
    if (l.time === null) continue;
    if (l.time <= t + 1e-6) found = l.text;
    else break;
  }
  return found;
}

module.exports = {
  MIN_SHOT_DUR,
  MAX_SHOT_DUR,
  reconcileShotCount,
  parseLrc,
  parsePlainLyrics,
  loadLyrics,
  lyricsForPlanner,
  cleanLyricText,
  lyricSection,
  collapseCjkSpaces,
  formatTime,
  fitTimeline,
  lyricAt,
};
