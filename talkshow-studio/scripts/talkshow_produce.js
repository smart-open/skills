#!/usr/bin/env node
/**
 * talkshow_produce.js — 生产级脱口秀视频流水线（Agnes 全模态 + FFmpeg）
 *
 * 流程（源自《AI脱口秀视频创作操作流程》生产级 SOP）：
 *   [阶段一] 资产锁定：舞台合成图 + 横版定妆照（agnes-image-2.5-flash）
 *   [阶段二] 脚本拆解：分镜表（agnes-2.0-flash，台词逐字保留）
 *   [阶段三] 分镜视频：reference 模式双参考图锁定 + 原生音画同步（agnes-video-2.5-flash）
 *   [阶段四] 后期合并：xfade 和谐转场拼接 + 响度归一 + 字幕压制（FFmpeg）
 *
 * 一致性三重锁：
 *   1) 所有分镜传入同一组参考图 URL（定妆照 + 舞台合成图）
 *   2) 每镜 prompt 开头逐字复制一致性锚点段
 *   3) 每镜生成后记录产物信息，供人工 QC（qc_report.md）
 *
 * 用法示例：
 *   node talkshow_produce.js --script-file script.txt --actor-image actor.png --stage-image stage.png
 *   node talkshow_produce.js --script-file script.txt                # 无图全自动：默认演员（现代都市美女模特）+ 自动舞台
 *   node talkshow_produce.js --script-file script.txt --actor-image actor.png --stage-image stage.png --resume --work-dir work/20260901-xxxx
 *   node talkshow_produce.js --resume --work-dir ... --regenerate 3   # 重拍 S03（也可 1,5 指定多镜，all 重拍全部）
 *   node talkshow_produce.js --script-file script.txt --expression 6   # 表情强度 6/10（冷面克制，默认 8）
 *   node talkshow_produce.js --resume --work-dir ... --expression 8 --regenerate all  # 调强度后整片重拍
 */

"use strict";

const fs = require("fs");
const path = require("path");
const agnes = require("./agnes_client");
const ffmpegTools = require("./ffmpeg_tools");
const P = require("./prompts");

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      args._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function printHelp() {
  console.log(`
talkshow_produce.js — 生产级脱口秀视频流水线

必填：
  --script-file <path>     脱口秀简稿（txt，建议 ≥200 字）
  --actor-image <path|url> 脱口秀演员图片（本地路径或 URL；不提供时自动生成默认演员：现代都市美女模特）
  --actor-desc <text>      默认演员的形象描述（仅在未提供 --actor-image 时生效）
  --stage-image <path|url> 舞台图片（本地路径或 URL；不提供时自动生成）

可选：
  --voice-desc <text>      音色描述（默认：${P.DEFAULT_VOICE_PROFILE}）
  --expression <0-10>      表情强度（默认 ${P.DEFAULT_EXPRESSION_LEVEL}：自然克制；10=极度夸张，6=冷面）
  --voice <female|male>    音色性别预设（female=28岁清亮女声，male=30岁中音男声）。
                           重要：提供了女性演员图时务必加 --voice female，否则默认走男声 profile，声画不匹配。
  --prop <preset|text>     段子特定道具白名单（默认无道具，舞台除立式麦外保持干净）。
                           预设：thermos=哑光黑色保温杯（带吸管杯盖，配小茶几）、coffee=白色陶瓷咖啡杯、none=无道具。
                           也可直接写自定义描述，如 --prop "一只银色保温杯"。仅当段子明确需要该道具时使用。
  --ratio <r>              画幅 16:9（默认）| 9:16 | 1:1 | 4:3 ...
  --max-shot <n>           单镜最大秒数（视频模型上限 12，默认 12）
  --transition <t>         转场模式 auto（默认：同景别同机位硬切，变化处溶解）| fade | cut | wipeleft | smoothleft ...
  --transition-dur <n>     溶解转场时长秒（默认 0.4）
  --no-subtitles           不压制字幕（默认压制）
  --work-dir <dir>         工作目录（默认自动生成）
  --resume                 断点续跑（配合 --work-dir）
  --regenerate <n[,n...|all]>  重新生成：3（从 S03 重拍到末尾）/1,5（仅 S01 与 S05）/3,3（仅 S03）/all（全部镜），配合 --resume
  --api-key <key>          Agnes API Key（默认读环境变量 AGNES_API_KEY）
  --base-url <url>         API Base URL（默认 https://api.agnes-ai.cn/v1）
  --model-video <id>       视频模型（默认 agnes-video-2.5-flash）
  --model-image <id>       图像模型（默认 agnes-image-2.5-flash）
  --model-text <id>        文本模型（默认 agnes-2.0-flash）
  --seed <n>               视频生成随机种子（默认随机）
  --help                   显示本帮助
`.trim());
}

