# -*- coding: utf-8 -*-
import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
"""近一月板块前7 + 轮动节奏章节（数据基于公开资讯交叉验证）"""

# 板块前7：名称、区间涨幅参考、节奏标签、节奏类型、逻辑
sectors = [
    ("光通信 / CPO / 光模块", "通信ETF 8月 +19.3% · 近10日 +19.5%", "主线领涨", "hot",
     "AI 算力核心赛道，中报兑现（新易盛预增 77%~103%）+ 英伟达 CPO 量产 + 中际旭创收购中石科技"),
    ("稀土 / 小金属", "8/14 单日 +5.4%", "政策启动", "blue",
     "2026 年稀土管控政策密集落地，供给收紧 + 需求放量，中国稀土涨停"),
    ("电子化学品 / 半导体材料", "低位放量走强", "补涨轮动", "warn",
     "AI 服务器上游材料需求，中石科技、海星股份涨停，1.6T 产能紧缺"),
    ("创新药 / 医药", "轮动活跃", "轮动活跃", "warn",
     "药监局批新药 + 创新药占比 53%，博济医药、神奇制药 2 连板"),
    ("算力租赁 / 液冷", "主线扩散", "主线扩散", "hot",
     "AI 算力向纵深蔓延，网宿科技、数据港、康盛股份涨停，液冷国标发布"),
    ("有色金属（铜/钽/稀有金属）", "涨价驱动", "涨价轮动", "gold",
     "美国抢铜潮 + 钽价飙升 158% + 铜箔涨价 20%，稀有金属 ETF +2.15%"),
    ("商业航天 / 军工", "政策催化", "政策启动", "blue",
     "江苏商业航天政策 + 大飞机概念，利君股份、成飞集成涨停"),
]

# 轮动综述
summary = [
    ("唯一主线", "AI 算力（光通信/CPO）贯穿全程，是近一月唯一持续领涨主线，近10日主力净流入 554 亿"),
    ("高低切换", "资金从软件开发(-122亿)、证券(-112亿)、半导体(-96亿)撤出，掉头扑向通信硬件"),
    ("政策催化", "稀土（供给政策）、商业航天（江苏政策）低位启动，属政策驱动型新方向"),
    ("补涨外溢", "电子化学品、液冷、有色等 AI 上游/资源品承接主线溢出资金，存在补涨机会"),
]

# 颜色映射
color_map = {"hot": "#ff4d5e", "blue": "#4f8cff", "warn": "#ffb454", "gold": "#f5c451"}

rows_html = ""
for i, (name, gain, tag, typ, logic) in enumerate(sectors, 1):
    col = color_map[typ]
    rows_html += f'''
      <tr>
        <td class="rank">{i}</td>
        <td class="sname">{name}</td>
        <td class="gain mono">{gain}</td>
        <td><span class="rhythm" style="color:{col};border-color:{col}">{tag}</span></td>
        <td class="logic">{logic}</td>
      </tr>'''

summary_html = ""
for title, desc in summary:
    summary_html += f'''
    <div class="rot-item"><span class="rot-title">{title}</span><span class="rot-desc">{desc}</span></div>'''

section = f'''
<div class="section">
  <div class="section-head"><span class="no">07</span><h2>近一月板块轮动</h2><span class="desc">涨幅前 7 · 轮动节奏标记</span><span class="line"></span></div>
  <div class="rot-table-wrap">
    <table class="rot-table">
      <tr><th>#</th><th>板块</th><th>区间涨幅参考</th><th>节奏</th><th>轮动逻辑</th></tr>
      {rows_html}
    </table>
  </div>
  <div class="rot-summary">
    <h4 style="font-size:14px;margin-bottom:10px;color:var(--acc)">轮动节奏综述</h4>
    {summary_html}
  </div>
  <p class="muted" style="font-size:11px;margin-top:10px">注：区间涨幅参考口径为「7 月下旬反弹以来 / 8 月以来」，据公开财经资讯交叉验证；节奏标签为定性判断，供复盘参考。</p>
</div>
'''

css = '''
.rot-table-wrap{{overflow-x:auto}}
.rot-table{{width:100%;border-collapse:collapse;font-size:13px}}
.rot-table th{{text-align:left;font-size:11px;font-weight:500;color:var(--muted);padding:9px 10px;border-bottom:1px solid var(--glow);letter-spacing:.5px;white-space:nowrap}}
.rot-table td{{padding:10px;border-bottom:1px solid var(--line);vertical-align:top}}
.rot-table .rank{{font-family:"Cascadia Code",monospace;font-size:16px;color:var(--acc);width:36px}}
.rot-table .sname{{font-weight:600;white-space:nowrap}}
.rot-table .gain{{font-size:12px;white-space:nowrap}}
.rot-table .logic{{font-size:12px;color:var(--muted);line-height:1.5}}
.rhythm{{display:inline-block;font-size:11px;font-weight:600;padding:2px 9px;border-radius:4px;border:1px solid;white-space:nowrap}}
.rot-summary{{margin-top:18px;display:grid;grid-template-columns:1fr 1fr;gap:10px}}
.rot-item{{background:var(--sur);border:1px solid var(--line);border-radius:8px;padding:12px 14px}}
.rot-title{{display:block;font-size:13px;font-weight:600;color:var(--acc2);margin-bottom:4px}}
.rot-desc{{font-size:12px;color:var(--muted);line-height:1.6}}
@media(max-width:760px){{.rot-summary{{grid-template-columns:1fr}}}}
'''

path = os.path.join(BASE, "output/行情复盘_20260814.html")
html = open(path, encoding="utf-8").read()
html = html.replace("</style>", css + "</style>")
# 重命名后续章节编号：个股推荐 07→08，涨跌幅榜 08→09
html = html.replace('<h2>个股推荐</h2>', '<h2>个股推荐</h2>')
html = html.replace('<span class="no">07</span><h2>个股推荐</h2>', '<span class="no">08</span><h2>个股推荐</h2>')
html = html.replace('<span class="no">08</span><h2>涨跌幅榜', '<span class="no">09</span><h2>涨跌幅榜')
# 在「个股推荐」章节前插入板块轮动章节
html = html.replace('<div class="section">\n  <div class="section-head"><span class="no">08</span><h2>个股推荐</h2>',
                    section + '\n<div class="section">\n  <div class="section-head"><span class="no">08</span><h2>个股推荐</h2>')

open(path, "w", encoding="utf-8").write(html)
print("已插入「近一月板块轮动」章节")
