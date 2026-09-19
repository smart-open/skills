#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * lib/vision.js — Visual QA for character consistency, powered by the
 * multimodal input of `agnes-3.0-flash`.
 *
 * Why this exists
 * ---------------
 * The image model is a stochastic renderer. Two things can go wrong silently:
 *
 *   1. The character reference itself is bad (two people on one sheet, three
 *      views that are not the same face, text on the backdrop). Every later
 *      asset inherits that fault, so it must be caught at the source.
 *
 *   2. A shot keyframe drifts away from the reference face. Nothing in the
 *      pipeline used to notice — the shot was simply accepted and animated, and
 *      the character changed identity between cuts.
 *
 * `agnes-3.0-flash` accepts image input, so both can be checked objectively
 * instead of hoping. This module turns "hope" into a scored gate with an
 * automatic retry loop.
 *
 * Images are passed as LOCAL FILE PATHS and are downscaled into base64 data
 * URIs before being sent — see lib/imgutil.js for why the documented "public
 * URL" route is not reliable enough to build a gate on.
 *
 * All prompts demand strict JSON so the result can be parsed and acted on.
 */

const agnes = require("./agnes");
const imgutil = require("./imgutil");

// ---------------------------------------------------------------------------
// Low-level: multimodal chat
// ---------------------------------------------------------------------------

/**
 * Chat completion with image inputs.
 *
 * @param {agnes.KeyPool} pool
 * @param {object} o
 * @param {string}   o.system
 * @param {string}   o.text      the user instruction
 * @param {Array<string|{local:string,url?:string}>} o.images
 *        local file paths — downscaled to data URIs before sending
 * @param {number}   [o.maxTokens]
 * @param {number}   [o.temperature]
 * @param {number}   [o.maxPx]   longest edge for the downscale (default 768)
 * @returns {Promise<string>} raw assistant text
 */
async function chatVision(pool, o) {
  const content = [{ type: "text", text: o.text }];
  for (const item of o.images || []) {
    if (!item) continue;
    const uri = await imgutil.toDataUriFromAnything(item, o.cacheDir, { maxPx: o.maxPx || imgutil.DEFAULT_MAX_PX });
    content.push({ type: "image_url", image_url: { url: uri } });
  }
  const payload = {
    model: agnes.MODEL_CHAT,
    messages: [
      ...(o.system ? [{ role: "system", content: o.system }] : []),
      { role: "user", content },
    ],
    max_tokens: o.maxTokens || 2400,
    temperature: o.temperature === undefined ? 0.1 : o.temperature,
    stream: false,
  };
  const body = JSON.stringify(payload);
  const res = await agnes.withKeyRetry(
    pool,
    (key) =>
      agnes.httpRequest({
        method: "POST",
        pathStr: "/v1/chat/completions",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body,
        timeout: 300000,
      }),
    { label: "vision" }
  );
  let json;
  try { json = JSON.parse(res.raw); } catch (e) {
    throw new Error("vision: failed to parse response: " + res.raw.slice(0, 500));
  }
  const choice = json.choices && json.choices[0];
  const c = choice && choice.message && choice.message.content;
  if (!c) throw new Error("vision: empty content: " + res.raw.slice(0, 500));
  return c;
}

/** chatVision + JSON extraction, with one "fix your JSON" retry. */
async function chatVisionJson(pool, o) {
  const text = await chatVision(pool, o);
  try {
    return agnes.extractJson(text);
  } catch (e) {
    // One retry that shows the model its own malformed output.
    const again = await chatVision(pool, {
      ...o,
      text:
        o.text +
        "\n\n你的上一次输出不是合法 JSON，无法解析。请只输出一个合法 JSON 对象，" +
        "不要任何解释文字，不要 markdown 代码块。上次输出开头如下：\n" +
        String(text).slice(0, 600),
    });
    return agnes.extractJson(again);
  }
}

const VISION_SYSTEM =
  "你是影视制作中的角色一致性质检员。你能极其精确地比对两张图片中的同一个人物，" +
  "判断脸型、眼型与眼距、眉形、鼻形、唇形、下颌线条、肤色、发际线与发色是否属于同一个人。" +
  "你只依据图像中实际可见的证据作答，绝不推测，绝不客套。";

// ---------------------------------------------------------------------------
// 1. Validate the character reference sheet
// ---------------------------------------------------------------------------

