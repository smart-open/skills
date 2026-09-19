#!/usr/bin/env node
/**
 * qa_shots.js — 分镜视频多模态自动质检（Kling 版，借鉴 short-drama-studio qa_frames.py 方法论）
 *
 * 与 agnes 版（talkshow-studio）的差异：
 *   - Kling 流水线只有一张「演员+舞台合成图」作全片首帧基准（单图参考适配），
 *     故质检基准 = stageComposite 一张图；无独立定妆照时以合成图人物为外貌基准。
 *   - 质检用多模态文本模型走 OpenAI 兼容接口：--qa-api-key/TEXT_API_KEY/AGNES_API_KEY，
 *     地址 --qa-base-url/TEXT_BASE_URL（与 talkshow_produce.js 的分镜拆解模型配置一致）。
 *
 * 判定维度（与 agnes 版一致）：
 *   硬性通过：face_match / feature_match / hair_match / outfit_match / mic_check / scene_match
 *   硬性排除：extra_person / extra_hands / watermark_or_text
 *   软性参考：emotion_match / reason / suggestion
 *
 * 用法：
 *   node qa_shots.js --work-dir work/20260918-xxxx [--only S03,S05] [--delete-bad] [--offline]
 *
 * 坏镜头处理：视频归档到 videos/versions/（与 --regenerate 同格式），清 state 后
 * `--resume --regenerate <n>` 补拍。输出 work/shot_qa.json，存在失败退出码 2。
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const ffmpegTools = require("./ffmpeg_tools");

const DEFAULT_QA_BASE_URL = "https://api.agnes-ai.cn/v1";
const DEFAULT_QA_MODEL = "agnes-3.0-flash";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { args._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) { args[key] = true; }
    else { args[key] = next; i++; }
  }
  return args;
}

function printHelp() {
  console.log(`
=== qa_shots.js — 分镜视频多模态自动质检（Kling 版）===

用法：
  node qa_shots.js --work-dir <dir> [--only S01,S03] [--delete-bad] [--offline]
                   [--qa-api-key <key>] [--qa-base-url <url>] [--qa-model <model>] [--frames 2]

选项：
  --work-dir <dir>     必填。talkshow_produce.js 的工作目录（含 state.json）
  --only <ids>         逗号分隔的镜头 ID，默认全部已完成镜头
  --delete-bad         不合格镜头：视频归档到 videos/versions/ 并清 state
  --offline            不调 API，只打印质检清单（dry-run）
  --qa-api-key <key>   质检模型 Key（默认环境变量 TEXT_API_KEY，回退 AGNES_API_KEY）
  --qa-base-url <url>  默认 https://api.agnes-ai.cn/v1（可用 TEXT_BASE_URL）
  --qa-model <model>   默认 agnes-3.0-flash
  --frames <n>         每镜抽帧数（默认 2）

输出：work/shot_qa.json。存在失败镜头时退出码 2。
`);
}

function resolveQaKey(cli) {
  if (cli["qa-api-key"] && cli["qa-api-key"] !== true) return String(cli["qa-api-key"]).trim();
  if (process.env.TEXT_API_KEY && process.env.TEXT_API_KEY.trim()) return process.env.TEXT_API_KEY.trim();
  if (process.env.AGNES_API_KEY && process.env.AGNES_API_KEY.trim()) return process.env.AGNES_API_KEY.trim();
  console.error("缺少质检模型 Key：--qa-api-key 或环境变量 TEXT_API_KEY / AGNES_API_KEY（--offline 可先看清单）");
  process.exit(2);
}

// ---------------------------------------------------------------------------
// OpenAI 兼容多模态调用（零依赖 https）
// ---------------------------------------------------------------------------

function chatCompletion({ apiKey, baseUrl = DEFAULT_QA_BASE_URL, model = DEFAULT_QA_MODEL, messages, timeoutMs = 180000 }) {
  const https = require("https");
  const http = require("http");
  return new Promise((resolve, reject) => {
    const u = new URL(baseUrl.replace(/\/$/, "") + "/chat/completions");
    const lib = u.protocol === "https:" ? https : http;
    const payload = Buffer.from(JSON.stringify({ model, messages, temperature: 0.2 }), "utf8");
    const req = lib.request(
      {
        method: "POST", hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search,
        headers: { "Content-Type": "application/json", "Content-Length": payload.length, Authorization: `Bearer ${apiKey}` },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
          try {
            const j = JSON.parse(text);
            resolve((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "");
          } catch (e) { reject(e); }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("请求超时")));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function fileToDataUri(fp) {
  const ext = path.extname(fp).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${fs.readFileSync(fp).toString("base64")}`;
}

// ---------------------------------------------------------------------------
// 归档（与 talkshow_produce.js 的 archiveOldVideo 完全同格式）
// ---------------------------------------------------------------------------

function archiveOldVideo(videosDir, oldPath) {
  try {
    const versionsDir = path.join(videosDir, "versions");
    fs.mkdirSync(versionsDir, { recursive: true });
    const base = path.basename(oldPath, ".mp4");
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    fs.renameSync(oldPath, path.join(versionsDir, `${base}_${ts}.mp4`));
    const files = fs.readdirSync(versionsDir)
      .filter((f) => f.startsWith(base + "_") && f.endsWith(".mp4"))
      .sort()
      .reverse();
    for (const f of files.slice(3)) {
      try { fs.unlinkSync(path.join(versionsDir, f)); } catch { /* best-effort */ }
    }
    console.log(`  [归档] 坏片 → videos/versions/${base}_${ts}.mp4（保留最近 3 版）`);
  } catch (e) {
    console.error(`  [归档失败] ${oldPath}: ${e.message}`);
  }
}

