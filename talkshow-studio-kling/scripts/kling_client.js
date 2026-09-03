/**
 * Kling（可灵）API 客户端（零依赖，Node.js 内置模块）
 *
 * 覆盖三个模态：
 *  - 文本：OpenAI 兼容 chat/completions（可灵不提供 LLM，分镜拆解走独立文本服务，默认 agnes-2.0-flash）
 *  - 图像：Kling Image 3.0（kling-v3，/v1/images/generations，异步任务，1K/2K）
 *  - 视频：Kling Video 3.0 Turbo（/image-to-video/kling-3.0-turbo，异步任务，720P/1080P，3–15s，原生音画同步）
 *
 * 文档依据：
 *  - https://klingai.com/document-api/api/image/3-0-omni/image-generation
 *  - https://klingai.com/document-api/api/video/3-0-turbo/image-to-video
 *
 * 鉴权（二选一）：
 *  1. 官方 JWT：KLING_ACCESS_KEY + KLING_SECRET_KEY（HS256 签名，Authorization: Bearer <jwt>）
 *  2. 代理服务明文 Key：KLING_API_KEY（Authorization: Bearer <key>）
 */

"use strict";

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_BASE_URL = "https://api-beijing.klingai.com"; // 新系统 API 网关（document-api 快速入门指定）
const DEFAULT_IMAGE_MODEL = "kling-v3";        // Kling Image 3.0（Omni）
const DEFAULT_VIDEO_MODEL = "kling-3.0-turbo"; // Kling Video 3.0 Turbo
const DEFAULT_TEXT_MODEL = "agnes-2.0-flash";  // 仅用于分镜拆解的 OpenAI 兼容文本模型
const DEFAULT_TEXT_BASE_URL = "https://api.agnes-ai.cn/v1";

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
        // 跟随 3xx 重定向（CDN 下载地址可能 302）；307/308 保持原方法，其余降级为 GET
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

