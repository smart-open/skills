// crop-zoom.js — 定点【比例】裁切 + 放大，用于核验/对比局部细节（领扣、花位、水滴口、胯侧…）。
//
// 为什么用比例而不是像素：同一处细节在不同画幅（16:9 / 9:16）、不同尺寸的关键帧上，
// 比例恒定、像素不恒定。用比例就能对两版图做同一区域的并排对比。
//
// 用法:
//   node crop-zoom.js <out.jpg> <label:path:x0,y0,w,h> [<label:path:x0,y0,w,h> ...]
//     x0,y0 = 裁切区左上角（0..1 比例）；w,h = 裁切区宽高（0..1 比例）
//   环境变量 CZ_W 控制每格输出宽度（默认 560）
//
// 例（核验两版的胸口花位是否一致）:
//   node crop-zoom.js out.jpg \
//     "169_ref:D:/proj/mv/02_images/ref_body_front.png:0.30,0.18,0.40,0.30" \
//     "916_S12:D:/proj/mv9/02_images/shot_S12.png:0.25,0.10,0.50,0.40"
//
// 依赖: sharp（需设 NODE_PATH）
const sharp = require("sharp");
const GAP = 12;

(async () => {
  const out = process.argv[2];
  const items = process.argv.slice(3).map((a) => {
    const m = a.match(/^([^:]+):(.+):([\d.]+),([\d.]+),([\d.]+),([\d.]+)$/);
    if (!m) throw new Error("参数格式: label:path:x0,y0,w,h → " + a);
    return { label: m[1], path: m[2], r: [m[3], m[4], m[5], m[6]].map(Number) };
  });
  if (!out || !items.length) {
    console.error("用法: node crop-zoom.js <out.jpg> <label:path:x0,y0,w,h> ...");
    process.exit(2);
  }
  const TARGET_W = Number(process.env.CZ_W || 560);
  const parts = [];
  for (const it of items) {
    const [x0, y0, wf, hf] = it.r;
    const meta = await sharp(it.path).metadata();
    const w = Math.round(meta.width * wf), h = Math.round(meta.height * hf);
    const buf = await sharp(it.path)
      .extract({ left: Math.round(meta.width * x0), top: Math.round(meta.height * y0), width: w, height: h })
      .resize({ width: TARGET_W }).png().toBuffer();
    const m2 = await sharp(buf).metadata();
    const label = Buffer.from(
      `<svg width="${m2.width}" height="34"><rect width="100%" height="100%" fill="#f2f2f2"/>` +
      `<text x="8" y="23" font-family="sans-serif" font-size="21" fill="#111">${it.label}</text></svg>`
    );
    parts.push({ buf, label, w: m2.width, h: m2.height });
  }
  const TARGET_H = Math.max(...parts.map((p) => p.h));
  const W = parts.reduce((a, p) => a + p.w, 0) + GAP * (parts.length + 1);
  let left = GAP;
  const comps = [];
  for (const p of parts) {
    comps.push({ input: p.label, top: 0, left });
    comps.push({ input: p.buf, top: 34, left });
    left += p.w + GAP;
  }
  await sharp({ create: { width: W, height: TARGET_H + 34, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite(comps).jpeg({ quality: 92 }).toFile(out);
  console.log("已生成", out, W + "x" + (TARGET_H + 34));
})();
