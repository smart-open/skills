#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * test/asset-pipeline.js — offline checks for the asset-first pipeline.
 *
 * No network, no API keys. Pure string and validation work, so it runs in well
 * under a second and is safe to call from a pre-commit hook.
 *
 * What it protects, and why each one earns a test:
 *
 *   1. LOCATION ANCHORS. A place that appears in several shots has to be an
 *      asset (one empty reference frame) rather than a phrase; prose alone lets
 *      an alley's width and its lamp positions drift between shots. The scene
 *      prompt must therefore demand an EMPTY frame, and a shot at that location
 *      must actually receive the anchor.
 *
 *   2. THE IMMUTABLE / SHOT-LOCAL SPLIT. The face is architecture, the wardrobe
 *      and the wet hair are weather. Mixing them into one paragraph is how a
 *      face starts sliding, so the immutable block must never contain wardrobe
 *      and the local block must never be emitted when nothing is declared.
 *
 *   3. PER-IMAGE ROLES. When a frame is built from a body view, a face and a
 *      room, "the attached images are the identity source" is actively wrong:
 *      the model needs to be told which image to mine for a face and which only
 *      for the room.
 *
 *   4. THE ACTION SAFETY ZONE. Two people physically interacting is where
 *      image-to-video models fuse limbs together; the validator must say so.
 *
 *   node test/asset-pipeline.js
 */

const path = require("path");
const render = require(path.join(__dirname, "..", "scripts", "lib", "render"));
const assets = require(path.join(__dirname, "..", "scripts", "lib", "assets"));
const { validateStoryboard, renderMarkdown } = require(path.join(__dirname, "..", "scripts", "plan"));

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
// Fixtures
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
    "soft daylight interiors, pale linen curtains, white minimal rooms, quiet rain-streaked windows",
  identity_lock_en: "A late-teens East Asian woman with an oval face and almond eyes.",
  identity_lock: "一位东亚少女，鹅蛋脸，杏眼。",
};

const STYLE = {
  visual_style: {
    look: "soft daylight, low contrast",
    lighting: "diffuse window light",
    lens: "35mm and 85mm",
    film_stock: "Kodak Vision3 500T",
    color_palette: ["#F2EDE6", "#D8CFC0", "#B9AE9C"],
  },
};

const SCENE = {
  id: "SC1",
  name: "雨夜霓虹街头",
  description: "a narrow rain-soaked alley lined with shuttered storefronts and a low iron railing",
  lighting: "sodium street lamps overhead throwing warm pools onto the wet ground",
  architecture: "wet asphalt, glazed brick walls, corrugated shutters",
};

function makeShot(id, over) {
  return Object.assign(
    {
      id,
      section: "Verse 1",
      lyrics_line: "第一句歌词",
      duration: 6,
      shot_size: "medium",
      camera_angle: "eye level",
      visual: "露娜站在窗前，雨声在外",
      subject_action: "缓缓抬头看向窗外",
      camera_movement: "缓慢向前推进",
      lighting: "窗外的天光作为主光源",
      characters_in_shot: ["露娜"],
      characters_view: "front",
      expression: "微笑",
      scene_id: "SC1",
      transition_in: "cut",
      motion_intensity: 2,
      keyframe_prompt: "A girl standing by a rainy window, medium shot, soft daylight.",
      video_prompt:
        "镜头缓慢向前推进，女孩缓缓抬起头看向窗外，发丝被微风轻轻吹动，" +
        "窗外雨丝斜斜落下，地面的光线缓慢变化，整体氛围安静而克制。",
    },
    over || {}
  );
}

function baseSb() {
  return {
    title: "测试 MV",
    logline: "一次告别",
    mood_arc: "平静到释然",
    visual_style: Object.assign({}, STYLE.visual_style),
    character: {
      name: "露娜",
      params: Object.assign({}, IDENTITY),
      identity_lock: IDENTITY.identity_lock,
      identity_lock_en: IDENTITY.identity_lock_en,
    },
    scenes: [Object.assign({}, SCENE)],
    style_board_prompt: "An empty pale room with soft window light, no people.",
    sections: [{ name: "Verse 1", duration: 24, mood: "安静" }],
    shots: [makeShot("S01"), makeShot("S02"), makeShot("S03"), makeShot("S04")],
  };
}

const CTX = { totalDuration: 24 };

// ---------------------------------------------------------------------------
// 1. Location anchors
// ---------------------------------------------------------------------------