// ---------------------------------------------------------------------------
// Key 加载（--api-key > 环境变量 AGNES_API_KEY；不落盘、不写死在技能内）
// ---------------------------------------------------------------------------

function loadApiKey(cliKey) {
  if (cliKey && cliKey !== true) return cliKey.trim();
  if (process.env.AGNES_API_KEY && process.env.AGNES_API_KEY.trim()) {
    return process.env.AGNES_API_KEY.trim();
  }
  console.error(
    "错误：未提供 Agnes API Key。请通过以下任一方式提供：\n" +
      "  1. 环境变量：export AGNES_API_KEY=sk-...（PowerShell：$env:AGNES_API_KEY=\"sk-...\"）\n" +
      "  2. 命令行参数：--api-key sk-..."
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 状态管理
// ---------------------------------------------------------------------------

/** 解析表情强度：0–10，非法值回退默认（8） */
function parseExpression(v) {
  if (v == null || v === true || v === "") return P.DEFAULT_EXPRESSION_LEVEL;
  const n = Number(v);
  if (!isFinite(n)) return P.DEFAULT_EXPRESSION_LEVEL;
  return Math.max(0, Math.min(10, Math.round(n)));
}

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function newState(workDir, opts) {
  return {
    sessionId: path.basename(workDir),
    createdAt: new Date().toISOString(),
    inputs: {
      scriptFile: opts.scriptFile,
      actorImage: opts.actorImage,
      stageImage: opts.stageImage,
      voiceDesc: opts.voiceDesc,
      expressionLevel: opts.expressionLevel,
      propDesc: opts.propDesc || "",
      ratio: opts.ratio,
      maxShotSeconds: opts.maxShot,
      transition: opts.transition,
      transitionDur: opts.transitionDur,
      subtitles: opts.subtitles,
    },
    models: {
      image: opts.modelImage,
      video: opts.modelVideo,
      text: opts.modelText,
    },
    assets: null,     // { stageComposite: {url, source}, modelReference: {url} }
    storyboard: null, // { title, shots: [...] }
    videos: null,     // [{ shotId, videoPath, url, videoId, durationSec, ok }]
    merged: null,     // { videoConcat, srt, final, totalDuration }
    done: false,
  };
}

function saveState(workDir, state) {
  fs.writeFileSync(path.join(workDir, "state.json"), JSON.stringify(state, null, 2), "utf8");
}

function loadState(workDir) {
  const p = path.join(workDir, "state.json");
  if (!fs.existsSync(p)) throw new Error(`找不到 ${p}，无法续跑`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// ---------------------------------------------------------------------------
// 阶段一：资产锁定
// ---------------------------------------------------------------------------

/** URL 防御性归一化（修复 Git Bash/MSYS 将 URL 中 "/" 转为 "\" 的问题） */
function normalizeRef(v) {
  if (!v) return v;
  let s = String(v).trim();
  if (/^https?:\\/.test(s)) s = s.replace(/\\/g, "/");
  return s;
}

async function stageAssets(workDir, state, apiKey, baseUrl) {
  if (state.assets) {
    console.log("[阶段一] 资产已锁定（state.json 命中），跳过");
    return;
  }
  console.log("\n========== 阶段一：资产锁定 ==========");
  const { actorImage, stageImage } = state.inputs;

  // 输入标准化：本地文件 → dataURI；URL 原样
  const toRef = (v) => {
    const s = normalizeRef(v);
    return /^https?:\/\//i.test(s) ? s : agnes.fileToDataUri(s);
  };

  let compositeUrl = null;
  let actor = actorImage;

  // 仅演员图时的合成路径：文生图舞台 → 演员合成进舞台
  const composeActorOnly = async (actorUrl) => {
    console.log("  先文生图舞台，再合成 ...");
    const stageR = await agnes.generateImage({
      apiKey, baseUrl, model: state.models.image,
      prompt:
        "小型脱口秀剧场舞台，暖黄色聚光灯照亮舞台中央，一位立式黑色麦克风立在台中，" +
        "舞台下是观众席剪影，暗部层次分明，电影感画质，真实自然，无文字无水印。", // 画幅由 ratio 参数控制，文案不硬编码横竖版
      size: "2K", ratio: state.inputs.ratio,
    });
    const r = await agnes.generateImage({
      apiKey, baseUrl, model: state.models.image,
      prompt: P.stageCompositePrompt(state.inputs.propDesc),
      size: "2K", ratio: state.inputs.ratio,
      images: [toRef(actorUrl), stageR.url],
    });
    return r.url;
  };

  if (!actor) {
    // 用户未提供演员图：自动生成默认演员（现代都市美女模特），URL 持久化保证续跑/重拍一致
    console.log("  未提供演员图：自动生成默认演员（现代都市美女模特）...");
    const actorR = await agnes.generateImage({
      apiKey, baseUrl, model: state.models.image,
      prompt: P.defaultActorPrompt(state.inputs.actorDesc),
      size: "1K", ratio: "3:4",
    });
    actor = actorR.url;
    state.inputs.actorImage = actor;
    state.inputs.actorAuto = true;
    saveState(workDir, state);
    console.log(`  ✓ 默认演员图: ${actor}`);
  }

  if (stageImage) {
    console.log("  合成舞台图：演员 + 舞台 → stage_composite ...");
    const r = await agnes.generateImage({
      apiKey, baseUrl, model: state.models.image,
      prompt: P.stageCompositePrompt(state.inputs.propDesc),
      size: "2K",
      ratio: state.inputs.ratio,
      images: [toRef(actor), toRef(stageImage)],
    });
    compositeUrl = r.url;
  } else {
    compositeUrl = await composeActorOnly(actor);
  }
  console.log(`  ✓ stage_composite: ${compositeUrl}`);

  console.log("  生成横版定妆照 model_reference ...");
  const modelRef = await agnes.generateImage({
    apiKey, baseUrl, model: state.models.image,
    prompt: P.modelReferencePrompt(),
    size: "2K",
    ratio: state.inputs.ratio,
    images: [compositeUrl],
  });
  console.log(`  ✓ model_reference: ${modelRef.url}`);

  state.assets = {
    stageComposite: { url: compositeUrl },
    modelReference: { url: modelRef.url },
  };
  saveState(workDir, state);
}

// ---------------------------------------------------------------------------
// 阶段二：脚本拆解 → 分镜表
// ---------------------------------------------------------------------------

function extractJson(text) {
  const t = String(text).replace(/```json|```/g, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型输出中未找到 JSON");
  return JSON.parse(t.slice(start, end + 1));
}

async function stageStoryboard(workDir, state, apiKey, baseUrl) {
  if (state.storyboard) {
    console.log("[阶段二] 分镜表已存在（state.json 命中），跳过");
    return;
  }
  console.log("\n========== 阶段二：脚本拆解与分镜表 ==========");
  const script = fs.readFileSync(state.inputs.scriptFile, "utf8").replace(/\r\n/g, "\n").trim();
  if (script.length < 50) console.warn("  ⚠ 简稿较短（<50 字），成片可能只有一两镜");

  const maxShot = state.inputs.maxShotSeconds;
  const charsPerSecond = 4.2;
  /** 校验用归一化：去空白 + 去标点/符号（容忍模型丢引号等样式差异，仍拦截改写） */
  const norm = (s) => String(s).replace(/[\s\p{P}\p{S}]+/gu, "");
  const similarity = (a, b) => {
    // 简单字符级 LCS 相似度
    const A = norm(a), B = norm(b);
    if (!A.length || !B.length) return 0;
    const dp = new Array(B.length + 1).fill(0);
    for (let i = 1; i <= A.length; i++) {
      let prev = 0;
      for (let j = 1; j <= B.length; j++) {
        const tmp = dp[j];
        dp[j] = A[i - 1] === B[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
        prev = tmp;
      }
    }
    return dp[B.length] / Math.max(A.length, B.length);
  };
  let parsed = null;
  let lastErr = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`  分镜拆解（第 ${attempt} 次尝试）...`);
    try {
      const content = await agnes.chatCompletion({
        apiKey, baseUrl, model: state.models.text,
        messages: [
          { role: "system", content: P.storyboardSystemPrompt() },
          {
            role: "user",
            content: P.storyboardUserPrompt({
              script,
              maxShotSeconds: maxShot,
              charsPerSecond,
              expressionLevel: state.inputs.expressionLevel,
              propDesc: state.inputs.propDesc || "",
            }),
          },
        ],
      });
      // 原始输出落盘，便于诊断
      fs.writeFileSync(path.join(workDir, `storyboard_raw_${attempt}.txt`), content, "utf8");
      parsed = extractJson(content);
      const shots = Array.isArray(parsed.shots) ? parsed.shots : null;
      if (!shots || !shots.length) throw new Error("shots 为空");
      // 校验：忽略标点后逐字比对；相似度 ≥ 0.92 容错接受（警告），否则拒绝重试
      const joined = shots.map((s) => s.text).join("");
      const sim = similarity(joined, script);
      if (norm(joined) !== norm(script)) {
        if (sim < 0.92) {
          console.warn(`  ✗ 台词被改写（相似度 ${sim.toFixed(3)} < 0.92），重试...`);
          throw new Error("台词不逐字");
        }
        console.warn(`  ⚠ 台词标点有差异（相似度 ${sim.toFixed(3)}），容错接受`);
      }
      shots.forEach((s, i) => {
        s.id = s.id || `S${String(i + 1).padStart(2, "0")}`;
        s.seconds = Math.max(5, Math.min(maxShot, Math.round(s.seconds || Math.ceil(s.text.length / charsPerSecond))));
        s.shot_size = s.shot_size || "中景";
        s.camera = s.camera || "固定机位";
        s.action = s.action || "右手持麦，身体微微前倾";
        s.emotion = s.emotion || "轻松自信";
        s.audience_reaction = s.audience_reaction || "无";
        s.laugh_point = !!s.laugh_point;
      });
      break;
    } catch (e) {
      lastErr = e;
      parsed = null;
    }
  }
  if (!parsed) throw new Error(`分镜拆解失败：${lastErr && lastErr.message}`);

  state.storyboard = parsed;
  saveState(workDir, state);

  // 人类可读分镜表
  const sb = parsed;
  const totalSec = sb.shots.reduce((a, s) => a + s.seconds, 0);
  const md = [
    `# 分镜表：${sb.title || "脱口秀"}`,
    "",
    `- 总时长（估算）：${totalSec} 秒 ｜ 分镜数：${sb.shots.length} ｜ 视频模型：${state.models.video} ｜ 画幅：${state.inputs.ratio}`,
    `- 台词总量：${sb.shots.reduce((a, s) => a + s.text.length, 0)} 字`,
    "",
    "| 镜号 | 时长 | 景别 | 运镜 | 情绪 | 笑点 | 观众反应 | 台词 |",
    "|---|---|---|---|---|---|---|---|",
    ...sb.shots.map(
      (s) =>
        `| ${s.id} | ${s.seconds}s | ${s.shot_size} | ${s.camera} | ${s.emotion} | ${s.laugh_point ? "✓" : ""} | ${s.audience_reaction} | ${s.text.replace(/\|/g, "\\|")} |`
    ),
    "",
    "## 每镜动作提示",
    ...sb.shots.map((s) => `- **${s.id}**：${s.action}`),
  ].join("\n");
  fs.writeFileSync(path.join(workDir, "storyboard.md"), md, "utf8");
  console.log(`  ✓ 分镜数 ${sb.shots.length}，预估总时长 ${totalSec}s → storyboard.md`);
}

// ---------------------------------------------------------------------------
// 阶段三：分镜视频生成
// ---------------------------------------------------------------------------

async function stageVideos(workDir, state, apiKey, baseUrl, regenSpec = null) {
  console.log("\n========== 阶段三：分镜视频生成 ==========");
  const shots = state.storyboard.shots;
  if (!state.videos) {
    state.videos = shots.map((s, i) => ({ index: i, shotId: s.id, videoPath: null, url: null, videoId: null, durationSec: 0, ok: false }));
  } else if (regenSpec === "all" || regenSpec) {
    // regenSpec："all" / {from:n}（从第 n+1 镜到末尾）/ Set（仅指定镜）
    for (const v of state.videos) {
      const hit =
        regenSpec === "all" ||
        (regenSpec.from != null ? v.index >= regenSpec.from : regenSpec.has(v.index));
      if (hit) {
        const tag =
          regenSpec === "all"
            ? "all"
            : regenSpec.from != null
              ? `${regenSpec.from + 1}（到末尾）`
              : Array.from(regenSpec).map((i) => i + 1).join(",");
        console.log(`  [${v.shotId}] 标记重拍（--regenerate ${tag}）`);
        v.videoPath = null; v.url = null; v.videoId = null; v.durationSec = 0; v.ok = false;
      }
    }
  }

  const videosDir = path.join(workDir, "videos");
  fs.mkdirSync(videosDir, { recursive: true });

  // 分批策略：首批 S01+S02 生成后暂停提示（非交互模式直接继续，但打印醒目 QC 提示）
  const refImages = [state.assets.modelReference.url, state.assets.stageComposite.url];

  for (const v of state.videos) {
    const shot = shots[v.index];
    if (v.ok && fs.existsSync(v.videoPath)) {
      console.log(`  [${shot.id}] 已完成，跳过`);
      continue;
    }
    const prompt = P.shotVideoPrompt(
      shot,
      state.inputs.voiceDesc,
      state.inputs.expressionLevel,
      state.inputs.propDesc || ""
    );
    const outPath = path.join(videosDir, `shot_${shot.id}_${shot.seconds}s.mp4`);
    console.log(`  [${shot.id}] 生成中（${shot.seconds}s，台词 ${shot.text.length} 字）...`);
    try {
      const { videoId } = await agnes.createVideoTask({
        apiKey, baseUrl, model: state.models.video,
        prompt,
        seconds: shot.seconds,
        aspectRatio: state.inputs.ratio,
        images: refImages,
        seed: state.inputs.seed != null ? Number(state.inputs.seed) : null,
      });
      v.videoId = videoId;
      saveState(workDir, state);
      const { url } = await agnes.pollVideoTask({
        apiKey, baseUrl, model: state.models.video, videoId,
        onTick: null,
      });
      v.url = url;
      await agnes.downloadToFile(url, outPath);
      const info = ffmpegTools.probe(outPath);
      v.videoPath = outPath;
      v.durationSec = info.durationSec;
      v.width = info.width;
      v.height = info.height;
      v.hasAudio = info.hasAudio;
      v.ok = true;
      saveState(workDir, state);
      console.log(`  ✓ [${shot.id}] 完成 → ${path.basename(outPath)}（${info.durationSec.toFixed(1)}s, ${info.width}x${info.height}）`);

      if (v.index === 1) {
        const s01 = state.videos[0];
        console.log(
          s01 && s01.ok
            ? "  ── 首批 S01/S02 已生成，建议人工核对人物一致性（模型参考：" + state.assets.modelReference.url + "）──"
            : "  ── 首批 QC 提示：S01 尚未成功，请稍后 --regenerate 补拍后再核对人物一致性 ──"
        );
      }
    } catch (e) {
      console.error(`  ✗ [${shot.id}] 生成失败：${e.message}`);
      saveState(workDir, state);
      // 单镜失败不中断整体：记录后继续（后续可 --regenerate 补）
    }
  }

  const failed = state.videos.filter((v) => !v.ok);
  if (failed.length) {
    console.warn(`  ⚠ ${failed.length} 镜失败：${failed.map((v) => v.shotId).join(", ")}。可用 --resume --regenerate <n> 重试`);
  }
}

// ---------------------------------------------------------------------------
// 阶段四：后期合并（转场拼接 + 响度归一 + 字幕压制）
// ---------------------------------------------------------------------------

async function stagePost(workDir, state, ffbin, ffpbin) {
  console.log("\n========== 阶段四：后期合并 ==========");
  // 仅当已有成片且其字幕设置与当前一致时才跳过（旧 state.json 无 subtitled 标记，视为带字幕）
  const prevSubtitled = state.merged ? state.merged.subtitled !== false : false;
  if (state.merged && state.merged.final && fs.existsSync(state.merged.final) && prevSubtitled === !!state.inputs.subtitles) {
    console.log("  已有成片，跳过（如需重做请删除 merged 字段或换 work-dir）");
    return;
  }

  const okClips = state.videos.filter((v) => v.ok && fs.existsSync(v.videoPath));
  if (!okClips.length) throw new Error("没有任何可用的分镜视频，无法合并");
  if (okClips.length < state.videos.length) {
    console.warn(`  ⚠ 仅有 ${okClips.length}/${state.videos.length} 镜成功，成片将缺少失败镜头`);
  }

  const finalDir = path.join(workDir, "final");
  fs.mkdirSync(finalDir, { recursive: true });
  const shots = state.storyboard.shots;
  const mode = state.inputs.transition || "auto";
  const tdurBase = mode === "cut" ? 0 : Number(state.inputs.transitionDur) || 0.4;

  // 边界感知转场（auto）：相邻两镜景别+机位完全相同 → 视为同一连续镜头，硬切（0.001s 近似瞬切）；
  // 景别或机位变化 → 溶解转场。避免同机位同景别间做双影溶解造成的"飘忽不协调"。
  let transitionArg, tdurArg, transDesc;
  if (mode === "auto") {
    transitionArg = [];
    tdurArg = [];
    let cuts = 0;
    let dissolves = 0;
    for (let i = 1; i < okClips.length; i++) {
      const a = shots[okClips[i - 1].index];
      const b = shots[okClips[i].index];
      if (a && b && a.shot_size === b.shot_size && a.camera === b.camera) {
        transitionArg.push("fade");
        tdurArg.push(0.001);
        cuts++;
      } else {
        transitionArg.push("fade");
        tdurArg.push(tdurBase);
        dissolves++;
      }
    }
    transDesc = `auto：硬切 ${cuts} 处 + 溶解 ${dissolves} 处（${tdurBase}s）`;
  } else {
    transitionArg = mode === "cut" ? "fade" : mode;
    tdurArg = tdurBase || 0.001;
    transDesc = tdurBase ? `${mode} ${tdurBase}s（统一）` : "硬切（统一）";
  }

  console.log(`  拼接 ${okClips.length} 个片段（转场：${transDesc}）...`);
  const concatOut = path.join(finalDir, "video_concat.mp4");
  // 复用阶段三探测结果，避免重复 probe（元数据不完整时回退到 concat 内部重新探测）
  const metaReady = okClips.every((v) => v.durationSec && v.width && v.height && v.hasAudio != null);
  const clipInfos = metaReady
    ? okClips.map((v) => ({ durationSec: v.durationSec, width: v.width, height: v.height, hasAudio: v.hasAudio }))
    : null;
  const { totalDuration } = ffmpegTools.concatWithTransitions({
    clips: okClips.map((v) => v.videoPath),
    output: concatOut,
    transition: transitionArg,
    tdur: tdurArg,
    ffmpegBin: ffbin,
    ffprobeBin: ffpbin,
    clipInfos,
  });
  console.log(`  ✓ 拼接完成（约 ${totalDuration.toFixed(1)}s）`);

  // SRT 字幕
  const srtPath = path.join(finalDir, "subtitles_final.srt");
  const durations = okClips.map((v) => v.durationSec || ffmpegTools.probe(v.videoPath, ffpbin).durationSec);
  const shotsForSrt = okClips.map((v) => state.storyboard.shots[v.index]);
  fs.writeFileSync(srtPath, ffmpegTools.buildSrt(shotsForSrt, durations, tdurArg), "utf8");
  console.log(`  ✓ SRT 字幕 → ${path.basename(srtPath)}`);

  let finalPath = concatOut;
  if (state.inputs.subtitles) {
    console.log("  压制字幕 ...");
    const subbed = path.join(finalDir, "final_with_subtitles.mp4");
    ffmpegTools.burnSubtitles({ videoIn: concatOut, srtIn: srtPath, output: subbed, ffmpegBin: ffbin });
    finalPath = subbed;
    console.log(`  ✓ 字幕压制完成`);
  }

  const title = (state.storyboard.title || "脱口秀").replace(/[\\/:*?"<>|\s]+/g, "_");
  const dateStr = state.sessionId.split("-").slice(0, 3).join("");
  const named = path.join(finalDir, `脱口秀_${title}_${dateStr}_final.mp4`);
  fs.copyFileSync(finalPath, named);

  state.merged = {
    videoConcat: concatOut,
    srt: srtPath,
    final: named,
    totalDuration,
    subtitled: !!state.inputs.subtitles,
  };
  state.done = true;
  saveState(workDir, state);
  console.log(`\n  ★ 成片 → ${named}`);

  // QC 报告
  const qmd = [
    "# QC 报告（自动生成部分）",
    "",
    `- 成片：\`${named}\``,
    `- 总时长：${totalDuration.toFixed(1)} 秒 ｜ 分镜：${okClips.length}/${state.videos.length} 成功`,
    `- 转场：${transDesc}`,
    "",
    "| 镜号 | 时长 | 分辨率 | 文件 | 状态 |",
    "|---|---|---|---|---|",
    ...state.videos.map((v) => {
      const s = state.storyboard.shots[v.index];
      const res = v.width && v.height ? `${v.width}x${v.height}` : "-";
      return `| ${v.shotId} | ${(v.durationSec || 0).toFixed(1)}s | ${res} | \`${v.videoPath ? path.basename(v.videoPath) : "-"}\` | ${v.ok ? "✓" : "✗"}（${s.text.slice(0, 12)}…） |`;
    }),
    "",
    "## 人工 QC 检查清单（对照 SOP 第 10 节）",
    "- [ ] 全片人物与定妆照一致（面部/发型/服装/配饰）",
    "- [ ] 舞台场景、灯光、观众席全片一致",
    "- [ ] 音色全片一致，无机械感",
    "- [ ] 口型与台词同步（±0.3s）",
    "- [ ] 字幕与台词逐字一致、时间轴对齐、样式统一",
    "- [ ] 拼接处无跳帧/爆音，节奏流畅",
    "- [ ] 无水印/多余文字/多余人物",
  ].join("\n");
  fs.writeFileSync(path.join(workDir, "qc_report.md"), qmd, "utf8");
  console.log(`  QC 报告 → qc_report.md`);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printHelp();
    return;
  }

  const apiKey = loadApiKey(args["api-key"]);
  const baseUrl = args["base-url"] || agnes.DEFAULT_BASE_URL;

  const scriptFile = args["script-file"];
  const actorImage = args["actor-image"] || args["actor"] || null;
  const stageImage = args["stage-image"] || args["stage"] || null;

  let workDir = args["work-dir"] || null;
  let state;

  if (args.resume) {
    if (!workDir) throw new Error("--resume 需要 --work-dir");
    state = loadState(workDir);
    console.log(`续跑会话：${state.sessionId}`);
    // 续跑时允许覆盖表情强度 / 音色，便于针对性重拍
    const prevExpr = state.inputs.expressionLevel;
    if (args.expression != null && args.expression !== true && args.expression !== "") {
      state.inputs.expressionLevel = parseExpression(args.expression);
      if (state.inputs.expressionLevel !== prevExpr) {
        saveState(workDir, state);
        console.log(`  表情强度已更新：${prevExpr ?? P.DEFAULT_EXPRESSION_LEVEL} → ${state.inputs.expressionLevel}/10`);
      }
    }
    if (state.inputs.expressionLevel == null) state.inputs.expressionLevel = P.DEFAULT_EXPRESSION_LEVEL;
    // 兼容旧会话：早期 state.json 无 propDesc 字段，续跑时兜底为空（无道具），避免 prompt 出现 undefined
    if (state.inputs.propDesc == null) state.inputs.propDesc = "";
    // 续跑时允许覆盖道具（如 --prop thermos 补上保温杯），但需同步重拍分镜与视频才生效
    if (args.prop != null && args.prop !== true) {
      const np = P.resolveProp(args.prop);
      if (np !== state.inputs.propDesc) {
        console.log(`  道具已更新：${state.inputs.propDesc || "无"} → ${np || "无"}（需 --regenerate all 重拍才生效）`);
        state.inputs.propDesc = np;
        saveState(workDir, state);
      }
    }
    if (args["voice-desc"]) state.inputs.voiceDesc = args["voice-desc"];
    if (args.transition != null && args.transition !== true && args.transition !== state.inputs.transition) {
      console.log(`  转场模式已更新：${state.inputs.transition} → ${args.transition}（将重做后期合并）`);
      state.inputs.transition = String(args.transition);
      state.merged = null; // 转场变更需重做阶段四
      saveState(workDir, state);
    }
  } else {
    if (!scriptFile) {
      console.error("错误：缺少 --script-file（脱口秀简稿）。--help 查看用法。");
      process.exit(1);
    }
    if (!fs.existsSync(scriptFile)) throw new Error(`简稿不存在：${scriptFile}`);
    for (const img of [actorImage, stageImage]) {
      if (img && !/^https?:\/\//i.test(normalizeRef(img)) && !fs.existsSync(img)) throw new Error(`图片不存在：${img}`);
    }
    workDir = workDir || path.join(process.cwd(), "talkshow-studio", "work", `${nowStamp()}-${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(workDir, { recursive: true });
    fs.copyFileSync(scriptFile, path.join(workDir, "input_script.txt"));
    state = newState(workDir, {
      scriptFile: path.resolve(scriptFile),
      actorImage: actorImage ? (/^https?:\/\//i.test(actorImage) ? actorImage : path.resolve(actorImage)) : null,
      stageImage: stageImage ? (/^https?:\/\//i.test(stageImage) ? stageImage : path.resolve(stageImage)) : null,
      // 音色优先级：--voice-desc（自定义）> --voice female|male（性别预设）> 默认规则
      // 注意：默认规则对"提供了演员图"的场景沿用男声 profile，若演员为女性须显式 --voice female，
      // 否则会出现女演员配男声的声画不匹配。
      voiceDesc:
        args["voice-desc"] ||
        (String(args.voice || "").toLowerCase().match(/^(female|女|f)$/)
          ? P.DEFAULT_ACTOR_VOICE
          : String(args.voice || "").toLowerCase().match(/^(male|男|m)$/)
            ? P.DEFAULT_VOICE_PROFILE
            : actorImage
              ? P.DEFAULT_VOICE_PROFILE
              : P.DEFAULT_ACTOR_VOICE),
      expressionLevel: parseExpression(args.expression),
      actorDesc: args["actor-desc"] || P.DEFAULT_ACTOR_DESC,
      propDesc: P.resolveProp(args.prop === true ? "" : args.prop),
      ratio: args.ratio || "16:9",
      // NaN 防御：非法 --max-shot 回退默认 12；下限 5 与分镜秒数下限一致
      maxShot: (() => {
        const n = parseInt(args["max-shot"] == null || args["max-shot"] === true ? "12" : String(args["max-shot"]), 10);
        return Math.min(12, Number.isFinite(n) ? Math.max(5, n) : 12);
      })(),
      transition: args.transition || "auto",
      transitionDur: parseFloat(args["transition-dur"] || "0.4"),
      subtitles: args["no-subtitles"] ? false : true,
      seed: args.seed,
      modelImage: args["model-image"] || agnes.DEFAULT_IMAGE_MODEL,
      modelVideo: args["model-video"] || agnes.DEFAULT_VIDEO_MODEL,
      modelText: args["model-text"] || agnes.DEFAULT_TEXT_MODEL,
    });
    saveState(workDir, state);
    console.log(`工作目录：${workDir}`);
  }

  // --regenerate 支持 "3"（从 S03 重拍到末尾）、"1,5"（仅 S01 与 S05）、"all"（全部镜）
  let regenSpec = null; // "all" | {from:number} | Set<number>（0-based 镜索引）
  if (args.regenerate != null && args.regenerate !== true) {
    const raw = String(args.regenerate).trim();
    if (raw.toLowerCase() === "all") {
      // 等到分镜表加载后由 stageVideos 内部处理（需 shots 数量）；这里传 sentinel："all"
      regenSpec = "all";
    } else if (/^\d+$/.test(raw)) {
      // 单个镜号：从该镜重拍到末尾
      regenSpec = { from: parseInt(raw, 10) - 1 };
    } else {
      // 镜号列表：仅重拍指定镜（仅重拍单个镜可用重复镜号，如 "3,3"）
      regenSpec = new Set(
        raw
          .split(",")
          .map((s) => parseInt(s.trim(), 10) - 1)
          .filter((n) => !isNaN(n) && n >= 0)
      );
    }
  }

  await stageAssets(workDir, state, apiKey, baseUrl);
  await stageStoryboard(workDir, state, apiKey, baseUrl);
  await stageVideos(workDir, state, apiKey, baseUrl, regenSpec);

  const ffbin = args["ffmpeg"] || "ffmpeg";
  const ffpbin = args["ffprobe"] || "ffprobe";
  await stagePost(workDir, state, ffbin, ffpbin);

  console.log("\n全部完成 ✅");
  if (state.merged) console.log(`成片：${state.merged.final}`);
}

main().catch((e) => {
  console.error(`\n[失败] ${e.message}`);
  process.exit(1);
});
