#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * Volc Wedding - AI Cross-Era Wedding Movie Generator
 * ====================================================
 * Main CLI entry point. Orchestrates the full pipeline:
 *   portraits → scenes → videos → merge
 *
 * Usage:
 *   node volc_wedding.js --male-photo <path> --female-photo <path> --dynasties <ids> [options]
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { DYNASTIES } = require("./dynasties");
const { generatePortraits, generateSceneFrames } = require("./image_pipeline");
const { submitVideoTasks, pollAndDownload } = require("./video_pipeline");
const { mergeVideos } = require("./merge_engine");

// ---- Paths ----
const SKILL_DIR = __dirname;

// ---- Argument parsing ----
function parseArgs(argv) {
  const args = {
    malePhoto: null,
    femalePhoto: null,
    dynasties: null,
    customDesc: "",
    mode: "first-frame",
    videoModel: "doubao-seedance-2-0-260128",
    duration: 8,
    ratio: "16:9",
    resolution: "720p",
    transitionDuration: 1.0,
    addTitle: false,
    addEnding: false,
    addSubtitles: false,
    output: null,
    resume: false,
    regenerate: null,
    apiKey: null,
    workDir: null,
    concurrencyImage: 3,
    concurrencyVideo: 2,
  };

  const map = {
    "--male-photo": "malePhoto",
    "--female-photo": "femalePhoto",
    "--dynasties": "dynasties",
    "--custom-desc": "customDesc",
    "--mode": "mode",
    "--video-model": "videoModel",
    "--duration": "duration",
    "--ratio": "ratio",
    "--resolution": "resolution",
    "--transition-duration": "transitionDuration",
    "--output": "output",
    "--regenerate": "regenerate",
    "--api-key": "apiKey",
    "--work-dir": "workDir",
    "--concurrency-image": "concurrencyImage",
    "--concurrency-video": "concurrencyVideo",
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--add-title") { args.addTitle = true; continue; }
    if (a === "--add-ending") { args.addEnding = true; continue; }
    if (a === "--add-subtitles") { args.addSubtitles = true; continue; }
    if (a === "--resume") { args.resume = true; continue; }
    if (a === "--help" || a === "-h") { printHelp(); process.exit(0); }

    const key = map[a];
    if (!key) {
      console.error("ERROR: unknown argument " + a);
      process.exit(2);
    }
    const val = argv[i + 1];
    if (val === undefined) { console.error("ERROR: missing value for " + a); process.exit(2); }

    if (["duration", "transitionDuration", "concurrencyImage", "concurrencyVideo"].includes(key)) {
      const num = Number(val);
      if (Number.isNaN(num)) { console.error("ERROR: " + a + " must be a number"); process.exit(2); }
      args[key] = num;
    } else {
      args[key] = val;
    }
    i++;
  }

  return args;
}

function printHelp() {
  console.log(
    "Volc Wedding - AI Cross-Era Wedding Movie Generator\n" +
    "====================================================\n\n" +
    "Usage:\n" +
    "  node volc_wedding.js --male-photo <path> --female-photo <path> --dynasties <ids> [options]\n\n" +
    "Required:\n" +
    "  --male-photo <path>       Path to groom's photo\n" +
    "  --female-photo <path>     Path to bride's photo\n" +
    "  --dynasties <ids>         Comma-separated dynasty IDs (2-5)\n" +
    "                            e.g. tang,song,ming,modern\n\n" +
    "Optional:\n" +
    "  --custom-desc <text>      Your personal love story description\n" +
    "  --mode <mode>             Video mode: first-frame | first-last-frame |\n" +
    "                            multimodal | portrait-reference | text2video\n" +
    "                            (default: first-frame)\n" +
    "  --video-model <id>        Seedance model ID\n" +
    "                            (default: doubao-seedance-2-0-260128)\n" +
    "  --duration <s>            Video duration per dynasty, 4-15 (default: 8)\n" +
    "  --ratio <r>               Aspect ratio: 16:9 | 9:16 (default: 16:9)\n" +
    "  --resolution <r>          480p | 720p | 1080p (default: 720p)\n" +
    "  --transition-duration <s> Transition duration in seconds (default: 1.0)\n" +
    "  --add-title               Add title clip at beginning\n" +
    "  --add-ending              Add ending clip at the end\n" +
    "  --add-subtitles           Add dynasty info subtitles to each segment\n" +
    "  --output <path>           Final output MP4 path\n" +
    "  --resume                  Resume from previous state.json\n" +
    "  --regenerate <id>         Regenerate a single dynasty\n" +
    "  --api-key <key>           Ark API key (overrides env)\n" +
    "  --work-dir <dir>          Working directory for temp files\n" +
    "  --concurrency-image <n>   Image generation concurrency (default: 3)\n" +
    "  --concurrency-video <n>   Video task submission concurrency (default: 2)\n" +
    "  --help, -h                Show this help\n\n" +
    "Dynasty IDs:\n" +
    "  xia, xizhou, warring, han, jin, nanbeichao,\n" +
    "  tang, song, yuan, ming, qing, minguo, modern\n\n" +
    "Environment:\n" +
    "  ARK_API_KEY               Volcengine Ark API key\n"
  );
}

