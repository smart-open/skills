# Design System Reference

Complete CSS token spec, component patterns, and animation library for enterprise portal sites. Load this when building `css/style.css`.

## 1. Design Tokens (`:root`)

### Color System

Use a neutral base (Zinc/Stone/Slate) with ONE accent color. Never use AI-purple as default.

```css
:root {
  /* Neutral ink scale (Zinc-based, works for all industries) */
  --ink: #18181B;           /* primary text */
  --ink-2: #3F3F46;          /* secondary text */
  --ink-3: #71717A;          /* tertiary text */
  --ink-4: #A1A1AA;          /* quaternary text */

  /* Background tiers */
  --bg: #FAFAF9;             /* page background (warm white) */
  --bg-2: #F4F4F5;           /* secondary background */
  --bg-3: #E4E4E7;           /* tertiary background */

  /* Lines */
  --line: #E4E4E7;           /* light border */
  --line-2: #D4D4D8;         /* medium border */

  /* Accent (REPLACE per industry preset) */
  --accent: #2E67E0;         /* primary accent */
  --accent-2: #5B89F0;       /* lighter accent */
  --accent-soft: rgba(46, 103, 224, 0.1);
  --accent-softer: rgba(46, 103, 224, 0.05);

  /* Dark slab (for dark sections) */
  --dark: #0A0A0B;
  --dark-2: #18181B;
  --dark-ink: #FAFAF9;
  --dark-ink-2: #A1A1AA;
  --dark-line: #2A2A30;

  /* Semantic */
  --success: #10B981;
  --warning: #F59E0B;
  --danger: #EF4444;
}
```

### Accent Color Swaps by Industry

| Industry | `--accent` | `--accent-2` | Mood |
|----------|-----------|-------------|------|
| Software/Tech | `#2E67E0` (blue) | `#5B89F0` | Trust + tech |
| Finance | `#0F766E` (teal) | `#14B8A6` | Stability + growth |
| Medical | `#0D9488` (teal-cyan) | `#2DD4BF` | Health + calm |
| Manufacturing | `#C2410C` (burnt orange) | `#F97316` | Industrial + energy |
| Retail/E-comm | `#BE185D` (rose) | `#EC4899` | Vibrant + commerce |
| Government | `#1E40AF` (deep blue) | `#3B82F6` | Authority + trust |
| Education | `#7C3AED` (violet) | `#A78BFA` | Knowledge + curiosity |
| Legal | `#854D0E` (amber-bronze) | `#D97706` | Heritage + gravitas |
| Real Estate | `#166534` (forest) | `#16A34A` | Growth + property |
| Consulting | `#1E3A5F` (navy) | `#3B5F8A` | Premium + strategic |
| Logistics | `#9F1239` (deep rose) | `#E11D48` | Motion + urgency |
| Energy | `#B45309` (amber) | `#F59E0B` | Power + warmth |

### Typography Scale

```css
:root {
  --font-display: 'Noto Sans SC', system-ui, sans-serif;  /* Chinese display */
  --font-body: 'Noto Sans SC', system-ui, sans-serif;       /* Chinese body */
  --font-mono: 'JetBrains Mono', 'Cascadia Code', monospace;

  /* Use Google Fonts with font-display: swap */
  /* For English-only sites: Geist, Satoshi, or Cabinet Grotesk for display */
}
```

Size scale (all fluid via `clamp()`):

```css
.display { font-size: clamp(2.6rem, 1.6rem + 4.4vw, 5rem); line-height: 1; letter-spacing: -0.035em; }
.h1      { font-size: clamp(2rem, 1.4rem + 2.6vw, 3.25rem); line-height: 1.08; letter-spacing: -0.03em; }
.h2      { font-size: clamp(1.6rem, 1.2rem + 1.6vw, 2.4rem); line-height: 1.15; letter-spacing: -0.025em; }
.h3      { font-size: clamp(1.2rem, 1.05rem + 0.6vw, 1.5rem); line-height: 1.3; letter-spacing: -0.015em; }
.h4      { font-size: clamp(1rem, 0.95rem + 0.2vw, 1.125rem); line-height: 1.4; }
.lead    { font-size: clamp(1.05rem, 1rem + 0.3vw, 1.2rem); line-height: 1.6; color: var(--ink-2); max-width: 65ch; }
.body    { font-size: 1rem; line-height: 1.7; color: var(--ink-2); }
.mono    { font-family: var(--font-mono); font-size: 0.8rem; letter-spacing: 0.02em; color: var(--ink-3); text-transform: uppercase; }
```

