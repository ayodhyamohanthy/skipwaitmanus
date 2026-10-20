# D-038-A independent review: a lapsed claim or allocation returns the ask, and a referrer holds at most 5 claims

> Tier 1 (credits, refunds). Reviewed against `docs/plans/D-038-A-lapses.md` and
> `docs/DELEGATION.md` §6 on 2026-10-20, on branch `agent/workbuddy/d038-a-lapses` from
> `origin/main` `3ea56620`.

## 1. What was reviewed

The D-038-A slice was already on `main` before this lane started: it arrived in commit
`c53ea471` (pushed straight to `main` with the message "0", together with the D-038-B
code), and `docs/KIT_V4_BUILD_PLAN.md` §3b described it as "built, not on `main`". The
row's own next step was "an independent Tier 1 review of this code against both D-038
packets". This document is that review for slice A.

The rule being reviewed, in one line: **a claim, or an allocation nobody acts on, lapses
after 48 hours, the ask returns to the company's open queue, the seeker is never charged
twice, the lapsed referrer is excluded, and a referrer holds at most 5 open claims**
(D-038(a), D-076 (1)–(3), (5)).

## 2. Verdict

The lapse *transactions* are sound and match the packet: they re-decide under the request
row lock, write the transition, the exclusion row, the seeker notice, the referrer notice,
release the slot, delete the save and consume the review link. The money path is right:
a lapse writes no ledger row, and the existing idempotent refunds are the only way a
credit moves.

**Six gaps made the slice incomplete, and one made it unverifiable.** All are fixed in
this branch, each with a test that failed first.

| # | Gap | Effect before this branch |
|---|---|---|
| F1 | The 5-claim cap did not exist. `claimCompanyReferralRequest` had no `profiles` row lock, no count and no cap copy; `MAX_ACTIVE_CLAIMS` was imported nowhere. | D-038(a)'s second sentence — "A referrer holds at most 5 claims at once" — was unimplemented. One referrer could still claim every waiting ask at a company, the exact behaviour D-038 exists to stop. |
| F2 | The server never sent `decisionDueAt`. `client/src/lib/threadApi.ts` parsed the field and `getClaimedCompanyReferralDetail` did not produce it; the inbox row did not carry it at all. | The §4.10 surface was a field that was always `null`. Nothing told a referrer their decision was due. |
| F3 | `loadPassedRequestIds` returned every `referralRequestPasses` row, including the exclusion rows a lapse writes. | The D-018 admin baseline counted every lapse as a pass the referrer chose, inflating referrer activity with decisions nobody made (§4.2). |
| F4 | No `refund_after_pickup` check in `server/dailyMoneyCheck.ts`. | D-065's rule — one check per money-rule slice — was unmet, so a refund after a pickup (a money leak) would never be reported. |
| F5 | The client chip and the thread line were absent (`decisionDueAt` appeared in no `.tsx`). | §4.10's UI half was missing entirely. |
| F6 | `referral-timers` was in neither `SCHEDULED_JOB_NAMES` nor `SCHEDULED_JOBS`. | **The whole rule was inert.** No lapse, no reminder, no deadline ever ran. `AGENTS.md` said so in the living map; the §3b row said the opposite. |
| F7 | Every "latest event" read used `ORDER BY id DESC LIMIT 1`. | Not a production bug — MySQL honours it — but `server/inMemoryDrizzle.testkit.ts` ignores `ORDER BY` **on purpose**, so no test could verify the rule's central predicate, and the first test written against it failed for the wrong reason. |
| F8 | The job read its candidate list **five times per window**, and sent the referred reminders twice (step 1 and step 4 looped the same list). | Five scans an hour instead of one, five different snapshots inside one run, and a doubled `processed` count on referred reminders (idempotent by `eventKey`, so no duplicate notice — but the number was wrong). |

## 3. What changed

- **F1** `claimCompanyReferralRequest` locks the claimant's `profiles` row, counts only
  recorded claims among their pending assigned asks, and throws
  `ReferralTransitionConflict("You can hold 5 asks at once. Accept or pass one of them
  first.")` at the cap. The count is skipped entirely when fewer than 5 asks are assigned,
  so the common path costs no extra queries. Allocations and personal-link holds never
  count (D-076 (2)).
