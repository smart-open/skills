# -*- coding: utf-8 -*-
"""全市场扫描：实时候选(涨幅约5%) -> 并发抓日K线 -> 判定转势/开门 -> CSV+JSON
用法：
  py scripts/scan.py [when] [--live] [--minpct 3] [--maxpct 8]
  when = YYYY-MM-DD 目标日(默认最近交易日)，结果定位到 scan_{date}.csv
"""
from __future__ import annotations
import os, sys, json, glob
from concurrent.futures import ThreadPoolExecutor, as_completed
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C
import indicators as IND
import theme_filter as TF

SCAN_SUMMARY = os.path.join(C.OUT_DIR, "scan_summary.json")


def _existing_scan_date():
    fs = glob.glob(os.path.join(C.OUT_DIR, "scan_*.json"))
    if not fs:
        return None
    return max(f for f in fs)


def fetch_and_eval(code, name, live, force=False, with_theme=True):
    """抓K线并判定（并发 worker）；with_theme 时顺带抓行业/概念供主线过滤"""
    rows = C.get_daily_kline(code, refresh=force)
    if not rows:
        return None
    ev = IND.evaluate(rows, live=live, code=code)
    ev["code"] = code
    ev["name"] = name
    if with_theme:
        th = TF.fetch_stock_theme(code)
        ev["industry"] = th["industry"]
        ev["concepts"] = th["concepts"]
    return ev


def scan(min_pct=3.0, max_pct=8.0, live=False, force_kline=False, limit_n=None,
         with_theme=True):
    print(f"[scan] 抓取全市场实时候选 涨幅[{min_pct}%, {max_pct}%] ...")
    uni = C.fetch_universe(min_pct=min_pct, max_pct=max_pct)
    source = "实时(push2)"
    if not uni:
        print("[scan] 实时候选源不可达，尝试用日K缓存兜底 ...")
        uni = C.cache_universe(min_pct=min_pct, max_pct=max_pct)
        source = "日K缓存兜底"
    if not uni:
        print("[scan] 无可用候选(实时+缓存均空), 退出")
        sys.exit(1)
    if limit_n:
        uni = uni[:limit_n]
    print(f"[scan] 候选 {len(uni)} 只 (来源={source}), 并发抓日K线并判定 ...")
    results = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(fetch_and_eval, u["code"], u["name"], live, force_kline, with_theme): u for u in uni}
        for i, fu in enumerate(as_completed(futs), 1):
            ev = fu.result()
            if ev:
                u = futs[fu]
                ev.setdefault("quote", {k: u[k] for k in ("price", "vol_ratio", "amount_yi", "mktcap_yi", "chg")
                                        if k in u})
                results.append(ev)
            if i % 100 == 0 or i == len(futs):
                print(f"   判定 {i}/{len(futs)}")
    return results, source


def build_rows(results):
    """转成 CSV 行"""
    rows = []
    for ev in results:
        if ev.get("insufficient"):
            rows.append({"code": ev.get("code", ""), "name": ev.get("name", ""),
                         "date": ev.get("date", ""), "chg": ev.get("chg_today", ""),
                         "strategy": "无", "score": "", "counter": ev.get("reason", "缺数据"),
                         "theme": "", "theme_matched": ""})
            continue
        t = ev["turn"]; o = ev["open"]
        strategy = []
        if t["signal"]:
            strategy.append("转势")
        if o["signal"]:
            strategy.append("开门")
        counter = t["counter"] or o["counter"] or ""
        rows.append({
            "code": ev["code"], "name": ev["name"], "date": ev["date"],
            "chg": ev["chg_today"], "close": ev["close"],
            "vol_ratio": t.get("volr") or o.get("volr") or ev.get("quote", {}).get("vol_ratio"),
            "strategy": "+".join(strategy) or "—",
            "score": max(t.get("score", 0), o.get("score", 0)) if strategy else "",
            "counter": counter,
            "theme": ev.get("theme", ""),
            "theme_matched": ev.get("theme_matched", ""),
            "turn": t["signal"], "open": o["signal"],
            "turn_score": t["score"], "open_score": o["score"],
            "buy": (t.get("buy") or o.get("buy") or {}).get("detail", ""),
            "stop": t.get("stop") or o.get("stop") or "",
            "quote": f"{ev.get('quote',{}).get('price','')}|量比{ev.get('quote',{}).get('vol_ratio','')}|额{ev.get('quote',{}).get('amount_yi','')}亿",
        })
    return rows


