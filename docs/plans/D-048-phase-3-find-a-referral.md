# Packet D-048 phase 3: Find a referral on the goal directory

> Read `docs/BRIEF.md` first, then `DESIGN.md` (the goal-UI contract) and this packet. This is one wave of the phase-3 rollout: the directory column of the Find screen moves to the approved goal UI.

| Field | Value |
|---|---|
| Queue row | `docs/KIT_V4_BUILD_PLAN.md` §3b row 4 (D-048 phase 3). The queue stays Claude Code's (D-083); this packet is the record of the wave. |
| Decisions | D-048 (goal UI is binding; phase 3 moves one surface at a time) · D-070/D-071 (comps in `design/goal-ui/pick/` approved) · D-077 (design rulings, e.g. (6) all ten job functions as chips) · D-059 (no business numbers in public) · D-063 (money copy) |
| Risk tier | 3 (isolated UI; no schema, money, auth, API or routing change) |
| Size | S (one page, one test file, one dead-code removal, one boundary entry) |
| Implementer | opencode (`agent/opencode/d048-phase-3-find`) |
| Branch | `agent/opencode/d048-phase-3-find` from `origin/main` `e383a5d4` |
| Depends on | D-048 phase 2 live (`b6ea65f1`: tokens, primitives, token audit) |
| Runs beside | the W0 shell wave (`agent/instinct/goal-ui-w0-shell`, `AppShell.tsx`) and the `/requests` pilot (`agent/qoder/d048-phase-3-requests`, PR #360). This packet edits none of their files except `client/src/components/goal/goalBoundary.test.ts` (one allowlist entry). |
| Verified against | `main` `e383a5d4` on 2026-10-21 |

## 1. Goal

A visitor opening **/explore** sees the approved goal directory: one title, one honest sub-line, a search field, filter chips, a counted summary and one row per company — each row a link to that company's page. Nothing on the screen commits anything, so nothing on it is a black fill. Every figure comes from `GET /api/companies`; the screen invents no number, no preview chip and no sample row.

## 2. Binding rules (quoted, not paraphrased)

- `DESIGN.md`: "Phase 3 moves one surface at a time, each through the full gate with captures at 1280 and 390."
- `DESIGN.md` rule 1: "Exactly one solid black element per screen, and it is the commit action… A screen without a commit action (a list) has none."
- `DESIGN.md` rule 4: "Every figure the product counts or computes … is JetBrains Mono 500 at 13px (`GoalNum`)."
- `DESIGN.md` rule 9: "The comps' names, numbers, refs, initials and file names … are review fixtures. Every number on screen comes from the server; no invented numbers; no preview chips."
- `DESIGN.md` rule 13: money lines say what the code does; a failed balance never shows 0.
- `DESIGN.md` Do's: "Do take sizes from `design/goal-ui/pick/*.css`" · "Do wrap goal UI … in `.g-scope`" · "Don't use `g-*` tokens on a surface that has not moved."
- `DESIGN.md` Don'ts: "Don't use hex or `rgb()` literals in goal components" · "Don't use Kit v4 or shadcn tokens in goal UI".
- `design/goal-ui/pick/find-a-referral.css`: `.find { padding: 40px 32px 32px; }` (phone `24px 16px 24px`); `.co-row { height: 52px; }`; `.summary { margin-top: 28px; }`; `.chips { gap: 8px; }`.
- D-077(6): "Production filter chips offer all ten job functions; the comps' four are illustrative."
- `AGENTS.md` product compass: quality is the moat and referrals are the product — a directory that flatters itself with invented availability would break both.

## 3. Current behaviour (verified on `main` `e383a5d4`)

1. `/explore` rendered the Kit v4 screen (`client/src/pages/Explore.tsx`): a kit eyebrow ("FIVE OPEN DOORS · MORE TO COME"), a heading, a search form, two hard-coded filter selects (function, location), a card grid (`CompanyCard`) and a "PEOPLE OPEN TO REFERRALS" pill per card.
2. The directory data layer (`client/src/lib/companyDirectory.ts`, `useCompanyDirectory`) was already the single source of truth and parsed at the edge; it stays untouched.
3. The goal primitives (`client/src/components/goal/`) existed and were tested, but no live surface imported them (`goalBoundary.test.ts` allowlist held only the dev gallery).
4. `CompanyCard` and `openDoorsEyebrow` existed only for the Kit v4 screen.

## 4. Target behaviour

1. **One column, no chrome.** The page renders the directory column only (`<section aria-labelledby="goal-find-heading" class="g-scope">`). The rail, top bar, one navigation and the ask drawer belong to the goal shell (W0 wave, `agent/instinct/goal-ui-w0-shell`); this page never draws them, so it lands safely before or after that wave.
2. **Title and sub.** `text-g-display` "Where do you want a referral?" and `text-g-body` "Ask a verified employee. Your name and resume stay private until they accept." (comp copy).
3. **Search.** `GoalSearchInput` (leading lucide `search`, 44px desktop / 48px phone, `aria-label="Search companies"`), matching name, industry, functions and location, client-side, so it keeps working offline.
4. **Chips.** `GoalFilterChip` with `aria-pressed`: "All companies" (pressed, clears every filter), "Open to requests", then the ten job functions of `shared/jobFunctions.ts` (D-077(6)). Chips are tints, never black fills.
5. **Summary.** `<n> companies · <m> open to requests` with `GoalNum` figures, computed from the filtered set.
6. **Rows.** `GoalListRow density="company"`: `GoalCompanyMark` (initials, never a logo), the company name, its functions, and `GoalAvailability` — solid ink dot + "Open to requests", or a ringed dot + "Not open yet". Every row is one link to `/explore/:slug`.
7. **States.** Loading: static skeleton rows. Failure: an honest error with "Try again" (never an empty list). No match: "No company matches that yet." with "Clear filters", plus the live "Request a company" link; an empty directory shows the request link only.
8. **Honesty.** The footnote "Availability can change. No referral is guaranteed." stays. The screen carries no money line and no referral promise — the approved comp puts none there, and the free-asks promise belongs to the ask flow (`shared/moneyCopy.ts`).
9. **No leaks.** No referrer names, no counts per referrer, no per-referrer metrics (D-040, DESIGN rule 11), no preview chips, no sample data.

### Deliberate deltas from the Kit v4 screen (for the owner to veto)

- The hard-coded location select (Remote / India / Global) is gone: the comp has no location chip, and the values were stale against a free-text `location`. Location is still matched by the search field.
- The kit eyebrow and the card grid are gone (comp: a dense list, not cards).
- The "People open to referrals" pill becomes the goal availability dot + text.

## 5. Files

- **In scope (edit only these):**
  - `client/src/pages/Explore.tsx` (the moved surface)
  - `client/src/pages/explore.test.tsx` (rewritten for the goal DOM, same intents)
  - `client/src/components/goal/goalBoundary.test.ts` (one allowlist entry: the moved surface)
  - `client/src/components/goal/GoalDrawer.tsx` (guard `useIsDesktop` when `window.matchMedia` is missing — jsdom and older browsers)
  - `client/src/lib/companyDirectory.ts` (delete `openDoorsEyebrow`, dead after the move)
  - `client/src/components/explore/CompanyCard.tsx` (deleted, dead after the move)
  - this packet; the `AGENTS.md` D-048 program line
  - `design/goal-ui/captures/w1-find/` (the 1280 and 390 captures and their pixel checks)
- **Shared kit fixes this wave needed (two commits, before the surface):**
  - `client/src/lib/utils.ts` — the goal type tokens (`text-g-label` and friends) are font sizes, but tailwind-merge classified every unknown `text-*` as a colour, so a primitive pairing `text-g-label` with `text-g-ink` silently lost its type size (the goal kit rendered at 16px instead of 14px). Fixed by classifying the goal type tokens as font sizes; `client/src/lib/utils.test.ts` pins it.
  - `client/src/components/goal/GoalListRow.tsx` — the company density now draws the comp's grid (`find-a-referral.css` `.co-row`): one line on desktop (mark, name, functions, availability) and two lines on phones, with the availability label never wrapping. The queue and ask rows are untouched.
  - Both files are shared with the other waves: `GoalListRow.tsx` is also touched by `agent/qoder/d048-phase-3-requests` (its `<a>` → router `<Link>`), so the merge will need one manual resolution.
- **Read only:** `DESIGN.md`, `design/goal-ui/pick/find-a-referral.{html,css,png}`, `client/src/components/goal/*`, `shared/jobFunctions.ts`, `shared/companies.ts`, `client/src/lib/companyDirectory.ts`, `client/src/lib/seo.ts`.
- **Out of scope (never edit here):** `server/**`, `drizzle/**`, `shared/**`, `client/src/App.tsx`, `client/src/components/AppShell.tsx`, `client/src/components/goal/GoalShell.tsx`, `client/src/pages/MyRequests.tsx`, `docs/plans/assignments.json`, `docs/KIT_V4_BUILD_PLAN.md` §3b.

## 6. Steps (one commit each)

1. **The moved surface.** `Explore.tsx` on the goal primitives; the data layer untouched; the dead Kit pieces removed. Focused: `client/src/pages/explore.test.tsx`.
2. **Pins.** The boundary entry, the `useIsDesktop` guard, this packet and the `AGENTS.md` line.

## 7. Tests (written with the change)

`client/src/pages/explore.test.tsx` — one row per server company with the right link; the counted summary; availability honest in both directions ("Open to requests" vs "Not open yet"); never claiming an open door when no referrer is available; skeleton → error → "Try again" recovers; search, function chip and open-to-requests chip filter and "All companies" clears; the empty state with both recovery links; the SEO title, description and canonical path; the honest availability footnote and no money line; no sample data. The company page (`ExploreCompany`) keeps its Kit v4 tests untouched — it has not moved.

## 8. Gate (per D-082 and DESIGN.md §Verification)

`pnpm check` · `pnpm vitest run client/src/pages/explore.test.tsx client/src/components/goal client/src/lib/utils.test.ts` · `node scripts/design-token-audit.mjs` · the full local gate · `pnpm build` · captures at 1280×820 and 390×844 compared with `design/goal-ui/pick/find-a-referral.{desktop,mobile}.png`.

Captures (this branch): `design/goal-ui/captures/w1-find/after-explore-1280.png`, `after-explore-390.png`, and `checks.txt` — the pixel checks run against each capture: no black commit action on a list screen (rule 1), trust blue only inside a verified mark (rule 2), visible text at least 12px and phone inputs at least 16px (rule 15), every interactive target at least 44px at 390, no horizontal overflow at 390, the counted figures in JetBrains Mono 500 13px (rule 4), and no console errors from the moved surface. Local dev serves the launch seed, so every row honestly reads "Not open yet" (no referrer can be verified without a database).

## 9. Division of labour (phase 3, so the waves do not collide)

| Wave | Surface | Owner | Branch |
|---|---|---|---|
| W0 | the frame: rail, top bar, one navigation, drawer column | instinct | `agent/instinct/goal-ui-w0-shell` |
| W1 | **Find a referral — the directory column (`/explore`)** | **opencode (this packet)** | `agent/opencode/d048-phase-3-find` |
| W1 | My asks (`/requests`) | qoder | `agent/qoder/d048-phase-3-requests` (PR #360) |
| next | Referral queue (`/queue`), the ask drawer, Inbox, then the utility and public screens | unclaimed | — |

The shared file `client/src/components/goal/goalBoundary.test.ts` carries one allowlist entry per wave; whoever merges second keeps both entries.
