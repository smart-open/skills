# -*- coding: utf-8 -*-
"""龙虎榜数据管道(参数化 + 增量)
fetch: board(全市场龙虎榜汇总) / seats(买卖席位明细) / hot(同花顺题材) / kline(全量日K线)
落盘到 RUNTIME/data/, 增量跳过已有日期/文件。
用法(模块): from pipeline import run, fetch_latest, latest_trade_day
"""
import os, json, time, random, shutil
import datetime as dtmod
import requests, pandas as pd
import _common as C

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
EM = "https://datacenter-web.eastmoney.com/api/data/v1/get"
EM_MIN = 1.1
_last = [0.0]


def em_get(params, timeout=25):
    wait = EM_MIN - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait + random.uniform(0.1, 0.4))
    try:
        return requests.get(EM, params=params, headers={"User-Agent": UA}, timeout=timeout)
    finally:
        _last[0] = time.time()


def dc_all(report, filter_str, sort_columns, sort_types="-1", page_size=500, max_pages=40):
    out, page = [], 1
    while page <= max_pages:
        p = {"reportName": report, "columns": "ALL", "filter": filter_str,
             "pageNumber": str(page), "pageSize": str(page_size),
             "sortColumns": sort_columns, "sortTypes": sort_types, "source": "WEB", "client": "WEB"}
        try:
            d = em_get(p).json()
        except Exception:
            break
        res = d.get("result") or {}
        rows = res.get("data") or []
        out.extend(rows)
        if not rows or page >= res.get("pages", 1):
            break
        page += 1
    return out


def _weekdays(start, end):
    """[start,end] 内所有工作日(yyyy-mm-dd)"""
    s = dtmod.date.fromisoformat(start); e = dtmod.date.fromisoformat(end)
    out = []
    while s <= e:
        if s.weekday() < 5:
            out.append(s.isoformat())
        s += dtmod.timedelta(days=1)
    return out


def latest_trade_day(asof=None):
    """最近的工作日(<= asof, 默认今天)"""
    d = asof or dtmod.date.today()
    while d.weekday() >= 5:
        d -= dtmod.timedelta(days=1)
    return d.isoformat()


def board_ready_day(asof=None):
    """龙虎榜已发布的交易日: 今天需 >=17:00, 否则取上一工作日"""
    now = dtmod.datetime.now()
    d = now.date()
    if now.hour < 17:
        d -= dtmod.timedelta(days=1)
    return latest_trade_day(d)


def _existing_dates():
    b = C.load_board()
    return set(b["TRADE_DATE"].unique()) if len(b) else set()


def fetch_board_range(start, end):
    rows = dc_all("RPT_DAILYBILLBOARD_DETAILSNEW",
                  f"(TRADE_DATE>='{start}')(TRADE_DATE<='{end}')",
                  "TRADE_DATE,BILLBOARD_NET_AMT", "-1,-1")
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    df["TRADE_DATE"] = df["TRADE_DATE"].astype(str).str[:10]
    # 增量合并
    old = C.load_board()
    if len(old):
        df = pd.concat([old, df], ignore_index=True).drop_duplicates(
            subset=["TRADE_DATE", "SECURITY_CODE"]).reset_index(drop=True)
    df.to_csv(C.BOARD_CSV, index=False, encoding="utf-8-sig")
    return df


def _append_seats(report, csv_path, dates):
    key = "BUY" if "BUY" in report else "SELL"
    all_rows = []
    for d in dates:
        b = dc_all(report, f"(TRADE_DATE='{d}')", key, "-1", 500, 6)
        all_rows.extend(b)
    if not all_rows:
        return 0
    df = pd.DataFrame(all_rows)
    df["TRADE_DATE"] = df["TRADE_DATE"].astype(str).str[:10]
    old = pd.read_csv(csv_path, dtype={"SECURITY_CODE": str}) if os.path.exists(csv_path) else pd.DataFrame()
    if len(old):
        df = pd.concat([old, df], ignore_index=True)
    subs = [c for c in ("TRADE_DATE", "SECURITY_CODE", "OPERATEDEPT_NAME", key) if c in df.columns]
    if subs:
        df = df.drop_duplicates(subset=subs).reset_index(drop=True)
    df.to_csv(csv_path, index=False, encoding="utf-8-sig")
    return len(df)


