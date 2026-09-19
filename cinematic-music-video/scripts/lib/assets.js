#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * lib/assets.js — Image asset generation + the character-reference pipeline.
 *
 * The character pipeline is the part that decides whether the finished MV looks
 * like a film or like a slideshow of similar strangers. It runs in three steps,
 * in this order, because each step depends on the previous one:
 *
 *   1. MASTER REFERENCE SHEET  (ref_charsheet.png)
 *      One generation containing a large close-up plus front / side / back
 *      full-body views of the same person. Several candidates are generated and
 *      scored by a vision pass; the best one is kept.
 *      Why a sheet: within a single generation the model is self-consistent, so
 *      the views share a face. Identity then only has to survive one hop.
 *
 *   2. IDENTITY PARAMETERS     (character_lock.json)
 *      The accepted sheet is read back by a vision pass into discrete, quotable
 *      parameters (face_shape, eye_shape, iris_color, eyebrows, lips, hair,
 *      skin, build, wardrobe) plus a ready-made English lock.
 *      Why: this removes the disagreement between what the planner wrote and
 *      what the image model actually drew. Text and picture now match.
 *
 *   3. PER-ANGLE STUDIO REFS   (ref_body_<angle>.png, ref_face.png)
 *      Single clean full-body views at every angle the film needs, derived from
 *      the sheet, on a flat studio backdrop.
 *      Why: a shot's framing should be matched by a reference at the same angle
 *      and scale. Feeding a head-and-shoulders portrait into a wide full-body
 *      shot is what forces the model to reinvent both the body and the face.
 */

const fs = require("fs");
const path = require("path");

const agnes = require("./agnes");
const cli = require("./cli");
const render = require("./render");
const vision = require("./vision");

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

function readUrlSidecar(pngPath) {
  const p = pngPath + ".url";
  if (!fs.existsSync(p)) return null;
  const u = fs.readFileSync(p, "utf8").trim();
  return u || null;
}

/** An asset is reusable when the file is big enough AND it has a public URL. */
function isUsable(pngPath, minBytes) {
  if (!fs.existsSync(pngPath)) return false;
  const st = fs.statSync(pngPath);
  return st.size >= (minBytes || 20000) && !!readUrlSidecar(pngPath);
}

/**
 * Generate one image with retries. The public URL is mandatory — the video
 * stage cannot consume a local file — so a missing URL counts as a failure.
 *
 * @returns {Promise<{outPath:string, url:string, bytes:number, label:string}>}
 */
async function makeImage(pool, opts) {
  const { prompt, outPath, refs, size, ratio, label, retries, checkUrl } = opts;
  const attempts = retries === undefined ? 2 : retries;
  let lastErr = null;
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt++) {
    try {
      const res = await agnes.generateImage(pool, {
        prompt,
        size,
        ratio,
        images: refs && refs.length ? refs : undefined,
        outputPath: outPath,
      });
      if (!res.url) throw new Error("image API returned no public URL (the video stage requires one)");
      if (checkUrl) {
        const chk = await agnes.checkPublicUrl(res.url);
        if (!chk.ok) throw new Error(`generated URL not publicly reachable (${chk.status || chk.note})`);
      }
      agnes.log(`      [ok] ${label} -> ${(res.bytes / 1024 / 1024).toFixed(2)} MB  ${path.basename(outPath)}`);
      return { label, outPath, url: res.url, bytes: res.bytes };
    } catch (e) {
      lastErr = e;
      agnes.log(`      [retry ${attempt}/${attempts}] ${label}: ${String(e.message).split("\n")[0].slice(0, 160)}`);
      if (attempt < attempts) await agnes.sleep(3000 * attempt);
    }
  }
  throw new Error(`${label} failed after ${attempts} attempt(s): ${lastErr && lastErr.message}`);
}

function copyWithSidecar(from, to) {
  fs.copyFileSync(from, to);
  if (fs.existsSync(from + ".url")) fs.copyFileSync(from + ".url", to + ".url");
}

function dropQuietly(p) {
  try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* best effort */ }
  try { if (fs.existsSync(p + ".url")) fs.unlinkSync(p + ".url"); } catch (e) { /* best effort */ }
}

