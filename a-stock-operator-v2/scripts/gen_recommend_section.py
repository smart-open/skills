# -*- coding: utf-8 -*-
import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
"""生成个股推荐章节并合并进 HTML 报告"""
import json

rec = json.load(open(os.path.join(BASE, "data/recommend_20260814.json"), encoding="utf-8"))
fb = {x["code"]: x for x in rec["first_board"]}
gb = {x["code"]: x for x in rec["breakout"]}

# 精选标的 + 题材/评级（评级：重点关注 / 可跟踪）
first_pick = [
    ("600487", "光纤光缆+硅光芯片+CPO+海洋通信", "重点关注", "CPO/算力主线高度契合"),
    ("002988", "机器人轻量化+液冷散热+汽车轻量化", "重点关注", "机器人+液冷双主线"),
    ("603618", "光纤光缆+定增扩产+PCB铜箔", "可跟踪", "算力硬件链"),
    ("603095", "AI验布机+纺织机械+高端装备", "可跟踪", "AI应用落地"),
    ("603089", "机器人概念+汽车减震器龙头", "可跟踪", "机器人+汽车链"),
]
break_pick = [
    ("002437", "创新药", "重点关注", "量比6.67显著放量"),
    ("603890", "消费电子结构件(AI硬件)", "重点关注", "涨幅8.02%+均线多头"),
    ("002190", "中航系+国企改革+军工", "可跟踪", "回撤57%深跌低位"),
    ("601890", "船舶锚链+军工船配", "可跟踪", "低位+量能温和放大"),
    ("603655", "汽车橡胶密封件", "可跟踪", "量比3.32放量"),
]

RED, GREEN, SUB, ACC, WARN, GOLD = "#ff6b6b", "#37d39a", "#9aa3b2", "#5b8cff", "#ffb454", "#f5c451"

def price_fmt(v):
    return f"{v:.2f}" if v else "--"

def chg_cls(v):
    return RED if v and v > 0 else GREEN

def make_card(codes_picks, source):
    cards = ""
    for code, theme, rating, note in codes_picks:
        m = source.get(code)
        if not m:
            continue
        # 关键价位
        support = m.get("ma21") or m.get("ma6") or 0
        resist = m.get("high250") or 0
        star = "★★★" if rating == "重点关注" else "★★"
        rating_cls = "r-hot" if rating == "重点关注" else "r-track"
        cards += f'''
      <div class="stock-card">
        <div class="sc-head">
          <span class="sc-name">{m["name"]}</span>
          <span class="sc-code">{code}</span>
          <span class="sc-star">{star}</span>
        </div>
        <div class="sc-theme">{theme}</div>
        <div class="sc-grid">
          <div class="sc-kpi"><span class="k">现价</span><span class="v">{price_fmt(m.get("price"))}</span></div>
          <div class="sc-kpi"><span class="k">涨幅</span><span class="v" style="color:{RED}">{m.get("chg_pct"):+.1f}%</span></div>
          <div class="sc-kpi"><span class="k">回撤</span><span class="v" style="color:{WARN}">-{m.get("drawdown")}%</span></div>
          <div class="sc-kpi"><span class="k">量比</span><span class="v" style="color:{ACC}">{m.get("vol_ratio")}</span></div>
        </div>
        <div class="sc-level">支撑 <b style="color:{GREEN}">{price_fmt(support)}</b> · 压力 <b style="color:{RED}">{price_fmt(resist)}</b></div>
        <div class="sc-foot">
          <span class="badge {rating_cls}">{rating}</span>
          <span class="sc-note">{note}</span>
        </div>
      </div>'''
    return cards

first_html = make_card(first_pick, fb)
break_html = make_card(break_pick, gb)

section = f'''
<div class="section" id="recommend">
  <h2>六、个股推荐（参考 a-stock-operator 方法论）</h2>
  <div class="warn-box" style="margin-bottom:16px">
    本次选股范围：<b>沪市主板 + 深市主板</b>（默认排除创业板 300/301、科创板 688），ST/*ST 已排除。评级为「观察评级」而非买卖建议，仅作跟踪参考。
  </div>

  <div class="sub-sec">
    <h3 class="sub-title">① 主板首板 · 低位突破（5 只）</h3>
    <p class="sub-desc">今日首板涨停 + 距高点回撤 ≥30% 或近 60 日深度回调 + 站上均线/突破信号</p>
    <div class="stock-grid">{first_html}
    </div>
  </div>

  <div class="sub-sec" style="margin-top:20px">
    <h3 class="sub-title">② 主板突破 + 放量 + 热点（5 只，涨幅 5%+ 非涨停）</h3>
    <p class="sub-desc">涨幅 5%~9.9% + 突破 6/21 均线（多头排列）+ 放量 + 契合当日热点题材</p>
    <div class="stock-grid">{break_html}
    </div>
  </div>
</div>
'''

# 追加 CSS 到现有报告（在 </style> 前插入）
css = '''
/* 个股推荐 */
.sub-sec{{margin-bottom:18px}}
.sub-title{{font-size:15px;color:var(--txt);margin-bottom:4px}}
.sub-desc{{font-size:12px;color:var(--sub);margin-bottom:12px}}
.stock-grid{{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}}
.stock-card{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}}
.sc-head{{display:flex;align-items:center;gap:8px;margin-bottom:6px}}
.sc-name{{font-size:15px;font-weight:700}}
.sc-code{{color:var(--sub);font-size:12px}}
.sc-star{{color:var(--gold);font-size:13px;margin-left:auto}}
.sc-theme{{font-size:12px;color:var(--acc);margin-bottom:10px;line-height:1.5}}
.sc-grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}}
.sc-kpi{{text-align:center}}
.sc-kpi .k{{display:block;font-size:11px;color:var(--sub)}}
.sc-kpi .v{{display:block;font-size:14px;font-weight:600;margin-top:2px}}
.sc-level{{font-size:12px;color:var(--sub);margin-bottom:8px}}
.sc-foot{{display:flex;align-items:center;gap:8px}}
.badge{{font-size:11px;padding:2px 8px;border-radius:4px;font-weight:600}}
.r-hot{{background:rgba(255,107,107,.15);color:var(--red);border:1px solid rgba(255,107,107,.4)}}
.r-track{{background:rgba(255,180,84,.12);color:var(--warn);border:1px solid rgba(255,180,84,.4)}}
.sc-note{{font-size:11px;color:var(--sub)}}
@media(max-width:768px){{.stock-grid{{grid-template-columns:1fr}}}}
'''

path = os.path.join(BASE, "output/行情复盘_20260814.html")
html = open(path, encoding="utf-8").read()

# 插入 CSS
html = html.replace("</style>", css + "</style>")
# 插入推荐章节（在 footer 前）
html = html.replace("<footer>", section + "\n<footer>")

open(path, "w", encoding="utf-8").write(html)
print("推荐章节已合并进报告")

# 同时输出精选明细供对话摘要
print("\n=== 首板低位突破 ===")
for code, theme, rating, note in first_pick:
    m = fb[code]
    print(f"  {m['name']}({code}) {m['hybk']} 回撤{m['drawdown']}% 量比{m['vol_ratio']} | {theme} [{rating}]")
print("=== 突破放量热点 ===")
for code, theme, rating, note in break_pick:
    m = gb[code]
    print(f"  {m['name']}({code}) 涨{m['chg_pct']}% 回撤{m['drawdown']}% 量比{m['vol_ratio']} | {theme} [{rating}]")
