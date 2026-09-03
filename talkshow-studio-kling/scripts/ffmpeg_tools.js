/**
 * FFmpeg 后期工具（零依赖，Node.js 内置模块 + ffmpeg/ffprobe CLI）
 *
 * 职责：
 *  - 视频探测（分辨率/帧率/时长）
 *  - 分镜拼接：视频 xfade 交叉淡化 + 音频 acrossfade（转场和谐，A/V 同步缩进）
 *  - 响度归一（loudnorm，目标 -16 LUFS）
 *  - SRT 字幕生成 + 字幕压制（全片统一样式）
 */

"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { splitSubtitleLines } = require("./prompts.js");

function run(cmd, args, { timeoutMs = 30 * 60 * 1000, cwd = null, env = null } = {}) {
  return execFileSync(cmd, args, {
    timeout: timeoutMs,
    windowsHide: true,
    encoding: "buffer",
    ...(cwd ? { cwd } : {}),
    ...(env ? { env } : {}),
  });
}

/** 探测视频信息 */
function probe(file, ffprobeBin = "ffprobe") {
  const out = run(ffprobeBin, [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    file,
  ]).toString("utf8");
  const j = JSON.parse(out);
  const v = (j.streams || []).find((s) => s.codec_type === "video");
  const a = (j.streams || []).find((s) => s.codec_type === "audio");
  return {
    durationSec: parseFloat((j.format && j.format.duration) || (v && v.duration) || 0),
    width: v ? v.width : 0,
    height: v ? v.height : 0,
    fps: v && v.r_frame_rate ? evalFraction(v.r_frame_rate) : 0,
    hasAudio: !!a,
  };
}

function evalFraction(s) {
  const [n, d] = String(s).split("/").map(Number);
  return d ? n / d : n;
}

/**
 * 拼接分镜视频：xfade 视频交叉淡化 + acrossfade 音频交叉淡化 → loudnorm → H.264/AAC
 * @param {object} opts
 * @param {string[]} opts.clips       输入片段路径（按镜序）
 * @param {string}   opts.output      输出路径
 * @param {string}   opts.transition  fade|wipeleft|smoothleft|fadeblack ...（默认 fade；亦可传数组按边界指定）
 * @param {number}   opts.tdur        转场时长秒（默认 0.4；亦可传数组按边界指定，0.001 ≈ 硬切）
 * @param {string}   opts.ffmpegBin
 * @param {string}   opts.ffprobeBin
 * @param {number}   opts.fps         统一帧率（默认 30）
 * @param {number[]} [opts.widthHeight] 统一分辨率 [w,h]（默认自动取第一个片段）
 * @param {object[]} [opts.clipInfos] 预探测的片段信息 [{durationSec,width,height,hasAudio}]（传入则跳过重复 probe）
 */
function concatWithTransitions({
  clips,
  output,
  transition = "fade",
  tdur = 0.4,
  ffmpegBin = "ffmpeg",
  ffprobeBin = "ffprobe",
  fps = 30,
  widthHeight = null,
  clipInfos = null,
}) {
  if (!clips.length) throw new Error("没有可拼接的视频片段");
  if (clips.length === 1) {
    // 单片段也要统一转码 + 响度归一
    const info = clipInfos && clipInfos[0] ? clipInfos[0] : probe(clips[0], ffprobeBin);
    if (!info.hasAudio) throw new Error(`片段 ${clips[0]} 没有音频流，无法进行响度归一，请重拍该镜`);
    run(ffmpegBin, [
      "-y", "-i", clips[0],
      "-vf", "format=yuv420p",
      "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      output,
    ]);
    return { output, totalDuration: probe(output, ffprobeBin).durationSec };
  }

  const infos = clipInfos || clips.map((c) => probe(c, ffprobeBin));
  // acrossfade 链要求所有片段都有音频流，缺失时提前给出明确报错（而非 ffmpeg 滤镜图模糊报错）
  const noAudioIdx = infos.map((x, i) => (x.hasAudio ? null : i + 1)).filter((n) => n !== null);
  if (noAudioIdx.length) {
    throw new Error(`片段 S${String(noAudioIdx[0]).padStart(2, "0")} 等 ${noAudioIdx.length} 个片段没有音频流，无法拼接（acrossfade 需要全部片段有音轨），请重拍对应镜头`);
  }
  const wh = widthHeight || [infos[0].width || 1280, infos[0].height || 720];
  // 保证宽高为偶数
  const W = Math.max(2, wh[0] - (wh[0] % 2));
  const H = Math.max(2, wh[1] - (wh[1] % 2));

  const lines = [];
  const inputs = [];
  clips.forEach((c) => inputs.push("-i", c));

  // 归一每个输入：视频 scale+fps，音频统一采样率/声道
  const vLabels = [];
  const aLabels = [];
  infos.forEach((_, i) => {
    lines.push(`[${i}:v]fps=${fps},scale=${W}:${H},setsar=1,format=yuv420p[v${i}]`);
    vLabels.push(`[v${i}]`);
    lines.push(`[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`);
    aLabels.push(`[a${i}]`);
  });

  // xfade/acrossfade 链式偏移：offset_i = 前面片段净时长累计 - 已消耗转场
  // transition/tdur 支持按边界传入数组（length = clips.length - 1），实现边界感知转场
  const transList = Array.isArray(transition) ? transition : null;
  const tdurList = Array.isArray(tdur) ? tdur : null;
  let cumulative = infos[0].durationSec;
  let vCur = vLabels[0];
  let aCur = aLabels[0];
  for (let i = 1; i < clips.length; i++) {
    const tv = transList ? transList[i - 1] || "fade" : transition || "fade";
    const dv = Number(tdurList ? tdurList[i - 1] : tdur) || 0.001;
    const off = Math.max(0.05, cumulative - dv);
    lines.push(`${vCur}${vLabels[i]}xfade=transition=${tv}:duration=${dv.toFixed(3)}:offset=${off.toFixed(3)}[vx${i}]`);
    lines.push(`${aCur}${aLabels[i]}acrossfade=d=${dv.toFixed(3)}:c1=tri:c2=tri[ax${i}]`);
    vCur = `[vx${i}]`;
    aCur = `[ax${i}]`;
    cumulative = off + infos[i].durationSec;
  }

  lines.push(`${vCur}null[vout]`);
  lines.push(`${aCur}loudnorm=I=-16:TP=-1.5:LRA=11[aout]`);

  const scriptFile = path.join(path.dirname(output), "filter_complex.txt");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(scriptFile, lines.join(";\n"), "utf8");

  run(ffmpegBin, [
    "-y",
    ...inputs,
    "-filter_complex_script", scriptFile,
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    output,
  ]);

  return { output, totalDuration: cumulative };
}

