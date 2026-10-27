#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * lib/agnes.js — Shared Agnes API client for the cinematic-music-video skill.
 *
 * Responsibilities:
 *   - API key pool with round-robin rotation + per-key cooldown on 401/403/429.
 *   - Low-level HTTPS JSON request helper (Connection: close, so no lingering sockets).
 *   - Image generation (agnes-image-2.5-flash) -> local file + public URL sidecar.
 *   - Video task create/poll/download (agnes-video-2.5-flash).
 *   - Chat completion (agnes-3.0-flash) for storyboard planning.
 *
 * Only Node.js built-in modules are used. No npm dependencies.
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const paths = require("./paths");

const API_HOST = "api.agnes-ai.cn";
const BASE_URL = "https://api.agnes-ai.cn/v1";

const MODEL_CHAT = "agnes-3.0-flash";
const MODEL_IMAGE = "agnes-image-2.5-flash";
const MODEL_VIDEO = "agnes-video-2.5-flash";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) {
  process.stderr.write(msg + "\n");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Write a file and fsync so the bytes are really on disk. */
function writeFileSyncDurable(filePath, data) {
  ensureDir(path.dirname(filePath));
  const fd = fs.openSync(filePath, "w");
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  fs.writeSync(fd, buf, 0, buf.length, 0);
  try { fs.fsyncSync(fd); } catch (e) { /* best effort */ }
  fs.closeSync(fd);
  return buf.length;
}

/**
 * Split an argument that may be a comma/semicolon/whitespace separated key list.
 */
function parseKeyList(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// API key pool — round-robin with cooldown
// ---------------------------------------------------------------------------

const KEY_STATE_FILE = ".agnes-key-state.json";

class KeyPool {
  /**
   * @param {string[]} keys
   * @param {object}   opts
   * @param {string}   opts.stateDir  directory for the rotation cursor file
   * @param {number}   opts.cooldownMs cooldown applied after a key-level failure
   */
  constructor(keys, opts) {
    opts = opts || {};
    if (!keys || !keys.length) {
      throw new Error(
        "No API key found. Pass --keys \"sk-a,sk-b\" / --keys-file keys.txt, " +
        "or set the AGNES_API_KEYS (or AGNES_API_KEY / agnes-api-key) environment variable."
      );
    }
    this.keys = keys.slice();
    // The rotation cursor is runtime state: it belongs in the skill's own
    // out/.state/, never in whatever directory the user happened to run from.
    this.stateDir = opts.stateDir || paths.stateDir();
    this.cooldownMs = opts.cooldownMs || 45000;
    this.cursor = 0;
    this.failures = new Map(); // key -> { count, until }
    this.usage = new Map();    // key -> number of successful calls
    this.keys.forEach((k) => this.usage.set(k, 0));
    this._loadCursor();
  }

  _statePath() {
    return path.join(this.stateDir, KEY_STATE_FILE);
  }

  _loadCursor() {
    try {
      const s = JSON.parse(fs.readFileSync(this._statePath(), "utf8"));
      if (typeof s.cursor === "number") this.cursor = s.cursor % this.keys.length;
    } catch (e) { /* first run */ }
  }

  _saveCursor() {
    try {
      ensureDir(this.stateDir);
      fs.writeFileSync(this._statePath(), JSON.stringify({ cursor: this.cursor }, null, 2), "utf8");
    } catch (e) { /* non-fatal */ }
  }

  /** Masked key for logging — never log raw keys. */
  static mask(key) {
    if (!key || key.length < 12) return "sk-***";
    return key.slice(0, 7) + "***" + key.slice(-4);
  }

  /**
   * Acquire the next usable key. Advances the round-robin cursor and skips
   * keys that are currently cooling down (unless every key is cooling down,
   * in which case it waits for the shortest cooldown to expire).
   */
  async acquire(label) {
    for (;;) {
      const now = Date.now();
      for (let i = 0; i < this.keys.length; i++) {
        const idx = (this.cursor + i) % this.keys.length;
        const key = this.keys[idx];
        const f = this.failures.get(key);
        if (!f || f.until <= now) {
          this.cursor = (idx + 1) % this.keys.length;
          this._saveCursor();
          if (f) this.failures.delete(key);
          return { key, index: idx, label };
        }
      }
      // All keys cooling down — wait for the earliest to recover.
      let earliest = Infinity;
      for (const f of this.failures.values()) earliest = Math.min(earliest, f.until);
      // Defensive: if the failures map is somehow empty (a racing worker
      // cleared it between the scan above and here) earliest stays Infinity
      // and sleep(Infinity) hangs the process forever with no log line after
      // this one. Measured 2026-10-09 — the run appeared dead for 7 minutes.
      const wait = Number.isFinite(earliest) ? Math.max(1000, earliest - Date.now()) : 3000;
      log(
        this.keys.length === 1
          ? `[keys] the only key is cooling down, waiting ${Math.round(wait / 1000)}s ...`
          : `[keys] all keys cooling down, waiting ${Math.round(wait / 1000)}s ...`
      );
      await sleep(wait);
    }
  }

  /** Record a per-key failure and start/extend its cooldown. */
  penalize(key, reason) {
    const f = this.failures.get(key) || { count: 0, until: 0 };
    f.count += 1;
    // Exponential-ish cooldown, capped — BUT the cap must depend on how many
    // keys we have.
    //
    // Measured 2026-10-09: with a SINGLE key, the 300s hard cap is a trap. One
    // key that gets penalized five times parks the cursor for five minutes,
    // and every retry in that window just waits — the run looks hung
    // (`[keys] all keys cooling down, waiting 300s ...`) while it is really
    // just idling on the only channel it has. With N keys a long cooldown is
    // fine: the other N-1 keys keep working, so penalizing one hard is cheap.
    // With one key it is fatal, so cap it at something a person will tolerate.
    const cap = this.keys.length > 1 ? 300000 : 60000;
    const cd = Math.min(this.cooldownMs * Math.pow(1.6, f.count - 1), cap);
    f.until = Date.now() + cd;
    this.failures.set(key, f);
    log(`[keys] ${KeyPool.mask(key)} penalized (${reason}); cooldown ${Math.round(cd / 1000)}s`);
  }

  success(key) {
    // Health means health: a successful call clears the failure record whole,
    // including its count. Deleting only the cooldown but keeping the count
    // would let a recovered key jump straight back to a multi-minute park on
    // its next 429 (measured 2026-10-09). A key that just worked has earned a
    // clean slate.
    this.failures.delete(key);
    this.usage.set(key, (this.usage.get(key) || 0) + 1);
  }

  stats() {
    return this.keys.map((k) => `${KeyPool.mask(k)}=${this.usage.get(k) || 0}`).join(", ");
  }
}

// ---------------------------------------------------------------------------
// Low-level HTTPS JSON request
// ---------------------------------------------------------------------------

/**
 * Perform an HTTPS request against the Agnes host.
 * Resolves with { status, raw } for 2xx, rejects otherwise with a tagged error.
 */
function httpRequest({ method, pathStr, headers, body, timeout, host }) {
  return new Promise((resolve, reject) => {
    const hdrs = Object.assign({ Connection: "close" }, headers || {});
    const opts = {
      host: host || API_HOST,
      path: pathStr,
      method,
      headers: hdrs,
      timeout: timeout || 120000,
    };
    if (body) opts.headers["Content-Length"] = Buffer.byteLength(body);
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, raw: data });
        } else {
          const err = new Error(`HTTP ${res.statusCode}: ${data.slice(0, 800)}`);
          err.status = res.statusCode;
          err.body = data;
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Request timed out after " + opts.timeout + "ms")));
    if (body) req.write(body);
    req.end();
  });
}

