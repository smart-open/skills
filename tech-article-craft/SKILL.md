---
name: "tech-article-craft"
description: "Generates a self-contained standalone HTML article with inline CSS/JS, images, and diagrams. Invoke when user asks to write/create a technical article or convert research into a published piece."
---

# Tech Article Craft

Produces a **single self-contained, standalone HTML file** for a publication-ready technical article. Each article is fully independent — no cross-article navigation, no shared CSS/JS, no external dependencies beyond CDNs. The output is ready to publish anywhere: a static host, a folder, an email attachment, or a single file share.

**Core principle**: One HTML file + one images folder. Move the folder, the article works. No site scaffolding required.

## When to Invoke

- User asks to "write an article" / "写一篇文章" about a technical topic
- User provides a draft/outline and asks to expand it into a full article
- User provides a source document and asks to "整理成技术文章"
- User asks to create a standalone, shareable, self-contained article

## Output Artifacts

| Artifact | Location | Naming |
|----------|----------|--------|
| Article HTML | `{output-dir}/{slug}/index.html` | Always `index.html` inside a slug folder |
| Hero image | `{output-dir}/{slug}/images/hero.jpg` | landscape_16_9, no hex codes in prompt |
| Inline images | `{output-dir}/{slug}/images/{section}.jpg` | landscape_4_3, natural language colors |
| SVG diagrams | Inline in HTML (preferred) or `images/{section}.svg` | Embedded when small |

**Why a folder instead of a flat file**: images stay as separate files to preserve full quality. The whole `{slug}/` folder is the unit of distribution — zip it, upload it, or host it as-is. The `index.html` inside references images via relative `images/xxx.jpg` paths, so it works without a server (open via `file://`).

If the user explicitly wants a **truly single file** (no images folder), convert images to base64 data URIs at the end (see Step 7).

## Full Workflow (7 Steps)

### Step 1: Research & Plan

1. If user provided a source document, read it fully (use offset/limit for >64KB files)
2. WebSearch for latest information on the topic (timely data, 2-5 queries)
3. WebFetch authoritative sources for full content
4. Plan article structure: 6-8 chapters, each with clear theme
5. Identify 3-4 points where inline images or diagrams would aid understanding
6. Decide a `{slug}` — short, kebab-case, English, derived from the topic (e.g. `physical-ai`, `ai-side-hustle`)

### Step 2: Generate Hero Image

Use GenerateImage tool with these rules:
- **Format**: `[PURPOSE]: [DETAILED DESCRIPTION]`
- **Size**: `landscape_16_9` (1280x720)
- **Path**: `{output-dir}/{slug}/images/hero`
- **CRITICAL**: Never use hex color codes (`#00f0ff`) in prompts — the image generator will render them as text labels. Use natural language: "cyan-blue", "deep black", "neon accent"
- **Style**: Dark cinematic, neural network / tech elements, no text/words/labels/watermarks/logos/UI-borders (see "Mandatory Prohibitions" below)
- If first generation has artifacts, regenerate with "(1)" suffix, then delete original and rename

### Step 3: Generate Inline Images

For each section that benefits from visualization:
- **Size**: `landscape_4_3` (1152x864)
- **Path**: `{output-dir}/{slug}/images/{section-name}`
- Same no-hex-code rule as hero image
- Same mandatory prohibitions (no logos, watermarks, UI borders, extraneous English) — see "Mandatory Prohibitions" in Image Generation Rules
- Each image should illustrate a specific concept, not be decorative

### Step 4: Generate Technical Diagrams

**Prefer pure HTML/CSS components** over SVG — they're responsive, editable, and match the article theme. Use SVG only for complex topologies, sequence diagrams, or network layouts. Never use Mermaid (rendering issues with Chinese text).