const SHEET_RUBRIC = `评分维度（每项 0-100，最后给出加权总分）：
- identity_consistency：所有视图（头像特写、三视图、下方表情头像）是否明确是同一个人（最重要，权重最高）
- view_completeness：是否包含「左侧大胸像特写 + 右侧正面/侧面/背面三个全身视图」，且都完整入画
- expression_band：下方是否有一排 4 个同一人的不同表情头像（若画面只有 4 格、没有表情带，此项给 0）
- hair_structure：发型是否可读出结构（长度、分缝、刘海、卷度、层次），而不是糊成一团
- garment_layering：服装是否可读出层次（内层/外层/配饰/鞋履分别可见）
- garment_consistency：各视角的服装结构与颜色是否严格一致（不能这里露腰那里不露）
- cleanliness：背景是否干净（纯白或浅灰纯色影棚），有无杂物、道具、场景元素
- text_free：画面中是否出现任何文字、字母、水印、logo、色卡标签
- face_detail：面部是否清晰、五官可辨、无畸变（无多指、无扭曲、无重复肢体）`;

/**
 * Score a generated character sheet. Used to pick the best candidate.
 *
 * `has_any_text` remains a hard gate: the sheet is the origin of every derived
 * reference, and a single stray caption on it propagates into the film's
 * frames. The expression band, by contrast, is only a soft preference — a
 * sheet that nails the face but omits the band is still usable, so it scores
 * lower rather than being rejected.
 *
 * @param {string} sheetPath local PNG path of the candidate sheet
 * @returns {Promise<{score:number, passed:boolean, issues:string[], raw:object}>}
 */
async function scoreCharacterSheet(pool, sheetPath) {
  const raw = await chatVisionJson(pool, {
    system: VISION_SYSTEM,
    images: [sheetPath],
    text:
      "这是一张 AI 生成的角色设定表（character reference sheet）。请严格审核它是否达到制作标准。\n\n" +
      SHEET_RUBRIC +
      "\n\n只输出如下 JSON（不要任何解释文字、不要 markdown 代码块）：\n" +
      '{"is_single_person":true,"same_face_across_views":true,"views_present":["front","side","back","closeup"],' +
      '"expression_band_present":true,"expression_count":4,"background_clean":true,"has_any_text":false,"deformed":false,' +
      '"scores":{"identity_consistency":0,"view_completeness":0,"expression_band":0,"hair_structure":0,' +
      '"garment_layering":0,"garment_consistency":0,"cleanliness":0,"text_free":0,"face_detail":0},' +
      '"score":0,"issues":["用中文逐条列出具体的缺陷，没有缺陷就给空数组"]}',
  });
  let score = Number(raw.score) || 0;
  const issues = Array.isArray(raw.issues) ? raw.issues.filter(Boolean) : [];
  // Hard fail conditions: the sheet is unusable regardless of the numeric score.
  const hardFail =
    raw.is_single_person === false ||
    raw.same_face_across_views === false ||
    raw.has_any_text === true ||
    raw.deformed === true;
  // A missing expression band is a real loss of information (the character's
  // emotional range would be undefined), but not a reason to throw the sheet
  // away — damp the score instead so a banded candidate wins when available.
  if (raw.expression_band_present === false) score = Math.max(0, score - 12);
  return { score, passed: !hardFail && score >= 62, issues, raw };
}

// ---------------------------------------------------------------------------
// 2. Extract the structured face/wardrobe parameters from the real sheet
// ---------------------------------------------------------------------------

/**
 * Derive the identity lock FROM THE GENERATED IMAGE rather than trusting the
 * planner's prose.
 *
 * Rationale: the planner invents a description, but the image model renders
 * whatever it wants. If every downstream prompt repeats the planner's words
 * while the reference image shows something else, the two anchors fight each
 * other. Reading the parameters back off the accepted image makes the text and
 * the picture agree — which is what actually holds a face steady.
 *
 * @param {string} sheetPath local PNG path of the accepted sheet
 * @returns {Promise<object>} structured params (english + chinese strings)
 */
