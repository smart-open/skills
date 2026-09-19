#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * test/profile.js — offline checks for the seven-dimension character profile.
 *
 * No network, no API keys. Everything here is deterministic string work, so it
 * runs in under a second and is safe to call from a pre-commit hook.
 *
 * What it protects:
 *   1. The identity block must carry hair STRUCTURE and wardrobe LAYERING,
 *      not a flattened "long hair, a dress".
 *   2. The reference sheet must actually ask for the expression band.
 *   3. A shot's named expression must be resolved through the character's own
 *      expression bank and injected as its own prompt block — and must be
 *      absent when the shot asks for none.
 *   4. A missing profile must degrade (soft warnings + defaults) rather than
 *      kill the run, unless strictProfile was requested.
 *
 *   node test/profile.js
 */

const path = require("path");
const render = require(path.join(__dirname, "..", "scripts", "lib", "render"));
const assets = require(path.join(__dirname, "..", "scripts", "lib", "assets"));
const { validateStoryboard } = require(path.join(__dirname, "..", "scripts", "plan"));

let pass = 0;
let fail = 0;

function ok(name, cond, detail) {
  if (cond) {
    pass++;
    process.stdout.write(`PASS  ${name}\n`);
  } else {
    fail++;
    process.stdout.write(`FAIL  ${name}${detail ? "  -> " + detail : ""}\n`);
  }
}

function has(hay, needle) {
  return String(hay || "").includes(needle);
}

// ---------------------------------------------------------------------------
// A fully specified character, all seven dimensions filled
// ---------------------------------------------------------------------------

const IDENTITY = {
  name: "露娜",
  age_range: "late teens",
  gender: "female",
  ethnicity: "East Asian",
  face_shape: "oval face with a soft tapered jaw and a slightly pointed chin",
  eye_shape: "almond eyes with slightly upturned outer corners and a visible double eyelid",
  iris_color: "dark brown",
  eye_spacing: "average",
  eyebrows: "straight eyebrows of medium thickness with a soft natural arch",
  nose: "a straight narrow bridge with a small rounded tip",
  lips: "medium-full lips with a defined cupid's bow, natural muted rose colour",
  jaw_chin: "a soft V-shaped jaw with a short rounded chin",
  skin_tone: "fair skin with a cool undertone and visible pores",
  hair_structure:
    "long hair reaching mid-back, centre-parted, curtain bangs grazing the brows, " +
    "loose S-wave perm, layered face-framing ends",
  hair_color: "ash brown at the roots fading into warm taupe",
  physique: "slim build, around 168 cm, long limbs, narrow shoulders",
  wardrobe_layers: {
    inner: "white cotton camisole slip dress",
    outer: "oversized cream knit cardigan with dropped shoulders",
    bottoms: "none visible, hem ends mid-thigh",
    footwear: "white leather low-top sneakers",
    accessories: "thin silver chain necklace, small hoop earrings",
    materials: "matte cotton, chunky knit, soft leather",
  },
  garment_palette: ["#F2EDE6", "#D8CFC0", "#B9AE9C", "#8A7F6E"],
  wardrobe:
    "a white cotton camisole slip dress worn under an oversized cream knit cardigan, " +
    "with a thin silver chain necklace and small hoop earrings, and white leather low-top sneakers",
  distinctive_marks: "none",
  expression_bank: [
    { name: "微笑", en: "a soft closed-mouth smile, eyes gently curved" },
    { name: "害羞", en: "shy, cheeks faintly flushed, gaze cast down and slightly away" },
    { name: "委屈", en: "a slight pout, glistening eyes, inner brows raised" },
    { name: "开心", en: "a bright open smile, eyes crinkled with joy" },
  ],
  signature_actions: [
    "tucking a strand of hair behind one ear",
    "hands clasped loosely in front of the chest",
    "slowly lifting the gaze from under lowered lashes",
  ],
  scene_affinity:
    "soft daylight interiors, pale linen curtains, white minimal rooms, quiet rain-streaked windows; " +
    "avoids harsh neon and crowded streets",
  identity_lock_en: "A late-teens East Asian woman with an oval face and almond eyes.",
  identity_lock: "一位东亚少女，鹅蛋脸，杏眼。",
};

const STYLE = {
  visual_style: {
    look: "soft daylight, low contrast",
    color_palette: ["#F2EDE6", "#D8CFC0", "#B9AE9C"],
  },
};

// ---------------------------------------------------------------------------
// 1. identityBlock carries hair structure and wardrobe layering
// ---------------------------------------------------------------------------

const block = render.identityBlock(IDENTITY);
ok("identity block exists", block.length > 100, `len=${block.length}`);
ok("identity block has hair STRUCTURE", has(block, "curtain bangs"), "missing 'curtain bangs'");
ok("identity block has hair colour gradient", has(block, "fading into warm taupe"));
ok("identity block has wardrobe inner layer", has(block, "inner layer: white cotton camisole"));
ok("identity block has wardrobe outer layer", has(block, "outer layer: oversized cream knit"));
ok("identity block has accessories", has(block, "accessories: thin silver chain necklace"));
ok("identity block has footwear", has(block, "footwear: white leather low-top sneakers"));
ok("identity block labels the wardrobe as layered", has(block, "Wardrobe (layer by layer):"));

