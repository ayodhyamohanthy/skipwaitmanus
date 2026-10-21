# Packet D-048 phase 3: Referral queue on the goal triage desk

> Read `docs/BRIEF.md` first, then this packet and `DESIGN.md`. This moves the third live surface to the approved goal UI (D-048 phase 3), the one approved comp no other lane claimed (`design/goal-ui/pick/referral-queue.*`).

| Field | Value |
|---|---|
| Queue row | `docs/KIT_V4_BUILD_PLAN.md` §3b row 4 (D-048 phase 3). The queue order stays Claude Code's (D-083); this packet is the slice record. |
| Decisions | D-048 (goal UI binding, one surface at a time) · D-070/D-071 (comps approved, no compensation row) · D-077 (design rulings) · D-055 (referrers never pay: no credits pill) · D-019 (basics keep working) · D-087 (slice is placed inside an existing flow) |
| Risk tier | 3 (isolated UI, no schema, money, auth or API change) |
| Size | L (one surface, two new surface components, a pure row mapper, five test files rewritten, captures) |
| Implementer | Buffy · freebuff-9c81a63a |
| Branch | `agent/buffy/d048-phase-3-queue` from `origin/main` `e1404b6f` |
| Depends on | D-048 phase 2 live (`b6ea65f1`: tokens, primitives, token audit); the D-077(4) readers (`shared/roleTitle.ts`, `shared/whyMe.ts`), unmerged on `agent/buffy/d077-ask-display` until here |
| Runs beside | the `/requests` pilot (`agent/qoder/d048-phase-3-requests`, PR #360), the Find-a-referral lanes, the W0 shell (all edit `client/src/components/goal/*`; this packet edits none of it except the boundary pin's allowlist) |
| Verified against | `main` `e1404b6f` on 2026-10-21 |

## 1. Goal

A verified referrer opening **Referral queue** works the approved triage desk: a 360px queue list of real asks (role, New/Under review, job function, days left), the opened ask in a detail pane capped at 680px (job posting, the seeker's own reasons, the ask's provable checks, the locked document count), and one pinned decision bar — Pass privately, or Accept & connect. Every fact on screen comes from `/api/company-referrals/inbox`, `/api/company-referrals/:id/preview` or the row the list already loaded; nothing is invented, and the seeker's name, files and note links stay hidden until acceptance (DESIGN.md rule 12).

## 2. Binding rules (quoted, not paraphrased)

- `DESIGN.md`: "Phase 3 moves one surface at a time, each through the full gate with captures at 1280 and 390."
- `DESIGN.md` rule 1: "Exactly one solid black element per screen, and it is the commit action (Send ask, Accept & connect, Ask for a referral)."
- `DESIGN.md` rule 12: "Before acceptance a referrer sees the role, job function, job link, the three reasons, ask-quality checks, a day-level clock and a document count — never the seeker's name, file names, links, photo or plan."
- `DESIGN.md` rule 13 and D-055: "Referrer surfaces show no credits pill" and "Money lines say what the code does". The list keeps the comp's one line: "Referrers are never charged."
- `DESIGN.md` rule 9: "Every number on screen comes from the server; no invented numbers."
- `DESIGN.md` rule 10: "No compensation row or field" (the inbox payload's `compensation` is never read).
- `DESIGN.md` rule 5: amber for pending and clocks of two days or fewer; "never crimson in the referrer queue".
- `server/privateReferralRoutes.ts` `POST /api/company-referrals/:requestId/one-click-review`: "An accept reveals names both ways and the resume, so it must be an explicit confirmed act … a bare approve call is refused before any state change" (`ethicsConfirmed !== true` → 400).

## 3. Current behaviour (verified on `main` `e1404b6f`)

1. `/queue` renders `MyCompanyInbox` inside the Kit `AppShell` (`client/src/App.tsx`), so the route cannot adopt the goal shell.
2. `client/src/pages/MyCompanyInbox.tsx` (168 lines, dense) renders Kit cards: `QueuePanel`, `QueueRequestCard`, `ReferrerCreditsCard`, `ReferrerFastTrackCard`, `CandidatePreviewCard`, `PassPrivatelyPanel`, `ActionErrorCard`, `ReferrerWorkspace`; statuses come from `kitStatusFor`.
3. It loads `GET /api/company-referrals/inbox?scope=new` then `?scope=saved` (dedup by id), `GET /api/referrer-impact/me` for the empty panel only, and opens `?request=<id>` deep links.
4. The opened ask uses `GET /api/company-referrals/:id/preview`, whose payload is `{ id, candidateName (null before acceptance), candidateMessage, targetRoleUrl, companyDomain, attachments }`; attachments are locked metadata only (`shared/referrerAskView.ts`).
5. Decisions go through `POST /api/company-referrals/:id/one-click-review` with `ethicsConfirmed: true` for accepts and a `declineReason`/`passReason` for passes (D-035 writes the credit effect; this surface changes no money rule).
6. `POST /api/company-referrals/availability/open` is the empty state's one action.
7. Five test files pin this page: `myCompanyInbox.auth`, `.pendingStates`, `.serverAccess`, `.unhandled`, plus the login-rule pin in `loginRule.test.tsx`.
8. The inbox row already carries `jobFunction`, `companyName`, `companyInitials`, `targetRoleUrl`, `attachmentCount`, `expiresAt`, `isClaimedByYou`, `waitingForCoverage`, `coverageVisibleAt`; it carries no role title and no display ref.
9. The goal primitives (`client/src/components/goal/`) are tested but no live surface imports them (`goalBoundary.test.ts` allowlist holds only the gallery); `GoalStatus` already defines `queue_new` (ink dot) and `queue_review` (ink-3, no dot) for this comp.
10. `design/goal-ui/pick/referral-queue.css` defines the list (`q-row` three-line grid), the detail (`q-detail__role`, `props`, `why`, `quality`), the 72px `dock`, and the pass sheet's `radio-list`.

## 4. Target behaviour

1. **Shell.** `/queue` renders the page directly (`App.tsx`), and the page wraps itself in `QueueShell`, a local adapter over `GoalShell`: `active="queue"`, `verifiedReferrer` from `useReferrerAccess`, `pageTitle="Referral queue"`, `credits={null}` (D-055: no credits pill on a referrer surface), account initials from the signed-in user, `alertsHref="/alerts"`.
2. **List.** `QueueList` draws the comp's list header — display title, mono `n waiting` count, `GoalVerifiedMark` with the verified company name, the quiet Impact link to `/referrer/impact`, and the sub line "Asks for `<company>` roles. Names and resumes stay hidden until you accept." — then one `GoalListRow` per ask: role title, `GoalStatus` (`New` / `Under review`), job function, and a mono day-level clock (`2 days left`, `Closes today`, `Expired`). The foot line is "Referrers are never charged."
3. **Role title.** From `roleTitleFromUrl(row.targetRoleUrl)`; when the link has no readable words, the row and the detail fall back to the job function (`Design role at Kestrel Pay`) — never a made-up title.
4. **Opened ask.** `QueueAsk` uses `GoalDetailPane`: eyebrow `jobFunction · company`, the role title as the display heading, meta `[days left, Closes <date>, Received <date>]`, then the job-posting link (`targetRoleUrl`, host + path, `rel="noopener noreferrer"`), **Why me** (the seeker's own note, one numbered reason per line via `whyMeForReader`; a legacy single-block note shows as one reason; the placeholder note is not shown as a reason), **Ask quality** (only checks the payload proves: official job link present, a note with the ask, a document attached — no score, no invented "Strong"), and the `GoalLockedPanel` with the real document count.
5. **Decision bar.** `GoalDecisionBar` pinned with `position {index, total, onPrev, onNext}` (desktop arrows, J/K hints), secondary `Pass privately` (opens `GoalPassReasons`, none preselected, confirm disabled until a reason is picked), primary `Accept & connect`. A non-pending row shows its status instead of the bar and keeps the existing "Open conversation" link.
6. **Accept confirm.** The primary opens one `GoalSheet`: the comp's accept note ("Accepting shares names both ways and their resume. Referring comes later, through `<company>`'s own process."), Cancel, and the single primary that posts `{ decision: "approved", ethicsConfirmed: true }`. The server's `ethicsConfirmed` rule (§2) is why the comp's one tap becomes one tap plus one confirmation.
7. **Phone.** Selecting a row opens the ask in place of the list (state, not route), with `GoalDetailPane`'s phone sub-header (back to the queue, `n / N`, previous/next); the same `?request=<id>` query keeps working for `/referrer-home` deep links and the back control clears it.
8. **States.** Signed out → one primary "Use company email" to `REFERRER_SIGN_IN_HREF`; checking → `GoalSkeletonRows` with `aria-busy`; access error → `GoalErrorState` with Retry; unverified → "Verify your work email." with one primary; first load → skeleton rows and the shared slow-load line; load error → `GoalErrorState` with Try again and "Nothing changed on your side."; empty → the private impact counts (mono), the credits context card, the fast-track card and the one "Open referral capacity" action; accept race → the existing "Another employee accepted this request a moment earlier" wording on an ink alert.
9. **No leaks.** No seeker name, file name, file link, file id, plan, referrer id, display ref (the payload sends none) or preview/sample data; no compensation; no crimson anywhere on this surface.
10. **One primary per screen.** The list has none; the opened ask's only solid element is `Accept & connect`; the accept sheet re-uses it as its own confirm; every gate has exactly one primary.

## 5. Files

- **In scope (edit only these):**
  - `client/src/pages/MyCompanyInbox.tsx` (orchestration of data and states; the surface itself moves into `components/queue/`)
  - `client/src/components/queue/QueueShell.tsx`, `QueueList.tsx`, `QueueAsk.tsx`, `queueRow.ts` (new)
  - `client/src/components/queue/queueRow.test.ts` (new, pure mapping)
  - `client/src/pages/myCompanyInbox.goal.test.tsx` (new)
  - the four existing `myCompanyInbox.*.test.tsx` files (rewritten to the goal surface, every intent kept)
  - `client/src/components/goal/goalBoundary.test.ts` (allowlist: the new importing files)
  - `client/src/App.tsx` (route)
  - `shared/roleTitle.ts`, `shared/whyMe.ts`, `server/roleTitle.test.ts`, `server/whyMe.test.ts` (the D-077(4) readers, moved here with their first live consumer)
  - this packet; `docs/KIT_V4_BUILD_PLAN.md` §3b row; `AGENTS.md` D-048 program line; `docs/DECISIONS.md` D-048 status cell
- **Read only:** `DESIGN.md`, `design/goal-ui/pick/referral-queue.{html,css,png}`, `client/src/components/goal/*`, `client/src/components/referrer/*` (the Kit parts stay for unmoved surfaces), `shared/referrerAskView.ts`, `shared/passReasons.ts`, `shared/askNote.ts`, `client/src/hooks/useReferrerAccess.ts`.
- **Out of scope (never edit here):** `server/**` (except the two reader tests above being *added*), `drizzle/**`, `client/src/components/goal/*` behaviour, `shared/passReasons.ts`, `.env*`, money, auth, routing guards.

## 6. Non-goals

- No display ref: `main`'s payloads send none, and inventing an `R-` code would break rule 9. The mono ref line in the comp stays empty until the server ships one.
- No assigned-ask "three reasons" panel beyond the seeker's own note; no quality score; no referrer metrics; no compensation.
- No change to the inbox/preview/one-click routes, the credit effect of a pass (D-035 lane), or the verified-referrer gate.

## 7. Verification

- `node scripts/design-token-audit.mjs` stays green (no hex, no Kit tokens, no `g-trust` outside `GoalVerifiedMark`, no comp sample data in `client/src`).
- `pnpm check`; `pnpm vitest run` on the five page test files + `queueRow.test.ts` + the goal primitive tests; the full suite; `pnpm build`.
- Red-first: `queueRow.test.ts` written before the mapper; the goal tests written before the page rewrite and seen to fail on the old page.
- Captures at 1280 and 390 of the list and the opened ask, compared with `design/goal-ui/pick/referral-queue.desktop.png` and `.mobile.png`.
- Every existing intent in the four `myCompanyInbox.*` test files is preserved in the rewritten files (sign-in routing, capacity action, function + company heading, new-then-saved order, `?request=` deep link, accept/pass notices, race error, unhandled-rejection guard, access states).

## 8. Open questions (owner or CEO)

1. The comp shows four ask-quality checks including "Ask strength: Strong"; the payload proves three facts and no strength, so the surface shows only those three. A strength signal needs a server field and a decision (D-023): 4/10, and it risks scoring the person rather than the ask.
2. The comp's accept is one tap; the server refuses an unconfirmed accept, so the surface keeps an explicit confirm sheet. Turning that off is a server change and an ethics decision, not a UI one.
3. The list keeps the credits *context* card in its empty state (existing behaviour, D-067 follow-up) while the shell shows no pill. If that card should go too, it is a separate rendering decision for referrer surfaces.
