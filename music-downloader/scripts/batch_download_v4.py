#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
中国音乐批量下载器 V4
支持平台: 网易云、QQ音乐、酷狗、咪咕、汽水音乐
支持音质: standard(标准) / high(高品质) / lossless(无损)
核心接口: download(singer, song_name, quality="high")
"""

import os
import sys
import time
import json
import re
import argparse
import uuid
import urllib.parse
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Union

try:
    import requests
except ImportError:  # 托管 Python 缺失依赖时，自动引导本地 venv 安装 requests
    import subprocess, sys, os
    _HERE = os.path.dirname(os.path.abspath(__file__))
    _VENV = os.path.join(_HERE, ".venv")
    try:
        if not os.path.isdir(_VENV):
            subprocess.run([sys.executable, "-m", "venv", _VENV], check=True)
        _PIP = os.path.join(_VENV, "Scripts", "pip.exe") if os.name == "nt" \
            else os.path.join(_VENV, "bin", "pip")
        subprocess.run([_PIP, "install", "--quiet", "requests"], check=True)
        _SP = os.path.join(_VENV, "Lib", "site-packages") if os.name == "nt" \
            else os.path.join(_VENV, "lib", f"python{sys.version_info.major}.{sys.version_info.minor}", "site-packages")
        sys.path.insert(0, _SP)
    except Exception:
        pass
    import requests

try:
    import pandas as pd
except ImportError:
    pd = None
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

requests.packages.urllib3.disable_warnings()

PROJECT_ROOT = Path(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
EXCEL_FILE = PROJECT_ROOT / "中国各年代流行歌曲推荐500首.xlsx"
DEFAULT_OUTPUT = PROJECT_ROOT / "music_download"

# Quality mapping per platform
QUALITY_MAP = {
    "netease": {"standard": "standard", "high": "higher", "lossless": "lossless"},
    "qq": {"standard": "128", "high": "320", "lossless": "m4a"},
    "kugou": {"standard": "3", "high": "5", "lossless": "6"},
    "migu": {"standard": "PQ", "high": "HQ", "lossless": "SQ"},
    "soda": {"standard": "standard", "high": "high", "lossless": "lossless"},
}

class MusicDownloader:
    """中国主流音乐平台下载器 V4 - 支持5平台+音质选择"""

    def __init__(self, output_dir: str = DEFAULT_OUTPUT, delay: float = 1.0,
                 default_quality: str = "high", log_file: str = "download_log.txt"):
        self.output_dir = Path(output_dir)
        self.delay = delay
        self.default_quality = default_quality
        self.session = requests.Session()
        self.session.verify = False
        retry = Retry(total=2, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
        adapter = HTTPAdapter(max_retries=retry)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        self.stats = {"total": 0, "success": 0, "failed": 0, "skipped": 0}
        self.log_path = self.output_dir / log_file
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._log(f"=== MusicDownloader V4 启动 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ===")

    # ==================== Core API ====================
    def download(self, singer: str, song_name: str, output_dir: str = None,
                 era: str = "", level: str = "", quality: str = None,
                 skip_existing: bool = True) -> dict:
        """下载单首歌曲（MP3 + 歌词）
        Args:
            singer: 演唱者名称
            song_name: 歌曲名称
            output_dir: 输出目录
            era: 年代分类（可选）
            level: 推荐等级（可选）
            quality: 音质 - "standard"(标准) / "high"(高品质) / "lossless"(无损)
            skip_existing: 是否跳过已下载
        Returns:
            {"success": bool, "source": str, "mp3_path": str, "lrc_path": str, "message": str}
        """
        quality = (quality or self.default_quality).lower()
        if quality not in ("standard", "high", "lossless"):
            quality = "high"

        base_dir = Path(output_dir) if output_dir else self.output_dir
        base_dir.mkdir(parents=True, exist_ok=True)

        if era and level:
            save_dir = base_dir / self._sanitize(era) / self._sanitize(level)
        elif era:
            save_dir = base_dir / self._sanitize(era)
        else:
            save_dir = base_dir
        save_dir.mkdir(parents=True, exist_ok=True)

        filename = f"{self._sanitize(singer)} - {self._sanitize(song_name)}"
        mp3_path = save_dir / f"{filename}.mp3"
        lrc_path = save_dir / f"{filename}.lrc"

        if skip_existing and self._already_downloaded(mp3_path, lrc_path):
            self.stats["skipped"] += 1
            return {"success": True, "source": "cached", "mp3_path": str(mp3_path),
                    "lrc_path": str(lrc_path), "message": "已存在，跳过"}

        keyword = f"{singer} {song_name}"
        self._log(f"下载: {keyword} (音质={quality})")

        result = self._try_all_platforms(singer, song_name, mp3_path, lrc_path, quality)
        if result["success"]:
            self.stats["success"] += 1
            self._log(f"  [成功] {result['source']}: {song_name}")
        else:
            self.stats["failed"] += 1
            self._log(f"  [失败] {keyword}")

        self.stats["total"] += 1
        time.sleep(self.delay)
        return result

    def download_batch(self, songs: list, output_dir: str = None,
                       era: str = "", level: str = "", quality: str = None,
                       skip_existing: bool = True) -> list:
        """批量下载"""
        results = []
        for item in songs:
            s, sn, e, l = self._parse_song_item(item, era, level)
            if not s or not sn:
                results.append({"success": False, "message": f"无效输入: {item}"})
                continue
            result = self.download(s, sn, output_dir=output_dir, era=e, level=l,
                                   quality=quality, skip_existing=skip_existing)
            results.append(result)
        self._log(f"=== 批量完成: 成功={self.stats['success']}, 失败={self.stats['failed']}, 跳过={self.stats['skipped']} ===")
        return results

    def download_from_excel(self, excel_path: str = EXCEL_FILE, output_dir: str = None,
                            quality: str = None):
        """从Excel批量下载（自动过滤经典选曲）"""
        if pd is None:
            self._log("未安装 pandas，无法解析 Excel，请先 pip install pandas")
            return []
        self._log(f"读取Excel: {excel_path}")
        base_dir = Path(output_dir) if output_dir else self.output_dir
        all_sheets = pd.read_excel(excel_path, sheet_name=None)
        songs = []
        for sheet_name, df in all_sheets.items():
            if sheet_name == "总览" or "歌曲名称" not in df.columns:
                continue
            df_valid = df[~df["歌曲名称"].astype(str).str.contains("经典选曲", na=False)]
            for _, row in df_valid.iterrows():
                singer = str(row.get("演唱者", "")).strip()
                song_name = str(row.get("歌曲名称", "")).strip()
                level = str(row.get("推荐等级", "")).strip()
                if singer and song_name:
                    songs.append({"singer": singer, "song_name": song_name,
                                  "era": sheet_name, "level": level})
        self._log(f"共 {len(songs)} 首有效歌曲")
        self.download_batch(songs, output_dir=str(base_dir), quality=quality)

    def download_from_text(self, text: str, output_dir: str = None,
                           era: str = "", level: str = "", quality: str = None) -> list:
        """从多行文本批量下载"""
        songs = []
        for line in text.strip().splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                songs.append(line)
        return self.download_batch(songs, output_dir=output_dir, era=era, level=level, quality=quality)

    def download_from_file(self, file_path: str, output_dir: str = None,
                           era: str = "", level: str = "", quality: str = None) -> list:
        """从文本文件批量下载"""
        with open(file_path, "r", encoding="utf-8") as f:
            return self.download_from_text(f.read(), output_dir=output_dir,
                                           era=era, level=level, quality=quality)

    # ==================== Input Parsing ====================
    def _parse_song_item(self, item, default_era="", default_level=""):
        if isinstance(item, dict):
            s = str(item.get("singer", "")).strip()
            sn = str(item.get("song_name", item.get("name", item.get("song", "")))).strip()
            e = str(item.get("era", item.get("年代", ""))).strip() or default_era
            l = str(item.get("level", item.get("等级", ""))).strip() or default_level
            return s, sn, e, l
        if isinstance(item, (list, tuple)):
            s, sn = str(item[0]).strip(), str(item[1]).strip()
            e = str(item[2]).strip() if len(item) > 2 else default_era
            l = str(item[3]).strip() if len(item) > 3 else default_level
            return s, sn, e, l
        if isinstance(item, str):
            m = re.match(r'(.+?)的(.+)', item)
            if m and len(m.group(1)) <= 20:
                return m.group(1).strip(), m.group(2).strip(), default_era, default_level
            for sep in [",", "\t", " "]:
                if sep in item:
                    parts = item.split(sep, 1)
                    if len(parts) == 2:
                        return parts[0].strip(), parts[1].strip(), default_era, default_level
        return "", "", default_era, default_level

    # ==================== All Platforms Engine ====================
    def _try_all_platforms(self, singer: str, song_name: str, mp3_path: Path, lrc_path: Path, quality: str) -> dict:
        """依次尝试 网易云(稳健)→QQ→酷狗→咪咕→汽水"""
        keyword = f"{singer} {song_name}"
        # 1. NetEase (稳健: 演唱者校验 + 完整音频 + 真实时间轴歌词)
        if self._try_netease_robust(singer, song_name, mp3_path, lrc_path, quality):
            return {"success": True, "source": "网易云", "mp3_path": str(mp3_path),
                    "lrc_path": str(lrc_path), "message": f"网易云: {song_name}"}
        # 2. QQ
        songs = self._search_qq(keyword)
        for song in songs:
            if self._try_qq_apis(song["id"], mp3_path, lrc_path, quality):
                return {"success": True, "source": "QQ音乐", "mp3_path": str(mp3_path),
                        "lrc_path": str(lrc_path), "message": f"QQ音乐: {song['name']}"}
        # 3. Kugou
        songs = self._search_kugou(keyword)
        for song in songs:
            if self._try_kugou_apis(song["id"], mp3_path, lrc_path, quality):
                return {"success": True, "source": "酷狗", "mp3_path": str(mp3_path),
                        "lrc_path": str(lrc_path), "message": f"酷狗: {song['name']}"}
        # 4. Migu
        songs = self._search_migu(keyword)
        for song in songs:
            if self._try_migu_apis(song, mp3_path, lrc_path, quality):
                return {"success": True, "source": "咪咕", "mp3_path": str(mp3_path),
                        "lrc_path": str(lrc_path), "message": f"咪咕: {song['name']}"}
        # 5. Soda
        songs = self._search_soda(keyword)
        for song in songs:
            if self._try_soda_apis(song, mp3_path, lrc_path, quality):
                return {"success": True, "source": "汽水", "mp3_path": str(mp3_path),
                        "lrc_path": str(lrc_path), "message": f"汽水: {song['name']}"}

        return {"success": False, "source": "", "mp3_path": "", "lrc_path": "",
                "message": f"所有平台均无法下载: {keyword}"}

    # ========== NetEase (稳健: 演唱者校验 + 完整音频 + 真实时间轴歌词) ==========
    def _search_netease(self, keyword: str, limit: int = 10) -> list:
        try:
            h = {"User-Agent": "Mozilla/5.0", "Referer": "https://music.163.com/"}
            resp = self.session.post("https://music.163.com/api/cloudsearch/pc",
                                     data={"s": keyword, "type": 1, "limit": limit, "offset": 0},
                                     headers=h, timeout=10)
            songs = resp.json().get("result", {}).get("songs", [])
            return [{"id": s["id"], "name": s.get("name", ""),
                     "artist": ", ".join([a["name"] for a in s.get("artists", [])])} for s in songs]
        except:
            return []

    def _get_netease_detail(self, song_id) -> dict:
        try:
            h = {"User-Agent": "Mozilla/5.0", "Referer": "https://music.163.com/"}
            resp = self.session.post("https://music.163.com/api/song/detail",
                                     data={"id": song_id, "ids": "[" + str(song_id) + "]"},
                                     headers=h, timeout=15)
            songs = resp.json().get("songs", [])
            if songs:
                s = songs[0]
                return {
                    "name": s.get("name", ""),
                    "artist": ", ".join([a.get("name", "") for a in s.get("artists", [])]),
                    "album": s.get("album", {}).get("name", ""),
                }
        except:
            pass
        return {}

    @staticmethod
    def _artist_matches(artist_str: str, singer: str) -> bool:
        if not artist_str or not singer:
            return False
        a = re.sub(r"[\s\-–—&/、，,]", "", str(artist_str)).lower()
        s = re.sub(r"[\s\-–—&/、，,]", "", str(singer)).lower()
        return bool(s) and (s in a or a in s)

    @staticmethod
    def _has_timestamps(text: str) -> bool:
        return len(re.findall(r"\[\d{1,2}:\d{2}", text or "")) >= 3

    @staticmethod
    def _score_originality(name: str, song_name: str) -> int:
        """原版倾向打分: 名称越接近纯'歌名'越高；带翻唱/Live/DJ/乐器版等后缀扣分"""
        n = (name or "").strip()
        s = (song_name or "").strip()
        core = re.sub(r"[\(（\[【][^\)）\]\】]*[\)）\]\】]", "", n)  # 去括号内容
        core = re.sub(r"\s+", "", core)
        score = 0
        if core == s or core.startswith(s):
            score += 100
        penalty = ["原唱", "翻唱", "Cover", "cover", "Live", "live", "DJ", "dj",
                   "Remix", "remix", "版", "Demo", "demo", "女生", "男生",
                   "女声", "男声", "钢琴", "吉他", "伴奏", "致敬", "现场",
                   "试听", "串烧", "慢摇", "电音", "烟嗓", "戏腔", "古风",
                   "卡点", "深情", "正式", "完整", "纯音乐", "Instrumental"]
        for t in penalty:
            if t in n:
                score -= 30
        return score

    # ---- 镜像音频直链 fetcher (完整音频优先) ----
    def _netease_url_cenguigui(self, sid, level):
        try:
            r = self.session.get(
                f"https://api-v2.cenguigui.cn/api/netease/music_v1.php?id={sid}&type=json&level={level}",
                headers={"user-agent": "Mozilla/5.0"}, timeout=15)
            return r.json().get("data", {}).get("url", "")
        except:
            return ""

    def _netease_url_haitangw(self, sid, level):
        try:
            r = self.session.get(
                f"https://musicapi.haitangw.net/music/wy.php?id={sid}&level={level}&type=json",
                headers={"user-agent": "Mozilla/5.0"}, timeout=15)
            return r.json().get("data", {}).get("url", "")
        except:
            return ""

    def _netease_url_rrvenn(self, sid, level):
        try:
            h = {"User-Agent": "Mozilla/5.0", "Referer": "https://music.rrvenn.cn/"}
            r = self.session.post("https://music.rrvenn.cn/Song_V1",
                                  json={"url": str(sid), "level": level, "type": "json"},
                                  headers=h, timeout=15)
            return r.json().get("data", {}).get("url", "")
        except:
            return ""

    def _netease_url_toubiec(self, sid, level):
        try:
            h = {"Origin": "https://wyapi.toubiec.cn", "Referer": "https://wyapi.toubiec.cn/",
                 "User-Agent": "Mozilla/5.0"}
            r = self.session.post("https://nextmusic.toubiec.cn/api/getSongUrl", headers=h,
                                  json={"id": str(sid), "level": level,
                                        "timestamp": int(time.time() * 1000)}, timeout=15)
            return r.json().get("data", {}).get("url", "")
        except:
            return ""

    def _download_netease_audio(self, sid, mp3_path: Path, quality: str, min_mb: float = 1.5) -> bool:
        levels = {"high": ["exhigh", "higher", "standard"],
                  "standard": ["standard", "higher"],
                  "lossless": ["lossless", "exhigh"]}.get(quality, ["exhigh", "higher", "standard"])
        # 顺序: 优先完整音频镜像，toubiec 易返回截断片段，放最后兜底
        fetchers = [self._netease_url_cenguigui, self._netease_url_haitangw,
                    self._netease_url_rrvenn, self._netease_url_toubiec]
        part = mp3_path.with_suffix(".part.mp3")  # 临时文件，达标才原子改名
        for fetcher in fetchers:
            for lvl in levels:
                url = fetcher(sid, lvl)
                if not url or not url.startswith("http"):
                    continue
                size = self._fetch_url_to_file(url, part)
                if size >= min_mb * 1024 * 1024:
                    part.replace(mp3_path)  # 完整 -> 落盘为最终文件
                    return True
                # 文件过小(被截断片段) -> 清理临时文件并尝试下一源
                if part.exists():
                    try:
                        part.unlink()
                    except Exception:
                        pass
        return False

    def _fetch_netease_lyric(self, sid, lrc_path: Path) -> bool:
        """官方歌词接口，返回带时间轴的真实 LRC"""
        try:
            h = {"User-Agent": "Mozilla/5.0", "Referer": "https://music.163.com/"}
            r = self.session.post("https://music.163.com/api/song/lyric",
                                  data={"id": sid, "lv": 1, "kv": 1, "tv": -1},
                                  headers=h, timeout=15)
            data = r.json()
            lrc = data.get("lrc", {})
            lyric = lrc.get("lyric", "") if isinstance(lrc, dict) else ""
            if self._has_timestamps(lyric):
                lrc_path.write_text(lyric, encoding="utf-8")
                return True
        except:
            pass
        return False

    def _fetch_netease_lyric_inline(self, sid, lrc_path: Path) -> bool:
        """镜像源内联歌词兜底"""
        inline = [
            f"https://api-v2.cenguigui.cn/api/netease/music_v1.php?id={sid}&type=json&level=exhigh",
            f"https://musicapi.haitangw.net/music/wy.php?id={sid}&level=exhigh&type=json",
        ]
        for url in inline:
            try:
                r = self.session.get(url, headers={"user-agent": "Mozilla/5.0"}, timeout=15)
                lyric = r.json().get("data", {}).get("lyric", "")
                if self._has_timestamps(lyric):
                    lrc_path.write_text(lyric, encoding="utf-8")
                    return True
            except:
                continue
        return False

    def _get_netease_lyric_best(self, primary_id, all_ids, lrc_path: Path) -> bool:
        # 同一首歌在不同版本间歌词文本一致，优先用主 ID，缺失则回退其他候选
        for sid in [primary_id] + [i for i in all_ids if i != primary_id]:
            if self._fetch_netease_lyric(sid, lrc_path):
                return True
        for sid in all_ids:
            if self._fetch_netease_lyric_inline(sid, lrc_path):
                return True
        lrc_path.write_text("[00:00.000]暂无歌词\n", encoding="utf-8")
        return False

    def _try_netease_robust(self, singer, song_name, mp3_path: Path, lrc_path: Path, quality: str) -> bool:
        candidates = self._search_netease(f"{singer} {song_name}", limit=10)
        if not candidates:
            return False
        enriched = []
        for c in candidates[:10]:
            d = self._get_netease_detail(c["id"]) or {}
            c["artist"] = d.get("artist") or c.get("artist", "")
            c["album"] = d.get("album", "")
            c["match"] = self._artist_matches(c.get("artist", ""), singer)
            enriched.append(c)
        matched = [c for c in enriched if c["match"]]
        if not matched:
            # 搜索接口降级或未收录原唱 -> 不静默返回翻唱/片段
            self._log(f"  ⚠️ 网易云搜索结果未匹配到原唱「{singer}」，可能为翻唱或搜索接口降级，跳过")
            return False
        # 原唱匹配者中，优先"最像原版"的名称(Live/翻唱/DJ 等后缀扣分)
        matched.sort(key=lambda x: -self._score_originality(x["name"], song_name))
        all_ids = [c["id"] for c in enriched]
        for c in matched:
            if self._download_netease_audio(c["id"], mp3_path, quality, min_mb=1.5):
                self._get_netease_lyric_best(c["id"], all_ids, lrc_path)
                self._log(f"  网易云命中原唱: {c.get('name')} / {c.get('artist')}")
                return True
        return False

    # ========== 按 NetEase 歌曲 ID 精确下载（搜索降级时的可靠通道） ==========
    def download_by_id(self, netease_id, singer: str = "", song_name: str = "",
                       output_dir: str = None, era: str = "", level: str = "",
                       quality: str = None, skip_existing: bool = True) -> dict:
        quality = (quality or self.default_quality).lower()
        if quality not in ("standard", "high", "lossless"):
            quality = "high"
        base_dir = Path(output_dir) if output_dir else self.output_dir
        base_dir.mkdir(parents=True, exist_ok=True)
        if era and level:
            save_dir = base_dir / self._sanitize(era) / self._sanitize(level)
        elif era:
            save_dir = base_dir / self._sanitize(era)
        else:
            save_dir = base_dir
        save_dir.mkdir(parents=True, exist_ok=True)

        detail = self._get_netease_detail(netease_id) or {}
        singer = (singer or detail.get("artist") or "未知歌手").strip()
        song_name = (song_name or detail.get("name") or str(netease_id)).strip()
        filename = f"{self._sanitize(singer)} - {self._sanitize(song_name)}"
        mp3_path = save_dir / f"{filename}.mp3"
        lrc_path = save_dir / f"{filename}.lrc"

        if skip_existing and self._already_downloaded(mp3_path, lrc_path):
            self.stats["skipped"] += 1
            return {"success": True, "source": "cached", "mp3_path": str(mp3_path),
                    "lrc_path": str(lrc_path), "message": "已存在，跳过"}

        self._log(f"按ID下载: {netease_id} (音质={quality}) -> {filename}")
        if not self._download_netease_audio(netease_id, mp3_path, quality, min_mb=1.5):
            self.stats["failed"] += 1
            self._log(f"  [失败] 无法获取音频: {netease_id}")
            return {"success": False, "source": "", "mp3_path": "",
                    "lrc_path": "", "message": f"按ID下载音频失败: {netease_id}"}
        self._get_netease_lyric_best(netease_id, [netease_id], lrc_path)
        self.stats["success"] += 1
        self._log(f"  [成功] 按ID下载: {filename}")
        return {"success": True, "source": "网易云(按ID)", "mp3_path": str(mp3_path),
                "lrc_path": str(lrc_path), "message": f"网易云: {filename}"}

    # ========== QQ Music ==========
    def _search_qq(self, keyword: str, limit: int = 5) -> list:
        try:
            params = {
                "format": "json", "inCharset": "utf-8", "outCharset": "utf-8",
                "notice": 0, "platform": "yqq.json", "needNewCode": 0,
                "data": json.dumps({
                    "req": {"method": "DoSearchForQQMusicDesktop",
                            "module": "music.search.SearchCgiService",
                            "param": {"remoteplace": "txt.yqq.center", "searchid": "", "search_type": 0,
                                      "query": keyword, "page_num": 1, "num_per_page": limit}}
                }, ensure_ascii=False)
            }
            resp = self.session.get("https://u.y.qq.com/cgi-bin/musicu.fcg", params=params,
                                    headers={"User-Agent": "Mozilla/5.0", "Referer": "https://y.qq.com/"}, timeout=10)
            songs = resp.json().get("req", {}).get("data", {}).get("body", {}).get("song", {}).get("list", [])
            return [{"id": s.get("mid", ""), "name": s.get("title", ""),
                     "artist": ", ".join([a.get("name", "") for a in s.get("singer", [])])} for s in songs]
        except:
            return []

    def _try_qq_apis(self, song_mid: str, mp3_path: Path, lrc_path: Path, quality: str) -> bool:
        q = QUALITY_MAP["qq"][quality]
        h = {"user-agent": "Mozilla/5.0"}
        # vkeys
        try:
            resp = self.session.get(f"https://api.vkeys.cn/music/tencent/song/link?mid={song_mid}&quality={q}", headers=h, timeout=10)
            url = resp.json().get("data", {}).get("url", "")
            if url and url.startswith("http") and self._download_file(url, mp3_path):
                self._save_qq_lyric(song_mid, lrc_path)
                return True
        except:
            pass
        # 317ak
        try:
            for q2 in ["7", "9", "10", "8", "6", "5"]:
                resp = self.session.get(f"https://api.317ak.com/api/yinyue/qqyinyue?ckey=Wk83NlFKQ0lINVBQSUNKT09YVUg=&i={song_mid}&br={q2}&type=json&lrc=1", headers=h, timeout=10)
                data = resp.json()
                url = data.get("url", "")
                if url and url.startswith("http") and self._download_file(url, mp3_path):
                    with open(lrc_path, "w", encoding="utf-8") as f:
                        f.write(data.get("lyric", "") or "[00:00.000]暂无歌词\n")
                    return True
        except:
            pass
        return False

    def _save_qq_lyric(self, song_mid: str, lrc_path: Path):
        try:
            resp = self.session.get(f"https://api.vkeys.cn/v2/music/tencent/lyric?mid={song_mid}",
                                    headers={"user-agent": "Mozilla/5.0"}, timeout=10)
            lyric = resp.json().get("data", {}).get("lrc", "")
        except:
            lyric = ""
        with open(lrc_path, "w", encoding="utf-8") as f:
            f.write(lyric or "[00:00.000]暂无歌词\n")

    # ========== Kugou ==========
    def _search_kugou(self, keyword: str, limit: int = 5) -> list:
        try:
            resp = self.session.get("https://songsearch.kugou.com/song_search_v2",
                                    params={"keyword": keyword, "page": 1, "pagesize": limit,
                                            "platform": "WebFilter", "format": "json"},
                                    headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
            songs = resp.json().get("data", {}).get("lists", [])
            return [{"id": s.get("FileHash", s.get("hash", "")),
                     "name": s.get("SongName", s.get("songname", "")),
                     "artist": s.get("SingerName", s.get("singername", ""))} for s in songs]
        except:
            return []

    def _try_kugou_apis(self, file_hash: str, mp3_path: Path, lrc_path: Path, quality: str) -> bool:
        q = QUALITY_MAP["kugou"][quality]
        h = {"user-agent": "Mozilla/5.0"}
        try:
            for q2 in ["6", "5", "4", "3", "2", "1"]:
                resp = self.session.get(f"https://api.317ak.com/api/yinyue/kugou?ckey=UE9WTUhLSklYOEE3SUdIMkZNMVA=&i={file_hash}&br={q2}&type=json&lrc=1", headers=h, timeout=10)
                data = resp.json()
                url = data.get("url", "")
                if url and url.startswith("http") and self._download_file(url, mp3_path):
                    with open(lrc_path, "w", encoding="utf-8") as f:
                        f.write(data.get("lyric", "") or "[00:00.000]暂无歌词\n")
                    return True
        except:
            pass
        # haitangw
        try:
            for q2 in ["hires", "lossless", "exhigh"]:
                resp = self.session.get(f"https://musicapi.haitangw.net/kgqq/kg.php?type=json&id={file_hash}&level={q2}", headers=h, timeout=10)
                url = resp.json().get("data", {}).get("url", "")
                if url and url.startswith("http") and self._download_file(url, mp3_path):
                    with open(lrc_path, "w", encoding="utf-8") as f:
                        f.write("[00:00.000]暂无歌词\n")
                    return True
        except:
            pass
        return False

    # ========== Migu Music ==========
    def _search_migu(self, keyword: str, limit: int = 5) -> list:
        try:
            params = {"text": keyword, "pageNo": 1, "pageSize": limit,
                      "isCopyright": 1, "sort": 1,
                      "searchSwitch": json.dumps({"song": 1, "album": 0, "singer": 0,
                                                   "tagSong": 1, "mvSong": 0, "bestShow": 1})}
            resp = self.session.get("https://c.musicapp.migu.cn/v1.0/content/search_all.do?",
                                    params=params, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
            songs = resp.json().get("songResultData", {}).get("result", [])
            results = []
            for s in songs:
                cid = s.get("contentId")
                copyid = s.get("copyrightId")
                if cid and copyid:
                    results.append({
                        "id": cid, "copyrightId": copyid, "name": s.get("name", s.get("songName", "")),
                        "artist": ", ".join([sg.get("name", "") for sg in s.get("singers", s.get("singerList", [])) if isinstance(sg, dict)]),
                        "raw": s
                    })
            return results
        except:
            return []

    def _try_migu_apis(self, song: dict, mp3_path: Path, lrc_path: Path, quality: str) -> bool:
        content_id = song["id"]
        copyright_id = song["copyrightId"]
        q = QUALITY_MAP["migu"][quality]
        try:
            # Build listen URL
            params = [("contentId", content_id), ("copyrightId", copyright_id),
                      ("resourceType", "E"), ("netType", "01"), ("toneFlag", q),
                      ("scene", ""), ("lowerQualityContentId", content_id)]
            h = {"Content-Type": "application/json;charset=UTF-8", "birth": "h5page", "signature": "1"}
            resp = self.session.get("https://c.musicapp.migu.cn/strategy/listen-url/h5/v2.4",
                                    params=params, headers=h, timeout=10)
            data = resp.json()
            url = data.get("data", {}).get("url", "")
            # Fallback URL
            if not url:
                url = f"https://app.pd.nf.migu.cn/MIGUM3.0/v1.0/content/sub/listenSong.do?channel=mx&copyrightId={copyright_id}&contentId={content_id}&toneFlag={q}&resourceType=E&userId=15548614588710179085069&netType=00"
            if url and self._download_file(url, mp3_path):
                # Try to get lyric
                try:
                    resp2 = self.session.get(f"https://app.c.nf.migu.cn/MIGUM3.0/strategy/pc/listen/v1.0?scene=&netType=01&resourceType=2&copyrightId={copyright_id}&contentId={content_id}&toneFlag=PQ", timeout=10)
                    lyric_url = resp2.json().get("data", {}).get("lrcUrl", "")
                    if lyric_url:
                        resp3 = self.session.get(lyric_url, headers={"User-Agent": "Mozilla/5.0"}, allow_redirects=True, timeout=10)
                        lyric = resp3.text
                    else:
                        lyric = ""
                except:
                    lyric = ""
                with open(lrc_path, "w", encoding="utf-8") as f:
                    f.write(lyric or "[00:00.000]暂无歌词\n")
                return True
        except:
            pass
        return False

    # ========== Soda Music ==========
    def _search_soda(self, keyword: str, limit: int = 5) -> list:
        try:
            params = {
                "aid": "386088", "app_name": "luna_pc", "region": "cn", "geo_region": "cn",
                "os_region": "cn", "device_id": "3753066532709850", "iid": "3753066532713946",
                "version_name": "3.5.1", "version_code": "30050100", "channel": "official",
                "build_mode": "master", "device_platform": "windows", "device_type": "Windows",
                "os_version": "Windows 10 Education", "fp": "3753066532709850",
                "q": keyword, "cursor": 0, "search_id": str(uuid.uuid4()),
                "search_method": "input", "search_scene": ""
            }
            resp = self.session.get("https://api.qishui.com/luna/pc/search/track?",
                                    params=params, headers={"User-Agent": "LunaPC/3.5.1(408871041)"}, timeout=10)
            items = resp.json().get("data", {}).get("list", [])
            results = []
            for item in items:
                track = item.get("entity", {}).get("track", {})
                tid = track.get("id")
                if tid:
                    results.append({"id": tid, "name": track.get("name", ""),
                                    "artist": ", ".join([a.get("name", "") for a in track.get("artists", [])])})
            return results
        except:
            return []

    def _try_soda_apis(self, song: dict, mp3_path: Path, lrc_path: Path, quality: str) -> bool:
        song_id = song["id"]
        try:
            h = {"Accept": "application/json, text/plain, */*", "User-Agent": "Mozilla/5.0",
                 "Referer": "http://qiuyu520.fun/qishui/", "Origin": "http://qiuyu520.fun"}
            resp = self.session.post("http://qiuyu520.fun/qishuiParse/api/track/v2",
                                     headers=h, json={"track_id": song_id}, timeout=10)
            data = resp.json()
            url = data.get("data", {}).get("url", "")
            if url and url.startswith("http") and self._download_file(url, mp3_path):
                lyric = data.get("data", {}).get("lyric", "")
                with open(lrc_path, "w", encoding="utf-8") as f:
                    f.write(lyric or "[00:00.000]暂无歌词\n")
                return True
        except:
            pass
        # Fallback: official share page
        try:
            h = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X)",
                 "Accept": "text/html,application/xhtml+xml"}
            resp = self.session.get(f"https://music.douyin.com/qishui/share/track?track_id={song_id}",
                                    headers=h, timeout=10)
            m = re.search(r'_ROUTER_DATA\s*=\s*({.*?});', resp.text, re.S)
            if m:
                meta = json.loads(m.group(1))
                audio = {}
                for v in self._deep_search(meta, "audioWithLyricsOption"):
                    if isinstance(v, dict) and v.get("url"):
                        audio = v
                        break
                url = (audio.get("url") or "").replace("\\u002F", "/")
                if url and self._download_file(url, mp3_path):
                    with open(lrc_path, "w", encoding="utf-8") as f:
                        f.write("[00:00.000]暂无歌词\n")
                    return True
        except:
            pass
        return False

    def _deep_search(self, d, key):
        """Deep search dict for key"""
        if isinstance(d, dict):
            if key in d:
                yield d[key]
            for v in d.values():
                yield from self._deep_search(v, key)
        elif isinstance(d, list):
            for item in d:
                yield from self._deep_search(item, key)

    # ========== Common Utilities ==========
    def _download_file(self, url: str, path: Path) -> bool:
        try:
            resp = self.session.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
            resp.raise_for_status()
            if len(resp.content) < 1024:
                return False
            with open(path, "wb") as f:
                f.write(resp.content)
            return True
        except:
            return False

    def _fetch_url_to_file(self, url: str, path: Path) -> int:
        """流式下载到 path，返回实际字节数(失败返回 0)，用于完整度校验"""
        try:
            resp = self.session.get(url, headers={"User-Agent": "Mozilla/5.0"},
                                    timeout=60, stream=True)
            resp.raise_for_status()
            tmp = path.with_suffix(path.suffix + ".part")
            total = 0
            with open(tmp, "wb") as f:
                for chunk in resp.iter_content(8192):
                    if chunk:
                        f.write(chunk)
                        total += len(chunk)
            if total < 1024:
                tmp.unlink(missing_ok=True)
                return 0
            tmp.replace(path)
            return total
        except:
            return 0

    def _sanitize(self, name: str) -> str:
        return re.sub(r'[\\/:*?"<>|]', "_", str(name)).strip()

    def _already_downloaded(self, mp3_path: Path, lrc_path: Path) -> bool:
        return mp3_path.exists() and lrc_path.exists() and mp3_path.stat().st_size > 1024

    def _log(self, message: str):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_line = f"[{timestamp}] {message}"
        print(log_line, flush=True)
        try:
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(log_line + "\n")
        except:
            pass

    def get_stats(self) -> dict:
        return dict(self.stats)


def main():
    parser = argparse.ArgumentParser(description="中国主流音乐平台歌曲下载器 V4")
    parser.add_argument("-s", "--singer", help="演唱者名称")
    parser.add_argument("-n", "--song", help="歌曲名称")
    parser.add_argument("--id", type=int, help="网易云歌曲ID（搜索不可用时的精确下载通道）")
    parser.add_argument("-o", "--output", default=DEFAULT_OUTPUT, help="输出目录")
    parser.add_argument("-q", "--quality", default="high", choices=["standard", "high", "lossless"],
                        help="音质: standard(标准) high(高品质) lossless(无损)")
    parser.add_argument("--excel", help="从Excel文件批量下载")
    parser.add_argument("--text", help="从文本批量下载（一行一首）")
    parser.add_argument("--file", help="从文本文件批量下载")
    parser.add_argument("--era", default="", help="默认年代分类")
    parser.add_argument("--level", default="", help="默认推荐等级")
    parser.add_argument("--delay", type=float, default=1.0, help="下载间隔(秒)")
    args = parser.parse_args()

    dl = MusicDownloader(output_dir=args.output, delay=args.delay, default_quality=args.quality)

    if args.excel:
        dl.download_from_excel(args.excel, output_dir=args.output, quality=args.quality)
    elif args.text:
        dl.download_from_text(args.text, output_dir=args.output, era=args.era, level=args.level, quality=args.quality)
    elif args.file:
        dl.download_from_file(args.file, output_dir=args.output, era=args.era, level=args.level, quality=args.quality)
    elif args.id:
        result = dl.download_by_id(args.id, singer=args.singer or "", song_name=args.song or "",
                                  output_dir=args.output, era=args.era, level=args.level, quality=args.quality)
        print(f"\n结果: {result['message']}")
    elif args.singer and args.song:
        result = dl.download(args.singer, args.song, output_dir=args.output,
                             era=args.era, level=args.level, quality=args.quality)
        print(f"\n结果: {result['message']}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
