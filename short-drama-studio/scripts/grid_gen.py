#!/usr/bin/env python3
"""
grid_gen.py — 多宫格批量生成 + 自动切分

依据 ArcReel 多宫格分镜思路：把多个同类型资产（角色定妆/场景设定）塞一张图生成，
切分后各自使用，省 API 成本（N 宫格省 N-1 张图的钱）。

支持模式：
  - portraits : 多个角色定妆照（竖排/网格排列）
  - locations : 多个场景设定图（竖排/网格排列）

切分：生成后按 grid 布局平均切割，输出到对应目录，并回填 production.json。

⚠ 适用场景：项目早期快速出草稿/验证风格，成本敏感时使用。
   对一致性要求高的镜头，建议还是逐张独立生成（更可控）。

用法：
  python3 grid_gen.py production.json --mode portraits --grid 2x2
  python3 grid_gen.py production.json --mode locations --grid 2x4
  python3 grid_gen.py production.json --mode portraits --only char_a,char_b --force
"""
import argparse
import json
import sys
import time
from pathlib import Path

from PIL import Image  # pip install pillow

sys.path.insert(0, str(Path(__file__).resolve().parent))
import agnes_client as ag  # noqa: E402
from plan_production import validate  # noqa: E402
from cost_tracker import tracker  # noqa: E402
from versioned import archive_old_file, pending_guard  # noqa: E402


def parse_grid(grid_str):
    """解析 '2x3' → (2, 3) （行 x 列）。"""
    rows, cols = grid_str.lower().split("x")
    return int(rows), int(cols)


def grid_layout_prompt(items, rows, cols, item_type, style):
    """生成多宫格组合图的 prompt。

    items: [(id, name, description), ...]，数量应 ≤ rows*cols
    item_type: "portrait" or "location"
    """
    n = len(items)
    assert n <= rows * cols, f"物品数 {n} 超过宫格数 {rows*cols}"

    layout_desc = f"{rows}行{cols}列网格布局，共 {rows*cols} 个格子，等大等距，白色细线分隔。"
    if item_type == "portrait":
        intro = "AI漫剧角色定妆照组图。"
        per_item = "每个格子是一个角色的正面半身定妆照，纯色背景，标准打光，五官清晰。"
    else:  # location
        intro = "电影场景设定图组图。"
        per_item = "每个格子是一个独立场景的空镜全景图，环境陈设完整，光线统一。"

    item_lines = []
    for i, (iid, name, desc) in enumerate(items):
        r = i // cols
        c = i % cols
        item_lines.append(f"第{r+1}行第{c+1}列（{name}）：{desc}")

    prompt = (
        f"{intro}{layout_desc}{per_item}\n"
        f"所有格子风格完全统一（同画风、同光照强度、同质感、同分辨率级别），"
        f"严禁格子之间内容串扰，每个格子独立完整。\n"
        + "\n".join(item_lines)
        + f"\n{style}\n"
        + "高细节、电影级质感、无水印无文字。"
    )
    return prompt


def split_grid(img_path, rows, cols, out_paths):
    """按 rows x cols 切割图片，输出到 out_paths（按行优先顺序）。"""
    img = Image.open(img_path)
    w, h = img.size
    cell_w = w // cols
    cell_h = h // rows
    saved = []
    for i, out_path in enumerate(out_paths):
        r = i // cols
        c = i % cols
        left = c * cell_w
        upper = r * cell_h
        right = left + cell_w
        lower = upper + cell_h
        cell = img.crop((left, upper, right, lower))
        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        cell.save(out_path)
        saved.append(out_path)
    return saved


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("production")
    ap.add_argument("--mode", choices=["portraits", "locations"], required=True)
    ap.add_argument("--grid", default="2x2", help="如 2x2 / 3x3 / 2x4")
    ap.add_argument("--only", default="", help="逗号分隔的 id 列表，默认全部")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--ratio", default="16:9", help="整图比例，默认 16:9")
    args = ap.parse_args()

    p = Path(args.production).resolve()
    from paths import project_paths
    pp = project_paths(p)
    pp.mkdirs()
    data = json.loads(p.read_text(encoding="utf-8"))
    validate(data)
    tracker.set_output_file(pp.work_dir / "cost_tracking.json")

    rows, cols = parse_grid(args.grid)
    style = data["project"]["style_suffix"]

    if args.mode == "portraits":
        all_items = [
            (c["id"], c.get("name", c["id"]),
             f"{c.get('age_role','')} {c.get('anchor','')} 上半身正面")
            for c in data.get("characters", [])
        ]
        out_dir = pp.portraits_dir
        url_field = "portrait_url"
        file_field = "portrait_file"
        data_list = data["characters"]
        id_key = "id"
    else:  # locations
        all_items = [
            (l["id"], l.get("name", l["id"]), l.get("anchor", ""))
            for l in data.get("locations", [])
        ]
        out_dir = pp.locs_dir
        url_field = "loc_url"
        file_field = "loc_file"
        data_list = data["locations"]
        id_key = "id"

    # 过滤 --only
    wanted = set(x.strip() for x in args.only.split(",")) if args.only else None
    items = [it for it in all_items if (not wanted) or it[0] in wanted]

    if len(items) > rows * cols:
        print(f"[WARN] {len(items)} 个物品超过 {rows}x{cols}={rows*cols} 宫格容量，只取前 {rows*cols} 个")
        items = items[:rows * cols]

    # 跳过已生成且非 force 的
    data_by_id = {d[id_key]: d for d in data_list}
    if not args.force:
        remaining = []
        for it in items:
            d = data_by_id.get(it[0], {})
            out_file = out_dir / f"{it[0]}.png"
            if d.get(url_field) and out_file.exists():
                print(f"  跳过 {it[0]}（已存在）")
            else:
                remaining.append(it)
        if not remaining:
            print("全部已存在，无需生成。")
            return
        items = remaining

    if not items:
        print("没有要生成的项目")
        return

    print(f"[宫格生成] {args.mode} 模式，{rows}x{cols} 宫格，{len(items)} 个项目")

    # 生成宫格大图（幂等 + 版本历史）
    grid_name = f"grid_{args.mode}_{args.grid}_{items[0][0]}_to_{items[-1][0]}"
    grid_out = pp.work_dir / f"{grid_name}.png"

    if args.force and grid_out.exists():
        archive_old_file(grid_out, keep=2)

    with pending_guard(grid_out) as guard:
        if guard.already_done and not args.force:
            grid_url = guard.done_url
        else:
            prompt = grid_layout_prompt(items, rows, cols,
                                        "portrait" if args.mode == "portraits" else "location",
                                        style)
            print(f"  生成宫格大图（{args.ratio}）...")
            grid_url = ag.image_generate(prompt, ratio=args.ratio, size="2K")
            ag.download(grid_url, grid_out)
            guard.mark_done(grid_url, extra={"mode": args.mode, "grid": args.grid,
                                            "count": len(items)})

    # 切分
    out_paths = [out_dir / f"{it[0]}.png" for it in items]
    print(f"  切分为 {len(items)} 张...")
    saved = split_grid(grid_out, rows, cols, out_paths)

    # 回填
    for it, out_file in zip(items, saved):
        d = data_by_id[it[0]]
        d[url_field] = grid_url  # 存宫格 URL 作溯源
        d[file_field] = str(out_file)
        print(f"    {it[0]} → {out_file.name}")

    Path(p).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"完成。宫格图保留在 work/{grid_name}.png 可对照检查。")


if __name__ == "__main__":
    main()