const scenePrompt = render.buildSceneRefPrompt(SCENE, { visual_style: STYLE.visual_style });
ok("scene prompt asks for an empty frame", has(scenePrompt, "completely unoccupied"), scenePrompt.slice(0, 120));
ok("scene prompt forbids every kind of person", has(scenePrompt, "No people at all"));
ok("scene prompt forbids faces and silhouettes", has(scenePrompt, "no faces, no silhouettes"));
ok("scene prompt carries the location description", has(scenePrompt, "narrow rain-soaked alley"));
ok("scene prompt carries the light source", has(scenePrompt, "sodium street lamps"));
ok("scene prompt names the place for a human reader", has(scenePrompt, "雨夜霓虹街头"));
ok("scene prompt asks for depth planes", has(scenePrompt, "foreground, a midground"));

// A scene with nothing but a name must still produce a usable prompt.
const bare = render.buildSceneRefPrompt({ id: "SC9", name: "空房间" }, {});
ok("a scene with only a name still renders", has(bare, "空房间") && bare.length > 100);

// ---------------------------------------------------------------------------
// 2. The immutable / shot-local split
// ---------------------------------------------------------------------------

const imm = render.identityImmutableBlock(IDENTITY);
ok("immutable block keeps the hair structure", has(imm, "curtain bangs"));
ok("immutable block keeps the iris colour", has(imm, "dark brown"));
ok("immutable block NEVER carries wardrobe", !has(imm, "Wardrobe"), imm);
ok("immutable block never leaks a garment word", !has(imm, "camisole"));

const full = render.identityBlock(IDENTITY);
ok("the full identity block still carries wardrobe", has(full, "Wardrobe (layer by layer):"));

ok(
  "no local state is emitted when nothing is declared",
  render.localStateBlock({}, null) === "",
  render.localStateBlock({}, null)
);

const local = render.localStateBlock(
  { transient_state: "hair soaked by rain, collar open", speed: "slow-motion" },
  IDENTITY
);
ok("local state is labelled as shot-local", has(local, "SHOT-LOCAL STATE"));
ok("local state carries the transient physical state", has(local, "hair soaked by rain"));
ok("local state carries the wardrobe for this shot", has(local, "camisole"));
ok("local state renders slow motion", has(local, "slow motion"));
ok("local state reassures that the face does not change", has(local, "never alter the face"));

const fast = render.localStateBlock({ speed: "fast-motion" }, null);
ok("local state renders fast motion", has(fast, "time is compressed"));

// ---------------------------------------------------------------------------
// 3. Per-image roles
// ---------------------------------------------------------------------------

ok("ordinalList: single", render.ordinalList([3]) === "image 3", render.ordinalList([3]));
ok("ordinalList: pair", render.ordinalList([1, 2]) === "images 1 and 2", render.ordinalList([1, 2]));
ok("ordinalList: triple", render.ordinalList([1, 2, 3]) === "images 1, 2 and 3", render.ordinalList([1, 2, 3]));

const refRoles = [
  { label: "全身参考(front)", role: "identity" },
  { label: "面部特写", role: "identity" },
  { label: "场景锚点 SC1", role: "scene" },
];
const kf = render.buildKeyframePrompt(makeShot("S01"), baseSb(), {
  identity: IDENTITY,
  hasCharacter: true,
  refRoles,
});
ok("keyframe states that each image has one job", has(kf, "each attached image has one job"));
ok("keyframe marks the identity images by position", has(kf, "images 1 and 2 — the AUTHORITATIVE source"));
ok("keyframe marks the location anchor by position", has(kf, "image 3 — the LOCATION anchor"));
ok("keyframe tells the model the anchor has no face in it", has(kf, "do not look for a face in it"));
ok("keyframe forbids copying a reference's framing", has(kf, "may dictate this frame's shot size"));
ok("keyframe injects the immutable block", has(kf, "IDENTITY — reproduce this person exactly"));
ok("keyframe injects the shot-local block when present", has(kf, "SHOT-LOCAL STATE"));

// An empty shot must still anchor to its location.
const noCharShot = makeShot("S02", { characters_in_shot: [], characters_view: "none" });
const kfScene = render.buildKeyframePrompt(noCharShot, baseSb(), {
  hasCharacter: false,
  hasScene: true,
  refRoles: [{ label: "场景锚点 SC1", role: "scene" }],
});
ok("an empty shot still gets the location reference block", has(kfScene, "the LOCATION anchor"));
ok("an empty shot does not inject an identity block", !has(kfScene, "IDENTITY — reproduce this person"));

// ---------------------------------------------------------------------------
// 4. pickShotRefs — order and roles must stay in lockstep
// ---------------------------------------------------------------------------

