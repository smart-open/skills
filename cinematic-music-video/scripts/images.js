#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * images.js — Stage 2: build the character identity assets, then render every
 * shot's keyframe with an identity gate that can reject and redo a frame.
 *
 * Execution order (each step feeds the next):
 *
 *   1. CHARACTER ASSETS  (lib/assets.js)
 *        ref_charsheet.png   master reference sheet — close-up + front/side/back
 *                            full-body views of one person, best of N candidates
 *        character_lock.json structured identity parameters read back off the
 *                            accepted sheet by a vision pass
 *        ref_face.png        head-and-shoulders facial anchor
 *        ref_body_*.png      full-body studio views per angle, derived from the sheet
 *
 *      These are the ONLY source of the protagonist's appearance downstream.
 *
 *   2. STYLE BOARD (ref_style.png) — a character-free frame fixing palette/light/texture.
 *
 *   3. SHOT KEYFRAMES (shot_S01.png ...)
 *        Character shots get the angle-matched body reference + the face close-up
 *        as multi-image composition inputs. After generation the frame is sent
 *        back through the vision model to check it is actually the same person;
 *        a frame that drifts is regenerated with the measured differences turned
 *        into explicit corrections. The best-scoring attempt is the one kept.
 *
 * Every PNG gets a `.url` sidecar with its public HTTPS URL — that URL is what
 * the video stage feeds to `first_frame`, since the image API returns publicly
 * hosted files and no external image host is needed.
 *
 * Usage:
 *   node images.js --project ./mv-song --keys "sk-a,sk-b" \
 *                  [--concurrency 2] [--force] [--only S01,S05] [--size 2K]
 */

const fs = require("fs");
const path = require("path");

const agnes = require("./lib/agnes");
const cli = require("./lib/cli");
const render = require("./lib/render");
const assets = require("./lib/assets");
const vision = require("./lib/vision");

const SPEC = {
  "--project": { key: "project", type: "string", alias: ["-d"], desc: "Project directory created by plan.js" },
  "--concurrency": { key: "concurrency", type: "int", default: 2, desc: "Parallel image requests (default 2)" },
  "--size": { key: "size", type: "string", default: "2K", desc: "Image size tier: 1K | 2K | 3K | 4K" },
  "--force": { key: "force", type: "bool", desc: "Regenerate even if the file already exists" },
  "--only": { key: "only", type: "list", multi: true, desc: "Only process these shot ids, e.g. --only S01,S05" },
  "--skip-refs": { key: "skipRefs", type: "bool", desc: "Skip character / style reference generation" },
  "--no-enhance": { key: "noEnhance", type: "bool", desc: "Do not append cinematic quality / exclusion words" },
  "--retries": { key: "retries", type: "int", default: 2, desc: "Per-image retry attempts on failure" },
  "--check-url": { key: "checkUrl", type: "bool", default: true, desc: "Verify generated image URLs are publicly reachable" },

  // --- character identity ---
  "--sheet-candidates": { key: "sheetCandidates", type: "int", default: 2, desc: "Generate N reference sheets and keep the best-scoring one (default 2)" },
  "--sheet-layout": { key: "sheetLayout", type: "string", default: "sheet-full", desc: "Reference-sheet layout: sheet-full (close-up + turnaround + expression band), sheet (close-up + turnaround), turntable (8 views)" },
  "--angles": { key: "angles", type: "list", default: render.SHEET_ANGLES, desc: "Body reference angles to derive, e.g. --angles front,3q-left,side,back" },
  "--ref-ratio": { key: "refRatio", type: "string", default: "9:16", desc: "Aspect ratio for full-body references (default 9:16, portrait suits a standing figure)" },
  "--include-sheet": { key: "includeSheet", type: "bool", desc: "Also pass the master sheet as a third reference for each shot" },
  "--no-scenes": { key: "noScenes", type: "bool", desc: "Do not build location anchor references (one empty frame per scene)" },

  // --- vision gates ---
  "--no-verify": { key: "noVerify", type: "bool", desc: "Disable all vision checks (sheet scoring, identity extraction, per-shot identity gate)" },
  "--identity-min": { key: "identityMin", type: "int", default: 70, desc: "Minimum identity match score (0-100) for a character keyframe to be accepted" },
  "--identity-retries": { key: "identityRetries", type: "int", default: 2, desc: "Regeneration attempts for a keyframe that fails the identity gate" },
  "--ref-retries": { key: "refRetries", type: "int", default: 2, desc: "Regeneration attempts for a studio reference that fails its single-subject gate" },
  "--text-strict": { key: "textStrict", type: "bool", desc: "Treat any readable text in a character keyframe as a failure worth regenerating" },
  "--vision-max-px": { key: "visionMaxPx", type: "int", default: 768, desc: "Longest edge sent to the vision model (default 768)" },

  ...cli.COMMON_KEYS,
};

