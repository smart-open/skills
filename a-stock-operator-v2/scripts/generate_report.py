# -*- coding: utf-8 -*-
"""生成 A股行情复盘 HTML 报告（暗色主题，红涨绿跌）"""
import json
from collections import Counter

d = json.load(open(os.path.join(BASE, "data/market_20260814.json"), encoding="utf-8"))

# ===== 指标计算 =====
lu = d["limit_up"]["list"]
zb = d["broken"]["list"]
total_up = d["limit_up"]["total"]
total_zb = d["broken"]["total"]
total_dn = d["limit_down"]["total"]
seal_rate = round(total_up / (total_up + total_zb) * 100, 1) if (total_up + total_zb) else 0
break_rate = round(total_zb / (total_up + total_zb) * 100, 1) if (total_up + total_zb) else 0
max_lbc = max((x["lbc"] for x in lu), default=0)
breadth = d["breadth"]
up_ratio = round(breadth["up"] / breadth["down"], 2) if breadth["down"] else 0
zt_dn_ratio = round(total_up / total_dn, 1) if total_dn else 0

# 两市成交额
sh_amt = next((x["amount_yi"] for x in d["indexes"] if x["code"] == "000001"), 0)
sz_amt = next((x["amount_yi"] for x in d["indexes"] if x["code"] == "399001"), 0)
total_amt = sh_amt + sz_amt

# 连板梯队
lbc_counter = Counter(x["lbc"] for x in lu)
ladder_rows = []
for k in sorted(lbc_counter, reverse=True):
    ladder_rows.append((k, lbc_counter[k]))

# 涨停行业聚合
hy_counter = Counter(x["hybk"] for x in lu)

# 题材词频（主题归并）
raw_tags = []
for r in d["hot_reason"]["rows"]:
    for t in r["reason"].replace("+", " ").split():
        if t:
            raw_tags.append(t)
tc = Counter(raw_tags)
# 主题归并映射
theme_map = {
    "算力": ["算力", "算力租赁", "AI算力", "AI服务器", "算力调度", "算力中心", "IDC"],
    "CPO/光模块": ["CPO", "光芯片", "光模块", "磷化铟", "硅光", "800G", "1.6T"],
    "液冷": ["液冷", "液冷服务器", "液冷散热"],
    "创新药": ["创新药", "化学制药", "医药商业", "中药", "CRO", "脑机接口"],
    "中报业绩": ["半年报增长", "中报预增", "半年报预增", "业绩预增", "扭亏"],
    "机器人": ["机器人", "人形机器人", "工业机器人"],
    "国企改革": ["央企", "国企改革", "国资", "中特估"],
    "半导体": ["半导体", "芯片", "集成电路", "存储"],
}
themes = {}
for theme, kws in theme_map.items():
    cnt = sum(tc.get(k, 0) for k in kws)
    if cnt > 0:
        themes[theme] = cnt
themes = sorted(themes.items(), key=lambda x: -x[1])

# 主线题材（人工归类）
main_lines = [
    ("AI算力 / CPO / 光模块", "通信设备 6 只涨停领跑，CPO 词频最高；网宿科技、中石科技、富信科技 20cm 涨停，中际旭创入股中石科技带动 CPO 散热链"),
    ("创新药 / 医药", "博济医药、西点药业 20cm，创新药、医药商业多股涨停，脑机接口(澳洋健康 3连板)活跃"),
    ("中报业绩预增", "半年报增长 + 中报预增共 8 次，大豪科技等叠加机器人/算力走强"),
    ("机器人 / 工业母机", "机器人词频 4 次，与算力、自动化设备共振"),
    ("国企改革 / 央企", "央企 + 国企改革主线，华西股份、澳洋健康等叠加国资背景"),
]

# ===== 颜色辅助 =====
RED = "#ff6b6b"; GREEN = "#37d39a"; TXT = "#e6e9ef"; SUB = "#9aa3b2"

def chg_color(v):
    if v is None:
        return SUB
    try:
        v = float(v)
    except (TypeError, ValueError):
        return SUB
    return RED if v > 0 else (GREEN if v < 0 else SUB)

