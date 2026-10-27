#!/usr/bin/env node
/**
 * neck-fix.js —— 像素级「删除 + 补皮」：抹掉定妆图颈部被模型自加的项圈/choker 白环
 *
 * 为什么需要它（HARDENING 坑位 72）：
 *   · 正面人像的颈部留白会触发模型「必须加个东西」的先验，加 choker 是常态；
 *   · 提示词改不掉（四种写法实测全落空），参考图也压不过，i2i 只会照抄原结构；
 *   · 但这类区域上下都是真实皮肤，本质是「删除 + 补全」—— 交给像素算法，零额度、零重画。
 *
 * 关键：判据用**色度（R−B）**，不要用亮度。
 *   白丝带 R−B ≈ 10..20；皮肤（哪怕在投影里）R−B ≈ 54..69；头发 R−B ≈ 60..90。
 *   亮度切不开 —— 投影中的皮肤 L≈130..160 与白环暗部 L≈183 擦边，用亮度做蒙版必留白斑。
 *
 * 用法：
 *   node neck-fix.js --src 图.png --box l,t,w,h [--out 出图.png] [--tex l,t,w,h] [--gain 1.6]
 *   参数：
 *     --src    源图（已签定妆图 / 合并后的成品图）
 *     --box    替换窗（覆盖饰品 + 上下留一点皮肤余量）
 *     --tex    高频纹理取样框（同一张图上的一块干净皮肤；缺省取替换窗正上方一块）
 *     --out    输出路径，默认 <src 同名>_neckfix.png
 *     --gain   纹理叠加倍率，默认 1.6
 *     --debug  额外输出放大对照图 _neckfix_zoom.png
 *
 * 多轮迭代：以修好的结果再跑一轮可以压掉边缘残影（第二轮通常只剩几十像素可修）。
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i].replace(/^--/, "");
  args[k] = process.argv[i + 1];
}
const num4 = (s, name) => {
  const a = String(s || "").split(",").map(Number);
  if (a.length !== 4 || a.some((v) => !Number.isFinite(v))) {
    console.error(`x ${name} 需要 4 个数字：l,t,w,h`); process.exit(2);
  }
  return { left: a[0], top: a[1], width: a[2], height: a[3] };
};

const SRC = args.src;
if (!SRC || !fs.existsSync(SRC)) { console.error("x 缺少 --src 或文件不存在"); process.exit(2); }
const T = num4(args.box, "--box");

// 判据与参数（数值来自 2026-10-04 实测；换角色/光照后请先跑一遍抽样核对）
const SEED_C = 26, GROW_C = 52, MERGE = 40, MIN_L = 118;
const EXTRA = 4;        // 蒙版再外扩，让羽化落在皮肤上
const R = 16;           // 上下边界采样的水平低通半径（消竖条纹）
const BLUR = 3.4;       // alpha 羽化半径
const GAIN = parseFloat(args.gain || "1.6");

const lum = (r, g, b) => (r * 299 + g * 587 + b * 114) / 1000;
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

(async () => {
  const base = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = base.info.width, H = base.info.height, ch = base.info.channels;
  if (T.left + T.width > W || T.top + T.height > H) { console.error("x --box 超出画幅"); process.exit(3); }
  const at = (x, y) => (y * W + x) * ch;

  // 纹理取样框：缺省用替换窗正上方一块（通常就是干净的颈部皮肤）
  const TEX = args.tex ? num4(args.tex, "--tex")
    : { left: T.left + Math.round(T.width * 0.25), top: Math.max(0, T.top - Math.round(T.height * 0.9)), width: Math.round(T.width * 0.4), height: Math.round(T.height * 0.45) };

  const chroma = (i) => base.data[i] - base.data[i + 2];
  const isWhite = (x, y, thr) => {
    const i = at(T.left + x, T.top + y);
    return lum(base.data[i], base.data[i + 1], base.data[i + 2]) > MIN_L && chroma(i) < thr;
  };

  // ── 1) 逐列：种子 + 合并 + 沿色度外扩 ───────────────────────────
  const span = new Array(T.width).fill(null);
  for (let x = 0; x < T.width; x++) {
    const runs = [];
    let y = 0;
    while (y < T.height) {
      if (!isWhite(x, y, SEED_C)) { y++; continue; }
      let e = y; while (e < T.height && isWhite(x, e, SEED_C)) e++;
      runs.push([y, e - 1]); y = e;
    }
    if (!runs.length) continue;
    let bi = 0;
    for (let k = 1; k < runs.length; k++) if (runs[k][1] - runs[k][0] > runs[bi][1] - runs[bi][0]) bi = k;
    let [a, b] = runs[bi];
    for (let k = bi - 1; k >= 0; k--) if (runs[k][1] + MERGE >= a) a = runs[k][0]; else break;
    for (let k = bi + 1; k < runs.length; k++) if (runs[k][0] - MERGE <= b) b = runs[k][1]; else break;
    while (a - 1 >= 2 && isWhite(x, a - 1, GROW_C)) a--;
    while (b + 1 <= T.height - 3 && isWhite(x, b + 1, GROW_C)) b++;
    if (b - a < 6) continue;
    span[x] = { a: Math.max(2, a - EXTRA), b: Math.min(T.height - 3, b + EXTRA) };
  }
  const cols = span.filter(Boolean).length;
  console.log(`蒙版列数 ${cols} / ${T.width}`);
  if (!cols) { console.error("x 未检出饰品，请核对 --box 或放宽 SEED_C"); process.exit(4); }

  // ── 2) 上下边界皮肤行（各 8 行平均）+ 水平低通 ──────────────────
  const rowAvg = async (top) => {
    const { data } = await sharp(SRC).extract({ left: T.left, top, width: T.width, height: 8 })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const a = new Float64Array(T.width * 3);
    for (let x = 0; x < T.width; x++) for (let y = 0; y < 8; y++) for (let c = 0; c < 3; c++)
      a[x * 3 + c] += data[(y * T.width + x) * 4 + c] / 8;
    return a;
  };
  const A0 = await rowAvg(Math.max(0, T.top - 9));
  const B0 = await rowAvg(Math.min(H - 8, T.top + T.height + 1));
  const smooth = (a) => {
    const o = new Float64Array(a.length);
    for (let x = 0; x < T.width; x++) {
      const s = [0, 0, 0]; let k = 0;
      for (let d = -R; d <= R; d++) {
        const x2 = x + d; if (x2 < 0 || x2 >= T.width) continue;
        for (let c = 0; c < 3; c++) s[c] += a[x2 * 3 + c];
        k++;
      }
      for (let c = 0; c < 3; c++) o[x * 3 + c] = s[c] / k;
    }
    return o;
  };
  const As = smooth(A0), Bs = smooth(B0);

  // ── 3) 同图真实皮肤高频（拉伸叠加，免塑料平面感）───────────────
  const orig = await sharp(SRC).extract(TEX).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const low = await sharp(SRC).extract(TEX).blur(1.6).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const hiBuf = Buffer.alloc(TEX.width * TEX.height * 3);
  for (let i = 0; i < TEX.width * TEX.height; i++) {
    for (let c = 0; c < 3; c++) hiBuf[i * 3 + c] = clamp255(orig.data[i * 4 + c] - low.data[i * 4 + c] + 128);
  }
  const hiRes = await sharp(hiBuf, { raw: { width: TEX.width, height: TEX.height, channels: 3 } })
    .resize(T.width, T.height, { kernel: "cubic" }).raw().toBuffer();

  // ── 4) 合成 + 羽化混合 ─────────────────────────────────────────
  const out = Buffer.from(base.data);
  const alphaRaw = Buffer.alloc(T.width * T.height, 0);
  let rep = 0;
  for (let x = 0; x < T.width; x++) {
    const s = span[x]; if (!s) continue;
    const h = s.b - s.a + 1;
    for (let k = 0; k < h; k++) {
      const y = s.a + k, a = (k + 1) / (h + 1), i = at(T.left + x, T.top + y);
      for (let c = 0; c < 3; c++) {
        out[i + c] = clamp255((1 - a) * As[x * 3 + c] + a * Bs[x * 3 + c] + (hiRes[(y * T.width + x) * 3 + c] - 128) * GAIN);
      }
      alphaRaw[y * T.width + x] = 255; rep++;
    }
  }
  console.log(`填充 ${rep} px（纹理框 ${TEX.width}x${TEX.height} @ ${TEX.left},${TEX.top}）`);

  const ab = await sharp(alphaRaw, { raw: { width: T.width, height: T.height, channels: 1 } })
    .blur(BLUR).raw().toBuffer();                       // 坑：blur 后是 3 通道，索引要 ×3
  const finalBuf = Buffer.from(base.data);
  for (let y = 0; y < T.height; y++) {
    for (let x = 0; x < T.width; x++) {
      const al = ab[(y * T.width + x) * 3] / 255;
      if (!al) continue;
      const i = at(T.left + x, T.top + y);
      for (let c = 0; c < 3; c++) finalBuf[i + c] = Math.round(base.data[i + c] * (1 - al) + out[i + c] * al);
    }
  }

  const OUT = args.out || path.join(path.dirname(SRC), path.basename(SRC).replace(/\.png$/i, "") + "_neckfix.png");
  await sharp(finalBuf, { raw: { width: W, height: H, channels: ch } }).removeAlpha().png().toFile(OUT);
  console.log("[ok] " + OUT);

  if (args.debug) {
    const z = path.join(path.dirname(OUT), "_neckfix_zoom.png");
    await sharp(OUT).extract({
      left: Math.max(0, T.left - 60), top: Math.max(0, T.top - 70),
      width: Math.min(W - Math.max(0, T.left - 60), T.width + 120),
      height: Math.min(H - Math.max(0, T.top - 70), T.height + 140),
    }).resize(840).toFile(z);
    console.log("[ok] " + z);
  }
})();
