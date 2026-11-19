# Packet D-038-A: a claim or an allocation nobody acts on for 48 hours returns the ask to colleagues, and a referrer holds at most 5 claims

> Read `docs/BRIEF.md` first, then this packet.

| Field | Value |
|---|---|
| Queue row | `docs/KIT_V4_BUILD_PLAN.md` §3b, row `D-038-A` (add it when you claim it, under the money-rules tier) |
| Decisions | D-038(a), D-076 (1), (2), (3), (5), D-021, D-061, D-062, D-055 |
| Risk tier | 1 |
| Size | M |
| Implementer | any model; independent review required |
| Branch | `agent/<model>/d038-a-lapses` |
| Depends on | P0-allocated-ask-stuck live |
| Do not run at the same time as | D-038-B, D-035, any P0 touching claim, pass, withdraw or expiry |
| Verified against | `main` `e6b87f8`, plus the P0 packet's target behaviour |

## 1. Goal
Today one referrer can claim an ask, or be allocated one, and then sit on it until it expires. The seeker waits a week for nothing, and nobody else at the company sees it. After this packet:
- a claim or an allocation that nobody accepts or passes within 48 hours goes back to the company's open queue for every available colleague;
- the referrer who let it lapse no longer sees it;
- the seeker is told plainly, and is never charged again for it;
- a referrer can hold at most 5 open claims.

## 2. Binding rules (quoted)
- D-038(a): "A claim ('I'm on it') lapses after 48 h without an accept or decline (reminder at 24 h): the ask returns to colleagues and that claim spends no credit. A referrer holds at most 5 claims at once."
- D-076 (1): "the pickup that consumed the credit is undone. The ask reopens with its one credit still attached and unspent … No ledger row moves at release … Refund eligibility becomes 'no claim since the latest release'."
- D-076 (2): the lapse "clears the referrer, releases their slot, excludes that referrer from the ask for good and tells the seeker plainly. It is not a pass: no reason, no 'passed' notice. The 5-claim cap counts open claims only."
- D-076 (3): an allocated ask not claimed, accepted or passed "within 48 h of first visibility" returns to the open queue "like a D-021 pass; no new credit is spent and that referrer is excluded."
- D-076 (5): "for claims and acceptances that exist at deploy, the 48 h and 5-day clocks start at deploy time."
- AGENTS.md: "No … false urgency or pressure on referrers." Reminder copy is neutral.

## 3. Current behaviour (verified)
1. `claimCompanyReferralRequest` (`server/db.ts`, about line 2745) records the transition `action: "claim"`, `operationKey: claim:<userId>`, and sets `referrerId`. Claims have no timeout and no cap.
2. `referralWasClaimedTx` (`server/db.ts`, about 2124) is true if any `claim` event exists for the request. Withdraw and expiry use it to refuse a refund after pickup. The D-050 held rule (`heldForReferrerTx`) uses it too, and `server/heldAsk.test.ts` pins its call order and its `.for("update")`.
3. The pass transition `passReferralRequestTx` (about 2035) is the model for "back to the company":
   - patch `{ referrerId: null, referrerMessage: null, firstLookReferrerId: null, firstLookUntil: null }`;
   - inserts a `referralRequestPasses` row, which excludes that referrer everywhere: inbox, preview, save, claim, review emails, first-look release, claimed detail, documents;
   - deletes the actor's save;
   - consumes their review link;
   - releases their slot;
   - writes the seeker notice "Update on your referral request — <company>" / "Your ask is open again to other verified employees at <company>." It notifies no colleague.
4. Transition events carry the app clock's `createdAt` since `5ca2aab8`. Events written before that commit carry the database default.
5. `referralTransitionEvents.action` is `varchar(40)`, so a new action needs no migration. `referralRequestPasses.reason` is a NOT NULL enum (`role_not_a_fit | cannot_support | timing`), and `reasonCode` is `varchar(32)`.
6. Scheduled jobs:
   - names: `shared/scheduledJobs.ts` `SCHEDULED_JOB_NAMES`;
   - registry: `server/scheduledJobRegistry.ts`;
   - the exact list is pinned in `server/scheduledJobsContract.test.ts` (about L67) and `server/askExpirySweep.test.ts` (about L49);
   - the cron is hourly; no new trigger is needed.
