#!/usr/bin/env node
/**
 * md2pdf - Markdown 批量转 PDF（零 npm 依赖）
 *
 * 链路：marked(内置 UMD) → 注入排版 CSS → Chrome/Edge 无头打印 PDF
 * 设计目标：中文技术文档（表格多、代码多、SVG 图多）零样式丢失、零格式错乱。
 *
 * 用法：
 *   node md2pdf.mjs a.md b.md                        # 输出到源文件同目录
 *   node md2pdf.mjs docs -o out                      # 目录递归（保留子目录结构）
 *   node md2pdf.mjs a.md --theme dark --paper A3
 *   node md2pdf.mjs a.md --keep-html                 # 保留中间 HTML 便于排查
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const VERSION = '2.0.0';

const MARKED_PATH = path.join(__dirname, '..', 'assets', 'marked.umd.js');
if (!fs.existsSync(MARKED_PATH)) {
  console.error(`[md2pdf] 缺少内置依赖：${MARKED_PATH}`);
  process.exit(2);
}
const { Marked } = require(MARKED_PATH);

// ─────────────────────────────────────────────
// 参数解析
// ─────────────────────────────────────────────
const argv = process.argv.slice(2);
const opts = {
  out: null,
  theme: 'light',
  keepHtml: false,
  headerFooter: false,
  paper: 'A4',
  browser: null,
  quiet: false,
  fontChain: null,
};
const inputs = [];

const PAPERS = {
  A4: 'A4',
  LETTER: 'Letter',
  A3: 'A3',
  LEGAL: 'Legal',
};

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-o' || a === '--out') opts.out = need(argv[++i], a);
  else if (a === '--theme') opts.theme = need(argv[++i], a);
  else if (a === '--paper') opts.paper = need(argv[++i], a);
  else if (a === '--browser') opts.browser = need(argv[++i], a);
  else if (a === '--font-chain') opts.fontChain = need(argv[++i], a);
  else if (a === '--keep-html') opts.keepHtml = true;
  else if (a === '--quiet') opts.quiet = true;
  else if (a === '--header-footer') opts.headerFooter = true;
  else if (a === '-v' || a === '--version') { console.log(`md2pdf ${VERSION}`); process.exit(0); }
  else if (a === '-h' || a === '--help') { printHelp(); process.exit(0); }
  else if (a.startsWith('-')) { console.error(`[md2pdf] 未知参数：${a}\n用 --help 查看全部参数`); process.exit(2); }
  else inputs.push(a);
}

function need(v, flag) {
  if (v === undefined || v.startsWith('-')) {
    console.error(`[md2pdf] ${flag} 需要一个值`);
    process.exit(2);
  }
  return v;
}

if (!inputs.length) { printHelp(); process.exit(2); }
if (!['light', 'dark'].includes(opts.theme)) {
  console.error('[md2pdf] --theme 只支持 light / dark');
  process.exit(2);
}
if (!PAPERS[opts.paper.toUpperCase()]) {
  console.error(`[md2pdf] --paper 不支持 "${opts.paper}"，可选：${Object.keys(PAPERS).join(' / ')}`);
  process.exit(2);
}

function printHelp() {
  console.log(`md2pdf ${VERSION} — Markdown 转 PDF（保留表格/代码/SVG/告警块/脚注）

用法:
  node md2pdf.mjs <文件或目录...> [选项]

选项:
  -o, --out <dir>        输出目录（默认写回源文件同目录；递归转换时保留子目录结构）
      --theme <t>        light（默认）| dark
      --paper <p>        A4（默认）| Letter | A3 | Legal
      --browser <path>   指定 Chrome/Edge 可执行文件
      --font-chain <css> 覆盖中文字体链（默认自动挑选可矢量嵌入的字体）
      --header-footer    打印页码页眉（默认关闭；用 CSS 页边框，不含本地路径）
      --keep-html        保留中间 HTML 文件（调试样式用）
      --quiet            安静模式
  -v, --version          显示版本
  -h, --help             显示帮助

支持的后缀: .md .markdown .mdown .mkd
退出码: 0 全部成功 / 1 有失败项 / 2 参数或环境错误`);
}

// ─────────────────────────────────────────────
// 浏览器探测
// ─────────────────────────────────────────────
function findBrowser() {
  if (opts.browser) {
    if (!fs.existsSync(opts.browser)) throw new Error(`指定的浏览器不存在：${opts.browser}`);
    return opts.browser;
  }
  const env = process.env;
  const candidates = process.platform === 'win32'
    ? [
        env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
        env['ProgramFiles'] && path.join(env['ProgramFiles'], 'Google/Chrome/Application/chrome.exe'),
        env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe'),
        env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'),
        env['ProgramFiles'] && path.join(env['ProgramFiles'], 'Microsoft/Edge/Application/msedge.exe'),
      ]
    : process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];

  for (const c of candidates) if (c && fs.existsSync(c)) return c;

  // 退回 PATH 查找
  const which = process.platform === 'win32' ? 'where' : 'which';
  for (const exe of ['chrome', 'google-chrome', 'chromium', 'msedge']) {
    const r = spawnSync(which, [exe], { encoding: 'utf-8' });
    if (r.status === 0) {
      const found = r.stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
      if (found && fs.existsSync(found)) return found;
    }
  }
  throw new Error('未找到 Chrome/Edge。请用 --browser 指定可执行文件路径。');
}

// ─────────────────────────────────────────────
// 字体链：优先「静态字体」，避开可变字体
//
// Chrome 无法把可变字体（variable font，sfnt 表目录里有 fvar 表）作为 Type0
// 子集嵌入，会退化成逐字 Type3 位图：文字仍可搜索，但放大发糊、体积暴涨
// （实测同一份文档 200KB vs 85KB）。Noto Sans SC 与 Cascadia Mono 在 Windows
// 上常以可变字体分发，因此必须探测表目录，而不是只看文件名。
// ─────────────────────────────────────────────
function fontDirs() {
  const home = os.homedir ? os.homedir() : '';
  return [
    process.env.WINDIR && path.join(process.env.WINDIR, 'Fonts'),
    '/System/Library/Fonts',
    '/Library/Fonts',
    home && path.join(home, 'Library/Fonts'),
    '/usr/share/fonts',
    '/usr/local/share/fonts',
    home && path.join(home, '.local/share/fonts'),
  ].filter((d) => d && fs.existsSync(d));
}

// 读取 sfnt 表目录，判断是否含 fvar（可变字体）
function isVariableFont(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(12);
    if (fs.readSync(fd, head, 0, 12, 0) < 12) return false;
    const tag = head.readUInt32BE(0);
    let offset = 0;
    if (tag === 0x74746366) {            // ttcf：集合文件，取第一个字体
      const b = Buffer.alloc(4);
      if (fs.readSync(fd, b, 0, 4, head.readUInt32BE(8)) < 4) return false;
      offset = b.readUInt32BE(0);
    } else if (![0x00010000, 0x4f54544f, 0x74727565, 0x774f4646].includes(tag)) {
      return false;                      // 不是可解析的 sfnt
    }
    const dirHead = Buffer.alloc(12);
    if (fs.readSync(fd, dirHead, 0, 12, offset) < 12) return false;
    const numTables = dirHead.readUInt16BE(4);
    if (!numTables || numTables > 200) return false;
    const dir = Buffer.alloc(numTables * 16);
    if (fs.readSync(fd, dir, 0, dir.length, offset + 12) < dir.length) return false;
    for (let i = 0; i < numTables; i++) {
      if (dir.slice(i * 16, i * 16 + 4).toString('latin1') === 'fvar') return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// family = CSS 家族名；re = 文件名特征
const SANS_FAMILIES = [
  { fam: 'Microsoft YaHei', re: /^msyh/i },
  { fam: 'HarmonyOS Sans SC', re: /^harmonyos_sans_sc/i },
  { fam: 'Source Han Sans SC', re: /^sourcehansans|^source han sans/i },
  { fam: 'PingFang SC', re: /^pingfang/i },
  { fam: 'SimHei', re: /^simhei/i },
  { fam: 'Noto Sans SC', re: /^notosanssc/i },
  { fam: 'SimSun', re: /^simsun/i },
];
const MONO_FAMILIES = [
  { fam: 'Consolas', re: /^consol/i },
  { fam: 'Cascadia Mono', re: /^cascadiamono/i },
  { fam: 'DejaVu Sans Mono', re: /^dejavusansmono|^dejavu sans mono/i },
  { fam: 'Menlo', re: /^menlo/i },
];

// 收集「存在且非可变」的家族
function pickStaticFamilies(families) {
  const hit = new Set();
  for (const dir of fontDirs()) {
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch { continue; }
    for (const name of entries) {
      if (!/\.(ttf|otf|ttc)$/i.test(name)) continue;
      for (const { fam, re } of families) {
        if (hit.has(fam) || !re.test(name)) continue;
        if (!isVariableFont(path.join(dir, name))) hit.add(fam);
      }
    }
  }
  return families.filter(({ fam }) => hit.has(fam)).map(({ fam }) => `"${fam}"`);
}

function detectFontChain() {
  if (opts.fontChain) return opts.fontChain;
  const chain = pickStaticFamilies(SANS_FAMILIES);
  // 一个都没探测到（非 Windows/字体目录不可读）时，保留原始链交给浏览器回落
  if (!chain.length) chain.push('"Source Han Sans SC"', '"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"');
  chain.push('sans-serif');
  return chain.join(', ');
}

function detectMonoChain() {
  const chain = pickStaticFamilies(MONO_FAMILIES);
  chain.push('monospace');
  return chain.join(', ');
}

// ─────────────────────────────────────────────
// YAML front matter：不剥离会被解析成 <hr> + <h2> 噪声
// ─────────────────────────────────────────────
function stripFrontMatter(md) {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(md);
  return m ? md.slice(m[0].length) : md;
}

// 围栏代码块与行内代码整体跳过，正文才交给 fn 处理。
// 两种代码用同一条正则一次扫完：若分两步替换，前一个代码块的开头可能与
// 后一个代码块的结尾错配成一对，把中间的正文误当成代码。
const CODE_SPANS = /(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[ \t]*|(`+)(?:[^`]|(?!\2)`)*?\2(?=[^\w`]|$)/g;

function outsideCode(md, fn) {
  let out = '';
  let last = 0;
  CODE_SPANS.lastIndex = 0;
  let m;
  while ((m = CODE_SPANS.exec(md)) !== null) {
    out += fn(md.slice(last, m.index));
    out += m[0];
    last = m.index + m[0].length;
  }
  return out + fn(md.slice(last));
}

// ─────────────────────────────────────────────
// 未编码空格的路径：CommonMark 规定目的地含空格时必须用 <> 包裹，
// 否则 `![点位](assets/点位 图.png)` 整段会被当成普通文本输出（图片直接丢失）。
// 中文文件名里带空格很常见，这里自动补上 <>，并保留原有的 title 语法。
// 只处理「看起来像路径」的目的地（含 / 或 \ 或扩展名），避免误伤 [TODO] 与 (a b) 这类正文。
// ─────────────────────────────────────────────
const DEST_WITH_SPACE = /(!?\[[^\]]*\])\(([^<>\s][^()<>]*(?:[ \t]+[^()<>]*)+)\)/g;
const PATHLIKE = /[/\\]|\.\w{1,6}$/;
const TITLE_TAIL = /^([\s\S]*?)\s+("[^"]*"|'[^']*'|\([^)]*\))$/;

function quoteSpacedDestinations(md) {
  return outsideCode(md, (chunk) => chunk.replace(DEST_WITH_SPACE, (whole, label, dest) => {
    const trimmed = dest.trim();
    if (!PATHLIKE.test(trimmed)) return whole;
    const t = TITLE_TAIL.exec(trimmed);
    if (t && PATHLIKE.test(t[1].trim())) return `${label}(<${t[1].trim()}> ${t[2]})`;
    return `${label}(<${trimmed}>)`;
  }));
}

// ─────────────────────────────────────────────
// 脚注：内置 marked v18 不支持，`[^1]: 文本` 会被当成链接定义、
// `[^1]` 会被解析成指向该文本的 <a>，两处内容一起丢失。这里先摘出定义、
// 把引用换成 HTML 上标，正文末尾再补回脚注区。
// ─────────────────────────────────────────────
const FN_DEF = /^\[\^([^\]\s]+)\]:[ \t]+(.*)$/;
const FN_REF = /\[\^([^\]\s]+)\](?!\()/g;

function extractFootnotes(md) {
  const notes = [];
  const byId = new Map();
  const kept = [];
  const lines = md.split(/\r?\n/);
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^(```|~~~)/.test(line.trim())) { inFence = !inFence; kept.push(line); continue; }
    const m = inFence ? null : FN_DEF.exec(line);
    if (!m) { kept.push(line); continue; }

    const id = m[1].trim();
    let text = m[2];
    while (i + 1 < lines.length && /^[ \t]{2,}\S/.test(lines[i + 1])) text += '\n' + lines[++i].trim();
    if (!byId.has(id)) { byId.set(id, true); notes.push({ id, text }); }
  }

  if (!notes.length) return { md, notes: [] };

  const body = outsideCode(kept.join('\n'), (chunk) =>
    chunk.replace(FN_REF, (_, id) => {
      const n = notes.findIndex((x) => x.id === id.trim());
      if (n < 0) return `[^${id}]`;
      return `<sup class="fnref" id="fnref-${n + 1}"><a href="#fn-${encodeURIComponent(id.trim())}">${n + 1}</a></sup>`;    }));

  return { md: body, notes };
}

function buildFootnoteBlock(notes) {
  if (!notes.length) return '';
  const items = notes
    .map(({ id, text }, n) => {
      const back = `<a class="fnback" href="#fnref-${n + 1}" title="返回正文">↩</a>`;
      return `<li id="fn-${encodeURIComponent(id)}">${markedInstance.parseInline(text)} ${back}</li>`;
    })
    .join('\n');
  return `\n<hr class="fn-rule">\n<section class="footnotes">\n<h2 class="fn-title">脚注</h2>\n<ol>\n${items}\n</ol>\n</section>\n`;
}

// ─────────────────────────────────────────────
// GitHub 告警块 → 带徽标与配色的提示框
//
// 只声明一个主色 hue，浅/深两套配色由它派生：直接把浅色的淡彩背景搬到暗色
// 主题上会让正文糊成一片（实测暗色下「伺服电机飞车…」几乎不可读）。
// ─────────────────────────────────────────────
const ALERT_TYPES = {
  note:      { hue: '#8b949e', label: 'i',  zh: '说明' },
  tip:       { hue: '#2da44e', label: '!',  zh: '提示' },
  important: { hue: '#a371f7', label: '!',  zh: '重要' },
  warning:   { hue: '#d4a72c', label: '!',  zh: '注意' },
  caution:   { hue: '#f85149', label: 'X',  zh: '警告' },
  todo:      { hue: '#54aeff', label: 'T',  zh: '待办' },
  summary:   { hue: '#1a6fb5', label: 'S',  zh: '速览' },
  example:   { hue: '#b39ddb', label: 'E',  zh: '示例' },
  abstract:  { hue: '#54aeff', label: 'A',  zh: '摘要' },
  question:  { hue: '#a371f7', label: '?',  zh: '问题' },
  success:   { hue: '#2da44e', label: 'OK', zh: '成功' },
  failure:   { hue: '#f85149', label: 'X',  zh: '失败' },
  bug:       { hue: '#f85149', label: 'B',  zh: '缺陷' },
};

function hexToRgb(h) {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}

// amount=1 时完全偏向 to
function mixHex(a, b, amount) {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  return '#' + ca.map((v, i) => Math.round(v + (cb[i] - v) * amount).toString(16).padStart(2, '0')).join('');
}

function alertPalette(hue, dark, bg) {
  return dark
    ? { fg: mixHex(hue, '#ffffff', 0.42), box: mixHex(hue, bg, 0.86), border: mixHex(hue, '#ffffff', 0.12), badgeText: '#0d1117' }
    : { fg: mixHex(hue, '#1a1a1a', 0.38), box: mixHex(hue, '#ffffff', 0.9), border: hue, badgeText: '#ffffff' };
}

// 每种告警类型生成一组按主题派生的配色
function alertCss(dark, bg) {
  return Object.entries(ALERT_TYPES)
    .map(([name, { hue }]) => {
      const p = alertPalette(hue, dark, bg);
      return `.alert-${name} { border-left-color: ${p.border}; background: ${p.box}; }
.alert-${name} .alert-title { color: ${p.fg}; }
.alert-${name} .alert-badge { background: ${p.border}; color: ${p.badgeText}; }`;
    })
    .join('\n');
}

const ALERT_BLOCK = /^>[ \t]*\[!(\w+)\][ \t]*([^\n]*)(?:\n([\s\S]*?))?(?:\n{2,}|$)/;

// 去掉每行的引用标记，让内层正文继续走正常词法；
// `> >` 只剥一层，嵌套引用因此仍然正确。
function unquote(raw) {
  return raw.split('\n').map((l) => l.replace(/^>[ \t]?/, '')).join('\n');
}

// 以 marked 扩展实现，而不是事后正则扫 HTML：
// 扫 HTML 会在嵌套引用里切坏标签，事后裁剪 token 又要重建段落结构。
// 配色不写进行内样式，交给 buildCss 按主题生成，暗色才不会继承浅色的淡彩底。
const alertExtension = {
  name: 'alertBlock',
  level: 'block',
  start(src) {
    const i = src.indexOf('>');
    return i >= 0 && ALERT_BLOCK.test(src.slice(i)) ? i : undefined;
  },
  tokenizer(src) {
    const m = ALERT_BLOCK.exec(src);
    if (!m) return undefined;
    const alertType = m[1].toLowerCase();
    if (!ALERT_TYPES[alertType]) return undefined;
    const body = m[3] ? unquote(m[3]) : '';
    return { type: 'alertBlock', raw: m[0], alertType, title: m[2].trim(), tokens: this.lexer.blockTokens(body, []) };
  },
  renderer(token) {
    const cfg = ALERT_TYPES[token.alertType];
    return `<div class="alert alert-${token.alertType}">`
      + `<p class="alert-title"><span class="alert-badge">${cfg.label}</span>${esc(token.title || cfg.zh)}</p>`
      + `${this.parser.parse(token.tokens)}</div>\n`;
  },
};

// ─────────────────────────────────────────────
// 标题锚点：marked 默认不生成 id，目录里的 [章节](#章节) 全是死链
// ─────────────────────────────────────────────
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;/gi, '')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/\s+/g, '-')
    || 'section';
}

function uniqueSlug(base, used) {
  let s = base;
  let n = 1;
  while (used.has(s)) s = `${base}-${n++}`;
  used.add(s);
  return s;
}

// ─────────────────────────────────────────────
// 相对路径 → 绝对 file:// 路径
// 只处理「无协议、非锚点」的链接，保留 #fragment，不误伤 //cdn 与 /abs
//
// 危险协议必须拦：内置 marked v18 不做 URL 清洗（实测 javascript:/vbscript:/
// data:text/html 原样输出），而本技能又自定义了 link/image renderer，
// 等于少了一层保护。文档可能来自不可信来源，转出的 PDF 会被点开。
// ─────────────────────────────────────────────
const DANGEROUS_SCHEME = /^\s*(?:javascript|vbscript|livescript|mocha|data:text\/html|data:application\/x-javascript)/i;

function safeHref(raw, baseDir) {
  if (raw && DANGEROUS_SCHEME.test(raw)) return '';
  return resolveHref(raw, baseDir);
}

function resolveHref(raw, baseDir) {
  if (!raw) return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;   // http/https/file/mailto…
  if (raw.startsWith('#')) return raw;                 // 页内锚点
  if (raw.startsWith('//')) return raw;                // 协议相对

  let file = raw;
  let frag = '';
  const h = raw.indexOf('#');
  if (h >= 0) { file = raw.slice(0, h); frag = raw.slice(h); }

  let decoded = file;
  try { decoded = decodeURIComponent(file); } catch { /* 非法百分号编码，按原文处理 */ }
  if (!decoded) return raw;
  return pathToFileURL(path.resolve(baseDir, decoded)).href + frag;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// CSS 字符串字面量转义：文件名里的 " \ 与换行不能破坏 content: "..."
