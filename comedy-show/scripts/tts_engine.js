/**
 * tts_engine.js — Edge TTS 封装（音频生成 + 时长提取 + 帧数计算）
 * 依赖：Python edge-tts (CLI)、FFprobe
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ─── 路径检测 ───

let _edgeTtsPath = null;
let _ffprobePath = null;
let _ffmpegPath = null;

function findEdgeTts() {
  if (_edgeTtsPath) return _edgeTtsPath;

  // 候选路径
  const candidates = [
    // PATH 中的 edge-tts
    "edge-tts",
    "edge-tts.exe",
    // TRAE Python Scripts 目录
    path.join(
      process.env.USERPROFILE || "C:\\Users\\tianw",
      "AppData\\Roaming\\TRAE SOLO CN\\ModularData\\ai-agent\\vm\\tools\\python\\Scripts\\edge-tts.exe"
    ),
  ];

  for (const c of candidates) {
    try {
      execSync(`"${c}" --version`, { encoding: "utf-8", stdio: "pipe", timeout: 10000 });
      _edgeTtsPath = c;
      return c;
    } catch (e) {
      // continue
    }
  }

  // 尝试 python -m edge_tts
  try {
    execSync('python -m edge_tts --version', { encoding: "utf-8", stdio: "pipe", timeout: 10000 });
    _edgeTtsPath = "python -m edge_tts";
    return _edgeTtsPath;
  } catch (e) {}

  throw new Error(
    "edge-tts not found. Install with: pip install edge-tts"
  );
}

function findFFprobe() {
  if (_ffprobePath) return _ffprobePath;

  const candidates = [
    // WinGet 完整版优先（TRAE 内置轻量版可能缺少编解码器）
    path.join(
      process.env.USERPROFILE || "C:\\Users\\tianw",
      "AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffprobe.exe"
    ),
    "C:\\ffmpeg\\bin\\ffprobe.exe",
    "ffprobe",
    "ffprobe.exe",
  ];

  for (const c of candidates) {
    try {
      execSync(`"${c}" -version`, { encoding: "utf-8", stdio: "pipe", timeout: 5000 });
      _ffprobePath = c;
      return c;
    } catch (e) {}
  }

  throw new Error("ffprobe not found. Please install FFmpeg.");
}

function findFFmpeg() {
  if (_ffmpegPath) return _ffmpegPath;

  const candidates = [
    // WinGet 完整版优先（TRAE 内置轻量版可能缺少编解码器）
    path.join(
      process.env.USERPROFILE || "C:\\Users\\tianw",
      "AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe"
    ),
    "C:\\ffmpeg\\bin\\ffmpeg.exe",
    "ffmpeg",
    "ffmpeg.exe",
  ];

  for (const c of candidates) {
    try {
      execSync(`"${c}" -version`, { encoding: "utf-8", stdio: "pipe", timeout: 5000 });
      _ffmpegPath = c;
      return c;
    } catch (e) {}
  }

  throw new Error("ffmpeg not found. Please install FFmpeg.");
}

// ─── 核心功能 ───

/**
 * 生成 TTS 音频（支持变速变调模拟情绪）
 * @param {string} text - 口播文本
 * @param {string} outputPath - 输出 MP3 路径
 * @param {object} options - { voice, rate, volume, pitch }
 * @returns {{ audioPath: string, duration: number }}
 */
function generateTTS(text, outputPath, options = {}) {
  const edgeTts = findEdgeTts();
  const voice = options.voice || "zh-CN-XiaoxiaoNeural";

  // 将文本写入临时文件（避免命令行特殊字符问题）
  const textFile = outputPath.replace(/\.[^.]+$/, ".txt");
  fs.writeFileSync(textFile, text, "utf-8");

  // 构建 edge-tts 命令
  const parts = [
    `"${edgeTts}"`,
    `--voice "${voice}"`,
    `--file "${textFile}"`,
    `--write-media "${outputPath}"`,
  ];

  // rate: 语速（如 "-10%", "+5%"）
  if (options.rate) parts.push(`--rate=${options.rate}`);
  // pitch: 音调（如 "-10Hz", "+15Hz"）— 模拟情绪起伏
  if (options.pitch) parts.push(`--pitch=${options.pitch}`);
  if (options.volume) parts.push(`--volume=${options.volume}`);

  const cmd = parts.join(" ");

  try {
    execSync(cmd, { encoding: "utf-8", stdio: "pipe", timeout: 120000 });
  } catch (e) {
    throw new Error(`edge-tts failed: ${e.message}`);
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(`TTS output file not created: ${outputPath}`);
  }

  const duration = getAudioDuration(outputPath);
  console.log(`  TTS generated: ${outputPath} (${duration.toFixed(2)}s, rate=${options.rate || "default"}, pitch=${options.pitch || "default"})`);

  // 清理临时文本文件
  try { fs.unlinkSync(textFile); } catch (e) {}

  return { audioPath: outputPath, duration };
}

