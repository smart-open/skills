# -*- coding: utf-8 -*-
import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
"""15 日板块轮动热力图 + 美化表格（等 sector_15d.json 就绪后运行）"""
import json, re

def heat_color(v):
    if v is None:
        return "#161c2c", "#3a4358"
    a = abs(v)
    if v >= 3:   return "#e02a37", "#fff"
    if v >= 2:   return "#ff4d5e", "#fff"
    if v >= 1:   return "#ff7a88", "#3a0a10"
    if v >= 0.5: return "#ffa8b2", "#4a1218"
    if v >= 0:   return "#ffd0d6", "#4a1c22"
    if v > -0.5: return "#b8e8cd", "#0c3a24"
    if v > -1:   return "#7fd9a8", "#0c3a24"
    if v > -2:   return "#3ec98a", "#06321f"
    if v > -3:   return "#2bd99f", "#06321f"
    return "#14a06d", "#04261a"

data = json.load(open(os.path.join(BASE, "data/sector_15d.json"), encoding="utf-8"))

# 确定板块顺序（前7）与日期轴（名称 + 08-14涨停个数）
board_order = [
    ("CPO概念", 7),
    ("F5G概念", 1),
    ("光纤概念", 3),
    ("铜缆高速连接", 1),
    ("创新药", 8),
    ("机器人概念", 8),
    ("稀土永磁", 2),
]
# 收集所有日期
all_dates = set()
for v in data.values():
    for d, _ in v:
        all_dates.add(d)
dates = sorted(all_dates)[-15:]  # 取最近15个交易日

# 构建热力图
rows_html = ""
for name, zt in board_order:
    kv = dict(data.get(name, []))
    cells = ""
    for d in dates:
        v = kv.get(d)
        bg, fg = heat_color(v)
        txt = f"{v:+.1f}" if v is not None else "·"
        cells += f'<span class="hm-cell" style="background:{bg};color:{fg}" title="{d} {name} {txt}">{txt}</span>'
    # 计算15日累计涨幅
    vals = [kv.get(d) for d in dates if kv.get(d) is not None]
    cum = sum(vals) if vals else 0
    cum_cls = "up" if cum > 0 else ("down" if cum < 0 else "")
    rows_html += f'''
    <div class="hm-row">
      <span class="hm-name">{name}<em class="hm-zt">涨停{zt}</em></span>
      <span class="hm-cells">{cells}</span>
      <span class="hm-cum {cum_cls}">{cum:+.1f}%</span>
    </div>'''

# 日期表头
dates_html = ""
for d in dates:
    dates_html += f'<span class="hm-day">{d}</span>'

section = f'''
<div class="section">
  <div class="section-head"><span class="no">07</span><h2>近一月板块轮动</h2><span class="desc">15 日热力 · 涨幅 + 涨停个数</span><span class="line"></span></div>

  <p class="muted" style="font-size:12px;margin-bottom:16px">前 7 板块近 <b>15 个交易日</b>逐日涨跌热力图，颜色深浅表涨幅（红涨绿跌），末列 <b>15 日累计涨幅</b>。可清晰看出各板块的启动时点与轮动节奏。</p>

  <div class="hm-wrap">
    <div class="hm-row hm-head">
      <span class="hm-name">板块</span>
      <span class="hm-cells">{dates_html}</span>
      <span class="hm-cum">15日累计</span>
    </div>
    {rows_html}
  </div>

  <div class="hm-legend">
    <span class="lg-label">涨</span>
    <span class="lg-cell" style="background:#e02a37"></span>
    <span class="lg-cell" style="background:#ff4d5e"></span>
    <span class="lg-cell" style="background:#ff7a88"></span>
    <span class="lg-cell" style="background:#ffa8b2"></span>
    <span class="lg-cell" style="background:#ffd0d6"></span>
    <span class="lg-cell" style="background:#161c2c"></span>
    <span class="lg-cell" style="background:#b8e8cd"></span>
    <span class="lg-cell" style="background:#7fd9a8"></span>
    <span class="lg-cell" style="background:#3ec98a"></span>
    <span class="lg-cell" style="background:#2bd99f"></span>
    <span class="lg-cell" style="background:#14a06d"></span>
    <span class="lg-label">跌</span>
  </div>

  <div class="rot-summary">
    <h4 style="font-size:14px;margin-bottom:10px;color:var(--acc)">轮动节奏综述</h4>
    <div class="rot-item"><span class="rot-title">🔥 主线持续</span><span class="rot-desc">CPO / 光纤 / F5G 多日位列涨幅前列，AI 算力是唯一贯穿全周期主线</span></div>
    <div class="rot-item"><span class="rot-title">🟠 医药脉冲</span><span class="rot-desc">创新药在 08-13 前后集中爆发（CRO +3.13%），属阶段性轮动而非持续主线</span></div>
    <div class="rot-item"><span class="rot-title">⬆️ 政策催化</span><span class="rot-desc">稀土永磁受供给政策驱动，近期低位启动</span></div>
    <div class="rot-item"><span class="rot-title">🔄 高低切换</span><span class="rot-desc">资金从软件/证券/半导体撤出，扑向通信硬件，AI 外溢（机器人/液冷）补涨</span></div>
  </div>
  <p class="muted" style="font-size:11px;margin-top:10px">注：逐日涨跌数据来自东方财富 push2his 板块 K 线；涨停个数按概念板块关键词从涨停池 reason 匹配统计。</p>
</div>
'''

