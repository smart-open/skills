# -*- coding: utf-8 -*-
"""个股诊断报告生成器（数据驱动 + 参数化）。

用法：
  python generate_stock_report.py \
      --name 通鼎互联 --code 002491 \
      --data data/tdhl_analysis.json --kline data/tdhl_kline.json \
      --date 20260818 --outdir output

参数：
  --name  股票全称（如「通鼎互联」）。与 --code 至少提供一个，用于确定诊断目标。
  --code  股票代码（如 002491）。与 --name 至少提供一个。
  --exchange 交易所前缀（SZ / SH），默认取 JSON，再默认 SZ
  --date  报告基准日期（默认真实今日 YYYYMMDD，仅用于文件名与页脚标注）
  --data  个股分析 JSON（六维/SWOT/龙虎榜/筹码/价位/操作建议等）。
          缺省时按 name/code 推导 data/{name|code}_analysis.json，再回退 tdhl 样例。
  --kline 个股 K 线 JSON（含 closes 列表），用于 sparkline。
          缺省时按 name/code 推导，再回退 tdhl 样例。
  --outdir 输出目录（默认 output）

注意：持仓成本价不在此基础报告展示，统一由 rewrite_advice_v5.py 的 07「最终诊断
操作建议」章节呈现（成本若有，主要应用于操作建议）。
"""
import argparse
import os
from datetime import datetime

from _common import BASE, REPORT_ROOT, load_json, sparkline, dim_weight

ap = argparse.ArgumentParser(description="个股诊断报告生成器")
ap.add_argument("--name", default=None, help="股票全称；与 --code 至少提供一个，用于确定诊断目标")
ap.add_argument("--code", default=None, help="股票代码；与 --name 至少提供一个")
ap.add_argument("--exchange", default=None)
ap.add_argument("--date", default=datetime.now().strftime("%Y%m%d"), help="报告基准日期 YYYYMMDD，默认真实今日，仅用于文件名与页脚标注")
ap.add_argument("--data", default=None, help="个股分析 JSON；缺省按 name/code 推导 data/{name|code}_analysis.json，再回退 tdhl 样例")
ap.add_argument("--kline", default=None, help="个股 K 线 JSON；缺省按 name/code 推导，再回退 tdhl 样例")
ap.add_argument("--outdir", default=REPORT_ROOT)
args = ap.parse_args()

# name / code 至少提供一个，用于确定诊断目标
if not args.name and not args.code:
    ap.error("股票全称(--name) 与 股票代码(--code) 至少需提供一个，用于确定诊断目标")

# data / kline 按 name/code 智能推导（缺省回退 tdhl 样例）
if not args.data:
    cands = []
    if args.name:
        cands.append(os.path.join(BASE, "data", f"{args.name}_analysis.json"))
    if args.code:
        cands.append(os.path.join(BASE, "data", f"{args.code}_analysis.json"))
    for c in cands:
        if os.path.exists(c):
            args.data = c
            break
    if not args.data:
        args.data = os.path.join(BASE, "data/tdhl_analysis.json")
if not args.kline:
    cands = []
    if args.name:
        cands.append(os.path.join(BASE, "data", f"{args.name}_kline.json"))
    if args.code:
        cands.append(os.path.join(BASE, "data", f"{args.code}_kline.json"))
    for c in cands:
        if os.path.exists(c):
            args.kline = c
            break
    if not args.kline:
        args.kline = os.path.join(BASE, "data/tdhl_kline.json")

# ---------- 加载数据 ----------
D = load_json(args.data, {})
K = load_json(args.kline, {})

name = args.name or D.get("name", "Unknown")
code = args.code or D.get("code", "000000")
exchange = args.exchange or D.get("exchange", "SZ")
asof = D.get("asof", args.date)

# ---------- sparkline ----------
closes = K.get("closes", [])
pp = D.get("price_panel", {})
up60 = closes[-1] >= closes[-2] if len(closes) >= 2 else True
spark60 = sparkline(closes[-60:], up60, w=220, h=56, full_width=True)

# ---------- 六维评分（短线/中线双权重） ----------
dims = D.get("dims", [])


def _score(horizon):
    s = sum((d.get("score", 0) or 0) * dim_weight(d, horizon) for d in dims)
    wsum = sum(dim_weight(d, horizon) for d in dims)
    return round(s / wsum, 2) if wsum else 0.0


total_short = _score("short")
total_mid = _score("mid")
rating_short = "中性 · 观望" if total_short < 6.5 else "推荐"
rating_mid = "中性 · 观望" if total_mid < 6.5 else "推荐"
pct_short = total_short * 10
pct_mid = total_mid * 10

