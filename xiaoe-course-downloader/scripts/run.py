# -*- coding: utf-8 -*-
"""一键入口：抓目录 -> 下载 -> 出报告。默认输出到当前工作目录（会话根目录）。

常用：
  python run.py --url https://abc.h5.xet.pomoho.com --cookie-file cookies.txt
  python run.py --url <课程链接> --cookie "xxx"
  python run.py --url <店铺链接> --cookie-file cookies.txt --report-only
"""
import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from xet import COOKIE_GUIDE  # noqa: E402


def call(script, argv):
    cmd = [sys.executable, os.path.join(HERE, script)] + argv
    print("\n$ " + " ".join(cmd) + "\n", flush=True)
    return subprocess.call(cmd)


def have_cookie(a):
    """Cookie 未就绪时直接给出获取指引，避免子进程跑一半才报错。"""
    if (a.cookie or "").strip():
        return True
    if a.cookie_file and os.path.exists(a.cookie_file):
        try:
            with open(a.cookie_file, encoding="utf-8", errors="ignore") as f:
                return bool(f.read().strip())
        except OSError:
            return False
    return bool(os.environ.get("XET_COOKIE", "").strip())


def main():
    ap = argparse.ArgumentParser(description="小鹅通课程备份一键流程")
    ap.add_argument("--url", required=True, help="店铺首页 / 课程页 / 分类页链接")
    ap.add_argument("--app-id", default=None)
    ap.add_argument("--cookie", default=None, help="Cookie 字符串")
    ap.add_argument("--cookie-file", default="cookies.txt", help="Cookie 文件（纯串/curl/Netscape 均可）")
    ap.add_argument("--out", "-o", default=".", help="输出根目录，默认当前目录")
    ap.add_argument("--course", action="append", default=[], help="只下指定课程 id，可重复")
    ap.add_argument("--scan-shop", action="store_true", help="给课程链接时仍扫描全店")
    ap.add_argument("--only", default=None, help="只下载名称含该关键字的课程")
    ap.add_argument("--video-workers", type=int, default=2)
    ap.add_argument("--seg-workers", type=int, default=4)
    ap.add_argument("--seg-delay", type=float, default=0)
    ap.add_argument("--no-proxy", action="store_true")
    ap.add_argument("--report-only", action="store_true", help="只出报告，不下载")
    ap.add_argument("--no-report", action="store_true", help="只下载，不出报告")
    a = ap.parse_args()

    if not have_cookie(a):
        sys.exit(COOKIE_GUIDE + "\n\n拿到 Cookie 后重跑：\n  python run.py --url \"<链接>\" --cookie-file cookies.txt")

    out = os.path.abspath(a.out)
    os.makedirs(out, exist_ok=True)
    common = ["--url", a.url, "--out", out, "--no-proxy"] if a.no_proxy else ["--url", a.url, "--out", out]
    if a.app_id:
        common += ["--app-id", a.app_id]
    if a.cookie:
        common += ["--cookie", a.cookie]
    else:
        common += ["--cookie-file", a.cookie_file]

    fetch = common + (["--scan-shop"] if a.scan_shop else [])
    for c in a.course:
        fetch += ["--course", c]
    if call("fetch_catalog.py", fetch):
        sys.exit("抓取课程目录失败")
    if a.report_only:
        if not a.no_report:
            call("gen_report.py", ["--out", out])
        return

    dl = common + ["--video-workers", str(a.video_workers), "--seg-workers", str(a.seg_workers),
                   "--seg-delay", str(a.seg_delay)]
    if a.only:
        dl += ["--only", a.only]
    call("download.py", dl)
    if not a.no_report:
        call("gen_report.py", ["--out", out])


if __name__ == "__main__":
    main()
