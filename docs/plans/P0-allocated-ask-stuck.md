# Packet P0-allocated-ask-stuck: a delivered ask nobody picked up can be withdrawn, expires after 7 days, and its credit comes back

> Read `docs/BRIEF.md` first, then this packet. You need nothing else unless a section below names it.

| Field | Value |
|---|---|
| Queue row | `docs/KIT_V4_BUILD_PLAN.md` §3b `P0-allocated-ask-stuck` |
| Decisions | D-034, D-050, D-061, D-062, D-021 (quoted in §2); order per D-075 |
| Risk tier | 1 (credits, refunds) |
| Size | M |
| Implementer | any model, from this packet; independent review required (`docs/DELEGATION.md` §6) |
| Branch | `agent/<model>/p0-allocated-ask` from the latest `origin/main` |
| Depends on | nothing |
| Do not run at the same time as | D-038 and D-035 packets (same functions in `server/db.ts`); P0 rows that edit `withdrawCompanyReferralRequest`, `expireStalePendingReferralRequest` or `claimCompanyReferralRequest` |
| Verified against | `main` `e6b87f8` on 2026-10-18 |

## 1. Goal
A waiting ask that D-034 delivers to one referrer (or an ask a referrer received through "Open referral capacity") is assigned to that referrer with an `allocated` availability slot. If that referrer never claims, accepts or passes, the seeker today can never withdraw it, it never expires, its credit stays spent and its open slot stays taken, forever. After this packet the ask behaves like every other unclaimed ask: the seeker can withdraw it with the credit back, it expires 7 days after it first became visible with the credit back, and past that the referrer can no longer claim it, it leaves their inbox and it frees the seeker's slot.

## 2. Binding rules (quoted)
- D-034: "an ask spends 1 credit when sent; a withdraw before pickup or an unclaimed 7-day expiry returns it once; pickup keeps it spent."
- D-061: "The 7-day expiry clock starts only when an available referrer can first see the ask."
- D-050 (the pattern this packet extends): "until that referrer claims, accepts or passes, the seeker can withdraw the ask with the credit back, and the unclaimed 7-day expiry returns the credit, exactly like any other unclaimed ask."
- D-062: "a slot frees when an ask is accepted, passed, expired or withdrawn."
- Pickup means a recorded `claim` transition event (plan row P0-personal-link-asks; AGENTS.md refund repair notes). An allocation is not a pickup.

## 3. Current behaviour (verified at `e6b87f8`)
1. `server/heldAsk.ts` `heldForReferrerTx`'s helper chain: `isHeldCandidate` (pending, `referrerId` set, `createdAt >= HELD_ASK_HISTORY_SINCE` = 2026-09-21) → `referralWasClaimedTx` → `readQueueAllocationTx`. In `server/db.ts` `heldForReferrerTx` (about line 2136) returns `null` when an `allocated` slot exists (`if (await readQueueAllocationTx(tx, row.id)) return null;`).
2. `withdrawCompanyReferralRequest` (`server/db.ts` about 2145): `if (current.referrerId !== null && heldFor === null) throw new Error(WITHDRAW_REFUSED)`. So an allocated ask is refused with "This request was already claimed by a verified employee and can no longer be withdrawn".
3. `expireStalePendingReferralRequest` (about 2287) returns `{ expired: false }` for the same reason. Its clock is already right: `getAskShelfLifeEndsAtMs(current)` (`shared/referral.ts` about 116) counts 7 days from `coverageVisibleAt`, or from `createdAt` for rows without it.
4. `server/askExpirySweep.ts` `listStalePendingAsks`: its unassigned query needs `referrerId IS NULL`; its held query `selectStaleHeldAsks` (`server/heldAsk.ts`) anti-joins away allocated asks (`isNull(referralAvailabilitySlots.id)`) and cuts off on `createdAt` only. The seeker-read reconcile in `server/db.ts` (about 2407) calls the same `selectStaleHeldAsks`.
5. `server/planGates.ts` `openAskCondition`: an assigned ask holds its slot while `assignedAskNotHeldCondition()` is true, and that SQL treats "an `allocated` slot exists" as not held. So an allocated ask holds the seeker's open slot forever.
6. `claimCompanyReferralRequest` (about 2745): the late-claim guard for an assigned ask is `isPastAskShelfLife(current.request.createdAt, …) && heldForReferrerTx(…) !== null`. That is creation-based, and allocated asks never pass it, so the allocated referrer can claim at any age.
7. `listCompanyReferralInboxByState` (about 2053): `listStaleHeldForViewer` (`server/heldAsk.ts`) decides which assigned rows are stale. It uses `isPastAskShelfLife(row.createdAt)` and excludes allocated asks, so a stale allocated ask stays in the referrer's "new" tab (`isQueueAllocationForYou`).
8. `listJobSeekerCompanyReferrals` (about 2443) sets `heldForReferrer` from `listHeldForReferrerIds`, which excludes allocated asks. The client shows Withdraw only when `referrerId === null || heldForReferrer === true`: `client/src/components/requests/requestModel.ts:18` `canWithdrawRequest`, and `client/src/components/thread/ThreadDecisionPanels.tsx:50`.
9. A withdraw or expiry already frees every slot the ask holds: `transitionReferralRequestTx` calls `releaseAvailabilitySlotsTx` for `withdrawn` and `closed`. The refund paths already exist and are idempotent: `refundLedgerSpendTx` for ledger spends (D-034 delivery spends under `ask-delivery:<id>`) and `refundReferralDebitTx` for legacy debits.
10. The expiry notice lead is `heldFor === null ? "No verified employee claimed it within 7 days." : "The employee whose link you used didn't respond within 7 days."`, and every release writes `personal_link_ask.released` (`recordHeldAskReleaseTx`).