# ---------- SWOT ----------
swot = D.get("swot", {})
swot_colors = [("S", "优势", "#ff4d5e"), ("W", "劣势", "#2bd99f"),
               ("O", "机会", "#4f8cff"), ("T", "威胁", "#ffb454")]

# ---------- 估值分情景 ----------
scenarios = D.get("scenarios", [])
scen_note = D.get("scenarios_note", "")

# ---------- 龙虎榜 ----------
lhb = D.get("lhb", {})
lhb_buy = lhb.get("buy", [])
lhb_sell = lhb.get("sell", [])

# ---------- 筹码与股东 ----------
chip = D.get("chip", {})
holders = D.get("holders", [])
holders_note = D.get("holders_note", "")

# ---------- 关键价位 ----------
levels = D.get("levels", {})
support = levels.get("support", [])
resist = levels.get("resist", [])

# ---------- 持仓成本价 ----------
# 说明：成本价不在此基础报告展示，统一交由 07「最终诊断操作建议」章节(v5)呈现，
# 符合"成本若有主要应用于操作建议"的口径。

# ---------- 构建 HTML 片段 ----------
dims_html = ""
for d in dims:
    _sc = d.get("score", 0) or 0
    _ws = int(dim_weight(d, "short"))
    _wm = int(dim_weight(d, "mid"))
    dims_html += f'''
    <div class="dim">
      <div class="dim-head"><span class="dim-code">{d.get('code', '')}</span><span class="dim-name">{d.get('name', '')}</span>
      <span class="dim-weight">短线 {_ws}% · 中线 {_wm}%</span><span class="dim-score">{_sc}<em>/10</em></span></div>
      <div class="dim-bar"><i style="width:{_sc * 10}%"></i></div>
      <p class="dim-detail">{d.get('detail', '')}</p>
      <p class="dim-verdict">→ {d.get('verdict', '')}</p>
    </div>'''

swot_html = ""
for key, label, color in swot_colors:
    items = "".join(f"<li>{x}</li>" for x in swot.get(key, []))
    swot_html += f'''
    <div class="swot-q" style="border-top:2px solid {color}">
      <h4 style="color:{color}">{label}</h4><ul>{items}</ul>
    </div>'''

scen_html = ""
for s in scenarios:
    scen_html += f'''
    <div class="scen"><span class="scen-name">{s.get('name', '')}</span><span class="scen-cond">{s.get('cond', '')}</span>
    <span class="scen-val" style="color:{s.get('color', '#7b89a8')}">{s.get('val', '')}</span></div>'''

lhb_buy_html = "".join(
    f'<tr><td>{n}</td><td class="mono" style="color:{c}">{amt}</td><td class="muted">{t}</td></tr>'
    for n, amt, t, c in lhb_buy)
lhb_sell_html = "".join(
    f'<tr><td>{n}</td><td class="mono" style="color:{c}">{amt}</td><td class="muted">{t}</td></tr>'
    for n, amt, t, c in lhb_sell)

chip_html = f'''
    <div class="chip-grid">
      <div class="chip-box"><div class="cv warn">{chip.get('holders', '—')}</div><div class="cl">股东户数</div><div class="cs" style="color:#ff4d5e">{chip.get('holders_note', '')}</div></div>
      <div class="chip-box"><div class="cv">{chip.get('avg_cost', '—')}</div><div class="cl">筹码平均成本</div><div class="cs muted">现价 {pp.get('price', '—')} 元</div></div>
      <div class="chip-box"><div class="cv up">{chip.get('profit', '—')}</div><div class="cl">筹码盈利率</div><div class="cs muted">{chip.get('profit_note', '')}</div></div>
      <div class="chip-box"><div class="cv">{chip.get('top10', '—')}</div><div class="cl">前十大股东占比</div><div class="cs muted">{chip.get('top10_note', '')}</div></div>
    </div>'''
holders_html = "".join(
    f'<tr><td>{n}</td><td class="mono">{p}</td><td class="muted">{t}</td></tr>'
    for n, p, t in holders)

support_html = "".join(f'<div class="row"><span>{lbl}</span><span class="mono">{v}</span></div>' for lbl, v in support)
resist_html = "".join(f'<div class="row"><span>{lbl}</span><span class="mono">{v}</span></div>' for lbl, v in resist)

risk06 = D.get("risk_06", [])
risk06_html = "".join(
    f'<li><b>{t}</b>：{d}</li>' for t, d in risk06)

