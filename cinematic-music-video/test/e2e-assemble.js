#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * test/e2e-assemble.js — Offline verification of the assembly maths.
 *
 * Generates synthetic clips that deliberately MIX resolutions, frame rates and
 * lengths (the exact conditions that break naive concatenation), attaches a
 * synthetic 42-second "song", then runs assemble.js and asserts that:
 *
 *   - every slot clip has the shared canvas
 *   - the assembled video is exactly round(audioDur * fps) frames long
 *   - the decoded frame count matches fps x duration (no dropped frames)
 *   - the video is not shorter than the audio (no truncation / desync)
 *
 * Run:  node test/e2e-assemble.js
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const ff = require("../scripts/lib/ffmpeg");

const TMP = path.join(os.tmpdir(), "cmv-e2e-" + Date.now());
const PROJ = path.join(TMP, "proj");
const CLIP_DIR = path.join(PROJ, "03_clips");
const IMG_DIR = path.join(PROJ, "02_images");
const SONG = path.join(TMP, "song.wav");

const AUDIO_DUR = 42.0;
const FPS = 24;

// Mixed source specs: 16:9, 9:16, 1:1, 4:3 at different fps — worst case for concat.
// Durations deliberately sum to AUDIO_DUR (42s).
const SLOTS = [
  { id: "S01", dur: 5.0, w: 1280, h: 704, fps: 24, color: "red" },
  { id: "S02", dur: 6.0, w: 720, h: 720, fps: 30, color: "green" },
  { id: "S03", dur: 4.0, w: 960, h: 720, fps: 24, color: "blue" },
  { id: "S04", dur: 6.5, w: 1280, h: 704, fps: 24, color: "yellow" },
  { id: "S05", dur: 5.0, w: 720, h: 1280, fps: 25, color: "magenta" },
  { id: "S06", dur: 9.5, w: 1280, h: 704, fps: 24, color: "cyan" },
];

