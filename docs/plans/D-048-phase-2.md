# Packet D-048 phase 2: the goal-UI design system exists in code (tokens, primitives, DESIGN.md, token audit), and no live screen changes

> Read `docs/BRIEF.md` first, then this packet. The exact token values, the primitive specs and the full `DESIGN.md` draft are in the spec appendix [`D-048-phase-2-spec.md`](D-048-phase-2-spec.md); open the section a step names.

| Field | Value |
|---|---|
| Queue row | `docs/KIT_V4_BUILD_PLAN.md` §3b `D-048` (phase 2) |
| Decisions | D-048, D-070, D-071, D-077 (design rulings), D-033, D-063; AGENTS.md animation rules (§0a) and "Styling and dependency boundary" |
| Risk tier | 2 (UI foundation; nothing user-visible changes) |
| Size | M (8 ordered steps) |
| Implementer | any model |
| Branch | `agent/<model>/d048-phase2-foundation` |
| Depends on | nothing; parallel-safe with P0, D-067, the seeker-password lane and D-069 |
| Verified against | `main` `e6b87f8` (comps in `design/goal-ui/pick/`) |

## Rulings this packet applies (D-077, decided under D-074; the owner may change them)
- **Drawer close:** 200 ms, not the comp's 150 ms (AGENTS.md §0a: drawers 200–300 ms).
- **Impact:** a quiet link in the referral-queue header, as the approved comps draw it. Navigation is Find, My asks, Inbox, plus Referral queue for a verified referrer; a non-referrer gets the quiet "Give a referral" link (D-070).
- **Status, queue position and mono face** follow the approved pick (D-071): Accepted is neutral (it is not a referral, D-038); the private "1 / 5" queue position is shown; JetBrains Mono is used for numerals.
- **Phase-3 questions answered now, so no later packet stalls:**
  - "why me" is stored as three lines in the existing note field (no schema change);
  - display references are non-sequential (`R-` plus a short code derived from the id with an HMAC, display only), because `Ref-{1000+id}` reveals volume;
  - production filter chips offer all ten job functions.

## Summary (read first)
1. Canonical values live in `design/goal-ui/pick/tokens.css` (comp prefix `--sw-*`); `design/goal-ui/BRIEF.md` §4 holds pre-pick numbers (rail 88, top bar 52, bar 64, 15px body) — never use those.
2. D-070 type scale VERIFIED in the comps: display 700 28/36 (-0.02em), body 400 16/24, label 600 14/20 (0.01em), mono JetBrains Mono 500 13/20; the comps add heading 600 20/28, meta 500 13/20, badge 500 12/16, phone row 600 16/24.
3. Colours: white canvas/surfaces, sunken #FAFAFA, hover/selected #F4F4F5, ink #0A0A0A/#52525B/#6B6B73, hairline #EBEBEB (dividers only), control edge #8A8A8A, primary = ink, trust #1D4ED8 (verified marks only), emerald #047857 (Referred), amber #B45309 (pending, clocks ≤2 days), crimson #B91C1C (ended, input errors, never in the referrer queue).
4. Collisions: `--sw-*` already exists with different values in the dead `client/src/styles/globals.css`; Tailwind names `ink`, `primary`, `border`, `ring`, `muted`, `rounded-sm..4xl` (24px-based) and `font-mono` (IBM Plex Mono) are taken in `index.css:22-79`. Use `--g-*` + `g-` theme names; delete globals.css.
5. Critical gotcha: index.css and kit.css rules are UNLAYERED, so they beat Tailwind utilities (blue focus outline, h1/h2 weight 600, h1-h3/p letter-spacing 0, blue caret, `button:disabled` grey `!important`). Phase 2 adds a `.g-scope` neutraliser (`revert-layer`) and goal buttons use `aria-disabled`, never `disabled`.
6. Strategy: append one block to the end of `client/src/index.css` (`@theme inline` g- entries, `:root` `--g-*`, keyframes, `.g-scope`, `.g-num`, `.g-hit`); primitives in `client/src/components/goal/` (Goal-prefixed names) imported by nothing live; Tailwind 4.1.14 `--text-*--font-weight` and custom `--breakpoint-gdesk` (641px) support VERIFIED in its source.
7. Comps vs D-070: Impact is a quiet link in the referral-queue header, not a nav item (nav = Find, My asks, Inbox [+ Queue]); drawer-out is 150ms in the comp vs 200-300ms in AGENTS.md §0a → use 200ms.
8. No new dependency anywhere (fonts, all 22 comp icons + status glyphs in lucide-react 0.453.0, Radix dialog/popover/slot, testing-library, Playwright all installed; avoid vaul).
9. Gallery: no new route — a new `<Route path>` must also go into `functions/_middleware.ts` KNOWN_ROUTE_PATTERNS (`scripts/seoRouteCoverage.test.ts`), which makes production answer 200; reuse the existing DEV-only `/components` page via `#goal-ui`.
10. Audit: keep live-file results identical (314 files / 1202 approved / 3 third-party today); add goal-scope rules (no colour literals, `g-trust` only in GoalVerifiedMark, status hues only in goal primitives, no kit/shadcn tokens, no comp sample names anywhere, token drift vs tokens.css, only two CSS files).

## 0. Governing rules (verified)

