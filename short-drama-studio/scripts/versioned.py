#!/usr/bin/env python3
"""
versioned.py — 版本历史 + 幂等任务 两个底层能力

依据 ArcReel 方法论：
  - 重新生成不应覆盖旧文件（版本历史 + 可回滚）
  - 进程崩溃不应重复扣费（幂等任务 + .pending 标记）

用法：

1) 版本历史 — 覆盖前归档旧文件
   from versioned import archive_old_file
   archive_old_file(out_path, keep=3)   # 旧文件移到 versions/，保留最近 3 版

2) 幂等任务 — 生成前后写标记文件，防崩溃重复扣费
   from versioned import pending_guard
   with pending_guard(out_path) as guard:
       if guard.already_done:
           continue           # 上一次已完成，跳过
       if guard.was_pending:
           ...                # 上一次崩在生成中，可选跳过或走兜底
       url = generate(...)     # 真正的生成调用
       guard.mark_done(url)    # 落盘 + 清标记
"""
import json
import shutil
import time
from pathlib import Path


# ========== 1. 版本历史 ==========

def archive_old_file(file_path: str | Path, keep: int = 3) -> Path | None:
    """把现有文件归档到 versions/ 子目录，保留最近 keep 个旧版本。

    返回归档后的路径（如已归档）；文件不存在则返回 None。
    命名：versions/<文件名>.<时间戳>.ext
    """
    p = Path(file_path)
    if not p.exists():
        return None
    ver_dir = p.parent / "versions"
    ver_dir.mkdir(exist_ok=True)
    ts = time.strftime("%Y%m%d_%H%M%S") + f"_{int(time.time()*1000)%1000:03d}"
    archived = ver_dir / f"{p.stem}.{ts}{p.suffix}"
    shutil.copy2(p, archived)  # 复制保留，不删原文件（调用方会覆盖原文件）

    # 清理超出 keep 数量的旧版本（同名文件按时间排序，留最新 keep 个）
    old_files = sorted(ver_dir.glob(f"{p.stem}.*{p.suffix}"),
                       key=lambda x: x.stat().st_mtime, reverse=True)
    for old in old_files[keep:]:
        try:
            old.unlink()
        except OSError:
            pass
    return archived


# ========== 2. 幂等任务 ==========

class pending_guard:
    """幂等任务守护：生成前写 .pending，完成后写 .done 并清 .pending。

    重启时：
      - 若 .done 存在且目标文件存在 → already_done = True，直接跳过
      - 若 .pending 存在但 .done 不存在 → was_pending = True（上次崩在生成中）
        调用方决定是否跳过。建议：视频/图像这类已扣费的 API，走兜底逻辑而不是重扣。
      - 都没有 → 全新任务

    用法：
      with pending_guard(out_path) as g:
          if g.already_done:
              return g.done_url
          if g.was_pending:
              # 上次崩在中间，先尝试从 CDN 取回（如果有 saved_url），否则重跑
              pass
          url = api_call(...)
          g.mark_done(url, extra_info={"seed": seed})
    """

    def __init__(self, out_path: str | Path):
        self.out_path = Path(out_path)
        self.pending_file = self.out_path.with_suffix(self.out_path.suffix + ".pending")
        self.done_file = self.out_path.with_suffix(self.out_path.suffix + ".done")
        self.already_done = False
        self.was_pending = False
        self.done_url = ""
        self._start_ts = time.time()

    def __enter__(self):
        # 检查完成态
        if self.done_file.exists() and self.out_path.exists():
            try:
                info = json.loads(self.done_file.read_text(encoding="utf-8"))
                self.done_url = info.get("url", "")
                self.already_done = True
            except (json.JSONDecodeError, OSError):
                pass
            return self

        # 检查挂起态（上次崩了）
        if self.pending_file.exists():
            self.was_pending = True
            # 保留 pending 文件作为标记，等 mark_done 时清理
            return self

        # 全新任务：写 pending 标记
        self._write_pending()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        # 异常退出：保留 pending 文件，下次启动能识别
        return False  # 不吞异常

    def _write_pending(self):
        self.pending_file.parent.mkdir(parents=True, exist_ok=True)
        self.pending_file.write_text(json.dumps({
            "started_at": self._start_ts,
            "out_file": str(self.out_path),
        }, ensure_ascii=False, indent=2), encoding="utf-8")

    def mark_done(self, url: str = "", extra: dict | None = None):
        """任务完成：写 .done 文件，删 .pending 文件。"""
        info = {
            "url": url,
            "out_file": str(self.out_path),
            "started_at": self._start_ts,
            "finished_at": time.time(),
            "duration_s": round(time.time() - self._start_ts, 2),
        }
        if extra:
            info.update(extra)
        self.done_file.parent.mkdir(parents=True, exist_ok=True)
        self.done_file.write_text(json.dumps(info, ensure_ascii=False, indent=2),
                                  encoding="utf-8")
        # 清 pending
        try:
            if self.pending_file.exists():
                self.pending_file.unlink()
        except OSError:
            pass
        self.done_url = url
        self.already_done = True
