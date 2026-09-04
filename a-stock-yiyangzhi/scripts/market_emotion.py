# -*- coding: utf-8 -*-
"""市场情绪温度计：抓取全市场涨跌停/连板，定位情绪周期，供一阳指扫描作上下文。

数据源：东财 clist 全A涨幅榜（m:0+t:6,m:0+t:80）+ 跌停榜，多主机轮询 + 节流 + 降级兜底。
  - 涨停/跌停家数：按涨幅≥涨停阈值 / 跌幅≤跌停阈值统计（可靠）。
  - 连板高度：从涨停股名称解析「N连板」后缀（东财涨停股名称带连板标记）。
  - 炸板数/炸板率：clist 无法可靠获取盘中炸板，置 0 并标注（供后续接入专用复盘接口）。
情绪周期定位（量化经验值，弱市里转势/开门信号普遍亏钱，强市里胜率更高）：
  冰点  涨停 < 25
  修复   25 ~ 49
  升温   50 ~ 79
  高潮   80 ~ 149
  亢奋   >= 150
输出：{"date", "limit_up", "limit_down", "max_height", "fried", "fried_rate",
       "emotion", "emotion_score", "hint"}
"""
from __future__ import annotations
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C


# 全A股（沪深A）涨幅榜 fs；跌停榜用同一源按涨幅降序尾部统计
_UP_FS = "m:0+t:6,m:0+t:80"
_DOWN_FS = "m:0+t:6,m:0+t:80"  # 跌停用涨幅榜倒序（po=0 升序）取跌幅榜


def _clist(fs, po="1", top_n=800):
    """拉东财 clist，返回 list of dict（f3 涨幅、f14 名称）。失败返回 []"""
    import requests as _rq
    hosts = ["https://push2.eastmoney.com", "https://push2delay.eastmoney.com",
             "https://82.push2.eastmoney.com"]
    params = {"pn": "1", "pz": str(top_n), "po": po, "np": "1", "fltt": "2",
              "invt": "2", "fid": "f3", "fs": fs, "fields": "f12,f14,f3"}
    for h in hosts:
        try:
            r = _rq.get(h + "/api/qt/clist/get", params=params,
                        headers={"User-Agent": C.UA}, timeout=12)
            d = (r.json().get("data") or {}).get("diff")
            if isinstance(d, list) and d:
                return d
        except Exception:
            continue
        time.sleep(0.3)
    return []


def _parse_height(name):
    """从名称解析连板数：如「3连板」「2连板」「5天4板」；无则 1（首板）"""
    n = str(name or "")
    if "连板" in n:
        try:
            return int(n.split("连板")[0].strip("：: 天"))
        except Exception:
            return 1
    # 「N天M板」口径（如「5天4板」）：取板数 M
    if "板" in n:
        try:
            seg = n.split("天")[-1].split("板")[0]
            return int(seg)
        except Exception:
            return 1
    return 1


def fetch_emotion():
    """抓取当日市场情绪，返回结构化 dict；接口不可达时返回降级默认（不影响扫描）。"""
    up = _clist(_UP_FS, po="1")
    down = _clist(_DOWN_FS, po="0")  # 升序 = 跌幅榜（跌停在最前）
    if not up:
        return _fallback_emotion()

    # 涨停家数（涨幅≥9.4%，主板10%；双创20%用≥19.4%，北交30%用≥29.4%；近似统一≥9.4 覆盖主板为主）
    limit_up = sum(1 for it in up if C.safe_float(it.get("f3")) >= 9.4)
    limit_down = sum(1 for it in (down or []) if C.safe_float(it.get("f3")) <= -9.4)

    # 连板高度：涨停股中名称解析最大连板数
    max_height = 1
    for it in up:
        if C.safe_float(it.get("f3")) >= 9.4:
            max_height = max(max_height, _parse_height(it.get("f14")))

    # 炸板数：clist 无法可靠获取盘中炸板，置 0（标注为未统计）
    fried = 0
    fried_rate = 0.0

    emotion, score = _locate(limit_up, max_height, fried_rate)
    hint = _hint(emotion)
    return {
        "date": C.latest_trade_date(sep="-"),
        "limit_up": limit_up, "limit_down": limit_down,
        "max_height": max_height, "fried": fried, "fried_rate": fried_rate,
        "emotion": emotion, "emotion_score": score, "hint": hint,
    }


def _fallback_emotion():
    """接口不可达时降级：返回保守默认（中性情绪，明确标注降级）"""
    return {"date": C.latest_trade_date(sep="-"), "limit_up": 0, "limit_down": 0,
            "max_height": 1, "fried": 0, "fried_rate": 0.0,
            "emotion": "未知", "emotion_score": 50,
            "hint": "情绪数据源不可达（降级），仅作量价扫描，请自行确认市场情绪"}


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
    emo = fetch_emotion()
    print(_j.dumps(emo, ensure_ascii=False, indent=1))
