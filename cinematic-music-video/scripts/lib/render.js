#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * lib/render.js — Image-prompt construction.
 *
 * The single most important job here is holding a face steady across dozens of
 * independent generations. Four techniques do the work, and all four are
 * deliberately separated from the orchestration code so they can be reasoned
 * about and tuned in one place:
 *
 *   1. STRUCTURED IDENTITY, NOT PROSE
 *      A face is described as discrete, model-executable parameters
 *      (face_shape / eye_shape / iris_color / eyebrows / lips / jaw / hair /
 *      skin / build / wardrobe) rather than as one long flowing sentence.
 *      Prose gets paraphrased by the model between calls; a parameter list
 *      gets copied.
 *
 *   2. PARAMETERS READ OFF THE REAL IMAGE
 *      The parameter list is filled in from the accepted character sheet by a
 *      vision pass (see lib/vision.js), so the text and the reference picture
 *      agree with each other. When they disagree, they fight, and the face
 *      drifts.
 *
 *   3. IDENTITY AT BOTH ENDS
 *      The identity block opens the prompt and a compact re-assertion closes
 *      it. Models weight the head and tail of a prompt most heavily, so
 *      burying identity in the middle of a long scene description is the
 *      single easiest way to lose it.
 *
 *   4. EXPLICIT SECTION BOUNDARIES
 *      Scene, framing, light and style are fenced into their own labelled
 *      blocks so a vivid environment description cannot bleed into the
 *      character description (or vice versa) — which is how a reference
 *      backdrop ends up reproduced in an unrelated shot.
 */

// ---------------------------------------------------------------------------
// Shared suffixes
// ---------------------------------------------------------------------------

/** Cinematic finish, appended to every rendered frame. */
const QUALITY_SUFFIX =
  "cinematic cinematography, filmic composition, ultra detailed, high dynamic range, " +
  "sharp focus, subtle film grain, professional colour grading, 8K";

/**
 * Negative instructions.
 *
 * Kept deliberately narrow. An earlier revision listed layout artefacts
 * ("no collage", "no split screen", "no contact-sheet layout") and measurement
 * showed that naming them *increased* how often they appeared — the model
 * treated the words as content. Only defects that are safe to name live here.
 *
 * The text clause is unusually aggressive on purpose: the image model has a
 * strong prior to render shop signs and neon lettering in urban scenes, and it
 * will happily paint them into a frame that never asked for text.
 */
const EXCLUSION_SUFFIX =
  "ABSENT from the image: any lettering of any kind — no text, no words, no subtitles, " +
  "no captions, no watermark, no logo, no signage, no neon letters, no storefront writing, " +
  "no billboard copy, no packaging copy, no UI elements, no signatures; " +
  "also absent: a second person, extra limbs, deformed hands, distorted face, warped proportions, " +
  "low resolution, blur, cartoon rendering";

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * Flatten the layered wardrobe object into one quotable clause.
 *
 * A garment described as a single blob ("a dress and a jacket") loses the
 * information the image model actually needs — which layer sits on top of
 * which, what the accessories are, what the fabric is. Splitting it into
 * inner / outer / bottoms / footwear / accessories / materials means every one
 * of those survives verbatim into the prompt instead of being paraphrased.
 *
 * Falls back to the plain `wardrobe` string so older storyboards still work.
 */
function wardrobeText(id, override) {
  if (override) return override;
  const w = id && id.wardrobe_layers;
  if (w && typeof w === "object") {
    const bits = [
      w.inner && `inner layer: ${w.inner}`,
      w.outer && `outer layer: ${w.outer}`,
      w.bottoms && `bottoms: ${w.bottoms}`,
      w.footwear && `footwear: ${w.footwear}`,
      w.accessories && `accessories: ${w.accessories}`,
      w.materials && `materials: ${w.materials}`,
    ].filter(Boolean);
    if (bits.length) return bits.join("; ");
  }
  return (id && id.wardrobe) || "";
}

/**
 * Compact, directly quotable identity block.
 *
 * @param {object} id   output of vision.extractIdentity() (or a planner fallback)
 * @param {object} [o]  { wardrobeOverride }
 */
