/**
 * Prompt 模板库（一致性保障核心 + 电影级质感指令）
 *
 * 适配 Kling Video 3.0 Turbo 图生视频（单首帧参考）：
 *  - 可灵视频仅支持【单张首帧图】参考，因此一致性锚点改为「以首帧画面为唯一视觉基准」。
 *  - 全片所有分镜共用同一张首帧合成图（演员 + 舞台），实现人物/场景跨镜锁定。
 *
 * 铁律：
 *  - CONSISTENCY_ANCHOR 必须在每个分镜视频 prompt 开头【逐字复制】，不得省略或改写。
 *  - VOICE_PROFILE 默认值一旦确定，全片不得更换。
 */

"use strict";

/** 一致性锚点段（基础部分，每镜逐字复制）。首帧 = 全片唯一视觉基准（演员+舞台合成图） */
const ANCHOR_BASE =
  "以首帧画面为全片唯一视觉基准：演员的脸型五官、发型发色、妆容、服装、配饰、体型，" +
  "以及舞台场景、灯光色调、观众席布局、麦克风位置、道具陈设，都必须与首帧画面保持完全一致，" +
  "不得有任何改变，不要换脸、不要换衣服、不要改变发型、不要出现多余人物。" +
  "演员全程站在首帧中立式麦克风正后方的固定位置，双脚自始至终钉在同一位置：" +
  "不走位、不踱步、不左右移动、不前后走动，仅手部、手臂、躯干姿态和头部做表演动作。" +
  "画面中只能出现一支黑色立式麦克风（带麦架）；演员双手默认空手表演，不手持麦克风，" +
  "不得出现手持麦克风、第二支麦克风或多余话筒。";

/** 道具白名单预设：--prop 可传预设名或自由文本描述 */
const PROP_PRESETS = {
  thermos:
    "一只哑光黑色保温杯（深色金属质感、带吸管杯盖）",
  coffee:
    "一只白色陶瓷咖啡杯（带杯碟）",
  none: "",
};

/** 把 --prop 的值（预设名或自由文本）解析为道具描述字符串；空值返回 "" */
function resolveProp(propKey) {
  if (!propKey) return "";
  const k = String(propKey).trim();
  if (!k || k === "none" || k === "无") return "";
  return Object.prototype.hasOwnProperty.call(PROP_PRESETS, k) ? PROP_PRESETS[k] : k;
}

/**
 * [feature: 段子特定道具白名单] 生成道具锚点段。
 * 无道具时：明确禁止任何额外道具，保证画面干净；
 * 有道具时：锁定"小茶几 + 唯一一件指定道具"，允许演员短暂拿起/放下。
 */
function propAnchor(propDesc) {
  if (!propDesc) {
    return (
      "画面中除这支立式麦克风外，舞台保持完全干净——绝对不要出现任何小茶几、小桌子、椅子、台阶、栏杆、装饰物、盆栽、杯子、书本、手机、食品、瓶子或任何手持物品；" +
      "演员全程双手空手做手势，画面内只有立式麦克风、演员、舞台、灯光与观众席。"
    );
  }
  return (
    "舞台上固定陈设：演员身侧（通常靠近身体一侧前景）有一只小型圆形或方形小茶几（或类似矮台），" +
    `茶几上自始至终放着${propDesc}，与立式麦克风并列为画面中唯一两件视觉道具，` +
    "演员可以短暂拿起、放下它，但任何时候不得出现第二件同类物品、不得出现其他道具，" +
    "它未在演员手中时必须仍然停在小茶几上不动；镜头不允许出现食品、食物、植物盆栽。"
  );
}

/** 完整一致性锚点 = 基础段 + 道具段（每镜逐字复制） */
function consistencyAnchor(propDesc = "") {
  return ANCHOR_BASE + propAnchor(propDesc);
}

/** 向后兼容：无道具版本的锚点段 */
const CONSISTENCY_ANCHOR = consistencyAnchor("");

/** 默认音色描述（VOICE_PROFILE），可通过 --voice-desc 覆盖 */
const DEFAULT_VOICE_PROFILE =
  "一位30岁男性脱口秀演员的声音，中音区，略带沙哑，语速中等偏快，标准普通话，" +
  "语气自信幽默，有脱口秀表演的节奏感、停顿和重音";

