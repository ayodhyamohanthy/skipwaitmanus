# DESIGN.md — skipwait.me design context (Kit v4 contract, Oct 2026)

> OWNER OVERRIDE (Oct 2026): Kit v4 (`START_HERE.md`, `app/src/styles.css`) is
> the visual contract and supersedes the "Moving Parts" system below where
> they differ. Type, palette, and shape sections are kit values. The token
> audit carries a migration union until the last screen batch removes the
> final legacy hex. AGENTS.md's freeze is hereby amended by the owner for
> visual tokens only; all other AGENTS.md rules stand.

## Type system
- **UI/display/body**: `"Instrument Sans", sans-serif` — sentence case, letter-spacing 0.
- **Labels/eyebrows**: `"IBM Plex Mono", monospace` 9–11px uppercase micro-labels.
- **Scale**: 11–13px micro-labels · 13–14px body · 16–20px section titles · 24–28px+ page titles (kit heroes larger on marketing surfaces).
- Headings `text-wrap: balance`.

## Palette (kit v4 — oklch tokens in `client/src/index.css`, do not invent colors)
- canvas `oklch(1 0 0)` (white) · ink `#141414` · foreground `oklch(0.191 0 0)`
- primary electric blue `oklch(0.452 0.313 264.05)` (≈ `#0000FF`), dark-theme brighter blue `oklch(0.62 0.22 264)`
- invitation yellow `oklch(0.966 0.176 108.4)` (`#FFFC52`) with dark text — deliberate emphasis only
- dark theme: ink background `oklch(0.17 0 0)`, card `oklch(0.21 0 0)`, yellow kept as secondary accent
- functional: success `oklch(0.45 0.12 155)` · destructive `oklch(0.577 0.245 27.325)`
- Focus rings: primary blue, 3px + 4px offset. Selection: yellow on black. Caret: primary.

## Shape & space
- radius: `--radius: 1.5rem`; cards 24px (`radius-2xl`+); controls `--radius` steps via `@theme` scale; pills 999px; brand mark 10px.
- elevation: 2px ink borders + hard offset shadows (`4px 4px 0`) on brand moments — kit signature, replaces hairline-only rule.
- tap targets ≥44px mobile (≥45px tab bar), safe-area insets top + bottom; no horizontal overflow at 360px.
- task screens `max-w-xl mx-auto` where the screen batch keeps that shell; kit app shell (sidebar 248px / tab bar) is the new standard chrome.
- one gradient exception: kit work-showcase thumbnails use a subtle primary/secondary tint blend; no other gradients anywhere.

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