function identityBlock(id, o) {
  o = o || {};
  if (!id) return "";
  const p = [];
  const head = [id.age_range, id.gender, id.ethnicity].filter(Boolean).join(" ");
  if (head) p.push(`${id.name ? id.name + " — " : ""}${head}.`);
  const face = [
    id.face_shape && `face ${id.face_shape}`,
    id.eye_shape && `eyes ${id.eye_shape}`,
    id.iris_color && `${id.iris_color} irises`,
    id.eye_spacing && `${id.eye_spacing} eye spacing`,
    id.eyebrows && `eyebrows ${id.eyebrows}`,
    id.nose && `nose ${id.nose}`,
    id.lips && `lips ${id.lips}`,
    id.jaw_chin && `jaw and chin ${id.jaw_chin}`,
  ].filter(Boolean);
  if (face.length) p.push("Face: " + face.join("; ") + ".");
  if (id.skin_tone) p.push(`Skin: ${id.skin_tone}.`);
  // hair_structure (length / parting / bangs / texture / layers) carries far
  // more of the likeness than a bare "long hair" ever did, so it is preferred
  // over the legacy hair_style when both are present.
  const hairStyle = id.hair_structure || id.hair_style;
  const hair = [hairStyle, id.hair_color].filter(Boolean).join(", ");
  if (hair) p.push(`Hair: ${hair}.`);
  if (id.physique) p.push(`Build: ${id.physique}.`);
  if (id.distinctive_marks && !/^(none|无|n\/a)$/i.test(String(id.distinctive_marks).trim())) {
    p.push(`Distinguishing marks: ${id.distinctive_marks}.`);
  }
  const wardrobe = o.noWardrobe ? "" : wardrobeText(id, o.wardrobeOverride);
  if (wardrobe) p.push(`Wardrobe (layer by layer): ${wardrobe}.`);
  return p.join(" ");
}

/**
 * Fields that must survive the ENTIRE film byte-for-byte.
 *
 * Splitting the character card into "immutable identity" and "shot-local
 * state" is the discipline that stops a face from sliding. The bone structure,
 * eye geometry, hair architecture and skin do not change between shots; the
 * wardrobe, the wet hair, the wind, the emotion and the bruises do, and they
 * are declared separately, per shot. Mixed into one paragraph, the model has no
 * way to tell which words are architecture and which are weather — and it
 * reinterprets both.
 */
const IMMUTABLE_FIELDS = [
  "age_range", "gender", "ethnicity", "face_shape", "eye_shape", "iris_color", "eye_spacing",
  "eyebrows", "nose", "lips", "jaw_chin", "skin_tone", "hair_structure", "hair_color",
  "physique", "distinctive_marks",
];

/**
 * The immutable half of the character card: everything that defines WHO this
 * person is, with no wardrobe and no emotion attached.
 */
function identityImmutableBlock(id) {
  return identityBlock(id, { noWardrobe: true });
}

/**
 * The mutable half — what this shot layers on top of that same person.
 *
 * Everything here is explicitly labelled as transient so a wet hairstyle, a
 * jacket swapped for a dressing gown or a scuffed cheek cannot be mistaken for
 * a new face. Returns "" when the shot declares nothing local, so prompts that
 * need no state stay as short as they were.
 *
 * @param {object} shot  storyboard shot
 * @param {object} id    identity parameters
 * @param {object} [o]   { wardrobeOverride }
 */
function localStateBlock(shot, id, o) {
  o = o || {};
  const bits = [];
  const w = wardrobeText(id, o.wardrobeOverride);
  if (w) bits.push(`wardrobe in this shot — ${w}`);
  const transient = String((shot && (shot.transient_state || shot.state_note)) || "").trim();
  if (transient && !/^(none|无|n\/a|-)$/i.test(transient)) {
    bits.push(`transient physical state — ${transient}`);
  }
  const speed = String((shot && shot.speed) || "").trim().toLowerCase();
  if (/slow/.test(speed)) bits.push("time is stretched — slow motion, motion blur on fast-moving elements");
  else if (/fast/.test(speed)) bits.push("time is compressed — accelerated, crisp frames, snappy movement");
  if (!bits.length) return "";
  return (
    "SHOT-LOCAL STATE — these apply to THIS SHOT ONLY and are layered on top of the same person. " +
    "They may differ between shots and they never alter the face, the bone structure, the eye shape, " +
    "the hairstyle's cut or the skin:\n" +
    bits.map((b) => "  • " + b).join("\n")
  );
}

