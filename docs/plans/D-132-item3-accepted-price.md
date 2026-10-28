# Packet D-132-item3 (re-scoped): the atomic accepted-price precondition

> Read [`docs/BRIEF.md`](../BRIEF.md) and complete [`docs/BUILD_CONTINUITY.md`](../BUILD_CONTINUITY.md) first. Written by Claude Opus 5.5 · 4ef3 as architect (D-109, D-221, D-225) on Oct 28 2026 against `origin/main` `6cbee199`. Revision 2 (same day) answers the coordinator's review of `1997d1e0` (findings F1-F5); revision 3 answers the round-2 review of `6f7bd77e` (GAP 1 production wiring, GAP 2 rollback harness, GAP 3 the SKIPPY-fix object contract). Earlier commits stay in history. Docs and registry only: this packet authorizes no code until a builder claims the row through the picker. Line anchors are from `6cbee199`. Re-check them with `grep -n` before you edit, and stop if a cited function has changed (§10). The register wins any conflict.

## 1. Goal

When a seeker (or Skippy for them) confirms a referral request at a cost, the request is either charged exactly that cost or refused with HTTP 409. A refused request commits no business row and charges nothing, and it can be sent again at the new cost only after an explicit second confirmation. This is the precondition `SKIPPY-fix` S-3 needs (D-140, D-221). It is model-independent: it guards whatever the server charges today, and it never builds the D-132 per-level quote or any D-219 level mapping.

Goal check: a seeker who is never charged a surprise amount trusts the send button. That protects conversion and word of mouth, and nobody's money is put at risk (product compass, payments bar).

## 2. Binding rules (quoted or summarized from the register)

- **D-219 (4):** "Balance and charge show before sending, and a referral is spent only when a verified employee can see the request (D-034/D-047 unchanged)." **D-219 (8):** "the job-level (L1-L10) to band classification" is **not decided**. This packet adds no mapping, rate, price, spend order or refund choice.
- **D-221 (2):** the re-scope keeps "the valid invariant (an ask is charged exactly the quote the seeker accepted, or answers 409 with nothing charged) and restate[s] the quote as the request's level band plus its spend source. First deliverable of the re-scope: the accepted-price precondition (expectedCost, 409 before any debit), which SKIPPY-fix S-3 needs; the D-132 per-level credit quote is not rebuilt."
- **D-140:** a money confirmation binds to the exact amount. **D-034/D-047:** a waiting (uncovered) request costs nothing until first visibility. **D-147:** every employee decline keeps the charge spent. **D-042:** existing money paths keep their recovery.
- **Flags:** `ASK_LEVEL_COST`, `PLAN_FAMILY_V2` and their `VITE_*` twins stay off and are not extended. The guard needs no flag. It acts only when a caller sends `expectedCost`, and no caller sends it before this row lands, so landing does not change behaviour (D-223 (2)).
- **Never:** change a price, plan content, legal text, refund rule or flag default, add a migration or env key, or touch the referrer side or privacy surfaces.

## 3. Current behaviour (verified on `6cbee199`)

