# Packet D-079: free credits unlock only after the seeker validates a card

> Read `docs/BRIEF.md` first, then this packet. You need nothing else unless a section below names it.

| Field | Value |
|---|---|
| Queue row | `docs/KIT_V4_BUILD_PLAN.md` §3b `D-079-card-validation-free-credits` (status lives there, nowhere else) |
| Decisions | D-079 (binding text quoted in §2), D-067, D-031 |
| Risk tier | 1 (credits ledger, provider webhook, money path) |
| Size | M |
| Implementer | senior model only |
| Branch | `agent/instinct/card-validation` from the latest `origin/main` |
| Depends on | none on main; production enablement waits on the owner's Chargebee dashboard check (§12 Q1) |
| Do not run at the same time as | D-038-A, D-038-B, D-035 (same wallet/cycle functions in `server/db.ts` + `server/creditCycles.ts`), D-065-B (same check file) |
| Verified against | `main` `b60eda03` on 2026-10-19 |

## 1. Goal
A job seeker's free monthly credits (D-067's Free 3 asks/month) appear only after the seeker has validated a payment card. Validation is owned end to end by the provider: Chargebee collects the card on its own hosted page and performs its card-verification authorization (a unit-currency hold it voids automatically, never settled). SkipWait stores only the outcome (`cardValidatedAt`, set from the verified webhook or a provider-truth re-read) and never builds custom payment or refund code. Failures alert the owner immediately. Behind `FREE_CREDITS_REQUIRE_CARD_VALIDATION`, default off; enabled in production only on the owner's explicit yes after QA on the Chargebee test site.

## 2. Binding rules (quoted, not paraphrased)
- Owner, 2026-10-19 ~09:53 IST (iMessage): "For free credits users should validate their card".
- Owner, 2026-10-19 (follow-ups): "can we validate a card without dealing with any transaction" and "Should we handle that payments and refunds or chargebee can do that validity". Ruling recorded in D-079: provider owns validation and any reversal; we store only the result; failures alert the owner immediately.
- D-067 (owner, Oct 18): Free keeps 3 asks/month and job seekers are never charged for the basic ask. The verification authorization is provider-voided before settlement, so nothing is ever charged; the gate adds a one-time step, not a payment.
- D-031 (money rule): free options only; no new spend. Chargebee card verification is a dashboard setting on the existing subscription; the hosted page is part of the existing plan. No real money in tests.
- If the code, this packet and the register disagree, the register wins: stop and report (§11).