/** Append a measured-difference correction block to a render prompt. */
function appendFix(prompt, fix) {
  if (!fix || !fix.length) return prompt;
  return (
    prompt +
    "\n\nCORRECTION FROM THE PREVIOUS ATTEMPT — the previous render was wrong in these specific ways:\n" +
    fix.slice(0, 6).map((d) => "  • " + d).join("\n") +
    "\nFix each of these, while keeping everything else exactly the same."
  );
}

/**
 * Generate an image and, if an `audit` is supplied, verify it and regenerate
 * with the measured defects turned into explicit corrections.
 *
 * The best-scoring attempt wins and is promoted to `outPath`; the rest are
 * removed. This is the same detect-measure-correct loop used for shot
 * keyframes, applied to the character references — a bad reference poisons
 * every shot at that angle, so it is worth the extra call.
 */
async function makeAuditedImage(pool, o) {
  const total = 1 + Math.max(0, o.auditRetries || 0);
  let best = null;
  let fix = null;
  const tried = [];

  for (let attempt = 1; attempt <= total; attempt++) {
    const attemptPath = attempt === 1 ? o.outPath : o.outPath.replace(/\.png$/, `.att${attempt}.png`);
    const prompt = appendFix(o.prompt, fix);
    const rec = await makeImage(pool, {
      prompt,
      outPath: attemptPath,
      refs: o.refs,
      size: o.size,
      ratio: o.ratio,
      label: `${o.label}${attempt > 1 ? ` (重试 ${attempt})` : ""}`,
      retries: o.retries,
      checkUrl: o.checkUrl,
    });

    let v = null;
    if (o.audit) {
      try {
        v = await o.audit(pool, attemptPath);
        agnes.log(
          `      [QA] ${o.label} 人数=${v.person_count} 拼贴=${v.is_panel_layout ? "是" : "否"} ` +
          `全身=${v.head_to_toe ? "是" : "否"} 评分=${v.score} ` + (v.passed ? "通过" : "未达标")
        );
        if (v.issues && v.issues.length) agnes.log(`           缺陷: ${v.issues.slice(0, 3).join("；")}`);
      } catch (e) {
        agnes.log(`      [QA] ${o.label} 校验失败（跳过，按通过处理）: ${String(e.message).split("\n")[0].slice(0, 120)}`);
        v = null;
      }
    }
    tried.push({ attempt, score: v ? v.score : null, passed: v ? v.passed : true, issues: v ? v.issues : [] });

    const better = !best || (v && v.score > best.score);
    if (better) {
      if (best) dropQuietly(best.path);
      best = { path: attemptPath, url: rec.url, score: v ? v.score : 100, verdict: v };
    } else {
      dropQuietly(attemptPath);
    }

    if (!v || v.passed) break;
    if (attempt < total) fix = v.issues;
  }

  // A reference that never passed its gate is worse than no reference: it would
  // silently steer every shot at that angle. Drop it and let the caller fall
  // back to a different angle or to the face close-up.
  if (o.audit && best.verdict && !best.verdict.passed && o.dropOnFailure !== false) {
    dropQuietly(best.path);
    agnes.log(
      `      [drop] ${o.label}：${total} 次尝试都未通过校验（最高分 ${best.score}），已丢弃该参考图，` +
      `下游会自动回退到其它可用参考图`
    );
    return { outPath: o.outPath, url: null, label: o.label, score: best.score, tried, dropped: true };
  }

  if (best.path !== o.outPath) {
    copyWithSidecar(best.path, o.outPath);
    dropQuietly(best.path);
  }
  return { outPath: o.outPath, url: best.url, label: o.label, score: best.score, tried };
}

// ---------------------------------------------------------------------------
// Character pipeline
// ---------------------------------------------------------------------------

const LOCK_FILE = "character_lock.json";

/**
 * Fields that describe WHAT THE CAMERA CAN SEE. These are read back off the
 * accepted sheet by the vision pass, so the text and the picture agree.
 */