- `expectedCost` and `AskPriceChangedError` appear nowhere in the code. The only references are the packet text pinned by `scripts/register520Packets.test.ts:36` and `:40`.
- **Coverage guard only:** `server/db.ts:1919` throws `CoverageOpenedUpError`, but only with `ASK_LEVEL_COST` on, and only when the composer promised a free wait (`expectedCoverage`) and the company is now covered. It throws before the slot cap and before every write. The error class is at `server/planGates.ts:55-63`, and the route maps it to 409 at `server/privateReferralRoutes.ts:813-816`.
- **Charge site:** in `createCompanyReferralRequest` (`server/db.ts:1873`), the transaction locks the wallet (`:1892`). The `jobs` and `referralRequests` rows are inserted at `:1959-1960`. The covered branch then reconciles the wallet (`:1968`; `reconcileSeekerWalletTx`, `server/creditCycles.ts:167`, may write the wallet row and heal grants). It reads the promo state, computes `askCost` (`:1973`, `askCreditCost` at `:4173`, which is flat 1 while `ASK_LEVEL_COST` is off) and calls `spendCreditsTx` (`server/creditLedger.ts:128`) with `promo: promoGrantsEnabled() ? promoHolding(promoState.grant) : null` (`:1974`). `spendCreditsTx` runs `spendableBuckets` + `allocateSpend` (`shared/creditSpend.ts:41`, `:21`), soonest expiry first (`orderBuckets`, `:15`), and writes one ledger row per allocation. Nothing compares the result with what the seeker saw.
- **Replay:** the same-key duplicate check (`server/db.ts:1900-1901`) returns the stored request with `replayed: true` before any coverage or cost logic. It does not report what was charged.
- **Quote route:** `GET /api/company-referrals/quote` (`server/privateReferralRoutes.ts:725-738`) returns exactly `{ level, cost, totalAvailable, shortfall }`, and **`cost` is a number** (`:737`; pinned by `server/askQuoteRoute.test.ts`). Its units come from `assignJobLevel({ url })` (`:731-732`), not from `askCreditCost` over the fields `createCompanyReferralRequest` classifies (constant title and description plus the URL; `companyAskJobRow`, `server/db.ts:1859-1861`). With the flag off both give 1. `SKIPPY-fix.md:13` still cites `:709-710`, which is stale.
- **Skippy race** (`SKIPPY-fix.md:26-29`, confirmed): `server/skippieSeeker.ts:395-396` overwrites `session.quote` with the fresh quote before any comparison. `:400` calls `createAsk` without any expected amount. `server/skippieSeekerDeps.ts:162-168` copies the quote math by hand.

## 4. Rulings (decided under D-200 by this architect session; changeable; no owner decision is changed)

1. **The accepted-cost identity (`AcceptedAskCost`, a strict Zod object in `shared/acceptedAskCost.ts`):**
   ```ts
   { units: number;                                   // int >= 1: what the server debits now (askCreditCost; unchanged)
     band: string | null;                             // D-219 band; null until D-219 (8) is settled
     source: Array<{ bucket: CreditBucket; units: number }> } // int >= 1 each; one entry per bucket; CREDIT_BUCKETS order; sum === units
   ```
   - `source` is built by `acceptedAskCostFrom(units, band, allocations)`, which folds `allocateSpend`'s allocations per bucket. Nothing is lost when one `units` total is split across buckets: 1 cycle + 2 purchased differs from 2 cycle + 1 purchased (F2).
   - **Grant ids and expiry dates are not part of the identity.** The shown quote (D-219 (4)) states a count and a source, never a grant. The real spend order (`orderBuckets`) already decides which grant of a bucket pays, so the seeker makes no grant choice. Comparing grants would refuse quotes that look identical to the seeker and could loop.
   - Spend order and pricing are not changed: the identity only describes what `allocateSpend` already does.
   - `band` comes only from `askBandForLevel(level)`, which returns `null` for every level in this row. That is the one seam a future owner-approved mapping replaces; this row never fills it.
   - Two costs match only when every field is deep-equal (`sameAcceptedAskCost`).
2. **Field names (F1).** The quote route keeps its numeric `cost` and adds a separate `acceptedCost: AcceptedAskCost | null`. The request field is `expectedCost` (the name pinned by `register520Packets.test.ts:36`), and its value must be the quote's `acceptedCost` object, never the numeric `cost`. The create result gains `chargedCost`, and the 409 body carries the current object as `acceptedCost`. No existing field changes name, type or position.
3. **Where the check runs.** `spendCreditsTx` gains an optional `accept(allocations)` callback. It is called after `allocateSpend` and its existing shortfall refusal, and before the first write. The allocation that is compared is therefore exactly the allocation that is spent.
   - The throw rolls back the whole `createCompanyReferralRequest` transaction: the `jobs` and `referralRequests` inserts (`:1959-1960`), any wallet reconcile writes, attachment binding, notifications, review links, coverage invitations and ledger rows.
   - The builder may hoist the check above the inserts only by reusing the same single reconcile and allocation; a second `reconcileWalletTx` call is not allowed.
4. **What is guarded.** Only a request charged at creation (covered).
   - A request that ends up waiting charges nothing now (D-034), so `expectedCost` is not compared and the request is created waiting as today.
   - A free wait that turns covered stays the existing `CoverageOpenedUpError` path, unchanged.
   - A shortfall keeps today's insufficient-referrals refusal and text. It is checked before `accept`, and nothing is charged.
