# -*- coding: utf-8 -*-
"""全市场扫描：实时候选(涨幅≥5%，无上限) -> 并发抓日K线 -> 判定转势/开门 -> CSV+JSON
用法：
  py scripts/scan.py [when] [--live] [--minpct 5] [--maxpct 999] [--force]
  when = YYYY-MM-DD 目标日(默认最近交易日)，结果定位到 scan_{date}.csv
"""
from __future__ import annotations
import os, sys, json, glob
from concurrent.futures import ThreadPoolExecutor, as_completed
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C
import indicators as IND
import theme_filter as TF
import market_emotion as ME

SCAN_SUMMARY = os.path.join(C.OUT_DIR, "scan_summary.json")


def _existing_scan_date():
    fs = glob.glob(os.path.join(C.OUT_DIR, "scan_*.json"))
    if not fs:
        return None
    return max(f for f in fs)


def fetch_and_eval(code, name, live, force=False, with_theme=True, target_dash=None):
    """抓K线并判定（并发 worker）；with_theme 时顺带抓行业/概念供主线过滤。
    target_dash 非空 = 历史模式：K线切片到目标日（含）之后判定，避免混入未完成的最新K线。"""
    rows = C.get_daily_kline(code, refresh=force)
    if target_dash:
        rows = slice_upto(rows, target_dash)
    if not rows:
        return None
    ev = IND.evaluate(rows, live=live, code=code)
    ev["code"] = code
    ev["name"] = name or C.get_name(code)   # 兜底路径候选名可能为空 -> 用K线顺带缓存的名称
    if with_theme:
        th = TF.fetch_stock_theme(code)
        ev["industry"] = th["industry"]
        ev["concepts"] = th["concepts"]
    return ev


def _local_universe():
    """离线候选池：本地K线缓存代码表 + 批量预取名称（K线走缓存时名称不会被顺带采集）。"""
    uni = C.local_codes()
    try:
        nm = C.prefetch_names([u["code"] for u in uni])
        for u in uni:
            if nm.get(u["code"]):
                u["name"] = nm[u["code"]]
    except Exception as e:
        print(f"[scan] 名称预取失败（忽略）：{e}")
    return uni


def scan(min_pct=5.0, max_pct=1e9, live=False, force_kline=False, limit_n=None,
         with_theme=True, target_dash=None):
    if target_dash:
        # 历史模式：实时涨幅榜没有按日接口，改为「全市场K线 → 切片至目标日 → 重建当日涨幅榜」
        print(f"[scan] 历史模式：全市场重建 {target_dash} 候选（K线切片至目标日，涨幅≥{min_pct}%）...")
        uni = [u for u in C.fetch_all_codes() if not C.is_risk_name(u.get("name"))]
        source = f"历史重建(K线切片至{target_dash})"
        if not uni:
            print("[scan] 东财代码表不可达，回退本地K线缓存代码表 ...")
            uni = _local_universe()
            source = f"历史重建(本地代码表·切片至{target_dash})"
        if not uni:
            print("[scan] 全市场代码表获取失败, 退出")
            sys.exit(1)
    else:
        print(f"[scan] 抓取全市场实时候选 涨幅≥{min_pct}%（无上限，涨停/连板均纳入） ...")
        uni = C.fetch_universe(min_pct=min_pct, max_pct=max_pct)
        source = "实时(push2)"
        if not uni:
            # 实时涨幅榜不可达（限流/断网）→ 用本地K线缓存做「全市场重建」，结果按最新K线涨幅过滤
            print("[scan] 实时候选源不可达 → 本地K线缓存「全市场重建」兜底（按最新交易日K线涨幅过滤）...")
            uni = _local_universe()
            source = "本地K线全市场重建(实时源不可达)"
            target_dash = C.latest_trade_date(sep="-")   # 触发评估后按涨幅过滤
        if not uni:
            print("[scan] 无可用候选(实时+本地均空), 退出")
            sys.exit(1)
    if limit_n:
        uni = uni[:limit_n]
    # 重建模式（历史/兜底）候选=全市场，逐只抓题材会慢到不可接受 -> 先不抓，过滤后再给最终候选补
    theme_in_eval = bool(with_theme) and not target_dash
    print(f"[scan] 候选 {len(uni)} 只 (来源={source}), 并发抓日K线并判定 ...")
    results = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(fetch_and_eval, u["code"], u["name"], live, force_kline,
                          theme_in_eval, target_dash): u for u in uni}
        for i, fu in enumerate(as_completed(futs), 1):
            ev = fu.result()
            if ev:
                u = futs[fu]
                ev.setdefault("quote", {k: u[k] for k in ("price", "vol_ratio", "amount_yi", "mktcap_yi", "chg")
                                        if k in u})
                results.append(ev)
            if i % 500 == 0 or i == len(futs):
                print(f"   判定 {i}/{len(futs)}")
    C.flush_names()          # 落盘本次抓取顺带得到的股票名称（供离线兜底复用）
    if target_dash:
        # 全市场重建：候选池是全市场，须按「当日涨幅≥min_pct」过滤；
        # 同时要求判定K线日期==目标日，排除停牌/退市老股（其最后一根K线远早于目标日，
        # 否则会被误当成当日信号，如 000003 PT金田A / 000562 宏源证券）
        kept_r, stale = [], 0
        for ev in results:
            if str(ev.get("date") or "")[:10] != target_dash:
                stale += 1
                continue
            if min_pct <= C.safe_float(ev.get("chg_today")) <= max_pct:
                kept_r.append(ev)
        if stale:
            print(f"[scan] 已排除停牌/退市（无目标日K线）{stale} 只")
        results = kept_r
    # 重建模式：过滤后（候选已收敛到几十~几百只）再补题材标签；push2 不可达时自动熔断、快速略过
    if with_theme and not theme_in_eval and results:
        for ev in results:
            th = TF.fetch_stock_theme(ev.get("code", ""))
            ev["industry"] = th.get("industry", "")
            ev["concepts"] = th.get("concepts", [])
    return results, source


