# -*- coding: utf-8 -*-
"""Markdown 版本：A股行情复盘报告生成。"""
import os
import argparse
from datetime import datetime
from collections import Counter

from _common import (REPORT_ROOT, BASE, DATA_DIR, load_json as _load_json, safe_float,
                     UP_COLOR, DOWN_COLOR, WARN_COLOR, MUTED_COLOR,
                     GOLD_COLOR, ACC_COLOR, ACC2_COLOR,
                     EMOTION_STAGES, EMOTION_STAGE_COLORS,
                     TEMPERATURE_W, RISK_W, TEMP_FACTOR_LABELS, RISK_FACTOR_LABELS,
                     today_ymd, seal_break_rates,
                     bridge_ths_name, boards_chg_lookup, trend_tag, BOARD_FALLBACK_COLOR)

ap = argparse.ArgumentParser(description="A股行情复盘报告生成（默认真实今日）")
ap.add_argument("--date", default=today_ymd(),
                help="目标交易日 YYYYMMDD，默认取真实今日")
_args = ap.parse_args()
TD = _args.date
TRADE_DATE = f"{TD[:4]}-{TD[4:6]}-{TD[6:8]}"
_td_dt = datetime.strptime(TRADE_DATE, "%Y-%m-%d")
WEEK_CN = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"][_td_dt.weekday()]

d = _load_json(os.path.join(DATA_DIR, f"market_{TD}.json"), {})
rec = _load_json(os.path.join(DATA_DIR, f"recommend_{TD}.json"), {})

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
hot_sectors_path = os.path.join(DATA_DIR, f"hot_sectors_{TD}.json")
lifecycle_path = os.path.join(DATA_DIR, f"theme_lifecycle_{TD}.json")

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
    news = _load_json(os.path.join(DATA_DIR, f"news_{td}.json"))
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

def s(v):
    try: v = float(v)
    except: return str(v)
    return f"{v:+.2f}%" if abs(v) < 100 else f"{v:+.1f}%"

def fmt_px(v): return f"{v:,.2f}"

_total = breadth.get("total") or 0
up_pct = round(breadth["up"] / _total * 100, 1) if _total else 0
dn_pct = round(breadth["down"] / _total * 100, 1) if _total else 0
fl_pct = round(100 - up_pct - dn_pct, 1)

lu_sorted = sorted(lu, key=lambda z: -z.get("lbc", 0))

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
verdict = f'{lead_idx["name"]} **{s(lead_idx["change_pct"])}** 领涨，全市场 **涨 {breadth["up"]} · 跌 {breadth["down"]}**，封板率 {seal_rate}%。连板高度 {max_lbc} 板{gap_short}，**{mood}**，宜聚焦主线、控制追高。'

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
_TEMP_W = TEMPERATURE_W
_RISK_W = RISK_W
_TEMP_LBL = TEMP_FACTOR_LABELS
_RISK_LBL = RISK_FACTOR_LABELS

def _factor_rows(factors, weights, labels):
    lines = [f"  - {lbl}（权重 {weights.get(k, 0) * 100:.0f}%）：{factors.get(k, 0) or 0:.0f}" for k, lbl in labels.items()]
    return "\n".join(lines)

