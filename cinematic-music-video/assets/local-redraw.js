#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * local-redraw.js —— 「局部裁切重绘再贴回」：改一处，其余像素零改动
 *
 * 什么时候用它（见 references/HARDENING.md 坑位 71 处置③）：
 *   已经有一张签字的定妆/关键帧，只想改**一处局部**（如胸前体积、袖口纹样、某件配饰），
 *   而此时
 *     · 全图 i2i 会在改一处的同时把脸一起重画（实测：脸直接换了人）；
 *     · 「参考图给脸 + 文字给服装」也不成立（实测：脸和发饰一起被重画）。
 *   裁切块里**没有脸**，模型就没有脸可动 —— 这是唯一能保脸又改局部的路径。
 *
 * 三个阶段，分步跑以便目检（强烈建议先跑 crop 确认取景，再跑 redraw）：
 *   node local-redraw.js --src A.png --region 694,420,700,700 --stage crop
 *   node local-redraw.js --src A.png --region ... --prompt-file chest.txt --stage redraw --n 2
 *   node local-redraw.js --src A.png --region ... --mask 95,40,530,610 --skin 150,130,230,45 --stage merge
 *   （--stage all 一次跑完三阶段）
 *
 * 三个必须知道的坑（都是实测踩出来的，脚本已内置规避）：
 *   1. 整块贴回 ⇒ 出现**矩形色块**。重绘块的背景灰度与原图不同，贴回后是一块方斑。
 *      ⇒ 遮罩只覆盖目标局部（--mask），背景/头发/皮肤保持原图像素。
 *   2. 遮罩上边界切在**衣领内部** ⇒ 羽化带把「白领 + 肤色」混成一条浅色方块，或挖出方洞。
 *      ⇒ 上边界落在**皮肤对皮肤**或同一材质处（--mask 的 top 自己找）。
 *   3. 重绘块会**自己加件**（如给颈部补一圈白色环领），且肤色与原图往往有偏差。
 *      ⇒ 色差用 --skin 取样带做逐通道线性匹配（脚本内置）；
 *        多加的部件要么改 prompt 去掉，要么在合并后单独再处理一次。
 *
 * 输出：<src 同目录>/_localredraw/ 下的 crop / redraw / merged 文件。
 */

const fs = require("fs");
const path = require("path");
const SCRIPTS = path.resolve(__dirname, "..", "scripts");
const agnes = require(path.join(SCRIPTS, "lib", "agnes"));
let sharp;
try { sharp = require("sharp"); } catch (e) {
  console.error("x 需要 sharp（图像裁切/合成）。安装：npm i sharp");
  process.exit(2);
}

// ---------------------------------------------------------------- 参数解析
const argv = process.argv.slice(2);
function opt(name, def) {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
}
function rect(name, def) {
  const v = opt(name, null);
  if (!v) return def;
  const p = v.split(",").map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isFinite(x))) {
    console.error(`x --${name} 需要 l,t,w,h 四个整数，收到 "${v}"`);
    process.exit(2);
  }
  return { left: p[0], top: p[1], width: p[2], height: p[3] };
}

const SRC = opt("src", null);
const STAGE = (opt("stage", "all") || "").toLowerCase();
const N = parseInt(opt("n", "2"), 10);
const FEATHER = parseFloat(opt("feather", "40"));
const REGION = rect("region", null);
const MASK = rect("mask", null);
const SKIN = rect("skin", null);
const OUT_NAME = opt("out-name", "localredraw");
const KEYS_FILE = opt("keys-file", "C:/Users/tianw/.agnes-keys.txt");
const KEYS = opt("keys", null);
const RATIO = opt("ratio", "1:1");
const SIZE = opt("size", "1K");

let PROMPT = opt("prompt", null);
const PF = opt("prompt-file", null);
if (PF) {
  if (!fs.existsSync(PF)) { console.error("x 找不到 --prompt-file " + PF); process.exit(2); }
  PROMPT = fs.readFileSync(PF, "utf8").trim();
}

if (!SRC || !fs.existsSync(SRC)) { console.error("x --src 缺失或不存在"); process.exit(2); }
if (!REGION) { console.error("x 需要 --region l,t,w,h（要重绘的取景）"); process.exit(2); }

const DIR = path.join(path.dirname(SRC), "_localredraw");
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
const CROP = path.join(DIR, `${OUT_NAME}_crop.png`);
const stage = (s) => STAGE === "all" || STAGE === s;

// ------------------------------------------------------------ 工具函数
function dataUri(p) { return "data:image/png;base64," + fs.readFileSync(p).toString("base64"); }

async function buildMask(size, m, feather) {
  const inner = {
    left: Math.round(m.left + feather / 2),
    top: Math.round(m.top + feather / 2),
    width: Math.round(m.width - feather),
    height: Math.round(m.height - feather),
  };
  if (inner.width <= 0 || inner.height <= 0) throw new Error("feather 比遮罩还大");
  const rectBuf = await sharp({
    create: { width: inner.width, height: inner.height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  }).png().toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: rectBuf, left: inner.left, top: inner.top }]).blur(Math.max(1, feather * 0.66)).png().toBuffer();
}

