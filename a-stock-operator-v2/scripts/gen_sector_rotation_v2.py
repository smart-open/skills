# -*- coding: utf-8 -*-
import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
"""近一月板块轮动 v2：3日并列对比表 + 涨停个数 + 节奏标记（参考图片样式）"""

# 3 天涨幅数据（08-12、08-13 来自证券时报/财联社，08-14 来自 push2delay）
# 格式：(板块, 08-14涨幅, 涨停只数, 08-13涨幅(排名), 08-12涨幅(排名), 节奏, 节奏颜色)
rows = [
    ("CPO概念",      +3.18, 7,  None,         +2.98, 4,  "主线持续",     "hot"),
    ("F5G概念",      +3.09, 1,  None,         +2.71, 6,  "通信扩散",     "hot"),
    ("光通信模块",    +2.93, 1,  None,         None,  None,"主线延续",     "hot"),
    ("光纤概念",      +2.60, 3,  None,         +3.29, 3,  "持续主升",     "hot"),
    ("创新药/CRO",   +1.20, 8,  +3.13,        None,  None,"08-13 启动",   "warn"),
    ("机器人",       +1.50, 8,  None,         None,  None,"AI 外溢",     "warn"),
    ("稀土永磁",     +2.30, 2,  None,         None,  None,"政策启动",     "blue"),
]

color_map = {"hot": "#ff4d5e", "warn": "#ffb454", "blue": "#4f8cff"}

def fmt_pct(v, rank):
    if v is None:
        return "—"
    return f"{v:+.2f}%<sup>{rank}</sup>"

# 表格 HTML
# 数据结构：(name, p14, zt, p13, p12, r12, rhy, typ)  8 个元素
def fmt_pct_short(v, rank):
    if v is None:
        return "—"
    r = f"<sup>{rank}</sup>" if rank else ""
    return f"{v:+.2f}%{r}"

tr_html = ""
for i, (name, p14, zt, p13, p12, r12, rhy, typ) in enumerate(rows, 1):
    col = color_map[typ]
    d13 = f"{p13:+.2f}%" if p13 is not None else "—"
    tr_html += f'''
    <tr>
      <td class="rank">{i}</td>
      <td class="sname">{name}</td>
      <td class="gain"><b style="color:{col}">{p14:+.2f}%</b></td>
      <td class="zt"><b>{zt}</b><span class="ztlab">只</span></td>
      <td class="d13">{d13}</td>
      <td class="d12">{fmt_pct_short(p12, r12)}</td>
      <td class="rhythm" style="color:{col};border-color:{col}">{rhy}</td>
    </tr>'''

# 节奏色谱图
rhythm_strip = ""
for name, p14, zt, p13, p12, r12, rhy, typ in rows:
    col = color_map[typ]
    rhythm_strip += f'<div class="rs-item"><span class="rs-name">{name}</span>'
    rhythm_strip += '<span class="rs-bars">'
    for v, label in [(p12, "12"), (p13, "13"), (p14, "14")]:
        if v is None:
            rhythm_strip += f'<span class="rs-bar empty">{label}</span>'
        else:
            w = min(abs(v) * 22, 100)
            color = col if v >= 0 else "#37d99a"
            rhythm_strip += f'<span class="rs-bar"><b>{label}</b><i style="width:{w}%;background:{color}"></i></span>'
    rhythm_strip += '</span></div>'

section = f'''
<div class="section">
  <div class="section-head"><span class="no">07</span><h2>近一月板块轮动</h2><span class="desc">3 日对比 · 涨幅 + 涨停个数 · 轮动节奏</span><span class="line"></span></div>

  <p class="muted" style="font-size:12px;margin-bottom:14px">综合 <b>涨幅</b> 与 <b>涨停家数</b> 双指标，标记 08-12 / 08-13 / 08-14 三日轮动节奏。8/14 数据为收盘；涨停个数按概念板块关键词从涨停池 reason 匹配统计。</p>

  <div class="rot-table-wrap">
    <table class="rot-table">
      <tr>
        <th>#</th><th>板块</th>
        <th>08-14 涨幅</th><th>涨停只</th>
        <th>08-13 涨幅</th><th>08-12 涨幅</th>
        <th>轮动节奏</th>
      </tr>
      {tr_html}
    </table>
  </div>

  <h4 style="font-size:14px;margin:20px 0 10px;color:var(--acc)">三日条形轮动节奏</h4>
  <div class="rot-strip">{rhythm_strip}</div>

  <div class="rot-summary">
    <h4 style="font-size:14px;margin-bottom:10px;color:var(--acc)">轮动节奏综述</h4>
    <div class="rot-item"><span class="rot-title">🔥 主线持续</span><span class="rot-desc">CPO / 光纤 / 5G / 光通信 在 08-12 与 08-14 两日均位列涨幅榜前列，是近一月唯一持续主线</span></div>
    <div class="rot-item"><span class="rot-title">🟠 医药 08-13 启动</span><span class="rot-desc">CRO +3.13% / 重组蛋白 +2.50% / 创新药 +1.78% 集中爆发；08-14 板块涨幅回落但 8 只涨停延续热度</span></div>
    <div class="rot-item"><span class="rot-title">⬆️ 政策催化</span><span class="rot-desc">稀土（供给政策）、商业航天低位启动，单日冲高</span></div>
    <div class="rot-item"><span class="rot-title">🔄 高低切换</span><span class="rot-desc">资金从软件(-122亿)/证券(-112亿)/半导体(-96亿)撤出，扑向通信硬件</span></div>
  </div>
  <p class="muted" style="font-size:11px;margin-top:10px">注：08-12、08-13 涨幅数据来自证券时报/财联社公开报道；08-14 收盘数据来自东方财富 push2delay 镜像接口；涨停只数按 reason 关键词匹配。</p>
</div>
'''