const VISUAL_FIELDS = [
  "age_range", "gender", "ethnicity", "face_shape", "eye_shape", "iris_color", "eye_spacing",
  "eyebrows", "nose", "lips", "jaw_chin", "skin_tone", "hair_structure", "hair_color",
  "physique", "wardrobe_layers", "garment_palette", "wardrobe", "distinctive_marks",
];

/**
 * Fields that are CREATIVE CHOICES rather than observable facts.
 *
 * A neutral studio sheet simply does not contain the character's emotional
 * range, their characteristic gestures, or the world they belong in — a vision
 * pass asked for those would invent them. They therefore stay owned by the
 * planner and are carried through untouched.
 */
const CREATIVE_FIELDS = ["expression_bank", "signature_actions", "scene_affinity", "persona"];

/**
 * @param {agnes.KeyPool} pool
 * @param {object} o
 * @param {string}   o.dir          stage-2 output directory
 * @param {object}   o.sb           storyboard
 * @param {string[]} o.angles       angles to derive, e.g. ["front","3q-left","side"]
 * @param {string}   o.refRatio     aspect ratio for full-body references (default 9:16)
 * @param {string}   o.size         image size tier
 * @param {number}   o.concurrency
 * @param {number}   o.candidates   how many sheets to generate and score
 * @param {boolean}  o.force        regenerate everything
 * @param {boolean}  o.verify       enable the vision QA gates
 * @param {number}   o.retries
 * @param {boolean}  o.checkUrl
 * @param {number}   [o.visionMaxPx]
 * @returns {Promise<{identity:object, sheet:object|null, face:object|null, bodies:object}>}
 */
