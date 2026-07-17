#!/usr/bin/env node
/**
 * comedy_show.js — 主入口 CLI，流水线编排，状态管理
 *
 * 用法：
 *   node comedy_show.js --script "脱口秀段子" --output "output.mp4"
 *   node comedy_show.js --script-file script.txt --ratio 16:9
 *   node comedy_show.js --resume --work-dir work/20260716-xxxx
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const https = require("https");
const http = require("http");

const { DEFAULT_CHARACTER_DESC, RATIOS, VOICES, DEFAULT_TTS_RATE, buildImagePrompt, buildRehostPrompt, buildVideoPrompt } = require("./character_config");
const { optimizeScript } = require("./agnes_text_gen");
const { generateTTS, generateSilence, concatAudio, getAudioDuration, calcNumFrames, findEdgeTts } = require("./tts_engine");
const { extractLastFrame, muxVideoAudio, concatSegments, burnSubtitles, findFFmpeg } = require("./merge_engine");
const { applyLipSync } = require("./lipsync_engine");

// ─── 常量 ───

const SKILL_DIR = path.resolve(__dirname, "..");
const PARENT_SKILLS_DIR = path.resolve(SKILL_DIR, "..");
const IMAGE_GEN_SCRIPT = path.join(PARENT_SKILLS_DIR, "agnes-image-gen-2", "scripts", "agnes_image_gen.js");
const VIDEO_GEN_SCRIPT = path.join(PARENT_SKILLS_DIR, "agnes-video-gen-2", "scripts", "agnes_video_gen.js");
const WORK_DIR = path.join(SKILL_DIR, "work");
const FPS = 24;

// ─── CLI 参数解析 ───

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-./g, (m) => m[1].toUpperCase());
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      args[key] = val;
    }
  }
  return args;
}

function resolveApiKey(args) {
  const key =
    args.apiKey ||
    process.env["agnes-api-key"] ||
    process.env.AGNES_API_KEY;
  if (!key) {
    console.error("ERROR: Agnes API key not found.");
    console.error("Set environment variable 'agnes-api-key' or use --api-key parameter.");
    process.exit(1);
  }
  return key;
}

function getScriptText(args) {
  if (args.scriptFile) {
    return fs.readFileSync(args.scriptFile, "utf-8").trim();
  }
  if (args.script && args.script !== "true") {
    return args.script;
  }
  console.error("ERROR: No script provided. Use --script or --script-file.");
  process.exit(1);
}

// ─── 会话管理 ───

function generateSessionId() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${rand}`;
}

function createSession(workDir) {
  const dirs = ["audio", "frames", "last_frames", "videos", "muxed", "temp", "final"];
  for (const d of dirs) {
    fs.mkdirSync(path.join(workDir, d), { recursive: true });
  }
}

function loadState(workDir) {
  const statePath = path.join(workDir, "state.json");
  if (fs.existsSync(statePath)) {
    return JSON.parse(fs.readFileSync(statePath, "utf-8"));
  }
  return null;
}

function saveState(workDir, state) {
  const statePath = path.join(workDir, "state.json");
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
}

// ─── Agnes 脚本调用封装 ───

/**
 * 调用 agnes_image_gen.js 生成图片（t2i 或 i2i），返回 { localPath, url }
 */
function callImageGen(mode, options) {
  const parts = [`"${process.execPath}"`, `"${IMAGE_GEN_SCRIPT}"`, `--mode ${mode}`];

  if (options.prompt) parts.push(`--prompt "${options.prompt.replace(/"/g, '\\"')}"`);
  if (options.image) parts.push(`--image "${options.image}"`);
  if (options.size) parts.push(`--size ${options.size}`);
  if (options.output) parts.push(`--output "${options.output}"`);
  if (options.apiKey) parts.push(`--api-key "${options.apiKey}"`);
  if (options.noEnhance) parts.push("--no-enhance");

  const cmd = parts.join(" ");
  let output;
  try {
    output = execSync(cmd, { encoding: "utf-8", timeout: 180000, stdio: "pipe" });
  } catch (e) {
    // node 脚本的 stderr 包含进度信息，stdout 包含结果
    output = (e.stdout || "") + (e.stderr || "");
    // 检查是否实际成功（有 OUT_PATH 输出）
    if (!output.includes("OUT_PATH=") && !output.includes("IMAGE_URL=")) {
      throw new Error(`Image generation failed: ${e.message}\n${output}`);
    }
  }

  const pathMatch = output.match(/OUT_PATH=(.+)/);
  const urlMatch = output.match(/IMAGE_URL=(.+)/);

  const localPath = pathMatch ? pathMatch[1].trim() : options.output;
  const url = urlMatch ? urlMatch[1].trim() : null;

  if (!url) {
    throw new Error("Image generation did not return IMAGE_URL");
  }

  return { localPath, url };
}

