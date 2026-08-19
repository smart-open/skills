# -*- coding: utf-8 -*-
"""近一月板块轮动 v5：日期为表头，每列展示当日 top7 板块（含涨幅+涨停数），颜色标记轮动；
底部总结：精致色块图例 + 轮动节奏 4 卡片 + 双注脚。"""
import os
import re
import argparse
from datetime import datetime
from collections import Counter

from _common import BASE, REPORT_ROOT, load_json, read_text, write_text, trend_tag, bridge_ths_name

ap = argparse.ArgumentParser(description="插入近一月板块轮动章（默认真实今日）")
ap.add_argument("--date", default=datetime.now().strftime("%Y%m%d"),
                help="目标交易日 YYYYMMDD，默认取真实今日；用于定位行情复盘_{date}.html")
_args = ap.parse_args()
TD = _args.date

data = load_json(os.path.join(BASE, "data/boards_15d.json"))
zt_all = load_json(os.path.join(BASE, "data/zt_15d.json"))

# ===== 动态热点色板（Model 01）：优先读 hot_sectors_{date}.json，回退同花顺 14 短名 =====
FALLBACK_COLORS = {
    "CPO": "#ff5c7a", "F5G": "#ff8a5c", "光纤": "#ffb84d", "铜缆高速连接": "#ffd23f",
    "液冷服务器": "#8fd14f", "存储芯片": "#4cd07d", "创新药": "#4d9fff", "CRO": "#6cb6ff",
    "减肥药": "#9b6bff", "重组蛋白": "#b58cff", "稀土永磁": "#ff6bb5", "青蒿素": "#3ddbd9",
    "机器人": "#2dd4a8", "光刻机": "#9aa5b5",
}
_hot_path = os.path.join(BASE, f"data/hot_sectors_{TD}.json")
_hs = load_json(_hot_path).get("hot_sectors", [])
dyn_order = [s["name"] for s in _hs]
dyn_colors = {s["name"]: s["color"] for s in _hs}

# 收集日期
all_dates = set()
for v in data.values():
    for d, _ in v:
        all_dates.add(d)
# 最近日期在前（表头第一列为最新交易日），取最近 15 个交易日
dates = sorted(all_dates, reverse=True)[:15]

# 每日 top7（按涨幅排序）
def daily_top7(date):
    rows = []
    for name, daily in data.items():
        kv = dict(daily)
        if date in kv:
            rows.append((name, kv[date]))
    rows.sort(key=lambda x: -x[1])
    return rows[:7]

top7_by_date = {d: daily_top7(d) for d in dates}

# ===== 颜色/图例：仅收纳出现在 Top7 表中的板块（表内颜色才有意义，避免全量板块图例爆炸） =====
present_boards = set()
for d in dates:
    for name, _ in top7_by_date[d]:
        present_boards.add(name)

PALETTE = ["#ff5c7a", "#ff8a5c", "#ffb84d", "#ffd23f", "#8fd14f", "#4cd07d", "#4d9fff", "#6cb6ff",
           "#9b6bff", "#b58cff", "#ff6bb5", "#3ddbd9", "#2dd4a8", "#9aa5b5", "#ff9370", "#7ecba1",
           "#a78bfa", "#f472b6", "#38bdf8", "#fbbf24"]

colors = {}
legend_order = []
# 动态热点优先（保留 hot_sectors 分配的稳定色）
for n in dyn_order:
    if n in present_boards and n not in colors:
        colors[n] = dyn_colors.get(n) or "#9aa5b5"
        legend_order.append(n)
# 其余出现在表内的板块：同花顺 14 短名回退色经桥接匹配，再走自动色板
_auto = 0
for n in sorted(present_boards):
    if n in colors:
        continue
    ths = bridge_ths_name(n)
    if ths and ths in FALLBACK_COLORS:
        colors[n] = FALLBACK_COLORS[ths]
    else:
        colors[n] = PALETTE[_auto % len(PALETTE)]
        _auto += 1
    legend_order.append(n)

# 表头（日期）
th = "".join(f'<th>{d[4:6]}-{d[6:]}</th>' for d in dates)