/** 默认演员描述（未提供演员图时自动生成"现代都市美女模特"），可通过 --actor-desc 覆盖 */
const DEFAULT_ACTOR_DESC =
  "现代都市美女模特，25岁左右，气质时尚优雅，长发，五官立体精致，妆容精致，" +
  "穿着黑色西装外套白色内搭，自信从容的微笑，纯深灰色背景半身照，均匀柔光，专业摄影，高清，无文字无水印";

/** 默认演员（女性）配套音色：与自动生成的美女模特声画性别匹配 */
const DEFAULT_ACTOR_VOICE =
  "一位28岁女性脱口秀演员的声音，音色清亮，中音区，语速中等偏快，标准普通话，" +
  "语气自信幽默，有脱口秀表演的节奏感、停顿和重音";

/** 默认舞台描述（--stage-desc 可覆盖）：电影感脱口秀剧场（暖钨丝光 + 吸光幕布强明暗对比 + 体积光） */
const DEFAULT_STAGE_DESC =
  "小型脱口秀剧场的舞台，暖钨丝色温的聚光灯从头顶前上方打下，照亮舞台中央，" +
  "一束清晰的体积光穿过轻微烟雾，一位黑色立式麦克风（带麦架）立在台中，" +
  "舞台地板有细腻木纹反光，舞台下是观众席剪影，背后是深色吸光幕布，" +
  "明暗对比强烈，暗部层次分明，背景暗调不失细节，电影感画质，真实自然";

/**
 * 默认表情强度（0–10）。
 * 10 = 极度夸张的舞台化表情；8 = 自然克制、有感染力但不夸张（推荐默认）；
 * 6 = 内敛冷面；≤4 = 几乎无表情。可通过 --expression 覆盖。
 */
const DEFAULT_EXPRESSION_LEVEL = 8;

/**
 * 表情强度指令段（拼进每镜视频 prompt）。
 * @param {number} level 0–10
 */
function expressionDirective(level) {
  const lv = Math.max(0, Math.min(10, Number(level) || DEFAULT_EXPRESSION_LEVEL));
  let style;
  if (lv >= 9) {
    style =
      "表情可以夸张、富有戏剧张力：眉毛明显上扬，眼睛睁大，笑容幅度大，肢体动作幅度大，舞台化表演感强。";
  } else if (lv >= 7) {
    style =
      "表情自然、克制、有感染力：以真实微表情为主，嘴角、眉眼、眼神的细微变化传递情绪，" +
      "五官不做夸张变形，不瞪大眼睛、不大张嘴巴、不做卡通式鬼脸，像真实脱口秀演员从容讲述的状态。" +
      "动作与表情解耦：即使分镜要求做大幅肢体动作（举双手、比划大框、夸张手势），面部表情仍保持平静或微笑，" +
      "绝不把动作幅度同步到五官上，避免出现「瞪眼+张嘴+高扬眉毛」的卡通化惊讶脸。";
  } else if (lv >= 5) {
    style =
      "表情内敛克制，偏冷面喜剧风格：面部几乎不起大变化，仅靠眼神和嘴角的细微动作传达笑点，动作幅度小。";
  } else {
    style =
      "表情平静克制，接近无表情叙述：面部保持自然放松，仅有最轻微的眼神与嘴角变化，不做明显情绪外露。";
  }
  return (
    `表情强度：${lv}/10（10 为最夸张）。${style}` +
    "肢体动作幅度与表情强度匹配，整体保持真人实拍的从容感，不要卡通化、不要舞台剧式的过度表演。"
  );
}

/**
 * 表情强度约束（拼进分镜拆解 prompt，从源头约束 emotion 字段用词）
 * @param {number} level 0–10
 */
function expressionStoryboardRule(level) {
  const lv = Math.max(0, Math.min(10, Number(level) || DEFAULT_EXPRESSION_LEVEL));
  if (lv >= 9) return "9. emotion 可写明显的外放情绪（如：激动、爆笑、戏剧化）。";
  if (lv >= 7) {
    return (
      `9. emotion 必须写成自然、克制、真实的情绪（如：轻松自信、微笑、自嘲、若有所思、微微无奈），` +
      "禁止使用“夸张”“爆笑”“狂笑”“瞪大眼睛”“张大嘴巴”“五官扭曲”“戏剧化”等过度表演词。"
    );
  }
  if (lv >= 5) {
    return (
      "9. emotion 必须写成内敛克制的冷面喜剧情绪（如：面无表情、平淡、若有若无的笑意、眼神微动），" +
      "禁止出现大笑、激动、夸张等外放词。"
    );
  }
  return "9. emotion 一律写“平静”“自然放松”，不得有任何明显情绪外露的描述。";
}

