#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * lib/ffmpeg.js — FFmpeg-backed media utilities for the music-video pipeline.
 *
 * These utilities exist to guarantee four quality properties:
 *
 *   1. CANVAS CONSISTENCY  — every clip is normalised to one canvas (WxH, SAR 1:1,
 *      yuv420p) with aspect-preserving scale + centred pad, so no clip is
 *      stretched, cropped or offset relative to its neighbours.
 *
 *   2. NO DROPPED FRAMES   — clips are re-encoded to constant frame rate and each
 *      slot is cut to an EXACT integer frame count, so concatenation cannot
 *      introduce gaps, duplicated or missing frames.
 *
 *   3. A/V SYNC            — the shot timeline is derived from the real audio
 *      duration; per-slot frame counts are computed with a running rounding
 *      accumulator so the sum is exactly total_frames (no cumulative drift).
 *
 *   4. REAL MOTION         — `motionScore()` measures inter-frame change so a
 *      "static / frozen" clip can be detected objectively and regenerated.
 *
 * Only Node.js built-ins are used; ffmpeg/ffprobe must be on PATH or passed via
 * the FFMPEG / FFPROBE environment variables.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const FFPROBE = process.env.FFPROBE || "ffprobe";

/** Run a command capturing stdout/stderr as buffers (no shell, no quoting issues). */
function run(cmd, args, opts) {
  opts = opts || {};
  const res = spawnSync(cmd, args, {
    encoding: null,
    maxBuffer: opts.maxBuffer || 256 * 1024 * 1024,
    windowsHide: true,
    input: opts.input,
    // stdin 只在真要往里写数据时才开管道。坑位 52：Windows 上 stdin 为匿名管道时，
    // MSYS2/MinGW 构建的 ffmpeg.exe 会 spawn 失败并返回 EBUSY（status=null、无 stderr），
    // 而同一条命令在 bash/cmd 里跑得好好的——所以现象是"ffmpeg 明明装着却启动不了"。
    stdio: opts.input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
  });
  if (res.error) {
    throw new Error(`Failed to launch ${cmd}: ${res.error.message}. Is ffmpeg installed and on PATH?`);
  }
  return {
    status: res.status,
    stdout: res.stdout ? res.stdout.toString("utf8") : "",
    stderr: res.stderr ? res.stderr.toString("utf8") : "",
    stdoutBuf: res.stdout,
  };
}

function ffmpeg(args, opts) {
  const r = run(FFMPEG, args, opts);
  if (r.status !== 0) {
    const tail = r.stderr.split("\n").filter(Boolean).slice(-12).join("\n");
    throw new Error(`ffmpeg exited with ${r.status}\n  args: ${args.join(" ")}\n  stderr:\n${tail}`);
  }
  return r;
}

function ffprobeJson(args) {
  const r = run(FFPROBE, args);
  if (r.status !== 0) {
    throw new Error(`ffprobe exited with ${r.status}: ${r.stderr.slice(-800)}`);
  }
  return JSON.parse(r.stdout);
}

function assertFfmpegAvailable() {
  try {
    const r = run(FFMPEG, ["-version"]);
    if (r.status !== 0) throw new Error("non-zero exit");
  } catch (e) {
    throw new Error(
      "ffmpeg is not available. Install it (winget install Gyan.FFmpeg) or set the FFMPEG env var to the binary path."
    );
  }
  try {
    const r = run(FFPROBE, ["-version"]);
    if (r.status !== 0) throw new Error("non-zero exit");
  } catch (e) {
    throw new Error(
      "ffprobe is not available. It normally ships with ffmpeg; set the FFPROBE env var to the binary path."
    );
  }
}

// ---------------------------------------------------------------------------
// Probing
// ---------------------------------------------------------------------------

/**
 * Probe a media file.
 * Returns { duration, width, height, fps, sar, hasAudio, sampleRate, channels, frameCount, nbFrames, codec }
 */
