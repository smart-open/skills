# -*- coding: utf-8 -*-
"""按 catalog.json 批量下载课时：HLS 分片解密 -> ts -> mp4（无损转封装），跨目录硬链接去重。

通用性要点：
- 下载根目录默认当前目录（-o 可改），元数据默认放 <out>/.xet；
- catalog 缺省自动在 <out>/.xet/catalog.json 查找，不用手写路径；
- 已存在的 mp4（>10KB）自动跳过，可反复重跑补漏。
"""
import argparse
import json
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from Crypto.Cipher import AES

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from xet import Shop, add_common_args, load_cookie, parse_url  # noqa: E402

RETRY = 3


def parse_m3u8(text, base_url):
    key_url, iv, segs = None, None, []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("#EXT-X-KEY"):
            m = re.search(r'URI="([^"]+)"', line)
            if m:
                key_url = m.group(1)
            m = re.search(r"IV=0x([0-9a-fA-F]+)", line)
            if m:
                iv = m.group(1)
        elif line and not line.startswith("#"):
            base = base_url.rsplit("/", 1)[0]
            segs.append(line if line.startswith("http") else base + "/" + line)
    return key_url, iv, segs


def download_video(shop, rid, cid, dest_dir, base_name, seg_workers, seg_delay):
    m3u8_url, _ = shop.video_url(rid, cid)
    r = shop.s.get(m3u8_url, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"m3u8 HTTP {r.status_code}")
    key_url, iv_hex, segs = parse_m3u8(r.text, m3u8_url)
    if not segs:
        raise RuntimeError("empty segment list")
    key = None
    if key_url:
        kr = shop.s.get(key_url, timeout=30)
        if kr.status_code != 200 or len(kr.content) < 16:
            raise RuntimeError(f"key fetch failed {kr.status_code}")
        key = kr.content[:16]
    iv = bytes.fromhex(iv_hex) if iv_hex else bytes(16)
    if len(iv) != 16:
        iv = bytes(16)

    os.makedirs(dest_dir, exist_ok=True)
    tmp_ts = os.path.join(dest_dir, base_name + ".part.ts")
    tmp_mp4 = os.path.join(dest_dir, base_name + ".part.mp4")
    final = os.path.join(dest_dir, base_name + ".mp4")

    def fetch_seg(url):
        for a in range(RETRY):
            try:
                if seg_delay:
                    time.sleep(seg_delay)
                rr = shop.s.get(url, timeout=(5, 20))
                if rr.status_code != 200:
                    raise RuntimeError(f"HTTP {rr.status_code}")
                data = rr.content
                if key:
                    data = AES.new(key, AES.MODE_CBC, iv).decrypt(data)
                    if data:
                        n = data[-1]
                        if 1 <= n <= 16 and data[-n:] == bytes([n]) * n:
                            data = data[:-n]
                return data
            except Exception:
                if a == RETRY - 1:
                    raise
                time.sleep(1 + a)

    window = 64
    with open(tmp_ts, "wb") as f, ThreadPoolExecutor(max_workers=seg_workers) as ex:
        for start in range(0, len(segs), window):
            for data in ex.map(fetch_seg, segs[start:start + window]):
                f.write(data)
    total = os.path.getsize(tmp_ts)

    import subprocess
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", tmp_ts,
           "-c", "copy", "-bsf:a", "aac_adtstoasc", tmp_mp4]
    p = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=3600)
    if p.returncode != 0 or not os.path.exists(tmp_mp4) or os.path.getsize(tmp_mp4) < 10000:
        raise RuntimeError("ffmpeg remux failed: " + p.stderr.decode("utf-8", "ignore")[-300:])
    os.replace(tmp_mp4, final)
    try:
        os.remove(tmp_ts)
    except OSError:
        pass
    return final, total, len(segs)


