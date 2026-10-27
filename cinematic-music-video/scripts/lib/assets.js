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
          `取景=${v.head_to_toe ? "头顶入画" : "被裁"} 评分=${v.score} ` + (v.passed ? "通过" : "未达标")
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
 * `_source` values that represent human/design INTENT rather than a lossy
 * read-back of a generated picture. An identity lock carrying one of these must
 * survive `--force`, because `--force` means "regenerate the images" — it does
 * NOT mean "throw away the identity".
 *
 * Real incident this guards against: a project's lock had been corrected back to
 * the storyboard design (the vision read-back had drifted to an older, rounder,
 * heavier-looking character). Re-running with `--force` silently re-extracted
 * from the sheet and overwrote it, so all 36 keyframes were drawn from the wrong
 * face. `--force` is the natural flag to reach for when re-running, which makes
 * this footgun very easy to trigger and very hard to notice.
 */
const AUTHORITATIVE_LOCK_SOURCES = new Set(["storyboard", "planner-params", "manual"]);

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
 * Fields that describe DESIGN INTENT, not something a camera can observe.
 *
 * The vision pass is authoritative for a FACE — it is literally looking at the
 * accepted sheet — but it must never be authoritative for these, because a sheet
 * can be drawn wrong while the design intent was right:
 *
 *   wardrobe_layers / wardrobe / garment_palette
 *     Real incident (「月饼卖不动」, 2026-09-23): the sheet was drawn WITHOUT the
 *     protagonist's bright red qipao dress. The model kept the white t-shirt
 *     (listed first, as the inner layer) and dropped the outer garment entirely.
 *     The read-back faithfully reported `outer: "none"`, and because these fields
 *     sat in VISUAL_FIELDS that answer REPLACED the design intent. Every later
 *     prompt then said "wearing a white cotton t-shirt, outer layer: none" — the
 *     red dress that carries the whole 国潮 palette was gone from all 16
 *     keyframes before a single one had been generated.
 *
 *   physique
 *     "petite, about 155cm" is a design decision. A sheet that renders a petite
 *     17-year-old as a small child must not be allowed to relabel the character
 *     as "child, approximately 6-8 years old" — which is exactly what happened,
 *     and it would have been written into every prompt.
 *
 * Both are cases of a lossy observation overwriting a stated intent; the
 * observation is the thing to distrust, so divergence is logged and the intent
 * wins.
 */