function cssString(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────
// 排版样式
// ─────────────────────────────────────────────
function buildCss(theme, paper, fontChain, monoChain, headerFooter, docTitle) {
  const dark = theme === 'dark';
  const c = dark
    ? { bg: '#0f1115', text: '#e6edf3', head: '#e6edf3', head2: '#9ecbff', accent: '#4aa8ff', border: '#30363d',
        tableBg: '#161b22', thBg: '#1c2330', evenBg: '#131920', codeBg: '#161b22', preBg: '#0d1117',
        quoteBg: '#111a25', quoteText: '#a9bdd3', muted: '#8b949e' }
    : { bg: '#ffffff', text: '#24292f', head: '#1a3a5c', head2: '#1a3a5c', accent: '#1a6fb5', border: '#d0d7de',
        tableBg: '#ffffff', thBg: '#eef3f8', evenBg: '#f8fafc', codeBg: '#f0f2f5', preBg: '#f6f8fa',
        quoteBg: '#f2f7fc', quoteText: '#33506d', muted: '#57606a' };

  // 页边距交给 @page，正文不再用 padding 顶开：这样页眉页脚落在页边区，
  // 不会像 margin:0 + body padding 那样与内容重叠。
  // 标题直接写进 content 字符串：Chrome 的 string-set 只在元素所在页生效，
  // 且元素一旦被隐藏就完全不生效，实测不可靠。
  const pageMargin = '17mm 15mm 19mm 15mm';
  const marginBoxes = headerFooter
    ? `
  @bottom-center { content: counter(page) " / " counter(pages); font-size: 8pt; color: ${c.muted}; font-family: ${fontChain}; }
  @top-right { content: "${cssString(docTitle)}"; font-size: 8pt; color: ${c.muted}; font-family: ${fontChain}; }`
    : '';

  return `
@page { size: ${PAPERS[paper.toUpperCase()]}; margin: ${pageMargin};${marginBoxes} }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { background: ${c.bg}; }
body {
  font-family: ${fontChain};
  font-size: 10.5pt; line-height: 1.75; color: ${c.text};
  margin: 0; padding: 0; max-width: 100%;
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3, h4, h5, h6 { font-weight: 700; line-height: 1.35; color: ${c.head}; }
h1 {
  font-size: 21pt; margin: 0 0 16px; padding-bottom: 8px;
  border-bottom: 3px solid ${c.accent};
}
h2 {
  font-size: 15.5pt; color: ${c.head2}; margin: 26px 0 12px; padding-bottom: 6px;
  border-bottom: 2px solid ${c.border}; page-break-after: avoid; break-after: avoid;
}
h3 { font-size: 12.8pt; margin: 20px 0 9px; page-break-after: avoid; break-after: avoid; }
h4 { font-size: 11.2pt; margin: 16px 0 7px; page-break-after: avoid; break-after: avoid; }
h5, h6 { font-size: 10.5pt; margin: 12px 0 6px; page-break-after: avoid; }
p { margin: 7px 0; orphans: 3; widows: 3; }
img { max-width: 100%; height: auto; display: block; margin: 12px auto; page-break-inside: avoid; break-inside: avoid; }
a { color: ${c.accent}; text-decoration: none; word-break: break-word; }
strong { color: ${c.head}; }
hr { border: none; border-top: 1px solid ${c.border}; margin: 18px 0; }

table {
  border-collapse: collapse; width: 100%; margin: 11px 0;
  font-size: 8.8pt; line-height: 1.6; table-layout: auto;
}
th, td {
  border: 1px solid ${c.border}; padding: 4px 7px; text-align: left;
  vertical-align: top; word-break: break-word; overflow-wrap: anywhere;
}
th { background: ${c.thBg}; font-weight: 700; white-space: nowrap; }
tr:nth-child(even) td { background: ${c.evenBg}; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; break-inside: avoid; }

code {
  font-family: ${monoChain};
  font-size: 0.88em; background: ${c.codeBg}; padding: 1px 4px; border-radius: 3px;
  word-break: break-word;
}
pre {
  background: ${c.preBg}; border: 1px solid ${c.border}; border-radius: 6px;
  padding: 10px 12px; margin: 10px 0;
  page-break-inside: avoid; break-inside: avoid;
  overflow-x: hidden; white-space: pre-wrap; word-break: break-word;
}
pre code {
  background: none; padding: 0; border-radius: 0;
  font-size: 8.3pt; line-height: 1.5; word-break: break-word;
}

blockquote {
  border-left: 4px solid ${c.accent}; background: ${c.quoteBg};
  margin: 10px 0; padding: 8px 14px; color: ${c.quoteText};
  page-break-inside: avoid; break-inside: avoid;
}
blockquote p { margin: 4px 0; }

.alert {
  margin: 11px 0; padding: 8px 14px; border-radius: 0 6px 6px 0;
  border-left: 4px solid; page-break-inside: avoid; break-inside: avoid;
}
.alert-title { margin: 0 0 5px; font-weight: 700; font-size: 10pt; }
.alert-badge {
  display: inline-block; min-width: 13px; height: 13px; line-height: 13px;
  margin-right: 6px; padding: 0 2px; border-radius: 50%;
  font-size: 8.5pt; font-weight: 700; text-align: center;
  vertical-align: 1px;
}
.alert p { margin: 4px 0; }
${alertCss(dark, c.bg)}

ul, ol { margin: 7px 0; padding-left: 22px; }
li { margin: 3px 0; }
li > ul, li > ol { margin: 3px 0; }
.task-list-item { list-style: none; }
input[type="checkbox"] { margin-right: 6px; }

.fnref { font-size: 0.75em; vertical-align: super; line-height: 0; }
.fn-rule { margin: 26px 0 10px; }
.footnotes { font-size: 9pt; color: ${c.muted}; }
.footnotes .fn-title { font-size: 11pt; border-bottom: 1px solid ${c.border}; }
.footnotes li { margin: 4px 0; }
.fnback { text-decoration: none; margin-left: 4px; }

.diagram-note { font-size: 9pt; color: ${c.muted}; text-align: center; margin: -4px 0 12px; }
`;
}

// ─────────────────────────────────────────────
// marked 实例（含 renderer / tokenizer 覆盖）
// ─────────────────────────────────────────────
let fontChainCache = null;
let monoChainCache = null;

function makeMarked(baseDir, usedSlugs) {
  const m = new Marked({ gfm: true, breaks: false, pedantic: false });
  m.use({ extensions: [alertExtension] });
  m.use({
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const plain = this.parser.parseInline(tokens, this.parser.textRenderer);
        const id = uniqueSlug(slugify(plain), usedSlugs);
        return `<h${depth} id="${id}">${html}</h${depth}>\n`;
      },
      image({ href, title, text, tokens }) {
        const alt = tokens ? this.parser.parseInline(tokens, this.parser.textRenderer) : text;
        let out = `<img src="${esc(safeHref(href, baseDir))}" alt="${esc(alt)}"`;
        if (title) out += ` title="${esc(title)}"`;
        return out + '>';
      },
      link({ href, title, text, tokens, autolink }) {
        const label = autolink ? esc(text) : this.parser.parseInline(tokens);
        let out = `<a href="${esc(safeHref(href, baseDir))}"`;
        if (title) out += ` title="${esc(title)}"`;
        return out + `>${label}</a>`;
      },
    },
    tokenizer: {
      // 只承认成对 ~~ 为删除线。单个 ~ 在中文技术文档里是区间符（60~90 h、1~2 ms），
      // 交给 GFM 会被划掉并错位。
      del(src) {
        if (src.charCodeAt(0) !== 126) return undefined;
        const open = /^~{2,}/.exec(src);
        if (!open) return undefined;
        const rest = src.slice(open[0].length);
        const close = rest.indexOf(open[0]);
        if (close < 0 || !rest.slice(0, close)) return undefined;
        const text = rest.slice(0, close);
        return { type: 'del', raw: open[0] + text + open[0], text, tokens: this.lexer.inlineTokens(text, []) };
      },
    },
  });
  return m;
}

