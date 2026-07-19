# Optimization & Pre-Flight Checklist Reference

Complete anti-slop rules, engineering optimizations, and pre-flight checklist. Load this when running Step 7 verification.

## Part A: Anti-Slop Rules (Non-Negotiable)

These rules eliminate the "AI-generated" look. Violating ANY of these is a blocking issue.

### A1. Typography & Text

- [ ] **No em-dashes (—) or en-dashes (–)** anywhere in visible text. Use commas, periods, or restructure.
- [ ] **No "AI-purple" gradients** (indigo-violet-pink). Use industry-appropriate accent.
- [ ] **No eyebrow soup**: max 1 eyebrow per 3 sections. Hero counts as 1.
- [ ] **No numbered card-tags** like "STEP 01" or "阶段 01". Use real names ("需求分析", "投递").
- [ ] **No decorative dots** before card titles. Use icons or nothing.
- [ ] **All headings have `text-wrap: balance`**.
- [ ] **One font family system**: display + body + mono. No mixing 3+ families.
- [ ] **No serif as default** unless industry is legal/editorial/heritage.
- [ ] **Page heroes all use `.h1`** (not `.display`) for consistent sizing across pages.

### A2. Layout & Composition

- [ ] **No empty bento cells**. N items to N cells. Remove grid if <3 items.
- [ ] **No two consecutive sections** share the same layout family (Split after Split = bad).
- [ ] **Max 2 consecutive zigzag image+text splits** before breaking pattern.
- [ ] **No horizontal scrollers** for card grids. Use CSS Grid with auto-wrap.
- [ ] **No glassmorphism on everything**. Only where materially justified (nav backdrop-filter is OK).
- [ ] **One corner-radius system**. Don't mix 4px + 16px + 24px randomly.
- [ ] **One accent color** across the whole page. Neutrals carry the rest.
- [ ] **Container consistency**: don't mix `.container` (1320px) and `.container-wide` (1480px) in same section.
- [ ] **Hero stack discipline**: max 4 text elements (eyebrow OR brand, headline, subtext, CTAs).

### A3. Buttons & CTAs

- [ ] **No magnetic button effects** (JS that moves button toward cursor). Use gradient sweep.
- [ ] **No duplicate CTA intent**: one label per intent per page.
- [ ] **CTAs fit one line** at desktop width. No wrapping.
- [ ] **Button hover uses gradient sweep**: `background-position: 100% 50%` on hover, not scale/shake.
- [ ] **CTA labels are action + object**: "免费咨询方案" not "了解更多".

### A4. Color & Visual

- [ ] **No AI-purple / blue glow** as default. Check `--accent` matches industry preset.
- [ ] **No random neon gradients**. One accent, applied consistently.
- [ ] **Dark sections have smooth transition** (gradient line at top, not hard cut).
- [ ] **Hero has radial gradient background** (accent-softer at top, not flat).
- [ ] **Page hero has radial gradient background** (same pattern, lighter).
- [ ] **Images have no watermarks, logos, UI borders, or hex code text** (post-generation check mandatory).

### A5. Content Voice

- [ ] **No vague claims**: "众多成功案例" → "127+ 交付项目".
- [ ] **No marketing fluff**: every sentence carries information.
- [ ] **Trust numbers are specific**: not round numbers unless actually round.
- [ ] **Case metrics are quantitative**: 3 per case, each with a number.
- [ ] **Tone matches industry**: formal for finance/legal, warmer for education/retail.

---

## Part B: Engineering Optimizations

These are the concrete CSS/HTML fixes distilled from production iterations. Each has a root cause and fix.

### B1. Spacing & Padding

- [ ] **Section padding halved**: `clamp(1.6rem, 0.75rem + 2.5vw, 3rem)` not `clamp(3.2rem, 1.5rem + 5vw, 6rem)`.
- [ ] **Footer padding halved**: `padding-top: clamp(2rem, 1rem + 2vw, 3rem)`, `padding-bottom: 1rem`.
- [ ] **Form padding generous**: `clamp(3.6rem, 2.6rem + 5vw, 5.8rem)` on form container.
- [ ] **Input padding substantial**: `1.6rem 1.9rem` (not `0.8rem 1rem`).
- [ ] **Textarea min-height**: `200px` (not `120px`).
- [ ] **Form grid gap**: `2.4rem` (not `1rem`).
- [ ] **Field gap**: `0.9rem` between label and input.

