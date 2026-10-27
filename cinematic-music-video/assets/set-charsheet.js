// set-charsheet.js — 把一张**人工签字**的形象图落位为项目的角色设定表真源。
//
// 为什么需要它：`ref_charsheet.png` 是全片身份的唯一真源，但「人工挑一张图当设定表」
// 这个动作过去只能靠一次性脚本（如 春风 的 patch-cf-v3.js）临时完成 —— 于是没有统一
// 的备份、没有 .url 边车规范、没有签字记录，而且它落位的图一旦被 `--force` 级联重建，
// 签字就无声消失了（HARDENING 坑位 76 的事故）。
//
// 本工具把那个动作固化：
//   ① 校验真源图（存在 + 有公开 URL）
//   ② 备份现有的 ref_charsheet / ref_face / ref_body_* 到 `_before_charsheet-<时间戳>/`
//   ③ 落位 `ref_charsheet.png` + `.url` 边车
//   ④ 写 `ref_charsheet.signed.json` 签字记录（来源路径 / url / 大小 / md5 / 时间）
//   ⑤ 默认移除 ref_face / ref_body_*，让它们基于新真源重新派生
//   ⑥ 打印下一步命令
//
// 用法：
//   node set-charsheet.js --project "<项目目录>" --from "<形象图.png>" [--apply]
//   node set-charsheet.js --project "<项目目录>" --from "<形象图.png>" --url "https://..." --apply
//   node set-charsheet.js --project "<项目目录>" --from "<形象图.png>" --keep-refs --apply
//
//   --apply      实际写入（缺省 = dry-run，只打印计划）
//   --url <u>    真源图没有 .url 边车时手工指定公开 URL（视频阶段必须能访问到这张图）
//   --keep-refs  保留现有 ref_face / ref_body_*（默认移除，交给 derive 重出）
//
// 不调用任何 API，零额度。
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ANGLES = ["front", "3q-left", "3q-right", "side", "back"];

function resolveSkillDir() {
  if (process.env.CMV_SKILL_DIR) return process.env.CMV_SKILL_DIR;
  const home = os.homedir();
  const cands = [path.join(home, ".workbuddy", "skills", "cinematic-music-video")];
  const cache = path.join(home, ".workbuddy", "plugins", "cache");
  if (fs.existsSync(cache)) {
    for (const a of fs.readdirSync(cache)) {
      const b = path.join(cache, a);
      if (!fs.existsSync(b)) continue;
      for (const c of fs.readdirSync(b)) {
        const d = path.join(c, "skills", "cinematic-music-video");
        if (fs.existsSync(path.join(d, "scripts", "lib", "assets.js"))) cands.push(d);
        const e = path.join(b, c);
        if (fs.existsSync(path.join(e, "scripts", "lib", "assets.js"))) cands.push(e);
      }
    }
  }
  const hit = cands.find((p) => fs.existsSync(path.join(p, "scripts", "lib", "assets.js")));
  if (!hit) throw new Error("找不到 cinematic-music-video 技能目录（可用 CMV_SKILL_DIR 指定）");
  return hit;
}

function parseArgs(argv) {
  const o = { apply: false, keepRefs: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") o.apply = true;
    else if (a === "--keep-refs") o.keepRefs = true;
    else if (a === "--project") o.project = argv[++i];
    else if (a === "--from") o.from = argv[++i];
    else if (a === "--url") o.url = argv[++i];
    else if (a === "--help" || a === "-h") o.help = true;
  }
  return o;
}

