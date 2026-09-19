#!/usr/bin/env python3
"""
make_sheets.py — 生成角色「设定卡」（组合图：头像/三视图/表情库）写回 production.json

方法论（《角色设定卡先于分镜》）：分镜出图之前，先把每个角色做成一张"可持续复用的数字演员
资产卡"——把一个人的五官、发型结构、服装层次、配饰、典型表情一次定死，后续所有分镜/视频
都垫这张卡。参照参考样式：
  左上半身/头像特写 + 右侧正面/90°侧面/背面全身三视图 + 下方表情库(微笑/惊讶/生气/冷漠等)
  + 配饰细节 + 色板。

关键：一次纯文生整张组合卡（正文里写死全脸锚点），让模型在同一生成语义下产出
"同一张脸"的四视角，比"先垫一张正面图再逐视角展开"一致性更好。

用法：
  python3 make_sheets.py production.json                 # 全角色，缺则补
  python3 make_sheets.py production.json --char char_da  # 只生成指定角色
  python3 make_sheets.py production.json --force         # 强制重生成
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import agnes_client as ag  # noqa: E402
from plan_production import validate  # noqa: E402
from cost_tracker import tracker  # noqa: E402
from versioned import archive_old_file, pending_guard  # noqa: E402

# 组合角色设定卡通用版式（竖头像 + 三视图 + 表情库）。face_descriptor 由各角色 anchor 注入。
# 风格词必须是"写实摄影"——此前写"游戏立绘"导致整张卡被带成卡通/动漫风，与写实定妆照割裂。
SHEET_LAYOUT = (
    "真人影视角色设定参考图（选角定妆参考板），写实人像摄影，真实皮肤纹理与布料质感，"
    "白色摄影棚无缝背景，专业柔光棚拍。"
    # 多视角同脸是硬约束，放在最前并重复强调
    "四个视角（左上半身特写、正面全身、90度侧面全身、背面全身）以及表情库，"
    "必须是同一个人——同一张脸、同一体型胖瘦、同一发型结构、同一套服装与配饰，只有角度与"
    "表情不同。"
    "全程真人实拍质感：禁止卡通、禁止动漫、禁止插画、禁止3D渲染、禁止游戏立绘风格。"
)


def face_descriptor(c):
    """从 anchor 提取“脸+发+体型+服装配饰”的可复用描述，附加表情库的体型/年龄硬词。
    模型对锚点里的体型词常弱化，故对“微胖/瘦”等强词做加权复述。"""
    a = c.get("anchor", "") or ""
    # 体型强词：为锚点里可能出现的胖瘦/年龄词补强，防止全身被画成标准身材
    body = ""
    m = re.search(r"(微胖|偏胖|圆润|富态|清瘦|瘦削|高挑|纤细)", a)
    if m:
        body = (f"体型严格为{m.group(1)}，全身与特写一致，"
                f"面颊/腰腹都要体现该体型特征，不得画成标准身材。")
    age = re.search(r"(\d{2}岁)", a)
    if age:
        body += f"视觉年龄必须接近{age.group(1)}，保留对应年龄的肤质与皱纹/紧致度。"
    return a, body


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("production")
    ap.add_argument("--char", help="只处理指定角色 id")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    data = load(args.production)
    validate(data)
    from paths import project_paths
    pp = project_paths(args.production)
    pp.mkdirs()
    style = data["project"]["style_suffix"]
    chars = data.get("characters", [])

    # 成本追踪
    tracker.set_output_file(pp.work_dir / "cost_tracking.json")

    for c in chars:
        cid = c["id"]
        if args.char and cid != args.char:
            continue
        c.setdefault("character_sheet_url", "")
        c.setdefault("character_sheet_file", "")
        c.setdefault("sheet_seed", 0)
        out = pp.sheets_dir / f"{cid}.png"
        if c["character_sheet_url"] and out.exists() and not args.force:
            print(f"  跳过 {cid}（已有角色卡）")
            continue

        anchor, body = face_descriptor(c)
        # 修复"角色卡与定妆照脸不一致"：定妆照已生成则垫图锚脸，
        # 与 make_keyframes recast 同款三明治写法（开头点名参考图 → 版式要求 → 结尾重申同脸）
        portrait_url = (c.get("portrait_url") or "").strip()
        if portrait_url:
            ref_head = (
                f"<Picture 1>为角色“{c['name']}”的唯一官方定妆照，是此人长相的唯一事实标准。"
                f"设定图中出现的每一个人（左侧特写、三视图、表情库全部视角）必须是<Picture 1>中的"
                f"同一人：脸型轮廓、五官细节、发型发色、胡须、眼镜等识别特征、年龄感、体型胖瘦"
                f"一律照搬<Picture 1>，禁止重新设计长相。"
            )
        else:
            ref_head = ""
        prompt = (
            f"真人影视角色设定图：{c['name']}——{anchor}。{body}{ref_head}"
            f"左侧为大幅上半身正面特写；右侧按顺序排列正面全身、90度侧面全身、背面全身三视图；"
            f"下方一行展示表情库：微笑、惊讶、生气、冷漠四种表情（仅面部变化）。"
            f"{SHEET_LAYOUT}"
        )
        prompt = prompt + "\n" + style
        # 角色卡用独立新 seed（模999，破碎旧的会漂移的 seed），上层可改 seed 重试
        seed = (c.setdefault("sheet_seed", 0) or (c.get("seed") or 1000) + 7) % 999
        c["sheet_seed"] = seed
        # 版本历史：--force 时归档旧版
        if args.force and out.exists():
            archive_old_file(out, keep=3)
        print(f"  生成 {cid} 角色设定卡（纯文生组合，seed={seed}）...")
        with pending_guard(out) as guard:
            if guard.already_done and not args.force:
                print(f"  跳过 {cid}（已完成）")
                c["character_sheet_url"] = guard.done_url
                c["character_sheet_file"] = str(out)
                continue
            url = ag.image_generate(prompt, ratio="16:9", size="2K", seed=seed,
                                    ref_urls=[portrait_url] if portrait_url else None)
            ag.download(url, out)
            guard.mark_done(url, extra={"seed": seed, "type": "character_sheet"})
            c["character_sheet_url"] = url
            c["character_sheet_file"] = str(out)
        time.sleep(1)

    save(args.production, data)
    print("完成。")


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def save(p, data):
    Path(p).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()