/**
 * 对分镜表中已有的夸张表情词做降级清洗（兼容旧 storyboard / 模型偶发越界）
 * @param {string} emotion 原始情绪描述
 * @param {number} level 0–10
 */
function softenEmotion(emotion, level) {
  const raw = String(emotion || "轻松自信");
  const lv = Math.max(0, Math.min(10, Number(level) || DEFAULT_EXPRESSION_LEVEL));
  if (lv >= 9) return raw;
  // 低档位不做局部替换（会产生"自然面无表情"这类语义冲突），直接归位到统一描述
  if (lv < 5) return "平静自然";
  let s = raw;
  const map = [
    [/夸张|戏剧化|卡通式|鬼脸|五官扭曲/g, "自然"],
    [/爆笑|狂笑|捧腹|大笑/g, "微笑"],
    [/瞪大眼睛|瞪大双眼|睁大眼睛/g, "眼神自然"],
    [/张大嘴巴|张嘴大喊|嘶吼/g, "嘴角微动"],
    [/激动|兴奋|亢奋/g, "轻松"],
    [/极其|非常|超级|特别/g, "略微"],
  ];
  for (const [re, to] of map) s = s.replace(re, to);
  // 去重相邻的"自然自然"之类
  s = s.replace(/(自然|微笑|轻松)(，?\s*\1)+/g, "$1");
  return s.trim() || "轻松自信";
}

// ---------------------------------------------------------------------------
// 电影级质感指令（Kling 3.0 画质与表演真实度增强）
// ---------------------------------------------------------------------------

/** 电影级视觉质感段（拼进每镜视频 prompt 与资产图 prompt）
 *  专业手法：胶片颗粒+halation 光晕、3200K 暖钨丝主光+轮廓光分离、体积光烟雾、
 *  大光圈焦外光斑、真实皮肤纹理（毛孔/绒毛/油光过渡）、影调层次（高光不过曝暗部不死黑） */
const CINEMATIC_VISUAL =
  "电影级实拍质感：ARRI 数字电影机实拍效果，全画幅传感器，细腻胶片颗粒与轻微光晕（halation），" +
  "专业电影三点布光——暖钨丝色温（约3200K）聚光主光从前上方塑造面部立体感，轮廓光勾勒肩颈线条与发丝边缘，" +
  "环境暗部保留细节，明暗对比如经典喜剧舞台纪录片；轻微烟雾让光束呈现清晰体积感；" +
  "大光圈浅景深，背景观众席化为柔和焦外光斑，虚化过渡如奶油般自然；" +
  "肤色真实：皮肤纹理、毛孔与绒毛清晰可见，鼻尖与额头的油光高光过渡自然，无磨皮无塑料感无美颜痕迹；" +
  "影调层次丰富，高光不过曝、暗部不死黑；真实纪录片质感，绝无 CG 感、无 AI 感、无卡通渲染。";

/** 真人级表演细腻度段（拼进每镜视频 prompt）
 *  专业手法：呼吸节拍、真实眨眼频率、视线调度、手势加减速、身体微动作、
 *  微表情先行（包袱前嘴角先动）、包袱后的停顿等待、连续情绪弧线 */
const PERFORMANCE_REALISM =
  "表演要求（真人级细腻度）：像一位资深脱口秀演员在剧场里即兴表演——" +
  "呼吸有节拍：说到停顿处胸口与肩膀轻微起伏，吸气瞬间自然可见；" +
  "眨眼真实：保持自然的眨眼频率，视线在观众席间微小游移后回到前方，眼神有焦点的细微变化；" +
  "手势与语言同步：重音词配合手部动作，手势从静止到挥动有加速与减速过程，落点自然收回，动作之间有真实的间歇；" +
  "身体有微动作：头部随语气轻微点头或侧倾，躯干重心偶尔微移但双脚始终钉在原位，下巴随情绪微抬或微收；" +
  "微表情先行：说到包袱前嘴角先微微上扬、眼中有笑意，包袱落地后停顿半秒等待观众反应，" +
  "全程保持连续的情绪弧线，情绪过渡不跳变；" +
  "禁止僵硬定格、禁止循环假动作、禁止面无表情念稿、禁止过度舞台剧式的夸张肢体表演。";

/** 图像生成通用负向提示词（仅文生图；图生图不支持负向提示词） */
const IMAGE_NEGATIVE =
  "文字，水印，Logo，字幕，边框，多余人物，手持麦克风，第二支话筒，卡通，动漫，插画，" +
  "塑料感，过度磨皮，油腻高光，畸变，多余手指，过度美颜，网红同款脸，塑料皮肤";

