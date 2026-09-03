#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * Volcengine Ark API Client
 * =========================
 * Low-level HTTP client for Ark Platform APIs.
 * Uses only Node.js built-in modules (https).
 *
 * Endpoints:
 *   - Image Gen: POST /api/v3/images/generations
 *   - Video Submit: POST /api/v3/contents/generations/tasks
 *   - Video Query: GET /api/v3/contents/generations/tasks/{task_id}
 */

const https = require("https");

const API_HOST = "ark.cn-beijing.volces.com";
const IMAGE_PATH = "/api/v3/images/generations";
const VIDEO_SUBMIT_PATH = "/api/v3/contents/generations/tasks";

// ---- Generic HTTPS Request ----
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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ---- Exponential Backoff Retry ----
async function retryAsync(fn, maxRetries, label) {
  maxRetries = maxRetries || 5;
  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e.message || String(e);
      const isRetryable = /timed out|503|429|ECONNRESET|Service busy|ServiceUnavailable|socket hang up/i.test(msg);
      if (!isRetryable || attempt === maxRetries) {
        throw e;
      }
      const wait = Math.min(2 ** (attempt - 1), 30);
      console.error("  [" + (label || "retry") + "] Attempt " + attempt + "/" + maxRetries + " failed, retrying in " + wait + "s...");
      await sleep(wait * 1000);
    }
  }
  throw lastErr;
}

// ---- Image Generation ----
async function postImageGeneration(body, apiKey) {
  const bodyStr = JSON.stringify(body);
  const sizeMB = Buffer.byteLength(bodyStr) / (1024 * 1024);
  if (sizeMB > 64) {
    console.warn("WARNING: Request body size " + sizeMB.toFixed(1) + "MB exceeds 64MB limit. Large images should use URL instead of Base64.");
  }

  const res = await retryAsync(() => httpRequest({
    method: "POST",
    host: API_HOST,
    pathStr: IMAGE_PATH,
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: bodyStr,
    timeout: 300000,
  }), 5, "image-gen");

  try {
    return JSON.parse(res.raw);
  } catch (e) {
    throw new Error("Failed to parse image generation response: " + e.message + "\n" + res.raw.slice(0, 2000));
  }
}

// ---- Video Task Submission ----
async function submitVideoTask(body, apiKey) {
  const bodyStr = JSON.stringify(body);
  const sizeMB = Buffer.byteLength(bodyStr) / (1024 * 1024);
  if (sizeMB > 64) {
    throw new Error("Request body size " + sizeMB.toFixed(1) + "MB exceeds 64MB limit. Use image URLs instead of Base64.");
  }

  const res = await retryAsync(() => httpRequest({
    method: "POST",
    host: API_HOST,
    pathStr: VIDEO_SUBMIT_PATH,
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: bodyStr,
    timeout: 300000,
  }), 5, "video-submit");

  try {
    return JSON.parse(res.raw);
  } catch (e) {
    throw new Error("Failed to parse video submission response: " + e.message + "\n" + res.raw.slice(0, 2000));
  }
}

// ---- Video Task Query ----
async function queryVideoTask(taskId, apiKey) {
  const pathStr = VIDEO_SUBMIT_PATH + "/" + encodeURIComponent(taskId);
  const res = await retryAsync(() => httpRequest({
    method: "GET",
    host: API_HOST,
    pathStr: pathStr,
    headers: {
      "Authorization": "Bearer " + apiKey,
    },
    timeout: 60000,
  }), 5, "video-query");

  try {
    return JSON.parse(res.raw);
  } catch (e) {
    throw new Error("Failed to parse video query response: " + e.message + "\n" + res.raw.slice(0, 2000));
  }
}

// ---- Export ----
module.exports = {
  postImageGeneration,
  submitVideoTask,
  queryVideoTask,
  sleep,
  retryAsync,
};
