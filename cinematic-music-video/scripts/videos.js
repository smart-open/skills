#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * videos.js — Stage 3: turn each shot keyframe into a moving clip.
 *
 * This stage exists to defeat the two failure modes that ruin AI music videos:
 *
 *   A. FROZEN PICTURE ("不动")
 *      - Pre-flight: every video prompt is linted for an explicit camera move AND
 *        an explicit subject action; a missing one is repaired automatically.
 *      - Post-flight: the downloaded clip is measured with `motionScore()` (mean
 *        inter-frame difference at 4fps). A clip scoring below the threshold is
 *        rejected and regenerated with an amplified motion prompt.
 *        This is an objective gate, not a hope.
 *
 *   B. INCONSISTENT CANVAS / CHARACTER
 *      - Default workflow is `keyframe` + `first_frame = our keyframe`, so the
 *        clip's opening frame IS the generated image: identical framing, palette
 *        and wardrobe. `--chain` additionally pins `last_frame` to the next
 *        shot's keyframe for seamless joins inside a section.
 *      - `--mode reference` sends the character reference alongside the keyframe
 *        and names them as <Picture 1>/<Picture 2> in the prompt, which guides
 *        identity through large motions.
 *
 * Usage:
 *   node videos.js --project ./mv-song --keys "sk-a,sk-b" \
 *                  [--mode keyframe|reference] [--concurrency 2] [--motion-min 1.2] \
 *                  [--motion-retries 2] [--force] [--only S01] [--dry-run]
 */

const fs = require("fs");
const path = require("path");

const agnes = require("./lib/agnes");
const ff = require("./lib/ffmpeg");
const cli = require("./lib/cli");
const assets = require("./lib/assets");

const SPEC = {
  "--project": { key: "project", type: "string", alias: ["-d"], desc: "Project directory" },
  "--mode": { key: "mode", type: "string", default: "keyframe", desc: "keyframe (default) | reference" },
  "--concurrency": { key: "concurrency", type: "int", default: 2, desc: "Parallel video tasks (default 2)" },
  "--motion-min": { key: "motionMin", type: "number", default: 1.2, desc: "Minimum motion score for a clip to be accepted" },
  "--motion-retries": { key: "motionRetries", type: "int", default: 2, desc: "Regeneration attempts when a clip is too static" },
  "--candidates": { key: "candidates", type: "int", default: 1, desc: "Shoot N takes per shot and keep the liveliest (default 1). Costs N x video credits" },
  "--chain": { key: "chain", type: "bool", desc: "Also set last_frame to the next shot's keyframe within a section" },
  "--force": { key: "force", type: "bool", desc: "Regenerate even if the clip already exists" },
  "--only": { key: "only", type: "list", multi: true, desc: "Only process these shot ids" },
  "--dry-run": { key: "dryRun", type: "bool", desc: "List the tasks without creating them" },
  "--skip-motion-check": { key: "skipMotionCheck", type: "bool", desc: "Skip the post-generation motion measurement" },
  "--max-wait": { key: "maxWait", type: "int", default: 1800, desc: "Max seconds to wait per clip (default 1800)" },
  "--poll-interval": { key: "pollInterval", type: "int", default: 8, desc: "Polling interval in seconds (default 8)" },
  "--seed": { key: "seed", type: "int", desc: "Fixed seed for reproducibility" },
  "--audio-ref": { key: "audioRef", type: "string", desc: "Public audio URL to use as a rhythm reference (reference mode only)" },
  "--no-enhance": { key: "noEnhance", type: "bool", desc: "Do not append motion reinforcement / exclusion words" },
  ...cli.COMMON_KEYS,
};

const USAGE = `videos.js — Stage 3: image-to-video for every shot

Options:
  --project <dir>        Project directory (default: the unique project under out/)
  --keys "sk-a,sk-b"     Agnes API keys (round-robin)
  --mode keyframe        keyframe (first_frame = keyframe, default) | reference
  --chain                Pin last_frame to the next shot's keyframe inside a section
  --motion-min 1.2       Reject clips whose measured motion is below this
  --motion-retries 2     How many times to regenerate a static clip
  --candidates 1         Shoot N takes per shot, keep the liveliest (N x credits)
  --concurrency 2        Parallel video tasks
  --only S01,S05         Only these shots
  --force                Overwrite existing clips
  --dry-run              Print the plan and exit

Example:
  node videos.js --project ./mv-song --keys "sk-a,sk-b" --concurrency 3`;

