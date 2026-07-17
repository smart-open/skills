#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * Agnes Video V2.0 - Video Generation Helper (Node.js)
 * =====================================================
 * Supports four workflows:
 *   - text2video   : generate a video from a text prompt.
 *   - image2video  : animate a single image.
 *   - multi2video  : generate a video guided by multiple images.
 *   - keyframes    : generate a smooth transition animation between keyframe images.
 *
 * Flow: create task (POST /v1/videos) -> poll result (GET /agnesapi?video_id=)
 *       -> download the finished MP4 to a local file.
 *
 * API key resolution order:
 *   1. --api-key argument
 *   2. environment variable 'agnes-api-key'
 *   3. environment variable 'AGNES_API_KEY'
 *
 * Defaults (optimized): 121 frames @ 24fps (~5s), 16:9 720p, cinematic quality
 * modifiers auto-appended unless --no-enhance is passed.
 *
 * Only depends on Node.js built-in modules (https, http, fs, path). No npm install.
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const API_HOST = "apihub.agnes-ai.com";
const CREATE_PATH = "/v1/videos";
const MODEL = "agnes-video-v2.0";

// Cinematic quality suffix appended to the prompt (text2video & image2video).
const CINEMATIC_SUFFIX =
  ", cinematic, ultra-detailed, high dynamic range, smooth natural motion, " +
  "professional color grading, 8K quality, masterpiece";

// ---- Argument parsing (no external deps) ----
function parseArgs(argv) {
  const args = {
    prompt: null,
    workflow: "text2video",
    image: null,
    audio: null,            // audio URL or local file path for lip sync
    width: 1152,
    height: 768,
    numFrames: 121,
    frameRate: 24,
    numInferenceSteps: null,
    seed: null,
    negativePrompt: null,
    output: null,
    apiKey: null,
    noEnhance: false,
    urlOnly: false,        // only create+poll, output VIDEO_URL, skip download
    pollInterval: 10,      // seconds between status polls
    maxWait: 1200,         // seconds max to wait for completion (20 min)
  };
  const map = {
    "--prompt": "prompt", "-p": "prompt",
    "--workflow": "workflow", "-w": "workflow",
    "--image": "image", "-i": "image",
    "--audio": "audio",
    "--width": "width",
    "--height": "height",
    "--num-frames": "numFrames", "-n": "numFrames",
    "--frame-rate": "frameRate",
    "--steps": "numInferenceSteps",
    "--seed": "seed",
    "--negative-prompt": "negativePrompt",
    "--output": "output", "-o": "output",
    "--api-key": "apiKey",
    "--poll-interval": "pollInterval",
    "--max-wait": "maxWait",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-enhance") { args.noEnhance = true; continue; }
    if (a === "--url-only") { args.urlOnly = true; continue; }
    const key = map[a];
    if (!key) { console.error("ERROR: unknown argument " + a); process.exit(2); }
    const val = argv[i + 1];
    if (val === undefined) { console.error("ERROR: missing value for " + a); process.exit(2); }
    if (key === "image") {
      args.image = args.image ? args.image.concat([val]) : [val];
    } else if (["width", "height", "numFrames", "frameRate", "numInferenceSteps", "seed", "pollInterval", "maxWait"].includes(key)) {
      const num = Number(val);
      if (Number.isNaN(num)) { console.error("ERROR: " + a + " must be a number, got " + val); process.exit(2); }
      args[key] = num;
    } else {
      args[key] = val;
    }
    i++;
  }
  return args;
}

function getApiKey(argsKey) {
  const key = argsKey || process.env["agnes-api-key"] || process.env["AGNES_API_KEY"];
  if (!key) {
    console.error(
      "ERROR: API key not found.\n" +
      "  - Pass it via --api-key, OR\n" +
      "  - Set environment variable 'agnes-api-key' (or AGNES_API_KEY)."
    );
    process.exit(2);
  }
  return key;
}

// Validate num_frames follows the 8n + 1 rule and is <= 441.
function validateNumFrames(n) {
  if (!Number.isInteger(n) || n < 1 || n > 441) {
    console.error("ERROR: num_frames must be an integer in [1, 441], got " + n);
    process.exit(2);
  }
  if ((n - 1) % 8 !== 0) {
    console.error(
      "ERROR: num_frames must follow the 8n + 1 rule (e.g. 1,9,17,...,121,241,441). Got " + n +
      ". Nearest valid: " + nearestValidFrames(n)
    );
    process.exit(2);
  }
}