5. **Idempotent replay.** `expectedCost` is **not** part of `companyReferralFingerprint`. A replay still returns before any cost logic, so an earlier success replays with no new rows whatever `expectedCost` it carries. After a 409 nothing was committed, so the reconfirmed send may reuse the same idempotency key.
6. **What was charged.** The create result gains `chargedCost: AcceptedAskCost | null`:
   - When charged, it comes from `spent.allocations` with the same `units` and `band`.
   - When waiting, it is `null`.
   - On replay it is rebuilt from the request's debit rows keyed `${idempotencyKey}#n`: the bucket through the inverse of `BUCKET_SOURCES` (`shared/creditLedger.ts:71`, one value per bucket) and the units from `-tokenCount`, with `band` from `askBandForLevel`. It is `null` if there are no debit rows.

   Callers may say what was charged only from this field (`SKIPPY-fix` S-2/S-3).
7. **The 409 body.** `{ error, code: "ask_price_changed", acceptedCost: <the current AcceptedAskCost> }`, Zod `askPriceChangedSchema`.
   - The message lives on the error class in `server/planGates.ts`, following the `CoverageOpenedUpError` precedent, and uses referral wording (D-180): "The cost of this referral request changed since you confirmed it. Nothing was sent and nothing was charged. Check the new cost and confirm again to send."
   - `shared/moneyCopy.ts` is not touched: open rows own it (D-174-held-ask-reconfirm, D-180-a-free-asks-chip).
   - The route also writes exactly one non-business audit event, `company_referral.price_changed` with outcome `denied`, through the existing `record` (`server/privateReferralRoutes.ts:226`, outside the transaction, like every other denial). It writes no `company_referral.created`.
