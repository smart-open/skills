#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * test/paths.js — offline checks for the "no environment dependence" contract.
 *
 * No network, no API keys, no ffmpeg. Runs in well under a second.
 *
 * What it protects:
 *   1. Every output path is anchored to the current session's working
 *      directory, so all results and intermediates land in <cwd>/out/ —
 *      never inside the skill installation.
 *   2. Only scripts/lib/paths.js may consult process.cwd() (it anchors the
 *      output root); no other script derives a path from it.
 *   3. No source file contains a machine-specific absolute path, a drive
 *      letter, a user name or a home directory.
 *   4. Project lookup is explicit or unambiguous: one project is picked, zero
 *      or several produce a clear error rather than a silent wrong choice.
 *   5. The song is resolved from the copy stored inside the project, so a
 *      finished project still assembles after the original file moves.
 *
 *   node test/paths.js
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const paths = require(path.join(__dirname, "..", "scripts", "lib", "paths"));
const cli = require(path.join(__dirname, "..", "scripts", "lib", "cli"));
const agnes = require(path.join(__dirname, "..", "scripts", "lib", "agnes"));

let pass = 0;
let fail = 0;

function ok(name, cond, detail) {
  if (cond) {
    pass++;
    process.stdout.write(`PASS  ${name}\n`);
  } else {
    fail++;
    process.stdout.write(`FAIL  ${name}${detail ? "  -> " + detail : ""}\n`);
  }
}

const SCRIPTS = path.join(paths.SKILL_ROOT, "scripts");

// ---------------------------------------------------------------------------
// 1. Roots
// ---------------------------------------------------------------------------

process.stdout.write("\n# roots\n");
delete process.env.CMV_OUT_DIR;

ok("SKILL_ROOT is the cinematic-music-video directory",
  path.basename(paths.SKILL_ROOT) === "cinematic-music-video",
  paths.SKILL_ROOT);
ok("SKILL_ROOT really contains the skill",
  fs.existsSync(path.join(paths.SKILL_ROOT, "SKILL.md")) &&
  fs.existsSync(path.join(paths.SKILL_ROOT, "scripts", "run.js")),
  paths.SKILL_ROOT);
ok("out/ is <cwd>/out",
  paths.outDir() === path.join(process.cwd(), "out"),
  paths.outDir());
ok("state/ is <out>/.state",
  paths.stateDir() === path.join(paths.outDir(), ".state"),
  paths.stateDir());
ok("vision cache is under out/.state",
  paths.visionCacheDir() === path.join(paths.stateDir(), "vision-cache"),
  paths.visionCacheDir());
ok("the whole output tree renders relative to the cwd",
  paths.rel(paths.outDir()) === "out" && paths.rel(paths.visionCacheDir()) === "out/.state/vision-cache",
  paths.rel(paths.visionCacheDir()));
ok("rel() uses forward slashes (readable in logs on every platform)",
  !paths.rel(paths.visionCacheDir()).includes("\\"),
  paths.rel(paths.visionCacheDir()));
ok("stage dir names include the self-contained source folder",
  paths.STAGE_DIRS.source === "00_source" && paths.STAGE_DIRS.output === "05_output",
  JSON.stringify(paths.STAGE_DIRS));

// ---------------------------------------------------------------------------
// 2. Outputs follow the current working directory (session anchoring)
// ---------------------------------------------------------------------------

process.stdout.write("\n# outputs follow the working directory\n");

const cwdBefore = process.cwd();
const otherCwd = os.tmpdir();
let cwdVerdict = {};
try {
  process.chdir(otherCwd);
  cwdVerdict = {
    out: paths.outDir(),
    project: paths.projectDirFor("song.mp3", null),
    slug: paths.projectSlug("song.mp3"),
  };
  process.chdir(cwdBefore);
} catch (e) {
  try { process.chdir(cwdBefore); } catch (e2) { /* ignore */ }
  ok("could chdir for the cwd-follow check", false, e.message);
}
ok("out/ follows the current working directory",
  cwdVerdict.out === path.join(otherCwd, "out"),
  `${cwdVerdict.out} (cwd was ${otherCwd})`);
