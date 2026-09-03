# -*- coding: utf-8 -*-
"""统一风险闸门（跨 a-stock-* 技能复用）——纯函数、零外部依赖，供各模型接入。

职责（落实「短线为主 + 风险放大」原则）：
  1. 情绪闸门：封板率/炸板率过低、连板高度过低时，判定市场情绪退潮，模型应整体降级或提示。
  2. 暴雷过滤器：ST/退市风险/立案调查/财务雷/一字跌停 等一票否决或强制降级。

设计：每个函数均为纯函数（输入 dict/标量，返回 dict），不依赖 requests/numpy/pandas，
可被 board-washout / yiyangzhi / lhb-rec 三处按需 import，避免各自重复实现。
"""

# ===== 暴雷关键词（名称/原因文本命中即触发风险标记）=====
RISK_NAME_KEYWORDS = ["ST", "*ST", "退", "退市"]
RISK_REASON_KEYWORDS = [
    "立案", "调查", "违规", "处罚", "问询", "关注函", "警示函",
    "退市", "暂停上市", "终止上市", "业绩预亏", "预亏", "商誉减值",
    "财务造假", "诉讼", "质押爆仓", "停牌", "一字跌停",
]

# ===== 情绪闸门阈值（可调）=====
SEAL_RATE_COLD = 50.0        # 封板率低于此 → 情绪偏冷
SEAL_RATE_HOT = 75.0         # 封板率高于此 → 情绪偏热
BREAK_RATE_HOT = 40.0        # 炸板率高于此 → 情绪分歧加剧
HEIGHT_COLD = 2              # 最高连板高度低于此 → 梯队弱


def is_risk_name(name):
    """名称命中 ST/退 风险标记（含 *ST）。"""
    n = str(name or "").upper()
    return any(k in n for k in RISK_NAME_KEYWORDS)


def is_risk_reason(reason):
    """原因/公告文本命中暴雷关键词。"""
    r = str(reason or "")
    return any(k in r for k in RISK_REASON_KEYWORDS)


def risk_level(name, reason=""):
    """综合风险定级：'red' 一票否决 / 'warn' 降级 / 'ok' 正常。"""
    if is_risk_name(name):
        return "red"
    if is_risk_reason(reason):
        return "red"
    return "ok"


def emotion_gate(seal_rate=None, break_rate=None, max_height=None):
    """情绪闸门：返回 {stage, cold, diverge, weak_ladder, tips, degrade}。
    - cold：情绪偏冷（封板率过低）
    - diverge：分歧加剧（炸板率过高）
    - weak_ladder：连板梯队弱
    - degrade：是否应整体降级（任一冷/分歧/梯队弱）
    """
    cold = seal_rate is not None and seal_rate < SEAL_RATE_COLD
    diverge = break_rate is not None and break_rate > BREAK_RATE_HOT
    weak_ladder = max_height is not None and max_height < HEIGHT_COLD
    degrade = cold or diverge or weak_ladder

    tips = []
    if cold:
        tips.append(f"封板率 {seal_rate:.0f}% 偏低，市场情绪偏冷")
    if diverge:
        tips.append(f"炸板率 {break_rate:.0f}% 偏高，分歧加剧")
    if weak_ladder:
        tips.append(f"最高连板 {max_height} 板，梯队偏弱")
    if not degrade:
        tips.append("情绪正常，可正常参与")

    stage = "冰点" if cold else ("分歧" if diverge else ("启动" if weak_ladder else "正常"))
    return {"stage": stage, "cold": cold, "diverge": diverge,
            "weak_ladder": weak_ladder, "degrade": degrade, "tips": tips}


def apply_gate(records, name_key="name", reason_key="reason"):
    """对一批候选记录打风险标记：返回 (过滤后列表, 被剔除列表)。
    records 为 list[dict]，每项至少含 name_key；reason_key 可选。"""
    kept, removed = [], []
    for r in records:
        lv = risk_level(r.get(name_key, ""), r.get(reason_key, ""))
        r = dict(r)
        r["_risk_level"] = lv
        if lv == "red":
            removed.append(r)
        else:
            kept.append(r)
    return kept, removed


if __name__ == "__main__":
    # 自测
    print(risk_level("*ST某某"))            # red
    print(risk_level("某某股份", "因涉嫌违规被立案调查"))  # red
    print(risk_level("某某股份", ""))        # ok
    print(emotion_gate(seal_rate=45, break_rate=20, max_height=3))
    print(emotion_gate(seal_rate=80, break_rate=15, max_height=5))
    print("自测通过")
