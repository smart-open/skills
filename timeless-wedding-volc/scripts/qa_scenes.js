#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * qa_scenes.js — 朝代场景帧多模态自动质检（借鉴 short-drama-studio qa_frames.py 方法论）
 *
 * 背景：双人场景帧是新郎/新娘人脸漂移的高发点。用 Ark doubao 视觉模型把
 * 「男方定妆照 + 女方定妆照 + 待检场景帧」一起喂给它，按固定 JSON 维度逐项判定，
 * 自动找出变脸/换人/朝代不符/水印乱码的坏帧；--delete-bad 把坏帧归档到
 * scenes/versions/（保留 3 版）并清 state.scenes[id]，重跑主程序即可补缺。
 *
 * 判定维度：
 *   硬性通过：couple_present（新郎新娘都出场）/ face_match_male / face_match_female
 *     （与各自定妆照一致，强识别特征保留）/ outfit_match（婚礼服饰符合朝代）/ scene_match（场景与朝代相符）
 *   硬性排除：extra_person（第三者入镜）/ watermark_or_text
 *   软性参考：composition_match（构图美感）/ reason / suggestion
 *
 * 用法：
 *   node qa_scenes.js --work-dir work/xxxx [--only tang,song] [--delete-bad] [--offline]
 *                     [--api-key <key>] [--qa-model doubao-seed-1-6-flash-250615]
 *
 * API Key：--api-key > 环境变量 ARK_API_KEY。输出 work/scene_qa.json，存在失败退出码 2。
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { postChatCompletion } = require("./ark_client");
const { DYNASTIES } = require("./dynasties");

const DEFAULT_QA_MODEL = "doubao-seed-1-6-flash-250615";

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
=== qa_scenes.js — 朝代场景帧自动质检 ===

用法：
  node qa_scenes.js --work-dir <dir> [--only <dynasty-ids>] [--delete-bad] [--offline]
                    [--api-key <key>] [--qa-model <model>]

选项：
  --work-dir <dir>   必填。timeless_wedding_volc.js 的工作目录（含 state.json）
  --only <ids>       逗号分隔的朝代 id（如 tang,ming），默认全部已生成场景帧
  --delete-bad       不合格场景帧：归档到 scenes/versions/ 并清 state.scenes[id]（重跑补缺）
  --offline          不调 API，只打印质检清单（dry-run）
  --api-key <key>    Ark API Key（默认环境变量 ARK_API_KEY）
  --qa-model <model> 视觉质检模型（默认 doubao-seed-1-6-flash-250615）

输出：work/scene_qa.json。存在失败时退出码 2。
`);
}

// ---------------------------------------------------------------------------
// 归档（与 skills 的版本归档约定一致：versions/ 保留 3 版）
// ---------------------------------------------------------------------------

function archiveOldFrame(scenePath) {
  try {
    const dir = path.dirname(scenePath);
    const versionsDir = path.join(dir, "versions");
    fs.mkdirSync(versionsDir, { recursive: true });
    const ext = path.extname(scenePath);
    const base = path.basename(scenePath, ext);
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    fs.renameSync(scenePath, path.join(versionsDir, `${base}_${ts}${ext}`));
    const files = fs.readdirSync(versionsDir)
      .filter((f) => f.startsWith(base + "_") && f.endsWith(ext))
      .sort().reverse();
    for (const f of files.slice(3)) {
      try { fs.unlinkSync(path.join(versionsDir, f)); } catch { /* best-effort */ }
    }
    console.log(`  [归档] 坏帧 → scenes/versions/${base}_${ts}${ext}（保留最近 3 版）`);
  } catch (e) {
    console.error(`  [归档失败] ${scenePath}: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 质检判定
// ---------------------------------------------------------------------------

const SYSTEM = (
  "你是古装婚礼影像的 QC 监督，负责逐帧质检 AI 生成场景图的「人物一致性」与「朝代合规」。"
  + "输入：<Picture 1> 为新郎定妆照，<Picture 2> 为新娘定妆照（外貌唯一基准），"
  + "<Picture 3> 为待检的双人婚礼场景帧。"
  + "判定原则：couple_present = 画面中同时出现一男一女两位新人且与参考图性别对应；"
  + "face_match_male / face_match_female = 各自与定妆照的脸型五官/发型/肤色一致，"
  + "定妆照中的强识别特征（痣、疤等）必须原样保留，不得变脸、不得美化漂移；"
  + "outfit_match = 两人服饰为该朝代婚礼装束且形制合理；"
  + "scene_match = 场景环境与该朝代婚礼相符（建筑/陈设/光线），无现代元素穿帮；"
  + "extra_person = 出现新郎新娘之外的第三个人物；watermark_or_text = 出现水印或乱码文字；"
  + "composition_match = 构图完整、人物比例正常、无肢体畸形（软性项）。"
  + "逐项判定 true/false，给出证据与一句修改建议。只输出合法 JSON，不要 Markdown 代码块。"
  + "JSON 字段：couple_present、face_match_male、face_match_female、outfit_match、scene_match、"
  + "extra_person、watermark_or_text、composition_match、reason、suggestion。"
);

function parseJsonLoose(text) {
  const t = String(text || "").replace(/```json|```/g, "").trim();
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("响应中未找到 JSON: " + t.slice(0, 200));
  return JSON.parse(m[0]);
}

