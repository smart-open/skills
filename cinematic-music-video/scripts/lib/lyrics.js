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

/**
 * Parse LRC content into { meta, lines: [{ time, text }] }.
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
    const text = line.replace(TIME_TAG, "").trim();
    for (const time of times) lines.push({ time, text });
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
    const text = rawLine.trim();
    if (!text) continue;
    lines.push({ time: null, text });
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
    if (opts.withTimestamps && l.time !== null) {
      out.push(`#${i} [${formatTime(l.time)}] ${l.text}`);
    } else {
      out.push(`#${i} ${l.text}`);
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
  parseLrc,
  parsePlainLyrics,
  loadLyrics,
  lyricsForPlanner,
  formatTime,
  fitTimeline,
  lyricAt,
};
