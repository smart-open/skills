#!/usr/bin/env node
/**
 * subtitles.js — 为成片烧录国风歌词字幕（stage 5, optional, 纯本地不耗额度）
 *
 * 项目模式（推荐，先跑完阶段 1-4）:
 *   node subtitles.js --project <dir>              # 烧录 -> 05_output/<标题>_MV_字幕.mp4
 *   node subtitles.js --project <dir> --srt-only   # 只导出 SRT
 * 直连模式（任意视频+歌词）:
 *   node subtitles.js --video <mp4> --lyrics <lrc> --out <mp4>
 * 样式:
 *   --style gold|pink   gold=亮鎏金字+黛青描边(默认)  pink=桃粉字
 *   --font 楷体          默认楷体（Windows 自带）；也可用 "Noto Serif CJK SC" 等
 *   --font-size N       字号像素（默认 playResY/28 ≈ 720x1280 下 46px，单行不换行）
 *   --max-line S        单句最长挂屏秒数，默认 8s（间奏不再挂旧歌词）
 *   --offset S          全局时间偏移秒数（正=字幕后移）
 *
 * 时间轴: LRC 时间戳逐句对齐；纯文本歌词按片长均分（前奏 8s 内不出字）。
 * 行尾规则: min(下一句开始, 本句开始+max-line)，间奏期旧歌词最多挂 max-line 秒。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const cli = require("./lib/cli");
const lyrics = require("./lib/lyrics");
const ff = require("./lib/ffmpeg");
const paths = require("./lib/paths");

/* ---------- 时间格式 ---------- */
function assTime(sec) {
  if (sec < 0) sec = 0;
  const cs = Math.round(sec * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}
function srtTime(sec) {
  if (sec < 0) sec = 0;
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000),
    s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(r).padStart(3, "0")}`;
}

/* ---------- 预置样式（ASS 颜色 &HAABBGGRR）---------- */
const STYLES = {
  gold: { primary: "&H00A0D8FF", outline: "&H003A2A1A", back: "&HA0000000" }, // 亮鎏金 + 黛青描边
  pink: { primary: "&H00D8C4F8", outline: "&H00302A28", back: "&HA0000000" }, // 桃粉 + 深黛描边
};

function buildAss({ lines, playResX, playResY, font, styleKey, title, fontSize }) {
  const st = STYLES[styleKey] || STYLES.gold;
  const fs = Math.max(12, Math.round(fontSize || playResY / 28));
  const header = [
    "[Script Info]",
    `Title: ${title || "lyrics"}`,
    "ScriptType: v4.00+",
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Guofeng,${font},${fs},${st.primary},&H00FFFFFF,${st.outline},${st.back},0,0,0,0,100,100,0.5,0,1,1.4,0.9,2,48,48,${Math.round(playResY / 14)},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events = lines.map(
    (l) => `Dialogue: 0,${assTime(l.start)},${assTime(l.end)},Guofeng,,0,0,0,,{\\fad(250,250)}${l.text}`
  );
  return header.concat(events).join("\n") + "\n";
}

/* ---------- 歌词 -> 带起止时间的字幕行 ---------- */
const MIN_DISPLAY = 1.6; // 单句最短显示秒数
function buildLines(parsed, totalDuration, maxLineSec) {
  const maxLine = Math.max(MIN_DISPLAY, maxLineSec || 8);
  const timed = (parsed.lines || []).filter((l) => l.time !== null && l.text && l.text.trim());
  if (timed.length) {
    return timed.map((l, i) => {
      const start = l.time;
      const nextStart = i + 1 < timed.length ? timed[i + 1].time : (totalDuration || l.time + 6);
      // 行尾封顶: 间奏期旧歌词最多挂 maxLine 秒，不再一直挂到下一句
      let end = Math.min(nextStart, start + maxLine);
      if (end - start < MIN_DISPLAY) end = nextStart; // 过密句不与下一句重叠
      return { text: l.text.trim(), start, end };
    });
  }
  const plain = (parsed.lines || []).map((l) => (l.text || "").trim()).filter(Boolean);
  if (!plain.length || !totalDuration) return [];
  const intro = Math.min(8, totalDuration * 0.05);
  const span = (totalDuration - intro) / plain.length;
  return plain.map((text, i) => ({ text, start: intro + i * span, end: intro + (i + 1) * span }));
}

function runFfmpeg(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(ff.FFMPEG, args, { timeout: 30 * 60000, maxBuffer: 64 * 1024 * 1024, windowsHide: true, cwd: cwd || undefined },
      (err, stdout, stderr) => (err ? reject(new Error(String(stderr || err.message).slice(-2000))) : resolve()));
  });
}

/* ---------- 输入定位 ---------- */
function findLyricsInProject(projectDir) {
  const sourceDir = path.join(projectDir, cli.STAGE_DIRS.source);
  if (!fs.existsSync(sourceDir)) return null;
  const cand = fs.readdirSync(sourceDir)
    .filter((f) => /\.(txt|lrc)$/i.test(f))
    .sort((a, b) => (b.toLowerCase().endsWith(".lrc") ? 1 : 0) - (a.toLowerCase().endsWith(".lrc") ? 1 : 0));
  return cand.length ? path.join(sourceDir, cand[0]) : null;
}
function findVideoInProject(projectDir, project) {
  if (project && project.output && fs.existsSync(project.output)) return project.output;
  const outDir = path.join(projectDir, cli.STAGE_DIRS.output);
  if (fs.existsSync(outDir)) {
    const cands = fs.readdirSync(outDir).filter((f) => f.toLowerCase().endsWith(".mp4") && !f.includes("字幕"));
    if (cands.length) return path.join(outDir, cands.sort().pop());
  }
  return null;
}

async function main() {
  const SPEC = {
    "--project": { key: "project", type: "string", desc: "Project directory (default: the unique project under out/)" },
    "--video": { key: "video", type: "string", desc: "Direct mode: video to burn subtitles onto" },
    "--lyrics": { key: "lyrics", type: "string", desc: "Direct mode: lyrics file (LRC or plain text)" },
    "--out": { key: "out", type: "string", desc: "Direct mode: output mp4 path" },
    "--style": { key: "style", type: "string", desc: "gold (default) or pink" },
    "--font": { key: "font", type: "string", desc: "Font name, default 楷体" },
    "--srt-only": { key: "srtOnly", type: "bool", desc: "Only export an .srt next to the video, no burning" },
  };
  const USAGE = `subtitles.js — burn Guofeng-styled lyric subtitles into the final MV (local, no API cost)

