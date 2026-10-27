#!/usr/bin/env node
/**
 * headcheck.js —— 「配饰一致性」人眼终审图：把所有角色参考图裁到头部，放大并排。
 *
 * 为什么需要它（HARDENING 坑位 74）：
 *   · 布尔门禁只回答"是不是同一个人"，**对配饰一致性完全无感** ——
 *     实测两次 `same_person=true`（含一次 92 分）都没提步摇少了一侧；
 *   · 而配饰走样在全身图里只有一个指甲盖大，缩略图/预览根本看不出来；
 *   · 所以验收动作必须是：把每张参考图**裁到头 + 放大 + 横向并排**，用人眼比。
 *
 * 用法：
 *   node headcheck.js --dir <项目>/02_images [--out 出图.png] [--h 620] [--per-row 4]
 *                     [--refs ref_charsheet.png,ref_face.png,ref_body_front.png,...]
 *   缺省 refs = 设定表 + 脸部锚点 + SHEET_ANGLES 的 5 张全身图。
 *
 *   node headcheck.js --selftest        # 只做裁剪框计算的自检，不读图
 *
 * 判据（看什么）：
 *   1. **数量** —— 该是一对的，两边是不是都在（只画一侧是最常见的走样）；
 *   2. **形态** —— 金托/珠穗的**形状**是否同一款（会悄悄变成另一种花形）；
 *   3. **尺寸与链长** —— 有没有被放大、链子有没有垂过头（"垂链"会诱发越长越华丽）。
 */
const fs = require("fs");
const path = require("path");

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const tok = process.argv[i];
  if (!tok.startsWith("--")) continue;
  const k = tok.replace(/^--/, "");
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith("--")) { args[k] = true; continue; } // 裸开关
  args[k] = next;
  i++;
}

/** 头部裁剪框（比例）。方形图是胸像，竖幅全身图头部只占顶部一小条。 */
function headBox(w, h) {
  if (h >= w * 1.4) {
    // 竖幅全身：只圈头 + 头饰垂链
    return { left: Math.round(w * 0.28), top: Math.round(h * 0.02), width: Math.round(w * 0.44), height: Math.round(h * 0.2) };
  }
  // 方形胸像 / 设定表
  return { left: Math.round(w * 0.24), top: Math.round(h * 0.01), width: Math.round(w * 0.52), height: Math.round(h * 0.46) };
}

const DEFAULT_REFS = [
  "ref_charsheet.png",
  "ref_face.png",
  "ref_body_front.png",
  "ref_body_3q-left.png",
  "ref_body_3q-right.png",
  "ref_body_side.png",
  "ref_body_back.png",
];

const LABELS = {
  "ref_charsheet.png": "设定表·真源",
  "ref_face.png": "脸部锚点",
  "ref_body_front.png": "全身·front",
  "ref_body_3q-left.png": "全身·3q-left",
  "ref_body_3q-right.png": "全身·3q-right",
  "ref_body_side.png": "全身·side",
  "ref_body_back.png": "全身·back",
};

// ---------------------------------------------------------------------------
// 自检：裁剪框不许越界、不许为零
// ---------------------------------------------------------------------------
function selftest() {
  const cases = [
    [2048, 2048, "方形设定表"],
    [1472, 2624, "竖幅全身"],
    [1024, 1024, "方形胸像"],
  ];
  let fail = 0;
  for (const [w, h, name] of cases) {
    const b = headBox(w, h);
    if (b.width <= 0 || b.height <= 0) { console.error(`x ${name}: 裁剪框为零`); fail++; continue; }
    if (b.left < 0 || b.top < 0 || b.left + b.width > w || b.top + b.height > h) {
      console.error(`x ${name}: 裁剪框越界 ${JSON.stringify(b)}`); fail++;
      continue;
    }
    console.log(`✓ ${name} ${w}x${h} -> ${b.width}x${b.height} @ ${b.left},${b.top}`);
  }
  if (fail) process.exit(1);
  console.log(`✓ headcheck 自检通过（${cases.length} 例）`);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
(async () => {
  if (args.selftest !== undefined) return selftest();

  if (!args.dir) {
    console.error("x 需要 --dir <项目>/02_images（或用 --selftest）");
    process.exit(2);
  }
  const sharp = require("sharp");
  const dir = path.resolve(args.dir);
  const H = Math.max(200, parseInt(args.h || "620", 10));
  const perRow = Math.max(1, parseInt(args["per-row"] || "4", 10));
  const refs = (args.refs ? String(args.refs).split(",") : DEFAULT_REFS).map((s) => s.trim()).filter(Boolean);
  const bg = { r: 22, g: 22, b: 26 };

  const list = refs.filter((f) => fs.existsSync(path.join(dir, f)));
  if (!list.length) {
    console.error(`x ${dir} 下找不到任何参考图`);
    process.exit(2);
  }

  function labelSvg(text, w) {
    const esc = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    return Buffer.from(
      `<svg width="${w}" height="30" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="${w}" height="30" fill="#161618"/>` +
        `<text x="${w / 2}" y="21" font-family="Microsoft YaHei,Segoe UI,sans-serif" font-size="17" ` +
        `font-weight="600" fill="#e8e8ea" text-anchor="middle">${esc}</text></svg>`
    );
  }

  async function tile(src, label) {
    const m = await sharp(src).metadata();
    const b = headBox(m.width, m.height);
    const crop = await sharp(src).extract(b).resize({ height: H, fit: "cover", position: "top" }).toBuffer();
    const cm = await sharp(crop).metadata();
    return sharp({ create: { width: cm.width, height: H + 30, channels: 3, background: bg } })
      .composite([{ input: crop, left: 0, top: 0 }, { input: labelSvg(label, cm.width), left: 0, top: H }])
      .png()
      .toBuffer();
  }

  const rows = [];
  for (let i = 0; i < list.length; i += perRow) {
    const tiles = [];
    for (const f of list.slice(i, i + perRow)) tiles.push(await tile(path.join(dir, f), LABELS[f] || f.replace(/\.png$/, "")));
    const metas = [];
    for (const t of tiles) metas.push(await sharp(t).metadata());
    const W = metas.reduce((a, x) => a + x.width, 0) + 14 * (tiles.length - 1) + 28;
    let x = 14;
    const comps = [];
    for (let j = 0; j < tiles.length; j++) { comps.push({ input: tiles[j], left: x, top: 14 }); x += metas[j].width + 14; }
    rows.push(await sharp({ create: { width: W, height: H + 58, channels: 3, background: bg } }).composite(comps).png().toBuffer());
  }

  const metas = [];
  for (const r of rows) metas.push(await sharp(r).metadata());
  const W = Math.max(...metas.map((m) => m.width)) + 28;
  const HH = metas.reduce((a, m) => a + m.height, 0) + 16 * (rows.length - 1) + 28;
  let y = 14;
  const comps = [];
  for (let i = 0; i < rows.length; i++) { comps.push({ input: rows[i], left: 14, top: y }); y += metas[i].height + 16; }

  const out = path.resolve(args.out || path.join(dir, "_headcheck.png"));
  await sharp({ create: { width: W, height: HH, channels: 3, background: bg } }).composite(comps).png().toFile(out);
  const om = await sharp(out).metadata();
  console.log(`✓ ${out}  ${om.width}x${om.height}  （${list.length} 张）`);
  console.log("  人眼比对：①数量是否两侧都在 ②形态是否同一款 ③尺寸/链长是否被放大拉长");
})().catch((e) => {
  console.error("x headcheck 失败:", e && e.stack ? e.stack : e);
  process.exit(1);
});