- **F2/F5** `decisionDueAt` (ISO or null) on the referrer inbox row and on the
  claimed-detail payload; a `Decide within N hours` chip on the queue card and a neutral
  line in `ThreadDecisionPanels`. Copy carries no countdown and no pressure: the ask goes
  back to colleagues and nothing is held against the referrer.
- **F3** `isReferrerExclusionCode` in `shared/passReasons.ts`; `loadPassedRequestIds`
  filters on it.
- **F4** `listRefundsAfterPickup` + the `refund_after_pickup` finding, read-only, bounded,
  newest refunds first.
- **F6** `referral-timers` registered in `shared/scheduledJobs.ts` and
  `server/scheduledJobRegistry.ts` (hourly, 5-minute lease).
- **F7** `latestByEventId` picks the highest event id in code. `referralWasClaimedTx`
  keeps its name, signature and `.for("update")`; the same change covers `lapseClaimTx`,
  the four D-038-B transitions, and the three candidate listings.
- **F8** the job reads candidates once per window and dispatches reminders by kind.

## 4. Evidence

- `server/db.referralTimerLapses.test.ts` — 12 tests, written red first. Six failed on
  `main` (the cap, `decisionDueAt` twice, the baseline, and the two refund-after-lapse
  cases that F7 exposed). The rest pin behaviour that already worked: 48-hour lapse and
  its no-op at 47 h, the exact seeker and referrer notices, one refund on expiry and one
  on withdrawal with replay adding nothing, the allocation lapse plus a colleague's claim,
  the once-only 24-hour reminder, the `REFERRAL_TIMERS_SINCE` clamp, and step isolation.
- `server/db.referralTimers.test.ts` (9), `server/heldAsk.test.ts` (11),
  `server/db.personalLinkAsk.test.ts` (23), `server/dailyMoneyCheck.test.ts` (14),
  `server/scheduledJobsContract.test.ts` (12), `server/askExpirySweep.test.ts` (5),
  `server/flowBaseline.test.ts` (15), `server/claimAtomicity.test.ts` (2),
  `server/db.openAskSlots.test.ts` (16), `server/privateReferralRoutes.integration.test.ts`
  (30), `client/src/pages/myCompanyInbox.pendingStates.test.tsx` (6),
  `client/src/pages/referralConversation.test.tsx` (27) — all green.
- `npx tsc --noEmit` clean.

## 5. Packet §10 checklist

1. **Does any path still treat an `allocated` slot as a pickup?** No. `heldForReferrerTx`
   returns a kind instead of null, and the lapse reads the claim history, never the slot.
2. **Does every clock use `getAskShelfLifeEndsAtMs` / the lapse helpers rather than
   `createdAt`?** Yes: `claimLapseAtMs` and `allocationLapseAtMs` both clamp to
   `REFERRAL_TIMERS_SINCE`, and the allocation clock reads `coverageVisibleAt`, never the
   slot's `openedAt`.
3. **Is the refund exactly one reversal per spend, in the same transaction as the status
   change, for both ledger and legacy debits, including on replay?** Yes — a lapse itself
   refunds nothing; the existing `refundLedgerSpendTx` / `refundReferralDebitTx` paths
   stay the only movers, and the tests assert one reversal and no second on replay.
4. **Is `referrerId` cleared on every release, and the slot released through
   `transitionReferralRequestTx`?** Yes for both lapse kinds, asserted in tests.
5. **Is personal-link behaviour byte-for-byte unchanged?** `server/heldAsk.test.ts` and
   `server/db.personalLinkAsk.test.ts` pass without edits.

## 6. Still open

- **D-038-B has had no independent review.** It is on `main` unreviewed, from the same
  `c53ea471` push. Its own §3b row still asks for that review; this document covers slice A
  only, and the code paths it shares with A (the pickup-since-release predicate, the
  transitions) were reviewed here.
- **No live check yet.** The timers only start doing work once this branch is on `main` and
  deployed; the first window after deploy is the one to watch (`GET /api/admin/jobs`).
- **Owner action, unchanged from the packet:** the pre-cut-off count of waiting asks
  (`§9` of the packet) before the first sweep runs.