const USAGE = `images.js — Stage 2: character identity assets + per-shot keyframes

Options:
  --project <dir>          Project directory (default: the unique project under out/)
  --keys "sk-a,sk-b"       Agnes API keys (round-robin)
  --concurrency 2          Parallel requests
  --size 2K                Image size tier
  --only S01,S05           Regenerate only these shots
  --force                  Overwrite existing files
  --sheet-candidates 2     Reference-sheet candidates to generate and score
  --sheet-layout full      sheet-full | sheet | turntable (default sheet-full: close-up + turnaround + expression band)
  --angles front,3q-left   Body reference angles to derive from the sheet
  --no-scenes              Skip the per-location anchor frames
  --ref-retries 2          Regenerations for a studio reference that fails its gate
  --identity-min 70        Minimum identity match score to accept a keyframe
  --identity-retries 2     Regenerations for a keyframe that fails the gate
  --text-strict            Fail a character keyframe that contains readable text
  --no-verify              Disable all vision checks
  --no-enhance             Do not append quality / exclusion words

Example:
  node images.js --project ./mv-song --keys "sk-a,sk-b" --concurrency 3`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shotPath(dir, id) {
  return path.join(dir, `shot_${String(id).replace(/[^\w.-]/g, "_")}.png`);
}

function copyWithSidecar(from, to) {
  fs.copyFileSync(from, to);
  if (fs.existsSync(from + ".url")) fs.copyFileSync(from + ".url", to + ".url");
}

