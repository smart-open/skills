/**
 * merge_engine.js — FFmpeg 封装（末帧提取 + 混流 + concat + 字幕）
 * 依赖：FFmpeg、FFprobe（通过 child_process 调用）
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ─── FFmpeg 路径检测 ───

let _ffmpegPath = null;
let _ffprobePath = null;

function findFFmpeg() {
  if (_ffmpegPath) return _ffmpegPath;

  const candidates = [
    // WinGet 完整版优先（TRAE 内置轻量版可能缺少编解码器和滤镜）
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

  throw new Error("ffmpeg not found. Please install FFmpeg (full build with drawtext support).");
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

// ─── 核心功能 ───

/**
 * 从视频中提取最后一帧
 * @param {string} videoPath - 视频文件路径
 * @param {string} outputPngPath - 输出 PNG 路径
 */
function extractLastFrame(videoPath, outputPngPath) {
  const ffmpeg = findFFmpeg();
  const cmd = `"${ffmpeg}" -y -sseof -0.1 -i "${videoPath}" -update 1 -q:v 1 "${outputPngPath}"`;

  try {
    execSync(cmd, { encoding: "utf-8", stdio: "pipe", timeout: 30000 });
  } catch (e) {
    // 有时 -sseof 提取2帧，-update 1 只保留最后1帧，但可能有警告
    // 检查输出文件是否存在
    if (!fs.existsSync(outputPngPath)) {
      throw new Error(`Failed to extract last frame: ${e.message}`);
    }
  }

  if (!fs.existsSync(outputPngPath)) {
    throw new Error(`Last frame file not created: ${outputPngPath}`);
  }

  console.log(`  Last frame extracted: ${outputPngPath}`);
}

/**
 * 音视频混流（视频 + 音频 → 合并文件）
 * 使用 -map 明确指定流：视频取自第一输入，音频取自第二输入（TTS）
 * 确保即使视频已含音频（如 Seedance 生成的音频），TTS 音频也会替换它
 * @param {string} videoPath - 视频路径（可能有或没有音频）
 * @param {string} audioPath - TTS 音频路径
 * @param {string} outputPath - 输出路径
 */
