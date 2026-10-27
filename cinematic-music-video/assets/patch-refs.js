// patch-refs.js — 修正 agnes-image-2.5-flash 的「参考图覆盖景别指令」问题（预加载）。
//
// 实测矩阵（同一提示词，明确要求 extreme close-up）：
//   无参考图             -> 正确呈现景别
//   只带面部特写          -> 景别正确（背景可能被自由发挥）
//   只带场景锚点(无人空镜) -> 被压成「居中全身站立照」
//   面部 + 场景锚点       -> 同样被压成全身照
//
// 策略：
//   含主角的镜头 -> 只留「面部特写」做身份锚点（地点交给镜头自身的文字描述）
//   空镜镜头     -> 保留「场景锚点」+ 风格板
//   CMV_NO_REF_SHOTS 点名的镜头 -> 彻底不挂参考图（画面主体是物体/身体局部时用）
//
// 用法（不改动技能源码）：
//   node -r "<this-file>" "<cmv-skill>/scripts/images.js" --project "<项目>" \
//     --force --skip-refs --no-verify --concurrency 3
//
// 环境变量：
//   CMV_SKILL_DIR       cinematic-music-video 技能根目录（默认自动查找）
//   CMV_NO_REF_SHOTS   逗号分隔的镜头 id，这些镜头不使用任何参考图
//   CMV_REF_DEBUG=1    打印每个镜头最终的参考图组合
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
  throw new Error("patch-refs: 找不到 cinematic-music-video 技能目录，请设置 CMV_SKILL_DIR");
}

const assets = require(path.join(resolveSkillDir(), "scripts", "lib", "assets.js"));

const FACE_RE = /面部/;   // ref_face.png 的标签形如「面部特写」
const SCENE_RE = /场景/;  // ref_scene_*.png 的标签形如「场景锚点 SC2」
const STYLE_RE = /风格/;  // ref_style.png 的标签形如「风格基调板」

const NO_REF_SHOTS = new Set(
  String(process.env.CMV_NO_REF_SHOTS || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
);

const orig = assets.pickShotRefs;
assets.pickShotRefs = function (shot, a, o) {
  if (NO_REF_SHOTS.has(shot.id)) {
    if (process.env.CMV_REF_DEBUG) {
      process.stderr.write(`[patch-refs] ${shot.id}: 强制不使用参考图（构图优先）\n`);
    }
    return { paths: [], urls: [], labels: [], roles: [], view: null };
  }

  const r = orig.call(this, shot, a, o);
  if (!r || !Array.isArray(r.labels)) return r;

  const hasCharacter = (r.roles || []).indexOf("identity") !== -1;
  const keep = [];
  for (let i = 0; i < r.labels.length; i++) {
    const label = String(r.labels[i]);
    if (hasCharacter) {
      if (FACE_RE.test(label)) keep.push(i);
    } else {
      if (SCENE_RE.test(label) || STYLE_RE.test(label)) keep.push(i);
    }
  }

  const pick = (arr) => (Array.isArray(arr) ? keep.map((i) => arr[i]) : arr);
  const out = {
    paths: pick(r.paths),
    urls: pick(r.urls),
    labels: pick(r.labels),
    roles: pick(r.roles),
    view: r.view,
  };
  if (process.env.CMV_REF_DEBUG) {
    process.stderr.write(
      `[patch-refs] ${shot.id} (${hasCharacter ? "含主角" : "空镜"}): ` +
      `${r.labels.join(" | ")}  ->  ${out.labels.join(" | ") || "(无参考图)"}\n`
    );
  }
  return out;
};
