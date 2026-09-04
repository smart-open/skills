# -*- coding: utf-8 -*-
"""首板洗盘选股器 共享工具库：路径/JSON 读写/安全转换/代码段判断/交易日/配色/因子模型常量。

路径约定（锚定「会话工程根目录」ROOT，而非技能安装目录）：
- BASE（本技能安装目录）：只放代码（scripts/ 与 SKILL.md），**不存放任何过程数据**。
- ROOT（会话工程根目录）：报告输出、过程数据都以它为锚点；
  env WASHOUT_ROOT 显式覆盖 > （cwd 落在技能目录内时回退到 BASE 父目录）> 当前 cwd。
- DATA_DIR（过程数据目录）：采集缓存/筛选结果/验证样本/自学习权重 一律落这里；
  env WASHOUT_DATA 显式覆盖，缺省 = ROOT/a-stock-board-washout。
- OUT_DIR（报告输出目录）：最终报告（Markdown）外置到 ROOT；
  env WASHOUT_OUT 显式覆盖（绝对或相对 cwd 均可）。
"""
import os
import json
from datetime import datetime, timedelta

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _root():
    """会话工程根目录 ROOT：报告输出与过程数据的共同锚点。

    优先级：env WASHOUT_ROOT（绝对/相对 cwd） > cwd（落在技能目录内时回退到 BASE 父目录） > cwd。
    回退保护：从技能目录（含 scripts/ 子目录）运行脚本时，绝不把报告/数据写进技能代码目录。
    """
    r = os.environ.get("WASHOUT_ROOT", "").strip()
    if r:
        return r if os.path.isabs(r) else os.path.abspath(r)
    cwd = os.path.abspath(os.getcwd())
    if cwd == BASE or cwd.startswith(BASE + os.sep):
        return os.path.dirname(BASE)
    return cwd


ROOT = _root()


def _data_dir():
    """过程数据根目录：env WASHOUT_DATA > ROOT/a-stock-board-washout。

    兜底安全：若默认名恰好与技能安装目录重名（当 ROOT 就是技能库根目录时），
    改用独立后缀，绝不把数据写进技能代码目录。
    """
    d = os.environ.get("WASHOUT_DATA", "").strip()
    if d:
        return d if os.path.isabs(d) else os.path.abspath(d)
    cand = os.path.abspath(os.path.join(ROOT, "a-stock-board-washout"))
    if os.path.abspath(cand) == BASE or \
            os.path.abspath(cand).startswith(BASE + os.sep) or \
            BASE.startswith(os.path.abspath(cand) + os.sep):
        cand = os.path.abspath(os.path.join(ROOT, "a-stock-board-washout-data"))
    return cand


DATA_DIR = _data_dir()


def data_path(name):
    """过程数据文件路径：统一落在 DATA_DIR/data/<name>，与各脚本共享。"""
    return os.path.join(DATA_DIR, "data", name)


# 自学习闭环产物（放 DATA_DIR/data 下，与 screen_*.json 同级）
VERIFY_PATH = data_path("verify_history.csv")
PARAMS_PATH = data_path("params_best.json")


def _out_dir():
    """报告输出目录：env WASHOUT_OUT > ROOT（会话工程根目录）。"""
    out = os.environ.get("WASHOUT_OUT", "").strip()
    if out:
        return out if os.path.isabs(out) else os.path.abspath(out)
    return ROOT


OUT_DIR = _out_dir()

# ===== A股配色（红涨绿跌）=====
UP_COLOR = "#ff4d5e"
DOWN_COLOR = "#2bd99f"
WARN_COLOR = "#ffb454"
MUTED_COLOR = "#7b89a8"
GOLD_COLOR = "#f5c451"
ACC_COLOR = "#4f8cff"
ACC2_COLOR = "#22d3ee"

# 主板代码段（排除科创板 688/689、创业板 300/301、北交所 8/4/9 开头）
MAIN_BOARD_PREFIX = ("600", "601", "603", "605", "000", "001", "002")