async function buildCharacterAssets(pool, o) {
  const dir = o.dir;
  const seedRaw = o.sb.character || {};
  // The planner nests the drawable parameters under `params`; flatten them into
  // the shape the render layer expects, keeping the narrative fields alongside.
  const seed = Object.assign({}, seedRaw.params || {}, {
    name: seedRaw.name,
    wardrobe: (seedRaw.params && seedRaw.params.wardrobe) || seedRaw.wardrobe,
    persona: seedRaw.persona || (seedRaw.params && seedRaw.params.persona),
    identity_lock_en: seedRaw.identity_lock_en,
    identity_lock: seedRaw.identity_lock,
  });
  const refRatio = o.refRatio || "9:16";
  const angles = (o.angles && o.angles.length ? o.angles : render.SHEET_ANGLES).slice();
  const verify = !!o.verify;
  const sheetLayout = o.sheetLayout || "sheet-full";

  // -------------------------------------------------------------------------
  // 1. Master reference sheet (+ candidate selection)
  // -------------------------------------------------------------------------
  const sheetPath = path.join(dir, "ref_charsheet.png");
  let sheet = null;

  if (!o.force && isUsable(sheetPath)) {
    sheet = { outPath: sheetPath, url: readUrlSidecar(sheetPath), label: "角色设定表" };
    agnes.log("      [skip] 角色设定表 already exists");
  } else {
    const n = Math.max(1, o.candidates || 1);
    const prompt = render.buildCharacterSheetPrompt(seed, { layout: sheetLayout });
    agnes.log(
      `      生成 ${n} 个角色设定表候选（这是全片身份的唯一真源；版式 ${sheetLayout}` +
      (sheetLayout === "sheet-full" ? " = 大特写 + 三视图 + 表情带" : "") + "）..."
    );

    const cands = [];
    for (let i = 1; i <= n; i++) {
      const p = path.join(dir, `_sheet_cand${i}.png`);
      try {
        const rec = await makeImage(pool, {
          prompt, outPath: p, refs: null, size: o.size, ratio: o.aspect || "16:9",
          label: `设定表候选 ${i}`, retries: o.retries, checkUrl: o.checkUrl,
        });
        cands.push(rec);
      } catch (e) {
        agnes.log(`      [fail] 设定表候选 ${i}: ${String(e.message).split("\n")[0]}`);
      }
      if (i < n) await agnes.sleep(1200);
    }
    if (!cands.length) throw new Error("角色设定表生成失败（所有候选都失败）。无法在没有身份真源的情况下保持人物一致性。");

    // Score every candidate with the vision model and keep the best.
    let best = cands[0];
    let bestScore = -1;
    let bestPassed = false;
    const verdicts = [];
    if (verify && cands.length > 1) {
      for (const c of cands) {
        let v;
        try {
          v = await vision.scoreCharacterSheet(pool, c.outPath);
        } catch (e) {
          agnes.log(`        评分 ${path.basename(c.outPath)} 失败（忽略）: ${String(e.message).split("\n")[0].slice(0, 120)}`);
          continue;
        }
        const file = path.basename(c.outPath);
        verdicts.push({ file, score: v.score, passed: v.passed, issues: v.issues });
        agnes.log(
          `        评分 ${file}: ${v.score}` + (v.passed ? " (达标)" : " (未达标)") +
          (v.issues.length ? ` — ${v.issues.slice(0, 3).join("；")}` : "")
        );
        // Prefer a sheet that passed the hard gates; within the same class, the
        // higher score wins. If nothing passed, the highest score still wins.
        const better =
          bestScore < 0 ||
          (v.passed && !bestPassed) ||
          (v.passed === bestPassed && v.score > bestScore);
        if (better) { best = c; bestScore = v.score; bestPassed = v.passed; }
      }
    }

    fs.copyFileSync(best.outPath, sheetPath);
    fs.writeFileSync(sheetPath + ".url", best.url + "\n", "utf8");
    // Keep the losing candidates for manual review, flagged with their score.
    cands.filter((c) => c.outPath !== best.outPath).forEach((c, i) => {
      try {
        fs.renameSync(c.outPath, path.join(dir, `_sheet_rejected${i + 1}.png`));
        if (fs.existsSync(c.outPath + ".url")) fs.renameSync(c.outPath + ".url", path.join(dir, `_sheet_rejected${i + 1}.png.url`));
      } catch (e) { /* cosmetic */ }
    });
    cands.filter((c) => c.outPath === best.outPath).forEach((c) => {
      try { fs.unlinkSync(c.outPath); fs.unlinkSync(c.outPath + ".url"); } catch (e) { /* keep */ }
    });
    if (bestScore >= 0 && verify) agnes.log(`      选定设定表（评分 ${bestScore}）`);
    if (verify && bestScore >= 0 && bestScore < 45) {
      agnes.log("      ⚠ 设定表评分偏低，建议人工检查 ref_charsheet.png 后再继续。");
    }
    sheet = { outPath: sheetPath, url: best.url, label: "角色设定表", score: bestScore, verdicts };
  }

  // -------------------------------------------------------------------------
  // 2. Identity parameters, read back off the accepted sheet
  // -------------------------------------------------------------------------
  const lockPath = path.join(dir, LOCK_FILE);
  let identity = null;

  if (!o.force && fs.existsSync(lockPath)) {
    try {
      identity = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      agnes.log("      [skip] 身份参数 already extracted");
    } catch (e) { identity = null; }
  }
  if (!identity) {
    if (verify) {
      try {
        agnes.log("      从真实设定表反向提取结构化五官参数 ...");
        const got = await vision.extractIdentity(pool, sheetPath);
        identity = got;
      } catch (e) {
        agnes.log(`      [warn] 视觉提取身份参数失败，回退到规划器文本: ${String(e.message).split("\n")[0].slice(0, 140)}`);
      }
    }
    if (!identity) {
      // Fallback: trust the planner's structured parameters so the pipeline
      // still runs (with weaker guarantees) when vision is unavailable.
      identity = {};
      VISUAL_FIELDS.forEach((f) => { identity[f] = seed[f] || ""; });
      CREATIVE_FIELDS.forEach((f) => {
        if (seed[f] !== undefined && seed[f] !== null && seed[f] !== "") identity[f] = seed[f];
      });
      identity.identity_lock_en = seed.identity_lock_en || "";
      identity.identity_lock = seed.identity_lock || "";
      identity._source = "planner-params";
    } else {
      // The vision pass can only see what a neutral studio sheet contains.
      // Re-attach the planner's creative decisions so the character keeps its
      // emotional range, signature gestures and world.
      CREATIVE_FIELDS.forEach((f) => {
        const v = seed[f];
        if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) return;
        identity[f] = v;
      });
      if (!identity.wardrobe_layers && seed.wardrobe_layers) identity.wardrobe_layers = seed.wardrobe_layers;
      if (!identity.wardrobe && seed.wardrobe) identity.wardrobe = seed.wardrobe;
      if (!identity.hair_structure && seed.hair_style) identity.hair_structure = seed.hair_style;
      identity._source = "vision-from-sheet";
    }
    identity.name = seed.name || identity.name || "";
    agnes.writeFileSyncDurable(lockPath, JSON.stringify(identity, null, 2) + "\n");
  }
  if (identity.name === undefined) identity.name = seed.name || "";
  agnes.log(`      身份参数来源: ${identity._source || "cached"}`);
  if (identity._source === "vision-from-sheet" || (identity.face_shape && identity.eye_shape)) {
    agnes.log(`        脸型=${identity.face_shape} 眼型=${identity.eye_shape} 瞳色=${identity.iris_color} ` +
      `发型=${identity.hair_structure || identity.hair_style} 发色=${identity.hair_color}`);
  }
  const bank = Array.isArray(identity.expression_bank) ? identity.expression_bank : [];
  const acts = Array.isArray(identity.signature_actions) ? identity.signature_actions : [];
  agnes.log(
    `        角色档案: 表情库=${bank.length ? bank.map((e) => (e && (e.name || e)) || "?").join("/") : "（缺，将用默认四表情）"} ` +
    `标志动作=${acts.length} 条 场景气质=${identity.scene_affinity ? "已定义" : "未定义"} ` +
    `服装层次=${identity.wardrobe_layers ? "已分层" : "未分层"}`
  );

  // -------------------------------------------------------------------------
  // 3. Derived studio references: face close-up first, then per-angle bodies
  //
  // The face close-up goes first for two reasons: it is the highest-value
  // facial anchor, and every body view is generated from the sheet, so having a
  // clean single-subject portrait available early means a body view that comes
  // back as a contact sheet can be corrected against it.
  // -------------------------------------------------------------------------
  const bodies = {};
  const audit = verify
    ? (p, pth, angle) => vision.auditStudioRef(p, { candPath: pth, angle, maxPx: o.visionMaxPx })
    : null;

  const facePath = path.join(dir, "ref_face.png");
  if (o.force || !isUsable(facePath)) {
    agnes.log("      派生面部特写参考（面部身份锚点）...");
    try {
      const rec = await makeAuditedImage(pool, {
        prompt: render.buildFaceRefPrompt(identity),
        outPath: facePath,
        refs: [sheet.url],
        size: o.size,
        ratio: "1:1",
        label: "面部特写参考",
        retries: o.retries,
        checkUrl: o.checkUrl,
        auditRetries: 0, // a portrait has no full-body constraints to verify
      });
      bodies.face = rec;
    } catch (e) {
      agnes.log(`      [FAIL] 面部特写参考: ${String(e.message).split("\n")[0]}`);
    }
  } else {
    bodies.face = { outPath: facePath, url: readUrlSidecar(facePath), label: "面部特写参考" };
    agnes.log("      [skip] 面部特写参考 already exists");
  }

  const jobs = [];
  for (const a of angles) {
    const p = path.join(dir, `ref_body_${a.replace(/[^\w.-]/g, "_")}.png`);
    if (!o.force && isUsable(p)) {
      bodies[a] = { outPath: p, url: readUrlSidecar(p), label: `全身参考 ${a}` };
      agnes.log(`      [skip] 全身参考 ${a} already exists`);
      continue;
    }
    jobs.push({ angle: a, label: `全身参考 ${a}`, outPath: p, prompt: render.buildAngleRefPrompt(identity, a), ratio: refRatio });
  }

  if (jobs.length) {
    // Body references are derived from the single-subject face portrait, NOT
    // from the master sheet. Measured: feeding the multi-panel sheet in reliably
    // produced another multi-panel layout (15/15 attempts), because the model
    // copies the structure of its input. A portrait has no structure to copy.
    const bodyRef = (bodies.face && bodies.face.url) ? bodies.face.url : sheet.url;
    agnes.log(
      `      派生 ${jobs.length} 张白底全身参考图（比例 ${refRatio}，参考源：` +
      `${bodies.face && bodies.face.url ? "面部特写（单主体）" : "角色设定表"}）` +
      (audit ? `，每张都会校验"单人 / 非拼贴 / 头到脚"，不达标自动带缺陷重画 ...` : " ...")
    );
    const results = await agnes.runPool(
      jobs,
      async (j) => {
        await agnes.sleep(Math.random() * 600);
        return makeAuditedImage(pool, {
          prompt: j.prompt,
          outPath: j.outPath,
          refs: [bodyRef],
          size: o.size,
          ratio: j.ratio,
          label: j.label,
          retries: o.retries,
          checkUrl: o.checkUrl,
          audit: audit ? (p, pth) => audit(p, pth, j.angle) : null,
          auditRetries: o.refRetries,
        });
      },
      Math.min(o.concurrency || 2, jobs.length)
    );
    results.forEach((r, i) => {
      const j = jobs[i];
      if (!r.ok) {
        agnes.log(`      [FAIL] ${j.label}: ${String(r.error.message).split("\n")[0]}`);
        return;
      }
      if (r.value.url) bodies[j.angle] = r.value;
    });
  }

  const have = Object.keys(bodies).filter((k) => bodies[k]);
  agnes.log(`      角色素材就绪: 设定表=${sheet ? "ok" : "MISSING"}  ${have.join(", ") || "none"}`);

  return { identity, sheet, face: bodies.face || null, bodies };
}