def fetch_seats(dates):
    n1 = _append_seats("RPT_BILLBOARD_DAILYDETAILSBUY", C.SEATS_BUY_CSV, dates)
    n2 = _append_seats("RPT_BILLBOARD_DAILYDETAILSSELL", C.SEATS_SELL_CSV, dates)
    print(f"[seats] buy {n1} 行 sell {n2} 行")
    return n1, n2


def fetch_hot(dates):
    os.makedirs(C.HOT_DIR, exist_ok=True)
    url_tpl = "http://zx.10jqka.com.cn/event/api/getharden/date/{d}/orderby/date/orderway/desc/charset/GBK/"
    h = {"User-Agent": UA}
    done = 0
    missed = []
    for d in dates:
        p = os.path.join(C.HOT_DIR, f"hot_{d}.json")
        if os.path.exists(p):
            done += 1; continue
        # 瞬时失败(网络拦截/空响应)常见, 重试 3 次避免静默丢失题材维度
        ok = False
        for attempt in range(3):
            try:
                r = requests.get(url_tpl.format(d=d), headers=h, timeout=12)
                data = r.json()
                if data.get("errocode", 0) == 0:
                    json.dump(data.get("data") or [], open(p, "w", encoding="utf-8"), ensure_ascii=False)
                    ok = True
                    break
                print(f"  hot {d} 第{attempt+1}次 errocode={data.get('errocode')}")
            except Exception as e:
                print(f"  hot {d} 第{attempt+1}次 ERR {e}")
            time.sleep(1.5 * (attempt + 1))
        if not ok:
            missed.append(d)
        time.sleep(0.25)
    if missed:
        print(f"[hot] ⚠ 以下日期题材抓取失败(主线维度将缺失, 重跑 daily 会自动补抓): {', '.join(missed)}")
    print(f"[hot] 已就绪 {len(os.listdir(C.HOT_DIR))} 文件")


def _fetch_one_kline(c, overwrite=False):
    """单只个股日K线抓取，返回 (code, 是否成功)。失败/空数据静默跳过。
    overwrite=True 时强制重拉并与旧缓存按日期合并去重(新数据优先)，
    用于刷新历史推荐票的后续K线(支撑 verify 的 T+1~T+3 结算)。"""
    p = os.path.join(C.KLINE_DIR, f"{c}.json")
    if os.path.exists(p) and not overwrite:
        return c, True
    prefix = "bj" if str(c).startswith(("8", "4", "920")) else (
        "sh" if str(c).startswith(("6", "9")) else "sz")
    # 北交所在 fqkline?qfq 下会触发腾讯 WAF 拦截, 改用 kline 接口(原始日K, 无qfq)
    # host 用 proxy.finance.qq.com（web.ifzq.gtimg.cn 已失效返回 501）
    if prefix == "bj":
        url = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/kline/kline"
        params = {"param": f"bj{c},day,,,200"}
    else:
        url = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/fqkline/get"
        params = {"param": f"{prefix}{c},day,,,200,qfq"}
    try:
        r = requests.get(url, params=params, headers={"User-Agent": UA}, timeout=12)
        d = r.json()["data"][f"{prefix}{c}"]
        kl = d.get("qfqday") or d.get("day") or []
        if kl:
            if overwrite and os.path.exists(p):
                try:  # 合并旧缓存, 保留接口 200 条窗口之外的历史
                    old = json.load(open(p, encoding="utf-8"))
                    seen = {str(x[0])[:10] for x in kl}
                    kl = list(kl) + [x for x in old if str(x[0])[:10] not in seen]
                    kl.sort(key=lambda x: str(x[0]))
                except Exception:
                    pass
            json.dump(kl, open(p, "w", encoding="utf-8"), ensure_ascii=False)
            return c, True
    except Exception:
        pass
    return c, False


def fetch_kline(codes):
    os.makedirs(C.KLINE_DIR, exist_ok=True)
    todo = sorted(c for c in codes if not os.path.exists(os.path.join(C.KLINE_DIR, f"{c}.json")))
    print(f"[kline] 待拉取 {len(todo)}/{len(codes)} 只（并发 8）")
    if not todo:
        print(f"[kline] 缓存 {len(os.listdir(C.KLINE_DIR))} 文件")
        return
    from concurrent.futures import ThreadPoolExecutor, as_completed
    done = ok = 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        for fu in as_completed([ex.submit(_fetch_one_kline, c) for c in todo]):
            _, success = fu.result()
            done += 1
            if success:
                ok += 1
            if done % 200 == 0:
                print(f"  已拉 K线 {done}/{len(todo)}（成功 {ok}）")
    print(f"[kline] 缓存 {len(os.listdir(C.KLINE_DIR))} 文件（本次成功 {ok}/{len(todo)}）")


