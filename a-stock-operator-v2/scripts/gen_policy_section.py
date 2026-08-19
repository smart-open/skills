# -*- coding: utf-8 -*-
import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
"""生成「重点政策/消息 Top5」+「热点可持续性板块 Top3」章节并合并进报告"""

# ===== 重点政策/消息 Top5 =====
policies = [
    {
        "no": 1, "star": "★★★★★",
        "title": "数据中心液冷技术国标发布，液冷产业链迎标准落地",
        "tag": "产业政策",
        "impact": "液冷散热成为 AI 算力确定性配套，康盛股份涨停、中石科技 20cm，液冷服务器概念集体走强",
        "stocks": "康盛股份(002418)、中石科技(300684)、豪美新材(002988)",
    },
    {
        "no": 2, "star": "★★★★★",
        "title": "中芯国际业绩会：AI 配套芯片供不应求，晶圆均价环比 +5.7%",
        "tag": "产业基本面",
        "impact": "算力及配套芯片需求旺盛、产能利用率维持 95% 高位，强化半导体/算力主线景气度",
        "stocks": "中芯国际(688981)、华虹公司(688347)、网宿科技(300017)",
    },
    {
        "no": 3, "star": "★★★★",
        "title": "江苏出台商业航天政策：支持火箭整机制造与龙头对接资本市场",
        "tag": "政策催化",
        "impact": "叠加太空计算降本、卫星核心元器件布局，利君股份、成飞集成当日涨停呼应",
        "stocks": "利君股份(002651)、成飞集成(002190)、航发科技(600391)",
    },
    {
        "no": 4, "star": "★★★★",
        "title": "创新药里程碑：抗肿瘤药市场创新药占比达 53%，药监局再批 1 款新药",
        "tag": "政策+产业数据",
        "impact": "创新药入医保反哺创新，卖方医药路演热度追平科技，CRO/创新药共振",
        "stocks": "博济医药(300404)、誉衡药业(002437)、华森制药(002907)",
    },
    {
        "no": 5, "star": "★★★",
        "title": "南亚铜箔基板再涨 20% + 上半年钽价飙升 158%",
        "tag": "涨价催化",
        "impact": "PCB/CCL 与稀有金属供给扰动共振，电子化学品、稀有金属板块持续走强",
        "stocks": "华正新材(603186)、中国稀土(000831)、北方稀土(600111)",
    },
]

# ===== 热点可持续性板块 Top3 =====
sectors = [
    {
        "rank": 1, "name": "AI 算力 / CPO / 液冷",
        "sustain": "★★★★★ 高",
        "logic": "液冷国标落地 + 中芯国际 AI 需求 + 机构定调「算力最清晰主线」+ 通信板块资金净流入超百亿，催化密集且可延续",
        "stocks": [
            ("亨通光电", "600487", "光纤+硅光芯片+CPO", "主板"),
            ("网宿科技", "300017", "算力租赁 20cm", "创业板"),
            ("阿莱德", "301419", "CPO 散热 20cm", "创业板"),
            ("康盛股份", "002418", "数据中心液冷", "主板"),
        ],
    },
    {
        "rank": 2, "name": "创新药 / CRO / 医药",
        "sustain": "★★★★ 中高",
        "logic": "药监局批准新药 + 创新药占比 53% + 卖方医药路演热度追平科技，政策与产业数据双催化",
        "stocks": [
            ("博济医药", "300404", "CRO 20cm 2连板", "创业板"),
            ("誉衡药业", "002437", "创新药 放量", "主板"),
            ("神奇制药", "600613", "化学制药 2连板", "主板"),
            ("华森制药", "002907", "创新药+中成药", "主板"),
        ],
    },
    {
        "rank": 3, "name": "稀有金属 / 稀土 / 铜",
        "sustain": "★★★ 中",
        "logic": "美联储加息降温 + 美国「抢铜潮」+ 钽价飙升 158% + 铜箔涨价 20%，涨价与供给扰动共振但受宏观预期影响",
        "stocks": [
            ("中国稀土", "000831", "稀土 涨停", "主板"),
            ("北方稀土", "600111", "稀土 涨超3%", "主板"),
            ("豪美新材", "002988", "工业金属+液冷 首板", "主板"),
        ],
    },
]

RED, GREEN, SUB, ACC, WARN, GOLD = "#ff6b6b", "#37d39a", "#9aa3b2", "#5b8cff", "#ffb454", "#f5c451"