# 数据行（排名 1-7）
rows_html = ""
for rank in range(7):
    tds = f'<td class="sticky rank-cell">Top{rank+1}</td>'
    for d in dates:
        top7 = top7_by_date[d]
        if rank < len(top7):
            name, chg = top7[rank]
            col = colors[name]
            cls = "up" if chg > 0 else ("down" if chg < 0 else "flat")
            # ×N 桥接：zt_15d 键可能是同花顺短名（旧 14 板块口径），东财名直查不中时走桥接
            zt = zt_all.get(d, {}).get(name, 0)
            if not zt:
                ths = bridge_ths_name(name)
                if ths:
                    zt = zt_all.get(d, {}).get(ths, 0)
            zt_badge = f'<em class="zt" title="{name} 当日涨停 {zt} 家">×{zt}</em>' if zt > 0 else ""
            tds += f'''
        <td class="bcell">
          <span class="bdot" style="background:{col}"></span>
          <span class="bname" style="color:{col}">{name}</span>{zt_badge}
          <span class="bchg {cls}">{chg:+.1f}%</span>
        </td>'''
        else:
            tds += '<td class="bcell empty">—</td>'
    rows_html += f'<tr>{tds}</tr>'

# 图例（用户指定顺序）
legend_html = "".join(
    f'<span class="lg-item"><i style="background:{colors[n]}"></i>{n}</span>' for n in legend_order)

# ===== P1：资金轮动四象限（Model 03）+ 板块多因子趋势（Model 06）=====
# 优先读 rotation_{date}.json；缺失则回退旧版「轮动节奏 4 卡片 + 15 日涨幅趋势榜」。
_rot_path = os.path.join(BASE, f"data/rotation_{TD}.json")
rot = load_json(_rot_path)

Q_META = [
    ("mainline", "主线", "#ff5c7a", "资金净流入 + 趋势一致，行情持续性最强，中线可跟踪"),
    ("relay",    "接力", "#ffb84d", "资金净流入但趋势未确认 / 新热点，短线博弈为主"),
    ("pulse",    "脉冲", "#4d9fff", "资金流出但当日仍上涨，短促冲高，追高需谨慎"),
    ("fade",     "退潮", "#3ddbd9", "资金流出 + 走势转弱，回避或逢高减仓"),
]
TAG_CLS = {"启动": "launch", "加速": "accel", "减速": "decel", "回落": "pullback"}

def _fund_cls(v):
    return "pos" if v > 0 else ("neg" if v < 0 else "zero")

if rot:
    quad = rot.get("quadrants", {})
    rot_summary = rot.get("summary", "")

    quad_cards = ""
    for key, tlabel, tcolor, tdesc in Q_META:
        items = quad.get(key, []) or []
        if items:
            item_html = ""
            for b in items[:4]:
                bname = b.get("name", "")
                bcol = b.get("color", "#9aa5b5")
                bfund = b.get("fund_net_yi", 0.0)
                bchg = b.get("chg_pct", 0.0)
                cls = "up" if bchg > 0 else ("down" if bchg < 0 else "flat")
                item_html += f'''
            <span class="q-item"><i class="bdot" style="background:{bcol}"></i><span class="bname" style="color:{bcol}">{bname}</span><em class="q-fund {_fund_cls(bfund)}">{bfund:+.1f}亿</em><em class="q-chg {cls}">{bchg:+.1f}%</em></span>'''
            body = f'<div class="q-list">{item_html}</div>'
        else:
            body = f'<p class="rh-desc">暂无板块落入该象限</p>'
        quad_cards += f'''
        <div class="qd-card" style="--c:{tcolor}">
          <div class="rh-top"><span class="rh-dot"></span><span class="rh-tag">{tlabel}</span><span class="rh-h">{tlabel}象限</span></div>
          <p class="rh-desc">{tdesc}</p>
          {body}
        </div>'''

    rhythm_cards = quad_cards
    summary_html = f'<p class="rot-summary">{rot_summary}</p>' if rot_summary else ""
    ry_h4 = "资金轮动四象限"
    trend_h4 = "板块多因子趋势榜 <em>15日40% · 5日30% · 资金20% · 涨停10%</em>"

    # 板块多因子趋势榜（Model 06）：趋势分排序
    trend_board = rot.get("trend_board", [])
    trend_rows = ""
    for t in trend_board[:16]:
        name = t.get("name", "")
        col = t.get("color", "#9aa5b5")
        score = t.get("trend_score", 0.0)
        cum15 = t.get("cum15", 0.0)
        cum5 = t.get("cum5", 0.0)
        tag = t.get("tag", "") or ""
        cls15 = "up" if cum15 > 0 else ("down" if cum15 < 0 else "flat")
        cls5 = "up" if cum5 > 0 else ("down" if cum5 < 0 else "flat")
        tag_html = f'<em class="ttag {TAG_CLS.get(tag, "")}">{tag}</em>' if tag else ""
        trend_rows += f'''
        <div class="trend-item">
          <span class="trend-score" title="多因子趋势分 = 15日涨幅40% + 5日动量30% + 资金持续20% + 涨停持续10%（0~1）">{score:.2f}</span>
          <span class="bdot" style="background:{col}"></span>
          <span class="bname" style="color:{col}">{name}</span>
          <span class="trend-5d {cls5}">5日 {cum5:+.1f}%</span>
          <span class="trend-cum {cls15}">{cum15:+.1f}%</span>
          {tag_html}
        </div>'''
