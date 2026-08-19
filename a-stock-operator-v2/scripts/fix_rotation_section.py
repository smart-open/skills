# -*- coding: utf-8 -*-
import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
"""修复：精确替换旧轮动章节，保留 div 平衡"""
import re

path = os.path.join(BASE, "output/行情复盘_20260814.html")
html = open(path, encoding="utf-8").read()

# 找旧章节起始
start_marker = '<div class="section">\n  <div class="section-head"><span class="no">07</span><h2>近一月板块轮动</h2>'
start_idx = html.find(start_marker)
if start_idx == -1:
    # 也可能是 v2 已替换过，尝试新章节开头
    start_marker = '<div class="section">\n  <div class="section-head"><span class="no">07</span><h2>近一月板块轮动</h2>'
    start_idx = html.find(start_marker)

if start_idx == -1:
    print("未找到旧章节起始，跳过")
    exit()

# 从 start_idx 开始向后数 div 平衡，找到匹配的结束 </div>
depth = 0
i = start_idx
end_idx = -1
for m in re.finditer(r'<div[^>]*>|</div>', html[start_idx:]):
    if m.group().startswith('</div>'):
        depth -= 1
    else:
        depth += 1
    if depth == 0:
        end_idx = start_idx + m.end()
        break

print(f"旧章节范围: {start_idx} - {end_idx}")
print(f"长度: {end_idx - start_idx}")

old_section = html[start_idx:end_idx]
# 数一下旧章节的开闭 div
o_open = len(re.findall(r'<div[^>]*>', old_section))
o_close = len(re.findall(r'</div>', old_section))
print(f"旧章节: 开{o_open} 闭{o_close}")

# ============= 新章节（v2：3日并列对比 + 涨停个数 + 节奏） =============
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

def fmt_pct_short(v, rank):
    if v is None: return "—"
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

section = f'''<div class="section">
  <div class="section-head"><span class="no">07</span><h2>近一月板块轮动</h2><span class="desc">3 日并列对比 · 涨幅 + 涨停个数 · 轮动节奏</span><span class="line"></span></div>

  <p class="muted" style="font-size:12px;margin-bottom:14px">综合 <b>涨幅</b> 与 <b>涨停家数</b> 双指标，标记 08-12 / 08-13 / 08-14 三日轮动节奏。08-14 数据为收盘；涨停个数按概念板块关键词从涨停池 reason 匹配统计。</p>

  <div class="rot-table-wrap">
    <table class="rot-table">
      <tr>
        <th>#</th><th>板块</th>
        <th>08-14 涨幅</th><th>涨停只</th>
        <th>08-13 涨幅</th><th>08-12 涨幅</th>
        <th>轮动节奏</th>
      </tr>{tr_html}
    </table>
  </div>

  <h4 style="font-size:14px;margin:20px 0 10px;color:var(--acc)">三日条形轮动节奏</h4>
  <div class="rot-strip">{rhythm_strip}</div>

  <div class="rot-summary">
    <h4 style="font-size:14px;margin-bottom:10px;color:var(--acc)">轮动节奏综述</h4>
    <div class="rot-item"><span class="rot-title">🔥 主线持续</span><span class="rot-desc">CPO / 光纤 / F5G 在 08-12 与 08-14 两日均位列涨幅榜前列，是近一月唯一持续主线</span></div>
    <div class="rot-item"><span class="rot-title">🟠 医药 08-13 启动</span><span class="rot-desc">CRO +3.13% / 重组蛋白 +2.50% / 创新药 +1.78% 集中爆发；08-14 板块涨幅回落但 8 只涨停延续热度</span></div>
    <div class="rot-item"><span class="rot-title">⬆️ 政策催化</span><span class="rot-desc">稀土（供给政策）低位启动，单日冲高</span></div>
    <div class="rot-item"><span class="rot-title">🔄 高低切换</span><span class="rot-desc">资金从软件(-122亿)/证券(-112亿)/半导体(-96亿)撤出，扑向通信硬件</span></div>
  </div>
  <p class="muted" style="font-size:11px;margin-top:10px">注：08-12、08-13 涨幅数据来自证券时报/财联社公开报道；08-14 收盘数据来自东方财富 push2delay 镜像接口；涨停只数按 reason 关键词匹配。</p>
</div>'''

new_html = html[:start_idx] + section + html[end_idx:]

# 数新章节的 div 平衡
s_open = len(re.findall(r'<div[^>]*>', section))
s_close = len(re.findall(r'</div>', section))
print(f"新章节: 开{s_open} 闭{s_close}")

# 写入
open(path, "w", encoding="utf-8").write(new_html)
print("替换完成")

# 整体验证
total = open(path, encoding="utf-8").read()
t_open = len(re.findall(r'<div[^>]*>', total))
t_close = len(re.findall(r'</div>', total))
print(f"整体: 开{t_open} 闭{t_close}")