// ---------------------------------------------------------------------------
// Scene pipeline — the "asset first" rule applied to locations
// ---------------------------------------------------------------------------

/**
 * A location is an asset, not a phrase.
 *
 * Three shots set in "the same rain-soaked alley" are three independent
 * generations. Described only in prose, the alley's width, the position of its
 * lamps, the colour of its wet stone and the direction of its key light all
 * drift between them, and the audience reads three different alleys. Anchoring
 * the location to one generated empty frame — and passing that frame to every
 * shot at that location — is what makes a place a place.
 *
 * The anchor is generated EMPTY on purpose. A scene reference containing a
 * face would compete with the character references for control of the frame,
 * which is the same clash that makes a multi-panel input reproduce a
 * multi-panel output (measured: 15/15).
 */

/** The key a shot uses to point at a scene, normalised. */
function sceneKey(s) {
  return String((s && (s.id || s.name)) || "").trim();
}

/** Scene keys actually referenced by at least one shot. */
function usedSceneIds(sb) {
  const set = new Set();
  ((sb && sb.shots) || []).forEach((sh) => {
    const k = String((sh && (sh.scene_id || sh.location_id)) || "").trim();
    if (k) set.add(k);
  });
  return set;
}

/** File name for a location anchor. */
function sceneRefPath(dir, key) {
  return path.join(dir, `ref_scene_${String(key).replace(/[^\w.-]/g, "_")}.png`);
}

