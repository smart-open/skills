#!/usr/bin/env node
/**
 * draft.js — 脱口秀脚本创作前端（一题 5 角度出稿）
 *
 * 借鉴 ai-script-generation-skill 方法论：把爆款脚本方法论固化为 kb/ 知识库文件
 * （framework.md / triggers.md / styles.md / hot.md），输入一个主题，从 5 个角度
 * 各生成一份简稿，每稿标注：所用框架、心理触发点、预估时长、制作难度。
 *
 * 本脚本只做"创作"，不做任何图像/视频调用 —— 零生成成本、可反复重跑。
 * 选中的稿子直接作为简稿交给 talkshow_produce.js 制作。
 *
 * 用法：
 *   node draft.js --topic "早高峰地铁" [--count 5] [--voice female|male]
 *                 [--api-key <key>] [--base-url <url>] [--model <id>]
 *                 [--out <dir>]
 *
 * Key 优先级：--api-key > TEXT_API_KEY > AGNES_API_KEY > agnes-api-key（环境变量）
 * 默认模型：agnes-3.0-flash（OpenAI 兼容接口，可换任意兼容服务）
 */

"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { topic: "", count: 5, voice: null, out: null, apiKey: null, baseUrl: null, model: null, kbDir: null };
  const map = {
    "--topic": "topic",
    "--count": "count",
    "--voice": "voice",
    "--out": "out",
    "--api-key": "apiKey",
    "--base-url": "baseUrl",
    "--model": "model",
    "--kb-dir": "kbDir",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      console.log(
        "用法：node draft.js --topic <主题> [options]\n" +
          "  --topic <text>    必填，主题/灵感（一句话即可）\n" +
          "  --count <n>       出稿数量（默认 5：干货效率/痛点共鸣/悬念反转/对比冲击/热点借势）\n" +
          "  --voice <f|m>     音色性别预设 female|male（仅写进 notes，制作阶段用）\n" +
          "  --out <dir>       输出目录（默认 out/drafts/<时间戳>）\n" +
          "  --kb-dir <dir>    知识库目录覆盖（默认 scripts/kb/，单源：talkshow-studio/scripts/kb/）\n" +
          "  --api-key <key>   文本模型 Key（默认读 TEXT_API_KEY / AGNES_API_KEY）\n" +
          "  --base-url <url>  OpenAI 兼容地址（默认 https://api.agnes-ai.cn/v1）\n" +
          "  --model <id>      文本模型（默认 agnes-3.0-flash）\n"
      );
      process.exit(0);
    }
    const key = map[a];
    if (!key) {
      console.error("ERROR: unknown argument " + a);
      process.exit(2);
    }
    args[key] = argv[i + 1];
    i++;
  }
  if (!args.topic) {
    console.error("ERROR: --topic 必填（例：node draft.js --topic \"早高峰地铁\"）");
    process.exit(2);
  }
  args.count = Math.max(1, Math.min(5, parseInt(args.count, 10) || 5));
  return args;
}

// ---------------------------------------------------------------------------
// kb 知识库
// ---------------------------------------------------------------------------

// kb 单源约定（2026-09-19）：knowledge base 唯一真源在 talkshow-studio/scripts/kb/。
// 本技能（studio）本地优先；kling 版没有本地 kb，按 --kb-dir → 本地 → 同级 studio 回退。

function resolveKbDir() {
  const candidates = [
    args.kbDir && path.resolve(args.kbDir),
    path.join(__dirname, "kb"),
    path.join(__dirname, "..", "..", "talkshow-studio", "scripts", "kb"),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "framework.md"))) return dir;
  }
  return candidates[1]; // 回退默认（走逐文件 warn）
}

