// plan-resilient.js — 给 cinematic-music-video 的 plan.js 加一层韧性包装（预加载）。
//
// 用法（不改动技能源码）：
//   node -r "<this-file>" "<cmv-skill>/scripts/plan.js" --song ... --shots 36 --brief "..."
//
// 它包装 agnes.chat，做三件事：
//   1. 流式响应被中途截断时（extractJson 失败）自动重新请求，直到拿到结构完整的 JSON
//   2. 把 shots[].duration 按比例归一化到精确等于歌曲总时长（夹在 4-12s）
//   3. 镜头数超过上限时按相邻合并收敛（遵守可行性边界：ceil(n/2)*12 >= 总时长）
//
// 环境变量：
//   CMV_SKILL_DIR        cinematic-music-video 技能根目录（默认自动查找）
//   CMV_TOTAL_DURATION   歌曲总时长秒数（默认从 args 无法读到，建议显式给）
//   CMV_MAX_SHOTS        镜头数上限，默认 40
//   CMV_WRAP_LOG         日志/原始响应落盘目录，默认 <cwd>/out/_cmv-wrap
const fs = require("fs");
const os = require("os");
const path = require("path");

function resolveSkillDir() {
  if (process.env.CMV_SKILL_DIR) return process.env.CMV_SKILL_DIR;
  const home = os.homedir();
  const cands = [
    path.join(home, ".workbuddy", "skills", "cinematic-music-video"),
    path.join(home, ".workbuddy", "skills", "cinematic-music-video", "cinematic-music-video"),
  ];
  const cache = path.join(home, ".workbuddy", "plugins", "cache");
  if (fs.existsSync(cache)) {
    for (const a of fs.readdirSync(cache)) {
      const b = path.join(cache, a);
      if (!fs.existsSync(b)) continue;
      for (const c of fs.readdirSync(b)) {
        const d = path.join(b, c, "skills", "cinematic-music-video");
        if (fs.existsSync(path.join(d, "scripts", "lib", "agnes.js"))) cands.push(d);
        const e = path.join(b, c);
        if (fs.existsSync(path.join(e, "scripts", "lib", "agnes.js"))) cands.push(e);
      }
    }
  }
  for (const c of cands) {
    if (fs.existsSync(path.join(c, "scripts", "lib", "agnes.js"))) return c;
  }
  throw new Error(
    "plan-resilient: 找不到 cinematic-music-video 技能目录，请设置 CMV_SKILL_DIR"
  );
}

const SKILL = resolveSkillDir();
const agnes = require(path.join(SKILL, "scripts", "lib", "agnes.js"));

const TOTAL = Number(process.env.CMV_TOTAL_DURATION || 0);
const MAX_SHOTS = Number(process.env.CMV_MAX_SHOTS || 40);
const LOG_DIR = process.env.CMV_WRAP_LOG || path.join(process.cwd(), "out", "_cmv-wrap");
const LO = 4;
const HI = 12;

try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (e) { /* ignore */ }
const logFile = path.join(LOG_DIR, "wrap.log");
function log(m) {
  const line = `[${new Date().toISOString()}] ${m}\n`;
  try { fs.appendFileSync(logFile, line); } catch (e) { /* ignore */ }
  try { process.stderr.write("[cmv-wrap] " + m + "\n"); } catch (e) { /* ignore */ }
}