/**
 * The character's emotional range, as one quotable clause.
 *
 * Injected only for shots that ask for a non-neutral expression, so a 4-entry
 * bank does not bloat every prompt in the film.
 */
function expressionLine(shot, id) {
  const want = String((shot && shot.expression) || "").trim();
  if (!want || /^(none|neutral|n\/a|-|无|空)$/i.test(want)) return "";
  const bank = id && Array.isArray(id.expression_bank) ? id.expression_bank : [];
  const hit = bank.find(
    (e) => e && (String(e.name || "") === want || String(e.en || "").toLowerCase() === want.toLowerCase())
  );
  const en = (hit && hit.en) || want;
  return (
    `EXPRESSION — the face in this frame carries exactly this emotion: ${en}. ` +
    "An emotion only moves muscle: the bone structure, eye shape and spacing, nose, lips, jawline, " +
    "skin tone and hair must remain identical to the reference. Do not let the expression change the likeness."
  );
}

/** One-line re-assertion used at the tail of the prompt. */
function identityTail(id) {
  if (!id) return "";
  const key = [
    id.face_shape, id.eye_shape, id.iris_color, id.eyebrows, id.lips,
    id.hair_structure || id.hair_style, id.hair_color,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    "IDENTITY RE-CHECK — the person must be the SAME INDIVIDUAL as in the reference image(s), " +
    "with an identical face" + (key ? ` (${key})` : "") + ", identical hair and identical skin. " +
    "Do not invent a new face, do not change the age impression, do not restyle or re-cut the hair. " +
    "Wardrobe and transient physical state are governed by the SHOT-LOCAL STATE block, never by the reference image. " +
    "The reference image's own background, lighting, camera angle and composition must NOT be reused."
  );
}

// ---------------------------------------------------------------------------
// 1. Character reference sheet (the identity master)
// ---------------------------------------------------------------------------

/** The four expressions used when the planner did not supply a bank. */
const DEFAULT_EXPRESSIONS = [
  { name: "微笑", en: "a soft closed-mouth smile, eyes gently curved" },
  { name: "害羞", en: "shy, cheeks faintly flushed, gaze cast down and slightly away" },
  { name: "委屈", en: "a slight pout, glistening eyes, inner brows raised" },
  { name: "开心", en: "a bright open smile, eyes crinkled with joy" },
];

/** Normalise a planner-supplied expression bank into {name, en} pairs. */
function expressionBank(id) {
  const raw = id && Array.isArray(id.expression_bank) ? id.expression_bank : [];
  const out = raw
    .filter(Boolean)
    .map((e) =>
      typeof e === "string" ? { name: e, en: e } : { name: String(e.name || e.label || ""), en: String(e.en || e.prompt || e.desc || e.name || "") }
    )
    .filter((e) => e.name || e.en);
  while (out.length < 4) out.push(DEFAULT_EXPRESSIONS[out.length]);
  return out.slice(0, 4);
}

/**
 * The single most important asset in the pipeline.
 *
 * Method: put the character's whole identity into ONE generation — a large
 * close-up, front / side / back full-body views, and an expression strip.
 * Within a single generation the model is strongly self-consistent, so all of
 * those depictions share a face. Everything downstream is then derived from
 * this one image, which means identity only has to survive ONE hop, not a
 * chain. (The earlier design derived a full-body from a half-body portrait and
 * then derived every shot from the pair — a copy of a copy, which is exactly
 * where the face was lost.)
 *
 * The character is defined along seven axes before a single shot is drawn:
 * turnaround, facial features, hair structure, wardrobe layering, expression
 * range, characteristic movement and scene affinity. Fixing all seven up front
 * is what makes shot planning downstream mostly mechanical.
 *
 * @param {object} id  image-derived or planner-supplied identity params
 * @param {object} [o] { layout: "sheet-full" | "sheet" | "turntable" }
 */