const DESIGN_INTENT_FIELDS = ["wardrobe_layers", "garment_palette", "wardrobe", "physique"];

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

  // A sheet ON DISK that is not usable means somebody signed off a reference
  // sheet and its `.url` sidecar went missing (or the file got truncated).
  // Regenerating here would silently replace a signed-in character with a
  // freshly invented one — exactly what happened on 春风许我再少年 (2026-10-04):
  // the whole film came back as a stranger and nobody noticed until keyframes
  // were rendered. Refuse, and say precisely how to proceed.
  // (HARDENING 坑位 76)
  if (!o.force && fs.existsSync(sheetPath) && !isUsable(sheetPath)) {
    const bytes = fs.statSync(sheetPath).size;
    const why = readUrlSidecar(sheetPath) ? "文件过小（" + bytes + " 字节）" : "缺少 .url 边车（或边车为空）";
    throw new Error(
      "ref_charsheet.png 已存在（" + bytes + " 字节）但被判为不可用：" + why + "。\n" +
      "  这份设定表可能是人工签字过的角色真源 —— 静默重建会把整片换成另一个人，故已中止。\n" +
      "  · 若只是 URL 边车丢了：补写 " + sheetPath + ".url（一行公开可访问的图片 URL）；\n" +
      "    或用 assets/set-charsheet.js --project \"<项目>\" --from \"<签字图.png>\" 重新落位。\n" +
      "  · 若确实要重建角色：显式加 --force-refs（但这会丢掉签字形象）。"
    );
  }

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

  if (fs.existsSync(lockPath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      if (!o.force) {
        identity = cached;
        agnes.log("      [skip] 身份参数 already extracted");
      } else if (AUTHORITATIVE_LOCK_SOURCES.has(String(cached._source || ""))) {
        identity = cached;
        agnes.log(
          `      [keep] 身份参数 _source=${cached._source} 为权威真源，--force 只重画图、不覆盖它` +
            "（确实想按新设定表反读，请先删除 character_lock.json）"
        );
      }
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

      // Design intent outranks the read-back. A divergence here means the sheet
      // is missing (or misdrawing) something the planner specified — worth a log
      // line, because every downstream prompt inherits whichever side wins.
      DESIGN_INTENT_FIELDS.forEach((f) => {
        const want = seed[f];
        const empty = want === undefined || want === null || want === "" || (Array.isArray(want) && !want.length);
        if (empty) return;
        if (JSON.stringify(identity[f]) !== JSON.stringify(want)) {
          agnes.log(
            `      [keep] 身份参数 ${f} 以规划器设定为准（反读结果与设计意图不一致 —— 设定表可能漏画或改动了它）`
          );
        }
        identity[f] = want;
      });
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
    ? (p, pth, angle, framing) => vision.auditStudioRef(p, { candPath: pth, angle, framing, maxPx: o.visionMaxPx })
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

  // Two axes per reference, not one:
  //   angle   — front / 3q-left / 3q-right / side / back   (bodies[angle])
  //   framing — full (default) / waistup                    (bodies[<framing>][angle])
  // `full` keeps the historical `ref_body_<angle>.png` filenames; other framings
  // write `ref_<framing>_<angle>.png`. A keyframe then picks ONE reference by
  // `shot_size -> framing` + `characters_view -> angle`, so the reference agrees
  // with the framing instead of fighting it (HARDENING 坑位 75 补记三 / 补记五).
  const framings = (o.framings && o.framings.length ? o.framings : ["full"]).slice();
  const jobs = [];
  for (const f of framings) {
    const F = render.FRAMINGS[f] || render.FRAMINGS.full;
    for (const a of angles) {
      const slug = a.replace(/[^\w.-]/g, "_");
      const p = f === "full"
        ? path.join(dir, `ref_body_${slug}.png`)
        : path.join(dir, `ref_${f}_${slug}.png`);
      const label = `${F.key}参考 ${a}`;
      if (!o.force && isUsable(p)) {
        refBucket(bodies, f)[a] = { outPath: p, url: readUrlSidecar(p), label };
        agnes.log(`      [skip] ${label} already exists`);
        continue;
      }
      jobs.push({
        framing: f,
        angle: a,
        label,
        outPath: p,
        prompt: render.buildAngleRefPrompt(identity, a, f),
        ratio: f === "full" ? refRatio : (o.waistRatio || "3:4"),
      });
    }
  }

  if (jobs.length) {
    // Body references are derived from the single-subject face portrait, NOT
    // from the master sheet. Measured: feeding the multi-panel sheet in reliably
    // produced another multi-panel layout (15/15 attempts), because the model
    // copies the structure of its input. A portrait has no structure to copy.
    const bodyRef = (bodies.face && bodies.face.url) ? bodies.face.url : sheet.url;
    agnes.log(
      `      派生 ${jobs.length} 张白底参考图（取景 ${framings.join("/")}，参考源：` +
      `${bodies.face && bodies.face.url ? "面部特写（单主体）" : "角色设定表"}）` +
      (audit ? `，每张都会校验"单人 / 非拼贴 / 取景正确"，不达标自动带缺陷重画 ...` : " ...")
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
          audit: audit ? (p, pth) => audit(p, pth, j.angle, j.framing) : null,
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
      if (r.value.url) refBucket(bodies, j.framing)[j.angle] = r.value;
    });
  }

  // 采纳磁盘上**已存在、但本次 `--framings` 没要**的取景档。
  //
  // 为什么必要：上面的派生循环只遍历本次请求的取景档。默认 `--framings full`
  // 的一个"只重画某一镜"的跑法，会把已经躺在磁盘上的半身库（ref_waistup_*.png）
  // 无声丢掉 —— 于是中景镜退回**全身**参考，拿到的取景档和整片当初拍的都不一样。
  // 而 `--skip-refs` 走的是 loadCharacterAssets（它本来就扫描磁盘），没有这个毛病。
  // 结果就是：同一次修复，"单跑一镜"和"整片重跑"选的参考图不同（2026-10-04
  // 春风许我再少年 S03/S09 实测：--only ... --force 选 全身参考，--skip-refs 选
  // 半身参考）。这里让两条路径对齐：本次不生成，但仍采纳磁盘上现成的。
  // 见 HARDENING 坑位 81。
  for (const f of Object.keys(render.FRAMINGS || {})) {
    if (f === "full" || framings.includes(f)) continue;
    for (const a of angles) {
      const bucket = refBucket(bodies, f);
      if (bucket[a]) continue;
      const slug = a.replace(/[^\w.-]/g, "_");
      const p = path.join(dir, `ref_${f}_${slug}.png`);
      if (isUsable(p)) {
        bucket[a] = {
          outPath: p,
          url: readUrlSidecar(p),
          label: `${(render.FRAMINGS[f] || {}).key || f}参考 ${a}`,
        };
      }
    }
  }

  const NON_FULL = Object.keys(render.FRAMINGS || { full: 1 }).filter((f) => f !== "full");
  const have = Object.keys(bodies)
    .filter((k) => !NON_FULL.includes(k) && bodies[k])
    .concat(
      NON_FULL.filter((f) => bodies[f] && Object.keys(bodies[f]).length)
        .map((f) => `${f}:${Object.keys(bodies[f]).join("+")}`)
    );
  agnes.log(`      角色素材就绪: 设定表=${sheet ? "ok" : "MISSING"}  ${have.join(", ") || "none"}`);

  return { identity, sheet, face: bodies.face || null, bodies };
}

/**
 * `bodies` holds the full-length views directly (`bodies[angle]`) for historical
 * compatibility, and every other framing under `bodies[<framing>][angle]`.
 */