const charAssets = {
  identity: IDENTITY,
  sheet: { outPath: "s.png", url: "https://x/s.png", label: "角色设定表" },
  face: { outPath: "f.png", url: "https://x/f.png", label: "面部特写" },
  bodies: { front: { outPath: "b.png", url: "https://x/b.png", label: "全身参考(front)" } },
};
const sceneRef = { outPath: "sc.png", url: "https://x/sc.png", label: "场景锚点 SC1" };

const r1 = assets.pickShotRefs(makeShot("S01"), charAssets, { sceneRef });
ok("refs and roles have the same length", r1.paths.length === r1.roles.length && r1.roles.length === 3);
ok("identity references come first", r1.roles[0] === "identity" && r1.roles[1] === "identity");
ok("the location anchor is appended last", r1.roles[r1.roles.length - 1] === "scene");
ok("the location anchor URL is actually attached", r1.urls.includes("https://x/sc.png"));
ok("the angle-matched body view is the first ref", r1.paths[0] === "b.png");

const r2 = assets.pickShotRefs(
  makeShot("S02", { characters_in_shot: [], characters_view: "none" }),
  charAssets,
  { sceneRef }
);
ok("an empty shot receives only the location anchor", r2.roles.length === 1 && r2.roles[0] === "scene");

const r3 = assets.pickShotRefs(makeShot("S03"), charAssets, {});
ok("with no location the shot still gets its identity refs",
  r3.roles.length === 2 && r3.roles.every((x) => x === "identity"));

const r4 = assets.pickShotRefs(makeShot("S04"), charAssets, { includeSheet: true, sceneRef });
ok("including the sheet adds a third identity ref",
  r4.roles.filter((x) => x === "identity").length === 3);

// ---------------------------------------------------------------------------
// 5. Scene bookkeeping
// ---------------------------------------------------------------------------

ok("sceneKey prefers the id", assets.sceneKey({ id: "SC1", name: "x" }) === "SC1");
ok("sceneKey falls back to the name", assets.sceneKey({ name: "SC1" }) === "SC1");
ok("sceneKey tolerates null", assets.sceneKey(null) === "");

const used = assets.usedSceneIds({ shots: [{ scene_id: "SC1" }, { scene_id: "SC2" }, { scene_id: "" }, {}] });
ok("usedSceneIds collects only referenced scenes", used.size === 2 && used.has("SC1") && used.has("SC2"));

ok("sceneRefFor resolves by scene_id", assets.sceneRefFor({ scene_id: "SC1" }, { SC1: sceneRef }) === sceneRef);
ok("sceneRefFor falls back to location_id", assets.sceneRefFor({ location_id: "SC1" }, { SC1: sceneRef }) === sceneRef);
ok("sceneRefFor returns null for an unknown scene", assets.sceneRefFor({ scene_id: "SC9" }, { SC1: sceneRef }) === null);
ok("sceneRefFor returns null when the shot names no scene", assets.sceneRefFor({}, { SC1: sceneRef }) === null);
ok("sceneRefPath is filesystem-safe", !/[^\w.-]/.test(assets.sceneRefPath("d", "SC 1/怪").split(/[\\/]/).pop().replace(/^ref_scene_/, "").replace(/\.png$/, "")));

// ---------------------------------------------------------------------------
// 6. Validation: scenes, action safety zone, speed
// ---------------------------------------------------------------------------

const v0 = validateStoryboard(baseSb(), CTX);
ok(
  "a storyboard with a valid scene reference has no scene errors",
  !v0.hard.some((m) => has(m, "scene_id")) && !v0.soft.some((m) => has(m, "地点资产库")),
  v0.hard.join(" | ") + " /// " + v0.soft.join(" | ")
);

const sbOrphan = baseSb();
sbOrphan.shots[1].scene_id = "SC9";
const vOrphan = validateStoryboard(sbOrphan, CTX);
ok("an unknown scene_id is a HARD error", vOrphan.hard.some((m) => has(m, "找不到定义")), vOrphan.hard.join(" | "));

const sbNoRef = baseSb();
sbNoRef.shots.forEach((s) => { delete s.scene_id; });
const vNoRef = validateStoryboard(sbNoRef, CTX);
ok("shots with no scene_id are reported", vNoRef.soft.some((m) => has(m, "没有填写 scene_id")), vNoRef.soft.join(" | "));

