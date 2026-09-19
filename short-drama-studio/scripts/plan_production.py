#!/usr/bin/env python3
"""
plan_production.py — 校验并规范化 production.json，生成帧链计划，创建工作目录

用法：
  python3 plan_production.py /path/to/production.json            # 校验并打印计划
  python3 plan_production.py /path/to/production.json --fix      # 自动修复帧链并回写
  python3 plan_production.py /path/to/production.json --init-dirs
"""
import argparse
import json
import re
import sys
from pathlib import Path

VALID_RATIOS = {"21:9", "16:9", "4:3", "1:1", "3:4", "9:16"}
BEATS = {"冷开场钩子", "建置", "激励事件", "升级", "最低点", "高潮反转", "悬念收尾"}
# 节拍名允许包含“事件”等写法的别名归一
BEAT_ALIAS = {"激励事件": "激励事件", "钩子": "冷开场钩子", "冷开场": "冷开场钩子",
              "高潮": "高潮反转", "收尾": "悬念收尾", "结尾": "悬念收尾"}


def norm(s):
    return re.sub(r"\s+", "", s or "") if isinstance(s, str) else s


def pov_instruction(project, shot):
    """返回第一人称 POV 的镜头/画面约束；纯第三人称工程则返回空串。
    项目缺省 camera_mode=first（第一人称），单镜可用 camera_pov=third 覆盖
    （例如展示主角反应特写、大远景建立镜等必须让观众看到主角的镜头）。"""
    mode = shot.get("camera_pov") or project.get("camera_mode") or "first"
    if mode != "first":
        return ""
    if shot.get("shot_size") in ("特写", "大特写"):
        return ("第一人称主观特写（POV close-up）：镜头即视角主角的眼睛，画面呈现其目光所见，"
                "观众代入其情绪；除镜面/自拍特写外不出现视角主角本人。")
    return ("第一人称主观视角（POV）：镜头是视角主角的眼睛，观众通过其视线看世界，"
            "画面为角色实见的场景与动作；不出现视角主角本人（镜面/自拍特写除外），"
            "视线焦点、转头、喘息等主观动作连续自然。")


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def validate(data, fix=False):
    errors, warnings, fixed = [], [], 0
    proj = data.get("project", {})
    for k in ("title", "logline", "orientation", "duration_seconds", "shot_seconds", "style_suffix"):
        if not proj.get(k):
            errors.append(f"project.{k} 缺失")
    ratio = proj.get("orientation")
    if ratio and ratio not in VALID_RATIOS:
        errors.append(f"orientation 非法：{ratio}，支持 {sorted(VALID_RATIOS)}")
    proj.setdefault("camera_mode", "first")
    if proj.get("camera_mode") not in ("first", "third"):
        errors.append("project.camera_mode 非法：first（第一人称 POV，默认）/ third（第三人称）")
    proj.setdefault("frame_mode", "chain")
    if proj.get("frame_mode") not in ("chain", "independent"):
        errors.append("project.frame_mode 非法：chain（N+1 边界帧共享）/ independent（每镜独立首尾帧）")
    if len(proj.get("logline", "")) > 40:
        warnings.append(f"logline 建议 ≤25 字，当前 {len(proj['logline'])} 字")

    chars = {c["id"]: c for c in data.get("characters", [])}
    locs = {l["id"]: l for l in data.get("locations", [])}
    for cid, c in chars.items():
        for k in ("name", "anchor", "voice"):
            if not c.get(k):
                errors.append(f"角色 {cid} 缺少 {k}")
        if c.get("anchor") and not (30 <= len(c["anchor"]) <= 120):
            warnings.append(f"角色 {cid} anchor 建议 40-80 字，当前 {len(c['anchor'])} 字")

    shots = data.get("shots", [])
    if not shots:
        errors.append("shots 为空")
    ids = [s.get("id") for s in shots]
    if len(ids) != len(set(ids)):
        errors.append("镜头 id 重复")

    total = 0
    for n, s in enumerate(shots):
        sid = s.get("id", f"#{n+1}")
        sec = s.get("seconds", proj.get("shot_seconds", 10))
        if not (4 <= sec <= 12):
            errors.append(f"{sid} seconds={sec} 超出接口范围 4-12")
        total += sec
        for k in ("scene_cn", "first_frame_prompt", "last_frame_prompt"):
            if not s.get(k):
                errors.append(f"{sid} 缺少 {k}")
        if s.get("location_id") and s["location_id"] not in locs:
            errors.append(f"{sid} 引用了不存在的 location_id={s['location_id']}")
        for cid in s.get("char_ids", []):
            if cid not in chars:
                errors.append(f"{sid} 引用了不存在的角色 {cid}")
        s.setdefault("assets", {})
        s.setdefault("seed", proj.get("seed", 0) + n + 1 if proj.get("seed") else 1000 + n)
        s.setdefault("dialogue", [])
        s.setdefault("transition", "硬切")
        s.setdefault("emotion_tag", "")
        if s.get("camera_pov") not in (None, "first", "third"):
            warnings.append(f"{sid} camera_pov 非法，应为 first / third")
        # 分镜铁律一（台词保护）：关键台词配固定镜头/缓推，避免快切/甩镜导致口型崩
        cam = str(s.get("camera", "") or "")
        if s.get("dialogue") and any(k in cam for k in ("快切", "甩镜", "快速横移")):
            warnings.append(f"{sid} 含台词却用快切/甩镜（{cam}），口型易崩，建议固定/缓推")
        # 分镜铁律二（动作安全区）：多角色互动避免复杂肢体接触（穿模重灾区），用景别/反应镜头替代
        if len(s.get("char_ids", [])) >= 2 and any(k in str(s.get("scene_cn", ""))
                                                  for k in ("拥抱", "交手", "递物", "打斗", "抓手", "搀扶")):
            warnings.append(f"{sid} 多角色出现复杂肢体交互，穿模风险高，建议拆分景别/反应镜头")
        if s.get("beat") not in BEATS:
            alias = BEAT_ALIAS.get(s.get("beat", ""))
            if alias:
                s["beat"] = alias
            else:
                warnings.append(f"{sid} beat='{s.get('beat')}' 不在标准七段式中")

    # 帧链闭合（仅共享边界帧 chain 模式需要）：s_i.last_frame_prompt 必须等于 s_{i+1}.first_frame_prompt
    if proj.get("frame_mode", "chain") == "chain":
        for n in range(len(shots) - 1):
            a, b = shots[n], shots[n + 1]
            if norm(a.get("last_frame_prompt")) != norm(b.get("first_frame_prompt")):
                msg = f"帧链未闭合：{a['id']}.last ≠ {b['id']}.first"
                if fix:
                    a["last_frame_prompt"] = b["first_frame_prompt"]
                    fixed += 1
                    warnings.append(msg + "（已以后者首帧为准修复）")
                else:
                    errors.append(msg + "；加 --fix 可自动修复")

    target = proj.get("duration_seconds", 0)
    if target and abs(total - target) > 10:
        warnings.append(f"镜头总时长 {total}s 与目标 {target}s 偏差超过 10s")
    expect = round(target / proj.get("shot_seconds", 10)) if proj.get("shot_seconds") else 0
    if expect and abs(len(shots) - expect) > 2:
        warnings.append(f"镜头数 {len(shots)} 与参考值 {expect}（{target}s/{proj.get('shot_seconds')}s）偏差较大")

    # 创作质检
    qa = data.get("qa", {})
    if qa:
        if not qa.get("hook_present"):
            warnings.append("qa.hook_present=false：开场钩子缺失")
        if qa.get("humor_beats", 0) < 2:
            warnings.append("qa.humor_beats<2：笑点不足 2 处")
        if qa.get("sadness_beats", 0) < 1:
            warnings.append("qa.sadness_beats<1：忧愁点不足 1 处")
        if not qa.get("ending_hook"):
            warnings.append("qa.ending_hook=false：结尾悬念缺失")
        if not qa.get("safety_passed", True):
            errors.append("qa.safety_passed=false：存在合规风险，禁止进入制作")

    return errors, warnings, fixed, total


