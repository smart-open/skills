# -*- coding: utf-8 -*-
"""一阳指转势/开门 量化技能 · 共享配置与工具
运行目录(RUNTIME)存放所有可写产物(缓存/输出)。
RUNTIME 定位优先级：
  1) 环境变量 YZ_RUNTIME（最明确，可指向任意工程目录）
  2) 否则 = 「当前会话/工作目录(os.getcwd())」下新建 <skill>_runtime/
     —— 让产物落在调用本技能时所处的工程目录，不埋在技能安装目录里(不改 SKILL 本体)。
RUNTIME/
  data/kline_cache/   日K线缓存  {code}.json  (list of [date,open,close,high,low,vol,amount])
  data/min_cache/     1分钟K线缓存 {code}_{date}.json
  output/             HTML/CSV/JSON 产物
"""
import os, json, time, random
import numpy as np

BASE = os.path.dirname(os.path.abspath(__file__))            # scripts/
SKILL = os.path.dirname(BASE)                                 # 技能安装目录
# 会话产物根：优先 YZ_RUNTIME，否则收敛到「当前工作目录」下的 <技能名>/ 子目录，避免写回技能安装处
if os.environ.get("YZ_RUNTIME"):
    RUNTIME = os.environ["YZ_RUNTIME"]
else:
    RUNTIME = os.path.join(os.getcwd(), "a-stock-yiyangzhi")
DATA = os.path.join(RUNTIME, "data")
KLINE_DIR = os.path.join(DATA, "kline_cache")
MIN_DIR = os.path.join(DATA, "min_cache")
OUT_DIR = os.path.join(RUNTIME, "output")
# 最终报告（Markdown，带日期）输出根 = 当前会话/工作目录根，不放进技能名子目录
REPORT_ROOT = os.environ.get("YZ_OUT") or os.getcwd()
for _d in (RUNTIME, DATA, KLINE_DIR, MIN_DIR, OUT_DIR):
    os.makedirs(_d, exist_ok=True)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "Chrome/120 Safari/537.36")
_last_req = [0.0]

# ===== 战法阈值(常量, 可回测调参) =====
TURN_BIGYANG_MIN = 0.05          # 转势大阳线涨幅下限
OPEN_BIGYANG_MIN = 0.05          # 开门大阳线涨幅下限
TURN_VOL_MIN = 1.00              # 转势: 资金线=当日量≥20日均量(量能/资金够大, 过滤缩量超跌反弹)
TURN_PREV_ZT_MIN = 0.094         # 转势·双阳确认: 前一日≈涨停(≥9.4%)
TURN_NEXT_MIN = 0.04             # 转势·双阳确认: 当日续阳≥4%
OPEN_VOL_MIN = 1.10              # 开门: 量比下限(常规放量突破)
OPEN_FOLLOW_UP_MIN = 0.03        # 开门·续攻: 近10日有涨停后当日续阳≥3%即视为大阳(续攻开门)
OPEN_FOLLOW_VOL_MIN = 0.90       # 开门·续攻: 续攻量比下限
OPEN_RECENT_ZT_DAYS = 10         # 开门·续攻: 近N日出现涨停
OPEN_SEAL_BASE_PCT = 0.50        # 开门·缩量一字/秒板: 近3日均量≤volma20的50%=地量洗盘
OPEN_SEAL_LIFT = 1.50            # 开门·缩量一字/秒板: 当日量≥近3日均量1.5倍(惜售/相对放量)
MA_FLAT_EPS = 0.001              # |斜率|<0.1% 视为走平
PRIOR_HIGH_WINDOW = 20           # 开门破前高回看窗口(近20日=近期前高等)
OPEN_BREAK_TOL = 0.97            # 开门: 允许"逼近前高97%"即视为顺势突破
REV_LOW_WINDOW = 20              # 转势: V反转回看低点窗口
REV_MIN_CLIMB = 0.08             # 转势: 收盘须较近期低点回升≥8%
REV_MAX_BARS = 12                # 转势: 该低点须在最近12根内(近期刚见底反转)
VOL_RATIO_STRONG = 2.0           # 量能档: 显著放量
VOL_RATIO_BURST = 3.0            # 量能档: 爆发
BOTTOM_MIN_DAYS = 5              # 反例E: 底部有效横盘最少天数
BIAS_MA21_FAR = 0.15             # 卖点S1: 乖离21均线过多
MA_GAP_TIGHT = 0.01              # 双线黏合阈值(gap<1%)
COOL_DOWN_BARS = 5               # 冷却期
STOP_ALPHA = (0.3, 0.5)          # 止损 α×ATR(14) 区间
ATR_N = 14