## 3. Current behaviour (verified)
1. A new seeker wallet starts empty with sentinel cycle key `"new"` (`freshWalletCycle`, `server/creditLedger.ts:69-71`; constant at `:66`).
2. `ensureTokenWallet` (`server/db.ts:3518`) inserts the wallet, then under the wallet lock calls `reconcileSeekerWalletTx` (`server/creditCycles.ts`), which sees the sentinel key as behind and opens the current Free month.
3. `openCycleTx` (`server/creditCycles.ts`, "Opens a cycle") is the single grant point for cycle credits: one `plan_grant` ledger row, idempotency key `plan-cycle:<digest>`, Free keyed by calendar month (`digest("free", key)`) so Free gets its 3 once per person per month; a second grant for the same month sets allowance 0 via `planGrantRecordedTx`.
4. Monthly resets are the same path: `planCreditCycleJob` (`server/planCreditCycleJob.ts:39`) sweeps stale Free wallets into `reconcileSeekerWalletTx`.
5. The daily money check reconciles a cycle bucket only once that cycle was opened by a `plan_grant` row (`server/db.ts:2737-2741`); a cycle with no grant row is skipped.
6. The Chargebee webhook (`POST /api/chargebee/webhook`, `server/chargebeeRoutes.ts:273`) parses subscription, paid-payment, refund and gift events only (`server/chargebee.ts`); no `payment_source_*` event is handled today.
7. Provider helpers already exist, unused by routes: `createCustomer`, `retrieveCustomer`, `createManagePaymentSourcesPage`, `listPaymentSources`, `retrievePaymentSource` (`server/chargebeeAccountApi.ts`); only its test imports the module.
8. `tokenBalances` (`drizzle/schema.ts:691`) has no card-validation column; `users` has no Chargebee customer id column.
9. Wallet payloads to the client come from `GET /api/credits/summary` (`server/privateReferralRoutes.ts:778`, summary in `server/db.ts:3575`).
10. Flags follow the `EMPLOYER_SPONSORSHIP_ENABLED` pattern (`.env.example:185-190`, forwarded in `src/worker.ts:18`, read like `promoGrantsEnabled` at `server/db.ts:3434-3435`).
11. Promo grant hooks stay disabled (`PROMO_GRANTS_ENABLED` unset; issue #35's rebuild is separate work).

## 4. Target behaviour
1. New env flag `FREE_CREDITS_REQUIRE_CARD_VALIDATION` (default unset/off; declared in `.env.example`, forwarded in `src/worker.ts`, one reader `freeCreditsRequireCardValidation()` beside `promoGrantsEnabled`). Flag off = today's exact behaviour.
2. Migration (number allocated at commit time, §3b rule 6): `tokenBalances.cardValidatedAt` timestamp NULL; `users.chargebeeCustomerId` varchar(80) NULL; `server/schemaReconcile.ts` updated in the same commit.
3. With the flag on and `cardValidatedAt` null, a Free seeker cycle opens with `monthlyAllowance` 0, `monthlyCreditsRemaining` 0 and **no** `plan_grant` row — the same wallet shape as the existing once-per-month dedupe state, so every reader handles it today; `monthlyCycleKey` still advances. Validation sets 3/3 via `grantFreeCycleOnValidationTx`. Referrer wallets are untouched (§12 Q2).
4. New server function `grantFreeCycleOnValidationTx` (in `server/creditCycles.ts`): under the wallet lock, for a validated seeker wallet on the current Free cycle with no `plan_grant` row for `plan-cycle:<digest("free", key)>`, writes the 3-credit grant with that same key and sets `monthlyCreditsRemaining` 3. Idempotent by the existing `planGrantRecordedTx` guard; safe to call from every validation signal.
5. New route `POST /api/chargebee/card-validation` (signed-in seeker): ensures a Chargebee customer exists for the user (`createCustomer` once, stored on `users.chargebeeCustomerId`), returns `{ url }` from `createManagePaymentSourcesPage` with a redirect back to the credits surface. Never logs card data (existing module rule).
6. Webhook: parse `payment_source_added` / `payment_source_updated` (`server/chargebee.ts`); on an event whose payment source is valid, map `customer_id` → user via `users.chargebeeCustomerId`, set `cardValidatedAt` (first time only), then `grantFreeCycleOnValidationTx`. Replay-safe like the existing obligations. Unmatched customer or any processing failure: record + alert the owner immediately through the existing alert dep pattern (`alertRetiredPlanEvent` shape, `server/chargebeeRoutes.ts:305`), then 500 so Chargebee retries.
7. Return reconcile: when a signed-in seeker with a stored customer id and no `cardValidatedAt` loads `GET /api/credits/summary`, the server re-reads `listPaymentSources` (provider truth); a valid source sets `cardValidatedAt` and grants as in (6). This covers webhook lag after the hosted page redirects back. Any provider error here alerts the owner and leaves the wallet unchanged (fail closed).
8. Summary payload gains `cardValidated: boolean` and `freeCreditsLocked: boolean` (flag on, seeker, not validated). When locked, the client shows the credits balance as 0 free asks with one plain line: "Validate your card to unlock your 3 free asks every month. You won't be charged." and a button that POSTs (5) and opens the hosted page. `shared/moneyCopy.ts` keeps the Free plan sentence accurate (it must not promise instant free asks with no card step when the flag is on).
9. Buying packs is unchanged: checkout collects the card anyway; a paid wallet does not need the gate (its credits are purchased). A validated card is stored by Chargebee as a payment source, which issue #35's later promo flow reuses.
10. Daily money check gains one slice check (D-065 pattern): with the flag on, a Free seeker wallet with `cardValidatedAt` null and `monthlyCreditsRemaining > 0`, or a validated wallet whose current-cycle grant is missing, is reported to the owner.

## 5. Files
- **In scope (edit only these):** `server/creditCycles.ts`, `server/creditLedger.ts` (flag reader placement), `server/db.ts` (ensureTokenWallet/summary wiring, daily check slice), `server/chargebee.ts` (event parser), `server/chargebeeRoutes.ts` (webhook dispatch + new route), `server/chargebeeAccountApi.ts` (extend customer schema with email if needed), `server/privateReferralRoutes.ts` (summary payload), `drizzle/schema.ts`, `drizzle/deploy/<NNNN>_card_validation.sql` (new), `server/schemaReconcile.ts`, `shared/moneyCopy.ts`, `client/src/components/SeekerCreditsCard.tsx`, `.env.example`, `src/worker.ts`, tests beside each.
- **Read only:** `server/planCreditCycleJob.ts`, `server/coverageDelivery*.ts`, `shared/creditCycles.ts`, `shared/subscriptionPlans.ts`, `docs/plans/D-067-packet.md`.
- **Out of scope (never edit here):** `server/paymentRefundEvents.ts`, promo grant hooks (`PROMO_GRANTS_ENABLED` readers stay as they are), Razorpay employer paths, sign-in/session code, any reason-code surface.

## 6. Steps (one commit each)
1. **Flag + migration + schema.** Flag reader, `.env.example`, `src/worker.ts`, drizzle migration, `schemaReconcile`. Tests: flag default off; migration lint. Commit: `D-079 step 1: card-validation flag and schema`.
2. **Cycle gate.** In `openCycleTx`, skip the Free grant when the flag is on and `cardValidatedAt` is null; add `grantFreeCycleOnValidationTx` plus a reconcile heal (flag on + validated + locked current cycle, due via `seekerCycleDue`) so a missed webhook signal still grants on the next wallet read. Tests red first: locked wallet opens cycle with 0 and no grant row; validation grants exactly once; second validation signal grants nothing; next month's roll grants normally once validated. Controls: flag off grants 3 as today; referrer wallet untouched. Commit: `D-079 step 2: gate Free cycle grants on card validation`.
3. **Webhook + validation page route + return reconcile.** Parser tests (added/updated, deleted ignored, malformed), webhook handler tests (map, set, grant, idempotent replay, unmatched customer alerts + 500), route test (signed-in seeker gets a URL; customer id persisted), summary reconcile test (provider source present → validated + grant; provider error → alert, unchanged). Commit: `D-079 step 3: provider-owned validation wiring`.
4. **Client + copy + money-check slice.** SeekerCreditsCard locked state, moneyCopy line, daily-check slice. Tests: locked/unlocked rendering at both widths via component tests; slice-check fixtures. Commit: `D-079 step 4: credits UI, copy and daily check`.
5. **Docs sync in the same push (D-068):** §3b row, DECISIONS D-079 sync cell, AGENTS.md living-map row if routes/modules changed.

## 7. Tests to write first (red before the fix)
- `server/creditCycles.cardValidation.test.ts`: locked cycle open (0 credits, no `plan_grant`, cycle key advances); `grantFreeCycleOnValidationTx` grants once (assert ledger row count and key); repeat call no-op; next-month roll grants after validation; flag-off control grants 3.
- `server/chargebee.cardValidationEvents.test.ts`: parser extracts `payment_source_added/updated` with customer id + status; ignores `payment_source_deleted` and unknown events.
- `server/chargebeeRoutes.cardValidation.test.ts`: webhook happy path sets `cardValidatedAt` and grants; replay is a duplicate (no second grant); unmatched customer records + fires the owner alert + answers 500; route `POST /api/chargebee/card-validation` 401 signed out, returns hosted URL signed in, persists `chargebeeCustomerId` once.
- `server/creditsSummary.cardValidation.test.ts`: payload fields; return reconcile sets + grants from a mocked valid source; provider error alerts and leaves the wallet unchanged.
- `server/dailyMoneyCheck.cardValidation.test.ts`: the two new mismatch fixtures.
- `client/src/components/seekerCreditsCard.test.tsx`: locked state copy + CTA; unlocked unchanged; flag off unchanged.
- **Controls:** existing cycle, spend, withdrawal-refund, expiry, checkout and webhook suites stay green. Never weaken, skip or delete an existing assertion.

## 8. Edge cases and races
- Two validation signals at once (webhook + return reconcile): the wallet lock + `planGrantRecordedTx` make the grant single.
- Webhook arrives before the user ever opens the credits page: grant still lands (webhook path grants directly).
- Validation mid-cycle after a locked cycle opened: grant writes with the same month key; the money check reconciles because every row carries `sourceCycleKey`.
- Wallet returns to Free from a paid plan inside the same month: the existing once-per-month key already prevents a second grant; the gate does not change that.
- Card deleted after validation (§12 Q3 default): `cardValidatedAt` stands; the deletion event is ignored by the gate.
- Flag flipped on in production with existing wallets: current-cycle grants already written stay; the next monthly roll is the first gated cycle (§12 Q4 default).
- Chargebee customer created but page never completed: no payment source, no `cardValidatedAt`, wallet stays locked; no stale state to clean.

## 9. Definition of done
- [ ] Every §7 test was red first and is green now; every control is green.
- [ ] Gate on the commit merged with the latest `origin/main` (commands in `docs/BRIEF.md`, "How to ship").
- [ ] Tier 1: independent review passed on a draft PR (`docs/DELEGATION.md` §6); findings fixed red-first.
- [ ] Docs updated in the same push (D-068): §3b row, AGENTS.md living-map row, DECISIONS D-079 sync cell.
- [ ] All deploy-migration lint, `pnpm check`, design-token audit green on the exact candidate.
- [ ] Flag is OFF in production at merge. Enabled only after: QA on the Chargebee test site passes, the owner answers §12 Q1, and the owner says yes to enabling. That enablement is its own report before it happens.
- [ ] §3b row set to `done — <sha>` with the evidence block (`docs/DELEGATION.md` §5).

## 10. Review checklist (for the independent reviewer)
- Prove with a test trace that no `plan_grant` row can be written twice for the same Free month under concurrent validation signals.
- Prove the flag-off path is byte-for-byte today's behaviour (wallet columns and ledger rows).
- Prove no card number, UPI handle or full payload is logged anywhere on the new paths.
- Prove every new failure path either alerts the owner or is a duplicate replay.
- Prove a paid wallet's behaviour is unchanged, and a referrer wallet's monthly credits are unchanged.

## 11. Stop and ask if
A cited function no longer matches; the webhook payload shape on the Chargebee test site differs from the parser assumption; you need a file outside §5; the register seems to contradict §4; the migration number you allocated collides. Write the question in the §3b row, push your branch, end the session.

## 12. Owner questions
1. **Does the Chargebee card-verification toggle cover the INR gateway configured on our site?** (Dashboard: Settings → Configure Chargebee → Payment Gateways → each gateway → card verification.) If INR is uncovered, INR seekers get the Razorpay route instead (a subscription with a future start date: Rs 5 authentication transaction, auto-refunded by Razorpay). Recommended default: proceed building the Chargebee flow now; add the Razorpay fallback only if the dashboard says no. Rating 8 (blocks production enablement for INR, not the build).
2. **Referrer wallets also receive 3 monthly credits. Gate them too?** Default: no — the directive targets the free asks seekers spend; referrer-side credits are earned-side. Rating 3.
3. **Card deleted after validation: does validation stand?** Default: yes (anti-abuse value is in the one-time proof; deletion events stay recorded). Rating 3.
4. **Existing users when the flag flips on: keep the current cycle's credits, gate from the next monthly reset?** Default: yes. Rating 4.
