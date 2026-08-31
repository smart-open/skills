# -*- coding: utf-8 -*-
"""龙虎榜 T+3 涨停推荐 · 共享配置与特征工具
运行时目录(RUNTIME)独立于脚本目录，默认在技能目录下 runtime/，可用环境变量 LHB_RUNTIME 覆盖。
RUNTIME/
  data/        缓存: board.csv / seats_buy.csv / seats_sell.csv / hot/ / kline_cache/ / seat_profile.csv / model_data_t3.csv
  model/       model_t3.joblib / model_meta_t3.json
  model_history.json   模型版本进化轨迹
  verify_history.csv   每日推荐验证记录
"""
import os, json, glob, re
import numpy as np
import pandas as pd

BASE = os.path.dirname(os.path.abspath(__file__))          # scripts/
SKILL = os.path.dirname(BASE)
RUNTIME = os.environ.get("LHB_RUNTIME", os.path.join(SKILL, "runtime"))
DATA = os.path.join(RUNTIME, "data")
MODEL_DIR = os.path.join(RUNTIME, "model")
for _d in (RUNTIME, DATA, MODEL_DIR):
    os.makedirs(_d, exist_ok=True)

# ===== 文件名约定 =====
BOARD_CSV = os.path.join(DATA, "board.csv")
SEATS_BUY_CSV = os.path.join(DATA, "seats_buy.csv")
SEATS_SELL_CSV = os.path.join(DATA, "seats_sell.csv")
HOT_DIR = os.path.join(DATA, "hot")
KLINE_DIR = os.path.join(DATA, "kline_cache")
SEAT_PROFILE_CSV = os.path.join(DATA, "seat_profile.csv")
DATASET_CSV = os.path.join(DATA, "model_data_t3.csv")
MODEL_PATH = os.path.join(MODEL_DIR, "model_t3.joblib")
MODEL_META = os.path.join(MODEL_DIR, "model_meta_t3.json")
HISTORY_PATH = os.path.join(RUNTIME, "model_history.json")
VERIFY_PATH = os.path.join(RUNTIME, "verify_history.csv")

# ===== 模型超参(固定, 保证可复现) =====
EB_K = 15                       # Empirical-Bayes 伪样本量
TOPK_THEME = 45                # 主线题材取 TopK
REC_TOPN = 20                   # 每日推荐 TopN
T3_TOL = 0.6                    # 涨停判定容差(百分点)


def limit_pct(code):
    """涨停幅度：科创/创业 20%，北交所(bj: 8/4/920) 30%，主板 10%"""
    c = str(code)
    if c.startswith(("8", "4", "920")):
        return 30.0
    if c.startswith(("688", "30")):
        return 20.0
    return 10.0


def zt_threshold(code):
    """涨停判定阈值(含容差)，统一口径避免硬编码 9.5"""
    return limit_pct(code) - T3_TOL


def is_limit_up(change_rate, code):
    """按板块阈值判定是否涨停(含容差)，异常输入返回 False"""
    try:
        return float(change_rate) >= zt_threshold(code)
    except (TypeError, ValueError):
        return False


def reason_cat(s):
    """上榜原因 -> 手法类别(与训练 OneHot 一致)"""
    s = str(s)
    if "连续三个交易日" in s or "连续3个交易日" in s:
        return "连续三日涨幅偏离"
    if "涨幅偏离值达到7%" in s or "涨幅偏离值达到 7%" in s:
        return "涨幅偏离7%"
    if "收盘价格涨幅达到15%" in s or "收盘价格涨幅达到20%" in s or "价格涨幅达到15%" in s:
        return "涨幅达上限(科创/创业)"
    if "振幅值达到15%" in s:
        return "振幅15%"
    if "换手率达到20%" in s or "换手率达到 20%" in s:
        return "换手20%"
    if "跌幅偏离" in s:
        return "跌幅偏离"
    if "无价格涨跌幅限制" in s:
        return "无涨跌幅限制"
    return "其他"


def load_klines():
    """合并 kline_cache -> {code: {date: close}}"""
    kl = {}
    if not os.path.isdir(KLINE_DIR):
        return kl
    for fn in glob.glob(os.path.join(KLINE_DIR, "*.json")):
        code = os.path.basename(fn)[:-5]
        try:
            arr = json.load(open(fn, encoding="utf-8"))
            kl[code] = {str(r[0]): float(r[2]) for r in arr if len(r) >= 3}
        except Exception:
            pass
    return kl


def kline_ret(kl, code, dt, n):
    """上榜日后第 n 个交易日相对上榜日收盘的涨幅(%)"""
    m = kl.get(str(code))
    if not m or dt not in m:
        return np.nan
    ds = sorted(m)
    i = ds.index(dt)
    j = i + n
    if j >= len(ds):
        return np.nan
    base = m[dt]
    return round((m[ds[j]] / base - 1) * 100, 3) if base else np.nan


