# Packet D-048 phase 3: My asks on the goal list

> Read `docs/BRIEF.md` first, then this packet and `DESIGN.md`. This is the pilot that moves the first live surface to the approved goal UI (D-048 phase 3).

| Field | Value |
|---|---|
| Queue row | `docs/KIT_V4_BUILD_PLAN.md` §3b row 4 (D-048 phase 3). This packet is the pilot record; the queue stays Claude Code's (D-083). |
| Decisions | D-048 (goal UI is binding, phase 3 one surface at a time) · D-070/D-071 (comps in `design/goal-ui/pick/` approved) · D-077 (design rulings) · D-055 (no credits pill for referrers) · D-019 (basics work) |
| Risk tier | 3 (isolated UI, no schema, money, auth or API change) |
| Size | M (one surface, one adapter, one row layout, tests and captures) |
| Implementer | any model |
| Branch | `agent/qoder/d048-phase-3-requests` from `origin/main` `e383a5d4`; PR #360 |
| Depends on | D-048 phase 2 live (`b6ea65f1`, tokens + primitives + token audit) |
| Do not run at the same time as | any other packet editing `client/src/pages/MyRequests.tsx`, `client/src/components/goal/*`, or `client/src/App.tsx` |
| Verified against | `main` `e383a5d4` on 2026-10-21 |

## 1. Goal

A seeker opening **My asks** sees their real asks in the approved goal list: three lines per row (company + status, role + date, the next real step), the plan's open-ask meter, and Active/Closed sections drawn in the goal tokens. The row opens the existing `/conversation/:id` thread, where withdraw and the conversation already live. The surface stops using the Kit v4 shell and keeps every number from `GET /api/company-referrals/mine` — it adds no fabricated row, preview or count.

## 2. Binding rules (quoted, not paraphrased)

- `DESIGN.md`: "Phase 3 moves one surface at a time, each through the full gate with captures at 1280 and 390."
- `DESIGN.md` Do's: "Do take sizes from `design/goal-ui/pick/*.css`" and "One primary action per screen."
- `design/goal-ui/pick/my-asks.css`: `.a-row { grid-template-areas: "co status" "role date" "next next"; }` — the comp's three-line row; ask rows carry no company mark.
- `DESIGN.md`: "Don't show the comps' sample data." Every string here comes from props or the live payload.
- `AGENTS.md` product compass: credits and money stay honest. The list may not claim a credit came back, or was spent, unless the payload proves it; `unreadMessageCount`, `queueStatus`, `expiresAt` and `status` are the only facts available.
- D-055: referrers are never charged or paid, so a verified referrer sees no credits pill (the shell adapter drops it).

## 3. Current behaviour (verified)

1. `/requests` rendered `MyRequests` inside a nested Kit `AppShell` (`client/src/App.tsx`), so the route could not adopt the goal shell.
2. `client/src/pages/MyRequests.tsx` used Kit components and a status pill vocabulary (`Requested`, `Accepted`, …), not the goal dot/stepper vocabulary.
3. The goal primitives (`client/src/components/goal/`) existed and were tested but no live surface imported them (`goalBoundary.test.ts` allowlist contained only the gallery).
4. `GoalShell` took credits and account as props and fetched nothing; no live adapter existed.
5. `Get /api/company-referrals/mine` returns `{ requests, slots }`; request rows carry `status`, `queueStatus`, `title`, `companyDomain`/`companyName`/`companyInitials`, `expiresAt`, `unreadMessageCount`, `referrerMessage` (`shared/openAskSlots.ts`, `client/src/components/requests/requestsApi.ts`).
6. There is no claimed-at field in the payload; `updatedAt` is the closest truthful time for a claimed or answered ask.

## 4. Target behaviour

