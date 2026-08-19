# -*- coding: utf-8 -*-
import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
"""重新生成 A股行情复盘报告 —— 杂志编辑风（浅底墨字 + 衬线标题 + 分隔线组织层次）
按 impeccable / frontend-dev 规范：避免暗色霓虹卡片堆叠，改用暖米白纸感 + 克制财经红绿
"""
import json
from collections import Counter

d = json.load(open(os.path.join(BASE, "data/market_20260814.json"), encoding="utf-8"))
rec = json.load(open(os.path.join(BASE, "data/recommend_20260814.json"), encoding="utf-8"))

# ================= 数据准备 =================
indexes = d["indexes"]
lu = d["limit_up"]["list"]; total_up = d["limit_up"]["total"]
zb = d["broken"]["list"]; total_zb = d["broken"]["total"]
total_dn = d["limit_down"]["total"]
breadth = d["breadth"]
seal_rate = round(total_up / (total_up + total_zb) * 100, 1)
break_rate = round(total_zb / (total_up + total_zb) * 100, 1)
max_lbc = max((x["lbc"] for x in lu), default=0)
up_ratio = round(breadth["up"] / breadth["down"], 2) if breadth["down"] else 0
sh_amt = next((x["amount_yi"] for x in indexes if x["code"] == "000001"), 0)
sz_amt = next((x["amount_yi"] for x in indexes if x["code"] == "399001"), 0)
total_amt = sh_amt + sz_amt

# 连板梯队
lbc_counter = Counter(x["lbc"] for x in lu)
ladder = sorted(lbc_counter.items(), reverse=True)

# 涨停行业
hy_counter = Counter(x["hybk"] for x in lu)

# 题材词频（主题归并）
raw = []
for r in d["hot_reason"]["rows"]:
    raw += [t for t in r["reason"].replace("+", " ").split() if t]
tc = Counter(raw)
theme_map = {
    "算力/AI服务器": ["算力", "算力租赁", "AI算力", "AI服务器", "算力调度", "IDC", "算力中心"],
    "CPO/光模块": ["CPO", "光芯片", "光模块", "磷化铟", "硅光", "硅光芯片"],
    "液冷散热": ["液冷", "液冷服务器", "液冷散热"],
    "创新药/医药": ["创新药", "化学制药", "医药商业", "中药", "CRO", "脑机接口"],
    "中报业绩": ["半年报增长", "中报预增", "半年报预增", "业绩预增", "扭亏"],
    "机器人": ["机器人", "人形机器人", "工业机器人"],
    "国企改革": ["央企", "国企改革", "国资", "中特估"],
}
themes = [(k, sum(tc.get(w, 0) for w in ws)) for k, ws in theme_map.items() if sum(tc.get(w, 0) for w in ws) > 0]
themes.sort(key=lambda x: -x[1])

# 主线题材（人工归并）
main_lines = [
    ("AI 算力 / CPO / 光模块", "通信设备 6 只涨停领跑，CPO 词频最高；网宿科技、中石科技、富信科技 20cm，中际旭创入股中石科技带动 CPO 散热链"),
    ("创新药 / 医药", "博济医药、西点药业 20cm，创新药、医药商业多股涨停，脑机接口（澳洋健康 3 连板）活跃"),
    ("中报业绩预增", "半年报增长 + 中报预增共 8 次，大豪科技等叠加机器人/算力走强"),
    ("机器人 / 工业母机", "机器人词频 4 次，与算力、自动化设备共振"),
    ("国企改革 / 央企", "央企 + 国企改革主线，华西股份、澳洋健康等叠加国资背景"),
]

# 政策 Top5
policies = [
    ("1", "数据中心液冷技术国标发布", "产业政策", "★★★★★", "液冷散热成 AI 算力确定性配套，康盛股份涨停、中石科技 20cm", "康盛股份 · 中石科技 · 豪美新材"),
    ("2", "中芯国际业绩会：AI 配套芯片供不应求", "产业基本面", "★★★★★", "晶圆均价环比 +5.7%、产能利用率维持 95% 高位，强化半导体/算力景气度", "中芯国际 · 华虹公司 · 网宿科技"),
    ("3", "江苏出台商业航天政策", "政策催化", "★★★★", "支持火箭整机制造、卫星核心元器件，龙头对接资本市场", "利君股份 · 成飞集成 · 航发科技"),
    ("4", "创新药占比达 53% + 药监局再批新药", "政策+数据", "★★★★", "抗肿瘤药市场创新药占半壁江山，卖方医药路演热度追平科技", "博济医药 · 誉衡药业 · 华森制药"),
    ("5", "南亚铜箔基板再涨 20% + 钽价飙升 158%", "涨价催化", "★★★", "PCB/CCL 与稀有金属供给扰动共振，电子化学品持续走强", "华正新材 · 中国稀土 · 北方稀土"),
]