async function extractIdentity(pool, sheetPath) {
  return chatVisionJson(pool, {
    system: VISION_SYSTEM,
    images: [sheetPath],
    text:
      "这是角色的设定表。请**只依据图像中实际可见的正面头像/正面视图**，提取这个人物的固定外貌参数。\n" +
      "要求：描述必须具体、可复现、可被图像模型精确执行；不要使用「精致」「好看」这类主观词；" +
      "不要写场景、光线、背景、情绪。所有字段用英文书写。\n" +
      "特别注意三个字段要拆得足够细：\n" +
      "- hair_structure：必须拆出「长度 + 分缝位置 + 刘海形态 + 卷度/纹理 + 层次（face-framing layers 等）」，不要只写 long hair。\n" +
      "- wardrobe_layers：按穿着层次拆开，内层/外层/下装/鞋履/配饰/面料各写各的；画面里看不到的层次写 none。\n" +
      "- garment_palette：从服装上取 4-5 个十六进制主色。\n\n" +
      "只输出如下 JSON（不要任何解释文字、不要 markdown 代码块）：\n" +
      '{\n' +
      '  "age_range":"e.g. mid-20s",\n' +
      '  "gender":"female",\n' +
      '  "ethnicity":"e.g. East Asian",\n' +
      '  "face_shape":"e.g. oval with soft jawline",\n' +
      '  "eye_shape":"e.g. almond, slightly upturned outer corners, double eyelid",\n' +
      '  "iris_color":"e.g. dark brown",\n' +
      '  "eye_spacing":"e.g. average",\n' +
      '  "eyebrows":"e.g. straight, medium thickness, natural arch",\n' +
      '  "nose":"e.g. straight bridge, small rounded tip",\n' +
      '  "lips":"e.g. medium fullness, defined cupid\'s bow, natural rose colour",\n' +
      '  "jaw_chin":"e.g. soft V-shaped jaw, short chin",\n' +
      '  "skin_tone":"e.g. fair, cool undertone, visible pores",\n' +
      '  "hair_structure":"e.g. long hair reaching mid-back, centre-parted, curtain bangs grazing the brows, loose S-wave perm, layered face-framing ends",\n' +
      '  "hair_color":"e.g. ash brown at the roots fading into warm taupe",\n' +
      '  "physique":"e.g. slim, 168cm, long limbs, narrow shoulders",\n' +
      '  "wardrobe_layers":{\n' +
      '    "inner":"e.g. white cotton camisole slip dress",\n' +
      '    "outer":"e.g. oversized cream knit cardigan with dropped shoulders",\n' +
      '    "bottoms":"e.g. none visible, hem ends mid-thigh",\n' +
      '    "footwear":"e.g. white leather low-top sneakers",\n' +
      '    "accessories":"e.g. thin silver chain necklace, small hoop earrings",\n' +
      '    "materials":"e.g. matte cotton, chunky knit, soft leather"\n' +
      '  },\n' +
      '  "garment_palette":["#F2EDE6","#D8CFC0","#B9AE9C","#8A7F6E"],\n' +
      '  "wardrobe":"把 wardrobe_layers 六个层次串成一句完整英文（保留层次信息）",\n' +
      '  "distinctive_marks":"e.g. small mole below left eye (or none)",\n' +
      '  "identity_lock_en":"一段 60-95 词的英文锁定描述，必须把上面所有字段串成一段连贯、可直接复用的英文，' +
      '以 \'A \' 开头，只描述外貌、发型与服装层次，不含场景、光线、情绪、构图",\n' +
      '  "identity_lock":"上一段的中文对应版本"\n' +
      '}',
  });
}

// ---------------------------------------------------------------------------
// 3. Compare a shot keyframe against the identity references
// ---------------------------------------------------------------------------

const COMPARE_RUBRIC = `请逐项比对，并给出卡点：
- face_shape 脸型与下颌线条
- eye_shape / iris_color / eye_spacing 眼型、瞳色、眼距
- eyebrows 眉形与粗细
- nose 鼻形
- lips 唇形与唇色
- skin_tone 肤色与质感
- hair_style / hair_color 发型与发色
- age_impression 视觉年龄感
只把「真实存在的、肉眼可见的差异」计入 differences；因角度、表情、光线、景别造成的正常差异不要计入。
若两张图中的人明显是不同的人，相同度必须低于 40。`;

/**
 * Compare a candidate keyframe with the identity references.
 *
 * @param {agnes.KeyPool} pool
 * @param {object} o
 * @param {string[]} o.refPaths  local paths of the reference images (authoritative identity)
 * @param {string}   o.candPath  local path of the newly generated keyframe
 * @param {string}   [o.shotInfo] short human-readable shot description for context
 * @returns {Promise<{same_person:boolean, score:number, differences:string[], verdict:string}>}
 */