7. `notifications.eventKey` is unique, so an insert with the same key is idempotent.
8. The admin baseline counts every `referralRequestPasses` row as a pass (`server/flowBaselineSource.ts` `loadPassedRequestIds`).

## 4. Target behaviour
1. **Exclusion codes.** In `shared/passReasons.ts`, add `REFERRER_EXCLUSION_CODES = ["lapsed_claim", "lapsed_allocation"] as const`. They are not pass reasons: `isPassReasonCode` stays false for them, and nothing shows them to anyone. Each lapse writes a `referralRequestPasses` row with `reason: "timing"` and `reasonCode` one of these. That reuses every existing exclusion.
2. **Admin baseline.** `server/flowBaselineSource.ts` `loadPassedRequestIds` ignores rows whose `reasonCode` is an exclusion code.
3. **Pickup since release.** `referralWasClaimedTx` keeps its name, signature, row-lock position and `.for("update")`. Its meaning becomes "the most recent event in {`claim`, `claim_lapse`} for this request is a `claim`". Read only those actions, ordered by `id` descending, `limit 1`. D-038-B and D-035 add more release actions to that set.
4. **Claim lapse.** A pending ask whose `referrerId` claimed it (its latest pickup-or-release event is that referrer's `claim`) lapses at `max(claimEvent.createdAt, REFERRAL_TIMERS_SINCE) + 48 h`. The lapse is one transaction under the request row lock:
   - transition `action: "claim_lapse"`, from `pending` to `pending`, `operationKey: claim-lapse:<claimEventId>`, actor = the lapsed referrer;
   - the pass side effects except the pass row: patch `{ referrerId: null, referrerMessage: null }`, delete that referrer's save, consume their review link, release their slot;
   - the exclusion row (`lapsed_claim`);
   - the seeker notice: title "Update on your referral request — <company>", body "The verified employee who picked up your ask didn't decide within 48 hours. It's open again to other verified employees at <company>. If nobody picks it up, your credit comes back, " + `CREDIT_ENDED_CAVEAT` + ".";
   - the referrer notice: title "An ask went back to your colleagues", body "You didn't accept or pass within 48 hours, so it's open to other verified employees at <company> again." No penalty, and nothing counts against them.
5. **Allocation lapse.** A pending ask with an `allocated` slot for its `referrerId` and no claim since the latest release lapses at `max(coverageVisibleAt ?? REFERRAL_TIMERS_SINCE, REFERRAL_TIMERS_SINCE) + 48 h`. It gets the same transaction with `action: "allocation_lapse"`, `operationKey: allocation-lapse:<slotId>` and exclusion code `lapsed_allocation`, and a seeker notice body that starts "The verified employee it reached didn't respond within 48 hours." Never read the slot's `openedAt` (a database clock) for timing.
6. **Reminder.** At `lapse time - 24 h` and later, the referrer gets one notice, with `eventKey` `claim-reminder:<claimEventId>` or `allocation-reminder:<slotId>`. Title "An ask is waiting for your decision"; body "You have an ask from a <company> candidate. Accept or pass when you can. After 48 hours it goes back to your colleagues." In-app only; email comes with D-060.
7. **The cap.** `claimCompanyReferralRequest` first locks the claimant's `profiles` row (`for("update")`). It then counts the claimant's open claims: pending asks with `referrerId = userId` whose latest pickup-or-release event is this user's `claim`. At 5 it throws `ReferralTransitionConflict` with "You can hold 5 asks at once. Accept or pass one of them first.", which maps to HTTP 409 in `server/privateReferralRoutes.ts`. Allocations do not count.
8. **The constant.** `REFERRAL_TIMERS_SINCE` lives in `shared/referral.ts`, with a comment citing D-076 (5). Set it to the UTC midnight **after** the day you push (never earlier), so nothing lapses before referrers have had 48 hours under the new rule.
9. **The job.** New scheduled job `referral-timers` (hourly), registered in both lists, with both pinned lists updated. Each run does three steps, each bounded to 100 items, oldest first, and each isolated (a failing step is reported to Sentry and the others still run):
   - reminders;
   - claim lapses;
   - allocation lapses.

   It re-decides every item under its row lock before writing, and returns `{ processed, failed }` like `createAskExpirySweep`.
10. **Referrer UI.** The inbox rows and the thread show "Decide within N hours" on the viewer's own claimed or allocated pending asks:
    - the server adds `decisionDueAt: string | null` (ISO) to the referrer inbox row and to the referrer thread payload;
    - `client/src/pages/MyCompanyInbox.tsx` shows a chip;
    - `client/src/components/thread/ThreadDecisionPanels.tsx` shows a line.

    Neutral copy, no countdown animation (AGENTS animation rules: no animation for 100+ views a day).
11. **Unchanged.**
    - Passes keep D-021, and passes still keep the credit spent: that changes in D-035.
    - The 7-day expiry from first visibility still bounds the ask.
    - Personal-link holds (D-050) are not claims until the link owner claims: a hold has no claim event, so it never lapses through rule 4. If the link owner claims and then lets it lapse, rule 4 applies and the ask joins the open queue.

## 5. Files
- **In scope:**
  - `shared/passReasons.ts`, `shared/referral.ts` (constant and clock helpers), `shared/scheduledJobs.ts`;
  - `server/db.ts`, only: `referralWasClaimedTx`, `claimCompanyReferralRequest`, new exported `lapseClaimTx`, `lapseAllocationTx`, `listReferralTimerCandidates`, the inbox row builder (`decisionDueAt`), and the claimed-detail payload (`decisionDueAt`);
  - new `server/referralTimers.ts` (the job: candidate listing, steps, isolation);
  - `server/scheduledJobRegistry.ts`, `server/flowBaselineSource.ts`;
  - `server/privateReferralRoutes.ts` (the claim route's 409 mapping only);
  - `client/src/pages/MyCompanyInbox.tsx`, `client/src/components/thread/ThreadDecisionPanels.tsx`, `client/src/lib/threadApi.ts` (optional `decisionDueAt`);
  - tests in §7;
  - docs in §9.
- **Read only:** `passReferralRequestTx` and `transitionReferralRequestTx` in `server/db.ts`; `server/askExpirySweep.ts` (job pattern); `server/heldAsk.ts`.
- **Out of scope:**
  - any migration;
  - any price or plan;
  - the referred deadline (D-038-B);
  - pass-reason credit effects (D-035);
  - colleague notifications on lapse (D-060);
  - emails.

## 6. Steps (one commit each)
1. Red-first tests (§7). Commit, but do not push alone.
2. Shared constants and clocks:
   - `REFERRAL_TIMERS_SINCE`;
   - `claimLapseAtMs(claimCreatedAt)`, `allocationLapseAtMs(coverageVisibleAt)`, `reminderAtMs(lapseAtMs)`, all pure, in `shared/referral.ts`;
   - the exclusion codes in `shared/passReasons.ts`.
3. `referralWasClaimedTx` becomes "pickup since the latest release" (§4.3). The pins in `server/heldAsk.test.ts` stay green unchanged.
4. Lapse transactions: `lapseClaimTx` and `lapseAllocationTx` (§4.4, §4.5), each callable with `(tx, requestId, nowMs)`, re-deciding under the lock and returning `{ lapsed: boolean, reason?: string }`.
5. The cap in `claimCompanyReferralRequest` (§4.7) and the route's 409.
6. The job: `server/referralTimers.ts` plus registration (§4.9) and the baseline filter (§4.2).
7. `decisionDueAt` on the server, then the client chip and line (§4.10).
8. Docs (§9).

## 7. Tests to write first
Use the setup in `server/db.coverageDelivery.test.ts` and `server/heldAsk.testkit.ts` (fake `Date`, in-memory kit). Set `REFERRAL_TIMERS_SINCE` in the past inside tests through the module constant, or pass `nowMs` far enough ahead.
1. **"a claim lapses 48 hours after it was made".** Claim at T. Then:
   - lapse at T+47h is a no-op;
   - at T+48h+1ms: `referrerId` null, status `pending`, one `claim_lapse` event, one exclusion row `lapsed_claim`, the referrer's slot `released`, the save deleted, the review link consumed;
   - the seeker notice matches §4.4 exactly;
   - the lapsed referrer's inbox no longer lists the ask, and their claim is refused.
2. **"a lapsed claim spends no credit".** Credit spent at send, claim, lapse, then expiry at visible+7d: exactly one `expiry_refund`. Control: claim, no lapse, expiry → no refund (picked up).
3. **"withdraw after a lapse returns the credit once".** Replay adds nothing.
4. **"an allocation lapses 48 hours after first visibility".** Deliver (D-034) at T; at T+48h+1ms it is in the open queue: `referrerId` null, slot released, exclusion `lapsed_allocation`. A colleague now sees it in their inbox and can claim it.
5. **"a reminder is sent once at 24 hours".** Run the job twice after T+24h: exactly one reminder (`eventKey` unique). None before T+24h.
6. **"nothing lapses before REFERRAL_TIMERS_SINCE + 48 h"**, for a claim made long before the constant (D-076 (5)).
7. **"the 6th claim is refused; a pass or an accept frees room".** Five open claims, then the sixth throws with the exact copy (409 at the route). After one pass, the next claim succeeds. Allocations do not count.
8. **"the job isolates its steps".** Make the reminder query throw: lapses still run, and the failure is captured.
9. **"the baseline does not count lapses as passes"** (`server/flowBaseline.test.ts`).
10. **Controls that must stay green:** every test in `server/db.referralPassReopen.test.ts`, `server/heldAsk.test.ts`, `server/db.personalLinkAsk.test.ts`, `server/claimAtomicity.test.ts` and `server/scheduledJobsContract.test.ts`, the last after adding the new name to its pinned list. That is the only allowed edit to it.

## 8. Edge cases and races
- **Accept racing the lapse:**
  - accept first: the status is no longer `pending`, so the lapse is a no-op;
  - lapse first: the accept by the lapsed referrer is refused (excluded: the pass row exists);
  - a colleague's accept proceeds normally.
- **Pass racing the lapse:** whichever transaction locks the request first wins. The loser re-reads and returns no-op; operation keys are unique per claim event and per slot.
- **A personal-link ask** claimed by its link owner and then lapsed joins the open queue. It is no longer held, which is correct: the hold ended with the claim.
- **Re-claim after a lapse by a colleague:** a new `claim` event, so the latest event is a claim again and the pickup rules apply.
- **Time:** every comparison uses JS time against app-clock values (`coverageVisibleAt`, event `createdAt` after `REFERRAL_TIMERS_SINCE`). Never compare the database `NOW()` or `openedAt`.

## 9. Definition of done

> Landed `907bf2cd` (2026-10-22). Evidence: `docs/plans/D-038-reconcile.md` §13 and `docs/RELEASES.md`.

- [x] §7 red first, green now.
- [x] Gate.
- [x] Draft PR plus independent review.
- [x] The `AGENTS.md` living map: the scheduled-jobs row (new job) and the credit-ledger row ("a lapse undoes the pickup").
- [x] `shared/moneyCopy.ts` `CREDIT_RULE`: **rejected in review, and the line is gone.** An earlier revision added "or after a referrer's 48-hour hold lapses", but a lapse moves no ledger row (D-076 (1); `lapseClaimTx`/`lapseAllocationTx` write no `tokenTransactions` row), and if a colleague picks the reopened ask up the credit never comes back at all — so the clause promised a refund the product does not make (D-042). The rule keeps the accurate condition, "if you withdraw before someone picks the ask up, or if it expires unclaimed", and `shared/moneyCopy.test.ts` now forbids the lapse wording.
- [x] One check added to `server/dailyMoneyCheck.ts`: `refund_after_pickup`, any `withdrawal_refund` or `expiry_refund` row whose ask's latest pickup-or-release event before the refund was a `claim`. Such a refund is a money leak.
- [x] `docs/DECISIONS.md` D-038 and D-076 sync cells (slice A).
- [x] Live check.
- [x] §3b row done with evidence.

## 10. Review checklist
1. Does any refund decision still use "a claim event ever existed" instead of `referralWasClaimedTx`'s new meaning?
2. Does every lapse write the exclusion row, so that the lapsed referrer can never see, save, claim or accept the ask again? Check the inbox, preview, claim and review-email paths in tests.
3. Are the lapse clocks computed only from app-clock values and `REFERRAL_TIMERS_SINCE`?
4. Is the reminder idempotent (unique `eventKey`), and is all copy free of pressure (no "hurry", no counts of other people)?
5. Is the cap serialized per referrer (the `profiles` row lock) and counted from claims only?

## 11. Stop and ask if
- `referralWasClaimedTx`'s callers need more than the meaning change.
- You find a referrer surface that does not read `referralRequestPasses` for exclusion.
- A migration seems necessary.

## 12. Owner questions
None open. The rulings are D-076 (1), (2), (3) and (5).
