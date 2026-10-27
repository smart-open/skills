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
 * Clauses of `wardrobe_layers.accessories` that sit ON THE HEAD.
 *
 * Why this exists: the facial anchor deliberately drops the wardrobe (naming the
 * full outfit makes the model render a second full-body shot — see
 * `buildFaceRefPrompt`). But the wardrobe layer is also where a project declares
 * its hair ornaments, and a hairpin *is* part of the head. Dropping the whole
 * layer therefore silently dropped the character's most identifying accessory:
 * measured on 春风许我再少年, the signed sheet carried a pair of pearl-and-gold
 * buyao, while the derived `ref_face.png` came back with a bare centre-part —
 * and since `pickShotRefs` attaches the facial anchor to every character shot,
 * that loss would have propagated to all 48 keyframes.
 *
 * The split is by clause, not by field, because a single `accessories` string
 * routinely mixes a headpiece with a waist sash.
 */
const HEAD_ORNAMENT_RE =
  /(hairpin|hair\s*(pin|ornament|jewel|piece|clip|comb)|buyao|circlet|tiara|diadem|headdress|fascinator|headpiece|步摇|发簪|簪|发钗|钗|发冠|冠|头饰|额饰|珠花|绢花|发饰)/i;

function headOrnaments(id) {
  const acc = (id && id.wardrobe_layers && id.wardrobe_layers.accessories) || "";
  if (!acc) return "";
  return String(acc)
    .split(/[;；]/)
    .map((s) => s.trim())
    .filter((s) => s && HEAD_ORNAMENT_RE.test(s))
    .join("; ");
}

/**
 * The head-ornament clause, single-sourced, for the facial anchor, the full-body
 * turnaround refs AND every character keyframe.
 *
 * Why this exists: on 春风许我再少年 (2026-10-04) the prompts drifted apart on the
 * same accessory. The facial anchor carried its own bespoke HEAD paragraph and
 * came back with an inflated pearl-chandelier version, chains swinging well past
 * the chin; the full-body refs buried the identical clause inside the wardrobe
 * list and came back with ONE small pin — the mirrored second pin simply absent.
 * Two prompts, three different hairpins. And because the keyframe prompt ALSO
 * reached the ornament only through the wardrobe list, the film's own frames were
 * queued to inherit the same degradation. So the clause is emitted once, verbatim,
 * into all three.
 *
 * Three locks, in this order — count, symmetry, size:
 *   • COUNT      a pair is stated as TWO, one per side, counted out loud.
 *   • SYMMETRY   "mirrored, identical in size and shape" — otherwise the model
 *                draws one piece and lets the other side go bare.
 *   • SIZE CAP   a *quantified* ratio against the head, never a bare adjective.
 *                Measured in practice: `small` / `no larger than the section of
 *                hair it grips` are read as tone, not constraint — the model
 *                complies about 70% and spends the rest on its own taste. Only
 *                "about a third of the height of the head", with the jaw and the
 *                shoulder given as the two reference points, actually held.
 *
 * Boolean negation is deliberately absent: enumerating what NOT to draw
 * summons it (HARDENING 坑位 70). Every lock is phrased positively.
 *
 * @param {object} id
 * @param {object} [o]  { framing: "ref" (default) | "shot" }
 *                      "shot" relaxes "both clearly visible" into "both present
 *                      whenever the head is in frame", so a wide or over-the-
 *                      shoulder frame is not pushed to manufacture a second pin
 *                      out of nothing — while the count and the size stay locked.
 */