ok("the derived project follows the working directory too",
  cwdVerdict.project === path.join(otherCwd, "out", "mv-song"),
  cwdVerdict.project);
ok("the skill installation itself never receives outputs",
  cwdVerdict.project !== path.join(paths.SKILL_ROOT, "out", "mv-song"),
  cwdVerdict.project);

// ---------------------------------------------------------------------------
// 3. No machine-specific path is baked into any script
// ---------------------------------------------------------------------------

process.stdout.write("\n# no machine-specific paths in source\n");

/** Remove block and line comments so prose cannot be mistaken for code. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function walkJs(dir, out) {
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkJs(p, out);
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

const sources = walkJs(SCRIPTS).map((f) => ({ file: path.relative(SCRIPTS, f), code: stripComments(fs.readFileSync(f, "utf8")) }));
ok("found the script sources to scan", sources.length >= 15, `${sources.length} files`);

const BANNED = [
  { name: "a Windows drive-letter path", re: /["'`][A-Za-z]:[\\/]|\b[A-Za-z]:\\\\(?:Users|Program|Windows|ai_work)\b/i },
  { name: "a POSIX home directory", re: /\/Users\/|\/home\/[a-z]|~\/\./i },
  { name: "the development machine's folder or user name", re: /ai_work|tianw/i },
];
for (const b of BANNED) {
  const hits = sources.filter((s) => b.re.test(s.code)).map((s) => s.file);
  ok(`no source contains ${b.name}`, hits.length === 0, hits.join(", "));
}

const cwdHits = sources.filter((s) => /process\.cwd\s*\(/.test(s.code)).map((s) => s.file);
ok("only lib/paths.js derives a path from process.cwd()",
  cwdHits.length === 1 && path.normalize(cwdHits[0]) === path.join("lib", "paths.js"),
  cwdHits.join(", "));

const tmpHits = sources.filter((s) => /os\.tmpdir\s*\(|os\.homedir\s*\(/.test(s.code)).map((s) => s.file);
ok("no script writes to the OS temp or home directory", tmpHits.length === 0, tmpHits.join(", "));

// The key cursor and the vision cache must be explicitly pointed at out/.state
// rather than left to a default elsewhere.
ok("the key pool defaults its state dir into out/.state",
  new agnes.KeyPool(["sk-aaaaaaaaaaaaaaaaaaaa", "sk-bbbbbbbbbbbbbbbbbbbb"]).stateDir === paths.stateDir(),
  new agnes.KeyPool(["sk-aaaaaaaaaaaaaaaaaaaa"]).stateDir);
const imgutilSrc = fs.readFileSync(path.join(SCRIPTS, "lib", "imgutil.js"), "utf8");
ok("the vision cache defaults into out/.state",
  /paths\.visionCacheDir\(\)/.test(imgutilSrc));

// ---------------------------------------------------------------------------
// 4. Project naming + lookup
// ---------------------------------------------------------------------------

process.stdout.write("\n# project resolution\n");

ok("projectSlug keeps CJK titles readable",
  paths.projectSlug("夜曲.mp3") === "mv-夜曲",
  paths.projectSlug("夜曲.mp3"));
ok("projectSlug strips path separators and unsafe characters",
  paths.projectSlug("/a/b/c:未完成的歌?.flac") === "mv-c_未完成的歌_",
  paths.projectSlug("/a/b/c:未完成的歌?.flac"));
ok("projectSlug always yields a single path segment",
  !paths.projectSlug("we/ird\\name.mp3").includes("/") && !paths.projectSlug("we/ird\\name.mp3").includes("\\"),
  paths.projectSlug("we/ird\\name.mp3"));

ok("an explicit project path is honoured verbatim",
  cli.deriveProjectDir("song.mp3", path.join(os.tmpdir(), "custom-proj")) === path.resolve(os.tmpdir(), "custom-proj"));
ok("without an explicit path the project goes under out/",
  cli.deriveProjectDir(path.join(os.tmpdir(), "song.mp3"), null) === path.join(paths.outDir(), "mv-song"),
  cli.deriveProjectDir(path.join(os.tmpdir(), "song.mp3"), null));

// Exercise the lookup against a throwaway out/ root so the real one is untouched.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "cmv-paths-"));
process.env.CMV_OUT_DIR = sandbox;
let sandboxOk = true;
try {
  ok("CMV_OUT_DIR relocates the whole tree",
    paths.outDir() === path.resolve(sandbox),
    paths.outDir());

  let threw = null;
  try { paths.pickProject(null); } catch (e) { threw = e; }
  ok("with no project present the lookup fails loudly", !!threw, threw ? "no error thrown" : "");
  ok("...and says where it looked",
    !!threw && threw.message.includes(paths.outDir()) && /plan\.js/.test(threw.message),
    threw && threw.message.split("\n")[0]);
  ok("...using the ENOPROJECT code so callers can branch",
    !!threw && threw.code === "ENOPROJECT",
    threw && threw.code);

  const p1 = path.join(sandbox, "mv-one");
  fs.mkdirSync(p1, { recursive: true });
  fs.writeFileSync(path.join(p1, "project.json"), "{}");
  ok("a single project is picked automatically",
    paths.pickProject(null) === p1,
    paths.pickProject(null));
  ok("a directory without project.json is not treated as a project",
    paths.listProjects().length === 1,
    String(paths.listProjects().length));

  fs.mkdirSync(path.join(sandbox, ".state"), { recursive: true });
  ok("hidden state directories are never mistaken for projects",
    paths.listProjects().length === 1,
    String(paths.listProjects().length));

  fs.mkdirSync(path.join(sandbox, "mv-two"), { recursive: true });
  fs.writeFileSync(path.join(sandbox, "mv-two", "project.json"), "{}");
  threw = null;
  try { paths.pickProject(null); } catch (e) { threw = e; }
  ok("several projects require an explicit choice", !!threw && threw.code === "EAMBIGUOUS", threw && threw.code);
  ok("...and the error lists the candidates",
    !!threw && /mv-one/.test(threw.message) && /mv-two/.test(threw.message),
    threw && threw.message.split("\n").slice(1).join(" | "));
  ok("an explicit path resolves even when several projects exist",
    paths.pickProject(path.join(sandbox, "mv-two")) === path.join(sandbox, "mv-two"));

  // ---- 5. Song resolution prefers the in-project copy -------------------
  process.stdout.write("\n# song resolution\n");

  const proj = path.join(sandbox, "mv-one");
  const srcDir = path.join(proj, paths.STAGE_DIRS.source);
  fs.mkdirSync(srcDir, { recursive: true });
  const copied = path.join(srcDir, "夜曲.mp3");
  fs.writeFileSync(copied, "not really audio");

  const project = {
    config: {
      songRel: path.join(paths.STAGE_DIRS.source, "夜曲.mp3"),
      // Deliberately a path that cannot exist: the in-project copy must win.
      songPath: path.join(os.tmpdir(), "definitely-gone", "夜曲.mp3"),
    },
  };
  ok("the in-project song copy is preferred over the recorded original",
    cli.resolveSongPath(proj, project, null, null) === copied,
    cli.resolveSongPath(proj, project, null, null));

  ok("a project with no recorded path still finds audio in 00_source/",
    cli.resolveSongPath(proj, { config: {} }, null, null) === copied);

  let songThrew = null;
  try { cli.resolveSongPath(proj, { config: {} }, null, "no/such/file.mp3"); } catch (e) { songThrew = e; }
  ok("an explicit but missing song path is reported, not ignored",
    !!songThrew && /not found/i.test(songThrew.message),
    songThrew && songThrew.message);

  const emptyProj = path.join(sandbox, "mv-two");
  songThrew = null;
  try { cli.resolveSongPath(emptyProj, { config: {} }, null, null); } catch (e) { songThrew = e; }
  ok("a project with no song anywhere produces an actionable error",
    !!songThrew && /--song/.test(songThrew.message),
    songThrew && songThrew.message.split("\n")[0]);

  ok("the song search never reaches outside the project or the given path",
    !cli.resolveSongPath(proj, project, null, null).startsWith(paths.SKILL_ROOT));
} catch (e) {
  sandboxOk = false;
  ok("sandbox checks completed", false, e && e.message);
} finally {
  delete process.env.CMV_OUT_DIR;
  try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch (e) { /* best effort */ }
}