def build_rows(results):
    """转成 CSV 行"""
    rows = []
    for ev in results:
        if ev.get("insufficient"):
            # 降级行（K线不足）也必须带全字段，否则 DictWriter/统计取键会 KeyError
            rows.append({
                "code": ev.get("code", ""), "name": ev.get("name", ""),
                "date": ev.get("date", "") or "", "chg": ev.get("chg_today", ""),
                "close": ev.get("close", ""), "vol_ratio": "",
                "strategy": "无", "score": "", "tier": "", "is_zt": False,
                "counter": ev.get("reason", "缺数据"),
                "theme": "", "theme_matched": "",
                "turn": False, "open": False, "turn_score": "", "open_score": "",
                "buy": "", "stop": "", "quote": "",
            })
            continue
        t = ev["turn"]; o = ev["open"]
        strategy = []
        if t["signal"]:
            strategy.append("转势")
        if o["signal"]:
            strategy.append("开门")
        counter = t["counter"] or o["counter"] or ""
        tier = ev.get("tier") or C.recommend_tier(
            t["signal"], o["signal"], ev.get("chg_today", 0), ev.get("zt", False))
        rows.append({
            "code": ev["code"], "name": ev["name"], "date": ev["date"],
            "chg": ev["chg_today"], "close": ev["close"],
            "vol_ratio": t.get("volr") or o.get("volr") or ev.get("quote", {}).get("vol_ratio"),
            "strategy": "+".join(strategy) or "—",
            "score": max(t.get("score", 0), o.get("score", 0)) if strategy else "",
            "tier": tier if strategy else "",
            "is_zt": bool(ev.get("zt", False)),
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


def _hit_sort_key(r):
    """推荐排序键：档位(首选>关注>追高风险)优先，档内评分降序。"""
    return (C.TIER_ORDER.get(r.get("tier") or "—", 9), -(r.get("score") or 0))


# ===== 精选：每日 Top5 + 往期关注 Top3 =====
def is_main_board(code):
    """主板判定：沪市 60x / 深市 000/001/002/003；排除科创(688/689)/创业(300/301)/北交(8/4/920)"""
    c = str(code).zfill(6)
    if c.startswith(("688", "689", "300", "301", "8", "4", "920")):
        return False
    return c.startswith(("60", "000", "001", "002", "003"))


def parse_target_date(argv):
    """从参数里解析 YYYY-MM-DD / YYYYMMDD 目标日；无则 None。"""
    import re
    for a in argv:
        if a.startswith("-"):
            continue
        m = re.match(r"^(\d{4})-?(\d{2})-?(\d{2})$", a.strip())
        if m:
            return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return None


def slice_upto(rows, target_dash):
    """把日K切片到「目标日(含)」之前，避免盘中/次日跑历史时混入最新未完成K线"""
    if not target_dash:
        return rows
    return [r for r in rows if str(r[0])[:10] <= target_dash]


def load_recent_hits(n_days=3, exclude_date=None):
    """回看最近 n_days 个 scan_*.json（不含 exclude_date），返回 {code: set(日期)}"""
    fs = sorted(glob.glob(os.path.join(C.OUT_DIR, "scan_*.json")))
    picked = []
    for f in reversed(fs):
        d = os.path.basename(f)[5:13]
        if len(d) != 8 or not d.isdigit() or d == exclude_date:
            continue
        picked.append((d, f))
        if len(picked) >= n_days:
            break
    hits = {}
    for d, f in picked:
        s = C.load_json(f, {}) or {}
        for it in (s.get("items") or []):
            c = str(it.get("code", "")).zfill(6)
            if not c:
                continue
            t = it.get("turn") if isinstance(it.get("turn"), dict) else {}
            o = it.get("open") if isinstance(it.get("open"), dict) else {}
            if (t or {}).get("signal") or (o or {}).get("signal"):
                hits.setdefault(c, set()).add(d)
    return hits


def select_daily_picks(rows, n=5, main_only=True):
    """每日精选 TopN：仅取首选/关注档(不推追高风险)，主板优先，评分降序、涨幅升序。"""
    cand = [r for r in rows if r.get("tier") in ("首选", "关注") and (r.get("score") or 0)]
    cand.sort(key=lambda r: (C.TIER_ORDER.get(r.get("tier") or "—", 9),
                             -(r.get("score") or 0), r.get("chg") or 0))
    if not main_only:
        for r in cand[:n]:
            r["_fill_nonmain"] = False
        return cand[:n]
    main = [r for r in cand if is_main_board(r.get("code", ""))]
    others = [r for r in cand if not is_main_board(r.get("code", ""))]
    picks = list(main[:n])
    for r in picks:
        r["_fill_nonmain"] = False
    for r in others:
        if len(picks) >= n:
            break
        r = dict(r)
        r["_fill_nonmain"] = True
        picks.append(r)
    return picks


def select_carry_picks(rows, recent_hits, n=3):
    """往期关注 TopN：近 N 日曾命中且今日再命中（连续信号），连续天数多者优先。"""
    out = []
    for r in rows:
        if not (r.get("turn") or r.get("open")):
            continue
        past = sorted(recent_hits.get(str(r.get("code", "")).zfill(6)) or [])
        if not past:
            continue
        out.append((r, past))
    out.sort(key=lambda x: (-len(x[1]), C.TIER_ORDER.get(x[0].get("tier") or "—", 9),
                            -(x[0].get("score") or 0)))
    picks = []
    for r, past in out[:n]:
        r = dict(r)
        r["past_dates"] = past
        picks.append(r)
    return picks


def main(argv):
    live = "--live" in argv
    force = "--force" in argv
    with_theme = "--no-theme" not in argv
    minpct, maxpct = 5.0, 1e9
    if "--minpct" in argv:
        minpct = float(argv[argv.index("--minpct") + 1])
    if "--maxpct" in argv:
        maxpct = float(argv[argv.index("--maxpct") + 1])
    limit_n = None
    if "--limit" in argv:
        limit_n = int(argv[argv.index("--limit") + 1])

    # 目标日解析：目标日 < 最近交易日 → 进入历史模式（K线切片重建）
    target = parse_target_date(argv)
    hist = bool(target) and target.replace("-", "") < C.latest_trade_date()
    if target and not hist:
        print(f"[scan] 目标日 {target} 即最近交易日，按实时/当日口径扫描")

    results, source = scan(min_pct=minpct, max_pct=maxpct, live=live, force_kline=force,
                           limit_n=limit_n, with_theme=with_theme,
                           target_dash=(target if hist else None))
    total = len(results)
    # 目标日取「第一条有日期」的判定；results[0] 可能是数据不足降级行(date 为空或 None)，
    # 直接取 results[0] 会错误回退到运行当天，导致文件名/标题日期错位
    date = C.latest_trade_date()
    for _r in results:
        if _r.get("date"):
            date = str(_r["date"]).replace("-", "")
            break
    if hist:
        date = target.replace("-", "")     # 历史模式以目标日为准
    date_disp = f"{date[:4]}-{date[4:6]}-{date[6:8]}"  # YYYY-MM-DD，用于报告文件名与标题展示

    # 主线/热点过滤：识别当日热点板块，标注主线标签，剔除边缘/偶发股
    hot_brief = {"热点概念": [], "热点行业": []}
    excluded = []
    # 市场情绪：抓取涨跌停/连板/炸板，定位情绪周期，作为扫描上下文（接口失败则降级）
    emotion = {}
    try:
        emotion = ME.fetch_emotion_hist(date) if hist else ME.fetch_emotion()
        print(f"[scan] 市场情绪：{emotion.get('emotion','?')}（涨停{emotion.get('limit_up',0)}家 / "
              f"跌停{emotion.get('limit_down',0)}家 / 最高{emotion.get('max_height',1)}连板 / "
              f"炸板率{emotion.get('fried_rate',0)*100:.0f}% · {emotion.get('source','')}）")
    except Exception as e:
        print(f"[scan] 市场情绪获取失败（降级忽略）：{e}")
    if with_theme and results:
        if hist:
            # 历史模式：实时板块榜无法回溯，改由候选股概念/行业词频聚合当日热点
            hot_concepts, hot_industries, hot_brief = TF.aggregate_hot_from_stocks(results)
        else:
            hot_concepts, hot_industries, hot_brief = TF.fetch_hot_boards()
            if not hot_concepts and not hot_industries:
                # 实时板块榜不可达（限流/断网）-> 用候选池概念/行业词频聚合兜底
                print("[scan] 实时热点板块不可用，改用候选池概念/行业词频聚合")
                hot_concepts, hot_industries, hot_brief = TF.aggregate_hot_from_stocks(results)
        if not hot_concepts and not hot_industries:
            print("[scan] 热点数据不可用，主线过滤退化为静态规则，报告不含当日热点")
        kept, excluded = TF.annotate(results, hot_concepts, hot_industries)
        if excluded:
            print(f"[scan] 主线过滤：剔除边缘/偶发 {len(excluded)} 只，保留 {len(kept)} 只")
        results = kept

    rows = build_rows(results)

    import csv
    csv_path = os.path.join(C.OUT_DIR, f"scan_{date}.csv")
    # 固定完整字段列表：不能按 rows[0].keys() 推导——首行若是"数据不足"降级行会缺字段，
    # 后续正常行多出的键将触发 DictWriter ValueError（DictWriter 对缺失键自动写空值）
    fieldnames = [
        "code", "name", "date", "chg", "close", "vol_ratio", "strategy", "score",
        "tier", "is_zt", "counter", "theme", "theme_matched", "turn", "open",
        "turn_score", "open_score", "buy", "stop", "quote"]
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

    # 精选：每日 Top5（首选/关注档·主板优先）+ 往期关注 Top3（近3日连续命中且今日再命中）
    try:
        recent_hits = load_recent_hits(n_days=3, exclude_date=date)
        daily_picks = select_daily_picks(rows, n=5, main_only="--picks-all" not in argv)
        carry_picks = select_carry_picks(rows, recent_hits, n=3)
    except Exception as _e:
        print(f"[scan] 精选计算失败（忽略）：{_e}")
        daily_picks, carry_picks = [], []

    # JSON（含全部判定详情）
    summary = {
        "date": date, "live": live, "source": source, "universe": total,
        "kept": len(results), "excluded": len(excluded), "hot_boards": hot_brief,
        "emotion": emotion,
        "turn_hit": sum(1 for r in rows if r.get("turn")),
        "open_hit": sum(1 for r in rows if r.get("open")),
        "daily_picks": [{"code": r.get("code"), "name": r.get("name"), "tier": r.get("tier"),
                         "score": r.get("score"), "chg": r.get("chg"),
                         "vol_ratio": r.get("vol_ratio"), "strategy": r.get("strategy"),
                         "nonmain_fill": bool(r.get("_fill_nonmain"))} for r in daily_picks],
        "carry_picks": [{"code": r.get("code"), "name": r.get("name"), "tier": r.get("tier"),
                         "score": r.get("score"), "chg": r.get("chg"),
                         "strategy": r.get("strategy"), "past_dates": r.get("past_dates") or []}
                        for r in carry_picks],
        "items": results, "excluded_items": excluded,
    }
    C.dump_json(os.path.join(C.OUT_DIR, f"scan_{date}.json"), summary)
    C.dump_json(SCAN_SUMMARY, {"date": date, "live": live, "turn_hit": summary["turn_hit"],
                               "open_hit": summary["open_hit"], "universe": summary["universe"],
                               "kept": summary["kept"], "excluded": summary["excluded"],
                               "emotion": emotion})
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
    if daily_picks:
        print("  ⭐ 每日精选 Top5（主板优先）：")
        for r in daily_picks:
            tag = "（非主板备选）" if r.get("_fill_nonmain") else ""
            print(f"     {r.get('code')} {r.get('name')} [{r.get('tier')}] 涨{r.get('chg')}% "
                  f"分{r.get('score')}{tag}")
    if carry_picks:
        print("  🔁 往期关注 Top3（连续信号）：")
        for r in carry_picks:
            days = "、".join(d for d in (r.get("past_dates") or []))
            print(f"     {r.get('code')} {r.get('name')} [{r.get('tier')}] 连续{days} 涨{r.get('chg')}%")
    for r in sorted((x for x in rows if x.get("turn") or x.get("open")), key=_hit_sort_key):
        theme = f"·{r.get('theme')}" if r.get("theme") else ""
        print(f"  ✔ {r.get('code')} {r.get('name')} 涨{r.get('chg')}%  "
              f"[{r.get('strategy')}·{r.get('tier','')}]{theme} 分{r.get('score')} 止损={r.get('stop')}")

    # 自动化自学习闭环：报告生成后，据当日最新数据分析并优化模型（--no-selflearn 可关闭）
    if "--no-selflearn" not in argv:
        import subprocess as _sp
        print("\n[scan] 自动触发自学习闭环（verify + 阈值重校准 + 收益回放诊断；--no-selflearn 可关闭）...")
        _sl_cmd = [sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                "selflearn.py")]
        # 历史模式补跑（次日回补昨日）时透传目标日，避免 verify/自学习报告误用运行日
        if hist and target:
            _sl_cmd += ["--date", target.replace("-", "")]
        _sp.call(_sl_cmd)
    return 0


def render_markdown(summary, rows, date_disp=None):
    """候选 → Markdown 报告(结论前置 + 每只原因)"""
    hits = sorted([r for r in rows if r.get("turn") or r.get("open")], key=_hit_sort_key)
    live_tag = "· 盘中判定(未收盘, 待复核)" if summary.get("live") else ""
    _d = date_disp or summary.get("date", "")
    hot_brief = summary.get("hot_boards") or {}
    hot_concepts = hot_brief.get("热点概念") or []
    hot_industries = hot_brief.get("热点行业") or []
    emo = summary.get("emotion") or {}
    excl = summary.get("excluded_items") or []
    L = []
    L.append(f"# 一阳指战法 · 全市场扫描报告 {_d} {live_tag}\n")
    L.append("## 概览\n")
    L.append(f"- 目标交易日：`{_d}`")
    L.append(f"- 候选来源：`{summary.get('source','')}`")
    L.append(f"- 扫描候选（涨幅≥5%，无上限，涨停/连板均纳入）：{summary.get('universe')} 只")
    L.append(f"- 主线/热点过滤：保留 `{summary.get('kept', 0)}` 只，剔除边缘/偶发 `{summary.get('excluded', 0)}` 只")
    L.append(f"- **一阳指·转势 命中：{summary.get('turn_hit')} 只**")
    L.append(f"- **一阳指·开门 命中：{summary.get('open_hit')} 只**")
    if emo:
        L.append(f"- 市场情绪：**{emo.get('emotion','?')}**（情绪分 {emo.get('emotion_score','?')} / 100）"
                 f"　涨停 {emo.get('limit_up',0)} 家 · 跌停 {emo.get('limit_down',0)} 家 · "
                 f"最高 {emo.get('max_height',1)} 连板 · 炸板率 {emo.get('fried_rate',0)*100:.0f}%")
        if emo.get("hint"):
            L.append(f"  - 情绪建议：{emo['hint']}")
    if hot_concepts:
        L.append(f"- 当日热点概念：`{'、'.join(hot_concepts)}`")
    if hot_industries:
        L.append(f"- 当日热点行业：`{'、'.join(hot_industries)}`")
    L.append("")

    # ===== 每日精选 Top5 + 往期关注 Top3（前置，结论最先）=====
    daily_picks = summary.get("daily_picks") or []
    carry_picks = summary.get("carry_picks") or []
    if daily_picks:
        L.append("## ⭐ 每日精选 Top5（主板优先，排除科创板/创业板）\n")
        L.append("| 代码 | 名称 | 档位 | 当日涨幅% | 量比 | 策略 | 评分 |")
        L.append("|------|------|------|--------|------|------|------|")
        for r in daily_picks:
            nm = r.get("name", "")
            if r.get("nonmain_fill"):
                nm += "（非主板备选）"
            L.append(f"| {r.get('code','')} | {nm} | **{r.get('tier') or '—'}** | {r.get('chg')} | "
                     f"{r.get('vol_ratio')} | {r.get('strategy')} | {r.get('score')} |")
        L.append("")
        L.append("> 精选口径：仅取**首选/关注**档（不推追高风险）→ **主板优先**（60x/000/001/002/003，"
                 "已排除 688/689 科创板、300/301 创业板）→ 评分降序、涨幅升序（温和放量优先）。"
                 "主板不足 5 只时以非主板高分股补足并标注「非主板备选」。")
        L.append("")
    if carry_picks:
        L.append("## 🔁 往期关注 Top3（连续信号）\n")
        L.append("| 代码 | 名称 | 连续命中 | 档位 | 当日涨幅% | 评分 |")
        L.append("|------|------|--------|------|--------|------|")
        for r in carry_picks:
            days = "、".join(f"{d[4:6]}-{d[6:8]}" for d in sorted(r.get("past_dates") or []))
            L.append(f"| {r.get('code','')} | {r.get('name','')} | {days} + 今日 | "
                     f"**{r.get('tier') or '—'}** | {r.get('chg')} | {r.get('score')} |")
        L.append("")
        L.append("> 连续天数越多越优先——「反复命中」代表转势结构在持续强化，是往期关注里最值得留意的。")
        L.append("")

    if hits:
        L.append("## 命中个股（结论前置）\n")
        L.append("| 代码 | 名称 | 档位 | 当日涨幅% | 量比 | 策略 | 评分 | 主线标签 | 买点 | 止损 |")
        L.append("|------|------|------|--------|------|------|------|--------|------|------|")
        for r in hits:
            buy = (r.get("buy") or "—").replace("|", "/")
            tg = TF.TAG_LABEL.get(r.get("theme"), r.get("theme") or "—")
            mt = (r.get("theme_matched") or "").replace("|", "/")
            label = tg if not mt else f"{tg}({mt})"
            tier = r.get("tier") or "—"
            L.append(f"| {r['code']} | {r['name']} | **{tier}** | {r['chg']} | {r['vol_ratio']} | "
                     f"**{r['strategy']}** | {r['score']} | {label} | {buy} | {r.get('stop') or '—'} |")
        L.append("")
        L.append(f"> 档位排序：**首选**（转势·非涨停·温和放量大阳，持续性最优）> **关注**（转势涨停/开门非涨停）"
                 f"> **追高风险**（开门涨停/高位追涨，T+5 历史转负）。")
        L.append(f"> 默认卖出纪律：**止盈 +{C.TP_PCT*100:.0f}% / 止损 -{C.SL_PCT*100:.0f}% / "
                 f"高浮盈回撤 {C.TRAIL_PCT*100:.0f}% 移动止盈**（90日回溯实证，全量 +0.28%→+0.88%）。")
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
        if ev.get("tier") and ev.get("tier") != "—":
            L.append(f"- 推荐档位：**{ev.get('tier')}**"
                     + ("（信号日涨停，追高风险）" if ev.get("zt") else ""))
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
        if ev.get("sells"):
            for s in ev["sells"]:
                for k, v in s.items():
                    L.append(f"  - {k}：{v}")
        L.append("")
    if summary.get("live"):
        L.append("> ⚠ 盘中扫描：当日K线为进行中，需收盘后复核；本报告仅作复盘参考，不构成投资建议。")
    else:
        L.append("> 仅供复盘参考，不构成投资建议。")
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))