# 板块 Top3
hot_sectors = [
    ("1", "AI 算力 / CPO / 液冷", "★★★★★", "液冷国标落地 + 中芯 AI 需求 + 机构定调 + 通信资金净流入超百亿，催化密集且可延续",
     [("亨通光电", "600487", "光纤+硅光+CPO"), ("网宿科技", "300017", "算力租赁 20cm"), ("阿莱德", "301419", "CPO 散热 20cm"), ("康盛股份", "002418", "数据中心液冷")]),
    ("2", "创新药 / CRO / 医药", "★★★★", "药监局批准 + 创新药占比 53% + 卖方路演热度追平科技，政策与数据双催化",
     [("博济医药", "300404", "CRO 20cm 2连板"), ("誉衡药业", "002437", "创新药 放量"), ("神奇制药", "600613", "化学制药 2连板"), ("华森制药", "002907", "创新药+中成药")]),
    ("3", "稀有金属 / 稀土 / 铜", "★★★", "抢铜潮 + 钽价飙升 158% + 铜箔涨价 20%，涨价与供给扰动共振",
     [("中国稀土", "000831", "稀土 涨停"), ("北方稀土", "600111", "稀土 涨超3%"), ("豪美新材", "002988", "工业金属+液冷 首板")]),
]

# 个股推荐
fb_map = {x["code"]: x for x in rec["first_board"]}
gb_map = {x["code"]: x for x in rec["breakout"]}
first_pick = [
    ("600487", "光纤光缆+硅光芯片+CPO", "重点关注"),
    ("002988", "机器人轻量化+液冷散热", "重点关注"),
    ("603618", "光纤光缆+PCB铜箔", "可跟踪"),
    ("603095", "AI验布机+高端装备", "可跟踪"),
    ("603089", "机器人+汽车减震器龙头", "可跟踪"),
]
break_pick = [
    ("002437", "创新药", "重点关注"),
    ("603890", "消费电子结构件(AI硬件)", "重点关注"),
    ("002190", "中航系+国企改革+军工", "可跟踪"),
    ("601890", "船舶锚链+军工船配", "可跟踪"),
    ("603655", "汽车橡胶密封件", "可跟踪"),
]

# ================= 辅助函数 =================
def c(v):
    try: v = float(v)
    except: return "#6f6a60"
    return "#c0392b" if v > 0 else ("#17805a" if v < 0 else "#6f6a60")

def s(v):
    try: v = float(v)
    except: return str(v)
    return f"{v:+.2f}%" if abs(v) < 100 else f"{v:+.1f}%"

def fmt_px(v): return f"{v:,.2f}"

# 指数涨跌条（相对最大涨跌幅）
max_abs = max([abs(x["change_pct"]) for x in indexes], default=1) or 1
idx_rows = ""
for x in indexes:
    col = c(x["change_pct"])
    w = max(abs(x["change_pct"]) / max_abs * 100, 3)
    idx_rows += f'''
      <div class="idx-row">
        <span class="idx-name">{x["name"]}</span>
        <span class="idx-price">{fmt_px(x["price"])}</span>
        <span class="idx-bar"><i style="width:{w}%;background:{col}"></i></span>
        <span class="idx-chg" style="color:{col}">{s(x["change_pct"])}</span>
      </div>'''

# 涨跌家数分布
up_pct = round(breadth["up"] / breadth["total"] * 100, 1)
dn_pct = round(breadth["down"] / breadth["total"] * 100, 1)
fl_pct = round(100 - up_pct - dn_pct, 1)

# 连板梯队（阶梯视觉）
max_lb = max([v for k, v in ladder], default=1)
ladder_rows = ""
for k, v in ladder:
    names = "、".join(x["name"] for x in sorted(lu, key=lambda z: -z["lbc"]) if x["lbc"] == k)
    ladder_rows += f'''
      <div class="ladder-row">
        <span class="ladder-lv lv-{k}">{k}板</span>
        <span class="ladder-count">{v}<em>家</em></span>
        <span class="ladder-bar"><i style="width:{v / max_lb * 100}%"></i></span>
        <span class="ladder-names">{names}</span>
      </div>'''

