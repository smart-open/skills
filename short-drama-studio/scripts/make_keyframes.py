#!/usr/bin/env python3
"""
make_keyframes.py — 生成角色定妆照 + 全片 N+1 张边界关键帧，并回填 production.json

流程（断点续跑，已存在 URL/文件默认跳过）：
  1. 为每个角色生成 1 张 2K 定妆照（out/frames/portraits/<char_id>.png）
  2. 按镜号顺序生成 kf00..kfNN：
     - 参考图 = 出场角色定妆照（<Picture 1..M>）+ 上一张关键帧（<Picture M+1>）
     - 多图合成锁定人物长相与场景连续性
  3. 关键帧 URL 同时回填到相邻两镜的 first/last 资产位

用法：
  python3 make_keyframes.py production.json
  python3 make_keyframes.py production.json --portraits-only   # 只出定妆照供确认
  python3 make_keyframes.py production.json --force            # 全部重新生成
"""
import argparse
import base64
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import agnes_client as ag  # noqa: E402
from plan_production import validate, pov_instruction  # noqa: E402
from cost_tracker import tracker  # noqa: E402
from versioned import archive_old_file, pending_guard  # noqa: E402

MAX_REFS = 6  # 关键帧参考图上限：多角色卡 + 场景图 + 上一帧；视频接口另有更严上限


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def save(p, data):
    Path(p).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def identity_lock(c, for_recast=False):
    """角色身份锚点（全剧不可变的核心识别特征）。返回文字。

    for_recast=True 时：只输出真正"身份级不可变"的特征（脸型/五官/年龄/体型/胡须等），
    明确排除发型/服装/配饰等 recast 允许改变的项目，避免"既要锁又要改"的指令冲突
    导致模型把脸也换了。

    for_recast=False（默认）：输出全部锚点里的身份相关特征，用于正常镜头锁人。
    """
    anchor = c.get("anchor", "") or ""
    name = c.get("name", "")
    feats = []
    # 身份级关键词（脸/年龄/体型/胡须，这些真正不能变）
    id_keywords = ("脸型", "眉", "眼", "鼻", "疤", "痣", "颧", "肤色",
                   "胡", "髯", "年龄", "岁", "胖", "瘦", "体型", "身材", "颧骨",
                   "下颌", "下巴", "额头", "皱纹", "眼袋", "牙", "唇", "耳朵")
    for kw in id_keywords:
        if kw in anchor:
            for seg in anchor.split("，"):
                if kw in seg and seg.strip() and seg.strip() not in feats:
                    s = seg.strip("。，").strip()
                    if s:
                        feats.append(s)
    if not for_recast:
        # 正常镜头：发型也属于身份锚点的一部分（不能变）
        for kw in ("发色", "发型", "头发"):
            if kw in anchor:
                for seg in anchor.split("，"):
                    if kw in seg and seg.strip() and seg.strip() not in feats:
                        s = seg.strip("。，").strip()
                        if s:
                            feats.append(s)
    if feats:
        label = "身份核心锚点（脸型/五官/年龄感/体型绝对不能变）" if for_recast else "身份锚点（全剧不可变）"
        return f"{name}{label}：" + "；".join(feats) + "。"
    return ""


