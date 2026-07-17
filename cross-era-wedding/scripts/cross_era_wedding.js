#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * Cross-Era Wedding - AI Wedding Movie Generator
 * ================================================
 * Generates a cinematic cross-era wedding movie from two personal photos.
 *
 * Workflow:
 *   1. Generate scene keyframes for each selected dynasty (Agnes t2i)
 *   2. Optional: FaceFusion face swap for 80%+ facial likeness
 *   3. Upload swapped frames to get public URLs (Agnes i2i)
 *   4. Generate videos from keyframes (Agnes image2video)
 *   5. Merge videos with transitions via FFmpeg
 *
 * Dependencies:
 *   - Node.js 12+ (built-in modules only)
 *   - Agnes Image/Video API key (env: agnes-api-key)
 *   - FFmpeg 4.4+ (for xfade transitions)
 *   - Python 3.10+ + FaceFusion (optional, for face swap enhancement)
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");

// ---- FFmpeg path detection ----
// TRAE bundles a minimal ffmpeg that lacks xfade/drawtext/concat-safe.
// We detect the winget-installed full build and prefer it.
const FULL_FFMPEG_CANDIDATES = [
  process.env["FFMPEG_PATH"],
  "C:\\Users\\tianw\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe",
  "C:\\Users\\tianw\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1\\bin\\ffmpeg.exe",
  "C:\\ffmpeg\\bin\\ffmpeg.exe",
];

function findFullFfmpeg() {
  for (const p of FULL_FFMPEG_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  return "ffmpeg"; // fallback to PATH
}

const FFMPEG = findFullFfmpeg();
const FFPROBE = FFMPEG.replace(/ffmpeg\.exe$/i, "ffprobe.exe");

if (FFMPEG !== "ffmpeg") {
  console.log("  Using full FFmpeg: " + FFMPEG);
}

// ---- Font path for Chinese text ----
const FONT_PATH = "C:/Windows/Fonts/simhei.ttf";
const FONT_FILE_NAME = "simhei.ttf";

function fontExists() {
  return fs.existsSync(FONT_PATH);
}

function prepareFont(tempDir) {
  const dest = path.join(tempDir, FONT_FILE_NAME);
  if (fontExists() && !fs.existsSync(dest)) {
    try {
      fs.copyFileSync(FONT_PATH, dest);
    } catch (e) {}
  }
  return fs.existsSync(dest) ? `fontfile=${FONT_FILE_NAME}:` : "";
}

// ---- Paths ----
const SKILL_DIR = __dirname;
const DYNASTIES_JS = path.join(SKILL_DIR, "dynasties.js");
const PARENT_SKILLS_DIR = path.resolve(SKILL_DIR, "..", "..");
const IMAGE_GEN_SCRIPT = path.join(
  PARENT_SKILLS_DIR, "agnes-image-gen-2", "scripts", "agnes_image_gen.js"
);
const VIDEO_GEN_SCRIPT = path.join(
  PARENT_SKILLS_DIR, "agnes-video-gen-2", "scripts", "agnes_video_gen.js"
);

// ---- Argument parsing ----
function parseArgs(argv) {
  const args = {
    malePhoto: null,
    femalePhoto: null,
    dynasties: null,
    transitionDuration: 1.0,
    addTitle: false,
    addEnding: false,
    output: null,
    resume: false,
    regenerate: null,
    noFaceSwap: false,
    faceFusionPath: null,
    apiKey: null,
    workDir: null,
    numFrames: 121,
    frameRate: 24,
    generatePortraits: false,
    useI2IFrames: true,
  };
  const map = {
    "--male-photo": "malePhoto",
    "--female-photo": "femalePhoto",
    "--dynasties": "dynasties",
    "--transition-duration": "transitionDuration",
    "--output": "output",
    "--regenerate": "regenerate",
    "--facefusion-path": "faceFusionPath",
    "--api-key": "apiKey",
    "--work-dir": "workDir",
    "--num-frames": "numFrames",
    "--frame-rate": "frameRate",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--add-title") { args.addTitle = true; continue; }
    if (a === "--add-ending") { args.addEnding = true; continue; }
    if (a === "--resume") { args.resume = true; continue; }
    if (a === "--no-face-swap") { args.noFaceSwap = true; continue; }
    if (a === "--generate-portraits") { args.generatePortraits = true; continue; }
    if (a === "--use-i2i-frames") { args.useI2IFrames = true; continue; }
    const key = map[a];
    if (!key) {
      if (a === "--help" || a === "-h") {
        printHelp();
        process.exit(0);
      }
      console.error("ERROR: unknown argument " + a);
      process.exit(2);
    }
    const val = argv[i + 1];
    if (val === undefined) { console.error("ERROR: missing value for " + a); process.exit(2); }
    if (["transitionDuration", "numFrames", "frameRate"].includes(key)) {
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
    "Cross-Era Wedding Movie Generator\n" +
    "=================================\n\n" +
    "Usage:\n" +
    "  node cross_era_wedding.js --male-photo <path> --female-photo <path> --dynasties <ids> [options]\n\n" +
    "Required:\n" +
    "  --male-photo <path>      Path to groom's photo\n" +
    "  --female-photo <path>    Path to bride's photo\n" +
    "  --dynasties <ids>        Comma-separated dynasty IDs (2-4)\n" +
    "                           e.g. tang,song,ming,modern\n\n" +
    "Optional:\n" +
    "  --transition-duration <s>  Transition duration in seconds (default: 1.0)\n" +
    "  --add-title                Add title clip at beginning\n" +
    "  --add-ending               Add ending clip at the end\n" +
    "  --output <path>            Final output MP4 path\n" +
    "  --resume                   Resume from previous state.json\n" +
    "  --regenerate <id>          Regenerate a single dynasty\n" +
    "  --no-face-swap             Disable FaceFusion face swap (Agnes only)\n" +
    "  --facefusion-path <path>   Path to facefusion/run.py\n" +
    "  --api-key <key>            Agnes API key (overrides env)\n" +
    "  --work-dir <dir>           Working directory for temp files\n" +
    "  --num-frames <n>           Video frames per dynasty (default: 121 = ~5s)\n" +
    "  --frame-rate <n>           Video frame rate (default: 24)\n" +
    "  --generate-portraits       Generate i2i portrait photos for each dynasty\n" +
    "  --use-i2i-frames           Use i2i to generate scene frames from user photos\n" +
    "  --help, -h                 Show this help\n\n" +
    "Dynasty IDs:\n" +
    "  xia, xizhou, warring, han, jin, nanbeichao,\n" +
    "  tang, song, yuan, ming, qing, minguo, modern\n\n" +
    "Environment:\n" +
    "  agnes-api-key              Agnes API key\n" +
    "  FACEFUSION_PATH            Path to facefusion/run.py\n"
  );
}

// ---- Utilities ----
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function execWithRetry(cmd, opts, maxRetries) {
  maxRetries = maxRetries || 3;
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const out = execSync(cmd, Object.assign({ encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 }, opts || {}));
      return out;
    } catch (e) {
      lastErr = e;
      const msg = e.message || String(e);
      if (attempt === maxRetries) break;
      console.error("  Attempt " + attempt + "/" + maxRetries + " failed: " + msg.split("\n")[0]);
      const wait = Math.min(5 * attempt, 15);
      console.error("  Retrying in " + wait + "s...");
      execSync("ping -n " + (wait + 1) + " 127.0.0.1 > nul", { stdio: "ignore" });
    }
  }
  throw lastErr;
}

