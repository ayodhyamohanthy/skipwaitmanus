# Packet D-090-BYOR: invite your own insider with a one-time link

> Read `docs/BRIEF.md` first, then this packet. You need nothing else unless a section below names it.

| Field | Value |
|---|---|
| Queue row | `docs/plans/assignments.json` → `D-090-BYOR` (the picker reads it). Its status goes in the `docs/KIT_V4_BUILD_PLAN.md` §3b row "D-090" (added by D-154; this task is its only one, D-134) |
| Decisions | D-090 (approved for build), D-162 (gate waived, BYOR builds now), D-086 (demand list), D-087, D-089, D-097, D-082, D-034, D-047, D-061, D-062, D-050, D-055, D-030/D-049, D-019(e), D-057, D-060, D-066(4), D-088, D-120, D-068, D-109 |
| Risk tier | 1 (money, identity, privacy, migration) |
| Size | L (five commits, server + client + migration; split only along §6) |
| Implementer | senior model only |
| Branch | `agent/claude/d090-byor` from the latest `origin/main` |
| Depends on | Nothing in the queue: the owner waived the D-086 gate (D-162). D-097 QA before the flags go on |
| Do not run at the same time as | D-132-audit items that edit the delivery functions named in §5 (D-038 is done); the D-048 ask/explore lanes; D-086 (demand list). All edit `server/db.ts` or the My asks / Explore surfaces. D-086-demand-list's build waits for this row (D-162). D-048-p3-live-review-requests landed the redesigned My asks on Oct 23 (#533), so C5 builds into that page (D-162 update) |
| Verified against | `main` `d54c0ca8` on 2026-10-23 |

## 0. Build gate (read before claiming a branch)

