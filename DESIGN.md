# DESIGN.md — skipwait.me visual contract: goal UI (D-048, D-070, D-071)

> Start with [`docs/BRIEF.md`](docs/BRIEF.md) (D-073).

> Approved comps: `design/goal-ui/pick/` (D-071, Oct 18 2026, without the compensation row) — Find a referral with the request drawer, Referral queue with the 7-reason pass picker, My referral requests, at 1280 and 390. Design brief: `design/goal-ui/BRIEF.md` (where it disagrees with `pick/`, the comps, D-070 and D-052 win). Tokens: the "D-048 phase 2" block at the end of `client/src/index.css`. Primitives: `client/src/components/goal/`.
> **D-120 (Oct 21): goal-focused UI is the one design, landing to platform - binding, not a proposal.** The yellow/blue Kit v4 visual language is retired (history, not a spec). Existing surfaces migrate to this contract one at a time, flag-safe, through the full gate with captures at 1280 and 390; until a surface migrates, its current live UI stays untouched. Doctrine: `design/goal-ui/DOCTRINE.md` (owner-decided Oct 21). Plan and claim table: `docs/plans/GOAL_UI_MIGRATION.md`.
> Rollout: phase 2 (this contract, tokens, primitives, token audit) changes no live surface. Phase 3 moves one surface at a time, each through the full gate with captures at 1280 and 390. Until a surface moves, it keeps its live Kit v4 tokens and components (`client/src/index.css` above the phase-2 block, `client/src/styles/kit.css`, `client/src/components/ui`, `client/src/components/kit`). Nobody re-skins a surface ad hoc.

## Overview
- Direction (D-070): Triage Desk's layout with Signal's type scale. Linear-quiet: dimmed chrome so content leads, a dense list then detail, one pinned decision bar on the referral queue. No "Seeking / Giving" mode switch.
- Compass (D-048): seekers send referral-worthy asks quickly; referrers decide with confidence; trust is visible; money is honest. Every non-visual decision stays binding: D-006/D-040 fairness, D-030 as amended by D-049/D-057, D-012(3), the money rules, "private until a referrer accepts", no public per-referrer metrics, no invented numbers, the lasting D-001 rules.
- Light mode only. White surfaces with hairlines.