### B2. clamp() Syntax (CRITICAL)

- [ ] **All `clamp()` expressions have whitespace around `+` and `-`**.
  - VALID: `clamp(3.6rem, 2.6rem + 5vw, 5.8rem)`
  - INVALID: `clamp(3.6rem,2.6rem+5vw,5.8rem)` — silently falls back to 0!
- [ ] **Test computed style**: `getComputedStyle(el).padding` should NOT be `0px`.

### B3. Card Hover & Interactions

- [ ] **Card hover**: `translateY(-4px)` with `box-shadow: var(--shadow-lg)`. Not -2px.
- [ ] **Contact card hover**: same -4px.
- [ ] **News card hover**: same -4px.
- [ ] **Trust cell hover**: `background: var(--bg-2)` transition.
- [ ] **Nav link hover**: color change + background, not underline.

### B4. Status & Breathing Dots

- [ ] **Hero has breathing status dot**: `<span class="dot"></span> {status text}`.
- [ ] **Footer has breathing status dot**: same pattern, with city + availability.
- [ ] **Dot CSS**: `width: 8px; height: 8px; border-radius: 50%; background: var(--success)` with `::after` breathing animation.
- [ ] **Dot `vertical-align: middle`** for proper inline alignment.

### B5. Hero & Page Hero Backgrounds

- [ ] **Hero background**: `radial-gradient(ellipse 70% 50% at 50% 0%, var(--accent-softer), transparent 65%), var(--bg)`.
- [ ] **Page hero background**: `radial-gradient(ellipse 60% 50% at 50% 0%, var(--accent-softer), transparent 70%), var(--bg)`.
- [ ] **Page hero border-bottom**: `1px solid var(--line)`.

### B6. Hero Visual Float Animation

- [ ] **Hero visual micro-float**: `animation: hero-float 7s var(--ease) infinite alternate`.
- [ ] **Keyframes**: `from { translateY(0) } to { translateY(-8px) }`.
- [ ] **Wrapped in `@media not all and (prefers-reduced-motion: reduce)`**.
- [ ] **Applies to both `.hero .hero-visual` and `.page-hero .hero-visual`**.

### B7. Dark Slab Transitions

- [ ] **Dark slab has `box-shadow: 0 -1px 0 var(--dark-line)`**.
- [ ] **Transition line**: `::after` with `linear-gradient(90deg, transparent, var(--dark-line) 20%, var(--dark-line) 80%, transparent)`.
- [ ] **No hard color cut** between light section and dark slab.

### B8. Scroll & Anchor Behavior

- [ ] **All `[id]` sections have `scroll-margin-top: 80px`** (clears fixed nav).
- [ ] **Adjacent same-color sections have `border-top: 1px solid var(--line)`**.
- [ ] **Dark slab to light section has no border** (background contrast is enough).

### B9. Typography Polish

- [ ] **Display `line-height: 1`** (was 0.98, too tight for Chinese).
- [ ] **H1 `line-height: 1.08`** (was 1.05).
- [ ] **H2 `line-height: 1.15`** (was 1.1).
- [ ] **H3 `line-height: 1.3`** (was 1.25).
- [ ] **All headings `text-wrap: balance`**.

### B10. Grid Alignment

- [ ] **`.page-hero-grid` uses `align-items: start`** (not `end`, which pushes content to bottom).
- [ ] **Title and panel in same section share same `.container`** (not mixed container widths).

---

## Part C: Pre-Flight Checklist (60+ Items)

Run this mechanically before declaring the site done. Each item must pass.

### C1. Structure (8 items)