function extractFrames(videoPath, outDir, shotId, count) {
  const info = ffmpegTools.probe(videoPath);
  const dur = info.durationSec || 0;
  const frames = [];
  const points = count === 1 ? [0.5] : count === 2 ? [0.3, 0.7] : [0.25, 0.5, 0.75];
  for (let i = 0; i < points.length; i++) {
    const t = Math.max(0.3, dur * points[i]);
    const out = path.join(outDir, `${shotId}_f${i + 1}.jpg`);
    try {
      execFileSync("ffmpeg", ["-y", "-ss", String(t.toFixed(2)), "-i", videoPath, "-frames:v", "1", "-q:v", "3", out],
        { stdio: "pipe", timeout: 60000 });
      if (fs.existsSync(out)) frames.push(out);
    } catch (e) {
      console.warn(`  [抽帧失败] ${shotId} @${t.toFixed(1)}s: ${String(e.message).slice(0, 120)}`);
    }
  }
  return frames;
}

// ---------------------------------------------------------------------------
// 质检判定
// ---------------------------------------------------------------------------

const SYSTEM = (
  "你是脱口秀视频的 QC 监督，负责逐镜质检 AI 生成视频的「人物一致性」与「画面合规」。"
  + "输入：<Picture 1> 为「演员+舞台合成图」（人物外貌与场景的唯一基准，也是全片首帧），"
  + "其后为同一镜头视频的抽帧（按时间顺序）。"
  + "判定原则：人物 = 抽帧中的演员与基准图中的人物脸型五官/发型发色/妆容/服装/配饰一致，"
  + "基准图中的强识别特征（如痣、疤）必须原样存在，不得变脸、不得美化漂移，与首帧画面对应；"
  + "画面 = 恰好一支黑色立式麦克风（带麦架），不得出现手持麦克风、第二支麦克风；"
  + "舞台背景与基准图一致（机位变化导致的透视差异不算）；无多余人物、无多指/畸形手、无水印乱码文字。"
  + "逐项判定 true/false，给出证据与一句修改建议。只输出合法 JSON，不要 Markdown 代码块。"
  + "JSON 字段：face_match、feature_match、hair_match、outfit_match、mic_check、scene_match、"
  + "extra_person、extra_hands、watermark_or_text、emotion_match、reason、suggestion。"
  + "emotion_match=true 表示画面情绪与用户消息中给定的预期情绪大体相符（软性项，仅参考）。"
);