css = '''
.rot-table-wrap{{overflow-x:auto;margin-bottom:18px}}
.rot-table{{width:100%;border-collapse:collapse;font-size:13px}}
.rot-table th{{text-align:left;font-size:11px;font-weight:500;color:var(--muted);padding:10px 8px;border-bottom:1px solid var(--glow);letter-spacing:.5px;white-space:nowrap}}
.rot-table td{{padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:middle}}
.rot-table tr:hover td{{background:rgba(79,140,255,.04)}}
.rot-table .rank{{font-family:"Cascadia Code",monospace;font-size:15px;color:var(--acc);width:36px}}
.rot-table .sname{{font-weight:600}}
.rot-table .gain b{{font-size:15px}}
.rot-table .gain sup{{font-size:9px;color:var(--muted);margin-left:2px;font-weight:400}}
.rot-table .zt{{font-family:"Cascadia Code",monospace;color:var(--up);font-size:18px;font-weight:700}}
.rot-table .zt b{{margin-right:2px}}
.rot-table .ztlab{{font-size:10px;color:var(--muted);font-family:inherit}}
.rot-table .d13,.rot-table .d12{{font-family:"Cascadia Code",monospace;font-size:13px}}
.rot-table .d13 sup,.rot-table .d12 sup{{color:var(--muted);margin-left:3px;font-size:9px}}
.rot-table .rhythm{{display:inline-block;font-size:11px;font-weight:600;padding:3px 10px;border-radius:4px;border:1px solid;white-space:nowrap}}
.rot-strip{{display:flex;flex-direction:column;gap:6px;margin-bottom:18px}}
.rs-item{{display:grid;grid-template-columns:120px 1fr;gap:12px;align-items:center;padding:8px 12px;background:var(--sur);border:1px solid var(--line);border-radius:6px}}
.rs-name{{font-size:13px;font-weight:600}}
.rs-bars{{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}}
.rs-bar{{position:relative;height:18px;border-radius:3px;overflow:hidden;background:#1a2138;display:flex;align-items:center;justify-content:flex-start}}
.rs-bar.empty{{background:#252b40;opacity:.5}}
.rs-bar b{{position:relative;z-index:2;font-family:"Cascadia Code",monospace;font-size:10px;color:#fff;padding:0 6px;text-shadow:0 1px 2px rgba(0,0,0,.8)}}
.rs-bar i{{position:absolute;left:0;top:0;height:100%;z-index:1}}
.rot-summary{{margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:10px}}
.rot-item{{background:var(--sur);border:1px solid var(--line);border-radius:8px;padding:12px 14px}}
.rot-title{{display:block;font-size:13px;font-weight:600;color:var(--acc2);margin-bottom:4px}}
.rot-desc{{font-size:12px;color:var(--muted);line-height:1.6}}
@media(max-width:760px){{
  .rot-summary{{grid-template-columns:1fr}}
  .rs-item{{grid-template-columns:1fr}}
  .rot-table{{font-size:11px}}
  .rot-table .sname{{font-size:12px}}
}}
'''

path = os.path.join(BASE, "output/行情复盘_20260814.html")
html = open(path, encoding="utf-8").read()
html = html.replace("</style>", css + "</style>")

import re
# 替换旧的「近一月板块轮动」section（用正则匹配整个 section 块）
pattern = re.compile(
    r'<div class="section">\s*<div class="section-head"><span class="no">07</span><h2>近一月板块轮动</h2>.*?</div>\s*</div>',
    re.DOTALL)
html = pattern.sub(section.strip(), html)

open(path, "w", encoding="utf-8").write(html)
print("已替换为「近一月板块轮动 v2」章节（3 日对比 + 涨停个数）")