# ===== 六因子横截面评分模型（集中配置，screen_washout / evolve 共用，避免两处漂移）=====
# higher=True 表示「原始值越大 → 横截面分位越高（越看好）」；False 反之。
FACTORS = {
    "washout": {"higher": True,  "label": "洗盘强度"},
    "trend":   {"higher": True,  "label": "趋势"},
    "fund":    {"higher": True,  "label": "资金"},
    "vol":     {"higher": False, "label": "低波动"},           # 20日收益标准差，越低越稳
    "pos":     {"higher": False, "label": "相对强度(低回撤)"},  # 距250日高回撤越小越强（90日实证翻转）
    "liq":     {"higher": True,  "label": "流动性"},
}
# 90日大样本实证优化后的先验权重（2026-09-04 回溯落盘）：
#   vol/liq 正有效上调、pos 反向翻正、trend 弱下调、washout 保留策略筛下调、fund 中性低位。
FACTOR_WEIGHTS = {
    "S1": {"washout": 0.18, "trend": 0.10, "fund": 0.10, "vol": 0.26, "pos": 0.08, "liq": 0.28},
    "S2": {"washout": 0.20, "trend": 0.08, "fund": 0.10, "vol": 0.28, "pos": 0.05, "liq": 0.29},
}
# 资金因子口径失真上限：|主力净流入 / 成交额| 超过该百分比视为物理不可能（新浪/腾讯口径错位），记中性
FUND_RATIO_CAP = 100.0


def today_ymd():
    return datetime.now().strftime("%Y%m%d")


# ===== 自学习/验证统一数据窗口：最近 3 个月（约 90 自然日 / 66 交易日） =====
MONTHS_BACK = 3


def window_start_ymd(months=MONTHS_BACK, end_ymd=None):
    """返回「最近 N 个月」窗口起始日 YYYYMMDD（含当天往前推 N 个月）。"""
    end = end_ymd or today_ymd()
    d = datetime.strptime(end, "%Y%m%d")
    # 往前推 N 个月（跨月边界用近似：30.44 天/月，取整）
    d -= timedelta(days=int(months * 30.44))
    return d.strftime("%Y%m%d")


def is_main_board(code):
    return isinstance(code, str) and code.startswith(MAIN_BOARD_PREFIX)


def is_st(name):
    n = (name or "").upper()
    return "ST" in n or "退" in n


# 暴雷关键词（原因/公告文本命中即剔除），与共享 _risk_gate 同源
_RISK_REASON_KEYWORDS = [
    "立案", "调查", "违规", "处罚", "问询", "关注函", "警示函",
    "退市", "暂停上市", "终止上市", "业绩预亏", "预亏", "商誉减值",
    "财务造假", "诉讼", "质押爆仓", "停牌", "一字跌停",
]


def is_risk_reason(reason):
    r = str(reason or "")
    return any(k in r for k in _RISK_REASON_KEYWORDS)


def tencent_code(code):
    return ("sh" if code.startswith(("6", "9")) else "sz") + code


def latest_trade_day(target=None):
    """target YYYYMMDD（默认今日）往前最近的「可能交易日」（周一~五，不含节假日修正）。"""
    d = datetime.strptime(target or today_ymd(), "%Y%m%d")
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d.strftime("%Y%m%d")


def back_workdays(start_ymd, n_back=1):
    """从 start_ymd（含）往前/往回数 n_back 个工作日（周一到五，朴素不含节假日），返回 YYYYMMDD。"""
    d = datetime.strptime(start_ymd, "%Y%m%d")
    # 从 start 前一天开始回数
    got = 0
    while got < n_back:
        d -= timedelta(days=1)
        if d.weekday() < 5:
            got += 1
    return d.strftime("%Y%m%d")


def fmt_dash(ymd):
    """20260825 -> 2026-08-25"""
    return f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:8]}"


def load_json(path, default=None):
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return default if default is not None else {}


def dump_json(obj, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def dump_json_guard(obj, path, label=""):
    if not obj:
        tag = label or os.path.basename(path)
        print(f"  !! {tag} 本次为空，保留旧文件 {os.path.basename(path)}")
        return False
    dump_json(obj, path)
    return True


def safe_float(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def round1(x):
    return round(safe_float(x), 1)


def fetch_kline(code, n=130):
    """腾讯前复权日K线，返回 [{d,o,c,h,l,v}, ...]（升序旧→新）。复用 collect_stocks 同源镜像 host。"""
    import time
    import requests
    tc = ("sh" if code.startswith(("6", "9")) else "sz") + code
    url = f"https://proxy.finance.qq.com/ifzqgtimg/appstock/app/fqkline/get?param={tc},day,,,{n},qfq"
    ua = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
          "Chrome/117.0.0.0 Safari/537.36")
    for _ in range(2):
        try:
            data = requests.get(url, headers={"User-Agent": ua}, timeout=12).json() \
                .get("data", {}).get(tc, {})
            rows = data.get("qfqday") or data.get("day") or []
            out = []
            for r in rows:
                if len(r) < 6:
                    continue
                out.append({
                    "d": str(r[0]), "o": safe_float(r[1]), "c": safe_float(r[2]),
                    "h": safe_float(r[3]), "l": safe_float(r[4]), "v": safe_float(r[5]),
                })
            return out
        except Exception:
            time.sleep(0.6)
    return []