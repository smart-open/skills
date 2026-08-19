# -*- coding: utf-8 -*-
"""科技感版本：金融数据终端风（深蓝黑 + 等宽数字 + sparkline + 发光卡片）。"""
import os
import argparse
from datetime import datetime
from collections import Counter

from _common import (REPORT_ROOT, BASE, load_json as _load_json, sparkline, safe_float,
                     UP_COLOR, DOWN_COLOR, WARN_COLOR, MUTED_COLOR,
                     GOLD_COLOR, ACC_COLOR, ACC2_COLOR,
                     EMOTION_STAGES, EMOTION_STAGE_COLORS,
                     TEMPERATURE_W, RISK_W, TEMP_FACTOR_LABELS, RISK_FACTOR_LABELS,
                     today_ymd, seal_break_rates)

ap = argparse.ArgumentParser(description="A股行情复盘报告生成（默认真实今日）")
ap.add_argument("--date", default=today_ymd(),
                help="目标交易日 YYYYMMDD，默认取真实今日")
_args = ap.parse_args()
TD = _args.date
TRADE_DATE = f"{TD[:4]}-{TD[4:6]}-{TD[6:8]}"
_td_dt = datetime.strptime(TRADE_DATE, "%Y-%m-%d")
WEEK_CN = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"][_td_dt.weekday()]

d = _load_json(os.path.join(BASE, f"data/market_{TD}.json"), {})
rec = _load_json(os.path.join(BASE, f"data/recommend_{TD}.json"), {})
klines = _load_json(os.path.join(BASE, "data/index_klines.json"), {})

# 防御性读取：采集部分失败时降级为空，避免 KeyError 崩溃
indexes = d.get("indexes", [])
lu = d.get("limit_up", {}).get("list", []); total_up = d.get("limit_up", {}).get("total", 0)
zb = d.get("broken", {}).get("list", []); total_zb = d.get("broken", {}).get("total", 0)
total_dn = d.get("limit_down", {}).get("total", 0)
breadth = d.get("breadth", {"up": 0, "down": 0, "flat": 0, "total": 0, "top_gainers": [], "top_losers": []})
hot_reason_rows = d.get("hot_reason", {}).get("rows", [])
# sectors：collect_data 产出 {"industry": [...], "concept": [...]}，collect_v2 产出扁平 list，统一归一化为 list
_sectors_raw = d.get("sectors", [])
if isinstance(_sectors_raw, dict):
    _sectors_raw = (_sectors_raw.get("industry", []) or []) + (_sectors_raw.get("concept", []) or [])
sectors = _sectors_raw if isinstance(_sectors_raw, list) else []
sectors = sorted(sectors, key=lambda x: safe_float(x.get("chg_pct")), reverse=True)
seal_rate, break_rate = seal_break_rates(total_up, total_zb)
max_lbc = max((x.get("lbc", 1) for x in lu), default=0)
up_ratio = round(breadth["up"] / breadth["down"], 2) if breadth.get("down") else 0
sh_amt = next((x["amount_yi"] for x in indexes if x["code"] == "000001"), 0)
sz_amt = next((x["amount_yi"] for x in indexes if x["code"] == "399001"), 0)
total_amt = sh_amt + sz_amt

lbc_counter = Counter(x["lbc"] for x in lu)
ladder = sorted(lbc_counter.items(), reverse=True)
hy_counter = Counter(x["hybk"] for x in lu)

# ===== 动态热点发现（Model 01）：从 hot_sectors_{date}.json 读取，替代写死 theme_map =====
hot_sectors_path = os.path.join(BASE, f"data/hot_sectors_{TD}.json")
lifecycle_path = os.path.join(BASE, f"data/theme_lifecycle_{TD}.json")

_hot_data = _load_json(hot_sectors_path, {})
_hot_sectors = _hot_data.get("hot_sectors", [])

_life_data = _load_json(lifecycle_path, {})
_life_themes = {t["name"]: t for t in _life_data.get("themes", [])}

# ===== 主线题材（数据驱动，取动态热点 Top5） =====
STAGE_CN = {"萌芽": "🌱萌芽", "启动": "🔥启动", "发酵": "🚀发酵", "高潮": "⭐高潮", "退潮": "📉退潮", "分歧": "⚡分歧"}
main_lines = []
for hs in _hot_sectors[:5]:
    life = _life_themes.get(hs["name"], {})
    stage = life.get("stage", "")
    stage_tag = STAGE_CN.get(stage, "")
    scnt = hs["zt_cnt"]
    fund = hs["fund_net_yi"]
    desc_parts = [f"涨停 {scnt} 只"]
    if fund != 0:
        desc_parts.append(f"主力资金 {fund:+.1f} 亿")
    if stage_tag:
        desc_parts.append(f"阶段 {stage_tag}")
    main_lines.append((hs["name"], "，".join(desc_parts)))

# ===== 政策/消息（数据驱动，从 news_{date}.json 关键词筛选 Top5） =====
def build_policies(td):
    """从东财快讯按关键词加权筛选当日重点政策/消息，返回 6 元组 (no,title,tag,star,impact,meta)。"""
    news = _load_json(os.path.join(BASE, f"data/news_{td}.json"))
    if not news:
        return []
    KW = [
        ("政策/监管", ["政策", "国标", "通知", "出台", "发布", "印发", "批复", "意见", "规划", "补贴", "试点"], "政策催化"),
        ("涨价/供需", ["涨价", "上调", "上涨", "供不应求", "缺口", "提价", "紧缺", "短缺", "涨价潮"], "涨价催化"),
        ("业绩/数据", ["同比增长", "环比", "中报", "业绩预", "扭亏", "创新高", "量产", "突破"], "产业数据"),
    ]
    scored = []
    for n in news:
        title = n.get("title", "")
        t = (n.get("showTime", "") or "")[11:16]
        for cat, kws, tag in KW:
            hits = [w for w in kws if w in title]
            if hits:
                scored.append((len(hits), cat, tag, title, t, hits[0]))
    seen, uniq = set(), []
    for item in sorted(scored, key=lambda x: -x[0]):
        key = item[3][:18]
        if key not in seen:
            seen.add(key)
            uniq.append(item)
    out = []
    for i, (score, cat, tag, title, t, kw) in enumerate(uniq[:5], 1):
        star = "★" * min(5, score + 2)
        out.append((str(i), title[:44], tag, star, f"快讯「{kw}」相关 · {cat}", t))
    return out
