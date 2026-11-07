# D-038 reconcile: independent audit evidence for the architect

Audited 2026-10-20 by a Qoder session at the owner's request. **Read-only**: no branch claimed, no code changed, no
plan §3b cell edited, nothing pushed into another model's lane. Every line number below was read from a named
revision — `main` = `c1720ada`, `#353` = `882f2eaf` (draft PR #353 head).

## 1. Headline: the reconcile task is already answered — by PR #353, not by the stalled lane

`docs/plans/assignments.json` row `D-038-reconcile` (status `architect`, branch `agent/claude/d038-reconcile`) asks
for a packet reconciling `agent/opencode/d038-a-lapses` with the D-038-B code already on `main`. **That work exists
and is green: draft PR #353** (`agent/workbuddy/d038-a-lapses`, opened 2026-10-20T17:08Z, head `882f2eaf`, CI
4/4 pass: typecheck, tests, production build, Workers build). It is an independent Tier 1 review of the slice-A code
that reached `main` unreviewed in `c53ea471`, plus the fixes, written up in `docs/reviews/D-038-A-review.md` (F1–F8).

I re-derived the gap list independently, from the packet against `main`, before finding the PR. **It matched on all
six** — so the six gaps are corroborated by two separate passes, not one:

| Packet | On `main` (`c1720ada`) | On `#353` (`882f2eaf`) |
|---|---|---|
| §4.7 5-claim cap | absent — `MAX_ACTIVE_CLAIMS` is imported by nobody in `server/db.ts`, no `profiles` lock, no 409 | `server/db.ts:2846-2852` + route 409 `server/privateReferralRoutes.ts:1355-1360` |
| §4.8 `REFERRAL_TIMERS_SINCE` clocks | present `shared/referral.ts:85` | unchanged |
| §4.1/4.3/4.4/4.5 exclusions, pickup-since-release, both lapse transactions | present: `shared/passReasons.ts:32`, `server/db.ts:2828`, `:2838`, `:2864`, `:3010` | unchanged in shape |
| §4.2 baseline ignores exclusion rows | absent — `server/flowBaselineSource.ts:34` counts every pass row | fixed (`isReferrerExclusionCode`) |
| §9 `refund_after_pickup` money check | absent | `server/dailyMoneyCheck.ts:269-284`, finding at `:390` |
| §9 `shared/moneyCopy.ts` `CREDIT_RULE` lapse clause | absent — `:54` still says only "withdraw before pickup … or expires unclaimed" | added |
| §4.10 `decisionDueAt` + inbox chip + thread line | absent as a behaviour — the string exists only as a parsed field in `client/src/lib/threadApi.ts`; no server producer in `server/db.ts`, no `.tsx` reads it | server + `MyCompanyInbox.tsx`, `ThreadDecisionPanels.tsx`, `QueueParts.tsx`, `threadApi.ts` |
| §4.9 `referral-timers` registered | **absent — not in `shared/scheduledJobs.ts` `SCHEDULED_JOB_NAMES`, not in `server/scheduledJobRegistry.ts`** | both lists, and the pinned `server/scheduledJobsContract.test.ts` (the one allowed edit, §7.10) |

So today's truth on `main`: the lapse rule is **inert**. `server/referralTimers.ts` exists, `lapseReferredTx`
(`server/db.ts:2886`) exists, and no cron window ever calls them — no claim lapse, no allocation lapse, no reminder,
no 5-day Referred deadline, no credit release. That is the single highest-value line in this document.

`agent/opencode/d038-a-lapses` (head `255c11fd`, 6 commits, merge-base `b99ebae0`, last commit 2026-10-19 19:34 IST —
27 h silent as of 2026-10-20 23:00 IST, and `main` is 90 commits ahead of that merge-base) is **obsolete**:
`c53ea471` already shipped most of its content and #353
finished the rest. Do not merge it. Note the trap if anyone does: it carries a *different file at the same path*
`server/db.referralTimers.test.ts` containing slice A's 10 tests, while `main`'s file of that name holds slice B's 9
money tests — a branch-over-main merge deletes slice B's tests. #353 avoids this by writing a new
`server/db.referralTimerLapses.test.ts` (12 tests) and leaving `main`'s file untouched.