function refBucket(bodies, framing) {
  if (!framing || framing === "full") return bodies;
  bodies[framing] = bodies[framing] || {};
  return bodies[framing];
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

/** File name for a location anchor. `full` keeps the historical un-suffixed name. */
function sceneRefPath(dir, key, framing) {
  const slug = String(key).replace(/[^\w.-]/g, "_");
  return framing && framing !== "full"
    ? path.join(dir, `ref_scene_${slug}_${framing}.png`)
    : path.join(dir, `ref_scene_${slug}.png`);
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

  // A place is drawn at one or more DISTANCES (render.SCENE_FRAMINGS), for the
  // same reason a character is: a shot must be handed a plate whose framing
  // matches its own, or the plate's framing wins. `full` keeps the historical
  // name; other distances are suffixed and keyed under out[key][<framing>].
  const framings = (o.sceneFramings && o.sceneFramings.length ? o.sceneFramings : ["full"]).slice();
  const jobs = [];
  for (const s of wanted) {
    const key = sceneKey(s);
    for (const f of framings) {
      const F = render.SCENE_FRAMINGS[f] || render.SCENE_FRAMINGS.full;
      const p = sceneRefPath(dir, key, f);
      const label = `场景锚点 ${key}·${F.key}`;
      if (!o.force && isUsable(p)) {
        (out[key] = out[key] || {})[f] = { outPath: p, url: readUrlSidecar(p), label };
        agnes.log(`      [skip] ${label} already exists`);
        continue;
      }
      jobs.push({
        key,
        framing: f,
        outPath: p,
        label,
        prompt: render.buildSceneRefPrompt(s, o.sb, f),
        ratio: o.aspect || "16:9",
      });
    }
  }

  if (jobs.length) {
    agnes.log(
      `      生成 ${jobs.length} 张场景锚点图（取景 ${framings.join("/")}，无人空镜，锁定空间 / 材质 / 光位 / 色调，供同地点镜头共用）` +
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
      if (r.value.url) (out[j.key] = out[j.key] || {})[j.framing] = r.value;
    });
  }

  // 与角色取景档同源的采纳逻辑：本次没请求、但磁盘上已经存在的距离档也要用起来。
  // 否则默认 `--scene-framings full` 的一次单镜重跑，会把中景 / 近景盘丢掉，
  // 中景镜退回**全景**盘 —— 拿到的距离档和整片当初用的不一样。见 HARDENING 坑位 81。
  for (const s of wanted) {
    const key = sceneKey(s);
    if (!key) continue;
    for (const f of Object.keys(render.SCENE_FRAMINGS || {})) {
      if (f === "full" || framings.includes(f)) continue;
      if (out[key] && out[key][f]) continue;
      const p = sceneRefPath(dir, key, f);
      if (!isUsable(p)) continue;
      const F = (render.SCENE_FRAMINGS || {})[f] || {};
      (out[key] = out[key] || {})[f] = {
        outPath: p,
        url: readUrlSidecar(p),
        label: `场景锚点 ${key}·${F.key || f}`,
      };
    }
  }

  const have = Object.keys(out).filter((k) => out[k] && Object.keys(out[k]).length);
  const summary = have.map((k) => `${k}(${Object.keys(out[k]).join("+")})`).join(", ");
  agnes.log(`      场景锚点就绪 ${have.length}/${wanted.length}${have.length ? `：${summary}` : ""}`);
  return out;
}

/** Load whatever location anchors already exist on disk. */
function loadSceneAssets(dir, sb) {
  const out = {};
  const scenes = ((sb && Array.isArray(sb.scenes)) ? sb.scenes : []).filter(Boolean);
  const framings = Object.keys(render.SCENE_FRAMINGS || { full: 1 });
  for (const s of scenes) {
    const key = sceneKey(s);
    if (!key) continue;
    for (const f of framings) {
      const p = sceneRefPath(dir, key, f);
      if (!isUsable(p)) continue;
      const F = (render.SCENE_FRAMINGS || {})[f] || {};
      (out[key] = out[key] || {})[f] = { outPath: p, url: readUrlSidecar(p), label: `场景锚点 ${key}·${F.key || f}` };
    }
  }
  return out;
}

/**
 * 近景镜的**服装参考**：把全身参考裁到上半身再喂。
 *
 * 为什么需要：近景镜只挂一张面部胸像时，模型会把那张图当成"要复刻的画面"，
 * 照着它复制构图、再按 wardrobe 文字另画一个人（春风 S04 实测 0/25/10 分，
 * 画面里两个女孩，主角不在场）。补一张服装参考即可让两张图互为制衡。
 *
 * 但**不能直接把全身竖幅递过去** —— 那是"站直的全身照"，会把构图拽回远景
 * （坑位 75 的原始症状）。所以裁到上半身（头到膝附近），既给出服装的层次与
 * 粉→蓝渐变的依据，又不携带"站姿全身"这个构图信号。
 */
