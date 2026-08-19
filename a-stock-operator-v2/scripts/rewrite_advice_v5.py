# -*- coding: utf-8 -*-
"""个股诊断「最终诊断操作建议」v5：frontend-design 级重设计（数据驱动 + 参数化）。

基础报告 generate_stock_report.py 已产出单花括号的正确 CSS，故本脚本不再做全局
{{ }}->{} 替换（那会破坏合法的嵌套收尾 }}}）。本脚本职责：
  ① 清理旧 advice CSS（哨兵幂等）；② 从 data JSON 的 advice 段构建 07 章节；
  ③ 注入新 CSS（单花括号 + 哨兵）。

用法：
  python rewrite_advice_v5.py \
      --path output/通鼎互联_个股诊断_20260814.html \
      --data data/tdhl_analysis.json --cost 18.50

参数：
  --path   基础报告 HTML 路径（必填或取默认）
  --data   个股分析 JSON（须含 advice 段），默认 data/tdhl_analysis.json
  --cost   持仓成本价（可选）。若有，仅在 07「最终诊断操作建议」章节的「综合评级」卡
          追加持仓成本/盈亏指标（成本主要应用于操作建议，不进入基础报告 01–06 章）
"""
import re
import json
import argparse
import os
from datetime import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORT_ROOT = os.environ.get("A_STOCK_OUT") or os.path.dirname(BASE)
ap = argparse.ArgumentParser(description="个股诊断 07 操作建议重设计")
ap.add_argument("--path", default=None,
                help="基础报告 HTML 路径；缺省按 --data 的 name + --date 推导 {REPORT_ROOT}/{name}_个股诊断_{date}.html")
ap.add_argument("--data", default=os.path.join(BASE, "data/tdhl_analysis.json"))
ap.add_argument("--cost", type=float, default=None)
ap.add_argument("--date", default=datetime.now().strftime("%Y%m%d"),
                help="报告基准日期 YYYYMMDD，默认真实今日（用于缺省 --path 推导文件名）")
args = ap.parse_args()

D = json.load(open(args.data, encoding="utf-8"))
A = D["advice"]
path = args.path or os.path.join(REPORT_ROOT, f"{D.get('name', '个股')}_个股诊断_{args.date}.html")
html = open(path, encoding="utf-8").read()

# ---------- 持仓成本指标（可选，仅作用于操作建议章节） ----------
cost_ind = ""
if args.cost is not None:
    price_val = float(D["price_panel"]["price"])
    pnl = (price_val - args.cost) / args.cost * 100
    cls = "up" if pnl >= 0 else "down"
    sign = "+" if pnl >= 0 else ""
    cost_ind = f'''
      <div class="dv-ind">
        <span class="dv-k">持仓成本</span>
        <span class="dv-v">{args.cost:.2f}</span>
        <span class="dv-d">盈亏 <b class="{cls}">{sign}{pnl:.2f}%</b>（现价 {D['price_panel']['price']} · 操作建议视角）</span>
      </div>'''

# ---------- 3. 新章节 HTML（数据驱动） ----------
inds_html = "".join(
    f'<div class="dv-ind"><span class="dv-k">{k}</span><span class="dv-v">{v}</span><span class="dv-d">{d}</span></div>'
    for k, v, d in A["inds"]) + cost_ind

stop_html = "".join(
    f'<div class="dv-lv"><span class="dv-k">{k}</span><span class="dv-v">{v}</span><span class="dv-d">{d}</span></div>'
    for k, v, d in A["stop"])
target_html = "".join(
    f'<div class="dv-lv"><span class="dv-k">{k}</span><span class="dv-v">{v}</span><span class="dv-d">{d}</span></div>'
    for k, v, d in A["target"])

strats_html = ""
for s in A["strats"]:
    lines = "".join(
        f'<div class="dv-line"><span class="dv-tag dv-tag-{("cond" if k=="条件" else "act" if k=="操作" else "stop")}">{k}</span><span class="dv-txt">{txt}</span></div>'
        for k, txt in s["lines"])
    avoid_cls = " dv-avoid" if s.get("tag") == "强制" else ""
    strats_html += f'''
    <div class="dv-strat{avoid_cls}">
      <div class="dv-strat-head"><span class="dv-no">{s['no']}</span><span class="dv-strat-name">{s['name']}</span><span class="dv-strat-tag">{s['tag']}</span></div>
      {lines}
    </div>'''