- `docs/BRIEF.md:24` — "**Design (D-048, D-070, D-071).** Approved comps: `design/goal-ui/pick/`. Until a screen is moved over, keep its tokens and components; never re-skin ad hoc."
- `docs/BRIEF.md:33` — lane order (D-072): D-048 phase 2 is lane 4, after D-067, seeker passwords, D-069. `AGENTS.md:38-43` same ("Handoff now", item 4).
- `docs/BRIEF.md:38` — "No new dependency without the owner." Gate at `docs/BRIEF.md:39`: `pnpm check`; `node scripts/design-token-audit.mjs`; `bash scripts/lint-deploy-migrations.sh`; `node scripts/check-deploy-triggers.mjs`; `LANG=en_US.UTF-8 pnpm vitest run`; `pnpm build`. `docs/BRIEF.md:40`: web changes must serve `<meta name="git-commit">` with the SHA; "affected screens get checked at 1280 and 390".
- `docs/BRIEF.md:21` — "No public per-referrer metrics, invented numbers, sample data, dark patterns, false urgency or pressure on referrers."
- `docs/BRIEF.md:29` — "Every change updates every affected markdown file in the same push (D-068)." `docs/BRIEF.md:32` — claim the §3b row with a docs-only push to `main` before code (Claude Code under D-058 may claim in the same push).
- D-048 `docs/DECISIONS.md:64` — Kinetic starting point: "one primary action per screen, a trust colour used only for verified marks, status colours, white surfaces with hairlines, mono numerals, a compact shell"; "no public per-referrer metrics, no invented numbers, lucide icons"; "Kept from D-001: no preview chips or sample data in the product; Terms/Privacy keep live legal text." Affects: `AGENTS.md` (styling boundary), `FOR_AI_BUILDERS.md` (navigation marked "do not change"), `scripts/design-token-audit.mjs`, `client/src/styles/kit.css` and every client surface.
- D-070 `docs/DECISIONS.md:86` — "Triage Desk direction (Linear-quiet, dense list plus detail, one pinned decision bar on the referral queue)"; type: "Instrument Sans 700 28/36 titles, 16/24 body, 600 14/20 labels, JetBrains Mono 13/20 numerals; same installed fonts"; nav: "everyone: Find, My asks, Inbox; a verified referrer also gets Referral queue and Impact; a non-referrer gets a quiet "Give a referral" link that leads to work-email verification"; "keeps D-033's sign-in role cards".
- D-071 `docs/DECISIONS.md:87` — approved comps = "Find a referral with the ask drawer, Referral queue with the 7-reason pass picker, My asks; 1280 and 390"; "The referral queue shows no compensation field"; "phase 2 — a goal-focused `DESIGN.md`, tokens in `client/src/index.css`, shared primitives and the token audit; phase 3 — surface by surface, each through the full gate with captures at 1280 and 390"; "the comps' sample names and numbers never ship".
- D-033 `docs/DECISIONS.md:49` — /sign-in keeps two large selectable role cards ("Find a referral" / "Give a referral": title + one-line who-it-is-for, strong selected border, check mark, switchable). Phase 2 must not touch /sign-in.
- D-006 `docs/DECISIONS.md:25` / D-040 `docs/DECISIONS.md:56` — no sold priority/visibility/ranking of people; "referrers never see a seeker's plan"; sponsored items only as a labeled "Featured listing", never in asks or referrer inboxes. Design consequence: no plan badge on any queue row/detail; no "boost"/"priority" UI.
- D-063 `docs/DECISIONS.md:79` — money sentence lives in `shared/moneyCopy.ts`: "3 asks free every month; more use credits. Referrers are never paid and never ask you for money." Never "free" alone.
- `AGENTS.md:88-99` — animation guidelines (verbatim): micro-interactions 100-150ms; standard UI (tooltips, dropdowns) 150-250ms; modals, drawers 200-300ms; page transitions 300-400ms; "Rule: UI animations should stay under 300ms."; Frequency Principle: 100+ times/day → no animation (or drastically reduced); occasional → standard; rare/first-time → can add delight.
- `AGENTS.md:442-462` "Styling and dependency boundary" — line 443 marks the section "Superseded in part by D-048"; lines 444-451 still describe Kit v4 (ink `#141414`, electric blue `#0000FF`, invitation yellow `#FFFC52`; Instrument Sans UI, IBM Plex Mono labels; oklch tokens in `client/src/index.css`); lines 452-456 prohibited UI: "gradients (except the single work-thumbnail tint blend), glassmorphism, neon/glow decoration, blurred orbs, cream/brown/terracotta colors, condensed uppercase headings, Unicode glyph icons, nested cards, decorative kickers, faded disabled controls, and ad-hoc colors outside `DESIGN.md`"; 457-462 no new runtime dependency without written reason + lockfile review.
- `AGENTS.md:403-429` — 21st.dev/shadcn material is reviewed input only; never run remote `add` into the tree.
- `docs/KIT_V4_BUILD_PLAN.md:89` — §3b row D-048: status "phase 1 done — Claude Code (Opus 5.5) — 2026-10-18 — approved by D-071; phase 2 (goal-focused `DESIGN.md`, tokens in `client/src/index.css`, primitives, token audit) is next, then phase 3 surface by surface"; "referrer screens wait for P0-pre-accept-privacy" (phase 3 concern). Queue rule 4 `docs/KIT_V4_BUILD_PLAN.md:60` (claim before coding); rule 5 `:61` (definition of done incl. 1280/390); rule 7 `:63` (never ship preview scaffolding).

## 2. Name-collision check (index.css, kit.css, dead globals.css, Tailwind theme)

### 2a. The comp prefix `--sw-*` collides with the dead stylesheet
- `client/src/index.css` and `client/src/styles/kit.css` define NO `--sw-*`, `--g-*` or `--goal-*` property (grep: 0 hits).
- `client/src/styles/globals.css` (dead, imported by nothing) defines `--sw-*` with DIFFERENT values, e.g. `globals.css:7 --sw-canvas: #f8fafc` (comp `#FFFFFF`), `:9 --sw-surface-sunken: #f1f5f9` (comp `#FAFAFA`), `:12 --sw-surface-selected: #e2e8f0` (comp `#F4F4F5`), `:13 --sw-scrim: rgb(9 9 11 / 0.32)` (comp `rgb(10 10 10 / 0.24)`), `:14 --sw-ink: #09090b` (comp `#0A0A0A`), `:20 --sw-hairline: #e2e8f0` (comp `#EBEBEB`), `:26 --sw-focus-ring: #09090b` (comp is a box-shadow), plus names the comp does not have (`--sw-ink-body`, `--sw-action*`, `--sw-hairline-strong`). No runtime collision today, but a grep for `--sw-canvas` returns two conflicting definitions and anyone re-importing globals.css would silently repaint. => Do not ship `--sw-*` in the product; use a fresh prefix, and delete `globals.css` in the phase-2 token commit (it is dead; verify with `grep -rn "globals.css" client/ vite.config.ts` = 0 hits before deleting).

### 2b. Tailwind theme names already taken (`client/src/index.css:22-79`, `@theme inline`)
- Colours: shadcn set `--color-{background,foreground,card,card-foreground,popover,popover-foreground,primary,primary-foreground,secondary,secondary-foreground,muted,muted-foreground,accent,accent-foreground,destructive,destructive-foreground,border,input,ring,ring-offset-background,chart-1..5,sidebar,sidebar-*}` (34-66) and transitional kit aliases `--color-ink: #000000` (68), `--color-ink-soft: #1a1a1a` (69), `--color-coal: #121212` (70), `--color-paper: #ffffff` (71), `--color-signal: #0000ff` (72), `--color-signal-tint: #ededff` (73), `--color-signal-line: #c2c2ff` (74), `--color-fog: #505050` (75), `--color-faint: #767676` (76), `--color-line: #e5e5e5` (77).
  - Direct collisions with natural comp names: `ink` (comp `#0A0A0A` vs live `#000000`), `primary` (comp ink-black vs live blue `oklch(0.452 0.313 264.05)` at 89), `border`, `muted`, `accent`, `ring`, `card`, `popover`, `background`, `foreground`, `destructive`. Redefining any of them repaints live surfaces => forbidden in phase 2.
- Radius: `--radius-sm|md|lg|xl|2xl|3xl|4xl` (23-29) derive from `--radius: 1.5rem` (78, and `:root` 82) => `rounded-sm` = 20px, `rounded-md` = 22px, `rounded-lg` = 24px. The comp's 4/6/8/12px radii cannot use these names.
- Fonts: `--font-sans|serif|display` = Instrument Sans (30-32); `--font-mono: "IBM Plex Mono", ui-monospace, monospace` (33) => Tailwind `font-mono` is IBM Plex Mono, NOT the comp's JetBrains Mono. A goal mono font entry is required.
- Not defined in index.css (Tailwind v4 defaults remain): `--text-*`, `--leading-*`, `--tracking-*`, `--shadow-*`, `--ease-*`, `--animate-*`, `--breakpoint-*`, `--spacing`. Default `--spacing` (0.25rem) already matches the comp 4px scale (§1c).
- `:root` non-theme vars (index.css:81-115, 158-163; kit.css:8): `--radius`, shadcn raw vars, `--font-ui`, `--font-label` (IBM Plex Mono), `--shadow-offset`, `--success` — none share a name with a `--g-*` proposal.

### 2c. Class-name collisions (if any plain CSS classes are added)
- kit.css (unlayered, 278 lines) has selectors `.eyebrow` (5 hits) and `.is-selected` (2 hits) that also appear in the comps (`referral-queue.css:61`, `shell.css:216-221`). The other comp class names checked (`app rail topbar bottombar btn chip dot mark avatar credits drawer sheet input link label meta verified search field file reason summary give icon kbd mono sep hit stepper step history locked decision props why quality pos cost tone-* only-phone only-desktop sr-only display tnum`) have no `.<name>` selector in kit.css; index.css itself defines `.display` (207), `.tnum` (170), `.app-topbar`, `.topbar-actions`, `.brand-button`, `.status-*`, `.app-dialog`. => Port comps to React with Tailwind utilities, not the comps' class names; any helper class added to CSS gets a `g-` prefix.