/** HTTP status codes that indicate a key-level / transient problem worth retrying. */
function isRetryable(err) {
  const s = err && err.status;
  if (s === 429 || s === 500 || s === 502 || s === 503 || s === 504) return true;
  const m = (err && err.message) || "";
  return /timed out|ECONNRESET|ETIMEDOUT|socket hang up|ECONNREFUSED|EAI_AGAIN|Service busy|ServiceUnavailable/i.test(m);
}

/** Status codes that suggest the key itself is bad. */
function isKeyFailure(err) {
  return err && (err.status === 401 || err.status === 403);
}

/**
 * Call an API with automatic key rotation + retry.
 * `callFn(key)` must return a promise; the pool handles rotation and backoff.
 */
async function withKeyRetry(pool, callFn, opts) {
  opts = opts || {};
  const maxAttempts = opts.maxAttempts || (pool.keys.length * 3 + 4);
  const label = opts.label || "request";
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { key } = await pool.acquire(label);
    try {
      const result = await callFn(key);
      pool.success(key);
      return result;
    } catch (e) {
      lastErr = e;
      if (isKeyFailure(e)) {
        pool.penalize(key, `HTTP ${e.status}`);
      } else if (e.status === 429) {
        // Rate limited: short cooldown, and it may be account-wide.
        pool.penalize(key, "429 rate limit");
        const wait = Math.min(5000 * attempt, 40000);
        log(`[${label}] 429 rate limited, backing off ${Math.round(wait / 1000)}s (attempt ${attempt}/${maxAttempts})`);
        await sleep(wait);
        continue;
      } else if (isRetryable(e)) {
        const wait = Math.min(4000 * attempt, 45000);
        log(`[${label}] transient error (${String(e.message).split("\n")[0].slice(0, 120)}), retry in ${Math.round(wait / 1000)}s (attempt ${attempt}/${maxAttempts})`);
        await sleep(wait);
        continue;
      } else {
        throw e; // deterministic error (400 etc.) — surface immediately
      }
      if (attempt === maxAttempts) break;
    }
  }
  throw lastErr || new Error(`${label} failed after ${maxAttempts} attempts`);
}