emotion_path = os.path.join(DATA_DIR, f"emotion_{TD}.json")
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
    em_metrics_md = " · ".join(f"**{v}** {lbl}" for v, lbl in em_items)
    em_factors_md = ""
    if _tf or _rf:
        em_factors_md = ("- 温度因子（权重加权）：\n" + _factor_rows(_tf, _fw, _TEMP_LBL)
                         + "\n- 风险因子（权重加权）：\n" + _factor_rows(_rf, _rw, _RISK_LBL))
    pos_md = ""
    if _pmin is not None and _pmax is not None:
        try:
            _lo = max(0.0, min(10.0, float(_pmin)))
            _hi = max(_lo, min(10.0, float(_pmax)))
        except (TypeError, ValueError):
            _lo = _hi = None
        if _lo is not None:
            pos_md = f"- 仓位建议：**{position or (f'{_lo:.0f}-{_hi:.0f}成')}**"
    emotion_md = f"### 情绪周期 · Model 04\n\n- 情绪定调：**{stage_tone}**（阶段：{stage}）\n- 情绪温度：**{_temp:.0f}** · 风险：**{_risk:.0f}**\n- 核心指标：{em_metrics_md}"
    if em_factors_md:
        emotion_md += f"\n\n{em_factors_md}"
    if pos_md:
        emotion_md += f"\n{pos_md}"
    if stage_advice:
        emotion_md += f"\n\n> {stage_advice}"
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
    emotion_md = f"### 情绪周期\n\n- 情绪定调：**{stage_tone}**（阶段：{stage}）\n- 核心指标：**{total_up}** 涨停数 · **{max_lbc}板** 连板高度 · **{lianban_cnt}** 连板家数 · **{seal_rate}%** 封板率 · **{break_rate}%** 炸板率\n\n> {stage_advice}"

# ===== 近一月板块轮动（Markdown，替代原 gen_rotation_columns.py 的 HTML 注入） =====
def _build_rotation_md(td):
    """从 rotation_{td}.json + boards_15d.json + zt_15d.json 渲染「近一月板块轮动」Markdown 章节。"""
    rot = _load_json(os.path.join(DATA_DIR, f"rotation_{td}.json"), {})
    boards = _load_json(os.path.join(DATA_DIR, "boards_15d.json"), {})
    zt_all = _load_json(os.path.join(DATA_DIR, "zt_15d.json"), {})
    lines = []

    # ---- 轮动矩阵：日期为列，每日 Top7 板块（涨幅 + 涨停数） ----
    all_dates = set()
    for v in boards.values():
        for d_, _ in v:
            all_dates.add(d_)
    dates = sorted(all_dates, reverse=True)[:10]

    def daily_top7(date):
        rows = []
        for name, daily in boards.items():
            kv = dict(daily)
            if date in kv:
                rows.append((name, kv[date]))
        rows.sort(key=lambda x: -x[1])
        return rows[:7]

    lines.append("### 板块轮动矩阵（近 10 日 Top7）\n")
    if dates:
        head = "| 排名 | " + " | ".join(f"{d_[4:6]}-{d_[6:]}" for d_ in dates) + " |"
        sep = "| --- | " + " | ".join(["---"] * len(dates)) + " |"
        lines.append(head)
        lines.append(sep)
        for rank in range(7):
            cells = [f"Top{rank+1}"]
            for d_ in dates:
                top7 = daily_top7(d_)
                if rank < len(top7):
                    name, chg = top7[rank]
                    zt = zt_all.get(d_, {}).get(name, 0)
                    if not zt:
                        ths = bridge_ths_name(name)
                        if ths:
                            zt = zt_all.get(d_, {}).get(ths, 0)
                    zt_s = f" ×{zt}" if zt else ""
                    cells.append(f"{name} {chg:+.1f}%{zt_s}")
                else:
                    cells.append("—")
            lines.append("| " + " | ".join(cells) + " |")
        lines.append("")
    else:
        lines.append("板块轮动数据暂缺。\n")

    # ---- 资金轮动四象限（rotation_{td}.json） ----
    quad = rot.get("quadrants", {})
    Q_CN = [("mainline", "主线", "资金净流入 + 趋势一致，持续性最强，中线可跟踪"),
            ("relay", "接力", "资金净流入但趋势未确认 / 新热点，短线博弈为主"),
            ("pulse", "脉冲", "资金流出但当日仍上涨，短促冲高，追高需谨慎"),
            ("fade", "退潮", "资金流出 + 走势转弱，回避或逢高减仓")]
    lines.append("### 资金轮动四象限\n")
    has_quad = any(quad.get(k) for k, _, _ in Q_CN)
    if has_quad:
        for key, cn, desc in Q_CN:
            items = quad.get(key, []) or []
            if not items:
                continue
            names = "、".join(f"{x['name']}（{x.get('fund_net_yi', 0):+.1f}亿 / {x.get('chg_pct', 0):+.1f}%）" for x in items[:6])
            lines.append(f"- **{cn}**（{len(items)}）：{names}")
        lines.append("")
    else:
        lines.append("资金轮动数据暂缺。\n")

    # ---- 板块多因子趋势榜 ----
    trend_board = rot.get("trend_board", [])
    lines.append("### 板块多因子趋势榜（15日40% · 5日30% · 资金20% · 涨停10%）\n")
    if trend_board:
        lines.append("| # | 板块 | 趋势分 | 5日 | 15日 | 状态 |")
        lines.append("|---|---|---|---|---|---|")
        for i, t in enumerate(trend_board[:16], 1):
            lines.append(f"| {i} | {t.get('name','')} | {t.get('trend_score',0):.2f} | "
                         f"{t.get('cum5',0):+.1f}% | {t.get('cum15',0):+.1f}% | {t.get('tag','') or '—'} |")
        lines.append("")
    else:
        lines.append("趋势榜数据暂缺。\n")

    lines.append("> 涨幅数据来自东方财富行业+概念板块指数（近 15 日逐日涨跌）；涨停家数按概念板块关键词从涨停池匹配。")
    return "\n".join(lines)