function execAsync(cmd, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, Object.assign({ shell: true, windowsHide: true }, opts || {}));
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; process.stderr.write(d); });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("Command failed with code " + code + ": " + stderr.slice(0, 500)));
      } else {
        resolve(stdout);
      }
    });
    child.on("error", reject);
  });
}

function downloadFile(url, outPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { headers: { "User-Agent": "Mozilla/5.0", "Connection": "close" }, timeout: 300000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(downloadFile(new URL(res.headers.location, url).href, outPath));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("Download failed, HTTP " + res.statusCode)); }
      const chunks = [];
      let received = 0;
      res.on("data", (chunk) => { chunks.push(chunk); received += chunk.length; });
      res.on("end", () => {
        if (received === 0) return reject(new Error("Downloaded 0 bytes"));
        const buf = Buffer.concat(chunks, received);
        // Remove read-only flag if file exists to allow overwrite
        if (fs.existsSync(outPath)) {
          try { fs.chmodSync(outPath, 0o666); } catch (e) {}
        }
        const fd = fs.openSync(outPath, "w");
        fs.writeSync(fd, buf, 0, received, 0);
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        try { fs.chmodSync(outPath, 0o444); } catch (e) { /* best-effort */ }
        resolve(received);
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("Download timed out")); });
  });
}

function parseImageUrlFromOutput(output) {
  const m = output.match(/IMAGE_URL=(.+)/);
  return m ? m[1].trim() : null;
}

function parseVideoUrlFromOutput(output) {
  const m = output.match(/VIDEO_URL=(.+)/);
  return m ? m[1].trim() : null;
}