function headOrnamentBlock(id, o) {
  o = o || {};
  const isShot = o.framing === "shot";
  const ho = headOrnaments(id);
  if (!ho) return "";
  const paired = /(both sides|either side|\bpair\b|a pair|两侧|左右|一对|双)/i.test(ho);
  const out = [
    `HAIR ORNAMENTS — EXACTLY AS REFERENCED, reproduced in full: ${ho}.`,
  ];
  if (paired) {
    out.push(
      isShot
        ? "There are TWO of them, one on each side of the parting — mirrored, identical in shape, size and drop — " +
            "and both are present whenever the head is in frame."
        : "There are TWO of them, one pinned on each side of the parting. They are mirrored: " +
            "identical shape, identical size, identical drop, and both are present and clearly visible."
    );
  } else {
    out.push("It sits at the same place on the head as referenced, at the same size and drop.");
  }
  out.push(
    "SIZE AND SCALE ARE LOCKED TO THE REFERENCE, measured against the head: the pin is a small flat " +
      "ornament gripping a short section of hair above and behind the ear, and the whole piece — pin and " +
      "chain together — spans only about a third of the height of the head. The lowest bead hangs level with " +
      "the jawline and stays well above the shoulder."
  );
  if (isShot) {
    // 全身/远景是这条约束最容易失效的地方：头一小，模型就把配饰省掉或缩成一个金点。
    out.push(
      "This holds at every shot size. When the head is small in the frame the ornaments are correspondingly " +
        "small — still two of them, still the same shape and the same size relative to the head."
    );
  } else {
    out.push(
      "The piece keeps the size, the number of beads and the chain length it has in the reference, " +
        "whatever the framing of this photograph."
    );
  }
  return out.join(" ");
}

/**
 * Compact, directly quotable identity block.
 *
 * @param {object} id   output of vision.extractIdentity() (or a planner fallback)
 * @param {object} [o]  { wardrobeOverride, noWardrobe, headOrnaments }
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
  // Head ornaments survive `noWardrobe`: a hairpin lives on the head, so the
  // facial anchor is exactly the image that must not lose it.
  if (o.headOrnaments) {
    const ho = headOrnaments(id);
    if (ho) p.push(`Hair ornaments (worn in the hair — keep them exactly): ${ho}.`);
  }
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
  return ANGLE_POSE[angle] || { key: `${angle} view`, desc: "standing straight, arms relaxed at the sides, facing the camera" };
}

/**
 * The FRAMING axis of a character reference — how much of her the picture takes in.
 *
 * The reference set has TWO axes, not one:
 *   angle   — which way she is turned (front / 3q-left / 3q-right / side / back)
 *   framing — how much of her the picture takes in (full figure / waist-up)
 *
 * Every keyframe picks ONE reference by `shot_size -> framing` and
 * `characters_view -> angle`. One image per shot is the rule that fixed the
 * two-person bug (HARDENING 坑位 75 补记三): each extra reference is another
 * chance for the model to read one face as two people. Matching the framing to
 * the shot size means the reference no longer FIGHTS the framing — it agrees
 * with it, which is the whole reason a `close-up` can come back as a close-up.
 *
 * `close` (the face anchor) already exists as `ref_face.png` and needs no
 * separate angle derivation — it is front-only, which is what a face anchor is for.
 */
