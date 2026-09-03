/**
 * Agnes AI API 客户端（零依赖，Node.js 内置模块）
 *
 * 覆盖三个模态：
 *  - 文本：agnes-2.0-flash（/v1/chat/completions）—— 剧本分镜拆解
 *  - 图像：agnes-image-2.5-flash（/v1/images/generations）—— 舞台合成 + 定妆照
 *  - 视频：agnes-video-2.5-flash（/v1/videos + /agnesapi 轮询）—— 分镜视频（原生音画同步）
 *
 * 文档依据：
 *  - https://www.agnes-ai.cn/zh-Hans/docs/agnes-image-25-flash
 *  - https://www.agnes-ai.cn/zh-Hans/docs/agnes-video-25-flash
 */

"use strict";

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const DEFAULT_BASE_URL = "https://api.agnes-ai.cn/v1";
const DEFAULT_IMAGE_MODEL = "agnes-image-2.5-flash";
const DEFAULT_VIDEO_MODEL = "agnes-video-2.5-flash";
const DEFAULT_TEXT_MODEL = "agnes-2.0-flash";

// ---------------------------------------------------------------------------
// 基础 HTTP
// ---------------------------------------------------------------------------

function rawRequest(method, url, { headers = {}, body = null, timeoutMs = 120000 } = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isHttps = u.protocol === "https:";
    const lib = isHttps ? https : http;
    const payload = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
    const req = lib.request(
      {
        method,
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: u.pathname + u.search,
        headers: {
          ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
          ...headers,
        },
        timeout: timeoutMs,
      },
      (res) => {
        // 跟随 3xx 重定向（视频下载 URL 等场景可能 302）；307/308 保持原方法，其余降级为 GET
        const loc = res.headers && res.headers.location;
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && loc && redirectCount < 5) {
          res.resume();
          const nextMethod = res.statusCode === 307 || res.statusCode === 308 ? method : "GET";
          const nextBody = nextMethod === method ? body : null;
          rawRequest(nextMethod, new URL(loc, url).href, { headers, body: nextBody, timeoutMs }, redirectCount + 1).then(resolve, reject);
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, text: buf.toString("utf8"), buffer: buf });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`请求超时（${timeoutMs}ms）: ${url}`));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 带指数退避的通用重试（5xx / 网络错误 / 队列满） */
async function withRetry(fn, { label = "API 调用", maxRetries = 5, baseDelayMs = 3000 } = {}) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const msg = String(err && err.message ? err.message : err);
      // 除字符串匹配外，还从错误消息中的 "HTTP xxx" 或 err.status 提取状态码做可靠判断
      const m = msg.match(/HTTP (\d{3})/);
      const status = (m && Number(m[1])) || (err && err.status) || null;
      const retryable =
        /503|429|queue is full|timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|5\d\d 服务器/i.test(msg) ||
        (status != null && (status >= 500 || status === 429));
      if (!retryable || attempt === maxRetries) break;
      // 视频创建接口限速 1 次/分钟：命中 rate limit 时固定等 70s，其余按指数退避
      const isRateLimit = /429|rate limit/i.test(msg);
      const delay = isRateLimit ? 70000 : baseDelayMs * Math.pow(2, attempt - 1);
      console.log(`  [retry] ${label} 第 ${attempt} 次失败（${msg.slice(0, 160)}），${Math.round(delay / 1000)}s 后重试...`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// 文本模型（分镜拆解）
// ---------------------------------------------------------------------------

async function chatCompletion({ apiKey, baseUrl = DEFAULT_BASE_URL, model = DEFAULT_TEXT_MODEL, messages, timeoutMs = 180000 }) {
  const res = await withRetry(
    async () => {
      const r = await rawRequest("POST", `${baseUrl}/chat/completions`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, temperature: 0.6 }),
        timeoutMs,
      });
      if (r.status !== 200) {
        const e = new Error(`文本模型 HTTP ${r.status}: ${r.text.slice(0, 300)}`);
        e.status = r.status;
        throw e;
      }
      return JSON.parse(r.text);
    },
    { label: "chat/completions" }
  );
  const choices = (res && res.choices) || [];
  return choices.length ? (choices[0].message && choices[0].message.content) || "" : "";
}

// ---------------------------------------------------------------------------
// 图像模型（文生图 / 图生图 / 多图合成）
// ---------------------------------------------------------------------------

/**
 * 生成图像，返回公开 URL。
 * @param {object} opts
 * @param {string[]} [opts.images] 参考图（URL 或 dataURI）→ 图生图 / 多图合成
 * @param {string}  [opts.size]    档位：1K/2K/3K/4K
 * @param {string}  [opts.ratio]   1:1/16:9/9:16/4:3/3:4/2:3/3:2/21:9
 */
async function generateImage({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  model = DEFAULT_IMAGE_MODEL,
  prompt,
  size = "2K",
  ratio = "16:9",
  images = null,
  timeoutMs = 360000,
}) {
  const body = { model, prompt, size, ratio };
  const extra = { response_format: "url" };
  if (images && images.length) extra.image = images;
  body.extra_body = extra;

  const res = await withRetry(
    async () => {
      const r = await rawRequest("POST", `${baseUrl}/images/generations`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        timeoutMs,
      });
      if (r.status !== 200) {
        const e = new Error(`图像生成 HTTP ${r.status}: ${r.text.slice(0, 300)}`);
        e.status = r.status;
        throw e;
      }
      return JSON.parse(r.text);
    },
    { label: "images/generations", maxRetries: 6 }
  );

  const item = res && res.data && res.data[0];
  if (item && item.url) return { url: item.url };
  if (item && item.b64_json) return { base64: item.b64_json };
  throw new Error(`图像生成响应中没有 URL: ${JSON.stringify(res).slice(0, 300)}`);
}

