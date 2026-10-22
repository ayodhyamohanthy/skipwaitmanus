# Spec appendix to packet D-048 phase 2: tokens, primitives and the DESIGN.md draft

> Reference only. The packet is [`D-048-phase-2.md`](D-048-phase-2.md). Values come from the owner-approved comps in `design/goal-ui/pick/` (D-071); where `design/goal-ui/BRIEF.md` disagrees, the comps win (section 1h).

## 1. Token table from the approved comps (`design/goal-ui/pick/`)

Source of truth for values: `design/goal-ui/pick/tokens.css` (91 lines; comp prefix `--sw-*`). Header `tokens.css:1-6`: colours/surfaces/lines/radii/elevation/focus/motion are "Triage Desk, BRIEF.md section 4, verbatim"; type is "Signal's scale, BRIEF.md section 6, verbatim"; "No new colour, no new font: Instrument Sans 400/500/600/700 and JetBrains Mono 500 are installed." `shell.css:6`: "Values come from tokens.css; this file adds no colour of its own" (true except the literals flagged below).

### 1a. Colour (all from `tokens.css`)
| Comp token | Value | Line | Semantic role (comp comment / usage) | Proposed phase-2 name |
|---|---|---|---|---|
| `--sw-canvas` | `#FFFFFF` | 10 | page background | `--g-canvas` |
| `--sw-surface` | `#FFFFFF` | 11 | cards/drawer/bars/inputs | `--g-surface` |
| `--sw-surface-sunken` | `#FAFAFA` | 12 | "rail, list headers, locked panel" | `--g-surface-sunken` |
| `--sw-surface-hover` | `#F4F4F5` | 13 | hover tile | `--g-surface-hover` |
| `--sw-surface-selected` | `#F4F4F5` | 14 | "selected row tile, active rail tile" (also avatar/mark bg, `shell.css:119,213`) | `--g-surface-selected` |
| `--sw-scrim` | `rgb(10 10 10 / 0.24)` | 15 | "phone sheets only; the desktop drawer has no scrim" | `--g-scrim` |
| `--sw-ink` | `#0A0A0A` | 17 | primary text, "19.80:1" | `--g-ink` |
| `--sw-ink-2` | `#52525B` | 18 | secondary text, "7.73:1" | `--g-ink-2` |
| `--sw-ink-3` | `#6B6B73` | 19 | tertiary/meta, "5.28:1 on white, 4.81:1 on #F4F4F5" | `--g-ink-3` |
| `--sw-ink-inverse` | `#FFFFFF` | 20 | text on dark | `--g-ink-inverse` |
| `--sw-hairline` | `#EBEBEB` | 22 | "dividers only (1.19:1)" — never a control edge | `--g-hairline` |
| `--sw-control-edge` | `#8A8A8A` | 23 | "inputs, radios, keycaps, rings: 3.45:1" (meets 3:1 non-text contrast) | `--g-control-edge` |
| `--sw-primary` | `#0A0A0A` | 25 | primary button fill (ink, not blue) | `--g-primary` |
| `--sw-primary-hover` | `#262626` | 26 | | `--g-primary-hover` |
| `--sw-primary-pressed` | `#404040` | 27 | | `--g-primary-pressed` |
| `--sw-on-primary` | `#FFFFFF` | 28 | text on primary | `--g-on-primary` |
| `--sw-trust` | `#1D4ED8` | 30 | trust/verified ONLY (`shell.css:204` "Trust blue appears only here, with badge-check and its text"; `shell.css:55` "Focus: ink ring, never blue (blue means "work email verified" and nothing else)") | `--g-trust` |
| `--sw-emerald` | `#047857` | 31 | status: referred | `--g-emerald` (role mapping lives in `GoalStatus`) |
| `--sw-amber` | `#B45309` | 32 | status: pending; "is-soon" clock ≤2 days | `--g-amber` (role mapping lives in `GoalStatus`/row clock) |
| `--sw-crimson` | `#B91C1C` | 33 | status: expired; input errors | `--g-crimson` (role mapping lives in `GoalStatus`/`GoalField`) |
| `--sw-dot` | `8px` | 34 | status dot size | `--g-dot` |

Status-role rules (verbatim sources): `tokens.css:29` "Trust and status: dot + text, same hue for both, no fills in rows"; `my-asks.css:3` "Status colours by role only: amber pending, ink accepted, emerald referred, crimson expired"; withdrawn = `--sw-ink-3` (`my-asks.css:45,78`); queue `.is-soon` amber "2 days left or fewer; never crimson here" (`referral-queue.css:48`); queue states `new` = ink, `review` = ink-3 (`referral-queue.css:44-45`); "a passed check is ink, not emerald" (`find-a-referral.css:67`); quality checks use ink icons (`referral-queue.css:85`).
Error colour: the comps draw no error state, but `design/goal-ui/BRIEF.md:126` assigns Crimson `#B91C1C` to "Ended (Expired, a Passed event) and input errors" and bans it from the referrer queue (VERIFIED; see §1h).

Literal colours outside tokens (must become tokens or be dropped in the port):
- `shell.css:181` `.btn--primary .kbd { border-color: rgb(255 255 255 / 0.4) }` (keycap edge on the primary button) → `--g-on-primary-edge: rgb(255 255 255 / 0.4)`.
- `tokens.css:67` drawer shadow embeds `#EBEBEB` (= hairline); `tokens.css:69` focus ring embeds `#FFFFFF`/`#0A0A0A` (= surface/ink); `tokens.css:65-67` shadows use `rgb(0 0 0 / 0.02|0.04|0.06|0.08|0.16)`.
- Opacity used as colour: `my-asks.css:49` and `:67` (`opacity: 0.5` on `--sw-control-edge` connectors).

### 1b. Type (`tokens.css:36-52,89`; fonts `tokens.css:37-38`)
| Comp token | Value (weight size/line family) | Tracking | Line | Use (comp comment) |
|---|---|---|---|---|
| `--sw-font-sans` | `"Instrument Sans", system-ui, sans-serif` | | 37 | |
| `--sw-font-mono` | `"JetBrains Mono", ui-monospace, monospace` | | 38 | |
| `--sw-type-display` | `700 28px/36px` sans | `-0.02em` | 39 | "one per screen" (page title) |
| `--sw-type-heading` | `600 20px/28px` sans | `-0.01em` | 40 | drawer/popover/sheet titles, queue list title, detail title |
| `--sw-type-body` | `400 16px/24px` sans | `0` | 41 | "reasons, notes, inputs" |
| `--sw-type-label` | `600 14px/20px` sans | `0.01em` | 42 | "buttons, field labels, row titles" |
| `--sw-type-meta` | `500 13px/20px` sans | `0.01em` | 43 | "secondary lines, status" |
| `--sw-type-badge` | `500 12px/16px` sans | `0.02em` | 44 | "nav labels, keycaps" |
| `--sw-type-mono` | `500 13px/20px` mono | (0, `shell.css:44`) | 45 | "IDs, days, counts, dates" |
| `--sw-type-row-phone` | `600 16px/24px` sans | `0` (per-screen) | 89 | "row titles on phones" |
| `--sw-numeric` | `tabular-nums` | | 52 | body default (`shell.css:25`) |
Other literal type: rail brand `700 16px/24px` + display tracking (`shell.css:86`); avatar and company mark `600 12px/16px`, `0.02em` (`shell.css:120,214`).
`.mono` utility (`shell.css:42-46`): `font-family: mono; font-weight: 500; font-size: min(1em, 13px); letter-spacing: 0; word-spacing: -0.2em; white-space: nowrap; font-variant-numeric: tabular-nums; font-variant-ligatures: none`.
Numeral rule (`tokens.css:46-51`, verbatim gist): a figure the product counts or computes (credits, counts, IDs, clocks, positions, dates) is JetBrains Mono 500 at 13px "whatever the weight or size of the line around it"; figures inside prose and text a person typed stay in Instrument Sans tabular figures; only their dates switch to mono.
D-070 check: "Instrument Sans 700 28/36 titles" = display (39) VERIFIED; "16/24 body" = body 400 (41) VERIFIED; "600 14/20 labels" = label (42) VERIFIED; "JetBrains Mono 13/20 numerals" = mono 500 (45) VERIFIED. The comps add three sizes D-070 does not name: heading 600 20/28, meta 500 13/20, badge 500 12/16, plus row-phone 600 16/24.
Fonts: comps need Instrument Sans 400/500/600/700 and JetBrains Mono 500 only — all already imported by `client/src/index.css:1-8` (known fact). No new font package.
Rupee glyph: `shell.css:10-15` adds `@font-face` for Instrument Sans latin-ext (`unicode-range: U+20A0-20C0`) because the comp tool's `tools/fonts.css` loads latin only. In the app this is unnecessary: VERIFIED that `node_modules/@fontsource/instrument-sans/400.css:1-8` already declares the latin-ext face covering `U+20A0-20AB,U+20AD-20C0` (rupee U+20B9) — see "Fonts/icons verified" below; do not port `shell.css:10-15`.

