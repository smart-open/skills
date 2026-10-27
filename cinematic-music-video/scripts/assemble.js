#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * assemble.js — Stage 4: cut every clip to its exact slot and mux the song.
 *
 * This stage is where synchronisation is won or lost, so the algorithm is
 * deliberately explicit about frames rather than seconds:
 *
 *   1. CANVAS
 *      The modal resolution of the generated clips becomes the assembly canvas.
 *      Every clip is `scale`(aspect-preserving) + `pad`(centred) + `setsar=1`
 *      into that canvas, so nothing is stretched, cropped or shifted.
 *
 *   2. TIMELINE
 *      total_frames = round(audio_duration x fps)
 *      slot_frames  = largest-remainder allocation of total_frames across the
 *                     shots, proportional to their planned durations, with the
 *                     sum EXACTLY equal to total_frames.
 *      Because each slot is cut to an integer frame count and the integers sum
 *      to the total, concatenation cannot accumulate drift. This is the core
 *      defence against "image and audio slowly drift apart".
 *
 *   3. CLIPS
 *      Each clip is re-encoded to constant frame rate and cut to its exact slot
 *      frame count. If a clip is shorter than its slot, its last frame is cloned
 *      to fill the remainder instead of truncating the music.
 *
 *   4. CONCAT + MUX
 *      Clips are concatenated with re-encoding (single continuous GOP, no
 *      stream-copy timebase artefacts). The ORIGINAL song file is then muxed in
 *      with `-c:a copy` where possible: the audio is never regenerated, never
 *      re-encoded from a lossy intermediate, and never replaced by model audio.
 *      `-shortest` is deliberately not used; the video is padded to the exact
 *      audio length instead, so the music is always complete.
 *
 *   5. VERIFY
 *      The finished file is decoded and checked for: stream presence, constant
 *      frame rate, square pixels, frame-count continuity, and A/V truncation.
 *
 * Usage:
 *   node assemble.js --project ./mv-song [--transition cut|dissolve] \
 *                    [--transition-duration 0.5] [--canvas auto|1920x1080] \
 *                    [--fps auto|24] [--crf 18] [--fade]
 */

const fs = require("fs");
const path = require("path");

const agnes = require("./lib/agnes");
const ff = require("./lib/ffmpeg");
const lyricsLib = require("./lib/lyrics");
const cli = require("./lib/cli");

const SPEC = {
  "--project": { key: "project", type: "string", alias: ["-d"], desc: "Project directory" },
  "--song": { key: "song", type: "string", desc: "Override the song file path" },
  "--output": { key: "output", type: "string", alias: ["-o"], desc: "Output MP4 path" },
  "--canvas": { key: "canvas", type: "string", default: "auto", desc: "auto (match generated clips) or WxH like 1920x1080" },
  "--fps": { key: "fps", type: "string", default: "auto", desc: "auto (match clips) or a number like 24/30" },
  "--transition": { key: "transition", type: "string", default: "cut", desc: "cut (default) | dissolve" },
  "--transition-duration": { key: "transitionDuration", type: "number", default: 0.5, desc: "Dissolve length in seconds" },
  "--crf": { key: "crf", type: "int", default: 18, desc: "x264 quality (lower = better, default 18)" },
  "--preset": { key: "preset", type: "string", default: "medium", desc: "x264 preset" },
  "--fade": { key: "fade", type: "bool", desc: "Fade in from black and fade out to black" },
  "--fade-duration": { key: "fadeDuration", type: "number", default: 1.0, desc: "Fade length in seconds" },
  "--normalize-audio": { key: "normalizeAudio", type: "bool", desc: "Apply EBU R128 loudness normalisation to the song" },
  "--audio-gain": { key: "audioGain", type: "number", desc: "Apply a fixed gain in dB to the song (e.g. -3)" },
  "--thumbnails": { key: "thumbnails", type: "int", default: 12, desc: "Number of review thumbnails to extract (0 = none)" },
  "--force": { key: "force", type: "bool", desc: "Re-normalise every clip even if a matching intermediate exists" },
  "--keep-build": { key: "keepBuild", type: "bool", default: true, desc: "Keep the normalised intermediate clips (default true)" },
  "--allow-partial": { key: "allowPartial", type: "bool", desc: "Assemble even if some clips are missing (skips those slots)" },
};

