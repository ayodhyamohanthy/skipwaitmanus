# DESIGN.md — skipwait.me design context

## Type system
- **Sans (everything)**: DM Sans — body, headings, UI. Weights: 400/500/700/800.
- **Display (marketing/hero only)**: Fraunces (serif, wght 500–700) — used on the design board and marketing pages, never inside app screens.
- **Mono (labels/metadata)**: JetBrains Mono — eyebrows, version stamps, code, sync log.
- **Scale**: 11px (eyebrow, uppercase tracking .14–.18em) · 12px (secondary meta) · 13–14px (body) · 16–18px (section titles) · 24–28px (page titles) · 2.35rem (hero/step titles, weight 600–800, tracking −.045 to −.06em).

## Palette (do not invent colors)
- background `#f8fafc` · card `#ffffff` · ink `#0f172a` · secondary text `#334155` · muted `#64748b` · faint `#94a3b8`
- brand `#0B57D0` · accent bg `#E8F0FE` · border `#e2e8f0` / `#e7e5e0` (paper `#faf9f7` for docs)
- success `#15803d` on `#ECFDF3` · pending `#B45309` on `#FFFAEB` · error `#B91C1C` on `#FEF3F2`
- WCAG AA verified pairs: 0B57D0/fff 6.39 · 0f172a/fff 17.85 · 64748b/fff 4.76 · 64748b/f8fafc 4.55 · 0B57D0/E8F0FE 5.57 · 334155/F1F5F9 9.45

## Shape & space
- radius: 12px (cards/inputs), 7–9px (buttons/chips inner), 99px (pills), 26px (device frames in design docs)
- spacing: 4px base grid; screens are `max-w-xl mx-auto`, full-height `h-dvh`, safe-area padding bottom
- shadows: minimal — `shadow-sm` on cards; heavy borders only on design-board frames

## Components (reuse, never restyle)
- StatusBadge (dot + label, tone: blue/amber/green/red/slate)
- SeekerCreditsCard / ReferrerCreditsCard (credit meter)
- MetricCard (stat + label), Brand (logo lockup), AccountMenu, OneTapShareActions
- PendingItemCard pattern: Row1 title+badge · Row2 muted context · Row3 summary · Row4 meta chips · Row5 actions

## Anti-patterns (from impeccable.style/slop — banned here)
- No purple/blue gradients, no glassmorphism, no neon glows, no blurred orbs
- No side-tab colored borders on cards · no cards-in-cards nesting
- No Inter/Roboto/Arial · no monospace-for-everything
- No icon containers bigger than their content
- No status-chip soups (≤3 chips per row) · no redundant UX writing (say it once)
- No bouncing/wiggle animation; motion only for status transitions
- Redundant CTA: one primary button per screen section

## Motion
- `prefers-reduced-motion` honored; transitions only on status change; skeleton ≥300ms + 15s error fallback