/** 以取样带为样本做逐通道线性匹配 out = gain*in + offset，把重绘块拉齐到原图 */
async function matchSkin(origRegionBuf, patchedBuf, s) {
  if (!s) return { buf: patchedBuf, gain: [1, 1, 1], offset: [0, 0, 0] };
  const so = await sharp(origRegionBuf).extract(s).stats();
  const sb = await sharp(patchedBuf).extract(s).stats();
  const gain = [], offset = [];
  for (let c = 0; c < 3; c++) {
    const g = so.channels[c].stdev / Math.max(1e-6, sb.channels[c].stdev);
    gain.push(g);
    offset.push(so.channels[c].mean - g * sb.channels[c].mean);
  }
  return { buf: await sharp(patchedBuf).linear(gain, offset).png().toBuffer(), gain, offset };
}

// ---------------------------------------------------------------- 主流程
(async () => {
  const meta = await sharp(SRC).metadata();
  if (REGION.left + REGION.width > meta.width || REGION.top + REGION.height > meta.height) {
    console.error(`x --region 超出画幅 ${meta.width}x${meta.height}`); process.exit(3);
  }
  if (MASK && MASK.width > REGION.width) { console.error("x --mask 比 --region 还宽"); process.exit(3); }

  if (stage("crop") || STAGE === "crop") {
    await sharp(SRC).extract(REGION).toFile(CROP);
    console.log(`[crop] ${REGION.width}x${REGION.height} @ ${REGION.left},${REGION.top} → ${path.basename(CROP)}`);
    console.log("       目检：块里应当**没有脸**；边界两侧应是同一材质。");
    if (STAGE === "crop") return;
  }

  if (stage("redraw")) {
    if (!PROMPT) { console.error("x redraw 需要 --prompt 或 --prompt-file"); process.exit(2); }
    const keys = KEYS ? KEYS.split(",").map((s) => s.trim()).filter(Boolean)
      : fs.readFileSync(KEYS_FILE, "utf8").split(/\r?\n/).map((s) => s.trim()).filter((s) => s.startsWith("sk-"));
    if (!keys.length) { console.error("x 没有可用 API key"); process.exit(2); }
    const pool = new agnes.KeyPool(keys, { stateDir: path.join(path.dirname(path.dirname(SRC)), ".state") });
    for (let i = 1; i <= N; i++) {
      const out = path.join(DIR, `${OUT_NAME}_new_c${i}.png`);
      if (fs.existsSync(out) && STAGE !== "all") { console.log(`c${i} 已存在，跳过`); continue; }
      try {
        const t0 = Date.now();
        await agnes.generateImage(pool, { prompt: PROMPT, size: SIZE, ratio: RATIO, images: [dataUri(CROP)], outputPath: out });
        console.log(`[redraw] ${path.basename(out)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      } catch (e) {
        console.log(`[fail] c${i}: ${String(e.message).split("\n")[0].slice(0, 180)}`);
      }
      if (i < N) await agnes.sleep(1200);
    }
  }

  if (stage("merge")) {
    const size = REGION.width;
    const m = MASK || { left: Math.round(size * 0.15), top: Math.round(size * 0.06), width: Math.round(size * 0.7), height: Math.round(size * 0.88) };
    const mask = await buildMask(size, m, FEATHER);
    const origRegionBuf = await sharp(SRC).extract(REGION).png().toBuffer();
    let merged = 0;
    for (let i = 1; i <= N; i++) {
      const src = path.join(DIR, `${OUT_NAME}_new_c${i}.png`);
      if (!fs.existsSync(src)) continue;
      const raw = await sharp(src).resize(size, size, { fit: "cover" }).png().toBuffer();
      const matched = await matchSkin(origRegionBuf, raw, SKIN);
      const region = await sharp(matched.buf).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
      const out = path.join(DIR, `${OUT_NAME}_merged_c${i}.png`);
      await sharp(SRC).composite([{ input: region, left: REGION.left, top: REGION.top }]).toFile(out);
      console.log(
        `[merge] ${path.basename(out)}  （遮罩 ${m.width}x${m.height} @ ${m.left},${m.top}，羽化 ${FEATHER}；` +
        `肤色增益 ${matched.gain.map((x) => x.toFixed(2)).join("/")}）`
      );
      merged++;
    }
    if (!merged) { console.error("x 没有可合并的重绘块，先跑 --stage redraw"); process.exit(4); }
    console.log("       目检三处：① 有无矩形色块 ② 遮罩上边界有无方洞/浅色块 ③ 重绘块是否自己多加了部件");
  }
})().catch((e) => { console.error("x " + e.message); process.exit(1); });
