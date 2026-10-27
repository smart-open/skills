// reface.js — 只重建「面部锚点」`ref_face.png`，不重跑整套角色资产。
//
// 为什么单独有这个工具：`ref_face.png` 是 `pickShotRefs` 给**每一个角色镜**都挂上的身份锚点
// （见 assets.js pickShotRefs：先全身参考、后面部特写）。它一旦画歪，漂移会等比放大到全片。
// 而完整重跑 `images.js` 会把设定表、风格板、场景锚点、5 张全身参考一起重画 —— 那些往往是对的。
//
// 典型触发场景：
//   • 面部锚点丢/改掉了头饰（见 HARDENING 坑位 73：noWardrobe 曾连带丢掉 wardrobe_layers.accessories）
//   • 面部锚点被画成全身照（坑位 8）
//   • 人工签字换了一张形象真源（ref_charsheet.png），只想过一张新脸
//
// 做法：读 <project>/02_images/character_lock.json → render.buildFaceRefPrompt(identity)
//   → 生成 N 个候选 → compareIdentity 对 ref_charsheet.png(A6) 打分 → 取高分者落位。
//   旧图先备份，落败候选留档（`_face_rejected*.png`）。
//
// 用法：
//   node reface.js --project "<项目目录>" [--keys-file <keys.txt>] [--candidates 2] [--size 2K]
//   node reface.js --project "<项目目录>" --dry-run      # 只打印提示词，不烧额度
//
// 依赖 render.js 的 buildFaceRefPrompt；该函数在 noWardrobe 时仍会保留头部配饰
// （identityBlock({ noWardrobe:true, headOrnaments:true })），所以本工具天然不会再丢步摇。
const fs = require("fs");
const os = require("os");
const path = require("path");

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
        const d = path.join(b, c, "skills", "cinematic-music-video");
        if (fs.existsSync(path.join(d, "scripts", "lib", "assets.js"))) cands.push(d);
        const e = path.join(b, c);
        if (fs.existsSync(path.join(e, "scripts", "lib", "assets.js"))) cands.push(e);
      }
    }
  }
  for (const c of cands) {
    if (fs.existsSync(path.join(c, "scripts", "lib", "assets.js"))) return c;
  }
  throw new Error("reface: 找不到 cinematic-music-video 技能目录，请设置 CMV_SKILL_DIR");
}

const SKILL = resolveSkillDir();
const agnes = require(path.join(SKILL, "scripts", "lib", "agnes.js"));
const cli = require(path.join(SKILL, "scripts", "lib", "cli.js"));
const assets = require(path.join(SKILL, "scripts", "lib", "assets.js"));
const render = require(path.join(SKILL, "scripts", "lib", "render.js"));
const vision = require(path.join(SKILL, "scripts", "lib", "vision.js"));

const SPEC = {
  "--project": { key: "project", type: "string", alias: ["-d"], desc: "项目目录（含 01_plan / 02_images）" },
  "--candidates": { key: "candidates", type: "int", default: 2, desc: "生成几个候选（默认 2）" },
  "--size": { key: "size", type: "string", default: "2K", desc: "尺寸档：1K | 2K | 3K | 4K" },
  "--ratio": { key: "ratio", type: "string", default: "1:1", desc: "画幅比（面部锚点默认 1:1）" },
  "--min-score": { key: "minScore", type: "int", default: 0, desc: "比对分低于此值则告警（不阻断）" },
  "--no-verify": { key: "noVerify", type: "bool", desc: "跳过 compareIdentity 打分（取第 1 个候选）" },
  "--dry-run": { key: "dryRun", type: "bool", desc: "只打印提示词与计划，不调用接口" },
  "--force": { key: "force", type: "bool", desc: "即使 ref_face.png 已存在也重画" },
  ...cli.COMMON_KEYS,
  ...cli.COMMON_PROJECT,
};

const USAGE = `reface.js — 只重建面部锚点 ref_face.png

Options:
  --project <dir>     项目目录
  --candidates 2      候选数（默认 2，取比对分最高者）
  --size 2K           尺寸档
  --ratio 1:1         画幅比
  --min-score 85      低于此分告警
  --dry-run           只打印提示词，不烧额度
  --force             已存在也重画
  --keys-file keys.txt  多 key 轮转

Example:
  node reface.js --project "out/mv-春风许我再少年" --keys-file ~/.agnes-keys.txt`;

