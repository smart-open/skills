# -*- coding: utf-8 -*-
import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
"""重写 15 日热力图：纯色块 + hover 数值 + 优化布局"""
import json, re

data = json.load(open(os.path.join(BASE, "data/sector_15d.json"), encoding="utf-8"))

def heat_color(v):
    if v is None:
        return "#161c2c"
    a = abs(v)
    if v >= 3:   return "#e02a37"
    if v >= 2:   return "#ff4d5e"
    if v >= 1:   return "#ff7a88"
    if v >= 0.5: return "#ffa8b2"
    if v >= 0:   return "#ffd0d6"
    if v > -0.5: return "#b8e8cd"
    if v > -1:   return "#7fd9a8"
    if v > -2:   return "#3ec98a"
    if v > -3:   return "#2bd99f"
    return "#14a06d"

board_order = [
    ("CPO概念", 7), ("F5G概念", 1), ("光纤概念", 3),
    ("铜缆高速连接", 1), ("创新药", 8), ("机器人概念", 8), ("稀土永磁", 2),
]

all_dates = set()
for v in data.values():
    for d, _ in v:
        all_dates.add(d)
dates = sorted(all_dates)[-15:]

# 表头日期（MM-DD）
dates_html = ""
for d in dates:
    dates_html += f'<span class="hm-day">{d[4:6]}-{d[6:]}</span>'

# 热力图行（纯色块，无数字）
rows_html = ""
for name, zt in board_order:
    kv = dict(data.get(name, []))
    cells = ""
    for d in dates:
        v = kv.get(d)
        bg = heat_color(v)
        tip = f"{d[4:6]}-{d[6:]} {name} {v:+.2f}%" if v is not None else f"{d[4:6]}-{d[6:]} 无数据"
        cells += f'<span class="hm-cell" style="background:{bg}" title="{tip}"></span>'
    vals = [kv.get(d) for d in dates if kv.get(d) is not None]
    cum = sum(vals) if vals else 0
    cum_cls = "up" if cum > 0 else ("down" if cum < 0 else "")
    rows_html += f'''
    <div class="hm-row">
      <span class="hm-name">{name}<em class="hm-zt">{zt}</em></span>
      <span class="hm-cells">{cells}</span>
      <span class="hm-cum {cum_cls}">{cum:+.1f}%</span>
    </div>'''

section = f'''
<div class="section">
  <div class="section-head"><span class="no">07</span><h2>近一月板块轮动</h2><span class="desc">15 日涨跌热力 · 悬停查看数值</span><span class="line"></span></div>

  <p class="muted" style="font-size:12px;margin-bottom:16px">前 7 板块近 <b>15 个交易日</b>逐日涨跌热力，<b>颜色深浅表涨跌幅度</b>（红涨绿跌），<b>悬停格子</b>查看具体数值；末列 <b>15 日累计涨幅</b>，板块名旁标注当日涨停家数。</p>

  <div class="hm-wrap">
    <div class="hm-row hm-head">
      <span class="hm-name">板块</span>
      <span class="hm-cells">{dates_html}</span>
      <span class="hm-cum">15日累计</span>
    </div>
    {rows_html}
  </div>

  <div class="hm-legend">
    <span class="lg-label">跌</span>
    <span class="lg-cell" style="background:#14a06d"></span>
    <span class="lg-cell" style="background:#2bd99f"></span>
    <span class="lg-cell" style="background:#3ec98a"></span>
    <span class="lg-cell" style="background:#7fd9a8"></span>
    <span class="lg-cell" style="background:#b8e8cd"></span>
    <span class="lg-cell" style="background:#161c2c"></span>
    <span class="lg-cell" style="background:#ffd0d6"></span>
    <span class="lg-cell" style="background:#ffa8b2"></span>
    <span class="lg-cell" style="background:#ff7a88"></span>
    <span class="lg-cell" style="background:#ff4d5e"></span>
    <span class="lg-cell" style="background:#e02a37"></span>
    <span class="lg-label">涨</span>
    <span class="lg-note">-3% ·· -2% ·· -1% ·· -0.5% ·· 0 ·· +0.5% ·· +1% ·· +2% ·· +3%</span>
  </div>

  <div class="rot-summary">
    <h4 style="font-size:14px;margin-bottom:10px;color:var(--acc)">轮动节奏综述</h4>
    <div class="rot-item"><span class="rot-title">主线持续</span><span class="rot-desc">CPO / 光纤 / F5G 多日红格贯穿，AI 算力是唯一持续主线</span></div>
    <div class="rot-item"><span class="rot-title">医药脉冲</span><span class="rot-desc">创新药 08-13 前后集中转红，属阶段性轮动而非持续主线</span></div>
    <div class="rot-item"><span class="rot-title">政策催化</span><span class="rot-desc">稀土永磁受供给政策驱动，低位启动</span></div>
    <div class="rot-item"><span class="rot-title">高低切换</span><span class="rot-desc">资金从软件/证券/半导体撤出，扑向通信硬件，机器人/液冷外溢补涨</span></div>
  </div>
  <p class="muted" style="font-size:11px;margin-top:10px">注：逐日涨跌数据来自同花顺概念指数；涨停家数按概念板块关键词从涨停池匹配统计。</p>
</div>
'''

