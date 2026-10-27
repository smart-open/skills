#!/usr/bin/env node
// -*- coding: utf-8 -*-
/**
 * measure-scale.js —— 「人 vs 建筑」的**坐标级**测量（不是判分）
 *
 * 为什么要有它（HARDENING 坑位 96）：
 *   `scalecheck.js` 让视觉模型**直接给结论**（ok / too_large）。
 *   2026-10-05 实测：同一张、未被改动的 S21，两次跑出**相反**结论
 *   （1.80 → ok；0.80 → too_large）。因为它会自己挑一个"建筑构件"当参照，
 *   再猜那个构件的真实尺寸 —— 换一次采样就可能挑到远桥 / 近墙 / 屋顶。
 *   **那不是测量，是意见。意见不能当门禁。**
 *
 * 所以这里换一种用法：**只让模型报坐标（事实），推导留给我们自己。**
 *   ① 头顶 y / 脚底 y            -> 人高占画面比
 *   ② 月洞门（或指定构件）顶/底 y -> 构件在画面里的高度
 *   ③ 人身后最近院墙的脊线 y      -> 人是否高过墙
 *   人高、构件高、二者比值全部由本脚本算，可复算、可写进报告。
 *
 * 判断仍然交给人眼，但**基线是数字**：把"已经通过用户验收的镜头"先量一遍，
 * 新镜头只要落进那条区间，就属于同一档；明显偏离再谈重画。
 *
 * 用法：
 *   node assets/measure-scale.js --project "<项目目录>" --only S13,S16,S18,S21
 *   node assets/measure-scale.js --project "<项目目录>" --only S18 --json
 *   node assets/measure-scale.js --selftest            # 零额度自检
 *
 * 输出：终端表 + `<项目>/_qa/scale_geometry.json`
 * 退出码：0（本工具**不做**通过/失败判定 —— 判定权在人）
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
  "--only": { key: "only", type: "string", desc: "逗号分隔的镜头 id，如 S13,S18" },
  "--concurrency": { key: "concurrency", type: "int", default: 3 },
  "--max-px": { key: "maxPx", type: "int", default: 1100 },
  "--out": { key: "out", type: "string" },
  "--json": { key: "json", type: "bool" },
  "--selftest": { key: "selftest", type: "bool" },
  ...cli.COMMON_KEYS,
};

const USAGE = `measure-scale.js — 量「人 / 月洞门 / 院墙」的画面几何

  --project <dir>        项目目录（含 02_images/shot_*.png）
  --only S13,S18         只量指定镜头
  --concurrency 3        并发 vision 调用数
  --max-px 1100          送检图最长边
  --out <file.json>      报告路径（默认 <项目>/_qa/scale_geometry.json）
  --keys-file <file>     一行一个 API key
  --json                 终端只打印 JSON
  --selftest             零额度自检

注意：本工具**只报数字，不判通过**。判定权与基线都交给人（坑位 96）。
`;

const SYSTEM =
  "你是影视分镜的几何测量员。只依据图像中实际可见的像素作答，绝不推测，绝不客套。" +
  "你输出的所有坐标都是**归一化**的：0 = 画面最上边 / 最左边，1 = 画面最下边 / 最右边。";

const QUESTION =
  "在这张竖构图分镜里，请给出以下构件的归一化纵坐标（y；0=顶边，1=底边）：\n" +
  "① 主角：头顶的 y、脚底的 y（若脚被遮挡，给出可见最低点并在 note 里说明）。\n" +
  "② 画面中**最完整、最清晰的那个圆形月洞门**：圆洞最高点 y、最低点 y、最左 x、最右 x；" +
  "若画面中没有月洞门，这四项全部填 null。\n" +
  "③ 主角身后**最近的连续白粉院墙**：墙头（含瓦脊）的 y。\n" +
  "只输出 JSON，不要解释文字，不要 markdown 代码块：\n" +
  '{"head_y":0,"foot_y":0,"gate_top_y":0,"gate_bottom_y":0,"gate_left_x":0,"gate_right_x":0,"wall_ridge_y":0,"note":""}';

function findShots(dir, only) {
  const all = fs.readdirSync(dir)
    .filter((f) => /^shot_S\d+\.png$/.test(f))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  if (!only) return all;
  const want = new Set(only.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
  return all.filter((f) => want.has(f.replace(/^shot_|\.png$/g, "").toUpperCase()));
}

const num = (v) => (v == null || v === "" ? null : Number(v));

/** Pure arithmetic, so it can be asserted without touching the API. */
function geometry(raw) {
  const head = num(raw.head_y);
  const foot = num(raw.foot_y);
  const gt = num(raw.gate_top_y);
  const gb = num(raw.gate_bottom_y);
  const gl = num(raw.gate_left_x);
  const gr = num(raw.gate_right_x);
  const ridge = num(raw.wall_ridge_y);
  const person = head != null && foot != null ? Math.abs(foot - head) : null;
  const gate = gt != null && gb != null ? Math.abs(gb - gt) : null;
  const gateW = gl != null && gr != null ? Math.abs(gr - gl) : null;
  return {
    person_h: person,
    gate_h: gate,
    gate_w: gateW,
    gate_over_person: gate != null && person ? gate / person : null,
    wall_ridge_y: ridge,
    // y 越小越靠画面顶部：脚底比头顶小是量反了，直接标出来而不是静默算个负数。
    head_above_wall: ridge != null && head != null ? head < ridge : null,
    head_y: head,
    foot_y: foot,
  };
}