function getDuration(videoPath) {
  try {
    const out = execSync(
      `"${FFPROBE}" -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
      { encoding: "utf-8" }
    );
    return parseFloat(out.trim());
  } catch (e) {
    console.error("  Warning: could not get duration for " + videoPath + ", using default 5.0s");
    return 5.0;
  }
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

// ---- Core Class ----
class CrossEraWedding {
  constructor(args) {
    this.args = args;
    this.sessionId = generateSessionId();
    this.workDir = args.workDir || path.join(SKILL_DIR, "..", "work", this.sessionId);
    this.framesDir = path.join(this.workDir, "frames");
    this.swappedDir = path.join(this.workDir, "swapped");
    this.videosDir = path.join(this.workDir, "videos");
    this.tempDir = path.join(this.workDir, "temp");
    this.finalDir = path.join(this.workDir, "final");
    this.portraitsDir = path.join(this.workDir, "portraits");
    this.statePath = path.join(this.workDir, "state.json");
    this.apiKey = args.apiKey || process.env["agnes-api-key"] || process.env["AGNES_API_KEY"];
    this.faceFusionPath = args.faceFusionPath || process.env["FACEFUSION_PATH"] || this.findFaceFusion();

    ensureDir(this.framesDir);
    ensureDir(this.swappedDir);
    ensureDir(this.videosDir);
    ensureDir(this.tempDir);
    ensureDir(this.finalDir);
    ensureDir(this.portraitsDir);

    this.state = this.loadState();
    this.dynasties = this.loadDynasties();
  }

  loadDynasties() {
    if (!fs.existsSync(DYNASTIES_JS)) {
      console.error("ERROR: dynasties.js not found at " + DYNASTIES_JS);
      process.exit(2);
    }
    const mod = require(DYNASTIES_JS);
    const all = mod.DYNASTIES || [];
    const ids = this.args.dynasties.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length < 2 || ids.length > 4) {
      console.error("ERROR: Please select 2-4 dynasties. Got: " + ids.length);
      process.exit(2);
    }
    const selected = [];
    for (const id of ids) {
      const d = all.find((x) => x.id === id);
      if (!d) {
        console.error("ERROR: Unknown dynasty ID: " + id);
        console.error("Valid IDs: " + all.map((x) => x.id).join(", "));
        process.exit(2);
      }
      selected.push(d);
    }
    return selected;
  }

  findFaceFusion() {
    const candidates = [
      path.join(process.env.USERPROFILE || "", "facefusion", "run.py"),
      path.join(process.env.LOCALAPPDATA || "", "facefusion", "run.py"),
      path.join(SKILL_DIR, "..", "..", "..", "..", "facefusion", "run.py"),
      "C:\\facefusion\\run.py",
      "D:\\facefusion\\run.py",
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }

  detectFaceFusion() {
    if (this.args.noFaceSwap) return false;
    if (this.faceFusionPath && fs.existsSync(this.faceFusionPath)) {
      console.log("FaceFusion detected: " + this.faceFusionPath);
      return true;
    }
    console.log("FaceFusion not detected. Face swap enhancement will be skipped.");
    console.log("To enable 80%+ facial likeness, install FaceFusion:");
    console.log("  1. git clone https://github.com/facefusion/facefusion.git");
    console.log("  2. cd facefusion && python install.py --onnxruntime cpu");
    console.log("  3. Set env FACEFUSION_PATH or use --facefusion-path");
    return false;
  }

  // ---- State Management ----
  loadState() {
    if (this.args.resume && fs.existsSync(this.statePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.statePath, "utf-8"));
        console.log("Resuming from state: step=" + (data.step || "none"));
        // Ensure required fields exist
        data.frames = data.frames || {};
        data.swappedFrames = data.swappedFrames || {};
        data.uploadedFrames = data.uploadedFrames || {};
        data.videos = data.videos || {};
        return data;
      } catch (e) {
        console.error("Warning: failed to load state, starting fresh");
      }
    }
    if (this.args.regenerate) {
      console.error("ERROR: --regenerate requires an existing state. Run without --resume first, or use --resume.");
      process.exit(2);
    }
    return {
      sessionId: this.sessionId,
      step: null,
      frames: {},
      swappedFrames: {},
      uploadedFrames: {},
      videos: {},
      outputPath: null,
    };
  }

  saveState() {
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
  }

  // ---- Step 1: Generate Scene Frames ----
  async generatePortraits() {
    if (!this.args.generatePortraits) return;
    console.log("\n=== Generating i2i portraits for each dynasty ===");
    for (const d of this.dynasties) {
      const maleOut = path.join(this.portraitsDir, d.id + "_male.jpg");
      const femaleOut = path.join(this.portraitsDir, d.id + "_female.jpg");
      const apiKeyArg = this.apiKey ? " --api-key " + this.apiKey : "";
      const malePrompt = d.portraitPromptMale || d.imagePromptTemplate;
      const femalePrompt = d.portraitPromptFemale || d.imagePromptTemplate;

      console.log("  [" + d.name + "] Generating male portrait...");
      const maleCmd = `node "${IMAGE_GEN_SCRIPT}" --mode i2i --image "${this.args.malePhoto}" --prompt "${malePrompt}" --size 768x1152 --output "${maleOut}"${apiKeyArg}`;
      try {
        const out = execWithRetry(maleCmd, { stdio: ["ignore", "pipe", "pipe"] });
        const url = parseImageUrlFromOutput(out);
        console.log("  [" + d.name + "] Male portrait saved: " + maleOut);
        if (url) console.log("  [" + d.name + "] URL: " + url);
      } catch (e) {
        console.error("  [" + d.name + "] Male portrait failed: " + e.message.split("\n")[0]);
      }

      console.log("  [" + d.name + "] Generating female portrait...");
      const femaleCmd = `node "${IMAGE_GEN_SCRIPT}" --mode i2i --image "${this.args.femalePhoto}" --prompt "${femalePrompt}" --size 768x1152 --output "${femaleOut}"${apiKeyArg}`;
      try {
        const out = execWithRetry(femaleCmd, { stdio: ["ignore", "pipe", "pipe"] });
        const url = parseImageUrlFromOutput(out);
        console.log("  [" + d.name + "] Female portrait saved: " + femaleOut);
        if (url) console.log("  [" + d.name + "] URL: " + url);
      } catch (e) {
        console.error("  [" + d.name + "] Female portrait failed: " + e.message.split("\n")[0]);
      }
    }
    console.log("=== Portraits generation complete ===");
  }

  async generateFrames() {
    const allDone = this.dynasties.every(d => this.state.frames && this.state.frames[d.id]);
    if (allDone && !this.args.regenerate) {
      console.log("Skipping frame generation (all frames already exist).");
      return;
    }
    console.log("\n=== Step 1: Generating scene frames for " + this.dynasties.length + " dynasties ===");

    for (const d of this.dynasties) {
      if (this.state.frames[d.id] && !this.args.regenerate) {
        console.log("  [" + d.name + "] Frame already exists, skipping.");
        continue;
      }
      if (this.args.regenerate && this.args.regenerate !== d.id) {
        continue;
      }

      console.log("  [" + d.name + "] Generating scene frame...");
      const outPath = path.join(this.framesDir, d.id + "_scene.jpg");
      const prompt = d.imagePromptTemplate;
      const size = "1152x768";
      const apiKeyArg = this.apiKey ? " --api-key " + this.apiKey : "";

      let cmd;
      if (this.args.useI2IFrames) {
        // Use male photo as reference for i2i, prompt describes the couple scene
        cmd = `node "${IMAGE_GEN_SCRIPT}" --mode i2i --image "${this.args.malePhoto}" --prompt "${prompt}" --size ${size} --output "${outPath}"${apiKeyArg}`;
      } else {
        cmd = `node "${IMAGE_GEN_SCRIPT}" --mode t2i --prompt "${prompt}" --size ${size} --output "${outPath}"${apiKeyArg}`;
      }
      let output;
      try {
        output = execWithRetry(cmd, { stdio: ["ignore", "pipe", "pipe"] });
      } catch (e) {
        console.error("  [" + d.name + "] Frame generation failed: " + e.message.split("\n")[0]);
        continue;
      }

      const imageUrl = parseImageUrlFromOutput(output);
      this.state.frames[d.id] = { localPath: outPath, url: imageUrl };
      this.state.step = "frames";
      this.saveState();
      console.log("  [" + d.name + "] Frame saved: " + outPath);
      if (imageUrl) console.log("  [" + d.name + "] Image URL: " + imageUrl);
    }

    if (this.args.regenerate) {
      delete this.state.swappedFrames[this.args.regenerate];
      delete this.state.uploadedFrames[this.args.regenerate];
      delete this.state.videos[this.args.regenerate];
      this.saveState();
    }
  }

  // ---- Step 2: Face Swap Enhancement ----
  async swapFaces() {
    const hasFF = this.detectFaceFusion();
    if (!hasFF || this.args.noFaceSwap) {
      console.log("\n=== Step 2: Face swap skipped ===");
      // Use original frames as swapped frames
      for (const d of this.dynasties) {
        if (this.state.frames[d.id]) {
          this.state.swappedFrames[d.id] = this.state.frames[d.id];
        }
      }
      this.state.step = "swapped";
      this.saveState();
      return;
    }

    if (this.state.step && this.state.step !== "frames" && this.state.step !== "swapped" && !this.args.regenerate) {
      console.log("Skipping face swap (already done).");
      return;
    }

    console.log("\n=== Step 2: FaceFusion enhancement ===");
    for (const d of this.dynasties) {
      if (this.state.swappedFrames[d.id] && !this.args.regenerate) {
        console.log("  [" + d.name + "] Swapped frame already exists, skipping.");
        continue;
      }
      if (this.args.regenerate && this.args.regenerate !== d.id) continue;

      const frameInfo = this.state.frames[d.id];
      if (!frameInfo || !fs.existsSync(frameInfo.localPath)) {
        console.error("  [" + d.name + "] Original frame not found, skipping swap.");
        continue;
      }

      const swappedMale = path.join(this.swappedDir, d.id + "_male_swapped.jpg");
      const swappedFinal = path.join(this.swappedDir, d.id + "_final.jpg");

      // Male face swap
      console.log("  [" + d.name + "] Swapping male face...");
      const maleCmd = `python "${this.faceFusionPath}" -s "${this.args.malePhoto}" -t "${frameInfo.localPath}" -o "${swappedMale}" --headless`;
      try {
        execSync(maleCmd, { encoding: "utf-8", stdio: "ignore" });
      } catch (e) {
        console.error("  [" + d.name + "] Male face swap failed: " + e.message.split("\n")[0]);
        this.state.swappedFrames[d.id] = frameInfo;
        continue;
      }

      // Female face swap
      console.log("  [" + d.name + "] Swapping female face...");
      const femaleCmd = `python "${this.faceFusionPath}" -s "${this.args.femalePhoto}" -t "${swappedMale}" -o "${swappedFinal}" --headless`;
      try {
        execSync(femaleCmd, { encoding: "utf-8", stdio: "ignore" });
      } catch (e) {
        console.error("  [" + d.name + "] Female face swap failed: " + e.message.split("\n")[0]);
        this.state.swappedFrames[d.id] = { localPath: swappedMale };
        continue;
      }

      this.state.swappedFrames[d.id] = { localPath: swappedFinal };
      this.state.step = "swapped";
      this.saveState();
      console.log("  [" + d.name + "] Face swap complete: " + swappedFinal);
    }
  }

  // ---- Step 3: Upload swapped frames to get public URLs ----
  async uploadFrames() {
    if (this.state.step && this.state.step !== "swapped" && this.state.step !== "uploaded" && !this.args.regenerate) {
      console.log("\n=== Step 3: Uploading frames (skipping, already done) ===");
      return;
    }

    console.log("\n=== Step 3: Uploading frames to get public URLs ===");
    for (const d of this.dynasties) {
      if (this.state.uploadedFrames[d.id] && !this.args.regenerate) {
        console.log("  [" + d.name + "] Frame already uploaded, skipping.");
        continue;
      }
      if (this.args.regenerate && this.args.regenerate !== d.id) continue;

      const swappedInfo = this.state.swappedFrames[d.id];
      if (!swappedInfo || !fs.existsSync(swappedInfo.localPath)) {
        console.error("  [" + d.name + "] Swapped frame not found, skipping upload.");
        continue;
      }

      // If the frame already has a valid URL from Agnes (no-swap mode), reuse it directly
      if (swappedInfo.url && this.args.noFaceSwap) {
        this.state.uploadedFrames[d.id] = swappedInfo;
        this.state.step = "uploaded";
        this.saveState();
        continue;
      }

      // If FaceSwap was used, need to re-upload the modified local file
      if (swappedInfo.url && !this.args.noFaceSwap) {
        // Fall through to re-upload
      }

      console.log("  [" + d.name + "] Uploading frame via Agnes i2i...");
      const outPath = path.join(this.tempDir, d.id + "_uploaded.jpg");
      const prompt = "Preserve the original image exactly, same composition, same lighting, same every detail, photorealistic";
      const apiKeyArg = this.apiKey ? " --api-key " + this.apiKey : "";

      const cmd = `node "${IMAGE_GEN_SCRIPT}" --mode i2i --image "${swappedInfo.localPath}" --prompt "${prompt}" --size 1152x768 --output "${outPath}"${apiKeyArg}`;
      let output;
      try {
        output = execWithRetry(cmd, { stdio: ["ignore", "pipe", "pipe"] });
      } catch (e) {
        console.error("  [" + d.name + "] Upload failed: " + e.message.split("\n")[0]);
        continue;
      }

      const imageUrl = parseImageUrlFromOutput(output);
      if (!imageUrl) {
        console.error("  [" + d.name + "] No IMAGE_URL returned from upload.");
        continue;
      }

      this.state.uploadedFrames[d.id] = { localPath: outPath, url: imageUrl };
      this.state.step = "uploaded";
      this.saveState();
      console.log("  [" + d.name + "] Uploaded URL: " + imageUrl);
    }
  }

  // ---- Step 4: Generate Videos ----
  async generateVideos() {
    if (this.state.step === "merged" || (this.state.videos && Object.keys(this.state.videos).length >= this.dynasties.length)) {
      console.log("Skipping video generation (all videos already exist).");
      return;
    }

    console.log("\n=== Step 4: Generating videos ===");

    // Ensure videos object exists
    if (!this.state.videos) this.state.videos = {};

    // Collect pending dynasties
    const pending = [];
    for (const d of this.dynasties) {
      if (this.state.videos[d.id] && !this.args.regenerate) {
        console.log("  [" + d.name + "] Video already exists, skipping.");
        continue;
      }
      if (this.args.regenerate && this.args.regenerate !== d.id) continue;

      const uploaded = this.state.uploadedFrames[d.id];
      if (!uploaded || !uploaded.url) {
        console.error("  [" + d.name + "] No uploaded frame URL, skipping video.");
        continue;
      }
      pending.push(d);
    }

    // Process in batches of 2 to avoid API rate limits
    const CONCURRENCY = 2;
    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      const batch = pending.slice(i, i + CONCURRENCY);
      console.log("  Processing batch " + (Math.floor(i / CONCURRENCY) + 1) + "/" + Math.ceil(pending.length / CONCURRENCY));

      const promises = batch.map((d) => this.createVideoTask(d));
      const results = await Promise.all(promises);

      for (let j = 0; j < batch.length; j++) {
        const d = batch[j];
        const result = results[j];
        if (result && result.videoPath) {
          this.state.videos[d.id] = result.videoPath;
          this.state.step = "videos";
          this.saveState();
          console.log("  [" + d.name + "] Video saved: " + result.videoPath);
        } else {
          console.error("  [" + d.name + "] Video generation failed.");
        }
      }
    }
  }

  async createVideoTask(dynasty) {
    const uploaded = this.state.uploadedFrames[dynasty.id];
    const outPath = path.join(this.videosDir, dynasty.id + ".mp4");
    const apiKeyArg = this.apiKey ? " --api-key " + this.apiKey : "";

    // Step 4a: Create task + poll with --url-only
    const cmd = `node "${VIDEO_GEN_SCRIPT}" --workflow image2video --image "${uploaded.url}" --prompt "${dynasty.videoPromptTemplate}" --width 1152 --height 768 --num-frames ${this.args.numFrames} --frame-rate ${this.args.frameRate} --url-only${apiKeyArg}`;

    let output;
    try {
      output = execSync(cmd, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 50 * 1024 * 1024 });
    } catch (e) {
      console.error("  [" + dynasty.name + "] Video task failed: " + e.message.split("\n")[0]);
      return null;
    }

    const videoUrl = parseVideoUrlFromOutput(output);
    if (!videoUrl) {
      console.error("  [" + dynasty.name + "] No VIDEO_URL returned.");
      return null;
    }
    console.log("  [" + dynasty.name + "] Video URL: " + videoUrl);

    // Step 4b: Download video file (short command for persistence)
    console.log("  [" + dynasty.name + "] Downloading video...");
    try {
      await downloadFile(videoUrl, outPath);
    } catch (e) {
      console.error("  [" + dynasty.name + "] Download failed: " + e.message);
      return null;
    }

    const size = fs.statSync(outPath).size;
    if (size === 0) {
      console.error("  [" + dynasty.name + "] Downloaded file is 0 bytes.");
      return null;
    }
    console.log("  [" + dynasty.name + "] Downloaded: " + size + " bytes");
    return { videoPath: outPath };
  }

  // ---- Step 5: Build Dynasty Title Card ----
  buildDynastyCard(dynasty) {
    const cardPath = path.join(this.tempDir, dynasty.id + "_card.mp4");
    const name = dynasty.name;
    const summary = dynasty.storySummary || "";
    const fontOpt = prepareFont(this.tempDir);

    const cmd =
      `"${FFMPEG}" -f lavfi -i color=c=black:s=1152x768:d=2.5 -vf "` +
      `fade=t=in:st=0:d=0.3,` +
      `drawtext=${fontOpt}text='${name}':fontsize=52:fontcolor=gold:x=(w-text_w)/2:y=(h-text_h)/2-25:enable='between(t,0.3,2.2)',` +
      `drawtext=${fontOpt}text='${summary}':fontsize=26:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2+35:enable='between(t,0.5,2.2)',` +
      `fade=t=out:st=2.2:d=0.3" ` +
      `-c:v libx264 -preset fast -crf 23 -an -y "${cardPath}"`;

    try {
      execSync(cmd, { encoding: "utf-8", stdio: "ignore", cwd: this.tempDir });
      return cardPath;
    } catch (e) {
      console.error("  Warning: dynasty card generation failed for " + dynasty.name + ": " + e.message.split("\n")[0]);
      return null;
    }
  }

  // ---- Step 5: Build Title Clip ----
  buildTitleClip() {
    if (!this.args.addTitle) return null;
    const titlePath = path.join(this.tempDir, "title.mp4");
    const titleText = "几生几世 跨时空相爱";
    const subText = "Cross-Era Wedding";
    const eraList = this.dynasties.map((d) => d.name).join(" → ");
    const fontOpt = prepareFont(this.tempDir);

    const cmd =
      `"${FFMPEG}" -f lavfi -i color=c=black:s=1152x768:d=4 -vf "` +
      `fade=t=in:st=0:d=0.5,` +
      `drawtext=${fontOpt}text='${titleText}':fontsize=42:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-50:enable='between(t,0.5,4)',` +
      `drawtext=${fontOpt}text='${subText}':fontsize=22:fontcolor=gray:x=(w-text_w)/2:y=(h-text_h)/2+10:enable='between(t,0.5,4)',` +
      `drawtext=${fontOpt}text='${eraList}':fontsize=18:fontcolor=gold:x=(w-text_w)/2:y=(h-text_h)/2+55:enable='between(t,1,4)',` +
      `fade=t=out:st=3.5:d=0.5" ` +
      `-c:v libx264 -preset fast -crf 23 -an -y "${titlePath}"`;
    try {
      execSync(cmd, { encoding: "utf-8", stdio: "ignore", cwd: this.tempDir });
      return titlePath;
    } catch (e) {
      console.error("Warning: title clip generation failed: " + e.message.split("\n")[0]);
      return null;
    }
  }

  // ---- Step 5: Build Ending Clip ----
  buildEndingClip() {
    if (!this.args.addEnding) return null;
    const endingPath = path.join(this.tempDir, "ending.mp4");
    const titleText = "今生今世 永不分离";
    const subText = "Forever and Always";
    const fontOpt = prepareFont(this.tempDir);

    const cmd =
      `"${FFMPEG}" -f lavfi -i color=c=black:s=1152x768:d=5 -vf "` +
      `fade=t=in:st=0:d=1,` +
      `drawtext=${fontOpt}text='${titleText}':fontsize=42:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-30:enable='between(t,1,5)',` +
      `drawtext=${fontOpt}text='${subText}':fontsize=22:fontcolor=gray:x=(w-text_w)/2:y=(h-text_h)/2+30:enable='between(t,1,5)',` +
      `fade=t=out:st=4.5:d=0.5" ` +
      `-c:v libx264 -preset fast -crf 23 -an -y "${endingPath}"`;
    try {
      execSync(cmd, { encoding: "utf-8", stdio: "ignore", cwd: this.tempDir });
      return endingPath;
    } catch (e) {
      console.error("Warning: ending clip generation failed: " + e.message.split("\n")[0]);
      return null;
    }
  }

  // ---- Step 5: Merge Videos with FFmpeg ----
  async mergeWithFFmpeg() {
    if (this.state.step === "merged" && !this.args.regenerate) {
      console.log("Skipping merge (already done).");
      return this.state.outputPath;
    }

    console.log("\n=== Step 5: Merging videos with xfade transitions ===");

    // Collect video files in dynasty order
    const videoFiles = [];
    for (const d of this.dynasties) {
      const v = this.state.videos[d.id];
      if (v && fs.existsSync(v)) {
        videoFiles.push(v);
      }
    }
    if (videoFiles.length === 0) {
      console.error("ERROR: No videos to merge.");
      process.exit(1);
    }

    // Build dynasty title cards (inserted before each video)
    console.log("  Generating dynasty title cards...");
    const cardInputs = [];
    for (const d of this.dynasties) {
      const v = this.state.videos[d.id];
      if (v && fs.existsSync(v)) {
        const card = this.buildDynastyCard(d);
        if (card) {
          cardInputs.push(card);
        }
        cardInputs.push(v);
      }
    }

    // Build title and ending clips
    const titleClip = this.buildTitleClip();
    const endingClip = this.buildEndingClip();
    const allInputs = [];
    if (titleClip) allInputs.push(titleClip);
    allInputs.push(...cardInputs);
    if (endingClip) allInputs.push(endingClip);

    const outPath = this.args.output || path.join(this.finalDir, "wedding_movie_" + this.sessionId + ".mp4");

    // Use xfade for smooth cross-dissolve transitions
    console.log("  Using xfade cross-dissolve transitions.");
    await this.mergeWithXfade(allInputs, outPath);

    this.state.outputPath = outPath;
    this.state.step = "merged";
    this.saveState();
    console.log("\n=== Wedding movie complete ===");
    console.log("Output: " + outPath);
    return outPath;
  }

  async mergeWithXfade(inputs, outPath) {
    const td = this.args.transitionDuration; // default 1.0s

    // Phase 1: Pre-process each input — normalize to 1152x768 + fps=25 (for xfade compatibility)
    console.log("  Pre-processing segments (normalize resolution + fps)...");
    const normalizedInputs = [];
    for (let i = 0; i < inputs.length; i++) {
      const inputPath = inputs[i];
      const fileName = path.basename(inputPath, path.extname(inputPath));
      const normPath = path.join(this.tempDir, fileName + "_norm.mp4");

      // Build ffmpeg command: scale+pad to 1152x768, fps=25
      const scaleFilter = "scale=1152:768:force_original_aspect_ratio=decrease,pad=1152:768:(ow-iw)/2:(oh-ih)/2:black,fps=25";
      const cmd =
        `"${FFMPEG}" -i "${inputPath}" -vf "${scaleFilter}" ` +
        `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -an -y "${normPath}"`;

      try {
        execSync(cmd, { encoding: "utf-8", stdio: "ignore" });
        normalizedInputs.push(normPath);
      } catch (e) {
        console.error("  Warning: normalize failed for " + fileName + ", skipping.");
      }
    }

    if (normalizedInputs.length < 2) {
      console.error("ERROR: Not enough normalized segments for xfade merge.");
      process.exit(1);
    }

    // Phase 2: Pairwise xfade merge — chain two segments at a time
    console.log("  Applying xfade cross-dissolve transitions (duration=" + td + "s)...");
    let current = normalizedInputs[0];

    for (let i = 1; i < normalizedInputs.length; i++) {
      const next = normalizedInputs[i];
      const mergedPath = path.join(this.tempDir, "xfade_" + i + ".mp4");
      const curDuration = getDuration(current);
      // xfade offset = current_duration - transition_duration (leave 0.04s margin)
      const offset = Math.max(0, curDuration - td - 0.04);

      const cmd =
        `"${FFMPEG}" -i "${current}" -i "${next}" ` +
        `-filter_complex "[0:v][1:v]xfade=transition=fade:duration=${td}:offset=${offset.toFixed(3)}[v]" ` +
        `-map "[v]" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -an -y "${mergedPath}"`;

      try {
        execSync(cmd, { encoding: "utf-8", stdio: "ignore" });
        current = mergedPath;
      } catch (e) {
        console.error("  Warning: xfade merge failed at step " + i + ": " + e.message.split("\n")[0]);
        console.log("  Falling back to concat demuxer for remaining segments...");
        await this.mergeWithConcat([current, next, ...normalizedInputs.slice(i + 1)], outPath);
        return;
      }
    }

    // Copy final result to outPath
    if (current !== outPath) {
      const cmd = `"${FFMPEG}" -i "${current}" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -an -movflags +faststart -y "${outPath}"`;
      try {
        execSync(cmd, { encoding: "utf-8", stdio: "ignore" });
      } catch (e) {
        console.error("  Warning: final copy failed: " + e.message.split("\n")[0]);
        // Try direct file copy as fallback
        try { fs.copyFileSync(current, outPath); } catch (e2) {}
      }
    }
  }

  async mergeWithConcat(inputs, outPath) {
    // Pre-process each segment: trim long videos to 4s + apply short fades
    console.log("  Pre-processing segments (trim to 4s + 0.3s fades)...");
    const processedInputs = [];
    for (let i = 0; i < inputs.length; i++) {
      const inputPath = inputs[i];
      const fileName = path.basename(inputPath, path.extname(inputPath));
      const procPath = path.join(this.tempDir, fileName + "_proc.mp4");

      const duration = getDuration(inputPath);
      // Videos are ~5s, cards/title/ending are 2-5s
      const isLongVideo = duration >= 4.5;
      const targetDuration = isLongVideo ? 4.0 : duration;
      const fadeInDur = 0.3;
      const fadeOutDur = 0.3;
      const fadeOutStart = Math.max(0, targetDuration - fadeOutDur);

      // Skip processing for very short clips (< 1.0s)
      if (duration < 1.0) {
        processedInputs.push(inputPath);
        continue;
      }

      let procCmd;
      if (isLongVideo) {
        // Long video: trim to first 4 seconds (avoid face distortion in latter part) + fade
        procCmd =
          `"${FFMPEG}" -i "${inputPath}" -t ${targetDuration} -vf "` +
          `fade=t=in:st=0:d=${fadeInDur},` +
          `fade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOutDur}" ` +
          `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -an -y "${procPath}"`;
      } else {
        // Short clip (cards, title, ending): just apply fades
        procCmd =
          `"${FFMPEG}" -i "${inputPath}" -vf "` +
          `fade=t=in:st=0:d=${fadeInDur},` +
          `fade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOutDur}" ` +
          `-c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -an -y "${procPath}"`;
      }

      try {
        execSync(procCmd, { encoding: "utf-8", stdio: "ignore" });
        processedInputs.push(procPath);
      } catch (e) {
        console.error("  Warning: pre-process failed for " + fileName + ", using original.");
        processedInputs.push(inputPath);
      }
    }

    const listPath = path.join(this.tempDir, "concat_list.txt");
    const lines = processedInputs.map((v) => `file '${v.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n");
    fs.writeFileSync(listPath, lines);

    // Use re-encode to ensure consistent codec parameters across segments
    const cmd = `"${FFMPEG}" -f concat -safe 0 -i "${listPath}" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -an -movflags +faststart -y "${outPath}"`;
    try {
      execSync(cmd, { encoding: "utf-8", stdio: "inherit" });
    } catch (e) {
      console.error("FFmpeg concat merge failed: " + e.message.split("\n")[0]);
      process.exit(1);
    }
  }

  // ---- Run full pipeline ----
  async run() {
    console.log("Cross-Era Wedding Movie Generator");
    console.log("=================================");
    console.log("Session: " + this.sessionId);
    console.log("Dynasties: " + this.dynasties.map((d) => d.name).join(", "));
    console.log("Work dir: " + this.workDir);
    console.log("Face swap: " + (this.args.noFaceSwap ? "disabled" : (this.detectFaceFusion() ? "enabled" : "unavailable")));

    await this.generatePortraits();
    await this.generateFrames();
    await this.swapFaces();
    await this.uploadFrames();
    await this.generateVideos();
    const output = await this.mergeWithFFmpeg();

    console.log("\nAll done! Your wedding movie:");
    console.log("  " + output);
    return output;
  }
}

// ---- CLI Entry ----
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.malePhoto && !args.femalePhoto && !args.dynasties && !args.resume) {
    console.error("ERROR: --male-photo, --female-photo, and --dynasties are required.");
    console.error("Run with --help for usage.");
    process.exit(2);
  }

  // When resuming, dynasties is required but photos can be omitted (only needed for regeneration)
  if (args.resume && !args.dynasties) {
    console.error("ERROR: --dynasties is required even with --resume.");
    process.exit(2);
  }
  if (args.resume && !args.workDir) {
    console.error("ERROR: --work-dir is required with --resume.");
    process.exit(2);
  }
  if (args.regenerate && (!args.malePhoto || !args.femalePhoto)) {
    console.error("ERROR: --male-photo and --female-photo are required with --regenerate.");
    process.exit(2);
  }
  if (!args.resume && (!args.malePhoto || !args.femalePhoto || !args.dynasties)) {
    console.error("ERROR: --male-photo, --female-photo, and --dynasties are required.");
    console.error("Run with --help for usage.");
    process.exit(2);
  }

  if (!args.resume) {
    if (!fs.existsSync(args.malePhoto)) {
      console.error("ERROR: Male photo not found: " + args.malePhoto);
      process.exit(2);
    }
    if (!fs.existsSync(args.femalePhoto)) {
      console.error("ERROR: Female photo not found: " + args.femalePhoto);
      process.exit(2);
    }
  }

  // Validate num_frames follows 8n+1
  const nf = args.numFrames;
  if (nf < 1 || nf > 441 || (nf - 1) % 8 !== 0) {
    console.error("ERROR: num-frames must be in [1,441] and follow 8n+1 rule (e.g. 121, 169, 193, 241). Got: " + nf);
    process.exit(2);
  }

  const skill = new CrossEraWedding(args);
  try {
    await skill.run();
    process.exit(0);
  } catch (e) {
    console.error("\nFatal error: " + (e && e.message ? e.message : e));
    process.exit(1);
  }
}

main();
