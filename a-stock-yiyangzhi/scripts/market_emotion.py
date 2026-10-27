# -*- coding: utf-8 -*-
"""市场情绪温度计：抓取全市场涨跌停/连板，定位情绪周期，供一阳指扫描作上下文。

数据源优先级：
  1) 东财「涨停池/跌停池/炸板池」(push2ex getTopic*Pool，支持 date=YYYYMMDD 按日查询)
     —— 家数/连板数(lbc)/炸板率最准，且可回溯历史；实时也优先用它。
  2) 降级：东财 clist 全A涨幅榜「分页」统计（东财单页上限 100，必须翻页，
     否则只统计到涨幅前 100 名，涨跌停家数被严重低估）。
  3) 再降级：返回「数据不可用」中性默认（明确标注，不误判冰点）。

情绪周期定位（量化经验值，弱市里转势/开门信号普遍亏钱，强市里胜率更高）：
  冰点  涨停 < 25
  修复   25 ~ 49
  升温   50 ~ 79
  高潮   80 ~ 149
  亢奋   >= 150
输出：{"date", "limit_up", "limit_down", "max_height", "fried", "fried_rate",
       "emotion", "emotion_score", "hint", "source"}
"""
from __future__ import annotations
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C


# 全A股（沪深A）涨幅榜 fs；跌停榜用同一源按涨幅升序（跌幅榜）
_UP_FS = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23"
_DOWN_FS = _UP_FS
_POOL_UT = "7eea3edcaed734bea9cbfc24409ed989"


def _pool(ep, date_ymd, sort="zdp:desc", pz=200):
    """东财涨停/跌停/炸板池（支持按日期回溯）。返回 list of dict 或 []"""
    import requests as _rq
    out = []
    for pg in range(0, 4):
        params = {"ut": _POOL_UT, "dpt": "wz.ztzt", "Pageindex": str(pg),
                  "pagesize": str(pz), "date": str(date_ymd)}
        if sort:
            params["sort"] = sort
        try:
            r = _rq.get("https://push2ex.eastmoney.com/" + ep, params=params,
                        headers={"User-Agent": C.UA}, timeout=12)
            d = r.json().get("data") or {}
            pl = d.get("pool") or []
        except Exception:
            pl = []
        if not pl:
            break
        out += pl
        if len(pl) < pz:
            break
        time.sleep(0.1)
    return out


def _clist_pages(fs, po="1", max_pages=12, stop_below=None):
    """分页拉东财 clist（单页上限 100）。stop_below(chgs) 返回 True 时提前停止。"""
    import requests as _rq
    hosts = ["https://push2.eastmoney.com", "https://push2delay.eastmoney.com",
             "https://82.push2.eastmoney.com"]
    out = []
    for pg in range(1, max_pages + 1):
        params = {"pn": str(pg), "pz": "100", "po": po, "np": "1", "fltt": "2",
                  "invt": "2", "fid": "f3", "fs": fs, "fields": "f12,f14,f3"}
        part = None
        for h in hosts:
            try:
                r = _rq.get(h + "/api/qt/clist/get", params=params,
                            headers={"User-Agent": C.UA}, timeout=12)
                d = (r.json().get("data") or {}).get("diff")
                if isinstance(d, list):
                    part = d
                    break
            except Exception:
                continue
        if not part:
            break
        out += part
        if stop_below:
            chgs = [C.safe_float(x.get("f3")) for x in part]
            if chgs and stop_below(chgs):
                break
        if len(part) < 100:
            break
        time.sleep(0.1)
    return out


def _parse_height(name):
    """从名称解析连板数：如「3连板」「2连板」「5天4板」；无则 1（首板）"""
    n = str(name or "")
    if "连板" in n:
        try:
            return int(n.split("连板")[0].strip("：: 天"))
        except Exception:
            return 1
    if "板" in n:
        try:
            seg = n.split("天")[-1].split("板")[0]
            return int(seg)
        except Exception:
            return 1
    return 1


def _from_pools(date_ymd):
    """用涨停/跌停/炸板池重建情绪；三池皆空返回 None（交由上层降级）。"""
    zt = _pool("getTopicZTPool", date_ymd, sort="zdp:desc")
    dt = _pool("getTopicDTPool", date_ymd)
    zb = _pool("getTopicZBPool", date_ymd)
    if not zt and not dt and not zb:
        return None
    limit_up, limit_down, fried = len(zt), len(dt), len(zb)
    max_height = 1
    for it in zt:
        try:
            max_height = max(max_height, int(it.get("lbc") or 1))
        except (TypeError, ValueError):
            continue
    fried_rate = fried / (limit_up + fried) if (limit_up + fried) else 0.0
    emotion, score = _locate(limit_up, max_height, fried_rate)
    s = str(date_ymd)
    date_dash = f"{s[:4]}-{s[4:6]}-{s[6:8]}" if len(s) == 8 else C.latest_trade_date(sep="-")
    return {
        "date": date_dash, "limit_up": limit_up, "limit_down": limit_down,
        "max_height": max_height, "fried": fried, "fried_rate": fried_rate,
        "emotion": emotion, "emotion_score": score, "hint": _hint(emotion),
        "source": "池口径(涨停/跌停/炸板池)",
    }