else:
    # ===== 回退：旧版轮动节奏 4 卡片（rotation 数据缺失时降级） =====
    summary_html = ""
    ry_h4 = "轮动节奏解读"
    trend_h4 = "板块中线趋势榜 <em>15日累计涨幅</em>"
    appear = Counter()
    for d in dates:
        for name, _ in top7_by_date[d]:
            appear[name] += 1

    # ① 主线持续：Top7 出现天数最多的板块
    main_board, main_days = appear.most_common(1)[0] if appear else (None, 0)
    main_color = colors.get(main_board, "#ff5c7a")

    # ② 近期领涨：最新交易日（dates 降序，第一个即最新）Top1
    recent_top = top7_by_date[dates[0]] if dates else []
    recent_board, recent_chg = recent_top[0] if recent_top else (None, 0.0)
    recent_color = colors.get(recent_board, "#4d9fff")

    # ③ 脉冲爆发：15 日内单日涨幅最大
    pulse = None
    for name, daily in data.items():
        for dd, chg in daily:
            if dd in dates and (pulse is None or chg > pulse[2]):
                pulse = (name, dd, chg)
    pulse_board = pulse[0] if pulse else None
    pulse_chg = pulse[2] if pulse else 0.0
    pulse_color = colors.get(pulse_board, "#ff6bb5")

    # ④ 高低切换：最新日 Top7 中、此前从未进入 Top7 的新面孔
    old_dates = dates[1:] if len(dates) > 1 else dates
    old_appear = Counter()
    for d in old_dates:
        for name, _ in top7_by_date[d]:
            old_appear[name] += 1
    new_faces = [name for name, _ in top7_by_date[dates[0]]] if dates else []
    switch_board = next((n for n in new_faces if n not in old_appear), None)
    switch_color = colors.get(switch_board, "#2dd4a8")

    def _bb(name, color, fallback="—"):
        return f'<b style="color:{color}">{name}</b>' if name else f'<b style="color:{color}">{fallback}</b>'

    rhythm_cards = ""
    rhythm_cards += f'''
        <div class="rh-card" style="--c:{main_color}">
          <div class="rh-top"><span class="rh-dot"></span><span class="rh-tag">主线</span><span class="rh-h">主线持续</span></div>
          <p class="rh-desc">{_bb(main_board, main_color)} {main_days} 日进入 Top7，为贯穿区间的主线</p>
        </div>''' if main_board else '''
        <div class="rh-card" style="--c:{main_color}">
          <div class="rh-top"><span class="rh-dot"></span><span class="rh-tag">主线</span><span class="rh-h">主线持续</span></div>
          <p class="rh-desc">近 15 日无明显持续主线</p>
        </div>'''
    rhythm_cards += f'''
        <div class="rh-card" style="--c:{recent_color}">
          <div class="rh-top"><span class="rh-dot"></span><span class="rh-tag">领涨</span><span class="rh-h">近期领涨</span></div>
          <p class="rh-desc">{_bb(recent_board, recent_color)} 最新交易日 {recent_chg:+.1f}% 领涨</p>
        </div>'''
    rhythm_cards += f'''
        <div class="rh-card" style="--c:{pulse_color}">
          <div class="rh-top"><span class="rh-dot"></span><span class="rh-tag">脉冲</span><span class="rh-h">脉冲爆发</span></div>
          <p class="rh-desc">{_bb(pulse_board, pulse_color)} 单日 {pulse_chg:+.1f}% 脉冲爆发</p>
        </div>'''
    rhythm_cards += f'''
        <div class="rh-card" style="--c:{switch_color}">
          <div class="rh-top"><span class="rh-dot"></span><span class="rh-tag">切换</span><span class="rh-h">高低切换</span></div>
          <p class="rh-desc">{_bb(switch_board, switch_color)} 最新日新晋 Top7，资金高低切换</p>
        </div>''' if switch_board else '''
        <div class="rh-card" style="--c:{switch_color}">
          <div class="rh-top"><span class="rh-dot"></span><span class="rh-tag">切换</span><span class="rh-h">高低切换</span></div>
          <p class="rh-desc">最新日 Top7 均为近期熟面孔，无明显高低切换</p>
        </div>'''

    # 回退：旧版板块中线趋势榜（15 日累计涨幅）
    def board_cum(daily, ndays):
        cum = 1.0
        for d, chg in daily[-ndays:]:
            cum *= (1 + chg / 100)
        return round((cum - 1) * 100, 2)

    trend = []
    for name in legend_order:
        daily = data.get(name, [])
        if not daily:
            continue
        cum15 = board_cum(daily, 15)
        cum5 = board_cum(daily, 5)
        tag = ""
        if cum15 > 0 and cum5 > 0 and cum5 / cum15 > 0.5:
            tag = "加速"
        elif cum15 > 0 and cum5 < cum15 * 0.3:
            tag = "减速"
        trend.append((name, cum15, cum5, tag))
    trend.sort(key=lambda x: -x[1])

    trend_rows = ""
    for name, cum15, cum5, tag in trend:
        col = colors.get(name, "#9aa5b5")
        cls15 = "up" if cum15 > 0 else ("down" if cum15 < 0 else "flat")
        cls5 = "up" if cum5 > 0 else ("down" if cum5 < 0 else "flat")
        tag_html = f'<em class="accel">{tag}</em>' if tag else ""
        trend_rows += f'''
        <div class="trend-item">
          <span class="bdot" style="background:{col}"></span>
          <span class="bname" style="color:{col}">{name}</span>
          <span class="trend-5d {cls5}">5日 {cum5:+.1f}%</span>
          <span class="trend-cum {cls15}">{cum15:+.1f}%</span>
          {tag_html}
        </div>'''