async function compareIdentity(pool, o) {
  const raw = await chatVisionJson(pool, {
    system: VISION_SYSTEM,
    images: [...o.refPaths, o.candPath],
    maxPx: o.maxPx,
    text:
      `共 ${o.refPaths.length} 张参考图（前面几张）来自同一个角色的官方设定，最后一张是待检查的镜头首帧` +
      (o.shotInfo ? `（镜头信息：${o.shotInfo}）` : "") +
      "。\n\n请判断：最后一张图里的人，是否与前几张参考图中的人是**同一个人**？\n\n" +
      COMPARE_RUBRIC +
      "\n\n另外还要报告画面里的**人物构成**和**文字情况**：" +
      "主角（与参考图比对的那一位）出现了几次；除主角之外还有几个可见的人；" +
      "这些配角是否醒目（占画面比例大、面部可辨认、或处在焦点上）。" +
      "街上远处虚化的行人属于「不醒目」。" +
      "文字方面：只有当文字**能被辨认出具体的字母、单词或汉字**时才算 true，并在 text_content 里原样抄出你看到的字；" +
      "焦外的光斑、糊成一团的霓虹色块、无意义的乱码笔画都算 false。" +
      "\n\n只输出如下 JSON（不要任何解释文字、不要 markdown 代码块）：\n" +
      '{"same_person":true,"score":0,"differences":["用中文逐条描述具体的外貌差异"],' +
      '"protagonist_count":1,"other_people_count":0,"other_people_prominent":false,' +
      '"has_readable_text":false,"text_content":"","verdict":"一句话结论"}',
  });
  const score = Number(raw.score) || 0;
  const differences = Array.isArray(raw.differences) ? raw.differences.filter(Boolean) : [];
  return {
    same_person: raw.same_person === true,
    score,
    differences,
    protagonist_count: Number(raw.protagonist_count) || 0,
    other_people_count: Number(raw.other_people_count) || 0,
    other_people_prominent: raw.other_people_prominent === true,
    // Kept for backward compatibility with the auditKeyframe response shape.
    human_count: (Number(raw.protagonist_count) || 0) + (Number(raw.other_people_count) || 0),
    has_readable_text: raw.has_readable_text === true,
    text_content: String(raw.text_content || ""),
    verdict: String(raw.verdict || ""),
  };
}

// ---------------------------------------------------------------------------
// 4. Validate a derived single-view studio reference
// ---------------------------------------------------------------------------

/**
 * A per-angle studio reference has exactly one job: show ONE person, full
 * length, on a flat backdrop, as a single photograph.
 *
 * This gate exists because of a measured failure mode: when the master sheet
 * (itself a multi-panel layout) is passed as the reference, the model tends to
 * hand back ANOTHER contact sheet — one full body plus inset head close-ups —
 * instead of the single standalone photograph requested. Such a reference then
 * risks reproducing its own layout inside the shot it is meant to inform.
 *
 * Hard failures (any one is enough to reject): not a single person, panel/grid
 * layout, not head-to-toe, any text, or no single figure at all.
 */
async function auditStudioRef(pool, o) {
  const raw = await chatVisionJson(pool, {
    system: VISION_SYSTEM,
    images: [o.candPath],
    maxPx: o.maxPx,
    text:
      `这是一张"${o.angle || "front"}"角度的全身棚拍参考图，用于影视角色一致性。请严格审核。\n\n` +
      "只输出如下 JSON（不要任何解释文字、不要 markdown 代码块）：\n" +
      '{"person_count":1,"is_panel_layout":false,"head_to_toe":true,"feet_visible":true,' +
      '"background_clean":true,"has_any_text":false,"deformed":false,"score":0,' +
      '"issues":["用中文逐条列出具体缺陷，没有就给空数组"]}\n\n' +
      "判定说明：\n" +
      "- person_count：画面中一共有几个清晰可见的人（背景路人也要计）。\n" +
      "- is_panel_layout：是否为多格拼贴/分屏/网格排版/带内嵌小图（哪怕只有一格是全身、旁边还挂了头像特写，也算 true）。\n" +
      "- head_to_toe：同一个人是否完整从头顶到鞋底入画，没有被裁掉。（若画面是多格拼贴，按'否'处理。）\n" +
      "- background_clean：背景是否为干净的纯色影棚背景，无街景、无道具、无建筑。",
  });
  const score = Number(raw.score) || 0;
  const issues = Array.isArray(raw.issues) ? raw.issues.filter(Boolean) : [];
  const personCount = Number(raw.person_count) || 0;
  const hardFail =
    personCount !== 1 ||
    raw.is_panel_layout === true ||
    raw.head_to_toe === false ||
    raw.has_any_text === true ||
    raw.deformed === true;
  return {
    person_count: personCount,
    is_panel_layout: raw.is_panel_layout === true,
    head_to_toe: raw.head_to_toe !== false,
    background_clean: raw.background_clean !== false,
    has_any_text: raw.has_any_text === true,
    // The model's own 0-100 is unreliable here, and the gates above are what
    // actually decide acceptance. Derive a deterministic score so callers that
    // rank attempts still get a meaningful ordering.
    score: hardFail ? Math.min(score, 40) : Math.max(60, 100 - issues.length * 5),
    issues,
    passed: !hardFail,
    raw,
  };
}

