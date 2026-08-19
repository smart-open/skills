# -*- coding: utf-8 -*-
import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
"""补充：轮动标签色点 + 警告图标锚点"""
import re

files = [
    os.path.join(BASE, "output/行情复盘_20260814.html"),
    os.path.join(BASE, "output/通鼎互联_个股诊断_20260814.html"),
]

dot_css = '''
/* 轮动标签色点（替代 emoji） */
.rot-title{{display:flex;align-items:center}}
.rot-title::before{{content:"";flex-shrink:0;width:8px;height:8px;border-radius:2px;background:var(--acc2);margin-right:8px}}
.rot-item:nth-of-type(1) .rot-title::before{{background:var(--up)}}
.rot-item:nth-of-type(2) .rot-title::before{{background:var(--warn)}}
.rot-item:nth-of-type(3) .rot-title::before{{background:var(--acc)}}
.rot-item:nth-of-type(4) .rot-title::before{{background:var(--acc2)}}
/* 警告标题图标锚点 */
.warn-box b:first-child{{display:inline-flex;align-items:center;gap:8px}}
.warn-box b:first-child::before{{content:"";flex-shrink:0;width:10px;height:10px;border:2px solid var(--up);border-radius:2px;position:relative}}
.warn-box b:first-child::after{{content:"!";position:absolute;transform:translateX(4px);color:var(--up);font-weight:700;font-size:11px;line-height:10px}}
'''

for path in files:
    html = open(path, encoding="utf-8").read()
    html = html.replace("</style>", dot_css + "</style>")
    # 清理轮动标签前的多余空格（" 主线持续" → "主线持续"）
    html = html.replace('<span class="rot-title"> ', '<span class="rot-title">')
    open(path, "w", encoding="utf-8").write(html)
    t = open(path, encoding="utf-8").read()
    o = len(re.findall(r'<div[^>]*>', t))
    c = len(re.findall(r'</div>', t))
    print(f"{path.split('/')[-1]}: div {o}/{c} {'平衡' if o==c else '不平衡'}")