html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{name}({code}) 个股诊断报告</title>
<style>
:root{{
  --bg:#0a0e1a; --sur:#111827; --sur2:#161e30; --line:#1f2a45; --glow:#2a3a66;
  --txt:#e8edf8; --muted:#7b89a8; --acc:#4f8cff; --acc2:#22d3ee;
  --up:#ff4d5e; --down:#2bd99f; --warn:#ffb454; --gold:#f5c451;
}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:var(--bg);color:var(--txt);
  background-image:linear-gradient(rgba(79,140,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(79,140,255,.04) 1px,transparent 1px);
  background-size:44px 44px;
  font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif;line-height:1.65;-webkit-font-smoothing:antialiased}}
.mono,.num,.dim-score,.kpi .v,.scen-val{{font-family:"Cascadia Code","JetBrains Mono",Consolas,monospace}}
.wrap{{max-width:1000px;margin:0 auto;padding:0 28px 80px}}
h1,h2,h3,h4{{font-weight:600;line-height:1.3}}
.up{{color:var(--up)}} .down{{color:var(--down)}} .muted{{color:var(--muted)}} .warn{{color:var(--warn)}}

.topbar{{display:flex;justify-content:space-between;align-items:center;padding:20px 0;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted)}}
.brand{{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;color:var(--txt);letter-spacing:1px}}
.brand .logo{{width:9px;height:9px;border-radius:2px;background:linear-gradient(135deg,var(--acc),var(--acc2));box-shadow:0 0 8px rgba(79,140,255,.8)}}

.hero{{padding:40px 0 28px;border-bottom:1px solid var(--line)}}
.hero-head{{display:flex;align-items:baseline;gap:18px;flex-wrap:wrap}}
.hero h1{{font-size:38px;letter-spacing:-.5px}}
.hero .code{{font-size:15px;color:var(--muted);font-family:"Cascadia Code",monospace}}
.hero .tag-row{{margin-top:10px;display:flex;gap:8px;flex-wrap:wrap}}
.tag{{font-size:11px;color:var(--acc2);border:1px solid rgba(34,211,238,.35);border-radius:3px;padding:1px 8px;background:rgba(34,211,238,.06)}}

.overview{{display:grid;grid-template-columns:1.2fr .8fr;gap:20px;padding:26px 0;border-bottom:1px solid var(--line)}}
.price-panel{{background:var(--sur);border:1px solid var(--line);border-radius:12px;padding:20px}}
.price-top{{display:flex;align-items:baseline;gap:14px;margin-bottom:10px}}
.price{{font-size:44px;font-weight:700;letter-spacing:-1px}}
.chg{{font-size:20px;font-weight:600}}
.kpi-row{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:16px}}
.kpi{{background:var(--sur2);border:1px solid var(--line);border-radius:8px;padding:10px;text-align:center}}
.kpi .v{{font-size:16px;font-weight:600}}
.kpi .l{{font-size:10px;color:var(--muted);margin-top:2px}}
.score-panel{{background:var(--sur);border:1px solid var(--line);border-radius:12px;padding:20px;display:flex;flex-direction:column;justify-content:center;align-items:center}}
.score-rings{{display:flex;gap:18px;justify-content:center;align-items:center}}
.score-ring{{width:124px;height:124px;border-radius:50%;background:conic-gradient(var(--acc) var(--pct), var(--sur2) 0);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative}}
.score-ring::before{{content:"";position:absolute;width:100px;height:100px;border-radius:50%;background:var(--sur)}}
.score-num{{position:relative;font-size:27px;font-weight:700;font-family:"Cascadia Code",monospace;line-height:1}}
.score-sub{{position:relative;font-size:10px;color:var(--muted);margin-top:3px}}
.score-label{{position:relative;font-size:11px;color:var(--muted);margin-top:12px}}
.rating-badge{{margin-top:14px;font-size:14px;font-weight:600;color:var(--warn);border:1px solid rgba(255,180,84,.4);border-radius:6px;padding:4px 16px;background:rgba(255,180,84,.08)}}

.section{{padding:34px 0;border-bottom:1px solid var(--line)}}
.section-head{{display:flex;align-items:baseline;gap:14px;margin-bottom:20px}}
.section-head .no{{font-family:"Cascadia Code",monospace;font-size:13px;color:var(--acc)}}
.section-head h2{{font-size:22px}}
.section-head .line{{flex:1;height:1px;background:linear-gradient(90deg,var(--line),transparent)}}