function buildCharacterSheetPrompt(id, o) {
  o = o || {};
  const layout = o.layout || "sheet-full";
  const who = identityBlock(id);
  const parts = [];

  parts.push(
    "Professional CHARACTER REFERENCE SHEET for a film production — a single contact-sheet image " +
    "documenting one actor's appearance from multiple angles."
  );
  parts.push("");
  parts.push("SUBJECT (one single person): " + who);
  parts.push("");

  if (layout === "turntable") {
    parts.push("LAYOUT — eight evenly spaced full-body views of the SAME person arranged in a circular turntable:");
    parts.push("front, 45-degree left, 90-degree left profile, 135-degree rear-left, back, rear-right, right profile, 45-degree right.");
    parts.push("Identical face, hair, skin tone, proportions and garment in every view, all views head-to-toe with feet in frame.");
  } else {
    // Both "sheet" and "sheet-full" share the turnaround block; "sheet-full"
    // adds the expression strip beneath it.
    parts.push("LAYOUT — follow exactly, all inside one image, arranged as horizontal bands:");
    parts.push(
      "• UPPER BAND, occupying about 62% of the total image height:" +
      "  — On the left, about 40% of the frame width: ONE large head-and-shoulders close-up portrait, " +
      "front view, looking straight at the camera, neutral relaxed expression, full head and shoulders in frame." +
      "  — On the right, about 60% of the frame width: THREE full-body standing views of the SAME person " +
      "arranged side by side in this order — front view, 90-degree side view (turned so the profile is visible), " +
      "and back view. Each view complete from the top of the head to the soles of the feet, feet inside the frame, " +
      "arms relaxed at the sides, standing straight, feet shoulder-width apart."
    );
    if (layout === "sheet-full") {
      const bank = expressionBank(id);
      parts.push(
        "• LOWER BAND, occupying about 30% of the total image height: FOUR head-and-shoulders portraits of the " +
        "SAME person in a single evenly spaced horizontal row, each framed identically from the top of the head to " +
        "the collarbone, each showing one different facial expression in this left-to-right order — " +
        bank.map((e, i) => `(${i + 1}) ${e.en}`).join("; ") + "."
      );
      parts.push(
        "• Across both bands there are exactly seven depictions of one person: one large close-up, three full-body " +
        "views, three further expression heads. There is never a second person anywhere in the image."
      );
    } else {
      parts.push(
        "• All four depictions are ONE person. Identical face, identical hairstyle and hair colour, identical skin tone, " +
        "identical body proportions and height, identical garment cut, colour and material in every single view. " +
        "The garment structure must be consistent: same collar, same lapels, same length, same closures, same footwear."
      );
    }
    if (layout === "sheet-full") {
      parts.push(
        "• The face is identical in all seven depictions: same face shape, same eye shape and spacing, same iris " +
        "colour, same eyebrows, same nose, same lips, same jawline, same skin tone, same hairstyle, same hair colour. " +
        "Only the expression differs in the lower band. The garment is identical in every depiction: same collar, " +
        "same lapels, same length, same layering, same closures, same accessories, same footwear."
      );
    }
  }
  parts.push("");
  parts.push(
    "STUDIO: plain seamless light-grey backdrop, absolutely flat and empty. Soft even frontal key light with gentle fill, " +
    "even illumination across all views, no coloured gels, no neon, no rim light, no dramatic shadows, no environment, " +
    "no street, no props, no scenery, no architecture, no furniture."
  );
  parts.push(
    "OPTICAL: this is an orthographic-style casting sheet — flat, evenly lit, maximum readability of face, hair " +
    "structure and garment layering. Photorealistic, natural skin texture with visible pores and fine detail, " +
    "sharp facial detail, 85mm lens look."
  );
  parts.push("");
  parts.push(
    "Rejected outcomes: a multi-panel grid with different people in the panels, inconsistent hair between views, " +
    "a changed garment between views, a cropped-off lower body, missing feet."
  );
  parts.push("");
  parts.push(QUALITY_SUFFIX + ", " + EXCLUSION_SUFFIX + ".");
  return parts.join("\n");
}