// Legacy fallback: a planner that only produced the coarse hair_style still works.
const legacyBlock = render.identityBlock({ hair_style: "long straight black hair", wardrobe: "a red coat" });
ok("legacy hair_style still renders", has(legacyBlock, "long straight black hair"));
ok("legacy wardrobe string still renders", has(legacyBlock, "a red coat"));

// ---------------------------------------------------------------------------
// 2. The reference sheet asks for the expression band
// ---------------------------------------------------------------------------

const sheet = render.buildCharacterSheetPrompt(IDENTITY, { layout: "sheet-full" });
ok("sheet asks for the turnaround", has(sheet, "THREE full-body standing views"));
ok("sheet asks for an expression band", has(sheet, "LOWER BAND"));
ok("sheet names 4 expression heads", has(sheet, "FOUR head-and-shoulders portraits"));
ok("sheet uses the character's own expressions", has(sheet, "gaze cast down and slightly away"));
ok("sheet states seven depictions of one person", has(sheet, "exactly seven depictions of one person"));
ok("sheet demands a single person", has(sheet, "never a second person"));

const plainSheet = render.buildCharacterSheetPrompt(IDENTITY, { layout: "sheet" });
ok("plain sheet omits the expression band", !has(plainSheet, "LOWER BAND"));
ok("plain sheet keeps the turnaround", has(plainSheet, "THREE full-body standing views"));

const turntable = render.buildCharacterSheetPrompt(IDENTITY, { layout: "turntable" });
ok("turntable layout asks for 8 views", has(turntable, "eight evenly spaced full-body views"));
ok("turntable layout has no expression band", !has(turntable, "LOWER BAND"));

// Default layout is the full one.
ok("default sheet layout is sheet-full", has(render.buildCharacterSheetPrompt(IDENTITY), "LOWER BAND"));

// Without a bank the four defaults are used, so the band is never empty.
const noBank = render.buildCharacterSheetPrompt({ face_shape: "oval" }, { layout: "sheet-full" });
ok("missing bank falls back to default expressions", has(noBank, "a soft closed-mouth smile"));
ok("bank helper pads to 4", render.expressionBank({}).length === 4);
ok("bank helper trims to 4", render.expressionBank({ expression_bank: Array(9).fill({ name: "x", en: "y" }) }).length === 4);
ok("bank accepts plain strings", render.expressionBank({ expression_bank: ["a", "b", "c", "d"] })[0].name === "a");

// ---------------------------------------------------------------------------
// 3. A shot's expression is resolved and injected on its own
// ---------------------------------------------------------------------------

const shot = {
  id: "S01",
  shot_size: "close-up",
  characters_in_shot: ["露娜"],
  characters_view: "front",
  expression: "害羞",
  keyframe_prompt: "the protagonist stands at a rain-streaked window, soft daylight raking across her face",
};

const kf = render.buildKeyframePrompt(shot, STYLE, { identity: IDENTITY, hasCharacter: true });
ok("keyframe injects an EXPRESSION block", has(kf, "EXPRESSION — the face in this frame"));
ok("keyframe resolves the bank's English text", has(kf, "cheeks faintly flushed"));
ok("keyframe protects the likeness from the emotion", has(kf, "only moves muscle"));
ok("keyframe still carries the identity block", has(kf, "curtain bangs"));
ok("keyframe still carries the identity tail", has(kf, "IDENTITY RE-CHECK"));

const neutralShot = Object.assign({}, shot, { expression: "none" });
const kfNeutral = render.buildKeyframePrompt(neutralShot, STYLE, { identity: IDENTITY, hasCharacter: true });
ok("expression 'none' injects nothing", !has(kfNeutral, "EXPRESSION — the face in this frame"));

const bareShot = Object.assign({}, shot, { expression: "" });
ok("empty expression injects nothing", !has(render.buildKeyframePrompt(bareShot, STYLE, { identity: IDENTITY, hasCharacter: true }), "EXPRESSION —"));

const noCharShot = {
  id: "S02",
  shot_size: "extreme wide",
  characters_in_shot: [],
  characters_view: "none",
  keyframe_prompt: "an empty rain-slicked street at dawn, no people",
};
const kfEmpty = render.buildKeyframePrompt(noCharShot, STYLE, { identity: IDENTITY, hasCharacter: false });
ok("empty shot has no identity block", !has(kfEmpty, "IDENTITY — reproduce this person"));
ok("empty shot has no expression block", !has(kfEmpty, "EXPRESSION — the face in this frame"));