// ---------------------------------------------------------------------------
// 5. Generic text QA: read a keyframe and report composition problems
/**
 * Audit a LOCATION anchor.
 *
 * A scene anchor is the visual baseline several shots at the same place are
 * built from, so it is judged on different criteria than a character
 * reference: it must be empty (a face in it would compete with the character
 * references), and its spatial read has to be unambiguous, because if the
 * anchor itself is a jumble of shapes then every shot derived from it inherits
 * the jumble instead of a place.
 *
 * Returns the same shape `assets.makeAuditedImage` measures, so the
 * detect-correct loop can drive it unchanged.
 */
async function auditSceneRef(pool, o) {
  const raw = await chatVisionJson(pool, {
    system: VISION_SYSTEM,
    images: [o.candPath],
    maxPx: o.maxPx,
    text:
      "这是一张影视制作的『场景锚点图』——用来给发生在同一地点的多个镜头做视觉基准。" +
      "请严格审核它是否达到制作标准。\n\n" +
      "评分维度（每项 0-100，最后给出加权总分）：\n" +
      "- emptiness：画面是否完全没有人物。只要出现任何清晰可见的人（含背景路人、镜中人影、入画的手），此项为 0。\n" +
      "- space_clarity：空间结构是否清楚可辨（前/中/后景层次、建筑与陈设的空间关系）。后续镜头要据此复现同一地点，含糊则失分。\n" +
      "- lighting：光源是否明确可见、方向清晰（后续镜头要据此匹配光位与明暗关系）。\n" +
      "- materials：材质与纹理是否真实可辨（墙面、地面、金属、织物等）。\n" +
      "- text_free：画面中是否出现任何文字、字母、水印、logo、招牌、标识。\n" +
      "- photo_quality：是否为一帧写实的电影画面（非插画、非拼贴、非多格排版）。\n\n" +
      "只输出如下 JSON（不要任何解释文字、不要 markdown 代码块）：\n" +
      '{"person_count":0,"has_any_text":false,"deformed":false,"is_panel_layout":false,' +
      '"scores":{"emptiness":0,"space_clarity":0,"lighting":0,"materials":0,"text_free":0,"photo_quality":0},' +
      '"score":0,"issues":["用中文逐条列出具体的缺陷，没有缺陷就给空数组"]}',
  });
  const score = Number(raw.score) || 0;
  const issues = Array.isArray(raw.issues) ? raw.issues.filter(Boolean) : [];
  const personCount = Number(raw.person_count) || 0;
  const hardFail =
    personCount > 0 ||
    raw.has_any_text === true ||
    raw.deformed === true ||
    raw.is_panel_layout === true;
  if (personCount > 0 && !issues.length) {
    issues.push(`场景锚点图里出现了 ${personCount} 个人，锚点图必须是完全无人的空镜。`);
  }
  return {
    person_count: personCount,
    is_panel_layout: raw.is_panel_layout === true,
    head_to_toe: true, // not meaningful for a location; kept for a uniform shape
    score,
    passed: !hardFail && score >= 58,
    issues,
    raw,
  };
}

// ---------------------------------------------------------------------------

/**
 * Sanity-check a keyframe for defects the identity check would not catch:
 * rendered text, a character that is missing/duplicated, or a frame that is
 * actually the reference sheet layout leaking in.
 */
async function auditKeyframe(pool, o) {
  const raw = await chatVisionJson(pool, {
    system: VISION_SYSTEM,
    images: [o.candPath],
    maxPx: o.maxPx,
    text:
      "这是一张电影分镜的首帧。请检查它是否存在以下问题，只输出 JSON：\n" +
      '{"has_text":false,"text_content":"","human_count":1,"anatomy_defects":[],' +
      '"is_blank_or_black":false,"is_collage_or_sheet_layout":false,"composition_note":"一句话"}\n' +
      (o.expectCharacter
        ? "本镜头应当恰好出现 1 个主角人物。\n"
        : "本镜头是空镜，画面中不应该出现人物。\n") +
      "只输出 JSON，不要解释文字，不要 markdown 代码块。",
  });
  return raw;
}

module.exports = {
  chatVision,
  chatVisionJson,
  scoreCharacterSheet,
  extractIdentity,
  compareIdentity,
  auditStudioRef,
  auditSceneRef,
  auditKeyframe,
  SHEET_RUBRIC,
};