policies = build_policies(TD)

# ===== 热点可持续板块（数据驱动，取动态热点 Top3 + 关联涨停股） =====
hot_sectors = []
for hs in _hot_sectors[:3]:
    life = _life_themes.get(hs["name"], {})
    stage = life.get("stage", "")
    stage_tag = STAGE_CN.get(stage, "")
    rank = hs["rank"]
    name = hs["name"]
    star = hs["stars"]
    scnt = hs["zt_cnt"]
    fund = hs["fund_net_yi"]
    stocks_data = [(st["name"], st["code"], (st.get("reason") or "")[:14]) for st in hs.get("stocks", [])[:4]]
    logic = f"涨停 {scnt} 只"
    if fund != 0:
        logic += f" · 主力资金 {fund:+.1f} 亿"
    if stage_tag:
        logic += f" · {stage_tag}"
    hot_sectors.append((str(rank), name, star, logic, stocks_data))

# ===== 个股推荐 pick（数据驱动，从 recommend JSON 取 Top5） =====
_first_board = rec.get("first_board", [])
_breakout = rec.get("breakout", [])
fb_map = {x["code"]: x for x in _first_board}
gb_map = {x["code"]: x for x in _breakout}
first_pick = [(x["code"], (x.get("reason") or x.get("hybk") or "题材"), "重点关注" if (x.get("low_pos") and (x.get("ma_bull") or x.get("above_ma60"))) else "可跟踪") for x in _first_board[:5]]
break_pick = [(x["code"], (x.get("reason") or x.get("hybk") or "题材"), "重点关注" if (x.get("ma_bull") and x.get("breakout")) else "可跟踪") for x in _breakout[:5]]

def c(v):
    try: v = float(v)
    except: return MUTED_COLOR
    return UP_COLOR if v > 0 else (DOWN_COLOR if v < 0 else MUTED_COLOR)

def s(v):
    try: v = float(v)
    except: return str(v)
    return f"{v:+.2f}%" if abs(v) < 100 else f"{v:+.1f}%"

def fmt_px(v): return f"{v:,.2f}"

# 指数卡（sparkline）
idx_cards = ""
for x in indexes:
    col = c(x["change_pct"])
    kmap = {"000001":"sh000001","399001":"sz399001","399006":"sz399006","000688":"sh000688",
            "000300":"sh000300","000905":"sh000905","000852":"sh000852","000016":"sh000016"}
    k = klines.get(kmap.get(x["code"], ""), [])
    up = (x.get("change_pct") or 0) > 0
    idx_cards += f'''
    <div class="icard">
      <div class="icard-top"><span class="icard-name">{x["name"]}</span>
      <span class="icard-chg" style="color:{col}">{s(x["change_pct"])}</span></div>
      <div class="icard-price">{fmt_px(x["price"])}</div>
      <div class="icard-spark">{sparkline(k, up, dot=True)}</div>
      <div class="icard-amt">成交 {x["amount_yi"]:,.0f} 亿</div>
    </div>'''

_total = breadth.get("total") or 0
up_pct = round(breadth["up"] / _total * 100, 1) if _total else 0
dn_pct = round(breadth["down"] / _total * 100, 1) if _total else 0
fl_pct = round(100 - up_pct - dn_pct, 1)

max_lb = max([v for k, v in ladder], default=1)
lu_sorted = sorted(lu, key=lambda z: -z.get("lbc", 0))
ladder_rows = ""
for k, v in ladder:
    names = "、".join(x["name"] for x in lu_sorted if x.get("lbc", 0) == k)
    ladder_rows += f'''
    <div class="ladder-row">
      <span class="ladder-lv lv-{k}">{k}板</span>
      <span class="ladder-count">{v}</span>
      <span class="ladder-bar"><i style="width:{v / max_lb * 100}%"></i></span>
      <span class="ladder-names">{names}</span>
    </div>'''

theme_rows = ""
_max_hot_score = max([hs["score"] for hs in _hot_sectors], default=1)
for hs in _hot_sectors:
    _sc = hs["score"]
    stage = _life_themes.get(hs["name"], {}).get("stage", "")
    stage_tag = f' <span class="muted" style="font-size:10px">[{stage}]</span>' if stage else ""
    theme_rows += f'''
    <div class="bar-row"><span class="bar-label">{hs["name"]}{stage_tag}</span>
    <span class="bar-track"><i style="width:{_sc / _max_hot_score * 100}%"></i></span>
    <span class="bar-val">{_sc:.2f}</span></div>'''

max_hy = max([c for _, c in hy_counter.most_common(8)], default=1)
hy_rows = ""
for k, v in hy_counter.most_common(8):
    hy_rows += f'''
    <div class="bar-row"><span class="bar-label">{k}</span>
    <span class="bar-track"><i class="accent" style="width:{v / max_hy * 100}%"></i></span>
    <span class="bar-val">{v}</span></div>'''

sec_top = sectors[:10]; sec_bottom = sectors[-5:]
def sec_tr(rows):
    h = ""
    for x in rows:
        h += f'<tr><td>{x.get("name", "")}</td><td class="num" style="color:{c(x.get("chg_pct"))}">{s(x.get("chg_pct"))}</td><td class="muted">{x.get("leader_name") or x.get("leader") or ""}</td></tr>'
    return h
def gd_tr(rows):
    h = ""
    for r in rows:
        h += f'<tr><td>{r.get("name", "")}</td><td class="muted">{r.get("code", "")}</td><td class="num" style="color:{c(r.get("chg"))}">{s(r.get("chg"))}</td></tr>'
    return h
sec_top_html = sec_tr(sec_top); sec_bottom_html = sec_tr(sec_bottom)
gain_html = gd_tr((breadth.get("top_gainers") or [])[:10]); loss_html = gd_tr((breadth.get("top_losers") or [])[:10])

zb_rows = ""
for x in zb[:14]:
    zb_rows += f'<tr><td>{x["name"]}</td><td class="muted">{x["hybk"]}</td><td class="num">炸{x["zbc"]}次</td><td class="num" style="color:{c(x["chg_pct"])}">{s(x["chg_pct"])}</td></tr>'

