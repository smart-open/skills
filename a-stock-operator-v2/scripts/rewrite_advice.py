# -*- coding: utf-8 -*-
import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
"""重写「最终诊断操作建议」章节 —— 清晰分层布局"""
import re

path = os.path.join(BASE, "output/通鼎互联_个股诊断_20260814.html")
html = open(path, encoding="utf-8").read()

# ===== 新章节 HTML =====
section = '''
<div class="section">
  <div class="section-head"><span class="no">07</span><h2>最终诊断操作建议</h2><span class="line"></span></div>

  <!-- 1. 评级概览 -->
  <div class="advice-hero">
    <div class="ah-score">
      <div class="ah-ring"><span class="ah-num">5.15</span><span class="ah-den">/ 10</span></div>
      <div class="ah-label">综合评级 · <b style="color:var(--warn)">中性观望</b></div>
    </div>
    <div class="ah-meta">
      <div class="am-row"><span class="am-k">仓位参考</span><b class="am-v">5-10%</b><em class="am-d">小仓位观察 · 不加仓</em></div>
      <div class="am-row"><span class="am-k">风险等级</span><b class="am-v" style="color:var(--warn)">高</b><em class="am-d">游资主导 + 筹码分散</em></div>
      <div class="am-row"><span class="am-k">当前定位</span><b class="am-v">反弹中</b><em class="am-d">超跌反弹 · 未反转</em></div>
    </div>
  </div>

  <!-- 2. 关键价位双栏 -->
  <div class="advice-levels">
    <div class="al-col al-stop">
      <h4 class="al-title" style="color:var(--down)">止损位（多重止损取最严）</h4>
      <div class="al-row"><span class="al-k">技术止损</span><b class="al-v mono">16.39</b><em class="al-d">MA20 破位离场</em></div>
      <div class="al-row"><span class="al-k">固定比例</span><b class="al-v mono">18.67 / 17.69</b><em class="al-d">短线 -5% · 中线 -10%</em></div>
      <div class="al-row"><span class="al-k">资金管理</span><b class="al-v mono">≤ 2%</b><em class="al-d">单笔亏损绝对底线</em></div>
    </div>
    <div class="al-col al-target">
      <h4 class="al-title" style="color:var(--up)">目标位（技术位测算）</h4>
      <div class="al-row"><span class="al-k">第一压力</span><b class="al-v mono">22.68</b><em class="al-d up">MA60 · +15.4%</em></div>
      <div class="al-row"><span class="al-k">黄金分割</span><b class="al-v mono">23.48</b><em class="al-d up">0.382 · +19.5%</em></div>
      <div class="al-row"><span class="al-k">强压力</span><b class="al-v mono">39.71</b><em class="al-d up">前高 · +102%</em></div>
    </div>
  </div>

  <!-- 3. 操作策略 -->
  <h4 class="advice-sub">操作策略（条件 → 操作 → 止损）</h4>
  <div class="advice-strategies">
    <div class="ast">
      <div class="ast-head"><span class="ast-no">①</span><span class="ast-name">回踩观察 · 谨慎型</span></div>
      <div class="ast-line"><span class="ast-tag tag-cond">条件</span><span class="ast-txt">回踩 MA20 <b>16.39</b> 附近缩量止跌、分时不再创新低</span></div>
      <div class="ast-line"><span class="ast-tag tag-act">操作</span><span class="ast-txt">小仓位 <b>5%</b> 试探建仓</span></div>
      <div class="ast-line"><span class="ast-tag tag-stop">止损</span><span class="ast-txt">跌破 <b>15.50</b>（近 60 日低上方）离场</span></div>
    </div>
    <div class="ast">
      <div class="ast-head"><span class="ast-no">②</span><span class="ast-name">突破确认 · 趋势型</span></div>
      <div class="ast-line"><span class="ast-tag tag-cond">条件</span><span class="ast-txt">放量站上 MA60 <b>22.68</b> 且光纤价格维持高位</span></div>
      <div class="ast-line"><span class="ast-tag tag-act">操作</span><span class="ast-txt">加仓至 <b>10%</b> 趋势跟进</span></div>
      <div class="ast-line"><span class="ast-tag tag-stop">止损</span><span class="ast-txt">止损上移至 MA20 <b>16.39</b></span></div>
    </div>
    <div class="ast ast-avoid">
      <div class="ast-head"><span class="ast-no" style="background:var(--down)">③</span><span class="ast-name">回避情形 · 强制</span></div>
      <div class="ast-line"><span class="ast-tag tag-cond">触发</span><span class="ast-txt">跌破 MA20 破位 / 游资兑现放量长阴 / 光纤价格回落</span></div>
      <div class="ast-line"><span class="ast-tag tag-act">操作</span><span class="ast-txt">清仓回避、不参与反弹</span></div>
      <div class="ast-line"><span class="ast-tag tag-stop">纪律</span><span class="ast-txt">不因「回本心理」加仓摊薄</span></div>
    </div>
  </div>

  <!-- 4. 风险提示 -->
  <div class="advice-risk">
    <h4 class="advice-sub" style="margin-top:0">核心风险提示</h4>
    <div class="risk-grid">
      <div class="risk-item"><b>游资主导</b><span>8/12 一线游资扫货后随时兑现，高位波动剧烈，勿追高</span></div>
      <div class="risk-item"><b>筹码分散</b><span>股东户数环比 +59.35%，散户大量涌入，套牢与获利盘交织</span></div>
      <div class="risk-item"><b>1.6T 预期差</b><span>仅 400G 光模块通过认证，1.6T 进展未披露，勿以龙头估值对标</span></div>
      <div class="risk-item"><b>周期属性</b><span>光纤强周期，价格回落时利润弹性反转为下行压力</span></div>
    </div>
  </div>
</div>
'''