### 2d. Unlayered global rules that WILL leak into new primitives (critical gotcha)
Tailwind v4 utilities live in `@layer utilities`; `index.css:158-196` and all of kit.css are UNLAYERED, and unlayered normal declarations beat layered ones regardless of specificity (index.css:232 comment confirms: "Tailwind bg/text utilities lose to the unlayered .brand-button background"). Rules that would override goal utilities:
| Rule | Where | Effect on a goal primitive | Neutraliser in phase 2 |
|---|---|---|---|
| `button:focus-visible, a:focus-visible, select:focus-visible, input:focus-visible { outline: 3px solid var(--primary); outline-offset: 4px; }` | `index.css:173`, duplicated `kit.css:9` | blue 3px outline on focus (comp: ink box-shadow ring, never blue — `shell.css:55-56`) | scoped unlayered rule `.g-scope :is(a,button,input,textarea,select,[tabindex]):focus-visible { outline: none; box-shadow: var(--g-focus-ring); }` (specificity 0,2,1 beats 0,1,1) |
| `button:disabled:not(.brand-button) { opacity:1 !important; background-color:#e0e0e0 !important; color:#505050 !important }` and `… svg { color:#505050 !important }` | `index.css:178-179` (pinned by `client/src/kitCssOverrides.test.ts:13-14`) | grey block on any natively `disabled` button | goal Button uses `aria-disabled="true"` (comp `shell.css:169`) and never the `disabled` attribute; do NOT edit lines 178-179 (test pins them) |
| `h1, h2, h3, p { letter-spacing: 0; }` | `index.css:167`, `kit.css:9` | kills display/heading tracking (-0.02em/-0.01em) on h1-h3/p | scoped classes `.g-scope .g-type-display` etc. (class selector 0,2,0 beats element) or apply tracking via scoped CSS |
| `h1, h2 { font-family: var(--font-ui); font-weight: 600; }` | `index.css:168` | display title 700 would render 600 on h1/h2 | same scoped type classes set `font-weight` |
| `body { … font-family: var(--font-ui); letter-spacing: 0 }` | `index.css:166`, `kit.css:9` | harmless (same face) | none |
| `input, textarea { caret-color: var(--primary); }` | `index.css:182` | blue caret (comp caret is ink, `find-a-referral.css:95`) | `.g-scope :is(input,textarea) { caret-color: var(--g-ink); }` |
| `@media (prefers-reduced-motion: no-preference) { button, a { transition-timing-function: cubic-bezier(0.23, 1, 0.32, 1); } }` | `index.css:186` | overrides `ease-*` utilities on buttons/links | scoped rule sets `transition-timing-function: var(--g-ease-out)` |
| `::selection { background: #fffc52; color: #000000; }` | `index.css:181` | yellow text selection inside goal screens | out of scope for phase 2 (comps do not specify selection) — UNVERIFIED whether the owner wants it changed; leave |
| `@media (prefers-reduced-motion: reduce) { *, … { animation-duration: .01ms !important; transition-duration: .01ms !important } }` | `index.css:196`, `kit.css:57` | already matches comp reduced-motion intent | none |
| `@supports (-webkit-touch-callout:none){@media(max-width:768px){input…,select,textarea{font-size:16px!important;}}}` | `index.css:240` | none (goal inputs are 16px) | none |
| `@layer base { * { border-color: var(--color-border); } }` | `index.css:147-150` | layered, so `border-g-*` utilities win | none |

## 3. Coexistence strategy (phase 2 changes nothing visible)

### 3a. Recommended: additive, namespaced `--g-*` layer + `g-` Tailwind theme entries + a new `components/goal/` folder nobody imports yet
Facts it relies on: `client/src/main.tsx:13` imports `./index.css` (the only app stylesheet entry); Tailwind is v4.1.14 (`node_modules/tailwindcss/package.json`); index.css already uses the `@theme inline { --color-x: var(--x) }` mapping pattern (`index.css:22-66`); tests that read index.css only assert strings that stay untouched (`client/src/kitCssOverrides.test.ts:13-15,20,25`; `server/mobilePwaAudit.test.ts:27-29` — "overscroll-behavior-y: contain", "touch-action: manipulation", "focus-visible"); `client/src/components/goal/` does not exist; no goal/sample string exists in `client/src`, `shared`, `server` today.

Exact file layout:
```
client/src/index.css                      # APPEND one delimited block after line 244; lines 1-244 unchanged
client/src/styles/globals.css             # DELETE (dead; its --sw-* values conflict with the comps)
client/src/components/goal/
  index.ts                                # barrel: re-exports the primitives below (named exports only)
  nav.ts                                  # GOAL_NAV items + goalNavFor(verifiedReferrer) (pure, unit-tested)
  GoalShell.tsx                           # rail + top bar + phone bottom bar + "Give a referral" link
  GoalButton.tsx                          # primary | ghost | outline; md | sm | xs; keys; busy; aria-disabled
  GoalKeycap.tsx                          # keycap hint (letter or lucide icon), aria-hidden, desktop only
  GoalNum.tsx                             # mono numeral span (port of shell.css .mono)
  GoalIconButton.tsx                      # 36px (44px phone) icon button with required aria-label
  GoalSearchInput.tsx                     # search field with leading lucide search icon
  GoalField.tsx                           # label + control + help/hint/error (TextInput inside)
  GoalFilterChip.tsx                      # aria-pressed chip (Find filters)
  GoalListRow.tsx                         # selectable row (company | queue | ask densities) + GoalListSection
  GoalDetailPane.tsx                      # opened item: eyebrow/ref/title/meta/sections/props/dock + phone sub-header
  GoalLockedPanel.tsx                     # pre-accept "identity locked" panel with document count
  GoalDecisionBar.tsx                     # pinned bar: position control + Pass privately + Accept & connect
  GoalPassReasons.tsx                     # 7-reason picker body (popover on desktop, sheet on phone) from shared/passReasons.ts
  GoalStatus.tsx                          # dot + text status label (+ GoalMiniStepper, GoalStepper)
  GoalVerifiedMark.tsx                    # badge-check + text in trust blue (the ONLY user of g-trust)
  GoalDrawer.tsx                          # Radix Dialog: 480px docked drawer (desktop) / full-height sheet (phone)
  GoalSheet.tsx                           # Radix Dialog: medium phone sheet (pass reasons)
  GoalStates.tsx                          # GoalEmptyState, GoalErrorState, GoalSkeletonRows
  useOnlineStatus.ts                      # online/offline hook (same events as PwaStatus.tsx:40-46)
  goal.test.tsx                           # primitive behaviour tests (jsdom) — may be split per primitive
  goalBoundary.test.ts                    # node: nothing outside the allowlist imports components/goal; sample-name guard; token sync
client/src/components/goal/dev/GoalGallery.tsx  # dev-only gallery component (inside goal scope, so audited); no route of its own
client/src/pages/ComponentShowcase.tsx    # existing DEV-only page at /components (App.tsx:90,112): early-return <GoalGallery/> when location.hash is "#goal-ui"
# NOT touched: client/src/App.tsx and functions/_middleware.ts (a new <Route path> must also be added to KNOWN_ROUTE_PATTERNS, scripts/seoRouteCoverage.test.ts:23-41, which makes production answer 200 — i.e. a new production route)
scripts/design-token-audit.mjs            # extended rules (§6a)
scripts/designTokenAudit.test.ts          # new: audit fixtures (pass/fail cases)
DESIGN.md                                 # replaced by the goal contract (§5)
docs/DECISIONS.md, docs/KIT_V4_BUILD_PLAN.md, AGENTS.md, docs/BRIEF.md (+FOR_AI_BUILDERS.md if it still says "do not change" nav) # D-068 sync
```
Component names carry a `Goal` prefix because `Button` (kit `components/kit/button.tsx` + shadcn `components/ui/button.tsx`), `StatusPill` (`components/kit/status-pill.tsx`), `Drawer`/`Sheet`/`Skeleton`/`Empty`/`Kbd`/`Field`/`Input` (`components/ui/*.tsx`) already exist; prefixing removes auto-import mistakes.