main_lines_html = ""
for i, (n, desc) in enumerate(main_lines, 1):
    main_lines_html += f'''
    <div class="line-item"><span class="line-no">{i:02d}</span>
    <div class="line-body"><h4>{n}</h4><p>{desc}</p></div></div>'''

policy_html = ""
for no, title, tag, star, impact, meta in policies:
    policy_html += f'''
    <div class="policy">
      <div class="policy-head"><span class="policy-no">{no}</span><h4>{title}</h4><span class="policy-star">{star}</span></div>
      <div class="policy-meta"><span class="tag">{tag}</span><span style="margin-left:10px;font-size:11px;color:var(--muted);font-family:'Cascadia Code',monospace">{meta}</span></div>
      <p class="policy-impact">{impact}</p>
    </div>'''

sector_html = ""
for no, name, star, logic, stocks in hot_sectors:
    chips = ""
    for sn, sc, st in stocks:
        chips += f'<div class="chip"><b>{sn}</b><span>{sc}</span><em>{st}</em></div>'
    sector_html += f'''
    <div class="sector">
      <div class="sector-head"><span class="sector-rank">{no}</span><h4>{name}</h4><span class="sector-star">{star}</span></div>
      <p class="sector-logic">{logic}</p><div class="chips">{chips}</div>
    </div>'''

def stock_cards(picks, source):
    h = ""
    for code, theme, rating in picks:
        m = source.get(code)
        if not m: continue
        sup = m.get("ma21") or m.get("ma6") or 0
        res = m.get("high250") or 0
        hot = rating == "重点关注"
        cls = "hot" if hot else "track"
        label = "重点关注" if hot else "可跟踪"
        dd = m.get("drawdown")
        dd_text = f"-{dd}%" if dd is not None else "—"
        _nm = m.get("name", "")
        _diag_file = f"{_nm}_个股诊断_{TD}.html"
        if os.path.exists(os.path.join(BASE, "output", _diag_file)) or os.path.exists(os.path.join(REPORT_ROOT, _diag_file)):
            _head = f'<a class="sc-hd" href="{_diag_file}" title="打开个股诊断报告"><b>{_nm}</b><span class="sc-code">{code}</span></a>'
            _more = f'<a class="sc-more" href="{_diag_file}">查看个股诊断 →</a>'
        else:
            _head = f'<b>{_nm}</b><span class="sc-code">{code}</span>'
            _more = ""
        h += f'''
        <div class="sc">
          <div class="sc-head">{_head}<span class="sc-badge {cls}">{label}</span></div>
          <div class="sc-theme">{theme}</div>
          <div class="sc-metrics">
            <div><span class="k">现价</span><span class="v">{fmt_px(m.get("price"))}</span></div>
            <div><span class="k">涨幅</span><span class="v up">{m.get("chg_pct"):+.1f}%</span></div>
            <div><span class="k">回撤</span><span class="v warn">{dd_text}</span></div>
            <div><span class="k">量比</span><span class="v">{m.get("vol_ratio")}</span></div>
          </div>
          <div class="sc-level">支撑 <b class="down">{fmt_px(sup)}</b> · 压力 <b class="up">{fmt_px(res)}</b></div>
          {_more}
        </div>'''
    return h
first_cards = stock_cards(first_pick, fb_map)
break_cards = stock_cards(break_pick, gb_map)

# ===== 数据驱动：今日定调 + 副标题 + 连板断层 =====
lead_idx = max(indexes, key=lambda x: x.get("change_pct", 0), default={"name": "—", "change_pct": 0}) if indexes else {"name": "—", "change_pct": 0}
ladder_heights = sorted(lbc_counter.keys(), reverse=True)
if len(ladder_heights) >= 2 and ladder_heights[0] - ladder_heights[1] > 1:
    gap_short = f" · {ladder_heights[0]}板后{ladder_heights[1]}板断层"
else:
    gap_short = " · 梯队完整"
if seal_rate >= 70:
    mood = "情绪偏暖"
elif seal_rate <= 50:
    mood = "情绪偏冷"
else:
    mood = "情绪中性"
verdict = f'{lead_idx["name"]} <em>{s(lead_idx["change_pct"])}</em> 领涨，全市场 <b>涨 {breadth["up"]} · 跌 {breadth["down"]}</b>，封板率 {seal_rate}%。连板高度 {max_lbc} 板{gap_short}，<b>{mood}</b>，宜聚焦主线、控制追高。'

up_idx_cnt = sum(1 for x in indexes if x["change_pct"] > 0)
dn_idx_cnt = sum(1 for x in indexes if x["change_pct"] < 0)
idx_tone = "指数普涨" if up_idx_cnt >= 6 else ("指数普跌" if dn_idx_cnt >= 6 else "指数分化")
if breadth["up"] > breadth["down"]:
    structure = "个股涨多跌少"
elif breadth["up"] < breadth["down"]:
    structure = "个股跌多涨少"
else:
    structure = "个股涨跌互现"
sub = f'{TRADE_DATE.replace("-", " · ")} {WEEK_CN} · 收盘全景。{idx_tone}、{structure}，连板高度 {max_lbc} 板，封板率 {seal_rate}%。'

# ===== 情绪周期定位（Model 04 优先，回退硬编码） =====
lianban_cnt = sum(1 for x in lu if x.get("lbc", 1) >= 2)
big_loss_cnt = sum(1 for x in zb if (x.get("chg_pct") or 0) < -5)
_stage_colors = EMOTION_STAGE_COLORS
_STAGES = EMOTION_STAGES
_TEMP_W = TEMPERATURE_W
_RISK_W = RISK_W
_TEMP_LBL = TEMP_FACTOR_LABELS
_RISK_LBL = RISK_FACTOR_LABELS

def _factor_rows(factors, weights, labels, warm=False):
    bars = ""
    for k, lbl in labels.items():
        v = factors.get(k, 0) or 0
        w = weights.get(k, 0)
        bars += (f'<div class="em-f"><span class="em-f-lbl">{lbl} <i>{w * 100:.0f}%</i></span>'
                 f'<span class="em-f-track{" warm" if warm else ""}"><i style="width:{min(v, 100):.0f}%"></i></span>'
                 f'<span class="em-f-v">{v:.0f}</span></div>')
    return bars