const USAGE = `assemble.js — Stage 4: exact-frame assembly + original audio mux

Options:
  --project <dir>          Project directory (default: the unique project under out/)
  --transition cut         cut (default) | dissolve
  --transition-duration 0.5
  --canvas auto            auto | 1920x1080 | 1280x720 ...
  --fps auto               auto | 24 | 30
  --crf 18                 x264 quality
  --fade                   Fade in / out to black
  --normalize-audio        EBU R128 loudness normalisation
  --thumbnails 12          Extract review thumbnails
  --force                  Re-normalise every clip from scratch

Example:
  node assemble.js --project ./mv-song --transition dissolve --fade`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clipPath(dir, id) {
  return path.join(dir, `shot_${String(id).replace(/[^\w.-]/g, "_")}.mp4`);
}

/** Modal frame rate of the generated clips, snapped to a sane value. */
function detectFps(probes, fallback) {
  const tally = new Map();
  probes.forEach((p) => {
    if (!p || !p.fps) return;
    const r = Math.round(p.fps);
    if (r >= 12 && r <= 60) tally.set(r, (tally.get(r) || 0) + 1);
  });
  if (!tally.size) return fallback || 24;
  let best = fallback || 24, bestCount = -1;
  for (const [f, c] of tally) if (c > bestCount) { best = f; bestCount = c; }
  return best;
}

/**
 * Build a dissolve chain with ffmpeg's xfade filter.
 *
 * Frame-accurate overlap accounting:
 *   - Slot i is normalised to `slot_frames[i] + overlapFrames` frames, except the
 *     last slot which keeps exactly `slot_frames[last]`.
 *   - The k-th xfade starts at offset = (sum of the first k clip lengths) - k*td.
 *   - Output length therefore equals sum(slot_frames) exactly, i.e. total_frames.
 */
