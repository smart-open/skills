# -*- coding: utf-8 -*-
"""共享工具库：BASE 路径、JSON 读写、安全类型转换，以及跨脚本公共常量。"""
import os
import json
import time
import urllib.request
from datetime import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # 技能安装目录(脚本所在根)
# 会话工作根：所有可写产物（数据/过程脚本）收敛到「当前会话/工作目录(os.getcwd())」下的
# <技能名>/ 子目录，不埋进技能安装目录。优先级：A_STOCK_WORK（技能工作区根）> 当前工作目录。
_SKILL_NAME = "a-stock-operator-v2"
WORK_DIR = os.environ.get("A_STOCK_WORK") or os.path.join(os.getcwd(), _SKILL_NAME)
# 采集/分析数据根 = <WORK_DIR>/data  （data/*.json：market_/recommend_/boards_15d/zt_15d/fund_15d 等）
DATA_DIR = os.path.join(WORK_DIR, "data")
# 最终报告输出根 = 「当前会话/工作目录」根（Markdown，带日期，不放进技能名子目录）。
# 历史兼容字段 A_STOCK_OUT 仍生效：指向固定报告目录。
REPORT_ROOT = os.environ.get("A_STOCK_OUT") or os.getcwd()

# ===== 公共配色（A股约定：涨红 / 跌绿 / 中性灰 / 板块默认灰）=====
UP_COLOR = "#ff4d5e"
DOWN_COLOR = "#2bd99f"
WARN_COLOR = "#ffb454"
MUTED_COLOR = "#7b89a8"
GOLD_COLOR = "#f5c451"
ACC_COLOR = "#4f8cff"
ACC2_COLOR = "#22d3ee"
BOARD_FALLBACK_COLOR = "#9aa5b5"

# ===== 情绪周期（Model 04）：五阶段（顺序即温度计刻度）+ 阶段配色 =====
EMOTION_STAGES = ["冰点", "启动", "发酵", "高潮", "分歧"]
EMOTION_STAGE_COLORS = {
    "高潮": UP_COLOR,
    "发酵": WARN_COLOR,
    "启动": ACC2_COLOR,
    "冰点": DOWN_COLOR,
    "分歧": MUTED_COLOR,
}

# 情绪温度六因子权重 / 风险四因子权重
# 温度新增「赚钱效应（昨日涨停晋级率）」因子（P9）：短线择时核心，权重与涨停家数/封板率同档
TEMPERATURE_W = {"zt": 0.20, "seal": 0.20, "height": 0.15, "lianban": 0.10, "breadth": 0.15, "profit": 0.20}
RISK_W = {"break": 0.30, "loss": 0.30, "overheat": 0.20, "diverge": 0.20}

# 因子展示标签
TEMP_FACTOR_LABELS = {"zt": "涨停家数", "seal": "封板率", "height": "连板高度", "lianban": "连板家数",
                      "breadth": "市场宽度", "profit": "赚钱效应"}
RISK_FACTOR_LABELS = {"break": "炸板率", "loss": "亏钱效应", "overheat": "过热", "diverge": "背离"}

# 赚钱效应满温基准：昨日涨停池「今日晋级率」达到该值即满温 100 度（强势市可到 40%~60%）
PROFIT_FULL = 50.0


def today_ymd():
    """当前日期 YYYYMMDD，作为各脚本 --date 默认值的统一入口。"""
    return datetime.now().strftime("%Y%m%d")


# ===== 自学习/验证统一数据窗口：最近 3 个月（约 90 自然日 / 66 交易日） =====
MONTHS_BACK = 3


def window_start_ymd(months=MONTHS_BACK, end_ymd=None):
    """返回「最近 N 个月」窗口起始日 YYYYMMDD（含当天往前推 N 个月）。"""
    end = end_ymd or today_ymd()
    d = datetime.strptime(end, "%Y%m%d")
    d -= timedelta(days=int(months * 30.44))
    return d.strftime("%Y%m%d")


def latest_trade_day(target=None):
    """target YYYYMMDD（默认今日）往前最近的「可能交易日」（周一~五，不含节假日修正）。"""
    from datetime import timedelta
    d = datetime.strptime(target or today_ymd(), "%Y%m%d")
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d.strftime("%Y%m%d")


def seal_break_rates(total_up, total_zb):
    """封板率 / 炸板率（%）。分母为空时返回 (0, 0)。"""
    denom = total_up + total_zb
    if not denom:
        return 0, 0
    return round(total_up / denom * 100, 1), round(total_zb / denom * 100, 1)