.dim{{padding:16px 0;border-bottom:1px solid var(--line)}}
.dim:last-child{{border-bottom:none}}
.dim-head{{display:flex;align-items:baseline;gap:12px}}
.dim-code{{font-family:"Cascadia Code",monospace;font-size:14px;color:var(--acc)}}
.dim-name{{font-size:16px;font-weight:600}}
.dim-weight{{font-size:11px;color:var(--muted)}}
.dim-score{{margin-left:auto;font-size:20px;font-weight:700}}
.dim-score em{{font-style:normal;font-size:12px;color:var(--muted)}}
.dim-bar{{height:8px;background:var(--sur2);border-radius:3px;margin:8px 0;overflow:hidden}}
.dim-bar i{{display:block;height:100%;background:linear-gradient(90deg,var(--acc),var(--acc2));box-shadow:0 0 8px rgba(79,140,255,.4)}}
.dim-detail{{font-size:13px;color:var(--muted);line-height:1.7}}
.dim-verdict{{font-size:13px;color:var(--acc2);margin-top:4px}}

.swot{{display:grid;grid-template-columns:1fr 1fr;gap:14px}}
.swot-q{{background:var(--sur);border:1px solid var(--line);border-radius:10px;padding:16px}}
.swot-q h4{{font-size:15px;margin-bottom:10px}}
.swot-q ul{{list-style:none}}
.swot-q li{{font-size:13px;color:var(--muted);padding:5px 0 5px 14px;position:relative;line-height:1.5}}
.swot-q li::before{{content:"";position:absolute;left:0;top:13px;width:5px;height:5px;border-radius:50%;background:var(--acc)}}

.scen{{display:grid;grid-template-columns:70px 1fr 120px;gap:14px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)}}
.scen-name{{font-weight:600;font-size:14px}}
.scen-cond{{font-size:13px;color:var(--muted)}}
.scen-val{{font-size:15px;font-weight:600;text-align:right}}

.section-head .desc{{font-size:12px;color:var(--muted)}}
.lhb-cols{{display:grid;grid-template-columns:1fr 1fr;gap:24px}}
.lhb-cols table{{width:100%;border-collapse:collapse;font-size:13px}}
.lhb-cols th{{text-align:left;font-size:11px;font-weight:500;color:var(--muted);padding:7px 8px;border-bottom:1px solid var(--glow)}}
.lhb-cols td{{padding:7px 8px;border-bottom:1px solid var(--line)}}
.chip-grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}}
.chip-box{{background:var(--sur);border:1px solid var(--line);border-radius:10px;padding:14px;text-align:center}}
.chip-box .cv{{font-size:22px;font-weight:700;font-family:"Cascadia Code",monospace}}
.chip-box .cl{{font-size:11px;color:var(--muted);margin-top:3px}}
.chip-box .cs{{font-size:11px;margin-top:4px}}

.level{{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px}}
.level-box{{background:var(--sur);border:1px solid var(--line);border-radius:10px;padding:16px}}
.level-box h4{{font-size:14px;margin-bottom:10px}}
.level-box .row{{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed var(--line);font-size:13px}}
.level-box .row:last-child{{border-bottom:none}}

.warn-box{{background:rgba(255,77,94,.06);border:1px solid rgba(255,77,94,.3);border-radius:10px;padding:16px 18px;font-size:13px;line-height:1.8}}
.warn-box b{{color:var(--up)}}
.warn-box ul{{margin:8px 0 0 18px}}
.warn-box li{{margin:4px 0}}

footer{{padding:32px 0 0;font-size:11px;color:var(--muted);line-height:1.8}}
footer .disc{{margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}}

@media(max-width:760px){{
  .overview,.swot,.level,.lhb-cols{{grid-template-columns:1fr}}
  .chip-grid{{grid-template-columns:repeat(2,1fr)}}
  .hero h1{{font-size:30px}}
  .kpi-row{{grid-template-columns:repeat(2,1fr)}}
}}
</style>
</head>
<body>
<div class="wrap">

<div class="topbar">
  <span class="brand"><span class="logo"></span>个股诊断 · STOCK DIAGNOSIS</span>
  <span>数据截至 {asof} 收盘</span>
</div>

<div class="hero">
  <div class="hero-head">
    <h1>{name}</h1><span class="code">{exchange} {code}</span>
  </div>
  <div class="tag-row">
    {''.join(f'<span class="tag">{t}</span>' for t in D.get("tags", []))}
  </div>
</div>