/**
 * 生成静音音频文件（用于段间停顿）
 * @param {string} outputPath - 输出 MP3 路径
 * @param {number} durationMs - 静音时长（毫秒）
 * @returns {{ audioPath: string, duration: number }}
 */
function generateSilence(outputPath, durationMs) {
  const ffmpeg = findFFmpeg();
  const durationSec = durationMs / 1000;
  const cmd = `"${ffmpeg}" -y -f lavfi -i anullsrc=r=24000:cl=mono -t ${durationSec} -q:a 9 "${outputPath}"`;

  execSync(cmd, { encoding: "utf-8", stdio: "pipe", timeout: 30000 });

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Silence file not created: ${outputPath}`);
  }

  const duration = getAudioDuration(outputPath);
  return { audioPath: outputPath, duration };
}

/**
 * 拼接多个音频文件（含静音停顿）
 * @param {string[]} audioPaths - 音频文件路径数组
 * @param {string} outputPath - 输出路径
 * @returns {{ audioPath: string, duration: number }}
 */
function concatAudio(audioPaths, outputPath) {
  const ffmpeg = findFFmpeg();
  // 创建 concat 列表文件
  const listFile = outputPath.replace(/\.[^.]+$/, "_list.txt");
  const listContent = audioPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  fs.writeFileSync(listFile, listContent, "utf-8");

  const cmd = `"${ffmpeg}" -y -f concat -safe 0 -i "${listFile}" -c copy "${outputPath}"`;
  execSync(cmd, { encoding: "utf-8", stdio: "pipe", timeout: 60000 });

  try { fs.unlinkSync(listFile); } catch (e) {}

  const duration = getAudioDuration(outputPath);
  console.log(`  Audio concatenated: ${outputPath} (${duration.toFixed(2)}s)`);
  return { audioPath: outputPath, duration };
}

/**
 * 获取音频时长（秒）
 * @param {string} audioPath - 音频文件路径
 * @returns {number} 时长（秒）
 */
function getAudioDuration(audioPath) {
  const ffprobe = findFFprobe();
  const cmd = `"${ffprobe}" -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`;
  const out = execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
  const duration = parseFloat(out.trim());
  if (isNaN(duration) || duration <= 0) {
    throw new Error(`Invalid audio duration for ${audioPath}: ${out.trim()}`);
  }
  return duration;
}

/**
 * 根据音频时长计算视频帧数（8n+1 规则，clamp [9, 441]）
 * @param {number} duration - 音频时长（秒）
 * @param {number} fps - 帧率（默认 24）
 * @returns {number} 帧数
 */
function calcNumFrames(duration, fps = 24) {
  const rawFrames = Math.round(duration * fps);

  // 找最近的 8n+1 值
  const n = Math.round((rawFrames - 1) / 8);

  // 检查相邻值
  const candidates = [];
  for (const delta of [-1, 0, 1]) {
    const f = (n + delta) * 8 + 1;
    if (f >= 9 && f <= 441) {
      candidates.push(f);
    }
  }

  if (candidates.length === 0) {
    // 如果超出范围，clamp 到最近边界
    return Math.max(9, Math.min(441, rawFrames));
  }

  // 选择最接近原始帧数的值
  return candidates.reduce((best, f) =>
    Math.abs(f - rawFrames) < Math.abs(best - rawFrames) ? f : best
  , candidates[0]);
}

module.exports = {
  generateTTS,
  generateSilence,
  concatAudio,
  getAudioDuration,
  calcNumFrames,
  findEdgeTts,
  findFFprobe,
  findFFmpeg,
};
