#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * run.js — End-to-end orchestrator: plan -> images -> videos -> assemble.
 *
 * Each stage runs as a child process so it behaves exactly like running the
 * scripts by hand, and so any stage can be re-run on its own after a failure.
 * Stages are skipped when project.json already marks them complete (resume),
 * unless --force-stage is passed.
 *
 * Usage:
 *   node run.js --song "song.mp3" --lyrics "lyrics.lrc" --keys "sk-a,sk-b" \
 *               [--brief "..."] [--style "..."] [--aspect 16:9] [--shots 28] \
 *               [--stage all|plan|images|videos|assemble] \
 *               [--concurrency 2] [--transition cut|dissolve] [--fade]
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const agnes = require("./lib/agnes");
const cli = require("./lib/cli");
const paths = require("./lib/paths");

const SCRIPT_DIR = __dirname;

const SPEC = {
  "--song": { key: "song", type: "string", alias: ["-s"], desc: "Path to the song file" },
  "--lyrics": { key: "lyrics", type: "string", alias: ["-l"], default: "auto", desc: "Lyrics file / inline text / 'auto'" },
  "--brief": { key: "brief", type: "string", alias: ["-b"], desc: "Creative brief" },
  "--style": { key: "style", type: "string", desc: "Visual style hint" },
  "--aspect": { key: "aspect", type: "string", default: "16:9", desc: "16:9 | 9:16 | 1:1 | 4:3 | 3:4 | 21:9" },
  "--shots": { key: "shots", type: "int", desc: "Target shot count" },
  "--title": { key: "title", type: "string", desc: "Song title" },
  "--artist": { key: "artist", type: "string", desc: "Artist" },
  "--lang": { key: "lang", type: "string", default: "zh", desc: "Prompt language: zh | en" },
  "--project": { key: "project", type: "string", alias: ["-d"], desc: "Project directory" },
  "--stage": { key: "stage", type: "string", default: "all", desc: "all | plan | images | videos | assemble" },
  "--concurrency": { key: "concurrency", type: "int", default: 2, desc: "Image / video parallelism" },

  // --- character identity (stage 2) ---
  "--size": { key: "size", type: "string", default: "2K", desc: "Image size tier: 1K | 2K | 3K | 4K" },
  "--sheet-candidates": { key: "sheetCandidates", type: "int", default: 2, desc: "Reference-sheet candidates to generate and score" },
  "--sheet-layout": { key: "sheetLayout", type: "string", default: "sheet-full", desc: "sheet-full (close-up + turnaround + expression band) | sheet (close-up + turnaround) | turntable (8 views)" },
  "--strict-profile": { key: "strictProfile", type: "bool", desc: "Fail planning unless the character profile covers all seven dimensions" },
  "--angles": { key: "angles", type: "list", default: ["front", "3q-left", "3q-right", "side", "back"], desc: "Body reference angles to derive, e.g. --angles front,3q-left,side" },
  "--ref-ratio": { key: "refRatio", type: "string", default: "9:16", desc: "Aspect ratio for full-body references" },
  "--identity-min": { key: "identityMin", type: "int", default: 70, desc: "Minimum identity match score to accept a keyframe" },
  "--identity-retries": { key: "identityRetries", type: "int", default: 2, desc: "Regenerations for a keyframe that fails the identity gate" },
  "--ref-retries": { key: "refRetries", type: "int", default: 2, desc: "Regenerations for a studio reference that fails its single-subject gate" },
  "--no-verify": { key: "noVerify", type: "bool", desc: "Disable all vision checks" },
  "--text-strict": { key: "textStrict", type: "bool", desc: "Fail a character keyframe that contains readable text" },
  "--include-sheet": { key: "includeSheet", type: "bool", desc: "Also pass the master character sheet as a third shot reference" },
  "--no-scenes": { key: "noScenes", type: "bool", desc: "Do not build per-location anchor frames" },

  "--video-mode": { key: "videoMode", type: "string", default: "keyframe", desc: "keyframe | reference" },
  "--motion-min": { key: "motionMin", type: "number", default: 1.2, desc: "Minimum motion score" },
  "--motion-retries": { key: "motionRetries", type: "int", default: 2, desc: "Static-clip regeneration attempts" },
  "--candidates": { key: "candidates", type: "int", default: 1, desc: "Video takes per shot, keep the liveliest" },
  "--chain": { key: "chain", type: "bool", desc: "Pin last_frame to the next shot's keyframe inside a section" },
  "--transition": { key: "transition", type: "string", default: "cut", desc: "cut | dissolve" },
  "--fade": { key: "fade", type: "bool", desc: "Fade in / out to black" },
  "--normalize-audio": { key: "normalizeAudio", type: "bool", desc: "EBU R128 loudness normalisation" },
  "--canvas": { key: "canvas", type: "string", default: "auto", desc: "auto | 1920x1080" },
  "--fps": { key: "fps", type: "string", default: "auto", desc: "auto | 24 | 30" },
  "--crf": { key: "crf", type: "int", default: 18, desc: "x264 quality" },
  "--force-stage": { key: "forceStage", type: "bool", desc: "Re-run the selected stage even if marked complete" },
  "--dry-run": { key: "dryRun", type: "bool", desc: "Print the stage plan and exit" },
  ...cli.COMMON_KEYS,
};

