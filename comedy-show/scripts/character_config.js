/**
 * character_config.js — 角色描述与 prompt 模板配置
 * 无外部依赖，纯配置模块
 *
 * v11 优化：脱口秀舞台 + 观众 + 口型同步强化
 * - 恢复有观众的脱口秀舞台氛围（非极简电影棚）
 * - 保持清一色正式演讲风格 + 反差喜剧
 * - 强化口型同步：权重提升，动作与台词直接对应
 * - 镜头固定中景，偶尔轻微推进
 * - 电影质感、浅景深、观众虚化
 */

// 默认角色描述（中英双语）
// v11：恢复脱口秀舞台+观众，保持正式演讲风格+反差喜剧
const DEFAULT_CHARACTER_DESC =
  "一位中国时尚美女喜剧演员，长发飘逸，穿着精致现代正装，手持一支话筒，站在脱口秀舞台中央，台下坐满观众。" +
  "清一色正式演讲风格，像在进行一场严肃的发布会，但内容充满搞笑段子和生活吐槽。" +
  "站姿稳定，手势克制自然，语气自信松弛，节奏有停顿和反差感，表演幽默接地气、轻微自嘲、带一点荒诞感。" +
  "A beautiful Chinese woman comedian with distinct East Asian facial features, " +
  "straight black long flowing hair, fair skin, almond-shaped eyes, " +
  "wearing elegant modern formal outfit, holding one microphone, " +
  "standing center stage in a comedy club with audience seated in front, " +
  "warm spotlight on performer, audience visible but blurred in background, " +
  "formal speech style with comedic content, confident relaxed tone, " +
  "speaking Mandarin Chinese, telling jokes with pauses and contrast";

// 宽高比配置
const RATIOS = {
  "9:16": {
    label: "竖版（抖音/快手/小红书）",
    imageSize: "720x1280",
    videoWidth: 720,
    videoHeight: 1280,
  },
  "16:9": {
    label: "横版（B站/YouTube）",
    imageSize: "1280x720",
    videoWidth: 1152,
    videoHeight: 768,
  },
};

// Edge TTS 中文女声映射
const VOICES = {
  lively: "zh-CN-XiaoxiaoNeural",     // 自然温暖（默认，吐字清晰，适合脱口秀）
  warm: "zh-CN-XiaomoNeural",         // 温柔
  friendly: "zh-CN-XiaoyanNeural",    // 亲切
  mature: "zh-CN-XiaoruiNeural",      // 成熟
  gentle: "zh-CN-XiaoyiNeural",       // 活泼（语速较快）
};

// 默认 TTS 语速：降低 10% 让吐字更清晰，留出停顿空间
const DEFAULT_TTS_RATE = "-10%";

/**
 * 构建首帧图片 t2i prompt
 * v11：脱口秀舞台 + 观众 + 电影质感
 * @param {string} characterDesc - 角色描述
 * @param {string} visualDescription - 该场景的视觉描述
 * @returns {string} 完整的 t2i prompt
 */
function buildImagePrompt(characterDesc, visualDescription) {
  return (
    characterDesc +
    "。" +
    (visualDescription || "") +
    ", beautiful Chinese woman with East Asian facial features, straight black long hair, " +
    "wearing elegant modern formal outfit, holding one microphone, " +
    "stand-up comedy club stage, audience seated in foreground visible as silhouettes, " +
    "warm spotlight on performer, stage with microphone stand, " +
    "premium stage lighting, soft rim light, subtle contour light, " +
    "calm confident posture, stable standing pose, facing camera directly, " +
    "speaking Mandarin Chinese in confident relaxed tone, formal speech style, " +
    "natural facial expressions, calm neutral face, mouth slightly open as if mid-sentence, " +
    "shallow depth of field, audience blurred in background, cinematic composition, " +
    "detailed skin texture, natural pores visible, fine hair strands, " +
    "8K, professional cinematography, ultra-detailed, high dynamic range, film grain"
  );
}

/**
 * 构建 i2i 重托管 prompt（强调保持构图和细节）
 * @param {string} characterDesc - 角色描述
 * @returns {string} i2i prompt
 */
function buildRehostPrompt(characterDesc) {
  return (
    "Preserve this image exactly. Maintain identical composition, pose, lighting, " +
    "character identity, facial features, costume, one microphone, comedy club stage, audience. " +
    "A beautiful Chinese woman with East Asian facial features, straight black long hair. " +
    characterDesc +
    ", stand-up comedy stage with audience, formal speech style, " +
    "calm neutral facial expressions, confident composed demeanor, " +
    "lips slightly parted as if speaking Chinese, cinematic, ultra-detailed, sharp focus, film grain"
  );
}