**D-162 (Oct 23, owner word): BYOR builds now; this gate is waived.** The owner waived it in workbuddy · b0eb's session at 02:26 IST and confirmed it to the CEO on Oct 23, after D-154 had briefly made this row wait for `D-086-demand-list`. The dependency is ordering, not code: BYOR needs only a *waiting* ask, which D-034 produces whenever a company has no available referrer. The demand list's build now follows this one. **C5 builds into the redesigned My asks (D-162, updated at landing):** `D-048-p3-live-review-requests` landed on Oct 23 (#533), so nothing holds C5 any more. Build C1-C5 in order and put the invite action into `client/src/pages/MyRequests.tsx` as it is on `main` now: the page keeps its goal line and its one black commit (D-150), so the invite action is a ghost button or a plain link on a waiting ask, never a second black commit. Every other rule in this packet stands, except the D-086 checks in §9 and §11, which are struck: both flags stay off (D-097), and the Tier 1 gate and independent review are unchanged. **Resuming `agent/claude/d090-byor`:** merge `main`. `docs/DECISIONS.md` conflicts on the D-148 row: keep `main`'s side and drop the branch's D-148 row, because D-162 records the waiver and `main`'s D-148 is the plan names. This packet merges without a conflict, so delete by hand the branch's "Gate waived by the owner (D-148 ...)" paragraph in this §0 and its "in progress — workbuddy · b0eb" Status line; and renumber `0107_ask_invites.sql` to the next free number at landing (check `drizzle/deploy/` on `main` and plan §5 at landing: on Oct 23 `main` has `0107_seeker_levels.sql` and `0108_landed_thank_you.sql`, and open branches hold 0108-0109 (#523) and 0110 (#527), so it is 0111 or later). The two paragraphs below are history.

D-090: "Builds after the demand list (owner order 2,1,3 per D-089)." The demand list is D-086 (asks at companies not in the directory, k-anonymous counts). On `main` at `c39ad909` **D-086 is not built and has no queue task**: `/explore` still lists only directory companies, and grepping `docs/plans/assignments.json` for `D-086` returns nothing.

**D-154 (Oct 23, superseded by D-162):** the demand list now has its queue row, `D-086-demand-list`, and this row depends on it, so the picker hands out no BYOR work until the demand list is done. So: before writing code, check that D-086 is live (its ask-to-any-company path ships and its queue task is `done`). If it is not, **stop and report** (§11) — the owner ordered BYOR after it. This packet exists so the work is ready the day the gate opens; writing the packet is the whole of the current task (D-074, D-109).

The four designer mocks the owner approved (D-090, "Lovely") are **not in the repository**: no file under `design/`, `docs/` or the remote branches contains a BYOR mock. §4 is therefore the changeable functional interpretation (D-109) and §12 Q5 asks the owner to attach the mocks. Nothing in §4's server behaviour depends on the visual mocks.

## 1. Goal

A seeker who already knows someone at the company — a friend, a former colleague — can put their ask directly in that person's hands instead of waiting for coverage to appear. My asks shows "Invite someone you know"; the seeker gets one private one-time link to send outside SkipWait; the insider opens it, signs in with their work email at that company, and takes the ask. The credit follows the standard rules: nothing is spent while the ask waits, one credit at first visibility, and no credit means the ask is held with one notice — never delivered free, never billed later. The seeker's name and files stay hidden until the insider accepts, exactly as on every other surface. This closes loop L2 (D-087) and is the first product surface that turns a seeker's own network into supply.

## 2. Binding rules (quoted, not paraphrased)

**D-162** (owner word, Oct 23): BYOR builds now, ahead of the demand list. Where D-090 and D-087 below put the demand list first, D-162 wins for BYOR.

**D-090** (owner, Oct 21 03:10 IST): "**BYOR (bring-your-own-referrer) one-time link approved for build (idea 2, loop L2).** Owner Oct 21 03:10 IST, verbatim: "Lovely" (approving the designer's four-surface mocks, phone stepper pattern and standard credit rules; free BYOR stays frozen). Changeable knobs per D-087: weekly link cap 5 per seeker, anonymous-by-default referrer identity. Builds after the demand list (owner order 2,1,3 per D-089)."

**D-087**: loops L1–L6; build order demand list → L2 (BYOR) → L4 → L5; real counts, no seeker details, referrers are never charged; weekly cap 5 and anonymous referrer identity are the changeable knobs.

**D-097**: every new feature ships behind a flag off until QA verifies it.

**D-034 / D-047**: "An ask costs no credit until a referrer can see it" (D-034); at first visibility the credit is spent once under `ask-delivery:<requestId>`; "a seeker with no credit at that moment has the ask held — never delivered free, never billed later" (D-047).

**D-061**: "an ask that waited out its 90 days without ever being charged simply closes — nothing was ever reserved, so no money moves".

**D-062**: hand-off gives a newly available referrer their company's waiting asks oldest first, bounded by their remaining capacity; a held ask with no open referrer returns to plain waiting.

**D-050**: an assigned ask with no recorded claim (a personal link or a queue allocation) counts as unclaimed: it withdraws and expires with its credit back, 7 days from first visibility.

**D-055**: "Referrers never pay and are never paid". No path in this packet charges or rewards a referrer.

**D-030 as amended by D-049**: referrer sign-in is the work-email code only, on every referrer-facing surface, through `referrerSignInHref()`; never `SignInButton` or `openSignIn`.

**D-019(e) / preview contract**: "The referrer sees your role and note — not your name or resume — until they accept." A locked file count before acceptance; named files only while access is active after it.

**D-057** (not live): a later session gate adds `amr: work_email_otp` to the session and enforces it on referrer action routes. This packet does not add that middleware; it adds its claim route to D-057's required list when D-057 lands.

**D-060**: a pending action gets one transactional email with a direct link, at most one per person per day, preferences respected. There is no email-preference or daily-cap store yet, so this packet ships in-app notices only (§12 Q4).

**D-088 / D-120 / D-068**: fullstack slice inside an existing flow, goal UI only, docs updated in the same push as the code; captures at 1280 and 390.

**D-082**: pull request first; every check green on that exact commit before `main`.

## 3. Current behaviour (verified)

1. `createCompanyReferralRequest` (`server/db.ts:1862`) resolves an eligible referrer set and computes `coverageStatus`/`isWaiting` at `server/db.ts:1906-1909` (`companyCoverageStatus`, `server/db.ts:1511`). A waiting ask bypasses the open-ask cap (`server/db.ts:1912-1914`), spends nothing, writes no referrer notice, and inserts a `companyCoverageInvitations` row with an `inviteCode` (`server/db.ts:1985`) — that invitation invites a colleague to *become a referrer*, which is a different product from BYOR.
2. Delivery is `deliverWaitingAskTx` (`server/db.ts:2686`): it locks the ask row (`for("update")`), refuses non-pending/unassigned asks and the seeker themself, checks `isOpenReferrer` with allocated slots, runs the blocked-pair guard, then locks the wallet and spends `askDeliveryKey(requestId)` (`server/coverageDelivery.ts:27-28`) at the stored `askCosts.creditCost` (or `askCreditCost`); on `InsufficientCreditsError` it sets `coverageHeldAt` and writes one `coverage_held` notice; otherwise it flips `referrerId`, `waitingForCoverage=false`, `coverageVisibleAt=now`, allocates a `referralAvailabilitySlots` row with `activeRequestKey: request:<id>`, writes `coverage_delivered` + `ask_new`, and logs `coverage.delivered`.
3. Hand-off to a newly available referrer is `handOffWaitingAsksToReferrerTx` (`server/db.ts:2759`) over `listDeliverableWaitingAsksTx` (`server/db.ts:2743`), oldest `coverageQueuedAt` first. `listDeliverableWaitingAsksTx` filters only `status='pending' AND waitingForCoverage AND referrerId IS NULL`; it has no reservation concept. It is called by `deliverWaitingAsksToReferrer` (`server/db.ts:2784`) from the OTP enrollment path (`completeWorkEmailOtpEnrollment`, `server/db.ts:1526`, line 1571) and from `openCompanyReferralAvailability` (`server/db.ts:2818`).
4. The sweep is `tryDeliverWaitingAsk` (`server/db.ts:2799`): it locks the ask, loops `selectDeliveryCandidatesTx` (`server/db.ts:2662`), calls `deliverWaitingAskTx` per candidate, and returns a held ask to plain waiting when no open referrer is left. `server/coverageDeliverySweep.ts:70` runs it for waiting (batch 100) and held (batch 100) asks under the hourly `coverage-delivery-retry` job.
5. Current runtime expiry is `expireStalePendingReferralRequest` (`server/db.ts:2428`): a waiting ask with no debit closes after 90 days at no cost with `coverageWaitExpiredNotice`; an unclaimed assignment (D-050) releases and refunds through `recordHeldAskReleaseTx` (`server/heldAsk.ts`); a visible unclaimed ask expires 7 days after `coverageVisibleAt` with its credit returned once. These clocks are not launch direction (D-174); remove them only after D-174-held-ask-reconfirm (D-193), through D-174-expiry-clock-removal. These are current runtime clocks until D-174's expiry-clock-removal row lands after D-193 reconfirmation.
6. Withdrawal is `withdrawCompanyReferralRequest` (`server/db.ts:2277`): a waiting ask closes with no refund and clears the waiting flags; an unclaimed assignment releases through `recordHeldAskReleaseTx`.
7. Passing is `passReferralRequestTx` (`server/db.ts:2143`): it clears `referrerId`, releases the slot and reopens the referral request to other employees (D-038); every employee decline keeps the credit spent regardless of reason (D-147).
8. `/api/company-referrals/mine` (`server/privateReferralRoutes.ts:1070`) reconciles stale asks on read, computes `expiresAt` from `getAskShelfLifeEndsAtMs`, filters blocked rows and returns `{ requests, expiredRequestIds, hasEverAsked, slots? }`. The client schema is `client/src/components/requests/requestsApi.ts` (optional fields parse with `.catch(undefined)` so an older payload never breaks the page).
9. My asks is `client/src/pages/MyRequests.tsx`: goal UI, `askNextLine` at line 40, `AskRow` at 55, `PageHeading` at 76; it fetches only `fetchMyRequests()` and renders sample rows only for a first-timer.
10. Referrer sign-in helper: `referrerSignInHref(returnTo = "/referrer-setup")` in `client/src/lib/referrerSignIn.ts` builds `/sign-in?intent=referrer&returnTo=...` and only accepts same-origin paths. `client/src/pages/SignIn.tsx:33-56` shows `ReferrerOtpSignIn` and returns to that path.
11. The existing token-page pattern is `client/src/pages/EmailReviewAction.tsx`: no AppShell, `WorkEmailSignIn` when signed out, explicit loading/error states. Runtime noindex is done with a `useEffect` meta tag (`ReviewerSignIn.tsx:11`, `PublicProfile.tsx:87`); there is no `/r/:token` route in `client/src/App.tsx:121` today.
12. Feature flags are build-time only on the client (`client/src/lib/flags.ts`, today `COMPANY_RESPONSE_SIGNAL`); the server twin lives in `.env.example:234-238`. Server secrets reach the container only through `CONTAINER_ENV_KEYS` in `src/worker.ts:5`; `server/configContract.test.ts` fails on an undeclared or unforwarded key.
13. Schema: `referralRequests` (`drizzle/schema.ts:471`), `referralAvailabilitySlots` (`:628`, nullable unique `activeRequestKey` — the house pattern for "one active row"), `companyCoverageInvitations` (`:768`, `inviteCode` unique), `notifications` (`:686`, unique `eventKey`). Latest migration is `drizzle/deploy/0106_ask_costs.sql`; the next free number is **0107** (re-check at build time).
14. Scheduled jobs are named in `shared/scheduledJobs.ts:10` and registered in `server/scheduledJobRegistry.ts` (ask-expiry at 22, coverage at 85); `wrangler.jsonc` already fires one hourly cron, so a new hourly job needs only those two files.
15. D-017 personal links (`referrerFastTrackLinks`, `drizzle/schema.ts:639`) are the reverse direction: a referrer owns a standing link and seekers use it. BYOR is seeker-owned, ask-bound and one-time. Do not reuse `referrerFastTrackLinks` or `companyCoverageInvitations`.

## 4. Target behaviour (testable)

All of it is behind `BYOR_LINK_ENABLED` (server) and `VITE_BYOR_LINK` (client), both off. With the flag off every new API answers **404** before any database read, no action renders, and `/r/:token` shows the unavailable state without a request. Every invite read, lock and write on a delivery path is flag-gated too (Oct 24 CEO handoff item (c), D-097; supersedes this section's earlier "not flag-gated" sentence): with the flag off, hand-off and the retry sweep issue no query or lock on `askInviteLinks`, and the `ask-invite-expiry` job returns at once. A reservation therefore exists only while the flag has been on; flipping it off releases the hold and the ask continues under ordinary delivery, while a withdrawal or a runtime expiry still closes any active link inside its own transaction.

### 4.1 The link

1. `POST /api/company-referrals/:id/invite-link` (seeker authenticated, ask owner only) creates one link for one ask. Refuse with 404 if the ask is not the caller's (no existence leak).
2. Only a **waiting** ask (`status='pending' AND waitingForCoverage=true AND referrerId IS NULL`) can hold a link. Any other state answers 409 `ask_not_waiting`. Rationale: a visible ask is already in a referrer's hands, and reassigning it would fight the money rules. This is a changeable assumption (§12 Q2).
3. The raw token is 32 random bytes, base64url (43 chars). Only its SHA-256 hex is stored (`linkTokenHash`, 64 chars, unique). The raw token and the URL are returned **once**, in the 201 response; no read endpoint ever returns them again. A seeker who lost the link revokes and creates a new one.
4. At most one active link per ask, enforced by a nullable unique `activeRequestKey` (`link:<requestId>`, `NULL` when not active) — the same pattern as `referralAvailabilitySlots`.
5. A seeker may create at most **5 links per rolling 7 days** (all statuses counted, `createdByUserId`). Over the cap answers 429 `weekly_link_cap` with the date the next slot frees. A soft-cap race may allow one extra under simultaneous creates; that is accepted and documented in §8.
6. Links expire **7 days** after creation (`expiresAt`). Reason: a one-time ask link should not outlive the ask's own seven-day visibility clock or the seven-day review-link lifetime.
   Note (Oct 24): D-174 suspends the ask's own seven-day expiry for launch (the D-174 journey row owns that removal); the one-week link and reservation clocks in this packet are BYOR link lifetimes, not the ask's, and stand.
7. Creating a link is free, writes no notice and **does not reserve** the ask. (Oct 24: D-194's own text scopes it to the standing /share personal referral link - "gates /share link issuance only". This ask-bound one-time link is a different endpoint and surface (`POST /api/company-referrals/:id/invite-link`), approved under D-090 (owner, Oct 21). Do not read "free" here as covering the /share standing link.) Normal coverage delivery keeps running in parallel; if a referrer takes the ask first, the link closes (§4.5).

### 4.2 My asks

Terminology (Oct 24): user-facing copy is referral-only per D-180 (settled; docs sync landed in #617). The ask-era strings in this section predate D-180 and yield to it at build time; money copy stays byte-identical to shared sources (D-132/D-135).

8. Each `/api/company-referrals/mine` row may carry `askInvite: { state: "active" | "claimed" | "delivered" | "revoked" | "expired"; createdAt: string; expiresAt: string }` — never the token, URL, hash or claimer identity. Rows without a link simply omit it.
9. My asks shows, only on a waiting row: "Invite someone you know" (no link), "Link active · copy" + "Revoke" (active), "Your insider has it" (claimed or delivered), and nothing for revoked/expired (the action returns).
10. The invite sheet states the rules in plain words: one use, 7 days, the insider must sign in with a work email at the company, the seeker's name and files stay hidden until acceptance, and the referral allowance is only used when someone can see the request. It offers copy and native share where available.
11. Revoke (`POST /api/company-referrals/:id/invite-link/revoke`) is owner-only, idempotent, and immediately kills the link. My asks asks for confirmation first.
12. `askInvite.state` maps from the row: `claimed` while a claimed reservation is pending, `delivered` once the ask is assigned to the claimer.

### 4.3 `/r/:token` landing

13. `GET /api/ask-invites/:token` returns a strict allow-list payload:
    - `state`: `open | used | expired | revoked | closed | unavailable`; `claimed_by_you` when the signed-in viewer is the claimer of a still-reserved link.
    - company display name, role title, job function, work mode/location — public ask facts the seeker chose.
    - `note` and `lockedFileCount` **only** for a signed-in verified employee of the ask's company who is not the seeker and not blocked; signed-out and other-domain viewers see company + role + a sign-in prompt.
    - never: seeker name, email, user id, attachments, plan, wallet, referrer existence, the claimer's identity, or any sequential ask id.
14. Unknown token, feature flag off, and a blocked viewer all return the same 404 `{ error: "This link is not available" }`; the client renders one neutral state. No enumeration.
15. `used` (a consumed link seen by anyone but its claimer) says only "This link has already been used." `closed` covers a withdrawn, expired or otherwise delivered ask. Expired/revoked each get their own plain sentence.
16. All link endpoints send `Cache-Control: no-store`. The landing page sets runtime `<meta name="robots" content="noindex,nofollow">`. `/r/` is not added to `shared/publicRoutes.ts`; the raw token never enters an operational log, analytics event or error message (log `linkId` only).
17. Signed out, the page offers `referrerSignInHref("/r/<token>")`; `SignIn.tsx` already returns there. Signed in without a verified work email at that company, it says the link needs a work email at `<company>` and offers the same sign-in.

### 4.4 Claim

18. `POST /api/ask-invites/:token/claim` (authenticated) claims the link for the caller. Preconditions, all re-checked inside one transaction that locks **ask → link** in that order:
    - flag on; else 404.
    - link exists (by hash) and `status='active'`, `expiresAt > now`; else 409 with the landing state's message.
    - ask is `pending`, `waitingForCoverage`, `referrerId IS NULL`; else 409 `ask_unavailable`.
    - caller is not the seeker; caller has a verified work email at the ask's company domain (same predicate as delivery: `isVerifiedReferrer` / exact `companyDomain` match); else 403 `company_email_required`.
    - caller is not blocked with the seeker, either way (existing fail-open `server/blockedPairs.ts` policy + Sentry report); else 404 unavailable.
    - caller is not paused or suspended (same gate as the inbox).
    - caller has an open slot? **Not a precondition** — if capacity is full the claim succeeds and the ask is *reserved* (§4.5), not refused.
19. On success the link moves to `claimed` with `claimedByUserId`, `claimedAt`, `reservationExpiresAt = now + 7 days`, and `activeRequestKey = NULL`. Then the endpoint calls `tryDeliverWaitingAsk(requestId, now)` (the tested money path) and reports the real outcome: `delivered` (assigned, credit spent once, visible now), `held` (no credit: `coverageHeldAt`, one `coverage_held` notice, still reserved), or `reserved` (no open slot or no available candidate; reserved until the claimer has capacity).
20. A retry by the same claimer is idempotent: 200 with the current state, no second claim, no second debit (the debit key already guarantees one spend).
21. A second person opening the same link after a claim gets 409 `link_used` — never a reassignment. Concurrent claims serialize on the ask row; exactly one wins.
22. Claiming never opens messaging, never reveals the seeker's name or files, and never charges or pays the referrer.
23. Once claimed, the claimer sees the ask in their inbox under the normal pre-accept rules; accepting is the existing review path, which writes the document grant (D-019(e)). This packet adds no access path.

### 4.5 Reservation and every way an ask moves

24. A claimed reservation makes the ask belong to `claimedByUserId` for up to 7 days: `deliverWaitingAskTx` refuses any other referrer while the reservation is live, `listDeliverableWaitingAsksTx` excludes it from another employee's hand-off, and `tryDeliverWaitingAsk` delivers it only to the claimer. When the claimer opens capacity (`openCompanyReferralAvailability` or OTP enrollment hand-off), the reserved ask is their first candidate, oldest first, under the existing capacity bound.
25. When the claimer has no credit at claim time the ask is *held* exactly as D-047 defines, and stays reserved so a later credit delivers it to them and not to a stranger. The existing hourly sweep retries it.
26. Reservation expiry (7 days) marks the link `expired`, clears the reservation, and returns the ask to ordinary waiting/held handling; the seeker gets one in-app notice. The claimer gets one in-app notice that the link lapsed.
27. Normal coverage delivery wins over an unclaimed link: if `deliverWaitingAskTx` assigns the ask to another employee, the active link closes as `expired` in the same transaction. The claim endpoint then answers 409 `ask_unavailable`. The seeker's My asks line updates to the delivered state.
28. Seeker withdrawal and any other actual closure, including a legacy expiry closure while the current runtime clock remains live, close an active link as `expired`/`revoked` in the same transaction, so a stale token can never claim or reassign a closed ask. D-174 suspends the 90-day waiting close and 7-day visible expiry as launch direction; the runtime clocks remain until `D-174-expiry-clock-removal` lands after `D-174-held-ask-reconfirm` (D-193). Treat expiry only as a runtime caveat, not an intended BYOR lifecycle. BYOR link expiry and reservation expiry remain separate clocks. A pass after acceptance does **not** reopen the link (it is one-time); the existing pass rules reopen the ask to other employees.
29. The hourly job `ask-invite-expiry` (batch 200, oldest first) expires links past `expiresAt`, expires reservations past `reservationExpiresAt`, closes links whose ask is no longer waiting, and writes each notice once per link. It is registered in `shared/scheduledJobs.ts` + `server/scheduledJobRegistry.ts` only — no new cron.
30. Each expiry/closure is idempotent: re-running the job changes nothing and sends no second notice.

### 4.6 Money (unchanged, proven)

31. A waiting ask costs nothing (D-034). A claim that delivers spends exactly one credit under `ask-delivery:<requestId>` — the existing key, so creation-time coverage and a BYOR claim can never spend twice. A held claim spends nothing. A reservation that lapses spends nothing. The current runtime still expires a visible unclaimed ask and returns its credit under the legacy clock; D-174 supersedes that expiry as launch direction until `D-174-expiry-clock-removal` lands after `D-174-held-ask-reconfirm` (D-193). No BYOR task adds an ask-expiry or refund path.
32. The credit a BYOR claim spends is the same stored level cost (`askCosts.creditCost`) the delivery path already reads; no new price, plan or entitlement.
33. Every new link action is an `operationalActivityLogs` row (`ask_invite.created|opened|claimed|delivered|held|reserved|revoked|expired`) with `requestId`, `linkId`, outcome and never a token, email or name.

## 5. Files

- **In scope (edit only these):**
  - New: `drizzle/deploy/0111_ask_invites.sql`, `shared/askInvites.ts`, `server/askInvites.ts`, `server/askInviteRoutes.ts`, `server/askInviteSweep.ts`, `client/src/components/requests/AskInviteSheet.tsx`, `client/src/components/requests/askInviteApi.ts`, `client/src/pages/AskInviteLink.tsx`, and their tests.
  - `drizzle/schema.ts` (new table only), `server/schemaReconcile.ts` (table, unique indexes, FK).
  - `server/db.ts` (**surgical only**): `deliverWaitingAskTx`, `listDeliverableWaitingAsksTx`, `listReservedWaitingAsksForReferrerTx` (the reserved-first helper this packet adds), `tryDeliverWaitingAsk`, the close hooks in `withdrawCompanyReferralRequest` and `expireStalePendingReferralRequest`, and the assignment hook at the end of `deliverWaitingAskTx`. No other function body.
  - `server/coverageDeliverySweep.ts` only if the reserved-ask routing needs it (preferred: keep it in `tryDeliverWaitingAsk`).
  - `server/privateReferralRoutes.ts` (**mine payload only**, line ~1070 block); `server/_core/index.ts` (one registration line).
  - `shared/scheduledJobs.ts`, `server/scheduledJobRegistry.ts`.
  - `.env.example`, `src/worker.ts` (`CONTAINER_ENV_KEYS`), `server/configContract.test.ts`.
  - `client/src/lib/flags.ts`, `client/src/components/requests/requestsApi.ts`, `client/src/pages/MyRequests.tsx`, `client/src/App.tsx`, `client/src/components/goal/goalBoundary.test.ts` (allowlist entry for the new goal-UI page/components).
  - `functions/_middleware.ts` (the one `"/r/:token"` line in `KNOWN_ROUTE_PATTERNS`, D-187 (3)); the QA runner `scripts/qa/d090-byor.mjs`, `scripts/qa/fixtures/d090-byor/**` and `artifacts/d090-c6/**`; the `askInviteLinks` fixture line in `server/db.askExpiry.test.ts`; the `/api/ask-invites/` token scrub in `server/sentry.ts` and `server/errorAlerting.ts`.
  - Docs: the `docs/KIT_V4_BUILD_PLAN.md` §3b row "D-090" (its status cell only), `docs/plans/assignments.json` (status only), `AGENTS.md` living-map row, `docs/PRD.md`, `docs/BACKLOG.md`, `docs/DECISIONS.md` sync cell for D-090 (no decision text).
- **Read only:** `server/coverageDelivery.ts`, `server/heldAsk.ts`, `shared/referral.ts`, `server/blockedPairs.ts`, `server/blockEnforcement.test.ts`, `shared/referrerAccess.ts`, `server/_core/otpLogin.ts`, `client/src/lib/referrerSignIn.ts`, `client/src/pages/EmailReviewAction.tsx`, `client/src/pages/SignIn.tsx`, `server/emailDelivery.ts`, `server/db.askCostStored.test.ts` (fixture pattern).
- **Out of scope (never edit here):** `server/payments.ts`, `server/paymentWebhooks.ts`, `server/chargebee*`, `server/checkout*`, `shared/planCatalog.ts`, `shared/billingCatalog.ts`, `server/creditCycles.ts`, `server/_core/workosAuth.ts`, `server/_core/otpLogin.ts`, the decision text in `docs/DECISIONS.md`, any migration below 0107, D-057's session gate (unbuilt server code, `docs/plans/D-057-session-gate.md`; not `functions/_middleware.ts`, D-187 (2)), and every other page's UI.

## 6. Steps (one commit each)

**C1 — contract, flag, migration.**
Add the `askInviteLinks` table to `drizzle/schema.ts`, `0111_ask_invites.sql`, the `server/schemaReconcile.ts` entry (table, `ask_invites_token_hash_unique`, `ask_invites_active_request_unique`, `ask_invites_request_idx`, `ask_invites_status_expiry_idx`, FK cascade to `referralRequests`), `shared/askInvites.ts` (statuses, `ASK_INVITE_TTL_MS = 7 days`, `ASK_INVITE_RESERVATION_MS = 7 days`, `ASK_INVITE_WEEKLY_CAP = 5`, landing/claim state types), `.env.example` (`BYOR_LINK_ENABLED=`, `VITE_BYOR_LINK=`), `src/worker.ts`, `client/src/lib/flags.ts`, and the config-contract test. Tests: config contract + a schema round-trip. Commit: `Add the BYOR link table, flag and contract`.

**C2 — create, revoke, My asks payload.**
`server/askInvites.ts` (`createAskInvite`, `revokeAskInvite`, `listAskInvitesForRequests`, token hashing), `server/askInviteRoutes.ts` (create/revoke), registration in `server/_core/index.ts`, the `askInvite` field in the `/mine` block, `requestsApi.ts`. Tests: §7 S1–S4. Commit: `Create and revoke BYOR links from My asks`.

**C3 — landing and claim.**
`GET /api/ask-invites/:token`, `POST /api/ask-invites/:token/claim`, the reservation lookup and guard in `deliverWaitingAskTx`, the anti-join in `listDeliverableWaitingAsksTx`, the reserved-first path in `tryDeliverWaitingAsk`, and `ask_invite` close hooks in the delivery flip. Tests: §7 S5–S10. Commit: `Claim a BYOR link and hold the ask for its insider`.

**C4 — expiry, revocation hooks, notices, job.**
`server/askInviteSweep.ts`, registration in the two job files, close hooks in `withdrawCompanyReferralRequest` and `expireStalePendingReferralRequest`, notices and activity rows. Tests: §7 S11–S13. Commit: `Expire BYOR links and release their asks`.

**C5 — client surfaces.**
`/r/:token` page + route (`client/src/App.tsx`, noindex meta, `referrerSignInHref`), `AskInviteLink` states, My asks action + `AskInviteSheet` + revoke confirmation, goal-UI boundary allowlist. Tests: §7 C1–C4; captures at 1280 and 390 for: My asks waiting row, sheet, landing signed-out, landing signed-in verified, claimed/held. Commit: `Add the invite sheet and the /r/:token landing page`.

**C6 — docs and handover.**
The §3b row "D-090" status cell, `assignments.json`, `AGENTS.md` living map (new routes/modules/job), `PRD.md`, `BACKLOG.md`, `DECISIONS.md` sync cell. Attach the captures and the QA script (flag on in a test environment). Commit: `Sync BYOR docs, status and captures`.

Every commit leaves `pnpm check` and its focused tests green and is pushed. Do not open the PR until C1–C6 are all green; then the usual Tier 1 draft PR and independent review.

## 7. Tests to write first (red before the fix)

**Server — contract and link lifetime**
- S1 `server/askInvites.test.ts`: creates a link for a waiting ask → 201, 43-char base64url token, stored value is its SHA-256 (not the token), `activeRequestKey = link:<id>`; a second create while active → 409 `link_active`; a create for a visible/unassigned ask → 409 `ask_not_waiting`; a non-owner create → 404; a 6th create in 7 days → 429 (5 succeed), and the 6th succeeds after the window rolls. Today: no route.
- S2 same file: revoke is owner-only and idempotent; after revoke the landing state is `revoked` and claim → 409. Today: no route.
- S3 `server/askInvites.expiry.test.ts`: past `expiresAt` the landing says `expired` and claim → 409 before the sweep runs (the check is in the path, not only in the job). Today: no route.
- S4 `server/askInvites.minePayload.test.ts` (new; the `/mine` route block has its fixture in `server/privateReferralRoutes.integration.test.ts`): a waiting row carries `askInvite.state` and the ISO dates; no token/hash/claimer fields appear; a row without a link omits the key; an old payload still parses in `requestsApi`. Control: the existing mine assertions (blocked filter, `expiresAt`, `slots`) unchanged.

**Server — landing privacy**
- S5 `server/askInviteRoutes.test.ts`: unknown token → 404 identical body; flag off → 404 before any DB call (spy asserts no query); `Cache-Control: no-store`; signed-out payload has company + role only (no `note`, no `lockedFileCount`, no name/files/email/userId); verified same-domain signed-in payload has `note` + `lockedFileCount` and still no name/files; other-domain employee gets the signed-out shape; the seeker opening their own link gets the signed-out shape; blocked viewer gets the unknown-token 404. Today: no route.
- S6 same file: `used` payload for a non-claimer contains no claimer identity; the claimer gets `claimed_by_you`; `closed` for a withdrawn/delivered ask. Today: no route.
- S7 `server/askInviteRoutes.test.ts`: no response body ever contains the raw token except `POST .../invite-link`; recorded activity has `linkId` and no token/email/name. Today: no route.

**Server — claim and money**
- S8 `server/askInviteClaim.test.ts` (DB fixture like `server/db.askCostStored.test.ts`): a verified same-domain employee claims → ask assigned, `waitingForCoverage=false`, `coverageVisibleAt` set, one `referralAvailabilitySlots` row, exactly one `tokenTransactions` row for `ask-delivery:<requestId>`, `coverage_delivered` + `ask_new` notices, link `claimed`/`delivered` with the reservation cleared. Today: no route.
- S9 same file: claim by another domain → 403 with no state change; the seeker claiming their own → 403; a paused/suspended employee → 403; a blocked pair → 404 and no write; a second claimer after the first → 409 and no second debit (count `tokenTransactions`); a retry by the same claimer → 200 same state, still one debit; concurrent claims by two users against the same link → exactly one winner and one debit.
- S10 same file: no credit at claim → link `claimed`, `reservationExpiresAt` set, `coverageHeldAt` set, one `coverage_held` notice, zero debits; a full-capacity claimer → `reserved` with no debit; after `openCompanyReferralAvailability` the reserved ask goes to the claimer (not to another employee) and spends once; reservation expiry returns the ask to ordinary waiting and a different referrer can then receive it.

**Server — reservation guard and closures**
- S11 `server/askInviteReservation.test.ts`: while a reservation is live, (a) `deliverWaitingAsksToReferrer` for another employee skips the ask (S1 `listDeliverable` anti-join), (b) `tryDeliverWaitingAsk` delivers it only to the claimer, (c) `deliverWaitingAskTx` called directly for another employee returns waiting. Controls: unreserved asks hand off exactly as today (existing `server/coverageDelivery*.test.ts` green).
- S12 same file: normal coverage delivery to another employee closes the active link in the same transaction and the claim then answers 409; withdrawal and ask expiry close the link; a pass after acceptance leaves the link `claimed` and it can never be used again. Control: D-050 unclaimed-assignment withdrawal/expiry still refunds once (`server/db.referralPassReopen.test.ts`).
- S13 `server/askInviteSweep.test.ts`: the job expires links and reservations in one run, batch 200, oldest first, writes each notice once, re-runs with zero changes; a link whose ask was withdrawn/delivered between runs is closed; a claimed-delivered link is untouched. Today: job absent.

**Client**
- C1 `client/src/pages/myRequests.invite.test.tsx` (new): "Invite someone you know" only on waiting rows; with the flag off no action renders and no request is made; the sheet states the rules and shows the one-time URL with copy; revoke confirms and then hides the action; `claimed`/`delivered` render "Your insider has it". Controls: `myRequests.goal.test.tsx`, `myRequests.pendingStates.test.tsx`, `myRequests.withdraw.test.tsx` unchanged.
- C2 `client/src/pages/AskInviteLink.test.tsx`: `/r/:token` signed-out → company + role + `referrerSignInHref("/r/<token>")` link, no note; verified payload → note + locked count; `used/expired/revoked/closed/unavailable` each render their sentence; flag off renders the unavailable state without calling the API; the page sets the noindex meta.
- C3 same file: claim success → delivered/held/reserved message matching the server state; 403 `company_email_required` links to sign-in; 409 `link_used` / 404 render the neutral state; no raw token is written to the DOM outside the URL path.
- C4 `client/src/components/goal/goalBoundary.test.ts` stays green (allowlist updated only for the two new goal-UI files).

**Controls that must stay green:** `server/db.coverageDelivery.test.ts`, `server/coverageDeliverySweep.test.ts`, `server/askExpirySweep.test.ts`, `server/db.referralPassReopen.test.ts`, `server/blockEnforcement.test.ts`, `server/privateReferralRoutes.integration.test.ts`, `client/src/pages/loginRule.test.tsx`, `client/src/pages/signIn.test.tsx`, `server/configContract.test.ts`, and the full suite.

## 8. Edge cases and races

1. **Lock order is fixed: ask → link → referrer profile → wallet.** Creation locks the ask (owner check) then the wallet is untouched. Claim, revoke and the sweep lock the ask first, then the link. `deliverWaitingAskTx` already locks the ask, then the profile, then the wallet; the new reservation read sits immediately after the ask lock. Never lock a link before an ask.
2. **Two claims** serialize on the ask row; the loser re-reads the link and gets `link_used`. Exactly one debit exists because the money key is the request id.
3. **Claim vs normal delivery**: whoever locks the ask first wins. If delivery wins, it closes the link in the same transaction; the claim sees a closed ask. If the claim wins, it marks the link claimed and the delivery is then gated by the reservation.
4. **Claim vs withdraw/expiry**: both lock the ask; the loser sees a non-pending ask and answers 409, never a partial write.
5. **Sweep vs claim**: same order, serialized by the ask lock. The sweep never expires a link whose `expiresAt` the claim path is about to re-check.
6. **Soft cap race**: two simultaneous creates by one seeker can both read 4 and create a 5th and 6th. Accepted (anti-spam cap, no money). A test asserts ≤6, not exactly 5, under concurrency; sequential creates enforce 5.
7. **Feature flag flipped off**: creation/landing/claim stop (404) and the client hides the action; existing reservations still bind delivery so an ask is never given to a stranger. Reservations expire normally.
8. **Token leakage**: hashed at rest, returned once, never logged, never in analytics, `no-store`, noindex, no `publicRoutes` entry. Error messages never echo the token.
9. **Blocked pair**: fail-open with a Sentry report, per the existing P0-block-delivery policy; landing and claim use the same shared helper as delivery.
10. **Company match**: exact `companyDomain` equality — the same predicate `deliverWaitingAskTx`/`selectDeliveryCandidatesTx` use. No suffix or parent-company matching.
11. **Timezone/clock**: all timestamps computed in JS (`Date.now()`), never `DB NOW()` (non-obvious invariant 5).
12. **Failures surface**: a failed claim transaction writes nothing; the client shows the mapped sentence and a retry is safe. A failed sweep is reported by the existing job runner (Sentry on failure).
13. **No half-built flow**: create → copy → open → claim → delivered/held/reserved → expire/revoke are all covered, including recovery from every failure above.

## 9. Definition of done

- [x] ~~D-086 is live~~ — gate waived by the owner (D-162); not a condition.
- [ ] Every §7 test was red first and is green now; every control is green; no existing assertion weakened.
- [ ] Gate on your commit merged with the latest `origin/main`: `pnpm check`, focused files, `pnpm test`, `pnpm build`, design-token audit, migration lint in CI.
- [ ] Tier 1 independent review passed (`docs/DELEGATION.md` §6); findings fixed red-first.
- [ ] Flags off in production; a QA pass with the flags on proves create → claim → delivered and create → claim → held/reserved on a test environment. No real-money QA.
- [ ] Docs in the same push: the §3b row "D-090" status cell, `assignments.json`, `AGENTS.md` living map, `PRD.md`, `BACKLOG.md`, `DECISIONS.md` sync cell.
- [ ] Pushed; API `verify-live-release.sh` CONVERGED on the exact commit; web `git-commit` meta matches; captures at 1280 and 390 for the five screens in C5.
- [ ] Status set to `done — <sha>` with the evidence block (`docs/DELEGATION.md` §5); report to the CEO.

## 10. Review checklist (for the independent reviewer)

1. Read §4.6 and prove on the diff that no money path changed except the new reservation hooks: the debit key is still `ask-delivery:<requestId>`, the stored cost is still `askCosts.creditCost`, and no refund rule moved.
2. Prove the reservation cannot be bypassed: find every caller of `deliverWaitingAskTx` and show each is gated; show `listDeliverableWaitingAsksTx` excludes another employee's reservation.
3. Prove the landing is privacy-safe on a signed-out request: company + role only; no name, files, email, ids, plan, referrer existence. Fetch the payload in a test, not by reading code.
4. Prove token hygiene: the raw token appears in exactly one response, hashes at rest, no log/analytics/error echo, `no-store`, noindex, no public route.
5. Prove identity: claim refuses other domains, the seeker, paused/suspended accounts and blocked pairs; a verified same-domain employee succeeds; D-030's referrer sign-in path is the only one offered.
6. Prove idempotency and races: two claims, claim vs delivery, claim vs withdraw, sweep vs claim each leave one consistent state.
7. Prove the ask's lifecycle after a claim: accept writes the document grant through the existing path (no new access); pass follows existing rules; the link stays dead.
8. Prove the sweep is bounded, registered, idempotent, and notices are once per link.
9. Check the clock rule (JS timestamps), the fail-open block policy, and the flag kill switch including in-flight reservations.
10. Check the client states at 1280 and 390 against `DESIGN.md`; no kit components, no ad-hoc colors; the goal-UI boundary test is green.

## 11. Stop and ask if

- ~~D-086 is not live~~ — waived by the owner (D-162); not a stop condition.
- The four approved mocks appear and contradict §4 (surfaces, copy, claim states) — report before building the client.
- A named function no longer matches its description (line drift is fine; a behaviour change is not).
- You need a file outside §5, a second migration, a new dependency or an env key not named here.
- The claim needs a new auth surface or D-057's middleware to be safe — record the gap in the Status line instead of inventing one.
- An email, preference or daily-cap table would be needed — that is D-060's lane; ship in-app notices and report.
- Any money path would need to change beyond the named debit key.
- A §4 rule seems to contradict the register: the register wins; stop and ask.

## 12. Owner questions

1. **Normal coverage wins over an unclaimed link?** Recommended default: yes — if a referrer picks the ask up before the insider opens the link, delivery wins, the link closes, and My asks says "A referrer picked it up". Rating 6 (standard rules; the alternative is to reserve on creation, which starves normal delivery).
2. **Waiting asks only?** Recommended default: yes — a link can only exist while the ask waits for coverage. Rating 7 (a visible ask is already in someone's hands; reassigning it risks the money rules).
3. **One-week link and reservation?** Recommended default: yes, matching the review-link and visibility clocks. Rating 7 (a longer reservation holds an ask out of coverage; a shorter one expires before a busy insider acts).
4. **Email now or in the D-060 lane?** Recommended default: in-app notices now; emails when D-060's preference and daily-cap store exists. Rating 6 (no store exists; sending without preferences would break D-060).
5. **Attach the four approved designer mocks.** §4 is the functional interpretation; the client should match the mocks' presentation once they are in the repo. Rating 8 (UI review cannot cite them today).
6. **Weekly cap basis.** Recommended default: 5 creations per rolling 7 days, all statuses counted (revoked and expired included). Rating 6 (stops link churn; a revoked-then-recreated link still counts).

Until answered, implement the recommended defaults above; they are changeable without touching money or privacy.

## Status
D-090-BYOR: H1/H2 findings fixed (Cline · e6d1, Oct 29) — the re-review of `2e0789f3` (Hark · 004c) raised two findings, both fixed red-first on `agent/claude/d090-byor`, tests only for H2. **H1 (P1, privacy §4.3.16)** `server/sentry.ts`: `init()` set no `beforeSend`/`beforeSendTransaction`, so `@sentry/node`'s own request scope carried the 43-character invite token in `transaction`, `request.url`, `request.headers.referer` and the http integration's `breadcrumbs[].data.url` (my failing test caught the breadcrumb, which the review had not listed). The scrubber is now unanchored and case-insensitive (`/r/` added), and runs over transaction, message, `request.url`, `request.query_string`, every request header, breadcrumb message/url-bearing data, and — in transactions — span descriptions plus `url`/`http.*` span attributes. Red-first proof: `server/sentry.test.ts` failed on the token present in a captured envelope, 1 failed / 2 passed; green after the fix, 3/3. **H2 (P3)** `AskInviteSheet.tsx`: the issued-link block now carries `data-clarity-mask="true"`, so the token cannot reach session replay whatever the dashboard masking mode; its test failed on the missing mask and passes after. Focused on `465b52e1`: `server/sentry` 3, `myRequests.invite` 8 → 11/11 new pins; `askInvites`, `.token`, `askInviteClaim`, `askInviteReservation`, `askInviteRoutes`, `askInviteSweep`, `errorAlerting`, `shared/askInvites`, client `sentry`, `clarity` — 10 files, 96 passed + 1 DB-gated skip; `pnpm check` exit 0; `scope-check D-090-BYOR` "85 owned path(s), every change inside them". **Not widened:** the older `/email-review/…` routes gain the same event-level redaction because they already share this scrub table, but their own route-level verification stays with FND-4, as the review asked. Flags stay off, nothing landed; independent re-review of the exact head required. Status stays in the §3b row "D-090".



D-090-BYOR: merged main (Qoder · 6503, Oct 29) — merge commit `47a8e083` brings `origin/main` `622d1b0f` into `agent/claude/d090-byor`; history is preserved (merge commit, no rebase, no force push) and the only overlap was the D-048 agents landing. Evidence on that head: GitHub CI green on the exact commit (typecheck, unit/component/route, production build, Workers); local `pnpm check`, design-token audit, migration lint under bash 5.3.20, deploy-trigger check, scope check and `pnpm build` green. The local full-suite failures are host load, not this branch: untouched `main` at `622d1b0f` fails the same classes under the same command (a 20 s `classifyCiChange` timeout, socket hang up, DOM timing), `onboardingGoal`/`startGoal` fail identically on untouched `main` when run alone on this host, and the BYOR telemetry tests pass alone. Payloads re-checked from captured envelopes with a synthetic 43-char token and a fake DSN: message, transaction, tags, extra, contexts, request URL/headers/query/data, exception text, nested-error extras and navigation/fetch breadcrumbs are redacted; query strings are dropped from event URLs by the existing scrub; ordinary telemetry (`/explore`, `/api/companies`, `100% healthy`, `job_seeker`, counts) is unchanged. Flags stay off; not landed; independent re-review of the resulting head (this status update included) is required. Status stays in the §3b row "D-090".

D-090-BYOR: fix round (Qoder · 6503, Oct 29) — the post-fix regression findings on `b6ac98e2` are fixed red-first on `agent/claude/d090-byor`: the token no longer rides out in Sentry `request.headers`/`query_string`/`data`, `tags`, `extra`, `contexts`, `transaction`, `message`, exception text or breadcrumb messages, and the scan is case-insensitive and encoding-tolerant (`%2F`, double-encoded, `%72`, malformed tails fail safe). Clarity now checks the decoded pathname and every query value, not only `returnTo`. Ordinary telemetry is asserted unchanged. Flags stay off, nothing is landed; independent re-review of the exact head is required. Status stays in the §3b row "D-090".

D-090-BYOR: fix round (Qoder · 329f, Oct 26; copy correction Oct 27) — all four Oct 24 review items are fixed on `agent/claude/d090-byor`: D-180 referral vocabulary across the landing and sheet, with tests that reject the word "ask" on those surfaces; the money line "Your referral allowance is only used when someone can see your request." (Oct 27 correction 2 adopts the referral-only freeze's allowance wording; behavior unchanged — the balance is debited only at first visibility in `deliverWaitingAskTx`, server/db.ts:2755, and flipping it to the request as the used unit was rejected); exactly one `claimed_by_you` message and the revoke footer hidden while its confirmation is open; and every invite read/lock on a delivery path plus the `ask-invite-expiry` job gated on `BYOR_LINK_ENABLED`, with flag-off hand-off and retry tests that fail if `askInviteLinks` is read. Refreshed viewport-true captures (1280x900; 390x844 at 2x = 780x1688) from the QA runner are in `artifacts/d090-c6` — 21 test files / 250 tests, 0px horizontal overflow, no unmatched API calls, and exit 2 is the documented local auth fallback, not a failure. Not landed; flags off; awaiting the independent re-review named on PR #632. Status stays in the §3b row "D-090".

D-090-BYOR: todo — D-162 (Oct 23): the owner's waiver stands and this row depends on nothing. workbuddy · b0eb's branch `agent/claude/d090-byor` holds C1 and the C2 token layer (`ecff975b`); its claim is free (quiet since 02:37 IST), so the picker hands out a takeover on that branch. From here, status goes in the §3b row "D-090". The lines below are history.

D-090-BYOR: waiting — D-154 (Oct 23): depends on `D-086-demand-list`, queued with status architect; workbuddy · b0eb stopped at the §0 gate and reported it, as this packet says to.

D-090-BYOR: packet written — Qoder · db0e — 2026-10-23 — branch `agent/architect/d090-byor` — **not started**: D-086 demand list is the build gate and is not live; the four approved mocks are not in the repo (§12 Q5). Verified against `main` `d54c0ca8`.

D-090-BYOR: **stopped at the §0 build gate — workbuddy · b0eb — 2026-10-23 — branch `agent/claude/d090-byor` — nothing built.** The picker handed this row to a builder, so the gate was re-checked on `main` `e0a43ff9` and is still closed:

- **No D-086 queue task exists.** `docs/plans/assignments.json` has no row whose id mentions 086; the only occurrence is this row's own note.
- **The public demand surface is not built.** `demandCount`, `seekerCount` and `distinctSeekers` appear nowhere in `server/`, `shared/` or `client/src/`; the decision's copy ("A few people asking") exists only in `docs/DECISIONS.md`; `/explore` has no demand UI. The only demand data today is `companySuggestions` votes, surfaced admin-only (`client/src/components/admin/reviewCases.ts:100-104`, "N seeker votes").
- **D-086's own sync cell still reads "approved for build, after W0 #361 and W1 drawer"** — approved, not done.

Per §0 and §11 nothing was written and no test was added. **Question for the CEO/owner:** build D-086 first and give it a queue task so this row can depend on it, or rule that BYOR may start ahead of it and amend §0. This row's `dependsOn` is `[]`, which is why the picker keeps offering a task that cannot start; changing queue gating is the CEO's call (D-085), so it was left alone and reported as blocked instead.