def trend_tag(cum15, cum5):
    """板块趋势状态标签：启动/加速/减速/回落；中性返回空串。
    cum15=15 日累计涨幅%，cum5=5 日累计涨幅%。含除零保护（cum15>0 时才比较占比）。"""
    if cum15 <= 0 < cum5:
        return "启动"
    if cum15 > 0 and cum5 < 0:
        return "回落"
    if cum15 > 0 and cum5 > 0:
        ratio = cum5 / cum15
        if ratio >= 0.5:
            return "加速"
        if ratio < 0.3:
            return "减速"
    return ""


# ===== 同花顺短名 ↔ 东财板块名桥接（历史涨停/涨幅维度对齐动态热点名） =====
# 14 个同花顺核心板块的短名与匹配关键词（单一来源，collect_zt_15d 与各模型脚本共用）。
THS_BOARD_KEYWORDS = {
    "CPO": ["CPO", "共封装光学", "光模块"],
    "F5G": ["F5G"],
    "光纤": ["光纤", "光缆", "光通信"],
    "铜缆高速连接": ["铜缆", "高速连接"],
    "液冷服务器": ["液冷"],
    "存储芯片": ["存储芯片"],
    "创新药": ["创新药"],
    "CRO": ["CRO", "医药外包", "CXO"],
    "减肥药": ["减肥药", "GLP"],
    "重组蛋白": ["重组蛋白"],
    "稀土永磁": ["稀土", "永磁", "磁材"],
    "青蒿素": ["青蒿素"],
    "机器人": ["机器人"],
    "光刻机": ["光刻机", "光刻"],
}


def bridge_ths_name(name):
    """东财板块名 → 同花顺短名（用于 zt_15d 涨停历史维度对齐）。
    东财概念名常为短名超集或带「概念/板块/行业」后缀（如「CPO概念」→「CPO」）。
    已为同花顺短名时原样返回；无匹配返回 None。"""
    if not name:
        return None
    if name in THS_BOARD_KEYWORDS:
        return name
    for ths, kws in THS_BOARD_KEYWORDS.items():
        if any(k and k in name for k in kws):
            return ths
    return None


def boards_chg_lookup(boards, name):
    """从 boards_15d（东财板块名键）取某板块的涨幅序列 [(date, chg%), ...]。
    先精确匹配东财名，再桥接同花顺短名兜底（兼容旧 14 板块数据），未命中返回 []。"""
    if not name:
        return []
    if name in boards:
        return boards[name]
    ths = bridge_ths_name(name)
    if ths and ths in boards:
        return boards[ths]
    return []


# ===== 六维诊断双权重（短线/中线持仓周期切换评分）=====
# 权重按键（六维 code，D1~D6）映射，两套权重各合计 100。六维依次为：
# D1 宏观行业 / D2 基本面估值 / D3 技术趋势 / D4 资金面 / D5 筹码结构 / D6 题材情绪。
# 短线更重「技术/资金/情绪」，中线更重「行业/基本面/筹码」。
DIM_SHORT_W = {"D1": 8, "D2": 8, "D3": 22, "D4": 22, "D5": 12, "D6": 28}
DIM_MID_W = {"D1": 20, "D2": 26, "D3": 14, "D4": 16, "D5": 16, "D6": 8}


def dim_weight(dim, horizon):
    """某维度在指定持仓周期（short/mid）下的权重。
    优先用 JSON 显式 weight_short/weight_mid 覆盖，其次 _common 的 code 映射，
    最后回退 dim 自身 weight（旧单权重数据优雅降级）。"""
    if horizon == "short":
        return safe_float(dim.get("weight_short"), safe_float(DIM_SHORT_W.get(dim.get("code", "")), dim.get("weight", 0)))
    return safe_float(dim.get("weight_mid"), safe_float(DIM_MID_W.get(dim.get("code", "")), dim.get("weight", 0)))


def load_json(path, default=None):
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return default if default is not None else {}