// ---- Utilities ----
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function generateSessionId() {
  const now = new Date();
  return now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0") + "-" +
    String(now.getHours()).padStart(2, "0") +
    String(now.getMinutes()).padStart(2, "0") +
    String(now.getSeconds()).padStart(2, "0") + "-" +
    Math.random().toString(36).slice(2, 6);
}

function validateDynastyIds(ids) {
  const validIds = DYNASTIES.map((d) => d.id);
  const selected = ids.split(",").map((s) => s.trim()).filter(Boolean);
  if (selected.length < 2 || selected.length > 5) {
    console.error("ERROR: Please select 2-5 dynasties.");
    process.exit(2);
  }
  const invalid = selected.filter((id) => !validIds.includes(id));
  if (invalid.length > 0) {
    console.error("ERROR: Invalid dynasty IDs: " + invalid.join(", "));
    process.exit(2);
  }
  return selected.map((id) => DYNASTIES.find((d) => d.id === id));
}

// ---- Main Class ----
class VolcWedding {
  constructor(args) {
    this.args = args;
    this.sessionId = generateSessionId();
    this.workDir = args.workDir || path.join(SKILL_DIR, "..", "work", this.sessionId);
    this.portraitsDir = path.join(this.workDir, "portraits");
    this.scenesDir = path.join(this.workDir, "scenes");
    this.videosDir = path.join(this.workDir, "videos");
    this.lastFramesDir = path.join(this.workDir, "last_frames");
    this.tempDir = path.join(this.workDir, "temp");
    this.finalDir = path.join(this.workDir, "final");
    this.statePath = path.join(this.workDir, "state.json");
    this.apiKey = args.apiKey || process.env["ARK_API_KEY"] || process.env["ark-api-key"];

    ensureDir(this.portraitsDir);
    ensureDir(this.scenesDir);
    ensureDir(this.videosDir);
    ensureDir(this.lastFramesDir);
    ensureDir(this.tempDir);
    ensureDir(this.finalDir);

    this.state = this.loadState();
    this.dynasties = validateDynastyIds(args.dynasties);
  }