### Binding rules (a change needs the owner)
1. **One primary action per screen.** Exactly one solid black element per screen, and it is the commit action (Send referral request, Accept & connect, Request a referral). A screen without a commit action (a list) has none. Selected chips, tabs and nav items use tints and borders, never a black fill. The brand is a wordmark. The Pass confirm is an ink outline.
2. **Trust colour only on verified marks.** `#1d4ed8` (`g-trust`) appears only as lucide `badge-check` plus its text, rendered by `GoalVerifiedMark`, and only when the server verdict says verified. Never for focus, links, info, buttons or availability. Focus rings are ink.
3. **White surfaces with hairlines.** Canvas and surfaces `#ffffff`; `#fafafa` only for the rail, list headers and the locked panel; hairline `#ebebeb` only for dividers; control edges `#8a8a8a`. No elevation on page content.
4. **Mono numerals.** Every figure the product counts or computes (credits, counts, IDs, clocks, positions, dates) is JetBrains Mono 500 at 13px (`GoalNum`), whatever the line around it. Figures inside prose and text a person typed stay in Instrument Sans tabular figures; only their dates switch to mono.
5. **Status is a dot plus text, coloured by role.** 8px dot and label in the same hue; no fills or badges in rows. Amber: pending (Waiting, Under review) and clocks of 2 days or fewer. Ink: Accepted, New, availability. Emerald: Referred only. Crimson: ended states (Expired, a Passed event) and input errors only, and never in the referrer queue. Ink-3: Withdrawn, Under review on the referrer side. Accepting is not referring.
6. **No gradients, glassmorphism, glows, blurred shapes, decorative shadows or coloured row backgrounds.**
7. **Lucide icons only** (`lucide-react`). Keycaps are letters or lucide `command`, `corner-down-left`, `arrow-up`, `arrow-down`. No Unicode glyph icons, logos, photos or illustrations (companies show initials).
8. **Motion per AGENTS.md §0a.** Micro-interactions 100-150 ms (hover 100 ms); menus and popovers 150-250 ms (150 ms); drawers and sheets 200-300 ms (200 ms in and out); page transitions 300-400 ms (none used). Everything else stays under 300 ms. Things seen 100+ times a day (list moves, row selection) are instant. `prefers-reduced-motion` makes every animation instant.
9. **Sample data never ships.** The comps' names, numbers, refs, initials and file names (Fernhill Bank, Kestrel Pay, Larkspur Retail, Monsoon Analytics, Orbit Freight, Quillmint, Tidewell Health; R-8F3K2 and the other R- refs; Resume_Backend_2026.pdf) are review fixtures. Every number on screen comes from the server; no invented numbers; no preview chips.
10. **No compensation row or field** in the referral queue (D-071) until the owner decides it separately.
11. **No public per-referrer metrics:** no response rates, speeds, rankings, "fast responder" chips or filters, streaks, read receipts or referrer counts. Exception (D-104): the company responsiveness signal may show company-level aggregates only (usual first reply, asks answered this month, verified referrers inside), minimum 3 referrers and 3 answered asks or it shows "Not enough data yet"; never per person, never ranked, sortable, filterable or for sale.
12. **Privacy and fairness.** Before acceptance a referrer sees the role, job function, job link, the three reasons, request-quality checks, a day-level clock and a document count — never the seeker's name, file names, links, photo or plan. No message box, reply field or "request info" before acceptance. Referrers never see a seeker's plan. Seekers cannot buy priority, ranking, visibility or an outcome; employer sponsorship is only a labelled "Featured listing" and never appears in referral requests or referrer queues. D-196's unimplemented, owner-controlled referrer plan is a separate future benefit, not seeker priority.
13. **Honest money.** Money lines say what the code does (`shared/moneyCopy.ts`, D-063); never promise a free referral. Referrer surfaces show no seeker balance or credit pill. Basic referring stays free and referrers are never paid (D-055); D-196's level-matched paid referrer plan is not implemented, and its prices, contents and access window remain owner-controlled. A balance that failed to load says so; it never shows 0.
14. **Day-level clocks only** ("2 days left", "Closes 20 Oct"). No hours, minutes or seconds; no "SLA", "respond within" or "act fast".
15. **Accessibility.** Text at least 4.5:1; large text, meaningful icons and control edges at least 3:1; targets at least 44px at 390; a visible ink focus ring on every interactive element; keycaps are hints, never the only label; keys open confirm steps and never commit (no shortcut while typing); disabled controls use `aria-disabled` and are never faded.
16. **One navigation.** The goal UI follows `design/goal-ui/DOCTRINE.md`: job discovery, referral-request tracking and Inbox are for all users; verified referrers also get the referral queue. Exact labels remain subject to terminology copy review; availability is not a browse or navigation state.
17. **Vocabulary.** Public copy uses referral-only terminology, with stage-qualified "referral request" wording where needed (D-173/D-180). "Ask" and "credit" stay internal; exact user-facing strings follow the terminology review, and money lines are not retyped.

## Colors
| Token (`client/src/index.css`) | Value | Tailwind | Role | Never |
|---|---|---|---|---|
| `--g-canvas` / `--g-surface` | `#ffffff` | `bg-g-canvas` / `bg-g-surface` | page, cards, bars, drawer, inputs | — |
| `--g-surface-sunken` | `#fafafa` | `bg-g-surface-sunken` | rail, list headers, locked panel | page content |
| `--g-surface-hover` | `#f4f4f5` | `bg-g-surface-hover` | hover tile | — |
| `--g-surface-selected` | `#f4f4f5` | `bg-g-surface-selected` | selected row, active rail tile, chips, marks | black fills |
| `--g-scrim` | `rgb(10 10 10 / 0.24)` | `bg-g-scrim` | phone sheets only | desktop drawer |
| `--g-ink` | `#0a0a0a` (19.80:1) | `text-g-ink` | primary text, links (underlined), focus ring | — |
| `--g-ink-2` | `#52525b` (7.73:1) | `text-g-ink-2` | secondary text | — |
| `--g-ink-3` | `#6b6b73` (5.28:1; 4.81:1 on `#f4f4f5`) | `text-g-ink-3` | meta, inactive nav, Withdrawn | — |
| `--g-ink-inverse` / `--g-on-primary` | `#ffffff` | `text-g-on-primary` | text on the primary | — |
| `--g-hairline` | `#ebebeb` (1.19:1) | `border-g-hairline` | dividers only | control edges |
| `--g-control-edge` | `#8a8a8a` (3.45:1) | `border-g-control-edge` | inputs, radios, keycaps, rings, grabbers | dividers |
| `--g-primary` / `-hover` / `-pressed` | `#0a0a0a` / `#262626` / `#404040` | `bg-g-primary` … | the one commit action | anything else |
| `--g-on-primary-edge` | `rgb(255 255 255 / 0.4)` | `border-g-on-primary-edge` | keycap edge on the primary | — |
| `--g-trust` | `#1d4ed8` (6.70:1) | `text-g-trust` (only in `GoalVerifiedMark.tsx`) | work email verified | focus, links, info, buttons, availability |
| `--g-emerald` | `#047857` | `text-g-emerald` (goal primitives only) | Referred | Accepted, availability, validation |
| `--g-amber` | `#b45309` | `text-g-amber` (goal primitives only) | pending; clocks of 2 days or fewer | text on surfaces darker than `#f4f4f5` |
| `--g-crimson` | `#b91c1c` | `text-g-crimson` (goal primitives only) | ended states; input errors | anything in the referrer queue |
Availability is internal routing only (D-176), not a visible directory status, label, chip or open-first grouping. After sending a request, explain whether it reached verified employees or is waiting in the company's pool (D-176); exact copy follows terminology review. Validation passes are ink with lucide `check`.