def dump_json(obj, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def dump_json_guard(obj, path, label=""):
    """空数据保护：obj 为空 dict/list 时不落盘（保留已有旧文件），打印警告并返回 False。
    采集脚本统一用它防止「请求全失败 → 空 {} 覆盖好数据」。"""
    if not obj:
        tag = label or os.path.basename(path)
        if os.path.exists(path):
            print(f"  !! {tag} 本次采集为空，保留旧文件 {os.path.basename(path)}")
        else:
            print(f"  !! {tag} 本次采集为空，未落盘")
        return False
    dump_json(obj, path)
    return True


def read_text(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def write_text(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def safe_float(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


# ===== 同花顺板块指数兜底源（东财 push2his 被风控时的备用数据源）=====
# 同花顺板块代码体系：行业板块 881xxx、概念板块 885xxx（6 位）。
# 接口：d.10jqka.com.cn/v6/line/bk_{code}/01/last.js —— data 字段为分号分隔日K线，
#       每条 `日期,开,高,低,收,成交量,成交额,,,,0`，日期为完整 YYYYMMDD。
_THS_BOARD_CODE_CACHE = None   # {板块名: 同花顺6位代码}，进程内缓存，避免重复抓列表页
_THS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


def _ths_http_text(url, referer):
    req = urllib.request.Request(url, headers={"User-Agent": _THS_UA, "Referer": referer})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            return resp.read().decode("gbk", "ignore")
    except Exception:
        return ""


def fetch_ths_board_codes():
    """抓同花顺「概念+行业」板块列表，返回 {板块名: 6位板块指数代码}。
    - 概念板块：取 gnSection 隐藏 JSON 的 platecode（885xxx 指数代码，详情页 cid 30xxxx 不可用于日线）
    - 行业板块：详情页 thshy/detail/code/ 的代码即指数代码（881xxx）
    两页各 ~300/90 板块，失败返回 {}（不阻塞主流程）。结果进程内缓存。"""
    global _THS_BOARD_CODE_CACHE
    if _THS_BOARD_CODE_CACHE is not None:
        return _THS_BOARD_CODE_CACHE
    import re as _re
    import html as _html
    mapping = {}

    # ① 概念板块：解析 gnSection JSON（platecode → 板块名）
    gn_html = _ths_http_text("http://q.10jqka.com.cn/gn/", "http://q.10jqka.com.cn/")
    m = _re.search(r"id=\"gnSection\"\s+value='([^']*)'", gn_html)
    if not m:
        m = _re.search(r"id=\"gnSection\"\s+value=\"([^\"]*)\"", gn_html)
    if m:
        try:
            sec = json.loads(_html.unescape(m.group(1)))
            for _k, v in sec.items():
                pcode = v.get("platecode")
                pname = v.get("platename")
                if pcode and pname:
                    mapping.setdefault(pname.strip(), pcode)
        except Exception:
            pass

    # ② 行业板块：详情页代码即指数代码（881xxx）
    hy_html = _ths_http_text("http://q.10jqka.com.cn/thshy/", "http://q.10jqka.com.cn/")
    for code, name in _re.findall(r"thshy/detail/code/(\d+)/[^>]*>([^<]*)</a>", hy_html):
        if code and name:
            mapping.setdefault(name.strip(), code)

    _THS_BOARD_CODE_CACHE = mapping
    return mapping


def ths_board_chg_history(ths_code, days):
    """同花顺板块指数近 N 日涨跌幅历史，返回 [(YYYYMMDD, 涨跌幅%), ...]（旧→新）。
    涨跌幅由相邻收盘价计算（首日无前值记 0.0）；失败返回 []。"""
    if not ths_code:
        return []
    url = f"http://d.10jqka.com.cn/v6/line/bk_{ths_code}/01/last.js"
    req = urllib.request.Request(url, headers={
        "User-Agent": _THS_UA,
        "Referer": "http://q.10jqka.com.cn/gn/detail/code/301558/",
    })
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            raw = resp.read().decode("utf-8", "ignore")
    except Exception:
        return []
    import re as _re
    m = _re.search(r"\((.*)\)", raw, _re.S)
    if not m:
        return []
    try:
        obj = json.loads(m.group(1))
    except Exception:
        return []
    data = obj.get("data") or ""
    closes = []          # [(YYYYMMDD, 收盘价)]
    for line in data.split(";"):
        p = line.split(",")
        if len(p) < 5:
            continue
        try:
            closes.append((p[0], float(p[4])))   # p[4] = 收盘
        except (ValueError, IndexError):
            continue
    if not closes:
        return []
    closes = closes[-days:]
    out = []
    prev = None
    for date, c in closes:
        chg = round((c / prev - 1) * 100, 2) if prev else 0.0
        out.append((date, chg))
        prev = c
    return out