def ref_mapping(characters, with_prev, recast=None):
    """生成参考图顺序与说明前缀。返回 (urls, prefix)。

    recast: {char_id: 换装/改发型说明文字}，用于该角色在外形上有意改变的场景
    （如监狱改为寸头+蓝囚服）。被 recast 的角色在提示里改为“脸/五官一致、按说明换装”，
    避免默认的“服装必须一致”复制出定妆照里的其他服装（如把劣质的酒红西装复制成第二个角色）。

    recast 采用三明治结构：开头身份锁 → 中间变化描述 → 结尾再强调身份锁，
    防止模型把"换发型服装"理解成"换个人"。
    """
    recast = recast or {}
    urls, lines = [], []
    for n, c in enumerate(characters, 1):
        if c.get("id") in recast:
            # recast 模式：用单张正脸定妆照作参考（而非四视图角色卡），
            # 因为单一正脸视角更容易锁住脸型/五官，四宫格容易让模型混淆不同视图。
            ref_url = c.get("portrait_url")
            override = recast[c["id"]]
            ilck = identity_lock(c, for_recast=True)
            # 提取强识别特征（眼镜/胡须/痣/疤等），单独点名防止被场景语义冲掉
            strong_feats = []
            anchor = c.get("anchor", "")
            for kw in ("眼镜", "胡", "髯", "痣", "疤", "纹身", "耳环"):
                if kw in anchor:
                    for seg in anchor.split("，"):
                        if kw in seg and seg.strip():
                            s = seg.strip("。，").strip()
                            if s and s not in strong_feats:
                                strong_feats.append(s)
            strong_note = ""
            if strong_feats:
                strong_note = ("【重要·绝对不能变】该角色标志性识别特征："
                               + "、".join(strong_feats)
                               + "。这些特征与发型/服装无关，在任何场景下（包括监狱、古装、运动等）"
                                 "都必须严格保留，绝对不能去掉或改变形状。")
            # 三明治：开头身份锁 → 中间变化描述 → 结尾再强调身份锁 + 强识别特征
            lines.append(
                f"<Picture {n}>为角色“{c['name']}”的正脸定妆照。{ilck}"
                f"注意：仅该角色的发型与服装按本镜文字要求改变（{override}），"
                f"脸型、五官结构、年龄感、体型、胡须形态必须严格与参考图一致，绝对不能变。"
                f"（改变的只是发型和衣服，人还是同一个人，脸绝对不能换）"
                f"{strong_note}"
            )
        else:
            # 正常镜头：优先用三视图角色卡作参考（同一张脸三视角，更锁人物）；缺卡回退定妆照
            ref_url = c.get("character_sheet_url") or c.get("portrait_url")
            ilck = identity_lock(c)
            lines.append(f"<Picture {n}>为角色“{c['name']}”的参考图，正脸、发型、识别特征、"
                         f"服装必须与该图完全一致（{c['anchor']}）。{ilck}")
        if not ref_url:
            raise ag.AgnesError(f"角色 {c.get('id')} 缺少定妆照/角色卡，请先生成")
        urls.append(ref_url)
    if with_prev:
        k = len(urls) + 1
        lines.append(f"<Picture {k}>为上一张关键帧，延续其场景布局、机位轴线、光线方向与色调")
    prefix = "参考图说明（务必严格遵守）：" + "；".join(lines) + "。"
    return urls, prefix


def ensure_style_suffix(prompt, style_suffix):
    return prompt if style_suffix[:12] in prompt else prompt + "\n" + style_suffix