/** 按景别匹配电影镜头语言（镜头焦段 + 光圈 + 焦外特征 + 纪实构图意图） */
function lensByShotSize(shotSize) {
  const s = String(shotSize || "");
  if (/特写|近景/.test(s))
    return "85mm f/1.8 电影人像镜头，浅景深，焦点锁定演员面部，睫毛发丝与皮肤细节纤毫毕现，背景化为奶油般焦外光斑";
  if (/全景|远景/.test(s))
    return "24mm f/4 广角电影镜头，完整容纳舞台灯光氛围与观众席剪影，体积光穿雾可见，演员是画面中唯一清晰的视觉中心";
  if (/中景/.test(s))
    return "50mm f/2.8 标准电影镜头，中景构图，人物与舞台的空间关系自然真实，肩部微微虚化突出面部";
  return "35mm f/2.8 电影镜头，自然透视与景深，纪录片式的真实构图";
}

/** 默认演员定妆照生成 prompt（严禁出现持麦/道具，避免多话筒伪影；肖像摄影语言，与舞台灯光语言解耦） */
function defaultActorPrompt(desc) {
  return (
    (desc || DEFAULT_ACTOR_DESC) +
    "。画面中没有任何麦克风、没有任何道具，双手自然下垂。竖版 3:4 半身照。" +
    "专业人像摄影：85mm 人像镜头，浅景深，柔光箱补光加轮廓光，肤色真实，皮肤纹理清晰，" +
    "细腻胶片颗粒，杂志级质感，无文字无水印。"
  );
}

/** 舞台生成 prompt（仅舞台、无演员；文生图，--stage-desc 可覆盖模板） */
function stageOnlyPrompt(stageDesc) {
  return (
    (stageDesc || DEFAULT_STAGE_DESC) +
    "。舞台空无一人，画面中没有任何人物。" + CINEMATIC_VISUAL
  );
}

/** 合成图（stage_composite）生成 prompt：演员进入脱口秀舞台（Kling 单图参考）。
 *  @param {string} propDesc 段子特定道具描述（如"一只哑光黑色保温杯"）；为空时舞台保持干净无道具。
 *  @param {string|null} stageDesc 舞台场景文字描述（--stage-desc；无则用内置电影感剧场模板）
 *  @param {boolean} refIsActor 参考图是否为演员图（true：图=演员，舞台靠文字；false：图=舞台，演员靠文字）
 *  注意：Kling Image 单次仅支持一张参考图。演员图参考时人物一致性优先，舞台由文字模板描述。 */
function stageCompositePrompt(propDesc = "", stageDesc = null, refIsActor = true) {
  const scene = stageDesc || DEFAULT_STAGE_DESC;
  const propPart = propDesc
    ? "演员身侧前景（靠近镜头一侧）有一张小型圆形或方形小茶几，茶几上放着" +
      propDesc +
      "；演员此时双手自然下垂、并未拿起它，姿势自然，像正在表演脱口秀。"
    : "除立式麦克风外，舞台保持完全干净简洁——绝对不要添加任何小茶几、小桌子、椅子、台阶、栏杆、装饰物、盆栽；" +
      "演员此时双手自然下垂，姿势自然，像正在表演脱口秀。";
  if (refIsActor) {
    return (
      `让参考图中的人物在如下场景中表演脱口秀：${scene}。` +
      "人物站在舞台中央的立式麦克风正后方，面对观众。" +
      "严格保持参考图中人物的脸型五官、发型发色、妆容、服装、配饰和体型完全一致，不得有任何改变。" +
      propPart +
      CINEMATIC_VISUAL +
      " 无文字、无水印、无多余人物、无多余道具。"
    );
  }
  return (
    "在这个舞台上添加一位脱口秀演员并让其开始表演：" +
    "演员自然站立在舞台中央的立式麦克风正后方，面对观众，表情放松自信。" +
    propPart +
    CINEMATIC_VISUAL +
    " 无文字、无水印、无多余人物、无多余道具。"
  );
}

/**
 * 分镜拆解 prompt（文本模型，输出 JSON）
 * @param {object} p { maxShotSeconds, charsPerSecond }
 */
function storyboardSystemPrompt() {
  return (
    "你是一名资深脱口秀导演和分镜师。你只输出 JSON，不输出任何其他文字、解释或 Markdown 代码块标记。"
  );
}

