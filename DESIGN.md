# DESIGN.md — skipwait.me design context ("Scoreboard" world)

Committed direction: `1abfc6c9` (surface brief: `.impeccable/surfaces/client-src-pages-home-tsx.md`).
The retired "Moving Parts" world (white/blue `#0000ff`/yellow `#fffc52`, Helvetica Neue) is gone:
do not reintroduce its hexes, its type stack, or its radii. Tokens live in `client/src/index.css`
and every product hex is guarded by `node scripts/design-token-audit.mjs`.

## Modes
- **Persuade** — `/` only. Ink masthead, a wire strip of real counts, one display headline, two role plates, the request ledger.
- **Operate** — every other screen. Same world, quiet: ruled lists, condensed section titles, mono labels, ink actions.

## Type system
- **Display**: `"Barlow Condensed"` 600 (`font-display`, `.display`) — uppercase, `line-height: .88`, tracking −0.005em. Landing headline, section titles, plate titles, step titles.
- **UI/body**: `"Barlow"` 400/500/600 (`font-sans`) — sentence case, never condensed for prose.
- **Numerals/labels**: `"JetBrains Mono"` 500/700 (`font-mono`, `.tnum`) — counts, meters, codes, timestamps, micro-labels only.
- **Scale**: 10–11px mono micro-labels (uppercase, tracked .12–.22em) · 13–14px body · 20–24px condensed UI titles · 34–64px section displays · landing hero `clamp(46px,10.4vw,124px)`.
- Display type stays within −0.01em…+0.02em tracking; body copy never shouts.

## Palette (do not invent colors)
- canvas `#f4f4f1` (paper) · secondary blocks `#e9e9e2` (paper-dim) · lifted plates `#fbfbf8` (card)
- ink `#131311` (text, rules, primary fills) · hover ink-soft `#2a2a25` · paper text on ink
- signal `#e8442e` — exactly one emphasis per surface: the hero's closing period, a stamp, an eyebrow, a live count, a section rule. Never a generic link color, never a filled block under paper text (3.96:1); signal fills carry ink text.
- signal-deep `#c2351f` · signal-tint `#fbe0da` · signal-line `#f0b4a8` (tint grounds, rings)
- ring `#d9d9d1` · track `#deded6` · fog `#5f5f58` (secondary text) · faint `#7a7a72` (icons, large only) · line `#dcdcd4` (hairline) · input `#c4c4ba`
- neutral rail still in the field: `#e5e5e5` `#cfcfcf` `#f0f0f0` `#f5f5f5` `#e0e0e0` `#505050` `#767676` (existing surfaces). New work prefers the named tokens above.
- functional (semantic only, always paired with text/icons): success `#1d6b3c` · pending `#8a5a0b` · error `#b02318` (+ 12% tint grounds)
- The world has no pure white: `bg-white`/`text-white` resolve to paper, `bg-black`/`text-black` to ink.

## Shape & space
- corners are cut, not rounded: 0–4px on plates and controls (`--radius: .25rem`); pills only for dots and avatars.
- elevation once: hairline rule OR one offset shadow, never both — the default plate is a 1px `ink/20` rule on paper.
- numbering is information: step rails and ledger rows carry mono indices (`01`, `02`, `03`), never decorative.
- disabled = solid `#dcdcd4` block + `#5f5f58` text; placeholders `#5f5f58`.
- focus = 3px ink outline offset 2px; caret ink; selection signal on ink.
- task screens `max-w-xl mx-auto` with safe-area bottom actions; marketing and landing `max-w-[1280px]`.

## Components (reuse, never restyle)
- Brand stamp mark + condensed wordmark (`Brand`, `dark` for ink strips)
- Stamp marks / status stamps: mono uppercase label inside a 1px rule (`StatusBadge`; blue tone = ink stamp, amber/green/red stay semantic)
- Ink primary action (one per screen section) · paper plate with ink border for the secondary action
- Request ledger plate (ink header bar, ruled rows, state stamps) · numbered step rails · metric cells (`MetricCard`)
- Mono micro-label wire strip for live counts; `tnum` on every number that sits in a column
- Toasts: top-center, 72px offset (never over bottom actions)

## Motion
- `prefers-reduced-motion` honoured; one authored moment per surface (the landing wire-count stamp-in, the referral-success pop); exponential ease-out; hover transitions move colour or a few pixels only.

## Anti-patterns (banned here)
- No gradients, glassmorphism, neon/glow decoration, blurred orbs; no cream/brown/terracotta remnants
- No cool blue/indigo SaaS palette — the retired `#0000ff` family is a token violation, not a shim target
- No Unicode glyph icons (lucide only) · no cards-in-cards nesting · no decorative kickers that state nothing
- No opacity-faded disabled states · no signal-red fill under paper text
- No condensed type for body copy · no monospace for everything (mono = numerals, codes, micro-labels)
- One primary action per screen section; say it once.
