/**
 * lipsync_engine.js — Wav2Lip 口型同步封装
 * 使用 Wav2Lip 对生成的视频进行后期口型同步处理
 *
 * 工作原理：
 * 1. 输入：无声视频（来自 Agnes）+ TTS 音频
 * 2. Wav2Lip 分析音频中的音素，驱动视频中人像的嘴部运动
 * 3. 输出：口型与音频同步的新视频
 *
 * 依赖：
 * - Python 3.10 + PyTorch (CPU)
 * - Wav2Lip 仓库（D:\ai_work\musics\Wav2Lip）
 * - PyTorch 库安装在 D:\ai_w2l\libs
 */
const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const WAV2LIP_DIR = "D:\\ai_work\\musics\\Wav2Lip";
const PYTHON_LIBS = "D:\\ai_w2l\\libs";
const CHECKPOINT = path.join(WAV2LIP_DIR, "checkpoints", "wav2lip_gan.pth");

/**
 * 对视频进行 Wav2Lip 口型同步
 * @param {string} videoPath - 输入视频路径（含或不含音频）
 * @param {string} audioPath - 音频路径（TTS 生成的 MP3）
 * @param {string} outputPath - 输出视频路径
 * @param {object} options - { resizeFactor, faceDetBatch, pads, quality }
 * @returns {{ outputPath: string, duration: number }}
 */