function storyboardUserPrompt({
  script,
  maxShotSeconds,
  charsPerSecond = 4.2,
  expressionLevel = DEFAULT_EXPRESSION_LEVEL,
  propDesc = "",
}) {
  const maxChars = Math.floor(maxShotSeconds * charsPerSecond);
  // [feature: 段子特定道具白名单] 仅在显式指定道具时放开"拿起/放下道具"的 action 描述；
  // 未指定道具时，明确禁止分镜师添加任何手持/桌面道具，避免画面漂移（如凭空多出杯子）。
  const propRule = propDesc
    ? `8.5 舞台上允许的唯一额外道具是：${propDesc}（放在演员身侧的小茶几上）。` +
      "action 中可以描述演员拿起、放下该道具的具体动作（如：右手拿起小茶几上的该道具、右手把它放回小茶几），" +
      "但不得出现两件以上同类道具，也不得让该道具变成手持麦克风。" +
      "除它之外的任何道具（杯子、手机、书本、食品等）一律不得出现在 action 中。"
    : "8.5 舞台上除立式麦克风外没有任何道具，action 中一律不得出现拿起、放下、端起、翻看任何物品的描述，" +
      "演员全程双手空手做手势（避免画面凭空多出道具）。";
  return [
    `请把下面的脱口秀简稿拆分成视频分镜表。总台词量约 ${script.length} 字。`,
    "",
    "硬性规则：",
    `1. 台词必须逐字保留原文，不得增删、改写、总结。所有镜头的 text 拼接后必须等于原文（仅允许去掉换行）。`,
    "2. 只能在完整句子或完整意群之间切分，绝不能把一句话切成两镜。",
    "3. 笑点的铺垫和包袱必须落在同一镜头内，不得跨镜。",
    `4. 每镜台词不超过 ${maxChars} 字；seconds 为 5 到 ${maxShotSeconds} 之间的整数，按每秒约 ${charsPerSecond} 字估算。`,
    "5. 首镜包含开场问候，尾镜包含收尾致谢（如果原文有对应内容）。",
    "6. 景别要有变化，不允许连续 3 镜相同景别。",
    "7. 每镜 action 必须写具体动作（如：右手在胸前做手势，左手自然下垂，身体微微前倾），禁止写“随意”“自然表演”。",
    "8. action 中禁止出现持麦、拿麦、握麦、举话筒等描述——麦克风固定为舞台上的一支黑色立式麦，演员双手默认空手做手势。",
    "8.7 演员站位固定：action 中禁止出现走位、踱步、走向/走到某处、绕行等位置移动描述，" +
      "演员全程站在立式麦克风正后方表演，只有手势、身体姿态与头部动作。",
    propRule,
    expressionStoryboardRule(expressionLevel),
    "",
    "输出 JSON 格式（严格遵循，不要加任何注释）：",
    '{"title":"脱口秀主题（10字内）","shots":[{"id":"S01","text":"该镜完整台词","seconds":10,"shot_size":"中景|全景|近景|特写","camera":"固定机位|缓慢推近|缓慢拉远|左右微移","action":"具体动作描述","emotion":"轻松自信|激动|自嘲|严肃|热情等","laugh_point":false,"audience_reaction":"无|轻笑|中等笑声|爆笑|掌声"}]}',
    "",
    "脱口秀简稿如下：",
    "<<<",
    script,
    ">>>",
  ].join("\n");
}

/**
 * 分镜视频生成 prompt（适配 Kling Video 3.0 Turbo 图生视频 + 原生音画同步）
 * 首帧参考 = 演员舞台合成图；prompt 控制：一致性锚点 → 镜头语言 → 表演 → 台词 → 质感。
 * @param {object} shot 分镜表条目
 * @param {string} voiceProfile 音色描述
 */
