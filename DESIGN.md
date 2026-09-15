# DESIGN.md — skipwait.me design context ("Scoreboard" world, Sep 2026 rebrand)

## Type system
- **Display**: Barlow Condensed 600/700, uppercase, tracking +0.01em (`font-display`) — heroes, step titles, wordmark.
- **UI/body**: Barlow 400/500/700 (`font-sans`).
- **Numerals/labels**: JetBrains Mono 500/700 with `tnum` — proof strips, counts, meters, stamps, code.
- **Scale**: 11px mono labels (tracking .08–.14em) · 13–14px body · 16–18px section titles · 24–28px page titles (condensed) · 3.4–4.5rem heroes (condensed uppercase).
- Tracking floor −0.04em everywhere (headings −0.02em).

## Palette (do not invent colors)
- paper `#F5F4EF` (ground) · card `#ffffff` · ink `#191713` (text + primary actions) · ink-soft `#2A2721` · coal `#23201A`
- signal `#E8442E` (marks, display punctuation, stamps — never body text or button fills) · signal-tint `#F9E4DE` · signal-line `#EAC0B2`
- muted `#625D52` (secondary text) · faint `#8A8478` (icons/large only) · line `#E2DDD2` · input line `#D5CFC0`
- functional (semantic only): success `#15803d` · pending `#B45309` · error `#B91C1C` (+ their tint grounds)
- WCAG AA verified pairs: ink/paper 16.25 · muted/paper 5.95 · signal/ink 4.52 · signal-on-paper large-only 3.60 · disabled solid `#3F3B33` on `#D5CFC0` ≈6.8

## Shape & space
- radius: 12–16px cards/inputs · 4px stamps · 99px pills/dots; stamp mark 6px.
- elevation once: ink border OR soft offset shadow, never both (ghost cards banned).
- disabled = solid `#D5CFC0` block + `#3F3B33` text (no faded ghosts); placeholders `#625D52`.
- focus rings ink; caret + selection signal; scrollbar paper/line.
- screens `max-w-xl mx-auto`, safe-area bottom; step markers carry sequence info (kept); decorative kickers above headings banned.

## Components (reuse, never restyle)
- StatusBadge (dot + label; blue tone = signal-tint ground, ink text, signal dot)
- Stamp chip: 1px ink border, mono uppercase, 4px radius (e.g. identities-hidden proof)
- Proof strip: `dl` grid, mono tabular numerals, divide-line
- SeekerCreditsCard / ReferrerCreditsCard (credit meter) · MetricCard · Brand (signal stamp + condensed wordmark) · AccountMenu · OneTapShareActions
- Toasts: top-center, 72px mobile/desktop offset (never over bottom CTAs)

## Motion
- `prefers-reduced-motion` honored; one authored moment per surface (referral-success pop); exponential ease-out.

## Anti-patterns (banned here)
- No gradients, glassmorphism, neon glows, blurred orbs; no blue-SaaS remnants
- No side-tab colored borders · no cards-in-cards nesting · no Unicode glyph icons (lucide only)
- No Inter/Roboto/Arial · no monospace-for-everything (mono = numerals/labels only)
- No redundant UX writing (say it once) · one primary button per screen section
- No white-on-signal fills (3.96 contrast) · no opacity-faded disabled states