**All headings MUST have `text-wrap: balance`** for even line breaks.

### Spacing & Radii

```css
:root {
  /* Section padding — kept TIGHT for density (halved from typical) */
  /* CRITICAL: clamp() + and - MUST have whitespace on both sides */
  --section-py: clamp(1.6rem, 0.75rem + 2.5vw, 3rem);
  --section-sm-py: clamp(1.25rem, 0.6rem + 2vw, 2.25rem);

  /* Card padding */
  --card-p: clamp(1.3rem, 0.8rem + 1vw, 1.7rem);

  /* Form container padding — generous for breathing room */
  --form-p: clamp(3.6rem, 2.6rem + 5vw, 5.8rem);

  /* Radii — ONE system */
  --r-sm: 8px;
  --r-md: 12px;
  --r-lg: 16px;
  --r-xl: 24px;
  --r-2xl: 32px;
  --r-full: 999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06);
  --shadow: 0 4px 6px rgba(0,0,0,0.05), 0 10px 15px rgba(0,0,0,0.08);
  --shadow-lg: 0 10px 25px rgba(0,0,0,0.08), 0 20px 40px rgba(0,0,0,0.12);

  /* Easing */
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --dur: 0.4s;
  --dur-fast: 0.2s;
}
```

## 2. Layout Primitives

### Container

```css
.container { max-width: 1320px; margin-inline: auto; padding-inline: clamp(1rem, 0.5rem + 2vw, 2rem); }
.container-wide { max-width: 1480px; margin-inline: auto; padding-inline: clamp(1rem, 0.5rem + 2vw, 2rem); }
/* NEVER mix .container and .container-wide in the same section — causes left-edge misalignment */
```

### Section

```css
.section {
  padding-block: var(--section-py);
  position: relative;
  scroll-margin-top: 80px;  /* anchor offset for fixed nav */
}
/* Adjacent same-color sections get a subtle separator */
.section + .section:not(.dark-slab) { border-top: 1px solid var(--line); }
.dark-slab + .section:not(.dark-slab) { border-top: none; }
```

### Split (2-column asymmetric)

```css
.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: clamp(2rem, 1rem + 3vw, 4rem);
  align-items: center;
}
@media (max-width: 900px) { .split { grid-template-columns: 1fr; } }
```

### Bento (mixed-size grid)

```css
.bento {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  grid-auto-rows: minmax(120px, auto);
  gap: 0.8rem;
}
.b-wide { grid-column: span 4; }  /* wide cell */
.b-half { grid-column: span 3; }  /* half cell */
.b-tall { grid-column: span 2; grid-row: span 2; }  /* tall cell */
@media (max-width: 900px) { .bento { grid-template-columns: 1fr; } .b-wide, .b-half, .b-tall { grid-column: 1; grid-row: auto; } }
```

**Bento rules**: N items to N cells. No empty cells. Remove the grid if fewer than 3 items.

### Grid-2 (equal 2-column)

```css
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
@media (max-width: 768px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }
```

## 3. Component Specs

### Navigation (fixed header)

```css
.nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  background: rgba(250, 250, 249, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
  transition: box-shadow var(--dur) var(--ease);
}
.nav.scrolled { box-shadow: var(--shadow-sm); }
.nav-inner { display: flex; align-items: center; justify-content: space-between; height: 64px; }
.brand { display: flex; align-items: center; gap: 0.6rem; }
.brand-mark { width: 32px; height: 32px; }
.brand-name { font-family: var(--font-display); font-weight: 700; font-size: 1.1rem; }
.nav-links { display: flex; gap: 0.3rem; }
.nav-link { padding: 0.5rem 0.9rem; font-size: 0.9rem; color: var(--ink-2); border-radius: var(--r-sm); transition: all var(--dur-fast) var(--ease); }
.nav-link:hover { color: var(--ink); background: var(--bg-2); }
.nav-link.active { color: var(--accent); }
.nav-cta { display: flex; align-items: center; gap: 0.8rem; }
```

