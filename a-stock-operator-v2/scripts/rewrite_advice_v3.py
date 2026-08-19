# -*- coding: utf-8 -*-
import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
"""最终诊断操作建议 v3：宽松 flex 布局，文本不堆积"""
import re

path = os.path.join(BASE, "output/通鼎互联_个股诊断_20260814.html")
html = open(path, encoding="utf-8").read()

section = '''
<div class="section">
  <div class="section-head"><span class="no">07</span><h2>最终诊断操作建议</h2><span class="line"></span></div>

  <!-- 1. 评级概览 -->
  <div class="adv-hero">
    <div class="adv-score">
      <div class="adv-ring"><span class="adv-num">5.15</span><span class="adv-den">/ 10</span></div>
      <div class="adv-label">综合评级 · <b style="color:var(--warn)">中性观望</b></div>
    </div>
    <div class="adv-indicators">
      <div class="adv-ind"><span class="ind-k">仓位参考</span><span class="ind-v">5-10%</span><span class="ind-d">小仓位观察，不加仓</span></div>
      <div class="adv-ind"><span class="ind-k">风险等级</span><span class="ind-v" style="color:var(--warn)">高</span><span class="ind-d">游资主导 + 筹码分散</span></div>
      <div class="adv-ind"><span class="ind-k">当前定位</span><span class="ind-v">反弹中</span><span class="ind-d">超跌反弹，尚未反转</span></div>
    </div>
  </div>

  <!-- 2. 关键价位 -->
  <div class="adv-levels">
    <div class="adv-col adv-stop">
      <div class="adv-col-head" style="color:var(--down)">止损位 <em>多重止损取最严</em></div>
      <div class="adv-level"><span class="lv-k">技术止损</span><span class="lv-v">16.39</span><span class="lv-d">MA20 破位离场</span></div>
      <div class="adv-level"><span class="lv-k">固定比例</span><span class="lv-v">18.67 / 17.69</span><span class="lv-d">短线 -5% · 中线 -10%</span></div>
      <div class="adv-level"><span class="lv-k">资金管理</span><span class="lv-v">≤ 2%</span><span class="lv-d">单笔亏损绝对底线</span></div>
    </div>
    <div class="adv-col adv-target">
      <div class="adv-col-head" style="color:var(--up)">目标位 <em>技术位测算</em></div>
      <div class="adv-level"><span class="lv-k">第一压力</span><span class="lv-v">22.68</span><span class="lv-d">MA60 · +15.4%</span></div>
      <div class="adv-level"><span class="lv-k">黄金分割</span><span class="lv-v">23.48</span><span class="lv-d">0.382 · +19.5%</span></div>
      <div class="adv-level"><span class="lv-k">强压力</span><span class="lv-v">39.71</span><span class="lv-d">前高 · +102%</span></div>
    </div>
  </div>

  <!-- 3. 操作策略 -->
  <div class="adv-strat-head">操作策略 <em>条件 → 操作 → 止损</em></div>
  <div class="adv-strategies">
    <div class="adv-strat">
      <div class="strat-title"><span class="strat-no">①</span>回踩观察 · 谨慎型</div>
      <div class="strat-line"><span class="strat-tag tag-cond">条件</span><span class="strat-txt">回踩 MA20 <b>16.39</b> 附近缩量止跌，分时不再创新低</span></div>
      <div class="strat-line"><span class="strat-tag tag-act">操作</span><span class="strat-txt">小仓位 <b>5%</b> 试探建仓</span></div>
      <div class="strat-line"><span class="strat-tag tag-stop">止损</span><span class="strat-txt">跌破 <b>15.50</b>（近 60 日低上方）离场</span></div>
    </div>
    <div class="adv-strat">
      <div class="strat-title"><span class="strat-no">②</span>突破确认 · 趋势型</div>
      <div class="strat-line"><span class="strat-tag tag-cond">条件</span><span class="strat-txt">放量站上 MA60 <b>22.68</b>，且光纤价格维持高位</span></div>
      <div class="strat-line"><span class="strat-tag tag-act">操作</span><span class="strat-txt">加仓至 <b>10%</b> 趋势跟进</span></div>
      <div class="strat-line"><span class="strat-tag tag-stop">止损</span><span class="strat-txt">止损上移至 MA20 <b>16.39</b></span></div>
    </div>
    <div class="adv-strat adv-avoid">
      <div class="strat-title"><span class="strat-no" style="background:var(--down)">③</span>回避情形 · 强制</div>
      <div class="strat-line"><span class="strat-tag tag-cond">触发</span><span class="strat-txt">跌破 MA20 破位 / 游资兑现放量长阴 / 光纤价格回落</span></div>
      <div class="strat-line"><span class="strat-tag tag-act">操作</span><span class="strat-txt">清仓回避，不参与反弹</span></div>
      <div class="strat-line"><span class="strat-tag tag-stop">纪律</span><span class="strat-txt">不因「回本心理」加仓摊薄</span></div>
    </div>
  </div>

  <!-- 4. 风险提示 -->
  <div class="adv-risk">
    <div class="adv-risk-head">核心风险提示</div>
    <div class="risk-grid">
      <div class="risk-item"><b>游资主导</b><span>8/12 一线游资扫货后随时兑现，高位波动剧烈，勿追高</span></div>
      <div class="risk-item"><b>筹码分散</b><span>股东户数环比 +59.35%，散户大量涌入，套牢与获利盘交织</span></div>
      <div class="risk-item"><b>1.6T 预期差</b><span>仅 400G 光模块通过认证，1.6T 进展未披露，勿以龙头估值对标</span></div>
      <div class="risk-item"><b>周期属性</b><span>光纤强周期，价格回落时利润弹性反转为下行压力</span></div>
    </div>
  </div>
</div>
'''