# 题材词频条
max_theme = max([c for _, c in themes], default=1)
theme_rows = ""
for name, cnt in themes:
    theme_rows += f'''
      <div class="bar-row"><span class="bar-label">{name}</span>
      <span class="bar-track"><i style="width:{cnt / max_theme * 100}%"></i></span>
      <span class="bar-val">{cnt}</span></div>'''

# 涨停行业条
max_hy = max([c for _, c in hy_counter.most_common(8)], default=1)
hy_rows = ""
for k, v in hy_counter.most_common(8):
    hy_rows += f'''
      <div class="bar-row"><span class="bar-label">{k}</span>
      <span class="bar-track"><i class="accent" style="width:{v / max_hy * 100}%"></i></span>
      <span class="bar-val">{v}</span></div>'''

# 板块涨跌
sec_top = d["sectors"][:10]; sec_bottom = d["sectors"][-5:]
def sec_tr(rows):
    h = ""
    for x in rows:
        h += f'<tr><td>{x["name"]}</td><td class="num" style="color:{c(x["chg_pct"])}">{s(x["chg_pct"])}</td><td class="muted">{x["leader_name"]}</td></tr>'
    return h
sec_top_html = sec_tr(sec_top); sec_bottom_html = sec_tr(sec_bottom)

# 涨幅/跌幅榜
def gd_tr(rows):
    h = ""
    for r in rows:
        h += f'<tr><td>{r["name"]}</td><td class="muted">{r["code"]}</td><td class="num" style="color:{c(r["chg"])}">{s(r["chg"])}</td></tr>'
    return h
gain_html = gd_tr(breadth["top_gainers"][:10]); loss_html = gd_tr(breadth["top_losers"][:10])

# 炸板
zb_rows = ""
for x in zb[:14]:
    zb_rows += f'<tr><td>{x["name"]}</td><td class="muted">{x["hybk"]}</td><td class="num">炸{x["zbc"]}次</td><td class="num" style="color:{c(x["chg_pct"])}">{s(x["chg_pct"])}</td></tr>'

# 主线题材
main_lines_html = ""
for i, (n, desc) in enumerate(main_lines, 1):
    main_lines_html += f'''
    <div class="line-item"><span class="line-no">{i:02d}</span>
    <div class="line-body"><h4>{n}</h4><p>{desc}</p></div></div>'''

# 政策
policy_html = ""
for no, title, tag, star, impact, stocks in policies:
    policy_html += f'''
    <div class="policy">
      <div class="policy-head"><span class="policy-no">{no}</span>
      <h4>{title}</h4><span class="policy-star">{star}</span></div>
      <div class="policy-meta"><span class="tag">{tag}</span></div>
      <p class="policy-impact">{impact}</p>
      <p class="policy-stocks">受益：{stocks}</p>
    </div>'''

# 板块
sector_html = ""
for no, name, star, logic, stocks in hot_sectors:
    chips = ""
    for sn, sc, st in stocks:
        chips += f'<div class="chip"><b>{sn}</b><span>{sc}</span><em>{st}</em></div>'
    sector_html += f'''
    <div class="sector">
      <div class="sector-head"><span class="sector-rank">{no}</span>
      <h4>{name}</h4><span class="sector-star">{star}</span></div>
      <p class="sector-logic">{logic}</p>
      <div class="chips">{chips}</div>
    </div>'''

# 个股推荐
def stock_cards(picks, source):
    h = ""
    for code, theme, rating in picks:
        m = source.get(code)
        if not m: continue
        sup = m.get("ma21") or m.get("ma6") or 0
        res = m.get("high250") or 0
        hot = rating == "重点关注"
        cls = "hot" if hot else "track"
        label = "重点关注" if hot else "可跟踪"
        h += f'''
        <div class="sc">
          <div class="sc-head"><b>{m["name"]}</b><span class="sc-code">{code}</span>
          <span class="sc-badge {cls}">{label}</span></div>
          <div class="sc-theme">{theme}</div>
          <div class="sc-metrics">
            <div><span class="k">现价</span><span class="v">{fmt_px(m.get("price"))}</span></div>
            <div><span class="k">涨幅</span><span class="v up">{m.get("chg_pct"):+.1f}%</span></div>
            <div><span class="k">回撤</span><span class="v warn">-{m.get("drawdown")}%</span></div>
            <div><span class="k">量比</span><span class="v">{m.get("vol_ratio")}</span></div>
          </div>
          <div class="sc-level">支撑 <b class="down">{fmt_px(sup)}</b> · 压力 <b class="up">{fmt_px(res)}</b></div>
        </div>'''
    return h