/**
 * 构建 image2video 视频 prompt
 * v14 优化：Wav2Lip 接管口型同步，视频 prompt 聚焦于画面表现力
 *
 * 核心风格：
 * 1. 脱口秀舞台：有观众、暖色聚光灯、浅景深虚化观众
 * 2. 高级灯光：柔和轮廓光、浅景深
 * 3. 固定中景镜头：偶尔轻微推进，人物腰部以上可见
 * 4. 表情克制：靠台词节奏/停顿/眼神产生幽默
 * 5. 口型同步由 Wav2Lip 后处理完成，视频 prompt 不再描述嘴部运动
 * 6. 反差喜剧：严肃演讲形式 + 搞笑内容
 *
 * @param {string} videoMotion - 视频运动描述（英文，来自 LLM）
 * @param {string} characterDesc - 角色描述
 * @param {number} sceneIndex - 场景索引
 * @returns {string} 完整的视频生成 prompt
 */
function buildVideoPrompt(videoMotion, characterDesc, sceneIndex) {
  // 场景衔接指令
  const continuityHint = sceneIndex > 0
    ? "Continues from previous shot, same woman same stage same audience, seamless. "
    : "Opens mid-performance, woman already on stage with audience watching. ";

  // 精简 videoMotion：只取前150字符，避免总prompt过长触发内容审查
  const motion = videoMotion ? videoMotion.substring(0, 150) : "calm composed expression, subtle gaze shift, natural speaking gestures, fixed camera. ";

  return (
    // ── 1. 基础参数 + 核心主体 ──
    "4K cinematic film style. " +
    "(Chinese woman East Asian features long black hair formal outfit:1.3), one microphone, " +
    "comedy club stage, audience blurred in background, warm spotlight, premium lighting, shallow depth of field. " +
    "Confident relaxed posture, formal speech style, telling jokes with pauses and contrast. " +

    // ── 2. 场景衔接 ──
    continuityHint +

    // ── 3. 表情与肢体（Wav2Lip 后处理口型，此处不描述嘴部）──
    "(facial expressions minimal composed:1.4), calm serious face, eyebrows relaxed. " +
    "Natural body language, restrained gestures, stable standing pose. " +
    "Subtle eye contact with audience, slight knowing look at pauses. " +

    // ── 4. 镜头语言（固定中景）──
    "Medium shot, fixed camera, woman visible waist up, no zoom, no close-up. " +

    // ── 5. 时间轴分镜 ──
    "0-3s: Speaking naturally, restrained gestures, fixed camera. " +
    "3-5s: " + motion + " " +
    "5-7s: Continuing to speak, slight knowing smile at pause, camera fixed. " +

    // ── 6. 防崩收尾 ──
    "Smooth stable footage, film grain. " +
    "(face clear stable:1.4), same person throughout, costume unchanged, same stage."
  );
}

/**
 * 构建 LLM system prompt（剧本优化 + 分镜拆分）
 * v11：脱口秀舞台 + 观众 + 口型同步强化
 *
 * @param {string} characterDesc - 角色描述
 * @returns {string} system prompt
 */