section = f'''
<div class="section">
  <div class="section-head"><span class="no">07</span><h2>近一月板块轮动</h2><span class="desc">每日 Top7 板块 · 颜色标记轮动轨迹</span><span class="line"></span></div>

  <p class="muted" style="font-size:12px;margin-bottom:14px">表头为<b>日期</b>，每列纵向展示当日涨幅 <b>Top7</b> 板块；<b>同一板块固定颜色</b>，跨日期追踪可看出轮动节奏；每格标注<b>当日涨幅</b>与<b>涨停家数（×N）</b>。横向滑动查看全部日期。</p>

  <div class="rot-cols-wrap">
    <table class="rot-cols">
      <thead><tr><th class="sticky">排名</th>{th}</tr></thead>
      <tbody>{rows_html}</tbody>
    </table>
  </div>

  <div class="rot-foot">
    <div class="rot-legend-card">
      <span class="rf-label"><i class="rf-ico"></i>板块颜色图例</span>
      <div class="lg-flow">{legend_html}</div>
    </div>

    <div class="rot-rhythm">
      <h4 class="rf-title">{ry_h4}</h4>
      {summary_html}
      <div class="rhythm-grid">
        {rhythm_cards}
      </div>
    </div>

    <div class="rot-trend">
      <h4 class="rf-title">{trend_h4}</h4>
      <div class="trend-grid">
        {trend_rows}
      </div>
    </div>

    <div class="rot-notes">
      <p><span class="nt-ico">注</span>涨幅数据来自东方财富行业+概念板块指数（近 15 日逐日涨跌，全板块动态覆盖）；涨停家数按概念板块关键词从涨停池匹配。</p>
      <p><span class="nt-ico">注</span>区间涨幅参考口径为「7 月下旬反弹以来 / 8 月以来」，据公开财经资讯交叉验证；节奏标签为定性判断，供复盘参考。</p>
    </div>
  </div>
</div>
'''

