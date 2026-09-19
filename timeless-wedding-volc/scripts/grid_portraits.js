#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * grid_portraits.js — 朝代定妆照多宫格批量生成 + 自动切分（借鉴 short-drama-studio grid_gen.py）
 *
 * 思路：把 N 个朝代的同性别定妆照塞进一张 2xN 宫格图一次生成（i2i 单人参考照），
 * 再按宫格切割回填 state.portraits，省 API 成本（N 宫格省 N-1 张图的钱）。
 * 切割用 ffmpeg crop（零新增依赖）；旧定妆照按约定归档到 portraits/versions/。
 *
 * ⚠ 适用场景：快速出草稿 / 成本敏感。宫格内的一致性弱于逐张 i2i（每格仍锚定同一张
 *   参考照，但格间可能风格微漂）；对一致性要求高时仍建议走主流程逐张生成。
 *
 * 用法：
 *   node grid_portraits.js --male-photo him.jpg --female-photo her.jpg --work-dir work/xxxx
 *   node grid_portraits.js ... --dynasties tang,song,ming,qing --grid 2x2
 *   node grid_portraits.js ... --gender male --force        # 只补男方，强制重生成
 *
 * 说明：state.portraits 回填的 url 字段记录宫格大图（溯源用）；localPath 为切割后的
 * 单朝代定妆照，与逐张生成的结构完全一致，generateSceneFrames 可直接使用。
 */

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { postImageGeneration } = require("./ark_client");
const { DYNASTIES } = require("./dynasties");

const IMAGE_MODEL = "doubao-seedream-5-0-pro-260628";

// ---------------------------------------------------------------------------
// ffmpeg 定位（与 merge_engine.js 相同的探测顺序）
// ---------------------------------------------------------------------------

function findFullFfmpeg() {
  const candidates = [
    process.env["FFMPEG_PATH"],
    path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Packages", "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe", "ffmpeg-8.1.1-full_build", "bin", "ffmpeg.exe"),
    path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Packages", "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe", "ffmpeg-8.1", "bin", "ffmpeg.exe"),
    "C:\\ffmpeg\\bin\\ffmpeg.exe",
  ];
  for (const p of candidates) { if (p && fs.existsSync(p)) return p; }
  return "ffmpeg";
}

const FFMPEG = findFullFfmpeg();
const FFPROBE = FFMPEG.replace(/ffmpeg(\.exe)?$/i, (m) => (m.includes(".exe") ? "ffprobe.exe" : "ffprobe"));

function probeSize(imgPath) {
  try {
    const out = execFileSync(FFPROBE, [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height", "-of", "csv=p=0", imgPath,
    ], { stdio: "pipe", timeout: 30000 }).toString().trim();
    const [w, h] = out.split(",").map((n) => parseInt(n, 10));
    if (w > 0 && h > 0) return { w, h };
  } catch { /* fallback below */ }
  return { w: 2048, h: 2048 };
}

// ---------------------------------------------------------------------------
// 归档（与版本归档约定一致：versions/ 保留 3 版）
// ---------------------------------------------------------------------------

