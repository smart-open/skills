#!/usr/bin/env python3
"""
make_locations.py — 生成场景设定图并写回 production.json

依据《资产先行》方法论：场景与角色并列是可复用资产。每个 location 生成一张
「纯空镜场景设定图」（无人物），作为该场景所有镜头的背景/光照参考，固定环境一致
（室内陈设、窗外景观、光线色温、景深），避免“每新增一个场景=光照一致风险”。

设计约束：
  - 场景图严禁出现人物（会被错当角色参考污染画面），只画环境本身。
  - 与 role 卡分离：场景参考图只锚定背景/光照，角色仍由角色卡锁定。

用法：
  python3 make_locations.py production.json           # 全场景，缺则补
  python3 make_locations.py production.json --loc loc_hall
  python3 make_locations.py production.json --force
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import agnes_client as ag  # noqa: E402
from plan_production import validate  # noqa: E402
from cost_tracker import tracker  # noqa: E402
from versioned import archive_old_file, pending_guard  # noqa: E402

LOC_SUFFIX = (
    "电影场景设定图，纯空镜环境，画面中严禁出现任何人物/角色；"
    "写实厚涂，高级CG/电影质感，细腻材质与纹理，真实光影与透视，合理构图；"
    "环境陈设完整、纵深清晰、光照方向统一、色彩可复现；无文字无水印，非动漫"
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("production")
    ap.add_argument("--loc", help="只处理指定 location id")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    data = load(args.production)
    validate(data)
    from paths import project_paths
    pp = project_paths(args.production)
    pp.mkdirs()
    style = data["project"]["style_suffix"]
    locs = data.get("locations", [])

    # 成本追踪
    tracker.set_output_file(pp.work_dir / "cost_tracking.json")

    for loc in locs:
        lid = loc["id"]
        if args.loc and lid != args.loc:
            continue
        loc.setdefault("loc_url", "")
        loc.setdefault("loc_file", "")
        loc.setdefault("loc_seed", 0)
        out = pp.locs_dir / f"{lid}.png"
        if loc.get("loc_url") and out.exists() and not args.force:
            print(f"  跳过 {lid}（已有场景图）")
            continue
        prompt = (f"场景“{loc['name']}”：{loc['anchor']}。{LOC_SUFFIX}")
        prompt = prompt + "\n" + style
        seed = (loc.setdefault("loc_seed", 0) or abs(hash(lid)) % 999)
        loc["loc_seed"] = seed
        # 版本历史：--force 时归档旧版
        if args.force and out.exists():
            archive_old_file(out, keep=3)
        print(f"  生成场景 {lid} 设定图（seed={seed}）...")
        with pending_guard(out) as guard:
            if guard.already_done and not args.force:
                print(f"  跳过 {lid}（已完成）")
                loc["loc_url"] = guard.done_url
                loc["loc_file"] = str(out)
                continue
            url = ag.image_generate(prompt, ratio="16:9", size="2K", seed=seed)
            ag.download(url, out)
            guard.mark_done(url, extra={"seed": seed, "type": "location", "loc_id": lid})
            loc["loc_url"] = url
            loc["loc_file"] = str(out)
        time.sleep(1)

    save(args.production, data)
    print("完成。")


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def save(p, data):
    Path(p).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()