  loadState() {
    if (this.args.resume && fs.existsSync(this.statePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.statePath, "utf-8"));
        console.log("Resuming from state: " + this.statePath);
        return data;
      } catch (e) {
        console.error("Warning: failed to load state, starting fresh.");
      }
    }
    return { step: "idle", portraits: {}, scenes: {}, videos: {}, errors: {} };
  }

  saveState() {
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
  }

  validateInputs() {
    if (!this.args.malePhoto || !fs.existsSync(this.args.malePhoto)) {
      console.error("ERROR: Male photo not found: " + this.args.malePhoto);
      process.exit(2);
    }
    if (!this.args.femalePhoto || !fs.existsSync(this.args.femalePhoto)) {
      console.error("ERROR: Female photo not found: " + this.args.femalePhoto);
      process.exit(2);
    }
    if (!this.apiKey) {
      console.error("ERROR: API key not found. Set ARK_API_KEY env var or use --api-key.");
      process.exit(2);
    }

    // Validate mode
    const validModes = ["first-frame", "first-last-frame", "multimodal", "portrait-reference", "text2video"];
    if (!validModes.includes(this.args.mode)) {
      console.error("ERROR: Invalid mode: " + this.args.mode);
      console.error("Valid modes: " + validModes.join(", "));
      process.exit(2);
    }

    // Validate duration
    if (this.args.duration < 4 || this.args.duration > 15) {
      console.error("ERROR: Duration must be between 4 and 15 seconds.");
      process.exit(2);
    }

    console.log("\n========================================");
    console.log("  Volc Wedding - AI Wedding Movie");
    console.log("========================================");
    console.log("Session: " + this.sessionId);
    console.log("Dynasties: " + this.dynasties.map((d) => d.name).join(" → "));
    console.log("Mode: " + this.args.mode);
    console.log("Video model: " + this.args.videoModel);
    console.log("Duration: " + this.args.duration + "s");
    console.log("Ratio: " + this.args.ratio);
    console.log("Resolution: " + this.args.resolution);
    console.log("Work dir: " + this.workDir);
    if (this.args.customDesc) {
      console.log("Custom desc: " + this.args.customDesc);
    }
    console.log("========================================\n");
  }

  // ---- Step 1: Generate Portraits ----
  async generatePortraits() {
    if (this.args.mode === "text2video") {
      console.log("Skipping portrait generation (text2video mode).");
      this.state.step = "portraits";
      this.saveState();
      return;
    }

    if (this.state.step !== "idle" && this.state.step !== "portraits" && !this.args.regenerate) {
      console.log("Skipping portrait generation (already done).");
      return;
    }

    await generatePortraits(this.args.malePhoto, this.args.femalePhoto, this.dynasties, this.apiKey, {
      customDesc: this.args.customDesc,
      concurrency: this.args.concurrencyImage,
      portraitsDir: this.portraitsDir,
      state: this.state,
    });

    this.state.step = "portraits";
    this.saveState();
  }

  // ---- Step 2: Generate Scene Frames ----
  async generateScenes() {
    if (this.args.mode === "text2video") {
      console.log("Skipping scene generation (text2video mode).");
      this.state.step = "scenes";
      this.saveState();
      return;
    }

    if (this.state.step !== "portraits" && this.state.step !== "scenes" && !this.args.regenerate) {
      console.log("Skipping scene generation (already done).");
      return;
    }

    await generateSceneFrames(this.dynasties, this.apiKey, {
      customDesc: this.args.customDesc,
      concurrency: this.args.concurrencyImage,
      portraitsDir: this.portraitsDir,
      scenesDir: this.scenesDir,
      state: this.state,
    });

    this.state.step = "scenes";
    this.saveState();
  }

  // ---- Step 3: Submit Video Tasks ----
  async submitVideos() {
    if (this.state.step !== "scenes" && this.state.step !== "videos" && !this.args.regenerate) {
      console.log("Skipping video submission (already done).");
      return;
    }

    await submitVideoTasks(this.dynasties, this.apiKey, {
      mode: this.args.mode,
      videoModel: this.args.videoModel,
      duration: this.args.duration,
      ratio: this.args.ratio,
      resolution: this.args.resolution,
      generateAudio: true,
      returnLastFrame: true,
      customDesc: this.args.customDesc,
      state: this.state,
    });

    this.state.step = "videos";
    this.saveState();
  }

  // ---- Step 4: Poll and Download ----
  async pollVideos() {
    if (this.state.step !== "videos" && this.state.step !== "merged" && !this.args.regenerate) {
      console.log("Skipping video polling (already done).");
      return;
    }

    await pollAndDownload(this.dynasties, this.apiKey, {
      videosDir: this.videosDir,
      lastFramesDir: this.lastFramesDir,
      state: this.state,
    });

    this.saveState();
  }

  // ---- Step 5: Merge ----
  async merge() {
    const allDownloaded = this.dynasties.every((d) =>
      this.state.videos[d.id] && this.state.videos[d.id].status === "downloaded"
    );

    if (!allDownloaded) {
      console.log("\nWARNING: Not all videos are ready. Skipping merge.");
      console.log("Run again with --resume to continue polling.");
      return;
    }

    if (this.state.step === "merged" && !this.args.regenerate) {
      console.log("Skipping merge (already done).");
      console.log("Output: " + this.state.outputPath);
      return this.state.outputPath;
    }

    const outputPath = this.args.output || path.join(this.finalDir, "wedding_movie_" + this.sessionId + ".mp4");

    await mergeVideos(this.dynasties, this.state, {
      transitionDuration: this.args.transitionDuration,
      addTitle: this.args.addTitle,
      addEnding: this.args.addEnding,
      addSubtitles: this.args.addSubtitles,
      outputPath: outputPath,
      tempDir: this.tempDir,
      ratio: this.args.ratio,
      resolution: this.args.resolution,
    });

    this.state.outputPath = outputPath;
    this.state.step = "merged";
    this.saveState();
    return outputPath;
  }

  // ---- Run full pipeline ----
  async run() {
    this.validateInputs();

    try {
      await this.generatePortraits();
      await this.generateScenes();
      await this.submitVideos();
      await this.pollVideos();
      const output = await this.merge();

      if (output) {
        console.log("\n🎬  Wedding movie generated successfully!");
        console.log("   Output: " + output);
      }
    } catch (e) {
      console.error("\nFATAL ERROR: " + e.message);
      console.error(e.stack);
      this.saveState();
      process.exit(1);
    }

    this.saveState();
  }
}

// ---- Entry point ----
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.malePhoto || !args.femalePhoto || !args.dynasties) {
    console.error("ERROR: --male-photo, --female-photo, and --dynasties are required.");
    printHelp();
    process.exit(2);
  }

  const app = new VolcWedding(args);
  await app.run();
}

main().catch((e) => {
  console.error("Unhandled error: " + e.message);
  console.error(e.stack);
  process.exit(1);
});
