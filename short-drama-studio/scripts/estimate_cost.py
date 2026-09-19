#!/usr/bin/env python3
"""
estimate_cost.py — 短剧工程生成前成本预估（零 API 调用，dry-run 性质）

预算防线（P0）：在任何批量生成（frames/clips/audio）之前，先跑本脚本向用户播报
「预估调用次数与费用区间」，确认后再投放。与 cost_tracker.py 的「实际结算」
构成「预估 vs 实际」闭环（ArcReel 方法论）。

用法：
  python3 scripts/estimate_cost.py /path/to/production.json
  python3 scripts/estimate_cost.py /path/to/production.json --pricing-custom video_per_s=0.10

读取内容：production.json 的镜头表、characters、locations、audio 配置。
不读网络、不写文件（除 stdout），失败退出码非 0。
"""
import argparse
import json
import sys
from pathlib import Path

# 与 cost_tracker.DEFAULT_PRICING 保持一致（元）
DEFAULT_PRICING = {
    "text_per_1k_tokens": 0.01,
    "image_2k": 0.08,
    "video_720p_per_second": 0.06,
}


def _num(v, default=0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def estimate(prod: dict, pricing: dict) -> dict:
    shots = prod.get("shots") or prod.get("clips") or []
    if isinstance(shots, dict):
        shots = list(shots.values())
    n_shots = len(shots)

    video_seconds = sum(
        max(4.0, min(12.0, _num(s.get("seconds"), 10.0))) for s in shots
    ) if shots else 0.0

    characters = prod.get("characters") or []
    locations = prod.get("locations") or []

    # 图像：定妆照(1/角色，仅作兜底) + 角色卡(1/角色) + 场景图(1/场景) + 关键帧(N+1) + QA 重画余量
    portraits = len(characters)
    sheets = len(characters)
    locs = len(locations)
    keyframes = (n_shots + 1) if shots else 0
    qa_regen_margin = int((portraits + sheets + locs + keyframes) * 0.15)  # 15% 重画余量
    image_count = portraits + sheets + locs + keyframes + qa_regen_margin

    # 文本：剧本+分镜（~30K tokens）+ QA 巡检（0.3K/帧）+ 分镜重写余量
    text_tokens = 30000 + int(keyframes * 0.3 * 1000)

    # 配音：edge-tts 本地免费；BGM 用户自备
    audio_mode = "edge-tts（本地免费）/自备/无配音"

    image_cost = image_count * pricing["image_2k"]
    video_cost = video_seconds * pricing["video_720p_per_second"]
    text_cost = text_tokens / 1000 * pricing["text_per_1k_tokens"]
    total = image_cost + video_cost + text_cost

    return {
        "n_shots": n_shots,
        "n_characters": len(characters),
        "n_locations": len(locations),
        "image_breakdown": {
            "portraits": portraits,
            "character_sheets": sheets,
            "location_refs": locs,
            "keyframes": keyframes,
            "qa_regen_margin_15pct": qa_regen_margin,
            "total": image_count,
        },
        "video_seconds": round(video_seconds, 1),
        "text_tokens_k": round(text_tokens / 1000, 1),
        "costs": {
            "image": round(image_cost, 2),
            "video": round(video_cost, 2),
            "text": round(text_cost, 4),
            "total": round(total, 2),
        },
        "audio_mode": audio_mode,
    }


def main():
    ap = argparse.ArgumentParser(description="短剧生成前成本预估（零 API 调用）")
    ap.add_argument("production", help="production.json 路径")
    ap.add_argument("--pricing-custom", action="append", default=[],
                    help="覆盖价格，如 video_per_s=0.10 / image_2k=0.10 / text_per_1k=0.02")
    args = ap.parse_args()

    p = Path(args.production)
    if not p.exists():
        print(f"ERROR: 文件不存在: {p}", file=sys.stderr)
        sys.exit(1)
    try:
        prod = json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"ERROR: JSON 解析失败: {e}", file=sys.stderr)
        sys.exit(1)

    pricing = dict(DEFAULT_PRICING)
    for kv in args.pricing_custom:
        k, _, v = kv.partition("=")
        key = {"video_per_s": "video_720p_per_second", "image_2k": "image_2k",
               "text_per_1k": "text_per_1k_tokens"}.get(k.strip())
        if not key:
            print(f"ERROR: 未知价格项 {kv}（可用：video_per_s/image_2k/text_per_1k）", file=sys.stderr)
            sys.exit(1)
        pricing[key] = _num(v, pricing[key])

    r = estimate(prod, pricing)

    print("=" * 56)
    print("生成前成本预估（预估 vs 实际：实际见 out/work/cost_tracking.json）")
    print("=" * 56)
    b = r["image_breakdown"]
    print(f"镜头数        : {r['n_shots']}  角色 {r['n_characters']}  场景 {r['n_locations']}")
    print(f"图像（估算）  : {b['total']:>4} 张"
          f"（定妆 {b['portraits']} + 角色卡 {b['character_sheets']} + 场景 {b['location_refs']}"
          f" + 关键帧 {b['keyframes']} + 15% 重画余量 {b['qa_regen_margin_15pct']}）→ ¥{r['costs']['image']:.2f}")
    print(f"视频（估算）  : {r['video_seconds']:>6.0f} 秒（720P）→ ¥{r['costs']['video']:.2f}")
    print(f"文本（估算）  : {r['text_tokens_k']:>6.0f}K tokens → ¥{r['costs']['text']:.4f}")
    print(f"配音          : {r['audio_mode']}")
    print("-" * 56)
    print(f"合计（刊例）  : ¥{r['costs']['total']:.2f}"
          f"   （Agnes 限时免费期实际 ¥0；仍需关注限流：视频约 1 次/分钟）")
    print("=" * 56)
    print("确认无误后再执行：pipeline.py --stage frames / clips（预算防线：先确认，后投放）")


if __name__ == "__main__":
    main()