function buildSystemPrompt(characterDesc) {
  return `你是一位顶级脱口秀编剧和短视频导演，擅长"清一色正式演讲风格"的反差喜剧——演员以严肃认真的态度讲述搞笑内容，靠台词节奏、停顿和眼神变化产生幽默效果，而非夸张表情。

角色设定：${characterDesc}。

## 表演风格：清一色正式演讲 + 反差喜剧

这是核心风格定位：
- **形式严肃，内容搞笑**：像发布会或课堂演讲一样正式，但内容是搞笑段子
- **表情克制**：全程保持冷静自信的面孔，幽默靠台词本身而非表情
- **节奏感**：关键包袱前有停顿，制造期待感后再说出笑点
- **眼神互动**：通过眼神变化（而非表情）传递情绪转折
- **手势自然**：手势少而精，偶尔配合内容做出自然动作
- **轻微自嘲**：接地气、有荒诞感，但不喧闹

## 场景设定：脱口秀舞台 + 观众

- 演员站在脱口秀舞台上，台下坐满观众
- 暖色聚光灯打在演员身上，观众在背景中虚化可见
- 舞台有麦克风支架，整体氛围是真实的脱口秀现场
- 保持电影质感，但不是空旷的电影棚

## 核心任务

1. 将用户的脱口秀段子优化为一个完整、连贯的表演
2. 拆分为3-5个分镜，每个约5-8秒（口播文本40-70字）
3. 为每个分镜编写精准的视觉描述和视频运动描述

## 导演思维：先看见影片，再拆分镜

先在脑海中"放映"完整影片：
- 想象她以正式演讲的姿态站在脱口秀舞台上，观众在台下
- 想象她冷静地说出搞笑内容，观众被反差感逗笑
- 想象镜头固定在中景，偶尔轻微推进强调重点
- 想象台词的节奏：铺垫→停顿→包袱→停顿→下一个铺垫

## 故事结构

- **开场（第1分镜）**：正式引入话题，像发布会开场。如"今天我要讲一个关于相亲的故事..."
- **发展（中间分镜）**：层层递进，每个分镜承上启下。包袱之间有停顿节奏
- **高潮收尾（最后分镜）**：抖出最强包袱，以冷静的语气说出最荒诞的结论

故事连贯性铁律：
- optimized_script 必须是完整通顺的口播文案
- 每个分镜结尾留出停顿空间（包袱后的"留白"）
- 保持第一人称"我"的叙述视角
- 分镜之间通过台词逻辑自然衔接

## 分镜拆分规则

- 拆分点在自然停顿处（逗号、句号、问号后）
- 每个分镜包含"铺垫+笑点"单元
- 分镜数控制在3-5个

## visual_description 要求（中文，用于 t2i 首帧）

1. **与口播内容对应**：画面动作体现口播含义
2. **正式演讲姿态**：站姿稳定、正面面对镜头、手势克制
3. **微表情**：表情克制自然（如"嘴角微微上扬"、"眼神平静自信"），禁止夸张表情
4. **场景一致**：脱口秀舞台、台下有观众、暖色聚光灯、浅景深虚化观众
5. **景别**：中景（medium shot），人物腰部以上可见

## video_motion 要求（英文，用于 image2video）

按 Seedance 2.0 极致控片公式编写。video_motion 放入时间轴 3-5s 段。必须包含：

### 1. 主体描述
- "Chinese woman" / "Chinese female comedian"
- "confident relaxed posture, formal speech style"
- "holding one microphone"

### 2. 肢体语言与表情（反差喜剧核心）
- "calm composed face", "confident relaxed demeanor"
- "natural body language, restrained gestures"
- "subtle eye contact with audience"
- "slight knowing look at pauses"
- 幽默靠台词节奏，禁止 "wide smile", "big laugh", "dramatic expression"
- 表情词限制：只用 "slight smile", "subtle", "calm", "knowing look"
- 注意：口型同步由 Wav2Lip 后处理完成，video_motion 中不需要描述嘴部运动

### 3. 镜头语言
- 景别：medium shot（中景，禁止 close-up）
- 运镜：fixed camera（固定，偶尔 slight slow push-in）
- 人物腰部以上可见，镜头距离一致

### 4. 场景设定
- "comedy club stage"
- "audience blurred in background"
- "warm spotlight on performer"

### 5. 场景衔接（非首场景）
- "continues from previous shot"
- "same woman same stage same costume"

### 重要：全部使用正向描述，video_motion 控制在 60 词以内
- ✅ "confident relaxed posture" / "calm composed face" / "formal speech style"
- ❌ "NOT singing" / "NOT exaggerated" / "NOT dramatic"
- video_motion 必须简短精炼（60词以内），因为模板会拼接其他内容，总prompt过长会触发内容审查

## TTS 情绪参数（核心：让声音有感情）

Edge TTS 不支持情感风格，但可以通过变速变调模拟情绪。为每个分镜生成 tts_rate 和 tts_pitch：

### 语速 tts_rate（百分比字符串）
- 铺垫段（讲背景、设置情境）："-15%" 放慢，制造悬念
- 叙述段（正常讲述）："-5%" 略慢，吐字清晰
- 包袱段（抖笑点）："+5%" 略快，语气上扬
- 反差段（冷静说出荒诞结论）："-20%" 极慢，制造反差

### 音调 tts_pitch（Hz 字符串）
- 铺垫段："-10Hz" 压低，神秘感
- 叙述段："+0Hz" 正常
- 包袱段："+15Hz" 上扬，兴奋感
- 反差段："-15Hz" 极低，冷面笑匠

### 段间停顿 pause_after（毫秒）
- 笑点后：600（留白让观众笑）
- 普通句间：300
- 分镜结尾：800

## 返回格式

严格返回以下JSON（不要markdown标记，不要其他文字）：
{
  "optimized_script": "完整连贯的脱口秀文案（一个完整故事，有节奏停顿）",
  "scenes": [
    {
      "index": 0,
      "text": "口播文本（40-70字，包袱前有停顿感）",
      "visual_description": "中文视觉描述（中景+正式演讲姿态+克制微表情+脱口秀舞台有观众）",
      "video_motion": "English: Chinese woman, confident relaxed posture, formal speech style, holding one microphone. Natural body language, restrained gestures, subtle eye contact with audience. Calm composed face, slight knowing look at pauses. Medium shot, fixed camera. Comedy club stage, audience blurred in background. All positive descriptions only.",
      "tts_rate": "-15%",
      "tts_pitch": "-10Hz",
      "pause_after": 600
    }
  ]
}`;
}

module.exports = {
  DEFAULT_CHARACTER_DESC,
  RATIOS,
  VOICES,
  DEFAULT_TTS_RATE,
  buildImagePrompt,
  buildRehostPrompt,
  buildVideoPrompt,
  buildSystemPrompt,
};