async function tightBodyRef(bodyRec, dir, ratio = 0.6) {
  if (!bodyRec || !bodyRec.outPath || !fs.existsSync(bodyRec.outPath)) return bodyRec || null;
  const sharp = require("sharp");
  const cacheDir = path.join(dir, "_body_tight");
  fs.mkdirSync(cacheDir, { recursive: true });
  const tag = String(ratio).replace(/[^\d]/g, "");
  const outPath = path.join(cacheDir, path.basename(bodyRec.outPath, ".png") + "_upper" + tag + ".png");

  if (!fs.existsSync(outPath)) {
    const m = await sharp(bodyRec.outPath).metadata();
    const h = Math.max(64, Math.round(m.height * ratio));
    await sharp(bodyRec.outPath)
      .extract({ left: 0, top: 0, width: m.width, height: Math.min(h, m.height) })
      .resize({ width: Math.min(1024, m.width) })
      .png({ compressionLevel: 9 })
      .toFile(outPath);
  }

  const url = "data:image/png;base64," + fs.readFileSync(outPath).toString("base64");
  return { outPath, url, label: `${bodyRec.label}·上半身` };
}

/**
 * 近景镜的景别 -> 场景锚点的**中心裁切比例**（保留画面中心多大一块）。
 * 数值越小 = 裁得越紧 = 越接近该景别的取景。
 */
const TIGHT_CROP_RATIO = {
  // ⚠ 键必须是**空格**形式：tightCropRatio() 会把连字符/下划线归一化成空格
  // （`close-up` → `close up`）。写成连字符会静默匹配不上、落到默认值 0.36 ——
  // 同一个坑在 SHOT_SIZE_CLAUSE 上已经踩过一次（HARDENING 坑位 75）。
  "extreme close up": 0.2,
  macro: 0.2,
  detail: 0.24,
  insert: 0.24,
  "close up": 0.3,
  "medium close up": 0.42,
};

function tightCropRatio(shotSize) {
  const s = String(shotSize || "").trim().toLowerCase().replace(/[-_]+/g, " ");
  return TIGHT_CROP_RATIO[s] || 0.36;
}

/**
 * 把本地裁切图克隆成**公网托管图**用的提示词（同 assets/rehost.js）。
 * 刻意只描述"这是什么、保持原样"，不写任何具体名词 —— 写进去就是反向点单。
 */
const CROP_HOST_PROMPT =
  "EXACT REPRODUCTION of this photograph, pixel for pixel. Output the SAME image with ZERO changes: " +
  "the same scene, identical materials and textures, identical lighting and colour, identical background, " +
  "identical camera angle, identical crop, identical framing and identical grain. " +
  "The frame is exactly as empty of people as the source is. " +
  "Do NOT widen the crop, do NOT pull the camera back, do NOT add anything that is outside the frame. " +
  "Do NOT improve, restyle, re-light, re-render or reinterpret anything.";

/**
 * 近景镜专用的场景锚点：**裁到中心、再放大**，并**托管成公网 URL**。
 *
 * 为什么需要（坑位 75 补记三的正确解法）：
 * 场景锚点是整个空间的大远景空镜，模型会照抄它的取景 —— 春风 S13 的
 * `medium close-up` 被云雾山巅大远景连着拽成"山巅 + 站直的小人"。
 * 而不挂锚点会更糟（环境失控，画成园林）。
 *
 * 关键实测发现：**用 data URI 传裁切图会让画面多出第二个人**。
 * 五轮对照（全部 2026-10-04 春风 S04/S13）：
 *   · face(URL) + 场景原图(URL)                    → 单人
 *   · face(URL) + 场景原图(URL) + 裁切(data URI)    → **双人**
 *   · face(URL) + 裁切(data URI)                   → **双人**
 *   · face(URL) + 文字                              → **双人**
 *   · body(URL) + face(URL) + 场景原图(URL)         → 单人
 * 规律：**参考图里只要出现 data URI，画面就多一个人**；全是公网 URL 时才干净。
 * 所以裁切图必须走 rehost 路径换回 URL —— 管线没有独立上传接口，唯一办法是
 * 把裁切图当 i2i 输入再生成一次（克隆产物 ≈ 原图，`rehost.js` 已是这条路径）。
 * 结果按文件缓存 `.url` 边车，同场景同景别只托管一次。
 *
 * @param {object} sceneRef  { outPath, url, label }
 * @param {string} shotSize  分镜景别词
 * @param {string} dir       项目 02_images 目录
 * @param {object} pool      key 池（托管需要；缺省则退回 data URI）
 */