first_cards = stock_cards(first_pick, fb_map)
break_cards = stock_cards(break_pick, gb_map)

# ================= HTML =================
html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>A股行情复盘 · 2026-08-14</title>
<style>
:root{{
  --bg:#f6f4ef; --panel:#ffffff; --ink:#1c1a17; --muted:#6f6a60; --line:#e3ded2;
  --up:#c0392b; --down:#17805a; --accent:#9a7b3f; --warn:#b8763a; --soft:#f0ede4;
}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif;line-height:1.65;-webkit-font-smoothing:antialiased}}
.wrap{{max-width:1060px;margin:0 auto;padding:0 28px 72px}}
h1,h2,h3,h4{{font-family:Georgia,"Times New Roman","STSong","SimSun","Noto Serif SC",serif;font-weight:600;line-height:1.3}}
.num{{font-variant-numeric:tabular-nums}}
.up{{color:var(--up)}} .down{{color:var(--down)}} .muted{{color:var(--muted)}} .warn{{color:var(--warn)}}

/* ===== 顶部 meta ===== */
.topbar{{display:flex;justify-content:space-between;align-items:center;padding:18px 0;border-bottom:1px solid var(--line);font-size:13px;color:var(--muted)}}
.topbar .brand{{font-family:Georgia,serif;font-size:15px;color:var(--ink);letter-spacing:.5px}}
.topbar .meta-tags span{{margin-left:16px}}

/* ===== Hero ===== */
.hero{{display:grid;grid-template-columns:1.6fr 1fr;gap:44px;padding:44px 0 36px;border-bottom:1px solid var(--line)}}
.hero h1{{font-size:44px;letter-spacing:-.5px;margin-bottom:14px}}
.hero .sub{{font-size:15px;color:var(--muted);max-width:46ch}}
.hero-aside{{border-left:1px solid var(--line);padding-left:32px;display:flex;flex-direction:column;justify-content:center}}
.hero-aside .label{{font-size:12px;color:var(--muted);letter-spacing:2px;margin-bottom:10px}}
.hero-aside .verdict{{font-size:17px;font-weight:600;line-height:1.7}}
.hero-aside .verdict em{{font-style:normal;color:var(--up)}}
.hero-aside .verdict b{{color:var(--ink)}}

/* ===== 关键指标带 ===== */
.kpi-strip{{display:grid;grid-template-columns:repeat(6,1fr);gap:0;border-bottom:1px solid var(--line)}}
.kpi{{padding:22px 14px;border-right:1px solid var(--line);text-align:center}}
.kpi:last-child{{border-right:none}}
.kpi .v{{font-size:30px;font-weight:700;font-family:Georgia,serif;letter-spacing:-.5px}}
.kpi .l{{font-size:12px;color:var(--muted);margin-top:2px}}

/* ===== Section ===== */
.section{{padding:40px 0;border-bottom:1px solid var(--line)}}
.section-head{{display:flex;align-items:baseline;gap:16px;margin-bottom:24px}}
.section-head .no{{font-family:Georgia,serif;font-size:13px;color:var(--accent)}}
.section-head h2{{font-size:26px}}
.section-head .desc{{font-size:13px;color:var(--muted)}}

/* ===== 指数 ===== */
.idx-list{{display:grid;grid-template-columns:1fr 1fr;gap:2px 44px}}
.idx-row{{display:grid;grid-template-columns:96px 1fr 120px 76px;align-items:center;gap:14px;padding:9px 0;border-bottom:1px dashed var(--line)}}
.idx-name{{font-size:14px}}
.idx-price{{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}}
.idx-bar{{height:5px;background:var(--soft);border-radius:2px;overflow:hidden}}
.idx-bar i{{display:block;height:100%}}
.idx-chg{{font-size:14px;font-weight:600;text-align:right;font-variant-numeric:tabular-nums}}