/**
 * Generate one empty reference frame per location.
 *
 * Only locations that at least one shot actually points at are generated — an
 * unused anchor is a wasted call. When the storyboard has no `scenes[]` at all
 * (an older project, or a planner that skipped it) this returns {} and the
 * pipeline behaves exactly as before.
 *
 * @returns {Promise<Object<string, {outPath:string,url:string,label:string}>>}
 */
async function buildSceneAssets(pool, o) {
  const dir = o.dir;
  const out = {};
  const scenes = ((o.sb && Array.isArray(o.sb.scenes)) ? o.sb.scenes : []).filter(Boolean);
  if (!scenes.length) {
    agnes.log("      [skip] 分镜未定义 scenes[]，本次不生成场景锚点图（同一地点的多个镜头将各自生成场景）");
    return out;
  }
  const used = usedSceneIds(o.sb);
  if (!used.size) {
    agnes.log("      [skip] 镜头都未填写 scene_id，无法把场景锚点挂到镜头上（请在分镜里补充 scene_id）");
    return out;
  }
  const wanted = scenes.filter((s) => used.has(sceneKey(s)));
  const orphan = [...used].filter((k) => !scenes.some((s) => sceneKey(s) === k));
  if (orphan.length) {
    agnes.log(`      [warn] 以下 scene_id 在 scenes[] 里找不到对应定义，会被忽略：${orphan.join("、")}`);
  }
  if (!wanted.length) return out;

  const jobs = [];
  for (const s of wanted) {
    const key = sceneKey(s);
    const p = sceneRefPath(dir, key);
    if (!o.force && isUsable(p)) {
      out[key] = { outPath: p, url: readUrlSidecar(p), label: `场景锚点 ${key}` };
      agnes.log(`      [skip] 场景锚点 ${key} already exists`);
      continue;
    }
    jobs.push({
      key,
      outPath: p,
      label: `场景锚点 ${key}${s.name ? `（${s.name}）` : ""}`,
      prompt: render.buildSceneRefPrompt(s, o.sb),
      ratio: o.aspect || "16:9",
    });
  }

  if (jobs.length) {
    agnes.log(
      `      生成 ${jobs.length} 张场景锚点图（无人空镜，锁定空间 / 材质 / 光位 / 色调，供同地点镜头共用）` +
      (o.verify ? "，每张都会校验“零人物 / 非拼贴 / 空间可辨”，不达标自动带缺陷重画" : "") + " ..."
    );
    const results = await agnes.runPool(
      jobs,
      async (j) => {
        await agnes.sleep(Math.random() * 600);
        return makeAuditedImage(pool, {
          prompt: j.prompt,
          outPath: j.outPath,
          refs: null,
          size: o.size,
          ratio: j.ratio,
          label: j.label,
          retries: o.retries,
          checkUrl: o.checkUrl,
          audit: o.verify
            ? (p, pth) => vision.auditSceneRef(p, { candPath: pth, maxPx: o.visionMaxPx })
            : null,
          auditRetries: o.refRetries,
        });
      },
      Math.min(o.concurrency || 2, jobs.length)
    );
    results.forEach((r, i) => {
      const j = jobs[i];
      if (!r.ok) {
        agnes.log(`      [FAIL] ${j.label}: ${String(r.error.message).split("\n")[0]}`);
        return;
      }
      if (r.value.url) out[j.key] = r.value;
    });
  }

  const have = Object.keys(out);
  agnes.log(`      场景锚点就绪 ${have.length}/${wanted.length}${have.length ? `：${have.join(", ")}` : ""}`);
  return out;
}