### Button system

```css
.btn {
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.7rem 1.4rem;
  font-family: var(--font-display); font-size: 0.95rem; font-weight: 600;
  border-radius: var(--r-full);
  background: var(--ink); color: var(--bg);
  border: 1px solid transparent;
  transition: all var(--dur) var(--ease);
  /* Gradient sweep on hover (NOT magnetic effect) */
  background-image: linear-gradient(135deg, var(--ink) 0%, var(--dark-2) 50%, var(--ink) 100%);
  background-size: 200% 200%;
  background-position: 0% 50%;
}
.btn:hover { background-position: 100% 50%; transform: translateY(-1px); box-shadow: var(--shadow); }
.btn-lg { padding: 0.9rem 1.8rem; font-size: 1.05rem; }
.btn-sm { padding: 0.5rem 1rem; font-size: 0.85rem; }
.btn-ghost { background: transparent; color: var(--ink); border: 1px solid var(--line-2); background-image: none; }
.btn-ghost:hover { background: var(--bg-2); border-color: var(--ink-3); box-shadow: none; }
```

### Hero (homepage)

```css
.hero {
  padding-top: clamp(7rem, 5rem + 6vw, 10rem);
  padding-bottom: clamp(3rem, 1rem + 6vw, 6rem);
  overflow: hidden;
  /* Radial gradient adds depth without AI-purple */
  background:
    radial-gradient(ellipse 70% 50% at 50% 0%, var(--accent-softer), transparent 65%),
    var(--bg);
}
.hero-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: clamp(2rem, 1rem + 4vw, 5rem); align-items: center; }
.hero-title { font-family: var(--font-display); font-weight: 800; font-size: clamp(2.6rem, 1.6rem + 4.4vw, 5rem); line-height: 1; letter-spacing: -0.035em; text-wrap: balance; }
```

### Page Hero (interior pages)

```css
.page-hero {
  padding-top: clamp(7.5rem, 5.5rem + 5vw, 10rem);
  padding-bottom: clamp(2rem, 1rem + 3vw, 3.5rem);
  overflow: hidden;
  border-bottom: 1px solid var(--line);
  background:
    radial-gradient(ellipse 60% 50% at 50% 0%, var(--accent-softer), transparent 70%),
    var(--bg);
}
.page-hero-grid { display: grid; grid-template-columns: 1fr; gap: 2rem; align-items: start; }
/* ALL page heroes use .h1 (NOT .display) for consistent sizing across pages */
```

### Card

```css
.card {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--card-p);
  transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease), border-color var(--dur) var(--ease);
  position: relative;
}
.card:hover {
  transform: translateY(-4px);  /* NOT -2px, too subtle */
  box-shadow: var(--shadow-lg);
  border-color: transparent;
}
.card-icon { width: 40px; height: 40px; border-radius: var(--r-md); background: var(--accent-soft); color: var(--accent); display: flex; align-items: center; justify-content: center; margin-bottom: 1rem; }
```

### Hero Visual

```css
.hero-visual {
  position: relative;
  border-radius: var(--r-xl);
  overflow: hidden;
  box-shadow: var(--shadow-lg);
  aspect-ratio: 4 / 3.2;
  background: var(--bg-2);
}
.hero-visual img { width: 100%; height: 100%; object-fit: cover; }
.hero-visual::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, transparent 60%, rgba(10,10,11,0.25));
  pointer-events: none;
}
/* Micro-float animation */
@media not all and (prefers-reduced-motion: reduce) {
  .hero .hero-visual, .page-hero .hero-visual {
    animation: hero-float 7s var(--ease) infinite alternate;
  }
}
@keyframes hero-float { from { transform: translateY(0); } to { transform: translateY(-8px); } }
```