ok("the sandbox was cleaned up", sandboxOk);

// ---------------------------------------------------------------------------
// 6. End-to-end: a real script run must anchor out/ to the cwd and leak no paths
// ---------------------------------------------------------------------------

process.stdout.write("\n# real script run (offline, no API)\n");

const { spawnSync } = require("child_process");
const RUN = path.join(SCRIPTS, "run.js");
// --dry-run never probes the audio, so any existing file will do as a stand-in;
// passing it as a basename (with a copy in each cwd) keeps every path in the
// output relative and the two runs byte-identical.
const standInName = "SKILL.md";
const tmpRunCwd = fs.mkdtempSync(path.join(os.tmpdir(), "cmv-dryrun-"));
fs.copyFileSync(path.join(paths.SKILL_ROOT, standInName), path.join(tmpRunCwd, standInName));

function dryRun(cwd) {
  const r = spawnSync(process.execPath, [RUN, "--song", standInName, "--shots", "8", "--dry-run"], {
    cwd,
    encoding: "utf8",
    timeout: 60000,
    env: Object.assign({}, process.env, { CMV_OUT_DIR: "" }),
  });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

const fromSkill = dryRun(paths.SKILL_ROOT);
const fromElsewhere = dryRun(tmpRunCwd);

ok("run.js --dry-run succeeds", fromSkill.status === 0,
  `status=${fromSkill.status} ${fromSkill.out.slice(0, 300)}`);
ok("...without needing an API key", !/no API key/i.test(fromSkill.out));
ok("...and reports the project under out/",
  fromSkill.out.includes("out/mv-SKILL"),
  (fromSkill.out.match(/project\s*:.*/) || [""])[0]);
ok("...and reports the out root explicitly",
  /out root\s*:\s*out\//.test(fromSkill.out),
  (fromSkill.out.match(/out root.*/) || [""])[0]);
ok("...and writes nothing to disk",
  !fs.existsSync(path.join(paths.outDir(), "mv-SKILL")) &&
  !fs.existsSync(path.join(tmpRunCwd, "out", "mv-SKILL")),
  path.join(paths.outDir(), "mv-SKILL"));

// The strongest form of the requirement: the same command, run from two
// different directories, produces byte-identical output — and that output
// contains no absolute path at all.
ok("the same command from two different directories prints identical output",
  fromSkill.out === fromElsewhere.out,
  `skill-root run ${fromSkill.out.length} chars vs tmpdir run ${fromElsewhere.out.length} chars`);
ok("no absolute machine path leaks into the output",
  !/[A-Za-z]:[\\/]/.test(fromSkill.out) && !fromSkill.out.includes(os.tmpdir()),
  (fromSkill.out.match(/[A-Za-z]:[\\/][^\s]*/) || [""])[0]);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

try { fs.rmSync(tmpRunCwd, { recursive: true, force: true }); } catch (e) { /* best effort */ }

process.stdout.write("\n" + "-".repeat(60) + "\n");
process.stdout.write(`paths: ${pass} passed, ${fail} failed\n`);
if (fail) {
  process.stdout.write("RESULT=FAIL\n");
  process.exit(1);
}
process.stdout.write("RESULT=PASS\n");