function dropQuietly(p) {
  try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* best effort */ }
  try { if (fs.existsSync(p + ".url")) fs.unlinkSync(p + ".url"); } catch (e) { /* best effort */ }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const parse = cli.createParser(SPEC, USAGE);
  const args = parse(process.argv.slice(2));

  // Project resolution never falls back to the current working directory:
  // if --project is omitted we use the (unique) project under <skill>/out/,
  // and refuse to guess when several exist.
  const projectDir = cli.resolveProjectDir(args.project || args._positional[0]);
  const project = cli.loadProject(projectDir);
  if (!project.storyboard || !fs.existsSync(project.storyboard)) {
    throw new Error(
      `No storyboard found for project ${projectDir}.\nRun plan.js first:\n` +
      `  node plan.js --song "song.mp3" --out "${projectDir}"`
    );
  }
  const sb = JSON.parse(fs.readFileSync(project.storyboard, "utf8"));
  const meta = sb.meta || {};
  const aspectRatio = meta.aspectRatio || "16:9";
  const dir = cli.stageDir(projectDir, "images");
  // The key-rotation cursor is shared runtime state, so it lives in
  // <out>/.state/ rather than inside one project: that way consecutive projects
  // keep spreading requests across the pool instead of all restarting at key 1.
  const pool = cli.buildKeyPool(args);

  const only = new Set((args.only || []).map((s) => String(s).toUpperCase()));
  const wants = (id) => !only.size || only.has(String(id).toUpperCase());
  const verify = !args.noVerify;
  const minScore = args.identityMin;

  agnes.log("=".repeat(78));
  agnes.log(`Stage 2 — image generation  |  project=${projectDir}`);
  agnes.log(`  shots=${sb.shots.length}  aspect=${aspectRatio}  size=${args.size}  concurrency=${args.concurrency}  keys=${pool.keys.length}`);
  agnes.log(`  identity gate: ${verify ? `on (min score ${minScore}, ${args.identityRetries} retry)` : "OFF (--no-verify)"}`);
  agnes.log("=".repeat(78));

  // ---- 1. character assets ------------------------------------------------
  let charAssets = { identity: null, sheet: null, face: null, bodies: {} };
  let sceneAssets = {};
  let styleUrl = null;

  if (!args.skipRefs) {
    agnes.log("[1/3] Character identity assets ...");
    charAssets = await assets.buildCharacterAssets(pool, {
      dir,
      sb,
      angles: args.angles,
      refRatio: args.refRatio,
      sheetLayout: args.sheetLayout,
      aspect: aspectRatio,
      size: args.size,
      concurrency: args.concurrency,
      candidates: args.sheetCandidates,
      force: args.force,
      verify,
      refRetries: args.refRetries,
      retries: args.retries,
      checkUrl: args.checkUrl,
      visionMaxPx: args.visionMaxPx,
    });
    if (!charAssets.sheet) {
      throw new Error(
        "Failed to produce the character reference sheet. The protagonist cannot be kept consistent without it.\n" +
        "Re-run with --force to retry, or pass --skip-refs to proceed without character consistency."
      );
    }

    // Style board.
    const stPath = path.join(dir, "ref_style.png");
    if (args.force || !assets.isUsable(stPath)) {
      agnes.log("      生成风格基调板 ...");
      try {
        await assets.makeImage(pool, {
          prompt: render.buildStyleBoardPrompt(sb), outPath: stPath, refs: null,
          size: args.size, ratio: aspectRatio, label: "风格基调板",
          retries: args.retries, checkUrl: args.checkUrl,
        });
      } catch (e) {
        agnes.log(`      [warn] 风格基调板生成失败（非致命）: ${String(e.message).split("\n")[0]}`);
      }
    } else {
      agnes.log("      [skip] 风格基调板 already exists");
    }
    styleUrl = assets.readUrlSidecar(stPath);

    // Location anchors — one empty frame per place the film returns to.
    if (!args.noScenes) {
      sceneAssets = await assets.buildSceneAssets(pool, {
        dir,
        sb,
        aspect: aspectRatio,
        size: args.size,
        concurrency: args.concurrency,
        force: args.force,
        verify,
        refRetries: args.refRetries,
        retries: args.retries,
        checkUrl: args.checkUrl,
        visionMaxPx: args.visionMaxPx,
      });
    }
  } else {
    // --skip-refs means "do not spend API calls regenerating the references",
    // not "throw the references away". Reuse whatever is already on disk so the
    // identity anchoring still applies to the keyframes.
    charAssets = assets.loadCharacterAssets(dir);
    sceneAssets = args.noScenes ? {} : assets.loadSceneAssets(dir, sb);
    styleUrl = assets.readUrlSidecar(path.join(dir, "ref_style.png"));
    if (charAssets.face || Object.keys(charAssets.bodies).length) {
      agnes.log(
        `[1/3] Reusing existing character assets (--skip-refs): ` +
        `设定表=${charAssets.sheet ? "ok" : "none"}  ${Object.keys(charAssets.bodies).join(", ") || "none"}` +
        (Object.keys(sceneAssets).length ? `  场景锚点=${Object.keys(sceneAssets).join(", ")}` : "")
      );
    } else {
      agnes.log("[1/3] No character assets found on disk (--skip-refs) — shots will render without identity anchoring");
    }
  }

  // ---- 2. shot keyframes --------------------------------------------------
  const shots = sb.shots.filter((s) => wants(s.id));
  agnes.log(`[2/3] Shot keyframes (${shots.length} of ${sb.shots.length}) ...`);

  const tasks = [];
  for (const shot of shots) {
    const outPath = shotPath(dir, shot.id);
    const hasCharacter =
      Array.isArray(shot.characters_in_shot) && shot.characters_in_shot.length > 0 &&
      !!(charAssets.face || Object.keys(charAssets.bodies).length);

    if (!args.force && assets.isUsable(outPath)) {
      agnes.log(`      [skip] ${shot.id} already exists`);
      continue;
    }

    let refs = { paths: [], urls: [], labels: [], roles: [], view: null };
    const sceneRef = assets.sceneRefFor(shot, sceneAssets);
    if (hasCharacter) {
      refs = assets.pickShotRefs(shot, charAssets, { includeSheet: args.includeSheet, sceneRef });
    } else if (sceneRef && sceneRef.url) {
      // An empty shot still anchors to its location asset, so the alley in shot
      // 4 is recognisably the same alley as in shot 2.
      refs = assets.pickShotRefs(shot, charAssets, { hasCharacter: false, sceneRef });
    } else if (styleUrl) {
      refs = { paths: [], urls: [styleUrl], labels: ["风格基调板"], roles: ["style"], view: null };
    }

    tasks.push({
      shot,
      shotId: shot.id,
      outPath,
      hasCharacter,
      hasScene: !!sceneRef,
      refs,
      prompt: render.buildKeyframePrompt(shot, sb, {
        identity: charAssets.identity,
        hasCharacter,
        refLabels: refs.labels,
        refRoles: refs.roles,
        hasScene: !!sceneRef,
        noEnhance: args.noEnhance,
      }),
    });
  }

  const qa = [];

  if (!tasks.length) {
    agnes.log("      nothing to do (all keyframes already exist; use --force to regenerate)");
  } else {
    let done = 0;
    const results = await agnes.runPool(
      tasks,
      async (t) => {
        await agnes.sleep(Math.random() * 800);

        const basePrompt = t.prompt;
        let best = null;        // { path, url, score, verdict }
        const totalAttempts = 1 + (t.hasCharacter ? Math.max(0, args.identityRetries) : 0);
        let fix = null;

        for (let attempt = 1; attempt <= totalAttempts; attempt++) {
          const attemptPath = attempt === 1 ? t.outPath : t.outPath.replace(/\.png$/, `.att${attempt}.png`);
          const prompt = fix && fix.length
            ? render.buildKeyframePrompt(t.shot, sb, {
                identity: charAssets.identity,
                hasCharacter: t.hasCharacter,
                refLabels: t.refs.labels,
                refRoles: t.refs.roles,
                hasScene: t.hasScene,
                fix,
                noEnhance: args.noEnhance,
              })
            : basePrompt;

          const rec = await assets.makeImage(pool, {
            prompt,
            outPath: attemptPath,
            refs: t.refs.urls,
            size: args.size,
            ratio: aspectRatio,
            label: `镜头 ${t.shotId}${attempt > 1 ? ` (重试 ${attempt})` : ""}`,
            retries: args.retries,
            checkUrl: args.checkUrl,
          });

          // -------- vision gate --------
          // Three distinct ways a frame can be wrong even when the face
          // matches, each needing its own decision rule:
          //   • the protagonist is missing or duplicated   -> always a failure
          //   • extra people in frame                      -> failure only if PROMINENT
          //     (a wide city street legitimately has blurred pedestrians far away)
          //   • lettering that can actually be read        -> failure only with --text-strict
          let verdict = null;
          if (verify) {
            try {
              if (t.hasCharacter && t.refs.paths.length) {
                verdict = await vision.compareIdentity(pool, {
                  refPaths: t.refs.paths,
                  candPath: attemptPath,
                  shotInfo: `${t.shotId} · ${t.shot.shot_size || ""} · ${t.shot.camera_movement || ""}`.trim(),
                  maxPx: args.visionMaxPx,
                });

                const tooFewOrMany = verdict.protagonist_count !== 1;
                const extrasAreAPProblem = verdict.other_people_count > 0 && verdict.other_people_prominent;
                const textIsAProblem = args.textStrict && verdict.has_readable_text;

                agnes.log(
                  `      [QA] ${t.shotId} 一致度 ${verdict.score}` +
                  (verdict.same_person ? " 同一人" : " ✗不同人") +
                  `  主角=${verdict.protagonist_count}  配角=${verdict.other_people_count}${verdict.other_people_prominent ? "(醒目)" : ""}` +
                  (verdict.has_readable_text ? `  文字="${String(verdict.text_content).slice(0, 20)}"` : "")
                );

                const notes = [];
                if (tooFewOrMany) {
                  notes.push(
                    verdict.protagonist_count === 0
                      ? "画面中没有出现主角，必须让主角清晰出现在画面里。"
                      : `画面中主角出现了 ${verdict.protagonist_count} 次，必须只出现 1 次（不要分身、不要并排的双人）。`
                  );
                }
                if (extrasAreAPProblem) {
                  notes.push(
                    `除主角外还有 ${verdict.other_people_count} 个醒目的人物。背景里可以有远处虚化的路人，` +
                    "但不能有面部可辨认或占据画面比例较大的其他人。"
                  );
                }
                if (textIsAProblem) {
                  notes.push(`画面出现了可辨认的文字：“${String(verdict.text_content).slice(0, 40)}”，必须完全没有文字。`);
                }
                if (notes.length) agnes.log(`           问题: ${notes.slice(0, 3).join("；")}`);
                else if (verdict.differences.length) {
                  agnes.log(`           差异: ${verdict.differences.slice(0, 3).join("；")}`);
                }

                if (tooFewOrMany || extrasAreAPProblem) verdict.same_person = false;
                if (textIsAProblem) verdict.same_person = false;
                verdict.differences = notes.concat(verdict.differences);
              } else {
                const a = await vision.auditKeyframe(pool, { candPath: attemptPath, expectCharacter: false, maxPx: args.visionMaxPx });
                const n = Number(a.human_count) || 0;
                agnes.log(`      [QA] ${t.shotId} 空镜 文字=${a.has_text ? "有" : "无"} 人物数=${n}`);
                verdict = {
                  same_person: !a.has_text && n === 0,
                  score: a.has_text || n > 0 ? 40 : 90,
                  differences: [
                    ...(a.has_text ? [`画面出现了文字：${a.text_content || "未知"}`] : []),
                    ...(n > 0 ? [`空镜中出现了 ${n} 个人，必须完全无人`] : []),
                  ],
                  has_readable_text: !!a.has_text,
                  protagonist_count: 0,
                  other_people_count: n,
                  other_people_prominent: n > 0,
                };
              }
            } catch (e) {
              agnes.log(`      [QA] ${t.shotId} 视觉校验失败（跳过，按通过处理）: ${String(e.message).split("\n")[0].slice(0, 140)}`);
              verdict = null;
            }
          }

          const accepted = !verdict || (verdict.same_person && verdict.score >= minScore);
          const better = !best || (verdict && verdict.score > best.score);

          if (better || attempt === 1) {
            if (best && best.path !== attemptPath) dropQuietly(best.path);
            best = { path: attemptPath, url: rec.url, score: verdict ? verdict.score : 100, verdict };
          } else {
            dropQuietly(attemptPath);
          }

          qa.push({
            shot: t.shotId,
            attempt,
            has_character: t.hasCharacter,
            view: t.refs.view,
            refs: t.refs.labels,
            score: verdict ? verdict.score : null,
            same_person: verdict ? verdict.same_person : null,
            protagonist_count: verdict ? verdict.protagonist_count : null,
            other_people_count: verdict ? verdict.other_people_count : null,
            differences: verdict ? verdict.differences : [],
            accepted,
          });

          if (accepted) break;
          if (attempt < totalAttempts) {
            fix = verdict ? verdict.differences : [];
            agnes.log(`      ↻ ${t.shotId} 未达标，依据差异重新生成（第 ${attempt + 1} 次）...`);
          }
        }

        // Promote the winning attempt to the canonical filename.
        if (best && best.path !== t.outPath) {
          copyWithSidecar(best.path, t.outPath);
          dropQuietly(best.path);
        }
        if (t.hasCharacter && verify && best && best.verdict && !(best.verdict.same_person && best.verdict.score >= minScore)) {
          agnes.log(`      ⚠ ${t.shotId} 最佳尝试一致度仅 ${best.verdict.score}，建议人工复核或 --only ${t.shotId} --force 重跑`);
        }

        done++;
        agnes.log(`      progress ${done}/${tasks.length}`);
        return best;
      },
      args.concurrency
    );

    const failed = results.map((r, i) => ({ r, t: tasks[i] })).filter((x) => !x.r.ok);
    if (failed.length) {
      agnes.log("");
      agnes.log(`      ${failed.length} keyframe(s) FAILED:`);
      failed.forEach((x) => agnes.log(`        - ${x.t.shotId}: ${String(x.r.error.message).split("\n")[0]}`));
    }
  }

  // ---- identity QA report -------------------------------------------------
  if (verify && qa.length) {
    // Group attempts per shot. What matters is whether the KEPT frame (the
    // best-scoring attempt) passed — attempt-level counts are misleading
    // because a rejected first try that was then fixed is a success, not a miss.
    const byShot = new Map();
    for (const r of qa) {
      if (!r.has_character || r.score === null) continue;
      if (!byShot.has(r.shot)) byShot.set(r.shot, []);
      byShot.get(r.shot).push(r);
    }
    const perShot = [];
    for (const [shot, attempts] of byShot) {
      const best = attempts.slice().sort((a, b) => b.score - a.score)[0];
      perShot.push({
        shot,
        attempts: attempts.length,
        view: best.view,
        refs: best.refs,
        best_score: best.score,
        passed: !!best.same_person && best.score >= minScore,
        protagonist_count: best.protagonist_count,
        other_people_count: best.other_people_count,
        differences: best.differences,
        history: attempts.map((a) => ({ attempt: a.attempt, score: a.score, same_person: a.same_person })),
      });
    }
    perShot.sort((a, b) => String(a.shot).localeCompare(String(b.shot)));
    const passed = perShot.filter((r) => r.passed).length;
    const retried = perShot.filter((r) => r.attempts > 1).length;
    const avg = perShot.length ? (perShot.reduce((s, r) => s + r.best_score, 0) / perShot.length).toFixed(1) : "-";

    agnes.log("");
    agnes.log("[2b] 人物一致性报告（按镜头统计最终保留的那一版）");
    cli.printTable(
      perShot.map((r) => [
        r.shot, `${r.attempts} 次`, r.view || "-", String(r.best_score),
        r.passed ? "通过" : "未达标",
        r.attempts > 1 ? `已自动重画（历史 ${r.history.map((h) => h.score).join("→")}）` : "",
      ]),
      ["镜头", "尝试", "参考角度", "最终一致度", "结果", "重试轨迹"]
    );
    agnes.log(`      通过 ${passed}/${perShot.length}    平均一致度 ${avg}    触发自动重画的镜头 ${retried} 个`);
    perShot.filter((r) => !r.passed).forEach((r) =>
      agnes.log(`      ⚠ ${r.shot} 最终一致度仅 ${r.best_score}：${r.differences.slice(0, 2).join("；") || "无具体差异描述"}\n` +
        `        建议：node images.js --project "<项目>" --only ${r.shot} --force`)
    );

    const report = {
      generated_at: new Date().toISOString(),
      identity_source: charAssets.identity ? charAssets.identity._source : null,
      sheet_score: charAssets.sheet ? charAssets.sheet.score : null,
      identity_min_score: minScore,
      average_score: avg === "-" ? null : Number(avg),
      passed,
      total: perShot.length,
      auto_retried_shots: retried,
      per_shot: perShot,
      attempts: qa,
    };
    agnes.writeFileSyncDurable(path.join(dir, "identity_report.json"), JSON.stringify(report, null, 2) + "\n");
    agnes.log(`      报告已写入 ${path.join(dir, "identity_report.json")}`);
  }

  // ---- 3. inventory ------------------------------------------------------
  agnes.log("[3/3] Asset inventory ...");
  const rows = [];
  const missingUrls = [];
  for (const shot of sb.shots) {
    const p = shotPath(dir, shot.id);
    const exists = fs.existsSync(p);
    const st = exists ? fs.statSync(p) : null;
    const url = exists ? assets.readUrlSidecar(p) : null;
    if (!url) missingUrls.push(shot.id);
    rows.push([
      shot.id,
      shot.section || "-",
      exists ? (st.size / 1024 / 1024).toFixed(2) + "MB" : "MISSING",
      url ? "yes" : "no",
      Array.isArray(shot.characters_in_shot) && shot.characters_in_shot.length ? "char" : "scene",
    ]);
  }
  cli.printTable(rows, ["shot", "段落", "文件", "公网URL", "类型"]);

  const okCount = rows.filter((r) => r[2] !== "MISSING" && r[3] === "yes").length;
  process.stdout.write("\n");
  process.stdout.write(`IMAGES_DIR=${dir}\n`);
  process.stdout.write(`CHARACTER_URL=${charAssets.sheet ? charAssets.sheet.url : ""}\n`);
  process.stdout.write(`KEYFRAMES_READY=${okCount}/${sb.shots.length}\n`);
  process.stdout.write(`KEYFRAMES_MISSING=${missingUrls.join(",") || "none"}\n`);
  process.stdout.write(`IMAGE_USAGE=${pool.stats()}\n`);

  project.stages = project.stages || {};
  project.stages.images = {
    done: missingUrls.length === 0,
    at: new Date().toISOString(),
    ready: okCount,
    total: sb.shots.length,
    characterUrl: charAssets.sheet ? charAssets.sheet.url : null,
    identitySource: charAssets.identity ? charAssets.identity._source : null,
    dir,
  };
  cli.saveProject(project);

  if (missingUrls.length) {
    process.stdout.write(`\n提示：仍有 ${missingUrls.length} 个镜头缺少可用首帧，重跑本脚本会自动续做缺失部分。\n`);
    process.exit(1);
  }
  process.stdout.write("\n下一步：\n");
  process.stdout.write(`  node videos.js --project "${projectDir}" --keys "<你的key>"\n`);
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write("\nimages.js FAILED: " + (e && e.message ? e.message : e) + "\n");
  process.exit(1);
});