function applyLipSync(videoPath, audioPath, outputPath, options = {}) {
  if (!fs.existsSync(CHECKPOINT)) {
    throw new Error(`Wav2Lip checkpoint not found: ${CHECKPOINT}`);
  }
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Input video not found: ${videoPath}`);
  }
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Input audio not found: ${audioPath}`);
  }

  const ffmpeg = findFFmpeg();
  const tempDir = path.join(WAV2LIP_DIR, "temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // 1. 预转换音频为 WAV（16kHz, mono）— 避免 Wav2Lip 内部 ffmpeg 调用使用轻量版
  let wavAudioPath = audioPath;
  if (!audioPath.toLowerCase().endsWith(".wav")) {
    wavAudioPath = path.join(tempDir, "input_audio.wav");
    execSync(`"${ffmpeg}" -y -i "${audioPath}" -ar 16000 -ac 1 "${wavAudioPath}"`, {
      encoding: "utf-8", stdio: "pipe", timeout: 30000,
    });
    console.log(`  Audio converted to WAV: ${wavAudioPath}`);
  }

  // 2. 从输入视频中提取纯视频流（去除音频）
  const tempVideoNoAudio = path.join(tempDir, "input_silent.mp4");
  execSync(`"${ffmpeg}" -y -i "${videoPath}" -c:v copy -an "${tempVideoNoAudio}"`, {
    encoding: "utf-8", stdio: "pipe", timeout: 60000,
  });

  // 3. Wav2Lip 参数
  const resizeFactor = options.resizeFactor || 1;
  const faceDetBatch = options.faceDetBatch || 8;
  const pads = options.pads || "0 10 0 0";
  const quality = options.quality || "Enhanced";
  const checkpoint = quality === "Fast"
    ? path.join(WAV2LIP_DIR, "checkpoints", "wav2lip.pth")
    : CHECKPOINT;

  const inferenceScript = path.join(WAV2LIP_DIR, "inference.py");

  // 4. 构建环境变量
  // PYTHONPATH: 包含 PyTorch 库和 Wav2Lip 目录
  // WAV2LIP_FFMPEG: 指定完整版 ffmpeg 路径（inference.py 中使用）
  const env = {
    ...process.env,
    PYTHONPATH: PYTHON_LIBS + ";" + WAV2LIP_DIR,
    WAV2LIP_FFMPEG: ffmpeg,
  };

  // 构建参数数组（spawnSync 模式下每个参数独立传递，无需 shell 引号，避免路径空格问题）
  const args = [
    inferenceScript,
    "--checkpoint_path", checkpoint,
    "--face", tempVideoNoAudio,
    "--audio", wavAudioPath,
    "--outfile", outputPath,
    "--pads", ...pads.split(/\s+/).filter(Boolean),
    "--resize_factor", String(resizeFactor),
    "--face_det_batch_size", String(faceDetBatch),
    "--wav2lip_batch_size", "8",
    "--nosmooth",
  ];

  // 记录开始时间，提示用户预计等待时长
  const startTime = new Date();
  console.log(`  Wav2Lip 开始处理: ${startTime.toLocaleTimeString("zh-CN")}`);
  console.log(`    Video: ${videoPath}`);
  console.log(`    Audio: ${audioPath}`);
  console.log(`    Quality: ${quality}`);
  console.log(`  预计等待约 15-20 分钟（CPU 模式），tqdm 进度条将实时显示，请耐心等待...`);

  // 使用 spawnSync + stdio: 'inherit' 实时转发 Python 进程的 stdout / stderr
  // Wav2Lip 的 tqdm 进度条输出到 stderr，inherit 模式下直接显示在控制台，不再被缓冲
  // 保留同步调用（spawnSync）以维持函数签名和返回值不变
  const result = spawnSync("python", args, {
    encoding: "utf-8",
    stdio: "inherit",       // 实时转发 stdout/stderr 到控制台，不缓冲
    timeout: 1800000,       // 30 分钟超时（CPU 模式较慢）
    env,
    cwd: WAV2LIP_DIR,
  });

  const elapsedMin = ((Date.now() - startTime.getTime()) / 60000).toFixed(1);

  // spawnSync 不会因非零退出码抛异常，需手动检查退出状态
  if (result.error) {
    // 无法启动 Python 进程（如 python 未安装或不在 PATH 中）
    throw new Error(`Wav2Lip 启动失败: ${result.error.message}`);
  }

  if (result.status !== 0 || result.signal) {
    // 进程异常退出或被超时终止
    // 如果输出文件未创建，检查 temp/result.avi 是否存在（可能推理成功但最终混流失败）
    if (!fs.existsSync(outputPath)) {
      const resultAvi = path.join(tempDir, "result.avi");
      if (fs.existsSync(resultAvi)) {
        // 手动混流：视频（result.avi）+ 音频（wavAudioPath）→ 输出
        console.log(`  Wav2Lip 推理完成（耗时 ${elapsedMin} 分钟），执行手动混流...`);
        execSync(`"${ffmpeg}" -y -i "${resultAvi}" -i "${wavAudioPath}" -c:v libx264 -preset fast -crf 20 -c:a aac -b:a 192k -pix_fmt yuv420p -shortest "${outputPath}"`, {
          encoding: "utf-8", stdio: "pipe", timeout: 120000,
        });
      } else {
        const reason = result.signal
          ? `收到信号 ${result.signal}（可能为 30 分钟超时被终止）`
          : `退出码 ${result.status}`;
        throw new Error(`Wav2Lip 处理失败（${reason}，耗时 ${elapsedMin} 分钟）。详细错误信息请查看上方控制台输出。`);
      }
    }
    console.log(`  Wav2Lip completed (with warnings, 耗时 ${elapsedMin} 分钟)`);
  } else {
    console.log(`  Wav2Lip 推理完成，耗时 ${elapsedMin} 分钟`);
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Wav2Lip output file not created: ${outputPath}`);
  }

  // 5. 清理临时文件
  try {
    fs.unlinkSync(tempVideoNoAudio);
    if (wavAudioPath !== audioPath) fs.unlinkSync(wavAudioPath);
  } catch (e) {}

  const duration = getVideoDuration(outputPath);
  console.log(`  Wav2Lip output: ${outputPath} (${fs.statSync(outputPath).size} bytes, ${duration.toFixed(2)}s)`);

  return { outputPath, duration };
}

/**
 * 批量处理多个场景的口型同步
 * @param {Array} scenes - [{ videoPath, audioPath, outputPath }, ...]
 * @param {object} options - Wav2Lip 选项
 * @returns {Array} 处理结果数组
 */
function batchLipSync(scenes, options = {}) {
  const results = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    console.log(`\n  [LipSync Scene ${i}]`);
    try {
      const result = applyLipSync(scene.videoPath, scene.audioPath, scene.outputPath, options);
      results.push({ index: i, success: true, ...result });
    } catch (e) {
      console.error(`  Scene ${i} lip sync failed: ${e.message}`);
      // 失败时回退到原始视频
      results.push({ index: i, success: false, error: e.message, outputPath: scene.videoPath });
    }
  }
  return results;
}

// ─── 工具函数 ───

function findFFmpeg() {
  const candidates = [
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
      return c;
    } catch (e) {}
  }
  throw new Error("ffmpeg not found");
}

function findFFprobe() {
  const candidates = [
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
      return c;
    } catch (e) {}
  }
  throw new Error("ffprobe not found");
}

function getVideoDuration(videoPath) {
  const ffprobe = findFFprobe();
  const cmd = `"${ffprobe}" -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`;
  const out = execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
  return parseFloat(out.trim()) || 0;
}

module.exports = {
  applyLipSync,
  batchLipSync,
  findFFmpeg,
  findFFprobe,
  getVideoDuration,
};
