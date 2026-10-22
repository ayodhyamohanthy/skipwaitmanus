# Packet D-038-reconcile: land PR #353 (D-038-A complete, timers job registered) with part B's money steps switched off until their own review

Tier 1 (money, privacy). Architect: Claude Code (CEO, D-085), Oct 21. Builds on two pieces of the team's work, not a fresh start:
- PR #353 (`agent/workbuddy/d038-a-lapses`, head `39717810`) by workbuddy: the missing D-038-A pieces and the `referral-timers` registration.
- PR #354 (`docs/reviews/D-038-reconcile-evidence.md` on `agent/qoder/d038-reconcile-evidence`) by qoder: an independent audit that found the same six gaps on its own and five residuals (R1–R5).

The work branch is #353's own branch. There is no new branch and no new pull request.

## 1. Goal

The D-038 timers finally run, and run safely:
- A claim or an allocation nobody acts on for 48 hours returns the ask to colleagues.
- A referrer holds at most 5 claims.
- Reminders go out once.

The part B referred-deadline steps (the referred reminders, the referred lapse that releases a credit and revokes the document grant, and the step-back, extend and confirm actions) touch money and privacy. Part B reached `main` unreviewed (`c53ea471`, fixed forward in #330). It therefore runs only behind a switch, and the switch turns on only after an independent review passes part B.

## 2. Binding rules (quoted)

- D-038 (a): "a claim lapses after 48 h"; (b): "an accepted ask must be marked 'Referred' within 5 days or the credit is released".
- D-076 (1)–(5): the rulings named in `docs/plans/D-038-A-lapses.md` §2 and `docs/plans/D-038-B-referred-deadline.md` §2. Read them there; they are unchanged.
- D-042: "Every money path survives, honestly: kept in the code, switched on when it can deliver, never deleted without the owner's say-so."
- Product compass: "Never break or silently change anything that touches credits, payments or refunds."
- Payments bar: every money mutation idempotent, reconciled and recoverable.
- D-019 (e): document access only after the referrer's own acceptance.
- `docs/plans/D-038-A-lapses.md` §4.8: "`REFERRAL_TIMERS_SINCE` is the UTC midnight after the day you push (never earlier), so nothing lapses before referrers have had 48 hours under the new rule."

## 3. Current behaviour (verified on `main` `f7ae5e4d`)

- The job is not registered: `shared/scheduledJobs.ts:10` lists nine jobs and no `referral-timers`, so no lapse, reminder or credit release has ever run.
- `server/referralTimers.ts:1-14` already runs five steps when registered:
  1. claim reminders;
  2. claim lapses;
  3. allocation lapses;
  4. referred reminders;
  5. referred lapses.

  Steps 4–5 call `lapseReferredTx` (`server/db.ts:2886`), which reopens an accepted ask, releases the credit and revokes the grant.
- The part B actions are live routes today, unreviewed:
  - `POST /api/company-referrals/:requestId/extend-referred-deadline` (`server/privateReferralRoutes.ts:1362`);
  - `/step-back` (`:1377`), which calls `stepBackFromReferral` (`server/db.ts:2915`) and reopens the ask;
  - `/confirm-referred` (`:1392`).
- `REFERRAL_TIMERS_SINCE` is `2026-10-20T00:00:00Z` (`shared/referral.ts:85`), which is already stale against §4.8.
- The allocation reminder key is request-scoped: `allocation-reminder:${candidate.id}` (`server/referralTimers.ts:43`).
- #353 adds the 5-claim cap (`server/db.ts` ~2846-2852 on its branch), the decision-due line, the baseline exclusion filter and the registration. The evidence file §2 lists what it does not cover (R1–R5).
- Do not merge `agent/opencode/d038-a-lapses`: it carries a different file at the path of `main`'s `server/db.referralTimers.test.ts`, and merging it deletes part B's nine money tests (evidence §1).

## 4. Rulings (decided under D-074 by the CEO; record them in the register when this packet lands)

- **R-1. The work is #353.** Fix it on its branch.
  - `agent/opencode/d038-a-lapses` is superseded and must never be merged.
  - Deleting that branch waits for the owner's yes (§12).
- **R-2 (residual R1): part B ships switched off.**
  - Add `export const REFERRED_DEADLINE_ENABLED = false;` to `shared/referral.ts`, next to `REFERRAL_TIMERS_SINCE`, with a comment naming D-042 and this packet.
  - While it is false:
    - The job runs steps 1–3 only. Steps 4–5 are reported as `skipped: "referred-deadline off"` in the job output; this is not an error.
    - The three part B routes answer `409 { code: "not_available_yet" }` before any read or write, with the sentence "This option is not available yet. Nothing has changed."
    - The thread API omits the referred deadline, extension and confirm fields, so the client shows no deadline, extend, step-back or confirm control.
  - Nothing is deleted.
  - The reviewer reviews A and B together (B's code on `main` is in scope).
    - If B passes, the lander sets the switch to `true` in the landing commit.
    - If B does not pass, it lands `false`, and B's findings become row `D-038-B`'s next fix.
- **R-3 (residual R2): the cut-off is set by the lander, in the landing commit.**
  - Set `REFERRAL_TIMERS_SINCE` to the UTC midnight after the day the merge happens. The tests derive their clock from it (`db.referralTimerLapses.test.ts:25`), so they need no rewrite.
  - The builder and the fixer leave the value alone.
- **R-4 (residual R3): the cap takes no locks on other people's asks.**
  - Under the claimant's `profiles` row lock (already taken), count the claimant's open claims with one bounded, non-locking aggregate query. No per-request `for("update")` and no loop over assigned asks.
  - Lock order everywhere stays "request row, then the person's row"; nothing new takes them in the other order.
- **R-5 (residual R4): the allocation reminder key is slot-scoped,** `allocation-reminder:<slotId>`, as `docs/plans/D-038-A-lapses.md` §4.6 says.
- **R-6 (residual R5): a replayed claim of an ask the claimant already holds never hits the cap.** Skip the cap when `request.referrerId === userId`; the replay answers as it did before #353.

## 5. Files

In scope (smallest change that satisfies §4):
- `shared/referral.ts`
- `server/referralTimers.ts`
- `server/db.ts` (the cap region and nothing else)
- `server/privateReferralRoutes.ts` (the three part B routes only)
- the thread API projection that sends the deadline fields (find it from `client/src/lib/threadApi.ts`'s types)
- `client/src/components/thread/ThreadDecisionPanels.tsx` (hide the controls when the fields are absent)
- `client/src/pages/conversation/SeekerConversation.tsx` (the seeker's "I got the referral email" control, the same gate): since #432 (Oct 22, D-148) the live seeker conversation is this goal page and no longer renders the kit seeker panel, so a change made only in `ThreadDecisionPanels.tsx` never reaches seekers
- tests: `server/db.referralTimers.test.ts`, `server/db.referralTimerLapses.test.ts`, `server/claimAtomicity.test.ts` and the route tests from #330
- docs: `docs/KIT_V4_BUILD_PLAN.md` rows `D-038-A` and `D-038-B`, `AGENTS.md` living-map "Scheduled jobs" row, `docs/RELEASES.md` at landing

Out of scope:
- D-035 (#357, stacked on #353: it follows this PR);
- any credit rule;
- any schema or migration;
- any new endpoint;
- any copy beyond the one sentence in R-2.

## 6. Steps (one commit each, on `agent/workbuddy/d038-a-lapses`)

1. Merge the latest `origin/main` into the branch. Never rebase or force-push: it is a shared PR branch.
2. Write the §7 tests and watch each fail for the reason given.
3. R-2: the switch, the job skip, the route guard and the API fields.
4. R-4: the cap count.
5. R-5: the reminder key.
6. R-6: skip the cap on a replay.
7. Run the full gate merged with the latest `origin/main`, push, and run `node scripts/next-task.mjs --fixed --task D-038-reconcile --as "<your session name>"`.

## 7. Tests to write first (each must fail before its fix)

1. With the switch off, one job window over a fixture holding a lapsable claim, a lapsable allocation and an accepted ask past its referred deadline:
   - lapses the claim and the allocation;
   - leaves the accepted ask, its credit and its document grant untouched;
   - reports steps 4–5 as skipped.
2. With the switch on, the same window reopens the accepted ask, releases the credit once (replay-safe) and revokes the grant. This pins part B's behaviour for its review.
3. With the switch off, each of the three part B routes answers 409 `not_available_yet` and changes nothing: no transition event, no ledger row, no notification.
4. The thread projection omits the deadline fields when the switch is off, and the panel renders no deadline, extend, step-back or confirm control.
5. The cap:
   - a claimant holding 5 open claims gets the cap answer on a 6th;
   - the count is one aggregate query that takes no lock on another request's rows (assert through the test kit's query log, or by spying on `for("update")`).
6. Re-allocation: A is allocated and reminded, A lapses, the ask is re-allocated to B, and B gets their own reminder. Today it fails: B's key collides with A's.
7. A claimant at 5 open claims who repeats "I'm on it" on an ask they already hold gets the replay answer, not 409.

## 8. Edge cases and races

- A referred lapse can race an accept, a mark-referred, a step-back or a second window. With the switch off, none of them runs. With it on, each re-decides under the request row lock, so none acts twice (`server/referralTimers.ts:12-13`).
- A claim made just before the cut-off lapses no earlier than `REFERRAL_TIMERS_SINCE + 48 h`.
- A claimant whose 5th claim lapses mid-request: the cap counts under the `profiles` lock, so the count is consistent for that person.

## 9. Definition of done

- Every §7 test passes, and the full gate passes on the branch merged with the latest `origin/main`.
- GitHub CI is green on that exact commit.
- An independent review passed:
  - A is always reviewed;
  - B is reviewed too, and its verdict decides the switch.
- The lander has set `REFERRAL_TIMERS_SINCE` per R-3 and the switch per R-2, and landed under D-082.
- The `D-038-A` and `D-038-B` rows and the living map say what runs; `docs/RELEASES.md` has the entry with its rollback.
- Rollback: revert the landing commit. The job's registration goes with it, and nothing it wrote needs undoing because every step is replay-safe.

## 10. Review checklist (Tier 1, DELEGATION §6)

- Reproduce R1–R5 from `docs/reviews/D-038-reconcile-evidence.md` §2 on the branch head, and confirm each is fixed.
- Read part B's money path end to end:
  - `lapseReferredTx`, `stepBackFromReferral`, `extendReferredDeadlineTx`, `confirmReferredBySeeker` and their user wrappers (`server/db.ts:2886-3005`);
  - the ledger keys (unique, replay-safe);
  - the daily money check's view of the moves (`server/dailyMoneyCheck.ts`);
  - what the seeker and the referrer are told.

  State a separate verdict for B.
- Confirm the lock order in the cap and that nothing takes locks on other people's asks.
- Confirm no copy promises a deadline, extension or confirmation while the switch is off.

## 11. Stop and ask if

- Fixing R-4 needs a schema change.
- Part B's review finds a credit moving twice or to the wrong person. Report it red and leave the switch off.
- The thread projection cannot omit the fields without changing another surface.

## 12. Owner questions (non-blocking)

- May `agent/opencode/d038-a-lapses` be deleted? It is superseded, and merging it would delete part B's tests.
- After landing, read the first job windows at `/admin/jobs`. The first claim reminders can fire 24 hours after the cut-off and the first lapses 48 hours after it, so there is a day to look at the counts.

## 13. Landed (2026-10-22)

`907bf2cd` (PR #353) is the reviewed head `abcaaae8` merged with `origin/main` through `a14cc67a`, plus the landing edits.

- Part A and part B both passed the independent Tier 1 review on `abcaaae8`; the lander set `REFERRED_DEADLINE_ENABLED = true` (R-2) and `REFERRAL_TIMERS_SINCE = 2026-10-23T00:00:00.000Z` (R-3, merge day Oct 22 UTC).
- `docs/plans/assignments.json` marks `D-038-reconcile` done; the picker's head moves to `D-035`.
- Merge conflicts, all disclosed: `server/dailyMoneyCheck.test.ts` (PR #440's on-demand money-check tests vs this branch's detector tests — resolved as a union, every assertion kept); every other merge was clean. `server/dailyMoneyCheck.ts` auto-merged, and `runMoneyCheckNow` passes the full deps, so the admin on-demand run includes both new detectors.
- Gate on the landed candidate: `pnpm check`, focused 11 files / 194 tests, `pnpm build`, design-token audit, deploy-trigger check; GitHub CI green on `907bf2cd` (typecheck, unit+component+route, production build, Workers Builds).
- Live: `/api/health/ready` serves `907bf2cd` in state `ready` (the exact timestamp and deploy run ids are in the PR #353 landing comment).

The three review notes stand as non-blocking follow-ups: N-1 (`listReferredPastDeadline` does not honour `REFERRED_DEADLINE_ENABLED`; the daily check flags an overdue ask even while part B is off), N-2 (`server/referralTimers.ts:11` says the lapse "releases the credit" although D-076 (1) moves no ledger row), N-3 (the switch-on test title is precise only in its body).
