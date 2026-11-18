# -*- coding: utf-8 -*-
"""小鹅通 H5 接口封装：URL 解析、Cookie 读取、课程目录、权限探测、播放地址。

通用性要点：
- 不绑定特定店铺域名/子域名，app_id 从链接里自动解析，也支持 --app-id 覆盖；
- 支持店铺首页、课程页、分类页（more）等任意 H5 链接作为入口；
- Cookie 支持纯 Cookie 串、curl 命令、Netscape cookies.txt 三种来源。
"""
import base64
import json
import os
import re
import time

import requests

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/157.0.0.0 Safari/537.36")
MAP = {"@": "1", "#": "2", "$": "3", "%": "4"}
COURSE_RE = re.compile(r"(course_[A-Za-z0-9]{6,})")

COOKIE_GUIDE = """未找到 Cookie —— 本技能需要已登录账号的 Cookie，请先获取：

  1. 电脑浏览器打开店铺链接（https://<app_id>.h5.xet.pomoho.com）并登录
  2. F12 开发者工具 -> Network（网络）-> 刷新页面
  3. 点任意一个 h5_index 或 xe. 开头的请求 -> Request Headers 里的 Cookie
  4. 整行复制 Cookie 的值，粘贴保存为 cookies.txt（或直接用 --cookie "粘贴内容"）

  也可：右键请求 -> Copy as cURL，整段粘贴进 cookies.txt；
        用 Cookie-Editor 插件导出 Netscape 格式 cookies.txt。
  注意：必须是同一店铺域名下登录后的 Cookie，整行复制，不要只挑字段。
  验证：先 --report-only 出清单，能列出课程即有效。"""


# ---------------------------- 基础工具 ----------------------------

def sani(name, maxlen=110):
    """文件名净化：非法字符替换、压缩空白、截断。"""
    name = re.sub(r'[\\/:*?"<>|\r\n\t]', "_", str(name)).strip().strip(".")
    name = re.sub(r"\s+", " ", name)
    return name[:maxlen].strip() or "untitled"


def decrypt_urls(t):
    """播放地址是自定义 base64 + 字符映射加密，需还原。"""
    if "__ba" in str(t):
        t = str(t).replace("__ba", "")
        t = t.translate(str.maketrans(MAP))
        t = t.replace("-", "+").replace("_", "/")
        pad = (-len(t)) % 4
        s = base64.b64decode(t + "=" * pad).decode("utf-8")
        if not s.startswith("http"):
            s = json.loads(s)
        return s
    return t


def parse_more_url(url):
    """解析 /p/decorate/more/<base64> 形式的「查看更多」链接，返回 (page_id, component_id)。"""
    try:
        b = url.rstrip("/").split("/")[-1].split("?")[0]
        pad = (-len(b)) % 4
        raw = base64.urlsafe_b64decode(b + "=" * pad).decode("utf-8")
        d = json.loads(raw)
        return str(d.get("id") or d.get("page_id") or ""), str(d.get("component_id") or "")
    except Exception:
        return "", ""


def find_more_urls(obj, out=None):
    """递归收集页面配置里所有「查看更多」链接。"""
    if out is None:
        out = set()
    if isinstance(obj, dict):
        for v in obj.values():
            find_more_urls(v, out)
    elif isinstance(obj, list):
        for v in obj:
            find_more_urls(v, out)
    elif isinstance(obj, str) and "/p/decorate/more/" in obj:
        out.add(obj)
    return out


def parse_url(url, app_id=None):
    """解析任意小鹅通 H5 链接。

    返回 dict(host, app_id, course_id, page_id)。
    - 店铺首页 / 任意子页面：只取 host 与 app_id
    - 课程页 /p/course/.../course_xxx：额外取出 course_id
    - 分类页 /p/decorate/more/<base64>：额外取出 page_id
    """
    url = (url or "").strip()
    if not url:
        raise ValueError("未提供链接")
    if not url.startswith("http"):
        url = "https://" + url
    m = re.match(r"(https?://[^/?#]+)", url, re.I)
    host = m.group(1).rstrip("/") if m else url
    hostname = re.sub(r"^https?://", "", host, flags=re.I).split(":")[0]

    guess = hostname.split(".")[0]
    aid = app_id or guess

    cm = COURSE_RE.search(url)
    course_id = cm.group(1) if cm else None

    page_id = ""
    if "/p/decorate/more/" in url:
        page_id = parse_more_url(url)[0]
    if not page_id:
        pm = re.search(r"[?&](?:page_id|micro_page_id)=(\d+)", url)
        page_id = pm.group(1) if pm else ""

    return {"host": host, "app_id": aid, "course_id": course_id, "page_id": page_id}