/**
 * 调用 agnes_video_gen.js 生成视频（两步式：--url-only + 下载）
 * 返回 { videoPath, videoUrl }
 */
async function callVideoGen(options) {
  // Step 1: 创建任务 + 轮询获取 VIDEO_URL（长进程）
  const parts = [
    `"${process.execPath}"`,
    `"${VIDEO_GEN_SCRIPT}"`,
    "--url-only",
    `--workflow image2video`,
    `--image "${options.image}"`,
    `--prompt "${options.prompt.replace(/"/g, '\\"')}"`,
    `--width ${options.width}`,
    `--height ${options.height}`,
    `--num-frames ${options.numFrames}`,
    `--frame-rate ${FPS}`,
    `--api-key "${options.apiKey}"`,
  ];

  const cmd = parts.join(" ");
  console.log(`  Creating video task: ${options.width}x${options.height} ${options.numFrames}f@${FPS}fps`);

  let output;
  try {
    output = execSync(cmd, { encoding: "utf-8", timeout: 1200000, stdio: "pipe" });
  } catch (e) {
    output = (e.stdout || "") + (e.stderr || "");
    if (!output.includes("VIDEO_URL=")) {
      throw new Error(`Video generation failed: ${e.message}\n${output.slice(0, 1000)}`);
    }
  }

  const urlMatch = output.match(/VIDEO_URL=(.+)/);
  if (!urlMatch) {
    throw new Error("Video generation did not return VIDEO_URL");
  }
  const videoUrl = urlMatch[1].trim();

  // Step 2: 下载视频（短命令，设只读）
  const videoPath = options.output;
  await downloadFile(videoUrl, videoPath);

  console.log(`  Video downloaded: ${videoPath} (${fs.statSync(videoPath).size} bytes)`);
  return { videoPath, videoUrl };
}

/**
 * 下载文件并设只读（防止工作区清空）
 */
function downloadFile(url, outputPath) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const file = fs.createWriteStream(outputPath);
  const client = url.startsWith("https") ? https : http;

  return new Promise((resolve, reject) => {
    const fetch = (u, redirects) => {
      if (redirects > 5) return reject(new Error("Too many redirects"));
      client.get(u, { headers: { "User-Agent": "Mozilla/5.0", Connection: "close" }, timeout: 300000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return fetch(new URL(res.headers.location, u).href, redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            // 设只读属性
            try { fs.chmodSync(outputPath, 0o444); } catch (e) {}
            resolve();
          });
        });
      }).on("error", reject).on("timeout", function () { this.destroy(new Error("Download timeout")); });
    };
    fetch(url, 0);
  });
}

// ─── 主流程 ───