/** 带指数退避的通用重试（5xx / 网络错误 / 429） */
async function withRetry(fn, { label = "API 调用", maxRetries = 5, baseDelayMs = 3000 } = {}) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const msg = String(err && err.message ? err.message : err);
      // 永久性业务错误（余额不足/额度用尽/鉴权）立即终止重试，避免无谓等待
      const permanent =
        err.code === 1102 || /balance not enough|余额不足|额度|Auth failed|api key not found|401|403/i.test(msg);
      if (permanent) break;
      const m = msg.match(/HTTP (\d{3})/);
      const status = (m && Number(m[1])) || (err && err.status) || null;
      const retryable =
        /503|429|timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|5\d\d 服务器/i.test(msg) ||
        (status != null && (status >= 500 || status === 429));
      if (!retryable || attempt === maxRetries) break;
      // 429 限流：固定等 20s（可灵限流多为并发/频率型），其余按指数退避
      const delay = status === 429 ? 20000 : baseDelayMs * Math.pow(2, attempt - 1);
      console.log(`  [retry] ${label} 第 ${attempt} 次失败（${msg.slice(0, 160)}），${Math.round(delay / 1000)}s 后重试...`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// 鉴权（官方 JWT / 代理明文 Key）
// ---------------------------------------------------------------------------

function b64u(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 按可灵官方规范签发 HS256 JWT（iss=AccessKey，exp/nbf 秒级时间戳） */
function signJwt({ accessKey, secretKey, expiresInSeconds = 1800 }) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const pay = b64u(JSON.stringify({ iss: accessKey, exp: now + expiresInSeconds, nbf: now - 5 }));
  const sig = b64u(crypto.createHmac("sha256", secretKey).update(`${head}.${pay}`).digest());
  return `${head}.${pay}.${sig}`;
}

/**
 * 统一鉴权对象：{ apiKey } 或 { accessKey, secretKey }
 * 返回每次请求可用的 Authorization 头。
 */
function authHeaders(auth) {
  if (!auth) throw new Error("未配置可灵鉴权信息（KLING_API_KEY 或 KLING_ACCESS_KEY/KLING_SECRET_KEY）");
  if (auth.apiKey) return { Authorization: `Bearer ${auth.apiKey}` };
  if (auth.accessKey && auth.secretKey) return { Authorization: `Bearer ${signJwt(auth)}` };
  throw new Error("可灵鉴权信息不完整：需要 KLING_API_KEY，或 KLING_ACCESS_KEY + KLING_SECRET_KEY");
}

/** 标准可灵响应包裹：{ code, message, request_id, data }；code≠0 视为业务失败 */
function unwrapKling(resp, label) {
  // code=0 为官方成功约定；code=200 为部分代理平台的 HTTP 风格成功码，一并放行
  if (resp && typeof resp.code === "number" && resp.code !== 0 && resp.code !== 200) {
    const e = new Error(`${label} 失败 code=${resp.code}: ${resp.message || JSON.stringify(resp).slice(0, 200)}`);
    e.code = resp.code;
    throw e;
  }
  return (resp && resp.data) || resp || {};
}

// ---------------------------------------------------------------------------
// 文本模型（分镜拆解，OpenAI 兼容接口；可灵不提供 LLM）
// ---------------------------------------------------------------------------

async function chatCompletion({ apiKey, baseUrl = DEFAULT_TEXT_BASE_URL, model = DEFAULT_TEXT_MODEL, messages, timeoutMs = 180000 }) {
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
// 图像模型：Kling Image 3.0（异步任务：创建 → 轮询）
// ---------------------------------------------------------------------------

/**
 * 创建图像生成任务。
 * @param {object} opts
 * @param {string}  [opts.image]           参考图（URL 或纯 Base64，不带 data: 前缀）→ 图生图；图生图不支持负向提示词
 * @param {string}  [opts.imageReference]  subject|face（face 需输入图仅含 1 张人脸）
 * @param {string}  [opts.resolution]      1k | 2k（默认 2k）
 * @param {string}  [opts.ratio]           16:9/9:16/1:1/4:3/3:4/3:2/2:3/21:9
 * @param {string}  [opts.negativePrompt]  仅文生图支持
 */
async function createImageTask({
  auth,
  baseUrl = DEFAULT_BASE_URL,
  model = DEFAULT_IMAGE_MODEL,
  prompt,
  negativePrompt = null,
  image = null,
  imageReference = null,
  resolution = "2k",
  ratio = "16:9",
  n = 1,
  timeoutMs = 120000,
}) {
  const body = {
    model_name: model,
    prompt,
    resolution,
    n,
    aspect_ratio: ratio,
    watermark: { enabled: false },
  };
  if (image) {
    body.image = image;
    if (imageReference) body.image_reference = imageReference;
  } else {
    if (negativePrompt) body.negative_prompt = negativePrompt;
  }

  const res = await withRetry(
    async () => {
      const r = await rawRequest("POST", `${baseUrl}/v1/images/generations`, {
        headers: authHeaders(auth),
        body: JSON.stringify(body),
        timeoutMs,
      });
      if (r.status !== 200 && r.status !== 201) {
        const e = new Error(`创建图像任务 HTTP ${r.status}: ${r.text.slice(0, 300)}`);
        e.status = r.status;
        throw e;
      }
      return unwrapKling(JSON.parse(r.text), "创建图像任务");
    },
    { label: "images/generations(创建任务)", maxRetries: 6 }
  );

  const taskId = res.task_id || res.taskId || res.id;
  if (!taskId) throw new Error(`创建图像任务响应缺少 task_id: ${JSON.stringify(res).slice(0, 300)}`);
  return { taskId, raw: res };
}

/** 在任务数据中尽力寻找图像 URL */
function findImageUrl(data) {
  const candidates = [];
  const tr = data && data.task_result ? data.task_result : data;
  if (tr) {
    if (Array.isArray(tr.images)) candidates.push(...tr.images);
    if (Array.isArray(tr.results)) candidates.push(...tr.results);
    if (Array.isArray(tr.resultUrls)) candidates.push(...tr.resultUrls.map((u) => ({ url: u })));
    if (typeof tr.url === "string") candidates.push({ url: tr.url });
  }
  for (const c of candidates) {
    const u = c && (c.url || c.image_url || c.imageUrl);
    if (typeof u === "string" && /^https?:\/\//i.test(u)) return u;
  }
  return null;
}

/**
 * 轮询图像任务直至成功/失败。
 * 官方状态：submitted / processing / succeeded（旧版 succeed）/ failed
 */
async function pollImageTask({
  auth,
  baseUrl = DEFAULT_BASE_URL,
  taskId,
  intervalMs = 3000,
  timeoutMs = 10 * 60 * 1000,
}) {
  const start = Date.now();
  let lastStatus = "";
  let badCount = 0;
  while (Date.now() - start < timeoutMs) {
    const r = await rawRequest("GET", `${baseUrl}/v1/images/generations/${encodeURIComponent(taskId)}`, {
      headers: authHeaders(auth),
      timeoutMs: 60000,
    });
    if (r.status !== 200) {
      // 永久性业务错误（JSON 含业务码，如额度/参数错误）直接终止；1201（任务暂未查到）保留重试以防最终一致延迟
      let bizCode = null, bizMsg = "";
      try {
        const j = JSON.parse(r.text);
        if (j && typeof j.code === "number") { bizCode = j.code; bizMsg = j.message || ""; }
      } catch (_) { /* 非 JSON（如网关 HTML），继续走重试计数 */ }
      if (bizCode != null && bizCode !== 1201) {
        const e = new Error(`图像任务查询业务错误 code=${bizCode}: ${bizMsg || r.text.slice(0, 200)}`);
        e.code = bizCode;
        throw e;
      }
      badCount++;
      if (badCount >= 10) throw new Error(`图像任务轮询持续失败（HTTP ${r.status}，连续 ${badCount} 次）: ${r.text.slice(0, 200)}`);
      await sleep(intervalMs);
      continue;
    }
    badCount = 0;
    let data;
    try {
      data = unwrapKling(JSON.parse(r.text), "查询图像任务");
    } catch (e) {
      if (e.code != null) throw e; // 业务错误（code≠0）直接抛出
      await sleep(intervalMs);
      continue;
    }
    const status = String(data.task_status || data.status || data.state || "").toLowerCase();
    if (status !== lastStatus) {
      lastStatus = status;
      console.log(`  [image] 任务 ${taskId} 状态: ${status || "unknown"}`);
    }
    if (["succeeded", "succeed", "success", "completed"].includes(status)) {
      const url = findImageUrl(data);
      if (!url) throw new Error(`图像任务已完成但未找到图片 URL: ${r.text.slice(0, 400)}`);
      return { url, raw: data };
    }
    if (["failed", "error"].includes(status)) {
      const msg = (data && (data.task_status_msg || data.failMsg || data.fail_msg)) || "";
      throw new Error(`图像任务失败: ${msg || r.text.slice(0, 400)}`);
    }
    await sleep(intervalMs);
  }
  throw new Error(`图像任务轮询超时（${Math.round(timeoutMs / 60000)} 分钟）: ${taskId}`);
}

/**
 * 生成一张图像并返回 URL（创建 + 轮询的一站式封装）。
 * @param {string} [opts.image] 参考图（URL 或纯 Base64）→ 图生图
 */
async function generateImage(opts) {
  const { taskId } = await createImageTask(opts);
  return await pollImageTask({ auth: opts.auth, baseUrl: opts.baseUrl, taskId });
}

/** 本地文件 → 纯 Base64 字符串（可灵图像接口要求：不带 data:image/... 前缀） */
function fileToBase64(filePath) {
  return fs.readFileSync(filePath).toString("base64");
}

/** 兼容旧调用习惯：本地文件 → dataURI 仅用于文本场景；可灵参考图需纯 Base64 */
function fileToDataUri(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${fileToBase64(filePath)}`;
}

// ---------------------------------------------------------------------------
// 视频模型：Kling Video 3.0 Turbo（异步任务：创建 → 轮询）
// ---------------------------------------------------------------------------

/**
 * 创建图生视频任务（Kling 3.0 Turbo）。
 *
 * 请求体采用可灵 3.0 系列统一「素材合集」结构：
 *   input.prompts / input.first_frame + config.quality / config.duration + watermark
 *
 * @param {object} opts
 * @param {string}  opts.prompt      提示词（含台词 → 原生音画同步）
 * @param {number}  opts.seconds     时长 3–15s
 * @param {string}  [opts.quality]   720p（默认）| 1080p
 * @param {string}  [opts.firstFrame] 首帧图 URL（.jpg/.jpeg/.png，≤50MB，≥300px，宽高比 1:2.5~2.5:1）
 */
async function createVideoTask({
  auth,
  baseUrl = DEFAULT_BASE_URL,
  model = DEFAULT_VIDEO_MODEL,
  prompt,
  seconds = "5",
  quality = "720p",
  firstFrame = null,
  timeoutMs = 120000,
}) {
  const duration = Math.max(3, Math.min(15, parseInt(seconds, 10) || 5));
  const input = { prompts: [{ type: "prompt", content: prompt }] };
  if (firstFrame) input.first_frame = [{ type: "first_frame", url: firstFrame }];
  const body = {
    input,
    config: { quality: String(quality).toLowerCase(), duration },
    watermark: { enabled: false },
  };

  const res = await withRetry(
    async () => {
      const r = await rawRequest("POST", `${baseUrl}/image-to-video/${encodeURIComponent(model)}`, {
        headers: authHeaders(auth),
        body: JSON.stringify(body),
        timeoutMs,
      });
      if (r.status !== 200 && r.status !== 201) {
        const e = new Error(`创建视频任务 HTTP ${r.status}: ${r.text.slice(0, 300)}`);
        e.status = r.status;
        throw e;
      }
      return unwrapKling(JSON.parse(r.text), "创建视频任务");
    },
    { label: "image-to-video(创建任务)", maxRetries: 4 }
  );

  const taskId = res.task_id || res.taskId || res.id;
  if (!taskId) throw new Error(`创建视频任务响应缺少 task_id: ${JSON.stringify(res).slice(0, 300)}`);
  return { taskId, raw: res };
}

/** 在任务数据中尽力寻找视频 URL（兼容 video_url 等字段名差异） */
function findVideoUrl(data) {
  if (!data || typeof data !== "object") return null;
  if (typeof data === "string") return /^https?:\/\/\S+$/i.test(data) ? data : null;
  const tr = data.task_result ? data.task_result : data;
  const preferred = ["video_url", "videoUrl", "url", "output_url", "download_url"];
  if (Array.isArray(tr && tr.videos)) {
    for (const v of tr.videos) {
      for (const k of preferred) {
        if (v && typeof v[k] === "string" && v[k].startsWith("http")) return v[k];
      }
    }
  }
  for (const k of preferred) {
    const v = tr ? tr[k] : null;
    if (typeof v === "string" && v.startsWith("http")) return v;
  }
  if (Array.isArray(tr && tr.output)) {
    for (const v of tr.output) {
      const found = findVideoUrl(v);
      if (found) return found;
    }
  }
  for (const k of Object.keys(tr || {})) {
    if (preferred.includes(k)) continue;
    const found = findVideoUrl(tr[k]);
    if (found) return found;
  }
  return null;
}

/**
 * 轮询视频任务直至成功/失败。
 * 官方状态：submitted / processing / succeeded / failed
 * 查询路径：GET /tasks/{task_id}（404 时回退 /v1/tasks/{task_id}，兼容新旧网关）
 */
async function pollVideoTask({
  auth,
  baseUrl = DEFAULT_BASE_URL,
  taskId,
  intervalMs = 6000,
  timeoutMs = 25 * 60 * 1000,
}) {
  const headers = authHeaders(auth);
  const start = Date.now();
  let lastStatus = "";
  let badCount = 0;
  let queryPath = `/tasks/${encodeURIComponent(taskId)}`;
  while (Date.now() - start < timeoutMs) {
    const r = await rawRequest("GET", `${baseUrl}${queryPath}`, { headers, timeoutMs: 60000 });
    if (r.status === 404 && queryPath.startsWith("/tasks/")) {
      // 网关差异回退：旧版统一任务查询路径
      queryPath = `/v1/tasks/${encodeURIComponent(taskId)}`;
      await sleep(intervalMs);
      continue;
    }
    if (r.status !== 200) {
      // 永久性业务错误（JSON 含业务码）直接终止；非 JSON（如网关 404 HTML）保留重试计数
      let bizCode = null, bizMsg = "";
      try {
        const j = JSON.parse(r.text);
        if (j && typeof j.code === "number") { bizCode = j.code; bizMsg = j.message || ""; }
      } catch (_) { /* 非 JSON，走重试计数 */ }
      if (bizCode != null && bizCode !== 1201) {
        const e = new Error(`视频任务查询业务错误 code=${bizCode}: ${bizMsg || r.text.slice(0, 200)}`);
        e.code = bizCode;
        throw e;
      }
      badCount++;
      if (badCount >= 10) throw new Error(`视频任务轮询持续失败（HTTP ${r.status}，连续 ${badCount} 次）: ${r.text.slice(0, 200)}`);
      await sleep(intervalMs);
      continue;
    }
    badCount = 0;
    let data;
    try {
      data = unwrapKling(JSON.parse(r.text), "查询视频任务");
    } catch (e) {
      if (e.code != null) throw e;
      await sleep(intervalMs);
      continue;
    }
    const status = String(data.task_status || data.status || data.state || "").toLowerCase();
    if (status !== lastStatus) {
      lastStatus = status;
      console.log(`  [video] 任务 ${taskId} 状态: ${status || "unknown"}`);
    }
    if (["succeeded", "succeed", "success", "completed"].includes(status)) {
      const url = findVideoUrl(data);
      if (!url) throw new Error(`视频任务已完成但未找到视频 URL: ${r.text.slice(0, 400)}`);
      return { url, raw: data };
    }
    if (["failed", "error"].includes(status)) {
      const msg = (data && (data.task_status_msg || data.failMsg || data.fail_msg)) || "";
      throw new Error(`视频任务失败: ${msg || r.text.slice(0, 400)}`);
    }
    await sleep(intervalMs);
  }
  throw new Error(`视频任务轮询超时（${Math.round(timeoutMs / 60000)} 分钟）: ${taskId}`);
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
  DEFAULT_TEXT_BASE_URL,
  signJwt,
  authHeaders,
  chatCompletion,
  createImageTask,
  pollImageTask,
  generateImage,
  findImageUrl,
  findVideoUrl,
  createVideoTask,
  pollVideoTask,
  downloadToFile,
  fileToBase64,
  fileToDataUri,
  sleep,
  withRetry,
};