def run(start, end):
    """拉取 [start,end] 内缺失数据(增量)"""
    t0 = time.time()
    wd = _weekdays(start, end)
    have = _existing_dates()
    miss = [d for d in wd if d not in have]
    if not miss:
        print(f"[pipeline] {start}~{end} 已全部存在, 无需拉取")
    else:
        print(f"[pipeline] 缺失交易日 {len(miss)} 天: {miss[0]} ~ {miss[-1]}")
        fetch_board_range(start, end)
        fetch_seats(miss)
        fetch_hot(miss)
    board = C.load_board()
    if len(board) and miss:
        # 仅拉取「新增交易日」涉及个股的 K 线, 历史已缓存则跳过 -> 增量快速
        new_codes = sorted(board[board["TRADE_DATE"].isin(miss)]["SECURITY_CODE"].astype(str).unique())
        if new_codes:
            fetch_kline(new_codes)
        print(f"[pipeline] 完成, board {len(board)} 行, 用时 {round((time.time()-t0)/60,1)} 分")
    return board


def refresh_kline(codes, last_date=None):
    """刷新指定个股的K线缓存：仅重拉「最新日期落后于 last_date」的票(强制重拉+合并)。
    修复缺陷：daily 只增量拉当日新上榜股的K线, 历史推荐票K线停滞,
    导致 verify 的 T+1~T+3 永远缺收盘价而无法回填命中记录。"""
    if last_date is None:
        b = C.load_board()
        last_date = str(b["TRADE_DATE"].max())[:10] if len(b) else None
    if not last_date:
        return
    todo = []
    for c in codes:
        c = str(c).zfill(6)
        p = os.path.join(C.KLINE_DIR, f"{c}.json")
        if not os.path.exists(p):
            continue  # 无缓存的票由 fetch_kline 常规拉取, 不属于「刷新」范畴
        try:
            arr = json.load(open(p, encoding="utf-8"))
            latest = str(arr[-1][0])[:10] if arr else ""
        except Exception:
            latest = ""
        if latest and latest < last_date:
            todo.append(c)
    if not todo:
        print(f"[kline] 历史票K线均已最新(截至 {last_date}), 无需刷新")
        return
    print(f"[kline] 刷新历史票K线 {len(todo)} 只(补至 {last_date}, 并发 8)")
    from concurrent.futures import ThreadPoolExecutor, as_completed
    ok = 0
    with ThreadPoolExecutor(max_workers=8) as ex:
        for fu in as_completed([ex.submit(_fetch_one_kline, c, True) for c in todo]):
            _, success = fu.result()
            ok += int(success)
    print(f"[kline] 刷新完成 {ok}/{len(todo)}")


def recent_watch_codes(days=10):
    """近期需保持K线新鲜的票: 近 days 个交易日上榜股 + 所有 recommend 文件中的票"""
    codes = set()
    b = C.load_board()
    if len(b):
        recent_days = sorted(b["TRADE_DATE"].unique())[-days:]
        codes |= set(b[b["TRADE_DATE"].isin(recent_days)]["SECURITY_CODE"].astype(str).str.zfill(6))
    import glob as _glob
    for fp in _glob.glob(os.path.join(C.RUNTIME, "recommend_*.csv")):
        try:
            df = pd.read_csv(fp, dtype={"CODE": str})
            codes |= set(df["CODE"].astype(str).str.zfill(6))
        except Exception:
            pass
    return sorted(codes)


def fetch_latest():
    """拉取最近一个已可发布的交易日(用于每日推荐)"""
    d = board_ready_day()
    board = run(d, d)
    # 刷新历史票K线, 保证 verify 的 T+1~T+3 能结算(若失败不阻断主流程)
    try:
        refresh_kline(recent_watch_codes())
    except Exception as e:
        print(f"[kline] 历史票刷新跳过: {e}")
    return board


if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 3:
        run(sys.argv[1], sys.argv[2])
    else:
        fetch_latest()
