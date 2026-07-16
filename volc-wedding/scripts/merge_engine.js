#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * Merge Engine
 * ============
 * FFmpeg-based video merging with xfade transitions,
 * title/ending clips, and optional dynasty subtitles.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ---- Full FFmpeg path detection ----
// TRAE bundles a minimal ffmpeg that lacks xfade/drawtext/concat-safe.
// We detect the winget-installed full build and prefer it.
const FULL_FFMPEG_CANDIDATES = [
  process.env["FFMPEG_PATH"],
  "C:\\Users\\tianw\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe",
  "C:\\Users\\tianw\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1\\bin\\ffmpeg.exe",
  "C:\\ffmpeg\\bin\\ffmpeg.exe",
];

function findFullFfmpeg() {
  for (const p of FULL_FFMPEG_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  return "ffmpeg"; // fallback to PATH
}

const FFMPEG = findFullFfmpeg();
const FFPROBE = FFMPEG.replace(/ffmpeg\.exe$/i, "ffprobe.exe");

if (FFMPEG !== "ffmpeg") {
  console.log("  Using full FFmpeg: " + FFMPEG);
}

// ---- FFmpeg helpers ----
function checkFfmpeg() {
  try {
    execSync(`"${FFMPEG}" -version`, { encoding: "utf-8", stdio: "ignore" });
    return true;
  } catch (e) {
    return false;
  }
}

function getFfmpegVersion() {
  try {
    const out = execSync(`"${FFMPEG}" -version`, { encoding: "utf-8" });
    const m = out.match(/version\s+(\d+)\.(\d+)/i);
    if (m) return { major: parseInt(m[1], 10), minor: parseInt(m[2], 10) };
  } catch (e) {}
  return null;
}

function hasXfade() {
  const v = getFfmpegVersion();
  if (!v) return false;
  return v.major > 4 || (v.major === 4 && v.minor >= 4);
}

function getDuration(videoPath) {
  try {
    const out = execSync(
      `"${FFPROBE}" -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
      { encoding: "utf-8" }
    );
    return parseFloat(out.trim());
  } catch (e) {
    console.error("  Warning: could not get duration for " + videoPath + ", using default 8.0s");
    return 8.0;
  }
}

function getVideoResolution(videoPath) {
  try {
    const out = execSync(
      `"${FFPROBE}" -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`,
      { encoding: "utf-8" }
    );
    return out.trim();
  } catch (e) {
    return null;
  }
}

// ---- Subtitle overlay ----
function buildSubtitleFilter(dynasty, duration) {
  const subText = `${dynasty.name} | ${dynasty.eraTheme} | ${dynasty.eraYears}`;
  const fadeIn = 0.5;
  const displayEnd = Math.min(2.5, duration - 0.5);
  if (displayEnd <= 0) return "";
  return (
    `drawtext=text='${subText}':fontsize=28:fontcolor=white:` +
    `x=(w-text_w)/2:y=h-text_h-40:` +
    `borderw=2:bordercolor=black@0.6:` +
    `enable='between(t,${fadeIn},${displayEnd})'`
  );
}

async function burnSubtitle(videoPath, dynasty, outPath) {
  const duration = getDuration(videoPath);
  const subFilter = buildSubtitleFilter(dynasty, duration);
  if (!subFilter) {
    // Just copy
    if (videoPath !== outPath) {
      try { fs.copyFileSync(videoPath, outPath); } catch (e) { return videoPath; }
    }
    return outPath;
  }
  const cmd =
    `"${FFMPEG}" -i "${videoPath}" -vf "${subFilter}" ` +
    `-c:v libx264 -preset fast -crf 20 ` +
    `-c:a copy -y "${outPath}"`;
  try {
    execSync(cmd, { encoding: "utf-8", stdio: "ignore" });
    return outPath;
  } catch (e) {
    console.error("  Warning: subtitle burn failed for " + dynasty.name + ", using original.");
    try { fs.copyFileSync(videoPath, outPath); } catch (e2) { return videoPath; }
    return outPath;
  }
}

// ---- Font path for Chinese text ----
const FONT_PATH = "C:/Windows/Fonts/simhei.ttf";
const FONT_FILE_NAME = "simhei.ttf";

function fontExists() {
  return fs.existsSync(FONT_PATH);
}

function prepareFont(tempDir) {
  const dest = path.join(tempDir, FONT_FILE_NAME);
  if (fontExists() && !fs.existsSync(dest)) {
    try {
      fs.copyFileSync(FONT_PATH, dest);
    } catch (e) {}
  }
  return fs.existsSync(dest) ? `fontfile=${FONT_FILE_NAME}:` : "";
}

// ---- Dynasty title card (inserted before each video) ----
function buildDynastyCard(dynasty, resolution, tempDir) {
  const cardPath = path.join(tempDir, dynasty.id + "_card.mp4");
  const name = dynasty.name;
  const summary = dynasty.storySummary || "";
  const years = dynasty.eraYears || "";

  const fontOpt = prepareFont(tempDir);

  const cmd =
    `"${FFMPEG}" -f lavfi -i color=c=black:s=${resolution}:d=2.5 -vf "` +
    `fade=t=in:st=0:d=0.3,` +
    `drawtext=${fontOpt}text='${name}':fontsize=52:fontcolor=gold:x=(w-text_w)/2:y=(h-text_h)/2-45:enable='between(t,0.3,2.2)',` +
    `drawtext=${fontOpt}text='${summary}':fontsize=26:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2+15:enable='between(t,0.5,2.2)',` +
    `drawtext=${fontOpt}text='${years}':fontsize=18:fontcolor=gray:x=(w-text_w)/2:y=(h-text_h)/2+60:enable='between(t,0.7,2.2)',` +
    `fade=t=out:st=2.2:d=0.3" ` +
    `-c:v libx264 -preset fast -crf 23 -an -y "${cardPath}"`;

  try {
    execSync(cmd, { encoding: "utf-8", stdio: "ignore", cwd: tempDir });
    return cardPath;
  } catch (e) {
    console.error("  Warning: dynasty card generation failed for " + dynasty.name + ": " + e.message.split("\n")[0]);
    return null;
  }
}

// ---- Opening title clip ----
function buildTitleClip(dynasties, resolution, tempDir) {
  const titlePath = path.join(tempDir, "title.mp4");
  const titleText = "\u51e0\u751f\u51e0\u4e16 \u8de8\u65f6\u7a7a\u76f8\u7231"; // 几生几世 跨时空相爱
  const subText = "Cross-Era Wedding";
  const eraList = dynasties.map((d) => d.name).join(" \u2192 "); // →

  const fontOpt = prepareFont(tempDir);

  const cmd =
    `"${FFMPEG}" -f lavfi -i color=c=black:s=${resolution}:d=4 -vf "` +
    `fade=t=in:st=0:d=0.5,` +
    `drawtext=${fontOpt}text='${titleText}':fontsize=42:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-50:enable='between(t,0.5,4)',` +
    `drawtext=${fontOpt}text='${subText}':fontsize=22:fontcolor=gray:x=(w-text_w)/2:y=(h-text_h)/2+10:enable='between(t,0.5,4)',` +
    `drawtext=${fontOpt}text='${eraList}':fontsize=18:fontcolor=gold:x=(w-text_w)/2:y=(h-text_h)/2+55:enable='between(t,1,4)',` +
    `fade=t=out:st=3.5:d=0.5" ` +
    `-c:v libx264 -preset fast -crf 23 -an -y "${titlePath}"`;

  try {
    execSync(cmd, { encoding: "utf-8", stdio: "ignore", cwd: tempDir });
    return titlePath;
  } catch (e) {
    console.error("  Warning: title clip generation failed: " + e.message.split("\n")[0]);
    return null;
  }
}

// ---- Ending clip ----
function buildEndingClip(resolution, tempDir) {
  const endingPath = path.join(tempDir, "ending.mp4");
  const titleText = "\u4eca\u751f\u4eca\u4e16 \u6c38\u4e0d\u5206\u79bb"; // 今生今世 永不分离
  const subText = "Forever and Always";

  const fontOpt = prepareFont(tempDir);

  const cmd =
    `"${FFMPEG}" -f lavfi -i color=c=black:s=${resolution}:d=5 -vf "` +
    `fade=t=in:st=0:d=1,` +
    `drawtext=${fontOpt}text='${titleText}':fontsize=42:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-30:enable='between(t,1,5)',` +
    `drawtext=${fontOpt}text='${subText}':fontsize=22:fontcolor=gray:x=(w-text_w)/2:y=(h-text_h)/2+30:enable='between(t,1,5)',` +
    `fade=t=out:st=4.5:d=0.5" ` +
    `-c:v libx264 -preset fast -crf 23 -an -y "${endingPath}"`;

  try {
    execSync(cmd, { encoding: "utf-8", stdio: "ignore", cwd: tempDir });
    return endingPath;
  } catch (e) {
    console.error("  Warning: ending clip generation failed: " + e.message.split("\n")[0]);
    return null;
  }
}

// ---- Resolution mapping ----
function getResolutionString(ratio, resLabel) {
  if (resLabel === "720p") {
    return ratio === "16:9" ? "1280x720" : ratio === "9:16" ? "720x1280" : "1280x720";
  }
  if (resLabel === "1080p") {
    return ratio === "16:9" ? "1920x1080" : ratio === "9:16" ? "1080x1920" : "1920x1080";
  }
  if (resLabel === "480p") {
    return ratio === "16:9" ? "854x480" : ratio === "9:16" ? "480x854" : "854x480";
  }
  return ratio === "16:9" ? "1280x720" : ratio === "9:16" ? "720x1280" : "1280x720";
}

// ---- Merge with xfade transitions ----
async function mergeWithXfade(inputs, outPath, transitionDuration) {
  let inputArgs = "";
  for (let i = 0; i < inputs.length; i++) {
    inputArgs += ` -i "${inputs[i]}"`;
  }

  const durations = inputs.map((v) => getDuration(v));
  const td = transitionDuration || 1.0;

  // Calculate cumulative offsets for xfade:
  // offset[i] = sum(durations[0..i]) - i * td
  // This is the timestamp in the OUTPUT stream where xfade[i] begins.
  let vFilters = [];
  let aFilters = [];
  let lastV = "0:v";
  let lastA = "0:a";

  for (let i = 0; i < inputs.length - 1; i++) {
    // Cumulative offset: each xfade consumes (duration - td) of output time
    // except the first segment which starts at 0
    let offset = 0;
    for (let j = 0; j <= i; j++) {
      offset += durations[j];
    }
    offset -= i * td;
    // offset is now: when the (i+1)th video starts fading in

    const outV = `v${i}${i + 1}`;
    const outA = `a${i}${i + 1}`;

    vFilters.push(
      `[${lastV}][${i + 1}:v]xfade=transition=fade:duration=${td}:offset=${offset.toFixed(3)}[${outV}]`
    );
    aFilters.push(
      `[${lastA}][${i + 1}:a]acrossfade=d=${td}:c1=tri:c2=tri[${outA}]`
    );

    lastV = outV;
    lastA = outA;
  }

  const filterComplex = [...vFilters, ...aFilters].join("; ");
  const cmd =
    `"${FFMPEG}"${inputArgs} -filter_complex "${filterComplex}" ` +
    `-map "[${lastV}]" -map "[${lastA}]" ` +
    `-c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p ` +
    `-c:a aac -b:a 192k ` +
    `-movflags +faststart ` +
    `-y "${outPath}"`;

  try {
    execSync(cmd, { encoding: "utf-8", stdio: "inherit" });
  } catch (e) {
    console.error("FFmpeg xfade merge failed: " + e.message.split("\n")[0]);
    console.log("Falling back to concat demuxer...");
    await mergeWithConcat(inputs, outPath);
  }
}

// ---- Merge with concat demuxer (fallback) ----
async function mergeWithConcat(inputs, outPath) {
  const tempDir = path.dirname(outPath);
  const listPath = path.join(tempDir, "concat_list.txt");
  const lines = inputs.map((v) => `file '${v.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n");
  fs.writeFileSync(listPath, lines);

  // Use re-encode to ensure consistent codec parameters across segments
  const cmd = `"${FFMPEG}" -f concat -safe 0 -i "${listPath}" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart -y "${outPath}"`;
  try {
    execSync(cmd, { encoding: "utf-8", stdio: "inherit" });
  } catch (e) {
    console.error("FFmpeg concat merge failed: " + e.message.split("\n")[0]);
    throw e;
  }
}

// ---- Main merge function ----
async function mergeVideos(dynasties, state, options) {
  options = options || {};
  const transitionDuration = options.transitionDuration || 1.0;
  const addTitle = options.addTitle || false;
  const addEnding = options.addEnding || false;
  const addSubtitles = options.addSubtitles || false;
  const outputPath = options.outputPath;
  const tempDir = options.tempDir;
  const ratio = options.ratio || "16:9";
  const resolution = options.resolution || "720p";

  console.log("\n=== Step 5: Merging videos with FFmpeg ===");

  if (!checkFfmpeg()) {
    console.error("ERROR: FFmpeg not found. Please install FFmpeg 4.4+ and ensure it's in PATH.");
    process.exit(1);
  }

  // Collect video files in dynasty order
  const videoFiles = [];
  for (const d of dynasties) {
    const v = state.videos[d.id];
    if (v && v.videoPath && fs.existsSync(v.videoPath)) {
      videoFiles.push({ dynasty: d, path: v.videoPath });
    }
  }

  if (videoFiles.length === 0) {
    console.error("ERROR: No videos to merge.");
    process.exit(1);
  }

  console.log("  Videos to merge: " + videoFiles.length);

  // Clean temp dir
  try {
    if (fs.existsSync(tempDir)) {
      for (const f of fs.readdirSync(tempDir)) {
        try { fs.unlinkSync(path.join(tempDir, f)); } catch (e) {}
      }
    }
  } catch (e) {}

  // Burn subtitles if requested (skip if drawtext not available)
  let inputsToMerge = [];
  if (addSubtitles && hasXfade()) {
    console.log("  Burning dynasty subtitles...");
    for (const item of videoFiles) {
      const subPath = path.join(tempDir, item.dynasty.id + "_sub.mp4");
      await burnSubtitle(item.path, item.dynasty, subPath);
      inputsToMerge.push(subPath);
    }
  } else {
    if (addSubtitles) console.log("  Skipping subtitles (FFmpeg lacks drawtext).");
    inputsToMerge = videoFiles.map((item) => item.path);
  }

  // Build dynasty title cards (before each video)
  const resString = getResolutionString(ratio, resolution);
  console.log("  Generating dynasty title cards...");
  const cardInputs = [];
  for (const item of videoFiles) {
    const card = buildDynastyCard(item.dynasty, resString, tempDir);
    if (card) {
      cardInputs.push(card);
      cardInputs.push(item.path);
    } else {
      cardInputs.push(item.path);
    }
  }

  // Build opening title and ending clips
  const titleClip = addTitle ? buildTitleClip(dynasties, resString, tempDir) : null;
  const endingClip = addEnding ? buildEndingClip(resString, tempDir) : null;

  const allInputs = [];
  if (titleClip) allInputs.push(titleClip);
  allInputs.push(...cardInputs);
  if (endingClip) allInputs.push(endingClip);

  // Merge - use concat demuxer (reliable merge).
  console.log("  Using concat demuxer (reliable merge).");
  await mergeWithConcat(allInputs, outputPath);

  console.log("\n=== Wedding movie complete ===");
  console.log("  Output: " + outputPath);
  return outputPath;
}

module.exports = {
  mergeVideos,
  checkFfmpeg,
  getDuration,
  getResolutionString,
};