function nearestValidFrames(n) {
  const lo = Math.floor((n - 1) / 8) * 8 + 1;
  const hi = lo + 8;
  return lo + " / " + (hi > 441 ? 441 : hi);
}

// Resolve image inputs: local files -> public URLs are required by the API.
// The Agnes video API only accepts public image URLs; local files must be
// uploaded by the caller beforehand. We validate and forward.
function resolveImageInputs(images, workflow) {
  if (!images || !images.length) {
    console.error("ERROR: --image is required for " + workflow + " workflow");
    process.exit(2);
  }
  return images.map((img) => {
    if (!/^https?:\/\//i.test(img)) {
      console.error(
        "ERROR: the Agnes video API only accepts public image URLs.\n" +
        "  Local file not supported directly: " + img + "\n" +
        "  Please upload the image to a public HTTPS URL first (or use the agnes-image-gen-2\n" +
        "  skill / any public image host) and pass the URL."
      );
      process.exit(2);
    }
    return img;
  });
}

// Resolve audio input: local file -> base64 data URI, or pass URL directly.
// Seedance 2.0 supports audio-driven lip sync via audio reference input.
function resolveAudioInput(audioPath) {
  if (!audioPath) return null;

  // If it's already a URL, return as-is
  if (/^https?:\/\//i.test(audioPath)) {
    return audioPath;
  }

  // Local file: read and base64-encode
  if (!fs.existsSync(audioPath)) {
    console.error("ERROR: audio file not found: " + audioPath);
    process.exit(2);
  }

  const audioBuffer = fs.readFileSync(audioPath);
  const audioB64 = audioBuffer.toString("base64");
  const ext = path.extname(audioPath).toLowerCase();
  const mimeType = ext === ".wav" ? "audio/wav" : "audio/mpeg";

  process.stderr.write("Audio loaded: " + audioPath + " (" + audioBuffer.length + " bytes, base64 " + audioB64.length + " chars)\n");
  return "data:" + mimeType + ";base64," + audioB64;
}

// Build the create-task payload according to the workflow.
function buildPayload(args) {
  let prompt = args.prompt;
  if (!args.noEnhance && args.workflow !== "keyframes") {
    prompt = prompt.replace(/\s+$/, "") + CINEMATIC_SUFFIX;
  }

  const payload = {
    model: MODEL,
    prompt: prompt,
  };
  // Resolution / timing params (API standardizes them to 480p/720p/1080p).
  payload.width = args.width;
  payload.height = args.height;
  payload.num_frames = args.numFrames;
  payload.frame_rate = args.frameRate;
  if (args.numInferenceSteps) payload.num_inference_steps = args.numInferenceSteps;
  if (args.seed !== null) payload.seed = args.seed;
  if (args.negativePrompt) payload.negative_prompt = args.negativePrompt;

  if (args.workflow === "text2video") {
    // pure text, nothing extra
  } else if (args.workflow === "image2video") {
    const imgs = resolveImageInputs(args.image, "image2video");
    if (imgs.length !== 1) {
      console.error("ERROR: image2video expects exactly 1 image URL, got " + imgs.length);
      process.exit(2);
    }
    payload.image = imgs[0]; // single image at top level
  } else if (args.workflow === "multi2video") {
    const imgs = resolveImageInputs(args.image, "multi2video");
    payload.extra_body = { image: imgs };
  } else if (args.workflow === "keyframes") {
    const imgs = resolveImageInputs(args.image, "keyframes");
    payload.extra_body = { image: imgs, mode: "keyframes" };
  } else {
    console.error("ERROR: unknown workflow '" + args.workflow + "'. Use text2video | image2video | multi2video | keyframes");
    process.exit(2);
  }

  // ── Audio input for lip sync (Seedance 2.0 native) ──
  // Seedance 2.0 supports audio-driven lip sync via LipSyncNet.
  // Audio is passed as a reference for the model to synchronize mouth movements.
  if (args.audio) {
    const audioData = resolveAudioInput(args.audio);
    if (audioData) {
      // Try multiple payload structures to maximize compatibility:
      // 1. Top-level "audio" field (simplest)
      payload.audio = audioData;
      // 2. Also add to extra_body as backup
      if (!payload.extra_body) payload.extra_body = {};
      payload.extra_body.audio = audioData;
      // 3. Add as reference (matching native Seedance API structure)
      if (!payload.extra_body.references) payload.extra_body.references = [];
      payload.extra_body.references.push({ type: "audio", data: audioData });

      process.stderr.write("Audio attached for lip sync: " + args.audio + "\n");
    }
  }

  return payload;
}

