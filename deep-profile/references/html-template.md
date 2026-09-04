# 自包含 HTML 报告模板（deep-profile 执行参考）

本模板用于生成「全网深度画像」的**单个自包含 HTML 报告**。内联 CSS / JS / SVG，`file://` 直接打开即可，无外部依赖（Google Fonts 可优雅降级为系统字体）。

**使用方式**：LLM 在本模板基础上，用真实采集数据替换所有 `{{...}}` 占位符，并按 `references/diagram-craft.md` 规范绘制的 SVG 替换「图表插槽」。图表统一暗色终端风（bg `#0f0f1a`、accent 同报告强调色）。

**设计系统（反俗套纪律）**：
- 单一强调色 `--accent: #d4a24e`（金琥珀），无紫蓝渐变、无 emoji 图标、无空卡片。
- 统一圆角体系；`clamp()` 流式排版；`text-wrap: balance` 处理标题。

---

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{目标姓名|公司名}} 深度画像 - {{YYYY-MM-DD}}</title>
  <meta name="description" content="{{一句话灵魂定义}}">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230d0e12'/%3E%3Ccircle cx='32' cy='32' r='14' fill='%23d4a24e'/%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700&family=Noto+Serif+SC:wght@500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0d0e12;
      --bg-2: #15171d;
      --bg-3: #1c1f27;
      --ink: #e8e6e0;
      --ink-2: #9b9aa3;
      --ink-3: #62626c;
      --accent: #d4a24e;
      --accent-dim: rgba(212, 162, 78, 0.14);
      --accent-line: rgba(212, 162, 78, 0.35);
      --divider: #262933;
      --danger: #e05656;
      --danger-dim: rgba(224, 86, 86, 0.12);
      --ok: #4ade80;
      --info: #5b9bd5;
      --warn: #d4a24e;
      --muted: #8a8a94;
      --sans: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      --serif: 'Noto Serif SC', 'Songti SC', 'SimSun', serif;
      --mono: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
      --maxw: 1160px;
      --r-sm: 8px; --r-md: 12px; --r-lg: 16px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { scroll-behavior: smooth; scroll-padding-top: 2rem; }
    body { font-family: var(--sans); background: var(--bg); color: var(--ink); line-height: 1.75; -webkit-font-smoothing: antialiased; overflow-x: hidden; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    ::selection { background: var(--accent-dim); }

    /* ===== 进度条 ===== */
    .reading-progress { position: fixed; top: 0; left: 0; height: 3px; width: 0; background: linear-gradient(90deg, var(--accent), #f0d9a8); z-index: 1200; transition: width .1s linear; }

    /* ===== 布局 ===== */
    .wrap { max-width: var(--maxw); margin: 0 auto; padding: 0 clamp(1.2rem, 3vw, 2.5rem); }
    .layout { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: clamp(2rem, 4vw, 3.5rem); padding: clamp(2rem, 4vw, 3.5rem) 0 5rem; }

    /* ===== 侧栏 ===== */
    .sidebar { position: sticky; top: 2rem; align-self: start; max-height: calc(100vh - 4rem); overflow-y: auto; }
    .sidebar-title { font-family: var(--mono); font-size: .72rem; text-transform: uppercase; letter-spacing: .16em; color: var(--ink-3); margin-bottom: 1rem; }
    .toc { list-style: none; }
    .toc a { display: block; padding: .38rem .7rem; color: var(--ink-2); font-size: .86rem; border-left: 2px solid transparent; border-radius: 0 6px 6px 0; transition: all .18s; }
    .toc a:hover { color: var(--accent); background: var(--accent-dim); }
    .toc a.active { color: var(--accent); border-left-color: var(--accent); background: var(--accent-dim); font-weight: 500; }

    /* ===== Hero ===== */
    .hero { position: relative; padding: clamp(3rem, 7vw, 5.5rem) 0 clamp(2rem, 4vw, 3rem); border-bottom: 1px solid var(--divider); background:
      radial-gradient(1000px 500px at 80% -10%, var(--accent-dim), transparent 60%),
      var(--bg); }
    .hero-kicker { font-family: var(--mono); font-size: .78rem; letter-spacing: .22em; text-transform: uppercase; color: var(--accent); margin-bottom: 1.1rem; }
    .hero-title { font-family: var(--serif); font-size: clamp(2rem, 5vw, 3.4rem); line-height: 1.15; font-weight: 700; letter-spacing: -.01em; text-wrap: balance; }
    .hero-soul { max-width: 720px; margin-top: 1.1rem; font-size: clamp(1rem, 1.6vw, 1.18rem); color: var(--ink-2); line-height: 1.8; }
    .hero-meta { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; margin-top: 1.6rem; }
    .chip { padding: .3rem .8rem; border: 1px solid var(--accent-line); background: var(--accent-dim); color: var(--accent); border-radius: 999px; font-size: .8rem; font-weight: 500; }
    .chip.neutral { border-color: var(--divider); background: var(--bg-2); color: var(--ink-2); }
    .hero-date { font-family: var(--mono); font-size: .85rem; color: var(--ink-3); }

    /* ===== 入场动效（CSS-only，交错浮现） ===== */
    @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
    .hero-kicker { animation: fadeUp .6s ease .05s both; }
    .hero-title { animation: fadeUp .7s ease .15s both; }
    .hero-soul { animation: fadeUp .7s ease .25s both; }
    .hero-meta { animation: fadeUp .7s ease .35s both; }
    .summary-card { animation: fadeUp .6s ease both; }
    .summary-card:nth-child(1) { animation-delay: .45s; }
    .summary-card:nth-child(2) { animation-delay: .57s; }
    .summary-card:nth-child(3) { animation-delay: .69s; }
    .summary-card:nth-child(4) { animation-delay: .81s; }

    /* ===== 置信度徽章 ===== */
    .conf { display: inline-flex; align-items: center; gap: .35rem; font-family: var(--mono); font-size: .72rem; font-weight: 500; padding: .12rem .55rem; border-radius: 6px; border: 1px solid; }
    .conf-a { color: var(--ok); border-color: rgba(74,222,128,.4); background: rgba(74,222,128,.1); }
    .conf-b { color: var(--info); border-color: rgba(91,155,213,.4); background: rgba(91,155,213,.1); }
    .conf-c { color: var(--warn); border-color: rgba(212,162,78,.4); background: rgba(212,162,78,.1); }
    .conf-d { color: var(--muted); border-color: rgba(138,138,148,.4); background: rgba(138,138,148,.1); }

    /* ===== 章节 ===== */
    .content { min-width: 0; }
    section { margin-bottom: clamp(2.5rem, 5vw, 4rem); }
    h2 { font-family: var(--serif); font-size: clamp(1.35rem, 2.4vw, 1.8rem); font-weight: 700; padding-bottom: .6rem; margin-bottom: 1.4rem; border-bottom: 1px solid var(--divider); position: relative; text-wrap: balance; }
    h2::before { content: ''; position: absolute; left: 0; bottom: -1px; width: 52px; height: 2px; background: var(--accent); }
    h2 .sec-num { font-family: var(--mono); font-size: .72rem; color: var(--accent); letter-spacing: .12em; display: block; margin-bottom: .35rem; }
    h3 { font-size: 1.05rem; font-weight: 600; margin: 1.6rem 0 .7rem; }
    p { color: var(--ink-2); margin-bottom: .9rem; }
    strong { color: var(--ink); font-weight: 600; }
    .lead { font-size: 1.05rem; color: var(--ink); }

    /* ===== 摘要卡 ===== */
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
    .summary-card { background: var(--bg-2); border: 1px solid var(--divider); border-top: 3px solid var(--accent); border-radius: var(--r-md); padding: 1.1rem 1.2rem; }
    .summary-card h4 { font-family: var(--mono); font-size: .74rem; letter-spacing: .1em; text-transform: uppercase; color: var(--accent); margin-bottom: .5rem; }
    .summary-card p { margin: 0; font-size: .92rem; }

    /* ===== 数据表 ===== */
    .table-wrap { overflow-x: auto; border: 1px solid var(--divider); border-radius: var(--r-md); background: var(--bg-2); }
    table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    th, td { padding: .8rem 1rem; text-align: left; border-bottom: 1px solid var(--divider); vertical-align: top; }
    th { background: var(--bg-3); color: var(--accent); font-weight: 600; font-size: .82rem; letter-spacing: .03em; white-space: nowrap; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(212,162,78,.04); }
    td .field { color: var(--ink); font-weight: 500; }
    td .src { font-family: var(--mono); font-size: .72rem; color: var(--ink-3); }

    /* ===== 指标卡 ===== */
    .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; }
    .metric { background: var(--bg-2); border: 1px solid var(--divider); border-radius: var(--r-md); padding: 1rem 1.1rem; }
    .metric .label { font-family: var(--mono); font-size: .72rem; color: var(--ink-3); letter-spacing: .06em; }
    .metric .value { font-size: 1.4rem; font-weight: 700; color: var(--ink); margin-top: .3rem; }
    .metric .note { font-size: .8rem; color: var(--ink-2); margin-top: .2rem; }

    /* ===== 对比卡（核心矛盾） ===== */
    .contrast { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; border: 1px solid var(--divider); border-radius: var(--r-lg); overflow: hidden; background: var(--bg-2); }
    .contrast-side { padding: 1.3rem 1.4rem; }
    .contrast-side:first-child { border-right: 1px solid var(--divider); }
    .contrast-side h4 { font-family: var(--mono); font-size: .76rem; letter-spacing: .08em; text-transform: uppercase; margin-bottom: .6rem; }
    .contrast-side.pull-a h4 { color: var(--accent); }
    .contrast-side.pull-b h4 { color: var(--info); }
    .contrast-side ul { list-style: none; }
    .contrast-side li { font-size: .9rem; color: var(--ink-2); padding: .35rem 0 .35rem 1.2rem; position: relative; }
    .contrast-side li::before { content: ''; position: absolute; left: 0; top: .95rem; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }

    /* ===== 三层驱动 ===== */
    .layers { display: flex; flex-direction: column; gap: .8rem; }
    .layer { display: grid; grid-template-columns: 90px 1fr; gap: 1rem; background: var(--bg-2); border: 1px solid var(--divider); border-left: 3px solid var(--accent); border-radius: var(--r-md); padding: 1rem 1.2rem; }
    .layer .layer-name { font-family: var(--mono); font-size: .8rem; color: var(--accent); letter-spacing: .08em; align-self: start; padding-top: .1rem; }
    .layer .layer-body p { margin: 0; font-size: .92rem; }

    /* ===== 图表插槽 ===== */
    .chart { margin: 1.4rem 0; background: #0f0f1a; border: 1px solid var(--divider); border-radius: var(--r-md); padding: 1.2rem; overflow-x: auto; }
    .chart .chart-title { font-family: var(--mono); font-size: .74rem; color: var(--ink-3); letter-spacing: .08em; text-transform: uppercase; margin-bottom: .8rem; }
    .chart svg { width: 100%; height: auto; display: block; min-width: 480px; }
    .legend { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: .8rem; font-size: .8rem; color: var(--ink-2); }
    .legend span { display: inline-flex; align-items: center; gap: .4rem; }
    .legend i { width: 14px; height: 3px; display: inline-block; border-radius: 2px; }
    .legend .solid { background: var(--accent); }
    .legend .dashed { background: repeating-linear-gradient(90deg, var(--info) 0 4px, transparent 4px 7px); }
    .legend .red { background: var(--danger); }

    /* ===== 时间线 ===== */
    .timeline { list-style: none; border-left: 2px solid var(--divider); margin-left: .5rem; padding-left: 1.6rem; }
    .timeline li { position: relative; padding-bottom: 1.4rem; }
    .timeline li::before { content: ''; position: absolute; left: -1.85rem; top: .45rem; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); border: 2px solid var(--bg); }
    .timeline .t-time { font-family: var(--mono); font-size: .78rem; color: var(--accent); }
    .timeline .t-title { font-weight: 600; color: var(--ink); margin: .15rem 0 .2rem; }
    .timeline .t-desc { font-size: .9rem; color: var(--ink-2); }

    /* ===== 路径卡（数字孪生） ===== */
    .path-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
    .path { background: var(--bg-2); border: 1px solid var(--divider); border-radius: var(--r-md); padding: 1.1rem 1.2rem; }
    .path .p-prob { font-family: var(--mono); font-size: 1.3rem; font-weight: 700; color: var(--accent); }
    .path .p-name { font-weight: 600; color: var(--ink); margin: .3rem 0 .4rem; }
    .path .p-desc { font-size: .86rem; color: var(--ink-2); }

    /* ===== 风险卡 ===== */
    .risk-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
    .risk { background: var(--danger-dim); border: 1px solid rgba(224,86,86,.35); border-left: 3px solid var(--danger); border-radius: var(--r-md); padding: 1rem 1.2rem; }
    .risk h4 { color: var(--danger); font-size: .95rem; margin-bottom: .4rem; }
    .risk p { margin: 0; font-size: .86rem; color: var(--ink-2); }
    .risk .conf { margin-top: .5rem; }

    /* ===== 证据 ===== */
    .evidence { border: 1px solid var(--divider); border-radius: var(--r-md); overflow: hidden; }
    .evidence-item { display: flex; gap: .8rem; align-items: flex-start; padding: .85rem 1rem; border-bottom: 1px solid var(--divider); background: var(--bg-2); }
    .evidence-item:last-child { border-bottom: none; }
    .evidence-item .conf { flex-shrink: 0; margin-top: .2rem; }
    .evidence-item .ev-body { font-size: .9rem; color: var(--ink-2); }
    .evidence-item .ev-body strong { color: var(--ink); }
    .evidence-item .ev-src { font-family: var(--mono); font-size: .74rem; color: var(--ink-3); margin-top: .25rem; word-break: break-all; }
    .conflict { border-left: 3px solid var(--warn); }

    /* ===== 缺口 ===== */
    .gap-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
    .gap { background: var(--bg-2); border: 1px dashed var(--divider); border-radius: var(--r-md); padding: 1rem 1.2rem; }
    .gap h4 { font-size: .9rem; color: var(--ink); margin-bottom: .4rem; }
    .gap p { margin: 0; font-size: .85rem; color: var(--ink-2); }
    .gap .q { margin-top: .6rem; padding: .6rem .8rem; background: var(--accent-dim); border-left: 2px solid var(--accent); border-radius: 6px; font-size: .85rem; color: var(--ink); }

    /* ===== 回到顶部 ===== */
    .top { position: fixed; right: 1.6rem; bottom: 1.6rem; width: 46px; height: 46px; border-radius: 50%; background: var(--bg-2); border: 1px solid var(--divider); color: var(--accent); display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0; pointer-events: none; transition: all .25s; z-index: 900; }
    .top.visible { opacity: 1; pointer-events: auto; }
    .top:hover { border-color: var(--accent); transform: translateY(-3px); }
    .top svg { width: 20px; height: 20px; }

    /* ===== 响应式 ===== */
    @media (max-width: 900px) {
      .layout { grid-template-columns: 1fr; }
      .sidebar { position: static; max-height: none; margin-bottom: 1rem; }
      .contrast { grid-template-columns: 1fr; }
      .contrast-side:first-child { border-right: none; border-bottom: 1px solid var(--divider); }
      .layer { grid-template-columns: 1fr; gap: .4rem; }
    }

    /* ===== 动效降级（无障碍） ===== */
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      *, *::before, *::after { animation-duration: .01ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
    }
  </style>
</head>
<body>
  <div class="reading-progress" id="progress"></div>

  <!-- ============ 1. Hero ============ -->
  <header class="hero">
    <div class="wrap">
      <div class="hero-kicker">深度画像 · Deep Profile</div>
      <h1 class="hero-title">{{目标姓名 / 公司全称}}</h1>
      <p class="hero-soul">{{一句话灵魂定义：一个以【社会面具】示人、被【核心矛盾】拉扯、最终被【底层驱动】推动的人/组织。}}</p>
      <div class="hero-meta">
        <span class="chip">{{个人 / 公司}}</span>
        <span class="chip neutral">综合置信度 {{A/B/C/D}}</span>
        <span class="chip neutral">{{行业/领域}}</span>
        <span class="chip neutral">{{常驻地域}}</span>
        <span class="chip">{{已具本人书面授权 · 招聘/背调口径}}</span>
        <span class="hero-date">{{YYYY-MM-DD}}</span>
      </div>
    </div>
  </header>

  <div class="wrap">
    <div class="layout">
      <!-- ============ 侧栏 TOC ============ -->
      <aside class="sidebar">
        <div class="sidebar-title">目录</div>
        <nav class="toc" id="toc"></nav>
      </aside>

      <main class="content">

        <!-- ============ 2. 结论前置摘要 ============ -->
        <section>
          <h2 id="section-2"><span class="sec-num">EXECUTIVE SUMMARY</span>结论前置摘要</h2>
          <!-- ⬇ 每处关键结论（尤其风险提示）标核验状态：🔵 已坐实 / 🟡 待本人凭证（用文字或色块） -->
          <div class="summary-grid">
            <div class="summary-card"><h4>社会面具</h4><p>{{如何被世界使用：职位/头衔/公众角色/他人期待}}</p></div>
            <div class="summary-card"><h4>核心矛盾</h4><p>{{内在张力：兴趣悖论 / 价值观冲突 / 行为反差}}</p></div>
            <div class="summary-card"><h4>底层驱动</h4><p>{{恐惧层 / 欲望层 / 使命层 的最强驱动}}</p></div>
            <div class="summary-card"><h4>风险提示</h4><p>{{最高优先级风险一句话 · 🔵/🟡}}</p></div>
          </div>
        </section>

        <!-- ============ 3. 基础身份锚定 ============ -->
        <section>
          <h2 id="section-3"><span class="sec-num">IDENTITY</span>基础身份锚定</h2>
          <h3>① 核心身份锚定</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>字段</th><th>取值</th><th>来源</th><th>置信度</th><th>核验状态</th></tr></thead>
              <tbody>
                <tr><td class="field">姓名</td><td>{{张三}}</td><td class="src">{{来源1 · 来源2}}</td><td><span class="conf conf-a">A</span></td><td>🔵 已坐实</td></tr>
                <tr><td class="field">曾用名 / 别名</td><td>{{三哥 / San Zhang}}</td><td class="src">{{来源}}</td><td><span class="conf conf-b">B</span></td><td>🟡 待本人凭证</td></tr>
                <tr><td class="field">出生 / 地域</td><td>{{19xx · 某省某市}}</td><td class="src">{{来源}}</td><td><span class="conf conf-b">B</span></td><td>🟡 待本人凭证</td></tr>
                <tr><td class="field">联系方式</td><td>{{邮箱 / 电话}}</td><td class="src">{{来源}}</td><td><span class="conf conf-c">C</span></td><td>🟡 待本人凭证</td></tr>
                <tr><td class="field">社交账号</td><td>{{平台 · ID · 粉丝数}}</td><td class="src">{{来源}}</td><td><span class="conf conf-b">B</span></td><td>🔵 已坐实</td></tr>
                <!-- ⬇ 按 profile-schema.md 个人/公司字段表逐项填充，删除无用行。核验状态列：🔵 公开已坐实 / 🟡 待本人凭证（用文字或色块，不用 emoji 图标）。敏感原始证件（身份证号/住址/手机号/家庭）不入档，仅列为凭证项。 -->
              </tbody>
            </table>
          </div>

          <h3>② 教育背景核验</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>阶段</th><th>学校 · 专业 · 学位</th><th>公开侧状态</th><th>需本人凭证 · 核验方式</th><th>影响判断</th></tr></thead>
              <tbody>
                <tr>
                  <td class="field">{{本科 20xx–20xx}}</td>
                  <td>{{XX 大学 · XX 专业 · 学士}}</td>
                  <td><span class="conf conf-b">B · 中英文名绑定自报/校友源</span></td>
                  <td>{{学信网备案 + 学位证在线验真伪}}；<strong>主校本部与独立学院须区分</strong></td>
                  <td>{{如目标为 XX 名企/岗位硬门槛则关键}}</td>
                </tr>
                <tr>
                  <td class="field">{{硕士 20xx–20xx}}</td>
                  <td>{{XX 大学 EMBA/MBA · XX}}</td>
                  <td><span class="conf conf-c">C · 单源自报</span></td>
                  <td>{{学位证/结业证 + 院校在读备案核验}}</td>
                  <td>{{在职学位 vs 学历学位对职级判断影响}}</td>
                </tr>
                <!-- ⬇ 每段教育一行，标「公开已坐实 / 待本人凭证」。缺失时如实空 + 需本人凭证。 -->
              </tbody>
            </table>
          </div>

          <h3>③ 任职经历核验（按 7.4 时间演进逐段）</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>任职段</th><th>雇主 · 职级</th><th>公开侧状态</th><th>需本人凭证 · 核验方式</th><th>角色跃迁</th></tr></thead>
              <tbody>
                <tr>
                  <td class="field">{{20xx–20xx}}</td>
                  <td>{{XX 集团 · XX 总监}}</td>
                  <td><span class="conf conf-b">B · 职业平台自报</span></td>
                  <td>{{社保/个税/在职/离职证明 + HR 侧向（职业平台自填非证明，最高 B）}}</td>
                  <td>{{如 CTO→产品线主管，属职级口径落差，需标注存疑}}</td>
                </tr>
                <tr style="background:rgba(224,86,86,.07)">
                  <td class="field" style="color:#e05656;font-weight:700">{{核心同一性疑点段 20xx–20xx}}</td>
                  <td style="color:#e05656;font-weight:700">{{XX VP ⇄ XX 产品总监}}</td>
                  <td><span class="conf conf-c">C · 跨源现职不同</span></td>
                  <td>{{任离职公告/官网个人页/在职证明可断开或焊死此线}}</td>
                  <td>{{主题相关则倾向同一人，职级落差按 7.4 处理}}</td>
                </tr>
                <!-- ⬇ 按年份从早到晚逐段列出（7.4 时间演进重构，勿现职二选一）；核心同一性疑点段以标红置顶呈现。 -->
              </tbody>
            </table>
          </div>
        </section>

        <!-- ============ 4. 社会面具测绘 ============ -->
        <section>
          <h2 id="section-4"><span class="sec-num">PERSONA</span>社会面具测绘</h2>
          <p class="lead">{{一句话：他如何被世界「使用」}}</p>
          <div class="metric-grid">
            <div class="metric"><div class="label">决策风格</div><div class="value">{{结果导向}}</div><div class="note">{{高频动词：主导/推动/拍板}}</div></div>
            <div class="metric"><div class="label">影响力半径</div><div class="value">{{行业级}}</div><div class="note">{{粉丝数 / 合作方数量}}</div></div>
            <div class="metric"><div class="label">公众角色</div><div class="value">{{管理者 / 创始人}}</div><div class="note">{{他人期待}}</div></div>
          </div>
        </section>

        <!-- ============ 5. 核心矛盾挖掘 ============ -->
        <section>
          <h2 id="section-5"><span class="sec-num">TENSION</span>核心矛盾挖掘</h2>
          <div class="contrast">
            <div class="contrast-side pull-a">
              <h4>一面 · {{技术极客}}</h4>
              <ul><li>{{证据 1}}</li><li>{{证据 2}}</li><li>{{证据 3}}</li></ul>
            </div>
            <div class="contrast-side pull-b">
              <h4>另一面 · {{文艺哲思}}</h4>
              <ul><li>{{证据 1}}</li><li>{{证据 2}}</li><li>{{证据 3}}</li></ul>
            </div>
          </div>
        </section>

        <!-- ============ 6. 底层驱动溯源 ============ -->
        <section>
          <h2 id="section-6"><span class="sec-num">DRIVER</span>底层驱动溯源</h2>
          <div class="layers">
            <div class="layer"><div class="layer-name">恐惧层</div><div class="layer-body"><p>{{回避的话题 / 风险规避倾向，例如「对技术失控的深层恐惧」}}</p></div></div>
            <div class="layer"><div class="layer-name">欲望层</div><div class="layer-body"><p>{{反复追逐的目标 / 资源获取倾向}}</p></div></div>
            <div class="layer"><div class="layer-name">使命层</div><div class="layer-body"><p>{{公开表态的价值主张 / 长期愿景}}</p></div></div>
          </div>
        </section>

        <!-- ============ 7. 关系网络拓扑 ============ -->
        <section>
          <h2 id="section-7"><span class="sec-num">NETWORK</span>关系网络拓扑</h2>
          <div class="chart">
            <div class="chart-title">关系拓扑图 · 按 diagram-craft.md 规范绘制后内联</div>
            <!-- ⬇ 图表插槽：用按 diagram-craft.md 规范绘制的 SVG 替换下方示例 -->
            <svg viewBox="0 0 960 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="关系网络拓扑图">
              <style>.n{fill:#15171d;stroke:#d4a24e;stroke-width:1.5}.core{fill:#15171d;stroke:#d4a24e;stroke-width:2}.t{fill:#e8e6e0;font-size:13px;font-family:sans-serif}.e{stroke:#5b9bd5;stroke-width:1.5;stroke-dasharray:4 4;fill:none}.r{stroke:#e05656;stroke-width:1.5;fill:none}</style>
              <line class="e" x1="450.6" y1="282.9" x2="192.5" y2="133.1"/>
              <line class="e" x1="509" y1="282.2" x2="717.8" y2="153.6"/>
              <line class="r" x1="506.8" y1="320.9" x2="639.5" y2="424"/>
              <line class="e" x1="449.6" y1="315.2" x2="223.3" y2="428.4"/>
              <circle class="core" cx="480" cy="300" r="34"/><circle class="n" cx="480" cy="300" r="27" stroke-width="1"/><text class="t" x="480" y="305" text-anchor="middle">目标</text>
              <circle class="n" cx="170" cy="120" r="26"/><text class="t" x="170" y="125" text-anchor="middle">家人</text>
              <circle class="n" cx="740" cy="140" r="26"/><text class="t" x="740" y="145" text-anchor="middle">同事</text>
              <circle class="n" cx="660" cy="440" r="26"/><text class="t" x="660" y="445" text-anchor="middle">对手</text>
              <circle class="n" cx="200" cy="440" r="26"/><text class="t" x="200" y="445" text-anchor="middle">伙伴</text>
            </svg>
            <div class="legend">
              <span><i class="solid"></i>显性关系（股权/任职/合作）</span>
              <span><i class="dashed"></i>隐性关系（思想同盟/同群）</span>
              <span><i class="red"></i>对抗关系（诉讼/竞争/对立）</span>
            </div>
          </div>
          <p>{{显性 / 隐性 / 对抗关系的文字解读}}</p>
          <h3>圈层结构与关键人物</h3>
          <p>{{核心圈（强连接 x 人，姓名/角色列举）；桥接圈（跨圈层人物）；弱连接长尾概览。关键人物标注：社交枢纽=谁+凭据、信息掮客=谁+桥接了哪两个圈、传播放大器=谁+转发放大量级。核心圈空缺时如实写「查无强连接（孤狼/封闭型）」。}}</p>
          <h3>社交足迹盘点（7.5）</h3>
          <p>{{列出最强社交锚点（如 LinkedIn 中英文名绑定、高校/学会讲台/职务）与各平台足迹；若为 B 端专家而无高活跃微博/知乎/小红书大众号，如实写「查无高活跃大众号是此类专家的正常形态」，不虚构账号。同生态高相似他人须显式区隔（7.6）。}}</p>

          <h3>核心公司穿透卡</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>公司</th><th>本人角色</th><th>法定代表人</th><th>实控人 / 控股链</th><th>高管层</th><th>工商与风险</th><th>置信度</th></tr></thead>
              <tbody>
                <tr>
                  <td class="field">{{XX 科技有限公司}}</td>
                  <td>{{创始人 / 法定代表人 / 控股 62%}}</td>
                  <td>{{目标本人}}</td>
                  <td>{{实控人=本人 · 自然人控股 · 穿透链：本人 → XX 控股 → 目标公司}}</td>
                  <td>{{CEO=本人 · CTO=张三 · CFO=李四 · 监事=王五}}</td>
                  <td class="src">{{成立 20xx · 注册资本 xx 万 · 存续 · 涉诉 x 起（被告）}}</td>
                  <td><span class="conf conf-a">A</span></td>
                </tr>
                <tr>
                  <td class="field">{{YY 集团（历任雇主）}}</td>
                  <td>{{前 CTO（20xx–20xx）}}</td>
                  <td>{{赵六}}</td>
                  <td>{{国资控股 · 实控人=YY 国资委}}</td>
                  <td>{{CEO=钱七 · 高管备案无本人离职后记录}}</td>
                  <td class="src">{{成立 19xx · 参保 x 千人 · 无失信}}</td>
                  <td><span class="conf conf-b">B</span></td>
                </tr>
                <!-- ⬇ 每家核心公司一行（现职/历任雇主/法人持股主体/合作方）；同名公司排除结论写进证据链；公司被执行/失信在「工商与风险」列标注「关联风险」 -->
              </tbody>
            </table>
          </div>

          <h3>工商 / 任职 / 股权穿透（从人出发）</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>对象</th><th>关联类型（从人出发）</th><th>公开侧工商结论</th><th>股权 / 任职 / 最终受益人核验</th></tr></thead>
              <tbody>
                <tr>
                  <td class="field">{{目标本人}}</td>
                  <td>{{法人代表 / 董监高 / 股东 / 实控}}</td>
                  <td><span class="conf conf-b">B · 公开免费库未检索到强关联实控/持股主体</span></td>
                  <td>{{呈「职业经理人」或「创始人」画像？需授权接入天眼查/企查查付费源做同名全量「任职/投资/最终受益人/历史变更」穿透收口}}</td>
                </tr>
                <tr>
                  <td class="field">{{历任/现职雇主}}</td>
                  <td>{{任职 · 产品总监 / VP（年份）}}</td>
                  <td><span class="conf conf-c">C · 同一性待确认</span></td>
                  <td>{{与同名候选人是否同一人；真实职级 vs 自述口径；有无竞业约束（同赛道同质）}}</td>
                </tr>
                <tr>
                  <td class="field">{{无关同名工商主体（已甄别排除）}}</td>
                  <td>—</td>
                  <td><span class="conf conf-b">B · 均判定为他人</span></td>
                  <td>{{逐一列出被排除同名主体的注册地/行业/成立时间凭据，勿关联为本人的股权；本人主线查无控股则给否定性结论 + 授权付费库收口路径}}</td>
                </tr>
                <!-- ⬇ 对象=本人 + 各核心雇主 + 被排除同名主体；列明同名甄别凭据；司法风险若未在此列出则落 §10 -->
              </tbody>
            </table>
          </div>
        </section>

        <!-- ============ 8. 时空行为建模 ============ -->
        <section>
          <h2 id="section-8"><span class="sec-num">TRAJECTORY</span>时空行为建模</h2>
          <div class="chart">
            <div class="chart-title">时间线 · 按 diagram-craft.md 规范绘制后内联（主轴职业线 / 副轴技术·内容·生活线）</div>
            <!-- ⬇ 图表插槽：用按 diagram-craft.md 规范绘制的 SVG 替换下方示例 -->
            <svg viewBox="0 0 960 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="时空行为时间线">
              <style>.ax{stroke:#262933;stroke-width:2}.pt{fill:#d4a24e}.tt{fill:#e8e6e0;font-size:13px;font-family:sans-serif}.ds{fill:#9b9aa3;font-size:12px;font-family:sans-serif}</style>
              <line class="ax" x1="60" y1="200" x2="900" y2="200"/>
              <circle class="pt" cx="140" cy="200" r="8"/><text class="tt" x="140" y="172" text-anchor="middle">20xx</text><text class="ds" x="140" y="228" text-anchor="middle">教育</text>
              <circle class="pt" cx="340" cy="200" r="8"/><text class="tt" x="340" y="172" text-anchor="middle">20xx</text><text class="ds" x="340" y="228" text-anchor="middle">入职</text>
              <circle class="pt" cx="540" cy="200" r="8"/><text class="tt" x="540" y="172" text-anchor="middle">20xx</text><text class="ds" x="540" y="228" text-anchor="middle">晋升</text>
              <circle class="pt" cx="760" cy="200" r="10" fill="#e05656"/><text class="tt" x="760" y="172" text-anchor="middle">20xx</text><text class="ds" x="760" y="228" text-anchor="middle">突变点</text>
            </svg>
          </div>
          <ul class="timeline">
            <li><div class="t-time">{{20xx}}</div><div class="t-title">{{关键事件}}</div><div class="t-desc">{{能力进化 / 认知疆域 / 突变原因}}</div></li>
            <li><div class="t-time">{{20xx}}</div><div class="t-title">{{关键事件}}</div><div class="t-desc">{{说明}}</div></li>
            <!-- ⬇ 四线轨迹（职业/技术/内容/生活）按时间顺序填充，突变点用红色标记并注明多线共振。任职轨迹按 7.4「时间演进重构」以多段任职呈现（勿现职二选一），核心同一性疑点段标红置顶，与 §3 ③任职核验表口径一致。 -->
          </ul>
          <h3>四线轨迹要点</h3>
          <p>{{职业线（LinkedIn/脉脉/BOSS直聘等任职段）为主干，按 7.4 时间演进重构为多段；技术线（GitHub 语言演化/commit 活跃）；内容线（微博/知乎/B站/抖音/视频号/公众号话题演化）；生活线（常驻城市/出行/作息/消费）。标出多线共振的突变点。}}</p>
        </section>

        <!-- ============ 9. 数字孪生推演 ============ -->
        <section>
          <h2 id="section-9"><span class="sec-num">TWIN</span>数字孪生推演</h2>
          <p class="lead">{{未竟之志预测：基于未完成事项 + 资源匹配度}}</p>
          <div class="path-grid">
            <div class="path"><div class="p-prob">{{62%}}</div><div class="p-name">{{路径 A}}</div><div class="p-desc">{{描述 + 依据}}</div></div>
            <div class="path"><div class="p-prob">{{28%}}</div><div class="p-name">{{路径 B}}</div><div class="p-desc">{{描述 + 依据}}</div></div>
            <div class="path"><div class="p-prob">{{10%}}</div><div class="p-name">{{路径 C}}</div><div class="p-desc">{{描述 + 依据}}</div></div>
          </div>
          <h3>反事实 What-if</h3>
          <p>{{若改变 X（职位/资金/合作/监管），目标最可能转向哪条路径，输出概率与依据。}}</p>
        </section>

        <!-- ============ 10. 风险标签 ============ -->
        <section>
          <h2 id="section-10"><span class="sec-num">RISK</span>风险标签</h2>
          <div class="risk-grid">
            <div class="risk"><h4>{{涉诉}}</h4><p>{{说明}}</p><span class="conf conf-a">A</span></div>
            <div class="risk"><h4>{{失信 / 被执行}}</h4><p>{{说明}}</p><span class="conf conf-b">B</span></div>
            <div class="risk"><h4>{{舆情负面}}</h4><p>{{说明}}</p><span class="conf conf-c">C</span></div>
            <!-- ⬇ 无风险时显示「未发现公开风险记录」，删除多余卡片 -->
          </div>

          <h3>司法 / 合规风险交叉核验</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>核验项</th><th>公开侧结论</th><th>收口核验方式</th></tr></thead>
              <tbody>
                <tr><td class="field">{{失信被执行 / 限制消费}}</td><td><span class="conf conf-b">B · 公开未发现强关联记录</span></td><td>{{凭姓名（+关联企业）在全国法院被执行人/失信信息网正式检索留档}}</td></tr>
                <tr><td class="field">{{涉诉 / 裁判文书}}</td><td><span class="conf conf-b">B · 公开未发现强关联涉诉</span></td><td>{{裁判文书网 + 授权工商库「关联诉讼」全量核查}}</td></tr>
                <tr><td class="field">{{行政处罚 / 经营异常}}</td><td><span class="conf conf-b">B · 公开未发现</span></td><td>{{授权工商库按关联企业核查}}</td></tr>
                <tr><td class="field">{{知识产权 / 竞业}}</td><td><span class="conf conf-c">C · 需本人申报</span></td><td>{{书面确认录用无受限竞业条款（尤其目标岗位与历任雇主同赛道同质时）}}</td></tr>
                <!-- ⬇ 六维默认：失信/涉诉/处罚/经营异常/知产/竞业；各带「公开已坐实 / 待凭证」状态；无法全量确认项标注需接入授权工商/司法库收口。工商/任职/股权穿透若未放 §7 则放此处。 -->
              </tbody>
            </table>
          </div>

          <p style="font-size:.9rem;color:var(--ink-2)">{{合规基调一句话：本画像默认处于「招聘/背调/合作核实」场景且已具备目标本人书面授权；公开侧未采未展示身份证号/住址/手机号/家庭等敏感原始证件，仅列为需本人出示的凭证项，由委托方在授权下核验；敏感原件不入档、不外泄。}}</p>
        </section>

        <!-- ============ 11. 证据溯源与置信度 ============ -->
        <section>
          <h2 id="section-11"><span class="sec-num">EVIDENCE</span>证据溯源与置信度</h2>
          <div class="evidence">
            <div class="evidence-item"><span class="conf conf-a">A</span><div class="ev-body"><strong>{{结论}}</strong><div class="ev-src">{{来源 1 · 来源 2（双源交叉验证）}}</div></div></div>
            <div class="evidence-item"><span class="conf conf-b">B</span><div class="ev-body"><strong>{{结论}}</strong><div class="ev-src">{{单一可信来源}}</div></div></div>
            <div class="evidence-item conflict"><span class="conf conf-c">C</span><div class="ev-body"><strong>{{存在冲突的结论}}</strong><div class="ev-src">{{多版本：版本1 / 版本2，标注冲突待复核}}</div></div></div>
            <!-- ⬇ 逐条填充，矛盾项用 .conflict 类 -->
          </div>
        </section>

        <!-- ============ 12. 信息缺口与待确认线索 ============ -->
        <section>
          <h2 id="section-12"><span class="sec-num">GAPS</span>信息缺口与待确认线索</h2>
          <div class="gap-grid">
            <div class="gap"><h4>{{身份消歧}}</h4><p>{{缺口说明}}</p><div class="q">{{建议向用户提问的原文}}</div></div>
            <div class="gap"><h4>{{数据源不可达}}</h4><p>{{缺口说明}}</p><div class="q">{{提问}}</div></div>
            <div class="gap"><h4>{{信息模糊}}</h4><p>{{缺口说明}}</p><div class="q">{{提问}}</div></div>
            <!-- ⬇ 无缺口时删除；每项都附建议提问原文 -->
          </div>
        </section>

        <p style="font-family:var(--mono);font-size:.8rem;color:var(--ink-3);margin-top:2rem;">以上基于公开可获取信息整理，仅供合法合规用途参考。对敏感/低置信度结论请以人工复核为准。</p>

      </main>
    </div>
  </div>

  <button class="top" id="top" aria-label="返回顶部">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
  </button>

  <script>
    (function () {
      // 1) 自动生成 TOC
      var toc = document.getElementById('toc');
      var heads = document.querySelectorAll('main h2[id^="section-"]');
      heads.forEach(function (h) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#' + h.id;
        var num = h.querySelector('.sec-num'); // 精确剥离 sec-num 前缀（兼容多词前缀如 EXECUTIVE SUMMARY）
        a.textContent = (num ? h.textContent.replace(num.textContent, '') : h.textContent).trim();
        a.setAttribute('data-target', h.id);
        li.appendChild(a);
        toc.appendChild(li);
      });

      // 2) 滚动监听（进度条 + TOC 高亮 + 回到顶部）
      var progress = document.getElementById('progress');
      var topBtn = document.getElementById('top');
      var links = toc.querySelectorAll('a');
      function onScroll() {
        var h = document.documentElement;
        var max = h.scrollHeight - h.clientHeight;
        progress.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
        topBtn.classList.toggle('visible', h.scrollTop > 400);

        var pos = h.scrollTop + 60, current = null;
        heads.forEach(function (hd) { if (hd.offsetTop <= pos) current = hd.id; });
        links.forEach(function (l) { l.classList.toggle('active', l.getAttribute('data-target') === current); });
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();

      // 3) 回到顶部
      topBtn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    })();
  </script>
</body>
</html>
```

---

## 替换指引（实现时遵循）

1. **占位符**：所有 `{{...}}` 用真实采集数据替换；无数据的字段删除对应行，不要留空卡片。
2. **图表**：`7. 关系网络拓扑` 与 `8. 时空行为建模` 的示例 SVG 必须替换为按 `references/diagram-craft.md` 规范绘制的 SVG（暗色 bg `#0f0f1a`、accent `#d4a24e`、最小字号 12px）。
3. **置信度徽章**：`conf-a / conf-b / conf-c / conf-d` 四类，配色与 `profile-schema.md` 一致。
4. **矛盾项**：证据存在多版本时，该项加 `conflict` 类（左侧琥珀竖线）。
5. **风险卡**：无公开风险时显示单条「未发现公开风险记录」中性卡，不强行造风险。
6. **反俗套自查**：无 emoji 图标、无紫蓝渐变、无空卡片；单一强调色 `#d4a24e`。