/** 归一化时长，使其精确等于 TOTAL（保持相对节奏，越界夹到 [LO,HI] 后重新分摊）。 */
function normalizeDurations(shots) {
  if (!TOTAL) return false;
  const n = shots.length;
  if (n * LO > TOTAL + 1e-6 || n * HI < TOTAL - 1e-6) return false; // 时间轴无解
  const raw = shots.map((s) => Math.max(0.1, Number(s.duration) || 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  let d = raw.map((v) => (v * TOTAL) / sum);
  for (let it = 0; it < 200; it++) {
    d = d.map((v) => Math.min(HI, Math.max(LO, v)));
    const s = d.reduce((a, b) => a + b, 0);
    const diff = TOTAL - s;
    if (Math.abs(diff) < 1e-6) break;
    const free = [];
    for (let i = 0; i < n; i++) if (d[i] > LO + 1e-9 && d[i] < HI - 1e-9) free.push(i);
    if (!free.length) break;
    free.forEach((i) => { d[i] += diff / free.length; });
  }
  d = d.map((v) => Math.round(v * 1000) / 1000);
  let resid = Math.round((TOTAL - d.reduce((a, b) => a + b, 0)) * 1000) / 1000;
  for (let i = 0; i < n && Math.abs(resid) > 1e-9; i++) {
    const t = d[i] + resid;
    if (t >= LO && t <= HI) { resid = Math.round((resid - (t - d[i])) * 1000) / 1000; d[i] = Math.round(t * 1000) / 1000; }
  }
  shots.forEach((s, i) => { s.duration = d[i]; });
  return Math.abs(d.reduce((a, b) => a + b, 0) - TOTAL) < 0.01;
}

/** 相邻两镜合并为一镜（保留前一镜的机位与首帧，把后一镜的动作/画面并入描述）。 */
function mergeShots(a, b) {
  const cat = (x, y) => [x, y].filter((s) => s && String(s).trim()).join("; ");
  const first = (x, y) => (x && String(x).trim() ? x : y);
  const out = Object.assign({}, a);
  out.duration = Number(a.duration || 0) + Number(b.duration || 0);
  out.visual = cat(a.visual, b.visual);
  out.subject_action = cat(a.subject_action, b.subject_action);
  out.video_prompt = cat(a.video_prompt, b.video_prompt);
  out.lyrics_line = [a.lyrics_line, b.lyrics_line].filter((s) => s && String(s).trim()).join(" / ");
  out.characters_in_shot = Array.from(new Set([].concat(a.characters_in_shot || [], b.characters_in_shot || [])));
  if (out.expression === "none" || !out.expression) out.expression = first(b.expression, a.expression);
  if (out.characters_view === "none" || !out.characters_view) out.characters_view = first(b.characters_view, a.characters_view);
  return out;
}

let call = 0;
const origChat = agnes.chat;

agnes.chat = async function (pool, opts) {
  let fallback = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    call++;
    let raw;
    try {
      raw = await origChat.call(this, pool, opts);
    } catch (e) {
      log(`call-${call} attempt-${attempt}: request error: ${String(e.message).split("\n")[0].slice(0, 160)}`);
      if (attempt === 5) throw e;
      continue;
    }
    try { fs.writeFileSync(path.join(LOG_DIR, `raw-${call}.txt`), raw, "utf8"); } catch (e) { /* ignore */ }
    fallback = raw;

    let sb;
    try {
      sb = agnes.extractJson(raw);
    } catch (e) {
      // 关键判据：长度异常接近上一次 = 流式响应被截断 -> 重新请求
      log(`call-${call} attempt-${attempt}: INVALID JSON (${raw.length} chars) :: ${String(e.message).split("\n")[0]} -> retrying`);
      continue;
    }
    if (!sb || !Array.isArray(sb.shots) || !sb.shots.length) {
      log(`call-${call} attempt-${attempt}: valid JSON but not a storyboard (${raw.length} chars) -> pass through`);
      return raw;
    }

    const before = sb.shots.length;
    if (before > MAX_SHOTS) {
      let shots = sb.shots.slice();
      while (shots.length > MAX_SHOTS) {
        if (Math.ceil(shots.length / 2) * HI < (TOTAL || 0)) break; // 合并后每镜会超 12s，停止
        const merged = [];
        for (let i = 0; i < shots.length; i += 2) {
          merged.push(i + 1 < shots.length ? mergeShots(shots[i], shots[i + 1]) : shots[i]);
        }
        shots = merged;
      }
      sb.shots = shots;
      log(`call-${call}: merged shots ${before} -> ${shots.length}`);
    }

    const ok = normalizeDurations(sb.shots);
    const sum = sb.shots.reduce((a, s) => a + Number(s.duration || 0), 0);
    log(`call-${call} attempt-${attempt}: storyboard OK, shots=${sb.shots.length} durationsum=${sum.toFixed(3)}s normalized=${ok}`);
    return JSON.stringify(sb);
  }
  log(`call-${call}: exhausted retries, returning last raw`);
  return fallback;
};

log(`plan-resilient armed. skill=${SKILL} TOTAL=${TOTAL || "(unset)"} MAX_SHOTS=${MAX_SHOTS}`);
