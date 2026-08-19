# -*- coding: utf-8 -*-
import os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
"""统一精修两份报告：去 emoji + 去渐变文字 + 减发光 + stagger 加载动效"""
import re

files = [
    os.path.join(BASE, "output/行情复盘_20260814.html"),
    os.path.join(BASE, "output/通鼎互联_个股诊断_20260814.html"),
]

# ============ 1. 去 emoji（替换为文字标签） ============
emoji_map = {
    "🔥": "", "🟠": "", "⬆️": "", "🔄": "", "⚠️": "", "⚠": "",
    "📈": "", "📉": "", "💡": "", "✅": "",
}

def strip_emoji(html):
    for e, r in emoji_map.items():
        html = html.replace(e, r)
    # 清理可能残留的组合变体选择符
    html = html.replace("\ufe0f", "")
    return html

# ============ 2. 精修 CSS（注入） ============
polish_css = '''
/* ===== 精修层 ===== */
/* 去渐变文字 → 纯色 */
.hero h1 .grad{{background:none;-webkit-background-clip:initial;background-clip:initial;-webkit-text-fill-color:var(--acc);}}
/* 去霓虹发光 → 内边框 + 轻 tinted shadow */
.icard:hover,.kpi:hover,.sc:hover,.chip:hover,.stock-card:hover{{box-shadow:inset 0 0 0 1px var(--glow),0 6px 18px -8px rgba(0,0,0,.4);}}
/* 状态灯呼吸保留但降强度 */
@keyframes pulse{{0%,100%{{opacity:1}}50%{{opacity:.45}}}}
/* stagger 加载动效 */
.reveal{{opacity:0;animation:fadeUp .55s cubic-bezier(.16,1,.3,1) forwards}}
@keyframes fadeUp{{from{{opacity:0;transform:translateY(18px)}}to{{opacity:1;transform:none}}}}
@media(prefers-reduced-motion:reduce){{
  .reveal{{animation:none;opacity:1}}
  .live .dot{{animation:none}}
}}
'''

reveal_js = '''
<script>
(function(){
  if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  var secs=document.querySelectorAll('.section');
  secs.forEach(function(el,i){el.classList.add('reveal');el.style.animationDelay=(i*0.06)+'s';});
})();
</script>
'''

for path in files:
    html = open(path, encoding="utf-8").read()
    # 1. 去 emoji
    html = strip_emoji(html)
    # 2. 注入精修 CSS
    html = html.replace("</style>", polish_css + "</style>")
    # 3. 注入 reveal JS（在 </body> 前）
    html = html.replace("</body>", reveal_js + "</body>")
    open(path, "w", encoding="utf-8").write(html)
    # 验证
    t = open(path, encoding="utf-8").read()
    o = len(re.findall(r'<div[^>]*>', t))
    c = len(re.findall(r'</div>', t))
    emojis = re.findall(r'[🔥🟠⬆️🔄⚠️📈📉💡✅]', t)
    print(f"{path.split('/')[-1]}: div {o}/{c} {'平衡' if o==c else '不平衡'}, 残留emoji {len(emojis)}")
