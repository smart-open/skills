#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * scalecheck.js —— 「人数 + 人物/建筑尺度」逐镜客观审计（消费 vision 额度，远低于重画）
 *
 * 为什么要有它：
 *   布尔身份门禁只回答两件事——「是不是同一个人」「画面里有没有第二个人」，
 *   而且**只在重试过的镜头上跑**。它看不见另一类很常见的失真：
 *
 *     **主角被放大到与建筑不成比例** —— 人站在庭院里，却比整堵墙、整栋房子还高。
 *     竖屏（9:16）尤其容易犯：纵向画幅把"近景+全身"顶满，模型按肖像尺度放人，
 *     身后的水乡建筑就被压成了模型玩具。
 *
 *   2026-10-04《春风许我再少年》9:16 关键帧完工后，人眼终审发现的正是这一类，
 *   以及"不要双人版"的复核需求。所以需要一个**逐镜、可复跑、出结论表**的检查器。
 *
 * 用法：
 *   node assets/scalecheck.js --project "<项目目录>" --keys-file <keys.txt>
 *   node assets/scalecheck.js --project "<项目目录>" --only S13,S14,S19
 *   node assets/scalecheck.js --project "<项目目录>" --json
 *   node assets/scalecheck.js --selftest          # 零额度自检（只验证参数与建表）
 *
 * 退出码：0 = 没有严重问题；1 = 存在 human_count>=2 或 scale_verdict=too_large
 *        （可直接当门禁接进流水线）
 *
 * 输出：
 *   <项目>/02_images/_scalecheck.json   逐镜原始判定
 *   终端表格：镜头 / 人数 / 身高占比 / 尺度判定 / 一句话
 */
const fs = require("fs");
const path = require("path");

const SCRIPT_DIR = __dirname;
const SKILL_ROOT = path.resolve(SCRIPT_DIR, "..");
const cli = require(path.join(SKILL_ROOT, "scripts", "lib", "cli"));
const vision = require(path.join(SKILL_ROOT, "scripts", "lib", "vision"));
const agnes = require(path.join(SKILL_ROOT, "scripts", "lib", "agnes"));

const SPEC = {
  "--project": { key: "project", type: "string", alias: ["-d"] },
  "--only": { key: "only", type: "string", desc: "逗号分隔的镜头 id，如 S13,S19" },
  "--concurrency": { key: "concurrency", type: "int", default: 3 },
  "--max-px": { key: "maxPx", type: "int", default: 900 },
  "--out": { key: "out", type: "string" },
  "--json": { key: "json", type: "bool" },
  "--selftest": { key: "selftest", type: "bool" },
  ...cli.COMMON_KEYS,
};

const USAGE = `scalecheck.js — 逐镜审计「人数」与「人物/建筑尺度」

  --project <dir>        项目目录（含 02_images/shot_*.png）
  --only S13,S19         只审计指定镜头
  --concurrency 3        并发 vision 调用数
  --max-px 900           送检图最长边（越大越准，越贵）
  --out <file.png/json>  报告路径（默认 <项目>/02_images/_scalecheck.json）
  --keys-file <file>     一行一个 API key
  --json                 终端只打印 JSON
  --selftest             零额度自检
`;

const SYSTEM =
  "你是影视制作的分镜质检员。你只依据图像中实际可见的证据作答，绝不推测，绝不客套。" +
  "你尤其擅长判断「画面中人物的身高，相对同一画面里的建筑构件（墙、屋顶、门窗、" +
  "月洞门、石拱桥、台阶、栏杆）是否合乎真实物理比例」。";

const QUESTION = (shot) =>
  `这是一张电影分镜的首帧（镜头 ${shot}）。请完成两项核查，只输出 JSON：\n` +
  "① 人数：数清画面中**清晰可见的人**（含背影、远景小人、镜面/水面倒影里的人）。\n" +
  "② 尺度：判断主角的**身高**相对画面中建筑构件是否协调。判据：\n" +
  "   - 一扇门 / 一个月洞门 / 一段院墙，其高度通常约等于 1 个成年人（1.6~2.2 倍人头高）；\n" +
  "   - 若主角明显比整扇门、整段院墙、甚至整栋小建筑还高/还大 —— 判 too_large；\n" +
  "   - 若主角明显矮于一切建筑、像模型小人 —— 判 too_small；\n" +
  "   - 空镜（画面无人）判 none。\n\n" +
  "只输出如下 JSON，不要解释文字，不要 markdown 代码块：\n" +
  '{"human_count":0,"people":["一句话描述每个人"],' +
  '"protagonist_height_ratio":0.0,' +
  '"scale_verdict":"ok","scale_note":"一句话说明你据什么构件判断的"}';

function parse(argv) {
  const parseFn = cli.createParser(SPEC, USAGE);
  return parseFn(argv);
}

