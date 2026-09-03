# -*- coding: utf-8 -*-
"""主线/边缘过滤：识别当日热点概念与行业，对候选股标注主线标签并过滤边缘偶发股。

数据源（东财 push2，高频需节流）：
  - 行业板块榜   clist/get fs=m:90+t:2  字段 f12(代码) f14(名称) f3(涨幅)
  - 概念板块榜   clist/get fs=m:90+t:3
  - 个股题材     stock/get         字段 f127(行业) f129(概念,逗号分隔)

分类优先级：hot(当日热点) > main_line(中长期主线) > excluded(边缘/偶发) > neutral。
命中主线即豁免排除（例如"化工"在 EXCLUDE 但个股含"锂电/新材料"主线词时保留）。
"""
from __future__ import annotations
import os, sys, time, threading
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _common as C

# 规则词表（可被 theme_rules.json 覆盖：{"main_line": [...], "exclude": [...]}）
RULES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "theme_rules.json")

# 风格/技术标签（非产业题材，识别热点时剔除，避免"昨日连板/历史新高/次新股"被当成主线）
STYLE_BOARDS = {
    "昨日连板", "昨日连板_含一字", "昨日炸板", "昨日打二板以上表现",
    "历史新高", "次新股", "超跌股", "昨日涨停", "昨日触板", "昨日跌停",
    "融资融券", "MSCI", "沪深股通", "深股通", "沪股通", "机构重仓", "基金重仓",
    "央视50", "上证50", "中字头", "破净股", "高送转", "预盈预增", "预亏预减",
    "QFII重仓", "社保重仓", "标准普尔", "富时罗素", "创业板综", "深证100",
}

# 中长期主线关键词（概念/行业名子串匹配）
MAIN_LINE = [
    # 军工 / 国防
    "军工", "国防", "军民融合", "航天", "航空", "兵装", "舰船", "导弹", "大飞机",
    "商业航天", "卫星", "无人机", "航母", "地面兵装",
    # 科技主线
    "消费电子", "半导体", "芯片", "集成电路", "算力", "数据中心", "东数西算",
    "液冷", "光模块", "CPO", "铜缆", "人工智能", "AIGC", "大模型", "机器人",
    "智能驾驶", "车联网", "汽车零部件", "低空经济", "飞行汽车", "eVTOL", "脑机接口",
    "折叠屏", "苹果", "华为概念", "信创", "国产软件", "数据要素", "网络安全", "智慧城市",
    # 能源 / 电力
    "电网", "电力设备", "特高压", "智能电网", "储能", "新能源", "光伏", "风电",
    "氢能源", "核电", "充电桩", "柔性直流",
    # 新材料 / 高端制造
    "新材料", "碳纤维", "稀土", "超硬材料", "钛合金", "高温合金", "磁性材料",
]

# 边缘 / 公告偶发 / 冷门（命中剔除）
EXCLUDE = [
    # 地产 / 消费 / 家居
    "房地产", "地产", "物业", "园区开发", "零售", "百货", "商业连锁", "商业贸易",
    "服装", "纺织", "鞋帽", "家纺", "家居", "家具", "装修装饰",
    # 公用事业 / 环保
    "燃气", "供热", "热电", "水务", "自来水", "环保", "污水处理", "园林",
    # 旅游 / 影视 / 宠物
    "旅游", "酒店", "景区", "景点", "餐饮", "影视", "动漫", "宠物",
    # 农业 / 养殖
    "农业", "农产品", "化肥", "农药", "种业", "养殖", "饲料", "渔业", "水产", "粮食",
    # 金融
    "银行", "保险", "证券", "券商", "非银", "多元金融", "期货", "信托",
    # 强周期 / 冷门
    "石油", "石化", "化工", "化学", "化学制品", "造纸", "包装", "印刷",
    "黄金", "贵金属", "珠宝", "钢铁", "煤炭", "水泥", "建材",
    # 医疗（政策主线时可通过 theme_rules.json 移除）
    "医疗", "医药", "生物制品", "医疗服务", "医疗器械",
]


def _rules():
    d = C.load_json(RULES_PATH, {})
    return {
        "main_line": d.get("main_line", MAIN_LINE),
        "exclude": d.get("exclude", EXCLUDE),
    }


def _secid(code):
    c = str(code).zfill(6)
    return ("1." + c) if c.startswith(("6", "9")) else ("0." + c)


_lock = threading.Lock()
_last = [0.0]


def _throttle(wait=0.35):
    with _lock:
        d = wait - (time.time() - _last[0])
        if d > 0:
            time.sleep(d)
        _last[0] = time.time()


