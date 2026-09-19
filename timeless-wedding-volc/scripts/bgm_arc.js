#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * bgm_arc.js — 婚礼 BGM 情绪弧（统一方法论 P0-3 补全）
 * =====================================================
 * 目标：成片 BGM 不再"一条曲子糊到底"，而是按朝代情绪分段推进：
 *   序幕(温馨) → 朝代1(恢弘) → 朝代2(华丽) → … → 尾声(温馨)，
 * 每段交叉淡入淡出；成片有原声时用 sidechaincompress 自动避让
 * （人声/原声压 BGM，标题卡与转场处 BGM 自然浮起）。
 *
 * 曲源优先级（零新增依赖，全部 ffmpeg lavfi）：
 *   1. bgm/manifest.json 中 moods.<mood>.file 指向的真实配乐（用户自备，放入 bgm/）
 *   2. 按 moods.<mood>.synth 参数（缺省用内置 MOOD 表）用 ffmpeg 合成环境垫乐占位
 *
 * 情绪 → 合成参数（和弦根音/五度/八度 + 颤音速率）：
 *   majestic 恢弘 / solemn 庄重 / tense 紧张 / serene 清雅 /
 *   lush 华丽 / nostalgic 缠绵 / warm 温馨
 *
 * dry-run：所有 ffmpeg 命令只打印不执行（buildBgmArc 返回 null）。
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const MOODS = {
  majestic:  { label: "恢弘", freqs: [110, 165, 220], tremolo: 0.30 },
  solemn:    { label: "庄重", freqs: [98, 147, 196],  tremolo: 0.20 },
  tense:     { label: "紧张", freqs: [123, 185, 233], tremolo: 1.10 },
  serene:    { label: "清雅", freqs: [131, 196, 262], tremolo: 0.25 },
  lush:      { label: "华丽", freqs: [147, 220, 294], tremolo: 0.40 },
  nostalgic: { label: "缠绵", freqs: [117, 176, 233], tremolo: 0.30 },
  warm:      { label: "温馨", freqs: [131, 196, 260], tremolo: 0.35 },
};

function loadManifest(skillDir) {
  const p = path.join(skillDir, "bgm", "manifest.json");
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (e) {
    return { moods: {} };
  }
}

/** 合成某情绪的 64s 循环垫乐 wav（幂等：已存在直接复用）。 */
function synthTrack(mood, outWav, ffmpeg, params, dryRun) {
  const [f1, f2, f3] = params.freqs;
  const cmd =
    `"${ffmpeg}" ` +
    `-f lavfi -i "sine=frequency=${f1}:sample_rate=44100" ` +
    `-f lavfi -i "sine=frequency=${f2}:sample_rate=44100" ` +
    `-f lavfi -i "sine=frequency=${f3}:sample_rate=44100" ` +
    `-filter_complex "[0:a][1:a][2:a]amix=inputs=3:normalize=1,` +
    `tremolo=f=${params.tremolo}:d=0.7,` +
    `aecho=0.8:0.8:60|120:0.4|0.2,lowpass=f=1400,volume=1.4[a]" ` +
    `-map "[a]" -t 64 -c:a pcm_s16le -ar 44100 -ac 2 -y "${outWav}"`;
  if (dryRun) {
    console.log("  [dry-run] synth BGM track: " + mood + " (" + (params.label || mood) + ")");
    console.log("    " + cmd);
    return false;
  }
  try {
    execSync(cmd, { encoding: "utf-8", stdio: "ignore" });
    return fs.existsSync(outWav);
  } catch (e) {
    console.error("  Warning: BGM synth failed for mood " + mood + ": " + e.message.split("\n")[0]);
    return false;
  }
}

/** 解析某情绪的音轨：真实配乐优先，缺失则合成占位。 */
function resolveTrack(mood, skillDir, tempDir, ffmpeg, dryRun) {
  const manifest = loadManifest(skillDir);
  const entry = (manifest.moods && manifest.moods[mood]) || {};
  if (entry.file) {
    const p = path.join(skillDir, entry.file);
    if (fs.existsSync(p)) return p;
  }
  const params = Object.assign({}, MOODS[mood] || MOODS.warm, entry.synth || {});
  const outWav = path.join(tempDir, "bgm_" + mood + ".wav");
  if (!dryRun && fs.existsSync(outWav)) return outWav;
  if (!synthTrack(mood, outWav, ffmpeg, params, dryRun)) return null;
  return outWav;
}

/**
 * 构建整条 BGM 情绪弧。
 * @param {Array<{mood:string, dur:number}>} segments 按成片顺序的情绪分段
 * @param {object} opts { skillDir, tempDir, ffmpeg, dryRun }
 * @returns {string|null} arc.wav 路径；dry-run 返回 null（命令已打印）
 */
function buildBgmArc(segments, opts) {
  const skillDir = opts.skillDir;
  const tempDir = opts.tempDir;
  const ffmpeg = opts.ffmpeg;
  const dryRun = !!opts.dryRun;

  console.log("  BGM mood arc: " +
    segments.map((s) => s.mood + "@" + s.dur.toFixed(1) + "s").join(" → "));

  // 逐段：对应音轨循环铺满 + 段首尾 0.8s 淡入淡出
  const segFiles = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const track = resolveTrack(seg.mood, skillDir, tempDir, ffmpeg, dryRun);
    if (!track) return null;
    const segWav = path.join(tempDir, "arc_seg_" + i + ".wav");
    const fadeOutStart = Math.max(0, seg.dur - 0.8);
    const cmd =
      `"${ffmpeg}" -stream_loop -1 -i "${track}" ` +
      `-af "afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=0.8" ` +
      `-t ${seg.dur.toFixed(3)} -c:a pcm_s16le -ar 44100 -ac 2 -y "${segWav}"`;
    if (dryRun) {
      console.log("  [dry-run] arc segment " + i + " (" + seg.mood + "):");
      console.log("    " + cmd);
      continue;
    }
    try {
      execSync(cmd, { encoding: "utf-8", stdio: "ignore" });
      segFiles.push(segWav);
    } catch (e) {
      console.error("  Warning: arc segment failed (" + seg.mood + "), using previous tail.");
    }
  }
  if (dryRun) return null;
  if (segFiles.length === 0) return null;

  // 段间拼接（同为 44.1k/16bit/双声道 wav，concat demuxer 直接拼）
  const arcWav = path.join(tempDir, "bgm_arc.wav");
  const listPath = path.join(tempDir, "bgm_arc_list.txt");
  const lines = segFiles.map((f) => `file '${f.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n");
  fs.writeFileSync(listPath, lines);
  const cmd =
    `"${ffmpeg}" -f concat -safe 0 -i "${listPath}" ` +
    `-c:a pcm_s16le -ar 44100 -ac 2 -y "${arcWav}"`;
  try {
    execSync(cmd, { encoding: "utf-8", stdio: "ignore" });
    return fs.existsSync(arcWav) ? arcWav : null;
  } catch (e) {
    console.error("  Warning: BGM arc concat failed, falling back to single-track BGM: " + e.message.split("\n")[0]);
    return null;
  }
}

module.exports = { MOODS, loadManifest, resolveTrack, buildBgmArc };
