# -*- coding: utf-8 -*-
import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
"""最终诊断操作建议 v4：更明显的卡片化、间距与层次感
+ 避坑提示独立成章放在操作建议后面"""
import re

path = os.path.join(BASE, "output/通鼎互联_个股诊断_20260814.html")
html = open(path, encoding="utf-8").read()

section = '''
<div class="section">
  <div class="section-head"><span class="no">07</span><h2>最终诊断操作建议</h2><span class="line"></span></div>

  <!-- 1. 综合评级（顶部大卡） -->
  <div class="ops-overview">
    <div class="ops-score-block">
      <div class="ops-ring"><span class="ops-num">5.15</span><span class="ops-den">/ 10</span></div>
      <div class="ops-score-label">综合评级 · <b style="color:var(--warn)">中性观望</b></div>
    </div>
    <div class="ops-ind-grid">
      <div class="ops-ind">
        <span class="ops-k">仓位参考</span>
        <span class="ops-v">5-10%</span>
        <span class="ops-d">小仓位观察，不加仓</span>
      </div>
      <div class="ops-ind">
        <span class="ops-k">风险等级</span>
        <span class="ops-v" style="color:var(--warn)">高</span>
        <span class="ops-d">游资主导 + 筹码分散</span>
      </div>
      <div class="ops-ind">
        <span class="ops-k">当前定位</span>
        <span class="ops-v">反弹中</span>
        <span class="ops-d">超跌反弹，尚未反转</span>
      </div>
    </div>
  </div>

  <!-- 2. 关键价位 -->
  <div class="ops-levels">
    <div class="ops-col ops-stop">
      <div class="ops-col-head">
        <span class="ops-col-name" style="color:var(--down)">止损位</span>
        <span class="ops-col-note">多重止损取最严</span>
      </div>
      <div class="ops-lv">
        <span class="ops-k">技术止损</span>
        <span class="ops-v mono">16.39</span>
        <span class="ops-d">MA20 破位离场</span>
      </div>
      <div class="ops-lv">
        <span class="ops-k">固定比例</span>
        <span class="ops-v mono">18.67 / 17.69</span>
        <span class="ops-d">短线 -5% · 中线 -10%</span>
      </div>
      <div class="ops-lv">
        <span class="ops-k">资金管理</span>
        <span class="ops-v mono">≤ 2%</span>
        <span class="ops-d">单笔亏损绝对底线</span>
      </div>
    </div>
    <div class="ops-col ops-target">
      <div class="ops-col-head">
        <span class="ops-col-name" style="color:var(--up)">目标位</span>
        <span class="ops-col-note">技术位测算</span>
      </div>
      <div class="ops-lv">
        <span class="ops-k">第一压力</span>
        <span class="ops-v mono">22.68</span>
        <span class="ops-d up">MA60 · +15.4%</span>
      </div>
      <div class="ops-lv">
        <span class="ops-k">黄金分割</span>
        <span class="ops-v mono">23.48</span>
        <span class="ops-d up">0.382 · +19.5%</span>
      </div>
      <div class="ops-lv">
        <span class="ops-k">强压力</span>
        <span class="ops-v mono">39.71</span>
        <span class="ops-d up">前高 · +102%</span>
      </div>
    </div>
  </div>

  <!-- 3. 操作策略 -->
  <div class="ops-strat-section">
    <div class="ops-section-head">操作策略 <em>条件 → 操作 → 止损</em></div>
    <div class="ops-strat">
      <div class="ops-strat-head"><span class="strat-no">①</span><span class="strat-name">回踩观察 · 谨慎型</span></div>
      <div class="ops-line"><span class="ops-tag tag-cond">条件</span><span class="ops-txt">回踩 MA20 <b>16.39</b> 附近缩量止跌，分时不再创新低</span></div>
      <div class="ops-line"><span class="ops-tag tag-act">操作</span><span class="ops-txt">小仓位 <b>5%</b> 试探建仓</span></div>
      <div class="ops-line"><span class="ops-tag tag-stop">止损</span><span class="ops-txt">跌破 <b>15.50</b>（近 60 日低上方）离场</span></div>
    </div>
    <div class="ops-strat">
      <div class="ops-strat-head"><span class="strat-no">②</span><span class="strat-name">突破确认 · 趋势型</span></div>
      <div class="ops-line"><span class="ops-tag tag-cond">条件</span><span class="ops-txt">放量站上 MA60 <b>22.68</b>，且光纤价格维持高位</span></div>
      <div class="ops-line"><span class="ops-tag tag-act">操作</span><span class="ops-txt">加仓至 <b>10%</b> 趋势跟进</span></div>
      <div class="ops-line"><span class="ops-tag tag-stop">止损</span><span class="ops-txt">止损上移至 MA20 <b>16.39</b></span></div>
    </div>
    <div class="ops-strat ops-avoid">
      <div class="ops-strat-head"><span class="strat-no" style="background:var(--down)">③</span><span class="strat-name">回避情形 · 强制</span></div>
      <div class="ops-line"><span class="ops-tag tag-cond">触发</span><span class="ops-txt">跌破 MA20 破位 / 游资兑现放量长阴 / 光纤价格回落</span></div>
      <div class="ops-line"><span class="ops-tag tag-act">操作</span><span class="ops-txt">清仓回避，不参与反弹</span></div>
      <div class="ops-line"><span class="ops-tag tag-stop">纪律</span><span class="ops-txt">不因「回本心理」加仓摊薄</span></div>
    </div>
  </div>

  <!-- 4. 避坑提示（操作建议后） -->
  <div class="ops-risk">
    <div class="ops-risk-head">
      <span class="ops-risk-icon">!</span>
      <span class="ops-risk-title">避坑提示（观察评级 · 非买卖建议）</span>
    </div>
    <div class="risk-items">
      <div class="risk-it"><b>游资主导</b><span>8/12 一线游资扫货后随时兑现，高位波动剧烈，勿追高</span></div>
      <div class="risk-it"><b>筹码分散</b><span>股东户数环比 +59.35%，散户大量涌入，套牢与获利盘交织</span></div>
      <div class="risk-it"><b>1.6T 预期差</b><span>仅 400G 光模块通过认证，1.6T 进展未披露，勿以龙头估值对标</span></div>
      <div class="risk-it"><b>周期属性</b><span>光纤强周期，价格回落时利润弹性反转为下行压力</span></div>
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

# CSS（卡片化 + 大间距 + 层次感）
css = '''
/* ===== 操作建议 v4：卡片化层次 ===== */
.ops-overview{{display:flex;gap:32px;align-items:center;background:var(--sur2);border:1px solid var(--line);border-radius:14px;padding:28px 32px;margin-bottom:24px}}
.ops-score-block{{flex-shrink:0;text-align:center;padding-right:20px;border-right:1px solid var(--line)}}
.ops-ring{{width:140px;height:140px;border-radius:50%;background:conic-gradient(var(--acc) 51.5%,var(--line) 0);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;margin:0 auto 12px}}
.ops-ring::before{{content:"";position:absolute;width:110px;height:110px;border-radius:50%;background:var(--sur2)}}
.ops-num{{position:relative;font-size:34px;font-weight:700;font-family:"Cascadia Code",monospace;line-height:1}}
.ops-den{{position:relative;font-size:11px;color:var(--muted);margin-top:2px}}
.ops-score-label{{font-size:13px;color:var(--txt)}}
.ops-score-label b{{font-weight:700}}
.ops-ind-grid{{flex:1;display:flex;flex-direction:column}}
.ops-ind{{display:grid;grid-template-columns:74px 74px 1fr;gap:16px;padding:13px 0;border-bottom:1px solid var(--line);align-items:baseline}}
.ops-ind:last-child{{border-bottom:none}}
.ops-k{{font-size:12px;color:var(--muted)}}
.ops-v{{font-size:16px;font-weight:700;font-family:"Cascadia Code",monospace}}
.ops-d{{font-size:12px;color:var(--muted);line-height:1.5}}
.ops-levels{{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}}
.ops-col{{background:var(--sur);border:1px solid var(--line);border-radius:12px;padding:22px 24px}}
.ops-stop{{border-top:3px solid var(--down)}}
.ops-target{{border-top:3px solid var(--up)}}
.ops-col-head{{display:flex;align-items:baseline;gap:10px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--line)}}
.ops-col-name{{font-size:16px;font-weight:700}}
.ops-col-note{{font-size:11px;color:var(--muted)}}
.ops-lv{{display:grid;grid-template-columns:78px 1fr auto;gap:16px;padding:13px 0;border-bottom:1px dashed var(--line);align-items:baseline}}
.ops-lv:last-child{{border-bottom:none}}
.ops-lv .ops-k{{font-size:12px;color:var(--muted)}}
.ops-lv .ops-v{{font-size:16px;font-weight:700;justify-self:start}}
.ops-lv .ops-d{{font-size:12px;color:var(--muted);justify-self:end;text-align:right}}
.ops-lv .ops-d.up{{color:var(--up);font-weight:600}}
.ops-strat-section{{margin-bottom:24px}}
.ops-section-head{{font-size:15px;color:var(--acc);font-weight:600;margin-bottom:12px}}
.ops-section-head em{{font-style:normal;font-size:12px;color:var(--muted);font-weight:400;margin-left:8px}}
.ops-strat{{background:var(--sur);border:1px solid var(--line);border-left:3px solid var(--acc);border-radius:10px;padding:18px 22px;margin-bottom:14px}}
.ops-avoid{{border-left-color:var(--down)}}
.ops-strat-head{{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--line)}}
.strat-no{{background:var(--acc);color:#fff;width:22px;height:22px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}}
.strat-name{{font-size:14px;font-weight:600}}
.ops-line{{display:grid;grid-template-columns:54px 1fr;gap:14px;padding:9px 0;align-items:baseline}}
.ops-tag{{font-size:11px;font-weight:600;padding:3px 0;text-align:center;border-radius:3px;margin-top:1px}}
.tag-cond{{color:var(--acc);background:rgba(79,140,255,.1);border:1px solid rgba(79,140,255,.3)}}
.tag-act{{color:var(--up);background:rgba(255,77,94,.1);border:1px solid rgba(255,77,94,.3)}}
.tag-stop{{color:var(--warn);background:rgba(255,180,84,.1);border:1px solid rgba(255,180,84,.3)}}
.ops-txt{{font-size:13px;color:var(--txt);line-height:1.65}}
.ops-txt b{{color:var(--up);font-family:"Cascadia Code",monospace;font-weight:700}}
.ops-risk{{background:rgba(255,77,94,.05);border:1px solid rgba(255,77,94,.35);border-radius:12px;padding:20px 24px;margin-top:8px}}
.ops-risk-head{{display:flex;align-items:center;gap:12px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(255,77,94,.2)}}
.ops-risk-icon{{width:24px;height:24px;border-radius:50%;background:var(--up);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0}}
.ops-risk-title{{font-size:15px;font-weight:700;color:var(--up);letter-spacing:.3px}}
.risk-items{{display:flex;flex-direction:column;gap:8px}}
.risk-it{{display:flex;gap:12px;padding:8px 12px;background:rgba(255,77,94,.04);border-radius:6px;font-size:12px;color:var(--txt);line-height:1.6}}
.risk-it b{{color:var(--up);flex-shrink:0;min-width:90px}}
.risk-it span{{flex:1}}
@media(max-width:760px){{
  .ops-overview{{flex-direction:column}}
  .ops-score-block{{padding-right:0;border-right:none;border-bottom:1px solid var(--line);padding-bottom:20px}}
  .ops-levels{{grid-template-columns:1fr}}
  .ops-ind{{grid-template-columns:64px 64px 1fr}}
}}
'''
html = html.replace("</style>", css + "</style>")
open(path, "w", encoding="utf-8").write(html)

t = open(path, encoding="utf-8").read()
o = len(re.findall(r'<div[^>]*>', t))
c = len(re.findall(r'</div>', t))
print(f"div: 开{o} 闭{c} {'平衡' if o==c else '不平衡!'}")
for kw in ['ops-overview','ops-levels','ops-strat-section','ops-risk','避坑提示','观察评级','非买卖建议','风险提示']:
    print(f'  含[{kw}]:', kw in t)