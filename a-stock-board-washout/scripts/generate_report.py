# -*- coding: utf-8 -*-
"""渲染「首板炸板洗盘」Markdown 报告（内联 SVG 图表）。

数据：data/screen_{T}.json（含 strategy1/strategy2 各 Top 6 + 画像）
输出：{OUT_DIR}/首板炸板洗盘-{T}.md（含第二日操作建议 + 内联 K线/量能/分时 SVG）
"""
import os
import argparse

from _common import OUT_DIR, load_json, data_path, UP_COLOR, DOWN_COLOR, WARN_COLOR, \
    MUTED_COLOR, GOLD_COLOR, ACC_COLOR, ACC2_COLOR, fmt_dash

ap = argparse.ArgumentParser(description="渲染首板洗盘选股 Markdown 报告")
ap.add_argument("--date", default=None)
_args = ap.parse_args()


def resolve_target():
    import glob
    if _args.date:
        return _args.date
    files = sorted(glob.glob(data_path("screen_*.json")))
    if not files:
        raise SystemExit("!! 未找到 screen_*.json，请先跑 screen_washout.py")
    return files[-1].split("screen_")[-1].split(".")[0]


# ================= SVG 生成 =================
def kline_svg(klines, n=60, w=560, h=210):
    if len(klines) < 3:
        return '<svg viewBox="0 0 560 210" width="100%%"><text x="10" y="20" fill="#7b89a8">K线数据暂缺</text></svg>'
    kl = klines[-n:]
    lo = min(k["l"] for k in kl)
    hi = max(k["h"] for k in kl)
    pad = 8
    rng = (hi - lo) or 0.01
    in_top = 20
    plot_h = h - in_top - 8

    def Y(v):
        return in_top + (hi - v) / rng * plot_h

    def X(i):
        return 12 + i * (w - 24) / (len(kl) - 1)

    body_w = max((w - 24) / len(kl) * 0.55, 1.5)
    bars = []
    for i, k in enumerate(kl):
        up = k["c"] >= k["o"]
        col = UP_COLOR if up else DOWN_COLOR
        x = X(i)
        # 影线
        bars.append(f'<line x1="{x:.1f}" y1="{Y(k["h"]):.1f}" x2="{x:.1f}" y2="{Y(k["l"]):.1f}" stroke="{col}" stroke-width="1"/>')
        yo, yc = Y(k["o"]), Y(k["c"])
        top = min(yo, yc)
        bh = abs(yc - yo) or 0.8
        bars.append(f'<rect x="{x - body_w / 2:.1f}" y="{top:.1f}" width="{body_w:.1f}" height="{bh:.1f}" fill="{col}" rx="0.6"/>')

    # MA 线
    lines = ""
    for n_, col in ((5, GOLD_COLOR), (10, ACC2_COLOR), (20, ACC_COLOR)):
        pts = []
        for i in range(len(kl)):
            seg = kl[max(0, len(kl) - n_) : len(kl) - (len(kl) - 1 - i)]
            # 用全局 index 逐点算均线
            gi = len(klines) - (len(kl) - i)
            seg2 = klines[max(0, gi - n_ + 1): gi + 1]
            if len(seg2) == n_:
                avg = sum(k["c"] for k in seg2) / n_
                pts.append(f'{X(i):.1f},{Y(avg):.1f}')
        if pts:
            lines += f'<polyline points="{" ".join(pts)}" fill="none" stroke="{col}" stroke-width="1.1" opacity="0.9"/>'

    last = kl[-1]
    last_col = UP_COLOR if last["c"] >= last["o"] else DOWN_COLOR
    lbl = f'<text x="0" y="{Y(last["h"]) - 4}" fill="{last_col}" font-size="11">{last["c"]:.2f}</text>'
    return (
        f'<svg viewBox="0 0 {w} {h}" width="100%">'
        + "".join(bars) + lines + lbl +
        f'</svg>'
    )