### Dark Slab (dark section)

```css
.dark-slab {
  background: var(--dark);
  color: var(--dark-ink);
  box-shadow: 0 -1px 0 var(--dark-line);
}
/* Smooth transition line at top to avoid hard cut */
.section:not(.dark-slab) + .dark-slab::after {
  content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--dark-line) 20%, var(--dark-line) 80%, transparent);
  pointer-events: none; z-index: 2;
}
```

### Trust Strip (stats bar)

```css
.trust-strip { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.trust-cell { background: var(--bg); padding: clamp(1.5rem, 1rem + 1.5vw, 2.2rem); transition: background 0.3s var(--ease); }
.trust-cell:hover { background: var(--bg-2); }
.trust-num { font-family: var(--font-display); font-weight: 800; font-size: clamp(2rem, 1.4rem + 1.6vw, 2.8rem); letter-spacing: -0.03em; line-height: 1; }
.trust-num .unit { font-size: 0.5em; color: var(--accent); margin-left: 0.1em; }
.trust-label { margin-top: 0.6rem; font-size: 0.85rem; color: var(--ink-3); }
```

### Zigzag (alternating image+text)

```css
.zigzag-item { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(1.2rem, 0.8rem + 1.5vw, 2.2rem); align-items: center; padding-block: clamp(1.2rem, 0.6rem + 1.5vw, 2rem); }
.zigzag-item:nth-child(even) .zigzag-text { order: 2; }
@media (max-width: 900px) { .zigzag-item { grid-template-columns: 1fr; } .zigzag-item:nth-child(even) .zigzag-text { order: 0; } }
/* Max 2 consecutive image+text splits before breaking pattern */
```

### Timeline

```css
.timeline { position: relative; padding-left: 1.5rem; }
.timeline::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--line-2); }
.tl-item { position: relative; padding-bottom: 2rem; }
.tl-item::before { content: ""; position: absolute; left: -1.5rem; top: 0.3rem; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); border: 2px solid var(--bg); }
.tl-year { font-family: var(--font-mono); font-size: 0.85rem; color: var(--accent); font-weight: 600; }
.tl-title { font-family: var(--font-display); font-weight: 600; font-size: 1.1rem; margin: 0.3rem 0 0.4rem; }
.tl-desc { font-size: 0.9rem; color: var(--ink-2); line-height: 1.6; }
```

### Form

```css
.form-grid { display: grid; grid-template-columns: 1fr; gap: 2.4rem; }
.form-grid.cols-2 { grid-template-columns: 1fr 1fr; }
@media (max-width: 640px) { .form-grid.cols-2 { grid-template-columns: 1fr; } }
.field { display: flex; flex-direction: column; gap: 0.9rem; }
.field label { font-size: 0.9rem; font-weight: 500; color: var(--ink); }
.field .req { color: var(--danger); }
.input, .textarea, .select {
  width: 100%; padding: 1.6rem 1.9rem;
  font-size: 1rem; font-family: inherit;
  background: var(--bg); border: 1px solid var(--line-2);
  border-radius: var(--r-md);
  transition: border-color var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
.input:focus, .textarea:focus, .select:focus {
  outline: none; border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.textarea { min-height: 200px; resize: vertical; }
.field-error { font-size: 0.8rem; color: var(--danger); display: none; }
.field.error .field-error { display: block; }
.field.error .input, .field.error .textarea, .field.error .select { border-color: var(--danger); }
```

### Footer

```css
.footer { background: var(--dark); color: var(--dark-ink-2); padding-top: clamp(2rem, 1rem + 2vw, 3rem); padding-bottom: 1rem; position: relative; overflow: hidden; }
.footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1.5fr; gap: 2rem; padding-bottom: 1.5rem; }
.footer-brand .brand-name { color: var(--dark-ink); }
.footer h4 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-4); margin-bottom: 1rem; }
.footer ul { list-style: none; }
.footer a { color: var(--dark-ink-2); font-size: 0.9rem; transition: color var(--dur-fast) var(--ease); }
.footer a:hover { color: var(--dark-ink); }
.footer-bottom { border-top: 1px solid var(--dark-line); padding-top: 1rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--ink-4); }
@media (max-width: 768px) { .footer-grid { grid-template-columns: 1fr 1fr; } }
```