// Generic JSON request (GET or POST). Always sends Connection: close so no
// keep-alive sockets linger and block process exit.
function httpRequest({ method, host, pathStr, headers, body, timeout }) {
  return new Promise((resolve, reject) => {
    const hdrs = Object.assign({ "Connection": "close" }, headers || {});
    const opts = { host, path: pathStr, method, headers: hdrs, timeout: timeout || 60000 };
    if (body) opts.headers["Content-Length"] = Buffer.byteLength(body);
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, raw: data });
        } else {
          reject(new Error("HTTP " + res.statusCode + ":\n" + data.slice(0, 2000)));
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("Request timed out")); });
    if (body) req.write(body);
    req.end();
  });
}

async function createTask(apiKey, payload, maxRetries) {
  maxRetries = maxRetries || 5;
  const body = JSON.stringify(payload);
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await httpRequest({
        method: "POST",
        host: API_HOST,
        pathStr: CREATE_PATH,
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body,
        timeout: 600000,
      });
      let json;
      try { json = JSON.parse(res.raw); } catch (e) {
        throw new Error("Failed to parse create-task response: " + e.message + "\n" + res.raw.slice(0, 2000));
      }
      return json;
    } catch (e) {
      lastErr = e;
      const msg = e.message || String(e);
      const isRetryable = /timed out|503|429|ECONNRESET|Service busy|ServiceUnavailable/i.test(msg);
      if (!isRetryable || attempt === maxRetries) {
        throw e;
      }
      const wait = Math.min(15 * attempt, 60);
      process.stderr.write("Create attempt " + attempt + "/" + maxRetries + " failed (" + msg.split("\n")[0] + "), retrying in " + wait + "s...\n");
      await sleep(wait * 1000);
    }
  }
  throw lastErr;
}