function loadKb() {
  const kbDir = resolveKbDir();
  const files = ["framework.md", "triggers.md", "styles.md", "hot.md"];
  const parts = [];
  for (const f of files) {
    const p = path.join(kbDir, f);
    if (fs.existsSync(p)) {
      parts.push(`===== ${f} =====\n${fs.readFileSync(p, "utf-8")}`);
    } else {
      console.warn(`[warn] 知识库文件缺失（不影响运行，但质量会降）：${f}`);
    }
  }
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// OpenAI 兼容 chat（自带最小实现 + 重试，零 npm 依赖）
// ---------------------------------------------------------------------------

function rawRequestJson(url, { headers = {}, body, timeoutMs = 180000 }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const payload = Buffer.from(JSON.stringify(body), "utf8");
    const req = lib.request(
      {
        method: "POST",
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        headers: { "Content-Type": "application/json", "Content-Length": payload.length, ...headers },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode, text });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error(`请求超时（${timeoutMs}ms）`)));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function chat({ apiKey, baseUrl, model, messages, timeoutMs = 240000 }) {
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await rawRequestJson(`${baseUrl}/chat/completions`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        body: { model, messages, temperature: 0.9 },
        timeoutMs,
      });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${r.text.slice(0, 200)}`);
      const data = JSON.parse(r.text);
      return data.choices[0].message.content;
    } catch (e) {
      lastErr = e;
      if (attempt < 3) {
        const delay = 3000 * Math.pow(2, attempt - 1);
        console.log(`  [retry] 文本模型第 ${attempt} 次失败（${String(e.message).slice(0, 120)}），${delay / 1000}s 后重试...`);
        await sleep(delay);
      }
    }
  }
  throw lastErr;
}

/** 从模型输出中容错提取 JSON 数组 */
function extractJsonArray(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) throw new Error("输出中找不到 JSON 数组");
  return JSON.parse(candidate.slice(start, end + 1));
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const ANGLES = [
  { key: "干货效率型", brief: "用信息增量给观众'赚到感'：把主题拆成一个反常识的效率/省钱/省事洞察，用算账和对比制造爽感" },
  { key: "痛点共鸣型", brief: "把主题里最扎心的共同经历讲成'这就是我'：细节越具体越好，先共鸣后自嘲，不许抱怨式收尾" },
  { key: "悬念反转型", brief: "开场抛反常情境，中段按常识铺垫预期，结尾预期违背并用回环词收尾（framework.md F1）" },
  { key: "对比冲击型", brief: "用强对比制造落差（理想 vs 现实 / 别人 vs 我 / 价格 vs 价值），三连击递进，最后一击打回自己（F2）" },
  { key: "热点借势型", brief: "只借热点情绪不借热点事实，把主题挂到大众都在关心的情绪上；如果 kb/hot.md 无可用热点则用'长期性社会情绪'替代" },
];

function buildPrompt(topic, count, voice, kbDirOverride) {
  const kb = loadKb(kbDirOverride);
  const angleText = ANGLES.slice(0, count)
    .map((a, i) => `${i + 1}. 【${a.key}】${a.brief}`)
    .join("\n");
  return {
    system:
      "你是一位顶级中文脱口秀编剧兼爆款短视频操盘手。你必须严格遵守知识库中的结构、触发点、人设与禁用词规范。" +
      "输出只能是严格的 JSON 数组，不要任何多余文字或 markdown 代码块以外的解释。",
    user:
      `# 知识库\n${kb}\n\n# 任务\n主题：「${topic}」\n` +
      `请从这个主题出发，按以下 ${count} 个角度各写一篇脱口秀简稿（每篇 200–400 字，口语化，可直接上台）：
${angleText}

# 硬性要求
1. 每篇声明所用框架（framework 字段，取值 F1/F2/F3 或组合）、2 个以上心理触发点（triggers 数组）、一个人设（style 字段，取 styles.md 五选一）。
2. 每篇含 3 个以上笑点（预期违背）与 1 个共鸣点；结尾落在停顿点。
3. 逐条自查 kb/styles.md 禁用词清单，命中任何一条直接改写后再输出。
4. estimated_seconds 按"字数/4.5 字每秒"估算（对应 talkshow_produce 单镜 5–12s 的拆分）。
5. difficulty 取值：低/中/高（高=道具或多人演绎复杂、或禁用词边缘需人工把关）。
${voice ? `6. 音色性别预设：${voice === "female" ? "female（28 岁清亮女声）" : "male（30 岁中音男声）"}，写入每篇 notes。` : ""}

# 输出格式（严格 JSON 数组，共 ${count} 个对象，不要包 markdown）
[
  {
    "angle": "干货效率型",
    "title": "≤15 字的稿件标题",
    "framework": "F1|F2|F3|组合说明",
    "triggers": ["共鸣", "优越感"],
    "style": "自嘲打工人",
    "hook": "开场第一句（3 秒钩子）",
    "script": "完整简稿全文，200–400 字，口语化，换行用 \\n",
    "estimated_seconds": 55,
    "difficulty": "低",
    "notes": "触发点挂在哪几句 + 制作提示（道具/表情强度建议）"
  }
]`,
  };
}