The index.css block (append after line 244; values from `pick/tokens.css`, hex lower-cased to match `index.css:68-77`):
```css
/* ===== D-048 phase 2 · goal-UI tokens (approved comps: design/goal-ui/pick/tokens.css, D-071) =====
   Additive only: no live surface uses --g-* / g-* until its phase-3 move. Light mode only (no .dark values). */
@theme inline {
  --color-g-canvas: var(--g-canvas);            --color-g-surface: var(--g-surface);
  --color-g-surface-sunken: var(--g-surface-sunken); --color-g-surface-hover: var(--g-surface-hover);
  --color-g-surface-selected: var(--g-surface-selected); --color-g-scrim: var(--g-scrim);
  --color-g-ink: var(--g-ink); --color-g-ink-2: var(--g-ink-2); --color-g-ink-3: var(--g-ink-3); --color-g-ink-inverse: var(--g-ink-inverse);
  --color-g-hairline: var(--g-hairline); --color-g-control-edge: var(--g-control-edge);
  --color-g-primary: var(--g-primary); --color-g-primary-hover: var(--g-primary-hover); --color-g-primary-pressed: var(--g-primary-pressed);
  --color-g-on-primary: var(--g-on-primary); --color-g-on-primary-edge: var(--g-on-primary-edge);
  --color-g-trust: var(--g-trust); --color-g-emerald: var(--g-emerald); --color-g-amber: var(--g-amber); --color-g-crimson: var(--g-crimson);
  --font-g-sans: var(--g-font-sans); --font-g-mono: var(--g-font-mono);
  --text-g-display: 28px; --text-g-display--line-height: 36px; --text-g-display--font-weight: 700; --text-g-display--letter-spacing: -0.02em;
  --text-g-heading: 20px; --text-g-heading--line-height: 28px; --text-g-heading--font-weight: 600; --text-g-heading--letter-spacing: -0.01em;
  --text-g-body: 16px; --text-g-body--line-height: 24px; --text-g-body--font-weight: 400; --text-g-body--letter-spacing: 0;
  --text-g-label: 14px; --text-g-label--line-height: 20px; --text-g-label--font-weight: 600; --text-g-label--letter-spacing: 0.01em;
  --text-g-meta: 13px; --text-g-meta--line-height: 20px; --text-g-meta--font-weight: 500; --text-g-meta--letter-spacing: 0.01em;
  --text-g-badge: 12px; --text-g-badge--line-height: 16px; --text-g-badge--font-weight: 500; --text-g-badge--letter-spacing: 0.02em;
  --text-g-mono: 13px; --text-g-mono--line-height: 20px; --text-g-mono--font-weight: 500; --text-g-mono--letter-spacing: 0;
  --text-g-row-phone: 16px; --text-g-row-phone--line-height: 24px; --text-g-row-phone--font-weight: 600; --text-g-row-phone--letter-spacing: 0;
  --radius-g-keycap: 4px; --radius-g-control: 6px; --radius-g-tile: 8px; --radius-g-popover: 12px; --radius-g-sheet: 12px;
  --shadow-g-popover: var(--g-shadow-popover); --shadow-g-drawer: var(--g-shadow-drawer); --shadow-g-focus: var(--g-focus-ring);
  --ease-g-out: cubic-bezier(0, 0, 0.2, 1); --ease-g-in: cubic-bezier(0.4, 0, 1, 1);
  --breakpoint-gdesk: 40.0625rem;   /* = 641px. gdesk: = (width >= 641px) desktop; max-gdesk: = (width < 641px) phone — matches shell.css:52-53; rem keeps Tailwind's breakpoint units consistent */
  --animate-g-drawer-in: g-drawer-in var(--g-dur-drawer-in) var(--g-ease-out) both;
  --animate-g-drawer-out: g-drawer-out var(--g-dur-drawer-out) var(--g-ease-in) both;
  --animate-g-sheet-in: g-sheet-in var(--g-dur-drawer-in) var(--g-ease-out) both;
  --animate-g-sheet-out: g-sheet-out var(--g-dur-drawer-out) var(--g-ease-in) both;
  --animate-g-fade-in: g-fade-in var(--g-dur-menu) var(--g-ease-out) both;
  --animate-g-fade-out: g-fade-out var(--g-dur-menu) var(--g-ease-in) both;
}
@keyframes g-drawer-in { from { transform: translateX(100%); } to { transform: none; } }
@keyframes g-drawer-out { from { transform: none; } to { transform: translateX(100%); } }
@keyframes g-sheet-in { from { transform: translateY(100%); } to { transform: none; } }
@keyframes g-sheet-out { from { transform: none; } to { transform: translateY(100%); } }
@keyframes g-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes g-fade-out { from { opacity: 1; } to { opacity: 0; } }
:root {
  --g-canvas: #ffffff; --g-surface: #ffffff; --g-surface-sunken: #fafafa; --g-surface-hover: #f4f4f5; --g-surface-selected: #f4f4f5;
  --g-scrim: rgb(10 10 10 / 0.24);
  --g-ink: #0a0a0a; --g-ink-2: #52525b; --g-ink-3: #6b6b73; --g-ink-inverse: #ffffff;
  --g-hairline: #ebebeb; --g-control-edge: #8a8a8a;
  --g-primary: #0a0a0a; --g-primary-hover: #262626; --g-primary-pressed: #404040; --g-on-primary: #ffffff; --g-on-primary-edge: rgb(255 255 255 / 0.4);
  --g-trust: #1d4ed8; --g-emerald: #047857; --g-amber: #b45309; --g-crimson: #b91c1c;
  --g-dot: 8px;
  --g-font-sans: "Instrument Sans", system-ui, sans-serif; --g-font-mono: "JetBrains Mono", ui-monospace, monospace;
  --g-shadow-popover: 0 0 0 1px rgb(0 0 0 / 0.08), 0 1px 1px rgb(0 0 0 / 0.02), 0 4px 8px -4px rgb(0 0 0 / 0.04), 0 16px 24px -8px rgb(0 0 0 / 0.06);
  --g-shadow-drawer: -1px 0 0 var(--g-hairline), -16px 0 32px -24px rgb(0 0 0 / 0.16);
  --g-focus-ring: 0 0 0 2px var(--g-surface), 0 0 0 4px var(--g-ink);
  --g-dur-list: 0ms; --g-dur-hover: 100ms; --g-dur-menu: 150ms; --g-dur-drawer-in: 200ms; --g-dur-drawer-out: 200ms; /* comp tokens.css:72 says 150ms; 200ms keeps AGENTS.md:93 */
  --g-ease-out: cubic-bezier(0, 0, 0.2, 1); --g-ease-in: cubic-bezier(0.4, 0, 1, 1);
  --g-rail-w: 104px; --g-rail-tile-w: 88px; --g-rail-tile-h: 56px; --g-topbar-h: 56px; --g-bottombar-h: 56px;
  --g-drawer-w: 480px; --g-list-w: 360px; --g-detail-max: 680px; --g-asks-list-w: 440px;
  --g-decision-bar-h: 72px; --g-subheader-h-phone: 48px; --g-control-h: 40px; --g-control-h-phone: 48px; --g-touch: 44px;
}
@media (prefers-reduced-motion: reduce) { :root { --g-dur-hover: 0ms; --g-dur-menu: 0ms; --g-dur-drawer-in: 0ms; --g-dur-drawer-out: 0ms; } }

/* Scope: neutralise the unlayered kit/global rules (index.css:167-168,173,182,186; kit.css:9) inside goal UI only.
   Applied by GoalShell's root and by every portalled goal surface (drawer, sheet, popover content) and the dev gallery. */
.g-scope { color-scheme: light; font-family: var(--g-font-sans); font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; }
.g-scope :is(h1, h2, h3, h4, p) { font-family: revert-layer; font-weight: revert-layer; letter-spacing: revert-layer; }
.g-scope :is(a, button, input, textarea, select, summary, [tabindex]):focus-visible { outline: none; box-shadow: var(--g-focus-ring); }
.g-scope .g-focus-inner:focus-visible { box-shadow: none; }          /* only for a field drawn inside a card that rings via :focus-within (find-a-referral.css:91,94). Same specificity (0,3,0) as the rule above, so it MUST stay after it. */
.g-scope :is(input, textarea) { caret-color: var(--g-ink); }
.g-scope :is(a, button) { transition-timing-function: revert-layer; }
.g-num { font-family: var(--g-font-mono); font-weight: 500; font-size: min(1em, 13px); letter-spacing: 0; word-spacing: -0.2em; white-space: nowrap; font-variant-numeric: tabular-nums; font-variant-ligatures: none; }
.g-hit { position: relative; }
.g-hit::after { content: ""; position: absolute; left: 50%; top: 50%; width: max(100%, var(--g-touch)); height: max(100%, var(--g-touch)); transform: translate(-50%, -50%); }
```
Notes for the implementer:
- Why `revert-layer`: Tailwind utilities are layered, the kit/global element rules are not, so `h1 { font-weight: 600 }` (index.css:168) beats `text-g-display`'s 700 and `h1,h2,h3,p { letter-spacing: 0 }` (index.css:167, kit.css:9) beats every tracking value. An unlayered `.g-scope` rule with higher specificity that says `revert-layer` hands those properties back to the utilities. Browser support: evergreen since 2022.
- VERIFIED in the installed Tailwind 4.1.14 source (`node_modules/tailwindcss/dist/lib.js`): the `text-*` utility resolves `--text-<name>` with the sub-properties `--line-height`, `--letter-spacing`, `--font-weight` (emitting `letter-spacing: var(--tw-tracking, …)` and the font weight), and every `--breakpoint-<name>` key creates a `<name>:` variant `@media (width >= value)` plus `max-<name>:` `@media (width < value)` (values containing `var(` are ignored). Caveat: each breakpoint also adds a step to Tailwind's `container` utility; the only users of `container` are `client/src/pages/ComponentShowcase.tsx:231,1436` (dev-only), so no live change — never use `container` in goal UI. Still confirm after commit 3 by grepping the built CSS for `.text-g-display` and `width>=40.0625rem`.
- Tailwind v4 CSS-variable shorthand for layout sizes: `w-(--g-rail-w)`, `h-(--g-topbar-h)`, `max-w-(--g-detail-max)`, `duration-(--g-dur-hover)` (no hex, so the audit passes).
- Do not use Tailwind `sm:` for the goal breakpoint: `sm` = width >= 640px (Tailwind default) so at exactly 640px it disagrees with the comp (`shell.css:52-53`).
- Do not use `rounded-sm|md|lg|xl` (20/22/24/28px from `--radius: 1.5rem`, index.css:23-29,78), `font-mono` (IBM Plex Mono, index.css:33), `text-ink`/`bg-paper`/`text-signal`/`border-line` (kit aliases index.css:68-77), `bg-primary`/`border-border`/`ring-ring` (shadcn, blue) inside goal primitives.
- Radix Dialog's Presence waits for CSS `animation` (not `transition`) before unmounting, so drawer/sheet exit motion must use the `animate-g-*-out` keyframes above on `data-[state=closed]:`; never the shadcn `animate-in`/`animate-out` classes (no CSS exists for them: tw-animate-css is never imported).
- Reduced motion is covered twice: the `:root` override above and the existing global `index.css:196` (`animation-duration/transition-duration: .01ms !important`).