def main(argv):
    live = "--live" in argv
    force = "--force" in argv
    with_theme = "--no-theme" not in argv
    minpct, maxpct = 3.0, 8.0
    if "--minpct" in argv:
        minpct = float(argv[argv.index("--minpct") + 1])
    if "--maxpct" in argv:
        maxpct = float(argv[argv.index("--maxpct") + 1])
    limit_n = None
    if "--limit" in argv:
        limit_n = int(argv[argv.index("--limit") + 1])

    results, source = scan(min_pct=minpct, max_pct=maxpct, live=live, force_kline=force,
                           limit_n=limit_n, with_theme=with_theme)
    total = len(results)
    date = (results[0]["date"].replace("-", "") if results and results[0].get("date")
            else C.latest_trade_date())
    date_disp = f"{date[:4]}-{date[4:6]}-{date[6:8]}"  # YYYY-MM-DD，用于报告文件名与标题展示

    # 主线/热点过滤：识别当日热点板块，标注主线标签，剔除边缘/偶发股
    hot_brief = {"热点概念": [], "热点行业": []}
    excluded = []
    if with_theme and results:
        hot_concepts, hot_industries, hot_brief = TF.fetch_hot_boards()
        kept, excluded = TF.annotate(results, hot_concepts, hot_industries)
        if excluded:
            print(f"[scan] 主线过滤：剔除边缘/偶发 {len(excluded)} 只，保留 {len(kept)} 只")
        results = kept

    rows = build_rows(results)

    import csv
    csv_path = os.path.join(C.OUT_DIR, f"scan_{date}.csv")
    fieldnames = list(rows[0].keys()) if rows else [
        "code", "name", "date", "chg", "close", "vol_ratio", "strategy", "score",
        "counter", "theme", "theme_matched", "turn", "open", "turn_score",
        "open_score", "buy", "stop", "quote"]
    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    excl_path = os.path.join(C.OUT_DIR, f"scan_{date}_excluded.csv")
    with open(excl_path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["code", "name", "chg", "theme_matched"])
        w.writeheader()
        for ev in excluded:
            w.writerow({"code": ev.get("code", ""), "name": ev.get("name", ""),
                        "chg": ev.get("chg_today", ""),
                        "theme_matched": ev.get("theme_matched", "")})

    # JSON（含全部判定详情）
    summary = {
        "date": date, "live": live, "source": source, "universe": total,
        "kept": len(results), "excluded": len(excluded), "hot_boards": hot_brief,
        "turn_hit": sum(1 for r in rows if r["turn"]),
        "open_hit": sum(1 for r in rows if r["open"]),
        "items": results, "excluded_items": excluded,
    }
    C.dump_json(os.path.join(C.OUT_DIR, f"scan_{date}.json"), summary)
    C.dump_json(SCAN_SUMMARY, {"date": date, "live": live, "turn_hit": summary["turn_hit"],
                               "open_hit": summary["open_hit"], "universe": summary["universe"],
                               "kept": summary["kept"], "excluded": summary["excluded"]})
    md = render_markdown(summary, rows, date_disp)
    md_path = os.path.join(C.REPORT_ROOT, f"一阳指报告-{date_disp}.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"\n[scan] 完成 → {csv_path}")
    if excluded:
        print(f"  剔除明细 → {excl_path}")
    print(f"  Markdown 报告 → {md_path}")
    print(f"  候选 {summary['universe']} | 保留 {summary['kept']} | 剔除 {summary['excluded']}")
    print(f"  转势命中 {summary['turn_hit']} | 开门命中 {summary['open_hit']}")
    for r in rows:
        if r["turn"] or r["open"]:
            theme = f"·{r.get('theme')}" if r.get("theme") else ""
            print(f"  ✔ {r['code']} {r['name']} 涨{r['chg']}%  [{r['strategy']}]{theme} "
                  f"分{r['score']} 止损={r['stop']}")
    return 0


def render_markdown(summary, rows, date_disp=None):
    """候选 → Markdown 报告(结论前置 + 每只原因)"""
    hits = [r for r in rows if r["turn"] or r["open"]]
    live_tag = "· 盘中判定(未收盘, 待复核)" if summary.get("live") else ""
    _d = date_disp or summary.get("date", "")
    hot_brief = summary.get("hot_boards") or {}
    hot_concepts = hot_brief.get("热点概念") or []
    hot_industries = hot_brief.get("热点行业") or []
    excl = summary.get("excluded_items") or []
    L = []
    L.append(f"# 一阳指战法 · 全市场扫描报告 {_d} {live_tag}\n")
    L.append("## 概览\n")
    L.append(f"- 目标交易日：`{_d}`")
    L.append(f"- 候选来源：`{summary.get('source','')}`")
    L.append(f"- 扫描候选（涨幅约5%带）：{summary.get('universe')} 只")
    L.append(f"- 主线/热点过滤：保留 `{summary.get('kept', 0)}` 只，剔除边缘/偶发 `{summary.get('excluded', 0)}` 只")
    L.append(f"- **一阳指·转势 命中：{summary.get('turn_hit')} 只**")
    L.append(f"- **一阳指·开门 命中：{summary.get('open_hit')} 只**")
    if hot_concepts:
        L.append(f"- 当日热点概念：`{'、'.join(hot_concepts)}`")
    if hot_industries:
        L.append(f"- 当日热点行业：`{'、'.join(hot_industries)}`")
    L.append("")
    if hits:
        L.append("## 命中个股（结论前置）\n")
        L.append("| 代码 | 名称 | 当日涨幅% | 量比 | 策略 | 评分 | 主线标签 | 买点 | 止损 |")
        L.append("|------|------|--------|------|------|------|--------|------|------|")
        for r in hits:
            buy = (r.get("buy") or "—").replace("|", "/")
            tg = TF.TAG_LABEL.get(r.get("theme"), r.get("theme") or "—")
            mt = (r.get("theme_matched") or "").replace("|", "/")
            label = tg if not mt else f"{tg}({mt})"
            L.append(f"| {r['code']} | {r['name']} | {r['chg']} | {r['vol_ratio']} | "
                     f"**{r['strategy']}** | {r['score']} | {label} | {buy} | {r.get('stop') or '—'} |")
        L.append("")
    if excl:
        L.append("## 被剔除个股（边缘/偶发，如公告、冷门题材）\n")
        L.append("| 代码 | 名称 | 当日涨幅% | 命中剔除词 |")
        L.append("|------|------|--------|----------|")
        for ev in excl:
            L.append(f"| {ev.get('code','')} | {ev.get('name','')} | {ev.get('chg_today','')} | "
                     f"{(ev.get('theme_matched') or '—').replace('|','/')} |")
        L.append("")
    L.append("## 详细原因\n")
    items = summary.get("items") or []
    for ev in items:
        code = ev.get("code"); name = ev.get("name")
        t = ev.get("turn") or {}; o = ev.get("open") or {}
        tg = TF.TAG_LABEL.get(ev.get("theme"), ev.get("theme") or "")
        L.append(f"### {code} {name}（{ev.get('date','')} 收盘 {ev.get('close')} 涨幅 "
                 f"{ev.get('chg_today')}%）")
        if tg:
            mt = (ev.get("theme_matched") or "").replace("|", "/")
            L.append(f"- 主线标签：**{tg}**" + (f"（{mt}）" if mt else ""))
        if ev.get("insufficient"):
            L.append(f"- 数据不足：{ev.get('reason','')}\n")
            continue
        L.append(f"**转势{('✔' if t.get('signal') else '✘')}（评分 {t.get('score')}）**")
        for r_ in (t.get("reasons") or []):
            L.append(f"  - {r_}")
        if t.get("signal"):
            L.append(f"  - 买点：{t.get('buy',{}).get('detail')}｜止损：{t.get('stop')}")
        else:
            L.append(f"  - 未成立：{t.get('counter')}")
        L.append(f"**开门{('✔' if o.get('signal') else '✘')}（评分 {o.get('score')}）**")
        for r_ in (o.get("reasons") or []):
            L.append(f"  - {r_}")
        if o.get("signal"):
            L.append(f"  - 买点：{o.get('buy',{}).get('detail')}｜止损：{o.get('stop')}")
        else:
            L.append(f"  - 未成立：{o.get('counter')}")
        L.append("")
    if summary.get("live"):
        L.append("> ⚠ 盘中扫描：当日K线为进行中，需收盘后复核；本报告仅作复盘参考，不构成投资建议。")
    else:
        L.append("> 仅供复盘参考，不构成投资建议。")
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))