function fileToDataUri(fp) {
  const ext = path.extname(fp).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${fs.readFileSync(fp).toString("base64")}`;
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
    console.error(`找不到 ${statePath}（--work-dir 应为 timeless_wedding_volc.js 的工作目录）`);
    process.exit(2);
  }
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));

  if (!state.scenes || !Object.keys(state.scenes).length) {
    console.log("state.json 中没有已生成的场景帧（先跑 generateSceneFrames）");
    process.exit(0);
  }

  const wanted = cli.only && cli.only !== true
    ? new Set(String(cli.only).split(",").map((s) => s.trim().toLowerCase()))
    : null;
  const ids = Object.keys(state.scenes).filter((id) => {
    const sc = state.scenes[id];
    return sc && sc.localPath && fs.existsSync(sc.localPath) && (!wanted || wanted.has(id.toLowerCase()));
  });
  if (!ids.length) {
    console.log("没有可质检的场景帧（--only 过滤后为空或 localPath 缺失）");
    process.exit(0);
  }

  const qaModel = cli["qa-model"] && cli["qa-model"] !== true ? String(cli["qa-model"]) : DEFAULT_QA_MODEL;
  console.log(`\n=== 场景帧质检（${ids.length} 帧，模型 ${qaModel}）===`);

  let apiKey = null;
  if (!cli.offline) {
    apiKey = cli["api-key"] && cli["api-key"] !== true ? String(cli["api-key"]).trim()
      : (process.env.ARK_API_KEY || process.env["ark-api-key"] || "").trim();
    if (!apiKey) {
      console.error("缺少 Ark API Key：--api-key 或环境变量 ARK_API_KEY（--offline 可先看清单）");
      process.exit(2);
    }
  }

  const HARD_TRUE = ["couple_present", "face_match_male", "face_match_female", "outfit_match", "scene_match"];
  const HARD_FALSE = ["extra_person", "watermark_or_text"];
  const report = { checked: [], passed: [], failed: [] };
  let dirty = false;

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const scene = state.scenes[id];
    const entry = { dynasty: id, scene: scene.localPath };

    const maleP = state.portraits && state.portraits[id] && state.portraits[id].male && state.portraits[id].male.localPath;
    const femaleP = state.portraits && state.portraits[id] && state.portraits[id].female && state.portraits[id].female.localPath;
    if (!maleP || !femaleP || !fs.existsSync(maleP) || !fs.existsSync(femaleP)) {
      entry.verdict = "error"; entry.reason = "缺少该朝代男/女方定妆照（state.portraits），无法做一致性判定";
      report.failed.push(entry); report.checked.push(entry);
      console.log(`  [ERR] ${id}: ${entry.reason}`);
      continue;
    }

    const d = DYNASTIES.find((x) => x.id === id);
    if (cli.offline) {
      entry.verdict = "pending";
      report.checked.push(entry);
      console.log(`  [DRY] ${id}（${d ? d.name : "未知朝代"}）将用 2 张定妆照 + 场景帧做一致性质检`);
      continue;
    }

    const userText = [
      `请质检朝代「${d ? d.name : id}」的双人婚礼场景帧（${i + 1}/${ids.length}）。`,
      d && d.couplePrompt ? `该朝代场景设定参考：${d.couplePrompt.slice(0, 160)}` : "",
      "请按人物一致性（couple_present/face_match_male/face_match_female）与朝代合规（outfit_match/scene_match/extra_person/watermark_or_text）逐项判定并输出 JSON。",
    ].filter(Boolean).join("\n");

    const content = [
      { type: "text", text: userText },
      { type: "image_url", image_url: { url: fileToDataUri(maleP) } },
      { type: "image_url", image_url: { url: fileToDataUri(femaleP) } },
      { type: "image_url", image_url: { url: fileToDataUri(scene.localPath) } },
    ];

    try {
      const res = await postChatCompletion({
        model: qaModel,
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content }],
        temperature: 0.2,
        max_tokens: 1024,
      }, apiKey);
      const text = res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content || "";
      const verdict = parseJsonLoose(text);
      const ok = HARD_TRUE.every((k) => verdict[k] === true) && HARD_FALSE.every((k) => verdict[k] === false);
      verdict._pass = ok;
      entry.verdict = ok ? "pass" : "fail";
      Object.assign(entry, verdict);
      report.checked.push(entry);
      if (ok) {
        report.passed.push(id);
        console.log(`  [PASS] ${id}（${d ? d.name : id}）`);
      } else {
        report.failed.push(entry);
        console.log(`  [FAIL] ${id}: ${verdict.reason || ""} → ${verdict.suggestion || ""}`);
        if (cli["delete-bad"]) {
          archiveOldFrame(scene.localPath);
          delete state.scenes[id];
          dirty = true;
          console.log(`         已归档并清 state.scenes[${id}]，重跑主程序可补缺`);
        }
      }
    } catch (e) {
      entry.verdict = "error"; entry.reason = String(e.message || e).slice(0, 300);
      report.failed.push(entry); report.checked.push(entry);
      console.log(`  [ERR] ${id}: ${entry.reason}`);
    }
  }

  if (dirty) fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");

  const out = path.join(workDir, "scene_qa.json");
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