emotion_path = os.path.join(BASE, f"data/emotion_{TD}.json")
_emo = _load_json(emotion_path, {})
if _emo:
    stage = _emo.get("stage", "分歧")
    stage_tone = _emo.get("stage_tone", "情绪分歧")
    stage_advice = _emo.get("advice", "")
    _temp = _emo.get("temperature", 0.0)
    _risk = _emo.get("risk", 0.0)
    position = _emo.get("position", "")
    _pmin = _emo.get("position_min")
    _pmax = _emo.get("position_max")
    _m = _emo.get("metrics", {})
    _factors = _emo.get("factors", {})
    _tf = _factors.get("temperature", {})
    _rf = _factors.get("risk", {})
    _fw = (_emo.get("params") or {}).get("temperature_weights", _TEMP_W)
    _rw = (_emo.get("params") or {}).get("risk_weights", _RISK_W)
    if _tf or _rf:
        em_factors_html = f'''
    <div class="em-factors">
      <div class="em-factors-group"><div class="em-factors-title">温度因子 · 权重加权</div>{_factor_rows(_tf, _fw, _TEMP_LBL)}</div>
      <div class="em-factors-group"><div class="em-factors-title">风险因子 · 权重加权</div>{_factor_rows(_rf, _rw, _RISK_LBL, warm=True)}</div>
    </div>'''
    else:
        em_factors_html = ""
    gauge_scale_html = "".join(f'<span class="{"gs-on" if s == stage else ""}">{s}</span>' for s in _STAGES)
    # 风险色：低<30 绿 / 中 30-60 琥珀 / 高>60 红
    risk_color = DOWN_COLOR if _risk < 30 else (WARN_COLOR if _risk < 60 else UP_COLOR)
    _stage_color = _stage_colors.get(stage, MUTED_COLOR)
    em_items = [
        (str(_m.get("zt_total", total_up)), "涨停数"),
        (f'{_m.get("max_lbc", max_lbc)}板', "连板高度"),
        (str(_m.get("lianban_cnt", lianban_cnt)), "连板家数"),
        (f'{_m.get("seal_rate", seal_rate)}%', "封板率"),
        (f'{_m.get("break_rate", break_rate)}%', "炸板率"),
        (str(_m.get("zd_total", total_dn)), "跌停数"),
        (f'{_m.get("up_cnt", breadth["up"])}/{_m.get("down_cnt", breadth["down"])}', "涨/跌家数"),
        (str(_m.get("big_loss_cnt", big_loss_cnt)), "大面家数"),
        (f'{_m.get("advance_rate", 0.0):.0f}%', "昨板晋级率"),
        (f'{_m.get("advance_cnt", 0)} 只', "晋级涨停"),
    ]
    em_metrics_html = "".join(
        f'<div class="em-item"><span class="em-v">{v}</span><span class="em-l">{lbl}</span></div>'
        for v, lbl in em_items)
    # 仓位进度条（E4）：position_min/max 映射到 0~10 成区间，用高亮档位可视化建议仓位区间
    pos_bar_html = ""
    if _pmin is not None and _pmax is not None:
        try:
            _lo = max(0.0, min(10.0, float(_pmin)))
            _hi = max(_lo, min(10.0, float(_pmax)))
        except (TypeError, ValueError):
            _lo = _hi = None
        if _lo is not None:
            _left = _lo / 10 * 100
            _width = (_hi - _lo) / 10 * 100
            pos_bar_html = f'''
      <div class="pos-bar">
        <span class="pos-bar-lbl">仓位建议</span>
        <div class="pos-bar-track"><i style="left:{_left:.1f}%;width:{_width:.1f}%"></i></div>
        <span class="pos-bar-val">{position or (f"{_lo:.0f}-{_hi:.0f}成")}</span>
      </div>'''
    emotion_html = f'''
  <div class="emotion-card">
    <div class="emotion-head">
      <span class="emotion-stage" style="color:{_stage_color}">{stage_tone}</span>
      <span class="emotion-tag">短线情绪周期 · Model 04</span>
      <span class="emotion-sub">情绪温度 {_temp:.0f} / 风险 {_risk:.0f}</span>
    </div>
    <div class="emotion-gauge">
      <div class="gauge-top"><span class="gauge-lbl">情绪温度</span><span class="gauge-val">{_temp:.0f}<i>℃</i></span></div>
      <div class="gauge-track"><i style="width:{min(_temp, 100):.1f}%"></i></div>
      <div class="gauge-scale">{gauge_scale_html}</div>
    </div>
    <div class="risk-row">
      <span class="risk-lbl">风险度</span>
      <div class="risk-track"><i style="width:{min(_risk, 100):.1f}%;background:{risk_color}"></i></div>
      <span class="risk-val" style="color:{risk_color}">{_risk:.0f}</span>
    </div>
    {em_factors_html}
    <div class="emotion-metrics" style="grid-template-columns:repeat(5,1fr)">{em_metrics_html}</div>
    {pos_bar_html}
    <p class="emotion-advice">{stage_advice}</p>
  </div>'''
else:
    if total_up >= 50 and max_lbc >= 5 and seal_rate >= 70:
        stage, stage_tone, stage_advice = "高潮", "情绪高潮", "主线明牌但风险累积，去弱留强、不追高位连板，警惕退潮"
    elif (total_up >= 40 or (seal_rate >= 80 and lianban_cnt >= 12)) and max_lbc >= 3 and seal_rate >= 60 and lianban_cnt >= 8:
        stage, stage_tone, stage_advice = "发酵", "情绪发酵", "主线清晰，积极参与主线龙头与低位补涨"
    elif total_up >= 25 and seal_rate >= 50:
        stage, stage_tone, stage_advice = "启动", "情绪启动", "新题材初现，轻仓试错首板，观察连板高度能否打开"
    elif total_up < 25 or seal_rate < 40:
        stage, stage_tone, stage_advice = "冰点", "情绪冰点", "交投清淡，空仓等待或关注超跌反抽，不抢反弹"
    else:
        stage, stage_tone, stage_advice = "分歧", "情绪分歧", "高位分化，控制仓位，聚焦核心辨识度个股"
    stage_color = _stage_colors.get(stage, MUTED_COLOR)
    emotion_html = f'''
  <div class="emotion-card">
    <div class="emotion-head">
      <span class="emotion-stage" style="color:{stage_color}">{stage_tone}</span>
      <span class="emotion-tag">短线情绪周期</span>
      <span class="emotion-sub">连板梯队 · 封板率 · 涨跌比综合研判</span>
    </div>
    <div class="emotion-metrics">
      <div class="em-item"><span class="em-v">{total_up}</span><span class="em-l">涨停数</span></div>
      <div class="em-item"><span class="em-v">{max_lbc}板</span><span class="em-l">连板高度</span></div>
      <div class="em-item"><span class="em-v">{lianban_cnt}</span><span class="em-l">连板家数</span></div>
      <div class="em-item"><span class="em-v">{seal_rate}%</span><span class="em-l">封板率</span></div>
      <div class="em-item"><span class="em-v">{break_rate}%</span><span class="em-l">炸板率</span></div>
    </div>
    <p class="emotion-advice">{stage_advice}</p>
  </div>'''

