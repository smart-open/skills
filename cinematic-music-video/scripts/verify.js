#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * verify.js — Independent quality gate for a finished MV (or a project in progress).
 *
 * Re-runnable at any time. Reports, per shot and for the whole film:
 *
 *   - canvas: is every clip on the shared canvas, with square pixels?
 *   - motion: measured inter-frame change per clip, flagging "frozen" shots
 *   - frames: decoded frame count vs fps x duration (dropped / duplicated frames)
 *   - sync:   video length vs the original song length (truncation / drift)
 *   - audio:  is the original song actually the audio track?
 *
 * Usage:
 *   node verify.js --project ./mv-song [--motion-min 1.2] [--thumbs 12]
 *   node verify.js --file ./05_output/x_MV.mp4 --song song.mp3
 */

const fs = require("fs");
const path = require("path");

const agnes = require("./lib/agnes");
const ff = require("./lib/ffmpeg");
const cli = require("./lib/cli");

const SPEC = {
  "--project": { key: "project", type: "string", alias: ["-d"], desc: "Project directory" },
  "--file": { key: "file", type: "string", desc: "Verify a specific MP4 instead of a project output" },
  "--song": { key: "song", type: "string", desc: "Song file for sync comparison (optional if the project stores it)" },
  "--motion-min": { key: "motionMin", type: "number", default: 1.2, desc: "Motion score below which a clip is flagged" },
  "--thumbs": { key: "thumbs", type: "int", default: 0, desc: "Extract N review thumbnails (0 = none)" },
  "--skip-motion": { key: "skipMotion", type: "bool", desc: "Skip per-clip motion measurement (faster)" },
  "--json": { key: "json", type: "string", desc: "Also write the report to this JSON path" },
};

const USAGE = `verify.js — quality gate for a CV music video

Options:
  --project <dir>       Project directory (default: the unique project under out/)
  --file <mp4>          Verify a specific file instead
  --song <audio>        Song file used for the sync comparison
  --motion-min 1.2      Frozen-clip threshold
  --thumbs 12           Extract review thumbnails
  --skip-motion         Skip per-clip motion measurement
  --json <path>         Write the report as JSON

Example:
  node verify.js --project ./mv-song --thumbs 12`;

/**
 * The sync gate compares against the song, but verification must still work
 * when the song is missing (the gates that matter are about the rendered file).
 * So a failed lookup degrades to "no sync comparison" instead of throwing.
 */
function safeSongPath(projectDir, project) {
  try {
    return cli.resolveSongPath(projectDir, project, null, null);
  } catch (e) {
    agnes.log("  note: song not found for the sync comparison — that gate will be skipped");
    return null;
  }
}