def chg_sign(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return v
    return f"{v:+.2f}" if abs(v) < 100 else f"{v:+.1f}"

# ===== HTML 片段生成 =====
# 指数卡片
idx_cards = ""
for x in d["indexes"]:
    c = chg_color(x["change_pct"])
    idx_cards += f'''
    <div class="idx">
      <div class="idx-name">{x["name"]}</div>
      <div class="idx-price">{x["price"]:,.2f}</div>
      <div class="idx-chg" style="color:{c}">{chg_sign(x["change_pct"])}%</div>
    </div>'''

# 情绪指标卡
emo_cards = f'''
<div class="emo up-bg"><div class="emo-v">{total_up}</div><div class="emo-l">涨停</div></div>
<div class="emo warn-bg"><div class="emo-v">{total_zb}</div><div class="emo-l">炸板</div></div>
<div class="emo dn-bg"><div class="emo-v">{total_dn}</div><div class="emo-l">跌停</div></div>
<div class="emo"><div class="emo-v">{seal_rate}%</div><div class="emo-l">封板率</div></div>
<div class="emo"><div class="emo-v">{break_rate}%</div><div class="emo-l">炸板率</div></div>
<div class="emo"><div class="emo-v">{max_lbc}板</div><div class="emo-l">连板高度</div></div>'''

# 涨跌家数条
up_pct = round(breadth["up"] / breadth["total"] * 100, 1)
dn_pct = round(breadth["down"] / breadth["total"] * 100, 1)
flat_pct = round(100 - up_pct - dn_pct, 1)

# 连板梯队表
ladder_html = ""
for k, v in ladder_rows:
    names = "、".join(x["name"] for x in sorted(lu, key=lambda z: -z["lbc"]) if x["lbc"] == k)
    tier_cls = "tier-high" if k >= 4 else ("tier-mid" if k >= 2 else "tier-low")
    ladder_html += f'''
    <tr>
      <td class="{tier_cls}">{k}连板</td>
      <td class="num">{v}</td>
      <td class="names">{names}</td>
    </tr>'''

# 题材词频条形
max_theme = max([c for _, c in themes], default=1)
theme_bars = ""
for name, cnt in themes:
    w = int(cnt / max_theme * 100)
    theme_bars += f'''
    <div class="bar-row">
      <span class="bar-label">{name}</span>
      <div class="bar-track"><div class="bar-fill" style="width:{w}%"></div></div>
      <span class="bar-val">{cnt}</span>
    </div>'''

# 涨停行业
max_hy = max([c for k, c in hy_counter.most_common(8)], default=1)
hy_html = ""
for k, v in hy_counter.most_common(8):
    w = int(v / max_hy * 100)
    hy_html += f'''
    <div class="bar-row">
      <span class="bar-label">{k}</span>
      <div class="bar-track"><div class="bar-fill fill-acc" style="width:{w}%"></div></div>
      <span class="bar-val">{v}</span>
    </div>'''

# 板块排行
sec_top = d["sectors"][:10]
sec_bottom = d["sectors"][-5:]
sec_top_html = ""
for s in sec_top:
    c = chg_color(s["chg_pct"])
    sec_top_html += f'''
    <tr><td>{s["name"]}</td><td style="color:{c}">{chg_sign(s["chg_pct"])}%</td><td class="sub">{s["leader_name"]}</td></tr>'''
sec_bottom_html = ""
for s in sec_bottom:
    c = chg_color(s["chg_pct"])
    sec_bottom_html += f'''
    <tr><td>{s["name"]}</td><td style="color:{c}">{chg_sign(s["chg_pct"])}%</td><td class="sub">{s["leader_name"]}</td></tr>'''

# 涨幅榜/跌幅榜
gain_html = ""
for r in breadth["top_gainers"][:10]:
    c = chg_color(r["chg"])
    gain_html += f'''
    <tr><td>{r["name"]}</td><td class="sub">{r["code"]}</td><td style="color:{c}">{chg_sign(r["chg"])}%</td></tr>'''
loss_html = ""
for r in breadth["top_losers"][:10]:
    c = chg_color(r["chg"])
    loss_html += f'''
    <tr><td>{r["name"]}</td><td class="sub">{r["code"]}</td><td style="color:{c}">{chg_sign(r["chg"])}%</td></tr>'''

# 炸板明细
zb_html = ""
for x in zb[:15]:
    c = chg_color(x["chg_pct"])
    zb_html += f'''
    <tr><td>{x["name"]}</td><td class="sub">{x["hybk"]}</td><td>炸{x["zbc"]}次</td><td style="color:{c}">{chg_sign(x["chg_pct"])}%</td></tr>'''

# 主线题材列表
main_lines_html = ""
for i, (name, desc) in enumerate(main_lines, 1):
    main_lines_html += f'''
    <div class="line-item">
      <span class="line-no">{i}</span>
      <div class="line-body">
        <div class="line-name">{name}</div>
        <div class="line-desc">{desc}</div>
      </div>
    </div>'''

html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>2026-08-14 A股行情复盘报告</title>
<style>
:root{{
  --bg:#0f1115; --card:#171a21; --card2:#1d212b; --line:#2a2f3a;
  --txt:#e6e9ef; --sub:#9aa3b2; --acc:#5b8cff; --gold:#f5c451;
  --red:#ff6b6b; --grn:#37d39a; --warn:#ffb454;
}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:var(--bg);color:var(--txt);font-family:-apple-system,"PingFang SC","Microsoft YaHei",Segoe UI,sans-serif;line-height:1.6;padding:24px}}
.wrap{{max-width:1080px;margin:0 auto}}
header{{border-bottom:1px solid var(--line);padding-bottom:20px;margin-bottom:24px}}
h1{{font-size:26px;font-weight:700;letter-spacing:.5px}}
.meta{{color:var(--sub);font-size:13px;margin-top:8px}}
.tag{{display:inline-block;background:rgba(91,140,255,.15);color:var(--acc);border:1px solid rgba(91,140,255,.35);border-radius:4px;padding:2px 8px;font-size:12px;margin-right:8px}}
.tldr{{background:var(--card2);border-left:3px solid var(--gold);border-radius:8px;padding:16px 20px;margin-bottom:28px}}
.tldr h2{{font-size:15px;color:var(--gold);margin-bottom:8px}}
.tldr p{{font-size:14px;color:var(--txt)}}
.section{{margin-bottom:30px}}
.section h2{{font-size:18px;margin-bottom:16px;padding-left:10px;border-left:3px solid var(--acc)}}
/* 指数 */
.idx-grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}}
.idx{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;text-align:center}}
.idx-name{{color:var(--sub);font-size:13px}}
.idx-price{{font-size:20px;font-weight:700;margin:4px 0}}
.idx-chg{{font-size:14px;font-weight:600}}
/* 情绪 */
.emo-grid{{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}}
.emo{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;text-align:center}}
.emo-v{{font-size:22px;font-weight:700}}
.emo-l{{color:var(--sub);font-size:12px;margin-top:2px}}
.up-bg .emo-v{{color:var(--red)}}
.dn-bg .emo-v{{color:var(--grn)}}
.warn-bg .emo-v{{color:var(--warn)}}
/* 涨跌家数条 */
.breadth-bar{{display:flex;height:26px;border-radius:6px;overflow:hidden;margin:12px 0 8px}}
.breadth-bar div{{display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600}}
.breadth-up{{background:var(--red)}}
.breadth-dn{{background:var(--grn)}}
.breadth-flat{{background:#3a3f4a}}
.breadth-legend{{display:flex;gap:20px;font-size:13px;color:var(--sub)}}
.dot{{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:middle}}
/* 表格 */
table{{width:100%;border-collapse:collapse;font-size:14px}}
th{{text-align:left;color:var(--sub);font-weight:500;font-size:12px;padding:8px 10px;border-bottom:1px solid var(--line)}}
td{{padding:8px 10px;border-bottom:1px solid rgba(42,47,58,.5)}}
.sub{{color:var(--sub)}}
.num{{font-weight:700;width:60px}}
.names{{color:var(--sub);font-size:13px}}
.tier-high{{color:var(--red);font-weight:700}}
.tier-mid{{color:var(--warn);font-weight:600}}
.tier-low{{color:var(--sub)}}
/* 两栏 */
.cols{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}
.col{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px}}
.col h3{{font-size:14px;margin-bottom:10px;color:var(--txt)}}
.col.red h3{{color:var(--red)}}
.col.grn h3{{color:var(--grn)}}
/* 条形 */
.bar-row{{display:flex;align-items:center;margin-bottom:8px;gap:10px}}
.bar-label{{width:110px;font-size:13px;color:var(--sub);text-align:right;flex-shrink:0}}
.bar-track{{flex:1;background:#2a2f3a;height:14px;border-radius:4px;overflow:hidden}}
.bar-fill{{height:100%;background:var(--red);border-radius:4px}}
.fill-acc{{background:var(--acc)}}
.bar-val{{width:30px;font-size:13px;color:var(--txt);font-weight:600}}
/* 主线 */
.line-item{{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid rgba(42,47,58,.5)}}
.line-no{{background:var(--acc);color:#fff;width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0}}
.line-name{{font-weight:600;font-size:15px}}
.line-desc{{color:var(--sub);font-size:13px;margin-top:2px}}
footer{{margin-top:30px;padding-top:16px;border-top:1px solid var(--line);color:var(--sub);font-size:12px}}
.warn-box{{background:rgba(255,180,84,.08);border:1px solid rgba(255,180,84,.3);border-radius:8px;padding:12px 16px;margin-bottom:24px;font-size:13px;color:var(--warn)}}
@media(max-width:768px){{
  .idx-grid{{grid-template-columns:repeat(2,1fr)}}
  .emo-grid{{grid-template-columns:repeat(3,1fr)}}
  .cols{{grid-template-columns:1fr}}
}}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>📈 A股行情复盘报告</h1>
  <div class="meta">
    <span class="tag">数据日期 2026-08-14（周五）</span>
    <span class="tag">收盘数据</span>
    <span class="tag">两市成交 {total_amt:,.0f} 亿元</span>
  </div>
</header>

<div class="tldr">
  <h2>今日结论</h2>
  <p><b style="color:{RED}">指数温和普涨、个股跌多涨少</b>，创业板指 +1.12% 领涨，但全市场 <b>涨 2400 家 vs 跌 2969 家</b>，是典型的结构性二八分化。资金聚焦 <b style="color:{RED}">AI算力/CPO/光模块</b>（通信设备 6 只涨停领跑）与 <b style="color:{RED}">创新药</b> 两条主线，叠加中报业绩催化；权重蓝筹（上证50 -0.41%、酿酒 -0.82%）明显走弱。连板高度 5 板（蓝盾光电）但 4 板断层，高位分歧、首板活跃（52 只），情绪中性偏暖。</p>
</div>

<div class="section">
  <h2>一、核心指数</h2>
  <div class="idx-grid">{idx_cards}
  </div>
</div>

<div class="section">
  <h2>二、市场情绪</h2>
  <div class="emo-grid">{emo_cards}
  </div>
  <div class="breadth-bar">
    <div class="breadth-up" style="width:{up_pct}%">{breadth["up"]}↑</div>
    <div class="breadth-dn" style="width:{dn_pct}%">{breadth["down"]}↓</div>
    <div class="breadth-flat" style="width:{flat_pct}%">{breadth["flat"]}平</div>
  </div>
  <div class="breadth-legend">
    <span><span class="dot" style="background:{RED}"></span>上涨 {breadth["up"]} 家</span>
    <span><span class="dot" style="background:{GREEN}"></span>下跌 {breadth["down"]} 家</span>
    <span><span class="dot" style="background:#3a3f4a"></span>平盘 {breadth["flat"]} 家</span>
    <span>涨跌比 {up_ratio} · 涨停/跌停 {zt_dn_ratio}:1</span>
  </div>
</div>

<div class="section">
  <h2>三、连板梯队（最高 {max_lbc} 板）</h2>
  <table>
    <tr><th>层级</th><th>家数</th><th>个股</th></tr>
    {ladder_html}
  </table>
</div>

<div class="section">
  <h2>四、主线题材</h2>
  {main_lines_html}
</div>

<div class="cols">
  <div class="col">
    <h3>题材热度词频</h3>
    {theme_bars}
  </div>
  <div class="col">
    <h3>涨停行业分布</h3>
    {hy_html}
  </div>
</div>

<div class="cols" style="margin-top:16px">
  <div class="col red">
    <h3>行业板块涨幅 TOP10</h3>
    <table><tr><th>板块</th><th>涨跌幅</th><th>领涨股</th></tr>{sec_top_html}</table>
  </div>
  <div class="col grn">
    <h3>行业板块跌幅 TOP5</h3>
    <table><tr><th>板块</th><th>涨跌幅</th><th>领跌</th></tr>{sec_bottom_html}</table>
  </div>
</div>

<div class="cols" style="margin-top:16px">
  <div class="col red">
    <h3>全市场涨幅榜 TOP10</h3>
    <table><tr><th>名称</th><th>代码</th><th>涨幅</th></tr>{gain_html}</table>
  </div>
  <div class="col grn">
    <h3>全市场跌幅榜 TOP10</h3>
    <table><tr><th>名称</th><th>代码</th><th>跌幅</th></tr>{loss_html}</table>
  </div>
</div>

<div class="section" style="margin-top:24px">
  <h2>五、炸板个股明细（{total_zb} 只，炸板率 {break_rate}%）</h2>
  <table>
    <tr><th>名称</th><th>行业</th><th>炸板</th><th>收盘涨幅</th></tr>
    {zb_html}
  </table>
</div>

<div class="warn-box" style="margin-top:24px">
  <b>⚠️ 明日关注：</b>① CPO/算力主线能否延续（看网宿科技、中石科技等 20cm 次日溢价）；② 蓝盾光电 5 板后是否断板，若断板将压制高位情绪；③ 创新药/中报业绩线是否接力；④ 权重蓝筹（白酒/金融）若继续走弱，警惕指数回踩；⑤ 跌停 10 家集中在高位股与 ST，关注亏钱效应是否扩散。
</div>

<footer>
  数据来源：公开行情数据（腾讯财经、东方财富、同花顺、新浪财经）聚合整理，数据截至 2026-08-14 收盘。<br>
  以上分析基于公开数据，仅供复盘参考，不构成投资建议。股市有风险，投资需谨慎。
</footer>
</div>
</body>
</html>'''

out = os.path.join(BASE, "output/行情复盘_20260814.html")
import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("报告已生成:", out)
print(f"指数 {len(d['indexes'])} | 涨停{total_up} 炸板{total_zb} 跌停{total_dn} | 封板率{seal_rate}% | 涨跌 {breadth['up']}/{breadth['down']}")
