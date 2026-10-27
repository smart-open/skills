#!/usr/bin/env node
// lint-prompts.js — 开跑视频前，静态扫描 storyboard 里的「反向召唤」句型（零依赖，纯 Node 内置模块）
//
// 为什么要有它：2026-10-03 916-S02 实测——关键帧干净、门禁全过，成片中途却变成 3 只手。
// 根因不在画面、不在模型，而在 video_prompt 的**纯文字**：
//   ① 否定枚举（`no extra limb` / `no duplicated hand` / `no second person`）＝ 反向点名；
//   ② 与首帧自相矛盾的躯体锁（首帧就是胸+手，却写“不得出现躯干”）；
//   ③ 给没有脸的镜头写面部锁（无头镜却写“自然的眨眼、唇部微动”）。
// 这三类都能在**烧额度之前**用文本扫描抓出来。本工具就是那道闸门（SOP §4.9 / HARDENING 坑位 70）。
//
// 用法：
//   node assets/lint-prompts.js --project "./mv-夜曲"            # 全量扫描
//   node assets/lint-prompts.js --project "./mv-夜曲" --ids S02,S07
//   node assets/lint-prompts.js --file ./x/storyboard.json
//   node assets/lint-prompts.js --project "./mv-夜曲" --json     # 机器可读
//   node assets/lint-prompts.js --project "./mv-夜曲" --strict   # WARN 也当失败（CI 用）
//
// 退出码：0 = 无 ERROR（--strict 下无 WARN）；1 = 有需处理项。可直接接进流水线当门禁。
//
// 判定分级：
//   ERROR  明确的反向召唤句型，必须改（否定枚举 ≥2、已知坏短语、无脸镜面部锁）
//   WARN   疑似矛盾/风险，需人眼确认（单条否定、与首帧可能打架的躯体锁、召唤新物件）
//   OK     干净
//
// 修法见 SOP §4.9：把否定全部换成正向「数量锁 + 单动作 + 同景别锁」。

const fs = require("fs");
const path = require("path");

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const getArg = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const hasFlag = (name) => argv.includes(name);

const PROJECT = getArg("--project");
const FILE = getArg("--file");
const IDS = (getArg("--ids") || "").split(",").map((s) => s.trim()).filter(Boolean);
const AS_JSON = hasFlag("--json");
const STRICT = hasFlag("--strict");

if (!PROJECT && !FILE && !hasFlag("--selftest")) {
  console.error("用法: node lint-prompts.js --project <dir> | --file <storyboard.json> [--ids S02,S07] [--json] [--strict]");
  console.error("      node lint-prompts.js --selftest    # 内置自检（合成样本，无需项目）");
  process.exit(2);
}

// --selftest 不需要故事板；其余模式必须能定位到文件
const SELFTEST = hasFlag("--selftest");
const SB_PATH = SELFTEST ? "" : (FILE || path.join(PROJECT, "01_plan", "storyboard.json"));
if (!SELFTEST && !fs.existsSync(SB_PATH)) {
  console.error(`找不到故事板: ${SB_PATH}`);
  process.exit(2);
}

// ---------- 词表 ----------
// 已知坏短语：写在提示词里 = 直接反向点名（SOP §3.16 / §3.28 / §4.9）
const KNOWN_BAD = [
  "no extra limb", "no extra limbs", "no duplicated hand", "no duplicated hands",
  "no duplicate hand", "no third hand", "no extra hand", "no extra arm", "no extra arms",
  "no second person", "no other person", "no other people", "no additional person",
  "no extra person", "no second woman", "no second girl",
  "no extra object", "no extra objects", "no additional object",
];

// 躯体/人物部位的否定：单条 WARN；与首帧同部位并现 → 可能自相矛盾
const BODY_PARTS = ["face", "head", "torso", "body", "arm", "arms", "hand", "hands",
  "leg", "legs", "eye", "eyes", "shoulder", "shoulders", "chest", "neck", "bust"];

// 面部/表演锁关键词（无脸镜写了它们 = 召唤头部回画）
const FACE_LOCK = ["blink", "blinking", "micro-expression", "micro-expressions",
  "lip", "lips", "mouth", "gaze", "eyelash", "eyelashes", "wink", "winks",
  "subtle expression", "facial expression", "expression flickers", "subtle micro-expressions"];