## Typography
- Faces (already installed, no new font): Instrument Sans 400/500/600/700 (`--g-font-sans`, `font-g-sans`) and JetBrains Mono 500 (`--g-font-mono`, `font-g-mono`). Tailwind's `font-mono` is IBM Plex Mono (Kit v4) — never use it in goal UI.
| Role | Tailwind | Weight size/line | Tracking | Use |
|---|---|---|---|---|
| Display | `text-g-display` | 700 28/36 | -0.02em | the one page title per screen (the role on the queue) |
| Heading | `text-g-heading` | 600 20/28 | -0.01em | drawer, popover and sheet titles; list title; focused ask |
| Body | `text-g-body` | 400 16/24 | 0 | reasons, notes, inputs |
| Label | `text-g-label` | 600 14/20 | 0.01em | buttons, field labels, row titles |
| Meta | `text-g-meta` | 500 13/20 | 0.01em | secondary lines, status |
| Badge | `text-g-badge` | 500 12/16 | 0.02em | nav labels, keycaps |
| Mono | `text-g-mono` + `font-g-mono` / `GoalNum` | 500 13/20 | 0 | IDs, days, counts, dates, credits |
| Row (phone) | `text-g-row-phone` | 600 16/24 | 0 | row titles at 390 |
- Headings balance (`text-wrap: balance`); prose wraps pretty. Two-tone headings keep one size and weight (lead ink, continuation ink-3) and are whole sentences.
- Copy keeps typographic characters: ’ − – · …

## Layout
- Breakpoint: phone `max-gdesk:` (width < 641px), desktop `gdesk:` (width ≥ 641px). Do not use Tailwind `sm:` for goal UI. Verify every screen at 1280 and 390.
- Spacing: 4px base; Tailwind's default spacing scale (4, 8, 12, 16, 20, 24, 32, 40px …).
- Shell (desktop): rail 104px (`--g-rail-w`; tiles 88×56, radius 8px) on `#fafafa` with a right hairline; top bar 56px with a bottom hairline (page name left; credits pill on seeker pages and the bell right). Phone: top bar 56px (avatar and "Give a referral" left; compact credits and bell right), no wordmark, a 56px bottom bar of three or four items that hides on an opened request and under sheets.
- Find a referral: rail | directory | 480px ask drawer docked flush under the top bar, no scrim (desktop); full-height sheet with an 8px top inset on phones.
- Referral queue: rail | 360px queue list | opened ask capped at 680px, with the 72px decision bar pinned at the bottom (`position: sticky`). Phone: the opened ask under the app top bar with a 48px sub-header (back, "n / N", previous/next) and the 72px decision bar; the pass reasons open in a medium sheet.
- My asks: rail | 440px list (three-line rows) | detail capped at 680px. Phone: the list only.
- Controls: 40px desktop (36/32px compact), 44px on phones, 48px for drawer, sheet and decision-bar actions and phone inputs.

## Elevation
- None on page content. Pass popover: `shadow-g-popover`. Desktop drawer: `shadow-g-drawer`. Phone sheets: scrim, no shadow.
- Focus: `0 0 0 2px #ffffff, 0 0 0 4px #0a0a0a` (`--g-focus-ring`), applied by `.g-scope` to every focusable element.

## Shapes
- Radius: keycap 4px, control 6px (buttons, inputs, chips, marks), tile 8px (selected rows, rail tiles, locked panel), popover 12px, phone sheet top corners 12px, desktop drawer 0. Avatar and dots are circles. Use `rounded-g-*`, never `rounded-sm|md|lg|xl` (Kit v4 scale from `--radius: 1.5rem`).
- The selected row's 2px ink bar inside its left edge is the only stripe.

