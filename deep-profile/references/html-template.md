# 自包含 HTML 报告模板（deep-profile 执行参考）

本模板用于生成「全网深度画像」的**单个自包含 HTML 报告**。内联 CSS / JS / SVG，`file://` 直接打开即可，无外部依赖（Google Fonts 可优雅降级为系统字体）。

**使用方式**：LLM 在本模板基础上，用真实采集数据替换所有 `{{...}}` 占位符，并用 `fireworks-tech-graph` 产出的 SVG 替换「图表插槽」。图表统一暗色终端风（bg `#0f0f1a`、accent 同报告强调色）。

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
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='%230d0e12'/><circle cx='32' cy='32' r='14' fill='%23d4a24e'/></svg>">
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
          <div class="summary-grid">
            <div class="summary-card"><h4>社会面具</h4><p>{{如何被世界使用：职位/头衔/公众角色/他人期待}}</p></div>
            <div class="summary-card"><h4>核心矛盾</h4><p>{{内在张力：兴趣悖论 / 价值观冲突 / 行为反差}}</p></div>
            <div class="summary-card"><h4>底层驱动</h4><p>{{恐惧层 / 欲望层 / 使命层 的最强驱动}}</p></div>
            <div class="summary-card"><h4>风险提示</h4><p>{{最高优先级风险一句话}}</p></div>
          </div>
        </section>

        <!-- ============ 3. 基础身份锚定 ============ -->
        <section>
          <h2 id="section-3"><span class="sec-num">IDENTITY</span>基础身份锚定</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>字段</th><th>取值</th><th>来源</th><th>置信度</th></tr></thead>
              <tbody>
                <tr><td class="field">姓名</td><td>{{张三}}</td><td class="src">{{来源1 · 来源2}}</td><td><span class="conf conf-a">A</span></td></tr>
                <tr><td class="field">曾用名 / 别名</td><td>{{三哥 / San Zhang}}</td><td class="src">{{来源}}</td><td><span class="conf conf-b">B</span></td></tr>
                <tr><td class="field">出生 / 地域</td><td>{{19xx · 某省某市}}</td><td class="src">{{来源}}</td><td><span class="conf conf-b">B</span></td></tr>
                <tr><td class="field">联系方式</td><td>{{邮箱 / 电话}}</td><td class="src">{{来源}}</td><td><span class="conf conf-c">C</span></td></tr>
                <tr><td class="field">社交账号</td><td>{{平台 · ID · 粉丝数}}</td><td class="src">{{来源}}</td><td><span class="conf conf-b">B</span></td></tr>
                <!-- ⬇ 按 profile-schema.md 个人/公司字段表逐项填充，删除无用行 -->
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
            <div class="chart-title">关系拓扑图 · 由 fireworks-tech-graph 生成后内联</div>
            <!-- ⬇ 图表插槽：用 fireworks-tech-graph 产出的 SVG 替换下方示例 -->
            <svg viewBox="0 0 760 320" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="关系网络拓扑图">
              <style>.n{fill:#15171d;stroke:#d4a24e;stroke-width:1.5}.t{fill:#e8e6e0;font-size:13px;font-family:sans-serif}.e{stroke:#5b9bd5;stroke-width:1.5;stroke-dasharray:4 4}.r{stroke:#e05656;stroke-width:1.5}</style>
              <line class="e" x1="380" y1="160" x2="180" y2="80"/>
              <line class="e" x1="380" y1="160" x2="620" y2="90"/>
              <line class="r" x1="380" y1="160" x2="560" y2="250"/>
              <line class="e" x1="380" y1="160" x2="200" y2="240"/>
              <circle class="n" cx="380" cy="160" r="34"/><text class="t" x="380" y="165" text-anchor="middle">目标</text>
              <circle class="n" cx="180" cy="80" r="26"/><text class="t" x="180" y="85" text-anchor="middle">家人</text>
              <circle class="n" cx="620" cy="90" r="26"/><text class="t" x="620" y="95" text-anchor="middle">同事</text>
              <circle class="n" cx="560" cy="250" r="26"/><text class="t" x="560" y="255" text-anchor="middle">对手</text>
              <circle class="n" cx="200" cy="240" r="26"/><text class="t" x="200" y="245" text-anchor="middle">伙伴</text>
            </svg>
            <div class="legend">
              <span><i class="solid"></i>显性关系（股权/任职/合作）</span>
              <span><i class="dashed"></i>隐性关系（思想同盟/同群）</span>
              <span><i class="red"></i>对抗关系（诉讼/竞争/对立）</span>
            </div>
          </div>
          <p>{{显性 / 隐性 / 对抗关系的文字解读}}</p>
        </section>

        <!-- ============ 8. 时空行为建模 ============ -->
        <section>
          <h2 id="section-8"><span class="sec-num">TRAJECTORY</span>时空行为建模</h2>
          <div class="chart">
            <div class="chart-title">时间线 · 由 fireworks-tech-graph 生成后内联</div>
            <!-- ⬇ 图表插槽：用 fireworks-tech-graph 产出的 SVG 替换下方示例 -->
            <svg viewBox="0 0 760 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="时空行为时间线">
              <style>.ax{stroke:#262933;stroke-width:2}.pt{fill:#d4a24e}.tt{fill:#e8e6e0;font-size:13px;font-family:sans-serif}.ds{fill:#9b9aa3;font-size:12px;font-family:sans-serif}</style>
              <line class="ax" x1="40" y1="120" x2="720" y2="120"/>
              <circle class="pt" cx="100" cy="120" r="8"/><text class="tt" x="100" y="95" text-anchor="middle">20xx</text><text class="ds" x="100" y="145" text-anchor="middle">教育</text>
              <circle class="pt" cx="260" cy="120" r="8"/><text class="tt" x="260" y="95" text-anchor="middle">20xx</text><text class="ds" x="260" y="145" text-anchor="middle">入职</text>
              <circle class="pt" cx="430" cy="120" r="8"/><text class="tt" x="430" y="95" text-anchor="middle">20xx</text><text class="ds" x="430" y="145" text-anchor="middle">晋升</text>
              <circle class="pt" cx="620" cy="120" r="10" fill="#e05656"/><text class="tt" x="620" y="95" text-anchor="middle">20xx</text><text class="ds" x="620" y="145" text-anchor="middle">突变点</text>
            </svg>
          </div>
          <ul class="timeline">
            <li><div class="t-time">{{20xx}}</div><div class="t-title">{{关键事件}}</div><div class="t-desc">{{能力进化 / 认知疆域 / 突变原因}}</div></li>
            <li><div class="t-time">{{20xx}}</div><div class="t-title">{{关键事件}}</div><div class="t-desc">{{说明}}</div></li>
            <!-- ⬇ 按时间顺序填充，突变点用红色标记 -->
          </ul>
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
        a.textContent = h.textContent.replace(/^\s*\w+\s*/,''); // 去掉 sec-num 前缀
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
2. **图表**：`7. 关系网络拓扑` 与 `8. 时空行为建模` 的示例 SVG 必须替换为 `fireworks-tech-graph` 产出的 SVG（暗色 bg `#0f0f1a`、accent `#d4a24e`、最小字号 12px）。
3. **置信度徽章**：`conf-a / conf-b / conf-c / conf-d` 四类，配色与 `profile-schema.md` 一致。
4. **矛盾项**：证据存在多版本时，该项加 `conflict` 类（左侧琥珀竖线）。
5. **风险卡**：无公开风险时显示单条「未发现公开风险记录」中性卡，不强行造风险。
6. **反俗套自查**：无 emoji 图标、无紫蓝渐变、无空卡片；单一强调色 `#d4a24e`。