// ---------------------------------------------------------------------------
// 4. Validation: soft by default, hard when asked
// ---------------------------------------------------------------------------

const ctx = { totalDuration: 24 };
const goodShots = ["S01", "S02", "S03", "S04"].map((id) => ({
  id,
  duration: 6,
  shot_size: "medium",
  characters_in_shot: ["露娜"],
  characters_view: "front",
  expression: "微笑",
  visual: "主角站在窗前",
  keyframe_prompt: "the protagonist beside a window",
  video_prompt: "The protagonist slowly turns her head toward the camera while the camera dollies in and rain streaks the glass, quiet mood.",
  subject_action: "turning her head",
  camera_movement: "slow dolly-in",
}));

const good = {
  title: "Test",
  visual_style: STYLE.visual_style,
  character: { name: "露娜", params: IDENTITY, identity_lock: "x", identity_lock_en: "y" },
  style_board_prompt: "an empty room",
  shots: goodShots,
};

const vGood = validateStoryboard(good, ctx);
const profileComplaints = vGood.hard.concat(vGood.soft).filter((m) => has(m, "七个维度"));
ok("a complete profile produces no dimension complaint", profileComplaints.length === 0, profileComplaints.join(" | "));
ok("a complete profile passes validation", vGood.hard.length === 0, vGood.hard.join(" | "));

// Strip the creative half of the profile.
const thin = JSON.parse(JSON.stringify(good));
delete thin.character.params.expression_bank;
delete thin.character.params.signature_actions;
delete thin.character.params.scene_affinity;
delete thin.character.params.wardrobe_layers;

const vThinDefault = validateStoryboard(thin, ctx);
ok(
  "a thin profile does NOT hard-fail by default",
  vThinDefault.hard.filter((m) => has(m, "七个维度")).length === 0,
  vThinDefault.hard.join(" | ")
);
ok(
  "a thin profile is reported as a warning",
  vThinDefault.soft.some((m) => has(m, "七个维度")),
  vThinDefault.soft.join(" | ")
);
ok(
  "the warning names all four missing pieces",
  ["wardrobe_layers", "expression_bank", "signature_actions", "scene_affinity"].every((k) =>
    vThinDefault.soft.some((m) => has(m, k))
  ),
  vThinDefault.soft.join(" | ")
);

const vThinStrict = validateStoryboard(thin, { totalDuration: 24, strictProfile: true });
ok(
  "strictProfile turns the thin profile into a hard failure",
  vThinStrict.hard.some((m) => has(m, "七个维度")),
  vThinStrict.hard.join(" | ")
);

// Legacy hair_style must be tolerated (and promoted) rather than rejected.
const legacy = JSON.parse(JSON.stringify(good));
legacy.character.params.hair_style = legacy.character.params.hair_structure;
delete legacy.character.params.hair_structure;
const vLegacy = validateStoryboard(legacy, ctx);
ok("legacy hair_style is tolerated", vLegacy.hard.filter((m) => has(m, "hair_structure")).length === 0, vLegacy.hard.join(" | "));
ok("legacy hair_style is promoted in place", !!legacy.character.params.hair_structure);

// A close-up with no expression should be flagged; a wide shot should not.
const noExpr = JSON.parse(JSON.stringify(good));
noExpr.shots[0].shot_size = "close-up";
noExpr.shots[0].expression = "";
const vNoExpr = validateStoryboard(noExpr, ctx);
ok("a close-up without an expression is flagged", vNoExpr.soft.some((m) => has(m, "没有填写 expression")), vNoExpr.soft.join(" | "));

const wideNoExpr = JSON.parse(JSON.stringify(good));
wideNoExpr.shots.forEach((s) => { s.shot_size = "extreme wide"; s.expression = ""; });
const vWideNoExpr = validateStoryboard(wideNoExpr, ctx);
ok("a wide shot without an expression is not flagged", !vWideNoExpr.soft.some((m) => has(m, "没有填写 expression")), vWideNoExpr.soft.join(" | "));

// ---------------------------------------------------------------------------
// 5. Field ownership: vision reads visuals, the planner owns the creative half
// ---------------------------------------------------------------------------

ok("assets exposes the visual field list", Array.isArray(assets.VISUAL_FIELDS) && assets.VISUAL_FIELDS.includes("hair_structure"));
ok("assets exposes the creative field list", Array.isArray(assets.CREATIVE_FIELDS));
ok(
  "creative fields are not in the visual list",
  ["expression_bank", "signature_actions", "scene_affinity"].every((k) => !assets.VISUAL_FIELDS.includes(k))
);
ok("visual fields include wardrobe_layers", assets.VISUAL_FIELDS.includes("wardrobe_layers"));

// ---------------------------------------------------------------------------

process.stdout.write("\n" + "=".repeat(60) + "\n");
process.stdout.write(`profile.js: ${pass} passed, ${fail} failed\n`);
process.stdout.write("=".repeat(60) + "\n");
process.exit(fail ? 1 : 0);