// ---------------------------------------------------------------------------
// Chat (agnes-3.0-flash) — used by the planning stage
// ---------------------------------------------------------------------------

/**
 * @param {KeyPool} pool
 * @param {object}   opts
 * @param {string}   opts.system
 * @param {string}   opts.user
 * @param {number}   opts.maxTokens
 * @param {number}   opts.temperature
 * @returns {Promise<string>} assistant text
 */
/**
 * One streaming (SSE) chat attempt.
 *
 * Why streaming and not `stream:false`: the non-streaming chat endpoint silently
 * buffers large generations (a 24-shot storyboard is ~38k chars) and can stall for
 * tens of minutes behind a proxy, long after the model has actually produced tokens.
 * The same request returns in ~3 minutes when streamed. Only `delta.content` is
 * accumulated; anything unparseable is skipped rather than throwing.
 */
function chatStreamRequest({ key, body, timeout }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: API_HOST,
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
          Connection: "close",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout,
      },
      (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          let errBody = "";
          res.setEncoding("utf8");
          res.on("data", (c) => (errBody += c));
          res.on("end", () => {
            const err = new Error(`HTTP ${res.statusCode}: ${errBody.slice(0, 800)}`);
            err.status = res.statusCode;
            err.body = errBody;
            reject(err);
          });
          return;
        }
        res.setEncoding("utf8");
        let buf = "";
        let out = "";
        res.on("data", (chunk) => {
          buf += chunk;
          let nl;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line || !line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const j = JSON.parse(payload);
              const delta = j.choices && j.choices[0] && j.choices[0].delta;
              if (delta && typeof delta.content === "string") out += delta.content;
            } catch (e) {
              /* partial SSE frame — keep buffering */
            }
          }
        });
        res.on("end", () => resolve(out));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Request timed out after " + timeout + "ms")));
    req.write(body);
    req.end();
  });
}

async function chat(pool, opts) {
  const payload = {
    model: MODEL_CHAT,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    max_tokens: opts.maxTokens || 16000,
    temperature: opts.temperature === undefined ? 0.75 : opts.temperature,
  };
  const timeout = Number(process.env.CMV_CHAT_TIMEOUT) || 900000;

  // Preferred path: SSE streaming (see chatStreamRequest for the rationale).
  try {
    const out = await withKeyRetry(
      pool,
      (key) =>
        chatStreamRequest({
          key,
          body: JSON.stringify(Object.assign({}, payload, { stream: true })),
          timeout,
        }),
      { label: "chat" }
    );
    if (out && out.trim()) return out;
    log("      chat: stream produced no content, falling back to non-streaming");
  } catch (e) {
    log(`      chat: streaming failed (${String(e.message).split("\n")[0].slice(0, 140)}), falling back to non-streaming`);
  }

  const res = await withKeyRetry(
    pool,
    (key) =>
      httpRequest({
        method: "POST",
        pathStr: "/v1/chat/completions",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({}, payload, { stream: false })),
        timeout,
      }),
    { label: "chat" }
  );

  let json;
  try {
    json = JSON.parse(res.raw);
  } catch (e) {
    throw new Error("Failed to parse chat response: " + res.raw.slice(0, 800));
  }
  const choice = json.choices && json.choices[0];
  if (!choice) throw new Error("Chat response has no choices: " + res.raw.slice(0, 800));
  const content = choice.message && choice.message.content;
  if (!content) throw new Error("Chat response has empty content: " + res.raw.slice(0, 800));
  return content;
}

