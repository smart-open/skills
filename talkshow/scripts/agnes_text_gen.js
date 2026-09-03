/**
 * agnes_text_gen.js — Agnes Text API 封装（剧本优化 + 分镜拆分）
 * 仅依赖 Node.js 内置模块
 */
const https = require("https");
const { buildSystemPrompt } = require("./character_config");

const API_HOST = "apihub.agnes-ai.com";
const API_PATH = "/v1/chat/completions";
const MODEL = "agnes-2.0-flash";
const TIMEOUT_MS = 120000;
const MAX_RETRIES = 3;

/**
 * 从 LLM 响应中提取 JSON
 * @param {string} content - LLM 返回的原始文本
 * @returns {object|null} 解析后的 JSON 对象
 */
function extractJSON(content) {
  // 尝试 1：直接解析
  try {
    return JSON.parse(content);
  } catch (e) {}

  // 尝试 2：从 ```json ... ``` 代码块中提取
  const codeBlockMatch = content.match(/```json\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch (e) {}
  }

  // 尝试 3：从 ``` ... ``` 代码块中提取
  const genericBlockMatch = content.match(/```\s*([\s\S]*?)```/);
  if (genericBlockMatch) {
    try {
      return JSON.parse(genericBlockMatch[1]);
    } catch (e) {}
  }

  // 尝试 4：提取第一个 { ... } 块
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {}
  }

  return null;
}

/**
 * 调用 Agnes Text API 优化剧本并拆分分镜
 * @param {string} rawScript - 用户输入的原始脱口秀段子
 * @param {string} apiKey - Agnes API Key
 * @param {object} options - { characterDesc, temperature }
 * @returns {Promise<object>} { optimized_script, scenes[] }
 */
async function optimizeScript(rawScript, apiKey, options = {}) {
  const characterDesc = options.characterDesc || require("./character_config").DEFAULT_CHARACTER_DESC;
  const temperature = options.temperature || 0.6;

  const systemPrompt = buildSystemPrompt(characterDesc);
  const userMessage = `作为导演，请将以下脱口秀段子转化为一部完整的脱口秀短片。先在脑海中看到整部影片的画面流动，再拆解为分镜。\n\n要求：\n1. 所有分镜围绕同一主题，形成有开头、发展、结尾的完整故事\n2. 每个分镜的 video_motion 必须包含景别和运镜描述\n3. 每个分镜的 video_motion 必须包含口型同步描述（lip sync, mouth shapes match syllables）\n4. 每个分镜的动作必须与口播文本内容直接对应（如说到"掏手机"则有手部展示动作）\n5. 全部使用正向描述，禁止使用 NOT 语句（Seedance 2.0 不支持负向提示词）\n6. 动作描述用缓慢、轻柔、自然、流畅的词汇\n7. 场景设定为脱口秀舞台，有观众在台下\n8. 场景间通过视觉元素自然衔接\n\n原始段子：\n${rawScript}`;

  const body = JSON.stringify({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: temperature,
  });

  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const waitMs = Math.pow(2, attempt) * 2000;
      console.log(`  Retry ${attempt + 1}/${MAX_RETRIES} after ${waitMs / 1000}s...`);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    try {
      const responseText = await callAPI(body, apiKey);

      const parsed = JSON.parse(responseText);
      const content = parsed.choices[0].message.content;

      const result = extractJSON(content);
      if (!result) {
        throw new Error("Failed to parse JSON from LLM response");
      }

      // 验证结果结构
      if (!result.optimized_script || !Array.isArray(result.scenes) || result.scenes.length === 0) {
        throw new Error("Invalid script structure: missing optimized_script or scenes");
      }

      // 确保 each scene has required fields
      for (const scene of result.scenes) {
        if (!scene.text) {
          throw new Error("Scene missing 'text' field");
        }
        if (!scene.video_motion) {
          scene.video_motion = "Medium shot, fixed camera, Chinese woman speaking Mandarin Chinese in confident relaxed tone, formal speech style, telling jokes, holding one microphone. Lip sync to Mandarin Chinese speech, mouth shapes match syllables precisely, lips move naturally with each word, jaw opens and closes matching speech rhythm. Calm composed face, minimal facial expressions, eyebrows relaxed, confident demeanor. Comedy club stage, audience blurred in background, warm spotlight. Fixed camera position, occasional slight push-in. 4K cinematic, film grain, smooth stable footage.";
        }
        if (!scene.visual_description) {
          scene.visual_description = "中景，中国女喜剧演员身穿正装站在脱口秀舞台中央，台下坐满观众，暖色聚光灯打在演员身上，观众在背景中虚化可见，手持话筒，正面面对镜头，站姿稳定自信，表情克制冷静，浅景深背景虚化，电影质感";
        }
        // TTS 情绪参数 fallback
        if (!scene.tts_rate) scene.tts_rate = "-10%";
        if (!scene.tts_pitch) scene.tts_pitch = "+0Hz";
        if (!scene.pause_after) scene.pause_after = 400;
      }

      // 验证故事完整性：分镜文本拼接后应与 optimized_script 基本一致
      const combinedText = result.scenes.map((s) => s.text).join("").replace(/\s+/g, "");
      const optimizedClean = result.optimized_script.replace(/\s+/g, "");
      // 允许一定误差（标点符号差异等）
      const overlap = combinedText.length / optimizedClean.length;
      if (overlap < 0.5 || overlap > 2.0) {
        console.warn(`  Warning: scenes text (${combinedText.length} chars) vs optimized_script (${optimizedClean.length} chars) mismatch ratio ${overlap.toFixed(2)}`);
      }

      console.log(`  Script optimized: ${result.scenes.length} scenes`);
      console.log(`  Story: ${result.optimized_script.slice(0, 60)}...`);
      return result;
    } catch (e) {
      lastError = e;
      console.error(`  Attempt ${attempt + 1} failed: ${e.message}`);
    }
  }

  throw new Error(`Script optimization failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

/**
 * 调用 Agnes chat/completions API
 * @param {string} body - JSON 请求体
 * @param {string} apiKey - API Key
 * @returns {Promise<string>} 响应文本
 */
function callAPI(body, apiKey) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: API_HOST,
        path: API_PATH,
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 500)}`));
            return;
          }
          resolve(data);
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("Request timeout"));
    });
    req.write(body);
    req.end();
  });
}

module.exports = { optimizeScript, extractJSON, MODEL, API_HOST, API_PATH };