async function tightSceneRef(sceneRef, shotSize, dir, pool) {
  if (!sceneRef || !sceneRef.outPath || !fs.existsSync(sceneRef.outPath)) return sceneRef;
  const sharp = require("sharp");
  const ratio = tightCropRatio(shotSize);
  const cacheDir = path.join(dir, "_scene_tight");
  fs.mkdirSync(cacheDir, { recursive: true });
  const key = path.basename(sceneRef.outPath, ".png") + "_" + String(ratio).replace(/[^\d]/g, "");
  const outPath = path.join(cacheDir, key + ".png");

  if (!fs.existsSync(outPath)) {
    const m = await sharp(sceneRef.outPath).metadata();
    const w = Math.max(64, Math.round(m.width * ratio));
    const h = Math.max(64, Math.round(m.height * ratio));
    await sharp(sceneRef.outPath)
      .extract({
        left: Math.max(0, Math.round((m.width - w) / 2)),
        top: Math.max(0, Math.round((m.height - h) / 2)),
        width: w,
        height: h,
      })
      // 缩到 768 宽：克隆请求体不宜过大。
      .resize({ width: Math.min(768, m.width) })
      .png({ compressionLevel: 9 })
      .toFile(outPath);
  }

  let url = readUrlSidecar(outPath);
  if (!url && pool) {
    // 裁切图没有公网 URL —— 用一次 i2i 克隆换回来（克隆产物就地覆盖，
    // 保证"部署的图"与"远端 URL 指向的图"是同一张，rehost.js 的铁律）。
    const dataUri = "data:image/png;base64," + fs.readFileSync(outPath).toString("base64");
    const rec = await makeImage(pool, {
      prompt: CROP_HOST_PROMPT,
      outPath,
      refs: [dataUri],
      size: "2K",
      ratio: "16:9",
      label: `场景裁切托管 ${key}`,
      retries: 2,
      checkUrl: true,
    });
    url = rec.url;
  }

  return { outPath, url: url || "data:image/png;base64," + fs.readFileSync(outPath).toString("base64"), label: `${sceneRef.label}·近景裁切` };
}

/** The location anchor a shot points at, or null. */
/**
 * Which DISTANCE of a location plate a shot size calls for.
 * Shot framings are close / waistup / full; plate framings are close / medium / full.
 */
function sceneFramingForShotSize(shotSize) {
  const f = framingForShotSize(shotSize);
  return f === "waistup" ? "medium" : f;
}

/**
 * Read a per-shot framing override off the storyboard, failing LOUD on a typo.
 *
 * Two override fields exist, one per axis that used to be welded to `shot_size`:
 *   shot.ref_framing     -> the IDENTITY anchor's distance (close | waistup | full)
 *   shot.scene_framing   -> the LOCATION plate's distance  (close | medium | full)
 *
 * Both were CLI-only flags (`--ref-framing`, `--scene-image`) until 2026-10-04.
 * A flag fixes one run; a field fixes the project — and the fix this exists for
 * (9x16 S13/S16: a wide shot handed the scene's `full` plate, so a life-size
 * figure stood in front of a table-top village) must survive every later re-run
 * of images.js. Anything unrecognised THROWS: this project has been burned too
 * many times by a silent fallback quietly ignoring a creative decision
 * (HARDENING 坑位 89).
 */
function normaliseFramingOverride(raw, axis, shotId) {
  const s = String(raw == null ? "" : raw).trim().toLowerCase().replace(/[-_]+/g, " ");
  if (!s) return null;
  const close = /^(close|near|tight|cu|ecu|face|close up|extreme close up|面部|特写|近景)$/;
  const half = /^(waistup|waist|waist up|mcu|medium close|medium close up|half|half body|半身|中近景)$/;
  const wide = /^(full|full body|long|body|wide|medium wide|extreme wide|全身|全景)$/;
  const med = /^(medium|mid|中景)$/;
  if (axis === "scene") {
    if (close.test(s)) return "close";
    if (med.test(s) || half.test(s)) return "medium";
    if (wide.test(s)) return "full";
  } else {
    if (close.test(s)) return "close";
    if (half.test(s) || med.test(s)) return "waistup";
    if (wide.test(s)) return "full";
  }
  throw new Error(
    `${shotId ? shotId + ": " : ""}无效的 ${axis === "scene" ? "scene_framing" : "ref_framing"} 值 "${raw}" —— ` +
      (axis === "scene"
        ? "只接受 close | medium | full（其余同义词见 assets.js normaliseFramingOverride）"
        : "只接受 close | waistup | full（其余同义词见 assets.js normaliseFramingOverride）")
  );
}

/**
 * A per-shot custom LOCATION plate (`shot.scene_plate`), or null.
 *
 * Why this exists on top of `scene_framing`:
 *   `scene_framing` can only choose among the distances a scene already has
 *   (full / medium / close). When those distances are all WRONG — the scene was
 *   anchored from a distant vista, so every plate in the family draws the
 *   architecture at toy scale — the only fix left is a plate that does not exist
 *   yet: the same location, re-shot from another camera position, at true
 *   architectural scale.
 *
 * 2026-10-04《春风许我再少年》9:16 S18/S21: both are wide courtyard shots, both
 * were handed the scene's `full` plate (a water-town vista whose moon gate is a
 * tenth of the frame). Swapping them onto the existing `medium` plate fixes the
 * scale but clones S13/S15/S16/S19 — six identical frames. So the user asked for
 * a *new camera position* of the same courtyard, and a new plate has no
 * `scene_framing` name to point at. Hence this field.
 *
 * Accepts an absolute local path (with a `.url` sidecar when the image also has
 * to survive into the video stage; otherwise it is inlined as a data URI, the
 * same way `images.js --ref-image` already does) or an http(s) URL.
 *
 * Everything unrecognised THROWS rather than falling back to the scene default:
 * this project has been burned by silent fallbacks swallowing creative decisions
 * (HARDENING 坑位 89 / 94), and a plate that quietly reverts is exactly that.
 */