/**
 * Extract the first JSON object/array from a model reply, tolerating
 * markdown fences and surrounding prose. Returns the parsed value.
 */
function extractJson(text) {
  if (!text) throw new Error("extractJson: empty text");
  let s = String(text).trim();
  // Strip markdown code fences.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // Fast path.
  try { return JSON.parse(s); } catch (e) { /* keep trying */ }
  // Scan for the first balanced { } or [ ].
  const startIdx = (() => {
    const a = s.indexOf("{");
    const b = s.indexOf("[");
    if (a === -1) return b;
    if (b === -1) return a;
    return Math.min(a, b);
  })();
  if (startIdx === -1) throw new Error("extractJson: no JSON found in:\n" + s.slice(0, 500));
  const open = s[startIdx];
  const close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false;
  for (let i = startIdx; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        const cand = s.slice(startIdx, i + 1);
        try { return JSON.parse(cand); } catch (e) {
          throw new Error("extractJson: balanced block is not valid JSON: " + e.message + "\n" + cand.slice(0, 500));
        }
      }
    }
  }
  throw new Error("extractJson: unbalanced JSON in reply:\n" + s.slice(0, 800));
}

// ---------------------------------------------------------------------------
// Image generation (agnes-image-2.5-flash)
// ---------------------------------------------------------------------------

/**
 * Generate an image. Returns { url, localPath, bytes }.
 *
 * @param {KeyPool} pool
 * @param {object}  opts
 * @param {string}  opts.prompt
 * @param {string}  opts.size       "1K" | "2K" | "3K" | "4K"
 * @param {string}  opts.ratio      "1:1" | "16:9" | "9:16" | ...
 * @param {string[]} [opts.images]  reference image URLs or data URIs (i2i / multi-image)
 * @param {string}  opts.outputPath local PNG path to save
 * @param {number}  [opts.timeout]
 */
async function generateImage(pool, opts) {
  const payload = {
    model: MODEL_IMAGE,
    prompt: opts.prompt,
    size: opts.size || "2K",
    ratio: opts.ratio || "16:9",
    extra_body: { response_format: "url" },
  };
  if (opts.images && opts.images.length) {
    payload.extra_body.image = opts.images;
  }
  const body = JSON.stringify(payload);

  const res = await withKeyRetry(
    pool,
    (key) =>
      httpRequest({
        method: "POST",
        pathStr: "/v1/images/generations",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body,
        timeout: opts.timeout || 420000,
      }),
    { label: "image" }
  );

  let json;
  try { json = JSON.parse(res.raw); } catch (e) {
    throw new Error("Failed to parse image response: " + res.raw.slice(0, 800));
  }
  const item = json.data && json.data[0];
  if (!item) throw new Error("Image response has no data: " + res.raw.slice(0, 800));

  let buf;
  if (item.b64_json) {
    buf = Buffer.from(item.b64_json, "base64");
  } else if (item.url) {
    buf = await downloadBuffer(item.url, opts.timeout || 420000);
  } else {
    throw new Error("Image response has neither url nor b64_json: " + res.raw.slice(0, 800));
  }

  const bytes = writeFileSyncDurable(opts.outputPath, buf);
  // Sidecar .url file: the public URL is required by the video stage.
  if (item.url) writeFileSyncDurable(opts.outputPath + ".url", item.url + "\n");
  return { url: item.url || null, localPath: opts.outputPath, bytes };
}

// ---------------------------------------------------------------------------
// Video generation (agnes-video-2.5-flash)
// ---------------------------------------------------------------------------

/**
 * Create a video task. Returns the create response (contains video_id).
 *
 * mode:
 *   "text"      — prompt only
 *   "keyframe"  — first_frame and/or last_frame
 *   "reference" — images[] and/or audios[]
 */