# 删除旧章节
start_marker = '<div class="section">\n  <div class="section-head"><span class="no">07</span><h2>最终诊断操作建议</h2>'
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

css = '''
/* ===== 操作建议 v3 宽松布局 ===== */
.adv-hero{{display:flex;gap:28px;align-items:center;background:var(--sur);border:1px solid var(--line);border-radius:12px;padding:24px 28px;margin-bottom:16px}}
.adv-score{{flex-shrink:0;text-align:center}}
.adv-ring{{width:120px;height:120px;border-radius:50%;background:conic-gradient(var(--acc) 51.5%,var(--sur2) 0);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;margin:0 auto}}
.adv-ring::before{{content:"";position:absolute;width:96px;height:96px;border-radius:50%;background:var(--sur)}}
.adv-num{{position:relative;font-size:30px;font-weight:700;font-family:"Cascadia Code",monospace}}
.adv-den{{position:relative;font-size:11px;color:var(--muted)}}
.adv-label{{font-size:13px;color:var(--muted);margin-top:10px}}
.adv-indicators{{flex:1;display:flex;flex-direction:column}}
.adv-ind{{display:flex;align-items:baseline;gap:14px;padding:13px 0;border-bottom:1px solid var(--line)}}
.adv-ind:last-child{{border-bottom:none}}
.ind-k{{width:64px;flex-shrink:0;font-size:12px;color:var(--muted)}}
.ind-v{{width:64px;flex-shrink:0;font-size:17px;font-weight:700;font-family:"Cascadia Code",monospace}}
.ind-d{{flex:1;font-size:13px;color:var(--muted)}}
.adv-levels{{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}}
.adv-col{{background:var(--sur);border:1px solid var(--line);border-radius:10px;padding:16px 20px}}
.adv-stop{{border-top:2px solid var(--down)}}
.adv-target{{border-top:2px solid var(--up)}}
.adv-col-head{{font-size:14px;font-weight:600;margin-bottom:8px}}
.adv-col-head em{{font-style:normal;font-size:11px;color:var(--muted);font-weight:400;margin-left:6px}}
.adv-level{{display:flex;align-items:baseline;gap:12px;padding:11px 0;border-bottom:1px dashed var(--line)}}
.adv-level:last-child{{border-bottom:none}}
.lv-k{{width:70px;flex-shrink:0;font-size:12px;color:var(--muted)}}
.lv-v{{width:88px;flex-shrink:0;font-size:16px;font-weight:700;font-family:"Cascadia Code",monospace}}
.lv-d{{flex:1;font-size:12px;color:var(--muted);text-align:right}}
.adv-strat-head{{font-size:15px;color:var(--acc);margin:6px 0 12px}}
.adv-strat-head em{{font-style:normal;font-size:12px;color:var(--muted);font-weight:400}}
.adv-strategies{{display:flex;flex-direction:column;gap:10px;margin-bottom:16px}}
.adv-strat{{background:var(--sur);border:1px solid var(--line);border-left:2px solid var(--acc);border-radius:8px;padding:14px 18px}}
.adv-avoid{{border-left-color:var(--down)}}
.strat-title{{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;margin-bottom:8px}}
.strat-no{{background:var(--acc);color:#fff;width:20px;height:20px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}}
.strat-line{{display:flex;gap:12px;padding:7px 0;align-items:flex-start}}
.strat-tag{{width:46px;flex-shrink:0;font-size:11px;font-weight:600;padding:2px 0;text-align:center;border-radius:3px;margin-top:1px}}
.tag-cond{{color:var(--acc);background:rgba(79,140,255,.1);border:1px solid rgba(79,140,255,.3)}}
.tag-act{{color:var(--up);background:rgba(255,77,94,.1);border:1px solid rgba(255,77,94,.3)}}
.tag-stop{{color:var(--warn);background:rgba(255,180,84,.1);border:1px solid rgba(255,180,84,.3)}}
.strat-txt{{flex:1;font-size:13px;color:var(--txt);line-height:1.65}}
.strat-txt b{{color:var(--up);font-family:"Cascadia Code",monospace}}
.adv-risk{{background:rgba(255,77,94,.04);border:1px solid rgba(255,77,94,.25);border-radius:10px;padding:16px 20px}}
.adv-risk-head{{font-size:14px;font-weight:600;color:var(--up);margin-bottom:10px}}
.risk-grid{{display:grid;grid-template-columns:1fr 1fr;gap:12px 20px}}
.risk-item{{display:flex;gap:8px;font-size:12px;color:var(--muted);line-height:1.65}}
.risk-item b{{color:var(--up);flex-shrink:0}}
@media(max-width:760px){{
  .adv-hero{{flex-direction:column}}
  .adv-levels,.risk-grid{{grid-template-columns:1fr}}
  .adv-ind,.adv-level{{flex-wrap:wrap}}
}}
'''

html = html.replace("</style>", css + "</style>")
open(path, "w", encoding="utf-8").write(html)

t = open(path, encoding="utf-8").read()
o = len(re.findall(r'<div[^>]*>', t))
c = len(re.findall(r'</div>', t))
print(f"div: 开{o} 闭{c} {'平衡' if o==c else '不平衡!'}")
_strat_cards = len(re.findall(r'class="adv-strat"', t))
_risk_items = len(re.findall(r'class="risk-item"', t))
print(f"策略卡: {_strat_cards}")
print(f"风险项: {_risk_items}")