// ---------------------------------------------------------------------------
// 预估与输出
// ---------------------------------------------------------------------------

function productionEstimate(scriptText) {
  // talkshow_produce 经验值：240 字 ≈ 1 分钟 ≈ 5-6 镜；此处按 ~45 字/镜
  const chars = scriptText.replace(/\s/g, "").length;
  const shots = Math.max(3, Math.round(chars / 45));
  const seconds = shots * 10;
  return { chars, shots, seconds, costNote: `视频刊例价约 ¥${(seconds * 0.15).toFixed(1)}（¥0.15/s，Agnes 限时免费期实际 ¥0）` };
}

function renderMarkdown(drafts, topic) {
  const lines = [`# 脱口秀简稿候选（主题：${topic}）`, ""];
  drafts.forEach((d, i) => {
    const est = productionEstimate(d.script || "");
    lines.push(`## ${i + 1}. 【${d.angle}】${d.title || ""}`);
    lines.push(`- 框架：${d.framework} ｜ 触发点：${(d.triggers || []).join("、")} ｜ 人设：${d.style}`);
    lines.push(`- 预估时长：~${d.estimated_seconds}s ｜ 字数：${est.chars} ｜ 预计镜数：${est.shots}（${est.costNote}）`);
    lines.push(`- 制作难度：${d.difficulty}`);
    lines.push(`- notes：${d.notes || ""}`);
    lines.push("", "```", d.script || "", "```", "");
  });
  lines.push("> 选稿后：把选中稿的 script 全文存为 txt，交给 talkshow_produce.js --script-file 制作。");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = args.apiKey || process.env.TEXT_API_KEY || process.env.AGNES_API_KEY || process.env["agnes-api-key"];
  if (!apiKey) {
    console.error("ERROR: 未找到文本模型 Key。设置 TEXT_API_KEY 或 AGNES_API_KEY，或用 --api-key 注入。");
    process.exit(1);
  }
  const baseUrl = (args.baseUrl || process.env.TEXT_BASE_URL || process.env.AGNES_BASE_URL || "https://api.agnes-ai.cn/v1").replace(/\/+$/, "");
  const model = args.model || process.env.TEXT_MODEL || "agnes-3.0-flash";

  console.log(`主题：${args.topic}`);
  console.log(`角度数：${args.count} ｜ 模型：${model} ｜ 知识库：scripts/kb/（framework/triggers/styles/hot）`);

  const prompt = buildPrompt(args.topic, args.count, args.voice);
  let drafts = null;
  for (let round = 1; round <= 3 && !drafts; round++) {
    try {
      const text = await chat({ apiKey, baseUrl, model, messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ] });
      drafts = extractJsonArray(text);
      if (!Array.isArray(drafts) || drafts.length === 0) throw new Error("空数组");
    } catch (e) {
      console.error(`第 ${round} 轮解析失败：${String(e.message).slice(0, 160)}`);
      if (round === 3) process.exit(1);
    }
  }

  // 输出
  const outDir = args.out || path.join(process.cwd(), "talkshow-studio-kling", "out", "drafts", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "drafts.json"), JSON.stringify(drafts, null, 2), "utf-8");
  fs.writeFileSync(path.join(outDir, "drafts.md"), renderMarkdown(drafts, args.topic), "utf-8");

  console.log("\n===== 5 角度出稿完成 =====");
  drafts.forEach((d, i) => {
    const est = productionEstimate(d.script || "");
    console.log(`${i + 1}. 【${d.angle}】${d.title || "(无标题)"} ｜ ${d.framework} ｜ ${(d.triggers || []).join("+")} ｜ ~${d.estimated_seconds}s ｜ ${d.difficulty} ｜ ${est.shots} 镜`);
  });
  console.log(`\n输出目录：${outDir}`);
  console.log("  drafts.json（机器可读）/ drafts.md（人类可读，供选稿）");
  console.log("下一步：用户选稿 → script 全文存 txt → talkshow_produce.js --script-file 制作。");
}

main().catch((e) => {
  console.error("FATAL: " + e.message);
  process.exit(1);
});