# 打印配色(红涨绿跌)
UP_COLOR = "#e04b4b"
DOWN_COLOR = "#2bd99f"
WARN_COLOR = "#f0c040"
MUTED = "#8b93a7"
GOLD = "#f0b45a"

# 自学习回写参数（optimize.py 产出 params_best.json，覆盖上面常量；缺省回落默认）
PARAMS_PATH = os.path.join(DATA, "params_best.json")
PARAM_KEYS = ["TURN_VOL_MIN", "OPEN_VOL_MIN"]  # 当前支持自动搜索的战法阈值


def _apply_params():
    """读取 params_best.json，将合法阈值覆盖到模块常量。"""
    p = load_json(PARAMS_PATH, {})
    for k in PARAM_KEYS:
        v = p.get(k)
        if isinstance(v, (int, float)) and v > 0:
            globals()[k] = float(v)


def limit_pct(code):
    """涨停幅度：科创/创业 20%，北交所(8/4/920) 30%，主板 10%"""
    c = str(code)
    if c.startswith(("8", "4", "920")):
        return 30.0
    if c.startswith(("688", "30")):
        return 20.0
    return 10.0


def zt_threshold(code):
    """涨停判定阈值(含容差)"""
    return limit_pct(code) - 0.6


def is_limit_up(chg, code):
    try:
        return float(chg) >= zt_threshold(code)
    except (TypeError, ValueError):
        return False


# 暴雷名称关键词（与共享 _risk_gate 同源，短线风险放大：ST/退市一票剔除）
_RISK_NAME_KEYWORDS = ["ST", "*ST", "退"]


def is_risk_name(name):
    n = str(name or "").upper()
    return any(k in n for k in _RISK_NAME_KEYWORDS)


def stock_prefix(code):
    c = str(code)
    if c.startswith(("8", "4", "920")):
        return "bj"
    if c.startswith(("6", "9")):
        return "sh"
    return "sz"


def load_json(path, default=None):
    if default is None:
        default = {}
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


# 模块加载末尾：读 params_best.json 覆盖战法阈值（load_json 已定义）
_apply_params()