// ---------------------------------------------------------------------------
// Motion linter
// ---------------------------------------------------------------------------

const CAMERA_KEYS = [
  "dolly", "push in", "pull back", "pan", "tilt", "track", "crane", "jib", "orbit",
  "handheld", "steadicam", "zoom", "slider", "arc", "truck", "follow", "sweep",
  "推进", "推近", "拉远", "拉镜", "横移", "平移", "摇", "升", "降", "跟拍", "跟", "环绕", "旋转", "手持", "变焦",
  "移动", "游走", "推轨", "升降", "划过",
];

const SUBJECT_KEYS = [
  "walk", "run", "turn", "raise", "lower", "lift", "reach", "open", "close", "step",
  "breath", "blink", "sway", "fall", "rise", "look", "smile", "frown", "embrace", "stride",
  "走", "跑", "转身", "回头", "抬头", "低头", "伸手", "推开", "拉", "呼吸", "眨眼", "摇晃",
  "飘", "飘动", "扬起", "落下", "升起", "看向", "望向", "微笑", "皱眉", "拥抱", "甩", "翻", "挥", "踏", "倾",
];

const AMBIENT_KEYS = [
  "wind", "rain", "smoke", "dust", "light", "shadow", "water", "ripple", "flicker", "drift",
  "风", "雨", "雾", "烟", "尘", "光", "影", "水面", "涟漪", "闪烁", "流动", "飘散", "飞舞", "波光", "蒸汽", "雪",
];

function hasAny(text, keys) {
  const t = String(text || "").toLowerCase();
  return keys.some((k) => t.includes(k.toLowerCase()));
}

/**
 * Ensure the video prompt contains camera motion, subject motion and ambient
 * motion. Missing pieces are appended rather than rejected, because the goal is
 * a usable prompt — and every repair is logged so the planner can be improved.
 */
function lintMotionPrompt(shot, sb, opts) {
  const original = String(shot.video_prompt || "").trim();
  const notes = [];
  const additions = [];
  const intensity = Number(shot.motion_intensity) || 2;

  if (!hasAny(original, CAMERA_KEYS)) {
    const cam = intensity >= 3
      ? "摄影机以稳定的速度推进并轻微横向移动"
      : intensity === 2
        ? "摄影机缓慢向前推进，保持平稳"
        : "摄影机近乎静止，只做极缓慢的微推移";
    additions.push(cam);
    notes.push("补写摄影机运动");
  }
  if (!hasAny(original, SUBJECT_KEYS)) {
    const act = shot.subject_action || (sb.character && sb.character.name ? `${sb.character.name}自然地呼吸、眨眼并轻微移动身体重心` : "画面主体持续发生细微的物理变化");
    additions.push(act);
    notes.push("补写主体动作");
  }
  if (!hasAny(original, AMBIENT_KEYS)) {
    const amb = "环境持续运动：空气流动、光线缓变、细小颗粒漂浮";
    additions.push(amb);
    notes.push("补写环境次级运动");
  }

  let prompt = original;
  if (additions.length) prompt = original.replace(/[。.\s]+$/, "") + "。" + additions.join("。") + "。";

  if (!opts.noEnhance) {
    prompt +=
      " 整段画面始终处于连续、自然的运动中，严禁静止帧、严禁定格、严禁缓慢到近乎不动的镜头。" +
      " 运镜匀速平滑，动作连贯可信，无跳帧、无画面撕裂、无二次曝光。" +
      " 画面中不出现任何文字、字幕、水印、logo 或 UI 元素。";
    const style = sb.visual_style || {};
    if (style.look) prompt += ` 影像风格：${style.look}。`;
    if (style.lighting) prompt += ` 光线：${style.lighting}。`;
  }
  return { prompt, notes };
}

