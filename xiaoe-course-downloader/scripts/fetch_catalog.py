# -*- coding: utf-8 -*-
"""抓取店铺/单门课程的课时目录与权限，输出 catalog.json 与 courses.json。

支持的入口链接（任意一种都行）：
- 店铺首页      https://<app_id>.h5.xet.pomoho.com
- 课程详情页    https://<app_id>.h5.xet.pomoho.com/p/course/ecourse/course_xxx?type=2
- 分类/更多页   https://<app_id>.h5.xet.pomoho.com/p/decorate/more/<base64>
- 自定义域名    https://learn.example.com/p/course/...
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from xet import (COURSE_RE, Shop, add_common_args, find_more_urls,  # noqa: E402
                 load_cookie, parse_more_url, parse_url, sani)


def collect_goods(shop, page_id, comp_id, max_pages=50, page_size=20):
    """翻页拉取某个「查看更多」组件的全部商品。"""
    out, last = [], ""
    for p in range(1, max_pages + 1):
        lst, fin, last_id = shop.h5_more(page_id, comp_id, p, last, page_size)
        if not lst:
            break
        out.extend(lst)
        last = last_id if last_id is not None else len(out)
        if fin:
            break
        time.sleep(0.2)
    return out


def discover_goods(shop, page_id, max_pages, page_size):
    """从店铺首页出发，收集所有分类页里的商品。"""
    home_pid = shop.home_page_id(page_id)
    print("首页 micro_page_id:", home_pid)
    comps = shop.h5_index(home_pid)
    print("首页组件:", len(comps))

    goods = {}
    for c in comps:
        for it in (c.get("list") or []):
            if it.get("spu_id"):
                goods.setdefault(str(it["spu_id"]), it)

    more_urls = find_more_urls({"components": comps})
    print("分类/更多页:", len(more_urls))
    for u in sorted(more_urls):
        pid, cid = parse_more_url(u)
        if not pid:
            continue
        try:
            lst = collect_goods(shop, pid, cid, max_pages, page_size)
        except Exception as e:
            print("  跳过", pid, str(e)[:60])
            continue
        print(f"  分类页 {pid}: {len(lst)} 条")
        for it in lst:
            if it.get("spu_id"):
                goods.setdefault(str(it["spu_id"]), it)
    return goods


def load_old_names(meta_dir, out_dir):
    """复用上次的落盘文件名，避免重跑改名导致重复下载。"""
    names = {}
    for p in (os.path.join(meta_dir, "catalog.json"), os.path.join(out_dir, "catalog.json")):
        if not os.path.exists(p):
            continue
        try:
            for v in json.load(open(p, encoding="utf-8")).values():
                for f in v.get("files", []):
                    names[f["rid"]] = (f["dir"], f["name"])
        except Exception:
            pass
    return names


def main():
    ap = argparse.ArgumentParser(description="小鹅通课程抓取（通用）")
    add_common_args(ap)
    ap.add_argument("--out", default=".", help="输出根目录（默认当前目录）")
    ap.add_argument("--meta", default=None, help="元数据目录（默认 <out>/.xet）")
    ap.add_argument("--max-pages", type=int, default=50, help="每个分类页最多翻多少页")
    ap.add_argument("--page-size", type=int, default=20)
    ap.add_argument("--course", action="append", default=[], help="额外指定课程 id/链接，可重复")
    ap.add_argument("--scan-shop", action="store_true", help="给了课程链接时也扫描整个店铺")
    a = ap.parse_args()

    u = parse_url(a.url, a.app_id)
    try:
        cookie = load_cookie(a.cookie_file, a.cookie)
    except ValueError as e:
        sys.exit(str(e))
    shop = Shop(u["host"], u["app_id"], cookie, no_proxy=a.no_proxy)
    if ".h5.xet." not in u["host"] and not a.app_id:
        shop.detect_app_id()  # 自定义域名：从首页挖真实 app_id
    print(f"店铺域名: {u['host']}  app_id: {shop.app_id}")

    out_dir = os.path.abspath(a.out)
    meta_dir = os.path.abspath(a.meta or os.path.join(out_dir, ".xet"))
    os.makedirs(meta_dir, exist_ok=True)

    # 目标课程：显式 --course + URL 自带的 course_xxx
    targets = []
    for c in list(a.course) + ([a.url] if u["course_id"] else []):
        cid_m = COURSE_RE.search(c)
        if cid_m and cid_m.group(1) not in targets:
            targets.append(cid_m.group(1))

    goods = {}
    if targets and not a.scan_shop:
        print("仅抓取指定课程:", len(targets), "门")
        for cid in targets:
            title = shop.course_title(cid)
            goods[cid] = {"spu_id": cid, "title": title, "price": 0}
            print(f"  {title[:40]}  ({cid})")
    else:
        goods = discover_goods(shop, u["page_id"], a.max_pages, a.page_size)
        for cid in targets:
            goods.setdefault(cid, {"spu_id": cid, "title": shop.course_title(cid), "price": 0})
    print("店铺课程(去重):", len(goods))
    if not goods:
        sys.exit("未发现任何课程：请确认链接与 Cookie 是否正确")

    old_name = load_old_names(meta_dir, out_dir)

    catalog, courses = {}, []
    for i, (cid, item) in enumerate(sorted(goods.items(), key=lambda x: -int(x[1].get("price") or 0)), 1):
        title = item.get("title") or cid
        try:
            items = shop.catalog(cid)
        except Exception as e:
            print(f"[{i}/{len(goods)}] {title[:30]} 目录失败: {str(e)[:50]}")
            items = []
        vids = [x for x in items if x.get("resource_type") == 3]
        ok = [x for x in vids if x.get("subscribe") in (1, "1") and x.get("available") in (1, "1")]
        trys = [x for x in vids if x.get("is_try") in (1, "1")]
        access = bool(ok)
        if vids and not access:
            access = shop.check_access(vids[0].get("resource_id"), cid)
        accessible = len(vids) if access else 0
        hours = round(sum(int(x.get("video_length") or 0) for x in vids) / 3600, 1)
        courses.append({"course_id": cid, "title": title, "price": item.get("price"),
                        "videos": len(vids), "accessible": accessible, "try": len(trys),
                        "hours": hours, "type": item.get("type")})
        print(f"[{i}/{len(goods)}] {title[:36]:38s} 视频{len(vids):4d} 可访问{accessible:4d} "
              f"试看{len(trys):3d} {hours:6.1f}h")

        playable = set()
        if access:
            playable = {x.get("resource_id") for x in vids}
        playable |= {x.get("resource_id") for x in trys}
        if not playable:
            continue
        d = sani(title)
        files = []
        for n, x in enumerate(vids, 1):
            rid = x.get("resource_id")
            if rid not in playable:
                continue
            t = sani(x.get("resource_title") or f"视频{n}")
            base = old_name[rid][1] if rid in old_name else f"{n:03d} {t}"
            files.append({"rid": rid, "dir": d, "name": base, "accessible": True})
        if files:
            catalog[title] = {"course_id": cid, "files": files}
        time.sleep(0.25)

    cat_path = os.path.join(meta_dir, "catalog.json")
    json.dump(catalog, open(cat_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump({"courses": courses}, open(os.path.join(meta_dir, "courses.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    tot = sum(c["videos"] for c in courses)
    down = sum(c["accessible"] + c["try"] for c in courses)
    print(f"\n完成：{len(courses)} 门课程，视频 {tot} 个，当前账号可下载 {down} 个")
    print("已写入:", cat_path)


if __name__ == "__main__":
    main()