/** Per-angle posing instructions for the derived studio references. */
const ANGLE_POSE = {
  front: {
    key: "front view",
    desc:
      "standing straight, facing the camera directly, head level and looking straight into the lens, " +
      "shoulders square to the camera, arms relaxed at the sides",
  },
  "3q-left": {
    key: "three-quarter view turned to the subject's right",
    desc:
      "body turned about 35 degrees away from the camera, face still clearly readable, " +
      "head slightly turned back toward the lens, arms relaxed at the sides",
  },
  "3q-right": {
    key: "three-quarter view turned to the subject's left",
    desc:
      "body turned about 35 degrees away from the camera in the other direction, face still clearly readable, " +
      "head slightly turned back toward the lens, arms relaxed at the sides",
  },
  side: {
    key: "full profile view",
    desc:
      "body turned a full 90 degrees to the camera so the complete profile silhouette is visible, " +
      "gaze straight ahead in profile, arms relaxed at the sides",
  },
  back: {
    key: "back view",
    desc:
      "body turned fully away from the camera, back of the head and the entire back of the garment visible, " +
      "arms relaxed at the sides",
  },
};

/** Reference-sheet angles a shot can ask for, in the order they are generated. */
const SHEET_ANGLES = ["front", "3q-left", "3q-right", "side", "back"];

function anglePose(angle) {
  return ANGLE_POSE[angle] || { key: `${angle} view`, desc: "standing straight, arms relaxed at the sides, full figure facing the camera" };
}

/**
 * A single full-body studio view at a specific angle, derived from the sheet.
 *
 * These per-angle references exist because a shot's framing and the reference's
 * framing should match as closely as possible. Feeding a head-and-shoulders
 * portrait into a wide full-body shot forces the model to invent the whole body
 * AND the face at a new scale — measured as the main cause of identity drift.
 */
/**
 * A single full-body studio view at a specific angle, derived from a portrait
 * of the actor.
 *
 * Two deliberate choices here, both learned from measurement:
 *
 *  1. THE INPUT IS A SINGLE-SUBJECT PORTRAIT, NOT THE SHEET.
 *     Passing the multi-panel sheet as the reference reliably reproduced
 *     another multi-panel sheet (15 out of 15 attempts across all five angles,
 *     including a retry each). A single-subject input removes the layout to
 *     copy, so a single-subject output is what comes back.
 *
 *  2. THE PROMPT NEVER NAMES THE THING IT DOES NOT WANT.
 *     An earlier revision carried a long list of rejections — "not a reference
 *     sheet", "no panels", "no collage", "no inset thumbnails". Naming those
 *     artefacts primed exactly those artefacts; every render came back as a
 *     contact sheet even when the input was a clean portrait. The prompt below
 *     describes only what the frame IS: one continuous photograph, one person,
 *     full length, studio backdrop.
 *
 * The reason per-angle references matter at all: a shot's framing should be
 * matched by a reference at the same angle and scale. Feeding a
 * head-and-shoulders portrait into a wide full-body shot forces the model to
 * invent the whole body AND the face at a new scale — the single largest cause
 * of identity drift measured in testing.
 */
function buildAngleRefPrompt(id, angle) {
  const A = anglePose(angle);

  const parts = [];
  parts.push("A full-length studio photograph of one person.");
  parts.push("");
  parts.push(
    `The attached image is a portrait of the actor. Photograph the same person again, ` +
    `full length, standing against a seamless studio backdrop, shot from the ${A.key}.`
  );
  parts.push("");
  parts.push("POSE: " + A.desc + ".");
  parts.push(
    "COMPOSITION: one person fills the frame vertically. Their whole figure is inside the picture — " +
    "the top of the head and the soles of both shoes are both visible with a little space to spare. " +
    "The person is centred, standing still, facing the camera position described above."
  );
  parts.push("");
  parts.push("THE PERSON (keep identical to the attached portrait):");
  parts.push(identityBlock(id));
  parts.push(
    "This is the same individual: same face, same hairstyle and hair colour, same skin tone, " +
    "same height and body proportions, same garment cut and colour, same material, same footwear."
  );
  parts.push("");
  parts.push(
    "SETTING: a seamless light-grey studio backdrop, evenly lit and completely plain, filling the whole " +
    "background. Soft frontal key light with gentle fill, uniform exposure, natural contact shadow under " +
    "the feet, floor and wall blending into one continuous grey surface."
  );
  parts.push("");
  parts.push(
    "RENDER: photorealistic, natural skin texture, sharp facial detail, true fabric weave, " +
    "35mm lens at a comfortable distance so the figure has normal proportions, " +
    "neutral colour, no colour cast."
  );
  parts.push("");
  parts.push(identityTail(id));
  parts.push(QUALITY_SUFFIX + ", " + EXCLUSION_SUFFIX + ".");
  return parts.join("\n");
}