/* ===== 涨跌家数 ===== */
.breadth{{display:flex;height:34px;border-radius:4px;overflow:hidden;margin-bottom:10px}}
.breadth div{{display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:#fff}}
.b-up{{background:var(--up)}} .b-dn{{background:var(--down)}} .b-fl{{background:#c9c3b4;color:var(--ink)}}
.breadth-legend{{display:flex;gap:22px;font-size:13px;color:var(--muted)}}
.legend-dot{{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px}}

/* ===== 情绪 + 连板 ===== */
.emo-grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-bottom:28px}}
.emo{{padding:16px 18px;background:var(--panel);border:1px solid var(--line)}}
.emo .v{{font-size:26px;font-weight:700;font-family:Georgia,serif}}
.emo .l{{font-size:12px;color:var(--muted);margin-top:2px}}

.ladder{{display:flex;flex-direction:column;gap:12px}}
.ladder-row{{display:grid;grid-template-columns:56px 64px 1fr;gap:16px;align-items:center}}
.ladder-lv{{font-family:Georgia,serif;font-weight:700;font-size:16px}}
.lv-5{{color:var(--up)}} .lv-4{{color:var(--up)}} .lv-3{{color:var(--warn)}} .lv-2{{color:var(--accent)}} .lv-1{{color:var(--muted)}}
.ladder-count{{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}}
.ladder-count em{{font-style:normal;font-size:12px;color:var(--muted);margin-left:2px}}
.ladder-bar{{height:14px;background:var(--soft);border-radius:3px;overflow:hidden}}
.ladder-bar i{{display:block;height:100%;background:linear-gradient(90deg,var(--up),#e0a08f)}}
.ladder-names{{grid-column:2/4;font-size:13px;color:var(--muted);padding-bottom:8px;border-bottom:1px dashed var(--line)}}

/* ===== 主线 + 词频 ===== */
.line-item{{display:flex;gap:18px;padding:14px 0;border-bottom:1px solid var(--line)}}
.line-item:last-child{{border-bottom:none}}
.line-no{{font-family:Georgia,serif;font-size:20px;color:var(--accent);width:36px;flex-shrink:0}}
.line-body h4{{font-size:16px;margin-bottom:3px}}
.line-body p{{font-size:13px;color:var(--muted)}}

.two-col{{display:grid;grid-template-columns:1fr 1fr;gap:40px}}
.bar-row{{display:grid;grid-template-columns:120px 1fr 30px;gap:12px;align-items:center;padding:6px 0}}
.bar-label{{font-size:13px;color:var(--muted);text-align:right}}
.bar-track{{height:10px;background:var(--soft);border-radius:2px;overflow:hidden}}
.bar-track i{{display:block;height:100%;background:var(--up)}}
.bar-track i.accent{{background:var(--accent)}}
.bar-val{{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}}

/* ===== 政策 ===== */
.policy{{padding:20px 0;border-bottom:1px solid var(--line)}}
.policy:last-child{{border-bottom:none}}
.policy-head{{display:flex;align-items:baseline;gap:14px}}
.policy-no{{font-family:Georgia,serif;font-size:22px;color:var(--accent);width:30px}}
.policy-head h4{{font-size:17px;flex:1}}
.policy-star{{font-size:12px;color:var(--accent)}}
.policy-meta{{margin:8px 0 6px 44px}}
.tag{{display:inline-block;font-size:11px;color:var(--accent);border:1px solid #d8c9a8;border-radius:3px;padding:1px 8px}}
.policy-impact{{font-size:14px;color:var(--ink);margin-left:44px;line-height:1.7}}
.policy-stocks{{font-size:13px;color:var(--muted);margin-left:44px;margin-top:4px}}

/* ===== 板块 ===== */
.sector{{padding:22px 0;border-bottom:1px solid var(--line)}}
.sector:last-child{{border-bottom:none}}
.sector-head{{display:flex;align-items:baseline;gap:14px}}
.sector-rank{{font-family:Georgia,serif;font-size:26px;color:var(--up);width:30px}}
.sector-head h4{{font-size:19px}}
.sector-star{{font-size:13px;color:var(--accent);margin-left:auto}}
.sector-logic{{font-size:13px;color:var(--muted);margin:8px 0 14px 44px;line-height:1.7}}
.chips{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-left:44px}}
.chip{{background:var(--panel);border:1px solid var(--line);padding:10px 12px}}
.chip b{{display:block;font-size:14px}}
.chip span{{font-size:11px;color:var(--muted)}}
.chip em{{display:block;font-style:normal;font-size:12px;color:var(--accent);margin-top:3px}}

/* ===== 个股推荐 ===== */
.sc-grid{{display:grid;grid-template-columns:1fr 1fr;gap:14px}}
.sc{{background:var(--panel);border:1px solid var(--line);padding:16px 18px}}
.sc-head{{display:flex;align-items:baseline;gap:8px;margin-bottom:6px}}
.sc-head b{{font-size:16px}}
.sc-code{{font-size:12px;color:var(--muted)}}
.sc-badge{{font-size:11px;padding:1px 8px;border-radius:3px;margin-left:auto}}
.sc-badge.hot{{color:var(--up);background:rgba(192,57,43,.08);border:1px solid rgba(192,57,43,.3)}}
.sc-badge.track{{color:var(--warn);background:rgba(184,118,58,.08);border:1px solid rgba(184,118,58,.3)}}
.sc-theme{{font-size:12px;color:var(--accent);margin-bottom:10px}}
.sc-metrics{{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-bottom:8px}}
.sc-metrics .k{{display:block;font-size:11px;color:var(--muted)}}
.sc-metrics .v{{display:block;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}}
.sc-level{{font-size:12px;color:var(--muted)}}

/* ===== 表格 ===== */
table{{width:100%;border-collapse:collapse;font-size:14px}}
th{{text-align:left;font-size:12px;font-weight:500;color:var(--muted);padding:8px 10px;border-bottom:2px solid var(--ink)}}
td{{padding:9px 10px;border-bottom:1px solid var(--line)}}
.tbl-cols{{display:grid;grid-template-columns:1fr 1fr;gap:40px}}

/* ===== Footer ===== */
footer{{padding:36px 0 0;font-size:12px;color:var(--muted);line-height:1.8}}
footer .disc{{margin-top:12px;padding-top:14px;border-top:1px solid var(--line)}}

@media(max-width:820px){{
  .hero{{grid-template-columns:1fr;gap:24px}}
  .hero h1{{font-size:34px}}
  .hero-aside{{border-left:none;padding-left:0;border-top:1px solid var(--line);padding-top:20px}}
  .kpi-strip{{grid-template-columns:repeat(3,1fr)}}
  .kpi{{border-bottom:1px solid var(--line)}}
  .idx-list,.two-col,.tbl-cols,.sc-grid{{grid-template-columns:1fr}}
  .chips{{grid-template-columns:repeat(2,1fr)}}
}}
</style>
</head>
<body>
<div class="wrap">

<div class="topbar">
  <span class="brand">A股市场复盘 · Daily Review</span>
  <span class="meta-tags"><span>数据日期 2026-08-14（周五）</span><span>收盘数据</span><span>两市成交 {total_amt:,.0f} 亿元</span></span>
</div>

<div class="hero">
  <div>
    <h1>A股行情<br>复盘报告</h1>
    <p class="sub">2026 年 8 月 14 日 · 星期五 · 收盘全景。指数温和普涨、个股跌多涨少的结构性二八行情，资金聚焦 AI 算力与创新药两条主线。</p>
  </div>
  <div class="hero-aside">
    <div class="label">今日定调</div>
    <div class="verdict">创业板指 <em>+1.12%</em> 领涨，但全市场 <b>涨 2400 · 跌 2969</b>，权重蓝筹走弱、题材资金聚焦。连板高度 5 板但 4 板断层，<b>情绪中性偏暖</b>，宜聚焦主线、控制追高。</div>
  </div>
</div>

<div class="kpi-strip">
  <div class="kpi"><div class="v up">{total_up}</div><div class="l">涨停</div></div>
  <div class="kpi"><div class="v warn">{total_zb}</div><div class="l">炸板</div></div>
  <div class="kpi"><div class="v down">{total_dn}</div><div class="l">跌停</div></div>
  <div class="kpi"><div class="v">{seal_rate}%</div><div class="l">封板率</div></div>
  <div class="kpi"><div class="v">{max_lbc}板</div><div class="l">连板高度</div></div>
  <div class="kpi"><div class="v">{up_ratio}</div><div class="l">涨跌比</div></div>
</div>

<div class="section">
  <div class="section-head"><span class="no">01</span><h2>核心指数</h2><span class="desc">八大指数收盘点位与涨跌幅</span></div>
  <div class="idx-list">{idx_rows}
  </div>
</div>

<div class="section">
  <div class="section-head"><span class="no">02</span><h2>市场情绪</h2><span class="desc">涨跌分布与情绪指标</span></div>
  <div class="breadth">
    <div class="b-up" style="width:{up_pct}%">{breadth["up"]}↑</div>
    <div class="b-dn" style="width:{dn_pct}%">{breadth["down"]}↓</div>
    <div class="b-fl" style="width:{fl_pct}%">{breadth["flat"]}</div>
  </div>
  <div class="breadth-legend">
    <span><span class="legend-dot" style="background:var(--up)"></span>上涨 {breadth["up"]}</span>
    <span><span class="legend-dot" style="background:var(--down)"></span>下跌 {breadth["down"]}</span>
    <span><span class="legend-dot" style="background:#c9c3b4"></span>平盘 {breadth["flat"]}</span>
    <span>涨停/跌停 {total_up}:{total_dn} · 炸板率 {break_rate}%</span>
  </div>
</div>

<div class="section">
  <div class="section-head"><span class="no">03</span><h2>连板梯队</h2><span class="desc">最高 {max_lbc} 板，4 板断层</span></div>
  <div class="ladder">{ladder_rows}
  </div>
</div>

<div class="section">
  <div class="section-head"><span class="no">04</span><h2>主线题材</h2><span class="desc">题材热度与涨停行业分布</span></div>
  <div style="margin-bottom:28px">{main_lines_html}
  </div>
  <div class="two-col">
    <div>
      <h3 style="font-size:15px;margin-bottom:14px">题材热度词频</h3>
      {theme_rows}
    </div>
    <div>
      <h3 style="font-size:15px;margin-bottom:14px">涨停行业分布</h3>
      {hy_rows}
    </div>
  </div>
</div>

<div class="section">
  <div class="section-head"><span class="no">05</span><h2>重点政策 / 消息</h2><span class="desc">当日核心催化 Top5</span></div>
  {policy_html}
</div>

<div class="section">
  <div class="section-head"><span class="no">06</span><h2>热点可持续性板块</h2><span class="desc">政策+基本面+资金多维评估</span></div>
  {sector_html}
</div>

<div class="section">
  <div class="section-head"><span class="no">07</span><h2>个股推荐</h2><span class="desc">仅沪市主板+深市主板，ST 已排除 · 观察评级非买卖建议</span></div>
  <h3 style="font-size:15px;margin:6px 0 12px">① 主板首板 · 低位突破</h3>
  <div class="sc-grid">{first_cards}
  </div>
  <h3 style="font-size:15px;margin:26px 0 12px">② 主板突破 · 放量 · 热点（涨幅 5%+）</h3>
  <div class="sc-grid">{break_cards}
  </div>
</div>

<div class="section">
  <div class="section-head"><span class="no">08</span><h2>涨跌幅榜与炸板</h2><span class="desc">全市场涨幅/跌幅 TOP + 炸板明细</span></div>
  <div class="tbl-cols">
    <div>
      <h3 style="font-size:15px;margin-bottom:12px;color:var(--up)">涨幅榜 TOP10</h3>
      <table><tr><th>名称</th><th>代码</th><th>涨幅</th></tr>{gain_html}</table>
      <h3 style="font-size:15px;margin:24px 0 12px;color:var(--down)">跌幅榜 TOP10</h3>
      <table><tr><th>名称</th><th>代码</th><th>跌幅</th></tr>{loss_html}</table>
    </div>
    <div>
      <h3 style="font-size:15px;margin-bottom:12px;color:var(--warn)">炸板个股（{total_zb} 只，炸板率 {break_rate}%）</h3>
      <table><tr><th>名称</th><th>行业</th><th>炸板</th><th>收盘</th></tr>{zb_rows}</table>
    </div>
  </div>
</div>

<footer>
  <p>数据来源：公开行情数据（腾讯财经、东方财富、同花顺、新浪财经）聚合整理，数据截至 2026-08-14 收盘。盘中数据可能滞后，涨停/封板状态以交易所收盘为准。</p>
  <p class="disc">以上分析基于公开数据，仅供复盘参考，不构成投资建议。股市有风险，投资需谨慎。</p>
</footer>

</div>
</body>
</html>'''

out = os.path.join(BASE, "output/行情复盘_20260814.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("报告已重新生成:", out)
print(f"指数 {len(indexes)} | 涨停{total_up} 炸板{total_zb} 跌停{total_dn} | 封板率{seal_rate}% | 涨跌 {breadth['up']}/{breadth['down']}")