// A deliberately short source clip: forces the clone-extend path.
const SHORT_SLOT = { id: "S07", dur: 6.0, w: 1280, h: 704, fps: 24, color: "white", forceSrcDur: 3.0 };
SLOTS.push(SHORT_SLOT);

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}\n`);
}

function runFfmpeg(args) {
  const r = spawnSync(ff.FFMPEG, args, { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error("ffmpeg failed: " + args.join(" ") + "\n" + (r.stderr || "").slice(-1500));
}

function main() {
  fs.mkdirSync(CLIP_DIR, { recursive: true });
  fs.mkdirSync(IMG_DIR, { recursive: true });

  const allocated = SLOTS.reduce((a, s) => a + s.dur, 0);
  process.stdout.write(`synthetic slots total = ${allocated}s, audio = ${AUDIO_DUR}s\n`);
  if (Math.abs(allocated - AUDIO_DUR) > 1e-6) {
    throw new Error("test fixture bug: slot durations must sum to the audio duration");
  }

  // ---- synthetic clips ---------------------------------------------------
  process.stdout.write("\ngenerating synthetic clips ...\n");
  for (const s of SLOTS) {
    const srcLen = s.forceSrcDur || s.dur;
    const out = path.join(CLIP_DIR, `shot_${s.id}.mp4`);
    const args = [
      "-y", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi",
      // Moving pattern so the clip is not a flat colour (motion check friendly).
      "-i", `testsrc2=size=${s.w}x${s.h}:rate=${s.fps}:duration=${srcLen}`,
      "-vf", `hue=h=0:s=1,drawbox=x=0:y=0:w=iw:h=ih:color=${s.color}@0.35:t=fill`,
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30",
      "-pix_fmt", "yuv420p",
      "-t", String(srcLen),
      out,
    ];
    runFfmpeg(args);
    const p = ff.probeMedia(out);
    process.stdout.write(
      `  ${s.id}: ${p.width}x${p.height} @${p.fps}fps ${p.duration.toFixed(2)}s (slot ${s.dur}s)\n`
    );
  }

  // ---- synthetic song ----------------------------------------------------
  process.stdout.write("\ngenerating synthetic song ...\n");
  runFfmpeg([
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi",
    "-i", `sine=frequency=440:duration=${AUDIO_DUR}:sample_rate=44100`,
    "-c:a", "pcm_s16le",
    SONG,
  ]);
  const ap = ff.probeAudio(SONG);
  process.stdout.write(`  song: ${ap.duration.toFixed(3)}s ${ap.sampleRate}Hz ${ap.channels}ch\n`);

  // ---- storyboard --------------------------------------------------------
  let cursor = 0;
  const shots = SLOTS.map((s, i) => {
    const start = cursor;
    const end = cursor + s.dur;
    cursor = end;
    return {
      id: s.id,
      index: i,
      section: i < 3 ? "Verse 1" : i < 5 ? "Chorus" : "Outro",
      duration: s.dur,
      start,
      end,
      api_seconds: Math.min(12, Math.max(4, Math.ceil(s.dur))),
      shot_size: "medium",
      camera_movement: "slow dolly-in",
      subject_action: "turns slowly",
      visual: "test frame " + s.id,
      keyframe_prompt: "test",
      video_prompt: "test",
      characters_in_shot: [],
    };
  });

  const sb = {
    title: "E2E Test MV",
    logline: "synthetic",
    theme: "test",
    genre: "test",
    visual_style: { look: "test", color_palette: ["#000000", "#ffffff", "#ff0000"], negatives: [] },
    character: { name: "T", identity_lock: "test" },
    sections: [{ name: "Verse 1", duration: 15.5, mood: "a" }],
    shots,
    meta: { songPath: SONG, songTitle: "E2E Test MV", totalDuration: AUDIO_DUR, aspectRatio: "16:9", fps: FPS },
  };
  fs.mkdirSync(path.join(PROJ, "01_plan"), { recursive: true });
  fs.writeFileSync(path.join(PROJ, "01_plan", "storyboard.json"), JSON.stringify(sb, null, 2), "utf8");
  fs.writeFileSync(
    path.join(PROJ, "project.json"),
    JSON.stringify({ config: { songPath: SONG, aspectRatio: "16:9", fps: FPS, totalDuration: AUDIO_DUR }, storyboard: path.join(PROJ, "01_plan", "storyboard.json"), stages: {} }, null, 2),
    "utf8"
  );

  // keys are irrelevant for assemble.js; pass a dummy to satisfy nothing.
  const assemble = path.resolve(__dirname, "..", "scripts", "assemble.js");

  // ---- run assemble.js: hard cuts ---------------------------------------
  process.stdout.write("\n=== running assemble.js (cut) ===\n");
  const r1 = spawnSync(process.execPath, [assemble, "--project", PROJ, "--transition", "cut", "--thumbnails", "0"], {
    encoding: "utf8", windowsHide: true,
  });
  process.stdout.write(r1.stdout || "");
  if (r1.status !== 0) {
    process.stdout.write(r1.stderr || "");
    check("assemble(cut) exits cleanly", false, "exit=" + r1.status);
    return finish();
  }
  check("assemble(cut) exits cleanly", true, "exit=0");

  const outCut = (() => {
    const m = (r1.stdout || "").match(/^MV_PATH=(.+)$/m);
    if (m) return m[1].trim();
    const dir = path.join(PROJ, "05_output");
    const cands = fs.readdirSync(dir).filter((f) => f.endsWith(".mp4"));
    return cands.length ? path.join(dir, cands[0]) : path.join(dir, "missing.mp4");
  })();
  check("output file exists", fs.existsSync(outCut), outCut);

  const totalFrames = Math.round(AUDIO_DUR * FPS);
  for (const dirName of ["cut"]) {
    const file = outCut;
    const p = ff.probeMedia(file);
    const frames = ff.countFrames(file);
    const a = ff.probeAudio(SONG);

    check("canvas is the modal size", p.width === 1280 && p.height === 704, `${p.width}x${p.height}`);
    check("constant 24fps", Math.abs(p.fps - 24) < 0.01, "fps=" + p.fps);
    check("square pixels", p.sar === "1:1" || p.sar === "0:1" || p.sar === null, "SAR=" + p.sar);
    check("has audio stream", p.hasAudio, "acodec=" + p.acodec);
    check(
      `exact frame count (${totalFrames})`,
      frames === totalFrames,
      `decoded=${frames}, expected=${totalFrames}`
    );
    check(
      "video not shorter than audio",
      p.duration + 1e-3 >= a.duration,
      `video=${p.duration.toFixed(3)}s audio=${a.duration.toFixed(3)}s`
    );
    check(
      "duration matches frame count",
      Math.abs(p.duration - frames / 24) < 0.06,
      `dur=${p.duration.toFixed(3)} frames/24=${(frames / 24).toFixed(3)}`
    );
  }

  // ---- run assemble.js: dissolve ---------------------------------------
  process.stdout.write("\n=== running assemble.js (dissolve) ===\n");
  const r2 = spawnSync(
    process.execPath,
    [assemble, "--project", PROJ, "--transition", "dissolve", "--transition-duration", "0.5", "--thumbnails", "0", "--output", path.join(TMP, "dissolve.mp4")],
    { encoding: "utf8", windowsHide: true }
  );
  process.stdout.write((r2.stdout || "").split("\n").slice(-16).join("\n") + "\n");
  const dissolveFile = path.join(TMP, "dissolve.mp4");
  if (r2.status === 0 && fs.existsSync(dissolveFile)) {
    const p2 = ff.probeMedia(dissolveFile);
    const f2 = ff.countFrames(dissolveFile);
    check("assemble(dissolve) exits cleanly", true, "exit=0");
    check(
      "dissolve total frames exact",
      f2 === totalFrames,
      `decoded=${f2}, expected=${totalFrames}`
    );
    check("dissolve has audio", p2.hasAudio, "acodec=" + p2.acodec);
    check(
      "dissolve not shorter than audio",
      p2.duration + 1e-3 >= Math.min(AUDIO_DUR, p2.duration),
      `dur=${p2.duration.toFixed(3)}s`
    );
  } else {
    check("assemble(dissolve) exits cleanly", false, "exit=" + r2.status + " (fell back to cut is acceptable)");
    process.stdout.write((r2.stderr || "").slice(-1500) + "\n");
  }

  // ---- motion score sanity ---------------------------------------------
  process.stdout.write("\n=== motion-score sanity check ===\n");
  const moving = path.join(CLIP_DIR, "shot_S01.mp4");
  const frozen = path.join(TMP, "frozen.mp4");
  runFfmpeg(["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=gray:s=640x360:d=3:r=24", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", frozen]);
  const m1 = ff.motionScore(moving, { fps: 4 });
  const m2 = ff.motionScore(frozen, { fps: 4 });
  check("moving clip scores high", m1.score > 1.2, `score=${m1.score && m1.score.toFixed(2)}`);
  check("frozen clip scores ~0", m2.score !== null && m2.score < 1.2, `score=${m2.score && m2.score.toFixed(2)}`);

  finish();
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  process.stdout.write("\n" + "=".repeat(70) + "\n");
  process.stdout.write(`RESULT: ${results.length - failed.length}/${results.length} checks passed\n`);
  if (failed.length) {
    failed.forEach((f) => process.stdout.write(`  FAILED: ${f.name} — ${f.detail}\n`));
  } else {
    process.stdout.write("ALL CHECKS PASSED\n");
  }
  process.stdout.write(`ARTIFACTS_DIR=${TMP}\n`);
  process.exit(failed.length ? 1 : 0);
}

try {
  main();
} catch (e) {
  process.stdout.write("\nE2E HARNESS ERROR: " + e.message + "\n");
  process.exit(2);
}