async function pollResult(apiKey, videoId, pollInterval, maxWait) {
  const pathStr = "/agnesapi?video_id=" + encodeURIComponent(videoId) + "&model_name=" + encodeURIComponent(MODEL);
  const headers = { "Authorization": "Bearer " + apiKey };
  const startedAt = Date.now();
  let lastProgress = -1;
  while (true) {
    let res;
    try {
      res = await httpRequest({ method: "GET", host: API_HOST, pathStr, headers, timeout: 60000 });
    } catch (e) {
      // transient errors: warn and keep polling
      process.stderr.write("poll error (will retry): " + e.message.split("\n")[0] + "\n");
    }
    if (res) {
      let json;
      try { json = JSON.parse(res.raw); } catch (e) { json = null; }
      if (json) {
        const status = json.status;
        const progress = json.progress != null ? json.progress : -1;
        if (progress !== lastProgress) {
          process.stderr.write("status=" + status + " progress=" + progress + "%\n");
          lastProgress = progress;
        }
        if (status === "completed") {
          // Build video download URL from the video_id or use the url field if present
          const videoUrl = json.url || ("https://" + API_HOST + "/agnesapi?video_id=" + encodeURIComponent(videoId) + "&model_name=" + encodeURIComponent(MODEL));
          json._video_url = videoUrl; // attach the constructed URL
          return json;
        }
        if (status === "failed") {
          throw new Error("Task failed:\n" + JSON.stringify(json, null, 2).slice(0, 2000));
        }
      }
    }
    const elapsed = (Date.now() - startedAt) / 1000;
    if (elapsed > maxWait) {
      throw new Error("Timed out after " + maxWait + "s waiting for video " + videoId);
    }
    await sleep(pollInterval * 1000);
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Download a URL (http/https, follows redirects) to a file.
// Collects all data into a Buffer then writes synchronously (writeSync + fsync)
// to guarantee data hits disk. Pure Node.js, cross-platform.
function downloadToFile(url, outPath, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Too many redirects"));
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { headers: { "User-Agent": "Mozilla/5.0", "Connection": "close" }, timeout: 300000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(downloadToFile(new URL(res.headers.location, url).href, outPath, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("Download failed, HTTP " + res.statusCode + " for " + url)); }
      const expected = res.headers["content-length"] ? parseInt(res.headers["content-length"], 10) : null;
      const chunks = [];
      let received = 0;
      res.on("data", (chunk) => { chunks.push(chunk); received += chunk.length; });
      res.on("error", (e) => { reject(e); });
      res.on("end", () => {
        if (received === 0) return reject(new Error("Downloaded 0 bytes (empty response) from " + url));
        if (expected !== null && received !== expected) {
          return reject(new Error("Size mismatch: expected " + expected + " bytes, got " + received));
        }
        try {
          const buf = Buffer.concat(chunks, received);
          const fd = fs.openSync(outPath, "w");
          fs.writeSync(fd, buf, 0, received, 0);
          fs.fsyncSync(fd);
          fs.closeSync(fd);
          // Read back to confirm the write is real on disk.
          const verify = fs.statSync(outPath).size;
          if (verify !== received) return reject(new Error("Verify failed: wrote " + received + " but stat says " + verify));
          // Set read-only to prevent the workspace from clearing the file to 0 bytes.
          try { fs.chmodSync(outPath, 0o444); } catch (e) { /* best-effort */ }
          resolve(received);
        } catch (e) { reject(new Error("Failed to write file: " + e.message)); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("Download timed out (300s)")); });
  });
}

function defaultOutput(workflow) {
  return "agnes_" + workflow + "_" + Date.now() + ".mp4";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.prompt) { console.error("ERROR: --prompt is required"); process.exit(2); }
  validateNumFrames(args.numFrames);
  if (!args.output) args.output = defaultOutput(args.workflow);

  const apiKey = getApiKey(args.apiKey);
  const payload = buildPayload(args);

  process.stderr.write(
    "Creating video task [" + args.workflow + "] " + args.width + "x" + args.height +
    " " + args.numFrames + "f@" + args.frameRate + "fps (~" +
    (args.numFrames / args.frameRate).toFixed(1) + "s) ...\n"
  );

  let task;
  try {
    task = await createTask(apiKey, payload);
  } catch (e) {
    console.error("Create task failed: " + e.message);
    process.exit(1);
  }

  const videoId = task.video_id || task.id;
  if (!videoId) {
    console.error("No video_id in create response:\n" + JSON.stringify(task, null, 2).slice(0, 2000));
    process.exit(1);
  }
  process.stderr.write("Task created. video_id=" + videoId + " status=" + task.status + " size=" + (task.size || "n/a") + "\n");
  process.stderr.write("Polling every " + args.pollInterval + "s (max " + args.maxWait + "s) ...\n");

  let result;
  try {
    result = await pollResult(apiKey, videoId, args.pollInterval, args.maxWait);
  } catch (e) {
    console.error("Polling failed: " + e.message);
    process.exit(1);
  }

  const videoUrl = result._video_url || result.remixed_from_video_id;
  process.stderr.write("Video ready: " + videoUrl + " (" + result.size + ", " + result.seconds + "s)\n");

  // --url-only mode: skip download, just output the URL. The caller downloads
  // via a separate short-lived command to guarantee file persistence.
  if (args.urlOnly) {
    console.log("VIDEO_URL=" + videoUrl);
    console.log("VIDEO_SIZE=" + (result.size || "unknown"));
    console.log("VIDEO_SECONDS=" + (result.seconds || "unknown"));
    process.exit(0);
  }

  const outPath = path.resolve(args.output);
  process.stderr.write("Downloading to " + outPath + " ...\n");
  let sizeBytes;
  try {
    sizeBytes = await downloadToFile(videoUrl, outPath);
  } catch (e) {
    console.error("Download failed: " + e.message + "\nVideo URL: " + videoUrl);
    process.exit(1);
  }

  // Final integrity check on disk.
  const onDisk = fs.statSync(outPath).size;
  if (onDisk !== sizeBytes || onDisk === 0) {
    console.error("Download integrity error: reported " + sizeBytes + " bytes but file is " + onDisk + " bytes");
    process.exit(1);
  }
  console.log("SUCCESS: " + outPath + " (" + sizeBytes + " bytes)");
  console.log("OUT_PATH=" + outPath);
  console.log("VIDEO_URL=" + videoUrl);
  // Force a clean, immediate exit. Without this, lingering keep-alive sockets
  // from the polling phase can keep the event loop alive, causing the process
  // to hang and eventually be killed externally — which on some systems
  // corrupts files written during the session.
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal: " + (e && e.message ? e.message : e));
  process.exit(1);
});