css = '''
/*ROT-CSS-START*/
.rot-cols-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--sur);margin-bottom:18px}
.rot-cols{border-collapse:collapse;font-size:12px;min-width:100%}
.rot-cols th,.rot-cols td{padding:6px 8px;text-align:center;white-space:nowrap;border-bottom:1px solid var(--line);border-right:1px solid var(--line)}
.rot-cols th{font-size:10px;color:var(--muted);font-weight:500;border-bottom:2px solid var(--glow);font-family:"Cascadia Code",monospace}
.rot-cols .sticky{position:sticky;left:0;background:var(--sur);z-index:1;font-weight:600}
.rot-cols .rank-cell{font-family:"Cascadia Code",monospace;color:var(--acc);font-size:11px;text-align:left;min-width:52px}
.bcell{position:relative;min-width:98px}
.bcell.empty{color:var(--muted)}
.bdot{display:inline-block;width:7px;height:7px;border-radius:2px;margin-right:5px;vertical-align:middle}
.bname{font-size:12px;font-weight:600}
.bcell .zt{font-style:normal;font-size:9px;color:var(--up);background:rgba(255,77,94,.13);border:1px solid rgba(255,77,94,.34);border-radius:3px;padding:0 3px;margin-left:4px;vertical-align:1px;font-family:"Cascadia Code",monospace}
.bchg{display:block;font-size:10px;font-family:"Cascadia Code",monospace;margin-top:2px}
.bchg.up{color:var(--up)}.bchg.down{color:var(--down)}.bchg.flat{color:var(--muted)}

/* ---- 底部总结 ---- */
.rot-foot{display:flex;flex-direction:column;gap:16px;margin-top:6px}
.rot-legend-card{background:var(--sur2);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.rf-label{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--acc2);margin-bottom:11px}
.rf-label .rf-ico{width:4px;height:14px;border-radius:2px;background:linear-gradient(var(--acc),var(--acc2))}
.lg-flow{display:flex;flex-wrap:wrap;gap:9px 10px}
.lg-item{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted);background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:20px;padding:3px 10px}
.lg-item i{width:9px;height:9px;border-radius:2px;display:inline-block;flex-shrink:0}

.rf-title{font-size:14px;font-weight:600;color:var(--acc2);margin:0 0 11px;display:flex;align-items:center;gap:8px}
.rf-title::before{content:"";width:4px;height:14px;border-radius:2px;background:linear-gradient(var(--acc),var(--acc2))}
.rhythm-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.rh-card{background:var(--sur2);border:1px solid var(--line);border-left:3px solid var(--c);border-radius:9px;padding:13px 15px;transition:.18s}
.rh-card:hover{background:var(--sur);transform:translateY(-2px)}
.rh-top{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.rh-dot{width:9px;height:9px;border-radius:3px;background:var(--c)}
.rh-tag{font-size:10px;color:var(--c);border:1px solid var(--c);border-radius:4px;padding:1px 6px;font-family:"Cascadia Code",monospace}
.rh-h{font-size:13.5px;font-weight:700;color:#eaf1ff}
.rh-desc{font-size:12px;color:var(--muted);line-height:1.65;margin:0}
.rh-desc b{font-weight:700}
.rf-title em{font-style:normal;font-size:11px;color:var(--muted);font-weight:400;margin-left:4px;font-family:"Cascadia Code",monospace}

/* ---- 板块中线趋势榜 ---- */
.rot-trend{margin-top:16px}
.trend-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.trend-item{display:flex;align-items:center;gap:8px;background:var(--sur2);border:1px solid var(--line);border-radius:8px;padding:8px 12px;font-size:12px;transition:.15s}
.trend-item:hover{border-color:var(--glow);background:var(--sur)}
.trend-5d{font-family:"Cascadia Code",monospace;font-size:11px;margin-left:auto;color:var(--muted)}
.trend-cum{font-family:"Cascadia Code",monospace;font-weight:700;font-size:12px;min-width:58px;text-align:right}
.trend-cum.up,.trend-5d.up{color:var(--up)}
.trend-cum.down,.trend-5d.down{color:var(--down)}
.trend-cum.flat,.trend-5d.flat{color:var(--muted)}
.accel{font-style:normal;font-size:10px;color:var(--warn);border:1px solid rgba(255,180,84,.4);border-radius:3px;padding:0 5px;background:rgba(255,180,84,.08)}

/* ---- P1 资金四象限 + 多因子趋势 ---- */
.qd-card{background:var(--sur2);border:1px solid var(--line);border-left:3px solid var(--c);border-radius:9px;padding:13px 15px;transition:.18s}
.qd-card:hover{background:var(--sur);transform:translateY(-2px)}
.q-list{display:flex;flex-direction:column;gap:5px;margin-top:9px}
.q-item{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}
.q-item .bname{font-weight:600}
.q-fund{font-family:"Cascadia Code",monospace;font-size:10px;font-style:normal;margin-left:auto}
.q-fund.pos{color:var(--up)}.q-fund.neg{color:var(--down)}.q-fund.zero{color:var(--muted)}
.q-chg{font-family:"Cascadia Code",monospace;font-size:10px;font-style:normal;min-width:46px;text-align:right}
.q-chg.up{color:var(--up)}.q-chg.down{color:var(--down)}.q-chg.flat{color:var(--muted)}
.rot-summary{font-size:12px;color:var(--muted);line-height:1.6;margin:0 0 11px;background:var(--sur2);border:1px solid var(--line);border-radius:8px;padding:9px 12px}
.trend-score{min-width:42px;text-align:center;font-family:"Cascadia Code",monospace;font-weight:700;font-size:12px;color:#fff;background:linear-gradient(135deg,var(--acc),var(--acc2));border-radius:5px;padding:2px 4px;flex-shrink:0}
.ttag{font-style:normal;font-size:10px;border-radius:3px;padding:0 6px;border:1px solid;flex-shrink:0}
.ttag.accel{color:var(--warn);border-color:rgba(255,180,84,.4);background:rgba(255,180,84,.08)}
.ttag.decel{color:#9aa5b5;border-color:var(--line);background:rgba(255,255,255,.03)}
.ttag.pullback{color:#ff6bb5;border-color:rgba(255,107,181,.4);background:rgba(255,107,181,.08)}
.ttag.launch{color:var(--up);border-color:rgba(255,77,94,.4);background:rgba(255,77,94,.08)}

.rot-notes{display:flex;flex-direction:column;gap:6px;border-top:1px dashed var(--line);padding-top:12px}
.rot-notes p{font-size:11px;color:var(--muted);line-height:1.6;margin:0;display:flex;gap:8px;align-items:flex-start}
.rot-notes .nt-ico{flex-shrink:0;font-size:10px;color:var(--muted);border:1px solid var(--line);border-radius:3px;padding:0 5px;font-family:"Cascadia Code",monospace;background:var(--sur2)}
@media(max-width:860px){.rhythm-grid{grid-template-columns:1fr}.trend-grid{grid-template-columns:1fr}}
/*ROT-CSS-END*/
'''