rotation_md = _build_rotation_md(TD)

# ================= Markdown 报告 =================
def _md_table(header, rows):
    head = "| " + " | ".join(header) + " |"
    sep = "| " + " | ".join(["---"] * len(header)) + " |"
    return "\n".join([head, sep] + rows)

index_rows = [f"| {x['name']} | {s(x['change_pct'])} | {fmt_px(x['price'])} | {x['amount_yi']:,.0f} 亿 |" for x in indexes]
index_table = _md_table(["名称", "涨跌幅", "收盘价", "成交额"], index_rows)

ladder_rows = []
for k, v in ladder:
    names = "、".join(x["name"] for x in lu_sorted if x.get("lbc", 0) == k)
    ladder_rows.append(f"| {k}板 | {v} | {names} |")
ladder_table = _md_table(["板数", "家数", "个股"], ladder_rows)

main_lines_md = "\n".join(f"{i}. **{n}** — {desc}" for i, (n, desc) in enumerate(main_lines, 1)) or "暂无主线题材"

theme_rows = []
for hs in _hot_sectors:
    _stage = _life_themes.get(hs["name"], {}).get("stage", "")
    theme_rows.append(f"| {hs['name']} | {hs['score']:.2f} | {_stage} |")
theme_table = _md_table(["题材", "得分", "阶段"], theme_rows)

hy_rows = [f"| {k} | {v} |" for k, v in hy_counter.most_common(8)]
hy_table = _md_table(["行业", "涨停家数"], hy_rows)

policy_lines = []
for no, title, tag, star, impact, meta in policies:
    policy_lines.append(f"{no}. **{title}** {star}（{tag} · {meta}）\n   - {impact}")
policy_md = "\n".join(policy_lines) if policy_lines else "暂无重点政策"

sector_lines = []
for no, name, star, logic, stocks in hot_sectors:
    stocks_md = "、".join(f"{sn}（{sc}）" for sn, sc, st in stocks)
    sector_lines.append(f"{no}. **{name}** {star} — {logic}\n   - 关联涨停：{stocks_md}")
sector_md = "\n".join(sector_lines) if sector_lines else "暂无热点板块"