def fetch_emotion():
    """抓取当日市场情绪；接口不可达时返回中性降级默认（不影响扫描）。"""
    emo = _from_pools(C.latest_trade_date(sep=""))
    if emo:
        return emo
    # 降级：clist 分页快照
    up = _clist_pages(_UP_FS, po="1", stop_below=lambda chgs: min(chgs) < 9.4)
    down = _clist_pages(_DOWN_FS, po="0", stop_below=lambda chgs: max(chgs) > -9.4)
    if not up:
        return _fallback_emotion()
    limit_up = sum(1 for it in up if C.safe_float(it.get("f3")) >= 9.4)
    limit_down = sum(1 for it in (down or []) if C.safe_float(it.get("f3")) <= -9.4)
    max_height = 1
    for it in up:
        if C.safe_float(it.get("f3")) >= 9.4:
            max_height = max(max_height, _parse_height(it.get("f14")))
    emotion, score = _locate(limit_up, max_height, 0.0)
    return {
        "date": C.latest_trade_date(sep="-"), "limit_up": limit_up,
        "limit_down": limit_down, "max_height": max_height, "fried": 0,
        "fried_rate": 0.0, "emotion": emotion, "emotion_score": score,
        "hint": _hint(emotion), "source": "clist快照(分页)",
    }


def fetch_emotion_hist(date_ymd):
    """按日期重建历史情绪（补跑历史交易日用）。实时快照无法回溯，故用池口径。"""
    emo = _from_pools(date_ymd)
    if emo:
        return emo
    s = str(date_ymd)
    date_dash = f"{s[:4]}-{s[4:6]}-{s[6:8]}" if len(s) == 8 else C.latest_trade_date(sep="-")
    emo = _fallback_emotion()
    emo["date"] = date_dash
    emo["emotion"] = "数据不可用"
    emo["source"] = "历史池重建失败"
    emo["hint"] = "历史涨停/跌停池接口不可达，情绪字段缺失；个股信号判定以K线为准"
    return emo


def _fallback_emotion():
    """接口不可达时降级：返回中性默认（明确标注降级，不误判冰点）"""
    return {"date": C.latest_trade_date(sep="-"), "limit_up": 0, "limit_down": 0,
            "max_height": 1, "fried": 0, "fried_rate": 0.0,
            "emotion": "数据不可用", "emotion_score": 50,
            "hint": "情绪数据源不可达（降级）；个股信号判定以K线为准，请自行确认市场情绪",
            "source": "降级(不可用)"}


def _locate(limit_up, max_height, fried_rate):
    """情绪周期定位：综合涨停家数、连板高度、炸板率。返回 (emotion, score 0~100)"""
    if limit_up < 25:
        base, label = 20, "冰点"
    elif limit_up < 50:
        base, label = 40, "修复"
    elif limit_up < 80:
        base, label = 60, "升温"
    elif limit_up < 150:
        base, label = 78, "高潮"
    else:
        base, label = 90, "亢奋"
    base += min(15, max_height * 3)      # 连板高度加成（空间高度代表赚钱效应）
    base -= int(fried_rate * 25)         # 炸板率惩罚
    score = max(0, min(100, base))
    return label, score


def _hint(emotion):
    """据情绪周期给扫描建议"""
    return {
        "冰点": "情绪冰点：转势/开门信号胜率低，建议空仓或严控仓位，仅观察超跌反转候选",
        "修复": "情绪修复初期：可轻仓试错转势信号，开门信号需确认量能",
        "升温": "情绪升温：转势/开门信号胜率回升，可正常参与",
        "高潮": "情绪高潮：强势市场，开门(突破/涨停)信号优先，转势需防高位",
        "亢奋": "情绪亢奋：过热，谨防退潮，优先兑现浮盈，新开仓严控止损",
    }.get(emotion, "")


if __name__ == "__main__":
    import json as _j
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        print(_j.dumps(fetch_emotion_hist(sys.argv[1]), ensure_ascii=False, indent=1))
    else:
        print(_j.dumps(fetch_emotion(), ensure_ascii=False, indent=1))