Options:
  --project <dir>       Project directory (default: the unique project under out/)
  --video <mp4>         Direct mode: target video
  --lyrics <file>       Direct mode: lyrics (LRC timestamps preferred)
  --out <mp4>           Direct mode: output path
  --style gold|pink     Subtitle colour scheme (default gold)
  --font <name>         Font family (default 楷体)
  --font-size <px>      Font size in px (default playResY/28, one line, no wrap)
  --max-line <sec>      Max seconds a lyric line stays visible (default 8)
  --offset <sec>        Shift all subtitles by N seconds (positive = later)
  --srt-only            Export .srt only

Example:
  node subtitles.js --project ./mv-song`;
  const parse = cli.createParser(SPEC, USAGE);
  const args = parse(process.argv.slice(2));
  ff.assertFfmpegAvailable();

  // ---- 定位视频与歌词 ----
  let videoPath, lyricsPath, workDir, outVideo;
  if (args.video) {
    videoPath = path.resolve(args.video);
    if (!args.lyrics) throw new Error("直连模式需要 --lyrics <歌词文件>");
    lyricsPath = path.resolve(args.lyrics);
    if (!fs.existsSync(videoPath)) throw new Error("视频不存在: " + videoPath);
    if (!fs.existsSync(lyricsPath)) throw new Error("歌词不存在: " + lyricsPath);
    outVideo = args.out
      ? path.resolve(args.out)
      : videoPath.replace(/\.mp4$/i, "_字幕.mp4");
    workDir = path.dirname(outVideo);
  } else {
    const projectDir = cli.resolveProjectDir(args.project || args._positional[0]);
    const project = cli.loadProject(projectDir);
    videoPath = findVideoInProject(projectDir, project);
    lyricsPath = findLyricsInProject(projectDir);
    if (!videoPath) throw new Error("未找到成片（05_output/ 为空），请先完成阶段 4 组装。");
    if (!lyricsPath) throw new Error("项目 00_source/ 内无歌词文件（.txt/.lrc），可用 --lyrics 显式指定。");
    workDir = projectDir;
    outVideo = path.join(projectDir, cli.STAGE_DIRS.output,
      path.basename(videoPath).replace(/\.mp4$/i, "_字幕.mp4"));
  }

  // ---- 解析歌词与视频参数 ----
  const parsed = lyrics.loadLyrics(lyricsPath, null);
  const mv = ff.probeMedia(videoPath);
  const duration = mv.duration || 0;
  const width = mv.width || 1280, height = mv.height || 720;
  const lines = buildLines(parsed, duration, args.maxLine);
  if (args.offset) {
    for (const l of lines) {
      l.start = Math.max(0, l.start + args.offset);
      l.end = Math.max(0, l.end + args.offset);
    }
  }
  if (!lines.length) throw new Error("歌词为空，无法生成字幕。");

  const base = path.basename(videoPath).replace(/\.mp4$/i, "");
  const buildDir = path.join(workDir, cli.STAGE_DIRS.build);
  fs.mkdirSync(buildDir, { recursive: true });

  // ---- SRT（外挂备用）----
  const srtPath = path.join(buildDir, `${base}.srt`);
  fs.writeFileSync(
    srtPath,
    lines.map((l, i) => `${i + 1}\n${srtTime(l.start)} --> ${srtTime(l.end)}\n${l.text}\n`).join("\n"),
    "utf8"
  );
  console.log(`[srt] ${paths.rel(srtPath)}  (${lines.length} 句)`);
  if (args.srtOnly) { console.log("SRT_ONLY=" + srtPath); return; }

  // ---- ASS（固定短文件名 + 相对路径读取，彻底绕开盘符冒号转义问题）----
  const styleKey = args.style === "pink" ? "pink" : "gold";
  const font = args.font || "楷体";
  const assPath = path.join(buildDir, "subs.ass");
  fs.writeFileSync(assPath, buildAss({ lines, playResX: width, playResY: height, font, styleKey, title: base }), "utf8");
  console.log(`[ass] ${paths.rel(assPath)}  (style=${styleKey}, font=${font}, size=${Math.max(12, Math.round(args.fontSize || height / 28))}px, maxLine=${args.maxLine || 8}s, offset=${args.offset || 0}s, ${width}x${height}, duration=${duration.toFixed(2)}s)`);

  // ---- 烧录（视频重编码、音频直通）----
  await runFfmpeg([
    "-y", "-i", videoPath,
    "-vf", "ass=subs.ass",
    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p",
    "-c:a", "copy", "-movflags", "+faststart",
    outVideo,
  ], buildDir);
  const sz = fs.statSync(outVideo).size;
  console.log(`[done] ${paths.rel(outVideo)}  (${(sz / 1024 / 1024).toFixed(1)} MB)`);
  console.log("SUBTITLED_VIDEO=" + outVideo);
}

main().catch((e) => {
  console.error("subtitles.js FAILED: " + (e && e.message));
  process.exit(1);
});