function muxVideoAudio(videoPath, audioPath, outputPath) {
  const ffmpeg = findFFmpeg();
  // -map 0:v:0: 取视频流（来自视频文件）
  // -map 1:a:0: 取音频流（来自 TTS 音频文件，替换视频原有音频）
  const cmd = `"${ffmpeg}" -y -i "${videoPath}" -i "${audioPath}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest "${outputPath}"`;

  execSync(cmd, { encoding: "utf-8", stdio: "pipe", timeout: 60000 });

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Mux output file not created: ${outputPath}`);
  }

  console.log(`  Muxed: ${outputPath} (${fs.statSync(outputPath).size} bytes)`);
}

/**
 * 拼接多个视频片段（带 xfade 转场效果）
 * @param {string[]} segmentPaths - 视频片段路径数组
 * @param {string} outputPath - 输出路径
 * @param {string} tempDir - 临时目录
 * @param {number} transitionDuration - 转场时长（秒），默认 0.5
 */
function concatSegments(segmentPaths, outputPath, tempDir, transitionDuration) {
  const ffmpeg = findFFmpeg();
  const td = transitionDuration || 0.5;

  if (segmentPaths.length === 1) {
    // 单个片段直接复制
    fs.copyFileSync(segmentPaths[0], outputPath);
    console.log(`  Single segment, copied to: ${outputPath}`);
    return;
  }

  // 使用 xfade 滤镜链实现转场
  // 需要获取每个片段的时长来计算 offset
  const durations = segmentPaths.map((p) => getVideoDuration(p));
  console.log(`  Segment durations: ${durations.map((d) => d.toFixed(2) + "s").join(", ")}`);

  // 构建 xfade 滤镜链
  // 对于 N 个片段，需要 N-1 个 xfade
  // 每个 xfade 的 offset = 前面所有片段时长之和 - 当前转场时长 * 已完成的转场数
  let filterParts = [];
  let prevLabel = "0:v"; // 第一个输入流
  let cumulativeDuration = 0;
  let transitionCount = 0;

  for (let i = 1; i < segmentPaths.length; i++) {
    cumulativeDuration += durations[i - 1];
    // offset 需要减去前面的转场时长重叠
    const offset = Math.max(0, cumulativeDuration - td * (transitionCount + 1));
    const currentLabel = `v${i}`;

    if (i === 1) {
      filterParts.push(`[0:v][1:v]xfade=transition=fade:duration=${td}:offset=${offset.toFixed(3)}[${currentLabel}]`);
    } else {
      filterParts.push(`[${prevLabel}][${i}:v]xfade=transition=fade:duration=${td}:offset=${offset.toFixed(3)}[${currentLabel}]`);
    }

    prevLabel = currentLabel;
    transitionCount++;
  }

  // 音频部分：简单 adelay + amix 处理转场期间的音频交叉
  let audioFilterParts = [];
  let prevAudioLabel = "0:a";
  let audioCumulative = 0;

  for (let i = 1; i < segmentPaths.length; i++) {
    audioCumulative += durations[i - 1];
    const offset = Math.max(0, audioCumulative - td * i);
    const currentLabel = `a${i}`;

    if (i === 1) {
      audioFilterParts.push(`[0:a][1:a]acrossfade=d=${td}[${currentLabel}]`);
    } else {
      audioFilterParts.push(`[${prevAudioLabel}][${i}:a]acrossfade=d=${td}[${currentLabel}]`);
    }
    prevAudioLabel = currentLabel;
  }

  const lastVideoLabel = prevLabel;
  const lastAudioLabel = prevAudioLabel;

  // 构建输入参数
  const inputArgs = segmentPaths.map((p) => `-i "${p}"`).join(" ");

  // 构建完整滤镜
  const filterComplex = [...filterParts, ...audioFilterParts].join(";");

  const cmd = `"${ffmpeg}" -y ${inputArgs} -filter_complex "${filterComplex}" -map "[${lastVideoLabel}]" -map "[${lastAudioLabel}]" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "${outputPath}"`;

  console.log(`  Concatenating ${segmentPaths.length} segments with xfade transitions (${td}s)...`);
  try {
    execSync(cmd, { encoding: "utf-8", stdio: "pipe", timeout: 600000 });
  } catch (e) {
    // xfade 可能因版本或参数问题失败，回退到简单 concat
    console.log(`  xfade failed, falling back to simple concat...`);
    return concatSegmentsSimple(segmentPaths, outputPath, tempDir);
  }

  if (!fs.existsSync(outputPath)) {
    console.log(`  xfade output not found, falling back to simple concat...`);
    return concatSegmentsSimple(segmentPaths, outputPath, tempDir);
  }

  console.log(`  Final video (xfade): ${outputPath} (${fs.statSync(outputPath).size} bytes)`);
}

/**
 * 简单拼接（concat demuxer + re-encode，无转场效果）
 * @param {string[]} segmentPaths - 视频片段路径数组
 * @param {string} outputPath - 输出路径
 * @param {string} tempDir - 临时目录
 */
function concatSegmentsSimple(segmentPaths, outputPath, tempDir) {
  const ffmpeg = findFFmpeg();

  // 创建 concat 列表文件
  const listPath = path.join(tempDir, "concat_list.txt");
  const lines = segmentPaths
    .map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n");
  fs.writeFileSync(listPath, lines, "utf-8");

  // re-encode 保证所有片段编码一致
  const cmd = `"${ffmpeg}" -y -f concat -safe 0 -i "${listPath}" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "${outputPath}"`;

  console.log(`  Concatenating ${segmentPaths.length} segments (simple)...`);
  execSync(cmd, { encoding: "utf-8", stdio: "pipe", timeout: 300000 });

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Concat output file not created: ${outputPath}`);
  }

  console.log(`  Final video: ${outputPath} (${fs.statSync(outputPath).size} bytes)`);
}

/**
 * 烧录字幕到视频（drawtext 滤镜）
 * @param {string} videoPath - 输入视频路径
 * @param {string} text - 字幕文本
 * @param {string} outputPath - 输出路径
 * @param {string} tempDir - 临时目录（用于存放字体文件）
 */
function burnSubtitles(videoPath, text, outputPath, tempDir) {
  const ffmpeg = findFFmpeg();

  // 复制字体到临时目录（避免 Windows 路径冒号问题）
  const fontSrc = "C:\\Windows\\Fonts\\simhei.ttf";
  const fontDst = path.join(tempDir, "simhei.ttf");
  if (!fs.existsSync(fontDst)) {
    fs.copyFileSync(fontSrc, fontDst);
  }

  // 转义文本中的特殊字符
  const escapedText = text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");

  // drawtext 滤镜：底部居中，白色文字带黑色描边
  const filter = `drawtext=fontfile=simhei.ttf:text='${escapedText}':fontcolor=white:fontsize=36:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h-text_h-40`;

  const cmd = `"${ffmpeg}" -y -i "${videoPath}" -vf "${filter}" -c:a copy -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p "${outputPath}"`;

  // 注意：需要设置 cwd 为 tempDir，以便 drawtext 找到 simhei.ttf
  execSync(cmd, { encoding: "utf-8", stdio: "pipe", timeout: 120000, cwd: tempDir });

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Subtitle burn output not created: ${outputPath}`);
  }

  console.log(`  Subtitles burned: ${outputPath}`);
}

/**
 * 获取视频时长
 * @param {string} videoPath
 * @returns {number} 时长（秒）
 */
function getVideoDuration(videoPath) {
  const ffprobe = findFFprobe();
  const cmd = `"${ffprobe}" -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`;
  const out = execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
  return parseFloat(out.trim());
}

module.exports = {
  extractLastFrame,
  muxVideoAudio,
  concatSegments,
  concatSegmentsSimple,
  burnSubtitles,
  getVideoDuration,
  findFFmpeg,
  findFFprobe,
};