async function selftest() {
  let fail = 0;
  const chk = (c, m) => { if (c) console.log("✓ " + m); else { console.error("x " + m); fail++; } };

  const g = geometry({ head_y: 0.44, foot_y: 0.94, gate_top_y: 0.60, gate_bottom_y: 0.74, wall_ridge_y: 0.49 });
  chk(Math.abs(g.person_h - 0.5) < 1e-9, "人高 = |脚 - 头|");
  chk(Math.abs(g.gate_h - 0.14) < 1e-9, "门高 = |下 - 上|");
  chk(Math.abs(g.gate_over_person - 0.28) < 1e-9, "门/人 比值");
  chk(g.head_above_wall === true, "头顶(0.44) 高于墙脊(0.49) -> true");
  const g2 = geometry({ head_y: 0.55, foot_y: 0.95, wall_ridge_y: 0.40 });
  chk(g2.head_above_wall === false, "头顶(0.55) 低于墙脊(0.40) -> false");
  chk(g2.gate_over_person === null, "没有月洞门 -> 比值为 null（不是 0）");
  const g3 = geometry({ head_y: 0.5, foot_y: 0.9 });
  chk(g3.head_above_wall === null, "墙脊缺失 -> 判定为 null（不猜）");
  const spec = parse(["--project", "X", "--only", "S13,S18", "--concurrency", "5"]);
  chk(spec.project === "X" && spec.only === "S13,S18" && spec.concurrency === 5, "参数解析");
  const seen = [];
  await agnes.runPool([1, 2, 3, 4, 5], async (x) => { seen.push(x); }, 3);
  chk(seen.length === 5, "runPool 接线（items/worker/concurrency 三参数）");
  if (fail) { console.error(`x measure-scale 自检失败 ${fail} 项`); process.exit(1); }
  console.log("✓ measure-scale 自检通过");
}

function parse(argv) {
  return cli.createParser(SPEC, USAGE)(argv);
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

  agnes.log(`measure-scale：${files.length} 个镜头，并发 ${args.concurrency}`);
  const rows = [];
  await agnes.runPool(
    files,
    async (f) => {
      const shot = f.replace(/^shot_|\.png$/g, "");
      try {
        const raw = await vision.chatVisionJson(pool, {
          system: SYSTEM,
          images: [path.join(dir, f)],
          maxPx: args.maxPx,
          text: QUESTION,
        });
        const g = geometry(raw);
        const row = { shot, ...g, note: String(raw.note || "") };
        rows.push(row);
        const f3 = (v) => (v == null ? "  -  " : v.toFixed(2));
        agnes.log(
          `${shot}  人高=${f3(g.person_h)}  门高=${f3(g.gate_h)}  门宽=${f3(g.gate_w)}  ` +
          `门/人=${f3(g.gate_over_person)}  墙脊y=${f3(g.wall_ridge_y)}  ` +
          `头顶高于墙脊=${g.head_above_wall == null ? "?" : g.head_above_wall ? "是" : "否"}`
        );
      } catch (e) {
        agnes.log(`x ${shot} 测量失败: ${e && e.message ? e.message : e}`);
        rows.push({ shot, error: String(e && e.message ? e.message : e) });
      }
    },
    args.concurrency
  );

  rows.sort((a, b) => a.shot.localeCompare(b.shot, "en", { numeric: true }));
  if (rows.length !== files.length) {
    agnes.log(`! 结果条数异常：期望 ${files.length}，实得 ${rows.length}`);
  }
  const out = args.out
    ? path.resolve(args.out)
    : path.join(path.resolve(args.project), "_qa", "scale_geometry.json");
  const report = {
    generated_at: new Date().toISOString(),
    project: path.resolve(args.project),
    note: "只报几何，不判通过/失败 —— 判定权在人（HARDENING 坑位 96）。",
    per_shot: rows,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  agnes.writeFileSyncDurable(out, JSON.stringify(report, null, 2) + "\n");

  const f3 = (v) => (typeof v === "number" ? v.toFixed(2) : v == null ? "-" : String(v));
  if (args.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    agnes.log("");
    cli.printTable(
      rows.map((r) => [
        r.shot,
        r.error ? "ERR" : f3(r.person_h),
        r.error ? "-" : f3(r.gate_h),
        r.error ? "-" : f3(r.gate_over_person),
        r.error ? "-" : f3(r.wall_ridge_y),
        r.error ? "-" : (r.head_above_wall == null ? "?" : r.head_above_wall ? "是" : "否"),
      ]),
      ["镜头", "人高", "门高", "门/人", "墙脊y", "头顶高于墙脊"]
    );
    agnes.log("");
    agnes.log(`报告: ${out}`);
    agnes.log("提示：先量几格**用户已通过**的镜头当基线；新镜头落进基线区间即同档。");
  }
  process.exit(0);
})().catch((e) => {
  process.stderr.write("x measure-scale 失败: " + (e && e.stack ? e.stack : e) + "\n");
  process.exit(1);
});
