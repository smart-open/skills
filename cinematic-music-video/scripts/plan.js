#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * plan.js — Stage 1: analyse the song + lyrics and produce a cinematic shot list.
 *
 *   1. Probe the real audio duration (the anchor for every later timing decision).
 *   2. Load lyrics (plain text, inline, or LRC with timestamps).
 *   3. Ask agnes-3.0-flash to act as director and return a storyboard JSON.
 *   4. Validate the storyboard; if it is malformed or violates a hard constraint,
 *      send the concrete problems back to the model and retry.
 *   5. Fit the shot list onto the exact song duration (4..12s per shot).
 *   6. Write storyboard.json / storyboard.md and update project.json.
 *
 * Usage:
 *   node plan.js --song "song.mp3" --lyrics "lyrics.lrc" --keys "sk-a,sk-b" \
 *                [--brief "创作要求"] [--style "黑色电影感"] [--aspect 16:9] \
 *                [--shots 28] [--out <dir>] [--max-repairs 3]
 */

const fs = require("fs");
const path = require("path");

const agnes = require("./lib/agnes");
const ff = require("./lib/ffmpeg");
const lyricsLib = require("./lib/lyrics");
const prompts = require("./lib/prompts");
const cli = require("./lib/cli");

const SPEC = {
  "--song": { key: "song", type: "string", alias: ["-s"], desc: "Path to the song file (mp3/wav/m4a/flac)" },
  "--lyrics": { key: "lyrics", type: "string", alias: ["-l"], default: "auto", desc: "Lyrics: file path, inline text, or 'auto' to look for a sidecar .lrc" },
  "--brief": { key: "brief", type: "string", alias: ["-b"], desc: "Creative brief / story direction from the user" },
  "--style": { key: "style", type: "string", desc: "Visual style hint, e.g. '赛博朋克霓虹' / 'Wes Anderson 对称构图'" },
  "--aspect": { key: "aspect", type: "string", default: "16:9", desc: "Aspect ratio: 16:9 | 9:16 | 1:1 | 4:3 | 3:4 | 21:9" },
  "--shots": { key: "shots", type: "int", desc: "Target shot count (default: derived from duration)" },
  "--title": { key: "title", type: "string", desc: "Song title (default: audio filename)" },
  "--artist": { key: "artist", type: "string", desc: "Artist name" },
  "--lang": { key: "lang", type: "string", default: "zh", desc: "Prompt language for image/video prompts: zh | en" },
  "--out": { key: "out", type: "string", alias: ["-o"], desc: "Output project directory" },
  "--max-repairs": { key: "maxRepairs", type: "int", default: 3, desc: "Max planner repair attempts" },
  "--strict-profile": { key: "strictProfile", type: "bool", desc: "Fail unless the character profile covers all seven dimensions (facial features, hair structure, wardrobe layering, expressions, movement, scene affinity; the turnaround is derived)" },
  "--temperature": { key: "temperature", type: "number", default: 0.8, desc: "Planner sampling temperature" },
  ...cli.COMMON_PROJECT,
  ...cli.COMMON_KEYS,
};

const USAGE = `plan.js — Stage 1: lyric analysis + cinematic storyboard planning

${require("util").inspect(SPEC, { depth: 1 })}

Example:
  node plan.js --song "夜曲.mp3" --brief "一段关于城市夜晚重逢的故事" --keys "sk-a,sk-b"`;

const VALID_ASPECTS = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const MOTION_CAMERA = [
  // English roots — matched as substrings so "pulls back", "retreating",
  // "dolly-out", "tracking" all match.
  "dolly", "push", "pull", "pan", "tilt", "track", "crane", "jib", "orbit",
  "handheld", "steadicam", "zoom", "slider", "arc", "truck", "follow", "sweep",
  "retreat", "advance", "glide", "traverse", "recede", "rise", "lower", "drift",
  // Chinese
  "推进", "推近", "拉远", "拉镜", "拉轨", "横移", "平移", "摇", "升", "降", "跟拍", "跟",
  "环绕", "旋转", "手持", "变焦", "移动", "游走", "推轨", "升降", "划过", "推", "拉",
];

const MOTION_SUBJECT = [
  "walk", "run", "turn", "raise", "lower", "lift", "reach", "open", "close", "step",
  "breath", "blink", "sway", "fall", "rise", "look", "smile", "frown", "embrace", "stride",
  "bow", "nod", "gaze", "stream", "flow", "ripple", "shimmer", "flicker", "pulse",
  "走", "跑", "转身", "回头", "抬头", "低头", "伸手", "推开", "呼吸", "眨眼", "摇晃",
  "飘", "扬起", "落下", "升起", "看向", "望向", "微笑", "皱眉", "拥抱", "甩", "翻", "挥", "踏", "倾",
];

function hasAny(text, list) {
  const t = String(text || "").toLowerCase();
  return list.some((k) => t.includes(k.toLowerCase()));
}

/**
 * Words that describe one person physically acting ON another.
 *
 * Image-to-video models handle a single body well and two entangled bodies
 * badly: arms fuse, hands multiply, torsos merge. These beats are far more
 * reliable as an edit than as a single generated shot, so the validator flags
 * them and suggests covering the moment with reaction shots instead.
 */
const INTERACTION_RE =
  /拥抱|抱住|搂|拥入|接吻|亲吻|吻|打斗|扭打|厮打|搏斗|推搡|拉扯|拽|抱起|背起|扛起|牵手|握手|扶起|搀扶|递|交给|接过|hug|embrace|kiss|fight|wrestle|grapple|shove|drag|carry(ing)? (him|her|them)|lift(ing)? (him|her|them)|hold(ing)? hands|hand(ing)? (it|the|him|her|them)/i;