risk_html = "".join(
    f'<div class="dv-risk-item"><b>{t}</b><span>{d}</span></div>'
    for t, d in A["risk_items"])

score = float(A["score"])
score_pct = score * 10

section = f'''
<div class="section">
  <div class="section-head"><span class="no">07</span><h2>最终诊断操作建议</h2><span class="line"></span></div>

  <!-- ① 综合评级 -->
  <div class="dv-hero">
    <div class="dv-ring-wrap">
      <div class="dv-ring" style="background:conic-gradient(var(--acc) 0 {score_pct}%,rgba(255,255,255,.06) {score_pct}% 100%)">
        <span class="dv-num">{A['score']}</span>
        <span class="dv-den">/ 10</span>
      </div>
      <div class="dv-score-label">综合评级 · <b>{A['rating']}</b></div>
    </div>
    <div class="dv-ind-grid">
      {inds_html}
    </div>
  </div>

  <!-- ② 关键价位 -->
  <div class="dv-levels">
    <div class="dv-col dv-stop">
      <div class="dv-col-head">
        <span class="dv-col-name">止损位</span>
        <span class="dv-col-note">多重止损取最严</span>
      </div>
      {stop_html}
    </div>
    <div class="dv-col dv-target">
      <div class="dv-col-head">
        <span class="dv-col-name">目标位</span>
        <span class="dv-col-note">技术位测算</span>
      </div>
      {target_html}
    </div>
  </div>

  <!-- ③ 操作策略 -->
  <div class="dv-strat-section">
    <div class="dv-section-head">操作策略 <em>条件 → 操作 → 止损</em></div>
    {strats_html}
  </div>

  <!-- ④ 避坑提示 -->
  <div class="dv-risk">
    <div class="dv-risk-head">
      <span class="dv-risk-icon">!</span>
      <span class="dv-risk-title">避坑提示（观察评级 · 非买卖建议）</span>
    </div>
    <div class="dv-risk-items">
      {risk_html}
    </div>
  </div>
</div>
'''

# ---------- 4. 替换 / 插入章节 ----------
m = re.search(r'<div class="section">\s*<div class="section-head">\s*<span class="no">0?7</span>\s*<h2>最终诊断操作建议</h2>', html)
start_idx = m.start() if m else -1
if start_idx != -1:
    depth = 0
    end_idx = -1
    for mm in re.finditer(r"<div[^>]*>|</div>", html[start_idx:]):
        depth += -1 if mm.group().startswith("</div>") else 1
        if depth == 0:
            end_idx = start_idx + mm.end()
            break
    if end_idx > 0:
        html = html[:start_idx] + section + html[end_idx:]
        print("旧章节已替换")
else:
    fpos = html.find("<footer")
    if fpos != -1:
        pre = html[:fpos].rstrip()
        html = pre + "\n\n" + section + "\n\n" + html[fpos:]
        print("07 章节已插入（footer 前，基础 6 章补建）")
    else:
        html = html.replace("</body>", section + "\n</body>", 1)
        print("07 章节已插入（body 前）")

# ---------- 5. 清理旧 advice CSS（幂等） ----------
def del_block(h, start, end):
    a = h.find(start)
    if a == -1:
        return h
    b = h.find(end, a)
    if b == -1:
        b = h.find("</style>", a)
    return h[:a] + h[b:]

html = del_block(html, "/* 操作建议 */", "/* ===== 精修层 ===== */")
html = del_block(html, "/* ===== 操作建议重排版 ===== */", "/* ===== 操作建议 v3 宽松布局 ===== */")
html = del_block(html, "/* ===== 操作建议 v3 宽松布局 ===== */", "/* ===== 操作建议 v4：卡片化层次 ===== */")
html = del_block(html, "/* ===== 操作建议 v4：卡片化层次 ===== */", "</style>")
html = re.sub(r"/\*DV-CSS-START\*/.*?/\*DV-CSS-END\*/", "", html, flags=re.DOTALL)