// 关键帧里出现这些 = 该镜「有脸」
const FACE_PRESENT = ["face", "eyes", "eye", "head", "cheek", "cheeks", "brow", "brows",
  "lip", "lips", "mouth", "smile", "gaze", "portrait", "jaw", "nose", "forehead", "chin"];

// 良性否定白名单：这些是**通用样板**（防串字 / 画质护栏），保留它们是对的，
// 不算"反向召唤具体实体"。从枚举计数里剔除，避免每次全片扫描都报一屏噪声。
// ⚠️ 注意：这里**绝不能**放肢体/人物/物件类名词（extra fingers / second person… 那些是真风险）。
const BENIGN_NEG = new Set([
  "text", "watermark", "watermarks", "logo", "logos", "subtitle", "subtitles",
  "caption", "captions", "signature", "signatures", "letters", "words", "calligraphy",
  "glyph", "glyphs", "border", "borders", "frame", "frames", "cropping", "crop",
  "distortion", "distortions", "warping", "warp", "deformation", "artifacts", "artifact",
  "robotic", "repetitive", "stiff", "jittery", "jitter", "flicker", "flickering",
  "morphing", "morph", "twitching", "glitching", "blur", "noise", "grain",
  // 年代/风格护栏：几乎每镜都有，属正常美术基调，不是"召唤具体实体"
  "modern", "modernity", "contemporary", "anachronism", "anachronistic", "anachronisms",
]);

// 局部肢体词：关键帧只画这些、且无脸 → 该镜「头部不在画内」，面部锁是错的
const BODY_PART_WORDS = ["hand", "hands", "finger", "fingers", "fingertip", "fingertips",
  "wrist", "wrists", "palm", "palms", "arm", "arms", "forearm", "forearms",
  "neck", "shoulder", "shoulders", "foot", "feet", "leg", "legs"];

// 连接词/冠词/标记词：切断名词短语的延伸
// （"no torso and no eyes" 不该连成一个短语；"NO TEXT LOCK:" 里的 LOCK 是锁标题，要切断）
const STOP = new Set(["and", "or", "no", "nor", "the", "a", "an", "with", "without",
  "any", "all", "of", "to", "in", "on", "at", "is", "are", "be", "being", "that", "this",
  "lock", "locks", "guard", "rule"]);

// ---------- 扫描逻辑 ----------
// 是否把某个具体名词否定掉了（no <part/object>）；`raw` 供展示，过滤用 `risky`
function negatedNounsIn(text, filterBenign) {
  const hits = [];
  const re = /\bno\s+([a-z][a-z\-]*)((?:\s+[a-z][a-z\-]*){0,2})/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const words = [m[1], ...m[2].trim().split(/\s+/).filter(Boolean)];
    const kept = [];
    for (const w of words) {
      if (STOP.has(w.toLowerCase())) break; // 大小写归一后再判停词
      kept.push(w);
    }
    if (!kept.length) continue;
    const phrase = kept.join(" ");
    if (filterBenign && kept.every((w) => BENIGN_NEG.has(w.toLowerCase()))) continue;
    hits.push(phrase);
  }
  return hits;
}