def make_portraits(data, pp, ratio, force=False):
    print("[1/2] 角色定妆照")
    chars_by_id = {c["id"]: c for c in data.get("characters", [])}
    for c in data.get("characters", []):
        c.setdefault("portrait_url", "")
        c.setdefault("portrait_file", "")
        out = pp.portraits_dir / f"{c['id']}.png"
        if c["portrait_url"] and out.exists() and not force:
            print(f"  - 跳过 {c['id']}（已存在）")
            continue
        # 版本历史：--force 时归档旧版
        if force and out.exists():
            archive_old_file(out, keep=3)
        with pending_guard(out) as guard:
            if guard.already_done and not force:
                print(f"  - 跳过 {c['id']}（已完成）")
                c["portrait_url"] = guard.done_url
                continue
            base_prompt = c["portrait_prompt"]
            ref_urls = None
            # 换装定妆照（如监狱服刑版）：以基准角色定妆照做 i2i，只改发型/服装/配饰，
            # 脸保持同一人。与场景 recast 同款三明治结构，防止模型把"换装"理解成"换人"。
            # 此前监狱版定妆照走纯 t2i，与自由版大哥脸对不上且显年轻，根源即在此。
            ref_id = (c.get("portrait_ref_char_id") or "").strip()
            if ref_id:
                base = chars_by_id.get(ref_id)
                if not base or not base.get("portrait_url"):
                    raise ag.AgnesError(
                        f"角色 {c['id']} 的 portrait_ref_char_id={ref_id} 缺少定妆照，"
                        f"请先生成基准角色的定妆照")
                ref_urls = [base["portrait_url"]]
                ilck = identity_lock(base, for_recast=True)
                base_prompt = (
                    f"<Picture 1>是角色“{base['name']}”的官方定妆照，新生成的画面必须是"
                    f"完全同一个真人：{ilck}"
                    f"仅发型、服装、配饰按以下新描述改变：{base_prompt}"
                    f"（脸型轮廓、五官细节、年龄感、体型胖瘦、胡须形态必须与<Picture 1>"
                    f"严格一致，人还是同一个人，脸绝对不能换，绝不能画成另一个人；"
                    f"参考图中的眼镜、手表、钥匙等配饰若新描述未要求则必须移除）"
                )
            prompt = ensure_style_suffix(base_prompt, data["project"]["style_suffix"])
            print(f"  - 生成 {c['id']}（{c.get('name')}）"
                  f"{'[i2i换装锁脸]' if ref_urls else ''}...")
            # 固定该角色 seed：重生成沿用同 seed + 同描述，保证定妆照可复现
            url = ag.image_generate(prompt, ratio=ratio, size="2K", seed=c.get("seed"),
                                    ref_urls=ref_urls)
            ag.download(url, out)
            guard.mark_done(url, extra={"seed": c.get("seed"), "type": "portrait"})
            c["portrait_url"] = url
        c["portrait_file"] = str(out)
        time.sleep(1)


def make_frames(data, pp, ratio, force=False):
    print("[2/2] 边界关键帧")
    shots = data["shots"]
    chars_by_id = {c["id"]: c for c in data.get("characters", [])}
    style = data["project"]["style_suffix"]
    mode = data["project"].get("frame_mode", "chain")
    if mode == "independent":
        return make_frames_independent(data, pp, ratio, style, force)
    n = len(shots)
    prev_url = None

    def frame_chars(i):
        """kf i 的角色集合：kf00 取 s0；kfNN 取 sN-1；中间取相邻两镜并集。"""
        if i == 0:
            ids = shots[0].get("char_ids", [])
        elif i == n:
            ids = shots[-1].get("char_ids", [])
        else:
            ids = list(shots[i - 1].get("char_ids", [])) + [
                x for x in shots[i].get("char_ids", []) if x not in shots[i - 1].get("char_ids", [])]
        cs = [chars_by_id[x] for x in ids if x in chars_by_id]
        # 控制参考图总数：定妆照最多 MAX_REFS-1（给上一帧留位）
        return cs[:MAX_REFS - 1] if prev_url else cs[:MAX_REFS]

    def existing_url(i):
        if i == 0:
            return shots[0]["assets"].get("first_frame_url", "")
        return shots[i - 1]["assets"].get("last_frame_url", "")

    def assign(i, url, file_):
        if i == 0:
            shots[0]["assets"]["first_frame_url"] = url
            shots[0]["assets"]["first_frame_file"] = str(file_)
        else:
            shots[i - 1]["assets"]["last_frame_url"] = url
            shots[i - 1]["assets"]["last_frame_file"] = str(file_)
            if i < n:  # 中间帧同时是下一镜首帧
                shots[i]["assets"]["first_frame_url"] = url
                shots[i]["assets"]["first_frame_file"] = str(file_)

    for i in range(n + 1):
        fid = f"kf{i:02d}"
        out = pp.frames_dir / f"{fid}.png"
        url = "" if force else existing_url(i)
        if url and out.exists():
            print(f"  - 跳过 {fid}（已存在）")
            prev_url = url
            continue
        # 版本历史：--force 时归档旧版
        if force and out.exists():
            archive_old_file(out, keep=3)
        prompt_text = shots[0]["first_frame_prompt"] if i == 0 else shots[i - 1]["last_frame_prompt"]
        pov = pov_instruction(data["project"], shots[i] if i < n else shots[-1])
        cs = frame_chars(i)
        refs, prefix = ref_mapping(cs, with_prev=bool(prev_url))
        if prev_url:
            refs.append(prev_url)
        prompt = prefix + "\n" + ensure_style_suffix(prompt_text, style)
        if pov:
            prompt += "\n" + pov
        print(f"  - 生成 {fid}（参考图 {len(refs)} 张）...")
        frame_seed = (data["project"].get("seed") or 1000) + i
        with pending_guard(out) as guard:
            if guard.already_done and not force:
                print(f"  - 跳过 {fid}（已完成）")
                assign(i, guard.done_url, out)
                prev_url = guard.done_url
                continue
            url = ag.image_generate(prompt, ratio=ratio, size="2K",
                                    ref_urls=refs or None, seed=frame_seed)
            ag.download(url, out)
            guard.mark_done(url, extra={"seed": frame_seed, "frame": fid})
        assign(i, url, out)
        prev_url = url
        time.sleep(1)