def dump_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def safe_float(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def latest_trade_date(sep=""):
    """最近的工作日(<= 今天)，用于文件名；格式由 sep 决定('' -> 20260105)"""
    import datetime as dt
    d = dt.date.today()
    while d.weekday() >= 5:
        d -= dt.timedelta(days=1)
    return d.isoformat().replace("-", sep)


# ===== 自学习/验证统一数据窗口：最近 3 个月（约 90 自然日 / 66 交易日） =====
MONTHS_BACK = 3


def window_start_ymd(months=MONTHS_BACK, end_ymd=None):
    """返回「最近 N 个月」窗口起始日 YYYYMMDD（含当天往前推 N 个月）。"""
    import datetime as dt
    end = end_ymd or latest_trade_date(sep="")
    d = dt.date.fromisoformat(end)
    d -= dt.timedelta(days=int(months * 30.44))
    return d.isoformat().replace("-", "")


def mah(series, n):
    """移动平均; 不足返回 nan 列表"""
    s = np.asarray(series, dtype=float)
    out = np.full(len(s), np.nan)
    if len(s) < n:
        return out
    cs = np.nancumsum(s)
    cs = np.where(np.isnan(s), np.nan, cs)
    for i in range(n - 1, len(s)):
        w = s[i - n + 1:i + 1]
        if np.isnan(w).any():
            continue
        out[i] = np.nanmean(w)
    return out


# ===== 日K线抓取(增量缓存) =====
def get_daily_kline(code, refresh=False):
    """返回 list of [date,open,close,high,low,vol,amount] 或 []"""
    code = str(code).zfill(6)
    p = os.path.join(KLINE_DIR, f"{code}.json")
    if not refresh and os.path.exists(p):
        arr = load_json(p, [])
        if isinstance(arr, list) and arr:
            return arr
    prefix = stock_prefix(code)
    if prefix == "bj":
        url = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/kline/kline"
        params = {"param": f"bj{code},day,,,400"}
    else:
        url = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/fqkline/get"
        params = {"param": f"{prefix}{code},day,,,400,qfq"}
    try:
        r = requests_get(url, params, timeout=12)
        d = r.json()["data"][f"{prefix}{code}"]
        kl = d.get("qfqday") or d.get("day") or []
        norm = []
        for row in kl:
            # 腾讯日K: [date,open,close,high,low,volume(手),成交额(元)?]
            if len(row) < 6:
                continue
            try:
                norm.append([str(row[0]),
                             float(row[1]), float(row[2]), float(row[3]),
                             float(row[4]), float(row[5]),
                             float(row[6]) if len(row) > 6 else 0.0])
            except (TypeError, ValueError):
                continue
        if norm:
            dump_json(p, norm)
            return norm
    except Exception:
        pass
    return []


# ===== 全市场实时候选(push2) =====
def _clist(params, tries=3):
    """东财 clist/get：多主机轮询 + 重试。返回 list 或 None"""
    import requests as _rq
    hosts = ["https://push2.eastmoney.com", "https://push2delay.eastmoney.com",
             "https://82.push2.eastmoney.com"]
    for try_i in range(tries):
        for h in hosts:
            try:
                r = _rq.get(h + "/api/qt/clist/get", params=params,
                            headers={"User-Agent": UA}, timeout=12)
                d = (r.json().get("data") or {}).get("diff")
                if isinstance(d, list) and d:
                    return d
            except Exception:
                continue
        time.sleep(1.0 + try_i * 0.5)
    return None


def fetch_universe(min_pct=3.0, max_pct=8.0, top_n=2000):
    """东财实时涨幅榜 top_n -> 过滤涨幅带 [min,max]，返回列表 dicts
    实时候选源受限时返回 []（由调用方优雅降级 / 用缓存样本兜底）"""
    params0 = {
        "pn": "1", "po": "1", "np": "1", "fltt": "2", "invt": "2", "fid": "f3",
        "fs": "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23",
        "fields": "f12,f14,f2,f3,f5,f6,f10,f20",
    }
    pages = max(1, -(-top_n // 200))
    rows = {}
    for pg in range(1, pages + 1):
        part = _clist(dict(params0, pn=str(pg), pz="200"))
        if not part:
            if pg == 1:
                return []           # 首页都拿不到 -> 认为不可达
            break
        for d in part:
            c = str(d.get("f12", "")).zfill(6)
            if c:
                rows[c] = d
        if len(part) < 200:
            break
        time.sleep(0.05)
    out = []
    for code, d in rows.items():
        chg = safe_float(d.get("f3"))
        name = str(d.get("f14", ""))
        if is_risk_name(name):        # ST/*ST/退市（5%或特殊涨跌停）剔除，避免干扰一阳指筛选
            continue
        if min_pct <= chg <= max_pct:
            out.append({
                "code": code,
                "name": str(d.get("f14", "")),
                "price": safe_float(d.get("f2")),
                "chg": chg,
                "vol_ratio": safe_float(d.get("f10")),
                "amount_yi": safe_float(d.get("f6")) / 1e8,
                "mktcap_yi": safe_float(d.get("f20")) / 1e8,
            })
    return out


def cache_universe(min_pct=3.0, max_pct=8.0):
    """兜底：从日K缓存里，取每只最新一根涨幅落 [min,max] 的代码作候选"""
    out = []
    for fn in os.listdir(KLINE_DIR):
        if not fn.endswith(".json"):
            continue
        rows = load_json(os.path.join(KLINE_DIR, fn), [])
        if len(rows) < 2:
            continue
        cl = safe_float(rows[-1][2]); pc = safe_float(rows[-2][2])
        if pc > 0:
            chg = (cl / pc - 1) * 100
            if min_pct <= chg <= max_pct:
                out.append({"code": fn[:-5], "name": "", "chg": chg})
    return out


def requests_get(url, params, timeout=12):
    import requests as _rq
    d = 0.15 - (time.time() - _last_req[0])
    if d > 0:
        time.sleep(d + random.uniform(0, 0.05))
    _last_req[0] = time.time()
    return _rq.get(url, params=params, headers={"User-Agent": UA}, timeout=timeout)