/** A stronger prompt used when a clip came back too static. */
function amplifyMotionPrompt(base, shot, level) {
  const intensity = Number(shot.motion_intensity) || 2;
  const heads = level <= 1
    ? "这个镜头必须有明显的运动，绝不能是静态画面。"
    : "警告：这是一个高动态镜头，画面必须持续显著地运动，任何静止感都不可接受。";
  const cam = intensity >= 3
    ? "摄影机持续向前推进并跟随主体移动，全程保持明显位移。"
    : "摄影机持续缓慢推近，位移清晰可见。";
  const body = shot.subject_action ? `主体动作：${shot.subject_action}，动作幅度要清晰可见。` : "";
  return `${heads}${cam}${body}环境元素持续流动变化。禁止静止、禁止定格、禁止缓慢到看不出运动。${base}`;
}

// ---------------------------------------------------------------------------
// Submit one shot
// ---------------------------------------------------------------------------

function clipPath(dir, id) {
  return path.join(dir, `shot_${String(id).replace(/[^\w.-]/g, "_")}.mp4`);
}

function urlSidecar(pngPath) {
  const p = pngPath + ".url";
  if (!fs.existsSync(p)) return null;
  const u = fs.readFileSync(p, "utf8").trim();
  return u || null;
}

function isUsableClip(p, minBytes) {
  if (!fs.existsSync(p)) return false;
  return fs.statSync(p).size >= (minBytes || 50000);
}

/**
 * Create + poll + download a single clip. Returns the clip record.
 */
