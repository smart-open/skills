#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * Agnes Image 2.1 Flash - Image Generation Helper (Node.js)
 * =========================================================
 * Supports:
 *   - Text-to-image (t2i): generate an image from a text prompt.
 *   - Image-to-image (i2i): transform/edit an existing image while keeping its composition.
 *
 * API key resolution order:
 *   1. --api-key argument
 *   2. environment variable 'agnes-api-key'
 *   3. environment variable 'AGNES_API_KEY'
 *
 * Quality:
 *   Automatically appends cinematic / high-definition quality modifiers unless
 *   --no-enhance is passed. (Different modifier sets are used for t2i vs i2i so
 *   that i2i does not fight the "preserve original composition" instruction.)
 *
 * Only depends on Node.js built-in modules (https, http, fs, path). No npm install.
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const API_URL = "https://apihub.agnes-ai.com/v1/images/generations";
const API_HOST = "apihub.agnes-ai.com";
const API_PATH = "/v1/images/generations";
const MODEL = "agnes-image-2.1-flash";

// Cinematic / HD quality modifiers for text-to-image.
const T2I_QUALITY_SUFFIX =
  ", cinematic lighting, ultra-detailed, high dynamic range, shallow depth of field, " +
  "photorealistic textures, 8K, professional color grading, subtle film grain, masterpiece";

// Quality modifiers for image-to-image (composition-preserving, no camera overrides).
const I2I_QUALITY_SUFFIX =
  ", ultra-detailed, high dynamic range, sharp focus, 8K, professional color grading, masterpiece";

const MIME_MAP = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
};

// ---- Argument parsing (no external deps) ----
function parseArgs(argv) {
  const args = {
    prompt: null,
    size: "1024x1024",
    mode: "t2i",
    image: null,
    output: "agnes_output.png",
    format: "url",
    apiKey: null,
    noEnhance: false,
  };
  const map = {
    "--prompt": "prompt", "-p": "prompt",
    "--size": "size", "-s": "size",
    "--mode": "mode", "-m": "mode",
    "--image": "image", "-i": "image",
    "--output": "output", "-o": "output",
    "--format": "format", "-f": "format",
    "--api-key": "apiKey",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-enhance") {
      args.noEnhance = true;
      continue;
    }
    if (map[a]) {
      const val = argv[i + 1];
      if (val === undefined) {
        console.error("ERROR: missing value for " + a);
        process.exit(2);
      }
      if (map[a] === "image") {
        args.image = args.image ? args.image.concat([val]) : [val];
      } else {
        args[map[a]] = val;
      }
      i++;
    } else {
      console.error("ERROR: unknown argument " + a);
      process.exit(2);
    }
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

function imageToDataUri(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = MIME_MAP[ext] || "image/png";
  const buf = fs.readFileSync(filePath);
  const b64 = buf.toString("base64");
  return "data:" + mime + ";base64," + b64;
}

function resolveImageInputs(images) {
  return images.map((img) => {
    if (/^https?:\/\//i.test(img) || /^data:/i.test(img)) {
      return img;
    }
    if (!fs.existsSync(img)) {
      console.error("ERROR: input image not found: " + img);
      process.exit(2);
    }
    return imageToDataUri(img);
  });
}

function buildPayload(prompt, size, mode, imageInputs, outputFormat, enhance) {
  if (enhance) {
    const suffix = mode === "i2i" ? I2I_QUALITY_SUFFIX : T2I_QUALITY_SUFFIX;
    prompt = prompt.replace(/\s+$/, "") + suffix;
  }
  const payload = { model: MODEL, prompt: prompt, size: size };
  if (mode === "i2i") {
    // image array + response_format both live inside extra_body
    payload.extra_body = { image: imageInputs, response_format: outputFormat };
  } else {
    // text-to-image
    if (outputFormat === "b64_json") {
      payload.return_base64 = true;
    } else {
      payload.extra_body = { response_format: "url" };
    }
  }
  return payload;
}

// Generic JSON POST via https
function postJSON(payload, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        host: API_HOST,
        path: API_PATH,
        method: "POST",
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 360000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error("Failed to parse JSON response: " + e.message + "\n" + data.slice(0, 2000)));
            }
          } else {
            const err = new Error("HTTP Error " + res.statusCode + ":\n" + data);
            err.statusCode = res.statusCode;
            reject(err);
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("Request timed out (360s)")); });
    req.write(body);
    req.end();
  });
}

// Download a URL (http or https) to a file
function downloadToFile(url, outPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 180000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // follow redirect
        return resolve(downloadToFile(res.headers.location, outPath));
      }
      if (res.statusCode !== 200) {
        return reject(new Error("Download failed, HTTP " + res.statusCode + " for " + url));
      }
      const ws = fs.createWriteStream(outPath);
      res.pipe(ws);
      ws.on("finish", () => ws.close(resolve));
      ws.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("Download timed out (180s)")); });
  });
}

async function saveResult(result, outPath, outputFormat) {
  if (!result.data || !result.data.length) {
    console.error("Unexpected response (no 'data'):");
    console.error(JSON.stringify(result, null, 2).slice(0, 2000));
    process.exit(1);
  }
  const item = result.data[0];
  let imageUrl = null;
  if (outputFormat === "b64_json" && item.b64_json) {
    fs.writeFileSync(outPath, Buffer.from(item.b64_json, "base64"));
  } else if (item.url) {
    imageUrl = item.url;
    await downloadToFile(item.url, outPath);
  } else {
    console.error("No image data found in response:");
    console.error(JSON.stringify(result, null, 2).slice(0, 2000));
    process.exit(1);
  }
  return { size: fs.statSync(outPath).size, url: imageUrl };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.prompt) {
    console.error("ERROR: --prompt is required");
    process.exit(2);
  }
  if (!["t2i", "i2i"].includes(args.mode)) {
    console.error("ERROR: --mode must be t2i or i2i");
    process.exit(2);
  }
  if (!["url", "b64_json"].includes(args.format)) {
    console.error("ERROR: --format must be url or b64_json");
    process.exit(2);
  }

  const apiKey = getApiKey(args.apiKey);

  let imageInputs = null;
  if (args.mode === "i2i") {
    if (!args.image || !args.image.length) {
      console.error("ERROR: --image is required for image-to-image mode");
      process.exit(2);
    }
    imageInputs = resolveImageInputs(args.image);
  }

  const payload = buildPayload(
    args.prompt, args.size, args.mode, imageInputs, args.format, !args.noEnhance
  );

  process.stderr.write(
    "Calling Agnes Image 2.1 Flash [" + args.mode + "] size=" + args.size +
    " format=" + args.format + " ...\n"
  );

  let result;
  try {
    result = await postJSON(payload, apiKey);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const res = await saveResult(result, args.output, args.format);
  console.log("SUCCESS: " + path.resolve(args.output) + " (" + res.size + " bytes)");
  console.log("OUT_PATH=" + path.resolve(args.output));
  if (res.url) {
    console.log("IMAGE_URL=" + res.url);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal: " + (e && e.message ? e.message : e));
  process.exit(1);
});
