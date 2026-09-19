#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * lib/paths.js — the single source of truth for every path this skill writes.
 *
 * Two rules this module exists to enforce:
 *
 *   1. NO MACHINE DEPENDENCE.
 *      Nothing here may be an absolute path, a drive letter, a user name, a
 *      home directory or anything else that only exists on the machine the
 *      skill was developed on. The only place `process.cwd()` may appear in
 *      this skill's source is THIS FILE, where it anchors the output root.
 *
 *   2. OUTPUTS FOLLOW THE SESSION.
 *      Every result and intermediate lands under the current session's
 *      working directory (`<cwd>/out/`), never inside the skill installation.
 *      Run every stage from the same cwd so a re-run always finds the earlier
 *      stage's files; set CMV_OUT_DIR to pin the root when that is not
 *      convenient.
 *
 * The layout produced:
 *
 *   <cwd>/                           the session's working directory
 *     out/                           ★ EVERY output and intermediate lives here
 *       .state/                      key-rotation cursor + model-facing caches
 *         .agnes-key-state.json
 *         vision-cache/
 *       mv-<song>/                   one project directory per song
 *         00_source/                 the song + lyrics, copied in for portability
 *         01_plan/                   storyboard.json / storyboard.md
 *         02_images/                 reference sheets, per-shot keyframes
 *         03_clips/                  generated video clips
 *         04_build/                  normalised intermediates + concat list
 *         05_output/                 the finished <title>_MV.mp4
 *
 * Optional overrides — never required, only for relocating the tree (e.g. onto
 * a large scratch disk). They are read from the environment so that no machine
 * specific value is ever baked into the code:
 *
 *   CMV_OUT_DIR   replace the whole `out/` root
 *
 * Only Node.js built-ins are used, and no other module in this skill is
 * required — which keeps this file importable from anywhere without cycles.
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Roots
// ---------------------------------------------------------------------------

/** `<skill-root>/scripts/lib` → `<skill-root>` (read-only: code, templates). */
const SKILL_ROOT = path.resolve(__dirname, "..", "..");

/** `<skill-root>/scripts` — where the stage scripts live. */
const SCRIPTS_DIR = path.resolve(__dirname, "..");

/**
 * The output root. Everything the pipeline creates goes under here, so the
 * skill installation stays clean and the whole run can be deleted or archived
 * in one move. Anchored to the current session's working directory.
 */
function outDir() {
  const override = process.env.CMV_OUT_DIR;
  return override ? path.resolve(override) : path.join(process.cwd(), "out");
}

/** Shared runtime state (key cursor, caches). Not per-project. */
function stateDir() {
  return path.join(outDir(), ".state");
}

/** Downloaded / downscaled images handed to the vision model. */
function visionCacheDir() {
  return path.join(stateDir(), "vision-cache");
}

/** Per-project stage directory names. */
const STAGE_DIRS = {
  source: "00_source",
  plan: "01_plan",
  images: "02_images",
  clips: "03_clips",
  build: "04_build",
  output: "05_output",
};

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/** Ensure a directory exists (recursive, idempotent). */
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Render a path relative to the current working directory, for log lines.
 * Keeps the console readable and — more importantly — never leaks the
 * developer's absolute paths into output that might be pasted into a doc.
 */
function rel(p) {
  if (!p) return "";
  const abs = path.resolve(p);
  const r = path.relative(process.cwd(), abs);
  return r && !r.startsWith("..") && !path.isAbsolute(r) ? r.split(path.sep).join("/") : abs;
}

// ---------------------------------------------------------------------------
// Project resolution
// ---------------------------------------------------------------------------

/** Turn a song filename into a stable, filesystem-safe project name. */
function projectSlug(songPath) {
  const base = songPath
    ? path.basename(songPath).replace(/\.[^.]+$/, "").replace(/[^\w\u4e00-\u9fa5.-]+/g, "_").slice(0, 40)
    : "mv";
  return "mv-" + (base || "mv");
}

/**
 * Where should the project for this song live?
 *
 *   explicit given  → that path, resolved as-is (the user may point anywhere)
 *   otherwise       → <cwd>/out/mv-<song>
 */
function projectDirFor(songPath, explicit) {
  if (explicit) return path.resolve(explicit);
  return path.join(outDir(), projectSlug(songPath));
}

/**
 * List the existing projects under <out>, i.e. directories that actually carry
 * a project.json. Used both by the stage scripts (to find the project when it
 * was not named) and by error messages (to show what IS available).
 */
function listProjects() {
  const root = outDir();
  if (!fs.existsSync(root)) return [];
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (e) {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => path.join(root, e.name))
    .filter((d) => fs.existsSync(path.join(d, "project.json")))
    .sort();
}

/**
 * Resolve the project a stage script should operate on.
 *
 *   explicit given → resolve it (relative paths are taken against the cwd, as
 *                    users expect for something they typed)
 *   exactly one    → use it, so `node images.js` just works after `plan.js`
 *   none           → throw, explaining where out/ is and how to plan one
 *   several        → throw, listing them, so we never silently pick the wrong film
 */
function pickProject(explicit) {
  if (explicit) return path.resolve(explicit);
  const found = listProjects();
  if (found.length === 1) return found[0];
  if (!found.length) {
    const err = new Error(
      "No project found in " + rel(outDir()) + ".\n" +
      "  Create one with the planning stage:\n" +
      '    node plan.js --song "song.mp3" --keys "<key>"\n' +
      "  or point at an existing project explicitly:\n" +
      "    --project <dir>"
    );
    err.code = "ENOPROJECT";
    throw err;
  }
  const err = new Error(
    "Several projects exist in " + rel(outDir()) + " — name the one to use with --project:\n" +
    found.map((d) => "  - " + rel(d)).join("\n")
  );
  err.code = "EAMBIGUOUS";
  throw err;
}

module.exports = {
  SKILL_ROOT,
  SCRIPTS_DIR,
  STAGE_DIRS,
  outDir,
  stateDir,
  visionCacheDir,
  ensureDir,
  rel,
  projectSlug,
  projectDirFor,
  listProjects,
  pickProject,
};
