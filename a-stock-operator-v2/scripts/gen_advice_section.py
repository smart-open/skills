# -*- coding: utf-8 -*-
import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
"""通鼎互联个股诊断：在关键价位后插入「最终诊断操作建议」章节"""
import re

path = os.path.join(BASE, "output/通鼎互联_个股诊断_20260814.html")
html = open(path, encoding="utf-8").read()

# 关键数据
price = 19.65
score = 5.15
ma10, ma20, ma60 = 17.02, 16.39, 22.68
low60, high250 = 13.44, 39.71
stop_short = round(price * 0.95, 2)   # 18.67
stop_mid = round(price * 0.90, 2)     # 17.69
golden = round(low60 + (high250 - low60) * 0.382, 2)  # 23.48

# 止损方案
stop_rows = f'''
    <tr><td class="s-label">技术止损</td><td class="mono">16.39（MA20）</td><td>跌破关键支撑位离场，通用首选</td></tr>
    <tr><td class="s-label">固定比例</td><td class="mono">短线 18.67 / 中线 17.69</td><td>现价 -5% / -10%</td></tr>
    <tr><td class="s-label">资金管理</td><td class="mono">单笔 ≤ 2% 总资金</td><td>绝对底线，无条件离场</td></tr>'''

# 目标价测算
target_rows = f'''
    <tr><td class="s-label">第一压力</td><td class="mono">22.68（MA60）</td><td class="advice-up">+15.4%</td><td>短期反弹目标，需放量突破</td></tr>
    <tr><td class="s-label">黄金分割</td><td class="mono">23.48（0.382）</td><td class="advice-up">+19.5%</td><td>反弹中继压力位</td></tr>
    <tr><td class="s-label">强压力</td><td class="mono">39.71（前高）</td><td class="advice-up">+102%</td><td>需光纤涨价持续 + 业绩兑现</td></tr>'''

# 操作策略（条件→操作→止损）
strategy = '''
    <div class="strategy-card s1">
      <div class="strategy-head"><span class="s-no">①</span><span class="s-name">回踩观察（谨慎型）</span></div>
      <div class="s-flow">
        <span class="s-cond">条件：回踩 MA20 <b>16.39</b> 附近缩量止跌、分时不再创新低</span>
        <span class="s-arrow">→</span>
        <span class="s-act">操作：小仓位 <b>5%</b> 试探</span>
        <span class="s-arrow">→</span>
        <span class="s-stop">止损：跌破 <b>15.50</b>（近60日低上方）</span>
      </div>
    </div>
    <div class="strategy-card s2">
      <div class="strategy-head"><span class="s-no">②</span><span class="s-name">突破确认（趋势型）</span></div>
      <div class="s-flow">
        <span class="s-cond">条件：放量站上 MA60 <b>22.68</b> 且光纤价格维持高位</span>
        <span class="s-arrow">→</span>
        <span class="s-act">操作：加仓至 <b>10%</b></span>
        <span class="s-arrow">→</span>
        <span class="s-stop">止损：上移至 MA20 <b>16.39</b></span>
      </div>
    </div>
    <div class="strategy-card s3">
      <div class="strategy-head"><span class="s-no">③</span><span class="s-name">回避情形（强制）</span></div>
      <div class="s-flow">
        <span class="s-cond">触发任一：跌破 MA20 破位 / 游资兑现放量长阴 / 光纤价格回落</span>
        <span class="s-arrow">→</span>
        <span class="s-act">操作：清仓回避、不参与反弹</span>
        <span class="s-arrow">→</span>
        <span class="s-stop">纪律：不因「回本心理」加仓摊薄</span>
      </div>
    </div>'''

