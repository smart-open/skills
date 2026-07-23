---
name: "music-downloader"
description: "根据演唱者和歌曲名称从国内主流音乐平台（网易云/QQ/酷狗/咪咕/汽水）下载歌曲MP3和歌词LRC。Invoke when user asks to download songs and lyrics by artist and song name from Chinese music platforms."
---

# 音乐下载 Skill

根据演唱者和歌曲名称，从国内5大主流音乐平台搜索并下载歌曲(MP3)及歌词(LRC)。

## 支持平台

| 平台 | 搜索 | 下载 | 歌词 |
|---|---|---|---|
| 网易云音乐 | 官方API | 4个第三方API回退 | 有 |
| QQ音乐 | 官方API | 2个第三方API回退 | 有 |
| 酷狗音乐 | 官方API | 2个第三方API回退 | 有 |
| 咪咕音乐 | 官方API | 官方下载接口 | 有 |
| 汽水音乐 | 官方API | 第三方API+官方试听 | 有 |

## 核心接口

脚本位置: `scripts/batch_download_v4.py`（569 行）

### 下载单首歌曲

```python
import sys; sys.path.insert(0, r'scripts')
from batch_download_v4 import MusicDownloader

dl = MusicDownloader(output_dir=r'D:\音乐目录', default_quality='high')

# 最简用法
result = dl.download('陈奕迅', '孤勇者')

# 指定音质
result = dl.download('周杰伦', '晴天', quality='lossless')
# quality可选: 'standard'(标准) / 'high'(高品质) / 'lossless'(无损)

# 带分类
result = dl.download('周深', '大鱼', era='2010年代', level='S级')
```

### 批量下载

```python
# dict列表
songs = [
    {'singer': '陈奕迅', 'song_name': '孤勇者'},
    {'singer': '周杰伦', 'song_name': '晴天', 'era': '2000年代', 'level': 'S级'},
]
dl.download_batch(songs, quality='high')

# 字符串列表（自动解析）
songs = ['陈奕迅的孤勇者', '周杰伦 晴天', '林俊杰,江南']
dl.download_batch(songs, era='2000年代', quality='high')

# 从文本
dl.download_from_text('陈奕迅 孤勇者\n周杰伦 晴天', era='2000年代')

# 从文件
dl.download_from_file('songs.txt', era='2000年代')

# 从Excel（自动过滤经典选曲占位符）
dl.download_from_excel('歌曲列表.xlsx', quality='high')
```

### 命令行用法

```bash
# 单首下载
python batch_download_v4.py -s "陈奕迅" -n "孤勇者" -q high

# 指定音质
python batch_download_v4.py -s "周杰伦" -n "晴天" -q lossless

# 批量文本
python batch_download_v4.py --text "陈奕迅 孤勇者\n周杰伦 晴天" -q high

# 批量文件
python batch_download_v4.py --file songs.txt --era "2000年代" --level "S级" -q high

# Excel批量
python batch_download_v4.py --excel "歌曲列表.xlsx" -q high
```

## 输入格式自动解析

`_parse_song_item()` 支持以下格式，无需手动预处理：

| 格式 | 示例 | 结果 |
|---|---|---|
| dict | `{'singer': '陈奕迅', 'song_name': '孤勇者'}` | 陈奕迅 / 孤勇者 |
| tuple | `('陈奕迅', '孤勇者')` | 陈奕迅 / 孤勇者 |
| "XX的XX" | `"陈奕迅的孤勇者"` | 陈奕迅 / 孤勇者 |
| 空格分隔 | `"陈奕迅 孤勇者"` | 陈奕迅 / 孤勇者 |
| 逗号分隔 | `"陈奕迅,孤勇者"` | 陈奕迅 / 孤勇者 |
| Tab分隔 | `"陈奕迅\t孤勇者"` | 陈奕迅 / 孤勇者 |

## 音质参数

| 参数值 | 说明 | 建议场景 |
|---|---|---|
| `standard` | 标准音质 (128kbps) | 快速试听、节省空间 |
| `high` | 高品质 (320kbps) | 默认推荐 |
| `lossless` | 无损音质 (FLAC) | 收藏级，文件较大 |

## 特性

- **5平台回退**: 网易云→QQ→酷狗→咪咕→汽水，逐层回退
- **多API回退**: 每平台2-4个第三方API
- **断点续传**: 默认跳过已下载文件
- **自动歌词**: 同时下载LRC歌词
- **音质可选**: standard/high/lossless
- **灵活分类**: era/level参数控制目录结构