## 2. What #353 does not cover — five residuals, ordered by what they can cost

**R1 — registering the job switches on the *unreviewed* slice-B money paths. (high)**
The registration is per job name, not per step, and the job that #353 registers runs four steps: reminders, claim
lapses, allocation lapses and **referred lapses** (`referredToLapse` → `lapseReferredTx`, which reopens an accepted
ask, releases the credit and revokes the document grant). Slice B is on `main` from `c53ea471` with its own record of
failure: "pushed straight to `main` as 0: CI red with 6 failing tests; its three action routes crashed live"
(plan §3b row `D-038-B`, line 92) and it has still had no independent review — #353 says so in its own §6. Merging
#353 therefore enforces a deadline nobody has audited. Options, in the architect's hands: review B first, or review A
and B together in this PR, or land A and hold the referred-lapse step behind a named flag (the packet does not scope
that, so it is an owner call, not an implementer's).

**R2 — `REFERRAL_TIMERS_SINCE` is already stale against §4.8, and its date is the merge day. (high)**
`shared/referral.ts:85` on both revisions is `2026-10-20T00:00:00.000Z`. Packet §4.8 requires "the UTC midnight
**after** the day you push (never earlier), so nothing lapses before referrers have had 48 hours under the new rule",
and the packet's own §6 step 8 puts that edit in the lane that registers the job — which is this PR. As written, every
claim and allocation that predates 2026-10-20 00:00 UTC lapses at **2026-10-22 00:00 UTC**, regardless of when the
merge actually happens; merge on the 22nd and a referrer who claimed on the 21st has hours, not 48 h. Fix: set the
constant at merge time to the midnight after the merge day (one line, with its test clock already derived from the
constant — `db.referralTimerLapses.test.ts:25` builds `T = REFERRAL_TIMERS_SINCE + 12 h`, so the tests do not need
re-writing). Pair it with the owner's pre-merge read-only count (§3 below), exactly as `P0-personal-link-asks` and
`P0-allocated-ask-stuck` did.

**R3 — the cap takes write locks across other people's asks, unbounded. (medium, Tier 1)**
`server/db.ts:2846-2852` (#353): after locking the claimant's `profiles` row it selects **every** pending ask assigned
to that user (no `limit`), then for each calls `referralWasClaimedTx(tx, id)`, whose read is
`.limit(1).for("update")` on `referralTransitionEvents` — so one click on "I'm on it" holds row/gap locks on the event
rows of up to N unrelated requests, in whatever order the unordered select returns them, while `profiles` is held.
`lapseClaimTx` locks the request row first and then writes that request's events, i.e. the two paths take the same
rows in a different order. Under MySQL's default isolation that is a deadlock candidate, and the job #353 has just
turned on is the other party; a deadlock aborts one side and the referrer sees a 500. It is also O(assigned asks)
inside a transaction, and the fast path (`assigned.length >= 5`) means it only runs for exactly the heavy referrers.
The `profiles` row lock already serializes one person's claims, so the count does not need locking reads at all: make
it one aggregate query, or a non-locking read, and bound it. Not covered by any test — `server/claimAtomicity.test.ts`
predates it.

**R4 — the allocation reminder key is request-scoped, so the second colleague is never reminded. (low, packet deviation)**
`server/referralTimers.ts:53` (#353, and the same on `main`) uses `allocation-reminder:<requestId>`; §4.6 specifies
`allocation-reminder:<slotId>`. `notifications.eventKey` is unique, and the insert is `onDuplicateKeyUpdate({set:{eventKey}})`,
i.e. deliberately silent on collision. Sequence: allocate to A → A reminded → A lapses at 48 h → re-allocated to B →
B's reminder hits A's key and writes nothing. B never hears from us before their own ask lapses. The claim key is
safe (`claim-reminder:<requestId>:<claimEventId>`, `:48`) because a claim event id is unique per claim. One-line fix:
`slotId` is already on the candidate type; §8's "re-claim after a lapse by a colleague" case is the same reason the
allocation key must be slot-scoped.

**R5 — a replay of an already-held claim now 409s instead of returning `replayed`. (low)**
The cap block sits after the `passed` guard and before `transitionReferralRequestTx`, and `assigned` includes the very
ask being claimed when its `referrerId` is already this user. A referrer at 5 open claims who taps "I'm on it" on one
they hold gets "You can hold 5 asks at once. Accept or pass one of them first." — the transaction rolls back, so no
money risk, but it reads as a fault for an idempotent tap, and §4.7's "counts the claimant's open claims" should not
count the ask being claimed. Skip the cap when `current.request.referrerId === userId`. No test covers it (§7.7 tests
only the 6th new claim).

Two checks I ran that came back **clean**, so the reviewer need not repeat them: `listRefundsAfterPickup`
(`server/dailyMoneyCheck.ts:269-284`) is correctly time-scoped — it only considers events with
`createdAt <= refund.createdAt`, so a legitimate lapse refund followed by a colleague's fresh claim does **not**
produce a false leak finding — and `ReferralTransitionConflict` sets `this.name` (`server/db.ts:3206`), so the route's
`capReached` test really matches and the cap answers 409, not 500. `server/askExpirySweep.test.ts:50` pins
registry-name order automatically against `SCHEDULED_JOB_NAMES`, so it needs no hand edit; #353 inserts
`referral-timers` before `daily-money-check`, which keeps both pinned lists satisfiable.

## 3. Concrete next steps for the architect (nothing here is an implementation I did)

1. Re-point `assignments.json` row `D-038-reconcile` at PR #353 instead of a new packet: it is the reconcile. Set its
   status so `next-task.mjs` stops being blind to it, and let `D-035` (`dependsOn: ["D-038-reconcile"]`) follow.
2. Decide R1 **before** merge — this is the money question, and per `docs/plans/README.md` tiers it is not an
   implementer's call. My recommendation: review `D-038-B` inside #353's scope (the code the two slices share —
   `referralWasClaimedTx`, the transitions, the job — is already written up there), rather than landing A's
   registration on top of unaudited B deadlines.
3. Re-set `REFERRAL_TIMERS_SINCE` on the merge commit (R2), then run the D-082 sequence: merge `c1720ada` in, full
   local gate, CI on the exact commit, then watch the first `referral-timers` window at `GET /api/admin/jobs`.
   Integration shape is favourable: #353 is 14 commits behind `main` and the only overlapping files are
   `AGENTS.md`, `docs/KIT_V4_BUILD_PLAN.md` and `server/privateReferralRoutes.ts`; in the routes file the hunks do not
   touch (`main`'s P0-c edits sit at 733–1131, #353's at ~1355), so the merge should be a docs-region conflict at worst.
4. Hand R3, R4 and R5 to #353's author as review findings — all three are small, all three are inside the packet's
   own scope, and none of them change a money outcome on their own.
5. Owner, before the merge (agents cannot reach the production database): read-only counts of pending asks whose
   latest pickup event is a `claim`, and pending asks holding an `allocated` slot with no claim since release, each
   split by older/newer than `REFERRAL_TIMERS_SINCE`. That is the size of the first windows' backlog and the number of
   seekers who will get a "your credit comes back" notice. Both `P0` rows above used this exact step.
6. Housekeeping: `agent/opencode/d038-a-lapses` needs an owner decision (agents do not delete branches or close PRs),
   and `plan §3b` row `D-038-A` line 91 already carries #353's status, so no other model should touch it.

## 4. Advisor's note, per D-023

Rating for #353 as a piece of engineering: **8/10** — it found and closed the real gaps, its tests are red-first and
scoped to the packet, and it fixed the structural problem (`latestByEventId`, because the in-memory kit ignores
`ORDER BY` on purpose) instead of papering over it. It loses points on R1 (turning on unreviewed slice-B money
enforcement without staging it), R2 (a constant its own packet pins down explicitly) and R3 (locks taken across rows
it did not need to lock).

The strongest argument against this document: none of R2–R5 is load-bearing if the merge happens tonight — R2 becomes
correct by accident when the merge day is the 20th, and R3 has not deadlocked in CI. If the architect takes that view,
R1 still stands, and it is the one that can move a credit.