/** Head-and-shoulders close-up used as the facial identity anchor in shots. */
function buildFaceRefPrompt(id) {
  const parts = [];
  parts.push(
    "A head-and-shoulders studio portrait of one person. The attached image shows this actor; " +
    "photograph the same person again as a single portrait."
  );
  parts.push("");
  parts.push(
    "COMPOSITION: from the top of the head to just below the collarbone, the face filling most of the frame, " +
    "front view looking straight into the lens, neutral relaxed expression, mouth closed, eyes open."
  );
  parts.push(
    "Sharpen the facial likeness: maximise the accuracy of face shape, eye shape and spacing, iris colour, " +
    "eyebrow shape and thickness, nose, lip shape and skin tone. This portrait is the facial identity " +
    "reference for an entire film, so facial fidelity matters more than anything else."
  );
  parts.push("");
  parts.push("THE PERSON — identical to the attached image:");
  parts.push(identityBlock(id));
  parts.push("");
  parts.push(
    "SETTING: a seamless light-grey studio backdrop, evenly lit and completely plain, filling the whole background. " +
    "Soft frontal key light with gentle fill, uniform exposure, no props, no scenery, no colour cast."
  );
  parts.push("");
  parts.push(identityTail(id));
  parts.push(
    QUALITY_SUFFIX + ", extreme facial detail, 85mm portrait lens, shallow depth of field, " + EXCLUSION_SUFFIX + "."
  );
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// 2. Style board
// ---------------------------------------------------------------------------

function buildStyleBoardPrompt(sb) {
  const style = sb.visual_style || {};
  const bits = [sb.style_board_prompt, style.look, style.lighting, style.film_stock, style.lens]
    .filter(Boolean)
    .map((s) => String(s).replace(/[。.\s]+$/, ""))
    .join(". ");
  const pal = Array.isArray(style.color_palette) && style.color_palette.length
    ? ` Colour palette: ${style.color_palette.join(" ")}.`
    : "";
  return (
    (bits ? bits + ". " : "") +
    pal +
    " An empty establishing frame with NO people in it — no characters, no faces, no silhouettes." +
    " " + QUALITY_SUFFIX + ", " + EXCLUSION_SUFFIX + "."
  );
}

// ---------------------------------------------------------------------------
// 2b. Scene anchors
// ---------------------------------------------------------------------------

/**
 * A location anchor: ONE empty frame that fixes the space, its architecture,
 * its materials, its practical lights and its palette for a group of shots.
 *
 * Why this exists — the asset-first rule. Three shots that happen in "the same
 * rain-soaked neon street" are three independent generations. Without a shared
 * anchor the alley's width, the placement of the lamps, the wet-stone colour
 * and the direction of the light all silently change between them, and the
 * audience reads it as three different streets. Naming a location in prose is
 * not enough; a location has to be an ASSET that every shot at that location
 * references by image.
 *
 * The anchor is deliberately empty of people. A scene reference that contains a
 * face would compete with the character references for control of the frame —
 * the same clash that makes multi-panel inputs reproduce multi-panel outputs.
 *
 * @param {object} scene  storyboard scene, { id, name, description|prompt }
 * @param {object} sb     whole storyboard (for the film's visual style)
 */
function buildSceneRefPrompt(scene, sb) {
  const style = (sb && sb.visual_style) || {};
  const prose = [scene && (scene.prompt || scene.description), scene && scene.lighting, scene && scene.architecture]
    .filter(Boolean)
    .join(". ");
  const styleBits = [style.look, style.lighting, style.lens, style.film_stock]
    .filter(Boolean)
    .join(", ");
  const pal = Array.isArray(style.color_palette) && style.color_palette.length
    ? `Colour palette: ${style.color_palette.join(" ")}.`
    : "";

  const parts = [];
  parts.push(
    `An empty establishing frame of a single film location` +
    (scene && scene.name ? ` — "${scene.name}".` : ".")
  );
  parts.push("");
  if (prose) parts.push("THE PLACE: " + prose.replace(/[。.\s]+$/, "") + ".");
  parts.push(
    "COMPOSITION: a wide, level, eye-height view of the space with clear depth — a foreground, a midground " +
    "and a background plane. The architecture and the layout of the place are unmistakable and easy to " +
    "recognise again, because this frame is the visual reference an entire sequence will be built from."
  );
  parts.push(
    "LIGHT: the practical light sources of the location are visible and their direction is unambiguous, " +
    "so every later shot can match them."
  );
  parts.push("");
  parts.push(
    "EMPTY SET: the location is completely unoccupied. No people at all — no figures, no faces, no " +
    "silhouettes, no crowd, no reflections of a person, no hands entering frame. Only the place itself."
  );
  parts.push("");
  if (styleBits || pal) parts.push("GRADE: " + styleBits + (styleBits && pal ? ". " : "") + pal);

  return (
    parts.filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim() +
    "\n\n" + QUALITY_SUFFIX + ", " + EXCLUSION_SUFFIX + "."
  );
}

// ---------------------------------------------------------------------------
// 3. Shot keyframes
// ---------------------------------------------------------------------------

/** "1", "1 and 2", "1, 2 and 3" — positional wording for the attached images. */
function ordinalList(nums) {
  const a = nums.slice();
  if (!a.length) return "";
  if (a.length === 1) return `image ${a[0]}`;
  return `images ${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;
}

/**
 * Spell out what each attached image is FOR.
 *
 * When a frame is built from a body view, a face close-up and a location
 * anchor, a single sentence — "the attached images are the identity source" —
 * is actively wrong: the model has no way to know that the third one must not
 * be mined for a face. Each image is therefore named by position and by job, so
 * the scene anchor contributes space and light without competing for control of
 * the likeness.
 *
 * @param {{label:string, role:"identity"|"scene"|"style"}[]} roles
 */
function refHandlingBlock(roles) {
  const pick = (r) => roles.map((x, i) => (x.role === r ? i + 1 : 0)).filter(Boolean);
  const idIdx = pick("identity");
  const sceneIdx = pick("scene");
  const styleIdx = pick("style");
  const lines = [];

  if (idIdx.length) {
    lines.push(
      `  • ${ordinalList(idIdx)} — the AUTHORITATIVE source for this person's FACE, hairstyle, hair colour, ` +
      "skin tone and body proportions. Reproduce that individual exactly. Wardrobe is taken from the " +
      "description below, not from these images."
    );
  }
  if (sceneIdx.length) {
    lines.push(
      `  • ${ordinalList(sceneIdx)} — the LOCATION anchor. Copy its architecture, its spatial layout, its ` +
      "materials and textures, the placement of its practical lights, the direction of the light and the " +
      "overall palette. It is an empty room: there is no person in it, so do not look for a face in it and " +
      "do not carry anything human out of it."
    );
  }
  if (styleIdx.length) {
    lines.push(
      `  • ${ordinalList(styleIdx)} — the film's style and colour reference. Match its palette, light quality ` +
      "and texture only; copy no subject from it."
    );
  }
  lines.push(
    "  • NONE of the references may dictate this frame's shot size, camera angle or composition — those come " +
    "from the SHOT block below. Never reproduce a reference's own framing, backdrop or camera position."
  );
  return "REFERENCE HANDLING — each attached image has one job:\n" + lines.join("\n");
}