def stock_lines(picks, source):
    lines = []
    for code, theme, rating in picks:
        m = source.get(code)
        if not m:
            continue
        sup = m.get("ma21") or m.get("ma6") or 0
        res = m.get("high250") or 0
        dd = m.get("drawdown")
        dd_text = f"-{dd}%" if dd is not None else "—"
        _nm = m.get("name", "")
        _diag_file = f"{_nm}_个股诊断-{TRADE_DATE}.md"
        if os.path.exists(os.path.join(REPORT_ROOT, _diag_file)):
            name_md = f"[{_nm}]({_diag_file})"
        else:
            name_md = _nm
        lines.append(f"- **{name_md}**（{code}）· {rating} · {theme}\n"
                     f"  - 现价 {fmt_px(m.get('price'))} · 涨幅 {m.get('chg_pct'):+.1f}% · 回撤 {dd_text} · 量比 {m.get('vol_ratio')}\n"
                     f"  - 支撑 {fmt_px(sup)} · 压力 {fmt_px(res)}")
    return "\n".join(lines) if lines else "暂无推荐"
first_cards = stock_lines(first_pick, fb_map)
break_cards = stock_lines(break_pick, gb_map)

gain_rows = [f"| {r.get('name', '')} | {r.get('code', '')} | {s(r.get('chg'))} |" for r in (breadth.get("top_gainers") or [])[:10]]
loss_rows = [f"| {r.get('name', '')} | {r.get('code', '')} | {s(r.get('chg'))} |" for r in (breadth.get("top_losers") or [])[:10]]
gain_table = _md_table(["名称", "代码", "涨幅"], gain_rows)
loss_table = _md_table(["名称", "代码", "跌幅"], loss_rows)
zb_rows = [f"| {x['name']} | {x['hybk']} | 炸{x['zbc']}次 | {s(x['chg_pct'])} |" for x in zb[:14]]
zb_table = _md_table(["名称", "行业", "炸板", "收盘"], zb_rows)

md = f"""# A股行情复盘 · {TRADE_DATE}

{sub}

> **今日定调**：{verdict}

## 关键指标

| 指标 | 数值 |
| --- | --- |
| 涨停 | {total_up} |
| 炸板 | {total_zb} |
| 跌停 | {total_dn} |
| 封板率 | {seal_rate}% |
| 连板高度 | {max_lbc} 板 |
| 涨跌比 | {up_ratio} |
| 两市成交 | {total_amt:,.0f} 亿 |

## 01 核心指数

{index_table}

## 02 市场情绪

- 上涨 **{breadth['up']}** 家（{up_pct}%）· 下跌 **{breadth['down']}** 家（{dn_pct}%）· 平盘 **{breadth['flat']}** 家（{fl_pct}%）
- 涨停 / 跌停：{total_up} / {total_dn} · 炸板率 {break_rate}%

{emotion_md}

## 03 连板梯队

{ladder_table}

## 04 主线题材

{main_lines_md}

### 动态热点得分

{theme_table}

### 涨停行业分布

{hy_table}

## 05 重点政策 / 消息

{policy_md}

## 06 热点可持续性板块

{sector_md}

## 07 近一月板块轮动

{rotation_md}

## 08 个股推荐

### ① 主板首板 · 低位突破

{first_cards}

### ② 主板突破 · 放量 · 热点

{break_cards}

## 09 涨跌幅榜 & 炸板

### 涨幅榜 TOP10

{gain_table}

### 跌幅榜 TOP10

{loss_table}

### 炸板个股（{total_zb} 只 · 炸板率 {break_rate}%）

{zb_table}

---

> 数据来源：公开行情数据（腾讯财经、东方财富、同花顺、新浪财经）聚合整理，数据截至 {TRADE_DATE} 收盘。盘中数据可能滞后，涨停/封板状态以交易所收盘为准。
>
> 以上分析基于公开数据，仅供复盘参考，不构成投资建议。股市有风险，投资需谨慎。
"""

out = os.path.join(REPORT_ROOT, f"行情复盘-{TRADE_DATE}.md")
with open(out, "w", encoding="utf-8") as f:
    f.write(md)
print("Markdown 复盘报告已生成:", out)
print(f"指数 {len(indexes)} | 涨停{total_up} | 封板率{seal_rate}% | 涨跌 {breadth['up']}/{breadth['down']}")
