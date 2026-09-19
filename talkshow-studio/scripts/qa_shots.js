#!/usr/bin/env node
/**
 * qa_shots.js — 分镜视频多模态自动质检（借鉴 short-drama-studio qa_frames.py 方法论）
 *
 * 背景：跨镜头人物一致性最容易翻车。视频生成后，用 agnes-3.0-flash 的图像输入能力，
 * 把「定妆照 + 舞台合成图 + 待检视频抽帧」一起喂给视觉模型，按固定 JSON 维度逐项判定，
 * 自动找出变脸/换装/麦克风穿帮/水印乱码的坏镜头，输出报告；--delete-bad 可把坏镜头
 * 归档（videos/versions/，与 --regenerate 的归档格式一致）并清 state，随后
 * `--resume --regenerate <n>` 即可补拍。
 *
 * 判定维度：
 *   硬性通过（必须 true）：face_match / feature_match（强识别特征如痣疤）/ hair_match /
 *     outfit_match / mic_check（恰好一支黑色立式麦克风）/ scene_match（舞台与合成图一致）
 *     [有 --prop 时追加 prop_match]
 *   硬性排除（必须 false）：extra_person / extra_hands（多指畸形手）/ watermark_or_text
 *   软性参考（不影响判定）：emotion_match / reason / suggestion
 *
 * 用法：
 *   node qa_shots.js --work-dir work/20260918-xxxx                     # 质检全部已完成分镜
 *   node qa_shots.js --work-dir ... --only S03,S05                     # 只查某些镜头
 *   node qa_shots.js --work-dir ... --delete-bad                       # 坏镜头归档 + 清 state，等待补拍
 *   node qa_shots.js --work-dir ... --offline                          # 不调 API，打印将检查的清单（dry-run）
 *
 * API Key：--api-key > 环境变量 AGNES_API_KEY（与 talkshow_produce.js 相同）。
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const agnes = require("./agnes_client");
const ffmpegTools = require("./ffmpeg_tools");

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
=== qa_shots.js — 分镜视频多模态自动质检 ===

用法：
  node qa_shots.js --work-dir <dir> [--only S01,S03] [--delete-bad] [--offline]
                   [--api-key <key>] [--base-url <url>] [--qa-model <model>]
                   [--frames 2] [--expression-threshold 0]

选项：
  --work-dir <dir>     必填。talkshow_produce.js 的工作目录（含 state.json）
  --only <ids>         逗号分隔的镜头 ID（如 S03,S05），默认全部已完成镜头
  --delete-bad         不合格镜头：视频归档到 videos/versions/ 并清 state（配合 --resume --regenerate 补拍）
  --offline            不调 API，只打印质检清单（dry-run）
  --api-key <key>      Agnes API Key（默认环境变量 AGNES_API_KEY）
  --base-url <url>     默认 https://api.agnes-ai.cn/v1
  --qa-model <model>   质检用的多模态模型（默认 agnes-3.0-flash）
  --frames <n>         每镜抽帧数（默认 2，取时长 30%/70% 处）

输出：work/shot_qa.json（逐镜判定 + 汇总）。存在失败镜头时退出码 2。
`);
}

function resolveApiKey(cli) {
  if (cli["api-key"] && cli["api-key"] !== true) return String(cli["api-key"]).trim();
  if (process.env.AGNES_API_KEY && process.env.AGNES_API_KEY.trim()) return process.env.AGNES_API_KEY.trim();
  console.error("缺少 Agnes API Key：用 --api-key 或环境变量 AGNES_API_KEY（--offline 可先看清单）");
  process.exit(2);
}

// ---------------------------------------------------------------------------
// 归档（与 talkshow_produce.js 的 archiveOldVideo 完全同格式，共用 videos/versions/）
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

// ---------------------------------------------------------------------------
// 抽帧
// ---------------------------------------------------------------------------

function extractFrames(videoPath, outDir, shotId, count) {
  const info = ffmpegTools.probe(videoPath);
  const dur = info.durationSec || 0;
  const frames = [];
  const points = count === 1 ? [0.5] : count === 2 ? [0.3, 0.7] : [0.25, 0.5, 0.75];
  for (let i = 0; i < points.length; i++) {
    const t = Math.max(0.3, dur * points[i]);
    const out = path.join(outDir, `${shotId}_f${i + 1}.jpg`);
    try {
      execFileSync("ffmpeg", [
        "-y", "-ss", String(t.toFixed(2)), "-i", videoPath,
        "-frames:v", "1", "-q:v", "3", out,
      ], { stdio: "pipe", timeout: 60000 });
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
  + "输入：<Picture 1> 为演员定妆照（外貌唯一基准），<Picture 2> 为舞台合成图（场景唯一基准），"
  + "其后为同一镜头视频的抽帧（按时间顺序）。"
  + "判定原则：人物 = 抽帧中的演员与定妆照的脸型五官/发型发色/妆容/服装/配饰一致，"
  + "定妆照中的强识别特征（如痣、疤）必须原样存在，不得变脸、不得美化漂移；"
  + "画面 = 恰好一支黑色立式麦克风（带麦架），不得出现手持麦克风、第二支麦克风；"
  + "舞台背景与合成图一致（机位变化导致的透视差异不算）；无多余人物、无多指/畸形手、无水印乱码文字。"
  + "逐项判定 true/false，给出证据与一句修改建议。只输出合法 JSON，不要 Markdown 代码块。"
  + "JSON 字段：face_match、feature_match、hair_match、outfit_match、mic_check、scene_match、"
  + "extra_person、extra_hands、watermark_or_text、emotion_match、reason、suggestion。"
  + "emotion_match=true 表示画面情绪与用户消息中给定的预期情绪大体相符（软性项，仅参考）。"
);

function shotUserText(state, shot, idx, total, propDesc) {
  const lines = [
    `请质检第 ${idx + 1}/${total} 个分镜视频（${shot.id}）。`,
    `台词：${shot.text || "（无）"}`,
    `预期情绪：${shot.emotion || "自然"}（emotion_match 为软性项，不参与硬判定）`,
  ];
  if (propDesc) lines.push(`预期道具：${propDesc}（prop_match 判定：画面中的道具是否与之相符且无额外道具）`);
  lines.push("请按人物一致性（face/feature/hair/outfit）与画面合规（mic/scene/extra/watermark）逐项判定并输出 JSON。");
  return lines.join("\n");
}

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

  const modelRef = state.assets && state.assets.modelReference && state.assets.modelReference.url;
  const stageComp = state.assets && state.assets.stageComposite && state.assets.stageComposite.url;
  if (!stageComp) {
    console.error("state.json 缺少 assets.stageComposite（先跑 talkshow_produce.js 阶段一）");
    process.exit(2);
  }
  if (!modelRef) console.warn("  [WARN] 缺少 modelReference（定妆照），人物一致性判定将仅以舞台合成图为基准");

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

  console.log(`\n=== 分镜视频质检（${items.length} 镜 × ${nFrames} 帧，模型 ${cli["qa-model"] || "agnes-3.0-flash"}）===`);

  // 参考图本地化（避免走会过期的 CDN URL）
  const refsDir = path.join(workDir, "qa_refs");
  fs.mkdirSync(refsDir, { recursive: true });
  const refImages = [];
  let apiKey = null;
  if (!cli.offline) {
    apiKey = resolveApiKey(cli);
    if (modelRef) {
      const p = path.join(refsDir, "model_reference.jpg");
      if (!fs.existsSync(p)) await agnes.downloadToFile(modelRef, p);
      refImages.push(agnes.fileToDataUri(p));
    }
    const p2 = path.join(refsDir, "stage_composite.jpg");
    if (!fs.existsSync(p2)) await agnes.downloadToFile(stageComp, p2);
    refImages.push(agnes.fileToDataUri(p2));
  }

  const framesDir = path.join(workDir, "qa_frames");
  fs.mkdirSync(framesDir, { recursive: true });

  const HARD_TRUE_BASE = ["face_match", "feature_match", "hair_match", "outfit_match", "mic_check", "scene_match"];
  const HARD_FALSE = ["extra_person", "extra_hands", "watermark_or_text"];
  const report = { checked: [], passed: [], failed: [] };
  const baseUrl = cli["base-url"] && cli["base-url"] !== true ? String(cli["base-url"]) : agnes.DEFAULT_BASE_URL;
  const qaModel = cli["qa-model"] && cli["qa-model"] !== true ? String(cli["qa-model"]) : agnes.DEFAULT_TEXT_MODEL;
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
      entry.verdict = "pending";
      entry.frames = frameFiles;
      report.checked.push(entry);
      console.log(`  [DRY] ${v.shotId} 将用 ${refImages.length + frameFiles.length} 张图做一致性质检（参考图 + 抽帧）`);
      continue;
    }

    const content = [
      { type: "text", text: shotUserText(state, shot, i, items.length, propDesc) },
      ...refImages.map((url) => ({ type: "image_url", image_url: { url } })),
      ...frameFiles.map((fp) => ({ type: "image_url", image_url: { url: agnes.fileToDataUri(fp) } })),
    ];

    try {
      const text = await agnes.chatCompletion({
        apiKey, baseUrl, model: qaModel,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content },
        ],
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
          v.videoPath = null; v.url = null; v.videoId = null; v.durationSec = 0; v.ok = false;
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
  console.log(`\n报告：${out}  通过 ${report.passed.length}，失败 ${report.failed.length}`
    + `${cli["delete-bad"] && report.failed.length ? "（坏镜头已归档，等待补拍）" : ""}`);
  if (report.failed.length && !cli.offline) process.exit(2);
}

main().catch((e) => {
  console.error("质检中断：", e.message || e);
  process.exit(1);
});