function probeMedia(file) {
  if (!fs.existsSync(file)) throw new Error("File not found: " + file);
  const j = ffprobeJson([
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    "-count_frames",
    file,
  ]);

  const v = (j.streams || []).find((s) => s.codec_type === "video");
  const a = (j.streams || []).find((s) => s.codec_type === "audio");
  const fmt = j.format || {};

  let duration = parseFloat(fmt.duration);
  let fps = null;
  let frameCount = null;

  if (v) {
    if (!isFinite(duration) && v.duration) duration = parseFloat(v.duration);
    // Prefer the exact counted frame number when available.
    if (v.nb_read_frames && v.nb_read_frames !== "N/A") frameCount = parseInt(v.nb_read_frames, 10);
    else if (v.nb_frames && v.nb_frames !== "N/A") frameCount = parseInt(v.nb_frames, 10);
    fps = parseFps(v.r_frame_rate) || parseFps(v.avg_frame_rate);
    if (!isFinite(duration) && frameCount && fps) duration = frameCount / fps;
  }
  if (a && (!isFinite(duration)) && a.duration) duration = parseFloat(a.duration);

  return {
    file,
    duration: isFinite(duration) ? duration : null,
    width: v ? v.width : null,
    height: v ? v.height : null,
    fps: fps,
    sar: v ? v.sample_aspect_ratio || "1:1" : null,
    frameCount: frameCount,
    hasVideo: !!v,
    hasAudio: !!a,
    sampleRate: a ? parseInt(a.sample_rate, 10) : null,
    channels: a ? a.channels : null,
    vcodec: v ? v.codec_name : null,
    acodec: a ? a.codec_name : null,
    format: fmt.format_name || null,
    bitrate: fmt.bit_rate ? parseInt(fmt.bit_rate, 10) : null,
  };
}

function parseFps(s) {
  if (!s || s === "0/0" || s === "N/A") return null;
  if (s.indexOf("/") >= 0) {
    const [n, d] = s.split("/").map(Number);
    if (!d) return null;
    const v = n / d;
    return v > 0 ? v : null;
  }
  const v = Number(s);
  return v > 0 ? v : null;
}

/** Audio duration only (fast path — no frame counting). */
function probeAudio(file) {
  const j = ffprobeJson([
    "-v", "error", "-print_format", "json",
    "-show_format", "-show_streams", file,
  ]);
  const a = (j.streams || []).find((s) => s.codec_type === "audio");
  if (!a) return { hasAudio: false, duration: null };
  const dur = parseFloat((j.format && j.format.duration) || a.duration);
  return {
    hasAudio: true,
    duration: isFinite(dur) ? dur : null,
    sampleRate: parseInt(a.sample_rate, 10),
    channels: a.channels,
    codec: a.codec_name,
    bitrate: a.bit_rate ? parseInt(a.bit_rate, 10) : null,
  };
}

/**
 * Count decoded video frames exactly (authoritative, but decodes the whole file).
 * Used as the final integrity gate on generated clips and the assembled MV.
 */