What stays byte-identical in phase 2: `index.css:1-244`, all of `kit.css`, `components/ui/*`, `components/kit/*`, `components/AppShell.tsx`, every page. Only additions: the appended block, the new folder, the DEV-only gallery route, the audit/test changes and docs. Visual proof: before/after captures of live routes are identical (§6c).

### 3b. Alternative evaluated and rejected: re-point the existing shadcn/kit variables inside a scope (e.g. `.goal { --primary: #0a0a0a; --border: #ebebeb; --radius: 0.375rem; --font-mono: JetBrains Mono }`) so `components/ui` and `components/kit` adopt the new look under a wrapper class
Why not:
1. It does not produce the comps: kit shapes are hard-coded, not variable-driven (`kit.css:10` `.brand-button{border-radius:18px;min-height:46px;border:2px solid var(--foreground);box-shadow:var(--shadow-offset)}`), so scoped variables give kit/comp hybrids.
2. One `--radius` drives the whole `rounded-sm..4xl` scale (`index.css:23-29`) used by the 53 shadcn files; changing it under a wrapper silently re-shapes every component placed inside — the ad-hoc re-skin `docs/BRIEF.md:24` forbids ("never re-skin ad hoc").
3. `--primary` is also the global focus outline and caret (`index.css:173,182`; `kit.css:9`). Making it ink in one scope and blue elsewhere makes "blue" depend on DOM ancestry, while the goal rule is that blue means "work email verified" and nothing else (`shell.css:55`, BRIEF.md:123).
4. A single misplaced ancestor class (or a portal rendering outside it) flips live surfaces between systems, and the token audit cannot tell which system a utility belongs to.
5. It couples phase 3 to shadcn internals (and their missing `animate-in` CSS) instead of the approved anatomy.
Also rejected: (a) copying `pick/tokens.css` verbatim with its `--sw-*` names — conflicts with dead `globals.css` values (§2a) and implies a live brand token; (b) a separate imported `styles/goal.css` — workable, but D-071 (`docs/DECISIONS.md:87`) literally says "tokens in `client/src/index.css`", and one file keeps the scope rules next to the globals they neutralise.

## 6. Token-audit update rules and verification plan

### 6a. `scripts/design-token-audit.mjs` after phase 2
Baseline today (run at e6b87f8): `design-token-audit: 314 files · 1202 approved tokens · 3 third-party brand tokens` / "OK — no legacy or off-brand hexes in the client surface." Mechanics (`scripts/design-token-audit.mjs`): roots `client/src` (25); excludes `client/src/pages/Home.tsx` and the dev-only `client/src/pages/ComponentShowcase.tsx` (28-31); scans `.ts/.tsx` but not `*.test.ts(x)` (63); only Tailwind arbitrary hex tokens `[a-z-]*\[#hex\](/nn)?` (80); APPROVED = 21 hexes (42-50) incl. `#b45309`, `#b91c1c` (49); THIRD_PARTY `#25d366`, `#229ed9`, `#0a66c2` (53); exit 1 on any finding (94-96). Runs in CI `check` job (`.github/workflows/ci.yml:33-34`) and in the BRIEF gate (`docs/BRIEF.md:39`). The header comment (7-10) still calls the palette "Moving Parts" — stale; rewrite it to point at the goal DESIGN.md and the Kit v4 migration union.
Quoted hex already exists in live files (`StatusBadge.tsx`, `RequestStatusTimeline.tsx`, `ui/chart.tsx`, `EmployerBilling.tsx` — 9 hits), so any quoted-hex/CSS rule must be scoped to goal files or CI goes red. `client/src` holds exactly three CSS files: `index.css`, `styles/kit.css`, `styles/globals.css` (dead).

Refactor first (testability): move the scan into an exported pure function (e.g. `scripts/designTokenAuditCore.mjs`: `auditFiles(files: { path, source }[], opts) => findings[]`) and keep the CLI wrapper output format; add `scripts/designTokenAudit.test.ts` (vitest includes `scripts/**/*.test.ts`, `vitest.config.ts:32`).

