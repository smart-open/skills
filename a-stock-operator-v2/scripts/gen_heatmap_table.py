# -*- coding: utf-8 -*-
import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
"""近一月板块轮动 → 清晰数据表格（每格显示涨跌幅数字，红涨绿跌）"""
import json, re

data = json.load(open(os.path.join(BASE, "data/sector_15d.json"), encoding="utf-8"))

board_order = [
    ("CPO概念", 7), ("F5G概念", 1), ("光纤概念", 3),
    ("铜缆高速连接", 1), ("创新药", 8), ("机器人概念", 8), ("稀土永磁", 2),
]

all_dates = set()
for v in data.values():
    for d, _ in v:
        all_dates.add(d)
dates = sorted(all_dates)[-15:]

def chg_cls(v):
    if v is None:
        return ""
    if v > 0:
        return "up"
    if v < 0:
        return "down"
    return "flat"

# 表头
th_dates = "".join(f'<th>{d[4:6]}-{d[6:]}</th>' for d in dates)

# 数据行
rows_html = ""
for name, zt in board_order:
    kv = dict(data.get(name, []))
    tds = ""
    for d in dates:
        v = kv.get(d)
        cls = chg_cls(v)
        txt = f"{v:+.1f}" if v is not None else "—"
        tds += f'<td class="{cls}">{txt}</td>'
    vals = [kv.get(d) for d in dates if kv.get(d) is not None]
    cum = sum(vals) if vals else 0
    cum_cls = "up" if cum > 0 else ("down" if cum < 0 else "flat")
    rows_html += f'''
    <tr>
      <td class="sticky sname">{name}<em class="zt">{zt}板</em></td>
      <td class="mono td-zt">{zt}</td>
      {tds}
      <td class="mono cum {cum_cls}">{cum:+.1f}%</td>
    </tr>'''

section = f'''
<div class="section">
  <div class="section-head"><span class="no">07</span><h2>近一月板块轮动</h2><span class="desc">近 15 个交易日逐日涨跌幅（%）</span><span class="line"></span></div>

  <p class="muted" style="font-size:12px;margin-bottom:14px">前 7 板块近 <b>15 个交易日</b>逐日涨跌幅明细（单位 %，红涨绿跌），末列 <b>15 日累计涨幅</b>，板块名旁标注当日涨停家数。横向滑动查看全部日期。</p>

  <div class="hm-table-wrap">
    <table class="hm-table">
      <thead>
        <tr>
          <th class="sticky">板块</th>
          <th>涨停</th>
          {th_dates}
          <th class="th-cum">15日累计</th>
        </tr>
      </thead>
      <tbody>
        {rows_html}
      </tbody>
    </table>
  </div>

  <div class="rot-summary">
    <h4 style="font-size:14px;margin:18px 0 10px;color:var(--acc)">轮动节奏综述</h4>
    <div class="rot-item"><span class="rot-title">主线持续</span><span class="rot-desc">CPO / 光纤 / F5G 多日飘红贯穿，AI 算力是唯一持续主线</span></div>
    <div class="rot-item"><span class="rot-title">医药脉冲</span><span class="rot-desc">创新药 08-13 前后集中转红（+1.78%），属阶段性轮动而非持续主线</span></div>
    <div class="rot-item"><span class="rot-title">政策催化</span><span class="rot-desc">稀土永磁受供给政策驱动，低位启动</span></div>
    <div class="rot-item"><span class="rot-title">高低切换</span><span class="rot-desc">资金从软件/证券/半导体撤出，扑向通信硬件，机器人/液冷外溢补涨</span></div>
  </div>
  <p class="muted" style="font-size:11px;margin-top:10px">注：逐日涨跌数据来自同花顺概念指数；涨停家数按概念板块关键词从涨停池匹配统计。</p>
</div>
'''

css = '''
.hm-table-wrap{{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--sur);margin-bottom:6px}}
.hm-table{{width:100%;border-collapse:collapse;font-size:12px}}
.hm-table th,.hm-table td{{padding:9px 7px;text-align:center;white-space:nowrap;border-bottom:1px solid var(--line);font-family:"Cascadia Code",Consolas,monospace}}
.hm-table th{{font-size:10px;color:var(--muted);font-weight:500;border-bottom:2px solid var(--glow);letter-spacing:.3px}}
.hm-table td{{font-variant-numeric:tabular-nums}}
.hm-table .up{{color:var(--up)}}
.hm-table .down{{color:var(--down)}}
.hm-table .flat{{color:var(--muted)}}
.hm-table tbody tr:hover td{{background:rgba(79,140,255,.05)}}
.hm-table tbody tr:nth-child(even) td{{background:rgba(255,255,255,.015)}}
.hm-table tbody tr:nth-child(even):hover td{{background:rgba(79,140,255,.05)}}
.hm-table .sticky{{position:sticky;left:0;background:var(--sur);z-index:1;text-align:left;font-family:-apple-system,"PingFang SC",sans-serif;font-weight:600;min-width:120px}}
.hm-table tbody tr:nth-child(even) .sticky{{background:var(--sur)}}
.hm-table tbody tr:hover .sticky{{background:var(--sur2)}}
.hm-table .sname{{font-size:13px;color:var(--txt)}}
.hm-table .sname .zt{{font-style:normal;font-size:10px;color:var(--up);background:rgba(255,77,94,.12);border:1px solid rgba(255,77,94,.3);border-radius:3px;padding:0 4px;margin-left:5px}}
.hm-table .td-zt{{color:var(--up);font-weight:600}}
.hm-table .th-cum{{color:var(--acc)}}
.hm-table .cum{{font-weight:700}}
.rot-summary{{margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:10px}}
.rot-item{{background:var(--sur);border:1px solid var(--line);border-radius:8px;padding:12px 14px}}
.rot-title{{display:flex;align-items:center;font-size:13px;font-weight:600;color:var(--acc2);margin-bottom:4px}}
.rot-title::before{{content:"";flex-shrink:0;width:8px;height:8px;border-radius:2px;background:var(--acc2);margin-right:8px}}
.rot-item:nth-of-type(1) .rot-title::before{{background:var(--up)}}
.rot-item:nth-of-type(2) .rot-title::before{{background:var(--warn)}}
.rot-item:nth-of-type(3) .rot-title::before{{background:var(--acc)}}
.rot-item:nth-of-type(4) .rot-title::before{{background:var(--acc2)}}
.rot-desc{{font-size:12px;color:var(--muted);line-height:1.6}}
@media(max-width:860px){{.rot-summary{{grid-template-columns:1fr}}}}
'''

path = os.path.join(BASE, "output/行情复盘_20260814.html")
html = open(path, encoding="utf-8").read()
html = html.replace("</style>", css + "</style>")

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
        print("旧章节已替换为表格")

open(path, "w", encoding="utf-8").write(html)

t = open(path, encoding="utf-8").read()
o = len(re.findall(r'<div[^>]*>', t))
c = len(re.findall(r'</div>', t))
print(f"div: 开{o} 闭{c} {'平衡' if o==c else '不平衡!'}")
print(f"表格数据行: {len(re.findall(r'<tr>', t))}")
_ud_cells = len(re.findall(r'class="(up|down|flat)"', t))
print(f"涨跌数字格(up/down): {_ud_cells}")