# ================= HTML =================
html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>A股行情复盘 · {TRADE_DATE} · 数据终端</title>
<style>
:root{{
  --bg:#0a0e1a; --bg2:#0d1322; --sur:#111827; --sur2:#161e30; --line:#1f2a45; --glow:#2a3a66;
  --txt:#e8edf8; --muted:{MUTED_COLOR}; --acc:{ACC_COLOR}; --acc2:{ACC2_COLOR};
  --up:{UP_COLOR}; --down:{DOWN_COLOR}; --warn:{WARN_COLOR}; --gold:{GOLD_COLOR};
}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{
  background:var(--bg);color:var(--txt);
  background-image:linear-gradient(rgba(79,140,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(79,140,255,.04) 1px,transparent 1px);
  background-size:44px 44px;
  font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased;
}}
.mono,.num,.icard-price,.kpi .v,.ladder-count,.bar-val,.sc-metrics .v{{font-family:"Cascadia Code","JetBrains Mono","SF Mono",Consolas,monospace}}
.wrap{{max-width:1140px;margin:0 auto;padding:0 30px 80px}}
h1,h2,h3,h4{{font-weight:600;line-height:1.3;letter-spacing:.3px}}
.up{{color:var(--up)}} .down{{color:var(--down)}} .muted{{color:var(--muted)}} .warn{{color:var(--warn)}}
.glow{{color:var(--acc2)}}

/* ===== 顶栏 ===== */
.topbar{{display:flex;justify-content:space-between;align-items:center;padding:20px 0;border-bottom:1px solid var(--line)}}
.brand{{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600;letter-spacing:1px}}
.brand .logo{{width:9px;height:9px;border-radius:2px;background:linear-gradient(135deg,var(--acc),var(--acc2));box-shadow:0 0 8px rgba(79,140,255,.8)}}
.live{{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted)}}
.live .dot{{width:7px;height:7px;border-radius:50%;background:var(--down);box-shadow:0 0 6px var(--down);animation:pulse 1.8s infinite}}
@keyframes pulse{{0%,100%{{opacity:1}}50%{{opacity:.35}}}}
.topbar .meta{{font-size:12px;color:var(--muted)}}

/* ===== Hero ===== */
.hero{{display:grid;grid-template-columns:1.7fr 1fr;gap:40px;padding:46px 0 34px}}
.hero h1{{font-size:44px;letter-spacing:-1px;line-height:1.15;margin-bottom:16px}}
.hero h1 .grad{{background:linear-gradient(90deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}}
.hero .sub{{font-size:14px;color:var(--muted);max-width:52ch}}
.hero-aside{{display:flex;flex-direction:column;justify-content:center;gap:14px}}
.verdict{{background:var(--sur);border:1px solid var(--line);border-left:2px solid var(--acc);padding:18px 20px;font-size:14px;line-height:1.8}}
.verdict .lbl{{font-size:11px;letter-spacing:2px;color:var(--acc);display:block;margin-bottom:8px}}
.verdict em{{font-style:normal;color:var(--up);font-weight:600}}
.verdict b{{color:var(--txt)}}

/* ===== 关键指标带 ===== */
.kpi-strip{{display:grid;grid-template-columns:repeat(6,1fr);gap:14px;margin-bottom:6px}}
.kpi{{background:var(--sur);border:1px solid var(--line);border-radius:10px;padding:18px 16px;position:relative;overflow:hidden;transition:.25s}}
.kpi:hover{{border-color:var(--glow);box-shadow:0 0 22px rgba(79,140,255,.13)}}
.kpi::before{{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--acc),var(--acc2));opacity:.7}}
.kpi .v{{font-size:30px;font-weight:700;letter-spacing:-.5px}}
.kpi .l{{font-size:11px;color:var(--muted);margin-top:3px;letter-spacing:1px}}
.kpi .v.up{{color:var(--up)}} .kpi .v.down{{color:var(--down)}} .kpi .v.warn{{color:var(--warn)}}

/* ===== Section ===== */
.section{{padding:38px 0;border-bottom:1px solid var(--line)}}
.section-head{{display:flex;align-items:baseline;gap:14px;margin-bottom:22px}}
.section-head .no{{font-family:"Cascadia Code",monospace;font-size:13px;color:var(--acc);letter-spacing:1px}}
.section-head h2{{font-size:24px}}
.section-head .desc{{font-size:12px;color:var(--muted)}}
.section-head .line{{flex:1;height:1px;background:linear-gradient(90deg,var(--line),transparent)}}

/* ===== 指数卡 ===== */
.idx-grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}}
.icard{{background:var(--sur);border:1px solid var(--line);border-radius:10px;padding:16px;transition:.25s}}
.icard:hover{{border-color:var(--glow);box-shadow:0 0 24px rgba(79,140,255,.12);transform:translateY(-2px)}}
.icard-top{{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}}
.icard-name{{font-size:13px;color:var(--muted)}}
.icard-chg{{font-size:14px;font-weight:600}}
.icard-price{{font-size:22px;font-weight:700;letter-spacing:-.5px;margin-bottom:6px}}
.icard-spark{{margin:4px 0 6px}}
.icard-amt{{font-size:11px;color:var(--muted)}}