# ===== 删除旧章节（div 平衡定位） =====
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

# ===== 追加新 CSS =====
css = '''
/* ===== 操作建议重排版 ===== */
.advice-hero{{display:grid;grid-template-columns:220px 1fr;gap:24px;align-items:center;background:var(--sur);border:1px solid var(--line);border-radius:12px;padding:24px;margin-bottom:18px}}
.ah-ring{{width:130px;height:130px;border-radius:50%;background:conic-gradient(var(--acc) 51.5%, var(--sur2) 0);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;margin:0 auto}}
.ah-ring::before{{content:"";position:absolute;width:104px;height:104px;border-radius:50%;background:var(--sur)}}
.ah-num{{position:relative;font-size:34px;font-weight:700;font-family:"Cascadia Code",monospace}}
.ah-den{{position:relative;font-size:12px;color:var(--muted)}}
.ah-label{{text-align:center;font-size:13px;color:var(--muted);margin-top:12px}}
.ah-meta{{display:flex;flex-direction:column;gap:0}}
.am-row{{display:grid;grid-template-columns:90px 90px 1fr;gap:14px;align-items:baseline;padding:12px 0;border-bottom:1px solid var(--line)}}
.am-row:last-child{{border-bottom:none}}
.am-k{{font-size:12px;color:var(--muted)}}
.am-v{{font-size:16px;font-weight:700;font-family:"Cascadia Code",monospace}}
.am-d{{font-size:12px;color:var(--muted)}}
.advice-levels{{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}}
.al-col{{background:var(--sur);border:1px solid var(--line);border-radius:10px;padding:16px 18px}}
.al-stop{{border-top:2px solid var(--down)}}
.al-target{{border-top:2px solid var(--up)}}
.al-title{{font-size:14px;margin-bottom:12px}}
.al-row{{display:grid;grid-template-columns:80px 1fr auto;gap:12px;align-items:baseline;padding:9px 0;border-bottom:1px dashed var(--line)}}
.al-row:last-child{{border-bottom:none}}
.al-k{{font-size:12px;color:var(--muted)}}
.al-v{{font-size:16px;font-weight:700}}
.al-d{{font-size:11px;color:var(--muted)}}
.al-d.up{{color:var(--up)}}
.advice-sub{{font-size:15px;margin:6px 0 12px;color:var(--acc)}}
.advice-strategies{{display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:18px}}
.ast{{background:var(--sur);border:1px solid var(--line);border-left:2px solid var(--acc);border-radius:8px;padding:14px 16px}}
.ast-avoid{{border-left-color:var(--down)}}
.ast-head{{display:flex;align-items:center;gap:10px;margin-bottom:10px}}
.ast-no{{background:var(--acc);color:#fff;width:20px;height:20px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0}}
.ast-name{{font-size:14px;font-weight:600}}
.ast-line{{display:grid;grid-template-columns:52px 1fr;gap:10px;padding:6px 0;align-items:baseline}}
.ast-tag{{font-size:11px;font-weight:600;padding:1px 0;text-align:center;border-radius:3px}}
.tag-cond{{color:var(--acc);background:rgba(79,140,255,.1);border:1px solid rgba(79,140,255,.3)}}
.tag-act{{color:var(--up);background:rgba(255,77,94,.1);border:1px solid rgba(255,77,94,.3)}}
.tag-stop{{color:var(--warn);background:rgba(255,180,84,.1);border:1px solid rgba(255,180,84,.3)}}
.ast-txt{{font-size:13px;color:var(--txt)}}
.ast-txt b{{color:var(--up);font-family:"Cascadia Code",monospace}}
.advice-risk{{background:rgba(255,77,94,.04);border:1px solid rgba(255,77,94,.25);border-radius:10px;padding:16px 18px}}
.risk-grid{{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px}}
.risk-item{{font-size:12px;color:var(--muted);line-height:1.6}}
.risk-item b{{color:var(--up);margin-right:6px}}
@media(max-width:760px){{
  .advice-hero{{grid-template-columns:1fr}}
  .advice-levels,.risk-grid{{grid-template-columns:1fr}}
  .am-row{{grid-template-columns:80px 80px 1fr}}
}}
'''
html = html.replace("</style>", css + "</style>")
open(path, "w", encoding="utf-8").write(html)

# 验证
t = open(path, encoding="utf-8").read()
o = len(re.findall(r'<div[^>]*>', t))
c = len(re.findall(r'</div>', t))
print(f"div: 开{o} 闭{c} {'平衡' if o==c else '不平衡!'}")
for kw in ['advice-hero', 'advice-levels', 'advice-strategies', '回踩观察', '突破确认', '回避情形', '止损位', '目标位', 'risk-grid']:
    print(f'  含[{kw}]:', kw in t)