async function createVideoTask(pool, opts) {
  const payload = {
    model: MODEL_VIDEO,
    prompt: opts.prompt,
    seconds: String(opts.seconds || 5),
    mode: opts.mode || "text",
    size: "720P", // Flash only supports the string "720P"
    aspect_ratio: opts.aspectRatio || "16:9",
  };
  if (opts.seed !== undefined && opts.seed !== null) payload.seed = opts.seed;
  if (opts.mode === "keyframe") {
    if (opts.firstFrame) payload.first_frame = opts.firstFrame;
    if (opts.lastFrame) payload.last_frame = opts.lastFrame;
  } else if (opts.mode === "reference") {
    if (opts.images && opts.images.length) {
      if (opts.images.length > 5) throw new Error("reference mode: at most 5 reference images (got " + opts.images.length + ")");
      payload.images = opts.images;
    }
    if (opts.audios && opts.audios.length) {
      if (opts.audios.length > 3) throw new Error("reference mode: at most 3 reference audios (got " + opts.audios.length + ")");
      payload.audios = opts.audios;
    }
    if (!payload.images && !payload.audios) {
      throw new Error("reference mode requires at least one of images[] or audios[]");
    }
  }

  const body = JSON.stringify(payload);
  // ★ 必须记住创建用的 key：视频任务绑定在创建它的账号上。本机 15 个 key 分属
  //   多个账号，实测只有创建者的 key 能查到该任务（其余 14 个一律 HTTP 404
  //   「任务不存在」）。轮询若轮换 key，就会 404 风暴 + 误伤整个 key 池。
  let usedKey = null;
  const res = await withKeyRetry(
    pool,
    (key) => {
      usedKey = key;
      return httpRequest({
        method: "POST",
        pathStr: "/v1/videos",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body,
        timeout: 600000,
      });
    },
    { label: "video-create" }
  );

  let json;
  try { json = JSON.parse(res.raw); } catch (e) {
    throw new Error("Failed to parse video create response: " + res.raw.slice(0, 800));
  }
  const videoId = json.video_id || json.id || json.task_id;
  if (!videoId) throw new Error("No video_id in create response: " + res.raw.slice(0, 800));
  json._video_id = videoId;
  json._key = usedKey;   // 交给 pollVideoTask 钉住（见下）
  return json;
}

/**
 * Poll a video task until it completes or fails.
 * Returns the completed task object (has `url` or `metadata.url`).
 *
 * The API is aggressive about rate limits (HTTP 429 on rapid polling), so we
 * use a conservative interval and a growing backoff on 429.
 */
async function pollVideoTask(pool, videoId, opts) {
  opts = opts || {};
  // opts.key：创建该任务所用的 key。给了就**只用它**轮询——任务是账号级的，
  // 切换 key 会得到 HTTP 404「任务不存在」（实测 15 key 仅 1 个命中）。
  // 未给时退回原来的轮换行为（兼容旧调用方）。
  const pinnedKey = opts.key || null;
  let interval = opts.pollIntervalMs || 8000;
  const maxWait = opts.maxWaitMs || 1800000; // 30 min
  const startedAt = Date.now();
  let lastProgress = -1;
  let consecutiveErrors = 0;

  for (;;) {
    const key = pinnedKey || (await pool.acquire("video-poll")).key;
    let ok = false;
    try {
      const res = await httpRequest({
        method: "GET",
        pathStr: `/agnesapi?video_id=${encodeURIComponent(videoId)}&model_name=${MODEL_VIDEO}`,
        headers: { Authorization: "Bearer " + key },
        timeout: 60000,
      });
      const j = JSON.parse(res.raw);
      ok = true;
      if (!pinnedKey) pool.success(key);
      consecutiveErrors = 0;

      const progress = j.progress != null ? j.progress : -1;
      if (progress !== lastProgress) {
        log(`  [${videoId}] status=${j.status} progress=${progress}%`);
        lastProgress = progress;
      }
      if (j.status === "completed") {
        const url = j.url || (j.metadata && j.metadata.url) || null;
        if (!url) throw new Error("Video completed but no url field: " + res.raw.slice(0, 600));
        j._video_url = url;
        return j;
      }
      if (j.status === "failed") {
        const msg = (j.error && j.error.message) || "unknown error";
        const err = new Error(`Video task ${videoId} failed: ${msg}`);
        err.videoFailed = true;
        err.task = j;
        throw err;
      }
    } catch (e) {
      if (e.videoFailed) throw e;
      if (e.status === 429) {
        // Expected occasionally; do NOT penalize the key, just slow down.
        interval = Math.min(Math.round(interval * 1.5), 30000);
        log(`  [${videoId}] poll 429, interval -> ${Math.round(interval / 1000)}s`);
      } else if (isKeyFailure(e)) {
        if (!pinnedKey) pool.penalize(key, `HTTP ${e.status}`);
      } else {
        consecutiveErrors++;
        // 钉住的 key 不参与惩罚：404 大多是「用错账号查任务」，不是 key 坏了，
        // 惩罚它会把整个池子拖进无谓冷却。
        if (!pinnedKey) pool.penalize(key, "poll error");
        log(`  [${videoId}] poll error: ${String(e.message).split("\n")[0].slice(0, 140)}`);
        if (consecutiveErrors > 12) throw new Error("Too many consecutive poll errors for " + videoId + ": " + e.message);
      }
    }
    if (!ok) { /* fall through to wait */ }

    if (Date.now() - startedAt > maxWait) {
      throw new Error(`Timed out after ${Math.round(maxWait / 1000)}s waiting for video ${videoId}`);
    }
    await sleep(interval);
  }
}

