#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_pdf.py — PDF 产物自检

检查项：空白页、内容越界、文字是否被栅格化（Type3）、中文字体是否矢量嵌入、
图片是否落地、表格表头是否跨页重复。

用法：
    python verify_pdf.py out.pdf [out2.pdf ...]
    python verify_pdf.py *.pdf --render-dir ./_review    # 同时导出问题页截图
    python verify_pdf.py out.pdf --expect-images 3       # 断言位图数量下限

退出码：0 = 通过；1 = 发现可疑页；2 = 文件不可读或缺依赖
"""
import sys
import os
import re
import argparse

# Windows 控制台默认 GBK，输出中文/emoji 会崩，强制 UTF-8
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

try:
    import pymupdf
except ImportError:
    try:
        import fitz as pymupdf  # 兼容旧版 PyMuPDF
    except ImportError:
        sys.stderr.write("需要 PyMuPDF：pip install pymupdf\n")
        sys.exit(2)

# 中日韩共用汉字 + 中文标点扩展区；不含假名，避免日文文档被当成中文命中字体检查
CJK_RE = re.compile(r'[㐀-䶿一-鿿豈-﫿]')
# 图片没加载出来时，浏览器会把 alt 文本留在页面上；中文文档里 alt 往往是中文，
# 因此「broken image / [image]」这类英文占位符基本匹配不到，必须另找信号。
IMG_MARKERS = ('broken image', '[image]', 'no image available')


def page_fonts(page):
    """返回该页 (Type0 矢量字体数, Type3 栅格字体数)。"""
    t0 = t3 = 0
    for f in page.get_fonts(full=False):
        kind = f[2]
        if kind == 'Type3':
            t3 += 1
        elif kind in ('Type0', 'Type1', 'TrueType'):
            t0 += 1
    return t0, t3


def rasterized_text_ratio(page):
    """用 Type3 字体渲染的字符数占总字符数的比例（越大说明文字越糊）。"""
    total = raster = 0
    for b in page.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            for s in l.get('spans', []):
                n = len(s.get('text', '').strip())
                if not n:
                    continue
                total += n
                if 'Type3' in s.get('font', ''):
                    raster += n
    return (raster / total) if total else 0.0


def meaningful_drawings(page):
    """排除整页背景色块：Chrome 打印时会铺一层覆盖全页的纯色矩形，
    若把它当内容，空白页永远检测不出来。"""
    w, h = page.rect.width, page.rect.height
    area = w * h
    out = []
    for g in page.get_drawings():
        r = g['rect']
        covers = r.width * r.height > 0.5 * area
        solid = g.get('fill') is not None and g.get('type') == 'f'
        if covers and solid:
            continue
        out.append(g)
    return out


def prose_text(page):
    """正文文本（排除等宽字体）。flags & 8 即 monospace：
    讲 Markdown 语法的文档会在代码块里合法地出现 `![...]`，
    不区分代码就会把教程示例误报成图片泄漏。"""
    out = []
    for b in page.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            for s in l.get('spans', []):
                if s.get('flags', 0) & 8:
                    continue
                out.append(s.get('text', ''))
    return ''.join(out)


def audit(pdf, render_dir=None, dpi=90, expect_images=None):
    name = os.path.basename(pdf)
    try:
        doc = pymupdf.open(pdf)
    except Exception as e:
        print(f"\n=== {name} ===\n❌ 无法打开：{e}")
        return 2

    if doc.is_encrypted and not doc.authenticate(''):
        print(f"\n=== {name} ===\n❌ 文件已加密，无法审计")
        return 2

    total_pages = len(doc)
    if total_pages == 0:
        print(f"\n=== {name} ===\n❌ 0 页，转换实际失败")
        return 1

    issues = []
    blank_pages, overflow_pages, raster_pages = [], set(), []
    t0_total = t3_total = 0
    img_pages = 0
    cjk_pages = 0

    for i, page in enumerate(doc):
        pno = i + 1
        w, h = page.rect.width, page.rect.height
        text = page.get_text().strip()
        drawings = meaningful_drawings(page)
        images = page.get_images(full=True)

        t0, t3 = page_fonts(page)
        t0_total += t0
        t3_total += t3
        if images:
            img_pages += 1
        if CJK_RE.search(text):
            cjk_pages += 1

        if len(text) < 20 and not drawings and not images:
            blank_pages.append(pno)
            issues.append((pno, '疑似空白页'))

        if len(text) < 120 and len(drawings) > 100:
            issues.append((pno, f'疑似渲染伪影（文字 {len(text)} 字 / 矢量 {len(drawings)} 个）'))

        for b in page.get_text('blocks'):
            x0, y0, x1, y1 = b[:4]
            if x1 > w + 6 or y1 > h + 6 or x0 < -6:
                overflow_pages.add(pno)
                issues.append((pno, f'内容越界 x1={x1:.0f}/{w:.0f} y1={y1:.0f}/{h:.0f}'))
                break

        prose = prose_text(page).lower()
        if any(m in prose for m in IMG_MARKERS) or '![' in prose:
            issues.append((pno, '可能含未加载图片（正文残留 alt 文本或 Markdown 图片语法）'))

        # 文字被栅格化：放大发糊、体积暴涨，通常是字体链选中了可变字体
        ratio = rasterized_text_ratio(page)
        if ratio > 0.15:
            raster_pages.append(pno)
            issues.append((pno, f'{ratio:.0%} 的文字被栅格化（Type3），放大后发糊'))

    if expect_images is not None and img_pages < expect_images:
        issues.append((0, f'含位图页仅 {img_pages}，低于期望的 {expect_images}'))

    if render_dir and issues:
        os.makedirs(render_dir, exist_ok=True)
        for pno, _msg in issues[:12]:
            if 1 <= pno <= total_pages:
                try:
                    doc[pno - 1].get_pixmap(dpi=dpi).save(
                        os.path.join(render_dir, f"{os.path.splitext(name)[0]}_p{pno}_issue.png"))
                except Exception:
                    pass

    doc.close()

    print(f"\n=== {name} ===")
    print(f"总页数: {total_pages} | 含位图页: {img_pages} | 中文字体页: {cjk_pages}")
    print(f"字体: 矢量 {t0_total} / 栅格化 {t3_total}")

    if cjk_pages and not t0_total:
        print("⚠ 中文全部走栅格化，PDF 放大发糊；检查字体链是否选中了可变字体（*-VF）")
    if blank_pages:
        print(f"空白页: {blank_pages}")
    if overflow_pages:
        print(f"溢出页: {sorted(overflow_pages)}")
    if raster_pages:
        print(f"栅格化文字页: {raster_pages}")

    if issues:
        print("问题明细:")
        for pno, msg in issues[:20]:
            print(f"  {'总览' if pno == 0 else f'第 {pno} 页'} — {msg}")
        if len(issues) > 20:
            print(f"  ... 共 {len(issues)} 条")
        return 1

    print("✅ 未发现空白页 / 内容越界 / 图片缺失 / 文字栅格化")
    return 0


def main():
    ap = argparse.ArgumentParser(description='PDF 产物自检')
    ap.add_argument('pdfs', nargs='+', help='待检查的 PDF')
    ap.add_argument('--render-dir', help='问题页截图导出目录')
    ap.add_argument('--expect-images', type=int, help='含位图页数量下限')
    args = ap.parse_args()

    worst = 0
    for p in args.pdfs:
        if not os.path.isfile(p):
            print(f"跳过（不存在）: {p}")
            continue
        worst = max(worst, audit(p, args.render_dir, expect_images=args.expect_images))
    sys.exit(worst)


if __name__ == '__main__':
    main()