<div class="overview">
  <div class="price-panel">
    <div class="price-top"><span class="price">{pp.get('price', '—')}</span><span class="chg {'up' if pp.get('up') else 'down'}">{pp.get('chg', '')}</span></div>
    <div class="spark">{spark60}</div>
    <div class="kpi-row">
      <div class="kpi"><div class="v">{pp.get('market_cap', '—')}</div><div class="l">市值</div></div>
      <div class="kpi"><div class="v warn">{pp.get('pb', '—')}</div><div class="l">{pp.get('pb_note', '')}</div></div>
      <div class="kpi"><div class="v">{pp.get('turnover', '—')}</div><div class="l">换手率</div></div>
      <div class="kpi"><div class="v">{pp.get('amount', '—')}</div><div class="l">成交额</div></div>
    </div>
  </div>
  <div class="score-panel">
    <div class="score-rings">
      <div class="score-ring" style="--pct:{pct_short}%"><span class="score-num">{total_short}</span><span class="score-sub">短线</span></div>
      <div class="score-ring" style="--pct:{pct_mid}%"><span class="score-num">{total_mid}</span><span class="score-sub">中线</span></div>
    </div>
    <div class="score-label">六维综合评分（满分10 · 短线/中线双权重）</div>
    <div class="rating-badge">短线 {rating_short} · 中线 {rating_mid}</div>
  </div>
</div>

<div class="section">
  <div class="section-head"><span class="no">01</span><h2>六维诊断</h2><span class="desc">评分 × 短线/中线双权重</span><span class="line"></span></div>
  {dims_html}
</div>

<div class="section">
  <div class="section-head"><span class="no">02</span><h2>SWOT 矩阵</h2><span class="line"></span></div>
  <div class="swot">{swot_html}</div>
</div>

<div class="section">
  <div class="section-head"><span class="no">03</span><h2>估值分情景</h2><span class="line"></span></div>
  {scen_html}
  <p class="muted" style="font-size:12px;margin-top:12px">{scen_note}</p>
</div>

<div class="section">
  <div class="section-head"><span class="no">04</span><h2>龙虎榜席位</h2><span class="desc">{lhb.get('date', '')} · {lhb.get('desc', '')}</span><span class="line"></span></div>
  <p class="muted" style="font-size:12px;margin-bottom:14px">合计买入 {lhb.get('buy_total', '—')} · 卖出 {lhb.get('sell_total', '—')} · 净买入 {lhb.get('net', '—')}；机构净买仅 <b style="color:var(--warn)">{lhb.get('inst_net', '—')}</b>，深股通净卖 <b style="color:var(--down)">{lhb.get('north_net', '—')}</b>，营业部席位净买 {lhb.get('seat_net', '—')} → 游资主导。</p>
  <div class="lhb-cols">
    <div>
      <h4 style="font-size:14px;margin-bottom:10px;color:var(--up)">买入前五</h4>
      <table><tr><th>席位</th><th>金额</th><th>类型</th></tr>{lhb_buy_html}</table>
    </div>
    <div>
      <h4 style="font-size:14px;margin-bottom:10px;color:var(--down)">卖出前五</h4>
      <table><tr><th>席位</th><th>金额</th><th>类型</th></tr>{lhb_sell_html}</table>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-head"><span class="no">05</span><h2>筹码与股东结构</h2><span class="desc">筹码集中度 & 前十大股东</span><span class="line"></span></div>
  {chip_html}
  <h4 style="font-size:14px;margin:18px 0 10px">前十大股东（2026 一季报）</h4>
  <table><tr><th>股东</th><th>持股</th><th>性质</th></tr>{holders_html}</table>
  <p class="muted" style="font-size:12px;margin-top:10px">{holders_note}</p>
</div>

<div class="section">
  <div class="section-head"><span class="no">06</span><h2>关键价位</h2><span class="line"></span></div>
  <div class="level">
    <div class="level-box">
      <h4 class="down">支撑位</h4>
      {support_html}
    </div>
    <div class="level-box">
      <h4 class="up">压力位</h4>
      {resist_html}
    </div>
  </div>
  <div class="warn-box">
    <b>⚠️ 避坑提示（观察评级 · 非买卖建议）</b>
    <ul>
      {risk06_html}
    </ul>
  </div>
</div>

<footer>
  <p>数据来源：公开行情数据（腾讯财经、东方财富、同花顺、新浪财经）与公开财经资讯聚合整理，数据截至 {asof} 收盘。盘中数据可能滞后。</p>
  <p class="disc">以上分析基于公开数据，仅供研究参考，不构成投资建议。股市有风险，投资需谨慎。文中评分与评级为模型量化输出，不构成任何买卖依据。</p>
</footer>

</div>
</body>
</html>'''

os.makedirs(args.outdir, exist_ok=True)
out = os.path.join(args.outdir, f"{name}_个股诊断_{args.date}.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("个股报告已生成:", out)
print(f"六维综合评分: 短线 {total_short}（{rating_short}） · 中线 {total_mid}（{rating_mid}）")