/**
 * Validate the planner's storyboard.
 *
 * Returns { hard, soft }:
 *   hard — structural problems that make the storyboard unusable (missing
 *          required fields, durations outside the API's 4..12s window, wildly
 *          wrong shot count or total duration). These trigger a repair request.
 *   soft — quality nits, chiefly a video prompt that fails to spell out camera /
 *          subject motion. `videos.js` lints and auto-patches these at submit
 *          time, so they are worth at most one repair and must never block the
 *          pipeline: paying four 60-second planner calls to fix a phrase is a
 *          bad trade.
 */
function validateStoryboard(sb, ctx) {
  const hard = [];
  const soft = [];
  if (!sb || typeof sb !== "object") { hard.push("输出不是 JSON 对象"); return { hard, soft }; }

  if (!sb.title) hard.push("缺少 title");
  if (!sb.visual_style || typeof sb.visual_style !== "object") hard.push("缺少 visual_style 对象");
  else if (!Array.isArray(sb.visual_style.color_palette) || sb.visual_style.color_palette.length < 3) {
    hard.push("visual_style.color_palette 必须是至少 3 个十六进制色值的数组");
  }
  // ---- character ----------------------------------------------------------
  // The protagonist's appearance is defined by STRUCTURED, drawable parameters.
  // This object is the sole input to the character reference sheet, so a vague
  // or missing field propagates all the way into a drifting face.
  //
  // Seven dimensions are expected, and they are meant to be settled BEFORE the
  // shot list exists: facial features, hair structure, wardrobe layering,
  // expression range, characteristic movement and scene affinity (the seventh,
  // the turnaround, is produced automatically from these). A missing piece is
  // reported here so the planner gets one repair round; it is only fatal when
  // the caller opted into `strictProfile`, because every one of them has a
  // working default and a dead run is worse than a slightly thinner profile.
  const PARAM_FIELDS = [
    "age_range", "gender", "face_shape", "eye_shape", "iris_color", "eyebrows",
    "lips", "hair_structure", "hair_color", "skin_tone", "physique", "wardrobe",
  ];
  if (!sb.character || typeof sb.character !== "object") {
    hard.push("缺少 character 对象");
  } else {
    const prm = sb.character.params;
    if (!prm || typeof prm !== "object") {
      hard.push(
        "缺少 character.params（结构化五官参数对象）。这是角色设定表的唯一输入，" +
        "必须逐字段提供 age_range / gender / face_shape / eye_shape / iris_color / eyebrows / " +
        "lips / hair_structure / hair_color / skin_tone / physique / wardrobe。"
      );
    } else {
      // Legacy tolerance: an older storyboard that only has the coarse
      // hair_style still passes, but is told to split it out next time.
      if (prm.hair_style && !prm.hair_structure) prm.hair_structure = prm.hair_style;
      const missing = PARAM_FIELDS.filter((f) => !prm[f] || String(prm[f]).trim().length < 3);
      if (missing.length) {
        hard.push(`character.params 缺少或过于简略的字段：${missing.join("、")}（每个字段都必须具体、可画）`);
      }
      const tooLong = PARAM_FIELDS.filter((f) => prm[f] && String(prm[f]).length > 260);
      if (tooLong.length) {
        soft.push(`character.params 以下字段过长（建议每个字段只写一个可画的特征）：${tooLong.join("、")}`);
      }
      // Subjective adjectives cannot be rendered consistently — the model
      // reinterprets them on every call, which is a common cause of drift.
      const VAGUE = /beautiful|pretty|handsome|good-looking|attractive|charming|delicate feature|精致|好看|漂亮|英俊|帅气|气质佳/i;
      const vague = PARAM_FIELDS.filter((f) => prm[f] && VAGUE.test(String(prm[f])));
      if (vague.length) {
        soft.push(
          `character.params 以下字段使用了主观词，模型无法据此稳定作画，建议改为具体形体描述：${vague.join("、")}`
        );
      }

      // ---- the remaining dimensions of the character profile ---------------
      const profileGaps = [];
      const WL_KEYS = ["inner", "outer", "bottoms", "footwear", "accessories", "materials"];
      const wl = prm.wardrobe_layers;
      const wlFilled =
        wl && typeof wl === "object" && !Array.isArray(wl)
          ? WL_KEYS.filter((k) => wl[k] && String(wl[k]).trim().length >= 2)
          : [];
      if (wlFilled.length < 3) {
        profileGaps.push(
          "wardrobe_layers 缺失或过于简略（必须是对象，写清 " + WL_KEYS.join("/") + " 中的至少 3 项）——" +
          "服装要按穿着层次拆开，不能压扁成一句 wardrobe"
        );
      }
      const bank = Array.isArray(prm.expression_bank) ? prm.expression_bank : [];
      const bankOk = bank.filter((e) => {
        if (!e) return false;
        if (typeof e === "string") return e.trim().length >= 3;
        return !!(e.name || e.label) && !!(e.en || e.prompt || e.desc);
      }).length;
      if (bankOk < 4) {
        profileGaps.push(`expression_bank 需要 4 个具名表情（每个含 name 与 en 英文描述），当前有效 ${bankOk} 个`);
      }
      const acts = Array.isArray(prm.signature_actions)
        ? prm.signature_actions.filter((a) => a && String(a).trim().length >= 6)
        : [];
      if (acts.length < 2) {
        profileGaps.push("signature_actions 需要至少 2-3 条具体的标志性动作（写清身体在做什么，不要写情绪）");
      }
      if (!prm.scene_affinity || String(prm.scene_affinity).trim().length < 8) {
        profileGaps.push("scene_affinity 缺失——必须写清这个人适合出现的空间类型、材质与光线");
      }
      if (!Array.isArray(prm.garment_palette) || prm.garment_palette.length < 3) {
        profileGaps.push("garment_palette 建议给 4-5 个十六进制色值作为服装色板");
      }
      if (profileGaps.length) {
        const msg =
          "角色档案未按七个维度定全（三视图/五官/发型结构/服装层次/表情/动作/场景气质）：\n    - " +
          profileGaps.join("\n    - ");
        if (ctx && ctx.strictProfile) hard.push(msg);
        else {
          soft.push(
            msg + "\n    （本次将用默认值兜底继续：缺失的表情与动作不会阻断流水线。）"
          );
        }
      }
    }
    if (!sb.character.identity_lock_en) hard.push("缺少 character.identity_lock_en");
    if (!sb.character.identity_lock) soft.push("缺少 character.identity_lock（中文兜底描述）");
  }
  // ---- scenes (location assets) -------------------------------------------
  // A location that appears in more than one shot has to be an ASSET, not a
  // phrase. Described only in prose, the alley's width, its lamp positions and
  // the colour of its wet stone drift between shots and the audience reads
  // three different alleys. Each declared scene becomes one generated empty
  // anchor frame that every shot at that location references by image.
  const SCENE_FIELDS = ["description", "lighting"];
  const scenes = Array.isArray(sb.scenes) ? sb.scenes.filter(Boolean) : [];
  const sceneIds = new Set();
  scenes.forEach((sc, i) => {
    const id = String((sc && sc.id) || "").trim();
    if (!id) { soft.push(`scenes[${i}] 缺少 id，该场景无法被任何镜头引用`); return; }
    if (sceneIds.has(id)) soft.push(`scenes[] 里 id 重复：${id}`);
    sceneIds.add(id);
    const miss = SCENE_FIELDS.filter((f) => !sc[f] || String(sc[f]).trim().length < 6);
    if (miss.length) {
      soft.push(`场景 ${id} 缺少或过于简略的字段：${miss.join("、")}（空镜锚点图要据此生成，写得太粗锚点就没有信息量）`);
    }
  });
  if (scenes.length > 6) {
    soft.push(
      `scenes[] 定义了 ${scenes.length} 个场景，偏多——每多一个场景就多一张锚点图和一份光照一致性风险，建议压到 2-4 个`
    );
  }
  if (!sb.style_board_prompt) hard.push("缺少 style_board_prompt");
  if (!Array.isArray(sb.shots) || sb.shots.length < 4) {
    hard.push(`shots 必须是非空数组且至少 4 个镜头（当前 ${Array.isArray(sb.shots) ? sb.shots.length : 0}）`);
    return { hard, soft };
  }

  const minShots = Math.ceil(ctx.totalDuration / 12);
  const maxShots = Math.floor(ctx.totalDuration / 4);
  if (sb.shots.length < minShots * 0.6) {
    hard.push(`镜头数太少：${sb.shots.length} 个，${ctx.totalDuration.toFixed(0)} 秒的歌至少需要约 ${minShots} 个镜头（每镜最多 12 秒）`);
  }
  if (sb.shots.length > maxShots * 1.5) {
    hard.push(`镜头数太多：${sb.shots.length} 个，${ctx.totalDuration.toFixed(0)} 秒的歌最多约 ${maxShots} 个镜头（每镜最少 4 秒）`);
  }

  let durSum = 0;
  const outOfRange = [];
  const noCamera = [];
  const noSubject = [];
  const shortPrompt = [];
  const missingFields = [];
  const noView = [];
  const duplicateIdentity = [];
  const noExpression = [];
  const noScene = [];
  const referencedScenes = new Set();
  const interactionRisk = [];
  const badSpeed = [];

  sb.shots.forEach((s, i) => {
    const id = s.id || `#${i + 1}`;
    if (typeof s.duration !== "number" || !(s.duration > 0)) missingFields.push(`${id} 缺少合法 duration`);
    else {
      durSum += s.duration;
      if (s.duration < 3.5 || s.duration > 12.5) outOfRange.push(`${id}=${s.duration}s`);
    }
    if (!s.keyframe_prompt) missingFields.push(`${id} 缺少 keyframe_prompt`);
    if (!s.visual) missingFields.push(`${id} 缺少 visual`);

    // Location anchor: every shot — character or empty — should point at a scene.
    const sid = String(s.scene_id || s.location_id || "").trim();
    if (sid) referencedScenes.add(sid);
    else noScene.push(id);

    const sp = String(s.speed || "").trim().toLowerCase();
    if (sp && !/^(normal|slow|slow.?motion|fast|fast.?motion)$/.test(sp)) {
      badSpeed.push(`${id}=${s.speed}`);
    }

    // Action safety zone. Physical interaction between two people is where
    // image-to-video models fuse limbs together; the fix is to shoot the beat
    // as separate reaction shots rather than as two bodies entangled on screen.
    const peopleCount = Array.isArray(s.characters_in_shot) ? s.characters_in_shot.length : 0;
    if (peopleCount >= 2 &&
        INTERACTION_RE.test(String(s.subject_action || "") + " " + String(s.visual || ""))) {
      interactionRisk.push(id);
    }

    const hasChar = Array.isArray(s.characters_in_shot) && s.characters_in_shot.length > 0;
    if (hasChar) {
      const v = String(s.characters_view || "").toLowerCase();
      if (!v || v === "none") noView.push(id);
      // A close shot is where the face carries the scene, so a missing
      // expression there is worth flagging; in a wide shot it is invisible.
      const size = String(s.shot_size || "").toLowerCase();
      const isClose = /close|macro|portrait/.test(size);
      if (isClose && !String(s.expression || "").trim()) noExpression.push(id);
      // The identity description is injected by the renderer. If the planner
      // also pastes facial features into keyframe_prompt, the two descriptions
      // compete and the face drifts — a real failure mode seen in testing.
      const prm = (sb.character && sb.character.params) || {};
      const probes = [prm.face_shape, prm.eye_shape, prm.hair_structure || prm.hair_style]
        .filter((x) => x && String(x).length > 4);
      if (probes.some((x) => String(s.keyframe_prompt || "").includes(String(x).slice(0, 18)))) {
        duplicateIdentity.push(id);
      }
    }

    if (!s.video_prompt) {
      missingFields.push(`${id} 缺少 video_prompt`);
    } else if (String(s.video_prompt).length < 40) {
      hard.push(`${id} 的 video_prompt 过短（不足 40 字符），无法驱动视频模型`);
    } else {
      // A prompt may legitimately express the camera move in the structured
      // `camera_movement` field instead of repeating it in prose, so treat a
      // present camera_movement field as satisfying the camera requirement.
      const camEvidence = hasAny(s.video_prompt, MOTION_CAMERA) ||
        (s.camera_movement && hasAny(s.camera_movement, MOTION_CAMERA));
      if (!camEvidence) noCamera.push(id);
      const subjEvidence = hasAny(s.video_prompt, MOTION_SUBJECT) ||
        (s.subject_action && !/^(无|none|n\/a|-)$/i.test(String(s.subject_action).trim()));
      if (!subjEvidence) noSubject.push(id);
    }
  });

  if (missingFields.length) hard.push("以下镜头缺少必填字段：" + missingFields.slice(0, 12).join("、"));
  if (outOfRange.length) {
    soft.push(`以下镜头时长超出 4-12 秒的建议区间（时间轴拟合会自动修正）：${outOfRange.slice(0, 12).join("、")}`);
  }
  if (noCamera.length) {
    soft.push(`以下镜头的 video_prompt 没有写明摄影机运动，容易导致画面"不动"：${noCamera.slice(0, 12).join("、")}`);
  }
  if (noSubject.length) {
    soft.push(`以下镜头的 video_prompt 没有写明主体动作，容易导致画面"不动"：${noSubject.slice(0, 12).join("、")}`);
  }
  if (noView.length) {
    soft.push(
      `以下镜头有主角但没有填写 characters_view（朝向），将默认使用正面参考图：${noView.slice(0, 12).join("、")}`
    );
  }
  if (noExpression.length) {
    soft.push(
      `以下近景/特写镜头有主角但没有填写 expression（表情），情绪会缺失、人物显得像道具：` +
      noExpression.slice(0, 12).join("、")
    );
  }
  if (duplicateIdentity.length) {
    soft.push(
      `以下镜头的 keyframe_prompt 里重复抄写了主角五官描述，会与系统注入的身份参数打架、导致换脸：` +
      duplicateIdentity.slice(0, 12).join("、")
    );
  }
  if (badSpeed.length) {
    soft.push(`以下镜头的 speed 取值不在 normal / slow-motion / fast-motion 之内，将被忽略：${badSpeed.slice(0, 12).join("、")}`);
  }

  // ---- location coverage ---------------------------------------------------
  if (!scenes.length) {
    soft.push(
      "分镜未定义 scenes[]（地点资产库）。同一个地点出现在多个镜头里时，各镜头会各自生成场景，" +
      "巷子的宽窄、灯的位置、地面积水的颜色都会变，观众会读成不同的地方。" +
      "建议定义 2-4 个反复出现的地点并用 scene_id 引用。"
    );
  } else {
    const orphan = [...referencedScenes].filter((k) => !sceneIds.has(k));
    if (orphan.length) {
      hard.push(
        `以下 scene_id 在 scenes[] 里找不到定义：${orphan.join("、")}（scene_id 必须引用已定义的场景 id）`
      );
    }
    const unused = [...sceneIds].filter((k) => !referencedScenes.has(k));
    if (unused.length) {
      soft.push(`以下场景已定义但没有任何镜头引用，会白花一张锚点图的成本：${unused.join("、")}`);
    }
    if (noScene.length) {
      soft.push(`以下镜头没有填写 scene_id，不会挂载地点锚点：${noScene.slice(0, 12).join("、")}`);
    }
  }

  if (interactionRisk.length) {
    soft.push(
      `以下镜头是多人同框且含肢体交互动作（拥抱/打斗/递物/牵手等），这是 AI 视频肢体融合与穿模的重灾区：` +
      interactionRisk.slice(0, 12).join("、") +
      "。建议改为「景别切换 + 反应镜头」表达（特写手、特写表情、两手之间的距离），" +
      "或把接触压缩到特写/中近景内完成，不要用远景交代全身交互。"
    );
  }

  const sumDelta = Math.abs(durSum - ctx.totalDuration);
  if (sumDelta > ctx.totalDuration * 0.25) {
    hard.push(
      `镜头时长之和为 ${durSum.toFixed(1)}s，与歌曲总时长 ${ctx.totalDuration.toFixed(1)}s 相差过大（超过 25%）。请重新分配，使之和接近总时长。`
    );
  }
  return { hard, soft };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

/**
 * "3.0–9.0s" for a fitted shot, "-" before the timeline fit has run.
 *
 * `renderMarkdown` is exported and may be called on a draft storyboard, so the
 * fields that only `fitTimeline()` produces must not be assumed to exist.
 */
function spanOf(s) {
  return Number.isFinite(Number(s.start)) && Number.isFinite(Number(s.end))
    ? `${Number(s.start).toFixed(1)}–${Number(s.end).toFixed(1)}s`
    : "-";
}

/** "6.0s", or "-" when the duration is missing. */
function durOf(s) {
  return Number.isFinite(Number(s.duration)) ? `${Number(s.duration).toFixed(1)}s` : "-";
}

function renderMarkdown(sb, meta) {
  const L = [];
  L.push(`# ${sb.title || "未命名 MV"} — 分镜脚本`);
  L.push("");
  if (sb.logline) L.push(`> **故事梗概**：${sb.logline}`);
  L.push("");
  L.push("## 影片设定");
  L.push("");
  L.push("| 项目 | 内容 |");
  L.push("|---|---|");
  L.push(`| 主题 | ${sb.theme || "-"} |`);
  L.push(`| 音乐风格 | ${sb.genre || "-"} |`);
  L.push(`| 情绪弧线 | ${sb.mood_arc || "-"} |`);
  L.push(`| BPM 估算 | ${sb.bpm_estimate || "-"} |`);
  L.push(`| 画幅 | ${meta.aspectRatio || "-"} |`);
  L.push(
    `| 歌曲时长 | ${Number.isFinite(Number(meta.totalDuration)) ? Number(meta.totalDuration).toFixed(1) + " 秒" : "-"} |`
  );
  L.push(`| 镜头数 | ${sb.shots.length} |`);
  L.push("");
  if (sb.visual_style) {
    const v = sb.visual_style;
    L.push("## 视觉风格圣经");
    L.push("");
    L.push("| 项目 | 内容 |");
    L.push("|---|---|");
    L.push(`| 整体影调 | ${v.look || "-"} |`);
    L.push(`| 胶片/质感 | ${v.film_stock || "-"} |`);
    L.push(`| 灯光基调 | ${v.lighting || "-"} |`);
    L.push(`| 镜头语言 | ${v.lens || "-"} |`);
    L.push(`| 调色方向 | ${v.grade || "-"} |`);
    L.push(`| 颗粒 | ${v.grain || "-"} |`);
    L.push("");
    if (Array.isArray(v.color_palette)) {
      L.push("**色彩基调**：" + v.color_palette.map((c) => "`" + c + "`").join(" "));
      L.push("");
    }
  }
  if (sb.character) {
    L.push("## 主角设定（人物一致性的唯一真源）");
    L.push("");
    L.push(`**代号**：${sb.character.name || "-"}`);
    L.push("");
    const prm = sb.character.params || {};
    const LABELS = [
      ["age_range", "年龄感"], ["gender", "性别"], ["ethnicity", "族裔"],
      ["face_shape", "脸型"], ["eye_shape", "眼型"], ["iris_color", "瞳色"], ["eye_spacing", "眼距"],
      ["eyebrows", "眉形"], ["nose", "鼻形"], ["lips", "唇形"], ["jaw_chin", "下颌/下巴"],
      ["skin_tone", "肤色"], ["hair_structure", "发型结构"], ["hair_color", "发色"],
      ["physique", "体型"], ["distinctive_marks", "辨识特征"],
    ];
    const shown = LABELS.filter(([k]) => prm[k] || (k === "hair_structure" && prm.hair_style));
    if (shown.length) {
      L.push("**结构化外貌参数**（角色设定表按此生成；生成后会由视觉模型从真实图片反读并覆盖，确保文字与画面一致）：");
      L.push("");
      L.push("| 字段 | 内容 |");
      L.push("|---|---|");
      shown.forEach(([k, label]) => L.push(`| ${label} | ${prm[k] || prm.hair_style} |`));
      L.push("");
    }
    // ---- the rest of the seven-dimension profile ---------------------------
    const wl = prm.wardrobe_layers;
    if (wl && typeof wl === "object" && !Array.isArray(wl)) {
      const WL_LABEL = {
        inner: "内层", outer: "外层", bottoms: "下装",
        footwear: "鞋履", accessories: "配饰", materials: "面料",
      };
      const filled = Object.keys(WL_LABEL).filter((k) => wl[k]);
      if (filled.length) {
        L.push("**服装层次**（从上到下逐层进入提示词）：");
        L.push("");
        L.push("| 层次 | 内容 |");
        L.push("|---|---|");
        filled.forEach((k) => L.push(`| ${WL_LABEL[k]} | ${wl[k]} |`));
        L.push("");
      }
    }
    if (Array.isArray(prm.garment_palette) && prm.garment_palette.length) {
      L.push("**服装色板**：" + prm.garment_palette.map((c) => "`" + c + "`").join(" "));
      L.push("");
    }
    if (prm.wardrobe) {
      L.push("**服装（成段描述）**（将逐字进入每张含主角的提示词）：");
      L.push("");
      L.push("```");
      L.push(prm.wardrobe);
      L.push("```");
      L.push("");
    }
    if (Array.isArray(prm.expression_bank) && prm.expression_bank.length) {
      L.push("**表情库**（每个含主角的镜头从这几种里选一种，单独注入首帧提示词）：");
      L.push("");
      L.push("| 表情 | 英文执行描述 |");
      L.push("|---|---|");
      prm.expression_bank.forEach((e) => {
        if (!e) return;
        if (typeof e === "string") L.push(`| ${e} | ${e} |`);
        else L.push(`| ${e.name || e.label || "-"} | ${e.en || e.prompt || e.desc || "-"} |`);
      });
      L.push("");
    }
    if (Array.isArray(prm.signature_actions) && prm.signature_actions.length) {
      L.push("**标志性动作**（含主角镜头的 subject_action 优先复用）：");
      L.push("");
      prm.signature_actions.forEach((a) => L.push(`- ${a}`));
      L.push("");
    }
    if (prm.scene_affinity) {
      L.push("**场景气质**（含主角镜头的选景约束）：");
      L.push("");
      L.push("```");
      L.push(prm.scene_affinity);
      L.push("```");
      L.push("");
    }
    if (sb.character.identity_lock_en) {
      L.push("**英文身份锁**（兜底用途；实际以设定表渲染结果为准）：");
      L.push("");
      L.push("```");
      L.push(sb.character.identity_lock_en);
      L.push("```");
      L.push("");
    }
    if (sb.character.persona) L.push(`**气质**：${sb.character.persona}`);
    L.push("");
  }
  if (Array.isArray(sb.scenes) && sb.scenes.length) {
    L.push("## 地点资产库（场景锚点）");
    L.push("");
    L.push(
      "每个地点会先生成一张**无人的空镜锚点图**，再作为参考图喂给发生在该地点的所有镜头 —— " +
      "这是让「同一个地方看起来真的是同一个地方」的工程手段（只靠文字描述，巷子的宽窄与灯的位置会在镜头间漂移）。"
    );
    L.push("");
    L.push("| 场景 id | 名称 | 空间与陈设 | 光位 | 引用镜头 |");
    L.push("|---|---|---|---|---|");
    sb.scenes.forEach((sc) => {
      const key = String((sc && sc.id) || "").trim();
      const usedBy = (sb.shots || [])
        .filter((s) => String(s.scene_id || s.location_id || "").trim() === key)
        .map((s) => s.id);
      L.push(
        `| ${key || "-"} | ${(sc && sc.name) || "-"} | ${(sc && sc.description) || "-"} | ` +
        `${(sc && sc.lighting) || "-"} | ${usedBy.join("、") || "**无镜头引用**"} |`
      );
    });
    L.push("");
  }
  if (Array.isArray(sb.sections) && sb.sections.length) {
    L.push("## 段落结构");
    L.push("");
    L.push("| 段落 | 时长 | 情绪 |");
    L.push("|---|---|---|");
    sb.sections.forEach((s) => L.push(`| ${s.name} | ${s.duration ? s.duration.toFixed(1) + "s" : "-"} | ${s.mood || "-"} |`));
    L.push("");
  }

  L.push("## 镜头表");
  L.push("");
  L.push("| # | 段落 | 时间轴 | 时长 | 请求秒数 | 景别 | 运镜 | 强度 | 画面 |");
  L.push("|---|---|---|---|---|---|---|---|---|");
  sb.shots.forEach((s, i) => {
    L.push(
      `| ${i + 1} | ${s.section || "-"} | ${spanOf(s)} | ${durOf(s)} | ` +
      `${s.api_seconds || "-"} | ${s.shot_size || "-"} | ${s.camera_movement || "-"} | ${s.motion_intensity || "-"} | ${(s.visual || "-").replace(/\|/g, "/")} |`
    );
  });
  L.push("");

  L.push("## 镜头详案");
  L.push("");
  sb.shots.forEach((s, i) => {
    L.push(`### ${i + 1}. ${s.id} — ${s.section || ""} (${spanOf(s)} / ${durOf(s)})`);
    L.push("");
    if (s.lyrics_line) L.push(`- **对应歌词**：${s.lyrics_line}`);
    L.push(`- **画面**：${s.visual || "-"}`);
    L.push(`- **主体动作**：${s.subject_action || "-"}`);
    L.push(`- **运镜**：${s.camera_movement || "-"}`);
    L.push(`- **光线**：${s.lighting || "-"}`);
    L.push(`- **转场进入**：${s.transition_in || "cut"}`);
    L.push(`- **运动强度**：${s.motion_intensity || "-"} / 3`);
    L.push("");
    L.push(`**首帧图提示词（keyframe_prompt）**`);
    L.push("");
    L.push("```text");
    L.push(s.keyframe_prompt || "-");
    L.push("```");
    L.push("");
    L.push(`**视频运动提示词（video_prompt）**`);
    L.push("");
    L.push("```text");
    L.push(s.video_prompt || "-");
    L.push("```");
    L.push("");
  });
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const parse = cli.createParser(SPEC, USAGE);
  const args = parse(process.argv.slice(2));

  if (!args.song) {
    process.stderr.write("ERROR: --song is required\n\n" + USAGE + "\n");
    process.exit(2);
  }
  const songPath = path.resolve(args.song);
  if (!fs.existsSync(songPath)) {
    process.stderr.write("ERROR: song file not found: " + songPath + "\n");
    process.exit(2);
  }
  if (!VALID_ASPECTS.includes(args.aspect)) {
    process.stderr.write(`ERROR: --aspect must be one of ${VALID_ASPECTS.join(", ")}\n`);
    process.exit(2);
  }

  ff.assertFfmpegAvailable();

  // --- audio probe -------------------------------------------------------
  agnes.log("[1/6] Probing audio ...");
  const audio = ff.probeAudio(songPath);
  if (!audio.hasAudio || !audio.duration) {
    throw new Error("Could not determine the song duration from " + songPath + ". Is it a valid audio file?");
  }
  const totalDuration = audio.duration;
  agnes.log(`      duration=${totalDuration.toFixed(2)}s  sampleRate=${audio.sampleRate}Hz  channels=${audio.channels}  codec=${audio.codec}`);

  // --- lyrics ------------------------------------------------------------
  agnes.log("[2/6] Loading lyrics ...");
  const parsedLyrics = lyricsLib.loadLyrics(args.lyrics, songPath);
  agnes.log(
    `      source=${parsedLyrics.source || "(none)"}  lines=${parsedLyrics.lines.length}  timestamps=${parsedLyrics.hasTimestamps}`
  );
  const lyricsText = lyricsLib.lyricsForPlanner(parsedLyrics, { withTimestamps: parsedLyrics.hasTimestamps });

  // --- project dir -------------------------------------------------------
  const projectDir = cli.deriveProjectDir(songPath, args.out || args.project);
  const planDir = cli.stageDir(projectDir, "plan");
  agnes.log(`      project=${projectDir}`);

  // --- 00_source: make the project self-contained ------------------------
  // A storyboard that only records an absolute path to the song is not
  // reproducible: it breaks as soon as the file moves, the drive changes letter
  // or the project is copied to another machine. Copy the inputs into the
  // project and record the path RELATIVE to the project, so every later stage
  // (assemble, verify) can find them without any machine-specific knowledge.
  const sourceDir = cli.stageDir(projectDir, "source");
  const songRel = path.join(cli.STAGE_DIRS.source, path.basename(songPath));
  const songCopy = path.join(projectDir, songRel);
  try {
    const srcSize = fs.statSync(songPath).size;
    if (!fs.existsSync(songCopy) || fs.statSync(songCopy).size !== srcSize) {
      fs.copyFileSync(songPath, songCopy);
      agnes.log(`      copied song -> ${songRel}`);
    }
  } catch (e) {
    throw new Error(`Could not copy the song into the project: ${e.message}`);
  }

  // Same for a lyrics FILE (inline lyrics are already embedded in storyboard.json).
  let lyricsRel = null;
  if (parsedLyrics.source && parsedLyrics.source !== "inline") {
    try {
      if (fs.existsSync(parsedLyrics.source) && fs.statSync(parsedLyrics.source).isFile()) {
        lyricsRel = path.join(cli.STAGE_DIRS.source, path.basename(parsedLyrics.source));
        fs.copyFileSync(parsedLyrics.source, path.join(projectDir, lyricsRel));
      }
    } catch (e) {
      agnes.log(`      note: could not copy the lyrics file (${e.message}) — continuing`);
      lyricsRel = null;
    }
  }

  // --- planner -----------------------------------------------------------
  const songTitle = args.title || path.basename(songPath).replace(/\.[^.]+$/, "");
  const targetShots = args.shots || Math.max(6, Math.round(totalDuration / 7));

  const pool = cli.buildKeyPool(args);
  agnes.log(`[3/6] Planning storyboard with ${agnes.MODEL_CHAT} ...`);
  agnes.log(`      keys=${pool.keys.length} (${agnes.KeyPool.mask(pool.keys[0])}${pool.keys.length > 1 ? ", ..." : ""})  targetShots=${targetShots}`);

  const userPrompt = prompts.buildUserPrompt({
    songTitle,
    artist: args.artist,
    totalDuration,
    lyricsText,
    hasTimestamps: parsedLyrics.hasTimestamps,
    shotCountTarget: targetShots,
    brief: args.brief,
    styleHint: args.style,
    aspectRatio: args.aspect,
    language: args.lang,
  });

  const ctx = { totalDuration, strictProfile: !!args.strictProfile };
  let sb = null;
  let lastRaw = null;
  let problems = [];
  let softRepairs = 0;
  const pendingSoft = [];

  for (let attempt = 0; attempt <= args.maxRepairs; attempt++) {
    const user = attempt === 0 ? userPrompt : prompts.buildRepairPrompt(problems, lastRaw);
    const t0 = Date.now();
    lastRaw = await agnes.chat(pool, {
      system: prompts.SYSTEM,
      user,
      maxTokens: 60000,
      temperature: attempt === 0 ? args.temperature : Math.max(0.35, args.temperature - 0.3),
    });
    agnes.log(`      planner replied in ${((Date.now() - t0) / 1000).toFixed(1)}s (${lastRaw.length} chars)`);

    let candidate;
    try {
      candidate = agnes.extractJson(lastRaw);
    } catch (e) {
      problems = ["输出不是合法 JSON（请只输出一个 JSON 对象，不要用 markdown 代码块包裹）：" + e.message];
      agnes.log(`      attempt ${attempt + 1}: JSON parse failed, repairing ...`);
      if (attempt === args.maxRepairs) {
        throw new Error("Planner never returned valid JSON after " + (args.maxRepairs + 1) + " attempts.");
      }
      continue;
    }

    const { hard, soft } = validateStoryboard(candidate, ctx);

    if (!hard.length && !soft.length) { sb = candidate; break; }

    if (hard.length) {
      agnes.log(`      attempt ${attempt + 1}: ${hard.length} structural problem(s):`);
      hard.slice(0, 6).forEach((p) => agnes.log(`        - ${p}`));
      if (attempt === args.maxRepairs) {
        throw new Error(
          `Planner output failed structural validation after ${args.maxRepairs + 1} attempts. Remaining problems:\n` +
          hard.map((p) => "  - " + p).join("\n")
        );
      }
      problems = hard.concat(soft);
      agnes.log(`      sending repair request ${attempt + 1} ...`);
      continue;
    }

    // Only soft (quality) problems left. Spend at most ONE repair on them —
    // videos.js auto-patches missing motion wording at submit time, so further
    // planner round-trips would just burn minutes for a cosmetic gain.
    pendingSoft.length = 0;
    soft.forEach((p) => pendingSoft.push(p));
    if (softRepairs >= 1) {
      agnes.log(`      accepting storyboard with ${soft.length} soft warning(s) (videos.js will auto-patch motion wording)`);
      sb = candidate;
      break;
    }
    softRepairs++;
    agnes.log(`      attempt ${attempt + 1}: ${soft.length} motion-detail warning(s), spending one repair round:`);
    soft.slice(0, 6).forEach((p) => agnes.log(`        - ${p}`));
    if (attempt === args.maxRepairs) { sb = candidate; break; }
    problems = soft;
    agnes.log(`      sending repair request ${attempt + 1} ...`);
  }

  if (!sb) throw new Error("Planner did not produce a usable storyboard.");
  if (pendingSoft.length && sb) {
    agnes.log("      note: the following motion-detail warnings remain; videos.js will repair them automatically:");
    pendingSoft.slice(0, 8).forEach((p) => agnes.log("        - " + p));
  }

  // --- fit the timeline to the real duration -----------------------------
  agnes.log("[4/6] Fitting shot timeline to the exact song duration ...");
  const idealShots = sb.shots.map((s) => ({ ...s }));
  const fit = lyricsLib.fitTimeline(idealShots, totalDuration, {});
  const shots = fit.shots;
  fit.notes.forEach((n) => agnes.log("      " + n));

  const sum = shots.reduce((a, s) => a + s.duration, 0);
  agnes.log(
    `      ${shots.length} shots, durations ${shots[0].duration.toFixed(1)}-${shots[shots.length - 1].duration.toFixed(1)}s, ` +
    `sum=${sum.toFixed(3)}s (target ${totalDuration.toFixed(3)}s, delta ${(sum - totalDuration).toFixed(4)}s)`
  );

  // Attach LRC-derived lyric text to shots that lack one.
  if (parsedLyrics.hasTimestamps) {
    shots.forEach((s) => {
      if (!s.lyrics_line) {
        const l = lyricsLib.lyricAt(parsedLyrics, s.start + s.duration / 2);
        if (l) s.lyrics_line = l;
      }
    });
  }

  const out = {
    ...sb,
    shots,
    meta: {
      songPath,
      songTitle,
      artist: args.artist || null,
      totalDuration,
      aspectRatio: args.aspect,
      fps: 24,
      lang: args.lang,
      brief: args.brief || null,
      styleHint: args.style || null,
      lyricsSource: parsedLyrics.source,
      hasTimestamps: parsedLyrics.hasTimestamps,
      shotCount: shots.length,
      plannedAt: new Date().toISOString(),
      imageSize: "2K",
      videoSize: "720P",
      plannerModel: agnes.MODEL_CHAT,
    },
  };

  // --- write -------------------------------------------------------------
  agnes.log("[5/6] Writing storyboard ...");
  const sbJson = path.join(planDir, "storyboard.json");
  agnes.writeFileSyncDurable(sbJson, JSON.stringify(out, null, 2));
  const sbMd = path.join(planDir, "storyboard.md");
  agnes.writeFileSyncDurable(sbMd, renderMarkdown(out, out.meta));

  const project = cli.loadProject(projectDir);
  project.dir = projectDir;
  project.config = {
    songRel,
    songPath,
    songOriginal: songPath,
    aspectRatio: args.aspect,
    fps: 24,
    imageSize: "2K",
    lang: args.lang,
    totalDuration,
  };
  project.storyboard = sbJson;
  project.stages = project.stages || {};
  project.stages.plan = { done: true, at: new Date().toISOString(), shots: shots.length };
  cli.saveProject(project);

  // --- summary -----------------------------------------------------------
  agnes.log("[6/6] Done.");
  process.stdout.write("\n" + "=".repeat(78) + "\n");
  process.stdout.write(`MV 分镜规划完成：${out.title}\n`);
  process.stdout.write("=".repeat(78) + "\n");
  process.stdout.write(`故事梗概   : ${out.logline || "-"}\n`);
  process.stdout.write(`主题/风格  : ${out.theme || "-"} / ${out.genre || "-"}\n`);
  process.stdout.write(`歌曲时长   : ${totalDuration.toFixed(2)}s\n`);
  process.stdout.write(`镜头数     : ${shots.length}\n`);
  process.stdout.write(`画幅       : ${args.aspect}\n`);
  process.stdout.write(`主角       : ${(out.character && out.character.name) || "-"}\n`);
  process.stdout.write(`段落结构   : ${(out.sections || []).map((s) => s.name).join(" → ")}\n`);
  process.stdout.write("\n");
  const rows = shots.map((s, i) => [
    i + 1,
    s.id,
    s.section || "-",
    `${s.start.toFixed(1)}-${s.end.toFixed(1)}s`,
    s.duration.toFixed(1) + "s",
    s.api_seconds + "s",
    s.shot_size || "-",
    (s.camera_movement || "-").slice(0, 22),
    s.motion_intensity || "-",
  ]);
  cli.printTable(rows.slice(0, 60), ["#", "ID", "段落", "时间轴", "时长", "请求", "景别", "运镜", "强度"]);
  if (rows.length > 60) process.stdout.write(`... 其余 ${rows.length - 60} 个镜头见 storyboard.md\n`);

  process.stdout.write("\n");
  process.stdout.write(`STORYBOARD_JSON=${sbJson}\n`);
  process.stdout.write(`STORYBOARD_MD=${sbMd}\n`);
  process.stdout.write(`PROJECT_DIR=${projectDir}\n`);
  process.stdout.write(`TOTAL_DURATION=${totalDuration.toFixed(3)}\n`);
  process.stdout.write(`SHOT_COUNT=${shots.length}\n`);
  process.stdout.write("\n下一步：\n");
  process.stdout.write(`  node images.js --project "${projectDir}" --keys "<你的key>"\n`);
  process.exit(0);
}

// Only run the CLI when invoked directly — importing this file (e.g. from the
// offline tests) must not start a planning run.
if (require.main === module) {
  main().catch((e) => {
    process.stderr.write("\nplan.js FAILED: " + (e && e.message ? e.message : e) + "\n");
    process.exit(1);
  });
}

module.exports = { validateStoryboard, renderMarkdown };