/** Load whatever location anchors already exist on disk. */
function loadSceneAssets(dir, sb) {
  const out = {};
  const scenes = ((sb && Array.isArray(sb.scenes)) ? sb.scenes : []).filter(Boolean);
  for (const s of scenes) {
    const key = sceneKey(s);
    if (!key) continue;
    const p = sceneRefPath(dir, key);
    if (isUsable(p)) out[key] = { outPath: p, url: readUrlSidecar(p), label: `场景锚点 ${key}` };
  }
  return out;
}

/** The location anchor a shot points at, or null. */
function sceneRefFor(shot, sceneAssets) {
  if (!shot || !sceneAssets) return null;
  const k = String(shot.scene_id || shot.location_id || "").trim();
  if (!k) return null;
  return sceneAssets[k] || null;
}

// ---------------------------------------------------------------------------
// Reference selection for a shot
// ---------------------------------------------------------------------------

/**
 * Load whatever character assets already exist on disk.
 *
 * Used by `--skip-refs`: "do not spend calls regenerating the references" must
 * not silently degrade into "do not use the references either". If a sheet and
 * angle views are present, shots keep their identity anchoring and only the
 * keyframes are re-rendered.
 *
 * @returns {{identity:object|null, sheet:object|null, face:object|null, bodies:object}}
 */