function buildDissolve(inputs, output, o) {
  const { fps, slotFrames, overlapFrames, td, width, height, crf, preset } = o;
  const n = inputs.length;
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-fflags", "+genpts"];
  inputs.forEach((f) => args.push("-i", f));

  const parts = [];
  if (n === 1) {
    parts.push(`[0:v]fps=${fps},format=yuv420p[vout]`);
  } else {
    let cum = 0;
    let prev = "[0:v]";
    for (let k = 1; k < n; k++) {
      cum += slotFrames[k - 1] / fps; // end of the k-1-th clip's own slot
      const offset = Math.max(0, cum - td);
      const label = k === n - 1 ? "[vout]" : `[v${k}]`;
      parts.push(
        `${prev}[${k}:v]xfade=transition=fade:duration=${td.toFixed(6)}:offset=${offset.toFixed(6)}${label}`
      );
      prev = label;
      cum += 0; // cum now represents the timeline position consumed
    }
    parts.push(`[vout]fps=${fps},format=yuv420p[vfinal]`);
  }
  const finalLabel = n === 1 ? "[vout]" : "[vfinal]";

  let vf = finalLabel;
  if (o.fade) {
    vf = `${finalLabel}fade=t=in:st=0:d=${o.fadeDuration},fade=t=out:st=${(o.fadeOutStart).toFixed(3)}:d=${o.fadeDuration}[vfd]`;
    parts.push(vf);
    vf = "[vfd]";
  }

  args.push("-filter_complex", parts.join(";"), "-map", vf,
    "-an", "-r", String(fps), "-fps_mode", "cfr",
    "-c:v", "libx264", "-preset", preset, "-crf", String(crf),
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", output);
  ff.ffmpeg(args);
  return output;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const parse = cli.createParser(SPEC, USAGE);
  const args = parse(process.argv.slice(2));

  // Never derived from the current working directory — see lib/paths.js.
  const projectDir = cli.resolveProjectDir(args.project || args._positional[0]);
  const project = cli.loadProject(projectDir);
  if (!project.storyboard || !fs.existsSync(project.storyboard)) {
    throw new Error(`No storyboard found for ${projectDir}. Run plan.js first.`);
  }
  const sb = JSON.parse(fs.readFileSync(project.storyboard, "utf8"));
  const meta = sb.meta || {};
  // Prefer the song copy stored inside the project, so assembly keeps working
  // even if the user's original file has since moved or been renamed.
  const songPath = cli.resolveSongPath(projectDir, project, meta, args.song);
  if (!songPath || !fs.existsSync(songPath)) {
    throw new Error(`Song file not found: ${songPath}\nPass --song "<path>" to override.`);
  }
  ff.assertFfmpegAvailable();

  const clipDir = cli.stageDir(projectDir, "clips");
  const buildDir = cli.stageDir(projectDir, "build");
  const normDir = path.join(buildDir, "norm");
  const outDir = cli.stageDir(projectDir, "output");
  agnes.ensureDir(normDir);

  // ---- 1. probe ----------------------------------------------------------
  agnes.log("=".repeat(78));
  agnes.log(`Stage 4 — assembly  |  project=${projectDir}`);
  agnes.log("=".repeat(78));
  agnes.log("[1/6] Probing clips and audio ...");

  const audio = ff.probeAudio(songPath);
  if (!audio.hasAudio || !audio.duration) throw new Error("Cannot read audio duration from " + songPath);
  const audioDuration = audio.duration;
  agnes.log(`      song: ${audioDuration.toFixed(3)}s  ${audio.sampleRate}Hz ${audio.channels}ch ${audio.codec}`);

  const slots = [];
  const missing = [];
  for (const shot of sb.shots) {
    const p = clipPath(clipDir, shot.id);
    if (!fs.existsSync(p) || fs.statSync(p).size < 20000) { missing.push(shot.id); continue; }
    const pr = ff.probeMedia(p);
    if (!pr.hasVideo || !pr.duration) { missing.push(shot.id); continue; }
    slots.push({ shot, file: p, probe: pr });
  }

  if (missing.length) {
    agnes.log(`      MISSING ${missing.length} clip(s): ${missing.join(", ")}`);
    if (!args.allowPartial) {
      throw new Error(
        `Cannot assemble: ${missing.length} clip(s) are missing (${missing.slice(0, 12).join(", ")}).\n` +
        `Re-run videos.js to generate them, or pass --allow-partial to assemble the rest.`
      );
    }
    agnes.log("      --allow-partial: those slots will be omitted and the timeline renormalised.");
  }
  if (!slots.length) throw new Error("No usable clips found in " + clipDir);

  // ---- 2. canvas + fps ---------------------------------------------------
  agnes.log("[2/6] Choosing canvas and frame rate ...");
  const canvas = ff.chooseCanvas(slots.map((s) => s.probe), args.canvas === "auto" ? null : args.canvas);
  const fps = args.fps === "auto" ? detectFps(slots.map((s) => s.probe), 24) : Number(args.fps);
  if (!isFinite(fps) || fps < 1 || fps > 60) throw new Error("--fps must be a number in 1..60");
  agnes.log(`      canvas=${canvas.width}x${canvas.height} (${canvas.source}${canvas.detected ? ": " + canvas.detected : ""})`);
  agnes.log(`      fps=${fps}`);

  const srcSizes = new Set(slots.map((s) => `${s.probe.width}x${s.probe.height}`));
  if (srcSizes.size > 1) {
    agnes.log(`      注意：生成的原始片段存在 ${srcSizes.size} 种分辨率，将统一缩放/补边到画布，不会拉伸变形。`);
  }

  // ---- 3. timeline -------------------------------------------------------
  agnes.log("[3/6] Allocating exact frame counts to each slot ...");
  const totalFrames = Math.round(audioDuration * fps);
  const durations = slots.map((s) => s.shot.duration);
  const slotFrames = ff.allocateFrames(durations, totalFrames, Math.max(1, Math.round(fps * 0.5)));
  const sumFrames = slotFrames.reduce((a, b) => a + b, 0);
  agnes.log(
    `      total=${totalFrames} frames (${audioDuration.toFixed(3)}s @ ${fps}fps)  ` +
    `allocated=${sumFrames}  slots=${slots.length}`
  );
  if (sumFrames !== totalFrames) throw new Error(`Frame allocation mismatch: ${sumFrames} != ${totalFrames}`);

  const rows = slots.map((s, i) => [
    s.shot.id,
    s.shot.start.toFixed(1) + "-" + s.shot.end.toFixed(1) + "s",
    s.shot.duration.toFixed(2) + "s",
    (slotFrames[i] / fps).toFixed(3) + "s",
    slotFrames[i],
    `${s.probe.width}x${s.probe.height}`,
    s.probe.duration.toFixed(2) + "s",
    s.probe.duration + 0.02 < slotFrames[i] / fps ? "EXTEND" : "ok",
  ]);
  cli.printTable(rows, ["shot", "计划时间轴", "计划时长", "实际槽位", "帧数", "源分辨率", "源时长", "处理"]);

  // ---- 4. normalise ------------------------------------------------------
  agnes.log("");
  agnes.log(`[4/6] Normalising ${slots.length} clip(s) into the shared canvas ...`);
  const transition = args.transition === "dissolve" ? "dissolve" : "cut";
  const overlapFrames = transition === "dissolve" ? Math.max(1, Math.round(args.transitionDuration * fps)) : 0;

  const normFiles = [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    const out = path.join(normDir, `n_${String(i + 1).padStart(3, "0")}_${String(s.shot.id).replace(/[^\w.-]/g, "_")}.mp4`);
    // Dissolve needs every clip except the last to carry the overlap frames.
    const wantFrames = slotFrames[i] + (transition === "dissolve" && i < slots.length - 1 ? overlapFrames : 0);

    if (!args.force && fs.existsSync(out)) {
      const pr = ff.probeMedia(out);
      // The intermediate is only reusable if it still matches BOTH the geometry
      // AND the source clip. Comparing geometry alone silently reuses a stale
      // render whenever a shot is re-generated with the same dimensions (e.g.
      // after a face/identity fix), which then ends up in the final MV.
      let fresh = true;
      try {
        fresh = fs.statSync(out).mtimeMs >= fs.statSync(s.file).mtimeMs;
      } catch (_) {
        fresh = false;
      }
      if (pr.width === canvas.width && pr.height === canvas.height && pr.frameCount === wantFrames && fresh) {
        normFiles.push(out);
        agnes.log(`      [skip] ${s.shot.id} already normalised`);
        continue;
      }
      if (!fresh) {
        agnes.log(`      [stale] ${s.shot.id} source clip is newer than the intermediate -> re-normalising`);
      } else {
        agnes.log(`      [redo] ${s.shot.id} geometry mismatch -> re-normalising`);
      }
    }
    ff.normalizeClip({
      input: s.file,
      output: out,
      width: canvas.width,
      height: canvas.height,
      fps,
      frames: wantFrames,
    });
    normFiles.push(out);
    agnes.log(
      `      [${i + 1}/${slots.length}] ${s.shot.id} -> ${wantFrames} frames ` +
      `(${(wantFrames / fps).toFixed(3)}s)`
    );
  }

  // ---- 5. concat + mux ---------------------------------------------------
  agnes.log("");
  agnes.log(`[5/6] Concatenating (${transition}) and muxing the original song ...`);
  const silent = path.join(buildDir, "video_silent.mp4");
  if (transition === "cut") {
    ff.concatClips(normFiles, silent, { fps, listPath: path.join(buildDir, "concat.txt"), crf: args.crf, preset: args.preset });
  } else {
    try {
      buildDissolve(normFiles, silent, {
        fps,
        slotFrames,
        overlapFrames,
        td: args.transitionDuration,
        width: canvas.width,
        height: canvas.height,
        crf: args.crf,
        preset: args.preset,
        fade: false, // fades are applied after the audio length is known
        fadeDuration: args.fadeDuration,
        fadeOutStart: 0,
      });
    } catch (e) {
      agnes.log("");
      agnes.log("      dissolve failed: " + String(e.message).split("\n").slice(0, 4).join(" | "));
      agnes.log("      falling back to hard cuts (--transition cut) to protect sync and frame accuracy.");
      ff.concatClips(normFiles, silent, { fps, listPath: path.join(buildDir, "concat.txt"), crf: args.crf, preset: args.preset });
    }
  }
  const silentProbe = ff.probeMedia(silent);
  agnes.log(`      silent video: ${silentProbe.width}x${silentProbe.height} ${silentProbe.fps}fps ${silentProbe.duration.toFixed(3)}s`);

  const title = cli.safeName(sb.title || meta.songTitle || "MV", "MV");
  const finalOut = path.resolve(args.output || path.join(outDir, `${title}_MV.mp4`));

  // Build the audio filter chain.
  const audioFilters = [];
  if (args.audioGain !== undefined && args.audioGain !== null) audioFilters.push(`volume=${args.audioGain}dB`);
  if (args.normalizeAudio) audioFilters.push("loudnorm=I=-14:TP=-1.5:LRA=11");

  mux(silent, songPath, finalOut, {
    fps,
    audioDuration,
    videoDuration: silentProbe.duration,
    crf: args.crf,
    preset: args.preset,
    audioFilters,
    fade: args.fade,
    fadeDuration: args.fadeDuration,
  });
  agnes.log(`      wrote ${path.basename(finalOut)} (${(fs.statSync(finalOut).size / 1024 / 1024).toFixed(2)} MB)`);

  // ---- 6. verify ---------------------------------------------------------
  agnes.log("");
  agnes.log("[6/6] Verifying the finished MV ...");
  const report = ff.verifyFinal(finalOut, songPath);
  const vrows = report.report.map((r) => [r.ok ? "PASS" : "FAIL", r.name, r.detail]);
  cli.printTable(vrows, ["结果", "检查项", "详情"]);
  agnes.log(`      video frames=${report.video.frames}  size=${report.video.width}x${report.video.height}  fps=${report.video.fps}`);

  let thumbs = [];
  if (args.thumbnails > 0) {
    const tdir = path.join(buildDir, "thumbs");
    thumbs = ff.extractThumbnails(finalOut, tdir, args.thumbnails, { width: 320 });
    agnes.log(`      ${thumbs.length} thumbnails -> ${tdir}`);
  }

  project.stages = project.stages || {};
  project.stages.assemble = {
    done: report.pass,
    at: new Date().toISOString(),
    output: finalOut,
    canvas: `${canvas.width}x${canvas.height}`,
    fps,
    transition,
    totalFrames,
    checks: report.report.map((r) => ({ name: r.name, ok: r.ok, detail: r.detail })),
  };
  project.output = finalOut;
  cli.saveProject(project);

  process.stdout.write("\n" + "=".repeat(78) + "\n");
  process.stdout.write(report.pass ? "MV 组装完成，全部质量门禁通过\n" : "MV 已生成，但存在未通过的质量门禁（见上表）\n");
  process.stdout.write("=".repeat(78) + "\n");
  process.stdout.write(`输出文件   : ${finalOut}\n`);
  process.stdout.write(`画幅/帧率  : ${report.video.width}x${report.video.height} @ ${report.video.fps}fps (CFR)\n`);
  process.stdout.write(`视频时长   : ${report.video.duration.toFixed(3)}s\n`);
  process.stdout.write(`歌曲时长   : ${report.audio.duration.toFixed(3)}s\n`);
  process.stdout.write(`总帧数     : ${report.video.frames}\n`);
  process.stdout.write(`转场       : ${transition}${transition === "dissolve" ? ` (${args.transitionDuration}s)` : ""}\n`);
  process.stdout.write(`文件大小   : ${(report.sizeBytes / 1024 / 1024).toFixed(2)} MB\n`);
  process.stdout.write(`音频       : 原声直通（未重新生成）\n`);
  process.stdout.write("\n");
  process.stdout.write(`MV_PATH=${finalOut}\n`);
  if (thumbs.length) process.stdout.write(`THUMBS_DIR=${path.join(buildDir, "thumbs")}\n`);
  process.stdout.write(`VERIFY_PASS=${report.pass}\n`);
  process.stdout.write("\n");
  process.stdout.write("请用 Read 工具查看缩略图目录，确认画面与色彩一致性后再交付给用户。\n");
  process.exit(report.pass ? 0 : 3);
}

/**
 * Mux the silent master with the original song.
 *
 * Sync-critical choices:
 *  - `tpad=stop_mode=clone` extends the picture if the clips are collectively
 *    shorter than the song, so the music is never cut short.
 *  - The output is explicitly bounded to the audio duration with `-t`, so the
 *    picture can never outlast the song either.
 *  - `-c:a copy` keeps the original bytes untouched; only if the source codec
 *    cannot be stored in MP4 do we fall back to a single high-bitrate AAC pass.
 */
function mux(videoFile, audioFile, output, o) {
  const padDur = Math.max(0, o.audioDuration - o.videoDuration);
  const vfParts = [];
  if (padDur > 0.001) vfParts.push(`tpad=stop_mode=clone:stop_duration=${(padDur + 1 / o.fps).toFixed(6)}`);
  vfParts.push(`fps=${o.fps}`);
  if (o.fade) {
    // Fade out so it finishes exactly on the frame before the audio ends.
    vfParts.push(`fade=t=in:st=0:d=${o.fadeDuration}`);
    vfParts.push(`fade=t=out:st=${Math.max(0, o.audioDuration - o.fadeDuration).toFixed(3)}:d=${o.fadeDuration}`);
  }
  vfParts.push("format=yuv420p");

  const base = ["-y", "-hide_banner", "-loglevel", "error", "-fflags", "+genpts",
    "-i", videoFile, "-i", audioFile,
    "-map", "0:v:0", "-map", "1:a:0",
    "-vf", vfParts.join(","),
    "-fps_mode", "cfr",
    "-c:v", "libx264", "-preset", o.preset, "-crf", String(o.crf),
    "-pix_fmt", "yuv420p"];

  const audioFilter = (o.audioFilters && o.audioFilters.length) ? o.audioFilters.join(",") : null;
  const tryOrder = audioFilter ? ["aac"] : ["copy", "aac"];

  let lastErr = null;
  for (const mode of tryOrder) {
    const args = base.slice();
    args.push("-c:a", mode === "copy" ? "copy" : "aac");
    if (mode === "aac") args.push("-b:a", "320k", "-ar", "48000", "-ac", "2");
    if (audioFilter) args.push("-af", audioFilter);
    args.push("-t", o.audioDuration.toFixed(6));
    args.push("-movflags", "+faststart", output);
    try {
      ff.ffmpeg(args);
      return output;
    } catch (e) {
      lastErr = e;
      agnes.log(`      audio mux mode "${mode}" failed, trying next (${String(e.message).split("\n")[0].slice(0, 120)})`);
    }
  }
  throw new Error("Audio mux failed for all modes: " + (lastErr && lastErr.message));
}

main().catch((e) => {
  process.stderr.write("\nassemble.js FAILED: " + (e && e.message ? e.message : e) + "\n");
  process.exit(1);
});