section = f'''
<div class="section">
  <div class="section-head"><span class="no">07</span><h2>最终诊断操作建议</h2><span class="line"></span></div>

  <div class="advice-overview">
    <div class="advice-card">
      <div class="advice-title">综合评级</div>
      <div class="advice-big">{score}<span>/10</span></div>
      <div class="advice-tag">中性 · 观望</div>
    </div>
    <div class="advice-card">
      <div class="advice-title">仓位参考</div>
      <div class="advice-big">5-10%</div>
      <div class="advice-tag">小仓位观察 · 不加仓</div>
    </div>
    <div class="advice-card">
      <div class="advice-title">风险等级</div>
      <div class="advice-big warn">高</div>
      <div class="advice-tag">游资主导 + 筹码分散</div>
    </div>
    <div class="advice-card">
      <div class="advice-title">当前定位</div>
      <div class="advice-big">反弹中</div>
      <div class="advice-tag">超跌反弹 · 未反转</div>
    </div>
  </div>

  <h4 class="advice-sub">止损方案（多重止损，取最严格者）</h4>
  <table class="advice-table">
    <tr><th>止损方法</th><th>止损价</th><th>依据</th></tr>{stop_rows}
  </table>

  <h4 class="advice-sub">目标价测算</h4>
  <table class="advice-table">
    <tr><th>目标层级</th><th>价位</th><th>空间</th><th>触发条件</th></tr>{target_rows}
  </table>

  <h4 class="advice-sub">操作策略（条件 → 操作 → 止损）</h4>
  {strategy}

  <div class="warn-box" style="margin-top:16px">
    <b>⚠️ 核心风险提示</b>
    <ul>
      <li><b>游资主导</b>：8/12 一线游资扫货后随时可能兑现，高位波动剧烈，勿追高</li>
      <li><b>筹码分散</b>：股东户数环比 +59.35%，散户大量涌入，套牢盘与获利盘交织</li>
      <li><b>1.6T 预期差</b>：仅 400G 光模块通过认证，1.6T 进展未披露，勿以龙头估值对标</li>
      <li><b>周期属性</b>：光纤强周期，价格回落时利润弹性反转为下行压力</li>
    </ul>
  </div>
</div>
'''

# 在 <footer> 前插入
html = html.replace("<footer>", section + "\n<footer>")

# 追加 CSS
css = '''
/* 操作建议 */
.advice-overview{{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px}}
.advice-card{{background:var(--sur);border:1px solid var(--line);border-radius:10px;padding:18px 14px;text-align:center;position:relative;overflow:hidden}}
.advice-card::before{{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--acc),var(--acc2));opacity:.7}}
.advice-title{{font-size:12px;color:var(--muted);letter-spacing:1px;margin-bottom:6px}}
.advice-big{{font-size:30px;font-weight:700;font-family:"Cascadia Code",monospace;letter-spacing:-.5px}}
.advice-big span{{font-size:14px;color:var(--muted)}}
.advice-big.warn{{color:var(--warn)}}
.advice-tag{{font-size:11px;color:var(--acc2);margin-top:6px}}
.advice-sub{{font-size:15px;margin:20px 0 10px;color:var(--acc)}}
.advice-table{{width:100%;border-collapse:collapse;font-size:13px}}
.advice-table th{{text-align:left;font-size:11px;font-weight:500;color:var(--muted);padding:8px 10px;border-bottom:1px solid var(--glow)}}
.advice-table td{{padding:8px 10px;border-bottom:1px solid var(--line)}}
.advice-table .s-label{{font-weight:600;width:110px}}
.advice-table .mono{{font-family:"Cascadia Code",monospace}}
.advice-up{{color:var(--up);font-family:"Cascadia Code",monospace}}
.strategy-card{{background:var(--sur);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin-bottom:10px}}
.strategy-head{{display:flex;align-items:center;gap:10px;margin-bottom:8px}}
.s-no{{background:var(--acc);color:#fff;width:20px;height:20px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}}
.s-name{{font-size:14px;font-weight:600}}
.s-flow{{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;color:var(--muted)}}
.s-cond{{flex:1;min-width:200px}}
.s-cond b,.s-act b,.s-stop b{{color:var(--up);font-family:"Cascadia Code",monospace}}
.s-arrow{{color:var(--acc2)}}
.s-act{{color:var(--txt)}}
.s-stop{{color:var(--warn)}}
.s3{{border-color:rgba(255,77,94,.3)}}
@media(max-width:760px){{
  .advice-overview{{grid-template-columns:repeat(2,1fr)}}
  .s-flow{{flex-direction:column;align-items:flex-start}}
  .s-arrow{{transform:rotate(90deg)}}
}}
'''
html = html.replace("</style>", css + "</style>")

open(path, "w", encoding="utf-8").write(html)

# 验证
t = open(path, encoding="utf-8").read()
o = len(re.findall(r'<div[^>]*>', t))
c = len(re.findall(r'</div>', t))
print(f"div: 开{o} 闭{c} {'平衡' if o == c else '不平衡!'}")
for kw in ['最终诊断操作建议', '5.15', '仓位参考', '止损方案', '目标价测算', '操作策略', '回踩观察', '突破确认', '回避情形', 'MA20', '16.39', '22.68']:
    print(f'  含[{kw}]:', kw in t)