def volume_svg(klines, n=60, w=560, h=66):
    if len(klines) < 3:
        return '<svg viewBox="0 0 560 66" width="100%"></svg>'
    kl = klines[-n:]
    vmax = max(k["v"] for k in kl) or 0.01
    bw = max((w - 24) / len(kl) * 0.55, 1.5)
    bars = []
    for i, k in enumerate(kl):
        col = UP_COLOR if k["c"] >= k["o"] else DOWN_COLOR
        bh = k["v"] / vmax * (h - 10)
        x = 12 + i * (w - 24) / (len(kl) - 1)
        bars.append(f'<rect x="{x - bw / 2:.1f}" y="{h - bh - 4:.1f}" width="{bw:.1f}" height="{bh:.1f}" fill="{col}" opacity="0.55"/>')
    bars.append(f'<text x="8" y="{h - 2}" fill="#7b89a8" font-size="10">量</text>')
    return f'<svg viewBox="0 0 {w} {h}" width="100%">{"".join(bars)}</svg>'


def fenshi_svg(minute_rows, prev_close, limit_up=None, w=560, h=250):
    """分时图：价格线 + 均价线 + 底部量柱 + 昨收虚线(+涨停虚线)。"""
    tail = '<svg viewBox="0 0 560 250" width="100%">'
    if not minute_rows:
        tail += '<g><rect x="12" y="12" width="536" height="160" rx="6" fill="#0d1424"/><text x="24" y="70" fill="#7b89a8" font-size="13">分时数据暂缺</text></g>'
    else:
        rows = minute_rows
        ps = [m["p"] for m in rows]
        avgs = [m.get("avg") for m in rows]
        lo, hi = min(ps), max(max(ps), max([a for a in avgs if a] or [0.0]))
        pad = 8
        area_h = 176 - 18
        top0 = 18
        lo_ = lo
        hi_ = hi or lo + 0.01
        if hi_ - lo_ < 0.01:
            hi_ = lo_ + 0.01
        rng = hi_ - lo_

        def Y(v):
            return top0 + (hi_ - v) / rng * area_h

        def X(i):
            return 12 + i * (w - 24) / (len(rows) - 1)

        # 昨收参考线
        if prev_close:
            if lo_ <= prev_close <= hi_ or True:
                y = Y(prev_close)
                col = "#5a6b8f"
                tail += f'<line x1="12" y1="{y:.1f}" x2="{w - 12}" y2="{y:.1f}" stroke="{col}" stroke-width="1" stroke-dasharray="4,4"/>'
                tail += f'<text x="{w - 80}" y="{y - 3}" fill="{col}" font-size="10">昨收 {prev_close:.2f}</text>'
        # 涨停参考线
        if limit_up and (hi_ * 0.98 <= limit_up <= hi_ * 1.02):
            y = Y(limit_up)
            tail += f'<line x1="12" y1="{y:.1f}" x2="{w - 12}" y2="{y:.1f}" stroke="{UP_COLOR}" stroke-width="1" stroke-dasharray="4,4" opacity="0.7"/>'
            tail += f'<text x="{w - 80}" y="{y - 3}" fill="{UP_COLOR}" font-size="10">涨停 {limit_up:.2f}</text>'

        # 价格线 + 面积
        line = []
        for i, m in enumerate(rows):
            line.append(f'{X(i):.1f},{Y(m["p"]):.1f}')
        last_p = rows[-1]["p"]
        col = UP_COLOR if (prev_close and last_p >= prev_close) or not prev_close else DOWN_COLOR
        pts = " ".join(line)
        tail += (f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>')
        # 均价线
        av_pts = [f'{X(i):.1f},{Y(a):.1f}' for i, a in enumerate(avgs) if a]
        if len(av_pts) > 1:
            tail += f'<polyline points="{" ".join(av_pts)}" fill="none" stroke="#f5c451" stroke-width="1.1" stroke-dasharray="2,2"/>'
        # 底部量柱
        vmax = max(m["v"] for m in rows) or 0.01
        vbottom = 176
        vh = h - 210
        vcol = UP_COLOR if (prev_close and last_p >= prev_close) or not prev_close else DOWN_COLOR
        for i, m in enumerate(rows):
            bh = m["v"] / vmax * vh
            bw = (w - 24) / len(rows) * 0.6
            x = X(i)
            tail += f'<rect x="{x - bw / 2:.1f}" y="{vbottom + vh - bh:.1f}" width="{bw:.1f}" height="{bh:.1f}" fill="{vcol}" opacity="0.5"/>'
    tail += '</svg>'
    return tail


# ================= Markdown 渲染 =================
def _gate_miss(x):
    hmap = {"liutong": "流通市值", "turnover": "换手", "amount": "成交额", "vol_ratio": "量比"}
    hits = [k for k, ok in x.get("gate", {}).get("checks", {}).items() if not ok]
    return "、".join(hmap.get(h, h) for h in hits) or "全部达标"


def _advice_md(a):
    """advice dict -> markdown 列表（含第二日操作建议）。"""
    if not a:
        return "- 无建议"
    L = [f"- 结论：**{a.get('tag', '—')}**（{a.get('mode', '—')}）"]
    for k, v in a.get("lines", []):
        L.append(f"- {k}：{v}")
    if a.get("memo"):
        L.append(f"- 备注：{a['memo']}")
    return "\n".join(L)


def _stock_md(x, rank, is_s2=False):
    score = x.get("score2" if is_s2 else "score", 0)
    advice = x.get("advice2" if is_s2 else "advice")
    tr = x.get("trend") or {}
    ws = x.get("wash_sig") or {}
    fund = x.get("pool_fund") or 0
    fr = x.get("fund_ratio")
    fr_txt = f"{fr:+.1f}%" if fr is not None else "—"
    relaxed = "（量比/门槛放宽）" if x.get("_relaxed") else ""
    L = []
    L.append(f"### {rank}. {x.get('name','')}（{x.get('code','')}）{relaxed}")
    L.append("")
    L.append(f"- 现价 `{x.get('price',0)}`｜当日涨跌 `{x.get('chg_t',0):+.2f}%`｜流通市值 `{x.get('liutong_yi',0):,.0f}亿`｜换手 `{x.get('turnover',0):.1f}%`｜成交额 `{x.get('amount_yi',0):.1f}亿`｜量比 `{x.get('vol_ratio',0):.2f}`")
    L.append(f"- 综合评分：**{score}**｜洗盘强度 `{x.get('washout',0):.2f}`｜趋势 `{tr.get('label','—')}`（{tr.get('score','—')}）")
    L.append(f"- 分时洗盘判定：**{ws.get('tag','—')}**" + (f"（{ws.get('note','')}）" if ws.get('note') else ""))
    L.append(f"- 主力资金：净流入 `{fund:+.2f}亿`（占成交 {fr_txt}）")
    L.append(f"- 题材/涨停原因：{x.get('reason') or '—'}")
    L.append(f"- 硬性门槛：{_gate_miss(x)}")
    L.append("")
    L.append("**第二日操作建议**")
    L.append(_advice_md(advice))
    # 内联 SVG 图：日K线 + 量能 + 当日分时（Markdown 内嵌，无外链）
    kl = x.get("klines") or []
    mn = x.get("minute_rows") or []
    prev = x.get("prev_close") or 0
    lup = round(prev * 1.1, 2) if prev else None
    if kl or mn:
        L.append("")
        if kl:
            L.append("**日K线**")
            L.append("")
            L.append(kline_svg(kl))
            L.append("")
            L.append("**量能**")
            L.append("")
            L.append(volume_svg(kl))
            L.append("")
        if mn:
            L.append("**当日分时**" + ("（涨停价/昨收标注）" if is_s2 else ""))
            L.append("")
            L.append(fenshi_svg(mn, prev, lup))
            L.append("")
    return "\n".join(L)


def _backup_md(title, rows, is_s2=False):
    """备选池（第4~6名）-> markdown 表格，附简要「第二天操作建议」tag。"""
    if not rows:
        return [f"**{title}**：候选不足，备选池为空。", ""]
    L = [f"**{title}**", ""]
    L.append("| # | 名称 | 代码 | 评分 | 量比 | 涨跌% | 洗盘判定 | 第二天操作建议 | 题材 |")
    L.append("|---|---|---|---|---|---|---|---|---|")
    for i, x in enumerate(rows, start=1):
        score = x.get("score2" if is_s2 else "score", 0)
        a = x.get("advice2" if is_s2 else "advice") or {}
        tag = a.get("tag", "—")
        mode = a.get("mode", "")
        adv_txt = f"{tag}" + (f" · {mode}" if mode else "")
        chg = x.get("chg_t", 0)
        ws = x.get("wash_sig") or {}
        L.append(f"| {i} | {x.get('name','')} | {x.get('code','')} | {score} | "
                 f"{x.get('vol_ratio',0):.2f} | {chg:+.2f} | {ws.get('tag','—')} | {adv_txt} | "
                 f"{(x.get('reason') or '—')[:16]} |")
    L.append("")
    return L


def render_markdown(screen, target):
    """渲染 Markdown 报告 -> {OUT_DIR}/首板炸板洗盘-{target}.md（含第二日操作建议）。"""
    s1 = screen.get("strategy1", [])
    s2 = screen.get("strategy2", [])
    all1 = screen.get("all_s1", [])
    near = screen.get("near_qualify", [])
    c = screen.get("counts", {})
    # 备选池 = 全量 Top6 中排除精选 Top3（与 HTML 版一致）
    bak1 = all1[3:6] if len(all1) > 3 else []
    # S2 宁缺毋滥：备选池直接取达标第4~6名（screen 已单独算好 s2_backup，避免全量前6漏票）
    bak2 = screen.get("s2_backup", [])
    L = []
    L.append(f"# 首板炸板洗盘 · 选股报告 {fmt_dash(target)}\n")
    L.append("## 概览\n")
    L.append(f"- 目标交易日：`{fmt_dash(target)}`")
    L.append(f"- 策略一（首板后放量洗盘）精选：{len(s1)} 只")
    L.append(f"- 策略二（炸板洗盘）精选：{len(s2)} 只")
    L.append(f"- 邻近达标观察：{len(near)} 只")
    L.append("")
    L.append("> 硬性门槛：流通市值≥50亿 · 换手率≥5% · 成交额≥5亿 · 量比≥2 · 非高位。以上基于公开行情整理，仅供复盘参考，不构成投资建议。")
    L.append("")

    L.append("## 一 · 首板后放量洗盘 · 精选\n")
    if s1:
        for i, x in enumerate(s1, start=1):
            L.append(_stock_md(x, i, is_s2=False))
    else:
        L.append("本策略今日无符合条件的候选。\n")

    L.append("## 二 · 炸板洗盘 · 精选\n")
    if s2:
        for i, x in enumerate(s2, start=1):
            L.append(_stock_md(x, i, is_s2=True))
        if len(s2) < 3:
            L.append(f"\n> 今日达标的炸板洗盘标的仅 {len(s2)} 只，宁缺毋滥不强行凑数；差门槛标的见「邻近达标·强洗盘但差门槛」观察栏。\n")
    else:
        L.append("本策略今日无符合硬门槛的炸板洗盘标的，宁缺毋滥不强行凑数（差门槛标的见「邻近达标」观察栏）。\n")

    if bak1 or bak2:
        L.append("## 三 · 备选池（第4~6名）\n")
        L.extend(_backup_md("首板后放量洗盘 · 备选", bak1, is_s2=False))
        L.extend(_backup_md("炸板洗盘 · 备选", bak2, is_s2=True))

    if near:
        L.append("## 四 · 邻近达标 · 强洗盘但差门槛\n")
        L.append("| # | 名称 | 代码 | 评分 | 洗盘强度 | 流通市值 | 换手 | 成交额 | 量比 | 涨跌% | 未达标 | 第二天操作建议 |")
        L.append("|---|---|---|---|---|---|---|---|---|---|---|---|")
        for i, x in enumerate(near, start=1):
            a = x.get("advice") or x.get("advice2") or {}
            tag = a.get("tag", "—")
            L.append(f"| {i} | {x.get('name','')} | {x.get('code','')} | {max(x.get('score',0),x.get('score2',0))} | "
                     f"{x.get('washout',0):.2f} | {x.get('liutong_yi',0):,.0f}亿 | {x.get('turnover',0):.1f}% | "
                     f"{x.get('amount_yi',0):.1f}亿 | {x.get('vol_ratio',0):.2f} | {x.get('chg_t',0):+.2f} | {_gate_miss(x)} | {tag} |")
        L.append("")

    L.append("---\n")
    L.append("> 以上基于公开行情整理，仅供复盘参考，不构成投资建议。")
    md = "\n".join(L) + "\n"
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"首板炸板洗盘-{fmt_dash(target)}.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"-> {path}")
    return path


def main():
    target = resolve_target()
    screen = load_json(data_path(f"screen_{target}.json"))
    if not screen or screen.get("T") != target:
        raise SystemExit(f"!! screen_{target}.json 缺失或 T 不符，请先跑 screen_washout.py")
    render_markdown(screen, target)


if __name__ == "__main__":
    main()