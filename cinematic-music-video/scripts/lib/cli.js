#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * lib/cli.js — Shared argument parsing + project plumbing for the pipeline.
 *
 * Every stage script shares the same project layout and the same way of
 * resolving API keys, so this module centralises both.
 *
 * WHERE THINGS GO — all of it under `<skill-root>/out/`, never under the
 * current working directory and never at a hard-coded absolute path. See
 * lib/paths.js, which owns that decision; this module only consumes it.
 *
 *   <skill-root>/out/
 *     .state/                     key-rotation cursor + vision cache (shared)
 *     mv-<song>/                  one project directory per song
 *       project.json              plan + per-stage state (resumable)
 *       00_source/                the song + lyrics, copied in so the project is self-contained
 *       01_plan/storyboard.json   machine-readable shot list
 *       01_plan/storyboard.md     human-readable shot list (for review)
 *       02_images/ref_charsheet.png + .url   character reference sheet (identity master)
 *       02_images/character_lock.json        structured identity params read off the sheet
 *       02_images/ref_face.png      + .url   facial identity anchor
 *       02_images/ref_body_*.png    + .url   full-body studio views per angle
 *       02_images/ref_style.png     + .url
 *       02_images/ref_scene_*.png   + .url   empty location anchor frames
 *       02_images/shot_S01.png      + .url
 *       02_images/identity_report.json       per-shot identity match scores
 *       03_clips/shot_S01.mp4
 *       04_build/norm/shot_S01.mp4
 *       04_build/concat.txt
 *       05_output/<title>_MV.mp4
 */

const fs = require("fs");
const path = require("path");
const agnes = require("./agnes");
const paths = require("./paths");

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

/**
 * Declarative arg parser.
 * `spec` maps flag -> { key, type, default, alias, multi, desc }
 *   type: "string" | "number" | "bool" | "int"
 */
function createParser(spec, usage) {
  const byFlag = new Map();
  for (const flag of Object.keys(spec)) {
    const s = spec[flag];
    byFlag.set(flag, s);
    if (s.alias) {
      const aliases = Array.isArray(s.alias) ? s.alias : [s.alias];
      aliases.forEach((a) => byFlag.set(a, s));
    }
  }

  return function parse(argv) {
    const out = {};
    for (const flag of Object.keys(spec)) {
      const s = spec[flag];
      out[s.key] = s.multi ? (s.default ? s.default.slice() : []) : (s.default !== undefined ? s.default : null);
    }
    out._positional = [];

    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (a === "-h" || a === "--help") {
        process.stdout.write(usage + "\n");
        process.exit(0);
      }
      const s = byFlag.get(a);
      if (!s) {
        if (a.startsWith("-")) {
          process.stderr.write(`ERROR: unknown argument ${a}\n\n${usage}\n`);
          process.exit(2);
        }
        out._positional.push(a);
        continue;
      }
      let val;
      if (s.type === "bool") {
        val = true;
        // Allow explicit --flag=false
        if (argv[i + 1] === "false" || argv[i + 1] === "0") { val = false; i++; }
      } else {
        val = argv[++i];
        if (val === undefined) {
          process.stderr.write(`ERROR: missing value for ${a}\n`);
          process.exit(2);
        }
        if (s.type === "number") {
          val = Number(val);
          if (Number.isNaN(val)) { process.stderr.write(`ERROR: ${a} must be a number\n`); process.exit(2); }
        } else if (s.type === "int") {
          val = parseInt(val, 10);
          if (Number.isNaN(val)) { process.stderr.write(`ERROR: ${a} must be an integer\n`); process.exit(2); }
        } else if (s.type === "list") {
          val = agnes.parseKeyList(val);
        }
      }
      if (s.multi) {
        out[s.key] = out[s.key] || [];
        if (Array.isArray(val)) out[s.key] = out[s.key].concat(val);
        else out[s.key].push(val);
      } else {
        out[s.key] = val;
      }
    }
    return out;
  };
}

// ---------------------------------------------------------------------------
// Shared option spec fragments
// ---------------------------------------------------------------------------

const COMMON_KEYS = {
  "--keys": { key: "keys", type: "list", multi: true, desc: "Comma-separated Agnes API keys (round-robin)" },
  "--keys-file": { key: "keysFile", type: "string", desc: "File with one API key per line" },
  "--api-key": { key: "apiKey", type: "string", alias: ["-k"], desc: "Single API key (shorthand)" },
};

const COMMON_PROJECT = {
  "--project": { key: "project", type: "string", alias: ["-d"], desc: "Project directory (default: ./mv-<song>)" },
};

/**
 * Resolve the API key pool from all supported sources.
 * Precedence: --keys / --keys-file / --api-key  >  AGNES_API_KEYS  >  AGNES_API_KEY / agnes-api-key
 */