def pre3_ret(kl, code, dt):
    """前 3 日累计涨幅(透支度)"""
    m = kl.get(str(code))
    if not m or dt not in m:
        return np.nan
    ds = sorted(m)
    i = ds.index(dt)
    if i < 3:
        return np.nan
    return round((m[dt] / m[ds[i - 3]] - 1) * 100, 2)


def load_theme_map(topk=TOPK_THEME):
    """从 hot/ 构建: 主线题材集合 / 个股->题材 / 每日题材强度(涨停数)"""
    code2theme, theme_cnt, theme_daily = {}, {}, {}
    if not os.path.isdir(HOT_DIR):
        return set(), code2theme, theme_daily
    for fn in sorted(glob.glob(os.path.join(HOT_DIR, "*.json"))):
        dt = os.path.basename(fn)[4:14]
        try:
            data = json.load(open(fn, encoding="utf-8"))
        except Exception:
            continue
        if isinstance(data, dict):
            data = data.get("data") or []
        for r in data:
            code = str(r.get("code", "")).zfill(6)
            reason = str(r.get("reason", "") or "")
            tags = [t.strip() for t in re.split(r"[+＋、,，/]", reason) if t.strip()]
            for t in tags:
                theme_cnt[t] = theme_cnt.get(t, 0) + 1
                theme_daily.setdefault(dt, {}).setdefault(t, 0)
                theme_daily[dt][t] += 1
                code2theme.setdefault((dt, code), []).append(t)
    up = set(sorted(theme_cnt, key=theme_cnt.get, reverse=True)[:topk])
    return up, code2theme, theme_daily


def load_seat_score():
    """席位综评(质量代理), 来自 seat_profile.csv"""
    if not os.path.exists(SEAT_PROFILE_CSV):
        return {}
    sp = pd.read_csv(SEAT_PROFILE_CSV)
    return dict(zip(sp["OPERATEDEPT_NAME"], sp["综评"].fillna(0)))


def load_model():
    """加载训练好的模型工件 {model, scaler, feats, cat_cols}"""
    import joblib
    if not os.path.exists(MODEL_PATH):
        return None
    return joblib.load(MODEL_PATH)


def prep_features(df, ART):
    """对 REASON 做 OneHot 并补齐模型所需全部列 -> DataFrame(仅feats)"""
    if ART.get("cat_cols"):
        df = pd.get_dummies(df, columns=["REASON"])
        for c in ART["cat_cols"]:
            if c not in df.columns:
                df[c] = 0
    return df[ART["feats"]].fillna(0)


def predict(df, ART):
    """返回每只样本的 P(T+3涨停) 数组"""
    X = prep_features(df, ART)
    return ART["model"].predict_proba(ART["scaler"].transform(X.values))[:, 1]


def load_board():
    if not os.path.exists(BOARD_CSV):
        return pd.DataFrame()
    b = pd.read_csv(BOARD_CSV, dtype={"SECURITY_CODE": str})
    b["TRADE_DATE"] = b["TRADE_DATE"].astype(str).str[:10]
    return b


def load_seats_buy():
    if not os.path.exists(SEATS_BUY_CSV):
        return pd.DataFrame()
    sb = pd.read_csv(SEATS_BUY_CSV, dtype={"SECURITY_CODE": str})
    sb["TRADE_DATE"] = sb["TRADE_DATE"].astype(str).str[:10]
    sb["BUY"] = pd.to_numeric(sb["BUY"], errors="coerce").fillna(0)
    sb = sb[~sb["OPERATEDEPT_NAME"].astype(str).str.contains(r"自然人|投资者", na=False)]
    return sb


def load_seats_sell():
    if not os.path.exists(SEATS_SELL_CSV):
        return pd.DataFrame()
    ss = pd.read_csv(SEATS_SELL_CSV, dtype={"SECURITY_CODE": str})
    ss["TRADE_DATE"] = ss["TRADE_DATE"].astype(str).str[:10]
    ss["SELL"] = pd.to_numeric(ss["SELL"], errors="coerce").fillna(0)
    ss = ss[~ss["OPERATEDEPT_NAME"].astype(str).str.contains(r"自然人|投资者", na=False)]
    return ss


# 知名游资(用子串匹配以兼容全称, 随数据扩充)
FAMOUS = [
    "紫阳东路", "中信证券上海分公司", "中信证券深圳分公司",
    "国泰海通证券总部", "北京知春路", "开源证券西安西大街",
    "宁波桑田路", "华鑫证券", "成都北一环路", "杭州上塘路",
    "兴业证券陕西", "国盛证券", "上海源深路", "国新证券北京分公司",
    "上海江苏路", "银河证券北京中关村", "上海分公司", "东莞证券湖北",
]
