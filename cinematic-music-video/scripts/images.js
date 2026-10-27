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
  "--force": { key: "force", type: "bool", desc: "Redraw the selected KEYFRAMES even if they already exist. Does NOT touch the identity / style / scene references." },
  "--force-refs": { key: "forceRefs", type: "bool", desc: "Rebuild the reference assets (character sheet, face, body angles, style board, scene anchors). Required to intentionally replace a signed-in reference sheet." },
  "--only": { key: "only", type: "list", multi: true, desc: "Only process these shot ids, e.g. --only S01,S05" },
  "--skip-refs": { key: "skipRefs", type: "bool", desc: "Skip character / style reference generation" },
  "--dry-run": { key: "dryRun", type: "bool", desc: "Walk the whole keyframe assembly (reference picking + prompt building) and print what each shot would use, WITHOUT calling any API or writing any file" },
  "--refs-only": { key: "refsOnly", type: "bool", desc: "Stage 1 only: build / extend the reference assets (character sheet, face, body framings, scene anchors) and stop BEFORE any keyframe. This is how a new framing (e.g. waist-up) is added without touching a single shot." },
  "--no-enhance": { key: "noEnhance", type: "bool", desc: "Do not append cinematic quality / exclusion words" },
  "--retries": { key: "retries", type: "int", default: 2, desc: "Per-image retry attempts on failure" },
  "--check-url": { key: "checkUrl", type: "bool", default: true, desc: "Verify generated image URLs are publicly reachable" },

  // --- character identity ---
  "--sheet-candidates": { key: "sheetCandidates", type: "int", default: 2, desc: "Generate N reference sheets and keep the best-scoring one (default 2)" },
  "--sheet-layout": { key: "sheetLayout", type: "string", default: "sheet-full", desc: "Reference-sheet layout: sheet-full (close-up + turnaround + expression band), sheet (close-up + turnaround), turntable (8 views)" },
  "--angles": { key: "angles", type: "list", default: render.SHEET_ANGLES, desc: "Body reference angles to derive, e.g. --angles front,3q-left,side,back" },
  "--ref-ratio": { key: "refRatio", type: "string", default: "9:16", desc: "Aspect ratio for full-body references (default 9:16, portrait suits a standing figure)" },
  "--framings": { key: "framings", type: "list", default: ["full"], desc: "Reference framings to derive, comma-separated: full (head-to-toe) and/or waistup (mid-shot). A waist-up reference lets a medium / medium-close-up shot be served by a reference at ITS OWN framing, which is what stops a close-up from being dragged wide (render.FRAMINGS)." },
  "--waist-ratio": { key: "waistRatio", type: "string", default: "3:4", desc: "Aspect ratio for waist-up references (default 3:4, suits a half-length portrait)" },
  "--tight-no-scene": { key: "tightNoScene", type: "bool", desc: "Do NOT attach the location anchor to tight (close-up / medium close-up) character shots. Off by default: with framing-matched identity references the anchor no longer drags the crop wide, and the anchor is the only channel that reliably fixes the environment (HARDENING 坑位 75 补记四)." },
  "--no-scene-ref": { key: "noSceneRef", type: "bool", desc: "Attach NO location anchor to ANY character shot — the place is described in words instead. Last resort for a single shot that keeps rendering a second person: fewer references is the strongest knob on person count (HARDENING 坑位 75 补记三 / 补记七)." },
  "--ref-view": { key: "refView", type: "string", desc: 'Override the identity reference ANGLE per shot, e.g. "S15=3q-left,S21=3q-right". Changes only which reference image is attached — the shot\'s planned orientation stays as the storyboard wrote it. Use when one shot keeps rendering a second person with its planned angle.' },
  "--show-prompt": { key: "showPrompt", type: "bool", desc: "Print the FINAL prompt each selected shot will be sent (after reference assembly, lint repair and enhancement), then exit. Zero cost — same code path as the real run, so what you read is what gets paid for." },
  "--ref-framing": { key: "refFraming", type: "string", desc: 'Override the identity reference DISTANCE per shot, e.g. "S19=full". Values: close | waistup | full. Changes only the identity reference; the location plate keeps the distance its shot_size calls for. Use when a figure renders too large against the architecture: swapping a waist-up anchor for a full-length one makes the model place a smaller person, without dragging the plate (and the composition) to a wide vista.' },
  "--ref-image": { key: "refImage", type: "string", desc: 'Replace ALL references for the named shots with one image, e.g. "S19=D:/path/shot_S19.png" (a local path whose .url sidecar holds the hosted URL, or an http(s) URL). The shot still passes the identity gate. Use to re-render a single shot from a picture you want reproduced — e.g. pulling the camera back so the figure sits smaller in the same courtyard.' },
  "--scene-image": { key: "sceneImage", type: "string", desc: 'Replace ONLY the location plate for the named shots, e.g. "S19=D:/path/plate.png" (local path with a .url sidecar, or an http(s) URL). The identity anchor is still picked and attached as usual, so the face survives. Use when one shot needs a different plate than its scene/ distance would give it — e.g. a closer plate whose moon gate stands taller than the figure, which is what fixes a "person bigger than the building" frame.' },
  "--prop-image": { key: "propImage", type: "string", desc: 'Attach a PROP reference for the named shots, e.g. "S35=D:/path/sword.png" (local path with a .url sidecar, or an http(s) URL). Unlike --ref-image (which is labelled an identity anchor and therefore drags a FACE into the frame), a prop reference is labelled as a single OBJECT and explicitly forbidden from contributing a person, a background or a framing. This is the way to fix ONE prop\'s consistency in an empty shot (or any shot) when you have a correct reference photo of that object. Measured 2026-10-09: --ref-image on an empty shot rendered a second person; --prop-image does not.' },
  "--include-sheet": { key: "includeSheet", type: "bool", desc: "Also pass the master sheet as a third reference for each shot" },
  "--tight-crop": { key: "tightCrop", type: "bool", desc: "EXPERIMENTAL. Tight character shots also get a centre-cropped, re-hosted copy of the location anchor. Off by default: measured to make the model draw a second person (HARDENING 坑位 75 补记三)." },
  "--no-scenes": { key: "noScenes", type: "bool", desc: "Do not build location anchor references (empty plates per scene)" },
  "--scene-framings": { key: "sceneFramings", type: "list", default: ["full"], desc: "Location plate distances to derive, comma-separated: full (the whole space), medium (one area) and/or close (one surface). A shot is handed the plate at ITS OWN distance, so a close-up receives a close plate instead of a wide vista whose framing it would copy (render.SCENE_FRAMINGS)." },

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
  --force                  Redraw the selected KEYFRAMES even if they exist
                           (never touches the reference assets)
  --force-refs             Rebuild the reference assets — character sheet, face,
                           body angles, style board, scene anchors. This is the
                           ONLY way to replace a signed-in ref_charsheet.png.
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
      framings: args.framings,
      waistRatio: args.waistRatio,
      sheetLayout: args.sheetLayout,
      aspect: aspectRatio,
      size: args.size,
      concurrency: args.concurrency,
      candidates: args.sheetCandidates,
      // NOTE: the reference assets take forceRefs, NOT force. `--force` is a
      // keyframe-level operation ("redraw S04"); letting it cascade into the
      // identity assets silently replaces a signed-in reference sheet with a
      // freshly invented character — the whole film then renders as a
      // stranger. Measured on 春风许我再少年 (2026-10-04): `--only S04,S13
      // --force` rebuilt ref_charsheet + all 6 refs, and the signed定妆图 was
      // gone. See HARDENING 坑位 76.
      force: args.forceRefs,
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
    if (args.forceRefs || !assets.isUsable(stPath)) {
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

    // Location anchors — one or more empty plates per place the film returns to.
    if (!args.noScenes) {
      sceneAssets = await assets.buildSceneAssets(pool, {
        dir,
        sb,
        aspect: aspectRatio,
        size: args.size,
        concurrency: args.concurrency,
        force: args.forceRefs,
        sceneFramings: args.sceneFramings,
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

  if (args.refsOnly) {
    // Stage 1 only — extend the reference assets and stop before any shot.
    agnes.log("[1/3] --refs-only：参考资产已就绪，跳过关键帧。");
    const inv = assets.loadCharacterAssets(dir);
    const full = Object.keys(inv.bodies).filter((k) => k !== "waistup" && k !== "face" && inv.bodies[k]);
    const waist = inv.bodies.waistup ? Object.keys(inv.bodies.waistup).filter((k) => inv.bodies.waistup[k]) : [];
    agnes.log(`      面部锚点: ${inv.face ? "ok" : "MISSING"} | 全身: ${full.join(", ") || "none"} | 半身: ${waist.join(", ") || "none"}`);
    process.exit(0);
  }

  // ---- 2. shot keyframes --------------------------------------------------
  // `--ref-view S15=3q-left,S21=3q-right` —— 只改这几镜**身份参考图的角度**，
  // 分镜的朝向（提示词里的）保持不动。见 assets.pickShotRefs 的 o.viewOverride。
  const refViewMap = {};
  for (const pair of String(args.refView || "").split(",")) {
    const m = pair.trim().match(/^([^=]+)=(.+)$/);
    if (m) refViewMap[m[1].trim()] = m[2].trim();
  }
  if (Object.keys(refViewMap).length) {
    agnes.log(`      参考角度覆盖: ${Object.entries(refViewMap).map(([k, v]) => `${k}→${v}`).join(", ")}`);
  }
  // `--ref-framing S19=full` —— 只改这几镜**身份参考图的景别档**（close/waistup/full），
  // 场景盘仍按 shot_size 取档。见 assets.pickShotRefs 的 o.framingOverride：
  // 人物画得比建筑大时，换全身参考让人变小，同时不把场景盘跳成远景 vista。
  const refFramingMap = {};
  const VALID_REF_FRAMINGS = new Set(["close", "waistup", "full"]);
  for (const pair of String(args.refFraming || "").split(",")) {
    const m = pair.trim().match(/^([^=]+)=(.+)$/);
    if (!m) continue;
    const v = m[2].trim().toLowerCase().replace(/[-_\s]+/g, "");
    if (!VALID_REF_FRAMINGS.has(v)) {
      process.stderr.write(`ERROR: --ref-framing 的档位只能是 close / waistup / full，收到 "${m[2].trim()}"\n`);
      process.exit(2);
    }
    refFramingMap[m[1].trim()] = v;
  }
  if (Object.keys(refFramingMap).length) {
    agnes.log(`      参考景别覆盖: ${Object.entries(refFramingMap).map(([k, v]) => `${k}→${v}`).join(", ")}`);
  }
  // `--ref-image S19=D:/…/shot_S19.png` —— 用**一张指定的图**替换该镜的全部参考图
  // （身份锚 + 场景盘都不再挂）。图可以是一个本地路径（读它旁边的 `.url` sidecar 拿公网
  // URL）或一个 http(s) URL。该镜照常过身份门禁。
  //
  // 用途：单镜返修里"我要照着**这张**重画"。典型场景是**把镜头拉远、让人物在画面里变小**——
  // 实测（2026-10-04）参考图的档位和提示词文字都压不动人物大小（半身参考 34%、全身参考
  // 反而 46%、establishing 也 34%），唯一有效的杠杆是把"人物更小"的**图**直接喂回去。
  const refImageMap = {};
  for (const pair of String(args.refImage || "").split(",")) {
    const m = pair.trim().match(/^([^=]+)=(.+)$/);
    if (m) refImageMap[m[1].trim()] = m[2].trim();
  }
  if (Object.keys(refImageMap).length) {
    agnes.log(`      参考图替换: ${Object.entries(refImageMap).map(([k, v]) => `${k}→${path.basename(v)}`).join(", ")}`);
  }
  // `--scene-image S19=D:/…/plate.png` —— 只替换该镜的**场景盘**（身份锚照常按 shot_size 选），
  // 与 `--ref-image` 的分工：那个连身份锚一起换掉（脸会丢，实测一致度 15），
  // 这个保留身份锚，只换景。人物比建筑大时，换一张"建筑占画面更大"的盘最有效。
  const sceneImageMap = {};
  for (const pair of String(args.sceneImage || "").split(",")) {
    const m = pair.trim().match(/^([^=]+)=(.+)$/);
    if (m) sceneImageMap[m[1].trim()] = m[2].trim();
  }
  if (Object.keys(sceneImageMap).length) {
    agnes.log(`      场景盘替换: ${Object.entries(sceneImageMap).map(([k, v]) => `${k}→${path.basename(v)}`).join(", ")}`);
  }
  // `--prop-image S35=D:/…/sword.png` —— 给该镜挂一张**道具参考图**。
  // 与 --ref-image 的分工：那个挂 identity 角色（参考说明写"这是本人的脸"，
  // 空镜会被画进一个人）；这个挂 prop 角色，参考说明明说"这是一个物体，
  // 不许带出人物/背景/取景"。实测 2026-10-09：修一个空镜里的长剑形制，
  // 只有这条通道不会顺带画出一个人。只取该物体的**形制**。
  const propImageMap = {};
  for (const pair of String(args.propImage || "").split(",")) {
    const m = pair.trim().match(/^([^=]+)=(.+)$/);
    if (m) propImageMap[m[1].trim()] = m[2].trim();
  }
  if (Object.keys(propImageMap).length) {
    agnes.log(`      道具锚挂载: ${Object.entries(propImageMap).map(([k, v]) => `${k}→${path.basename(v)}`).join(", ")}`);
  }
  const shots = sb.shots.filter((s) => wants(s.id));
  agnes.log(`[2/3] Shot keyframes (${shots.length} of ${sb.shots.length}) ...`);

  const tasks = [];
  for (const shot of shots) {
    const outPath = shotPath(dir, shot.id);
    // 双主角支持（harden 补丁在 loadCharacterAssets 上打了按角色取资产的补丁）：
    // hasCharacter 必须问「这一镜那位主角的资产在不在」，而不是问根目录那一套。
    // 原版写法只查主 charAssets，两位主角归档到 _refs_male/ 之后
    // 所有人物镜都会被判成空镜、身份锚一张不挂（2026-10-06 三生三世实测）。
    const shotAssets = typeof assets.assetsFor === "function"
      ? (assets.assetsFor(shot) || charAssets)
      : charAssets;
    const hasCharacter =
      assets.characterNames(shot).length > 0 &&
      !!(shotAssets.face || Object.keys(shotAssets.bodies || {}).length);
    // 静默回退是这类"按角色取资产"补丁最危险的失败模式：名字写错就退化成
    // 「所有人物镜都当空镜」，日志上看不出异常。人物镜在这里必须自我核对。
    if (assets.characterNames(shot).length > 0 && !hasCharacter) {
      agnes.log(
        `      [warn] ${shot.id} 标了角色 ${assets.characterNames(shot).join("/")} 但取不到身份资产` +
        `（assetsFor=${typeof assets.assetsFor === "function" ? "ok" : "MISSING"}）—— 该镜会按空镜渲染`
      );
    }

    if (!args.force && assets.isUsable(outPath)) {
      agnes.log(`      [skip] ${shot.id} already exists`);
      continue;
    }

    let refs = { paths: [], urls: [], labels: [], roles: [], view: null };
    // 部分空镜禁用场景锚点（harden.js 导出 CMV_NO_SCENE_ANCHOR）：锚点视角与分镜构图冲突时
    // i2i 会把构图硬拽回锚点视角（S26 微距长出大手 / S28 天空镜画成街景）。
    const noAnchor = !!(globalThis.CMV_NO_SCENE_ANCHOR && globalThis.CMV_NO_SCENE_ANCHOR.has(shot.id));
    // 局部镜（影子/手部/腿部特写等）绝不挂人物参考图 —— 参考图会把"只出现局部"的构图
    // 拽成完整人形（S13 影子镜实测画成无头人偶）。harden.js 通过 CMV_PART_SHOTS 导出集合。
    const isPartShot = !!(globalThis.CMV_PART_SHOTS && globalThis.CMV_PART_SHOTS.has(shot.id));
    const wantsCharRefs = hasCharacter && !isPartShot;
    // 【已收敛 · 2026-10-04】近景角色镜**默认只挂面部锚点一张参考图**，
    // 场景锚点与裁切版都不挂（闸门在 assets.pickShotRefs 里，见那里的长注释）。
    //
    // 之前走过、现已废弃的一条路（保留在此以免重走）：
    //   · 场景锚点**全景图** + **中心裁切版**两张一起给 → 仍稳定出两个人并排
    //     （2026-10-04 12:22 实跑：S04 88 分、S13 98 分，唯一失分项都是
    //     "除主角外还有 1 个醒目的人物"）。
    // 真正的判据是参考图**张数**：mv-月照他乡 / mv-月饼卖不动 所有通过的近景
    // 角色镜都只有一张 ["面部特写"]。多一张就多一次"把同一人的不同角度读成
    // 两个人"的机会，逐图写明职责也压不住。
    //
    // 注意：单挂面部锚点解决的是**人数**，它不解决**环境**。第一次单参考跑
    // （S04 92 分 / S13 82 分，配角=0 全过）里，环境被模型自己发明了 ——
    // 所以环境必须靠 sceneText 补上（见下面那段）。
    //
    // --tight-crop 保留为实验开关（会额外托管一张裁切图，各消耗 1 次 i2i），
    // 默认关闭。裁切比例表见 assets.tightCropRatio / HARDENING 坑位 75 补记三。
    let sceneRef = noAnchor ? null : assets.sceneRefFor(shot, sceneAssets);
    // `--scene-image`：只换盘，身份锚照常挂（所以脸不会丢）。
    if (sceneImageMap[shot.id]) {
      const platePath = sceneImageMap[shot.id];
      let plateUrl = platePath;
      if (!/^https?:\/\//i.test(platePath)) {
        plateUrl = assets.readUrlSidecar(platePath);
        if (!plateUrl) {
          throw new Error(
            `--scene-image ${shot.id}: 找不到 ${platePath}.url —— 自定义场景盘必须是本机已托管的图（旁边有 .url sidecar）或一个 http(s) URL`
          );
        }
      }
      sceneRef = { outPath: platePath, url: plateUrl, label: `自定义场景盘(${path.basename(platePath)})` };
    }
    const tightPlan = wantsCharRefs && assets.refPlanFor(shot.shot_size) === "tight";
    // 近景镜不挂场景锚点**图**（那张图每挂必出两个人），改挂场景**文字**。
    //
    // 这段文字不是可选项。本轮实测：近景镜去掉场景图又**不给文字**时，模型会自己
    // 发明环境 —— S04（分镜是书斋 SC1）被画成竹林里的亭台，S13（山巅云海 SC3）
    // 被画成花园。这是"汉服 + 宋代美学 + 人像"这个组合的默认先验，跟提示词里的
    // 景别/服装写得对不对无关。所以文字是近景镜**唯一**的环境通道：
    // 它提供"这是什么地方"，但不携带取景（补记二：图片的"地方"携带构图，文字的"地方"不携带）。
    // 场景**文字**是"缺图时的补偿通道"，不再是默认注入项。实测（补记四）：
    // 挂了锚点图时，650 字的房间描述对最终画面几乎无影响（照样画出花园）；
    // 只有撤掉锚点图、且不加文字时环境才会完全失控。所以文字只在
    // `--tight-no-scene`（近景真的不挂锚点图）时才注入。
    const sceneText = ((args.tightNoScene && tightPlan) || args.noSceneRef) ? assets.sceneTextFor(shot, sb) : "";
    if (wantsCharRefs) {
      refs = assets.pickShotRefs(shot, charAssets, {
        includeSheet: args.includeSheet,
        sceneRef,
        tightNoScene: args.tightNoScene,
        noSceneRef: args.noSceneRef,
        viewOverride: refViewMap[shot.id],
        framingOverride: refFramingMap[shot.id],
      });
      if (args.tightCrop && tightPlan && sceneRef && sceneRef.url) {
        const sc = await assets.tightSceneRef(sceneRef, shot.shot_size, dir, pool);
        if (sc && sc.url) {
          refs.paths.push(sc.outPath);
          refs.urls.push(sc.url);
          refs.labels.push(sc.label);
          refs.roles.push("scene");
        }
      }
    } else if (sceneRef && sceneRef.url) {
      // An empty shot still anchors to its location asset, so the alley in shot
      // 4 is recognisably the same alley as in shot 2.
      refs = assets.pickShotRefs(shot, charAssets, { hasCharacter: false, sceneRef });
    } else if (styleUrl) {
      refs = { paths: [], urls: [styleUrl], labels: ["风格基调板"], roles: ["style"], view: null };
    }

    // `--ref-image`：整镜替换参考图。这是最后一道覆盖，压过身份锚与场景盘 ——
    // 身份门禁照常跑（它只吃"成图 vs 设定表"，不关心参考图是谁）。
    const customRefImg = refImageMap[shot.id];
    if (customRefImg) {
      let u = customRefImg;
      if (!/^https?:\/\//i.test(customRefImg)) {
        u = assets.readUrlSidecar(customRefImg);
        if (!u) {
          // 本地合成图没有公网 URL 也可以直接用：转成 data URI 交给 i2i。
          // （用于"几何合成一张参考图再喂回去"这类返修；请求体不宜过大，
          //  所以合成图先缩到 ~720px 宽再落地。）
          if (!fs.existsSync(customRefImg)) {
            throw new Error(`--ref-image ${shot.id}: 找不到文件 ${customRefImg}`);
          }
          u = "data:image/png;base64," + fs.readFileSync(customRefImg).toString("base64");
          agnes.log(
            `      [ref-image] ${shot.id} 本地图无公网 URL，改用 data URI（${(u.length / 1024 / 1024).toFixed(2)} MB）`
          );
        }
      }
      refs = {
        paths: [customRefImg],
        urls: [u],
        labels: ["自定义参考图"],
        roles: ["identity"],
        view: null,
        framing: null,
        plan: null,
      };
    }

    // `--prop-image` —— 追加一张道具锚（不替换其它参考图）。
    // 放在 --ref-image 之后：两者可以同时用，但道具锚只做"加一张"。
    const propImg = propImageMap[shot.id];
    if (propImg) {
      let pu = propImg;
      if (!/^https?:\/\//i.test(propImg)) {
        pu = assets.readUrlSidecar(propImg);
        if (!pu) {
          if (!fs.existsSync(propImg)) {
            throw new Error(`--prop-image ${shot.id}: 找不到文件 ${propImg}`);
          }
          pu = "data:image/png;base64," + fs.readFileSync(propImg).toString("base64");
          agnes.log(
            `      [prop-image] ${shot.id} 本地图无公网 URL，改用 data URI（${(pu.length / 1024 / 1024).toFixed(2)} MB）`
          );
        }
      }
      refs.paths = [...refs.paths, propImg];
      refs.urls = [...refs.urls, pu];
      refs.labels = [...refs.labels, "道具参考图"];
      refs.roles = [...refs.roles, "prop"];
    }

    tasks.push({
      shot,
      shotId: shot.id,
      outPath,
      hasCharacter,
      // 必须带进任务对象：门禁分发要看它决定走"局部镜宽松审计"还是"空镜零人审计"。
      // 少这一行，下面的 `if (t.isPartShot)` 永远为假，局部镜会被空镜门禁兜住。
      isPartShot,
      hasScene: !!sceneRef,
      sceneText,
      refs,
      prompt: render.buildKeyframePrompt(shot, sb, {
        // 空镜/局部镜绝不能带 identity —— 否则 render 会在尾部追加"画面中的人必须与参考图同一人"，
        // 与 EMPTY FRAME RULE / PART CHECK 直接矛盾，模型只能折中画出一个人（S01/S13/S26/S28 实测翻车）。
        identity: wantsCharRefs ? charAssets.identity : null,
        hasCharacter,
        refLabels: refs.labels,
        refRoles: refs.roles,
        hasScene: !!sceneRef,
        sceneText,
        noEnhance: args.noEnhance,
      }),
    });
  }

  // ---- 零额度干跑闸门 ----------------------------------------------------
  // 走完整的装配链（参考图选型 + 提示词构建），一次 API 都不调、一个文件都不写。
  // 存在的理由：2026-10-04 那次「提示词闸门两版全绿，实跑第一步 FAILED:
  // refAssets is not defined」—— check-prompts 看不到参考图装配链里的未定义变量。
  // 这类错误只有在同一段代码路径上才能暴露，所以补一道同路径的干跑。
  // 习惯：任何放量（--only / 全量）之前先跑一次 --dry-run，30 秒换一整批不白烧。
  if (args.dryRun || args.showPrompt) {
    agnes.log("");
    agnes.log(`[dry-run] ${tasks.length} 镜待生成（不调用 API、不写文件）：`);
    let bad = 0;
    for (const t of tasks) {
      const nEmpty = t.refs.urls.filter((u) => !u || !/^(https?:|data:)/.test(u)).length;
      if (nEmpty) bad++;
      agnes.log(
        `  ${String(t.shotId).padEnd(5)} ${String(t.shot.shot_size || "").padEnd(16)} ` +
          `${t.hasCharacter ? "角色" : "空镜"}  refs=${t.refs.roles.length} ` +
          `[${t.refs.labels.join(" | ")}]  prompt=${t.prompt.length}字` +
          (nEmpty ? `  !! ${nEmpty} 张参考图无有效 URL` : "")
      );
      // `--show-prompt`：把**最终下发**的提示词逐字打出来。
      // 与 `--dry-run` 同一条代码路径（同一段装配链），所以看到的就是要花钱的那段字。
      if (args.showPrompt) {
        process.stdout.write(`\n===== ${t.shotId}  (refs: ${t.refs.labels.join(" | ")}) =====\n${t.prompt}\n`);
      }
    }
    agnes.log(`[dry-run] 结束 —— 参考图异常 ${bad} 镜，未调用 API，未写任何文件。`);
    process.stdout.write(`PLANNED=${tasks.length}\n`);
    return;
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
        // 空镜同样必须重试：空镜 QA（人物数 / 文字）失败时若只给 1 次机会，
        // 会把"画进了人"的那一版直接落盘（春风 S01/S03/S28 实测教训）。
        // fix 通道对空镜同样有效：verdict.differences 里的"空镜中出现了 N 个人"
        // 会被 render.buildKeyframePrompt 拼进重画提示词。
        const totalAttempts = 1 + Math.max(0, args.identityRetries);
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
                sceneText: t.sceneText,
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
              if (t.isPartShot) {
              // A body-part close-up has no face in it, so there is nothing for
              // the identity gate to compare. Running it anyway compares a boot
              // against a scene anchor, comes back "no protagonist", and that
              // correction note then orders the NEXT attempt to put a person in
              // frame — 爱你老己 S05 (suede boots) drifted from a boot close-up
              // into a two-woman wide shot exactly this way. When the gate has
              // no leverage, running it is worse than not running it.
              //
              // But "no gate at all" is also wrong: the frame still has to be
              // free of readable text and free of a SECOND body. And note the
              // threshold — in a body-part shot `human_count === 1` is NORMAL
              // (that one "person" is the hand / the ankle being photographed).
              // Demanding 0 here is a gate that can only ever fail: 爱你老己
              // S16 (boots) and S28 (hand) sat at 40/40/40 through all three
              // attempts for exactly this reason, burning quota on redraws that
              // could never pass. So: 0 or 1 is fine, 2+ is not.
              try {
                const a = await vision.auditKeyframe(pool, { candPath: attemptPath, expectCharacter: false, maxPx: args.visionMaxPx });
                const n = Number(a.human_count) || 0;
                const ok = !a.has_text && n <= 1;
                agnes.log(
                  `      [QA] ${t.shotId} 局部镜 文字=${a.has_text ? "有" : "无"} 人物数=${n}` +
                  (ok ? "（局部特写允许）" : "")
                );
                verdict = {
                  same_person: ok,
                  score: ok ? 90 : 40,
                  differences: [
                    ...(a.has_text ? [`画面出现了文字：${a.text_content || "未知"}`] : []),
                    ...(n > 1 ? [`局部特写里出现了 ${n} 个人形；只允许身体局部，不允许多个人或完整人形。`] : []),
                  ],
                  has_readable_text: !!a.has_text,
                  protagonist_count: 0,
                  other_people_count: n,
                  other_people_prominent: n > 1,
                };
              } catch (_) {
                verdict = null;
              }
            } else if (t.hasCharacter && t.refs.paths.length) {
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
                  (verdict.same_style === false ? " ✗风格断裂" : "") +
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
                // 渲染媒介一票否决。《月饼卖不动》S16：特写镜头被渲染成 Q 版 3D 卡通，
                // 与参考图和其余 15 镜的实拍摄影风完全断裂，却因为「像同一个人」拿了 92 分放行。
                // 一致性门禁此前只问「是不是同一个人」，从不问「是不是同一种媒介」。
                if (verdict.same_style === false) {
                  notes.push(
                    "这张图的渲染媒介与参考图不一致" +
                    (verdict.style_note ? `（${String(verdict.style_note).slice(0, 60)}）` : "") +
                    "。全片必须是同一种媒介（参考图是实拍摄影，就不能出现 3D 卡通 / 动漫 / 插画）。"
                  );
                }
                if (notes.length) agnes.log(`           问题: ${notes.slice(0, 3).join("；")}`);
                else if (verdict.differences.length) {
                  agnes.log(`           差异: ${verdict.differences.slice(0, 3).join("；")}`);
                }

                if (tooFewOrMany || extrasAreAPProblem) verdict.same_person = false;
                if (textIsAProblem) verdict.same_person = false;
                if (verdict.same_style === false) verdict.same_person = false;
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

          // 选片排序：先看「是否判定为同一个人」，再看分数。
          // 此前只比分数，于是《月饼卖不动》S16 那张 Q 版卡通（92 分、✗不同人）
          // 挤掉了分数略低、但确实是同一个人的尝试，成为最终交给视频阶段的图。
          const rankOf = (v) => {
            if (!v) return 1; // 视觉校验失败 → 既不惩罚也不优于明确通过
            if (v.same_person && v.score >= minScore) return 3;
            if (v.same_person) return 2;
            return 0;
          };
          const accepted = !verdict || rankOf(verdict) === 3;
          const rNew = rankOf(verdict);
          const rOld = best ? rankOf(best.verdict) : -1;
          const better = !best || rNew > rOld || (rNew === rOld && verdict && verdict.score > best.score);

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
            same_style: verdict ? verdict.same_style !== false : null,
            style_note: verdict ? verdict.style_note || "" : "",
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
        if (verify && best && best.verdict && !(best.verdict.same_person && best.verdict.score >= minScore)) {
          const kind = t.hasCharacter ? "一致度" : "空镜 QA";
          agnes.log(`      ⚠ ${t.shotId} 最佳尝试${kind}仅 ${best.verdict.score}，建议人工复核或 --only ${t.shotId} --force 重跑`);
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
      // Must mirror the promotion order used above (same-person first, score second),
      // otherwise the report describes a different frame than the one on disk.
      const rank = (a) => (a.same_person && a.score >= minScore ? 2 : (a.same_person ? 1 : 0));
      const best = attempts.slice().sort((a, b) => rank(b) - rank(a) || b.score - a.score)[0];
      perShot.push({
        shot,
        attempts: attempts.length,
        view: best.view,
        refs: best.refs,
        best_score: best.score,
        passed: !!best.same_person && best.score >= minScore,
        style_break: best.same_style === false,
        style_note: best.style_note || "",
        protagonist_count: best.protagonist_count,
        other_people_count: best.other_people_count,
        differences: best.differences,
        history: attempts.map((a) => ({ attempt: a.attempt, score: a.score, same_person: a.same_person, same_style: a.same_style })),
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
    const styleBreaks = perShot.filter((r) => r.style_break);
    if (styleBreaks.length) {
      agnes.log(`      ⚠ ${styleBreaks.length} 个镜头渲染媒介与参考图不一致（风格断裂，会毁掉全片统一感）：` +
        styleBreaks.map((r) => r.shot).join("、"));
    }
    perShot.filter((r) => !r.passed).forEach((r) =>
      agnes.log(`      ⚠ ${r.shot} 最终一致度仅 ${r.best_score}：${r.differences.slice(0, 2).join("；") || "无具体差异描述"}\n` +
        `        建议：node images.js --project "<项目>" --only ${r.shot} --force` +
        `（--force 只重画这一镜的关键帧；身份参考图受保护，不会被覆盖）`)
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
  // `--only` 试点时，没被请求的镜头不算失败 —— 它们是"本次不打算做"，不是"做了没成"。
  // 混在一起会让纯试点恒返回 EXIT=1、并把 stages.images.done 写成 false，骗过 run.js
  // 的阶段判断。与 videos.js 的同一处缺陷同源（HARDENING 坑位 79 / 82）。
  const pendingShots = [];
  for (const shot of sb.shots) {
    const p = shotPath(dir, shot.id);
    const exists = fs.existsSync(p);
    const st = exists ? fs.statSync(p) : null;
    const url = exists ? assets.readUrlSidecar(p) : null;
    if (!url) (wants(shot.id) ? missingUrls : pendingShots).push(shot.id);
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
  if (pendingShots.length) process.stdout.write(`SHOTS_PENDING=${pendingShots.join(",")}\n`);
  process.stdout.write(`IMAGE_USAGE=${pool.stats()}\n`);

  project.stages = project.stages || {};
  project.stages.images = {
    done: okCount === sb.shots.length && missingUrls.length === 0,
    at: new Date().toISOString(),
    ready: okCount,
    total: sb.shots.length,
    pending: pendingShots.length ? pendingShots : undefined,
    characterUrl: charAssets.sheet ? charAssets.sheet.url : null,
    identitySource: charAssets.identity ? charAssets.identity._source : null,
    dir,
  };
  cli.saveProject(project);

  if (missingUrls.length) {
    process.stdout.write(`\n提示：本次请求的 ${missingUrls.length} 个镜头缺少可用首帧（${missingUrls.join(",")}），重跑本脚本会自动续做。\n`);
    process.exit(1);
  }
  if (pendingShots.length) {
    process.stdout.write(`\n本次为部分生成（--only）：${pendingShots.length} 个镜头未请求，记为 SHOTS_PENDING，不算失败。\n`);
  }
  process.stdout.write("\n下一步：\n");
  process.stdout.write(`  node videos.js --project "${projectDir}" --keys "<你的key>"\n`);
  process.exit(0);
}

main().catch((e) => {
  process.stderr.write("\nimages.js FAILED: " + (e && e.message ? e.message : e) + "\n");
  process.exit(1);
});