path = os.path.join(REPORT_ROOT, f"行情复盘_{TD}.html")
html = read_text(path)
# 幂等：先移除旧的轮动 CSS 块，再注入最新
html = re.sub(r'/\*ROT-CSS-START\*/.*?/\*ROT-CSS-END\*/', '', html, flags=re.DOTALL)
html = html.replace("</style>", css + "</style>")

start_marker = '<div class="section">\n  <div class="section-head"><span class="no">07</span><h2>近一月板块轮动</h2>'
start_idx = html.find(start_marker)
if start_idx == -1:
    # 插入模式：基础报告无轮动章节，插入到「个股推荐」前并重编号
    anchor = '<div class="section-head"><span class="no">07</span><h2>个股推荐</h2>'
    a = html.find(anchor)
    if a == -1:
        print("未找到个股推荐锚点")
    else:
        sec_start = html.rfind('<div class="section">', 0, a)
        html = html[:sec_start] + section + html[sec_start:]
        html = html.replace('<span class="no">07</span><h2>个股推荐</h2>',
                            '<span class="no">08</span><h2>个股推荐</h2>')
        html = html.replace('<span class="no">08</span><h2>涨跌幅榜 & 炸板</h2>',
                            '<span class="no">09</span><h2>涨跌幅榜 & 炸板</h2>')
        print("轮动章节已插入并重编号")
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

write_text(path, html)

t = read_text(path)
o = len(re.findall(r'<div[^>]*>', t))
c = len(re.findall(r'</div>', t))
n_bcell = len(re.findall(r'class="bcell', t))
n_legend = len(re.findall(r'class="lg-item"', t))
n_qd = len(re.findall(r'class="qd-card"', t))
n_rh = len(re.findall(r'class="rh-card"', t))
n_tscore = len(re.findall(r'class="trend-score"', t))
n_ttag = len(re.findall(r'class="ttag', t))
n_zt = len(re.findall(r'class="zt"', t))
print(f"div: 开{o} 闭{c} {'平衡' if o==c else '不平衡!'}")
print(f"bcell 单元格: {n_bcell}")
print(f"图例项: {n_legend}")
print(f"四象限卡片: {n_qd} / 回退轮动卡片: {n_rh}")
print(f"多因子趋势分: {n_tscore} · 状态标签: {n_ttag}")
print(f"×N 涨停标记: {n_zt}")