/** 本地文件 → data URI（图像 API 支持以 Data URI 作为输入参考图） */
function fileToDataUri(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
  const b64 = fs.readFileSync(filePath).toString("base64");
  return `data:${mime};base64,${b64}`;
}

// ---------------------------------------------------------------------------
// 视频模型（异步任务）
// ---------------------------------------------------------------------------

/**
 * 创建视频任务，返回 video_id。
 * mode 自动推断：有 images/audios → reference；否则 text。
 * Flash 限制：size 固定 "720P"，images ≤ 5，audios ≤ 3，不支持 videos。
 */
async function createVideoTask({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  model = DEFAULT_VIDEO_MODEL,
  prompt,
  seconds = "5",
  aspectRatio = "16:9",
  images = null,
  audios = null,
  seed = null,
  timeoutMs = 120000,
}) {
  const hasRef = (images && images.length) || (audios && audios.length);
  const body = {
    model,
    prompt,
    seconds: String(parseInt(seconds, 10)),
    mode: hasRef ? "reference" : "text",
    size: "720P",
    aspect_ratio: aspectRatio,
    n: 1,
  };
  if (images && images.length) body.images = images;
  if (audios && audios.length) body.audios = audios;
  if (seed !== null && seed !== undefined && !Number.isNaN(seed)) body.seed = seed;

  const res = await withRetry(
    async () => {
      const r = await rawRequest("POST", `${baseUrl}/videos`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        timeoutMs,
      });
      if (r.status !== 200 && r.status !== 201) {
        const e = new Error(`创建视频任务 HTTP ${r.status}: ${r.text.slice(0, 300)}`);
        e.status = r.status;
        throw e;
      }
      return JSON.parse(r.text);
    },
    { label: "videos(创建任务)", maxRetries: 4 }
  );

  const videoId = res.video_id || res.videoId || res.id || res.task_id || res.taskId;
  if (!videoId) throw new Error(`创建视频任务响应缺少 id: ${JSON.stringify(res).slice(0, 300)}`);
  return { videoId, raw: res };
}

/** 在响应对象中尽力寻找视频 URL（兼容 video_url 等字段名不一致问题） */
function findVideoUrl(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (typeof obj === "string") return /^https?:\/\/\S+$/i.test(obj) && /\.mp4(\?|$)/i.test(obj) ? obj : null;
  const preferred = ["video_url", "videoUrl", "url", "output_url", "download_url"];
  for (const k of preferred) {
    const v = obj[k];
    if (typeof v === "string" && v.startsWith("http")) return v;
  }
  if (Array.isArray(obj.output)) {
    for (const v of obj.output) {
      const found = findVideoUrl(v);
      if (found) return found;
    }
  }
  for (const k of Object.keys(obj)) {
    if (preferred.includes(k)) continue;
    const found = findVideoUrl(obj[k]);
    if (found) return found;
  }
  return null;
}

/**
 * 轮询视频任务直至 completed / failed。
 * 推荐使用 video_id + model_name 查询（reference 模式必须带 model_name）。
 */
async function pollVideoTask({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  model = DEFAULT_VIDEO_MODEL,
  videoId,
  intervalMs = 4000,
  timeoutMs = 15 * 60 * 1000,
  onTick = null,
}) {
  const origin = new URL(baseUrl).origin;
  const queryUrl = `${origin}/agnesapi?video_id=${encodeURIComponent(videoId)}&model_name=${encodeURIComponent(model)}`;
  const start = Date.now();
  let lastStatus = "";
  let badCount = 0;
  while (Date.now() - start < timeoutMs) {
    const r = await rawRequest("GET", queryUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeoutMs: 60000,
    });
    if (r.status !== 200) {
      badCount++;
      // 持续非 200（如鉴权失败 401/403）不应静默空转到超时，连续 10 次后明确报错
      if (badCount >= 10) {
        throw new Error(`轮询持续失败（HTTP ${r.status}，连续 ${badCount} 次）: ${r.text.slice(0, 200)}`);
      }
      await sleep(intervalMs);
      continue;
    }
    badCount = 0;
    let data;
    try {
      data = JSON.parse(r.text);
    } catch {
      await sleep(intervalMs);
      continue;
    }
    const status = String(data.status || data.state || "").toLowerCase();
    if (status !== lastStatus) {
      lastStatus = status;
      console.log(`  [video] 任务 ${videoId} 状态: ${status || "unknown"}`);
    }
    if (onTick) onTick(data);
    if (status === "completed" || status === "succeeded" || status === "success") {
      const url = findVideoUrl(data);
      if (!url) throw new Error(`任务已完成但未找到视频 URL: ${r.text.slice(0, 400)}`);
      return { url, raw: data };
    }
    if (status === "failed" || status === "error") {
      throw new Error(`视频任务失败: ${r.text.slice(0, 400)}`);
    }
    await sleep(intervalMs);
  }
  throw new Error(`轮询超时（${Math.round(timeoutMs / 60000)} 分钟）: ${videoId}`);
}

// ---------------------------------------------------------------------------
// 下载
// ---------------------------------------------------------------------------

async function downloadToFile(url, destPath, { timeoutMs = 300000 } = {}) {
  const res = await rawRequest("GET", url, { timeoutMs });
  if (res.status !== 200) throw new Error(`下载失败 HTTP ${res.status}: ${url}`);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, res.buffer);
  return destPath;
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  DEFAULT_TEXT_MODEL,
  chatCompletion,
  generateImage,
  fileToDataUri,
  createVideoTask,
  pollVideoTask,
  downloadToFile,
  findVideoUrl,
  sleep,
  withRetry,
};