1. **Shell.** `/requests` renders `GoalAppShell` (a fetching adapter over `GoalShell`) with `active="asks"`, page title "My asks". Route `/requests` in `App.tsx` renders the page directly; providers stay global.
2. **Credits.** The adapter reads `GET /api/credits/summary?role=job_seeker`; ready shows `<n> credits` linking `/plans`; loading shows a quiet placeholder; failure says "Balance didn't load" with Retry, never 0. A verified referrer (`useReferrerAccess`) sees no pill and keeps the queue nav.
3. **Account.** Initials come from the signed-in name or email; the avatar opens `/settings`; signed out, the empty account slot is a "Sign in" control.
4. **Row grid.** Each ask is one link to `/conversation/:id` drawn as the comp's three-line grid: company + goal status (mini stepper), role + date (verb + mono day), and a full-width next step that wraps (never truncates).
5. **Status vocabulary.** pending unclaimed → Waiting (stage 0); pending claimed → Under review (stage 1); approved → Accepted (stage 2); intro_made → Referred (stage 3, emerald); interview/offer → neutral Interviewing/Offer; declined → crimson terminal; withdrawn → ink-3 terminal; closed → Withdrawn when it had a referrer, else Expired.
6. **Next step.** Claimed pending: "Nothing to do yet. You’ll hear from us when they decide." Accepted: the referrer submits it through `<company>`'s process, then marks it Referred. Referred: watch email for `<company>`'s recruiters. Unclaimed pending keeps the model's own note (expiry, waiting for coverage, add a credit). Declined shows the referrer's recorded reason or a neutral sentence; Withdrawn/Closed state the fact without claiming a refund.
7. **Slots.** `Open asks <open> of <cap> · <plan> plan` from the server; a full-plan nudge (`slotsFullCopy`) appears only when the server says `full`; missing/malformed slots read "Open asks didn’t load" with Reload — never a fake count.
8. **Sections.** Active and Closed sections with counts; Closed-only shows "No open asks."; Active-only shows "Nothing closed yet."; zero asks shows exactly one "No asks yet." empty state.
9. **States.** First load: three static skeleton rows plus the shared slow-load line after the threshold. Error: honest alert with Try again; nothing lost. Signed out: a gate with one primary "Secure sign in"; the heading's ask CTA is hidden so the screen keeps one primary action.
10. **Layout.** Desktop: a 440px list column immediately right of the 104px rail with a hairline right edge; the detail pane is **not** built here. Phone: single column, no border, bottom bar. Captures at 1280 and 390 match the comp's row order and spacing.
11. **No leaks.** The list never shows a referrer id, the referrer's private note, a `Ref-` code, preview chips or sample data.

## 5. Files

- **In scope (edit only these):**
  - `client/src/pages/MyRequests.tsx` (page, row grid, next-step copy)
  - `client/src/pages/myRequests.goal.test.tsx` (new)
  - `client/src/pages/myRequests.empty.test.tsx`, `myRequests.pendingStates.test.tsx`, `myRequests.withdraw.test.tsx` (rewrite to the goal surface)
  - `client/src/pages/myRequests.kit.test.tsx` (deleted; every intent moved into the three files above)
  - `client/src/components/goal/GoalAppShell.tsx` (new)
  - `client/src/components/goal/GoalShell.tsx` (link-based nav, credits states, avatar)
  - `client/src/components/goal/GoalListRow.tsx` (router `Link`)
  - `client/src/components/goal/GoalStates.tsx` (empty-state action is an outline control)
  - `client/src/components/goal/goalBoundary.test.ts`, `goalComposites.test.tsx`, `index.ts`
  - `client/src/hooks/useCreditBalance.ts` (new)
  - `client/src/App.tsx` (route)
  - this packet; `AGENTS.md` D-048 program line
- **Read only:** `DESIGN.md`, `design/goal-ui/pick/my-asks.html|css|png`, `client/src/components/requests/*`, `shared/openAskSlots.ts`, `shared/referral.ts`, `client/src/_core/auth.tsx`, `client/src/hooks/useReferrerAccess.ts`.
- **Out of scope (never edit here):** `server/**`, `drizzle/**`, `shared/**`, `docs/plans/assignments.json`, `docs/KIT_V4_BUILD_PLAN.md` §3b, `.env*`, payment/auth code.

## 6. Steps (one commit each)

1. **Page and shell.** Move `MyRequests` to `GoalAppShell`, rewrite the row grid and status mapping, keep the data layer untouched. Focused: the four `myRequests.*` files.
2. **Adapter and primitives.** `useCreditBalance`, link-based `GoalShell` navigation, avatar/credits states, outline empty action, boundary allowlist. Focused: `client/src/components/goal`.
3. **Captures and docs.** 1280/390 screenshots against `design/goal-ui/pick/my-asks.*`; this packet and the `AGENTS.md` line. Commit message names the moved surface.