## 4. Target behaviour
1. **Unclaimed assignment.** A pending ask with `referrerId` set, `createdAt >= HELD_ASK_HISTORY_SINCE` and no `claim` transition event is an unclaimed assignment, of one of two kinds:
   - `personal_link`: no `allocated` slot (today's D-050 hold, unchanged);
   - `queue_allocation`: an `allocated` slot exists (new).
2. **Withdraw.** An unclaimed assignment of either kind can be withdrawn. The credit comes back once through the existing paths; the ask's slots are released; `referrerId` is cleared in the same write.
3. **Expiry.** An unclaimed assignment of either kind expires when `getAskShelfLifeEndsAtMs` says so (7 days from `coverageVisibleAt`, or from `createdAt` for rows without it). The credit comes back once; the slots are released; `referrerId` is cleared.
   - The notice lead for `queue_allocation` is "No verified employee claimed it within 7 days.".
   - `personal_link` keeps its lead.
4. **Audit.** Every release writes one audit row in the release transaction, with metadata `{ reason, creditReturned, referrerId }`:
   - `personal_link` → action `personal_link_ask.released` (unchanged);
   - `queue_allocation` → action `queue_allocation.released`.
5. **Sweep.** The hourly `ask-expiry-sweep` and the seeker-read reconcile select stale unclaimed assignments of both kinds. They use the same window as rule 3, oldest first, bounded, and fail open as today.
6. **Open slots.** An unclaimed `queue_allocation` ask frees its open slot when rule 3's window ends. A claimed ask, or an assigned ask created before the cut-off, keeps its slot as today.
7. **Late claim.** Past rule 3's window, the assigned referrer can no longer claim an unclaimed assignment of either kind. The claim fails with "This referral request expired before it could be claimed", and the ask leaves their "new" and "saved" tabs.
8. **Seeker list.** `/api/company-referrals/mine` rows gain `unclaimedAssignment: boolean` (rule 1, either kind). `heldForReferrer` keeps meaning `personal_link` only. The client shows Withdraw when `referrerId === null || heldForReferrer === true || unclaimedAssignment === true`.
9. **Unchanged.**
   - Claimed asks: withdraw refused, no expiry refund, the credit stays spent.
   - Passes reopen per D-021.
   - Waiting and held-for-credit asks keep their D-061 90-day rule.
   - Assigned asks created before 2026-09-21 keep today's rules.
   - Accepts and passes on a stale unclaimed ask stay allowed, as for every unclaimed ask today.

## 5. Files
- **In scope:**
  - `server/heldAsk.ts`;
  - `server/db.ts`, only these functions: `heldForReferrerTx`, `withdrawCompanyReferralRequest`, `expireStalePendingReferralRequest`, `claimCompanyReferralRequest` (the late-claim guard only), `listCompanyReferralInboxByState` (the stale-held call only), the seeker reconcile that calls `selectStaleHeldAsks`, and `listJobSeekerCompanyReferrals` (the held flag only);
  - `server/askExpirySweep.ts`;
  - `server/planGates.ts` (only via `assignedAskNotHeldCondition` in `server/heldAsk.ts`; edit `planGates.ts` only if its comment must change);
  - `client/src/components/requests/requestModel.ts`, `client/src/components/requests/requestsApi.ts`, `client/src/lib/threadApi.ts`, `client/src/components/thread/ThreadDecisionPanels.tsx`;
  - tests named in §7;
  - docs named in §9.
- **Read only:** `shared/referral.ts` (`getAskShelfLifeEndsAtMs`, `isAskExpired`), `server/coverageDelivery.ts`, `transitionReferralRequestTx` and `releaseAvailabilitySlotsTx` in `server/db.ts`, `server/heldAsk.testkit.ts`, `server/inMemoryDrizzle.testkit.ts`.
- **Out of scope:**
  - the D-038 claim and allocation timers;
  - the thread countdown that ignores `coverageVisibleAt` (`client/src/components/thread/threadModel.ts:64`);
  - the referrer inbox `isClaimedByYou` label;
  - `server/queueOpenAlerts.test.ts` and the exact `isQueueAllocationForYou` line it pins (do not edit that line);
  - every price, plan and copy surface not named here.

## 6. Steps (one commit each)
1. **Tests first.** Add every §7 test and flip the existing pins listed there. Run them; the new and flipped cases fail on today's code, the controls pass. Commit: "Red-first: a delivered ask nobody picked up can be withdrawn and expires (P0-allocated-ask-stuck)". This is the only commit allowed to be red; do not push it alone.
2. **Unclaimed assignment in `server/heldAsk.ts`.**
   - Drop the `allocated` disjunct from `assignedAskNotHeldCondition` (it becomes: created before the cut-off, or a `claim` event exists). Update its comment.
   - In `selectStaleHeldAsks`: remove the `isNull(referralAvailabilitySlots.id)` condition and its left join, and replace `lt(referralRequests.createdAt, input.cutoff)` with the window rule. That is: `coverageVisibleAt IS NOT NULL AND coverageVisibleAt < visibleBefore`, or `coverageVisibleAt IS NULL AND createdAt < heldBefore`. The input becomes `{ visibleBefore, heldBefore, limit, jobSeekerId? }`.
   - Make `listStaleHeldForViewer` window-aware with `getAskShelfLifeEndsAtMs` on rows carrying `coverageVisibleAt` and `waitingForCoverage`.
   - Make `listHeldForReferrerIds` return two sets: `personalLink` and `queueAllocation`.
   - Give `recordHeldAskReleaseTx` a `kind` input that picks the action name (§4.4).
3. **Server transitions in `server/db.ts`.**
   - `heldForReferrerTx` returns `{ referrerId, kind } | null`: still null for a non-candidate or a claimed ask, and `kind` comes from `readQueueAllocationTx` instead of returning null.
   - Update `withdrawCompanyReferralRequest` and `expireStalePendingReferralRequest` to the new return value: authorize against `heldFor.referrerId`; expiry lead per §4.3; audit per §4.4.
   - Claim guard: replace `isPastAskShelfLife(current.request.createdAt, claimNowMs)` with `getAskShelfLifeEndsAtMs(current.request)` compared to `claimNowMs`. The selected row must carry `coverageVisibleAt` and `waitingForCoverage`, which it already selects.
   - Seeker reconcile and sweep: pass `{ visibleBefore, heldBefore }`.
   - `listJobSeekerCompanyReferrals`: set `heldForReferrer` from `personalLink`, and `unclaimedAssignment` from both sets.
4. **Sweep.** `server/askExpirySweep.ts` passes `windows.visibleBefore` and `windows.heldBefore` to `selectStaleHeldAsks`. Keep `mergeHeldStaleAsks` fail-open, and keep the `listStale` argument shape `{ visibleBefore, waitingBefore, heldBefore }`, which `server/askExpirySweep.test.ts:11` pins.
5. **Client.**
   - `requestsApi.ts` and `threadApi.ts` schemas accept `unclaimedAssignment: z.boolean().optional()`.
   - `canWithdrawRequest` and the `ThreadDecisionPanels.tsx` withdraw condition use §4.8.
   - Copy is unchanged. Confirm with a test that the withdraw dialog for a delivered ask shows "It leaves the referrer's queue and frees your slot." and never "It never reached a verified employee".
6. **Docs (same push, D-068).**
   - The §3b row: status and evidence.
   - The `AGENTS.md` living-map credit-ledger row: replace "a personal-link ask counts as unclaimed until…" with the two-kind rule.
   - `docs/DECISIONS.md` D-050 and D-034 sync cells: one clause each.

## 7. Tests to write first
Use the setup in `server/db.coverageDelivery.test.ts:21-73` (in-memory test kit, fake `Date`, `DATABASE_URL` stub) for D-034 deliveries, and `server/heldAsk.testkit.ts` (`allocatedSlot()`) for the older allocation. Gotchas:
- If you seed `claimEvent()` (resultingRevision 1) on an `askRow()`, seed `askRow({ revision: 1 })`, or the next real transition collides on `referral_transition_revision_unique`.
- `allocatedSlot()` has no `coverageVisibleAt` and no `ask-delivery` key.
- Open-slot counting cannot run on the in-memory kit (correlated `exists`); put slot tests in `server/db.openAskSlots.test.ts`.

**New (in `server/db.coverageDelivery.test.ts` unless noted):**
1. "a delivered ask nobody claimed can be withdrawn with its credit back". Deliver a waiting ask (one `credit_spend` keyed `ask-delivery:<id>#1`), then withdraw as the seeker:
   - status `withdrawn`;
   - exactly one `withdrawal_refund` reversal of that spend;
   - the slot is `released`;
   - `referrerId` is null;
   - one `queue_allocation.released` row `{ reason: "withdrawn", creditReturned: true, referrerId }`.
   - A replayed withdraw adds no second reversal.
2. "a delivered ask expires 7 days after first visibility, not after creation". Create waiting at T0, deliver at T0+10d.
   - Expire at T0+16d: `expired: false`.
   - Expire at T0+17d+1ms: `closed`, one `expiry_refund`, notice title "Your ask expired — credit returned", body starting "No verified employee claimed it within 7 days.", slot `released`, `referrerId` null.
3. "the allocated referrer cannot claim a delivered ask past its 7 days". At visible+7d+1ms, claim throws "This referral request expired before it could be claimed"; at visible+6d the claim succeeds (control).
4. "a claimed delivered ask keeps today's rules" (control). Deliver, claim, then: withdraw throws `WITHDRAW_REFUSED`; expiry at visible+8d returns `expired: false`; no reversal row.
5. "an accepted delivered ask never expires" (control). Deliver, one-click accept, then expire at visible+8d: `expired: false`.
6. In `server/askExpirySweep.personalLink.test.ts`: "the sweep selects a stale delivered ask and a stale older allocation, oldest first, and never a claimed one".
7. In `server/db.openAskSlots.test.ts`: "an unclaimed allocated ask frees its slot when its window ends; a claimed one keeps it". Extend the bespoke interpreter if the SQL shape changes (it reads parameters by position, about L42-43).
8. In `client/src/pages/myRequests.withdraw.test.tsx` and `client/src/pages/referralConversation.test.tsx`: "a pending ask with `unclaimedAssignment: true` shows Withdraw, and its dialog says it frees your slot".

**Existing pins to flip.** They encode today's bug; change only the queue-allocation case, never the controls:
- `server/db.personalLinkAsk.test.ts` about L124: the queue-allocated case → withdraw succeeds with one refund; expiry at +7d closes with one refund.
- `server/db.personalLinkAsk.test.ts` about L242: the "8 days old and queue-allocated" case.
- `server/heldAsk.test.ts` about L52 (the `CASES` row "a queue allocation") → held false, unclaimed true, withdrawal succeeds, expires at its window. Its source pins at about L115-127 must still find `referralWasClaimedTx(tx` before `readQueueAllocationTx(tx` and the row lock first; keep that order.
- `server/heldAsk.shelfLife.test.ts` about L71-73 (queue-allocated late claim) → refused past the window.
- `server/heldAsk.shelfLife.test.ts` about L90 (the stale allocated ask stays in the inbox) → it leaves.
- `server/askExpirySweep.personalLink.test.ts` about L35 (allocated 504 excluded) → included when stale.
- `server/db.openAskSlots.test.ts` about L162 (queue-allocated keeps its slot however old) → frees at its window.
- `server/openAskSlots.test.ts` about L85-86: the full rendered SQL of `openAskCondition` → the new SQL without the `allocated` exists clause.

## 8. Edge cases and races
- **Lock order.** Lock order is unchanged: request row `FOR UPDATE`, then the claim-history locking read, then the allocation locking read (the `heldAsk.test.ts` pins check it).
  - A claim racing a withdraw: whoever commits first wins; the second re-reads under the lock and is refused.
  - The sweep racing an accept: the accept moves the status, so the expiry returns `expired: false`.
- **Re-delivery.** The coverage-delivery retry only selects `waitingForCoverage = true` asks, so it never re-delivers a delivered or closed ask.
- **Money.**
  - An ended month or plan: `refundLedgerSpendTx` returns 0, and the notice says the credit could not be returned (existing copy).
  - A pre-0095 waiting ask that was charged at creation and later delivered: its spend row is the original debit. Use the existing branch for its kind (ledger or legacy); never refund both.
- **Backlog.** The first sweep after deploy closes every unclaimed allocated ask already past its window. The owner action in §9 counts them first.

## 9. Definition of done
- [ ] Every §7 test red first, green now; the controls green.
- [ ] Gate on the branch merged with the latest `origin/main` (`docs/BRIEF.md` "How to ship").
- [ ] Draft PR, independent review against §10 and `docs/DELEGATION.md` §6, findings fixed red-first.
- [ ] Docs per step 6.
- [ ] Owner action added to plan §6, read-only, before the push:

  ```sql
  SELECT COUNT(*) FROM referralRequests r
  WHERE r.status='pending' AND r.referrerId IS NOT NULL AND r.createdAt >= '2026-09-21'
    AND NOT EXISTS (SELECT 1 FROM referralTransitionEvents e WHERE e.referralRequestId=r.id AND e.action='claim')
    AND EXISTS (SELECT 1 FROM referralAvailabilitySlots a WHERE a.referralRequestId=r.id AND a.status='allocated');
  ```
- [ ] One check added to `server/dailyMoneyCheck.ts` (D-065: one per money-rule slice): `allocated_ask_past_window`, any pending ask with an `allocated` slot, no claim since its latest release, and `getAskShelfLifeEndsAtMs` more than 24 hours in the past. It catches a stuck sweep.
- [ ] Pushed; `verify-live-release.sh` CONVERGED; web `git-commit` matches.
- [ ] Row `done — <sha>` with the evidence block.

## 10. Review checklist (packet-specific)
1. Does any path still treat an `allocated` slot as a pickup? Search `readQueueAllocationTx`, `referralAvailabilitySlots` and `allocated` in `server/heldAsk.ts` and the four `server/db.ts` functions.
2. Does every clock for an assigned ask use `getAskShelfLifeEndsAtMs` (visibility-aware), never `createdAt` alone? Check the claim guard, the inbox, the sweep and the reconcile.
3. Is the refund exactly one reversal per spend, in the same transaction as the status change, for both ledger and legacy debits, including on replay?
4. Is `referrerId` cleared on every release, and is the slot `released` (through `transitionReferralRequestTx`)?
5. Is the personal-link behaviour byte-for-byte unchanged? Its tests must pass without edits.

## 11. Stop and ask if
- A cited function's logic differs from §3.
- A flipped pin turns out to protect something other than the queue-allocation case.
- You need a migration, an env key, a new dependency, or a file outside §5.
- The refund for a pre-0095 delivered ask would touch more than one spend row.

## 12. Owner questions
None. What happens to an allocated ask after 48 hours without action (it returns to the company's open queue) is ruled in D-076 (3) and built by the D-038 slice A packet, not here.