const sbNoScenes = baseSb();
delete sbNoScenes.scenes;
const vNoScenes = validateStoryboard(sbNoScenes, CTX);
ok("a storyboard with no scenes[] is flagged", vNoScenes.soft.some((m) => has(m, "地点资产库")), vNoScenes.soft.join(" | "));

const sbUnused = baseSb();
sbUnused.scenes.push({
  id: "SC2",
  name: "街道",
  description: "a wide wet street at night lit by sodium lamps",
  lighting: "sodium street lamps",
  architecture: "wet asphalt and railings",
});
const vUnused = validateStoryboard(sbUnused, CTX);
ok("an unreferenced scene is flagged as wasted", vUnused.soft.some((m) => has(m, "没有任何镜头引用")), vUnused.soft.join(" | "));

const sbThin = baseSb();
sbThin.scenes[0].lighting = "x";
const vThin = validateStoryboard(sbThin, CTX);
ok("a too-thin scene definition is flagged", vThin.soft.some((m) => has(m, "缺少或过于简略")), vThin.soft.join(" | "));

const sbDupScene = baseSb();
sbDupScene.scenes.push(Object.assign({}, SCENE));
const vDupScene = validateStoryboard(sbDupScene, CTX);
ok("a duplicate scene id is flagged", vDupScene.soft.some((m) => has(m, "id 重复")), vDupScene.soft.join(" | "));

// ---- action safety zone ---------------------------------------------------
const sbHug = baseSb();
sbHug.shots[0].characters_in_shot = ["露娜", "阿远"];
sbHug.shots[0].subject_action = "她冲上去拥抱他";
const vHug = validateStoryboard(sbHug, CTX);
ok("an embrace between two people is flagged", vHug.soft.some((m) => has(m, "肢体交互")), vHug.soft.join(" | "));

const sbFight = baseSb();
sbFight.shots[0].characters_in_shot = ["露娜", "阿远"];
sbFight.shots[0].subject_action = "两人在雨里扭打起来";
const vFight = validateStoryboard(sbFight, CTX);
ok("a fight between two people is flagged", vFight.soft.some((m) => has(m, "肢体交互")));

// A single person hugging her own shoulders is one body — not an interaction.
const sbAlone = baseSb();
sbAlone.shots[0].characters_in_shot = ["露娜"];
sbAlone.shots[0].subject_action = "她抱紧自己的肩膀";
const vAlone = validateStoryboard(sbAlone, CTX);
ok("a single person hugging herself is NOT flagged", !vAlone.soft.some((m) => has(m, "肢体交互")), vAlone.soft.join(" | "));

// ---- speed ----------------------------------------------------------------
const sbSpeed = baseSb();
sbSpeed.shots[0].speed = "warp-speed";
const vSpeed = validateStoryboard(sbSpeed, CTX);
ok("an invalid speed value is reported", vSpeed.soft.some((m) => has(m, "speed 取值")), vSpeed.soft.join(" | "));

const sbSpeedOk = baseSb();
sbSpeedOk.shots[0].speed = "slow-motion";
const vSpeedOk = validateStoryboard(sbSpeedOk, CTX);
ok("a valid speed value passes", !vSpeedOk.soft.some((m) => has(m, "speed 取值")));

// ---------------------------------------------------------------------------
// 7. The human-readable storyboard must show the location library
// ---------------------------------------------------------------------------

const md = renderMarkdown(baseSb(), { aspectRatio: "16:9" });
ok("storyboard.md has a location library section", has(md, "## 地点资产库（场景锚点）"));
ok("the location table names the scene", has(md, "雨夜霓虹街头"));
ok("the location table lists which shots use it", has(md, "| S01、S02、S03、S04 |") || has(md, "S01、S02"));

const mdUnused = renderMarkdown(
  (() => {
    const s = baseSb();
    s.scenes.push({
      id: "SC2",
      name: "空街",
      description: "a wide empty street at night lit by sodium lamps",
      lighting: "sodium lamps",
    });
    return s;
  })(),
  {}
);
ok("an unused scene is printed as unreferenced", has(mdUnused, "**无镜头引用**"));

// A storyboard without scenes must still render — older projects keep working.
const mdOld = renderMarkdown(
  (() => {
    const s = baseSb();
    delete s.scenes;
    return s;
  })(),
  {}
);
ok("a storyboard with no scenes[] still renders", has(mdOld, "# 测试 MV") && !has(mdOld, "地点资产库"));

// ---------------------------------------------------------------------------

process.stdout.write("\n");
process.stdout.write(`asset-pipeline: ${pass}/${pass + fail} passed\n`);
process.exit(fail ? 1 : 0);