## 7. Tests (written with the change)

`client/src/pages/myRequests.goal.test.tsx` (12): shell renders once with live credits pill and fetch URLs; verified referrer keeps Queue nav and no pill; sign-in gate calls `openSignIn` and flashes no row; slots meter and Concierge cap; slots error + Reload; each ask is one link with goal status and mini stepper; approved ask renamed for privacy; Active/Closed grouping with counts; closed-empty note; network error; malformed payload is an error.

`myRequests.empty.test.tsx`: exactly one "No asks yet."; no preview/share/kit copy; the real next step leads to `/explore`; approved row links its thread, shows Accepted and "2 new", never the referrer id or note.

`myRequests.pendingStates.test.tsx`: claimed ask reads Under review with the no-referrer guarantee; expiry notes stay honest (relative, and a server `expiresAt` override); lapsed ask under Closed as Expired; slots meter; full-plan nudge with and without a next plan; 503 retry keeps the row; slow load shows the pending and slow markers.

`myRequests.withdraw.test.tsx`: rows link the thread and never call `/withdraw`; unclaimedAssignment copy.

**Controls:** `client/src/components/goal/*` (20+ primitive tests), `client/src/pages/loginRule.test.tsx`, `client/src/pages/signIn.test.tsx` stay green. No existing assertion was weakened; the two assertions that changed now pin the comp's row copy (`myRequests.pendingStates`) and the mark-free row (`myRequests.goal`).

## 8. Edge cases and races

- `slots` missing/malformed → "Open asks didn’t load", not 0.
- Zero requests → one empty state; Closed-only → "No open asks."; Active-only → "Nothing closed yet.".
- Long company name or role truncates on its line; the next-step line wraps.
- `waiting_for_coverage` and `held_for_credit` keep their honest notes and no 7-day countdown.
- A verified referrer gets the queue nav and no pill (D-055); access `checking` leaves the pill disabled rather than flashing a seeker pill.
- Credits failed → "Balance didn't load" + Retry; the rest of the page still works.
- Signed out → one primary action (Secure sign in).
- Slow or dropped connection → skeleton + honest slow line, or the error state with Try again.

## 9. Verification

- `pnpm check`
- `pnpm vitest run client/src/pages/myRequests.goal.test.tsx client/src/pages/myRequests.empty.test.tsx client/src/pages/myRequests.pendingStates.test.tsx client/src/pages/myRequests.withdraw.test.tsx client/src/components/goal`
- `node scripts/design-token-audit.mjs`
- `pnpm build`
- `pnpm quality:gate` on the branch before pushing
- Captures at 1280×900 and 390×844 (signed in with data, empty, full slots, signed out) compared with `design/goal-ui/pick/my-asks.desktop.png` / `my-asks.mobile.png`.
- Production remains unverified until this lands through a PR (D-082).

## 10. Deviations from the comp (deliberate)

1. **No detail pane.** The comp's right pane needs the thread data; the pilot keeps the existing `/conversation/:id` thread as the detail and links each row to it. The thread surface moves in its own packet.
2. **No company mark in ask rows.** The comp has none; the goal mark stays for company and queue rows.
3. **No "credit returned" claim on closed rows.** The payload does not carry the refund outcome, so the copy states the fact (referrer's reason, withdrawal, no pickup) and never a money movement it cannot prove.
4. **Date format follows the reader's display preference** (`formatDay`); the comp's `17 Oct` is one of the supported formats.
5. **Signed out hides the heading's ask CTA** so "Secure sign in" is the screen's only primary action (DESIGN.md).
6. **Avatar opens `/settings`; the credits pill opens `/plans`.** The pilot wires the existing destinations; no new account or billing surface.

## 11. Rollback

Revert the PR commits. No schema, migration, server, provider or stored state changes; the route falls back to the previous `MyRequests` build on the next deploy.

## 12. Definition of done

All gates green on the exact commit, captures match the comp at both widths, and the PR is reviewed. The queue row's status is updated by Claude Code when this lands (D-083).
