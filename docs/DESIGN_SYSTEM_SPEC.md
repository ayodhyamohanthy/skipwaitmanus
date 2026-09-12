# skipwait.me — Brand-Level Design System Specification
## Swiss Grid Clarity · Pentagram/Bierut Aesthetic

> "Typography is the voice of the brand. Grid is the architecture of trust."

---

## 1. Design Philosophy

**Aesthetic**: Swiss Grid Clarity — Pentagram/Michael Bierut style
**Mode**: Operate (task completion interface with brand authority)

Core principles:
- **Typography as language**: DM Sans with extreme weight/size hierarchy; headings carry personality, body carries clarity
- **Grid as thought**: Mathematical 8px baseline grid; content on a 12-column responsive grid
- **Restrained palette**: Black + white + one brand blue (#0B57D0); no decorative color
- **Whitespace as structure**: 60%+ negative space ratio; every pixel earns its place
- **Information architecture as decoration**: Visual hierarchy comes from content structure, not ornament

---

## 2. Color System

### Primary Palette
| Token | Hex | Usage |
|---|---|---|
| `--color-background` | `#F8FAFC` | Page background — barely-there cool white |
| `--color-foreground` | `#0F172A` | Primary text — near-black slate |
| `--color-card` | `#FFFFFF` | Card/surface white |
| `--color-primary` | `#0B57D0` | Brand blue — links, CTAs, accent |
| `--color-primary-hover` | `#0847AD` | Hover state |
| `--color-primary-light` | `#E8F0FE` | Tinted backgrounds |
| `--color-primary-subtle` | `#DBEAFE` | Selection, focus rings |

### Neutral Scale
| Token | Hex | Usage |
|---|---|---|
| `--color-muted-foreground` | `#64748B` | Secondary text, labels |
| `--color-border` | `#E2E8F0` | Borders, dividers |
| `--color-input` | `#E2E8F0` | Input borders |
| `--color-ring` | `#0B57D0` | Focus rings |

### Semantic Colors
| Token | Hex | Usage |
|---|---|---|
| `--color-success` | `#059669` | Success states, approved |
| `--color-warning` | `#D97706` | Pending, attention |
| `--color-error` | `#DC2626` | Errors, destructive |
| `--color-info` | `#0B57D0` | Information (primary blue) |

### Anti-Patterns (BANNED)
- ❌ Violet → blue overrides already in place
- ❌ Warm beige/tan backgrounds → cool white only
- ❌ Decorative gradients on buttons
- ❌ More than one accent color per view

---

## 3. Typography

### Font Stack
```css
--font-sans: "DM Sans", ui-sans-serif, system-ui, sans-serif;
```
DM Sans is the voice: geometric, modern, slightly warm. No serif needed.

### Type Scale (Swiss Hierarchy)
| Level | Size | Weight | Letter-spacing | Line-height | Usage |
|---|---|---|---|---|---|
| Display | 3.5rem (56px) | 650 | -0.06em | 0.94 | Hero headline (Home only) |
| H1 | 2.35rem (37px) | 650 | -0.06em | 0.96 | Page title |
| H2 | 1.65rem (26px) | 650 | -0.055em | 0.98 | Section heading |
| H3 | 1.25rem (20px) | 600 | -0.03em | 1.2 | Card title |
| Body | 0.875rem (14px) | 400 | normal | 1.7 | Body text |
| Caption | 0.6875rem (11px) | 700 | 0.13em | normal | Labels, badges (UPPERCASE) |
| Micro | 0.625rem (10px) | 600 | 0.1em | normal | Timestamps, metadata |

### Rules
- **Heading weight**: 650 minimum (semi-bold+), never 400
- **Body leading**: 1.6–1.7 for readability
- **Label tracking**: +0.13em for uppercase 11px labels (the "Swiss kraft" feel)
- **Never**: center-align body text, use script/decorative fonts

---

## 4. Spacing & Grid

### Baseline: 8px Grid
All spacing is multiples of 8px. Odd values (4px) for tight internal padding only.

| Token | Value | Usage |
|---|---|---|
| `--space-1` | 4px | Inline icon gap |
| `--space-2` | 8px | Tight internal padding |
| `--space-3` | 12px | Input padding, small card padding |
| `--space-4` | 16px | Card padding, list item gap |
| `--space-5` | 20px | Section gap (mobile) |
| `--space-6` | 24px | Section gap (desktop) |
| `--space-8` | 32px | Major section divider |
| `--space-10` | 40px | Page section gap |
| `--space-12` | 48px | Hero section padding |
| `--space-16` | 64px | Page top/bottom margin |

### Layout Grid
- **Max width**: 72rem (1152px) for main content; 32rem (512px) for single-column pages
- **Columns**: 12-column grid with 24px gutters
- **Breakpoints**: sm (640px), md (768px), lg (1024px)
- **Card min-width**: 280px before wrapping

---

## 5. Components

### 5.1 Buttons

**Primary CTA** (one per section):
```
bg-[#0B57D0] text-white rounded-lg px-5 py-3 text-sm font-bold
hover:bg-[#0847AD]
min-height: 44px (touch target)
```

**Secondary**:
```
border border-slate-200 bg-white text-slate-900 rounded-lg px-4 py-2.5 text-sm font-semibold
hover:border-blue-200 hover:bg-blue-50/30
```

**Ghost**:
```
text-sm font-semibold text-slate-600
hover:text-slate-950
```

**Destructive**:
```
bg-rose-600 text-white rounded-lg px-4 py-2.5 text-sm font-bold
hover:bg-rose-700
```

**Rules**:
- One primary CTA per visible section — never two blue buttons side-by-side
- Minimum touch target: 44×44px
- Disabled: `opacity-35 cursor-not-allowed`

### 5.2 Cards

**Standard Card**:
```
rounded-xl border border-slate-200 bg-white p-5 shadow-sm
```

**Elevated Card** (interactive):
```
rounded-xl border border-slate-200 bg-white p-5 shadow-sm
hover:border-blue-200 hover:bg-blue-50/30 transition
```

**Full-bleed Card** (wall items):
```
rounded-2xl border border-slate-200 bg-white p-7 shadow-sm
```

### 5.3 Inputs

```
w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm
outline-none focus:border-[#0B57D0] focus:ring-2 focus:ring-blue-100
placeholder:text-slate-400
min-height: 44px
```

### 5.4 Badges & Tags

**Status Badge**:
```
inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold
```

**Pill (kicker above heading)**: BANNED — no kicker-above-heading labels per design gate rules

**Category Tag**:
```
inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700
```

### 5.5 Navigation

**Desktop**: Horizontal links + primary CTA in header
**Mobile**: Sheet (drawer) from right; hamburger icon with 44×44px touch target
**Account menu**: Dropdown with avatar mark, role-labeled sections

### 5.6 Skeleton Loading

```
animate-pulse rounded-xl border border-slate-200 bg-white p-4
Inner: h-4 w-40 rounded bg-slate-100
```

---

## 6. Iconography

**Library**: Lucide React (tree-shakable, consistent stroke width)
**Size**: 16px (inline), 20px (buttons), 24px (standalone), 28px (hero icons)
**Color**: `currentColor` — inherits from text
**Stroke width**: Default (1.5–2px)

---

## 7. Motion

**Duration**: 150–200ms for micro-interactions; 300ms for page transitions
**Easing**: `cubic-bezier(0.23, 1, 0.32, 1)` — smooth out, no bounce
**Respect**: `prefers-reduced-motion: no-preference` guard on all animations

---

## 8. Responsive Rules

| Breakpoint | Columns | Card layout | Nav |
|---|---|---|---|
| < 640px (mobile) | 1 | Stack | Hamburger + Sheet |
| 640–1023px (tablet) | 2 | Grid 2-col | Horizontal links |
| ≥ 1024px (desktop) | 2–3 | Grid 2–3 col | Full nav + sidebar |

**Critical**: Every screen must be usable at 320px width. No horizontal scroll.

---

## 9. Accessibility

- **Contrast**: Text ≥ 4.5:1 against background (WCAG AA)
- **Focus**: 3px solid `#BFDBFE` ring with 2px offset on all interactive elements
- **Touch targets**: 44×44px minimum for all clickable elements
- **Screen reader**: `aria-label` on icon-only buttons; `aria-live` on dynamic content
- **Semantic HTML**: `<main>`, `<header>`, `<section>`, `<nav>`, `<footer>`

---

## 10. Page-by-Page Design Direction

### Home (/)
- **Mode**: Operate + Persuade hybrid
- **Hero**: Display headline (56px), 2 clear paths (Seeker/Referrer), trust signals below fold
- **Remove**: Decorative badges above heading
- **Add**: Stronger typographic hierarchy, more whitespace, cleaner card borders

### Opportunity Wall (/wall)
- **Mode**: Operate
- **Card**: Company domain → role title (H1, 37px) → description → metadata badges
- **Remove**: Multiple competing badges; reduce to one status indicator
- **Add**: Bolder typography, clearer visual hierarchy

### Job Explorer (/jobs)
- **Mode**: Operate
- **Grid**: 2-col card grid, each card with strong title hierarchy
- **Search**: Prominent search bar, secondary location filter
- **Add**: JobPosting structured data, better card design

### Messages (/messages)
- **Mode**: Operate
- **Layout**: X-style thread list + conversation pane
- **Cleaner**: Remove visual noise, stronger thread separation

### Settings (/settings)
- **Mode**: Operate
- **Sections**: Grouped by concern (Account, Notifications, Privacy, Billing)
- **Cleaner**: Consistent card-based sections

---

## 11. Design Gate Compliance

Rules enforced by CI (`.github/workflows/design-gate.yml`):
1. ❌ No kicker-above-heading labels
2. ❌ No functional text < 11px
3. ❌ No gray-on-tint contrast failures
4. ❌ No `transition:height` animations
5. ❌ One primary button per section

---

*Generated: 2026-09-12 · skipwait.me Design System v2.0*
