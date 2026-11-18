# -*- coding: utf-8 -*-
"""生成课程清单报告：可下载/已下载/需购买/0 元课。

默认从 <out>/.xet 读 catalog.json / courses.json，报告写到 <out>/店铺课程清单.txt。
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def price(p):
    try:
        return f"{int(p) / 100:.0f} 元" if int(p or 0) > 0 else "0 元"
    except Exception:
        return str(p)


def main():
    ap = argparse.ArgumentParser(description="生成课程清单报告")
    ap.add_argument("--out", "-o", default=".", help="下载根目录（默认当前目录）")
    ap.add_argument("--meta", default=None, help="元数据目录（默认 <out>/.xet）")
    ap.add_argument("--catalog", default=None)
    ap.add_argument("--courses", default=None)
    ap.add_argument("--report", default="店铺课程清单.txt")
    a = ap.parse_args()

    out_dir = os.path.abspath(a.out)
    meta_dir = os.path.abspath(a.meta or os.path.join(out_dir, ".xet"))
    cat_path = a.catalog or os.path.join(meta_dir, "catalog.json")
    crs_path = a.courses or os.path.join(meta_dir, "courses.json")
    if not os.path.exists(crs_path):
        sys.exit(f"找不到 courses.json：{crs_path}\n请先运行 fetch_catalog.py")

    cat = json.load(open(cat_path, encoding="utf-8")) if os.path.exists(cat_path) else {}
    courses = json.load(open(crs_path, encoding="utf-8"))["courses"]

    have, lack = set(), []
    for cname, v in cat.items():
        for f in v["files"]:
            p = os.path.join(out_dir, f.get("dir") or cname, f["name"] + ".mp4")
            if os.path.exists(p) and os.path.getsize(p) > 10000:
                have.add(f["rid"])
            else:
                lack.append((cname, f["name"]))

    total_playable = len({f["rid"] for v in cat.values() for f in v.get("files", [])})
    total_entries = len({(f["rid"], f.get("dir") or cname, f["name"])
                         for cname, v in cat.items() for f in v.get("files", [])})
    lines = ["店铺课程清单", "",
             f"课程总数 {len(courses)} 门；可下载课时 {total_entries} 条（去重 {total_playable} 个），"
             f"已下载 {len(have)} 个，待下载 {len(lack)} 条", ""]

    lines += ["一、有权限但尚未下载的课时", "-" * 70]
    if lack:
        lines += [f"  {c} / {n}" for c, n in lack]
    else:
        lines.append("  无（全部已下载完成）")
    lines.append("")

    free = [c for c in courses if str(c.get("price") or 0) in ("0", "0.0", "None", "")]
    lines += ["二、0 元课程（页面上若有「立即学习 / 0 元领取」入口，点击即可获得权益）", "-" * 70]
    if free:
        for c in sorted(free, key=lambda x: -x["videos"]):
            state = "已可下载" if c["accessible"] > 0 else ("有试看" if c["try"] > 0 else "未开通/无领取入口")
            lines.append(f"  {c['title']} | 视频 {c['videos']} | 时长 {c['hours']}h | {state}")
    else:
        lines.append("  本店无 0 元课程")
    lines.append("")

    pend = [c for c in courses if c["accessible"] == 0 and c["try"] == 0]
    lines += [f"三、需购买/开通后才可下载的课程（{len(pend)} 门）", "-" * 70,
              f"{'序号':<5}{'课程名称':<46}{'标价':<10}{'视频':<6}{'时长'}"]
    for i, c in enumerate(sorted(pend, key=lambda x: -int(x.get("price") or 0)), 1):
        t = c["title"] if len(c["title"]) <= 44 else c["title"][:43] + "…"
        lines.append(f"{i:<5}{t:<46}{price(c.get('price')):<10}{c['videos']:<6}{c['hours']} h")
    lines.append("")

    oklist = [c for c in courses if c["accessible"] > 0]
    lines += [f"四、已可下载的课程（{len(oklist)} 门）", "-" * 70]
    for c in sorted(oklist, key=lambda x: x["title"]):
        lines.append(f"  {c['title']} | {c['accessible']} 课时 | {c['hours']}h")
    lines.append("")

    rep = os.path.join(out_dir, a.report)
    open(rep, "w", encoding="utf-8").write("\n".join(lines))
    print("已生成:", rep)


if __name__ == "__main__":
    main()