const markedInstance = new Marked({ gfm: true });

// ─────────────────────────────────────────────
// 单文件转换
// ─────────────────────────────────────────────
function convertOne(mdPath, outDir, browser, outName) {
  const absMd = path.resolve(mdPath);
  const baseDir = path.dirname(absMd);
  const raw = fs.readFileSync(absMd, 'utf-8').replace(/^﻿/, '');

  const title = path.basename(absMd, path.extname(absMd));
  const stem = outName || title;
  const usedSlugs = new Set();
  const m = makeMarked(baseDir, usedSlugs);

  let md = stripFrontMatter(raw);
  md = quoteSpacedDestinations(md);
  const fn = extractFootnotes(md);
  let htmlBody = m.parse(fn.md, { async: false });
  htmlBody += buildFootnoteBlock(fn.notes);

  const doc = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">`
    + `<title>${esc(title)}</title>`
    + `<style>${buildCss(opts.theme, opts.paper, fontChainCache, monoChainCache, opts.headerFooter, title)}</style></head>`
    + `<body>${htmlBody}</body></html>`;

  fs.mkdirSync(outDir, { recursive: true });
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md2pdf-'));
  const htmlPath = path.join(workDir, 'doc.html');
  fs.writeFileSync(htmlPath, doc, 'utf-8');
  if (opts.keepHtml) fs.copyFileSync(htmlPath, path.join(outDir, `${stem}.html`));

  const pdfPath = path.join(outDir, `${stem}.pdf`);
  const flags = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--disable-extensions',
    '--virtual-time-budget=60000',
    '--run-all-compositor-stages-before-draw',
    // 始终抑制原生页眉页脚：它会打印本地 file:// 路径与时间戳。
    // 需要页码时由 CSS @page 页边框提供。
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ];

  const r = spawnSync(browser, flags, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
  fs.rmSync(workDir, { recursive: true, force: true });

  if (!fs.existsSync(pdfPath)) {
    const err = (r.stderr || '').toString().slice(0, 800);
    throw new Error(`PDF 生成失败（exit ${r.status}）：${err || '浏览器未产出文件，可尝试 --browser 指定其他内核'}`);
  }
  const kb = Math.round(fs.statSync(pdfPath).size / 1024);
  if (!/\S/.test(htmlBody.replace(/<[^>]*>/g, ''))) {
    console.warn(`  ! ${title}：源文件没有正文内容，生成的 PDF 只有空白页`);
  }
  const missing = checkLocalResources(htmlBody);
  for (const p of missing) console.warn(`  ! ${title}：图片不存在 → ${p}`);
  return { kb, missing };
}

