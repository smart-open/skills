# -*- coding: utf-8 -*-
"""首板洗盘选股器 共享工具库：路径/JSON 读写/安全转换/代码段判断/交易日/配色常量。

路径约定：
- BASE（本技能目录）：存过程产物 data/*.json（采集缓存、筛选结果），相对 __file__ 推导，免改路径。
- OUT_DIR（报告输出目录）：最终报告（Markdown/HTML）外置到当前会话根目录，避免污染技能库；
  可用环境变量 WASHOUT_OUT 覆盖（绝对或相对 cwd 均可）。
"""
import os
import json
from datetime import datetime, timedelta

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _out_dir():
    """报告输出目录：env WASHOUT_OUT > 当前会话根目录(cwd)。"""
    out = os.environ.get("WASHOUT_OUT", "").strip()
    if out:
        return out if os.path.isabs(out) else os.path.abspath(out)
    return os.getcwd()


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


def today_ymd():
    return datetime.now().strftime("%Y%m%d")


def is_main_board(code):
    return isinstance(code, str) and code.startswith(MAIN_BOARD_PREFIX)


def is_st(name):
    n = (name or "").upper()
    return "ST" in n or "退" in n


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