css = '''
.hm-wrap{{background:var(--sur);border:1px solid var(--line);border-radius:10px;padding:14px;overflow-x:auto;margin-bottom:12px}}
.hm-row{{display:grid;grid-template-columns:110px 1fr 86px;gap:8px;align-items:center;padding:3px 0}}
.hm-head{{border-bottom:1px solid var(--glow);padding-bottom:8px;margin-bottom:6px}}
.hm-name{{font-size:13px;font-weight:600;color:var(--txt);white-space:nowrap}}
.hm-name .hm-zt{{font-style:normal;font-size:10px;color:var(--up);background:rgba(255,77,94,.12);border:1px solid rgba(255,77,94,.3);border-radius:3px;padding:1px 5px;margin-left:6px;vertical-align:1px}}
.hm-head .hm-name,.hm-head .hm-cum{{font-size:11px;color:var(--muted);font-weight:500}}
.hm-cells{{display:grid;grid-template-columns:repeat(15,1fr);gap:3px}}
.hm-cell{{display:flex;align-items:center;justify-content:center;height:26px;border-radius:4px;font-size:10px;font-family:"Cascadia Code",monospace;font-weight:600}}
.hm-day{{display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--muted);font-family:"Cascadia Code",monospace}}
.hm-cum{{font-size:13px;font-weight:700;font-family:"Cascadia Code",monospace;text-align:right}}
.hm-cum.up{{color:var(--up)}}.hm-cum.down{{color:var(--down)}}
.hm-legend{{display:flex;align-items:center;gap:4px;margin-bottom:18px;flex-wrap:wrap}}
.hm-legend .lg-label{{font-size:11px;color:var(--muted);margin:0 4px}}
.hm-legend .lg-cell{{width:22px;height:14px;border-radius:3px}}
.rot-summary{{margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:10px}}
.rot-item{{background:var(--sur);border:1px solid var(--line);border-radius:8px;padding:12px 14px}}
.rot-title{{display:block;font-size:13px;font-weight:600;color:var(--acc2);margin-bottom:4px}}
.rot-desc{{font-size:12px;color:var(--muted);line-height:1.6}}
@media(max-width:760px){{
  .rot-summary{{grid-template-columns:1fr}}
  .hm-row{{grid-template-columns:90px 1fr 60px}}
  .hm-cell{{height:20px;font-size:8px}}
}}
'''

path = os.path.join(BASE, "output/行情复盘_20260814.html")
html = open(path, encoding="utf-8").read()
html = html.replace("</style>", css + "</style>")

# 精确替换旧轮动章节
start_marker = '<div class="section">\n  <div class="section-head"><span class="no">07</span><h2>近一月板块轮动</h2>'
start_idx = html.find(start_marker)
if start_idx == -1:
    print("未找到旧章节")
else:
    depth = 0
    end_idx = -1
    for m in re.finditer(r'<div[^>]*>|</div>', html[start_idx:]):
        depth += (-1 if m.group().startswith('</div>') else 1)
        if depth == 0:
            end_idx = start_idx + m.end()
            break
    if end_idx > 0:
        html = html[:start_idx] + section + html[end_idx:]
        print("旧章节已替换")

open(path, "w", encoding="utf-8").write(html)

# 验证 div 平衡
t = open(path, encoding="utf-8").read()
o = len(re.findall(r'<div[^>]*>', t))
c = len(re.findall(r'</div>', t))
print(f"div: 开{o} 闭{c} {'平衡' if o == c else '不平衡!'}")
print(f"板块数: {len(data)}，日期范围: {dates[0] if dates else 'NA'} ~ {dates[-1] if dates else 'NA'}")