function loadCharacterAssets(dir) {
  const out = { identity: null, sheet: null, face: null, bodies: {} };

  const lockPath = path.join(dir, LOCK_FILE);
  if (fs.existsSync(lockPath)) {
    try { out.identity = JSON.parse(fs.readFileSync(lockPath, "utf8")); } catch (e) { out.identity = null; }
  }

  const sheetPath = path.join(dir, "ref_charsheet.png");
  if (isUsable(sheetPath)) {
    out.sheet = { outPath: sheetPath, url: readUrlSidecar(sheetPath), label: "角色设定表" };
  }

  const facePath = path.join(dir, "ref_face.png");
  if (isUsable(facePath)) {
    out.face = { outPath: facePath, url: readUrlSidecar(facePath), label: "面部特写参考" };
    out.bodies.face = out.face;
  }

  for (const a of render.SHEET_ANGLES) {
    const p = path.join(dir, `ref_body_${a.replace(/[^\w.-]/g, "_")}.png`);
    if (isUsable(p)) out.bodies[a] = { outPath: p, url: readUrlSidecar(p), label: `全身参考 ${a}` };
  }

  return out;
}

/**
 * Map a free-text subject orientation from the planner onto a reference angle.
 */
function normaliseView(v) {
  const s = String(v || "").toLowerCase();
  if (!s || s === "none" || /无|空镜|none/.test(s)) return null;
  if (/back|背/.test(s)) return "back";
  if (/profile|side|侧/.test(s)) return "side";
  if (/3q|three.?quarter|three quarter|四分之三|45/.test(s)) {
    return /right|右/.test(s) ? "3q-right" : "3q-left";
  }
  if (/front|正面|正对/.test(s)) return "front";
  return "front";
}

/**
 * Pick the reference images for one shot, and label what each one is for.
 *
 * Order matters twice over. The render prompt addresses the images by position,
 * so the sequence and the `roles` array have to stay in lockstep. Identity
 * images go first (the full-body view at the shot's angle, then the face
 * close-up) because the face is the harder constraint to satisfy; the location
 * anchor goes last so it contributes the room without competing for the face.
 *
 * @returns {{paths:string[], urls:string[], labels:string[], roles:string[], view:string|null}}
 *          `roles[i]` is "identity" | "scene" | "style" for `paths[i]`.
 */
function pickShotRefs(shot, assets, o) {
  o = o || {};
  const out = { paths: [], urls: [], labels: [], roles: [], view: null };
  const push = (rec, role, label) => {
    if (!rec || !rec.url) return;
    out.paths.push(rec.outPath);
    out.urls.push(rec.url);
    out.labels.push(label || rec.label || role);
    out.roles.push(role);
  };

  const hasCharacter =
    o.hasCharacter !== false &&
    Array.isArray(shot.characters_in_shot) && shot.characters_in_shot.length > 0;

  if (hasCharacter) {
    const view = normaliseView(shot.characters_view || shot.characters_orientation);
    const useView = view && assets.bodies[view] ? view : "front";
    out.view = useView;

    // Identity images come FIRST: the face is the harder constraint, and the
    // render prompt references them by position.
    const body = assets.bodies[useView] || assets.bodies.front || null;
    push(body, "identity", `全身参考(${useView})`);
    push(assets.face, "identity", "面部特写");

    // Optional third identity anchor: the master sheet itself.
    if (o.includeSheet) push(assets.sheet, "identity", "角色设定表");
  }

  // The location anchor travels with BOTH character shots and empty shots —
  // that is the whole point of a location asset. Passing it to a character shot
  // does not dilute the identity: the render prompt names each image's job, so
  // the model knows which one to mine for a face and which only for the room.
  if (o.sceneRef && o.sceneRef.url) push(o.sceneRef, "scene", o.sceneRef.label || "场景锚点");

  return out;
}

module.exports = {
  LOCK_FILE,
  VISUAL_FIELDS,
  CREATIVE_FIELDS,
  readUrlSidecar,
  isUsable,
  makeImage,
  makeAuditedImage,
  buildCharacterAssets,
  loadCharacterAssets,
  sceneKey,
  usedSceneIds,
  sceneRefPath,
  buildSceneAssets,
  loadSceneAssets,
  sceneRefFor,
  pickShotRefs,
  normaliseView,
};