/**
 * 生成分镜字幕偏移起点（考虑转场重叠）
 * @param {number[]} durations 每镜实际时长
 * @param {number|number[]} tdur 转场时长（标量或按边界数组，length = durations.length - 1）
 * @returns {number[]} 每镜在全片中的起始时间（秒）
 */
function shotStartOffsets(durations, tdur) {
  const starts = [];
  let t = 0;
  durations.forEach((d, i) => {
    starts.push(t);
    if (i < durations.length - 1) {
      const gap = Array.isArray(tdur) ? Number(tdur[i]) || 0 : Number(tdur) || 0;
      t += d - gap;
    }
  });
  return starts;
}

function srtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  const f = String(ms % 1000).padStart(3, "0");
  return `${h}:${m}:${s},${f}`;
}

/**
 * 由分镜表 + 实际片段时长生成 SRT
 * @param {object[]} shots [{text, seconds, ...}]
 * @param {number[]} clipDurations 实际探测时长
 * @param {number}   tdur 转场时长
 */
function buildSrt(shots, clipDurations, tdur, maxLineChars = 18) {
  const starts = shotStartOffsets(clipDurations, tdur);
  const cues = [];
  let idx = 1;
  shots.forEach((shot, i) => {
    const dur = clipDurations[i];
    const lines = splitSubtitleLines(shot.text, maxLineChars);
    const totalChars = lines.reduce((a, b) => a + b.length, 0) || 1;
    let t = starts[i];
    lines.forEach((line) => {
      const lineDur = (line.length / totalChars) * dur;
      cues.push(`${idx}\n${srtTime(t)} --> ${srtTime(t + lineDur * 0.92)}\n${line}\n`);
      idx++;
      t += lineDur;
    });
  });
  return cues.join("\n");
}

/** 压制字幕（统一样式：白色粗体 + 黑描边 + 底部 1/6 居中） */
function burnSubtitles({ videoIn, srtIn, output, fontSize = 16, marginV = 40, ffmpegBin = "ffmpeg" }) {
  // libass force_style（ASS 颜色为 &HAABBGGRR）
  const style = [
    "FontName=Microsoft YaHei",
    `FontSize=${fontSize}`,
    "PrimaryColour=&H00FFFFFF",
    "OutlineColour=&H00000000",
    "BackColour=&H80000000",
    "Bold=1",
    "Outline=2",
    "Shadow=1",
    "Alignment=2",
    `MarginV=${marginV}`,
    "Spacing=0.5",
  ].join(",");

  // Windows 盘符路径在 FFmpeg subtitles 滤镜中转义极脆弱（`:` 是选项分隔符）。
  // 最稳妥的做法：把工作目录切到 srt 所在目录，使用 basename 引用，
  // 彻底绕开盘符冒号/反斜杠的转义陷阱。basename 必须用 FFmpeg 转义：单引号包住内部单引号。
  // 注意：切 cwd 前必须把 videoIn/output 解析为绝对路径，否则相对路径（如未显式传
  // --work-dir 时 workDir 为 "work\..."）在切换后会失效。
  const srtDir = path.dirname(srtIn);
  const srtName = path.basename(srtIn);
  const absVideoIn = path.resolve(videoIn);
  const absOutput = path.resolve(output);
  const esc = (s) => String(s).replace(/'/g, "'\\''");
  const vf = `subtitles='${esc(srtName)}':force_style='${esc(style)}'`;

  run(
    ffmpegBin,
    [
      "-y", "-i", absVideoIn,
      "-vf", vf,
      "-c:v", "libx264", "-preset", "medium", "-crf", "18",
      "-c:a", "copy",
      "-movflags", "+faststart",
      absOutput,
    ],
    { cwd: srtDir }
  );
}

module.exports = { probe, concatWithTransitions, buildSrt, burnSubtitles, shotStartOffsets, srtTime };