// 图片加载失败时 Chrome 只在 PDF 里留下 alt 文本，verify_pdf.py 无法据此判断，
// 因此在转换阶段直接核对本地资源是否存在。
function checkLocalResources(html) {
  const missing = [];
  for (const m of html.matchAll(/<img[^>]+src="file:\/\/\/([^"]+)"/g)) {
    let p;
    try { p = decodeURIComponent(m[1].split('#')[0].split('?')[0]); } catch { continue; }
    if (process.platform === 'win32') p = p.replace(/^\/([A-Za-z]:)/, '$1');
    if (!fs.existsSync(p)) missing.push(p);
  }
  return [...new Set(missing)];
}

// ─────────────────────────────────────────────
// 输入展开（目录递归 + shell 未展开的通配符）
// 同时记录相对源根的路径，供 -o 保留目录结构、避免同名覆盖
// ─────────────────────────────────────────────
const MD_EXT = /\.(md|markdown|mdown|mkd)$/i;

function expandInputs(list) {
  const found = [];
  for (const raw of list) {
    if (raw.includes('*') || raw.includes('?')) {
      const dir = path.dirname(raw);
      const pat = path.basename(raw);
      const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      if (!fs.existsSync(dir)) { console.error(`  ! 通配符目录不存在：${dir}`); continue; }
      for (const f of fs.readdirSync(dir)) if (re.test(f) && MD_EXT.test(f)) found.push({ abs: path.join(dir, f), relDir: '' });
    } else if (fs.existsSync(raw) && fs.statSync(raw).isDirectory()) {
      const root = path.resolve(raw);
      (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) walk(p); }
          else if (MD_EXT.test(e.name)) found.push({ abs: p, relDir: path.relative(root, d) });
        }
      })(root);
    } else if (MD_EXT.test(raw)) {
      found.push({ abs: path.resolve(raw), relDir: '' });
    } else {
      console.error(`  ! 跳过非 Markdown 文件：${raw}`);
    }
  }

  const byAbs = new Map();
  for (const f of found) if (!byAbs.has(f.abs)) byAbs.set(f.abs, f);
  const kept = [...byAbs.values()].filter((f) => fs.existsSync(f.abs) && fs.statSync(f.abs).isFile());

  // 显式传入但扩展后消失的项，给出提示而不是静默丢弃
  for (const raw of list) {
    if (!raw.includes('*') && !raw.includes('?') && !fs.existsSync(raw)) console.error(`  ! 输入不存在：${raw}`);
  }
  return kept;
}