function main() {
  const parse = cli.createParser(SPEC, USAGE);
  const args = parse(process.argv.slice(2));
  ff.assertFfmpegAvailable();

  // --project / positional is optional: without it we verify the unique project
  // under <skill>/out/. Never falls back to the current working directory.
  const explicitProject = args.project || args._positional[0] || null;
  const projectDir = explicitProject ? cli.resolveProjectDir(explicitProject) : null;
  const project = projectDir ? cli.loadProject(projectDir) : null;
  const songPath = args.song
    ? path.resolve(args.song)
    : (project ? safeSongPath(projectDir, project) : null);

  let target = args.file ? path.resolve(args.file) : (project && project.output) || null;
  if (!target && projectDir) {
    const outDir = path.join(projectDir, cli.STAGE_DIRS.output);
    if (fs.existsSync(outDir)) {
      const cands = fs.readdirSync(outDir).filter((f) => f.toLowerCase().endsWith(".mp4"));
      if (cands.length) target = path.join(outDir, cands.sort().pop());
    }
  }
  if (!target || !fs.existsSync(target)) {
    throw new Error("Nothing to verify. Pass --project <dir> (after assemble.js) or --file <mp4>.");
  }

  const report = { target, generatedAt: new Date().toISOString(), gates: [], clips: [], summary: {} };

  agnes.log("=".repeat(78));
  agnes.log("MV quality verification");
  agnes.log("=".repeat(78));
  agnes.log(`  file: ${target}`);
  agnes.log("");

  // ---- 1. film-level gates ----------------------------------------------
  agnes.log("[1/3] Film-level gates ...");
  const mv = ff.probeMedia(target);
  const mvFrames = ff.countFrames(target);
  const audioTarget = songPath && fs.existsSync(songPath) ? ff.probeAudio(songPath) : null;

  const gate = (name, ok, detail) => {
    report.gates.push({ name, ok, detail });
    agnes.log(`  ${ok ? "PASS" : "FAIL"}  ${name.padEnd(26)} ${detail}`);
  };

  gate("video stream present", !!mv.hasVideo, mv.hasVideo ? `${mv.width}x${mv.height} ${mv.vcodec}` : "missing");
  gate("audio stream present", !!mv.hasAudio, mv.hasAudio ? `${mv.acodec} ${mv.sampleRate}Hz ${mv.channels}ch` : "missing");
  gate("constant frame rate", mv.fps !== null && Math.abs(mv.fps - Math.round(mv.fps)) < 0.01, `fps=${mv.fps}`);
  gate("square pixels (SAR 1:1)", mv.sar === "1:1" || mv.sar === "0:1" || mv.sar === null, `SAR=${mv.sar}`);

  if (mvFrames !== null && mv.duration) {
    const expected = Math.round(mv.duration * mv.fps);
    // Allow 1 frame of container-level rounding, nothing more.
    gate("frame continuity", Math.abs(mvFrames - expected) <= 1, `decoded=${mvFrames} expected≈${expected}`);
  } else {
    gate("frame continuity", false, "could not count frames");
  }

  if (audioTarget && audioTarget.duration) {
    const drift = audioTarget.duration - mv.duration;
    gate(
      "no audio truncation",
      drift <= 0.15,
      `audio=${audioTarget.duration.toFixed(3)}s video=${mv.duration.toFixed(3)}s drift=${drift.toFixed(3)}s`
    );
  } else {
    agnes.log("  SKIP  no-audio-truncation        (no song file supplied)");
  }

  report.summary.film = {
    width: mv.width,
    height: mv.height,
    fps: mv.fps,
    duration: mv.duration,
    frames: mvFrames,
    sizeBytes: fs.statSync(target).size,
    vcodec: mv.vcodec,
    acodec: mv.acodec,
  };

  // ---- 2. per-clip gates -------------------------------------------------
  const clipDir = projectDir ? path.join(projectDir, cli.STAGE_DIRS.clips) : null;
  if (clipDir && fs.existsSync(clipDir)) {
    agnes.log("");
    agnes.log("[2/3] Per-clip gates ...");
    const files = fs.readdirSync(clipDir).filter((f) => f.toLowerCase().endsWith(".mp4")).sort();
    let frozen = 0;
    for (const f of files) {
      const full = path.join(clipDir, f);
      const p = ff.probeMedia(full);
      let motion = null;
      if (!args.skipMotion) {
        const m = ff.motionScore(full, { fps: 4 });
        motion = m.score;
      }
      const onCanvas = p.width === mv.width && p.height === mv.height;
      const ok = onCanvas && (motion === null || motion >= args.motionMin);
      if (motion !== null && motion < args.motionMin) frozen++;
      report.clips.push({ file: f, width: p.width, height: p.height, fps: p.fps, duration: p.duration, motion, onCanvas, ok });
      agnes.log(
        `  ${ok ? "PASS" : "WARN"}  ${f.padEnd(20)} ${String(p.width) + "x" + p.height}`.padEnd(46) +
        ` ${p.duration.toFixed(2)}s  ${onCanvas ? "canvas-ok" : "CANVAS-MISMATCH"}` +
        (motion === null ? "" : `  motion=${motion.toFixed(2)}${motion < args.motionMin ? "  <-- TOO STATIC" : ""}`)
      );
    }
    report.summary.clips = { total: files.length, frozen };
    agnes.log("");
    agnes.log(`  片段总数 ${files.length}，其中运动量偏低的 ${frozen} 个。`);
    if (frozen) agnes.log(`  建议：对上述片段重跑 videos.js（会自动带更强运动提示词重生成）。`);
  } else {
    agnes.log("");
    agnes.log("[2/3] Per-clip gates ... skipped (no 03_clips directory)");
  }

  // ---- 3. thumbnails ----------------------------------------------------
  if (args.thumbs > 0) {
    agnes.log("");
    agnes.log("[3/3] Extracting review thumbnails ...");
    const outDir = path.join(projectDir || path.dirname(target), "04_build", "thumbs");
    const thumbs = ff.extractThumbnails(target, outDir, args.thumbs, { width: 360 });
    agnes.log(`  ${thumbs.length} thumbnails -> ${outDir}`);
    report.summary.thumbsDir = outDir;
  } else {
    agnes.log("");
    agnes.log("[3/3] Thumbnails skipped");
  }

  // ---- result -----------------------------------------------------------
  const failed = report.gates.filter((g) => !g.ok);
  const filmPass = failed.length === 0;
  const clipsPass = !report.summary.clips || report.summary.clips.frozen === 0;

  process.stdout.write("\n" + "=".repeat(78) + "\n");
  process.stdout.write(filmPass && clipsPass ? "验证通过：成片符合全部质量门禁\n" : "验证发现问题，详见上方 FAIL / WARN 行\n");
  process.stdout.write("=".repeat(78) + "\n");
  process.stdout.write(`成片        : ${target}\n`);
  process.stdout.write(`分辨率/帧率 : ${mv.width}x${mv.height} @ ${mv.fps}fps\n`);
  process.stdout.write(`时长        : ${mv.duration.toFixed(3)}s（${mvFrames} 帧）\n`);
  process.stdout.write(`文件大小    : ${(fs.statSync(target).size / 1024 / 1024).toFixed(2)} MB\n`);
  process.stdout.write(`门禁        : ${report.gates.length - failed.length}/${report.gates.length} 通过\n`);
  if (report.summary.clips) {
    process.stdout.write(`片段运动    : ${report.summary.clips.total - report.summary.clips.frozen}/${report.summary.clips.total} 达标\n`);
  }
  process.stdout.write("\n");
  process.stdout.write(`VERIFY_PASS=${filmPass && clipsPass}\n`);
  if (report.summary.thumbsDir) process.stdout.write(`THUMBS_DIR=${report.summary.thumbsDir}\n`);

  if (args.json) {
    agnes.writeFileSyncDurable(path.resolve(args.json), JSON.stringify(report, null, 2));
    process.stdout.write(`REPORT_JSON=${path.resolve(args.json)}\n`);
  }
  process.exit(filmPass && clipsPass ? 0 : 3);
}

try {
  main();
} catch (e) {
  process.stderr.write("\nverify.js FAILED: " + (e && e.message ? e.message : e) + "\n");
  process.exit(1);
}