## Motion
| Token | Value | Use |
|---|---|---|
| `--g-dur-list` | 0 ms | list moves, row selection |
| `--g-dur-hover` | 100 ms | hover and press colour |
| `--g-dur-menu` | 150 ms | pass popover |
| `--g-dur-drawer-in` / `-out` | 200 ms / 200 ms | ask drawer, sheets |
- Easing: enter `cubic-bezier(0, 0, 0.2, 1)` (`ease-g-out`), exit `cubic-bezier(0.4, 0, 1, 1)` (`ease-g-in`). Reduced motion: all 0 ms.
- Dialog motion uses the `animate-g-*` keyframes (Radix waits for CSS animations on exit); never the shadcn `animate-in` classes.

## Components
Import only from `@/components/goal`. Screens add layout utilities, never new colours, radii, type or shadows.
- `GoalShell` — rail, top bar, phone bottom bar, one navigation from `goalNavFor(verifiedReferrer)`, "Give a referral" for non-referrers, credits pill (seeker pages only).
- `GoalButton` — `primary` (one per screen), `ghost`, `outline`; 40/36/32px, 44 or 48px on phones; keycap hints on desktop; `busy` with an honest busy label; `aria-disabled`, never faded.
- `GoalSearchInput`, `GoalField` — 44/48px search with a leading lucide `search`; labelled inputs with help, pass hint (ink + `check`) and error (crimson, seeker side only).
- `GoalFilterChip` — `aria-pressed`, tint when selected, never black.
- `GoalListRow`, `GoalListSection` — selectable rows (company, queue, ask), `#f4f4f5` selected tile with the ink stripe, instant.
- `GoalDetailPane`, `GoalLockedPanel` — opened item with eyebrow, ref, title, meta, sections and a bottom dock; the locked panel shows a document count only.
- `GoalDecisionBar`, `GoalPassReasons` — pinned bar with "n / N", Pass privately (ghost) and Accept & connect (primary); the seven reasons from `shared/passReasons.ts`, none preselected, Pass disabled until one is picked.
- `GoalStatus`, `GoalMiniStepper`, `GoalStepper` — dot + text by role; Sent → Under review → Accepted → Referred.
- `GoalVerifiedMark` — `badge-check` + text in trust blue; the only trust-blue element.
- `GoalDrawer`, `GoalSheet` — Radix Dialog; 480px docked drawer (no scrim) on desktop, sheets with a scrim on phones.
- `GoalEmptyState`, `GoalErrorState`, `GoalSkeletonRows` — every list and detail handles loading, empty, error and offline in plain words; skeletons are static.
- `GoalNum`, `GoalKeycap`, `GoalIconButton` — mono figures, keycap hints, 36/44px icon buttons with an aria-label.

## Do's and Don'ts
- Do take sizes from `design/goal-ui/pick/*.css`; BRIEF.md section 4 holds pre-pick numbers.
- Do wrap goal UI (shell, portalled drawers, sheets and popovers) in `.g-scope`.
- Do use `aria-disabled`, `aria-current`, `aria-pressed`, `aria-expanded` exactly as the comps do.
- Don't use Kit v4 or shadcn tokens in goal UI (`bg-primary`, `border-border`, `ring-ring`, `text-ink`, `bg-paper`, `text-signal`, `font-mono`, `rounded-md`, `.brand-button`), and don't use `g-*` tokens on a surface that has not moved.
- Don't use hex or `rgb()` literals in goal components; don't add colours, fonts, icon sets or packages.
- Don't show the comps' sample data, a compensation field, per-referrer metrics, plan badges to referrers, hours or minutes on clocks, or a second black element.
- Don't use crimson anywhere in the referrer queue; don't use emerald for Accepted; don't use blue for anything but a verified mark.
- Don't animate list moves, and don't exceed 300 ms.
- Don't use the native `disabled` attribute on goal buttons (the Kit v4 layer paints it grey with `!important`).

## Verification
- `node scripts/design-token-audit.mjs` enforces the token rules (no hex in goal components, `g-trust` only in `GoalVerifiedMark`, status hues only in goal primitives, no Kit/shadcn tokens in goal files, no comp sample data in `client/src`, index.css tokens match this file).
- Primitive behaviour tests live beside the primitives (`client/src/components/goal/*.test.tsx`).
- Captures at 1280 and 390: phase 2 from the dev-only gallery (`/components#goal-ui`, the existing DEV-only route, compiled out of production builds); phase 3 from each moved surface, compared with `design/goal-ui/pick/*.png`.