Must ACCEPT after phase 2:
- A1. Everything accepted today outside the goal scope (live Kit v4 files keep the migration union, the two exclusions and third-party colours) — no change to their results.
- A2. Inside the goal scope: `g-*` theme utilities, `var(--g-*)`, Tailwind CSS-variable shorthand `(--g-*)`, layout arbitrary values without colour (e.g. `w-(--g-rail-w)`, `grid-cols-[28px_auto_minmax(0,1fr)_auto]`).
- A3. `client/src/index.css` phase-2 block containing exactly the goal values (14 distinct hexes: `#ffffff #fafafa #f4f4f5 #0a0a0a #52525b #6b6b73 #ebebeb #8a8a8a #262626 #404040 #1d4ed8 #047857 #b45309 #b91c1c` + `rgb()` alphas from §3a).
Must REJECT after phase 2 ("goal scope" = `client/src/components/goal/**`, including the dev gallery `components/goal/dev/GoalGallery.tsx`; extended in phase 3 by each moved surface):
- R1. Any colour literal in goal scope: hex in any form (`#rgb`, `#rrggbb`, `#rrggbbaa`, quoted, bracketed, template) and `rgb(`/`rgba(`/`hsl(`/`oklch(`.
- R2. `g-trust` / `--g-trust` anywhere except `client/src/components/goal/GoalVerifiedMark.tsx` and `client/src/index.css` (rule: trust colour only on verified marks).
- R3. `g-emerald|g-amber|g-crimson` (and their `--g-` vars) outside `client/src/components/goal/**` and `index.css` (screens pass a semantic status; primitives own the role mapping).
- R4. Kit/shadcn tokens in goal scope: `(bg|text|border|ring|outline|fill|stroke|divide|placeholder|caret|decoration|accent|shadow)-(primary|primary-foreground|secondary|muted|muted-foreground|accent|destructive|border|input|ring|background|foreground|card|popover|sidebar[a-z-]*|chart-[1-5]|ink|ink-soft|coal|paper|signal|signal-tint|signal-line|fog|faint|line)\b`, `rounded-(sm|md|lg|xl|2xl|3xl|4xl)\b`, `\bfont-mono\b`, `brand-button`, `\banimate-(in|out)\b`, `\b(fade|zoom|slide)-(in|out)\b`, and the `sm:`/`md:`/`lg:` breakpoint variants (goal UI uses `gdesk:`/`max-gdesk:`).
- R5. Banned effects in goal scope: `bg-gradient-`, `bg-linear-`, `bg-radial-`, `bg-conic-`, `backdrop-`, `blur-`, `drop-shadow`, `shadow-[` (arbitrary shadows), `animate-(pulse|spin|bounce|ping)`, `opacity-` on disabled styling (`aria-disabled:opacity-`, `disabled:opacity-`).
- R6. Comp sample data anywhere in `client/src` (non-test files, no exclusions): names and refs read from `design/goal-ui/content.json` (`screenA.companies[].name`, `screenC.asks[].company`, `screenB.detail.ref`, `screenC.asks[].ref`, `screenA.askDrawer.resume.fileName`) — today: Fernhill Bank, Kestrel Pay, Larkspur Retail, Monsoon Analytics, Orbit Freight, Quillmint, Tidewell Health, R-8F3K2, R-7KD2M, R-3PX8T, R-9WQ4F, R-6TN5B, R-4CJ7R, R-2VH9K, Resume_Backend_2026.pdf. Baseline is clean (0 hits in `client/src`, `shared`, `server`). Also reject the word "compensation" in goal scope (D-071).
- R7. Token drift: every `--g-*` declaration in `client/src/index.css` must equal the expected table (§3a, = DESIGN.md Colors/Typography/Shapes/Motion/Layout tables); missing, extra or changed values fail. The audit test additionally checks that each expected value equals its `--sw-*` source in `design/goal-ui/pick/tokens.css` except the documented deviations (`--g-dur-drawer-out` 200ms vs 150ms; `--g-on-primary-edge` comes from `shell.css:181`; shadows/focus use `var(--g-hairline|surface|ink)` in place of the identical literals).
- R8. CSS files: only `client/src/index.css` and `client/src/styles/kit.css` may exist under `client/src` (after `globals.css` is deleted); `--g-` may be declared only in `index.css`.
Kept for phase 3 (not phase 2): tightening APPROVED to drop Kit v4 hexes, scanning quoted hex in live files, removing the `Home.tsx` exclusion.
Not an audit job (tests instead): the import boundary and the one-primary rule (§6b).

### 6b. Tests (vitest; patterns already used in client tests)
Patterns to copy: first line `// @vitest-environment jsdom` (`client/src/components/appShell.test.tsx:1`; the default environment is `node`, `vitest.config.ts:30`); `import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"` (`appShell.test.tsx:4`); `import userEvent from "@testing-library/user-event"` + `const user = userEvent.setup()` (`client/src/pages/settings.region.test.tsx:5,29`); `afterEach(() => cleanup())` (`appShell.test.tsx:24`); `vi.mock("wouter", () => ({ useLocation: () => [path], Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a> }))` (`appShell.test.tsx:13-21`); plain assertions on attributes/text (`expect(link.getAttribute("href")).toBe(href)`, `appShell.test.tsx:43`) — `@testing-library/jest-dom` is NOT installed (`node_modules/@testing-library/` holds only `react` and `user-event`), so no `toBeInTheDocument`.
Minimum cases (`client/src/components/goal/*.test.tsx`):
- nav.ts: `goalNavFor(false)` ids = find, asks, inbox; `goalNavFor(true)` = find, asks, queue, inbox; never impact.
- GoalShell: links/hrefs per nav; `aria-current="page"` on `active`; "Give a referral" present with `href === referrerSignInHref()` only when `verifiedReferrer` is false; credits pill absent when `credits` is null; credits error renders the error copy and never the text "0"; root has class `g-scope`.
- GoalButton: primary carries `data-g-primary`; `aria-disabled="true"` swallows clicks (`user.click` → handler not called); busy renders `busyLabel` + `aria-busy="true"`; the element never has the `disabled` attribute; keycap wrapper `aria-hidden="true"`; `asChild` renders an `<a>`.
- GoalSearchInput: `getByRole("searchbox", { name })`; typing calls `onChange`.
- GoalFilterChip: `aria-pressed` reflects state.
- GoalListRow: `selected` → `aria-current="true"`; `selectable={false}` → no `aria-current`.
- GoalDecisionBar: Pass button `aria-haspopup="dialog"`, `aria-expanded` follows `secondary.expanded`; sr-only position text from props; key "p" → secondary intent; key "a" → primary intent (opens confirm, never commits); keys ignored while focus is in a textarea/input.
- GoalPassReasons: 7 radios in `PASS_REASON_OPTIONS` order (`shared/passReasons.ts:6-14`), none checked; Pass `aria-disabled` until one is checked; key "3" checks the third without calling `onConfirm`.
- GoalStatus: status → tone class (referred → `text-g-emerald`, accepted → `text-g-ink`, expired → `text-g-crimson`, withdrawn → `text-g-ink-3`, waiting/under_review → `text-g-amber`, queue_review → no dot).
- GoalVerifiedMark: lucide svg `aria-hidden`, text present, class `text-g-trust`.
- GoalDrawer/GoalSheet: open → `getByRole("dialog", { name: title })`; Escape → `onOpenChange(false)`; close button by its aria-label; content has class `g-scope`. (Desktop/phone branch: stub `window.matchMedia` with `vi.stubGlobal`.)
- GoalStates: error has `role="alert"`, retry calls handler; skeleton container `aria-busy="true"`.
- Composition test: a gallery frame (queue detail + decision bar) renders exactly one `[data-g-primary]`.
Node tests:
- `client/src/components/goal/goalBoundary.test.ts`: no file in `client/src` outside the allowlist (`components/goal/**`, `pages/ComponentShowcase.tsx`, `*.test.ts(x)`) imports `components/goal` (phase 3 adds each moved surface to the allowlist); `index.css` contains the phase-2 marker once and it comes after `.app-footer a{max-width:none;white-space:nowrap;}` (the current last rule, `index.css:244`).
- `scripts/designTokenAudit.test.ts`: one passing and one failing fixture per rule A1-A3, R1-R8.
Existing tests that must stay green untouched: `client/src/kitCssOverrides.test.ts`, `server/mobilePwaAudit.test.ts`, `scripts/briefContract.test.ts`, `client/src/components/appShell.test.tsx`.