// ─────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────
const files = expandInputs(inputs);
if (!files.length) { console.error('[md2pdf] 未找到任何 Markdown 文件'); process.exit(1); }

let browser;
try {
  browser = findBrowser();
  fontChainCache = detectFontChain();
  monoChainCache = detectMonoChain();
} catch (e) {
  console.error(`[md2pdf] ${e.message}`);
  process.exit(2);
}

if (!opts.quiet) {
  console.log(`[md2pdf] 浏览器: ${browser}`);
  console.log(`[md2pdf] 字体链: ${fontChainCache}`);
  console.log(`[md2pdf] 等宽链: ${monoChainCache}`);
  console.log(`[md2pdf] 共 ${files.length} 个文件，主题: ${opts.theme}，纸张: ${PAPERS[opts.paper.toUpperCase()]}${opts.headerFooter ? '，含页码' : ''}`);
}

// 规划输出路径：-o 时保留源目录结构（不同子目录的同名文件不会互相覆盖）；
// 仍冲突（显式传入多个同名文件）时按「父目录名」后缀消歧，绝不静默丢内容。
function planOutputs(list) {
  const targets = new Map();
  const taken = new Map();

  for (const f of list) {
    const outDir = opts.out ? path.join(path.resolve(opts.out), f.relDir) : path.dirname(f.abs);
    const stem = path.basename(f.abs, path.extname(f.abs));
    let target = path.join(outDir, `${stem}.pdf`);

    if (taken.has(target)) {
      const parent = path.basename(path.dirname(f.abs)) || 'src';
      const alt = path.join(outDir, `${stem}-${parent}.pdf`);
      console.error(`[md2pdf] 输出名冲突：${taken.get(target)} 与 ${f.abs} 都想写成 ${path.basename(target)}，后者改名`);
      target = alt;
      let n = 2;
      while (taken.has(target)) target = path.join(outDir, `${stem}-${parent}-${n++}.pdf`);
    }
    taken.set(target, f.abs);
    targets.set(f.abs, target);
  }
  return targets;
}

const targets = planOutputs(files);

let ok = 0, fail = 0, missingTotal = 0;
for (const f of files) {
  const pdfPath = targets.get(f.abs);
  const outDir = path.dirname(pdfPath);
  try {
    const { kb, missing } = convertOne(f.abs, outDir, browser, path.basename(pdfPath, '.pdf'));
    ok++;
    missingTotal += missing.length;
    const note = missing.length ? `，缺 ${missing.length} 张图` : '';
    if (!opts.quiet) console.log(`  ✓ ${path.basename(f.abs)} → ${path.relative(process.cwd(), pdfPath) || pdfPath} (${kb} KB${note})`);
  } catch (e) {
    fail++;
    console.error(`  ✗ ${path.basename(f.abs)}: ${e.message}`);
  }
}

if (!opts.quiet) console.log(`\n[md2pdf] 完成：成功 ${ok}，失败 ${fail}${missingTotal ? `，缺失资源 ${missingTotal} 个` : ''}`);
else if (fail || missingTotal) console.error(`[md2pdf] 成功 ${ok}，失败 ${fail}${missingTotal ? `，缺失资源 ${missingTotal} 个` : ''}`);
process.exit(fail ? 1 : 0);
