#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * lib/imgutil.js — Turn local images into inputs the multimodal model can
 * actually consume.
 *
 * Why this exists
 * ---------------
 * `agnes-3.0-flash` documents image input as "a publicly reachable image URL".
 * In practice that path is fragile: the upstream loader gives itself a ~3s
 * read timeout when fetching the URL, and a 2K PNG (~1 MB) frequently blows
 * through it. Measured failure rate over 3 attempts on a single URL was 1/3 —
 * far too high to build an automatic QA gate on.
 *
 * A downscaled JPEG sent as a base64 `data:` URI removes the network hop
 * entirely and was 3/3 reliable in testing, at ~150 image tokens per frame.
 *
 * Downscaling also *helps* the task rather than hurting it: identity
 * comparison cares about facial proportions and features, which survive 768px
 * perfectly well, and dropping the resolution removes high-frequency detail the
 * model would otherwise spend attention on.
 */

const fs = require("fs");
const path = require("path");
const ffmpegLib = require("./ffmpeg");
const paths = require("./paths");

/** Default longest-edge size for model-facing images. */
const DEFAULT_MAX_PX = 768;

/**
 * Convert a local image file into a downscaled JPEG data URI.
 * Results are cached next to the source (`<file>.__v<maxPx>.jpg`) so repeated
 * checks on the same reference image cost nothing.
 *
 * @param {string} localPath   source image (png/jpg/webp/...)
 * @param {object} [opts]
 * @param {number} [opts.maxPx]  longest edge in pixels (default 768)
 * @param {number} [opts.quality] JPEG qscale 2(best)..31(worst), default 5
 * @returns {string} `data:image/jpeg;base64,...`
 */
function toDataUri(localPath, opts) {
  opts = opts || {};
  const maxPx = opts.maxPx || DEFAULT_MAX_PX;
  const quality = opts.quality || 5;
  if (!fs.existsSync(localPath)) throw new Error("imgutil: file not found: " + localPath);

  const cacheDir = path.join(path.dirname(localPath), ".vision_cache");
  const cache = path.join(cacheDir, `${path.basename(localPath)}.v${maxPx}.jpg`);
  let cacheOk = false;
  if (fs.existsSync(cache)) {
    // Rebuild the cache if the source is newer (regenerated asset).
    try {
      cacheOk = fs.statSync(cache).mtimeMs >= fs.statSync(localPath).mtimeMs;
    } catch (e) { cacheOk = false; }
  }
  if (!cacheOk) {
    fs.mkdirSync(cacheDir, { recursive: true });
    // Longest edge == maxPx, preserve aspect ratio, never upscale.
    const vf = `scale=${maxPx}:${maxPx}:force_original_aspect_ratio=decrease:flags=lanczos`;
    ffmpegLib.ffmpeg(["-y", "-hide_banner", "-loglevel", "error", "-i", localPath, "-vf", vf, "-q:v", String(quality), cache]);
  }
  const buf = fs.readFileSync(cache);
  if (!buf.length) throw new Error("imgutil: empty downscale result for " + localPath);
  return "data:image/jpeg;base64," + buf.toString("base64");
}

/**
 * Accept either a local file path or a public URL and return a data URI.
 * URLs are downloaded once into `cacheDir` and reused afterwards.
 * The cache defaults to <skill-root>/out/.state/vision-cache — inside the
 * skill's own output tree, not the current working directory.
 */
async function toDataUriFromAnything(item, cacheDir, opts) {
  if (typeof item === "object" && item && item.local) return toDataUri(item.local, opts);
  const s = String(item || "");
  if (!/^https?:\/\//i.test(s)) return toDataUri(s, opts);

  const key = require("crypto").createHash("sha1").update(s).digest("hex").slice(0, 16);
  const dir = cacheDir || paths.visionCacheDir();
  fs.mkdirSync(dir, { recursive: true });
  const local = path.join(dir, key + path.extname(new URL(s).pathname || ".png") || key + ".png");
  if (!fs.existsSync(local) || fs.statSync(local).size === 0) {
    await require("./agnes").downloadToFile(s, local, 120000);
  }
  return toDataUri(local, opts);
}

module.exports = { toDataUri, toDataUriFromAnything, DEFAULT_MAX_PX };