- [ ] 6 HTML files exist: index, products, news, about, recruitment, consultation
- [ ] 1 CSS file: `css/style.css`
- [ ] 1 JS file: `js/main.js`
- [ ] 1 favicon: `assets/favicon.svg`
- [ ] Hero images in `assets/images/`
- [ ] All files in a single `{slug}/` folder
- [ ] No external dependencies beyond Google Fonts CDN
- [ ] `index.html` works via `file://` (no server required)

### C2. Navigation (6 items)

- [ ] Nav is `position: fixed` with `backdrop-filter: blur(12px)`
- [ ] All 6 nav links present on all 6 pages
- [ ] `aria-current="page"` on current page link
- [ ] Mobile hamburger toggles mobile menu
- [ ] `aria-expanded` syncs with menu state
- [ ] Nav CTA button present on all pages

### C3. Footer (6 items)

- [ ] Footer has brand block + 3 link columns + contact
- [ ] Breathing status dot present with city + availability text
- [ ] Copyright uses `&copy;` with current year
- [ ] Legal links present (营业执照, 隐私政策, 服务条款)
- [ ] Footer is dark (`var(--dark)` background)
- [ ] Footer-bottom has border-top separator

### C4. Hero Sections (8 items)

- [ ] Homepage hero uses `.hero` class with radial gradient background
- [ ] Page heroes use `.page-hero` class with radial gradient background
- [ ] ALL page heroes use `.h1` class (NOT `.display`)
- [ ] Hero has 2 CTAs (primary + secondary/ghost)
- [ ] Hero has breathing status dot
- [ ] Hero visual has float animation
- [ ] Hero visual has gradient overlay (::after)
- [ ] Hero image has descriptive `alt` and `loading="eager"`

### C5. Content Sections (10 items)

- [ ] Section padding uses halved clamp values
- [ ] Adjacent sections have border-top separator
- [ ] `[id]` sections have `scroll-margin-top: 80px`
- [ ] No two consecutive sections share layout family
- [ ] Bento grids have no empty cells
- [ ] Cards have `-4px` hover with shadow elevation
- [ ] Zigzag alternates image/text position
- [ ] Dark slabs have transition gradient line
- [ ] Trust strip has 4 metrics with counter animation
- [ ] All `[data-reveal]` elements animate on scroll

### C6. Forms (8 items)

- [ ] Form container has `clamp(3.6rem, 2.6rem + 5vw, 5.8rem)` padding
- [ ] clamp() has spaces around `+`
- [ ] All required fields have `data-required`
- [ ] Phone fields have `data-type="phone"`
- [ ] Email fields have `data-type="email"`
- [ ] Error messages hidden by default, shown on validation failure
- [ ] Submit button is `btn btn-lg` with arrow icon
- [ ] Privacy note present below submit button

### C7. Anti-Slop (10 items)

- [ ] Zero em-dashes (—) in all HTML files
- [ ] Zero en-dashes (–) in all HTML files
- [ ] No AI-purple gradients
- [ ] Eyebrows ≤ 2 per page
- [ ] No numbered card-tags (STEP 01, 阶段 01)
- [ ] No decorative dots before titles
- [ ] No magnetic button JS
- [ ] No horizontal scrollers
- [ ] One accent color per page
- [ ] One corner-radius system

### C8. Images (5 items)

- [ ] All images have descriptive `alt` text
- [ ] Non-hero images have `loading="lazy"`
- [ ] No watermarks or logos in generated images
- [ ] No hex color codes in image generation prompts
- [ ] No UI borders or frames in generated images

### C9. Responsive (5 items)

- [ ] Nav links hide at 768px, hamburger shows
- [ ] Grids collapse to 1 column at 768px
- [ ] Trust strip becomes 2-col at 768px, 1-col at 480px
- [ ] Section padding reduced at breakpoints
- [ ] No horizontal scroll at any width

### C10. Accessibility (5 items)

- [ ] All images have `alt` text
- [ ] All interactive elements have `aria-label` or visible text
- [ ] Color contrast meets WCAG AA (4.5:1 for body text)
- [ ] Focus states visible (border-color + box-shadow)
- [ ] `prefers-reduced-motion` disables non-essential animations