(async () => {
  const args = cli.createParser(SPEC, USAGE)(process.argv.slice(2));
  const projectDir = cli.resolveProjectDir(args.project || args._positional[0]);
  const dir = cli.stageDir(projectDir, "images");

  const lockPath = path.join(dir, assets.LOCK_FILE);
  const sheetPath = path.join(dir, "ref_charsheet.png");
  const facePath = path.join(dir, "ref_face.png");

  if (!fs.existsSync(lockPath)) {
    throw new Error(`找不到身份锁 ${lockPath}\n  请先跑：node scripts/images.js --project "${projectDir}"（生成角色资产）`);
  }
  const identity = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  const sheetUrl = assets.readUrlSidecar(sheetPath);
  if (!sheetUrl) throw new Error(`设定表缺少公网 URL 侧车：${sheetPath}.url`);

  const prompt = render.buildFaceRefPrompt(identity);
  agnes.log("=".repeat(78));
  agnes.log(`reface — ${projectDir}`);
  agnes.log(`  身份来源: ${identity._source || "cached"}   候选: ${args.candidates}   画幅: ${args.ratio}`);
  agnes.log(`  提示词含头饰段: ${/Hair ornaments/.test(prompt) ? "是" : "否（若角色有头饰，请检查 render.js）"}`);
  agnes.log("=".repeat(78));

  if (args.dryRun) {
    agnes.log(prompt);
    agnes.log("\n[dry-run] 未调用接口。");
    return;
  }

  if (fs.existsSync(facePath) && !args.force) {
    agnes.log(`  [note] ${path.basename(facePath)} 已存在，仍会覆盖（本工具的职责就是重画它）；旧图会备份`);
  }

  // 备份旧锚点
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const bk = path.join(projectDir, "_qa", `reface_backup-${stamp}`);
  if (fs.existsSync(facePath)) {
    agnes.ensureDir(bk);
    fs.copyFileSync(facePath, path.join(bk, "ref_face.png"));
    if (fs.existsSync(facePath + ".url")) fs.copyFileSync(facePath + ".url", path.join(bk, "ref_face.png.url"));
    agnes.log(`  旧图已备份 → ${bk}`);
  }

  const pool = cli.buildKeyPool(args, path.join(projectDir, ".state"));
  const n = Math.max(1, args.candidates);
  const cands = [];
  for (let i = 1; i <= n; i++) {
    const p = path.join(dir, `_face_cand${i}.png`);
    try {
      const rec = await assets.makeImage(pool, {
        prompt, outPath: p, refs: [sheetUrl], size: args.size, ratio: args.ratio,
        label: `面部锚点候选 ${i}`, retries: 2, checkUrl: true,
      });
      cands.push(rec);
      agnes.log(`  [ok] 候选 ${i}`);
    } catch (e) {
      agnes.log(`  [fail] 候选 ${i}: ${String(e.message).split("\n")[0]}`);
    }
    if (i < n) await agnes.sleep(1200);
  }
  if (!cands.length) throw new Error("所有候选都失败");

  // 打分：与设定表比对身份
  let best = cands[0], bestScore = -1, bestVerdict = "";
  if (!args.noVerify && cands.length > 1) {
    for (const c of cands) {
      try {
        const v = await vision.compareIdentity(pool, {
          refPaths: [sheetPath], candPath: c.outPath, maxPx: 768,
          shotInfo: "面部特写参考（头肩肖像）",
        });
        agnes.log(`  比对 ${path.basename(c.outPath)}: ${v.score}` +
          (v.differences && v.differences.length ? ` — ${v.differences.slice(0, 3).join("；")}` : ""));
        if (v.score > bestScore) { bestScore = v.score; best = c; bestVerdict = v.verdict || ""; }
      } catch (e) {
        agnes.log(`  比对失败（忽略）: ${String(e.message).split("\n")[0].slice(0, 120)}`);
      }
    }
  }

  fs.copyFileSync(best.outPath, facePath);
  fs.writeFileSync(facePath + ".url", best.url + "\n", "utf8");
  cands.filter((c) => c.outPath !== best.outPath).forEach((c, i) => {
    try {
      fs.renameSync(c.outPath, path.join(dir, `_face_rejected${i + 1}.png`));
      if (fs.existsSync(c.outPath + ".url")) fs.renameSync(c.outPath + ".url", path.join(dir, `_face_rejected${i + 1}.png.url`));
    } catch (e) { /* cosmetic */ }
  });
  cands.filter((c) => c.outPath === best.outPath).forEach((c) => {
    try { fs.unlinkSync(c.outPath); fs.unlinkSync(c.outPath + ".url"); } catch (e) { /* keep */ }
  });

  agnes.log(`  [done] ${path.basename(facePath)} 落位${bestScore >= 0 ? `（比对分 ${bestScore}）` : ""}` +
    (bestVerdict ? ` — ${bestVerdict}` : ""));
  if (args.minScore && bestScore >= 0 && bestScore < args.minScore) {
    agnes.log(`  ⚠ 比对分 ${bestScore} 低于阈值 ${args.minScore}，建议人工复核或加大候选数。`);
  }
  agnes.log("  自检：打开 ref_face.png 确认是头肩特写、且头饰与 ref_charsheet.png 一致。");
})().catch((e) => {
  console.error("x reface 失败:", e && e.message ? e.message : e);
  process.exit(1);
});