async function main() {
  const args = parseArgs(process.argv);
  const apiKey = resolveApiKey(args);

  // 环境检查
  console.log("=== Comedy Show Generator ===");
  findEdgeTts();
  findFFmpeg();
  console.log("  Environment OK");

  // 会话管理
  let workDir;
  let state;

  if (args.resume && args.workDir) {
    workDir = args.workDir;
    state = loadState(workDir);
    if (!state) {
      console.error(`ERROR: No state.json found in ${workDir}`);
      process.exit(1);
    }
    // --output 参数在 resume 模式下也生效
    if (args.output) {
      state.outputPath = args.output;
      saveState(workDir, state);
    }
    console.log(`Resuming session: ${state.sessionId}`);
  } else {
    const scriptText = getScriptText(args);
    const sessionId = generateSessionId();
    workDir = args.workDir || path.join(WORK_DIR, sessionId);
    createSession(workDir);

    state = {
      sessionId,
      step: "idle",
      inputScript: scriptText,
      ratio: args.ratio || "9:16",
      voice: args.voice || VOICES.lively,
      rate: args.rate || DEFAULT_TTS_RATE,
      characterDesc: args.characterDesc || DEFAULT_CHARACTER_DESC,
      noEnhance: args.noEnhance === "true",
      addSubtitles: args.addSubtitles === "true",
      optimizedScript: null,
      scenes: {},
      errors: {},
      outputPath: args.output || path.join(workDir, "final", `comedy_show_${sessionId}.mp4`),
    };

    // 备份原始脚本
    fs.writeFileSync(path.join(workDir, "input_script.txt"), scriptText, "utf-8");
    saveState(workDir, state);
    console.log(`Session: ${sessionId}`);
    console.log(`Work dir: ${workDir}`);
  }

  const ratio = RATIOS[state.ratio] || RATIOS["9:16"];

  // ── Phase 1: 剧本优化 ──
  if (state.step === "idle") {
    console.log("\n--- Phase 1: Script Optimization ---");
    try {
      const result = await optimizeScript(state.inputScript, apiKey, {
        characterDesc: state.characterDesc,
      });
      state.optimizedScript = result;
      state.step = "script";
      saveState(workDir, state);
      console.log(`  ${result.scenes.length} scenes generated`);
      result.scenes.forEach((s, i) => {
        console.log(`  Scene ${i}: ${s.text.slice(0, 30)}...`);
      });
    } catch (e) {
      console.error(`  Script optimization failed: ${e.message}`);
      process.exit(1);
    }
  } else {
    console.log("  Skipping script optimization (already done)");
  }

  const scenes = state.optimizedScript.scenes;

  // ── Phase 2: TTS 音频生成（并行，每段变速变调模拟情绪 + 段尾静音停顿）──
  if (state.step === "script") {
    console.log("\n--- Phase 2: TTS Generation (with emotion + pauses) ---");
    const ttsPromises = scenes.map(async (scene, i) => {
      const audioPath = path.join(workDir, "audio", `scene_${i}.mp3`);
      // 使用 LLM 为每段生成的情绪参数（变速变调）
      const sceneRate = scene.tts_rate || state.rate || DEFAULT_TTS_RATE;
      const scenePitch = scene.tts_pitch || "+0Hz";
      const pauseAfter = scene.pause_after || 400;

      const { duration: ttsDuration } = generateTTS(scene.text, audioPath, {
        voice: state.voice,
        rate: sceneRate,
        pitch: scenePitch,
      });

      // 在段尾追加静音停顿（喜剧节奏：包袱后的"留白"）
      let finalDuration = ttsDuration;
      if (i < scenes.length - 1 && pauseAfter > 0) {
        const silencePath = path.join(workDir, "audio", `silence_${i}.mp3`);
        generateSilence(silencePath, pauseAfter);
        // 拼接 TTS + 静音
        const combinedPath = path.join(workDir, "audio", `scene_${i}_with_pause.mp3`);
        concatAudio([audioPath, silencePath], combinedPath);
        // 用合并后的文件替换原始音频
        fs.copyFileSync(combinedPath, audioPath);
        try { fs.unlinkSync(silencePath); fs.unlinkSync(combinedPath); } catch (e) {}
        finalDuration = getAudioDuration(audioPath);
        console.log(`  Scene ${i}: TTS ${ttsDuration.toFixed(2)}s + pause ${pauseAfter}ms = ${finalDuration.toFixed(2)}s`);
      }

      const numFrames = calcNumFrames(finalDuration, FPS);
      return { index: i, audioPath, duration: finalDuration, numFrames };
    });

    const ttsResults = await Promise.all(ttsPromises);
    for (const r of ttsResults) {
      state.scenes[r.index] = state.scenes[r.index] || {};
      state.scenes[r.index].tts = {
        audioPath: r.audioPath,
        duration: r.duration,
        numFrames: r.numFrames,
      };
      state.scenes[r.index].status = "tts_done";
    }
    state.step = "tts";
    saveState(workDir, state);
    console.log("  All TTS generated (with per-scene emotion + pauses)");
  } else {
    console.log("  Skipping TTS generation (already done)");
  }

  // ── Phase 3: 逐场景视频生成（串行链式）──
  // 包括已合并状态的恢复（用于 Wav2Lip 口型同步后处理）
  // --lipsync-only 模式下也允许进入已口型同步状态（用于重新处理）
  if (state.step === "tts" || state.step === "videos" || state.step === "muxed" || state.step === "merged" ||
      (args.lipsyncOnly && state.step === "lipsynced")) {
    console.log("\n--- Phase 3: Video Generation (Chain) ---");

    // --lipsync-only + --regenerate：重置口型同步状态以重新处理
    if (args.lipsyncOnly && args.regenerate) {
      for (let i = 0; i < scenes.length; i++) {
        if (state.scenes[i]?.status === "lipsynced") {
          state.scenes[i].status = "muxed";
          state.scenes[i].lipsynced = null;
        }
      }
      console.log("  Reset lipsync state for reprocessing");
      saveState(workDir, state);
    }

    // 如果指定了 --regenerate，重置该场景及后续
    if (args.regenerate && args.regenerate !== "true") {
      const regenIdx = parseInt(args.regenerate);
      for (let i = regenIdx; i < scenes.length; i++) {
        state.scenes[i] = { status: "tts_done", tts: state.scenes[i]?.tts };
      }
      console.log(`  Regenerating from scene ${regenIdx}`);
    }

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneState = state.scenes[i] || {};
      const numFrames = sceneState.tts?.numFrames || 241;
      const audioPath = sceneState.tts?.audioPath || path.join(workDir, "audio", `scene_${i}.mp3`);

      console.log(`\n  [Scene ${i}] ${scene.text.slice(0, 40)}...`);

      // 跳过已完成的场景（已口型同步的才完全跳过）
      if (sceneState.status === "lipsynced" && !args.regenerate) {
        console.log("  Already lipsynced, skipping");
        continue;
      }
      if (sceneState.status === "muxed" && args.noLipsync && !args.regenerate) {
        console.log("  Already muxed (no lipsync mode), skipping");
        continue;
      }

      // --lipsync-only 模式：跳过视频生成，仅对口型同步
      if (args.lipsyncOnly) {
        if (!sceneState.muxed?.path) {
          console.error(`  ERROR: Scene ${i} has no muxed video. Run full pipeline first.`);
          process.exit(1);
        }
        console.log("  Lipsync-only mode, skipping video generation");
      }

      // 3a. 生成首帧图片（--lipsync-only 模式跳过）
      if (!args.lipsyncOnly && (!sceneState.frame || sceneState.status === "tts_done")) {
        if (i === 0) {
          // 场景 0：t2i 生成首帧
          console.log("  Generating first frame (t2i)...");
          const prompt = buildImagePrompt(state.characterDesc, scene.visual_description);
          const outputPath = path.join(workDir, "frames", `scene_${i}.png`);
          const result = callImageGen("t2i", {
            prompt,
            size: ratio.imageSize,
            output: outputPath,
            apiKey,
            noEnhance: state.noEnhance,
          });
          sceneState.frame = { localPath: result.localPath, url: result.url, method: "t2i" };
        } else {
          // 场景 1+：使用上一场景的重托管 URL
          const prevRehosted = state.scenes[i - 1]?.rehosted;
          if (!prevRehosted || !prevRehosted.url) {
            console.error(`  ERROR: Previous scene ${i - 1} has no rehosted frame`);
            process.exit(1);
          }
          sceneState.frame = { url: prevRehosted.url, method: "chain" };
          console.log(`  Using rehosted frame from scene ${i - 1}`);
        }
        sceneState.status = "frame_done";
        saveState(workDir, state);
      }

      // 3b. 生成视频（--lipsync-only 模式跳过）
      if (!args.lipsyncOnly && (!sceneState.video || sceneState.status === "frame_done")) {
        console.log("  Generating video...");
        const videoPrompt = buildVideoPrompt(scene.video_motion, state.characterDesc, i);
        const videoPath = path.join(workDir, "videos", `scene_${i}.mp4`);
        const result = await callVideoGen({
          image: sceneState.frame.url,
          prompt: videoPrompt,
          width: ratio.videoWidth,
          height: ratio.videoHeight,
          numFrames,
          output: videoPath,
          apiKey,
        });
        sceneState.video = { videoPath: result.videoPath, videoUrl: result.videoUrl };
        sceneState.status = "video_done";
        saveState(workDir, state);
      }

      // 3c. 提取末帧（如果不是最后一个场景，--lipsync-only 模式跳过）
      if (!args.lipsyncOnly && i < scenes.length - 1 && (!sceneState.lastFrame || sceneState.status === "video_done")) {
        console.log("  Extracting last frame...");
        const lastFramePath = path.join(workDir, "last_frames", `scene_${i}_last.png`);
        extractLastFrame(sceneState.video.videoPath, lastFramePath);
        sceneState.lastFrame = { localPath: lastFramePath };
        sceneState.status = "lastframe_done";
        saveState(workDir, state);

        // 3d. 重托管末帧（i2i 获取公开 URL）
        if (!sceneState.rehosted || sceneState.status === "lastframe_done") {
          console.log("  Re-hosting last frame (i2i)...");
          const rehostPrompt = buildRehostPrompt(state.characterDesc);
          const rehostOutput = path.join(workDir, "frames", `scene_${i}_rehosted.png`);

          let retryCount = 0;
          let rehostResult = null;
          while (retryCount < 5) {
            try {
              rehostResult = callImageGen("i2i", {
                prompt: rehostPrompt,
                image: lastFramePath,
                size: ratio.imageSize,
                output: rehostOutput,
                apiKey,
                noEnhance: true, // 总是关闭增强，保持构图
              });
              break;
            } catch (e) {
              retryCount++;
              if (retryCount >= 5) throw e;
              const wait = Math.pow(2, retryCount) * 5;
              console.log(`  i2i failed, retry ${retryCount}/5 after ${wait}s...`);
              await new Promise((r) => setTimeout(r, wait * 1000));
            }
          }

          sceneState.rehosted = { localPath: rehostResult.localPath, url: rehostResult.url };
          sceneState.status = "rehosted_done";
          saveState(workDir, state);
        }
      }

      // 3e. 音视频混流（--lipsync-only 模式跳过，已有混流文件）
      if (!args.lipsyncOnly && (!sceneState.muxed || sceneState.status === "rehosted_done" || sceneState.status === "video_done")) {
        console.log("  Muxing video + audio...");
        const muxedPath = path.join(workDir, "muxed", `scene_${i}_muxed.mp4`);
        muxVideoAudio(sceneState.video.videoPath, audioPath, muxedPath);
        sceneState.muxed = { path: muxedPath };
        sceneState.status = "muxed";
        saveState(workDir, state);
      }

      // 3e+. Wav2Lip 口型同步后处理（CPU 模式较慢，可用 --no-lipsync 跳过）
      if (!args.noLipsync && (!sceneState.lipsynced || sceneState.status === "muxed")) {
        console.log("  Applying Wav2Lip lip sync...");
        const lipsyncedPath = path.join(workDir, "muxed", `scene_${i}_lipsynced.mp4`);
        try {
          const result = applyLipSync(sceneState.muxed.path, audioPath, lipsyncedPath, {
            resizeFactor: 1,
            faceDetBatch: 8,
            pads: "0 10 0 0",
            quality: "Enhanced",
          });
          sceneState.lipsynced = { path: result.outputPath };
          sceneState.status = "lipsynced";
          saveState(workDir, state);
        } catch (e) {
          console.error(`  Wav2Lip failed, using original muxed video: ${e.message}`);
          sceneState.lipsynced = null;
          sceneState.status = "lipsynced";
          saveState(workDir, state);
        }
      }

      // 3f. 字幕烧录（可选，--add-subtitles）
      if (state.addSubtitles && !sceneState.subtitled) {
        console.log("  Burning subtitles...");
        // 优先使用口型同步后的视频，否则使用混流版
        const srcPath = sceneState.lipsynced?.path || sceneState.muxed.path;
        const subtitledPath = path.join(workDir, "muxed", `scene_${i}_subtitled.mp4`);
        const tempDir = path.join(workDir, "temp");
        burnSubtitles(srcPath, scene.text, subtitledPath, tempDir);
        sceneState.subtitled = { path: subtitledPath };
        saveState(workDir, state);
      }

      state.scenes[i] = sceneState;
      saveState(workDir, state);
    }

    // 根据口型同步状态设置 step
    const allLipsynced = scenes.every((_, i) => state.scenes[i]?.status === "lipsynced");
    state.step = allLipsynced ? "lipsynced" : "muxed";
    saveState(workDir, state);
  } else {
    console.log("  Skipping video generation (already done)");
  }

  // ── Phase 4: 全片合并 ──
  if (state.step !== "merged") {
    console.log("\n--- Phase 4: Final Merge ---");
    const muxedPaths = [];
    for (let i = 0; i < scenes.length; i++) {
      // 优先使用字幕版 → 口型同步版 → 混流版
      const segmentPath = state.scenes[i]?.subtitled?.path || state.scenes[i]?.lipsynced?.path || state.scenes[i]?.muxed?.path;
      if (!segmentPath || !fs.existsSync(segmentPath)) {
        console.error(`  ERROR: Scene ${i} segment file not found: ${segmentPath}`);
        process.exit(1);
      }
      muxedPaths.push(segmentPath);
    }

    const tempDir = path.join(workDir, "temp");
    const finalPath = state.outputPath;

    // 确保输出目录存在
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });

    concatSegments(muxedPaths, finalPath, tempDir, 0.3);
    state.step = "merged";
    saveState(workDir, state);

    console.log(`\n=== Complete! ===`);
    console.log(`Final video: ${finalPath}`);
    console.log(`Size: ${fs.statSync(finalPath).size} bytes`);
  } else {
    console.log("  Already merged");
  }
}

main().catch((e) => {
  console.error(`\nFATAL: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