const USAGE = `run.js — one-command cinematic music video pipeline

Required:
  --song <file>            Path to the song
  --keys "sk-a,sk-b"       Agnes API keys (round-robin)

Common:
  --lyrics <file|text>     Lyrics (auto-detects a sidecar .lrc)
  --brief "..."            Creative direction for the storyboard
  --style "..."            Visual style hint
  --aspect 16:9            Output aspect ratio
  --shots 28               Target shot count
  --project ./mv-x         Project directory (default: <cwd>/out/mv-<song>)
  --stage all              all | plan | images | videos | assemble
  --concurrency 2          Parallel image / video requests
  --transition dissolve    cut | dissolve
  --fade                   Fade in / out to black

Character identity (stage 2 — this is what keeps the protagonist recognisable):
  --sheet-candidates 2     Reference-sheet candidates to generate, then keep the best-scoring one
  --sheet-layout full     Reference-sheet layout (default sheet-full = close-up + turnaround + expression band)
  --strict-profile         Refuse to plan unless the character covers all seven profile dimensions
  --angles front,3q-left   Body reference angles to derive from the sheet
                           (available: front, 3q-left, 3q-right, side, back)
  --identity-min 70        Minimum identity match score (0-100) for a keyframe to be accepted
  --identity-retries 2     Regenerations for a keyframe that fails the identity gate
  --include-sheet          Also pass the master sheet as a third reference for each shot
  --no-verify              Disable all vision checks (faster, but no identity gate)

Location consistency (stage 2 — one empty anchor frame per recurring place):
  --no-scenes              Skip the per-location anchor frames (behaves like older versions)

Video takes (stage 3):
  --candidates 1           Shoot N takes per shot and keep the liveliest (costs N x credits)

Example:
  node run.js --song "夜曲.mp3" --lyrics "夜曲.lrc" \\
              --brief "城市里两个人在雨夜重逢又告别" --style "霓虹雨夜，胶片质感" \\
              --shots 26 --transition dissolve --fade \\
              --keys "sk-a,sk-b" --concurrency 3`;

const STAGE_ORDER = ["plan", "images", "videos", "assemble"];

function runStage(name, scriptArgs) {
  const script = path.join(SCRIPT_DIR, name + ".js");
  if (!fs.existsSync(script)) throw new Error("missing stage script: " + script);
  agnes.log("");
  agnes.log("#".repeat(78));
  agnes.log(`# STAGE: ${name}`);
  agnes.log("#".repeat(78));
  const r = spawnSync(process.execPath, [script].concat(scriptArgs), {
    stdio: "inherit",
    windowsHide: true,
  });
  if (r.error) throw new Error(`failed to launch ${name}.js: ${r.error.message}`);
  if (r.status !== 0) {
    const err = new Error(`stage "${name}" exited with status ${r.status}`);
    err.stage = name;
    err.stageStatus = r.status;
    throw err;
  }
}