function readScenePlateOverride(shot, shotId) {
  const raw = String((shot && shot.scene_plate) || "").trim();
  if (!raw) return null;
  const id = shotId || (shot && shot.id) || "?";
  if (/^https?:\/\//i.test(raw)) {
    return { outPath: null, url: raw, label: "自定义场景盘(远程)", custom: true };
  }
  if (!path.isAbsolute(raw)) {
    throw new Error(
      `${id}: scene_plate 必须是**绝对路径**或 http(s) URL，收到 "${raw}" —— ` +
        "相对路径会随工作目录解析到不同文件，宁可报错也不静默指向别处"
    );
  }
  if (!fs.existsSync(raw)) throw new Error(`${id}: scene_plate 指向的文件不存在：${raw}`);
  const side = readUrlSidecar(raw);
  if (side) return { outPath: raw, url: side, label: `自定义场景盘(${path.basename(raw)})`, custom: true };
  const dataUri = "data:image/png;base64," + fs.readFileSync(raw).toString("base64");
  agnes.log(
    `      [scene_plate] ${id} 本地盘无 .url 边车，改用 data URI（${(dataUri.length / 1024 / 1024).toFixed(2)} MB）`
  );
  return {
    outPath: raw,
    url: dataUri,
    label: `自定义场景盘(${path.basename(raw)}·dataURI)`,
    custom: true,
  };
}

function sceneRefFor(shot, sceneAssets) {
  if (!shot) return null;
  // A storyboard-pinned plate wins over everything: it names one exact file.
  const pinned = readScenePlateOverride(shot);
  if (pinned) return pinned;
  if (!sceneAssets) return null;
  const k = String(shot.scene_id || shot.location_id || "").trim();
  if (!k) return null;
  const e = sceneAssets[k];
  if (!e) return null;
  if (e.url) return e; // legacy single-plate entry
  // A per-shot `scene_framing` wins over the shot_size-derived distance.
  //
  // The plate's DISTANCE is what decides how large the architecture is in the
  // frame, and that one number is what makes a figure read as "bigger than the
  // building". A `wide` shot is handed the scene's `full` plate; for the
  // water-town scene that plate is a distant vista whose moon gate is a tenth of
  // the frame, so the model copies the vista and then drops a portrait-scale
  // figure into the foreground — the whole village reads as a table-top model
  // (2026-10-04, 9x16 S13/S16, user: "人物和建筑的大小很不协调"). Aiming those
  // shots at the `medium` plate puts a life-size moon gate behind the figure
  // without touching the identity anchor or the written framing.
  const want = normaliseFramingOverride(shot.scene_framing, "scene", shot.id) || sceneFramingForShotSize(shot.shot_size);
  // Prefer the same distance; a wider plate is a better fallback than none.
  return e[want] || e.full || e.medium || e.close || null;
}

/**
 * The location's TEXT, for shots that must not carry the anchor image.
 *
 * A tight shot (close-up / medium close-up) cannot take the location anchor as
 * an i2i input. The anchor is a wide, empty frame of the whole place, and the
 * model reproduces its framing wholesale — measured on 春风许我再少年 S13, a
 * `medium close-up` came back as a wide mountain vista with a small standing
 * figure, three attempts running, because that scene's anchor is exactly such
 * a vista. Words about a place do not drag the crop; a picture of a place does.
 *
 * So a tight shot gets the place in prose instead: the same description the
 * anchor was drawn from, minus its composition.
 */