# ===== 当日热点识别 =====
def fetch_board_rank(fs, top_n=40):
    """抓板块涨幅榜，返回 [(name, chg), ...]（剔除风格标签）"""
    import requests as _rq
    hosts = ["https://push2.eastmoney.com", "https://82.push2.eastmoney.com",
             "https://push2delay.eastmoney.com"]
    params = {"pn": "1", "pz": str(top_n), "po": "1", "np": "1", "fltt": "2",
              "invt": "2", "fid": "f3", "fs": fs, "fields": "f12,f14,f3"}
    for h in hosts:
        try:
            r = _rq.get(h + "/api/qt/clist/get", params=params,
                        headers={"User-Agent": C.UA}, timeout=12)
            d = (r.json().get("data") or {}).get("diff")
            if isinstance(d, list) and d:
                out = []
                for it in d:
                    nm = str(it.get("f14", ""))
                    if nm and nm not in STYLE_BOARDS:
                        out.append((nm, C.safe_float(it.get("f3"))))
                return out
        except Exception:
            continue
    return []


def fetch_hot_boards(concept_n=30, industry_n=20):
    """返回 (hot_concepts:set, hot_industries:set, board_brief:dict)"""
    hot_concepts, hot_industries = set(), set()
    for nm, _chg in fetch_board_rank("m:90+t:3", concept_n * 3):
        if len(hot_concepts) >= concept_n:
            break
        hot_concepts.add(nm)
    for nm, _chg in fetch_board_rank("m:90+t:2", industry_n * 3):
        if len(hot_industries) >= industry_n:
            break
        hot_industries.add(nm)
    brief = {
        "热点概念": list(hot_concepts)[:15],
        "热点行业": list(hot_industries)[:15],
    }
    return hot_concepts, hot_industries, brief


# ===== 个股题材 =====
def fetch_stock_theme(code):
    """返回 {"industry": str, "concepts": list[str]}；失败返回空（不阻断扫描，仅丢失标签）"""
    import requests as _rq
    hosts = ["https://push2.eastmoney.com", "https://82.push2.eastmoney.com",
             "https://push2delay.eastmoney.com"]
    params = {"secid": _secid(code), "fields": "f57,f58,f127,f129",
              "ut": "fa5fd1943c7b386f172d6893dbfba10b"}
    for h in hosts:
        try:
            _throttle()
            r = _rq.get(h + "/api/qt/stock/get", params=params,
                        headers={"User-Agent": C.UA}, timeout=10)
            d = (r.json().get("data") or {})
            if d:
                return {
                    "industry": str(d.get("f127", "") or ""),
                    "concepts": [x for x in str(d.get("f129", "") or "").split(",") if x],
                }
        except Exception:
            time.sleep(0.3)
    return {"industry": "", "concepts": []}


# ===== 分类 =====
def classify(stock, hot_concepts, hot_industries, rules=None):
    """给候选打标签；返回 {"tag", "matched"} tag ∈ hot|main_line|excluded|neutral"""
    rules = rules or _rules()
    industry = (stock.get("industry") or "").strip()
    concepts = stock.get("concepts") or []
    full = " ".join(concepts)
    if industry:
        full = industry + " " + full

    hot_hits = []
    if industry and industry in hot_industries:
        hot_hits.append(industry)
    for c in concepts:
        if c in hot_concepts or c in hot_industries:
            hot_hits.append(c)
    if hot_hits:
        return {"tag": "hot", "matched": hot_hits[:6]}

    main_hits = [k for k in rules["main_line"] if k in full]
    if main_hits:
        return {"tag": "main_line", "matched": main_hits[:6]}

    exc_hits = [k for k in rules["exclude"] if k in full]
    if exc_hits:
        return {"tag": "excluded", "matched": exc_hits[:6]}

    return {"tag": "neutral", "matched": []}


def annotate(results, hot_concepts, hot_industries, rules=None):
    """给结果列表逐只加 theme 字段，返回 (kept, excluded) 两组"""
    kept, excluded = [], []
    for ev in results:
        tag = classify(ev, hot_concepts, hot_industries, rules)
        ev["theme"] = tag["tag"]
        ev["theme_matched"] = "、".join(tag["matched"])
        (excluded if tag["tag"] == "excluded" else kept).append(ev)
    return kept, excluded


TAG_LABEL = {"hot": "热点", "main_line": "主线", "neutral": "非主线", "excluded": "剔除"}

if __name__ == "__main__":
    import json as _j
    if len(sys.argv) > 1 and sys.argv[1] == "hot":
        _hc, _hi, brief = fetch_hot_boards()
        print(_j.dumps(brief, ensure_ascii=False, indent=1))
    elif len(sys.argv) > 1:
        code = sys.argv[1]
        t = fetch_stock_theme(code)
        print(code, t)
        hc, hi, _ = fetch_hot_boards()
        tag = classify({"industry": t["industry"], "concepts": t["concepts"]}, hc, hi)
        print(_j.dumps(tag, ensure_ascii=False, indent=1))
    else:
        print("用法: python theme_filter.py hot | <code>")