/* ===== 涨跌家数 ===== */
.breadth{{display:flex;height:38px;border-radius:8px;overflow:hidden;margin-bottom:12px;box-shadow:0 0 20px rgba(0,0,0,.3)}}
.breadth div{{display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600}}
.b-up{{background:linear-gradient(90deg,#b32b3a,var(--up))}}
.b-dn{{background:linear-gradient(90deg,#0f7a55,var(--down))}}
.b-fl{{background:#2a3248;color:var(--muted)}}
.breadth-legend{{display:flex;gap:22px;font-size:12px;color:var(--muted);flex-wrap:wrap}}
.legend-dot{{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;box-shadow:0 0 5px currentColor}}

/* ===== 情绪周期 ===== */
.emotion-card{{background:linear-gradient(150deg,rgba(79,140,255,.08),rgba(79,140,255,.02) 60%),var(--sur);
  border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-top:14px}}
.emotion-head{{display:flex;align-items:baseline;gap:12px;margin-bottom:12px}}
.emotion-stage{{font-size:19px;font-weight:700;letter-spacing:1px}}
.emotion-tag{{font-size:11px;color:var(--acc2);border:1px solid rgba(34,211,238,.35);border-radius:3px;padding:1px 8px;background:rgba(34,211,238,.06)}}
.emotion-sub{{font-size:11px;color:var(--muted);margin-left:auto}}
.emotion-metrics{{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px}}
.em-item{{text-align:center;background:var(--sur2);border:1px solid var(--line);border-radius:8px;padding:9px 4px}}
.em-item .em-v{{display:block;font-size:17px;font-weight:700;font-family:"Cascadia Code",monospace}}
.em-item .em-l{{display:block;font-size:10px;color:var(--muted);margin-top:2px}}
.emotion-advice{{font-size:13px;color:var(--acc2);line-height:1.6;border-top:1px dashed var(--line);padding-top:10px;margin:0}}
.emotion-advice .em-pos{{color:var(--gold)}}
.emotion-gauge{{margin-bottom:12px}}
.gauge-top{{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px}}
.gauge-lbl{{font-size:11px;color:var(--muted);letter-spacing:1px}}
.gauge-val{{font-size:22px;font-weight:700;font-family:"Cascadia Code",monospace;color:var(--acc2)}}
.gauge-val i{{font-style:normal;font-size:12px;color:var(--muted);margin-left:2px}}
.gauge-track{{height:10px;border-radius:5px;background:var(--sur2);overflow:hidden;box-shadow:inset 0 0 6px rgba(0,0,0,.4)}}
.gauge-track i{{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#2bd99f,#ffb454,#ff4d5e);box-shadow:0 0 10px rgba(255,180,84,.5);transition:width .5s}}
.gauge-scale{{display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:4px}}
.risk-row{{display:flex;align-items:center;gap:12px;margin-bottom:12px}}
.risk-lbl{{font-size:11px;color:var(--muted);letter-spacing:1px;white-space:nowrap}}
.risk-track{{flex:1;height:7px;border-radius:4px;background:var(--sur2);overflow:hidden}}
.risk-track i{{display:block;height:100%;border-radius:4px;box-shadow:0 0 8px rgba(255,77,94,.4);transition:width .5s}}
.risk-val{{font-size:15px;font-weight:700;font-family:"Cascadia Code",monospace;width:34px;text-align:right}}
.gauge-scale .gs-on{{color:var(--acc2);font-weight:700}}
.em-factors{{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:6px 0 12px}}
.em-factors-group{{background:var(--sur2);border:1px solid var(--line);border-radius:8px;padding:10px 12px}}
.em-factors-title{{font-size:10px;color:var(--acc);letter-spacing:1px;margin-bottom:6px}}
.em-f{{display:grid;grid-template-columns:84px 1fr 28px;gap:9px;align-items:center;padding:3px 0}}
.em-f-lbl{{font-size:11px;color:var(--muted);text-align:right;white-space:nowrap}}
.em-f-lbl i{{font-style:normal;color:var(--muted);opacity:.65;margin-left:2px}}
.em-f-track{{height:6px;border-radius:3px;background:var(--sur);overflow:hidden}}
.em-f-track i{{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,var(--acc),var(--acc2))}}
.em-f-track.warm i{{background:linear-gradient(90deg,var(--warn),var(--up))}}
.em-f-v{{font-size:11px;font-family:"Cascadia Code",monospace;text-align:right}}
.pos-bar{{display:flex;align-items:center;gap:10px;margin:4px 0 12px}}
.pos-bar-lbl{{font-size:11px;color:var(--muted);letter-spacing:1px;white-space:nowrap}}
.pos-bar-track{{position:relative;flex:1;height:10px;border-radius:5px;background:var(--sur2);overflow:hidden;box-shadow:inset 0 0 6px rgba(0,0,0,.4)}}
.pos-bar-track i{{position:absolute;top:0;height:100%;border-radius:5px;background:linear-gradient(90deg,var(--gold),var(--warn));box-shadow:0 0 8px rgba(245,196,81,.45)}}
.pos-bar-val{{font-size:13px;font-weight:700;font-family:"Cascadia Code",monospace;color:var(--gold);white-space:nowrap}}

/* ===== 连板 ===== */
.ladder{{display:flex;flex-direction:column;gap:10px}}
.ladder-row{{display:grid;grid-template-columns:52px 56px 1fr;gap:14px;align-items:center}}
.ladder-lv{{font-family:"Cascadia Code",monospace;font-weight:700;font-size:15px}}
.lv-5,.lv-4{{color:var(--up);text-shadow:0 0 10px rgba(255,77,94,.5)}}
.lv-3{{color:var(--warn)}} .lv-2{{color:var(--acc)}} .lv-1{{color:var(--muted)}}
.ladder-count{{font-size:19px;font-weight:700}}
.ladder-bar{{height:16px;background:var(--sur2);border-radius:4px;overflow:hidden}}
.ladder-bar i{{display:block;height:100%;background:linear-gradient(90deg,var(--acc),var(--acc2));box-shadow:0 0 12px rgba(79,140,255,.5)}}
.ladder-names{{grid-column:2/4;font-size:12px;color:var(--muted);padding-bottom:8px;border-bottom:1px dashed var(--line)}}

/* ===== 主线 + 词频 ===== */
.line-item{{display:flex;gap:16px;padding:13px 0;border-bottom:1px solid var(--line)}}
.line-item:last-child{{border-bottom:none}}
.line-no{{font-family:"Cascadia Code",monospace;font-size:18px;color:var(--acc);width:34px}}
.line-body h4{{font-size:15px;margin-bottom:3px}}
.line-body p{{font-size:12px;color:var(--muted)}}
.two-col{{display:grid;grid-template-columns:1fr 1fr;gap:36px}}
.bar-row{{display:grid;grid-template-columns:112px 1fr 32px;gap:12px;align-items:center;padding:6px 0}}
.bar-label{{font-size:12px;color:var(--muted);text-align:right}}
.bar-track{{height:9px;background:var(--sur2);border-radius:3px;overflow:hidden}}
.bar-track i{{display:block;height:100%;background:linear-gradient(90deg,var(--acc),var(--acc2));box-shadow:0 0 8px rgba(79,140,255,.4)}}
.bar-track i.accent{{background:linear-gradient(90deg,var(--down),var(--acc2))}}
.bar-val{{font-size:13px;font-weight:600}}

/* ===== 政策 ===== */
.policy{{padding:18px 0;border-bottom:1px solid var(--line)}}
.policy:last-child{{border-bottom:none}}
.policy-head{{display:flex;align-items:baseline;gap:14px}}
.policy-no{{font-family:"Cascadia Code",monospace;font-size:20px;color:var(--acc);width:28px}}
.policy-head h4{{font-size:16px;flex:1}}
.policy-star{{font-size:11px;color:var(--gold)}}
.policy-meta{{margin:7px 0 5px 42px}}
.tag{{display:inline-block;font-size:11px;color:var(--acc2);border:1px solid rgba(34,211,238,.35);border-radius:3px;padding:1px 8px;background:rgba(34,211,238,.06)}}
.policy-impact{{font-size:13px;color:var(--txt);margin-left:42px;line-height:1.7}}

/* ===== 板块 ===== */
.sector{{padding:20px 0;border-bottom:1px solid var(--line)}}
.sector:last-child{{border-bottom:none}}
.sector-head{{display:flex;align-items:baseline;gap:14px}}
.sector-rank{{font-family:"Cascadia Code",monospace;font-size:24px;color:var(--acc);width:28px;text-shadow:0 0 12px rgba(79,140,255,.6)}}
.sector-head h4{{font-size:18px}}
.sector-star{{font-size:12px;color:var(--gold);margin-left:auto}}
.sector-logic{{font-size:12px;color:var(--muted);margin:7px 0 13px 42px;line-height:1.7}}
.chips{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-left:42px}}
.chip{{background:var(--sur);border:1px solid var(--line);border-radius:8px;padding:10px 12px;transition:.2s}}
.chip:hover{{border-color:var(--glow)}}
.chip b{{display:block;font-size:13px}}
.chip span{{font-size:10px;color:var(--muted);font-family:"Cascadia Code",monospace}}
.chip em{{display:block;font-style:normal;font-size:11px;color:var(--acc);margin-top:3px}}

/* ===== 个股 ===== */
.sc-grid{{display:grid;grid-template-columns:1fr 1fr;gap:14px}}
.sc{{background:var(--sur);border:1px solid var(--line);border-radius:10px;padding:16px 18px;transition:.25s;position:relative;overflow:hidden}}
.sc:hover{{border-color:var(--glow);box-shadow:0 0 22px rgba(79,140,255,.12)}}
.sc::before{{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--acc),var(--acc2));opacity:.5}}
.sc-head{{display:flex;align-items:baseline;gap:8px;margin-bottom:5px}}
.sc-head b{{font-size:15px}}
.sc-code{{font-size:11px;color:var(--muted);font-family:"Cascadia Code",monospace}}
.sc-badge{{font-size:10px;padding:1px 8px;border-radius:3px;margin-left:auto}}
.sc-badge.hot{{color:var(--up);background:rgba(255,77,94,.1);border:1px solid rgba(255,77,94,.35)}}
.sc-badge.track{{color:var(--warn);background:rgba(255,180,84,.08);border:1px solid rgba(255,180,84,.3)}}
.sc-theme{{font-size:11px;color:var(--acc);margin-bottom:9px}}
.sc-metrics{{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-bottom:8px}}
.sc-metrics .k{{display:block;font-size:10px;color:var(--muted)}}
.sc-metrics .v{{display:block;font-size:14px;font-weight:600}}
.sc-level{{font-size:11px;color:var(--muted)}}
.sc a.sc-hd{{display:flex;align-items:baseline;gap:8px;color:var(--txt);text-decoration:none}}
.sc a.sc-hd:hover b{{color:var(--acc2)}}
.sc-more{{display:inline-block;margin-top:9px;font-size:11px;color:var(--acc2);text-decoration:none}}
.sc-more:hover{{text-decoration:underline}}

/* ===== 表格 ===== */
table{{width:100%;border-collapse:collapse;font-size:13px}}
th{{text-align:left;font-size:11px;font-weight:500;color:var(--muted);padding:8px 10px;border-bottom:1px solid var(--glow);letter-spacing:.5px}}
td{{padding:8px 10px;border-bottom:1px solid var(--line)}}
tr:hover td{{background:rgba(79,140,255,.03)}}
.tbl-cols{{display:grid;grid-template-columns:1fr 1fr;gap:36px}}

footer{{padding:34px 0 0;font-size:11px;color:var(--muted);line-height:1.8}}
footer .disc{{margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}}

@media(max-width:860px){{
  .hero{{grid-template-columns:1fr}}
  .hero h1{{font-size:34px}}
  .kpi-strip{{grid-template-columns:repeat(3,1fr)}}
  .idx-grid{{grid-template-columns:repeat(2,1fr)}}
  .two-col,.tbl-cols,.sc-grid{{grid-template-columns:1fr}}
  .chips{{grid-template-columns:repeat(2,1fr)}}
  .emotion-metrics{{grid-template-columns:repeat(3,1fr)}}
  .em-factors{{grid-template-columns:1fr}}
  .emotion-sub{{display:none}}
}}
</style>
</head>
<body>
<div class="wrap">

<div class="topbar">
  <span class="brand"><span class="logo"></span>MARKET·TERMINAL</span>
  <span class="live"><span class="dot"></span>数据已同步 {TRADE_DATE} 收盘</span>
  <span class="meta">两市成交 <span class="glow">{total_amt:,.0f}</span> 亿元</span>
</div>

<div class="hero">
  <div>
    <h1>A股行情复盘<br><span class="grad">MARKET DAILY REVIEW</span></h1>
    <p class="sub">{sub}</p>
  </div>
  <div class="hero-aside">
    <div class="verdict"><span class="lbl">今日定调 · VERDICT</span>{verdict}</div>
  </div>
</div>

<div class="kpi-strip">
  <div class="kpi"><div class="v up">{total_up}</div><div class="l">涨停 LIMIT-UP</div></div>
  <div class="kpi"><div class="v warn">{total_zb}</div><div class="l">炸板 BROKEN</div></div>
  <div class="kpi"><div class="v down">{total_dn}</div><div class="l">跌停 LIMIT-DN</div></div>
  <div class="kpi"><div class="v">{seal_rate}%</div><div class="l">封板率 SEAL</div></div>
  <div class="kpi"><div class="v">{max_lbc}板</div><div class="l">连板高度 TOP</div></div>
  <div class="kpi"><div class="v">{up_ratio}</div><div class="l">涨跌比 RATIO</div></div>
</div>

<div class="section">
  <div class="section-head"><span class="no">01</span><h2>核心指数</h2><span class="desc">近 30 日走势</span><span class="line"></span></div>
  <div class="idx-grid">{idx_cards}</div>
</div>

<div class="section">
  <div class="section-head"><span class="no">02</span><h2>市场情绪</h2><span class="desc">涨跌分布</span><span class="line"></span></div>
  <div class="breadth">
    <div class="b-up" style="width:{up_pct}%">{breadth["up"]}↑</div>
    <div class="b-dn" style="width:{dn_pct}%">{breadth["down"]}↓</div>
    <div class="b-fl" style="width:{fl_pct}%">{breadth["flat"]}</div>
  </div>
  <div class="breadth-legend">
    <span><span class="legend-dot" style="background:var(--up)"></span>上涨 {breadth["up"]}</span>
    <span><span class="legend-dot" style="background:var(--down)"></span>下跌 {breadth["down"]}</span>
    <span><span class="legend-dot" style="background:#2a3248"></span>平盘 {breadth["flat"]}</span>
    <span>涨停/跌停 {total_up}:{total_dn} · 炸板率 {break_rate}%</span>
  </div>

  {emotion_html}
</div>

<div class="section">
  <div class="section-head"><span class="no">03</span><h2>连板梯队</h2><span class="desc">最高 {max_lbc} 板{gap_short}</span><span class="line"></span></div>
  <div class="ladder">{ladder_rows}</div>
</div>

<div class="section">
  <div class="section-head"><span class="no">04</span><h2>主线题材</h2><span class="desc">热度 + 行业分布</span><span class="line"></span></div>
  <div style="margin-bottom:26px">{main_lines_html}</div>
  <div class="two-col">
    <div><h3 style="font-size:14px;margin-bottom:14px;color:var(--acc)">动态热点得分</h3>{theme_rows}</div>
    <div><h3 style="font-size:14px;margin-bottom:14px;color:var(--acc)">涨停行业分布</h3>{hy_rows}</div>
  </div>
</div>

<div class="section">
  <div class="section-head"><span class="no">05</span><h2>重点政策 / 消息</h2><span class="desc">核心催化 Top5</span><span class="line"></span></div>
  {policy_html}
</div>

<div class="section">
  <div class="section-head"><span class="no">06</span><h2>热点可持续性板块</h2><span class="desc">政策+基本面+资金多维</span><span class="line"></span></div>
  {sector_html}
</div>

<div class="section">
  <div class="section-head"><span class="no">07</span><h2>个股推荐</h2><span class="desc">仅主板 · ST 已排除 · 观察评级</span><span class="line"></span></div>
  <h3 style="font-size:14px;margin:4px 0 12px;color:var(--acc)">① 主板首板 · 低位突破</h3>
  <div class="sc-grid">{first_cards}</div>
  <h3 style="font-size:14px;margin:24px 0 12px;color:var(--acc)">② 主板突破 · 放量 · 热点</h3>
  <div class="sc-grid">{break_cards}</div>
</div>

<div class="section">
  <div class="section-head"><span class="no">08</span><h2>涨跌幅榜 & 炸板</h2><span class="desc">全市场 TOP</span><span class="line"></span></div>
  <div class="tbl-cols">
    <div>
      <h3 style="font-size:14px;margin-bottom:12px;color:var(--up)">涨幅榜 TOP10</h3>
      <table><tr><th>名称</th><th>代码</th><th>涨幅</th></tr>{gain_html}</table>
      <h3 style="font-size:14px;margin:24px 0 12px;color:var(--down)">跌幅榜 TOP10</h3>
      <table><tr><th>名称</th><th>代码</th><th>跌幅</th></tr>{loss_html}</table>
    </div>
    <div>
      <h3 style="font-size:14px;margin-bottom:12px;color:var(--warn)">炸板个股（{total_zb} 只 · 炸板率 {break_rate}%）</h3>
      <table><tr><th>名称</th><th>行业</th><th>炸板</th><th>收盘</th></tr>{zb_rows}</table>
    </div>
  </div>
</div>

<footer>
  <p>数据来源：公开行情数据（腾讯财经、东方财富、同花顺、新浪财经）聚合整理，数据截至 {TRADE_DATE} 收盘。盘中数据可能滞后，涨停/封板状态以交易所收盘为准。</p>
  <p class="disc">以上分析基于公开数据，仅供复盘参考，不构成投资建议。股市有风险，投资需谨慎。</p>
</footer>

</div>
</body>
</html>'''

out = os.path.join(REPORT_ROOT, f"行情复盘_{TD}.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("科技感报告已生成:", out)
print(f"指数 {len(indexes)} 卡(sparkline) | 涨停{total_up} | 封板率{seal_rate}% | 涨跌 {breadth['up']}/{breadth['down']}")