function countFrames(file) {
  const r = run(FFPROBE, [
    "-v", "error",
    "-select_streams", "v:0",
    "-count_frames",
    "-show_entries", "stream=nb_read_frames",
    "-print_format", "json",
    file,
  ]);
  if (r.status !== 0) return null;
  try {
    const j = JSON.parse(r.stdout);
    const s = (j.streams || [])[0];
    if (!s || !s.nb_read_frames || s.nb_read_frames === "N/A") return null;
    return parseInt(s.nb_read_frames, 10);
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Motion analysis — detect "frozen" / static clips
// ---------------------------------------------------------------------------

/**
 * Measure how much the picture actually changes over time.
 *
 * Strategy: decode at `fps` samples per second, downscale to 64x36 grayscale,
 * then compute the mean absolute difference between consecutive frames,
 * averaged over the clip. This is a robust, codec-agnostic motion proxy.
 *
 * Returns { score, samples, perFrame[] } where score is in 0..255 units:
 *   < 0.9   almost certainly a frozen / still image
 *   0.9-2.0 very low motion (subtle breathing only)
 *   > 2.0   visible motion
 *   > 6.0   strong motion (camera move / action)
 */
function motionScore(file, opts) {
  opts = opts || {};
  const fps = opts.fps || 4;
  const W = 64, H = 36;
  const r = run(FFMPEG, [
    "-v", "error",
    "-i", file,
    "-vf", `fps=${fps},scale=${W}:${H}:flags=bilinear,format=gray`,
    "-f", "rawvideo",
    "-",
  ]);
  if (r.status !== 0 || !r.stdoutBuf || r.stdoutBuf.length < W * H * 2) {
    return { score: null, samples: 0, perFrame: [], note: "decode failed or too short" };
  }
  const buf = r.stdoutBuf;
  const frameSize = W * H;
  const n = Math.floor(buf.length / frameSize);
  const diffs = [];
  for (let i = 1; i < n; i++) {
    const a = i * frameSize;
    const b = (i - 1) * frameSize;
    let sum = 0;
    for (let p = 0; p < frameSize; p++) {
      const d = buf[a + p] - buf[b + p];
      sum += d < 0 ? -d : d;
    }
    diffs.push(sum / frameSize);
  }
  if (!diffs.length) return { score: 0, samples: n, perFrame: [] };
  const score = diffs.reduce((s, x) => s + x, 0) / diffs.length;
  return { score, samples: n, perFrame: diffs };
}

// ---------------------------------------------------------------------------
// Canvas / timeline maths
// ---------------------------------------------------------------------------

/**
 * Even dimension helper — H.264 with yuv420p requires even width/height.
 */
function even(n) {
  return n % 2 === 0 ? n : n + 1;
}

/**
 * Pick the assembly canvas from the actual clip sizes.
 * Uses the most common (modal) size so the majority of clips need no scaling,
 * and pads any outlier into that canvas.
 * `forced` may be "1920x1080" or { width, height }.
 */
function chooseCanvas(sizes, forced) {
  if (forced) {
    let w, h;
    if (typeof forced === "string") {
      const m = forced.match(/^(\d+)x(\d+)$/);
      if (!m) throw new Error("--canvas must look like 1920x1080 (got " + forced + ")");
      w = parseInt(m[1], 10); h = parseInt(m[2], 10);
    } else {
      w = forced.width; h = forced.height;
    }
    return { width: even(w), height: even(h), source: "forced", detected: null };
  }
  const tally = new Map();
  for (const s of sizes) {
    if (!s || !s.width || !s.height) continue;
    const k = `${s.width}x${s.height}`;
    tally.set(k, (tally.get(k) || 0) + 1);
  }
  if (!tally.size) throw new Error("No usable clip sizes to choose a canvas from.");
  let best = null, bestCount = -1;
  for (const [k, c] of tally) {
    if (c > bestCount) { best = k; bestCount = c; }
  }
  const [w, h] = best.split("x").map(Number);
  return { width: even(w), height: even(h), source: "detected", detected: [...tally.entries()].map(([k, c]) => `${k}×${c}`).join(", ") };
}

/**
 * Distribute `totalFrames` integer frames across shots proportionally to their
 * durations, WITHOUT cumulative rounding drift, and honouring a minimum of
 * `minFrames` per shot.
 *
 * Returns an array of integer frame counts whose sum is exactly totalFrames.
 */
function allocateFrames(durations, totalFrames, minFrames) {
  minFrames = minFrames || 1;
  const n = durations.length;
  if (!n) return [];
  const sum = durations.reduce((s, d) => s + d, 0) || 1;

  const exact = durations.map((d) => (d / sum) * totalFrames);
  const frames = exact.map((e) => Math.max(minFrames, Math.round(e)));

  // Reconcile the difference with a largest-remainder pass so the total is exact.
  let diff = totalFrames - frames.reduce((s, f) => s + f, 0);
  if (diff !== 0) {
    const order = exact
      .map((e, i) => ({ i, frac: e - Math.floor(e) }))
      .sort((a, b) => (diff > 0 ? b.frac - a.frac : a.frac - b.frac));
    let k = 0;
    while (diff !== 0 && k < order.length * 4) {
      const idx = order[k % order.length].i;
      if (diff > 0) { frames[idx] += 1; diff -= 1; }
      else if (frames[idx] > minFrames) { frames[idx] -= 1; diff += 1; }
      k++;
      if (k >= order.length * 4 && diff !== 0) break;
    }
  }
  // Final fallback: dump the residue on the longest shot.
  diff = totalFrames - frames.reduce((s, f) => s + f, 0);
  if (diff !== 0) {
    let longest = 0;
    for (let i = 1; i < n; i++) if (frames[i] > frames[longest]) longest = i;
    frames[longest] = Math.max(minFrames, frames[longest] + diff);
  }
  return frames;
}

// ---------------------------------------------------------------------------
// Clip normalisation and concatenation
// ---------------------------------------------------------------------------

/**
 * Normalise one clip into the shared canvas and cut it to an exact frame count.
 *
 * @param {object} o
 * @param {string} o.input
 * @param {string} o.output
 * @param {number} o.width     canvas width
 * @param {number} o.height    canvas height
 * @param {number} o.fps       target constant frame rate
 * @param {number} o.frames    exact number of frames to emit
 * @param {number} [o.sourceOffset] seconds to skip at the head of the source
 * @param {string} [o.padColor] letterbox colour (default black)
 *
 * Single-pass strategy, in this filter order:
 *   scale (aspect-preserving, even-aligned)  ->  pad (centred letterbox)
 *   ->  setsar=1  ->  fps (constant frame rate)
 *   ->  tpad clone (only when the source is shorter than the slot, so the tail
 *       is extended rather than the music being cut short)
 *   ->  format yuv420p
 * `-frames:v` then pins the emitted count exactly, which is what makes
 * concatenation drift-free.
 */
function normalizeClip(o) {
  const { input, output, width, height, fps, frames } = o;
  const padColor = o.padColor || "black";
  const sourceOffset = o.sourceOffset || 0;
  const targetDur = frames / fps;

  // Probe first so we know whether the source can actually cover the slot.
  let srcDur = null;
  try {
    const sp = probeMedia(input);
    srcDur = sp.duration;
  } catch (e) { /* unknown — be generous below */ }

  const vf = [
    // Even-aligned so yuv420p chroma is never misaligned; AR is preserved so
    // nothing is stretched.
    `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${padColor}`,
    `setsar=1`,
    `fps=${fps}`,
  ];

  const available = srcDur !== null ? Math.max(0, srcDur - sourceOffset) : null;
  if (available === null || available + 1e-3 < targetDur) {
    // Generous clone-padding; `-frames:v` trims the surplus off deterministically.
    const extra = available === null ? targetDur + 2 : (targetDur - available) + 2;
    vf.push(`tpad=stop_mode=clone:stop_duration=${extra.toFixed(6)}`);
  }
  vf.push("format=yuv420p");

  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  if (sourceOffset > 0) args.push("-ss", sourceOffset.toFixed(3));
  args.push("-i", input);
  args.push(
    "-an",
    "-vf", vf.join(","),
    "-fps_mode", "cfr",
    "-frames:v", String(frames),
    "-c:v", "libx264",
    "-preset", o.preset || "medium",
    "-crf", String(o.crf === undefined ? 18 : o.crf),
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    output
  );
  ffmpeg(args);

  // Verify the written clip really has the requested frame count + geometry.
  const p = probeMedia(output);
  if (p.width !== width || p.height !== height) {
    throw new Error(
      `Canvas mismatch for ${path.basename(output)}: expected ${width}x${height}, got ${p.width}x${p.height}`
    );
  }
  let got = countFrames(output);
  if (got === null) {
    // Some builds refuse -count_frames on odd inputs; fall back to a duration estimate.
    got = p.duration ? Math.round(p.duration * fps) : null;
  }
  if (got !== null && got < frames) {
    // Fewer frames than requested means the source was exhausted; clone the tail.
    cloneLastFrame(output, frames - got, fps);
    const fixed = countFrames(output);
    if (fixed !== null && fixed !== frames) {
      throw new Error(`Frame count mismatch for ${path.basename(output)}: wanted ${frames}, got ${fixed}`);
    }
    got = fixed;
  } else if (got !== null && got > frames) {
    throw new Error(`Frame count overflow for ${path.basename(output)}: wanted ${frames}, got ${got}`);
  }
  return { ...p, frames: got };
}

/** Append `extra` cloned copies of the last frame, keeping the same codec params. */
function cloneLastFrame(file, extra, fps) {
  if (extra <= 0) return;
  const tmp = file + ".clone.mp4";
  const extraDur = extra / fps;
  const r = run(FFMPEG, [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", file,
    "-vf", `tpad=stop_mode=clone:stop_duration=${extraDur.toFixed(6)}`,
    "-fps_mode", "cfr",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    tmp,
  ]);
  if (r.status === 0 && fs.existsSync(tmp) && fs.statSync(tmp).size > 0) {
    fs.renameSync(tmp, file);
  } else {
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (e) {}
  }
}

/** Write a concat-demuxer list file. */
function writeConcatList(clips, listPath) {
  const lines = clips.map((c) => {
    // Concat demuxer requires forward slashes and single-quote escaping.
    const p = path.resolve(c).replace(/\\/g, "/").replace(/'/g, "'\\''");
    return `file '${p}'`;
  });
  fs.writeFileSync(listPath, lines.join("\n") + "\n", "utf8");
  return listPath;
}

/**
 * Concatenate normalised clips by re-encoding.
 * Re-encode (rather than stream-copy) guarantees a single continuous GOP and
 * constant frame rate across the whole timeline — the main protection against
 * dropped / duplicated frames at clip boundaries.
 */
function concatClips(clips, output, opts) {
  opts = opts || {};
  const fps = opts.fps || 24;
  const listPath = (opts.listPath || path.join(path.dirname(output), "concat.txt"));
  writeConcatList(clips, listPath);
  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-fflags", "+genpts",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-an",
    "-fps_mode", "cfr",
    "-r", String(fps),
    "-c:v", "libx264",
    "-preset", opts.preset || "medium",
    "-crf", opts.crf || "18",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    output,
  ];
  ffmpeg(args);
  return output;
}

/**
 * Mux the concatenated silent video with the ORIGINAL song audio.
 *
 * This is the single most important step for audio consistency: the original
 * audio file is never re-encoded from a lossy intermediate and never replaced
 * by model-generated sound. We copy the audio stream when the container allows
 * it (`-c:a copy`) to avoid a second lossy generation, falling back to AAC only
 * when a copy is impossible.
 *
 * Sync guarantees applied here:
 *   - `-fflags +genpts` and `-fps_mode cfr` keep the video timeline continuous.
 *   - `tpad stop_mode=clone` extends the video if the clips are collectively
 *     shorter than the song (never truncates the music).
 *   - `-shortest` is deliberately NOT used, so the mux ends at the audio end.
 *   - The video is padded to exactly the audio duration, so there is no drift
 *     and no image/audio offset at any point in the timeline.
 */
function muxWithAudio(videoFile, audioFile, output, opts) {
  opts = opts || {};
  const fps = opts.fps || 24;
  const audioDur = opts.audioDuration;
  const videoDur = opts.videoDuration;
  const audioCodec = opts.audioCodec || "copy";

  let padDur = 0;
  if (audioDur && videoDur && audioDur > videoDur) {
    padDur = audioDur - videoDur + (1 / fps);
  }

  const vf = padDur > 0
    ? `tpad=stop_mode=clone:stop_duration=${padDur.toFixed(6)},fps=${fps},format=yuv420p`
    : `fps=${fps},format=yuv420p`;

  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-fflags", "+genpts",
    "-i", videoFile,
    "-i", audioFile,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-vf", vf,
    "-fps_mode", "cfr",
    "-c:v", "libx264",
    "-preset", opts.preset || "medium",
    "-crf", opts.crf || "18",
    "-pix_fmt", "yuv420p",
  ];

  if (audioCodec === "copy") {
    args.push("-c:a", "copy");
  } else {
    args.push("-c:a", "aac", "-b:a", "256k", "-ar", "48000");
  }
  if (padDur > 0) args.push("-t", (audioDur).toFixed(6));
  args.push("-movflags", "+faststart", output);

  try {
    ffmpeg(args);
  } catch (e) {
    if (audioCodec === "copy") {
      // Some source audio codecs cannot live in MP4; re-encode once at high quality.
      const retry = args.slice();
      const ci = retry.indexOf("-c:a");
      retry.splice(ci, 2, "-c:a", "aac", "-b:a", "256k", "-ar", "48000");
      ffmpeg(retry);
    } else {
      throw e;
    }
  }
  return output;
}

/**
 * Full-quality verification of the final MV.
 * Returns a report with pass/fail per quality gate.
 */
function verifyFinal(mvFile, audioFile) {
  const mv = probeMedia(mvFile);
  const mvFrames = countFrames(mvFile);
  const audio = probeAudio(audioFile);
  const report = [];

  const push = (name, ok, detail) => report.push({ name, ok, detail });

  push("has-video", !!mv.hasVideo, mv.hasVideo ? `${mv.width}x${mv.height} ${mv.vcodec}` : "no video stream");
  push("has-original-audio", !!mv.hasAudio, mv.hasAudio ? `${mv.acodec} ${mv.sampleRate}Hz ${mv.channels}ch` : "no audio stream");
  push(
    "constant-frame-rate",
    mv.fps !== null && Math.abs(mv.fps - Math.round(mv.fps)) < 0.01,
    `r_frame_rate=${mv.fps}`
  );
  push("square-pixels", mv.sar === null || mv.sar === "1:1" || mv.sar === "0:1", `SAR=${mv.sar}`);

  // Frame-count continuity: the decoded frame count must match fps x duration.
  let frameOk = false, frameDetail = "unknown";
  if (mvFrames !== null && mv.duration) {
    const expected = Math.round(mv.duration * mv.fps);
    const delta = Math.abs(mvFrames - expected);
    frameOk = delta <= 2;
    frameDetail = `decoded=${mvFrames} expected≈${expected} delta=${delta}`;
  }
  push("frame-continuity", frameOk, frameDetail);

  // A/V drift: the video must not be meaningfully shorter than the song.
  let driftOk = false, driftDetail = "unknown";
  if (audio.duration && mv.duration) {
    const drift = audio.duration - mv.duration;
    // Video reaching the end of the audio is what matters; a few ms of
    // container-level rounding is fine.
    driftOk = drift <= 0.15;
    driftDetail = `audio=${audio.duration.toFixed(3)}s video=${mv.duration.toFixed(3)}s drift=${drift.toFixed(3)}s`;
  }
  push("no-audio-truncation", driftOk, driftDetail);

  return {
    pass: report.every((r) => r.ok),
    report,
    video: { ...mv, frames: mvFrames },
    audio,
    sizeBytes: fs.statSync(mvFile).size,
  };
}

// ---------------------------------------------------------------------------
// Frame extraction / thumbnails (for review contact sheets)
// ---------------------------------------------------------------------------

/** Extract `n` evenly spaced JPEG thumbnails into outDir. Returns array of paths. */
function extractThumbnails(file, outDir, n, opts) {
  opts = opts || {};
  const w = opts.width || 320;
  fs.mkdirSync(outDir, { recursive: true });
  const p = probeMedia(file);
  if (!p.duration) return [];
  const total = p.duration;
  const paths = [];
  for (let i = 0; i < n; i++) {
    const t = (total * (i + 0.5)) / n;
    const out = path.join(outDir, `thumb_${String(i + 1).padStart(3, "0")}.jpg`);
    const r = run(FFMPEG, [
      "-y", "-hide_banner", "-loglevel", "error",
      "-ss", t.toFixed(3),
      "-i", file,
      "-frames:v", "1",
      "-vf", `scale=${w}:-2`,
      out,
    ]);
    if (r.status === 0 && fs.existsSync(out)) paths.push(out);
  }
  return paths;
}

module.exports = {
  FFMPEG,
  FFPROBE,
  run,
  ffmpeg,
  ffprobeJson,
  assertFfmpegAvailable,
  probeMedia,
  probeAudio,
  countFrames,
  motionScore,
  even,
  chooseCanvas,
  allocateFrames,
  normalizeClip,
  cloneLastFrame,
  writeConcatList,
  concatClips,
  muxWithAudio,
  verifyFinal,
  extractThumbnails,
  parseFps,
};