css = '''
.hm-wrap{{background:var(--sur);border:1px solid var(--line);border-radius:12px;padding:18px 16px;overflow-x:auto;margin-bottom:14px}}
.hm-row{{display:grid;grid-template-columns:132px 1fr 76px;gap:14px;align-items:center;padding:5px 0}}
.hm-head{{border-bottom:1px solid var(--glow);padding-bottom:10px;margin-bottom:8px}}
.hm-name{{font-size:13px;font-weight:600;color:var(--txt);white-space:nowrap}}
.hm-name .hm-zt{{font-style:normal;font-size:10px;color:var(--up);background:rgba(255,77,94,.12);border:1px solid rgba(255,77,94,.3);border-radius:3px;padding:0 5px;margin-left:6px}}
.hm-head .hm-name,.hm-head .hm-cum{{font-size:11px;color:var(--muted);font-weight:500}}
.hm-cells{{display:grid;grid-template-columns:repeat(15,minmax(0,1fr));gap:4px}}
.hm-cell{{height:28px;border-radius:5px;transition:transform .15s cubic-bezier(.16,1,.3,1),box-shadow .15s;position:relative}}
.hm-cell:hover{{transform:scale(1.22);box-shadow:0 0 0 2px var(--txt),0 4px 12px rgba(0,0,0,.5);z-index:2}}
.hm-day{{display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--muted);font-family:"Cascadia Code",monospace;height:20px}}
.hm-cum{{font-size:13px;font-weight:700;font-family:"Cascadia Code",monospace;text-align:right;white-space:nowrap}}
.hm-cum.up{{color:var(--up)}}.hm-cum.down{{color:var(--down)}}
.hm-legend{{display:flex;align-items:center;gap:4px;margin-bottom:18px;flex-wrap:wrap}}
.hm-legend .lg-label{{font-size:11px;color:var(--muted);margin:0 6px}}
.hm-legend .lg-cell{{width:20px;height:14px;border-radius:3px}}
.hm-legend .lg-note{{font-size:10px;color:var(--muted);margin-left:10px;font-family:"Cascadia Code",monospace}}
.rot-summary{{margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:10px}}
.rot-item{{background:var(--sur);border:1px solid var(--line);border-radius:8px;padding:12px 14px}}
.rot-title{{display:flex;align-items:center;font-size:13px;font-weight:600;color:var(--acc2);margin-bottom:4px}}
.rot-title::before{{content:"";flex-shrink:0;width:8px;height:8px;border-radius:2px;background:var(--acc2);margin-right:8px}}
.rot-item:nth-of-type(1) .rot-title::before{{background:var(--up)}}
.rot-item:nth-of-type(2) .rot-title::before{{background:var(--warn)}}
.rot-item:nth-of-type(3) .rot-title::before{{background:var(--acc)}}
.rot-item:nth-of-type(4) .rot-title::before{{background:var(--acc2)}}
.rot-desc{{font-size:12px;color:var(--muted);line-height:1.6}}
@media(max-width:860px){{
  .rot-summary{{grid-template-columns:1fr}}
  .hm-row{{grid-template-columns:96px 1fr 60px;gap:8px}}
  .hm-cell{{height:20px;border-radius:4px}}
  .hm-name{{font-size:11px}}
}}
'''

path = os.path.join(BASE, "output/行情复盘_20260814.html")
html = open(path, encoding="utf-8").read()
html = html.replace("</style>", css + "</style>")

# 替换旧章节
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

t = open(path, encoding="utf-8").read()
o = len(re.findall(r'<div[^>]*>', t))
c = len(re.findall(r'</div>', t))
print(f"div: 开{o} 闭{c} {'平衡' if o==c else '不平衡!'}")
_hm_cells = len(re.findall(r'class="hm-cell"', t))
print(f"hm-cell 色块数: {_hm_cells}")
