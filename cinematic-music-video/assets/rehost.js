// rehost.js — 把一张**本地**图（裁切 / 合成 / 后处理产物）换成带公网 URL 的托管图。
//
// 为什么需要（SOP §4.6）：videos.js 的 first_frame 必须是**公网 URL**，而 `.url` 边车
// **只能由 API 响应写入**（generateImage 里拿 item.url）—— 管线没有独立上传接口。
// 所以让本地图能被视频端使用，唯一途径是把它当 i2i 输入再走一次生成，换回托管 URL。
//
// 铁律：**部署的必须是克隆产物本身**，不能"本地放裁切版、URL 指向克隆版" ——
// 否则部署图与远端图不一致，成片用的其实是远端那张，反向抽帧会和你以为的对不上。
// 因此本工具默认就把「克隆产物 + 它的 .url」一起部署，而不是拿源图去部署。
//
// 用法:
//   node rehost.js --src <本地图> --out <克隆产物.png> [--ratio 9:16] [--size 2K] \
//                  [--keys-file <keys.txt>] [--hint "画面里实际有什么"] \
//                  [--apply --to <项目/02_images/shot_SXX.png>] [--archive-dir <旧图归档目录>]
//
//   --hint  额外补充"这张图里到底有什么"的短语（英文）。**只写画面里真实存在的东西**；
//           绝不写画面里没有的服装/道具/场景名 —— 那等于反向点单，模型会把它们画出来。
//   --apply 部署：把克隆产物 + .url 复制到 --to，旧图先归档到 --archive-dir（缺省自动加时间戳）
//
// 依赖: sharp（需设 NODE_PATH）、本技能 scripts/lib/agnes.js、一个可用 key。
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SKILL_SCRIPTS = path.resolve(__dirname, "..", "scripts");
const agnes = require(path.join(SKILL_SCRIPTS, "lib", "agnes"));

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : def;
}
const flag = (name) => process.argv.includes("--" + name);

const SRC = arg("src");
const OUT = arg("out");
const RATIO = arg("ratio", "9:16");
const SIZE = arg("size", "2K");
const HINT = arg("hint", "");
const KEYS_FILE = arg("keys-file", process.env.CMV_KEYS_FILE || "");
const APPLY = flag("apply");
const TO = arg("to", null);

if (!SRC || !OUT) {
  console.error("用法: node rehost.js --src <本地图> --out <克隆产物.png> [--ratio 9:16] [--apply --to <shot_XX.png>]");
  process.exit(2);
}
if (!fs.existsSync(SRC)) { console.error("源图不存在: " + SRC); process.exit(1); }

// ---- key 池 ----
let keys = agnes.parseKeyList(process.env.AGNES_API_KEYS || process.env.AGNES_API_KEY || "");
if (!keys.length && KEYS_FILE && fs.existsSync(KEYS_FILE)) {
  keys = agnes.parseKeyList(fs.readFileSync(KEYS_FILE, "utf8"));
}
if (!keys.length) { console.error("没有可用 key：给 --keys-file，或设 AGNES_API_KEYS / CMV_KEYS_FILE"); process.exit(1); }
const pool = new agnes.KeyPool(keys, { stateDir: path.join(path.dirname(OUT), ".state") });

const dataUri = (p) => "data:image/png;base64," + fs.readFileSync(p).toString("base64");

// 克隆提示词：只描述"这是什么、保持原样"，绝不写具体服装/场景名词（写进去＝反向点单）。
const CLONE_PROMPT =
  "EXACT REPRODUCTION of this photograph, pixel for pixel. Output the SAME image with ZERO changes: " +
  "the same subject, identical facial features, identical skin texture and tone, identical lighting and colour, " +
  "identical background, identical camera angle, identical crop, identical framing and identical film grain." +
  (HINT ? " In this image we see: " + HINT + "." : "") +
  " Do NOT widen the crop, do NOT pull the camera back, do NOT add anything that is outside the frame. " +
  "Do NOT improve, restyle, re-light, re-render or reinterpret anything.";

(async () => {
  if (!fs.existsSync(OUT)) {
    await agnes.generateImage(pool, { prompt: CLONE_PROMPT, size: SIZE, ratio: RATIO, images: [dataUri(SRC)], outputPath: OUT });
    console.log("rehost 生成 OK ->", OUT);
  } else {
    console.log("克隆产物已存在，跳过生成（删掉它可强制重跑）");
  }

  const urlP = OUT + ".url";
  const url = fs.existsSync(urlP) ? fs.readFileSync(urlP, "utf8").trim() : null;
  if (!url) { console.error("✗ 无 .url 边车 —— 视频端会缺首帧"); process.exit(1); }
  console.log("URL:", url);

  // ---- 一致度核验：与源图比平均绝对像素差 ----
  const a = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
  const bResized = await sharp(OUT).resize(a.info.width, a.info.height, { fit: "fill" }).png().toBuffer();
  const b = await sharp(bResized).raw().toBuffer();
  let sum = 0; const n = Math.min(a.data.length, b.length);
  for (let i = 0; i < n; i++) sum += Math.abs(a.data[i] - b[i]);
  const mean = sum / n;
  const mb = await sharp(OUT).metadata();
  console.log(`克隆图 ${mb.width}x${mb.height} / 平均绝对像素差 ${mean.toFixed(2)}/255 ` +
    `(${mean < 12 ? "≈像素级一致" : "偏差偏大 → 必须人眼复核再部署"})`);

  // ---- 并排对比图 ----
  const cmp = path.join(path.dirname(OUT), path.basename(OUT, ".png") + "_cmp.jpg");
  const BG = { r: 18, g: 18, b: 18 };
  await sharp({ create: { width: 900, height: 1024, channels: 3, background: BG } })
    .composite([
      { input: await sharp(SRC).resize(430, 1024, { fit: "contain", background: BG }).png().toBuffer(), left: 10, top: 0 },
      { input: await sharp(OUT).resize(430, 1024, { fit: "contain", background: BG }).png().toBuffer(), left: 460, top: 0 },
    ]).jpeg({ quality: 90 }).toFile(cmp);
  console.log("对比图（左=源, 右=克隆）->", cmp);

  if (!APPLY) { console.log("(dry-run) 加 --apply --to <项目/02_images/shot_SXX.png> 才会写入项目"); return; }

  if (!TO) { console.error("--apply 必须同时给 --to <目标 shot_XX.png>"); process.exit(2); }
  const archDir = arg("archive-dir", path.join(path.dirname(TO), "_archive", "keyframes_pre_rehost_" + new Date().toISOString().slice(0, 10).replace(/-/g, "")));
  fs.mkdirSync(archDir, { recursive: true });
  if (fs.existsSync(TO)) { fs.copyFileSync(TO, path.join(archDir, path.basename(TO))); }
  if (fs.existsSync(TO + ".url")) { fs.copyFileSync(TO + ".url", path.join(archDir, path.basename(TO) + ".url")); }
  fs.copyFileSync(OUT, TO);
  fs.copyFileSync(urlP, TO + ".url");
  console.log(`已部署 ${TO} + .url（旧图归档 -> ${archDir}）`);
  console.log("下一步核验：curl 下载远端 URL 与本地文件比 md5，必须一致。");
})();