Available HTML/CSS components (all CSS is inlined in the article's `<style>`, definitions provided in the template below):
- `.arch-layer-stack` — layered architecture diagram
- `.skill-cards` / `.skill-card` — card grid layout
- `.hitl-flow` / `.hitl-stage` — process flow with arrows
- `.dataflow-pipeline` — data pipeline visualization
- `.impl-phases` — implementation phases grid
- `.cost-table` — comparison tables
- `.event-topics` — event-driven architecture grid
- `.pain-points` / `.pain-card` — problem analysis grid
- `.match-layers` — multi-layer matching engine
- `.router-flow` / `.router-node` — routing flow diagram
- `.skill-tiers` — tiered architecture
- `.compare-table` — feature comparison table with highlight
- `.code-block` — code/config examples with syntax highlighting
- `.callout` — highlighted info/warning box

If SVG is needed:
1. Classify diagram type (architecture, flowchart, sequence, etc.)
2. Plan layout — identify layers, nodes, edges
3. Write SVG using Python list method (prevents truncation)
4. Validate with `python3 -c "import xml.etree.ElementTree as ET; ET.parse('file.svg')"`
5. Embed inline via `<svg>` tag (not external file) to keep the article portable

### Step 5: Write Self-Contained Article HTML

**The article must be a single, standalone HTML file** with:
- All CSS inlined in a single `<style>` block in `<head>`
- All JS inlined in a single `<script>` block before `</body>`
- No external `.css` or `.js` file references (except Google Fonts CDN, which degrades gracefully)
- No reference to any `articles-data.js`, `article.js`, `main.js`, or other shared infrastructure
- No `<nav id="articleNav">` (articles are independent — no prev/next navigation)
- favicon as inline SVG data URI (no external favicon file)
- All image paths relative: `images/hero.jpg`, `images/{section}.jpg`

**Required HTML structure**:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{Article Title} - {Author Name}</title>
  <meta name="description" content="{1-2 sentence summary}">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><circle cx='32' cy='32' r='14' fill='%2300f0ff'/></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    /* ===== CSS Variables (dark theme) ===== */
    :root {
      --bg-primary: #0a0a0f;
      --bg-secondary: #12121a;
      --bg-tertiary: #1a1a25;
      --text-primary: #e8e8ec;
      --text-secondary: #7a7a85;
      --text-tertiary: #4a4a55;
      --accent: #00f0ff;
      --accent-dim: rgba(0, 240, 255, 0.15);
      --accent-glow: rgba(0, 240, 255, 0.35);
      --amber: #ffb347;
      --divider: #2a2a35;
      --success: #4ade80;
      --danger: #f87171;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
      --max-width: 1280px;
    }

    /* ===== Reset ===== */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; scroll-padding-top: 2rem; }
    body {
      font-family: var(--font-sans);
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.75;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }
    img { max-width: 100%; height: auto; display: block; }
    a { color: var(--accent); text-decoration: none; }

    /* ===== Hero ===== */
    .article-hero {
      position: relative;
      min-height: 68vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8rem 2rem 4rem;
      overflow: hidden;
    }
    .article-hero-bg {
      position: absolute; inset: 0;
      background-size: cover; background-position: center;
      filter: brightness(0.5) saturate(1.15) contrast(1.05);
      z-index: 0;
    }
    .article-hero-overlay {
      position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(10,10,15,0.35) 0%, rgba(10,10,15,0.72) 55%, rgba(10,10,15,0.98) 100%);
      z-index: 1;
    }
    .article-hero-content {
      position: relative; z-index: 2;
      max-width: var(--max-width); margin: 0 auto; width: 100%;
      text-align: center;
    }
    .article-title {
      font-size: clamp(2rem, 5vw, 3.6rem);
      font-weight: 700; line-height: 1.15;
      letter-spacing: -0.02em; margin-bottom: 1.5rem;
      background: linear-gradient(135deg, #ffffff 0%, var(--accent) 130%);
      -webkit-background-clip: text; background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .article-meta { display: flex; align-items: center; justify-content: center; gap: 1.5rem; flex-wrap: wrap; }
    .article-date { color: var(--text-secondary); font-family: var(--font-mono); font-size: 0.9rem; }
    .article-tags { display: flex; gap: 0.6rem; flex-wrap: wrap; }
    .tag {
      padding: 0.3rem 0.85rem;
      background: var(--accent-dim);
      border: 1px solid rgba(0, 240, 255, 0.3);
      border-radius: 20px; font-size: 0.8rem; color: var(--accent); font-weight: 500;
    }

    /* ===== Container & Sidebar ===== */
    .article-container {
      max-width: var(--max-width); margin: 0 auto;
      padding: 4rem 2rem 6rem;
      display: grid; grid-template-columns: 260px 1fr; gap: 4rem;
    }
    .article-sidebar {
      position: sticky; top: 2rem; align-self: start;
      max-height: calc(100vh - 4rem); overflow-y: auto;
      scrollbar-width: thin; scrollbar-color: var(--divider) transparent;
    }
    .article-sidebar::-webkit-scrollbar { width: 4px; }
    .article-sidebar::-webkit-scrollbar-thumb { background: var(--divider); border-radius: 2px; }
    .sidebar-section { margin-bottom: 2rem; }
    .sidebar-title {
      font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.15em;
      color: var(--text-tertiary); margin-bottom: 1rem; font-weight: 600;
    }
    .article-toc { list-style: none; }
    .article-toc li { margin-bottom: 0.35rem; }
    .article-toc a {
      display: block; padding: 0.4rem 0.8rem;
      color: var(--text-secondary); text-decoration: none; font-size: 0.88rem;
      border-left: 2px solid transparent; border-radius: 0 4px 4px 0;
      transition: all 0.2s ease; line-height: 1.5;
    }
    .article-toc a:hover { color: var(--accent); background: var(--accent-dim); }
    .article-toc a.active {
      color: var(--accent); border-left-color: var(--accent);
      background: var(--accent-dim); font-weight: 500;
    }

    /* ===== Content Typography ===== */
    .article-content { min-width: 0; }
    .markdown-body { max-width: 760px; }
    .markdown-body p { margin-bottom: 1.4rem; font-size: 1.02rem; }
    .markdown-body h2 {
      font-size: 1.85rem; font-weight: 700; letter-spacing: -0.01em;
      margin: 3.5rem 0 1.5rem; padding-bottom: 0.8rem;
      border-bottom: 1px solid var(--divider); position: relative;
    }
    .markdown-body h2::before {
      content: ''; position: absolute; bottom: -1px; left: 0;
      width: 60px; height: 2px; background: var(--accent);
    }
    .markdown-body h3 { font-size: 1.3rem; font-weight: 600; margin: 2.2rem 0 1rem; }
    .markdown-body strong { color: var(--accent); font-weight: 600; }
    .markdown-body a { border-bottom: 1px dashed rgba(0, 240, 255, 0.4); }
    .markdown-body a:hover { border-bottom-style: solid; }
    .markdown-body ul, .markdown-body ol { margin: 0 0 1.4rem 1.5rem; }
    .markdown-body li { margin-bottom: 0.6rem; }
    .markdown-body code {
      font-family: var(--font-mono); background: var(--bg-tertiary);
      padding: 0.15rem 0.45rem; border-radius: 4px; font-size: 0.88em;
      color: var(--amber); border: 1px solid var(--divider);
    }
    .markdown-body sup a { border-bottom: none; font-size: 0.78em; vertical-align: super; }
    .markdown-body .references { list-style: decimal; margin-left: 1.5rem; }
    .markdown-body .references li {
      font-size: 0.88rem; color: var(--text-secondary);
      word-break: break-all; margin-bottom: 0.8rem;
    }

    /* ===== Inline Images ===== */
    .article-inline-image { margin: 2.5rem 0; width: 100%; }
    .article-inline-image img {
      width: 100%; height: auto; border-radius: 12px;
      border: 1px solid var(--divider); display: block;
    }
    .article-inline-image figcaption {
      margin-top: 0.8rem; text-align: center;
      color: var(--text-secondary); font-size: 0.85rem; font-style: italic;
    }

    /* ===== Arch Layer Stack ===== */
    .arch-layer-stack { margin: 2.5rem 0; display: flex; flex-direction: column; gap: 0.75rem; }
    .arch-layer {
      background: var(--bg-secondary); border: 1px solid var(--divider);
      border-left: 3px solid var(--accent); border-radius: 8px;
      padding: 1.1rem 1.4rem;
      transition: transform 0.25s ease, border-left-color 0.25s ease;
    }
    .arch-layer:hover { transform: translateX(4px); border-left-color: var(--amber); }
    .arch-layer-title {
      font-family: var(--font-mono); font-size: 0.82rem; color: var(--accent);
      text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.35rem;
    }
    .arch-layer-desc { font-size: 0.95rem; line-height: 1.6; }

    /* ===== Skill Cards ===== */
    .skill-cards {
      margin: 2.5rem 0; display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;
    }
    .skill-card {
      background: var(--bg-secondary); border: 1px solid var(--divider);
      border-radius: 10px; padding: 1.3rem 1.2rem; transition: all 0.25s ease;
    }
    .skill-card:hover {
      border-color: var(--accent); transform: translateY(-3px);
      box-shadow: 0 8px 24px rgba(0, 240, 255, 0.1);
    }
    .skill-card-icon { font-family: var(--font-mono); font-size: 1.4rem; margin-bottom: 0.6rem; color: var(--accent); }
    .skill-card-title { font-weight: 600; font-size: 1rem; margin-bottom: 0.4rem; }
    .skill-card-desc { color: var(--text-secondary); font-size: 0.85rem; line-height: 1.55; }

    /* ===== Compare Table ===== */
    .compare-table {
      margin: 2.5rem 0; width: 100%; border-collapse: collapse;
      background: var(--bg-secondary); border-radius: 10px; overflow: hidden;
      border: 1px solid var(--divider); font-size: 0.92rem;
    }
    .compare-table th, .compare-table td { padding: 0.95rem 1.1rem; text-align: left; border-bottom: 1px solid var(--divider); }
    .compare-table th { background: var(--bg-tertiary); color: var(--accent); font-weight: 600; font-size: 0.85rem; letter-spacing: 0.04em; }
    .compare-table tbody tr:last-child td { border-bottom: none; }
    .compare-table tbody tr:hover { background: rgba(0, 240, 255, 0.04); }
    .compare-table .highlight { color: var(--accent); font-weight: 600; }
    .compare-table .check { color: var(--success); }
    .compare-table .cross { color: var(--danger); }

    /* ===== Code Block ===== */
    .code-block {
      margin: 2rem 0; background: var(--bg-secondary);
      border: 1px solid var(--divider); border-radius: 10px; overflow: hidden;
    }
    .code-block-header {
      display: flex; align-items: center; gap: 0.6rem;
      padding: 0.7rem 1.2rem; background: var(--bg-tertiary);
      border-bottom: 1px solid var(--divider);
    }
    .code-block-dots { display: flex; gap: 6px; }
    .code-block-dots span { width: 11px; height: 11px; border-radius: 50%; }
    .code-block-dots span:nth-child(1) { background: #ff5f56; }
    .code-block-dots span:nth-child(2) { background: #ffbd2e; }
    .code-block-dots span:nth-child(3) { background: #27c93f; }
    .code-block-title { font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-secondary); margin-left: 0.6rem; }
    .code-block pre {
      padding: 1.3rem 1.4rem; overflow-x: auto;
      font-family: var(--font-mono); font-size: 0.86rem; line-height: 1.7;
    }
    .code-block .kw { color: #c792ea; }
    .code-block .str { color: #c3e88d; }
    .code-block .num { color: var(--amber); }
    .code-block .com { color: var(--text-tertiary); font-style: italic; }
    .code-block .fn { color: var(--accent); }
    .code-block .var { color: #f78c6c; }

    /* ===== Pain Points ===== */
    .pain-points {
      margin: 2.5rem 0; display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;
    }
    .pain-card {
      background: var(--bg-secondary); border: 1px solid var(--divider);
      border-radius: 10px; padding: 1.3rem; border-left: 3px solid var(--amber);
    }
    .pain-card-title { font-weight: 600; font-size: 0.98rem; margin-bottom: 0.5rem; color: var(--amber); }
    .pain-card-desc { color: var(--text-secondary); font-size: 0.88rem; line-height: 1.6; }

    /* ===== Impl Phases ===== */
    .impl-phases {
      margin: 2.5rem 0; display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;
    }
    .impl-phase {
      background: var(--bg-secondary); border: 1px solid var(--divider);
      border-radius: 10px; padding: 1.2rem; border-top: 3px solid var(--accent);
    }
    .impl-phase-num { font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 0.4rem; }
    .impl-phase-title { font-weight: 600; font-size: 0.98rem; margin-bottom: 0.5rem; }
    .impl-phase-desc { color: var(--text-secondary); font-size: 0.85rem; line-height: 1.55; }

    /* ===== Skill Tiers ===== */
    .skill-tiers { margin: 2.5rem 0; display: flex; flex-direction: column; gap: 0.6rem; }
    .skill-tier {
      background: var(--bg-secondary); border: 1px solid var(--divider);
      border-radius: 8px; padding: 1rem 1.2rem;
      display: flex; align-items: center; gap: 1rem;
    }
    .skill-tier-level { font-family: var(--font-mono); font-size: 0.78rem; color: var(--accent); min-width: 60px; }
    .skill-tier-name { font-weight: 600; font-size: 0.95rem; min-width: 120px; }
    .skill-tier-desc { color: var(--text-secondary); font-size: 0.85rem; flex: 1; }

    /* ===== HITL Flow ===== */
    .hitl-flow { margin: 2.5rem 0; display: flex; align-items: stretch; gap: 0; flex-wrap: wrap; }
    .hitl-stage {
      flex: 1; min-width: 140px; background: var(--bg-secondary);
      border: 1px solid var(--divider); border-radius: 8px;
      padding: 1rem; text-align: center; position: relative; margin-right: 1.5rem;
    }
    .hitl-stage:last-child { margin-right: 0; }
    .hitl-stage::after {
      content: '→'; position: absolute; right: -1rem; top: 50%;
      transform: translateY(-50%); color: var(--accent); font-size: 1.2rem; font-weight: bold;
    }
    .hitl-stage:last-child::after { display: none; }
    .hitl-stage-title { font-family: var(--font-mono); font-size: 0.78rem; color: var(--accent); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.4rem; }
    .hitl-stage-desc { font-size: 0.85rem; color: var(--text-secondary); }

    /* ===== Callout ===== */
    .callout {
      margin: 2rem 0; padding: 1.2rem 1.5rem;
      background: linear-gradient(135deg, rgba(255, 179, 71, 0.08), rgba(0, 240, 255, 0.06));
      border: 1px solid rgba(255, 179, 71, 0.3);
      border-left: 3px solid var(--amber); border-radius: 8px;
    }
    .callout-title { font-family: var(--font-mono); font-size: 0.78rem; color: var(--amber); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.4rem; }
    .callout-text { font-size: 0.95rem; }
    .callout-text strong { color: var(--amber); }

    /* ===== Reading Progress + Back to Top (self-contained, rocket launch) ===== */
    .reading-progress {
      position: fixed; top: 0; left: 0; height: 3px; width: 0%;
      background: linear-gradient(90deg, var(--accent), var(--amber));
      z-index: 1100; transition: width 0.1s ease; box-shadow: 0 0 8px var(--accent-glow);
    }
    .back-to-top {
      position: fixed; bottom: 2rem; right: 2rem; width: 52px; height: 52px;
      background: var(--bg-secondary); border: 1px solid var(--divider);
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      cursor: pointer; opacity: 0; pointer-events: none; transition: opacity 0.3s ease, transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
      z-index: 900; overflow: visible;
    }
    .back-to-top svg { width: 24px; height: 24px; display: block; transition: transform 0.2s ease; overflow: visible; }
    .back-to-top.visible { opacity: 1; pointer-events: auto; }
    .back-to-top:hover { background: var(--accent-dim); border-color: var(--accent); transform: translateY(-3px); }
    .back-to-top:hover svg { transform: translateY(-2px); }

    /* Flame trail (pseudo element) — only visible during launch */
    .back-to-top::before {
      content: ''; position: absolute; left: 50%; top: 100%;
      width: 16px; height: 0; transform: translateX(-50%);
      background: linear-gradient(to bottom, #ff5f56 0%, #ffbd2e 40%, rgba(255,255,255,0.6) 75%, transparent 100%);
      border-radius: 0 0 50% 50%; filter: blur(2.5px);
      opacity: 0; pointer-events: none; transition: none;
    }

    /* Launch animation: rocket ignites, thrusts up, shakes, shrinks, fades */
    .back-to-top.launching { pointer-events: none; animation: rocket-launch 0.85s cubic-bezier(0.5, 0, 0.75, 0) forwards; }
    .back-to-top.launching::before { animation: rocket-flame 0.85s ease-out forwards; }
    .back-to-top.launching svg { animation: rocket-shake 0.85s ease-in-out; }

    @keyframes rocket-launch {
      0%   { transform: translateY(0) scale(1); opacity: 1; }
      15%  { transform: translateY(-6px) scale(1.08); opacity: 1; }
      35%  { transform: translateY(-24px) scale(1.12); opacity: 1; }
      60%  { transform: translateY(-90px) scale(0.95); opacity: 0.9; }
      85%  { transform: translateY(-220px) scale(0.7); opacity: 0.4; }
      100% { transform: translateY(-340px) scale(0.25); opacity: 0; }
    }
    @keyframes rocket-flame {
      0%   { height: 0; opacity: 0; width: 8px; }
      15%  { height: 14px; opacity: 0.7; width: 12px; }
      35%  { height: 28px; opacity: 1; width: 18px; }
      60%  { height: 44px; opacity: 1; width: 20px; }
      85%  { height: 30px; opacity: 0.6; width: 14px; }
      100% { height: 0; opacity: 0; width: 6px; }
    }
    @keyframes rocket-shake {
      0%, 100% { transform: translateY(0); }
      20% { transform: translateY(-1px); }
      40% { transform: translateY(0); }
      60% { transform: translateY(-2px); }
      80% { transform: translateY(-1px); }
    }

    /* ===== Responsive ===== */
    @media (max-width: 1024px) {
      .article-container { grid-template-columns: 1fr; gap: 2rem; }
      .article-sidebar { position: static; max-height: none; }
    }
    @media (max-width: 768px) {
      .article-hero { min-height: 55vh; padding: 7rem 1.5rem 3rem; }
      .article-container { padding: 2.5rem 1.5rem 4rem; }
      .markdown-body h2 { font-size: 1.5rem; }
      .markdown-body h3 { font-size: 1.15rem; }
      .skill-cards, .pain-points, .impl-phases { grid-template-columns: 1fr; }
      .compare-table { font-size: 0.82rem; }
      .compare-table th, .compare-table td { padding: 0.7rem 0.6rem; }
      .hitl-flow { flex-direction: column; }
      .hitl-stage { margin-right: 0; margin-bottom: 1rem; width: 100%; }
      .hitl-stage::after { display: none; }
      .skill-tier { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
      .back-to-top { bottom: 1.5rem; right: 1.5rem; width: 40px; height: 40px; }
    }
  </style>
</head>
<body>

  <div class="reading-progress" id="readingProgress"></div>

  <section class="article-hero">
    <div class="article-hero-content">
      <h1 class="article-title">{Title}</h1>
      <div class="article-meta">
        <span class="article-date">{YYYY-MM-DD}</span>
        <div class="article-tags">
          <span class="tag">{Tag1}</span>
          <span class="tag">{Tag2}</span>
          <span class="tag">{Tag3}</span>
        </div>
      </div>
    </div>
    <div class="article-hero-bg" style="background-image: url('images/hero.jpg')"></div>
    <div class="article-hero-overlay"></div>
  </section>

  <div class="article-container">
    <aside class="article-sidebar">
      <div class="sidebar-section">
        <h3 class="sidebar-title">目录</h3>
        <nav class="article-toc" id="articleToc"></nav>
      </div>
    </aside>

    <article class="article-content">
      <div class="markdown-body">

        <figure class="article-inline-image">
          <img src="images/hero.jpg" alt="{Alt text}">
          <figcaption>{Caption}</figcaption>
        </figure>

        <h2 id="section-1">一、{Chapter 1 Title}</h2>
        <p>...</p>

        <h2 id="section-2">二、{Chapter 2 Title}</h2>
        <p>...</p>

        <!-- More chapters -->

        <h3>参考资料</h3>
        <ol class="references">
          <li id="cite-1">{Source 1} <a href="{url}" target="_blank" rel="noopener">{url}</a></li>
        </ol>

      </div>
    </article>
  </div>

  <button class="back-to-top" id="backToTop" aria-label="返回顶部" title="发射回顶部">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent);">
      <g transform="rotate(-45 12 12)">
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
        <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
      </g>
    </svg>
  </button>

  <script>
    // ===== Auto-generate TOC from h2 sections =====
    (function() {
      var toc = document.getElementById('articleToc');
      if (!toc) return;
      var headings = document.querySelectorAll('.markdown-body h2[id^="section-"]');
      headings.forEach(function(h2) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#' + h2.id;
        a.textContent = h2.textContent.replace(/^[一二三四五六七八九十]+、/, '');
        a.setAttribute('data-target', h2.id);
        li.appendChild(a);
        toc.appendChild(li);
      });

      // Scroll spy
      var tocLinks = toc.querySelectorAll('a');
      var sections = Array.prototype.slice.call(headings);
      function updateActive() {
        var scrollPos = window.scrollY + 40;
        var currentId = null;
        for (var i = 0; i < sections.length; i++) {
          if (sections[i].offsetTop <= scrollPos) currentId = sections[i].id;
        }
        var scrollHeight = document.documentElement.scrollHeight;
        if (window.scrollY + window.innerHeight >= scrollHeight - 50 && sections.length > 0) {
          currentId = sections[sections.length - 1].id;
        }
        tocLinks.forEach(function(link) {
          link.classList.toggle('active', link.getAttribute('data-target') === currentId);
        });
      }
      window.addEventListener('scroll', updateActive, { passive: true });
      updateActive();
    })();

    // ===== Reading progress bar =====
    (function() {
      var rail = document.getElementById('readingProgress');
      function updateProgress() {
        var scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
        var progress = scrollHeight > 0 ? (window.scrollY / scrollHeight) * 100 : 0;
        rail.style.width = Math.min(progress, 100) + '%';
      }
      window.addEventListener('scroll', updateProgress, { passive: true });
      updateProgress();
    })();

    // ===== Back to top (rocket launch animation) =====
    (function() {
      var btn = document.getElementById('backToTop');
      var LAUNCH_MS = 850; // keep in sync with rocket-launch keyframe duration
      window.addEventListener('scroll', function() {
        if (!btn.classList.contains('launching')) {
          btn.classList.toggle('visible', window.scrollY > 400);
        }
      }, { passive: true });
      btn.addEventListener('click', function() {
        if (btn.classList.contains('launching')) return;
        btn.classList.add('launching');
        btn.classList.remove('visible');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // After launch finishes, reset the button so it can fly again next time
        setTimeout(function() {
          btn.classList.remove('launching');
          // Stay hidden since we are now at the top; scroll spy will re-show it on scroll down
        }, LAUNCH_MS + 50);
      });
    })();
  </script>
</body>
</html>
```

**Critical rules**:
- Container must use `markdown-body` class (NOT `article-body`) for proper h2/h3/p styling
- All `h2` must have `id="section-N"` for TOC anchors
- TOC is auto-generated by the inline script — just provide empty `id="articleToc"` container
- Inline images use `<figure class="article-inline-image">` with `width: 100%`
- All image paths are relative (`images/hero.jpg`, `images/{section}.jpg`) — NO `../../` prefixes
- Chinese quotes use 「」 not nested double quotes
- Citations use `<sup><a href="#cite-N">[N]</a></sup>` with corresponding `<li id="cite-N">`
- **No external `.css` or `.js` files** — everything inline
- **No `articles-data.js`**, **no `articleNav` container**, **no prev/next navigation** — articles are independent
- **No site navigation bar / top menu** — the article hero is the first element in `<body>`
- **No footer** — the article ends after `</article></div>`; the only trailing element is the floating back-to-top button
- favicon is an inline SVG data URI (no external favicon file)
- The back-to-top button is a rocket icon (inline SVG) oriented **vertically upward** — the Lucide rocket paths are wrapped in `<g transform="rotate(-45 12 12)">` so the nose points straight up, and `.back-to-top svg` has `overflow: visible` to prevent clipping after rotation. Clicking plays the `rocket-launch` animation: **pure vertical ascent** (translateY only, no rotate), flame trail underneath (`rocket-flame`), and vertical-only micro-jitter (`rocket-shake`, translateY only, no rotate). Then hides. Scroll spy re-shows it on scroll-down. Keep the `LAUNCH_MS` JS constant in sync with the `rocket-launch` keyframe duration.

### Step 6: Verify Article

1. Read article first 30 lines — confirm HTML structure, no external CSS/JS links (except Google Fonts)
2. Read article last 30 lines — confirm closing tags and inline scripts
3. Grep for `article-inline-image` — confirm images present
4. Grep for `id="section-` — confirm all h2 have IDs
5. Grep for `id="articleToc"` — confirm TOC container exists
6. Grep for `src="../` or `href="../` — confirm NO parent-directory references (everything is self-contained)
7. Grep for `articles-data.js` or `articleNav` — confirm NOT present (articles are independent)
8. Grep for `site-footer` or `<footer` — confirm NOT present (no footer)
9. Grep for `rocket-launch` and `back-to-top` — confirm rocket animation present
10. Grep for `rotate(-45 12 12)` — confirm rocket icon is rotated to point **vertically upward**
11. Open the `index.html` directly via `file://` — confirm it renders without a server, and clicking the rocket plays the launch animation

### Step 7: Optional — Truly Single File (base64)

If the user wants a **single `.html` file with no images folder** (for email, chat attachment, etc.):

1. For each `<img>` and `background-image`, read the image file as base64
2. Replace `src="images/hero.jpg"` with `src="data:image/jpeg;base64,{BASE64_STRING}"`
3. Replace `background-image: url('images/hero.jpg')` with `url('data:image/jpeg;base64,{BASE64_STRING}')`
4. Delete the `images/` folder
5. Verify the file still renders correctly

Use Python for the conversion:
```python
import base64, re, pathlib
html = pathlib.Path('index.html').read_text(encoding='utf-8')
for m in re.finditer(r'images/([\w-]+\.jpg)', html):
    name, path = m.group(1), f'images/{m.group(1)}'
    b64 = base64.b64encode(pathlib.Path(path).read_bytes()).decode()
    html = html.replace(f'images/{name}', f'data:image/jpeg;base64,{b64}')
pathlib.Path('index.html').write_text(html, encoding='utf-8')
```

**Trade-off**: base64 inflates file size ~33% and makes the HTML harder to edit later. Default to keeping the images folder separate; only use base64 when the user explicitly asks for a single file.

## Color & Style Constraints

All articles use a dark theme:

| Variable | Value | Usage |
|----------|-------|-------|
| `--bg-primary` | `#0a0a0f` | Main background |
| `--bg-secondary` | `#12121a` | Cards, code blocks |
| `--text-primary` | `#e8e8ec` | Body text |
| `--text-secondary` | `#7a7a85` | Captions, meta |
| `--accent` | `#00f0ff` | Highlights, links, active states |
| `--divider` | `#2a2a35` | Borders, separators |
| `--amber` | `#ffb347` | Warning callouts, numbers |

Fonts: `Inter` (body), `JetBrains Mono` (code/mono). Both load from Google Fonts CDN; if offline, the stack degrades to system fonts (`-apple-system`, `Segoe UI`, `PingFang SC`, `Microsoft YaHei`).

## Image Generation Rules

### Prompt Engineering
- **NEVER** use hex color codes in image prompts — they get rendered as text labels
- Use natural language: "cyan-blue neon", "deep space black", "warm amber"
- Include `[PURPOSE]:` prefix for context
- Specify "No text, no words, no letters, no labels, no watermarks, no logos, no UI borders, no frames"
- Use "cinematic lighting", "high contrast", "clean minimal composition"

### Mandatory Prohibitions (QA Checklist)
Every generated image MUST be free of:
- **Unexpected logos** — no brand marks, app icons, company logos
- **Watermarks** — no stock-photo watermarks, signature marks, or stamps
- **UI borders / frames** — no browser chrome, window decorations, app toolbars, or artificial borders overlaid on the image
- **Extraneous English text** — no random English words, letters, or code snippets baked into the image (Chinese article context makes stray English especially jarring)
- **Hex color codes** — no `#00f0ff` style strings rendered as visible text

**Post-generation check**: Before accepting any image, open it and visually verify none of the above are present. If any artifact is found, regenerate with stricter negative instructions.

### Quality Recovery
- If generated image has artifacts (hex codes, text, watermarks):
  1. Regenerate with stricter "no text" instructions
  2. New file saves with "(1)" suffix
  3. Delete original, rename "(1)" to original name
  4. Verify replacement with Glob

## Diagram Generation Rules

### When to Use HTML/CSS vs SVG
- **Prefer HTML/CSS** for: layered architectures, card grids, flow diagrams, comparison tables
- **Use SVG** for: complex topologies, sequence diagrams, ER diagrams, network layouts
- **Never use Mermaid** — rendering issues with Chinese text

### HTML/CSS Component Patterns
Each component (CSS provided in the template above) should:
- Use `var(--bg-secondary)` for card backgrounds
- Use `var(--divider)` for borders
- Use `var(--accent)` for highlights and active states
- Include responsive rules (already in the `@media` blocks) that collapse grids to single column
- Use `font-family: var(--font-mono)` for technical labels

### SVG Generation (when needed)
1. Use Python list method to prevent truncation
2. Validate XML syntax after generation
3. Use dark terminal style: bg `#0f0f1a`, accent `#00f0ff`
4. Embed inline via `<svg>` tag (NOT as external file) to keep the article portable
5. Minimum text size 12px, prefer 13-14px

## Article Quality Checklist

- [ ] 6-8 chapters with clear progression
- [ ] Hero image generated (landscape_16_9, no hex codes)
- [ ] 2-4 inline images at key sections
- [ ] 2-4 HTML/CSS visualization components
- [ ] Comparison tables with `.compare-table` class
- [ ] Code examples in `.code-block` with syntax highlighting spans
- [ ] Citations with `<sup>` links and `<li id="cite-N">` targets
- [ ] All h2 have `id="section-N"` for TOC
- [ ] `markdown-body` container class
- [ ] Sidebar TOC container `id="articleToc"`
- [ ] Responsive `@media (max-width: 768px)` rules
- [ ] Chinese quotes use 「」
- [ ] **All CSS inlined in `<style>`** — no external `.css` files
- [ ] **All JS inlined in `<script>`** — no external `.js` files
- [ ] **No `articles-data.js`**, **no `articleNav`**, **no prev/next navigation**
- [ ] **No site navigation bar / top menu**
- [ ] **No footer** — article ends at `</article></div>`, only the floating rocket button follows
- [ ] **favicon is inline SVG data URI**
- [ ] **All image paths relative** (`images/xxx.jpg`) — no `../../` prefixes
- [ ] **Images are clean** — no unexpected logos, watermarks, UI borders/frames, extraneous English text, or hex color code strings baked into any image
- [ ] **Rocket back-to-top button** — inline SVG rocket wrapped in `<g transform="rotate(-45 12 12)">` (nose points **vertically upward**), `.back-to-top svg` has `overflow: visible`; `rocket-launch` keyframe uses **pure vertical translateY** (no rotate), `rocket-shake` uses **vertical-only micro-jitter** (no rotate), `rocket-flame` + keyframes present, `LAUNCH_MS` JS constant matches keyframe duration
- [ ] **Article renders via `file://`** without a server, and the rocket launch animation plays on click