def frame_plan(data):
    """返回关键帧计划。

    chain 模式：N+1 张共享边界帧 [(kfNN, prompt, scene_idx, source)]。
    independent 模式：每镜独立首尾帧 [(sid_first, prompt, scene_idx, source), (sid_last, ...), ...]。
    """
    shots = data["shots"]
    mode = data.get("project", {}).get("frame_mode", "chain")
    plan = []
    if mode == "independent":
        for n, s in enumerate(shots):
            plan.append((f"{s['id']}_first", s["first_frame_prompt"], n, f"{s['id']}.first"))
            plan.append((f"{s['id']}_last", s["last_frame_prompt"], n, f"{s['id']}.last"))
        return plan
    for n, s in enumerate(shots):
        if n == 0:
            plan.append(("kf00", s["first_frame_prompt"], 0, f"{s['id']}.first"))
        plan.append((f"kf{n+1:02d}", s["last_frame_prompt"], n, f"{s['id']}.last"))
    return plan


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("production")
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--init-dirs", action="store_true")
    args = ap.parse_args()

    p = Path(args.production)
    data = load(p)
    errors, warnings, fixed, total = validate(data, fix=args.fix)

    if args.fix and fixed:
        save(p, data)
        print(f"已修复 {fixed} 处帧链并回写 {p}")

    if args.init_dirs:
        from paths import project_paths
        pp = project_paths(p)
        pp.mkdirs()
        print(f"已创建工作目录（out/ 根：{pp.out_dir}）")

    shots = data.get("shots", [])
    frames = frame_plan(data) if shots else []
    print("=" * 56)
    print(f"片名：{data.get('project', {}).get('title')}")
    print(f"画幅：{data.get('project', {}).get('orientation')} | 镜头数：{len(shots)} | "
          f"总时长：{total}s | 边界关键帧：{len(frames)} 张")
    char_done = sum(1 for c in data.get("characters", []) if c.get("portrait_url"))
    print(f"角色：{len(data.get('characters', []))} 个（已定妆照 {char_done}）")
    clips_done = sum(1 for s in shots if (s.get("assets") or {}).get("clip_file"))
    print(f"已完成镜头：{clips_done}/{len(shots)}")
    for w in warnings:
        print("  [WARN]", w)
    if errors:
        for e in errors:
            print("  [ERROR]", e, file=sys.stderr)
        sys.exit(1)
    print("校验通过。")


if __name__ == "__main__":
    main()