// ---------------------------------------------------------------------------
// Downloading
// ---------------------------------------------------------------------------

/** Download a URL (follows redirects) and return a Buffer. */
function downloadBuffer(url, timeout, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    if (redirects > 6) return reject(new Error("Too many redirects for " + url));
    const client = url.startsWith("https") ? https : http;
    const req = client.get(
      url,
      { headers: { "User-Agent": "Mozilla/5.0", Connection: "close" }, timeout: timeout || 300000 },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(downloadBuffer(new URL(res.headers.location, url).href, timeout, redirects + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error("Download failed, HTTP " + res.statusCode + " for " + url));
        }
        const expected = res.headers["content-length"] ? parseInt(res.headers["content-length"], 10) : null;
        const chunks = [];
        let received = 0;
        res.on("data", (c) => { chunks.push(c); received += c.length; });
        res.on("error", reject);
        res.on("end", () => {
          if (received === 0) return reject(new Error("Downloaded 0 bytes from " + url));
          if (expected !== null && received !== expected) {
            return reject(new Error(`Size mismatch for ${url}: expected ${expected}, got ${received}`));
          }
          resolve(Buffer.concat(chunks, received));
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Download timed out for " + url)));
  });
}

/** Download a URL to a local file with durable write. Returns bytes written. */
async function downloadToFile(url, outPath, timeout) {
  const buf = await downloadBuffer(url, timeout);
  const bytes = writeFileSyncDurable(outPath, buf);
  const onDisk = fs.statSync(outPath).size;
  if (onDisk !== bytes || onDisk === 0) {
    throw new Error(`Download integrity error for ${outPath}: wrote ${bytes}, stat ${onDisk}`);
  }
  return bytes;
}

/** Check that a URL is publicly reachable (needed before feeding it to the video API). */
function checkPublicUrl(url, timeout, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve) => {
    if (redirects > 4) return resolve({ ok: false, note: "too many redirects" });
    const client = url.startsWith("https") ? https : http;
    const req = client.get(
      url,
      { headers: { "User-Agent": "Mozilla/5.0", Connection: "close" }, timeout: timeout || 30000 },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(checkPublicUrl(new URL(res.headers.location, url).href, timeout, redirects + 1));
        }
        const info = { ok: res.statusCode === 200, status: res.statusCode, type: res.headers["content-type"] || "" };
        res.resume();
        resolve(info);
      }
    );
    req.on("error", (e) => resolve({ ok: false, note: e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, note: "timeout" }); });
  });
}

// ---------------------------------------------------------------------------
// Small concurrency helper: run tasks with a bounded worker pool.
// ---------------------------------------------------------------------------

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  const n = Math.max(1, Math.min(concurrency || 1, items.length));
  async function runner() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { ok: true, value: await worker(items[i], i) };
      } catch (e) {
        results[i] = { ok: false, error: e };
      }
    }
  }
  await Promise.all(Array.from({ length: n }, runner));
  return results;
}

module.exports = {
  API_HOST,
  BASE_URL,
  MODEL_CHAT,
  MODEL_IMAGE,
  MODEL_VIDEO,
  KeyPool,
  sleep,
  log,
  ensureDir,
  writeFileSyncDurable,
  parseKeyList,
  httpRequest,
  withKeyRetry,
  chat,
  extractJson,
  generateImage,
  createVideoTask,
  pollVideoTask,
  downloadBuffer,
  downloadToFile,
  checkPublicUrl,
  isRetryable,
  isKeyFailure,
  runPool,
};