function main() {
  const parse = cli.createParser(SPEC, USAGE);
  const args = parse(process.argv.slice(2));

  if (!args.song) {
    process.stdout.write(USAGE + "\n");
    process.exit(2);
  }
  if (!["all"].concat(STAGE_ORDER).includes(args.stage)) {
    process.stderr.write(`ERROR: --stage must be one of all, ${STAGE_ORDER.join(", ")}\n`);
    process.exit(2);
  }

  const songPath = path.resolve(args.song);
  if (!fs.existsSync(songPath)) {
    process.stderr.write("ERROR: song file not found: " + songPath + "\n");
    process.exit(2);
  }
  const projectDir = cli.deriveProjectDir(songPath, args.project);
  // Note: the project directory is NOT created yet — a --dry-run inspection
  // should leave no trace on disk. It is created just before the first stage.

  const stageList = args.stage === "all" ? STAGE_ORDER.slice() : [args.stage];

  // ---- resume detection --------------------------------------------------
  const project = cli.loadProject(projectDir);
  const done = {
    plan: !!(project.stages && project.stages.plan && project.stages.plan.done),
    images: !!(project.stages && project.stages.images && project.stages.images.done),
    videos: !!(project.stages && project.stages.clips && project.stages.clips.done),
    assemble: false,
  };

  agnes.log("=".repeat(78));
  agnes.log("Cinematic Music Video pipeline");
  agnes.log("=".repeat(78));
  agnes.log(`  song      : ${paths.rel(songPath)}`);
  agnes.log(`  project   : ${paths.rel(projectDir)}   (under ${paths.rel(paths.outDir())}/)`);
  agnes.log(`  stages    : ${stageList.join(" -> ")}`);
  agnes.log(`  aspect    : ${args.aspect}    shots: ${args.shots || "auto"}    lang: ${args.lang}`);
  agnes.log(`  video mode: ${args.videoMode}    transition: ${args.transition}${args.fade ? " + fade" : ""}`);
  agnes.log(`  concurrency: ${args.concurrency}    motionMin: ${args.motionMin} (retries ${args.motionRetries})`);
  agnes.log("");

  if (args.dryRun) {
    // Deliberately before key resolution: inspecting the plan must not require
    // credentials, and --dry-run must be safe to run with nothing configured.
    stageList.forEach((s) => agnes.log(`  would run: ${s}${!args.forceStage && done[s] ? "  (already complete — will be skipped)" : ""}`));
    agnes.log("");
    agnes.log(`  out root  : ${paths.rel(paths.outDir())}/`);
    process.exit(0);
  }

  // The key flags are forwarded verbatim; if they came from the environment we
  // resolve them once here so the child processes inherit a concrete list.
  let keyArgs = [];
  if (args.keys && args.keys.length) keyArgs = ["--keys", args.keys.join(",")];
  else if (args.keysFile) keyArgs = ["--keys-file", args.keysFile];
  else if (args.apiKey) keyArgs = ["--api-key", args.apiKey];
  else {
    const envKeys = agnes.parseKeyList(process.env.AGNES_API_KEYS || process.env["agnes-api-key"] || process.env.AGNES_API_KEY);
    if (envKeys.length) keyArgs = ["--keys", envKeys.join(",")];
    else {
      process.stderr.write(
        "ERROR: no API key. Pass --keys \"sk-a,sk-b\" or set AGNES_API_KEYS.\n"
      );
      process.exit(2);
    }
  }

  const planArgs = [
    "--song", songPath,
    "--lyrics", args.lyrics || "auto",
    "--out", projectDir,
    "--aspect", args.aspect,
    "--lang", args.lang,
  ].concat(keyArgs);
  if (args.brief) planArgs.push("--brief", args.brief);
  if (args.style) planArgs.push("--style", args.style);
  if (args.shots) planArgs.push("--shots", String(args.shots));
  if (args.title) planArgs.push("--title", args.title);
  if (args.artist) planArgs.push("--artist", args.artist);
  if (args.strictProfile) planArgs.push("--strict-profile");

  const startedAt = Date.now();
  const completed = [];
  agnes.ensureDir(projectDir);

  for (const stage of stageList) {
    if (!args.forceStage && stage !== "assemble" && done[stage]) {
      agnes.log("");
      agnes.log(`[skip] stage "${stage}" is already complete (use --force-stage to redo it)`);
      completed.push(stage + " (skipped)");
      continue;
    }

    try {
      if (stage === "plan") {
        runStage("plan", planArgs);
      } else if (stage === "images") {
        runStage("images", [
          "--project", projectDir,
          "--concurrency", String(args.concurrency),
          "--size", args.size,
          "--sheet-candidates", String(args.sheetCandidates),
          "--sheet-layout", args.sheetLayout,
          "--angles", (args.angles || []).join(","),
          "--ref-ratio", args.refRatio,
          "--identity-min", String(args.identityMin),
          "--identity-retries", String(args.identityRetries),
          "--ref-retries", String(args.refRetries),
        ].concat(args.noVerify ? ["--no-verify"] : [])
          .concat(args.includeSheet ? ["--include-sheet"] : [])
          .concat(args.noScenes ? ["--no-scenes"] : [])
          .concat(args.textStrict ? ["--text-strict"] : [])
          .concat(keyArgs));
      } else if (stage === "videos") {
        runStage("videos", [
          "--project", projectDir,
          "--mode", args.videoMode,
          "--concurrency", String(args.concurrency),
          "--motion-min", String(args.motionMin),
          "--motion-retries", String(args.motionRetries),
          "--candidates", String(args.candidates),
        ].concat(args.chain ? ["--chain"] : []).concat(keyArgs));
      } else if (stage === "assemble") {
        runStage("assemble", [
          "--project", projectDir,
          "--transition", args.transition,
          "--canvas", args.canvas,
          "--fps", args.fps,
          "--crf", String(args.crf),
        ].concat(args.fade ? ["--fade"] : [])
          .concat(args.normalizeAudio ? ["--normalize-audio"] : []));
      }
      completed.push(stage);
    } catch (e) {
      agnes.log("");
      agnes.log("!".repeat(78));
      agnes.log(`Stage "${stage}" failed: ${e.message}`);
      agnes.log("");
      agnes.log("The pipeline stopped here. Everything already produced is preserved, so you can fix");
      agnes.log("the problem and resume with:");
      agnes.log("");
      agnes.log(`  node ${path.join(SCRIPT_DIR, stage + ".js")} --project "${projectDir}" ...`);
      agnes.log("");
      agnes.log("or re-run the whole pipeline (completed stages are skipped automatically):");
      agnes.log("");
      agnes.log(`  node ${path.join(SCRIPT_DIR, "run.js")} --song "${songPath}" --project "${projectDir}" --keys "<key>"`);
      agnes.log("!".repeat(78));
      process.exit(e.stageStatus === 3 ? 3 : 1);
    }
  }

  // ---- final summary -----------------------------------------------------
  const finalProject = cli.loadProject(projectDir);
  const elapsed = (Date.now() - startedAt) / 1000;
  const mm = Math.floor(elapsed / 60), ss = Math.round(elapsed % 60);

  process.stdout.write("\n" + "=".repeat(78) + "\n");
  process.stdout.write("PIPELINE COMPLETE\n");
  process.stdout.write("=".repeat(78) + "\n");
  process.stdout.write(`耗时        : ${mm}分${ss}秒\n`);
  process.stdout.write(`执行阶段    : ${completed.join(" -> ")}\n`);
  if (finalProject.output && fs.existsSync(finalProject.output)) {
    const st = fs.statSync(finalProject.output);
    process.stdout.write(`成片        : ${paths.rel(finalProject.output)}\n`);
    process.stdout.write(`文件大小    : ${(st.size / 1024 / 1024).toFixed(2)} MB\n`);
  }
  process.stdout.write("\n");
  // The two lines below are consumed by callers, so they stay absolute: a
  // relative path would only be valid for the directory this process ran from.
  process.stdout.write(`MV_PATH=${finalProject.output || ""}\n`);
  process.stdout.write(`PROJECT_DIR=${projectDir}\n`);
  process.exit(0);
}

main();