function parseJsonLoose(text) {
  const t = String(text || "").replace(/```json|```/g, "").trim();
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("响应中未找到 JSON: " + t.slice(0, 200));
  return JSON.parse(m[0]);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help || cli.h || !cli["work-dir"] || cli["work-dir"] === true) {
    printHelp();
    process.exit(cli.help ? 0 : 2);
  }

  const workDir = path.resolve(String(cli["work-dir"]));
  const statePath = path.join(workDir, "state.json");
  if (!fs.existsSync(statePath)) {
    console.error(`找不到 ${statePath}（--work-dir 应为 talkshow_produce.js 的工作目录）`);
    process.exit(2);
  }
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));

  const stageComp = state.assets && state.assets.stageComposite && state.assets.stageComposite.url;
  if (!stageComp) {
    console.error("state.json 缺少 assets.stageComposite（先跑 talkshow_produce.js 阶段一）");
    process.exit(2);
  }

  const shots = (state.storyboard && state.storyboard.shots) || [];
  const shotById = new Map(shots.map((s) => [s.id, s]));
  const propDesc = state.inputs && state.inputs.propDesc ? String(state.inputs.propDesc) : "";
  const nFrames = Math.max(1, Math.min(3, Number(cli.frames) || 2));

  const wanted = cli.only && cli.only !== true
    ? new Set(String(cli.only).split(",").map((s) => s.trim()))
    : null;
  const items = state.videos.filter((v) => {
    if (!v.ok || !v.videoPath || !fs.existsSync(v.videoPath)) return false;
    return !wanted || wanted.has(v.shotId);
  });
  if (!items.length) {
    console.log("没有可质检的已完成镜头（确认 state.videos 中有 ok=true 的条目）");
    process.exit(0);
  }

  console.log(`\n=== 分镜视频质检（${items.length} 镜 × ${nFrames} 帧，模型 ${cli["qa-model"] || DEFAULT_QA_MODEL}）===`);

  const refsDir = path.join(workDir, "qa_refs");
  fs.mkdirSync(refsDir, { recursive: true });
  let refDataUri = null;
  let apiKey = null;
  if (!cli.offline) {
    apiKey = resolveQaKey(cli);
    const p = path.join(refsDir, "stage_composite.jpg");
    if (!fs.existsSync(p)) {
      const https = require("https");
      const http = require("http");
      await new Promise((resolve, reject) => {
        const client = stageComp.startsWith("https") ? https : http;
        client.get(stageComp, { timeout: 300000 }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const c2 = res.headers.location.startsWith("https") ? https : http;
            return c2.get(res.headers.location, (r2) => {
              const chunks = [];
              r2.on("data", (c) => chunks.push(c));
              r2.on("end", () => { fs.writeFileSync(p, Buffer.concat(chunks)); resolve(); });
            }).on("error", reject);
          }
          if (res.statusCode !== 200) return reject(new Error("下载基准图失败 HTTP " + res.statusCode));
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => { fs.writeFileSync(p, Buffer.concat(chunks)); resolve(); });
        }).on("error", reject);
      });
    }
    refDataUri = fileToDataUri(p);
  }

  const framesDir = path.join(workDir, "qa_frames");
  fs.mkdirSync(framesDir, { recursive: true });

  const HARD_TRUE_BASE = ["face_match", "feature_match", "hair_match", "outfit_match", "mic_check", "scene_match"];
  const HARD_FALSE = ["extra_person", "extra_hands", "watermark_or_text"];
  const report = { checked: [], passed: [], failed: [] };
  const baseUrl = cli["qa-base-url"] && cli["qa-base-url"] !== true ? String(cli["qa-base-url"])
    : (process.env.TEXT_BASE_URL || DEFAULT_QA_BASE_URL);
  const qaModel = cli["qa-model"] && cli["qa-model"] !== true ? String(cli["qa-model"]) : DEFAULT_QA_MODEL;
  let dirty = false;

  for (let i = 0; i < items.length; i++) {
    const v = items[i];
    const shot = shotById.get(v.shotId) || { id: v.shotId, text: "", emotion: "" };
    const entry = { shot: v.shotId, video: v.videoPath };

    const frameFiles = extractFrames(v.videoPath, framesDir, v.shotId, nFrames);
    if (!frameFiles.length) {
      entry.verdict = "error"; entry.reason = "抽帧失败（ffmpeg 不可用或视频损坏）";
      report.failed.push(entry); report.checked.push(entry);
      console.log(`  [ERR] ${v.shotId}: 抽帧失败`);
      continue;
    }

    if (cli.offline) {
      entry.verdict = "pending"; entry.frames = frameFiles;
      report.checked.push(entry);
      console.log(`  [DRY] ${v.shotId} 将用 1 张基准图 + ${frameFiles.length} 帧做一致性质检`);
      continue;
    }

    const userText = [
      `请质检第 ${i + 1}/${items.length} 个分镜视频（${v.shotId}）。`,
      `台词：${shot.text || "（无）"}`,
      `预期情绪：${shot.emotion || "自然"}（emotion_match 为软性项，不参与硬判定）`,
      propDesc ? `预期道具：${propDesc}（prop_match 判定画面道具是否相符且无额外道具）` : "",
      "请按人物一致性与画面合规逐项判定并输出 JSON。",
    ].filter(Boolean).join("\n");

    const content = [
      { type: "text", text: userText },
      { type: "image_url", image_url: { url: refDataUri } },
      ...frameFiles.map((fp) => ({ type: "image_url", image_url: { url: fileToDataUri(fp) } })),
    ];

    try {
      const text = await chatCompletion({
        apiKey, baseUrl, model: qaModel,
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content }],
      });
      const verdict = parseJsonLoose(text);
      const hardTrueKeys = propDesc ? HARD_TRUE_BASE.concat("prop_match") : HARD_TRUE_BASE;
      const ok = hardTrueKeys.every((k) => verdict[k] === true) && HARD_FALSE.every((k) => verdict[k] === false);
      verdict._pass = ok;
      entry.verdict = ok ? "pass" : "fail";
      Object.assign(entry, verdict);
      report.checked.push(entry);
      if (ok) {
        report.passed.push(v.shotId);
        console.log(`  [PASS] ${v.shotId}`);
      } else {
        report.failed.push(entry);
        console.log(`  [FAIL] ${v.shotId}: ${verdict.reason || ""} → ${verdict.suggestion || ""}`);
        if (cli["delete-bad"]) {
          archiveOldVideo(path.join(workDir, "videos"), v.videoPath);
          v.videoPath = null; v.url = null; v.taskId = null; v.durationSec = 0; v.ok = false;
          dirty = true;
          console.log(`         已归档并清 state，重跑 --resume --regenerate ${v.index + 1} 可补拍`);
        }
      }
    } catch (e) {
      entry.verdict = "error"; entry.reason = String(e.message || e).slice(0, 300);
      report.failed.push(entry); report.checked.push(entry);
      console.log(`  [ERR] ${v.shotId}: ${entry.reason}`);
    }
  }

  if (dirty) fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");

  const out = path.join(workDir, "shot_qa.json");
  fs.writeFileSync(out, JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: { checked: report.checked.length, passed: report.passed.length, failed: report.failed.length },
    ...report,
  }, null, 2), "utf8");
  console.log(`\n报告：${out}  通过 ${report.passed.length}，失败 ${report.failed.length}`);
  if (report.failed.length && !cli.offline) process.exit(2);
}

main().catch((e) => {
  console.error("质检中断：", e.message || e);
  process.exit(1);
});