# ---------- 6. 注入新 CSS（单花括号 + 哨兵） ----------
css = '''
/*DV-CSS-START*/
.dv-hero{position:relative;display:flex;gap:40px;align-items:center;padding:32px 36px;margin-bottom:22px;border-radius:16px;
  background:radial-gradient(120% 180% at 0% 0%,rgba(79,140,255,.16),transparent 55%),
             radial-gradient(120% 180% at 100% 100%,rgba(34,211,238,.10),transparent 55%),
             linear-gradient(160deg,#161e30,#111827);
  border:1px solid var(--line);overflow:hidden;animation:fadeUp .6s cubic-bezier(.16,1,.3,1) both}
.dv-hero::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,var(--acc),var(--acc2))}
.dv-ring-wrap{flex-shrink:0;text-align:center}
.dv-ring{width:156px;height:156px;border-radius:50%;margin:0 auto 14px;position:relative;box-shadow:0 0 46px rgba(79,140,255,.24);
  display:flex;flex-direction:column;align-items:center;justify-content:center}
.dv-ring::before{content:"";position:absolute;inset:9px;border-radius:50%;background:radial-gradient(120% 120% at 30% 20%,#1a2440,#0e1428);box-shadow:inset 0 0 24px rgba(0,0,0,.5)}
.dv-ring::after{content:"";position:absolute;inset:-1px;border-radius:50%;border:1px solid rgba(79,140,255,.25)}
.dv-num{position:relative;z-index:1;font-size:40px;font-weight:700;font-family:"Cascadia Code",monospace;line-height:1;margin-top:-6px;
  background:linear-gradient(120deg,#fff 10%,var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}
.dv-den{position:relative;z-index:1;font-size:11px;color:var(--muted);margin-top:4px;letter-spacing:.5px}
.dv-score-label{margin-top:14px;font-size:13px;color:var(--txt)}
.dv-score-label b{color:var(--warn);font-weight:700}
.dv-ind-grid{flex:1;display:flex;flex-direction:column}
.dv-ind{display:grid;grid-template-columns:76px 86px 1fr;gap:18px;padding:15px 0;border-bottom:1px solid var(--line);align-items:baseline}
.dv-ind:last-child{border-bottom:none}
.dv-ind b.up{color:var(--up)} .dv-ind b.down{color:var(--down)}
.dv-k{font-size:12px;color:var(--muted);letter-spacing:1px}
.dv-v{font-size:18px;font-weight:700;font-family:"Cascadia Code",monospace}
.dv-d{font-size:12px;color:var(--muted);line-height:1.5}

.dv-levels{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:22px;animation:fadeUp .6s .1s cubic-bezier(.16,1,.3,1) both}
.dv-col{background:var(--sur);border:1px solid var(--line);border-radius:14px;padding:22px 26px;position:relative;overflow:hidden}
.dv-stop{border-top:3px solid var(--down)}
.dv-target{border-top:3px solid var(--up)}
.dv-col-head{display:flex;align-items:baseline;gap:10px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--line)}
.dv-col-name{font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px}
.dv-col-name::before{content:"";width:8px;height:8px;border-radius:2px;background:var(--down)}
.dv-target .dv-col-name::before{background:var(--up)}
.dv-col-note{font-size:11px;color:var(--muted)}
.dv-lv{display:grid;grid-template-columns:80px 1fr auto;gap:16px;padding:13px 0;border-bottom:1px dashed var(--line);align-items:baseline}
.dv-lv:last-child{border-bottom:none}
.dv-lv .dv-k{font-size:12px;color:var(--muted)}
.dv-lv .dv-v{font-size:18px;font-weight:700;justify-self:start}
.dv-stop .dv-lv .dv-v{color:var(--down)}
.dv-target .dv-lv .dv-v{color:var(--up)}
.dv-lv .dv-d{font-size:12px;color:var(--muted);justify-self:end;text-align:right}
.dv-lv .dv-d.up{color:var(--up);font-weight:600}

.dv-strat-section{margin-bottom:22px;animation:fadeUp .6s .18s cubic-bezier(.16,1,.3,1) both}
.dv-section-head{font-size:15px;color:var(--acc);font-weight:600;margin-bottom:14px;display:flex;align-items:baseline}
.dv-section-head em{font-style:normal;font-size:12px;color:var(--muted);font-weight:400;margin-left:10px;font-family:"Cascadia Code",monospace}
.dv-strat{background:var(--sur);border:1px solid var(--line);border-radius:12px;padding:18px 22px;margin-bottom:12px;position:relative;transition:transform .2s,border-color .2s}
.dv-strat:hover{transform:translateX(5px);border-color:var(--glow)}
.dv-strat-head{display:flex;align-items:center;gap:12px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--line)}
.dv-no{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;font-family:"Cascadia Code",monospace;flex-shrink:0;box-shadow:0 2px 10px rgba(79,140,255,.35)}
.dv-avoid .dv-no{background:linear-gradient(135deg,#ff6b7a,var(--up));box-shadow:0 2px 10px rgba(255,77,94,.35)}
.dv-strat-name{font-size:14.5px;font-weight:700;color:#eaf1ff}
.dv-strat-tag{font-size:10px;color:var(--muted);border:1px solid var(--line);border-radius:4px;padding:1px 7px;margin-left:auto;font-family:"Cascadia Code",monospace}
.dv-line{display:grid;grid-template-columns:56px 1fr;gap:14px;padding:9px 0;align-items:baseline}
.dv-tag{font-size:11px;font-weight:600;padding:3px 0;text-align:center;border-radius:4px}
.dv-tag-cond{color:var(--acc);background:rgba(79,140,255,.1);border:1px solid rgba(79,140,255,.3)}
.dv-tag-act{color:var(--up);background:rgba(255,77,94,.1);border:1px solid rgba(255,77,94,.3)}
.dv-tag-stop{color:var(--warn);background:rgba(255,180,84,.1);border:1px solid rgba(255,180,84,.3)}
.dv-txt{font-size:13px;color:var(--txt);line-height:1.65}
.dv-txt b{color:var(--up);font-family:"Cascadia Code",monospace;font-weight:700}

.dv-risk{background:linear-gradient(150deg,rgba(255,77,94,.08),rgba(255,77,94,.02) 60%),var(--sur);
  border:1px solid rgba(255,77,94,.32);border-radius:14px;padding:22px 26px;margin-top:4px;animation:fadeUp .6s .26s cubic-bezier(.16,1,.3,1) both}
.dv-risk-head{display:flex;align-items:center;gap:13px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid rgba(255,77,94,.2)}
.dv-risk-icon{width:30px;height:30px;border-radius:8px;background:var(--up);color:#fff;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;flex-shrink:0;box-shadow:0 0 18px rgba(255,77,94,.45)}
.dv-risk-title{font-size:15px;font-weight:700;color:var(--up);letter-spacing:.4px}
.dv-risk-items{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.dv-risk-item{display:flex;gap:12px;padding:11px 14px;background:rgba(255,77,94,.05);border:1px solid rgba(255,77,94,.13);border-radius:9px;font-size:12px;color:var(--txt);line-height:1.6}
.dv-risk-item b{color:var(--up);flex-shrink:0;min-width:74px}
.dv-risk-item span{flex:1}
@media(max-width:760px){
  .dv-hero{flex-direction:column;align-items:flex-start}
  .dv-ring-wrap{width:100%;text-align:center}
  .dv-levels{grid-template-columns:1fr}
  .dv-ind{grid-template-columns:70px 78px 1fr}
  .dv-risk-items{grid-template-columns:1fr}
}
@media(prefers-reduced-motion:reduce){.dv-hero,.dv-levels,.dv-strat-section,.dv-risk{animation:none}}
/*DV-CSS-END*/
'''
html = html.replace("</style>", css + "</style>")
open(path, "w", encoding="utf-8").write(html)

# ---------- 验证 ----------
t = open(path, encoding="utf-8").read()
o = len(re.findall(r"<div[^>]*>", t))
c = len(re.findall(r"</div>", t))
print(f"div: 开{o} 闭{c} {'平衡' if o==c else '不平衡!'}")
st = t[t.find("<style>"):t.find("</style>")]
print(f"style 内双花括号残留: {st.count('{{')}")
print(f"DV-CSS 注入次数: {t.count('DV-CSS-START')}")
for kw in ["dv-hero", "dv-ring", "dv-levels", "dv-strat", "dv-risk", "dv-risk-item", "避坑提示", "观察评级", "非买卖建议"]:
    print(f"  含[{kw}]:", kw in t)
for kw in ["ops-overview", "advice-hero", "strat-line", "ops-strat", "ops-risk"]:
    print(f"  旧类残留[{kw}]:", kw in t)