async function generateClip(pool, job, opts) {
  const { sb, args, dir } = opts;

  const created = await agnes.createVideoTask(pool, {
    prompt: job.prompt,
    seconds: job.seconds,
    mode: job.mode,
    aspectRatio: job.aspectRatio,
    firstFrame: job.firstFrame,
    lastFrame: job.lastFrame,
    images: job.images,
    audios: job.audios,
    seed: args.seed,
  });

  agnes.log(`      [${job.id}] task created video_id=${created._video_id}`);
  const done = await agnes.pollVideoTask(pool, created._video_id, {
    pollIntervalMs: args.pollInterval * 1000,
    maxWaitMs: args.maxWait * 1000,
  });

  const out = job.outFile || clipPath(dir, job.id);
  const bytes = await agnes.downloadToFile(done._video_url, out, 600000);
  agnes.log(`      [${job.id}] downloaded ${(bytes / 1024 / 1024).toFixed(2)} MB in ${done.seconds}s @ ${done.size}`);

  const probe = ff.probeMedia(out);
  return { id: job.id, file: out, bytes, url: done._video_url, probe, seconds: Number(done.seconds) };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const parse = cli.createParser(SPEC, USAGE);
  const args = parse(process.argv.slice(2));

  // Never derived from the current working directory — see lib/paths.js.
  const projectDir = cli.resolveProjectDir(args.project || args._positional[0]);
  const project = cli.loadProject(projectDir);
  if (!project.storyboard || !fs.existsSync(project.storyboard)) {
    throw new Error(`No storyboard found for ${projectDir}. Run plan.js first.`);
  }
  const sb = JSON.parse(fs.readFileSync(project.storyboard, "utf8"));
  const meta = sb.meta || {};
  const aspectRatio = meta.aspectRatio || "16:9";
  const imgDir = cli.stageDir(projectDir, "images");
  const clipDir = cli.stageDir(projectDir, "clips");

  if (!["keyframe", "reference"].includes(args.mode)) {
    throw new Error("--mode must be keyframe or reference");
  }
  if (!args.skipMotionCheck) ff.assertFfmpegAvailable();

  const only = new Set((args.only || []).map((s) => String(s).toUpperCase()));
  const wants = (id) => !only.size || only.has(String(id).toUpperCase());

  agnes.log("=".repeat(78));
  agnes.log(`Stage 3 — video generation  |  project=${projectDir}`);
  agnes.log(`  shots=${sb.shots.length}  mode=${args.mode}  aspect=${aspectRatio}  concurrency=${args.concurrency}  motionMin=${args.motionMin}`);
  if (args.candidates > 1) {
    agnes.log(`  每镜生成 ${args.candidates} 条候选并自动保留运动量最高的一条（视频成本约 ×${args.candidates}）`);
  }
  agnes.log("=".repeat(78));

  // ---- build the job list ------------------------------------------------
  const shots = sb.shots;
  const jobs = [];
  const skipped = [];
  const assetProblems = [];
  const readiness = [];
  const sceneAssets = assets.loadSceneAssets(imgDir, sb);

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const kf = path.join(imgDir, `shot_${String(shot.id).replace(/[^\w.-]/g, "_")}.png`);
    const kfUrl = urlSidecar(kf);
    const out = clipPath(clipDir, shot.id);
    const hasCharacter = Array.isArray(shot.characters_in_shot) && shot.characters_in_shot.length > 0;
    const sceneRef = assets.sceneRefFor(shot, sceneAssets);

    // ---- readiness record --------------------------------------------------
    // A shot is only "ready" when its assets actually exist: the keyframe has a
    // public URL (the video API cannot read a local file), the duration is
    // inside the API window, and any location the storyboard claims has an
    // anchor on disk. Recording this before we shoot is what turns a late
    // surprise into a pre-flight report.
    const dur = Number(shot.api_seconds || shot.duration);
    const problems = [];
    if (!kfUrl) problems.push("首帧缺失");
    if (dur && (dur < 2 || dur > 30)) problems.push(`时长 ${dur}s 超出 API 区间`);
    if (shot.scene_id && !sceneRef) problems.push(`场景 ${shot.scene_id} 无锚点图`);
    readiness.push([
      shot.id,
      kfUrl ? "ok" : "MISSING",
      hasCharacter ? "角色(身+脸)" : (sceneRef ? "场景" : "-"),
      sceneRef ? String(shot.scene_id) : (shot.scene_id ? "MISSING" : "-"),
      dur ? dur.toFixed(1) + "s" : "-",
      problems.join("；") || "READY",
    ]);

    if (!args.force && isUsableClip(out)) {
      skipped.push(shot.id);
      continue;
    }
    if (!wants(shot.id)) continue;
    if (!kfUrl) {
      assetProblems.push(`${shot.id}: 缺少首帧图片或公网 URL（${kf}）`);
      continue;
    }

    const { prompt, notes } = lintMotionPrompt(shot, sb, { noEnhance: args.noEnhance });
    if (notes.length) agnes.log(`      [lint] ${shot.id}: ${notes.join("、")}`);
    const job = {
      id: shot.id,
      index: i,
      shot,
      prompt,
      seconds: shot.api_seconds,
      mode: args.mode,
      aspectRatio,
      firstFrame: null,
      lastFrame: null,
      images: null,
      audios: null,
    };

    if (args.mode === "keyframe") {
      job.firstFrame = kfUrl;
      if (args.chain) {
        // Join to the next shot's keyframe only when both shots are in the same
        // section, so scene changes still cut cleanly.
        const next = shots[i + 1];
        if (next && next.section === shot.section) {
          const nf = path.join(imgDir, `shot_${String(next.id).replace(/[^\w.-]/g, "_")}.png`);
          const nfUrl = urlSidecar(nf);
          if (nfUrl) job.lastFrame = nfUrl;
        }
      }
    } else {
      // reference mode: <Picture 1> = identity anchor, <Picture 2> = the keyframe
      // whose composition/scene/lighting must be reproduced.
      //
      // The anchor is the SAME angle-matched studio reference the keyframe was
      // rendered from, falling back through face close-up and master sheet so a
      // missing asset degrades instead of breaking the run.
      const view = assets.normaliseView(shot.characters_view) || "front";
      const refFor = (name) => urlSidecar(path.join(imgDir, name));
      const identityRef =
        refFor(`ref_body_${view.replace(/[^\w.-]/g, "_")}.png`) ||
        refFor("ref_body_front.png") ||
        refFor("ref_face.png") ||
        refFor("ref_charsheet.png");
      job.images = hasCharacter && identityRef ? [identityRef, kfUrl] : [kfUrl];
      if (hasCharacter && identityRef) {
        job.prompt =
          `以 <Picture 2> 的画面构图、场景、光线与色彩为基准生成这段视频，` +
          `并以 <Picture 1> 作为人物身份的唯一依据，严格保持其面部特征、发型与服装完全一致。` +
          job.prompt;
      } else {
        job.prompt = `以 <Picture 1> 的画面构图、场景、光线与色彩为基准生成这段视频，保持画面一致性。` + job.prompt;
      }
      if (args.audioRef) job.audios = [args.audioRef];
    }
    jobs.push(job);
  }

  if (assetProblems.length) {
    agnes.log("");
    agnes.log("以下镜头缺少首帧素材，已跳过：");
    assetProblems.forEach((p) => agnes.log("  - " + p));
    agnes.log("");
  }

  if (readiness.length) {
    agnes.log("");
    agnes.log("  镜头就绪状态（预检：首帧 / 参考图 / 地点锚点 / 时长）：");
    cli.printTable(readiness, ["shot", "首帧", "参考", "场景", "时长", "状态"]);
    const notReady = readiness.filter((r) => r[5] !== "READY");
    if (notReady.length) {
      agnes.log(`  ⚠ ${notReady.length}/${readiness.length} 个镜头素材不齐；缺少首帧的镜头本次会被跳过。`);
    } else {
      agnes.log(`  ✓ ${readiness.length} 个镜头素材齐备。`);
    }
  }

  agnes.log(
    `  to generate: ${jobs.length}    already present: ${skipped.length}    blocked: ${assetProblems.length}`
  );
  jobs.forEach((j) =>
    agnes.log(
      `    ${String(j.id).padEnd(6)} ${String(j.seconds).padStart(2)}s  ${j.mode.padEnd(9)} ` +
      `${(j.shot.camera_movement || "-").slice(0, 40)}`
    )
  );

  if (args.dryRun) {
    agnes.log("\n--dry-run: no tasks created.");
    process.stdout.write(`PLANNED=${jobs.length}\n`);
    process.exit(0);
  }
  if (!jobs.length && !assetProblems.length) {
    agnes.log("Nothing to do.");
    process.stdout.write(`CLIPS_DIR=${clipDir}\nCLIPS_READY=${skipped.length}/${shots.length}\n`);
    process.exit(0);
  }

  const pool = cli.buildKeyPool(args);

  // ---- run ---------------------------------------------------------------
  agnes.log("");
  agnes.log(`[1/2] Generating ${jobs.length} clip(s) ...`);
  let done = 0;

  const results = await agnes.runPool(
    jobs,
    async (job) => {
      let rec = null;
      let lastErr = null;

      for (let attempt = 0; attempt <= args.motionRetries; attempt++) {
        const j = attempt === 0
          ? job
          : { ...job, prompt: amplifyMotionPrompt(job.prompt, job.shot, attempt), seconds: job.seconds };
        if (attempt > 0) agnes.log(`      [${job.id}] motion retry ${attempt}: regenerating with stronger motion`);

        // ---- shoot N takes, keep the liveliest ----------------------------
        // Selective pressure beats a lucky draw: two or three takes of the same
        // prompt differ mostly in how much they move, and a frozen clip is the
        // failure this whole stage exists to prevent. Default is 1 take so the
        // behaviour (and the bill) is unchanged unless you opt in.
        const nTakes = Math.max(1, args.candidates);
        const takes = [];
        for (let c = 1; c <= nTakes; c++) {
          const outFile = nTakes > 1
            ? clipPath(clipDir, job.id).replace(/\.mp4$/, `.t${attempt + 1}-${c}.mp4`)
            : clipPath(clipDir, job.id);
          try {
            const r = await generateClip(pool, { ...j, outFile }, { sb, args, dir: clipDir });
            if (!args.skipMotionCheck) {
              const m = ff.motionScore(r.file, { fps: 4 });
              r.motion = m.score === null ? null : m.score;
            }
            takes.push(r);
          } catch (e) {
            lastErr = e;
            agnes.log(`      [${job.id}] take ${c}/${nTakes} failed: ${String(e.message).split("\n")[0].slice(0, 160)}`);
          }
        }

        if (!takes.length) {
          if (attempt < args.motionRetries) { await agnes.sleep(5000); continue; }
          break;
        }

        const mOf = (t) => (t.motion === null || t.motion === undefined ? -1 : t.motion);
        takes.sort((a, b) => mOf(b) - mOf(a));
        const winner = takes[0];
        const canon = clipPath(clipDir, job.id);

        if (nTakes > 1) {
          agnes.log(
            `      [${job.id}] ${nTakes} 条候选运动量: ` +
            takes.map((t) => (mOf(t) < 0 ? "n/a" : mOf(t).toFixed(2))).join(" / ") +
            `  → 保留 ${mOf(winner) < 0 ? "n/a" : mOf(winner).toFixed(2)}`
          );
        }
        takes.slice(1).forEach((t) => { try { fs.unlinkSync(t.file); } catch (e) { /* best effort */ } });
        if (winner.file !== canon) {
          try { fs.renameSync(winner.file, canon); winner.file = canon; } catch (e) { /* keep the take name */ }
        }
        rec = winner;

        // ---- objective motion gate ---------------------------------------
        if (args.skipMotionCheck) break;
        const mscore = winner.motion;
        if (mscore === null || mscore === undefined) {
          agnes.log(`      [${job.id}] motion check unavailable; accepting`);
          break;
        }
        agnes.log(
          `      [${job.id}] motion=${mscore.toFixed(2)} (min ${args.motionMin}) -> ` +
          `${mscore >= args.motionMin ? "ok" : "TOO STATIC"}`
        );
        if (mscore >= args.motionMin) break;
        if (attempt === args.motionRetries) {
          agnes.log(`      [${job.id}] WARNING: still below threshold after ${args.motionRetries} retries; keeping the liveliest take`);
          break;
        }
      }

      if (!rec) throw lastErr || new Error(`${job.id}: no clip produced`);
      done++;
      agnes.log(`      progress ${done}/${jobs.length}`);
      return rec;
    },
    args.concurrency
  );

  // ---- report ------------------------------------------------------------
  agnes.log("");
  agnes.log("[2/2] Clip inventory ...");

  const rows = [];
  const weak = [];
  const failed = [];
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const p = clipPath(clipDir, shot.id);
    if (!fs.existsSync(p)) { rows.push([shot.id, "MISSING", "-", "-", "-", "-"]); failed.push(shot.id); continue; }
    const pr = ff.probeMedia(p);
    const res = results.find((r) => r.ok && r.value && r.value.id === shot.id);
    const mscore = res && res.value.motion !== undefined ? res.value.motion : null;
    rows.push([
      shot.id,
      `${(fs.statSync(p).size / 1024 / 1024).toFixed(2)}MB`,
      `${pr.width}x${pr.height}`,
      pr.fps ? pr.fps.toFixed(2) : "-",
      pr.duration ? pr.duration.toFixed(2) + "s" : "-",
      mscore === null ? "-" : mscore.toFixed(2),
    ]);
    if (mscore !== null && mscore < args.motionMin) weak.push(`${shot.id}=${mscore.toFixed(2)}`);
  }
  cli.printTable(rows, ["shot", "体积", "分辨率", "帧率", "时长", "运动量"]);

  results.forEach((r, i) => { if (!r.ok) failed.push(`${jobs[i].id}(${String(r.error.message).split("\n")[0].slice(0, 60)})`); });

  const ready = rows.filter((r) => r[1] !== "MISSING").length;
  process.stdout.write("\n");
  process.stdout.write(`CLIPS_DIR=${clipDir}\n`);
  process.stdout.write(`CLIPS_READY=${ready}/${shots.length}\n`);
  const notReadyIds = readiness.filter((r) => r[5] !== "READY").map((r) => r[0]);
  if (notReadyIds.length) process.stdout.write(`SHOTS_NOT_READY=${notReadyIds.join(",")}\n`);
  if (weak.length) process.stdout.write(`LOW_MOTION=${weak.join(",")}\n`);
  if (failed.length) process.stdout.write(`CLIPS_FAILED=${failed.join(",")}\n`);
  process.stdout.write(`VIDEO_USAGE=${pool.stats()}\n`);

  project.stages = project.stages || {};
  project.stages.clips = {
    done: failed.length === 0,
    at: new Date().toISOString(),
    ready,
    total: shots.length,
    lowMotion: weak,
    dir: clipDir,
  };
  cli.saveProject(project);

  if (failed.length) {
    process.stdout.write(`\n仍有 ${failed.length} 个镜头缺失，重跑本脚本会自动续做。\n`);
    process.exit(1);
  }
  process.stdout.write("\n下一步：\n");
  process.stdout.write(`  node assemble.js --project "${projectDir}"\n`);
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write("\nvideos.js FAILED: " + (e && e.message ? e.message : e) + "\n");
  process.exit(1);
});