### Back to Top

```css
.back-to-top {
  position: fixed; bottom: 2rem; right: 2rem; z-index: 50;
  width: 44px; height: 44px; border-radius: 50%;
  background: var(--ink); color: var(--bg);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none;
  transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
  cursor: pointer;
}
.back-to-top.visible { opacity: 1; pointer-events: auto; }
.back-to-top:hover { transform: translateY(-4px); }
```

## 4. Animation Library

### Scroll Reveal

```css
[data-reveal] { opacity: 0; transform: translateY(24px); transition: opacity 0.6s var(--ease), transform 0.6s var(--ease); }
[data-reveal].in { opacity: 1; transform: none; }
[data-reveal="left"] { transform: translateX(-24px); }
[data-reveal="right"] { transform: translateX(24px); }
[data-reveal-delay] { transition-delay: var(--reveal-delay, 0s); }
```

### Line Reveal (text mask slide-up)

```css
.line-reveal { overflow: hidden; }
.line-reveal > * { display: block; transform: translateY(110%); transition: transform 0.8s var(--ease); transition-delay: var(--ld, 0s); }
.line-reveal.in > * { transform: none; }
```

### Stagger (children cascade)

```css
[data-stagger] > * { opacity: 0; transform: translateY(20px); transition: opacity 0.5s var(--ease), transform 0.5s var(--ease); }
[data-stagger].in > *:nth-child(1) { transition-delay: 0s; }
[data-stagger].in > *:nth-child(2) { transition-delay: 0.1s; }
[data-stagger].in > *:nth-child(3) { transition-delay: 0.2s; }
[data-stagger].in > *:nth-child(4) { transition-delay: 0.3s; }
[data-stagger].in > *:nth-child(5) { transition-delay: 0.4s; }
[data-stagger].in > *:nth-child(6) { transition-delay: 0.5s; }
[data-stagger].in > * { opacity: 1; transform: none; }
```

### Breathing Dot (status indicator)

```css
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--success); position: relative; vertical-align: middle; }
.dot::after { content: ""; position: absolute; inset: -4px; border-radius: 50%; background: var(--success); opacity: 0.4; animation: breathe 2.4s var(--ease) infinite; }
@keyframes breathe { 0%, 100% { transform: scale(0.8); opacity: 0.4; } 50% { transform: scale(1.6); opacity: 0; } }
```

**Usage in HTML**: `<span class="dot"></span> 杭州 · 当前可接洽新项目`

### Counter (number animation)

```css
/* No CSS needed — JS handles the count-up */
/* HTML: <span data-count="127">0</span> */
```

## 5. Responsive Breakpoints

Two breakpoints only — keep it simple:

```css
/* Tablet (768px) */
@media (max-width: 768px) {
  .nav-links { display: none; }  /* show hamburger */
  .nav-toggle { display: flex; }
  .hero-grid, .split { grid-template-columns: 1fr; }
  .trust-strip { grid-template-columns: 1fr 1fr; }
  .footer-grid { grid-template-columns: 1fr 1fr; }
  .section { padding-block: clamp(1.25rem, 0.6rem + 2vw, 2rem); }
}

/* Mobile (480px) */
@media (max-width: 480px) {
  .trust-strip { grid-template-columns: 1fr; }
  .footer-grid { grid-template-columns: 1fr; }
  .section { padding-block: 1.25rem; }
  .hero-title { font-size: clamp(2rem, 1.5rem + 3vw, 2.6rem); }
}
```

## 6. Font Loading

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
```

For English-only sites, swap to:
- Display: Geist, Satoshi, or Cabinet Grotesk
- Body: Inter (acceptable for neutral/standard feel)
- Mono: JetBrains Mono or Geist Mono