def main():
    ap = argparse.ArgumentParser(description="小鹅通课时批量下载（通用）")
    add_common_args(ap)
    ap.add_argument("--catalog", default=None, help="catalog.json 路径（默认 <out>/.xet/catalog.json）")
    ap.add_argument("--out", "-o", default=".", help="下载根目录（默认当前目录）")
    ap.add_argument("--only", default=None, help="只处理目录名包含该关键字的课程")
    ap.add_argument("--limit", type=int, default=None, help="最多下载前 N 个课时")
    ap.add_argument("--video-workers", type=int, default=2, help="并行视频数，网络差时设 1")
    ap.add_argument("--seg-workers", type=int, default=4, help="单视频内分片并发")
    ap.add_argument("--seg-delay", type=float, default=0)
    a = ap.parse_args()

    u = parse_url(a.url, a.app_id)
    try:
        cookie = load_cookie(a.cookie_file, a.cookie)
    except ValueError as e:
        sys.exit(str(e))
    shop = Shop(u["host"], u["app_id"], cookie, no_proxy=a.no_proxy)

    base_dir = os.path.abspath(a.out)
    os.makedirs(base_dir, exist_ok=True)
    meta_dir = os.path.join(base_dir, ".xet")
    cat_path = a.catalog or os.path.join(meta_dir, "catalog.json")
    if not os.path.exists(cat_path):
        sys.exit(f"找不到 catalog：{cat_path}\n请先运行 fetch_catalog.py")
    log_path = os.path.join(base_dir, "download.log")
    lock = threading.Lock()

    def log(msg):
        print(msg, flush=True)
        try:
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(msg + "\n")
        except OSError:
            pass

    cat = json.load(open(cat_path, encoding="utf-8"))
    primary, links = {}, []
    for cname, v in cat.items():
        for f in v["files"]:
            rid, d, base = f["rid"], f.get("dir") or cname, f["name"]
            links.append((d, base, rid))
            primary.setdefault(rid, (d, base, v["course_id"]))

    jobs = [(rid, d, base, cid) for rid, (d, base, cid) in primary.items()]
    if a.only:
        keep_dirs = {x[0] for x in links if a.only in x[0]}
        jobs = [j for j in jobs if j[1] in keep_dirs]
    if a.limit:
        jobs = jobs[:a.limit]

    skip = sum(1 for _r, d, b, _c in jobs
               if os.path.exists(os.path.join(base_dir, d, b + ".mp4"))
               and os.path.getsize(os.path.join(base_dir, d, b + ".mp4")) > 10000)
    print(f"待下载唯一视频: {len(jobs)}（已完成 {skip}，本次需下 {len(jobs) - skip}）")
    done, fails = 0, []

    def work(job):
        nonlocal done
        rid, cname, base, cid = job
        d = os.path.join(base_dir, cname)
        final = os.path.join(d, base + ".mp4")
        if os.path.exists(final) and os.path.getsize(final) > 10000:
            with lock:
                done += 1
            return "skip", final, 0
        try:
            final, total, nseg = download_video(shop, rid, cid, d, base, a.seg_workers, a.seg_delay)
            with lock:
                done += 1
                log(f"[{done}/{len(jobs)}] OK {cname}/{base}  {total / 1e6:.1f}MB  {nseg}seg")
            return "ok", final, total
        except Exception as e:
            with lock:
                done += 1
                log(f"[{done}/{len(jobs)}] FAIL {cname}/{base} -> {e}")
            return "fail", f"{cname}/{base} :: {e}", 0

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=a.video_workers) as ex:
        for fut in as_completed([ex.submit(work, j) for j in jobs]):
            st, info, _sz = fut.result()
            if st == "fail":
                fails.append(info)

    print("构建课程目录（硬链接去重）...")
    created = 0
    for d, base, rid in links:
        if a.only and a.only not in d:
            continue
        dst = os.path.join(base_dir, d, base + ".mp4")
        if os.path.exists(dst):
            continue
        pd, pb, _cid = primary[rid]
        src = os.path.join(base_dir, pd, pb + ".mp4")
        if not os.path.exists(src):
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        try:
            os.link(src, dst)
        except OSError:
            import shutil
            shutil.copy2(src, dst)
        created += 1

    fail_path = os.path.join(meta_dir, "fails.txt")
    if fails:
        os.makedirs(meta_dir, exist_ok=True)
        open(fail_path, "w", encoding="utf-8").write("\n".join(fails))
    elif os.path.exists(fail_path):
        os.remove(fail_path)

    print(f"硬链接完成: {created}，耗时 {time.time() - t0:.0f}s，失败 {len(fails)}")
    if fails:
        print("失败清单:", fail_path)


if __name__ == "__main__":
    main()