### 1c. Spacing (`tokens.css:55-56`) — 4px baseline
`--sw-space-1: 4px; -2: 8px; -3: 12px; -4: 16px; -5: 20px; -6: 24px; -8: 32px; -10: 40px` (no 7/9). These equal Tailwind's default `--spacing: 0.25rem` multiples (1=4px … 10=40px), so phase-2 primitives can use standard Tailwind spacing utilities (`p-4`, `gap-2`, …) — no new spacing tokens needed. Comp per-screen CSS also uses off-scale literals: 2px, 6px, 10px, 14px, 28px, 36px (e.g. `shell.css:156` button `padding: 0 14px`; `find-a-referral.css:52` drawer head `padding: 14px 12px 14px 24px`; `my-asks.css:52` detail `padding: 36px 40px 40px`); Tailwind's `p-3.5`(14px), `p-7`(28px), `p-9`(36px), `p-1.5`(6px), `p-2.5`(10px), `p-0.5`(2px) cover them without arbitrary values.

### 1d. Radii (`tokens.css:58-63`)
`--sw-radius-keycap: 4px` (58) · `--sw-radius-control: 6px` (59, "buttons, inputs, chips, marks") · `--sw-radius-tile: 8px` (60, "selected rows, rail tiles, locked panel") · `--sw-radius-popover: 12px` (61) · `--sw-radius-sheet: 12px` (62, "phone sheet top corners") · `--sw-radius-drawer: 0` (63, "desktop drawer is docked flush"). Literals: avatar and dot `50%` (`shell.css:118,196`); grabber `2px` (`find-a-referral.css:134`, `referral-queue.css:211`); selected-row stripe `0 2px 2px 0` (`shell.css:224`).

### 1e. Elevation and focus (`tokens.css:64-69`)
- "Elevation: none on page content" (64).
- `--sw-shadow-popover: 0 0 0 1px rgb(0 0 0 / 0.08), 0 1px 1px rgb(0 0 0 / 0.02), 0 4px 8px -4px rgb(0 0 0 / 0.04), 0 16px 24px -8px rgb(0 0 0 / 0.06)` (65-66) — pass-reason popover only (`referral-queue.css:125`).
- `--sw-shadow-drawer: -1px 0 0 #EBEBEB, -16px 0 32px -24px rgb(0 0 0 / 0.16)` (67) — desktop ask drawer (`find-a-referral.css:47`); phone sheet uses `box-shadow: none` (`find-a-referral.css:132`).
- Avatar ring `inset 0 0 0 1px var(--sw-hairline)` (`shell.css:119`).
- `--sw-focus-ring: 0 0 0 2px #FFFFFF, 0 0 0 4px #0A0A0A` (69) applied as `:where(a, button, input, textarea, [tabindex]):focus-visible { outline: none; box-shadow: var(--sw-focus-ring); }` (`shell.css:56`). Focus ring is ink, never trust blue (`shell.css:55`). Textarea-in-card pattern: inner `.reason__text:focus-visible { box-shadow: none }` and the card gets `border-color: ink; box-shadow: focus-ring` via `:focus-within` (`find-a-referral.css:91,94`).