/**
 * Build the image prompt for one shot.
 *
 * @param {object} shot    storyboard shot
 * @param {object} sb      whole storyboard
 * @param {object} o       { identity, hasCharacter, refLabels, refRoles, fix, noEnhance, wardrobeOverride, hasScene }
 */
function buildKeyframePrompt(shot, sb, o) {
  o = o || {};
  const style = sb.visual_style || {};
  const id = o.identity || null;
  const hasCharacter = !!o.hasCharacter;
  const parts = [];

  if (hasCharacter && id) {
    parts.push("IDENTITY — reproduce this person exactly as described and as shown in the reference image(s):");
    parts.push(identityImmutableBlock(id));
    const local = localStateBlock(shot, id, { wardrobeOverride: o.wardrobeOverride });
    if (local) {
      parts.push("");
      parts.push(local);
    }
    parts.push("");
    if (o.refRoles && o.refRoles.length) {
      parts.push(refHandlingBlock(o.refRoles));
    } else {
      parts.push(
        "REFERENCE HANDLING: the attached image(s) are the authoritative source for the face, hair, skin tone, " +
        "body proportions and wardrobe ONLY. Copy those exactly. Do NOT copy the reference's background, backdrop, " +
        "lighting direction, camera angle, framing or composition — those are defined by this shot's description below."
      );
    }
    parts.push(
      "PRECEDENCE: the identity description above always wins. The shot description further down may incidentally " +
      "mention hair being wet, wind-blown clothes, a garment collar or similar — treat those as transient scene " +
      "states layered on top of the SAME person, never as a reason to change the face, the hairstyle, the hair " +
      "colour, the hair length or the garment itself."
    );
    parts.push("");
  } else if (o.hasScene && o.refRoles && o.refRoles.length) {
    // A location-only shot still anchors to the location asset, so the empty
    // street in shot 4 is recognisably the same street as in shot 2.
    parts.push(refHandlingBlock(o.refRoles));
    parts.push("");
  } else if (o.refLabels && o.refLabels.length) {
    parts.push(
      "REFERENCE: the attached image defines the visual style, colour and lighting of the film. " +
      "Match its palette, light quality and texture. Do NOT copy any person from it."
    );
    parts.push("");
  }

  parts.push("SHOT:");
  parts.push(String(shot.keyframe_prompt || shot.visual || "").trim());

  // The expression is a transient muscle state, not a likeness change — it is
  // spelled out separately from both the shot prose and the identity block so
  // the two can never be confused with each other.
  if (hasCharacter) {
    const ex = expressionLine(shot, id);
    if (ex) {
      parts.push("");
      parts.push(ex);
    }
  }

  const frameBits = [];
  if (shot.shot_size) frameBits.push(`shot size ${shot.shot_size}`);
  if (shot.camera_angle) frameBits.push(`camera angle ${shot.camera_angle}`);
  if (shot.characters_view) frameBits.push(`subject oriented ${shot.characters_view}`);
  if (frameBits.length) parts.push("");
  if (frameBits.length) {
    parts.push("FRAMING: " + frameBits.join(", ") + ".");
  }

  if (shot.lighting) {
    parts.push("");
    parts.push("LIGHT: " + shot.lighting);
  }

  if (!o.noEnhance) {
    const styleBits = [style.look, style.lighting, style.lens, style.film_stock, style.grain]
      .filter(Boolean)
      .join(", ");
    if (styleBits || (Array.isArray(style.color_palette) && style.color_palette.length)) {
      parts.push("");
      parts.push(
        "GRADE: " + styleBits +
        (Array.isArray(style.color_palette) && style.color_palette.length
          ? `. Colour palette: ${style.color_palette.join(" ")}`
          : "") + "."
      );
    }
  }

  // A corrective block built from the previous attempt's vision diff.
  if (o.fix && o.fix.length) {
    parts.push("");
    parts.push(
      "CORRECTION FROM THE PREVIOUS ATTEMPT — the previous render produced a person who did not match the " +
      "reference closely enough. Fix each of these specifically, while keeping everything else the same:"
    );
    o.fix.slice(0, 6).forEach((d) => parts.push("  • " + d));
  }

  if (hasCharacter && id) {
    parts.push("");
    parts.push(identityTail(id));
  }

  const neg = Array.isArray(style.negatives) && style.negatives.length
    ? `Also avoid: ${style.negatives.join(", ")}.`
    : "";

  return (
    parts.filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim() +
    "\n\n" + QUALITY_SUFFIX + ", " + EXCLUSION_SUFFIX + ". " + neg
  );
}

module.exports = {
  QUALITY_SUFFIX,
  EXCLUSION_SUFFIX,
  ANGLE_POSE,
  SHEET_ANGLES,
  DEFAULT_EXPRESSIONS,
  IMMUTABLE_FIELDS,
  wardrobeText,
  identityBlock,
  identityImmutableBlock,
  localStateBlock,
  identityTail,
  expressionLine,
  expressionBank,
  ordinalList,
  refHandlingBlock,
  buildCharacterSheetPrompt,
  buildAngleRefPrompt,
  buildFaceRefPrompt,
  buildStyleBoardPrompt,
  buildSceneRefPrompt,
  buildKeyframePrompt,
};