function shotVideoPrompt(
  shot,
  voiceProfile,
  expressionLevel = DEFAULT_EXPRESSION_LEVEL,
  propDesc = ""
) {
  const reaction = shot.audience_reaction && shot.audience_reaction !== "无" ? `，说到结尾后${shot.audience_reaction}` : "";
  // 防御性清洗：兼容旧分镜表中残留的"持麦"类动作描述，避免诱导模型画出手持麦克风
  const rawAction = String(shot.action || "");
  const action =
    rawAction
      .split("，")
      // "手持"过滤收窄为仅麦克风相关（手持麦克风/手持麦/手持话筒），
      // 避免误删启用 --prop 时"手持保温杯"等合法道具动作描述
      .filter((clause) => !/持麦|拿麦|握麦|举.{0,2}话筒|手持(麦|麦克风|话筒)/.test(clause))
      // "切换角色/扮演"类动作会诱导模型变声，替换为安全的表演动作
      .map((clause) => (/切换角色|转换角色|扮演|模仿|变声/.test(clause) ? "用语气和手势区分表达重点" : clause))
      // 走位类动作与"站位锁定"冲突，整句剔除（兼容旧分镜表）
      .filter((clause) => !/走位|踱步|走向|走到|移步|来回走|绕到|绕过|横移/.test(clause))
      // level ≤ 8 时，action 中含"眼睛睁大/瞪大眼睛/张大嘴巴/吃惊"等表情词，替换为"眼神自然"以防卡通化
      .map((clause) => expressionLevel <= 8
        ? clause
            .replace(/眼睛睁大|瞪大眼睛|张大嘴巴|吃惊|震惊|惊讶表情/g, "眼神自然")
        : clause)
      .join("，") || "双手在胸前自然做手势";
  return [
    consistencyAnchor(propDesc),
    "",
    `景别：${shot.shot_size}。镜头：${lensByShotSize(shot.shot_size)}。`,
    `镜头运动：${shot.camera}，运动平稳如摄影师肩扛云台，无抖动无变焦突跳。`,
    "站位锁定：演员双脚全程固定在立式麦克风正后方的同一位置，与首帧画面完全一致，无任何走位。",
    `动作：${action}。`,
    `表情与情绪：${softenEmotion(shot.emotion, expressionLevel)}。`,
    expressionDirective(expressionLevel),
    PERFORMANCE_REALISM,
    "",
    `演员正在表演中文脱口秀，口型与台词精确同步。用中文说（台词逐字）："${shot.text}"`,
    `音色：${voiceProfile}。字正腔圆的中文普通话。NO English speech。`,
    "台词纪律：台词原文是唯一口播内容，逐字清晰说出台词的中文普通话；除此之外不得发出任何声音——" +
      "不哼唱、不呢喃、不发出「嗯、啊、呃」等无意义音节，不说外语、不说听不懂的词语或自造词；" +
      "台词说完后闭口，保持微笑自然停顿至镜头结束。",
    "声音锁定：全片从头到尾只有这一位演员本人的声音，音色、音高、性别音质完全一致，" +
      "严禁中途变声、切换声线或插入任何其他人的声音；台词中的对话（如引用他人、AI 或角色说的话）" +
      "也必须由演员本人用同一音色转述，仅允许语气轻重变化，不得改变声线。",
    "",
    `小型脱口秀剧场氛围，暖光聚光灯，观众席暗部有轻微人影晃动${reaction}。` +
      "镜头末尾演员说完台词并自然停顿。",
    CINEMATIC_VISUAL +
      " 画面中无任何文字、字幕、水印、Logo，无多余人物。",
  ].join("\n");
}

/** 从分镜表生成 SRT 用：把一镜台词切成 ≤ maxChars/行 的字幕条 */
function splitSubtitleLines(text, maxChars = 18) {
  const lines = [];
  let buf = "";
  // 优先按标点切
  const parts = text.split(/(?<=[，。！？；…,.!?;:：])/);
  for (const p of parts) {
    if ((buf + p).length > maxChars && buf) {
      lines.push(buf);
      buf = p;
    } else {
      buf += p;
    }
  }
  if (buf.trim()) lines.push(buf);
  return lines.map((s) => s.trim()).filter(Boolean);
}

module.exports = {
  CONSISTENCY_ANCHOR,
  ANCHOR_BASE,
  PROP_PRESETS,
  resolveProp,
  propAnchor,
  consistencyAnchor,
  DEFAULT_VOICE_PROFILE,
  DEFAULT_ACTOR_DESC,
  DEFAULT_ACTOR_VOICE,
  DEFAULT_STAGE_DESC,
  DEFAULT_EXPRESSION_LEVEL,
  CINEMATIC_VISUAL,
  PERFORMANCE_REALISM,
  IMAGE_NEGATIVE,
  lensByShotSize,
  defaultActorPrompt,
  stageOnlyPrompt,
  stageCompositePrompt,
  storyboardSystemPrompt,
  storyboardUserPrompt,
  shotVideoPrompt,
  expressionDirective,
  expressionStoryboardRule,
  softenEmotion,
  splitSubtitleLines,
};
