# Packet D-132-item3 (re-scoped): the atomic accepted-price precondition

> Read [`docs/BRIEF.md`](../BRIEF.md) and complete [`docs/BUILD_CONTINUITY.md`](../BUILD_CONTINUITY.md) first. Written by Claude Opus 5.5 · 4ef3 as architect (D-109, D-221, D-225) on Oct 28 2026 against `origin/main` `6cbee199`. Docs and registry only: this packet authorizes no code until a builder claims the row through the picker. Line anchors are from `6cbee199`. Re-check them with `grep -n` before you edit, and stop if a cited function has changed (step 10). The register wins any conflict.

## 1. Goal

When a seeker (or Skippy for them) confirms a referral request at a cost, the request is either charged exactly that cost or refused with HTTP 409. A refused request writes nothing and charges nothing, and it can be sent again at the new cost only after an explicit second confirmation. This is the precondition `SKIPPY-fix` S-3 needs (D-140, D-221). It is model-independent: it guards whatever the server charges today, and it never builds the D-132 per-level quote or any D-219 level mapping.

Goal check: a seeker who is never charged a surprise amount trusts the send button. That protects conversion and word of mouth, and nobody's money is put at risk (product compass, payments bar).

## 2. Binding rules (quoted or summarized from the register)

- **D-219 (4):** "Balance and charge show before sending, and a referral is spent only when a verified employee can see the request (D-034/D-047 unchanged)." **D-219 (8):** "the job-level (L1-L10) to band classification" is **not decided**. This packet adds no mapping, rate, price or refund choice.
- **D-221 (2):** the re-scope keeps "the valid invariant (an ask is charged exactly the quote the seeker accepted, or answers 409 with nothing charged) and restate[s] the quote as the request's level band plus its spend source. First deliverable of the re-scope: the accepted-price precondition (expectedCost, 409 before any debit), which SKIPPY-fix S-3 needs; the D-132 per-level credit quote is not rebuilt."
- **D-140:** a money confirmation binds to the exact amount. **D-034/D-047:** a waiting (uncovered) request costs nothing until first visibility. **D-147:** every employee decline keeps the charge spent. **D-042:** existing money paths keep their recovery.
- **Flags:** `ASK_LEVEL_COST`, `PLAN_FAMILY_V2` and their `VITE_*` twins stay off and are not extended. The guard needs no flag. It acts only when a caller sends `expectedCost`, and no caller sends it before this row lands, so landing does not change behaviour (D-223 (2)).
- **Never:** change a price, plan content, legal text, refund rule or flag default, add a migration or env key, or touch the referrer side or privacy surfaces.

## 3. Current behaviour (verified on `6cbee199`)

- `expectedCost` and `AskPriceChangedError` appear nowhere in the code. The only references are the packet text pinned by `scripts/register520Packets.test.ts:36` and `:40`.
- **Coverage guard only:** `server/db.ts:1919` throws `CoverageOpenedUpError`, but only with `ASK_LEVEL_COST` on, and only when the composer promised a free wait (`expectedCoverage`) and the company is now covered. It throws before the slot cap and before every write. The error class is at `server/planGates.ts:55-63`, and the route maps it to 409 at `server/privateReferralRoutes.ts:813-816`.
- **Charge site:** in `createCompanyReferralRequest` (`server/db.ts:1873`), the `jobs` and `referralRequests` rows are inserted at `:1959-1960`. The covered branch then computes `askCost` (`:1973`, `askCreditCost`, `:4173`, which is flat 1 while `ASK_LEVEL_COST` is off). It calls `spendCreditsTx` (`server/creditLedger.ts:128`), which runs `spendableBuckets` + `allocateSpend` (`shared/creditSpend.ts:21`, `:41`) and writes one ledger row per bucket. Nothing compares the result with what the seeker saw. Spend order is soonest-expiring first (`orderBuckets`, `shared/creditSpend.ts:15`), so which bucket pays (the spend source) can change between the quote and the send, for example when a cycle rolls or a grant expires.
- **Replay:** the same-key duplicate check (`server/db.ts:1900-1901`) returns the stored request with `replayed: true` before any coverage or cost logic. It does not report what was charged.
- **Quote route:** `GET /api/company-referrals/quote` (`server/privateReferralRoutes.ts:725-738`) returns `{ level, cost, totalAvailable, shortfall }`. It does not report the spend source. (`SKIPPY-fix.md:13` cites `:709-710`, which is stale: the cost lines are now `:731-732`.)
- **Skippy race** (`SKIPPY-fix.md:26-29`, confirmed): `server/skippieSeeker.ts:395-396` overwrites `session.quote` with the fresh quote before any comparison. `:400` calls `createAsk` without any expected amount, and the price is fixed only inside the DB transaction, after the fresh quote. `server/skippieSeekerDeps.ts:162-168` copies the quote math by hand.