// 词表匹配：含空格/连字符的短语用子串匹配；单个词用**词边界**（否则 warmly 里的 arm、
// machine 里的 chin 会误命中——这类子串误报会直接毁掉工具的信噪比）。
function containsAny(text, list) {
  const low = text.toLowerCase();
  const hit = [];
  for (const w of list) {
    if (/[\s\-]/.test(w)) {
      if (low.includes(w)) hit.push(w);
    } else {
      const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${esc}\\b`, "i").test(low)) hit.push(w);
    }
  }
  return hit;
}

// 某一镜的字段集合
function shotText(s) {
  return {
    keyframe: String(s.keyframe_prompt || ""),
    video: String(s.video_prompt || ""),
    action: String(s.subject_action || ""),
    lighting: String(s.lighting || ""),
  };
}

function lintShot(s) {
  const t = shotText(s);
  const v = (t.video + " " + t.action).trim();
  const kf = t.keyframe;
  const vLow = v.toLowerCase();
  const kLow = kf.toLowerCase();
  const findings = [];
  // 人物镜 vs 空镜：判定严重度不同（空镜的场景护栏风险低得多，见坑位 67）
  const charsN = Array.isArray(s.characters_in_shot) ? s.characters_in_shot.length : 0;
  const kfSubject = kf.slice(0, 75); // 关键帧的"构图主语"段

  const add = (level, code, msg) => findings.push({ level, code, msg });

  // --- 0. 首帧景别 vs 动作（坑位 80） ---
  // 位移型动作要求画面装得下全身。若 shot_size 是近景档，视频模型为了容纳动作
  // 会推远镜头并"凭空补画"新的身体与空间 —— 实测会把主角复制成两个人，
  // 且**视频阶段无法修复**（没有参考图张数可减，16:9 裁窄又必丢头脚）。
  // 所以必须在开跑视频之前拦住。
  // 只收「位移」动词。"转身"这类原地动作不算 —— S17（medium + 缓慢转身）实测单人通过，
  // 把它算进来会造成误报（本项目真实数据校验，见坑位 80）。
  const MOVING_ACTION = ["走过", "走向", "走两步", "迈步", "前行", "向前走",
    "跑", "奔", "跳"];
  const actForMove = (t.action + " " + t.video).toLowerCase();
  // 只有这三档装不下位移动作；medium wide 及以上给模型的留白才够用。
  // 注意 "medium wide" 归一化后是 "medium wide"，不会被 ^medium$ 命中。
  const sizeNorm = String(s.shot_size || "").toLowerCase()
    .replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  const tooCloseForMove = /^(close ?up|medium close ?up|mcu|medium)$/.test(sizeNorm);
  if (charsN > 0 && tooCloseForMove) {
    const hitMove = MOVING_ACTION.filter((w) => actForMove.includes(w.toLowerCase()));
    if (hitMove.length) {
      add("ERROR", "MOVE_IN_CLOSEUP",
        `景别 "${s.shot_size}" 装不下位移动作（${hitMove.join("/")}）—— 视频模型会推远镜头` +
        `并复制主角（坑位 80，视频阶段不可修）。请把景别拉到 medium wide / wide，` +
        `或把动作改成原地型（静立、侧首、抬手）。`);
    }
  }

  // --- 1. 否定枚举（video_prompt / subject_action 里） ---
  // risky = 剔除了通用样板（no text / no watermark …）之后的"真风险名词否定"
  const negNouns = negatedNounsIn(v, true);
  const benignCount = negatedNounsIn(v, false).length - negNouns.length;
  const badPhrases = containsAny(v, KNOWN_BAD);

  if (badPhrases.length) {
    add("ERROR", "NEG_KNOWN",
      `命中已知坏短语（反向点名）: ${badPhrases.map((x) => `"${x}"`).join(", ")}`);
  }
  const enumList = [...new Set(negNouns)].map((x) => `no ${x}`).join(", ");
  if (negNouns.length >= 2) {
    if (charsN === 0) {
      // 空镜的场景/年代护栏（no neon signs / no smartphones…）：风险低于人物镜，
      // 且常是必要的（坑位 67：空镜斗不过先验）。报 WARN，别吓人。
      add("WARN", "NEG_ENUM_EMPTY",
        `空镜枚举否定 ${negNouns.length} 个: ${enumList} —— 低风险场景护栏；若反复召唤到该物件再改正向替换描述`);
    } else {
      add("ERROR", "NEG_ENUM",
        `否定枚举 ≥2 个具体名词（枚举否定=反向召唤）: ${enumList}`);
    }
  } else if (negNouns.length === 1 && charsN > 0) {
    // 空镜的单条否定（no human / no glow）是正常的空镜锁，不报
    add("WARN", "NEG_SINGLE",
      `单条名词否定："no ${negNouns[0]}" —— 若非必要，改成正向表述`);
  }
  // 非"no"式否定词（never/avoid/without…）密集出现，同样危险。
  // 但下面两类是**正向表述/画质护栏**，不算反向召唤：
  //   ① "never + 运动/稳定动词"（never reverses / never leaves the frame）
  //   ② "never stiff / never frozen / never mannequin-like"（防僵硬的画质护栏，几乎每镜都有）
  //   "avoid" 多为"躲开某物"的动作词（ducks to avoid the low ceiling），一并排除。
  const NEVER_OK = "reverses?|changes?|stops?|wavers?|trembles?|halts?|falters?|breaks?|" +
    "leaves?|departs?|exits?|disappears?|vanishes?|ceases?|ends?|crosses?|" +
    "stiff|frozen|static|lifeless|rigid|robotic|repetitive|mannequin(?:\\-like)?";
  const neverBad = (v.match(new RegExp(`\\bnever\\s+(?!(?:${NEVER_OK})\\b)`, "gi")) || []).length;
  const hardNeg = neverBad +
    (v.match(/\b(without|free of|free from|zero)\b/gi) || []).length +
    (v.match(/\bnot\s+(?:show|include|have|contain)\b/gi) || []).length;
  if (negNouns.length === 0 && hardNeg >= 3) {
    add("WARN", "NEG_DENSE",
      `非"no"式否定词密集出现 ${hardNeg} 次（never/avoid/without…，同易触发反向召唤）`);
  }
  if (benignCount > 0 && negNouns.length === 0 && hardNeg < 3) {
    add("OK", "NEG_BENIGN", `仅有通用样板否定 ${benignCount} 处（no text/watermark…），属正常`);
  }

  // --- 2. 躯体锁与首帧可能矛盾 ---
  // 若 video_prompt 否定了某部位，而该部位恰在关键帧里存在 → 提示词与自己的输入打架
  const negBody = negNouns.filter((n) => BODY_PARTS.includes(n));
  const kfHasBody = containsAny(kf, BODY_PARTS);
  const contradictions = negBody.filter((p) => kfHasBody.includes(p));
  if (contradictions.length) {
    add("ERROR", "BODY_CONTRADICTION",
      `"no ${contradictions.join(" / no ")}" 与首帧矛盾：关键帧里画了这些部位，提示词却禁止（i2v 只能"各执行一半"）`);
  } else if (negNouns.length <= 1) {
    // 多条枚举时已由 NEG_ENUM 覆盖，不再逐条刷 WARN
    for (const part of negBody) {
      add("WARN", "BODY_NEG",
        `否定躯干部位 "no ${part}" —— 建议改成正向"与首帧同景别"锁`);
    }
  }
  // 出现「LOCK 断言全程不得出现 X」，而镜头里明明有人 → 高风险
  if (/\b(no|never)\b[^.]{0,30}\b(torso|body|head|face)\b[^.]{0,20}\b(throughout|the whole|entire|any frame|at any)/i.test(v)) {
    add("WARN", "BODY_ASSERT",
      `存在"全程不得出现某部位"的断言锁，且本镜有人物——极易与首帧冲突`);
  }

  // --- 3. 无脸镜写了面部/表演锁 ---
  const faceLocks = containsAny(v, FACE_LOCK);
  const kfHasFace = containsAny(kf, FACE_PRESENT);
  if (faceLocks.length && !kfHasFace.length) {
    // 只在关键帧**开头**找肢体词——判断"肢体是不是主语"。
    // 用 75 字窗口：真正的肢体镜（"close-up of female hands…"/"close-up of a woman's neck and
    // shoulders…"）肢体词落在前 30 字内；而"…cloth over her shoulders"/"…hand mirror"这类
    // 肢体词是宾语/复合词，落在 75 字之外，从而不误判。
    const kfBodyOnly = containsAny(kfSubject, BODY_PART_WORDS).length > 0;
    const size = String(s.shot_size || "").toLowerCase();
    const tight = /close-?up|macro|extreme/.test(size);
    const lockList = faceLocks.map((x) => `"${x}"`).join(", ");
    if (charsN === 0) {
      add("ERROR", "FACE_LOCK_NO_PERSON",
        `本镜无人物（characters_in_shot 为空），却写了面部/表演锁: ${lockList}（= 召唤人物/头部入画）`);
    } else if (kfBodyOnly) {
      add("ERROR", "FACE_LOCK_BODY_ONLY",
        `本镜是"局部肢体"构图（关键帧只有手/颈肩等，无脸），却写了面部/表演锁: ${lockList}（= 召唤头部回画，同 S02）`);
    } else if (tight) {
      add("WARN", "FACE_LOCK_REVIEW",
        `紧景别（${size}）却未在关键帧提脸部，但有面部/表演锁: ${lockList}——确认该镜头部是否在画内`);
    }
    // 宽/中景且未点名脸部：人物整体在画内，通用表演锁属正常，不报。
  }

  // --- 4. 正向数量锁的自检（肢体是**主语**时才建议加） ---
  // 只在关键帧主语段（前 75 字）看手/臂，避免服装块里的 arm/shoulder 造成满屏噪声
  const HAND_WORDS = ["hand", "hands", "arm", "arms", "palm", "palms", "finger", "fingers", "wrist", "wrists"];
  const kfHasHands = containsAny(kfSubject, HAND_WORDS).length > 0;
  const hasCountLock = /\bexactly\s+(two|3|three|four|one)\b/i.test(v) ||
    /\b(one left hand and one right hand)\b/i.test(vLow);
  if (kfHasHands && !hasCountLock) {
    add("WARN", "NO_COUNT_LOCK",
      `首帧含手/臂，但 video_prompt 没有正向数量锁（建议加 "EXACTLY TWO HANDS … in every single frame"）`);
  } else if (kfHasHands && hasCountLock) {
    add("OK", "COUNT_LOCK", `已含正向数量锁 ✔`);
  }

  // --- 5. 疑似"召唤新物件"：video_prompt 提到的实体在关键帧里找不到 ---
  // 只做保守提示：video 里出现 "appears/enters/reveals a <noun>" 之类新增动作词
  const summon = v.match(/\b(?:a|an|the)\s+([a-z][a-z\-]+)\s+(?:appears|enters|slides into|comes into view|is revealed)/gi);
  if (summon) {
    add("WARN", "NEW_OBJECT",
      `句中出现"新实体入画"表述: ${summon.slice(0, 3).map((x) => `"${x.trim()}"`).join(", ")}——确认关键帧里本来就有`);
  }

  if (!findings.some((f) => f.level !== "OK")) {
    add("OK", "CLEAN", "未发现反向召唤句型");
  }

  return findings;
}

// ---------- 内置自检（合成样本，零外部依赖；node lint-prompts.js --selftest） ----------
function runSelfTest() {
  let pass = 0;
  let fail = 0;
  const codesOf = (shot) => lintShot(shot).map((f) => f.code);
  const errCodesOf = (shot) => lintShot(shot).filter((f) => f.level === "ERROR").map((f) => f.code);

  const check = (name, cond, detail) => {
    if (cond) { pass++; console.log(`PASS  ${name}`); }
    else { fail++; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
  };

  // ① 坏样本（S02 修前）：否定枚举 + 已知坏短语 + 局部肢体镜的面部锁 —— 全都要被抓住
  const bad = {
    id: "T01", characters_in_shot: ["女主"], shot_size: "macro close-up",
    keyframe_prompt: "macro close-up of elegant manicured female hands resting on a dark wooden table",
    video_prompt: "NO EXTRA LIMB, no duplicated hand, no second person enters the frame; " +
      "she blinks slowly, a subtle micro-expression crosses her lip. no face, no eyes, no head, no torso.",
    subject_action: "her hands slowly separate",
  };
  check("① 抓到已知坏短语", codesOf(bad).includes("NEG_KNOWN"));
  check("① 抓到否定枚举", codesOf(bad).includes("NEG_ENUM"));
  check("① 抓到局部肢体镜的面部锁", codesOf(bad).includes("FACE_LOCK_BODY_ONLY"));

  // ② 修好的样本：正向数量锁 + 单动作 —— 应零 ERROR
  const fixed = {
    id: "T02", characters_in_shot: ["女主"], shot_size: "macro close-up",
    keyframe_prompt: "macro close-up of elegant manicured female hands resting on a dark wooden table",
    video_prompt: "EXACTLY TWO HANDS — one left hand and one right hand. The same two hands are " +
      "present in every single frame from the first frame to the last. The shot holds the same close " +
      "scale and the same amount of her body as the first frame, a single unhurried separation that never reverses.",
    subject_action: "her hands slowly separate",
  };
  check("② 修好后零 ERROR", errCodesOf(fixed).length === 0, JSON.stringify(errCodesOf(fixed)));

  // ③ 空镜 + 通用样板否定（no text/watermark）—— 白名单过滤，不该报 ERROR
  const benign = {
    id: "T03", characters_in_shot: [], shot_size: "extreme wide",
    keyframe_prompt: "extreme wide shot of an empty curtained cabin at night, amber lantern glow",
    video_prompt: "slow drifting camera, no text, no watermark, no logo, no subtitle, no caption.",
    subject_action: "",
  };
  check("③ 通用样板否定被白名单过滤（空镜零 ERROR）", errCodesOf(benign).length === 0, JSON.stringify(errCodesOf(benign)));

  // ④ 词边界 & 画质护栏：warmly 里的 arm、"over her shoulders"、never stiff/frozen 都不能误报
  const trap = {
    id: "T04", characters_in_shot: ["女主"], shot_size: "medium",
    keyframe_prompt: "medium shot of a woman in a black cheongsam standing in a warmly lit room, " +
      "pulling a wet dark cloth over her shoulders",
    video_prompt: "steady natural weight shifts; never stiff, never frozen, never mannequin-like. " +
      "She blinks slowly and her gaze drifts to the floor.",
    subject_action: "",
  };
  check("④ 词边界/护栏不误报（零 ERROR）", errCodesOf(trap).length === 0, JSON.stringify(errCodesOf(trap)));

  // ⑤ 无人物镜写了面部锁 —— 必须报 FACE_LOCK_NO_PERSON
  const noPerson = {
    id: "T05", characters_in_shot: [], shot_size: "close-up",
    keyframe_prompt: "high angle close-up of a dark porcelain bowl on wet cobblestones",
    video_prompt: "the bowl trembles; she blinks slowly, subtle micro-expressions flicker.",
    subject_action: "",
  };
  check("⑤ 无人物镜的面部锁被抓到", codesOf(noPerson).includes("FACE_LOCK_NO_PERSON"));

  // ⑥ 与首帧矛盾的躯体锁（首帧就是胸+手，却写 no torso）—— 报 BODY_CONTRADICTION
  const contra = {
    id: "T06", characters_in_shot: ["女主"], shot_size: "medium",
    keyframe_prompt: "medium shot of a woman's torso in a black cheongsam, her hand resting on a rail",
    video_prompt: "steady hold; no torso is visible at any moment throughout the shot.",
    subject_action: "",
  };
  check("⑥ 与首帧矛盾的躯体锁被抓到", codesOf(contra).includes("BODY_CONTRADICTION"));

  console.log(`\n--- selftest: ${pass} PASS / ${fail} FAIL ---`);
  process.exit(fail ? 1 : 0);
}

// 自检分发放在所有词表 const 初始化之后（避免 TDZ）
if (hasFlag("--selftest")) runSelfTest();

// ---------- 主流程 ----------
const sb = JSON.parse(fs.readFileSync(SB_PATH, "utf8"));
const shots = sb.shots || sb;
const targets = IDS.length ? shots.filter((s) => IDS.includes(s.id)) : shots;

if (IDS.length && targets.length !== IDS.length) {
  const found = new Set(targets.map((s) => s.id));
  const missing = IDS.filter((x) => !found.has(x));
  console.error(`⚠️ 未找到镜号: ${missing.join(", ")}`);
}

const report = [];
let nErr = 0;
let nWarn = 0;
for (const s of targets) {
  const f = lintShot(s);
  const errs = f.filter((x) => x.level === "ERROR");
  const warns = f.filter((x) => x.level === "WARN");
  nErr += errs.length;
  nWarn += warns.length;
  report.push({ id: s.id, findings: f });
}

if (AS_JSON) {
  console.log(JSON.stringify({
    storyboard: SB_PATH,
    shots: targets.length,
    errors: nErr,
    warnings: nWarn,
    report,
  }, null, 2));
} else {
  const ICON = { ERROR: "❌", WARN: "⚠️ ", OK: "✔ " };
  console.log(`\n=== lint-prompts: ${path.basename(path.dirname(path.dirname(SB_PATH)))} (${targets.length} 镜) ===\n`);
  for (const r of report) {
    const bad = r.findings.filter((x) => x.level !== "OK");
    if (!bad.length) continue; // 干净的镜不刷屏
    console.log(`${r.id}`);
    for (const f of r.findings) {
      if (f.level === "OK") continue;
      console.log(`  ${ICON[f.level]} [${f.code}] ${f.msg}`);
    }
    console.log("");
  }
  const clean = targets.length - report.filter((r) => r.findings.some((x) => x.level !== "OK")).length;
  console.log(`--- 汇总: ${targets.length} 镜，干净 ${clean}，ERROR ${nErr}，WARN ${nWarn} ---`);
  if (nErr === 0 && nWarn === 0) {
    console.log("✅ 全部通过：未发现反向召唤句型。");
  } else if (nErr === 0) {
    console.log("⚠️ 无 ERROR，但有 WARN 需人眼确认。");
  } else {
    console.log("❌ 存在 ERROR：开跑前先按 SOP §4.9 改成「正向数量锁 + 单动作 + 同景别锁」。");
  }
}

const failed = STRICT ? (nErr + nWarn) > 0 : nErr > 0;
process.exit(failed ? 1 : 0);
