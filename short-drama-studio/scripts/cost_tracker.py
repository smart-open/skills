#!/usr/bin/env python3
"""
cost_tracker.py — 短剧流水线成本追踪器

设计依据 ArcReel 方法论：「预估 vs 实际」作为一等公民，生成前报预估、
生成后结算，按类型/模型/供应商分列，让用户知道每一步花了多少钱。

当前只有 Agnes 一家供应商，未来接入多供应商时扩展 provider 字段即可。

用法（在脚本开头）：
  from cost_tracker import tracker
  tracker.set_output_file(project_dir / "work" / "cost_tracking.json")

agnes_client 里所有生成函数在完成后会调 tracker.record(...)，
无需各业务脚本手动埋点。

价格（按公开资料的经验估算，非精确账单）：
  - 文本：¥0.01 / 1K tokens（输入+输出合计，agnes-3.0-flash 级别）
  - 图像 2K：¥0.08 / 张（agnes-image-2.5-flash，多图合成按同价）
  - 视频 720P 10s：¥0.6 / 条（agnes-video-2.5-flash）
  - 视频 720P 5s：  ¥0.3 / 条

注：价格为估算值，实际以供应商账单为准。tracker 里用 strategy 字段可随时替换计费策略。
"""
import json
import time
import threading
from pathlib import Path
from datetime import datetime, timezone

# ---- 默认估算价格（单位：元） ----
DEFAULT_PRICING = {
    "text_per_1k_tokens": 0.01,
    "image_2k": 0.08,
    "video_720p_per_second": 0.06,  # 10s ≈ 0.6
}


class CostTracker:
    """全局单例成本追踪器。线程安全。"""

    def __init__(self):
        self._lock = threading.Lock()
        self._events = []
        self._summary = {
            "text_tokens": 0,
            "text_cost": 0.0,
            "image_count": 0,
            "image_cost": 0.0,
            "video_count": 0,
            "video_seconds": 0,
            "video_cost": 0.0,
            "total_cost": 0.0,
        }
        self._output_file = None
        self._pricing = dict(DEFAULT_PRICING)

    def set_output_file(self, path):
        """设置 JSON 输出文件，每次记录后写入（原子写）。"""
        self._output_file = Path(path)
        self._output_file.parent.mkdir(parents=True, exist_ok=True)

    def set_pricing(self, **kwargs):
        """覆盖默认价格策略。"""
        with self._lock:
            self._pricing.update(kwargs)

    def record(self, event_type, **kwargs):
        """记录一次生成事件。

        event_type:
          - "text"    : kwargs 需含 model, prompt_tokens, completion_tokens
          - "image"   : kwargs 需含 model, size, ratio, has_refs(bool)
          - "video"   : kwargs 需含 model, seconds, resolution, mode
          - "download": 不计费，仅记录
        """
        ts = datetime.now(timezone.utc).isoformat()
        cost = self._estimate(event_type, kwargs)
        event = {
            "ts": ts,
            "type": event_type,
            "cost": cost,
            **kwargs,
        }
        with self._lock:
            self._events.append(event)
            self._update_summary(event_type, cost, kwargs)
            if self._output_file:
                self._flush_locked()
        return cost

    def _estimate(self, event_type, kw):
        p = self._pricing
        if event_type == "text":
            total = (kw.get("prompt_tokens", 0) + kw.get("completion_tokens", 0)) / 1000
            return round(total * p["text_per_1k_tokens"], 4)
        if event_type == "image":
            return p["image_2k"]  # 当前全 2K
        if event_type == "video":
            secs = float(kw.get("seconds", 10))
            return round(secs * p["video_720p_per_second"], 2)
        return 0.0

    def _update_summary(self, event_type, cost, kw):
        s = self._summary
        s["total_cost"] = round(s["total_cost"] + cost, 4)
        if event_type == "text":
            s["text_tokens"] += kw.get("prompt_tokens", 0) + kw.get("completion_tokens", 0)
            s["text_cost"] = round(s["text_cost"] + cost, 4)
        elif event_type == "image":
            s["image_count"] += 1
            s["image_cost"] = round(s["image_cost"] + cost, 4)
        elif event_type == "video":
            s["video_count"] += 1
            s["video_seconds"] += float(kw.get("seconds", 0))
            s["video_cost"] = round(s["video_cost"] + cost, 4)

    def _flush_locked(self):
        """写入 JSON（带原子写）。"""
        out = self._output_file
        if not out:
            return
        payload = {
            "summary": dict(self._summary),
            "pricing": dict(self._pricing),
            "event_count": len(self._events),
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "events": list(self._events[-200:]),  # 只保留最近 200 条，避免文件过大
            "note": "价格为估算值，实际以供应商账单为准",
        }
        tmp = out.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(out)

    def summary(self):
        with self._lock:
            return dict(self._summary)

    def print_summary(self):
        s = self.summary()
        lines = [
            "=" * 50,
            "成本追踪（估算）",
            "=" * 50,
            f"文本  : {s['text_tokens']:>6} tokens  ¥{s['text_cost']:.4f}",
            f"图像  : {s['image_count']:>6} 张     ¥{s['image_cost']:.4f}",
            f"视频  : {s['video_count']:>6} 条 / {s['video_seconds']:.0f}s  ¥{s['video_cost']:.2f}",
            "-" * 50,
            f"合计  : ¥{s['total_cost']:.2f}",
            "=" * 50,
        ]
        return "\n".join(lines)


# 全局单例
tracker = CostTracker()