---

## Part D: Browser Verification Steps

After writing all files, verify via browser:

### D1. Computed Style Checks

Navigate to each page and run these checks via `browser_evaluate`:

```javascript
// Check section padding
var section = document.querySelector('.section');
getComputedStyle(section).paddingTop; // should be ~33px, NOT 0

// Check form padding
var form = document.querySelector('#consult-form');
var formContainer = form.closest('[data-reveal]');
getComputedStyle(formContainer).padding; // should be ~84px, NOT 0

// Check clamp() validity
var formStyle = getComputedStyle(formContainer);
formStyle.paddingTop !== '0px'; // true = clamp() is valid

// Check hero gradient
var hero = document.querySelector('.hero');
getComputedStyle(hero).backgroundImage !== 'none'; // true = gradient applied

// Check breathing dot
var dot = document.querySelector('.dot');
getComputedStyle(dot, '::after').animationName; // should be 'breathe'

// Check text-wrap
var h1 = document.querySelector('h1');
getComputedStyle(h1).textWrap; // should be 'balance'

// Check scroll-margin
var section = document.querySelector('section[id]');
getComputedStyle(section).scrollMarginTop; // should be '80px'

// Check card hover
var card = document.querySelector('.card');
// Can't test :hover via JS, but check the transition is set
getComputedStyle(card).transition; // should include 'transform'
```

### D2. Visual Checks

Navigate to each page and verify:

1. Hero section has subtle gradient at top (not flat)
2. Hero visual gently floats up and down (7s cycle)
3. Breathing dot pulses green in hero and footer
4. Cards lift on hover (-4px with shadow)
5. Dark sections have smooth top transition (no hard cut)
6. All page heroes are same font size (not one bigger than others)
7. No horizontal scrollbar at any width
8. Mobile menu slides down when hamburger clicked
9. Form fields have generous padding (not cramped)
10. Back-to-top button appears after scrolling

### D3. Responsive Checks

1. Resize to 768px: nav links hide, hamburger appears
2. Grids collapse to single column
3. Trust strip becomes 2 columns
4. Section padding visibly reduces
5. No horizontal scroll

6. Resize to 480px: trust strip becomes 1 column
7. Footer grid becomes 1 column
8. Hero title shrinks appropriately
9. All tap targets are minimum 44x44px

---

## Part E: Common Failure Modes & Fixes

| Failure | Root Cause | Fix |
|---------|-----------|-----|
| Form padding is 0px | `clamp()` has no spaces around `+` | Add spaces: `clamp(3.6rem, 2.6rem + 5vw, 5.8rem)` |
| Panel not left-aligned | Mixed `.container` and `.container-wide` | Use same container class for title and panel |
| Content bottom-aligned | `.page-hero-grid { align-items: end }` | Change to `align-items: start` |
| Page hero h1 too large | Using `.display` (80px) instead of `.h1` (44px) | Change class to `.h1` |
| Button hover shakes | Magnetic JS effect | Remove JS, use gradient sweep CSS |
| Cards barely move on hover | `translateY(-2px)` | Change to `translateY(-4px)` |
| Hard color cut at dark section | No transition element | Add `::after` gradient line |
| Hero looks flat | No background gradient | Add `radial-gradient` to hero background |
| Footer status text has leading space | `&nbsp;` before text | Replace with `<span class="dot"></span>` |
| Text reflows badly in headlines | No `text-wrap` | Add `text-wrap: balance` to all headings |
| Anchor links hide behind nav | No scroll offset | Add `scroll-margin-top: 80px` to `[id]` sections |
| Sections too tall | Default padding too large | Halve section padding via clamp() |
| Form fields cramped | Input padding too small | Increase to `1.6rem 1.9rem` |
| "8w" instead of "8周" | English abbreviation in Chinese content | Use full Chinese unit |
| Duplicate card tags | Card-tag above h3 duplicates h3 text | Remove top card-tag, keep only bottom output tag |