def load_cookie(path=None, text=None, env="XET_COOKIE"):
    """读取 Cookie，兼容三种来源：纯 Cookie 串 / curl 命令 / Netscape cookies.txt。"""
    raw = ""
    if text:
        raw = text
    elif path and os.path.exists(path):
        raw = open(path, encoding="utf-8", errors="ignore").read()
    else:
        raw = os.environ.get(env, "")
    raw = raw.strip()
    if not raw:
        missing = "" if not path or os.path.exists(path) else "（%s 不存在）" % path
        raise ValueError("未找到 Cookie%s\n\n%s" % (missing, COOKIE_GUIDE))

    # 1) Netscape cookies.txt（7 列制表符分隔）
    netscape = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) >= 7:
            netscape.append("%s=%s" % (parts[5], parts[6]))
    if netscape:
        return "; ".join(netscape)

    # 2) curl 命令里的 -b / --cookie
    if "curl" in raw and ("-b " in raw or "--cookie" in raw):
        m = re.search(r"(?:-b|--cookie)\s+'([^']+)'", raw) or re.search(r'(?:-b|--cookie)\s+"([^"]+)"', raw)
        if m:
            return m.group(1).strip()
        m = re.search(r"(?:-b|--cookie)\s+(\S+)", raw)
        if m and os.path.exists(m.group(1)):
            return open(m.group(1), encoding="utf-8").read().strip()

    # 3) 纯 Cookie 串
    if "\n" in raw:
        raw = " ".join(raw.split())
    return raw


def add_common_args(ap):
    """给各脚本统一加 --url / --app-id / --cookie 参数。"""
    ap.add_argument("--url", required=True,
                    help="店铺首页或课程页链接，如 https://<app_id>.h5.xet.pomoho.com 或 .../p/course/.../course_xxx")
    ap.add_argument("--app-id", default=None, help="店铺 app_id（默认从域名解析）")
    ap.add_argument("--cookie", default=None, help="直接给 Cookie 字符串（与 --cookie-file 二选一）")
    ap.add_argument("--cookie-file", default="cookies.txt",
                    help="Cookie 文件：纯 Cookie 串 / curl 命令 / Netscape cookies.txt 均可")
    ap.add_argument("--no-proxy", action="store_true", help="忽略系统代理（本机代理不通时使用）")
    return ap


# ---------------------------- 接口封装 ----------------------------