async function selftest() {
  let fail = 0;
  const j = agnes.extractJson('```json\n{"human_count":2,"scale_verdict":"too_large"}\n```');
  if (j.human_count !== 2) { console.error("x extractJson 抠 JSON 失败"); fail++; } else console.log("✓ extractJson 抠 ```json 围栏");
  const spec = parse(["--project", "X", "--only", "S13,S19", "--concurrency", "5"]);
  if (spec.project !== "X" || spec.only !== "S13,S19" || spec.concurrency !== 5) { console.error("x 参数解析失败", spec); fail++; }
  else console.log("✓ 参数解析");
  const v = "too_large";
  const isBad = (r) => Number(r.human_count) >= 2 || r.scale_verdict === "too_large";
  if (!isBad({ human_count: 2, scale_verdict: "ok" }) || !isBad({ human_count: 1, scale_verdict: v }) || isBad({ human_count: 1, scale_verdict: "ok" })) {
    console.error("x 判定逻辑失败"); fail++;
  } else console.log("✓ 判定逻辑（human_count>=2 或 too_large 记问题）");
  // 并发池的接线自检 —— 曾经把并发数当 worker 传进去，24 个镜头静默返回 0 条结果。
  const seen = [];
  await agnes.runPool([1, 2, 3, 4, 5], async (x) => { seen.push(x); }, 3);
  if (seen.length !== 5) { console.error(`x runPool 接线失败：期望 5 条，实得 ${seen.length}`); fail++; }
  else console.log("✓ runPool 接线（items/worker/concurrency 三参数）");
  if (fail) { console.error(`x scalecheck 自检失败 ${fail} 项`); process.exit(1); }
  console.log("✓ scalecheck 自检通过");
}

function findShots(dir, only) {
  const all = fs.readdirSync(dir)
    .filter((f) => /^shot_S\d+\.png$/.test(f))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  if (!only) return all;
  const want = new Set(only.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
  return all.filter((f) => want.has(f.replace(/^shot_|\.png$/g, "").toUpperCase()));
}

(async () => {
  const args = parse(process.argv.slice(2));
  if (args.selftest) return selftest();

  if (!args.project) {
    process.stderr.write("ERROR: 需要 --project <项目目录>\n\n" + USAGE);
    process.exit(2);
  }
  const dir = path.resolve(args.project, "02_images");
  if (!fs.existsSync(dir)) {
    process.stderr.write(`ERROR: 找不到 ${dir}\n`);
    process.exit(2);
  }
  const pool = cli.buildKeyPool(args);
  const files = findShots(dir, args.only);
  if (!files.length) {
    process.stderr.write("ERROR: 没有匹配的关键帧\n");
    process.exit(2);
  }

  agnes.log(`scalecheck：${files.length} 个镜头，并发 ${args.concurrency}`);
  const results = [];
  await agnes.runPool(
    files,
    async (f) => {
      const shot = f.replace(/^shot_|\.png$/g, "");
      try {
        const raw = await vision.chatVisionJson(pool, {
          system: SYSTEM,
          images: [path.join(dir, f)],
          maxPx: args.maxPx,
          text: QUESTION(shot),
        });
        const r = {
          shot,
          human_count: Number(raw.human_count) || 0,
          people: Array.isArray(raw.people) ? raw.people.filter(Boolean) : [],
          protagonist_height_ratio: Number(raw.protagonist_height_ratio) || 0,
          scale_verdict: String(raw.scale_verdict || "ok"),
          scale_note: String(raw.scale_note || ""),
        };
        r.flagged = r.human_count >= 2 || r.scale_verdict === "too_large";
        results.push(r);
        agnes.log(
          `${r.flagged ? "!" : "✓"} ${shot}  人=${r.human_count}  身高占比=${r.protagonist_height_ratio.toFixed(2)}  ${r.scale_verdict}  ${r.scale_note}`
        );
      } catch (e) {
        agnes.log(`x ${shot} 审计失败: ${e && e.message ? e.message : e}`);
        results.push({ shot, error: String(e && e.message ? e.message : e), flagged: false });
      }
    },
    args.concurrency
  );

  results.sort((a, b) => a.shot.localeCompare(b.shot, "en", { numeric: true }));
  if (results.length !== files.length) {
    agnes.log(`! 结果条数异常：期望 ${files.length}，实得 ${results.length}（审计不完整）`);
  }
  const out = args.out
    ? path.resolve(args.out)
    : path.join(dir, "_scalecheck.json");
  const report = {
    generated_at: new Date().toISOString(),
    project: path.resolve(args.project),
    checked: results.length,
    flagged: results.filter((r) => r.flagged).map((r) => r.shot),
    two_people: results.filter((r) => Number(r.human_count) >= 2).map((r) => r.shot),
    too_large: results.filter((r) => r.scale_verdict === "too_large").map((r) => r.shot),
    per_shot: results,
  };
  agnes.writeFileSyncDurable(out, JSON.stringify(report, null, 2) + "\n");

  if (args.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    agnes.log("");
    cli.printTable(
      results.map((r) => [
        r.shot,
        r.error ? "ERR" : r.human_count,
        r.error ? "-" : r.protagonist_height_ratio.toFixed(2),
        r.error ? "error" : r.scale_verdict,
        r.error ? r.error.slice(0, 40) : (r.scale_note || "").slice(0, 46),
      ]),
      ["镜头", "人数", "身高占比", "尺度判定", "依据/备注"]
    );
    agnes.log("");
    agnes.log(`报告: ${out}`);
    agnes.log(`双人: ${report.two_people.length ? report.two_people.join(", ") : "无"}`);
    agnes.log(`过大: ${report.too_large.length ? report.too_large.join(", ") : "无"}`);
  }
  process.exit(report.flagged.length ? 1 : 0);
})().catch((e) => {
  process.stderr.write("x scalecheck 失败: " + (e && e.stack ? e.stack : e) + "\n");
  process.exit(1);
});
