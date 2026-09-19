#!/usr/bin/env python3
"""
paths.py — 短剧流水线统一路径管理

所有输出与中间产物都放在 out/ 目录下，与技能源码（scripts/）分离。
改目录结构只需改这一个文件。

用法：
  from paths import project_paths
  pp = project_paths(production_json_path)
  pp.frames_dir / "portraits"   # 定妆照目录
  pp.clips_dir                  # 单镜视频目录
  pp.work_dir                   # 中间产物目录
  pp.final_dir                  # 最终成片目录

设计原则：
  - 不依赖任何绝对路径或环境变量
  - 所有路径基于 production.json 所在位置推导
  - production.json 放在 out/ 根目录，作为工程锚点
  - 技能源码（scripts/、references/、SKILL.md）在源码目录，与产物分离
"""
from dataclasses import dataclass
from pathlib import Path


@dataclass
class ProjectPaths:
    """项目所有输出路径。基于 production.json 所在目录推导。"""
    out_dir: Path          # out/ 根目录（production.json 所在目录）
    production_file: Path  # production.json 路径

    # 一级子目录
    frames_dir: Path
    clips_dir: Path
    audio_dir: Path
    subtitles_dir: Path
    work_dir: Path
    final_dir: Path

    # 二级子目录（frames 下）
    portraits_dir: Path
    sheets_dir: Path
    locs_dir: Path

    # work 下
    tts_work_dir: Path

    def mkdirs(self):
        """创建所有必要目录（已存在则忽略）。"""
        for d in (self.frames_dir, self.clips_dir, self.audio_dir,
                  self.subtitles_dir, self.work_dir, self.final_dir,
                  self.portraits_dir, self.sheets_dir, self.locs_dir,
                  self.tts_work_dir):
            d.mkdir(parents=True, exist_ok=True)


def project_paths(production_json: str | Path) -> ProjectPaths:
    """根据 production.json 路径推导所有项目路径。

    约定：production.json 所在目录就是 out/ 根目录。
    """
    p = Path(production_json).resolve()
    out_dir = p.parent
    return ProjectPaths(
        out_dir=out_dir,
        production_file=p,
        frames_dir=out_dir / "frames",
        clips_dir=out_dir / "clips",
        audio_dir=out_dir / "audio",
        subtitles_dir=out_dir / "subtitles",
        work_dir=out_dir / "work",
        final_dir=out_dir / "final",
        portraits_dir=out_dir / "frames" / "portraits",
        sheets_dir=out_dir / "frames" / "sheets",
        locs_dir=out_dir / "frames" / "locs",
        tts_work_dir=out_dir / "work" / "tts",
    )