class Shop:
    def __init__(self, host, app_id, cookie, ua=UA, no_proxy=False, timeout=30):
        self.host = host.rstrip("/")
        self.app_id = app_id
        self.ua = ua
        self.timeout = timeout
        self.s = requests.Session()
        if no_proxy:
            self.s.trust_env = False
            self.s.proxies = {}
        self.s.headers.update({
            "User-Agent": ua, "Cookie": cookie, "Origin": self.host, "Referer": self.host + "/",
            "Accept": "*/*", "Accept-Language": "zh-CN,zh;q=0.9", "Connection": "close",
        })

    # ---------- 微页面 ----------
    @staticmethod
    def _json(r, what):
        """统一解析：空响应多半是 Cookie 失效或触发风控，给出可执行的提示。"""
        if not (r.text or "").strip():
            raise RuntimeError(
                f"{what} 返回空响应：Cookie 可能已失效，或 IP 被风控（HTTP {r.status_code}）")
        try:
            return r.json()
        except ValueError:
            raise RuntimeError(f"{what} 返回非 JSON（HTTP {r.status_code}）：{r.text[:120]}")

    def h5_index(self, page_id, timeout=(5, 25)):
        r = self.s.post(self.host + "/xe.micro_page.h5_index/1.0.0", json={
            "app_id": self.app_id, "page_id": str(page_id), "agent_type": 1, "agent_version": 1,
            "agent": self.ua, "app_version": "0.1"}, timeout=timeout)
        j = self._json(r, "微页面组件")
        return (j.get("data") or {}).get("components") or []

    def h5_more(self, page_id, comp_id, page=1, last_id="", page_size=20, timeout=(5, 25)):
        r = self.s.post(self.host + "/xe.micro_page.h5_more/1.0.0", json={
            "app_id": self.app_id, "agent_type": 1, "agent_version": 1, "is_offset": 1,
            "app_version": "0.1", "agent": self.ua,
            "buz_data": {"id": str(page_id), "page_num": page, "page_size": page_size,
                         "last_id": last_id, "component_id": str(comp_id), "channel_id": "",
                         "alive_type": "", "order_by": "", "from_tag": 1}}, timeout=timeout)
        j = self._json(r, "课程列表")
        d = j.get("data") or {}
        c = d.get("component") or {}
        return c.get("list") or [], d.get("finished"), d.get("last_id")

    def _home_html(self):
        try:
            return self.s.get(self.host + "/", timeout=(10, 30)).text
        except Exception:
            return ""

    def detect_app_id(self):
        """自定义域名场景：从首页 HTML 里挖真实 app_id。"""
        text = self._home_html()
        for pat in (r'"app_id"\s*:\s*"([a-z0-9]+)"', r'app_id=([a-z0-9]+)', r'"appId"\s*:\s*"([a-z0-9]+)"'):
            m = re.search(pat, text, re.I)
            if m:
                self.app_id = m.group(1)
                return self.app_id
        return self.app_id

    def home_page_id(self, page_id=None):
        """定位店铺首页 micro_page_id：优先用传入值，其次从首页 HTML 提取。"""
        if page_id:
            return str(page_id)
        text = self._home_html()
        for pat in (r'"micro_page_id"\s*:\s*"?(\d+)', r"micro_page_id\s*[:=]\s*\"?(\d+)",
                    r"[?&](?:page_id|micro_page_id)=(\d+)"):
            m = re.search(pat, text)
            if m:
                return m.group(1)
        raise RuntimeError("无法从首页定位 micro_page_id（可在 --url 中带上 page_id 参数，或指定课程链接直接抓课）")

    # ---------- 课程 ----------
    def _catalog_page(self, course_id, page, flag, page_size, timeout):
        r = self.s.post(
            self.host + "/xe.course.business_go.avoidlogin.e_course.resource_catalog_list.get/1.0.0",
            data={"bizData[app_id]": self.app_id, "bizData[resource_id]": "",
                  "bizData[course_id]": course_id, "bizData[p_id]": "0", "bizData[order]": "asc",
                  "bizData[page]": str(page), "bizData[page_size]": str(page_size),
                  "bizData[is_display_auth_sections]": flag}, timeout=timeout)
        d = self._json(r, "课程目录").get("data") or {}
        return d.get("list") or [], int(d.get("total") or 0)

    def _catalog_all(self, course_id, flag, page_size, timeout):
        items, page = [], 1
        while page <= 20:
            lst, total = self._catalog_page(course_id, page, flag, page_size, timeout)
            items.extend(lst)
            if not lst or len(items) >= total:
                break
            page += 1
            time.sleep(0.2)
        return items

    def catalog(self, course_id, page_size=100, timeout=30):
        """is_display_auth_sections=0 才返回 subscribe/available；=1 才返回 is_try。两者合并。"""
        auth = self._catalog_all(course_id, "0", page_size, timeout)
        trys = self._catalog_all(course_id, "1", page_size, timeout)
        merged = {x.get("resource_id"): x for x in auth}
        for x in trys:
            rid = x.get("resource_id")
            if rid not in merged:
                merged[rid] = x
            elif x.get("is_try") in (1, "1"):
                merged[rid]["is_try"] = x.get("is_try")
        return list(merged.values())

    def course_title(self, course_id, timeout=20):
        """尽力取课程标题；取不到就回退 course_id。"""
        for key in ("bizData[resource_id]", "bizData[course_id]"):
            try:
                r = self.s.post(self.host + "/xe.course.business_go.core.info.get/2.0.0",
                                data={key: course_id, "bizData[app_id]": self.app_id}, timeout=timeout)
                d = (self._json(r, "课程信息") or {}).get("data") or {}
                for k in ("title", "course_title", "resource_title"):
                    if d.get(k):
                        return str(d[k])
                info = d.get("info") or {}
                if info.get("title"):
                    return str(info["title"])
            except Exception:
                continue
        return course_id

    def check_access(self, rid, course_id):
        """权限最可靠的判定：能取到播放地址就有权限（目录接口的 subscribe 字段并不可靠）。"""
        try:
            self.video_url(rid, course_id, retry=1)
            return True
        except Exception:
            return False

    def video_url(self, rid, course_id, retry=3, timeout=30, block_wait=90):
        last = None
        for i in range(retry):
            try:
                r = self.s.post(self.host + "/xe.course.business_go.video.detail_info.get/2.0.0",
                                data={"bizData[resource_id]": rid, "bizData[product_id]": course_id,
                                      "bizData[opr_sys]": "Win32"}, timeout=timeout)
                if not r.text.strip():
                    raise RuntimeError("blocked: empty response")
                j = self._json(r, "播放地址")
                d = j.get("data") or {}
                vu = d.get("video_urls")
                if not vu:
                    raise RuntimeError("no video_urls: %s" % j.get("msg"))
                urls = decrypt_urls(vu)
                if isinstance(urls, str):
                    urls = [{"url": urls, "definition_p": "?"}]
                urls = sorted(urls, key=lambda x: 0 if "720" in str(x.get("definition_p")) else 1)
                return urls[0]["url"], d
            except Exception as e:
                last = e
                if i == retry - 1:
                    break
                time.sleep(block_wait if "blocked" in str(e) else 2)
        raise RuntimeError(str(last))