# 政策卡片
policy_html = ""
for p in policies:
    policy_html += f'''
      <div class="policy-card">
        <div class="p-head">
          <span class="p-no">{p["no"]}</span>
          <span class="p-title">{p["title"]}</span>
          <span class="p-star">{p["star"]}</span>
        </div>
        <div class="p-meta"><span class="p-tag">{p["tag"]}</span></div>
        <div class="p-impact">{p["impact"]}</div>
        <div class="p-stocks">受益标的：<span style="color:{ACC}">{p["stocks"]}</span></div>
      </div>'''

# 板块卡片
sector_html = ""
for s in sectors:
    stock_chips = ""
    for name, code, theme, board in s["stocks"]:
        board_tag = f'<span class="chip-board">{board}</span>' if board != "主板" else ""
        stock_chips += f'''
          <div class="s-stock">
            <div class="ss-name">{name}<span class="ss-code">{code}</span>{board_tag}</div>
            <div class="ss-theme">{theme}</div>
          </div>'''
    sector_html += f'''
      <div class="sector-card">
        <div class="sec-head">
          <span class="sec-rank">{s["rank"]}</span>
          <span class="sec-name">{s["name"]}</span>
          <span class="sec-sustain" style="color:{GOLD}">{s["sustain"]}</span>
        </div>
        <div class="sec-logic">{s["logic"]}</div>
        <div class="s-stocks">{stock_chips}
        </div>
      </div>'''

section = f'''
<div class="section">
  <h2>五、重点政策 / 消息 Top5</h2>
  <div class="policy-grid">{policy_html}
  </div>
</div>

<div class="section">
  <h2>六、热点可持续性板块 Top3（附个股）</h2>
  <div class="sector-grid">{sector_html}
  </div>
</div>
'''

css = '''
/* 政策/消息 Top5 */
.policy-grid{{display:grid;grid-template-columns:1fr;gap:10px}}
.policy-card{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}}
.p-head{{display:flex;align-items:center;gap:10px}}
.p-no{{background:var(--acc);color:#fff;width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0}}
.p-title{{font-size:15px;font-weight:600;flex:1}}
.p-star{{color:var(--gold);font-size:13px;flex-shrink:0}}
.p-meta{{margin:8px 0 4px}}
.p-tag{{display:inline-block;font-size:11px;color:var(--acc);background:rgba(91,140,255,.12);border:1px solid rgba(91,140,255,.3);border-radius:4px;padding:2px 8px}}
.p-impact{{font-size:13px;color:var(--sub);line-height:1.6}}
.p-stocks{{font-size:12px;color:var(--sub);margin-top:6px}}
/* 板块可持续性 */
.sector-grid{{display:grid;grid-template-columns:1fr;gap:12px}}
.sector-card{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px}}
.sec-head{{display:flex;align-items:center;gap:10px;margin-bottom:8px}}
.sec-rank{{background:var(--red);color:#fff;width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0}}
.sec-name{{font-size:17px;font-weight:700}}
.sec-sustain{{font-size:13px;font-weight:600;margin-left:auto}}
.sec-logic{{font-size:13px;color:var(--sub);line-height:1.6;margin-bottom:12px}}
.s-stocks{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}}
.s-stock{{background:var(--card2);border:1px solid var(--line);border-radius:8px;padding:10px 12px}}
.ss-name{{font-size:14px;font-weight:600}}
.ss-code{{color:var(--sub);font-size:11px;margin-left:6px}}
.ss-theme{{font-size:12px;color:var(--acc);margin-top:3px}}
.chip-board{{display:inline-block;font-size:10px;color:var(--warn);border:1px solid rgba(255,180,84,.4);border-radius:3px;padding:0 4px;margin-left:6px}}
@media(max-width:768px){{.s-stocks{{grid-template-columns:repeat(2,1fr)}}}}
'''

path = os.path.join(BASE, "output/行情复盘_20260814.html")
html = open(path, encoding="utf-8").read()

# 插入 CSS
html = html.replace("</style>", css + "</style>")
# 重命名旧章节编号
html = html.replace("<h2>五、炸板个股明细", "<h2>八、炸板个股明细")
html = html.replace("<h2>六、个股推荐", "<h2>七、个股推荐")
# 在「五、炸板个股明细」（现八）之前插入新章节
html = html.replace('<div class="section" style="margin-top:24px">\n  <h2>八、炸板个股明细',
                    section + '\n<div class="section" style="margin-top:24px">\n  <h2>八、炸板个股明细')

open(path, "w", encoding="utf-8").write(html)
print("已合并「重点政策/消息 Top5」+「热点可持续性板块 Top3」章节")