function md5(p) {
  return crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const USAGE = `set-charsheet.js — 把人工签字的形象图落位为角色设定表真源

  node set-charsheet.js --project "<项目>" --from "<形象图.png>" [选项]

  --apply       实际写入（缺省 dry-run）
  --url <u>     --from 缺 .url 边车时手工指定公开图片 URL
  --keep-refs   保留 ref_face / ref_body_*（默认移除，交给 derive-cf.js 重出）
`;

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || !o.project || !o.from) {
    console.log(USAGE);
    process.exit(o.help ? 0 : 2);
  }

  const proj = path.resolve(o.project);
  const imgDir = path.join(proj, "02_images");
  if (!fs.existsSync(imgDir)) throw new Error("项目里没有 02_images/：" + imgDir);

  const from = path.resolve(o.from);
  if (!fs.existsSync(from)) throw new Error("真源图不存在：" + from);

  let url = o.url || "";
  if (!url) {
    const sidecar = from + ".url";
    if (fs.existsSync(sidecar)) url = fs.readFileSync(sidecar, "utf8").trim();
  }
  if (!url || !/^https?:\/\//.test(url)) {
    throw new Error(
      "拿不到真源图的公开 URL。\n" +
      "  视频/图像 API 只能消费公网 URL，不能吃本地文件。\n" +
      "  请用 --url \"https://...\" 指定，或先给该图生成一个 .url 边车。"
    );
  }

  const sheet = path.join(imgDir, "ref_charsheet.png");
  const ts = stamp();
  const bak = path.join(imgDir, `_before_charsheet-${ts}`);

  const toBak = ["ref_charsheet.png", "ref_face.png", ...ANGLES.map((a) => `ref_body_${a}.png`)]
    .map((f) => path.join(imgDir, f))
    .filter((p) => fs.existsSync(p));
  const toDrop = o.keepRefs
    ? []
    : ["ref_face.png", ...ANGLES.map((a) => `ref_body_${a}.png`)]
        .map((f) => path.join(imgDir, f))
        .filter((p) => fs.existsSync(p));

  console.log(`项目     ${path.basename(proj)}`);
  console.log(`真源     ${from}`);
  console.log(`          ${fs.statSync(from).size} 字节  md5=${md5(from)}`);
  console.log(`URL      ${url}`);
  console.log(`模式     ${o.apply ? "APPLY" : "DRY-RUN"}`);
  console.log("");
  console.log(`  备份到 ${path.relative(proj, bak)}/ ：`);
  toBak.forEach((p) => console.log(`    · ${path.basename(p)}`));
  console.log(`  落位 ref_charsheet.png  (+.url, +ref_charsheet.signed.json)`);
  if (toDrop.length) {
    console.log(`  移除（待重派生）：`);
    toDrop.forEach((p) => console.log(`    · ${path.basename(p)}`));
  } else {
    console.log(`  保留 ref_face / ref_body_*（--keep-refs）`);
  }

  if (!o.apply) {
    console.log("\ndry-run 结束。加 --apply 实际执行。");
    return;
  }

  fs.mkdirSync(bak, { recursive: true });
  for (const p of toBak) {
    fs.copyFileSync(p, path.join(bak, path.basename(p)));
    if (fs.existsSync(p + ".url")) fs.copyFileSync(p + ".url", path.join(bak, path.basename(p) + ".url"));
  }
  for (const p of toDrop) {
    fs.unlinkSync(p);
    if (fs.existsSync(p + ".url")) fs.unlinkSync(p + ".url");
  }
  fs.copyFileSync(from, sheet);
  fs.writeFileSync(sheet + ".url", url + "\n", "utf8");
  fs.writeFileSync(
    path.join(imgDir, "ref_charsheet.signed.json"),
    JSON.stringify(
      {
        signed_at: new Date().toISOString(),
        source_path: from,
        source_bytes: fs.statSync(from).size,
        source_md5: md5(from),
        url,
        note:
          "人工签字设定表真源。images.js 的 --force 只重画关键帧，不会覆盖它；" +
          "只有显式 --force-refs 才会重建（HARDENING 坑位 76）。",
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(`\n[ok] ref_charsheet.png 已落位，签字记录已写。`);
  console.log(`     备份：${path.relative(proj, bak)}/`);
  if (toDrop.length) {
    console.log(`\n下一步（重派生参考图）：`);
    console.log(`  node <skill>/assets/reface.js --project "${proj}"          # 只重出面部锚点`);
    console.log(`  或用项目脚本的重派生通道一次性重出 ref_face + 5 张全身。`);
  }
}

main();