### 6c. Pixel verification (no new production route)
- Dev-only gallery WITHOUT a new route: render `client/src/components/goal/dev/GoalGallery.tsx` from the existing dev-only page `client/src/pages/ComponentShowcase.tsx` (routed only under `import.meta.env.DEV`, `client/src/App.tsx:90,112`) with an early return when `window.location.hash === "#goal-ui"` (full-bleed, so the 1280 frames are not boxed by the showcase's `container max-w-6xl`, `ComponentShowcase.tsx:231`). Why not a new route: `scripts/seoRouteCoverage.test.ts:23-41` requires every `<Route path>` in App.tsx to appear in `KNOWN_ROUTE_PATTERNS` (`functions/_middleware.ts:22`, which already lists the dev path `/components` at `:33`) so production would answer HTTP 200 for it — a production route change; and a standalone dev HTML entry is not served because the dev server runs Vite with `appType: "custom"` and a single `index.html` catch-all (`server/_core/vite.ts:11,26,38-47`). `ComponentShowcase.tsx` stays excluded from the audit (`scripts/design-token-audit.mjs:30`), but the gallery file sits in goal scope and is audited. (Whether the production build still emits a never-loaded ComponentShowcase chunk because of the module-level `lazy()` at `App.tsx:90` is UNVERIFIED; it is never routed in production either way.) Gallery root has `g-scope`.
- Gallery content: every primitive in every state (default, hover via forced classes not needed, focus, selected, aria-disabled, busy, loading, empty, error, offline) plus three composed frames mirroring the comps — Find (directory + drawer open), Referral queue (list + detail + decision bar, a second frame with the pass popover open), My asks (list + detail) — filled with neutral placeholders ("Company A", "Role title", "n / N" from props). Never the comps' sample names/refs (R6 enforces).
- Captures: Playwright (installed, `playwright` 1.62.1) with the same viewports as the comp renderer `design/goal-ui/tools/render.mjs:17-18` — 1280×820 and 390×844, `deviceScaleFactor: 2` — against `pnpm dev` (`package.json` script `dev`: `NODE_ENV=development tsx watch server/_core/index.ts`; the dev URL/port is UNVERIFIED — read it from the server log). Compare side by side with `design/goal-ui/pick/{find-a-referral,referral-queue,my-asks}.{desktop,mobile}.png`.
- Checks per capture (ported from the comp gate `design/goal-ui/pick/src/gate.mjs:2-23`; a small manual Playwright script is enough, not CI): one solid `#0a0a0a` element ≥200px² per composed frame (none in a list-only frame); trust blue `#1d4ed8` only inside `GoalVerifiedMark`; visible text ≥12px and phone inputs ≥16px; nothing clipped and no horizontal overflow at 390 (`document.documentElement.scrollWidth <= 390`); every interactive target ≥44px at 390; credit/count figures render in JetBrains Mono 500 13px; the pass picker shows the 7 shipped reasons in order with none preselected; Tab shows the ink focus ring; with `reducedMotion: "reduce"` the drawer opens instantly.
- "Nothing visible changed" proof: capture public live routes (`/`, `/explore`, `/sign-in`, `/plans`, `/help`) at 1280 and 390 from a production build of `e6b87f8` and of the phase-2 head and confirm they are identical; after deploy, skipwait.me serves `<meta name="git-commit">` with the SHA (`docs/BRIEF.md:40`) and `/components#goal-ui` still renders the NotFound screen in production (existing behaviour).
- Gate before push (`docs/BRIEF.md:39`): `pnpm check`; `node scripts/design-token-audit.mjs`; `bash scripts/lint-deploy-migrations.sh`; `node scripts/check-deploy-triggers.mjs`; `LANG=en_US.UTF-8 pnpm vitest run`; `pnpm build`. Then grep the built CSS for `.text-g-display` and `width>=40.0625rem` (gdesk).

## 7. Do-not list, dependencies, and ordered implementation steps

### 7a. Dependencies
No comp needs a new dependency (verified §1b/§2): fonts are already imported (`index.css:1-8`; latin-ext rupee coverage in `@fontsource/instrument-sans/400.css:1-8`); all 22 rendered icons plus every status/stepper glyph (circle-ellipsis, circle-check, circle-x, circle-minus, building-2, arrow-up, arrow-down, loader-circle, circle-alert) exist in installed `lucide-react` 0.453.0; dialogs/popovers/slot use installed `@radix-ui/react-dialog`, `@radix-ui/react-popover`, `@radix-ui/react-slot`; class merging uses `cn` from `client/src/lib/utils.ts:4`; tests use installed `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `vitest`; captures use installed `playwright` 1.62.1. `pnpm-lock.yaml` and `package.json` must show no diff. Do not use `vaul` (installed but "unmaintained upstream", BRIEF.md:751) and do not import `tw-animate-css`.

### 7b. Do NOT
1. Do not edit `client/src/index.css` lines 1-244 (incl. `index.css:178-179`, pinned by `client/src/kitCssOverrides.test.ts:13-14`), `client/src/styles/kit.css`, `client/src/components/ui/*`, `client/src/components/kit/*`, `client/src/components/AppShell.tsx`, any live page, `client/src/App.tsx`, `functions/_middleware.ts` or any route (the only page edit allowed is the dev-only `client/src/pages/ComponentShowcase.tsx` hash branch).
2. Do not import `@/components/goal` from any live file in phase 2 (the boundary test enforces it); do not wire `useReferrerAccess`, credits queries or any API into primitives — data arrives as props.
3. Do not redefine, rename or alias existing tokens (`--primary`, `--radius`, `--font-mono`, `--color-ink`, `--border`, …), and do not add `.dark` values for goal tokens (light mode only).
4. Do not use the comp's `--sw-*` names or its CSS class names in the product; do not import or link anything under `design/goal-ui/**` from `client/`; do not port `shell.css:10-15` (`@font-face`) or the comp presentation rules (`.frame-break`, `.frame-gap`, `shell.css:270-271`, `referral-queue.css:153-154`).
5. Do not add any package, font, icon set, image, logo or illustration; do not use `vaul`, shadcn `ui/sheet.tsx`/`ui/drawer.tsx`, or `animate-in`/`animate-out` classes.
6. Do not ship (even in the dev gallery) the comps' sample names, refs, initials, file names or numbers (Fernhill Bank, Kestrel Pay, Larkspur Retail, Monsoon Analytics, Orbit Freight, Quillmint, Tidewell Health, R-8F3K2…, Resume_Backend_2026.pdf, "2 credits", "1 / 5", "5 waiting"); no compensation row/field (D-071); no per-referrer metrics; no plan badge visible to referrers; no hour/minute clocks; no "Seeking / Giving" mode switch.
7. Do not use trust blue outside `GoalVerifiedMark`, crimson anywhere in the referrer queue, emerald for Accepted, a black fill for any selected state, or more than one `primary` per screen.
8. Do not use the native `disabled` attribute on goal buttons, opacity-faded disabled states, Tailwind `sm:`/`md:` breakpoints, `rounded-sm|md|lg|xl`, `font-mono`, or any hex/`rgb()` literal in goal files.
9. Do not exceed the motion budget (hover 100ms, menu 150ms, drawer/sheet 200ms; list moves instant) or animate skeletons.
10. Do not touch `/sign-in` (D-033 role cards), `client/src/lib/referrerSignIn.ts`, login-rule tests, `shared/moneyCopy.ts`, Terms/Privacy/Refund text, or `design/goal-ui/**` (approved artefacts).
11. Do not start phase 3 (no Find/Queue/My asks page rewrites) and do not delete or build on the orphan "Kinetic" drafts (`components/layout/AppShell.tsx`, `components/ui/primitives.tsx`, `components/referrer/ReferrerCockpit.tsx`, `components/seeker/SeekerSearchPage.tsx`, `components/pipeline/PipelineTracker.tsx`) — out of scope.
12. Do not add a decision to `docs/DECISIONS.md` (status cells only), and do not change the audit's results for live (non-goal) files — CI must stay green.
13. Do not force-push, rewrite history, or push before the full gate passes on the commit merged with the latest `origin/main` (`docs/BRIEF.md:38-39`).

### 7c. Ordered steps (one lane branch, e.g. `agent/<platform>/d048-phase2-foundation`; each commit passes `pnpm check` and the affected tests)
0. Preconditions and claim. Confirm D-072 lanes 1-3 (D-067 Pro/Max removal, seeker passwords, D-069 Chargebee catalog sync) are `done` in `docs/KIT_V4_BUILD_PLAN.md` §3b, or the owner has said to start (`docs/BRIEF.md:33`, `AGENTS.md:38-43`); fetch `main`; re-read D-048/D-070/D-071. Claim with a docs-only push to `main` BEFORE code (`docs/BRIEF.md:32`, queue rule 4 `docs/KIT_V4_BUILD_PLAN.md:60`): edit only `docs/KIT_V4_BUILD_PLAN.md:89` Status → `in progress — <platform/model> — <YYYY-MM-DD> — branch agent/<platform>/d048-phase2-foundation`, listing the paths below (include the deletion of `client/src/styles/globals.css`). Capture "before" screenshots of `/`, `/explore`, `/sign-in`, `/plans`, `/help` at 1280×820 and 390×844 from a production build of the base commit.
1. Commit "D-048 phase 2: goal-UI tokens in index.css" — `client/src/index.css` (append the §3a block after line 244, nothing else), delete `client/src/styles/globals.css` (dead; verify 0 importers first: `grep -rn "globals.css" client vite.config.ts index.html` → only the file itself). Check: `pnpm check`, `pnpm build` passes, built CSS contains `--g-ink:#0a0a0a` (or equivalent), `client/src/kitCssOverrides.test.ts` and `server/mobilePwaAudit.test.ts` green. (If deleting globals.css is not accepted in the claim, keep it and make audit rule R8 allow it while banning any import of it.)
2. Commit "D-048 phase 2: token audit for the goal UI" — `scripts/design-token-audit.mjs` (CLI wrapper + rewritten header comment), new `scripts/designTokenAuditCore.mjs` (pure rules A1-A3, R1-R8 from §6a), new `scripts/designTokenAudit.test.ts` (pass/fail fixture per rule). Check: `node scripts/design-token-audit.mjs` still reports OK with the same counts for live files (314 files / 1202 approved / 3 third-party today, plus the new goal checks), `pnpm vitest run scripts/designTokenAudit.test.ts`.
3. Commit "D-048 phase 2: goal primitives (atoms)" — `client/src/components/goal/{index.ts,nav.ts,GoalNum.tsx,GoalKeycap.tsx,GoalButton.tsx,GoalIconButton.tsx,GoalVerifiedMark.tsx,GoalStatus.tsx,GoalFilterChip.tsx,GoalSearchInput.tsx,GoalField.tsx,GoalStates.tsx,useOnlineStatus.ts}` + `client/src/components/goal/{nav.test.ts,goalAtoms.test.tsx}` (§4.2-4.5, 4.8, 4.9, 4.11; §6b cases). Check: `pnpm build`, then grep the built CSS for `.text-g-display`/`.text-g-label` (font-size, line-height, letter-spacing, font-weight) and for the `gdesk` media query (`width>=40.0625rem`); utilities only appear once a source file uses them.
4. Commit "D-048 phase 2: goal primitives (shell, list, detail, decision bar, drawer)" — `client/src/components/goal/{GoalShell.tsx,GoalListRow.tsx,GoalDetailPane.tsx,GoalLockedPanel.tsx,GoalDecisionBar.tsx,GoalPassReasons.tsx,GoalDrawer.tsx,GoalSheet.tsx}` + `client/src/components/goal/{goalComposites.test.tsx,goalBoundary.test.ts}` (§4.1, 4.5-4.7, 4.10; §6b). Check: `LANG=en_US.UTF-8 pnpm vitest run client/src/components/goal`.
5. Commit "D-048 phase 2: dev-only goal-UI gallery" — new `client/src/components/goal/dev/GoalGallery.tsx` (all primitives × states + three composed frames with neutral placeholders) and `client/src/pages/ComponentShowcase.tsx` (hash `#goal-ui` early return, §6c); no route, App.tsx and `functions/_middleware.ts` untouched. Check: `pnpm build`; `scripts/seoRouteCoverage.test.ts` green; run `pnpm dev`, open `/components#goal-ui`, capture the gallery at 1280×820 and 390×844 (DPR 2) and run the §6c checks; compare with `design/goal-ui/pick/*.png`. Attach captures to the report (do not commit binaries unless the plan row asks).
6. Commit "D-048 phase 2: goal DESIGN.md and doc sync (D-068)" — `DESIGN.md` (replace with §5; pointer stays on line 3), `AGENTS.md` (rewrite "Styling and dependency boundary" `AGENTS.md:442-451`: goal contract = DESIGN.md for moved surfaces, Kit v4 rules only for unmoved ones, keep the prohibited list and dependency rules; update §0 item 4 at `AGENTS.md:42` and the D-048 bullet at `:54` to "phase 2 done — phase 3 next"), `docs/BRIEF.md:24` (name `DESIGN.md` as the goal contract; file must stay ≤10 KB, now 8536 bytes, `scripts/briefContract.test.ts:14,21-23`), `docs/DECISIONS.md` status cells of D-048 (`:64`) and D-071 (`:87`) only, `docs/KIT_V4_BUILD_PLAN.md:89` (row status), `FOR_AI_BUILDERS.md:57-58` (note that the goal navigation in DESIGN.md ships per surface in phase 3; the live sidebar stays until then), `LLM_HANDOFF.md:22` and `START_HERE.md:6` (phase status). Check: `pnpm vitest run scripts/briefContract.test.ts`.
7. Gate and ship: merge latest `origin/main`, run the full gate (`docs/BRIEF.md:39`), push the branch and then to `main` (a push to `main` deploys the web build, D-003). Live check: skipwait.me serves `<meta name="git-commit">` with the SHA; "after" captures of the step-0 routes at 1280 and 390 are identical to "before"; `/components#goal-ui` is still NotFound in production. Then a docs-only push setting `docs/KIT_V4_BUILD_PLAN.md:89` to `phase 2 done — <sha>; phase 3 (surface by surface) next` and the D-048/D-071 status cells to match.

## Definition of done
- [ ] Each step's commit passes `pnpm check` and its tests.
- [ ] The full gate, including `node scripts/design-token-audit.mjs`, on the branch merged with the latest `origin/main`.
- [ ] Live surfaces unchanged: compare `/`, `/explore`, `/queue`, `/requests` at 1280 and 390 before and after; they must be identical.
- [ ] The primitives gallery is visible only on the dev-only `/components` page (`#goal-ui`); no new production route.
- [ ] `DESIGN.md` replaced by the goal-UI contract, keeping the `docs/BRIEF.md` pointer in its first lines (`scripts/briefContract.test.ts`).
- [ ] Docs: the `AGENTS.md` "Styling and dependency boundary" points to the new `DESIGN.md`; the `docs/DECISIONS.md` D-048 sync cell reads "phase 2 done — <sha>"; this row.
- [ ] Tier 2: push to `main` after the gate; a review is recommended.