## 4. Rulings (decided under D-200 by this architect session; changeable; no owner decision is changed)

1. **The accepted-cost identity** is `AcceptedAskCost = { units, band, source }`:
   - `units` is the number of referral units the server will debit now, i.e. the existing `askCreditCost` result, unchanged.
   - `band` is the request's D-219 band, `null` until the owner settles D-219 (8). It is produced only by `askBandForLevel()`, and in this row that function returns `null` for every level. That function is the one place a future mapping plugs in; this row never fills it.
   - `source` is the ordered, de-duplicated list of ledger buckets (`CreditBucket`, `shared/creditLedger.ts:67`) that `allocateSpend` draws from for that debit.
   - Two costs match only when every field is equal (`source` order included), like `sameApprovalCost` in PR #761.
2. **Request field name `expectedCost`** (keeps the pinned packet wording). Its value is the whole `AcceptedAskCost` object, never a bare integer (D-221 note on ASSIST-approval-cost).
3. **Where the check runs:** inside `spendCreditsTx`, after `allocateSpend` and its existing shortfall refusal and before the first write, through a new optional `accept(allocations)` callback. The allocation that is compared is then exactly the allocation that is spent, so no second computation can drift from it. The throw rolls back the whole `createCompanyReferralRequest` transaction, including the `jobs` and `referralRequests` inserts at `:1959-1960`, so no request, job, attachment binding, notification, review link or ledger row is committed. The builder may instead hoist the check above the inserts, but only if it reuses the same single reconcile and allocation; a second `reconcileWalletTx` call is not allowed.
4. **What is guarded:** only a request charged at creation (covered). A request that ends up waiting charges nothing now (D-034), so `expectedCost` is not compared and the request is created waiting as today. A free wait that turns covered stays the existing `CoverageOpenedUpError` path, unchanged. A shortfall keeps today's insufficient-referrals refusal and wording: it is checked before `accept`, and nothing is charged.
5. **Idempotent replay:** `expectedCost` is **not** part of `companyReferralFingerprint`. A replay still returns before any cost logic, so an earlier success replays with no new rows whatever `expectedCost` it carries. After a 409 nothing was created, so the reconfirmed send may reuse the same idempotency key.
6. **What was charged:** the create result gains `chargedCost: AcceptedAskCost | null`. It comes from `spent.allocations` when charged and is `null` when waiting. On replay it is rebuilt from the ledger rows keyed `${idempotencyKey}#n` (bucket recovered through `BUCKET_SOURCES`), or `null` if there are none. Callers may say what was charged only from this field (`SKIPPY-fix` S-2/S-3).
7. **The 409 body:** `{ error, code: "ask_price_changed", cost: <the current AcceptedAskCost> }` (Zod `askPriceChangedSchema`). The message lives on the error class in `server/planGates.ts`, following the `CoverageOpenedUpError` precedent, and uses referral wording (D-180): "The cost of this referral request changed since you confirmed it. Nothing was sent and nothing was charged. Check the new cost and confirm again to send." `shared/moneyCopy.ts` is not touched: open rows own it (D-174-held-ask-reconfirm, D-180-a-free-asks-chip).
8. **The quote route** adds `cost: AcceptedAskCost | null` (`null` when `shortfall > 0`) from a new read-only `previewAskCost(userId, targetRoleUrl)` in `server/db.ts`. That function takes the same locked, reconciled read as `getTokenWallet` (`server/db.ts:4373-4383`) and runs `spendableBuckets` + `allocateSpend` without spending. The existing fields keep their values and order, and a missing dep leaves the field out.

## 5. Scope

