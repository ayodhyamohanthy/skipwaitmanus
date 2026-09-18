# DESIGN.md — skipwait.me design context ("Moving Parts" world, approved homepage system)

## Type system
- **UI/display/body**: `"Helvetica Neue", "Segoe UI", ui-sans-serif, system-ui, sans-serif` (`font-sans`, `font-serif`, `font-display` all resolve to this stack) — sentence case, never condensed uppercase for headings.
- **Numerals/labels**: JetBrains Mono 500/700 with `tnum` — counts, meters, codes, timestamps only.
- **Scale**: 11–13px micro-labels · 13–14px body · 16–20px section titles · 24–28px page titles · large heroes only on the marketing landing page (task screens stay compact so actions remain reachable).
- Tracking floor −0.04em (headings typically −0.02 to −0.03em); headings use `text-wrap: balance`.

## Palette (do not invent colors)
- canvas `#ffffff` · ink `#000000` (text + outlined actions)
- primary action blue `#0000ff` (hover `#0000cc`, pressed `#000099`) · white text on blue (8.59:1)
- pale-blue tint `#ededff` (info panels, selected states) · pale-blue line `#c2c2ff` · track `#e0e0ff`
- accent yellow `#fffc52` with black text — deliberate emphasis only (hero panels, eyebrows on blue, text selection); never body text, never fills behind white text
- dark section `#121212` with white text
- secondary text `#505050` · icons/large-only `#767676` · hairline `#e5e5e5` · input line `#cfcfcf` · neutral fills `#f0f0f0` / `#f5f5f5`
- functional (semantic only, always paired with text/icons): success `#15803d` · pending `#B45309` · error `#B91C1C` (+ their tint grounds)

## Shape & space
- radius: major panels 76px desktop / 38px mobile (marketing) · task cards/panels 24px · controls/inputs `--radius: 1.125rem` (18px) · pills/dots 99px · brand mark 9px.
- elevation once: hairline border OR soft offset shadow, never both (ghost cards banned).
- disabled = solid `#e0e0e0` block + `#505050` text (no faded ghosts); placeholders `#505050`.
- focus rings `#0000ff`; caret `#0000ff`; selection yellow `#fffc52` on black; scrollbar white/`#cfcfcf`.
- task screens `max-w-xl mx-auto`, safe-area bottom actions; step markers carry sequence info; decorative kickers above headings banned.

## Components (reuse, never restyle)
- StatusBadge (dot + label; blue tone = pale-blue tint ground, black text, blue dot)
- Blue primary CTA (one per screen section) · white/black outlined secondary actions
- Pale-blue info/credit panels · yellow reserved for deliberate emphasis moments
- SeekerCreditsCard / ReferrerCreditsCard (credit meter) · MetricCard · Brand (outlined mark + wordmark) · AccountMenu · OneTapShareActions
- Toasts: top-center, 72px mobile/desktop offset (never over bottom CTAs)

## Motion
- `prefers-reduced-motion` honored; one authored moment per surface (referral-success pop); exponential ease-out.

## Anti-patterns (banned here)
- No gradients, glassmorphism, neon glows, blurred orbs; no cream/brown/terracotta remnants
- No condensed uppercase headings · no cards-in-cards nesting · no Unicode glyph icons (lucide only)
- No monospace-for-everything (mono = numerals/labels only)
- No redundant UX writing (say it once) · one primary button per screen section
- No yellow fills behind white text · no opacity-faded disabled states