function sceneTextFor(shot, sb) {
  if (!shot || !sb || !Array.isArray(sb.scenes)) return "";
  const k = String(shot.scene_id || shot.location_id || "").trim();
  const byId = k
    ? sb.scenes.find((s) => s && String(s.id || s.key || "").trim() === k)
    : null;
  const s =
    byId ||
    sb.scenes.find((s) => s && Array.isArray(s.used_by) && s.used_by.includes(shot.id)) ||
    null;
  if (!s) return "";
  return [s.description, s.architecture, s.lighting]
    .filter(Boolean)
    .map((x) => String(x).trim().replace(/\s+/g, " "))
    .join(" ");
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

  // Waist-up references (ref_waistup_<angle>.png) — the mid-shot framing,
  // keyed under bodies.waistup[angle] exactly as buildCharacterAssets writes them.
  for (const a of render.SHEET_ANGLES) {
    const p = path.join(dir, `ref_waistup_${a.replace(/[^\w.-]/g, "_")}.png`);
    if (isUsable(p)) {
      out.bodies.waistup = out.bodies.waistup || {};
      out.bodies.waistup[a] = { outPath: p, url: readUrlSidecar(p), label: `半身参考 ${a}` };
    }
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
 * The character names genuinely present in a frame.
 *
 * Tolerates the planner's `[""]` slip: an array holding one blank string means
 * "nobody in frame", not "one unnamed person". Callers that tested
 * `characters_in_shot.length > 0` directly therefore treated empty frames as
 * character shots and ran them through the identity gate (see plan.js, and the
 * 爱你老己 S03/S07/S38 teacup-and-empty-room regressions).
 */
function characterNames(shot) {
  if (!shot || !Array.isArray(shot.characters_in_shot)) return [];
  return shot.characters_in_shot
    .map((n) => String(n == null ? "" : n).trim())
    .filter(Boolean);
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
/**
 * Shot size -> which identity references this frame should carry.
 *
 * A full-body reference is a COMPOSITION TEMPLATE as much as an identity one.
 * Hand the model a standing full-length figure and it hands you back a standing
 * full-length figure, whatever the SHOT block says. Measured on 春风许我再少年
 * S04 / S13 (2026-10-04): scripted `close-up` and `medium close-up`, both came
 * back as full-length wide shots, three attempts running — because every shot,
 * close-ups included, had the body reference attached, and the sentence meant
 * to suppress it (`NONE of the references may dictate this frame's shot size`)
 * is a negation, which loses to a picture. (HARDENING 坑位 75)
 *
 * So the reference set follows the shot size:
 *   tight  (ECU / CU / MCU / macro / insert / detail) -> the face anchor alone:
 *          it IS this frame's composition, and a body reference will fight it.
 *          Nothing is lost — the face anchor already shows the wardrobe.
 *   wide   (wide / extreme wide / medium wide / full) -> body first (that is
 *          the composition), face second.
 *   medium (everything else)                          -> both; the face leads
 *          because the face is the harder constraint.
 */
const TIGHT_SIZE_RE = /^(extreme\s*close|close|medium\s*close|macro|insert|detail)/i;
const WIDE_SIZE_RE = /^(extreme\s*wide|medium\s*wide|wide|full|establishing)/i;

function refPlanFor(shotSize) {
  const s = String(shotSize || "").trim().toLowerCase().replace(/[-_]+/g, " ");
  if (TIGHT_SIZE_RE.test(s)) return "tight";
  if (WIDE_SIZE_RE.test(s)) return "wide";
  return "medium";
}

/**
 * The reference FRAMING a shot size calls for (render.FRAMINGS).
 *
 *   close   — ECU / CU / macro / insert / detail   -> the face-sized anchor
 *   waistup — MCU / medium                          -> the waist-up view
 *   full    — medium wide / wide / extreme wide     -> the full-length view
 *
 * This is what lets a `close-up` come back as a close-up: the reference carries
 * the SAME framing as the shot, so it reinforces the composition instead of
 * overriding it. A reference framed wider than the shot always wins — the model
 * copies the crop of the picture it is shown (HARDENING 坑位 75 补记三).
 */
function framingForShotSize(shotSize) {
  const s = String(shotSize || "").trim().toLowerCase().replace(/[-_]+/g, " ");
  if (/^(extreme\s*close|close|macro|insert|detail)/.test(s)) return "close";
  if (/^medium\s*close/.test(s)) return "waistup";
  if (/^medium\s*wide/.test(s)) return "full";
  if (/^medium/.test(s)) return "waistup";
  return "full";
}

/**
 * Resolve the single identity reference that best matches (angle, framing).
 *
 * Both axes matter and neither can be dropped: a turned close-up needs a turned
 * reference (a frontal face anchor loses the pose), and a wide shot needs a
 * full-length one (a face anchor cannot place feet). Preference order:
 * an exact (framing, angle) hit, then the same framing at `front`, then the
 * full-length view at the requested angle.
 */
function pickFramedRef(a, view, framing) {
  const face = a.face || null;
  const waist = (a.bodies && a.bodies.waistup) || {};
  const bodies = a.bodies || {};

  if (framing === "close") {
    // A frontal close-up is best served by the face anchor itself; a turned one
    // has no face anchor at its angle, so the matching waist-up wins — it carries
    // the turn AND a head large enough to read the features.
    if (view === "front" && face) return { rec: face, label: "面部特写" };
    const w = waist[view] || waist.front || null;
    if (w) return { rec: w, label: `半身参考(${view})` };
    return { rec: face, label: "面部特写" };
  }

  if (framing === "waistup") {
    const w = waist[view] || waist.front || null;
    if (w) return { rec: w, label: `半身参考(${view})` };
    const b = bodies[view] || bodies.front || null;
    return { rec: b, label: `全身参考(${view})` };
  }

  const b = bodies[view] || bodies.front || null;
  return { rec: b, label: `全身参考(${view})` };
}

function pickShotRefs(shot, assets, o) {
  o = o || {};
  const out = { paths: [], urls: [], labels: [], roles: [], view: null, framing: null, plan: null };
  const push = (rec, role, label) => {
    if (!rec || !rec.url) return;
    out.paths.push(rec.outPath);
    out.urls.push(rec.url);
    out.labels.push(label || rec.label || role);
    out.roles.push(role);
  };

  const hasCharacter = o.hasCharacter !== false && characterNames(shot).length > 0;

  if (hasCharacter) {
    // `o.viewOverride`（来自 `images.js --ref-view S15=3q-left`）只改**参考图的角度**，
    // **不改分镜的朝向** —— 提示词里的朝向仍由 `shot.characters_view` 决定。
    // 用途：某些镜头用分镜标注的那个角度做参考会稳定出两个人
    // （2026-10-04 实测：front 半身参考的 3 镜败了 2 镜，side / 3q 参考的 5 镜全过），
    // 换一张侧向参考图就能破，而不必动分镜数据。
    const view = normaliseView(o.viewOverride || shot.characters_view || shot.characters_orientation);
    const known = (v) => !!v && (!!assets.bodies[v] || !!(assets.bodies.waistup && assets.bodies.waistup[v]));
    const useView = known(view) ? view : (known("front") ? "front" : null);
    out.view = useView || "front";

    // `o.framingOverride`（来自 `images.js --ref-framing S19=full`）只改**身份参考图的
    // 景别档**，**不动场景盘档位** —— 场景盘在 images.js 里由 `sceneRefFor(shot, …)`
    // 按 `shot.shot_size` 取，与这里无关。
    //
    // 为什么要解耦：要让人物在画面里**更小**，唯一有效的是把身份参考换成更远的档
    // （半身参考 → 全身参考），而 `framingForShotSize` 把景别和档位绑死了 ——
    // 换成 `establishing` 虽然拿到全身参考 + "环境主导、人物很小"的句子，但场景盘
    // 同时被跳到 full 档的远景 vista，构图整个被拽走（2026-10-04 实测：庭院/月洞门
    // 那一格变成了水乡石拱桥远景）。两个档位必须分开控制。
    const framing = o.framingOverride || normaliseFramingOverride(shot.ref_framing, "ref", shot.id) || framingForShotSize(shot.shot_size);
    out.framing = framing;
    out.plan = framing === "close" ? "tight" : framing === "waistup" ? "medium" : "wide";

    // ONE identity reference per shot, matched on BOTH axes.
    //
    // This is the convergent fix for the two-person bug (2026-10-04). The evidence
    // was a side-by-side comparison, not a guess: mv-月照他乡 and mv-月饼卖不动
    // passed every tight/medium character shot with exactly ONE reference
    // (["面部特写"]), because sceneRefFor() silently returned null there and the
    // location anchors never attached. Every round of 春风 that attached 2–3
    // references produced two women standing side by side — including rounds where
    // refHandlingBlock spelled out each image's job. So:
    //     the number of references is the knob, not the wording.
    // And because the reference now carries the SAME framing as the shot, the
    // old "close-up gets dragged into a full figure" failure disappears with it.
    const pick = pickFramedRef(assets, out.view, framing);
    push(pick.rec, "identity", pick.label);
    // Nothing may ever leave a character shot without an identity anchor.
    if (!out.urls.length) push(assets.face || assets.bodies.front, "identity", "面部特写");

    // Optional extra anchor: the master sheet itself (opt-in, --include-sheet).
    if (o.includeSheet) push(assets.sheet, "identity", "角色设定表");
  }

  // The location anchor travels with every shot that has a place — that is the
  // whole point of a location asset, and it is the channel that actually fixes
  // the environment. Prose does not: measured 2026-10-04, a 650-character room
  // description still came back as a garden, while attaching the anchor image
  // reproduced the study and the mountain ridge accurately (HARDENING 坑位 75 补记四).
  //
  // 近景闸门：`tight` 镜一度不挂场景锚点，理由是那张全景空镜会把自己的取景一起
  // 递过来，把 close-up 拽成七分身。现在近景的身份图本身已经是"同景别"的
  // （半身 / 特写），两侧对齐之后这个矛盾大幅减弱，因此默认放开；
  // 若某个项目仍观察到近景被拽远，用 `--tight-no-scene` 单独关掉近景锚点。
  //
  // `--no-scene-ref` 是同一道闸门的**全局版**（对任意景别生效）。它的用途不是构图，
  // 是**人数**：实测（2026-10-04 春风 24 镜）「front 半身参考 + 场景中景盘」这个组合
  // 稳定出两个人 —— S13/S15/S21 三镜里两镜双人，而 side / 3q 参考的 5 镜全部单人。
  // 一旦某镜反复出双人、重试也救不回来，把它降回「只挂身份图」这一张
  // 是最后一张牌：张数=人数旋钮（坑位 75 补记三）。代价是环境重新交给文字，
  // 所以只对个别顽固镜使用，不做默认。
  if (o.sceneRef && o.sceneRef.url && !o.noSceneRef && !(o.tightNoScene && out.plan === "tight")) {
    push(o.sceneRef, "scene", o.sceneRef.label || "场景锚点");
  }

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
  readScenePlateOverride,
  sceneFramingForShotSize,
  sceneTextFor,
  tightSceneRef,
  tightBodyRef,
  tightCropRatio,
  pickShotRefs,
  refPlanFor,
  framingForShotSize,
  normaliseView,
  characterNames,
};