function buildKeyPool(args, stateDir) {
  let keys = [];
  if (args.keys && args.keys.length) keys = keys.concat(args.keys);
  if (args.keysFile) {
    // Accept the path as typed (relative to the cwd), then retry against the
    // skill root so `--keys-file templates/keys.txt` works from any directory.
    let p = path.resolve(args.keysFile);
    if (!fs.existsSync(p)) {
      const alt = path.join(paths.SKILL_ROOT, args.keysFile);
      if (fs.existsSync(alt)) p = alt;
    }
    if (!fs.existsSync(p)) throw new Error("--keys-file not found: " + args.keysFile);
    const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      keys = keys.concat(agnes.parseKeyList(t));
    }
  }
  if (args.apiKey) keys = keys.concat(agnes.parseKeyList(args.apiKey));
  if (!keys.length) {
    keys = keys.concat(agnes.parseKeyList(process.env.AGNES_API_KEYS));
    keys = keys.concat(agnes.parseKeyList(process.env["agnes-api-key"]));
    keys = keys.concat(agnes.parseKeyList(process.env.AGNES_API_KEY));
  }
  // Deduplicate while preserving order.
  const seen = new Set();
  keys = keys.filter((k) => {
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!keys.length) {
    throw new Error(
      "No API key found.\n" +
      "  Pass --keys \"sk-a,sk-b\" (or --api-key sk-x / --keys-file keys.txt), or\n" +
      "  set the AGNES_API_KEYS environment variable."
    );
  }
  return new agnes.KeyPool(keys, { stateDir: stateDir || paths.stateDir() });
}

// ---------------------------------------------------------------------------
// Project persistence
// ---------------------------------------------------------------------------

const STAGE_DIRS = paths.STAGE_DIRS;

function loadProject(dir) {
  const p = path.join(dir, "project.json");
  if (!fs.existsSync(p)) {
    return { dir, storyboard: null, stages: {}, config: {} };
  }
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  j.dir = dir;
  return j;
}

function saveProject(project) {
  const dir = project.dir;
  agnes.ensureDir(dir);
  const copy = { ...project };
  delete copy.dir;
  agnes.writeFileSyncDurable(path.join(dir, "project.json"), JSON.stringify(copy, null, 2));
}

function stageDir(projectDir, stage) {
  const d = path.join(projectDir, STAGE_DIRS[stage] || stage);
  agnes.ensureDir(d);
  return d;
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

/** Print a small aligned summary table to stdout. */
function printTable(rows, headers) {
  const all = [headers].concat(rows);
  const widths = headers.map((_, i) => Math.max(...all.map((r) => String(r[i] === undefined ? "" : r[i]).length)));
  const line = (r) => r.map((c, i) => String(c === undefined ? "" : c).padEnd(widths[i])).join("  ");
  process.stdout.write(line(headers) + "\n");
  process.stdout.write(widths.map((w) => "-".repeat(w)).join("  ") + "\n");
  rows.forEach((r) => process.stdout.write(line(r) + "\n"));
}

/**
 * Where the project for this song lives.
 *
 * Default is ALWAYS `<skill-root>/out/mv-<song>` — deliberately not the current
 * working directory, so that the tree is identical whether the skill is invoked
 * from a shell inside the skill folder, from the user's home directory or from
 * a scheduled task. An explicit --project/--out is honoured verbatim.
 */
function deriveProjectDir(songPath, explicit) {
  return paths.projectDirFor(songPath, explicit);
}

/**
 * Where the current project is, for the stages that operate on an existing one.
 * Falls back to the (unique) project under out/ and explains itself otherwise.
 */
function resolveProjectDir(explicit) {
  return paths.pickProject(explicit);
}

/**
 * Locate the song for an existing project, preferring the copy stored inside
 * the project so that a run stays reproducible even if the user's original
 * file has moved, been renamed or sits on a drive that is not mounted today.
 *
 * Order:  --song override → project copy → recorded absolute path → meta path
 *         → any audio file left in 00_source/
 */
function resolveSongPath(projectDir, project, meta, explicit) {
  const exists = (p) => {
    try { return !!p && fs.existsSync(p) && fs.statSync(p).isFile(); } catch (e) { return false; }
  };
  const cfg = (project && project.config) || {};
  const m = meta || {};

  if (explicit) {
    const p = path.resolve(explicit);
    if (!exists(p)) throw new Error(`Song file not found: ${p}`);
    return p;
  }

  const candidates = [];
  if (cfg.songRel) candidates.push(path.join(projectDir, cfg.songRel));
  if (m.songRel) candidates.push(path.join(projectDir, m.songRel));
  if (cfg.songPath) candidates.push(path.resolve(cfg.songPath));
  if (m.songPath) candidates.push(path.resolve(m.songPath));

  // Last resort: whatever audio ended up in the project's source folder.
  const srcDir = path.join(projectDir, paths.STAGE_DIRS.source);
  if (fs.existsSync(srcDir)) {
    const AUDIO = /\.(mp3|wav|flac|m4a|aac|ogg|opus|wma|aiff?)$/i;
    fs.readdirSync(srcDir).filter((f) => AUDIO.test(f)).sort()
      .forEach((f) => candidates.push(path.join(srcDir, f)));
  }

  for (const c of candidates) if (exists(c)) return c;

  throw new Error(
    `Song file not found for project ${paths.rel(projectDir)}.\n` +
    "  Looked at: " + (candidates.length ? candidates.map((c) => paths.rel(c)).join(", ") : "(nothing recorded)") + "\n" +
    '  Pass --song "<path>" to point at it explicitly.'
  );
}

/** Sanitise a string for use as a filename. */
function safeName(s, fallback) {
  const v = String(s || "").replace(/[\\/:*?"<>|\r\n\t]+/g, "_").replace(/\s+/g, " ").trim();
  return (v || fallback || "untitled").slice(0, 80);
}

module.exports = {
  createParser,
  COMMON_KEYS,
  COMMON_PROJECT,
  buildKeyPool,
  STAGE_DIRS,
  loadProject,
  saveProject,
  stageDir,
  printTable,
  deriveProjectDir,
  resolveProjectDir,
  resolveSongPath,
  safeName,
};