**In scope (the row's `owns`):**
- `shared/acceptedAskCost.ts` (new): the schema, `ASK_PRICE_CHANGED`, `askPriceChangedSchema`, `acceptedAskCostFrom(units, band, allocations)`, `sameAcceptedAskCost`, `askBandForLevel` (always `null`).
- `shared/acceptedAskCost.test.ts` (new)
- `server/creditLedger.ts`: only the optional `accept` callback on `spendCreditsTx`
- `server/planGates.ts`: only `AskPriceChangedError`
- `server/db.ts`: only `CreateCompanyReferralInput`, `createCompanyReferralRequest` (covered branch and the replay return) and the new `previewAskCost`
- `server/privateReferralRoutes.ts`: only the quote route field and the `POST /api/company-referrals` body parse plus the 409 map
- `server/db.askPriceGuard.test.ts` (new, on `server/ledgerFixtureDb`, as `server/db.askOutOfCredits.test.ts` does)
- `server/privateReferralRoutes.integration.test.ts`
- this packet (Status line only)

**Out of scope:**
- Skippy callers (`server/skippieSeeker.ts`, `server/skippieSeekerDeps.ts`): that is `SKIPPY-fix` S-3, which reuses this contract.
- The web composer: row `D-132-item3.composer`.
- `ASSIST-approval-cost` (#761) and its route: a follow-up may adopt this contract after both land.
- `shared/moneyCopy.ts`, any client file, migrations, env keys, flags, refunds, delivery-time spend for waiting requests (`deliverWaitingAskTx`, which is D-193 reconfirm's area), and the D-219 band mapping.
- PRs #541-#544, #550 and #542: source material only, never merged (D-221).

## 6. Steps (one commit each, focused tests + `pnpm check` after each)

1. Contract: `shared/acceptedAskCost.ts` and its test.
2. Ledger hook: `accept` on `spendCreditsTx`. Absent means exactly today's behaviour.
3. Guard: the input field, `AskPriceChangedError`, the covered-branch `accept` call and `chargedCost` (fresh and replay) in `server/db.ts` and `server/planGates.ts`.
4. Routes: the `previewAskCost` quote field, the `expectedCost` parse (present but malformed: 400 "Confirm the cost again before sending.", no create), and the 409 map with a `company_referral.price_changed` denied audit row.
5. Status line, full gate on the branch merged with `origin/main`, then a draft PR.

## 7. Red-first tests (they must fail before step 1-4 code exists)

`shared/acceptedAskCost.test.ts`:
1. The schema is strict: unknown fields, `units < 1`, an empty `source` and an unknown bucket are all refused.
2. `sameAcceptedAskCost` is false when any one field differs, including `source` order.
3. `askBandForLevel(n)` is `null` for n = 1 to 10. This pins that no mapping slipped in.

`server/db.askPriceGuard.test.ts` (fixture DB, flags off unless the test says otherwise):
4. **Match:** a covered request with `expectedCost` equal to `previewAskCost` creates the request, writes exactly one spend with key `#1`, and returns `chargedCost` equal to it.
5. **Source drift:** the expected source is `["cycle"]`, but the wallet now pays from `purchased`. The call rejects with `AskPriceChangedError` whose `current.source` is `["purchased"]`. Afterwards there are zero new `referralRequests`, `jobs`, `askWorkItems`, `notifications`, `referrerReviewEmailLinks` and `tokenTransactions` rows, and the wallet row is byte-equal to its state before the call.
6. **Units drift** (`ASK_LEVEL_COST=true` set only inside this test and restored after; no product enable): the expected units are 1 and the level cost is 3. The call returns 409 with the same zero-write assertions.
7. **Reconfirm:** re-send with the same idempotency key and `expectedCost = error.current`. It succeeds with exactly one spend.
8. **Replay:** a third call with the same key and any `expectedCost` returns `replayed: true` with no new rows, and its `chargedCost` equals the charge from test 7.
9. **Legacy:** with no `expectedCost`, the rows and result fields match the existing suites. Run `db.askOutOfCredits`, `db.askLevelCost`, `db.askCostStored`, `db.openAskSlots`, `db.companyCap`, `db.blockDelivery`, `db.opportunityFirstLook`, `db.askPinnedWork` and `db.askCreditRefund` unmodified, and all must pass.
10. **Waiting:** an uncovered company with `expectedCost` present is created waiting with no spend, no 409 and `chargedCost: null`.
11. **Shortfall:** with `expectedCost` present and the balance now short, the call keeps today's insufficient refusal text, with no rows and no 409.
12. **Coverage precedence:** with `ASK_LEVEL_COST=true`, `expectedCoverage` waiting and the company now covered, the call still throws `CoverageOpenedUpError` (unchanged).

`server/privateReferralRoutes.integration.test.ts`:
13. A deps-level `AskPriceChangedError` becomes 409 `{ error, code: "ask_price_changed", cost }`, and the body parses with `askPriceChangedSchema`. `dispatchReferralReviewDeliveries` is not called.
14. A malformed `expectedCost` returns 400 and `createCompanyReferralRequest` is not called. An absent one passes `undefined` through.
15. The quote route returns its four existing fields unchanged, plus `cost` from `previewAskCost`. `cost` is `null` when there is a shortfall.

## 8. Done

All of: the tests above are red first and then green; step commits; the full gate on the branch merged with the latest `origin/main`; required CI green on the exact head; the DELEGATION §5 evidence block; an independent Tier 1 review by a model that neither built nor fixed the work (D-151); landing by fast-forward or merge-commit only, never squash (D-134 (6)). No production verification is due, because no caller sends `expectedCost` until `SKIPPY-fix` and `D-132-item3.composer` land. Say so in the report. Do not call this "all unblocked": `SKIPPY-fix` still has to build S-3 on top of it.

## 9. Review checklist

1. Without `expectedCost`, every send is byte-for-byte today's: proven by the unmodified suites (test 9), not by reading the code.
2. A 409 commits zero rows of any kind (tests 5 and 6) and calls no dispatcher (test 13).
3. The compared allocation is the spent allocation: one `allocateSpend` call, inside `spendCreditsTx`.
4. `expectedCost` is outside the fingerprint, and a replay never reaches the guard.
5. `askBandForLevel` returns `null` everywhere; there are no rates, no mapping and no flag default change.
6. No change to refunds (D-147), waiting-request delivery (D-034/D-047), privacy, the referrer side, `shared/moneyCopy.ts` or any client file.

## 10. Stop and ask (`--report blocked` with the question)

- A cited function no longer matches this packet on the current `origin/main`.
- The guard cannot run before the first committed write without a second reconcile.
- Any pressure to fill `askBandForLevel`, order spend per D-219 (4), or change wording in `shared/moneyCopy.ts`: those are the owner's or other rows'.
- `ledgerFixtureDb` cannot model a test above. Report it; do not weaken the test.

## 11. Rows (D-223: split by owned files)

| Row | Owns | dependsOn | Note |
|---|---|---|---|
| `D-132-item3` (this packet; id kept, because `scripts/register520Packets.test.ts:40` pins SKIPPY-fix's edge to it) | §5 in-scope list | `D-132-audit` (done), `D-090-BYOR` | Tier 1, lane `money-core`. `D-090-BYOR` holds open draft PR #632 and owns `server/db.ts` and `server/privateReferralRoutes.ts`. D-223 (5) forbids holding an in-flight PR behind a new row, so this row waits for it instead. |
| `D-174-held-ask-reconfirm` (existing, unclaimed, no branch) | unchanged | adds `D-132-item3` | Its owns overlap this row (`server/db.ts`, `server/privateReferralRoutes.ts`). It already waits for `D-090-BYOR`, so this edge adds no new wait beyond this small row. `D-174-ask-from-job` and `D-174-pool-nudges` then wait transitively. |
| `D-132-item3.composer` (new, epic `D-132-item3`) | `client/src/hooks/useAskQuote.ts`, `client/src/pages/explore/askSend.ts`, `client/src/pages/explore/useAskComposer.tsx`, `client/src/pages/explore/ask.costQuote.test.tsx` | `D-132-item3`, `D-099-bonus-line`, `D-174-fix-post-binding` | The `/ask` composer echoes the quote route's `cost` as `expectedCost` and handles `ask_price_changed` with a two-click re-quote. It waits for the open owners of those files (`D-099-bonus-line` waits for `D-048-p3-live-review-find`). |
| `SKIPPY-fix` (existing) | unchanged | unchanged (`D-132-item3`) | S-3 passes the confirmed `AcceptedAskCost` as `expectedCost` and states only `chargedCost`. |

## Status
These rows share the §3b row D-132, so their status lines go here (D-134).
- D-132-item3: todo — re-scoped Oct 28 by Claude Opus 5.5 · 4ef3 (architect); not built.
- D-132-item3.composer: waiting — for D-132-item3, D-099-bonus-line and D-174-fix-post-binding.