8. **The preview (F3).** `previewAskCost(userId, targetRoleUrl)` in `server/db.ts` is **not read-only**. It runs the same locked transaction as `getTokenWallet` (`server/db.ts:4373-4383`): wallet lock, `reconcileWalletTx` (whose cycle and heal writes `getTokenWallet` already commits today on every balance read) and `promoStateForTx`.
   - It then calls a new pure `previewSpend(...)` in `server/creditLedger.ts`. That function takes exactly `spendCreditsTx`'s input shape (`wallet`, `grants`, `promo`, `credits`, `now`), and `spendCreditsTx` itself calls it, so the two cannot diverge.
   - The `promo` argument is the same expression as the create path: `promoGrantsEnabled() ? promoHolding(promoState.grant) : null`.
   - `units` is `askCreditCost` over the same fields `companyAskJobRow` sets (its constant title and description and the normalized URL), not the quote route's `assignJobLevel({ url })` copy.
   - It writes no spend, request or ledger debit. It returns `acceptedCost` (`null` on a shortfall).
   - **Production wiring (GAP 1).** The quote route reads it from a new optional dependency, `previewAskCost`, on `PrivateReferralRouteDeps`.
     - Production passes it in the one existing registration call (`server/_core/index.ts:222`, which today passes only `getCreditSummary: db.getTokenWallet` for pricing): add exactly `previewAskCost: db.previewAskCost` beside it.
     - That edit is a switch-only owned change (one line of that file, under scope-check's 12-line cap).
     - A route test cannot see that file, so `server/askQuoteWiring.test.ts` (new) pins it from the source: the `registerPrivateReferralRoutes(` call in `server/_core/index.ts` passes `previewAskCost: db.previewAskCost` and still passes `getCreditSummary: db.getTokenWallet`.
     - When the dependency is absent (tests that do not inject it), the field is left out.
     - When it throws, the route answers today's 500 "We could not price this ask". It never returns a silent `null`, because `null` means a shortfall.

   The preview is a snapshot, not a hold. The guard in ruling 3 is what makes the charge atomic.

## 5. Scope

**In scope (the row's `owns`):**
- `shared/acceptedAskCost.ts` (new): the schema, `ASK_PRICE_CHANGED`, `askPriceChangedSchema`, `acceptedAskCostFrom`, `sameAcceptedAskCost`, `askBandForLevel` (always `null`).
- `shared/acceptedAskCost.test.ts` (new)
- `server/creditLedger.ts`: only `previewSpend` and the optional `accept` callback on `spendCreditsTx`
- `server/planGates.ts`: only `AskPriceChangedError`
- `server/db.ts`: only `CreateCompanyReferralInput`, `createCompanyReferralRequest` (covered branch and the replay return) and the new `previewAskCost`
- `server/privateReferralRoutes.ts`: only the quote route's added field and the `POST /api/company-referrals` body parse plus the 409 map
- `server/_core/index.ts (switch only)`: only the `previewAskCost: db.previewAskCost` key in the `registerPrivateReferralRoutes(` call (GAP 1)
- `server/askQuoteWiring.test.ts` (new): the source pin for that key (GAP 1)
- `server/askCreateFixtureDb.ts` (new) and `server/askCreateFixtureDb.test.ts` (new): the rollback-capable create-path fixture (GAP 2, §7a)
- `server/db.askPriceGuard.test.ts` (new): uses `askCreateFixtureDb` only, never a permissive fixture
- `server/askQuoteRoute.test.ts`
- `server/privateReferralRoutes.integration.test.ts`
- this packet (Status line only)

**Out of scope:**
- Skippy callers (`server/skippieSeeker.ts`, `server/skippieSeekerDeps.ts`): that is `SKIPPY-fix` S-3, which reuses this contract.
- The web composer (any client file): see §12. No row is registered for it.
- `ASSIST-approval-cost` (#761) and its route.
- `shared/moneyCopy.ts`, migrations, env keys, flags and refunds.
- Delivery-time spend for waiting requests (`deliverWaitingAskTx`): D-193 reconfirm's area.
- The D-219 band mapping and the D-219 (4) spend order.
- PRs #541-#544, #550 and #542: source material only, never merged (D-221).

## 6. Steps (one commit each, focused tests + `pnpm check` after each)

0. Harness: `server/askCreateFixtureDb.ts` and its test (§7a), before any guard test is written.
1. Contract: `shared/acceptedAskCost.ts` and its test (§7 tests 1-4).
2. Ledger: `previewSpend` and the `accept` callback on `spendCreditsTx`. With no callback, behaviour is exactly today's.
3. Guard: the input field, `AskPriceChangedError`, the covered-branch `accept` call, `chargedCost` (fresh and replay) and `previewAskCost`, in `server/db.ts` and `server/planGates.ts`.
4. Routes:
   - The quote route adds `acceptedCost` through the optional `previewAskCost` dependency.
   - Production wiring: the one `server/_core/index.ts` key, plus `server/askQuoteWiring.test.ts` (§7 test 20).
   - `expectedCost` is parsed with `acceptedAskCostSchema`. A present but malformed value, including a bare number, gets 400 "Confirm the cost again before sending." and `createCompanyReferralRequest` is not called.
   - The 409 map plus its one audit event.
5. Status line, full gate on the branch merged with `origin/main`, then a draft PR.

## 7. Red-first tests (each must fail before its step's code exists)

`shared/acceptedAskCost.test.ts`:
1. The schema is strict. It refuses unknown fields, `units < 1`, an empty `source`, an unknown bucket, source units whose sum is not `units`, a duplicate bucket, non-canonical bucket order and a bare number.
2. `acceptedAskCostFrom` folds allocations per bucket in `CREDIT_BUCKETS` order:
   - over the real `allocateSpend`, cycle 1 + purchased 5 at 3 units gives `[{cycle,1},{purchased,2}]`;
   - cycle 2 + purchased 5 gives `[{cycle,2},{purchased,1}]`, and `sameAcceptedAskCost` is false between them;
   - two carryover grants (ids 11 and 12) give one `{carryover,2}`.
3. `sameAcceptedAskCost` is false when any single field differs.
4. `askBandForLevel(n)` is `null` for n = 1 to 10. This pins that no mapping slipped in.

`server/db.askPriceGuard.test.ts` (on `server/askCreateFixtureDb.ts`, §7a; flags off unless the test says otherwise; every zero-write assertion below is valid only on that rollback fixture):

5. **Match:** a covered request with `expectedCost` equal to `previewAskCost(...).acceptedCost` creates the request, writes the ledger rows keyed `#1..#n` for the allocations, and returns `chargedCost` deep-equal to the expected cost.
6. **Bucket drift:** the expected source is `[{cycle,1}]`, but the wallet now pays from `purchased`.
   - The call rejects with `AskPriceChangedError`, and its `acceptedCost.source` is `[{purchased,1}]`.
   - Afterwards there are zero new rows in `jobs`, `referralRequests`, `askWorkItems`, `askCosts`, `notifications`, `referrerReviewEmailLinks`, `referralReviewDeliveries`, `companyCoverageInvitations` and `tokenTransactions`.
   - No `referralAttachments.referralRequestId` is bound, and the `tokenBalances` and `planCreditGrants` rows are byte-equal to their state before the call (any reconcile write in that transaction is rolled back too).
7. **Split drift:** units 3, expected `[{cycle,1},{purchased,2}]`, while the wallet now allocates `[{cycle,2},{purchased,1}]`. The call returns 409 with the same zero-write assertions. This is the F2 regression.
8. **Units drift** (`ASK_LEVEL_COST=true` set only inside this test and restored after; no product enable): the expected units are 1 and the level cost is 3. The call returns 409 with the same zero-write assertions.
9. **Reconfirm:** re-send with the same idempotency key and `expectedCost = error.acceptedCost`. It succeeds, the allocations are spent exactly once, and `chargedCost` equals the reconfirmed cost.
10. **Replay:** a third call with the same key and any `expectedCost` returns `replayed: true` with no new rows. Its `chargedCost`, rebuilt from the ledger rows, equals test 9's.
11. **Legacy:** with no `expectedCost`, results and rows are unchanged. These suites run unmodified and pass: `db.askOutOfCredits`, `db.askLevelCost`, `db.askCostStored`, `db.openAskSlots`, `db.companyCap`, `db.blockDelivery`, `db.opportunityFirstLook`, `db.askPinnedWork` and `db.askCreditRefund`.
12. **Waiting:** an uncovered company with `expectedCost` present is created waiting with no spend, no 409 and `chargedCost: null`.
13. **Shortfall:** with `expectedCost` present and the balance now short, the call keeps today's insufficient refusal text, with no rows and no 409.
14. **Coverage precedence:** with `ASK_LEVEL_COST=true`, `expectedCoverage` waiting and the company now covered, the call still throws `CoverageOpenedUpError`.
15. **Preview parity:**
    - With `PROMO_GRANTS_ENABLED` both off and on, and with an expiring carryover grant, `previewAskCost(...).acceptedCost` deep-equals the `chargedCost` of an immediate send.
    - With the promo flag off, a live promo grant is not counted.
    - The preview writes no `tokenTransactions` spend row and no request.

`server/askQuoteRoute.test.ts`:

16. The quote response keeps `level`, `cost` (still a number), `totalAvailable` and `shortfall` with their current values and order, and adds only `acceptedCost`. `acceptedCost` comes from the injected `previewAskCost` and is `null` on a shortfall. With no `previewAskCost` dependency, the response has exactly the four current keys (today's `askQuoteRoute.test.ts` cases pass unmodified). A `previewAskCost` that throws gives today's 500 "We could not price this ask", never `acceptedCost: null`.

`server/privateReferralRoutes.integration.test.ts`:

17. A dependency-level `AskPriceChangedError` becomes 409 `{ error, code: "ask_price_changed", acceptedCost }` that parses with `askPriceChangedSchema`.
    - `record` receives exactly one event, `company_referral.price_changed` / `denied`, and no `company_referral.created`.
    - `dispatchReferralReviewDeliveries` is not called.
18. `expectedCost` handling:
    - A bare number (for example `expectedCost: 1`) or a malformed object gets 400, and `createCompanyReferralRequest` is not called.
    - A valid object is passed through.
    - An absent one passes `undefined`.
19. A successful create response includes `chargedCost`.

`server/askQuoteWiring.test.ts` (new; GAP 1):

20. It reads `server/_core/index.ts` as text, isolates the `registerPrivateReferralRoutes(` call, and asserts it contains `previewAskCost: db.previewAskCost` and still `getCreditSummary: db.getTokenWallet`. Before step 4 it fails, because production passes no `previewAskCost`.

## 7a. The rollback harness (GAP 2)

**Why a new fixture.**
- Every existing fixture that runs `createCompanyReferralRequest` runs the transaction body with no rollback (`transaction: cb => cb(api)`): `db.askOutOfCredits`, `db.askCostStored`, `db.askPinnedWork`, `db.companyCap`, `db.openAskSlots` and `db.opportunityFirstLook` (`server/db.askCostStored.test.ts:270`).
- The rollback-capable `server/ledgerFixtureDb.ts` (snapshot and restore at `:158-160`) models only 11 tables, has no `jobs`, `profiles` or `referralAttachments`, and has no `innerJoin`, so it cannot run the create path.
- A permissive fixture keeps the rows written before a throw, so it can never prove atomicity.

**The fixture (`server/askCreateFixtureDb.ts`, new).**
- It is the SQL slice `server/db.askCostStored.test.ts:42-270` already uses to run the real create path (21 tables, inner and left joins, `for("update")`, the predicates, and inserts into any table by name), moved into one module so it can be shared.
- It differs in one place: its `transaction` takes a `structuredClone` of every table and of the id sequence, and on any throw restores them and rethrows.
- The existing test files are not edited.

**`server/askCreateFixtureDb.test.ts` (new, red first):**
- **a.** A transaction that inserts into two tables and then throws leaves every table and the id sequence deep-equal to before.
- **b.** A transaction that succeeds keeps its writes.
- **c.** On this fixture, a real `createCompanyReferralRequest` whose spend fails after the `jobs` and `referralRequests` inserts (no credit left) leaves the business tables deep-equal to before.
- **d.** On this fixture, a real covered create commits one request and one `#1` debit.
- **e.** On this fixture, a real waiting create commits one request and one `companyCoverageInvitations` row, with no debit.
- **f.** On the permissive `cb(api)` semantics, the same failure as (c) leaves one orphan `jobs` row and one orphan `referralRequests` row. This test keeps the reason for the fixture visible.

## 8. Done

All of:
- the tests above red first, then green;
- one commit per step;
- the full gate on the branch merged with the latest `origin/main`;
- required CI green on the exact head;
- the DELEGATION §5 evidence block;
- an independent Tier 1 review by a model that neither built nor fixed the work (D-151);
- landing by fast-forward or merge-commit only, never squash (D-134 (6)).

No production verification is due, because no caller sends `expectedCost` until `SKIPPY-fix` S-3 lands. Say so in the report. Do not call SKIPPY-fix or anything else "unblocked" beyond what the picker shows.

## 9. Review checklist

1. Without `expectedCost`, every send is byte-for-byte today's, proven by the unmodified suites (test 11) and today's `askQuoteRoute.test.ts` (test 16), not by reading the code.
2. A 409 commits zero business rows (tests 6-8, on the rollback fixture of §7a only). Its only side effect is the one denied audit event (test 17).
3. The compared allocation is the spent allocation: `spendCreditsTx` calls `previewSpend` and the `accept` callback runs on its result, with no second reconcile.
4. `expectedCost` is outside the fingerprint, and a replay never reaches the guard.
5. Numeric `cost` is untouched, and a bare number is never accepted as `expectedCost`.
6. `askBandForLevel` returns `null` everywhere. There is no rate, mapping, spend-order or flag-default change.
7. Nothing changes refunds (D-147), waiting-request delivery (D-034/D-047), privacy, the referrer side, `shared/moneyCopy.ts` or any client file.
8. Production passes `previewAskCost` (test 20); the live quote is not mock-only.

## 10. Stop and ask (`--report blocked` with the question)

- A cited function no longer matches this packet on the current `origin/main`.
- The guard cannot run before the first committed write without a second reconcile.
- `askCreateFixtureDb` cannot model a test above. Report it; do not weaken the test, and never fall back to a permissive (`cb(api)`) fixture for a zero-write assertion.
- Any pressure to fill `askBandForLevel`, follow the D-219 (4) spend order, or change wording in `shared/moneyCopy.ts`: those decisions belong to the owner or to other rows.

## 11. Rows and ordering (D-223: split by owned files)

| Row | Owns | dependsOn | Why |
|---|---|---|---|
| `D-132-item3` (this packet; the id is kept because `register520Packets.test.ts:40` pins SKIPPY-fix's edge to it) | §5 in-scope list | `D-132-audit` (done), `D-090-BYOR` | `D-090-BYOR` holds open draft PR #632 and owns `server/db.ts` and `server/privateReferralRoutes.ts`. The serialization stays (F5): this row waits unless that row's holder agrees to reorder. A reorder needs the holder's acknowledgment on #632, recorded in both notes; until then this edge stands. |
| `server/_core/index.ts (switch only)` ordering (GAP 1) | — | — | The other open owners of that file are `D-090-BYOR`, which owns it whole (this row waits for it), and `D-099-bonus-pages`, which owns it switch-only. Two switch-only claims on one file never need ordering (`ownsOverlap`, `scripts/nextTaskCore.mjs:84-87`, D-200: scope-check caps each at 12 lines, which git merges), and `D-099-bonus-pages` also waits for this row transitively through `D-174-held-ask-reconfirm`. No new edge is needed. |
| `D-174-held-ask-reconfirm` (existing; unclaimed, no branch on origin) | unchanged | adds `D-132-item3` | Its owns overlap this row's. It already waits for `D-090-BYOR`, so the edge adds no wait beyond this small row. `D-174-ask-from-job` and `D-174-pool-nudges` then wait transitively. |
| `SKIPPY-fix.s1-ssrf` (new; epic `SKIPPY-fix`; packet `docs/plans/SKIPPY-fix.md` §S-1 unchanged) | `server/skippieSeekerDeps.ts`, `server/skippieSeekerDeps.test.ts` | none | See §11a. |
| `SKIPPY-fix` (existing; no owns, no branch, no claim) | unchanged | `D-132-item3` (pinned) plus `SKIPPY-fix.s1-ssrf` | S-2 to S-6 and the live proof. It edits `skippieSeekerDeps.ts` for S-3 only after S-1 lands. |

### 11a. Why S-1 can move independently (F5)

S-1 (Skippy's job-page reader) needs no DB guard. Its whole fix is in `server/skippieSeekerDeps.ts` (`isPublicHostname` at `:20`, `fetchJobText` at `:42`) plus the new `server/skippieSeekerDeps.test.ts`.

**Holder and owns check on `6cbee199`:**
- No open row owns either file. The only open Skippy owns are `D-048-p3-skippy`'s client files.
- `SKIPPY-fix` has no `owns`, and there is no `agent/queue/skippy-fix*` branch, claim or heartbeat on origin. No in-flight claim exists to preserve or take.

**What the split does and does not change:**
- Splitting by owned file (D-223 (6)) lets S-1 build while the guard waits for BYOR.
- The SSRF finding is latent: `SKIPPIE_SEEKER_ENABLED` is off in production (D-201), so nothing here claims a live leak.
- The split turns no flag on and does not waive D-201. No Skippy flag goes on until the parent `SKIPPY-fix` lands with its proof, including S-1's live item 2.
- The S-1 row's done is §S-1's red-first test with an injected fake fetcher (no network), plus the full gate, required CI and an independent Tier 1 review (security).

## 12. Not registered: the web composer (F4)

Revision 1 bound four client files in a composer row with no implementation contract, so that row is withdrawn. When a composer row is wanted, it gets its own section with:
- red-first tests (send echoes `acceptedCost` as `expectedCost`; a 409 shows the returned cost and needs a second click; a replay sends nothing twice);
- its own done contract;
- dependencies on the then-open owners of `useAskComposer.tsx`, `askSend.ts` and `ask.costQuote.test.tsx` (today `D-048-p3-live-review-find`, `D-099-bonus-line` and `D-174-fix-post-binding`).

Until then the composer keeps today's behaviour, and nothing in this packet claims it is ready to build.

## Status
These rows share the §3b row D-132, so their status lines go here (D-134).
- D-132-item3: todo — re-scoped Oct 28 by Claude Opus 5.5 · 4ef3 (architect), revision 2 after the coordinator's review; not built.