### 1f. Motion (`tokens.css:70-73,91`) vs `AGENTS.md:88-99`
| Token | Value | §0a band | Verdict |
|---|---|---|---|
| `--sw-dur-list` | `0ms` (71) | 100+/day → no animation | OK (row selection is instant, `shell.css:219`) |
| `--sw-dur-hover` | `100ms` (71) | micro 100-150ms | OK |
| `--sw-dur-menu` | `150ms` (71) | standard 150-250ms | OK (pass popover "Opens in var(--sw-dur-menu)", `referral-queue.css:120`) |
| `--sw-dur-drawer-in` | `200ms` (72) | modals/drawers 200-300ms | OK |
| `--sw-dur-drawer-out` | `150ms` (72) | modals/drawers 200-300ms | CONFLICT: below the drawer band (still under the 300ms rule). Recommendation: set `--g-dur-drawer-out: 200ms` in phase 2 (motion is invisible in static comps, §0a is the founder's standing rule), and list the deviation from `tokens.css:72` in the packet; or ask the owner in the weekly batch (D-064). |
| `--sw-ease-out` | `cubic-bezier(0, 0, 0.2, 1)` (73) | | enter / hover |
| `--sw-ease-in` | `cubic-bezier(0.4, 0, 1, 1)` (73) | | exit |
Reduced motion (91): `@media (prefers-reduced-motion: reduce) { :root { --sw-dur-hover: 0ms; --sw-dur-menu: 0ms; --sw-dur-drawer-in: 0ms; --sw-dur-drawer-out: 0ms; } }`.
Comp has no page transitions, no skeleton shimmer, no spinner animation (none defined) — any skeleton must be static or reduced-motion-safe.

### 1g. Breakpoints and layout (`shell.css:52-53,239`; `tokens.css:75-89`)
- Single breakpoint: phone `@media (max-width: 640px)`, desktop `@media (min-width: 641px)` (`shell.css:52-53`). Captures: 1280 and 390.
- Tailwind v4 default `sm` is `(width >= 40rem)` = 640px, i.e. at exactly 640px Tailwind `sm:` is "desktop" but the comp is "phone" (off by 1px). Phase 2 must define its own breakpoint (see §3) rather than reuse `sm`.
| Comp token | Value | Line | Note |
|---|---|---|---|
| `--sw-rail-w` | `104px` | 76 | "was 88" |
| `--sw-rail-tile-w` | `88px` | 77 | |
| `--sw-rail-tile-h` | `56px` | 78 | |
| `--sw-topbar-h` | `56px` | 79 | |
| `--sw-bottombar-h` | `56px` | 80 | phone bottom nav |
| `--sw-drawer-w` | `480px` | 81 | ask drawer |
| `--sw-list-w` | `360px` | 81 | queue list |
| `--sw-detail-max` | `680px` | 81 | detail content cap (bars use `calc(680px + 80px)`, `referral-queue.css:59,90,106`) |
| `--sw-asks-list-w` | `440px` | 82 | my-asks list |
| `--sw-decision-bar-h` | `72px` | 83 | "40px buttons with 16px above and below" |
| `--sw-decision-bar-h-phone` | `72px` | 84 | |
| `--sw-subheader-h-phone` | `48px` | 85 | phone back bar |
| `--sw-control-h` | `40px` | 86 | desktop buttons/inputs |
| `--sw-control-h-phone` | `48px` | 87 | phone inputs and primary buttons |
| `--sw-touch` | `44px` | 88 | min touch target |
Other literal sizes: `.btn--sm` 36px, `.btn--xs` 32px (`shell.css:161-162`); icon button 36×36 desktop / 44×44 phone (`shell.css:145,251`); all `.btn` 44px on phone (`shell.css:253`); credits pill 32px (36px phone) (`shell.css:137,250`); chip 32px (`shell.css:187`); keycap 20px (`shell.css:174`); avatar 32px (`shell.css:118`); company mark 28px (32px phone) (`shell.css:212`, `find-a-referral.css:124`); search input 44px desktop / 48px phone with 44px left padding for the icon (`find-a-referral.css:18,116`); company row 52px desktop / min 64px phone (`find-a-referral.css:33,122`); queue row min 64px / 72px phone (`referral-queue.css:40,165`); pass popover 368px wide, rows 40px (`referral-queue.css:124,135`); phone pass sheet rows min 48px (`referral-queue.css:217`); grabber 32×4 (`find-a-referral.css:134`).
- 44px hit-area helper `.hit::after { width: max(100%, 44px); height: max(100%, 44px) }` (`shell.css:58-64`) enlarges compact controls without changing drawn size.
- Pinned areas: "pinned areas (drawer footer, decision bar, bottom bar) are laid out in flow here … In the build they are position: sticky" (`shell.css:7-8`; `referral-queue.css:101` "position: sticky; bottom: 0").

Fonts/icons verified against installed packages (repo `node_modules`):
- `node_modules/@fontsource/instrument-sans/400.css:1-8` already declares the latin-ext face with `unicode-range: … U+20A0-20AB,U+20AD-20C0 …` (rupee U+20B9 covered), so the comp's `shell.css:10-15` `@font-face` block is NOT needed in the app (do not port it).
- All 22 lucide icons rendered in the three comp HTML files exist in the installed `lucide-react` 0.453.0 (`package.json` `^0.453.0`): badge-check, bell, check, chevron-down, chevron-left, chevron-up, circle-dashed, circle-dot, clock, coins, command, corner-down-left, external-link, file-text, hand-helping, inbox, lock, messages-square, plus, search, send, x. Comp tool `design/goal-ui/tools/lucide.mjs:9` reads icons straight from `node_modules/lucide-react/dist/esm/icons`. Nav icons (`design/goal-ui/content.json` `shell.nav`): Find=`search`, My asks=`send`, Inbox=`messages-square`, Queue=`inbox`, Impact=`hand-helping`; credits pill=`coins`; alerts=`bell`; "Give a referral" `icon: building-2` is defined but not rendered.
- No new dependency is needed by any comp: everything maps to installed packages — `lucide-react`, `@radix-ui/react-dialog` (drawer/sheet), `@radix-ui/react-popover` (pass popover), `@radix-ui/react-radio-group` (optional), `class-variance-authority`, `clsx`, `tailwind-merge`, and dev deps `@testing-library/react` ^16.3.2, `@testing-library/user-event` ^14.6.4, `jsdom` ^30.0.1, `vitest` ^4.1.11, `playwright` 1.62.1 (root `package.json`). `vaul` ^1.1.2 is also installed but not needed.

### 1h. Corrections and additions from `design/goal-ui/BRIEF.md` (61 KB brief)
- Header `BRIEF.md:1-3`: D-071 approved the "your pick" comps in `pick/` without the compensation row ("Every compensation mention below is historical"); D-070: no mode switch; "Pass reasons follow D-052 (7 reasons). Where this brief still describes a mode switch or 5 reasons, D-070 and D-052 win."
- Precedence for values: `pick/tokens.css` is canonical. `BRIEF.md:194-264` (Triage Desk token block) and `:265-327` (Triage Desk layout) carry the PRE-pick numbers (rail 88, top bar 52, decision bar 64, title 600 24/32, body 15/24, mono 12/16, 36px buttons, 320px pass menu, 5 reasons, a compensation meta item); the pick re-tuned them (`tokens.css:5`, `:75-89` "was 88", "was 52", "was 64", "was 36"). Implementers must take sizes from `pick/*.css`, never from BRIEF §4.
- Error colour VERIFIED: `BRIEF.md:126` semantic-roles table — Crimson `#B91C1C` = "Ended (Expired, a Passed event) and input errors"; "Never used for: Anything in the referrer queue". (§1a already reflects this.)
- Other role rules (`BRIEF.md:118-132`): Primary `#0A0A0A` "The one commit action: Send ask, Accept & connect, Ask for a referral", never anything else; Trust blue `#1D4ED8` "Work email verified; lucide `badge-check` plus its text", never "Focus, links, info, buttons, availability"; Emerald = Referred (and later "credits added, on billing surfaces"), never "Accepted, availability, validation"; Amber = "Pending (Waiting, Under review) and clocks of 2 days or fewer"; Neutral ink = "Accepted, Withdrawn, New, Under review on the referrer side, availability". Availability: "Open to requests" = solid 8px ink dot + ink text; "Not open yet" = 8px ring (1.5px control edge) + muted text, "Never green, never blue" (`:129`). Validation passes are ink with lucide `check` (`:130`).
- Seeker status glyphs (`BRIEF.md:131`): Waiting `circle-dashed`, Under review `circle-ellipsis`, Accepted `circle-dot`, Referred `circle-check`, Expired `circle-x`, Withdrawn `circle-minus`. Stepper nodes (`:132`): done `circle-check`, current `circle-dot`, upcoming `circle-dashed`; terminal `circle-x` / `circle-minus`.
- Binding design rules `BRIEF.md:100-116` (3.1): 1 lucide only, keycaps are letters or lucide `command`, `corner-down-left`, `arrow-up`, `arrow-down`, no Unicode glyph icons; 2 "No gradients, glassmorphism, glows, blurred shapes or decorative shadows. Light mode only."; 3 no invented numbers, "No referrer counts anywhere"; 4 no public per-referrer metrics ("no response rates, speeds, rankings, "fast responder" chips or filters, streaks, or "viewed" receipts"); 5 pre-accept a referrer sees role, job function, job link, three reasons, ask-quality checks, a day-level clock and "2 documents" — "Never the seeker's name, file names, links, photo or plan"; 7 "No message box, reply field or "request info" before acceptance"; 8 "Accepting is not referring. Accepted is neutral; emerald starts at Referred"; 10 vocabulary: Find a referral, Give a referral, Ask for a referral, Accept & connect, Pass privately, Send ask — never "warm intro", "insider", "intro request"; 11 money lines say what the code does today, no "free referrals"; 12 clocks are day-level, no hours/minutes/seconds, no "SLA", "respond within", "act fast"; 13 accessibility: text ≥4.5:1, large text/icons/control edges ≥3:1, targets ≥44px at 390, visible `:focus-visible` ring on every interactive element, `prefers-reduced-motion` honoured; 14 motion budget "drawers and sheets 200-300 ms, nothing over 300 ms; moving through a list is instant"; 15 "Exactly one solid black element per screen, and it is the primary action. Selected chips, segments, tabs and nav items use tints and borders, never a black fill. The brand is a wordmark, not a black block. The Pass confirm is an ink outline." (Rules 6 and 9 are superseded by D-070/D-052.)
- Drawer-out conflict confirmed twice: `tokens.css:72` `--sw-dur-drawer-out: 150ms` vs `AGENTS.md:93` ("Modals, drawers: 200-300ms") and `BRIEF.md:115` rule 14 ("drawers and sheets 200-300 ms"). Recommendation stands: `--g-dur-drawer-out: 200ms`.
- Triage Desk role rules (`BRIEF.md:181-186`): "Black is used only for Send ask, Accept & connect and Ask for a referral"; "Dots carry state only"; "Keycaps are hints, never the only label"; "The selected row's 2px ink bar on its left edge is the only stripe"; "Gray carries information; blue appears only with `badge-check`". Rejects (`:188-192`): priority bars, Snooze/"Later", hover row actions, filled badges in rows, coloured row backgrounds, reply box before acceptance, swipe to decide, Unicode keycaps, "respond within" copy. Speed contract (`:180`): instant list moves, prefetched next ask, "an honest busy state on Accept and Pass; nothing optimistic on actions that move credits".
- Keys (`BRIEF.md:729`): "Keys open confirm steps and never commit"; shortcuts off while typing. Queue order (`:730`): soonest close first, advance after each decision.
- Packages (`BRIEF.md:751`): "Packages: none needed. Radix Dialog already ships; Vaul is unmaintained upstream, so avoid it." => Drawer/Sheet primitives use `@radix-ui/react-dialog`, never `vaul`.
- Fonts needing approval if ever proposed (`BRIEF.md:749-750`): Inter/Inter Display/Geist/Arcadia/Material Symbols; real company logos, photography or illustration. Phase 2 uses none.
- Open questions still open (`BRIEF.md:753-761`): Q3 whether referrers see "1 / 5" (the pick shows it and D-071 approved the pick); Q4 three reasons vs single note (a phase-3 build question); Q6 non-sequential refs (`R-8F3K2`) — no register entry decides it (UNVERIFIED as decided); Q7 production should offer all ten job functions as chips. None blocks phase 2 (primitives take data as props).
- Not shown on purpose (`BRIEF.md:765-772`): D-034 waiting asks, D-047 held asks, D-038 timers, D-035 pass-reason credit outcomes, paid coach rewrite, pinned work. Phase-2 primitives must not hard-code any money/status copy.

## 4. Primitive specs (only what the three approved screens need)

Common rules for every primitive: React + TypeScript, no `any`; Tailwind utilities with `g-` theme names only (no hex, no kit/shadcn colour names); lucide-react icons only (`aria-hidden="true"` on decorative icons); visible text never replaced by an icon; every interactive element ≥44×44px at ≤640px (drawn size may be smaller with `.g-hit`); ink focus ring from `.g-scope` (never blue); hover transitions `transition-colors duration-(--g-dur-hover) ease-g-out`; list selection instant (`--g-dur-list: 0ms`); never the native `disabled` attribute on buttons (index.css:178 paints it `#e0e0e0` with `!important`) — use `aria-disabled="true"` and ignore the click; no copy, names or numbers baked in (every string is a prop, so comp sample data cannot ship); data-testids are `goal-<name>`.

### 4.1 GoalShell (+ nav.ts) — source: `pick/src/shell.mjs:1-96`, `shell.css:66-151,238-268`, `content.json` `shell`
- Props: `active: "find" | "asks" | "queue" | "inbox"`; `verifiedReferrer: boolean` (server verdict; phase 3 wires `useReferrerAccess` (`client/src/hooks/useReferrerAccess.ts`) + `isVerifiedReferrer` (`shared/referrerAccess.ts:40`)); `pageTitle: string`; `credits: { state: "ready"; count: number } | { state: "loading" } | { state: "error"; onRetry(): void } | null` (null = hidden; the referral queue passes null — "Referrers are never charged", `shell.mjs:84-85`); `account: { initials: string; menu?: ReactNode }`; `alertsHref: string`; `giveReferralHref?: string` (default `referrerSignInHref()` from `client/src/lib/referrerSignIn.ts:7`, required by `docs/BRIEF.md:11`); `hideBottomBar?: boolean` (true on an opened request and while a sheet is open — BRIEF.md:149, `referral-queue.css:170`); `drawer?: ReactNode` (desktop docked column); `children` (main).
- nav.ts: `GOAL_NAV = { find: { label: "Find a referral", railLabel: "Find", icon: Search, href: "/explore" }, asks: { label: "My asks", railLabel: "My asks", icon: Send, href: "/requests" }, queue: { label: "Referral queue", railLabel: "Queue", icon: Inbox, href: "/queue" }, inbox: { label: "Inbox", railLabel: "Inbox", icon: MessagesSquare, href: "/inbox" } }`; `goalNavFor(verified) = verified ? [find, asks, queue, inbox] : [find, asks, inbox]` (`shell.mjs:15,18`; labels/icons/hrefs from `content.json` `shell.nav`; all four routes exist in `client/src/App.tsx:112`). Impact (`/referrer/impact`, icon `hand-helping`) is NOT a nav item: the approved comp reaches it from a quiet link in the queue header "so the rail and the phone bar keep four places" (`referral-queue.css:23`, `shell.mjs:5-6,19-20`). D-070's text lists Impact for verified referrers; D-071 approved the comp placement — record this reading in DESIGN.md (owner may object in the weekly batch).
- Desktop (≥641px): grid `columns: var(--g-rail-w) minmax(0,1fr)` (+ `var(--g-drawer-w)` when `drawer` is set, areas "rail top top" / "rail main drawer", `find-a-referral.css:5-8`), `rows: var(--g-topbar-h) minmax(0,1fr)`, `min-height: 100vh` (`shell.css:67-74`).
  - Rail `<nav aria-label="Primary">`: bg `g-surface-sunken`, right 1px `g-hairline`, padding `0 8px 20px`, column centred (`shell.css:77-83`). Wordmark link "SkipWait" to `/`: height 56px, 700 16/24, tracking -0.02em, ink (`shell.css:84-87`; "The brand is a wordmark, not a black block", BRIEF.md:116). Items gap 4px, margin-top 8px; tile 88×56, radius 8px, column, gap 4px, icon 20px stroke 1.75, label `text-g-badge`, colour `g-ink-3`, hover `g-ink`; active `aria-current="page"`: bg `g-surface-selected`, `g-ink`, weight 600 (`shell.css:88-96`). Foot (margin-top auto, gap 16px, full rail width): the "Give a referral" link (only when `!verifiedReferrer`) above the avatar.
  - Top bar `<header>`: 56px, bg `g-surface`, bottom hairline, padding `0 12px 0 24px`, gap 8px; left page title `text-g-meta` `g-ink-3`; right: credits pill (if not null) then alerts icon button (`bell`, aria-label "Alerts") (`shell.css:124-149`).
- Phone (≤640px): rail hidden; grid areas "top" / "main" / "nav" with `rows: 56px minmax(calc(100vh - 56px - 56px), auto) 56px` (`shell.css:239-245`). Top bar padding `0 4px 0 10px`, gap 4px: left avatar (margin `0 6px 0 2px`) + "Give a referral" (min-height 44px) when not verified; right compact credits pill (height 36px, count only) + 44×44 bell (`shell.css:246-251`). No wordmark on phones (BRIEF.md:149). Bottom bar `<nav aria-label="Primary">`: 56px, bg `g-surface`, top hairline, equal columns; item = icon 20 over `text-g-badge` label, `g-ink-3`; active = `g-ink` + 600, no tile (`shell.css:257-267`).
- "Give a referral" (`shell.css:104-114`, `content.json` `shell.unverifiedEntry`): an `<a>` (never a toggle, never paired with social sign-in) with label "Give a referral" (`text-g-meta`, letter-spacing 0, underline, decoration `g-control-edge`, offset 3px) over hint "Work email only" (`text-g-badge`, `g-ink-3`); colour `g-ink-2`, hover `g-ink` + ink underline; rail variant centred with padding `6px 0`, radius 6px.
- Credits pill (`shell.css:135-141`, `content.json` `shell.creditsPill`): `<button>` 32px (36px phone), padding `0 12px 0 10px`, 1px `g-control-edge`, radius 6px, `text-g-meta`, icon `coins` 16 `g-ink-2`; label "{n} credits" desktop / "{n}" phone with the number in `GoalNum`; `aria-label` "{n} credits available. Open credit details". Loading: same box with an `aria-busy` placeholder, no number. Error: text "Balance didn't load" + "Retry" (`content.json` `otherStates.balanceError`, rule: "Never show 0 when the balance failed to load.").
- Avatar (`shell.css:116-121`): `<button aria-label="Account menu">` 32px circle, bg `g-surface-selected`, `inset 0 0 0 1px` hairline, initials 600 12/16 tracking 0.02em `g-ink-2`, `.g-hit`.
- Root carries `className="g-scope"` and `data-testid="goal-shell"`. Landmarks: rail/bottom bar `nav`, top bar `header`, content `main`.
- States: loading/error/offline belong to the content (credits pill handles its own). Disabled: n/a.

### 4.2 GoalButton (+ GoalKeycap) — source: `shell.css:153-182`, BRIEF.md:116,182
- Props: `variant: "primary" | "ghost" | "outline"`; `size?: "md" | "sm" | "xs"` (40 / 36 / 32px; padding `0 14px` / `0 12px` / `0 10px`); `touch?: "default" | "large"` (≤640px height 44px, or 48px for drawer/decision-bar/sheet actions — `shell.css:253`, `find-a-referral.css:141`, `referral-queue.css:198,227`); `keys?: ReactNode[]` (keycap hints); `busy?: boolean`; `busyLabel?: string`; `disabledReason?: string` (sets `aria-disabled="true"` and `aria-describedby` to a rendered reason); `asChild?: boolean` (via installed `@radix-ui/react-slot`, for link buttons such as "Ask for a referral" which is an `<a class="btn btn--primary">`, `page-asks.mjs:116`); `leadingIcon?: LucideIcon`; standard button props.
- Base: inline-flex, centred, gap 8px, 1px transparent border, radius `rounded-g-control` (6px), `text-g-label`, nowrap, `transition-colors duration-(--g-dur-hover) ease-g-out`.
- primary: bg `g-primary` (#0a0a0a), text `g-on-primary`; hover `g-primary-hover` (#262626); active `g-primary-pressed` (#404040); renders `data-g-primary` (test hook). ghost: text `g-ink`; hover and `aria-expanded="true"` bg `g-surface-hover`. outline: border `g-ink`, text `g-ink` (the Pass confirm). Disabled (`aria-disabled="true"`, any variant): border `g-control-edge`, text `g-ink-3`, `cursor-not-allowed`, no opacity fade (AGENTS.md:455 bans faded disabled controls), click/keyboard activation suppressed.
- Keycaps (desktop only, `max-gdesk:hidden`): wrapper `aria-hidden="true"`, gap 4px, margin-left 2px; button right padding 10px when keys exist (14px on phone) (`shell.css:170,254`). GoalKeycap: min-w 20px, h 20px, px 5px, 1px `g-control-edge`, `rounded-g-keycap` (4px), bg `g-surface`, `g-ink-2`, `text-g-badge` tracking 0; icon keycaps 12px (`command`, `corner-down-left`, `arrow-up`, `arrow-down` only, BRIEF.md:102); inside primary: transparent bg, border `g-on-primary-edge` (rgb(255 255 255 / 0.4)), text `g-on-primary` (`shell.css:181`). Keycaps are hints, never the only label.
- Busy: shows `busyLabel` ("Sending your ask…", "Accepting…" — `content.json` screenA/screenB primaryAction.busyLabel), `aria-busy="true"`, `aria-disabled="true"`; no optimistic success (BRIEF.md:180); optional `loader-circle` icon must not spin under reduced motion.
- One solid black element per screen (BRIEF.md:116): a screen renders at most one `variant="primary"`; a list-only frame renders none (`page-queue.mjs:9`).
- Offline: callers pass `disabledReason` (copy is phase-3/owner — the live offline sentence is "You're offline. Showing saved info.", `client/src/components/PwaStatus.tsx:49`, already shown app-wide by `OfflineNotice` mounted from `App.tsx:14`).

### 4.3 GoalSearchInput (+ GoalField / text input) — source: `find-a-referral.css:15-22,63-67,116`, `shell.css:227-234`, `page-find.mjs:103-106`
- GoalSearchInput props: `label: string` (rendered as `aria-label`, e.g. "Search companies"), `value`, `onChange`, `placeholder?`. Markup: wrapper `relative`; lucide `search` 20px stroke 1.75 at left 12px, vertically centred, `g-ink-3`, `pointer-events-none`, `aria-hidden`; `<input type="search">` full width, height 44px (48px phone), padding `0 12px 0 44px`, 1px `g-control-edge`, radius 6px, bg `g-surface`, `text-g-body`, placeholder `g-ink-3`, caret ink. States: focus ink ring; loading = results area skeleton (input stays enabled); no error/disabled state in the comp; offline: stays usable for client-side filtering.
- GoalField props: `label`, `htmlFor`/`id`, `help?`, `hint?: { icon: LucideIcon; text: string; tone: "muted" | "pass" }`, `error?: string`, `children` (the control). Layout: grid gap 8px; label `text-g-label` `g-ink`; help `text-g-meta` `g-ink-3` margin-top -4px; hint row icon 16 + `text-g-meta` `g-ink-3`, `pass` tone = `g-ink` with `check` ("a passed check is ink, not emerald", `find-a-referral.css:67`). Text input: height 40px (48px phone), padding `0 12px`, 1px `g-control-edge`, radius 6px, `text-g-body`, `text-overflow: ellipsis`. Error (not drawn in comps; colour from BRIEF.md:126 "input errors" = crimson): message `text-g-meta` `g-crimson` with `circle-alert` 16px, input `aria-invalid="true"`, `aria-describedby` → message; error layout UNVERIFIED. Never crimson inside the referrer queue (BRIEF.md:126).

### 4.4 GoalFilterChip — source: `shell.css:184-193`, `find-a-referral.css:24,117`, `page-find.mjs:15-18`
- `<button aria-pressed>`; 32px, padding `0 12px`, gap 6px, 1px `g-hairline`, radius 6px, `g-ink-2`, `text-g-label` at weight 500; hover `g-surface-hover`; pressed: padding-left 10px, bg + border `g-surface-selected`, `g-ink`, weight 600, leading `check` 16px. `.g-hit` (44px). Group wrapper `role="group"` + `aria-label` (e.g. "Filter companies"), gap 8px (row gap 12px on phone). Never a black fill.

### 4.5 GoalListRow (+ GoalListSection) — source: `shell.css:218-225`, `find-a-referral.css:28-39,119-125`, `referral-queue.css:34-48,160-166`, `my-asks.css:18-36,108-113`
- Props: `href?` or `onSelect?` (renders `<a>` or `<button>` inside an `<li>`); `selected?: boolean` (`aria-current="true"`); `selectable?: boolean` (default true; false on phone lists with no detail pane — no selected styling, `my-asks.css:112-113`); `density: "company" | "queue" | "ask"`; slots `leading?` (company mark), `title`, `trailing?` (status/availability), `meta?`, `metaTrailing?` (date/clock), `footer?` (third line, ask rows).
- Base: `relative`, radius `rounded-g-tile` (8px), hover `g-surface-hover`, NO transition (instant); selected: bg `g-surface-selected` + `::before` 2px `g-ink` bar inside the left edge, `top: 12px; bottom: 12px`, radius `0 2px 2px 0` — "the only stripe" (BRIEF.md:185). Never hover row actions, filled badges or coloured row backgrounds (BRIEF.md:191).
- company: grid `28px auto minmax(0,1fr) auto` (areas mark name fn avail), height 52px, padding `0 12px 0 10px`, column-gap 12px; name `text-g-label` ink nowrap; functions `text-g-meta` `g-ink-3` ellipsis; availability `text-g-meta` with an 8px dot (open: solid ink dot + ink text; not open: 1.5px `g-control-edge` ring + `g-ink-3` text — never green or blue). Phone: grid `32px minmax(0,1fr) auto`, areas "mark name avail" / "mark fn fn", min-height 64px, padding `10px 12px 10px 10px`, mark 32px, name `text-g-row-phone`.
- queue: grid areas "role role" / "meta state", min-height 64px (72px phone), padding `10px 12px` (12px phone), row-gap 2px; role `text-g-label` (phone `text-g-row-phone`); meta `text-g-meta` `g-ink-3` = function · clock (clock in `GoalNum`, `g-amber` when ≤2 days left — "never crimson here"); state right: New = ink dot + ink text, Under review = `g-ink-3` text, no dot.
- ask: grid areas "co status" / "role date" / "next next", padding 12px, column-gap 16px, row-gap 2px; company `text-g-label` (phone `text-g-row-phone`); role `text-g-meta` `g-ink-2`; status = `GoalStatus` with mini stepper; date `text-g-meta` `g-ink-3` with value in `GoalNum` `g-ink-2`; next step `text-g-meta` `g-ink-3`, wraps, never truncated, margin-top 4px.
- Company mark (`shell.css:210-216`): 28px (32px phone) square, radius 6px, bg `g-surface-selected` (`g-surface` when the row is selected), initials 600 12/16 tracking 0.02em `g-ink-2`, `aria-hidden`. Initials only — no logos (BRIEF.md:750).
- GoalListSection: `<section aria-labelledby>` with heading `text-g-meta` `g-ink-3` "{label} · {count}" (count in `GoalNum`), padding `20px 12px 6px` (`my-asks.css:19`); rows gap 2px.
- States (list container): loading = `GoalSkeletonRows` at the density's row height; empty = `GoalEmptyState`; error = `GoalErrorState`; offline = cached rows stay, actions disabled by the screen.

### 4.6 GoalDetailPane (+ GoalLockedPanel) — source: `referral-queue.css:56-99,170-194`, `my-asks.css:51-95`, `page-queue.mjs:49-61,98-140`, `page-asks.mjs:88-101`
- Props: `labelledBy` id; `eyebrow?`; `refId?` (mono, `g-ink-2`/`g-ink-3`); `title: ReactNode`; `titleSize: "display" | "heading"` (queue role = the screen's one display title, `referral-queue.css:62`; My asks detail = heading, `my-asks.css:55`); `meta?: ReactNode[]` (flex-wrap, gap `4px 20px`, `text-g-meta` `g-ink-3`); `children` (sections); `dock?: ReactNode` (locked panel + accept note + decision bar, pushed to the bottom with `margin-top: auto`, padding-top 32px / 28px phone); `phoneBack?: { href: string; label: string }` and `phonePosition?: ReactNode` (48px sub-header, back link 44px tall with `chevron-left` 18px + `text-g-label`, `referral-queue.css:178-181`).
- Layout: `<article aria-labelledby>` flex column; body width 100%, `max-width: calc(var(--g-detail-max) + 80px)`, padding `36px 40px 0` (`20px 16px 0` phone) (`referral-queue.css:59,183`); My asks inner max-width 680px, padding `36px 40px 40px` (`my-asks.css:52-53`). Two-tone title allowed: lead `g-ink`, continuation `g-ink-3`, same size and weight (`my-asks.css:56`, BRIEF.md:176).
- Section helpers: label `text-g-label` ink (`referral-queue.css:75`); numbered list items with `GoalNum` index "01"-"03" `g-ink-3` in a 32px column + `text-g-body` text (`referral-queue.css:76-80`); quality list `check` 16px ink + `text-g-meta` `g-ink-2`, gap `8px 20px` — no pills (`referral-queue.css:82-86`); props `<dl>` grid `120px minmax(0,1fr)`, gap 10px, top hairline, dt `text-g-meta` `g-ink-3`, dd `text-g-body` (single column on phone) (`referral-queue.css:67-73,185-188`); links are ink with underline (decoration `g-control-edge`, offset 3px; hover ink) (`shell.css:235-236`).
- GoalLockedPanel: flex, gap 12px, padding `14px 16px`, bg `g-surface-sunken`, 1px `g-hairline`, radius 8px; `lock` 20px stroke 1.75 `g-ink-2`; title `text-g-label` ink; trailing `file-text` 16px + count in `GoalNum` `g-ink-3` (e.g. "2 documents") (`referral-queue.css:91-98`); phone wraps with the count under the title (`:192-194`). Shows a document COUNT only — never file names, links, photo, name or plan (BRIEF.md:106).
- Accept note: `text-g-meta` `g-ink-2`, margin `12px 0 16px`, directly above the decision bar (`referral-queue.css:99`).
- States: loading = title + three line skeleton; error = `GoalErrorState` inline with retry; nothing selected (desktop) = `GoalEmptyState` (copy not in comps: UNVERIFIED, phase 3 writes it).

### 4.7 GoalDecisionBar (+ GoalPassReasons) — source: `referral-queue.css:101-151,196-227`, `page-queue.mjs:41-47,72-96,128-138,161-181`, BRIEF.md:177,184,729
- Props: `position?: { index: number; total: number; onPrev(): void; onNext(): void }` (text "{index} / {total}" in `GoalNum` `g-ink-2` with sr-only "Ask {index} of {total}", `aria-hidden` on the visual text; prev/next `GoalIconButton` `chevron-up`/`chevron-down` 18px, aria-labels "Previous ask"/"Next ask", keycaps K/J desktop only); `secondary: { label: string; keyHint?: string; onClick(): void; expanded?: boolean; controlsId?: string }` (ghost, `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls` when open); `primary: { label: string; keyHint?: string; onClick(): void; busy?: boolean; busyLabel?: string; disabledReason?: string }`; `passPicker?: ReactNode` (anchored popover content).
- Layout: wrapper `sticky bottom-0`, bg `g-surface`, top 1px hairline; bar flex space-between, gap 16px, `max-width: calc(var(--g-detail-max) + 80px)`, height 72px, padding `0 40px`; right group gap 8px: secondary, 1×24px hairline divider (`aria-hidden`, desktop only), primary. Phone: height 72px, padding `12px 16px`, actions `grid-cols-2` gap 8px, buttons 48px, no keycaps, position control moves to the detail sub-header.
- Keyboard (desktop, only when focus is not in an input/textarea/contenteditable): A focuses/opens the accept confirmation, P opens the pass picker, J/K next/previous, 1-7 pick a reason inside the open picker. Keys open confirm steps and never commit (BRIEF.md:177,729). Accept reveals identity, so it is never one keystroke.
- GoalPassReasons: options = `PASS_REASON_OPTIONS` from `shared/passReasons.ts:6-14` (7 reasons, shipped order: not_my_team, needs_experience, not_enough_context, at_capacity, role_closed, only_refer_known, prefer_not_to_say), none preselected. Desktop popover (`@radix-ui/react-popover`, side top, align end, offset 8): width 368px, padding `16px 12px 12px`, radius 12px, `shadow-g-popover`, title `text-g-heading` (padding 0 8px), description `text-g-meta` `g-ink-2`, `role="radiogroup"` `aria-labelledby` title; rows 40px, padding `0 8px`, gap 12px, radius 6px, hover `g-surface-hover`, `text-g-body`; radio 18px, 1.5px `g-control-edge`, checked = 5px `g-ink` border; keycap 1-7 at the right; note `text-g-meta` `g-ink-3`; footer top hairline, Cancel (ghost sm) + Pass (outline sm, `aria-disabled` until a reason is picked). Opens with `animate-g-fade-in` (150ms), instant under reduced motion. Phone: `GoalSheet` medium height, padding `8px 16px 20px`, grabber 32×4 `g-control-edge`, rows min 48px with bottom hairlines, radio 20px (checked 6px border), actions `grid-cols-2` 48px. Popover/sheet content carries `g-scope`.
- States: busy (primary shows busyLabel "Accepting…", both actions `aria-disabled`, nothing optimistic); error (plain words next to the bar in `g-ink`/`g-ink-2` with `circle-alert` — NOT crimson: BRIEF.md:126 bans crimson in the referrer queue); offline (`disabledReason` on both actions); end of queue (`onNext` absent → next button `aria-disabled`).

### 4.8 GoalStatus (+ GoalMiniStepper, GoalStepper) — source: `shell.css:195-202`, `my-asks.css:3,38-49,58-79`, `referral-queue.css:43-48`, BRIEF.md:126-132, `content.json` `screenC.statuses`/`stepper`
- Props: `status: "waiting" | "under_review" | "accepted" | "referred" | "expired" | "withdrawn" | "queue_new" | "queue_review"`; `label: string` (copy from the screen); `stepper?: { stage: number; terminal?: "expired" | "withdrawn" }` (renders the mini stepper before the label).
- Rendering: inline-flex, gap 8px (6px in queue rows), `text-g-meta`, nowrap; 8px dot (`--g-dot`) `bg-current`, `aria-hidden`; tone by role: waiting/under_review → `g-amber`; accepted → `g-ink`; referred → `g-emerald`; expired → `g-crimson`; withdrawn → `g-ink-3`; queue_new → ink dot + ink text; queue_review → `g-ink-3` text, no dot. Same hue for dot and text; no fills, no badges (`tokens.css:29`). Accepted is neutral; emerald starts at Referred (BRIEF.md:109).
- GoalMiniStepper (`my-asks.css:38-49`): four nodes joined by 8px×1px links; reached nodes 6px `g-ink-2`, upcoming 6px ring 1px `g-control-edge`; the node carrying the status is 8px in the status tone (referred `g-emerald`, expired `g-crimson`, withdrawn `g-ink-3`); links `g-ink-3`, upcoming links `g-control-edge` at 0.5 opacity; whole stepper `aria-hidden` (the label carries meaning).
- GoalStepper (My asks detail, `my-asks.css:64-79`): `<ol aria-label="Progress">` steps "Sent", "Under review", "Accepted", "Referred" (`content.json` `screenC.stepper.steps`), padding 16px 0 between top/bottom hairlines; nodes lucide 20px stroke 1.75: done `circle-check` ink, current `circle-dot` in the status tone with `aria-current="step"` and label 600 ink, upcoming `circle-dashed` `g-control-edge`, terminal `circle-x` crimson / `circle-minus` `g-ink-3`; connectors 1px (`g-ink-3` when done, `g-control-edge` at 0.5 otherwise), margin 0 12px. Seeker glyph set: Waiting `circle-dashed`, Under review `circle-ellipsis`, Accepted `circle-dot`, Referred `circle-check`, Expired `circle-x`, Withdrawn `circle-minus` (BRIEF.md:131; all exist in lucide-react 0.453.0).
- Do not reuse or edit `client/src/components/kit/status-pill.tsx` (kit; live).

### 4.9 GoalVerifiedMark — source: `shell.css:204-208`, `page-queue.mjs:35-36`, `page-find.mjs:60`, BRIEF.md:123,186
- Props: `children: string` (server-derived text, e.g. "Verified · {company}" or "Goes to verified {company} employees" — `content.json` `screenB.verifiedMark.label`, `screenA.askDrawer.verifiedLine.text`); `as?: "p" | "span"`.
- Rendering: flex, gap 6px, lucide `badge-check` 16px `aria-hidden`, text `text-g-meta`; icon and text both `g-trust` (#1d4ed8, 6.70:1 on white). This file is the ONLY place `g-trust` may appear (audit rule §6a). Trust blue is never used for focus, links, info, buttons or availability. Render it only when the server verdict says the person/company is verified — the parent decides; the primitive never computes trust.

### 4.10 GoalDrawer / GoalSheet — source: `find-a-referral.css:42-105,127-141`, `referral-queue.css:201-227`, `page-find.mjs:48-95`, BRIEF.md:275-280,725,751
- Built on `@radix-ui/react-dialog` (installed); never on `components/ui/sheet.tsx`/`drawer.tsx` (shadcn, `animate-in` classes without CSS) and never on `vaul` ("Vaul is unmaintained upstream, so avoid it", BRIEF.md:751).
- GoalDrawer props: `open`, `onOpenChange`, `title: string`, `context?: string`, `closeLabel: string` (e.g. "Close"), `children` (body), `footer: ReactNode` (cost line + actions).
- Desktop (≥641px, detect with `matchMedia("(min-width: 641px)")`): `modal={false}`, no Portal, rendered in GoalShell's `drawer` column, 480px wide, docked flush right under the top bar at full height (sticky `top: var(--g-topbar-h)`), radius 0, `shadow-g-drawer`, NO scrim — the list stays visible and the selected row stays lit (BRIEF.md:276). Header min-height 76px, padding `14px 12px 14px 24px`, bottom hairline, title `text-g-heading`, context `text-g-meta` `g-ink-2`, close `GoalIconButton` `x` 20px. Body padding 24px, gap 28px. Footer sticky at the bottom: padding `16px 24px 20px`, top hairline, cost line `text-g-label` ink + detail `text-g-meta` `g-ink-2`, actions row right-aligned gap 8px margin-top 16px (Save draft ghost | divider | Send ask primary with ⌘ + ↵ keycaps via lucide `command`/`corner-down-left`).
- Phone (≤640px): `modal`, Portal + overlay `bg-g-scrim`; full-height sheet with 8px top inset, top corners 12px, no shadow; grabber 32×4 `g-control-edge` radius 2px margin `8px auto 0`; header min-height 64px padding `4px 4px 12px 16px`; body padding `20px 16px` gap 24px; footer padding `16px 16px 20px`; actions grid `1fr 2fr` gap 8px with 48px buttons; the bottom bar hides while open.
- GoalSheet (phone medium sheet, e.g. pass reasons): Portal + overlay, `left/right/bottom: 0`, padding `8px 16px 20px`, top corners 12px, grabber 32×4 margin `0 auto 12px`, title `text-g-heading`, description `text-g-meta` `g-ink-2`.
- Motion: open `animate-g-drawer-in` (desktop, translateX) / `animate-g-sheet-in` (phone, translateY) 200ms ease-out; close `animate-g-*-out` 200ms ease-in on `data-[state=closed]`; overlay `animate-g-fade-in/out`; all instant under reduced motion.
- A11y: `Dialog.Title`/`Dialog.Description` wired (title + context); focus moves to the first field on open; Esc closes; focus returns to the trigger; content root carries `g-scope`. Closing keeps the draft (screen behaviour, BRIEF.md:725).
- States: the footer's primary handles busy ("Sending your ask…"); submit errors show in plain words above the actions (crimson allowed here only for input errors; seeker side); offline = primary `disabledReason`.

### 4.11 GoalStates (Empty / Error / Skeleton) and offline — source: `content.json` `otherStates` (`rendered: false`, "Live copy kept for the build phase. Not drawn in the three comps.")
- Copy available (live product copy, not sample data): queueEmpty "No asks right now." / "Enjoy the quiet."; asksEmpty "No asks yet." / "Pick a company, find a verified referrer, and write one great ask."; directoryNoResults "No matching companies yet" / "Try a wider search." / action "Clear filters"; directoryError "We couldn’t load companies." / "Try again"; asksError "We couldn’t load your asks" / "Your asks are still active and nothing was lost." / "Try again"; balanceError "Balance didn’t load" / "Retry". Primitives take all copy as props.
- Visual design is NOT in the comps (UNVERIFIED). Token-derived recommendation: left-aligned block in the column, padding `24px 20px` (`24px 16px` phone); title `text-g-label` ink; body `text-g-meta` `g-ink-2`; optional action `GoalButton` ghost `sm` (44px phone); no illustration, no icon required (media strategy "none", BRIEF.md:187); no black element (the screen's primary stays the only one).
- GoalEmptyState props: `title`, `body?`, `action?: { label; onClick | href }`. GoalErrorState props: `title`, `body?`, `retry: { label; onClick }`; container `role="alert"`; load errors are ink/ink-2, not crimson (crimson = ended states and input errors only).
- GoalSkeletonRows props: `density`, `count`; static blocks `bg-g-surface-hover` radius 4px at the exact row height; container `aria-busy="true"` + sr-only "Loading"; no shimmer/pulse (Frequency Principle, AGENTS.md:97-99).
- Offline: `useOnlineStatus()` (window `online`/`offline` events, same as `PwaStatus.tsx:40-46`); the app-wide banner already exists (`OfflineNotice`, `PwaStatus.tsx:39`, mounted via `App.tsx:14`), so primitives add no second banner — they only disable network actions with a reason.

## 5. Full draft of the new DESIGN.md (replace the whole file; keep the pointer on line 3)

Constraints verified: `scripts/briefContract.test.ts:15-18,31-34` requires `docs/BRIEF.md` within the first 8 lines of `DESIGN.md` (so NO YAML frontmatter, which would push it down); the impeccable design-system parser (`.github/skills/impeccable/scripts/lib/design-parser.mjs:12-21`) recognises eight canonical H2 sections — Overview, Colors, Typography, Layout, Elevation, Shapes, Components, "Do's and Don'ts" — so the draft uses those names (its CI job is advisory: `.github/workflows/design-gate.yml:22` `|| true`). Current file: 50 lines, Kit v4 contract, already marked superseded at `DESIGN.md:5`.

````markdown
# DESIGN.md — skipwait.me visual contract: goal UI (D-048, D-070, D-071)

> Start with [`docs/BRIEF.md`](docs/BRIEF.md) (D-073).

> Approved comps: `design/goal-ui/pick/` (D-071, Oct 18 2026, without the compensation row) — Find a referral with the ask drawer, Referral queue with the 7-reason pass picker, My asks, at 1280 and 390. Design brief: `design/goal-ui/BRIEF.md` (where it disagrees with `pick/`, the comps, D-070 and D-052 win). Tokens: the "D-048 phase 2" block at the end of `client/src/index.css`. Primitives: `client/src/components/goal/`.
> Rollout: phase 2 (this contract, tokens, primitives, token audit) changes no live surface. Phase 3 moves one surface at a time, each through the full gate with captures at 1280 and 390. Until a surface moves, it keeps its live Kit v4 tokens and components (`client/src/index.css` above the phase-2 block, `client/src/styles/kit.css`, `client/src/components/ui`, `client/src/components/kit`). Nobody re-skins a surface ad hoc.

## Overview
- Direction (D-070): Triage Desk's layout with Signal's type scale. Linear-quiet: dimmed chrome so content leads, a dense list then detail, one pinned decision bar on the referral queue. No "Seeking / Giving" mode switch.
- Compass (D-048): seekers send referral-worthy asks quickly; referrers decide with confidence; trust is visible; money is honest. Every non-visual decision stays binding: D-006/D-040 fairness, D-030 as amended by D-049/D-057, D-012(3), the money rules, "private until a referrer accepts", no public per-referrer metrics, no invented numbers, the lasting D-001 rules.
- Light mode only. White surfaces with hairlines.

### Binding rules (a change needs the owner)
1. **One primary action per screen.** Exactly one solid black element per screen, and it is the commit action (Send ask, Accept & connect, Ask for a referral). A screen without a commit action (a list) has none. Selected chips, tabs and nav items use tints and borders, never a black fill. The brand is a wordmark. The Pass confirm is an ink outline.
2. **Trust colour only on verified marks.** `#1d4ed8` (`g-trust`) appears only as lucide `badge-check` plus its text, rendered by `GoalVerifiedMark`, and only when the server verdict says verified. Never for focus, links, info, buttons or availability. Focus rings are ink.
3. **White surfaces with hairlines.** Canvas and surfaces `#ffffff`; `#fafafa` only for the rail, list headers and the locked panel; hairline `#ebebeb` only for dividers; control edges `#8a8a8a`. No elevation on page content.
4. **Mono numerals.** Every figure the product counts or computes (credits, counts, IDs, clocks, positions, dates) is JetBrains Mono 500 at 13px (`GoalNum`), whatever the line around it. Figures inside prose and text a person typed stay in Instrument Sans tabular figures; only their dates switch to mono.
5. **Status is a dot plus text, coloured by role.** 8px dot and label in the same hue; no fills or badges in rows. Amber: pending (Waiting, Under review) and clocks of 2 days or fewer. Ink: Accepted, New, availability. Emerald: Referred only. Crimson: ended states (Expired, a Passed event) and input errors only, and never in the referrer queue. Ink-3: Withdrawn, Under review on the referrer side. Accepting is not referring.
6. **No gradients, glassmorphism, glows, blurred shapes, decorative shadows or coloured row backgrounds.**
7. **Lucide icons only** (`lucide-react`). Keycaps are letters or lucide `command`, `corner-down-left`, `arrow-up`, `arrow-down`. No Unicode glyph icons, logos, photos or illustrations (companies show initials).
8. **Motion per AGENTS.md §0a.** Micro-interactions 100-150 ms (hover 100 ms); menus and popovers 150-250 ms (150 ms); drawers and sheets 200-300 ms (200 ms in and out); page transitions 300-400 ms (none used). Everything else stays under 300 ms. Things seen 100+ times a day (list moves, row selection) are instant. `prefers-reduced-motion` makes every animation instant.
9. **Sample data never ships.** The comps' names, numbers, refs, initials and file names (Fernhill Bank, Kestrel Pay, Larkspur Retail, Monsoon Analytics, Orbit Freight, Quillmint, Tidewell Health; R-8F3K2 and the other R- refs; Resume_Backend_2026.pdf) are review fixtures. Every number on screen comes from the server; no invented numbers; no preview chips.
10. **No compensation row or field** in the referral queue (D-071) until the owner decides it separately.
11. **No public per-referrer metrics:** no response rates, speeds, rankings, "fast responder" chips or filters, streaks, read receipts or referrer counts.
12. **Privacy and fairness.** Before acceptance a referrer sees the role, job function, job link, the three reasons, ask-quality checks, a day-level clock and a document count — never the seeker's name, file names, links, photo or plan. No message box, reply field or "request info" before acceptance. Referrers never see a seeker's plan. Nothing is sold as priority, ranking or visibility; a sponsored item is only a labelled "Featured listing" and never appears in asks or referrer queues.
13. **Honest money.** Money lines say what the code does (`shared/moneyCopy.ts`, D-063); never "free referrals". Referrer surfaces show no credits pill (referrers are never charged or paid, D-055). A balance that failed to load says so; it never shows 0.
14. **Day-level clocks only** ("2 days left", "Closes 20 Oct"). No hours, minutes or seconds; no "SLA", "respond within" or "act fast".
15. **Accessibility.** Text at least 4.5:1; large text, meaningful icons and control edges at least 3:1; targets at least 44px at 390; a visible ink focus ring on every interactive element; keycaps are hints, never the only label; keys open confirm steps and never commit (no shortcut while typing); disabled controls use `aria-disabled` and are never faded.
16. **One navigation.** Everyone: Find, My asks, Inbox. A verified referrer (server verdict) also gets Referral queue; Impact is reached from the queue header, so the rail and the phone bar keep at most four places. Everyone else gets a quiet "Give a referral" link ("Work email only") to work-email verification through `referrerSignInHref()`, never a toggle and never next to social sign-in. `/sign-in` keeps D-033's two role cards.
17. **Vocabulary:** Find a referral, Give a referral, Ask for a referral, Accept & connect, Pass privately, Send ask. Never "warm intro", "insider" or "intro request".

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
Availability: "Open to requests" = solid 8px ink dot + ink text; "Not open yet" = 8px ring (1.5px control edge) + ink-3 text. Validation passes are ink with lucide `check`.

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
````