function archiveOldFile(fp) {
  try {
    if (!fs.existsSync(fp)) return;
    const dir = path.dirname(fp);
    const versionsDir = path.join(dir, "versions");
    fs.mkdirSync(versionsDir, { recursive: true });
    const ext = path.extname(fp);
    const base = path.basename(fp, ext);
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    fs.renameSync(fp, path.join(versionsDir, `${base}_${ts}${ext}`));
    const files = fs.readdirSync(versionsDir)
      .filter((f) => f.startsWith(base + "_") && f.endsWith(ext)).sort().reverse();
    for (const f of files.slice(3)) {
      try { fs.unlinkSync(path.join(versionsDir, f)); } catch { /* best-effort */ }
    }
    console.log(`  [归档] 旧图 → portraits/versions/${base}_${ts}${ext}`);
  } catch (e) {
    console.error(`  [归档失败] ${fp}: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 宫格 prompt 与切分
// ---------------------------------------------------------------------------

function gridPrompt(items, rows, cols, genderLabel, identityLock) {
  const layout = `${rows}行${cols}列网格布局，共 ${rows * cols} 个格子，等大等距，白色细线分隔。`;
  const intro = `同一人物在不同朝代婚礼上的半身定妆照组图（${genderLabel}）。`;
  const perItem = "每个格子独立完整，严禁格子之间内容串扰；所有格子为同一人，格间风格统一（同画质、同打光强度、同构图：正面半身、正视镜头）。";
  const lines = items.map((d, i) => {
    const r = Math.floor(i / cols) + 1;
    const c = (i % cols) + 1;
    const p = genderLabel === "新郎" ? d.portraitPromptMale : d.portraitPromptFemale;
    return `第${r}行第${c}列（${d.name}）：${p}`;
  });
  return `${intro}${layout}${perItem}\n${lines.join("\n")}\n${identityLock} 高细节、无水印无文字。`;
}

function splitGrid(gridPath, outPaths, rows, cols) {
  const { w, h } = probeSize(gridPath);
  const cellW = Math.floor(w / cols);
  const cellH = Math.floor(h / rows);
  const saved = [];
  for (let i = 0; i < outPaths.length; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const out = outPaths[i];
    fs.mkdirSync(path.dirname(out), { recursive: true });
    execFileSync(FFMPEG, [
      "-y", "-i", gridPath,
      "-vf", `crop=${cellW}:${cellH}:${c * cellW}:${r * cellH}`,
      "-q:v", "2", out,
    ], { stdio: "pipe", timeout: 120000 });
    saved.push(out);
  }
  return saved;
}

// ---------------------------------------------------------------------------
// 单性别宫格生成
// ---------------------------------------------------------------------------

async function generateGenderGrid(gender, dynasties, photoPath, workDir, state, opts) {
  const portraitsDir = path.join(workDir, "portraits");
  fs.mkdirSync(portraitsDir, { recursive: true });

  // 过滤掉 state 中已有且非 --force 的朝代
  const items = dynasties.filter((d) => {
    if (opts.force) return true;
    const has = state.portraits && state.portraits[d.id] && state.portraits[d.id][gender];
    if (has) console.log(`  [${d.name}] ${gender} 定妆照已存在，跳过`);
    return !has;
  });
  if (!items.length) return 0;

  const { rows, cols } = opts.grid;
  if (items.length > rows * cols) {
    console.log(`  [WARN] ${items.length} 个朝代超过 ${rows}x${cols} 宫格容量，只取前 ${rows * cols} 个`);
    items.length = rows * cols;
  }

  const genderLabel = gender === "male" ? "新郎" : "新娘";
  console.log(`\n=== ${genderLabel}宫格生成：${items.length} 朝代 → ${rows}x${cols} 一张图 ===`);

  const identityLock =
    " Every grid cell shows the SAME person as the reference photo. " +
    "Keep the exact same facial features, face shape, eyes, nose, mouth and skin tone as the reference photo. " +
    "Any distinctive identifying marks (mole, scar) must be preserved exactly, no beautification, no face drift.";

  const payload = {
    model: IMAGE_MODEL,
    prompt: gridPrompt(items, rows, cols, genderLabel, identityLock),
    image: "data:image/" + (path.extname(photoPath).replace(".", "") || "jpeg") + ";base64," +
      fs.readFileSync(photoPath).toString("base64"),
    size: "2048x2048",
  };
  if (opts.seed != null) payload.seed = Number(opts.seed);

  const gridName = `grid_${gender}_${items[0].id}_to_${items[items.length - 1].id}.jpg`;
  const gridPath = path.join(workDir, gridName);
  console.log(`  生成宫格大图（${rows}x${cols}，2048x2048）...`);
  const res = await postImageGeneration(payload, opts.apiKey);
  const imageUrl = res.data && res.data[0] && res.data[0].url;
  if (!imageUrl) throw new Error("No image URL in response: " + JSON.stringify(res).slice(0, 500));

  // 下载宫格大图
  const https = require("https");
  const http = require("http");
  await new Promise((resolve, reject) => {
    const client = imageUrl.startsWith("https") ? https : http;
    client.get(imageUrl, { timeout: 300000 }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        const c2 = r.headers.location.startsWith("https") ? https : http;
        return c2.get(r.headers.location, (r2) => {
          const chunks = [];
          r2.on("data", (c) => chunks.push(c));
          r2.on("end", () => { fs.writeFileSync(gridPath, Buffer.concat(chunks)); resolve(); });
        }).on("error", reject);
      }
      if (r.statusCode !== 200) return reject(new Error("Download failed, HTTP " + r.statusCode));
      const chunks = [];
      r.on("data", (c) => chunks.push(c));
      r.on("end", () => { fs.writeFileSync(gridPath, Buffer.concat(chunks)); resolve(); });
    }).on("error", reject);
  });

  // 切分 + 回填
  const outPaths = items.map((d) => path.join(portraitsDir, `${d.id}_${gender}.jpg`));
  console.log(`  切分为 ${items.length} 张...`);
  const saved = splitGrid(gridPath, outPaths, rows, cols);

  if (!state.portraits) state.portraits = {};
  for (let i = 0; i < items.length; i++) {
    const d = items[i];
    if (!state.portraits[d.id]) state.portraits[d.id] = {};
    state.portraits[d.id][gender] = { localPath: saved[i], url: imageUrl, source: `grid:${gridName}` };
    console.log(`    ${d.id}（${d.name}）→ ${path.basename(saved[i])}`);
  }
  return items.length;
}

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

function parseGrid(s) {
  if (!s || s === true || s === "auto") return null;
  const m = String(s).toLowerCase().match(/^(\d+)x(\d+)$/);
  if (!m) throw new Error("--grid 格式应为 行x列，如 2x2 / 2x4");
  return { rows: parseInt(m[1], 10), cols: parseInt(m[2], 10) };
}

function autoGrid(n) {
  if (n <= 4) return { rows: 2, cols: 2 };
  if (n <= 6) return { rows: 2, cols: 3 };
  return { rows: 2, cols: 4 };
}

function printHelp() {
  console.log(`
=== grid_portraits.js — 朝代定妆照多宫格批量生成 ===

用法：
  node grid_portraits.js --male-photo <img> --female-photo <img> --work-dir <dir>
                         [--gender male|female|both] [--dynasties tang,song,...]
                         [--grid 2x2|auto] [--force] [--seed <n>] [--api-key <key>]

选项：
  --male-photo / --female-photo  必填（按 --gender 至少其一）。原始现代装参考照
  --work-dir <dir>               必填。timeless_wedding_volc.js 的工作目录（含 state.json）
  --gender                       male / female / both（默认 both）
  --dynasties <ids>              逗号分隔朝代 id，默认全部
  --grid <r>x<c>                 宫格布局，默认 auto（按朝代数 2x2 / 2x3 / 2x4）
  --force                        覆盖已有定妆照（旧图归档到 portraits/versions/）
  --seed <n>                     固定种子（缺省读 state.seed，主流程已持久化）
  --api-key <key>                Ark API Key（默认环境变量 ARK_API_KEY）

宫格模式一致性弱于逐张 i2i，适合草稿/批量初稿；对一致性要求高请走主流程。
`);
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help || cli.h) { printHelp(); process.exit(0); }

  const workDir = path.resolve(String(cli["work-dir"] || ""));
  const statePath = path.join(workDir, "state.json");
  if (!fs.existsSync(statePath)) {
    console.error(`找不到 ${statePath}（--work-dir 应为 timeless_wedding_volc.js 的工作目录）`);
    process.exit(2);
  }
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));

  const gender = cli.gender && cli.gender !== true ? String(cli.gender) : "both";
  if (!["male", "female", "both"].includes(gender)) {
    console.error("--gender 只支持 male / female / both");
    process.exit(2);
  }

  const dynasties = cli.dynasties && cli.dynasties !== true
    ? DYNASTIES.filter((d) => String(cli.dynasties).split(",").map((s) => s.trim()).includes(d.id))
    : DYNASTIES;
  if (!dynasties.length) { console.error("--dynasties 过滤后无匹配朝代"); process.exit(2); }

  const apiKey = cli["api-key"] && cli["api-key"] !== true ? String(cli["api-key"]).trim()
    : (process.env.ARK_API_KEY || process.env["ark-api-key"] || "").trim();
  if (!apiKey) {
    console.error("缺少 Ark API Key：--api-key 或环境变量 ARK_API_KEY");
    process.exit(2);
  }

  const grid = parseGrid(cli.grid) || autoGrid(dynasties.length);
  const seed = cli.seed && cli.seed !== true ? Number(cli.seed)
    : (state.seed != null ? Number(state.seed) : null);

  console.log(`工作目录：${workDir}；朝代 ${dynasties.length} 个；宫格 ${grid.rows}x${grid.cols}；seed ${seed != null ? seed : "（随机）"}`);

  let total = 0;
  if (gender === "male" || gender === "both") {
    const malePhoto = cli["male-photo"] && cli["male-photo"] !== true ? path.resolve(String(cli["male-photo"])) : null;
    if (!malePhoto || !fs.existsSync(malePhoto)) {
      console.error("缺少男方参考照：--male-photo（male/both 模式必填）");
      process.exit(2);
    }
    if (cli["force"] && state.portraits) {
      for (const d of dynasties) {
        const p = state.portraits[d.id] && state.portraits[d.id].male;
        if (p && p.localPath) archiveOldFile(p.localPath);
        if (state.portraits[d.id]) delete state.portraits[d.id].male;
      }
    }
    total += await generateGenderGrid("male", dynasties, malePhoto, workDir, state, { apiKey, grid, seed, force: !!cli.force });
  }
  if (gender === "female" || gender === "both") {
    const femalePhoto = cli["female-photo"] && cli["female-photo"] !== true ? path.resolve(String(cli["female-photo"])) : null;
    if (!femalePhoto || !fs.existsSync(femalePhoto)) {
      console.error("缺少女方参考照：--female-photo（female/both 模式必填）");
      process.exit(2);
    }
    if (cli["force"] && state.portraits) {
      for (const d of dynasties) {
        const p = state.portraits[d.id] && state.portraits[d.id].female;
        if (p && p.localPath) archiveOldFile(p.localPath);
        if (state.portraits[d.id]) delete state.portraits[d.id].female;
      }
    }
    total += await generateGenderGrid("female", dynasties, femalePhoto, workDir, state, { apiKey, grid, seed, force: !!cli.force });
  }

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
  console.log(`\n完成：共生成 ${total} 张定妆照；宫格大图保留在 work/ 目录可对照检查`);
  console.log("后续：重跑主程序会跳过已回填的定妆照，直接进入场景帧/视频阶段。");
  process.exit(0);
}

main().catch((e) => {
  console.error("宫格生成失败：", e.message || e);
  process.exit(1);
});