def make_frames_independent(data, pp, ratio, style, force=False):
    """每镜独立首尾帧：first/last 各自在同镜地点内单独生成，仅参考本镜角色定妆照，不与邻居共享。"""
    project = data["project"]
    base_seed = project.get("seed") or 1000
    chars_by_id = {c["id"]: c for c in data.get("characters", [])}
    locs_by_id = {l["id"]: l for l in data.get("locations", [])}
    total = 0
    for s in data["shots"]:
        sid = s["id"]
        assets = s.setdefault("assets", {})
        # 场景参考图（可选）：该镜所属 location 的场景设定图，锁环境/光照一致
        loc = locs_by_id.get(s.get("location_id", "")) if s.get("location_id") else None
        loc_url = (loc or {}).get("loc_url", "")
        loc_name = (loc or {}).get("name", "") or ""
        # no_loc_ref: 个别镜可屏蔽场景图（如场景图中油画含人物、会污染群像的场合）
        skip_loc = bool(s.get("no_loc_ref", False))
        loc_prefix = f"背景参考：<Picture>末尾为场景“{loc_name}”的设定图，本镜环境、陈设、光线方向、色调必须与该图一致（仅环境，不含人物）。" if (loc_url and not skip_loc) else ""
        for pole in ("first", "last"):
            key = f"{pole}_frame"
            fid = f"{sid}_{pole}"
            out = pp.frames_dir / f"{fid}.png"
            url = "" if (force or not assets.get(f"{pole}_frame_url")) else assets.get(f"{pole}_frame_url")
            if url and out.exists():
                print(f"  - 跳过 {fid}（已存在）")
                continue
            prompt_text = s[f"{pole}_frame_prompt"]
            pov = pov_instruction(project, s)
            no_ref = s.get("no_ref", False)
            # 末帧改动作模式（last_from_first）：以本镜定稿首帧为唯一垫图，
            # 锁人锁景只改动作，摆脱布局模板/角色卡引力（防"模板小人被抄进写实画面"）
            lff = pole == "last" and bool(s.get("last_from_first", False))
            first_out = pp.frames_dir / f"{sid}_first.png"
            lff_ready = lff and first_out.exists()
            if lff and not lff_ready:
                print(f"  - 警告 {fid}: last_from_first 已开但首帧缺失，回退常规模式")
            if lff_ready:
                first_uri = ("data:image/png;base64," +
                             base64.b64encode(first_out.read_bytes()).decode())
                refs, prefix = [first_uri], ""
            else:
                cs = [] if no_ref else [chars_by_id[c] for c in s.get("char_ids", [])
                                        if c in chars_by_id][:MAX_REFS]
                recast = s.get("recast")
                refs, prefix = ref_mapping(cs, with_prev=False, recast=recast) if cs else (
[], "")
                if loc_url and not skip_loc:
                    refs.append(loc_url)  # 场景图作为最后一个参考，不占用角色卡位
                    prefix = prefix[:-1] + "。" if prefix else ""
            # 构图布局模板（可选）：模型"抄结构不抄文字"——人数/站位/分桌约束靠文本几乎无效，
            # 用一张人数站位正确的占位模板图让模型照抄结构；模板人物长相被明确禁止复制。
            lay_url = "" if lff_ready else (s.get("layout_ref_url") or "").strip()
            if lay_url and not lay_url.startswith(("http://", "https://", "data:")):
                # 本地路径 → data URI（相对路径基于 production.json 所在目录解析）
                lay_path = Path(lay_url)
                if not lay_path.is_absolute():
                    lay_path = pp.production_file.resolve().parent / lay_url
                lay_url = "data:image/png;base64," + base64.b64encode(
                    lay_path.read_bytes()).decode()
            if lay_url:
                k = len(refs) + 1
                refs.append(lay_url)
                lay_note = (f"<Picture {k}>是构图布局模板：只复制它的人数、排布与分组站位结构，"
                            f"绝不要复制模板里任何人的长相、服装与配饰；所有人物的长相、年龄、"
                            f"服装一律严格按本镜文字描述执行。")
                prefix = (prefix + lay_note) if prefix else (
                    "参考图说明（务必严格遵守）：" + lay_note)
            prompt = prefix + "\n" + ensure_style_suffix(prompt_text, style)
            if loc_prefix:
                prompt = loc_prefix + "\n" + prompt
            if pov:
                prompt += "\n" + pov
            print(f"  - 生成 {fid}（参考图 {len(refs)} 张）...")
            # 每镜两帧用相邻 seed，保证同镜内风格一致又不共享边界
            frame_seed = base_seed + total
            total += 1
            # 版本历史：--force 时归档旧版
            if force and out.exists():
                archive_old_file(out, keep=3)
            with pending_guard(out) as guard:
                if guard.already_done and not force:
                    print(f"  - 跳过 {fid}（已完成）")
                    assets[f"{pole}_frame_url"] = guard.done_url
                    assets[f"{pole}_frame_file"] = str(out)
                    continue
                url = ag.image_generate(prompt, ratio=ratio, size="2K",
                                        ref_urls=refs or None, seed=frame_seed)
                ag.download(url, out)
                guard.mark_done(url, extra={"seed": frame_seed, "frame": fid,
                                           "shot": sid, "pole": pole})
                assets[f"{pole}_frame_url"] = url
                assets[f"{pole}_frame_file"] = str(out)
            time.sleep(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("production")
    ap.add_argument("--portraits-only", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    p = Path(args.production).resolve()
    from paths import project_paths
    pp = project_paths(p)
    pp.mkdirs()
    data = load(p)
    errors, warnings, _, total = validate(data, fix=False)
    for w in warnings:
        print("  [WARN]", w)
    if errors:
        for e in errors:
            print("  [ERROR]", e, file=sys.stderr)
        sys.exit(1)

    # 成本追踪：输出到项目 work/cost_tracking.json
    tracker.set_output_file(pp.work_dir / "cost_tracking.json")

    ratio = data["project"]["orientation"]
    make_portraits(data, pp, ratio, force=args.force)
    save(p, data)
    print("定妆照阶段已回填 production.json")
    if args.portraits_only:
        return
    make_frames(data, pp, ratio, force=args.force)
    save(p, data)
    mode = data["project"].get("frame_mode", "chain")
    if mode == "independent":
        need = [f"{s['id']}_{pole}" for s in data["shots"] for pole in ("first", "last")]
        missing = [fid for fid in need
                   if not (pp.frames_dir / f"{fid}.png").exists()]
        label = f"{len(data['shots']) * 2}"
    else:
        need = [f"kf{i:02d}" for i in range(len(data["shots"]) + 1)]
        missing = [fid for fid in need
                   if not (pp.frames_dir / f"{fid}.png").exists()]
        label = f"{len(data['shots']) + 1}"
    if missing:
        print("缺失关键帧：", missing, file=sys.stderr)
        sys.exit(2)
    print(f"全部关键帧完成：{label} 张，已回填 {p.name}")


if __name__ == "__main__":
    main()