const FRAMINGS = {
  full: {
    key: "full figure",
    intro: "A full-length studio photograph of one person.",
    framingPhrase: "full length, standing against a seamless studio backdrop",
    composition:
      "COMPOSITION: one person fills the frame vertically. Their whole figure is inside the picture — " +
      "the top of the head and the soles of both shoes are both visible with a little space to spare. " +
      "The person is centred, standing still, facing the camera position described above.",
    headNote:
      "The figure is full length, so the head is small within the frame — that does not license simplifying " +
      "the hair ornaments. They keep the exact shape, size, count and chain length they have in the reference, " +
      "readable at true scale against the head.",
    setting:
      "a seamless light-grey studio backdrop, evenly lit and completely plain, filling the whole " +
      "background. Soft frontal key light with gentle fill, uniform exposure, natural contact shadow under " +
      "the feet, floor and wall blending into one continuous grey surface.",
  },
  waistup: {
    key: "waist-up",
    intro: "A waist-up studio portrait photograph of one person.",
    framingPhrase: "framed from the waist up, against a seamless studio backdrop",
    composition:
      "COMPOSITION: the person is framed from the waist upward — the whole head, shoulders, arms and upper " +
      "torso are inside the picture, the top of the head near the upper edge with a little space to spare, " +
      "and the bottom edge cutting across her at the waist. The person is centred and still, turned as " +
      "described above. This is a half-length portrait, NOT a full figure: her legs are not in the frame.",
    headNote:
      "The head is large in this frame, so the hair ornaments read clearly — keep the exact shape, size, " +
      "count and chain length they have in the reference.",
    setting:
      "a seamless light-grey studio backdrop, evenly lit and completely plain, filling the whole " +
      "background. Soft frontal key light with gentle fill, uniform exposure, a natural soft shadow " +
      "falling behind her on the backdrop, floor and wall blending into one continuous grey surface.",
  },
};

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
function buildAngleRefPrompt(id, angle, framing) {
  const A = anglePose(angle);
  const F = FRAMINGS[framing] || FRAMINGS.full;

  const parts = [];
  parts.push(F.intro);
  parts.push("");
  parts.push(
    `The attached image is a portrait of the actor. Photograph the same person again, ` +
    `${F.framingPhrase}, shot from the ${A.key}.`
  );
  parts.push("");
  parts.push("POSE: " + A.desc + ".");
  parts.push(F.composition);
  parts.push("");
  parts.push("THE PERSON (keep identical to the attached portrait):");
  parts.push(identityBlock(id));
  parts.push(
    "This is the same individual: same face, same hairstyle and hair colour, same skin tone, " +
    "same height and body proportions, same garment cut and colour, same material, same footwear."
  );
  // 头饰必须与面部锚点逐字一致 —— 同一个 headOrnamentBlock 同时喂给两类参考图。
  // 这里额外补一句"人物全身、头在画面里很小"的提醒：正因为头小，模型最容易把
  // 步摇简化成一个孤零零的小件、或者干脆只画一边（实测两版 5 张全身图全中）。
  const hoBlock = headOrnamentBlock(id);
  if (hoBlock) {
    parts.push("");
    parts.push(hoBlock);
    parts.push(F.headNote);
  }
  parts.push("");
  parts.push("SETTING: " + (F.setting || "a seamless light-grey studio backdrop."));
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
  // 只描述脸 / 发型 / 肤色 / 体型。把整套服装（尤其下装与鞋）写进这一段，模型就会
  // 倾向于把人物画成全身，于是这张"面部锚点"变成第二张全身照 —— 实测确认过。
  // 面部锚点的唯一职责是锁定五官，服装由逐镜的 SHOT-LOCAL STATE 负责。
  // 唯一的例外是**头饰**：步摇/发簪长在头上，属于这张图该管的东西，丢一次就全片丢。
  // 注意：这里不再用 identityBlock 的 headOrnaments 开关，改由 headOrnamentBlock 统一
  // 出词——否则全身参考图与面部锚点会各自长出自己的头饰版本（2026-10-04 实测走样）。
  parts.push(identityBlock(id, { noWardrobe: true }));
  // 正向表述，不写否定枚举（否定=反向召唤，见 HARDENING 坑位 70）。
  parts.push(
    "HEAD, EXACTLY AS REFERENCED: the same hairline and parting, the same length and fall of the hair. " +
      "The same age impression."
  );
  const hoBlockFace = headOrnamentBlock(id);
  if (hoBlockFace) {
    parts.push("");
    parts.push(hoBlockFace);
  }
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
/**
 * The framing axis for LOCATION anchors — the same idea as FRAMINGS, applied to
 * places instead of people.
 *
 * A location anchor is drawn so the whole space reads at once, which makes it a
 * wide, empty frame. Handing that frame to a close-up reproduces the wide framing
 * wholesale: measured on 春风许我再少年, S04 (close-up) and S13 (medium close-up)
 * each came back as a full-length figure standing in a wide vista — because the
 * anchor they were handed was exactly such a vista.
 *
 * So a place is drawn at more than one distance too, and a shot picks the anchor
 * whose framing matches its size — the same rule as for people (坑位 75 补记五).
 *
 *   full   — the whole space (the historical ref_scene_<key>.png)
 *   medium — one area of the space: a wall, a corner, its furniture
 *   close  — one surface or fixture, at arm's length
 */
const SCENE_FRAMINGS = {
  full: {
    key: "全景",
    intro: "An empty establishing frame of a single film location",
    composition:
      "COMPOSITION: a wide, level, eye-height view of the space with clear depth — a foreground, a midground " +
      "and a background plane. The architecture and the layout of the place are unmistakable and easy to " +
      "recognise again, because this frame is the visual reference an entire sequence will be built from.",
  },
  medium: {
    key: "中景",
    intro: "An empty medium frame of ONE PART of a single film location",
    composition:
      "COMPOSITION: a medium view of one area of the space, level at eye height — nearer than the whole room, " +
      "but far enough back that one wall or one corner together with its furniture fills the frame. This is " +
      "the SAME place as the wide establishing frame, only closer: the same architecture, materials, light " +
      "sources and palette, cropping into the space instead of showing all of it. No person, no figure, no " +
      "silhouette occupies the frame — this is a location plate.",
  },
  close: {
    key: "近景",
    intro: "An empty close-up frame of ONE DETAIL of a single film location",
    composition:
      "COMPOSITION: a close, level view of one surface or fixture of the space — a section of wall, a window " +
      "frame, a table top, a corner of a room — filling the frame at arm's length. This is the SAME place as " +
      "the wide establishing frame, only much nearer: the same architecture, materials, light and palette. " +
      "Shallow depth of field, the rest of the room falling softly out of focus behind. No person, no figure, " +
      "no silhouette occupies the frame — this is a location plate.",
  },
};

function buildSceneRefPrompt(scene, sb, framing) {
  const F = SCENE_FRAMINGS[framing] || SCENE_FRAMINGS.full;
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
    `${F.intro}` +
    (scene && scene.name ? ` — "${scene.name}".` : ".")
  );
  parts.push("");
  if (prose) parts.push("THE PLACE: " + prose.replace(/[。.\s]+$/, "") + ".");
  parts.push(F.composition);
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

/** Lower-case, collapse separators: "Medium Close-Up" / "medium_close up" -> "medium close-up". */
function normaliseSize(s) {
  return String(s == null ? "" : s).toLowerCase().replace(/[\s_-]+/g, " ").trim();
}

/**
 * Shot size -> the picture it actually describes, stated positively.
 *
 * The storyboard stores a shot as a single word (`close-up`). On its own that
 * word loses to the pull of an attached full-body reference, which drags every
 * frame back to a standing wide shot — measured on 春风许我再少年 S04, scripted
 * "Close-up of the protagonist's face … fine hair strands drifting across the
 * cheek", rendered three times as a full-length two-shot. The fix is to say
 * what the frame IS, not what it isn't.
 *
 * Keys are space-normalised so `close-up`, `close_up`, `Close Up` all land on
 * the same entry — `normaliseSize()` folds hyphens AND underscores to spaces,
 * so hyphenated keys here would never match (that mismatch silently produced an
 * empty clause on the first attempt).
 */
const SHOT_SIZE_CLAUSE = {
  "extreme close up": "The frame is cropped extremely tight — a single detail (the eyes, the hands, a fold of silk) fills the whole picture.",
  "close up": "The frame is cropped tight on the head and shoulders: the face is large, central and sharply detailed, with the surroundings soft behind her.",
  "medium close up": "The frame is cropped at the chest: head, shoulders and upper torso fill the picture.",
  "medium": "The frame is cropped around the waist: head and torso fill the upper two thirds of the picture.",
  "medium wide": "The frame takes in the figure down to below the knee, with some room around her.",
  "wide": "The frame takes in the whole figure with generous space around her.",
  "extreme wide": "The figure is small inside a vast landscape — the environment dominates the picture.",
  // 同义词/增量景别。`macro` 是实测遇到的第一个漏网值（春风 9:16 的 S23 影子镜）——
  // 漏一个值就意味着那个镜头静默退回"只有关键词"，而关键词压不住参考图的构图惯性。
  "macro": "The frame is a macro shot: a tiny surface detail fills the entire picture, far closer than a face — texture and material are the subject.",
  "insert": "The frame is a tight insert on a single object or detail, which fills the picture.",
  "detail": "The frame is a tight detail shot: one small part of the scene fills the picture.",
  "full": "The frame takes in the whole figure from head to feet with a little space around her.",
  "establishing": "The frame is a wide establishing view: the place dominates and any figure is small within it.",
};

/**
 * 空镜版景别句 —— 与 SHOT_SIZE_CLAUSE 一一对应，但**一个字都不提人**。
 *
 * 存在的理由（2026-10-04 实测）：空镜 S01 连跑 3 次、每次都画出一个人
 * （门禁判"人物数=1"，最佳 40 分）。根因不是否定枚举，而是上面那张表被
 * **无条件套用**：空镜拿到的 SHOT 段写着
 *
 *     "The frame takes in the whole figure with generous space around her."
 *
 * 那是给角色镜写的句子。提示词明确要求"容纳**整个人物**"，模型当然画一个人 ——
 * 于是"晨光书斋空镜"变成了"主角站在窗边的全身镜"，连 `no people` 都压不住
 * （同一段里两个指令直接矛盾，模型挑了那个人）。
 *
 * 空镜的景别只该描述**取景范围**（画面收进这块空间的多少），
 * 不该描述"人物在画面里多大"——因为画面里根本不该有人。
 */
const SHOT_SIZE_CLAUSE_EMPTY = {
  "extreme close up": "The frame is cropped extremely tight on one small surface of this place — a single detail fills the whole picture.",
  "close up": "The frame is cropped tight on one surface or fixture of this place, close enough to read its material and its grain.",
  "medium close up": "The frame is cropped on one bay or corner of this place, filling the picture with its architecture and its light.",
  "medium": "The frame takes in one part of this place — a wall, a corner, or the furniture that belongs to it — filling the upper two thirds of the picture.",
  "medium wide": "The frame takes in a broad part of this place, with depth running from the near foreground to the far wall.",
  "wide": "The frame is a wide establishing view of this place, with generous space and depth across it.",
  "extreme wide": "The frame is an extreme wide establishing view: the place itself dominates, vast and quiet, with a great deal of air around it.",
  "macro": "The frame is a macro shot: a tiny surface detail of this place fills the entire picture — texture and material are the subject.",
  "insert": "The frame is a tight insert on a single object in this place, which fills the picture.",
  "detail": "The frame is a tight detail shot: one small part of this place fills the whole picture.",
  "full": "The frame is a full establishing view of this place, taking in the whole space.",
  "establishing": "The frame is a wide establishing view: the place itself dominates the picture.",
};

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
  // `roles` arrives in two shapes in the wild: the string form that
  // `pickShotRefs` actually produces (["identity","identity","scene"]) and the
  // object form ({role, label}). Reading `x.role` off a string yields
  // `undefined`, so every `pick()` came back empty and the block silently
  // emitted ZERO per-image lines — only the generic closing sentence survived.
  //
  // Measured on 春风许我再少年 S04 (2026-10-04): three attached references (a
  // full-body studio view, a face close-up of the SAME girl, and an empty
  // location anchor) arrived with no statement of what each one was for. The
  // model resolved the ambiguity by rendering the two portraits as TWO
  // DIFFERENT WOMEN standing side by side, and took its composition from the
  // full-body reference, turning a scripted close-up into a wide two-shot.
  // Both halves of that failure trace back to these missing lines.
  // See HARDENING 坑位 75.
  const norm = (Array.isArray(roles) ? roles : []).map((x) =>
    typeof x === "string"
      ? { role: x, label: x }
      : { role: (x && x.role) || "", label: (x && x.label) || "" }
  );
  const pick = (r) => norm.map((x, i) => (x.role === r ? i + 1 : 0)).filter(Boolean);
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
    if (idIdx.length > 1) {
      // 同一人从不同角度拍的多张参考图，必须明说"这是同一个人"，否则模型会把
      // 两张肖像当成两个人并排画出来（S04/S13 实测）。
      // 措辞**纯正向**：第一版写了 "none of them is a second character" /
      // "none of them may be placed beside her"，结果 S13 反而画出一个并排的
      // 现代装女孩 —— 正是坑位 70 的反向召唤（否定枚举把概念请了进来）。
      lines.push(
        `  • Those identity images all show ONE AND THE SAME individual, photographed from different angles. ` +
        "This frame contains exactly one person: merge every one of those references into a single woman, " +
        "standing on her own, occupying the frame by herself."
      );
    }
  }
  if (sceneIdx.length) {
    lines.push(
      `  • ${ordinalList(sceneIdx)} — the LOCATION anchor: it fixes the PLACE. Take from it the architecture, ` +
      "the materials and textures, the palette, the direction of the light and where its practical lights sit. " +
      "It is an empty frame with no person in it, so nothing human comes out of it. Reproduce the PLACE, not " +
      "the picture: the attached frame shows how much of this place the shot size above calls for, and the " +
      "camera sits at that distance on the same location."
    );
  }
  if (styleIdx.length) {
    lines.push(
      `  • ${ordinalList(styleIdx)} — the film's style and colour reference. Match its palette, light quality ` +
      "and texture only; copy no subject from it."
    );
  }
  // 道具锚（prop anchor）—— 2026-10-09 新增。
  // 起因：要给一个"空镜"里的道具（长剑）统一形制，唯一的可靠办法是把**已经画对的道具图**
  // 喂回去当参考。但原来的 --ref-image 只能挂 identity 角色，于是参考说明写成
  // "this person's FACE, hairstyle, body proportions" —— 空镜照样被画进一个人。
  // 道具锚的说明必须说清三件事：它管的是**物体**、只取**那个物体的形制**、
  // 不许从它带出人物或背景。
  const propIdx = pick("prop");
  if (propIdx.length) {
    lines.push(
      `  • ${ordinalList(propIdx)} — the PROP reference: a photograph of a single OBJECT (no person, no scene) ` +
      "shown so its form can be copied exactly. Take from it ONLY the shape, materials, colours and proportions " +
      "of that object, and render that same object into this frame at the size and angle the SHOT block calls for. " +
      "Do NOT copy its background, its studio lighting or its framing, and do NOT let anything human or any " +
      "second object come out of it."
    );
  }
  // 正向表述。原句是 "NONE of the references may dictate this frame's shot size …"
  // —— 否定式，按坑位 70 力度打折。实测（春风 S04/S13）：分镜写 close-up / medium
  // close-up，参考图只有面部锚点 + 一张**大远景场景锚点**，构图仍被锚点拽成全景全身。
  // 所以改成正向声明，并把"取景归 SHOT 块管"这件事说成"参考物被放进这个取景里"。
  lines.push(
    "  • FRAMING BELONGS TO THE SHOT BLOCK below: it states the shot size, the camera angle and the " +
    "orientation of the subject, and the frame is composed exactly to that. Everything the references " +
    "contribute — the face, the person, the place, the palette — is placed INTO that framing, at whatever " +
    "distance the shot size names."
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
    // 头饰在关键帧里只从服装层经过（和当初出问题的全身参考同一条路径），
    // 远景/小头时会被省掉或缩成一个金点。这里用与参考图同一段文字再锁一次
    // （framing:"shot" 把"两侧都要清晰可见"放宽成"头在画面里就两侧都在"）。
    const hoShot = headOrnamentBlock(id, { framing: "shot" });
    if (hoShot) {
      parts.push("");
      parts.push(hoShot);
    }
    // 正向人数锁。排除后缀里那句 "absent: a second person" 是**否定枚举**，
    // 按坑位 70 它只会反向召唤；多张参考图更会让模型把同一人的不同角度
    // 当成不同角色并排画出来（S04/S13 实测）。所以这里补一句正向的。
    // 措辞同样**不提"第二个人"** —— 第一次写成了 "none of them is a second
    // character … may be placed beside her"，S13 立刻画出一个并排的现代装女孩。
    const castNames = Array.isArray(shot.characters_in_shot)
      ? shot.characters_in_shot.map((n) => String(n == null ? "" : n).trim()).filter(Boolean)
      : [];
    if (castNames.length === 1) {
      // 合并句只在**真的挂了多张身份图**时才写。近景镜现在只挂面部锚点一张，
      // 此时"多张参考是同一个人的不同角度、请合并成一个人"这句自相矛盾
      // （没有"多张"可合并），而句子里"different angles"反而给了模型
      // "多拍几张/多个人"的暗示。一张就是一张。
      const idRefCount = (Array.isArray(o.refRoles) ? o.refRoles : []).filter((x) =>
        typeof x === "string" ? x === "identity" : (x && x.role) === "identity"
      ).length;
      parts.push("");
      parts.push(
        "ON SCREEN: one person only — this single individual, alone in the frame, filling it by herself." +
          (idRefCount > 1
            ? " All of the attached identity references are the same woman seen from different angles, " +
              "and they merge into that one figure."
            : "")
      );
    }
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
  // 景别句在这里**再写一次**：模型读 SHOT 散文之前先把构图立住。
  // 实测（春风 S04/S13）FRAMING 段单独说一次压不住场景锚点的全景惯性 ——
  // 重复是特效药，但两处的措辞必须同源（坑位 74）。
  // 空镜（hasCharacter=false）走 EMPTY 表：角色版句式里的 "the whole figure … her"
  // 会把一个人请进空镜 —— 这正是 S01 连画三次人的原因（见 SHOT_SIZE_CLAUSE_EMPTY 注释）。
  const SIZE_TABLE = o.hasCharacter ? SHOT_SIZE_CLAUSE : SHOT_SIZE_CLAUSE_EMPTY;
  const sizeClauseShot = SIZE_TABLE[normaliseSize(shot.shot_size)] || "";
  if (sizeClauseShot) parts.push(sizeClauseShot);
  parts.push(String(shot.keyframe_prompt || shot.visual || "").trim());

  // 近景角色镜不带场景锚点**图**，改用场景**文字**。
  // 图片的"地方"会把构图拽回它自己的取景（实测 S13 的 medium close-up 被山巅大远景
  // 连拽三次）；文字的"地方"只提供环境信息，不携带构图。见 HARDENING 坑位 75 补记二。
  if (o.sceneText) {
    parts.push("");
    parts.push(
      "SETTING — the place she is in, given in words rather than attached as a picture: " +
      String(o.sceneText).replace(/\s+/g, " ").trim() +
      " This frame takes in only as much of that place as the shot size above names; " +
      "the rest of it falls away, softly out of focus, behind her."
    );
  }

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
  // 空镜的 characters_view 常写成 "none"，照搬会输出 "subject oriented none"（自相矛盾）。
  const view = String(shot.characters_view || "").trim();
  if (view && !/^(none|n\/a|-|无)$/i.test(view)) frameBits.push(`subject oriented ${view}`);
  if (frameBits.length) parts.push("");
  if (frameBits.length) {
    // 把景别从"一个词"展开成**正向的构图句**。
    //
    // 为什么：一个全身参考图挂在人像镜上时，构图会被那张参考硬拽成全身远景 ——
    // 实测 S04 分镜写 close-up（"发丝拂过脸颊、腰带落在指间"），连续三次都出成
    // 全身横移双人镜。`shot size close-up` 三个字压不住参考图的构图惯性，
    // "NONE of the references may dictate … composition" 又是否定句（坑位 70）。
    // 所以补一句把画面**正面画出来**的构图描述。
    const clause = (o.hasCharacter ? SHOT_SIZE_CLAUSE : SHOT_SIZE_CLAUSE_EMPTY)[normaliseSize(shot.shot_size)] || "";
    parts.push("FRAMING: " + frameBits.join(", ") + "." + (clause ? " " + clause : ""));
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
      hasCharacter
        ? "CORRECTION FROM THE PREVIOUS ATTEMPT — the previous render produced a person who did not match the " +
          "reference closely enough. Fix each of these specifically, while keeping everything else the same:"
        : "CORRECTION FROM THE PREVIOUS ATTEMPT — the previous render violated the hard frame requirements below " +
          "(this is an EMPTY establishing shot: no person may appear at all). Fix each of these specifically, " +
          "while keeping everything else the same:"
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
  FRAMINGS,
  SCENE_FRAMINGS,
  DEFAULT_EXPRESSIONS,
  IMMUTABLE_FIELDS,
  wardrobeText,
  headOrnaments,
  headOrnamentBlock,
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
