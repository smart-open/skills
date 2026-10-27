// montage.js — 把一组图拼成带标签的总览/核验图（横竖画幅通用，本地 sharp，不烧额度）
//
// 用途：逐镜目检、候选对比、成片反向抽帧核验 —— 一切"把 N 张图摆在一起看"的场合。
//
// 用法:
//   node montage.js <out.jpg> <cols> <TILE_W> <TILE_H> <tag:file> [<tag:file> ...]
//
//   cols     每行几格（横屏 16:9 建议 6，竖屏 9:16 建议 4-7，见下）
//   TILE_W   单格宽（竖屏 300、横屏 480 是实测好用值）
//   TILE_H   单格总高（含 44px 标签条；横屏 264、竖屏 545/572）
//   tag:file 标签与图片路径，冒号分隔。tag 内**不要含冒号**（否则会被当分隔符切开）。
//
// 拼两种画幅时**分开拼两张**（横屏与竖屏混在一张里格子宽高比打架，看不清）。
//
// 两处历史坑（已在代码里避开，改代码时别踩回去）：
//   1. 缩放必须 `fit:"contain"`。用 `fit:"fill"` 会把 16:9 拉伸成 9:16 —— 数人头和看花位都不可靠。
//   2. tile 的 `.toBuffer()` 必须带格式（`.png()`），否则 sharp 报 `unsupported image format`。
//
// 依赖: sharp（用隔离运行时，需设 NODE_PATH，见 SKILL.md「运行环境」）
const sharp = require("sharp");

(async () => {
  const out = process.argv[2];
  const cols = parseInt(process.argv[3], 10);
  const TW = parseInt(process.argv[4], 10);
  const TH = parseInt(process.argv[5], 10);
  if (!out || !cols || !TW || !TH) {
    console.error("用法: node montage.js <out.jpg> <cols> <TILE_W> <TILE_H> <tag:file> ...");
    process.exit(2);
  }
  // 在【第一个】冒号处切分：tag 不含冒号，路径可为 `D:\...`（盘符里的冒号在切点之后，不受影响）。
  const items = process.argv.slice(6).map((s) => {
    const i = s.indexOf(":");
    return { tag: s.slice(0, i), f: s.slice(i + 1) };
  });
  if (!items.length) { console.error("至少要给一个 tag:file"); process.exit(2); }

  const LBL = 44;
  const BG = { r: 18, g: 18, b: 18 };
  const tiles = [];
  for (const { tag, f } of items) {
    const buf = await sharp(f).resize(TW, TH - LBL, { fit: "contain", background: BG }).png().toBuffer();
    const label = Buffer.from(
      `<svg width="${TW}" height="${LBL}"><rect width="${TW}" height="${LBL}" fill="#111"/>` +
      `<text x="10" y="32" font-size="30" font-weight="bold" fill="#ffd400" font-family="sans-serif">${tag}</text></svg>`
    );
    tiles.push(
      await sharp({ create: { width: TW, height: TH, channels: 3, background: BG } })
        .composite([{ input: buf, top: LBL, left: 0 }, { input: label, top: 0, left: 0 }])
        .png().toBuffer()
    );
  }
  const rows = Math.ceil(tiles.length / cols);
  await sharp({ create: { width: cols * TW, height: rows * TH, channels: 3, background: BG } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * TW, top: Math.floor(i / cols) * TH })))
    .jpeg({ quality: 84 }).toFile(out);
  console.log("ok", out, cols + "x" + rows);
})();
