# PRICING-banded-checkout: sell the D-219 banded plans and extra referrals

Status: packet, Nov 19 2026. Governing decisions: D-219 (frozen prices), D-366 (3) (the owner's word to sell, D-123), D-367 (the four open D-219 (8) answers). Prices live only in `shared/planFamily.ts` and `docs/PRICING.md`; this packet never restates a price.

## 1. Goal and why
A seeker can buy one of the three banded plans (Early to Mid, Mid to Senior, Senior to Executive) or extra referrals at a level inside their band, in INR or USD, through the existing Chargebee + Razorpay rails. The money then flows into the existing ledger so a referral request spends in the frozen order. Today nothing can be bought: `client/src/pages/PlansV2.tsx` shows "Checkout not switched on yet", the subscription schema only knows legacy plan ids, and catalog sync cannot create banded items.

## 2. The owner's answers this build follows (D-367)
1. **Job level to band:** L1-L3 = Early, L4 = Mid, L5-L8 = Senior, L9-L10 = Executive (labels in `shared/jobLevel.ts` `JOB_LEVEL_LABELS`).
2. **Currencies:** INR and USD both at launch, both through Razorpay (international cards on the Razorpay account). PayPal is not the USD route for these plans.
3. **Gateway fees:** absorbed. The price shown is the price charged; no fee line.
4. **Founding cap filled:** undecided. Until the owner names a regular price, a band whose founding cap is reached stops selling (a plain "Founding places for this plan are taken" state), never an invented price.

## 3. Rules every row keeps
- Money paths are idempotent, reconciled and recoverable (AGENTS 0a): keyed ledger rows, webhook replay protection, a recovery path for a paid-but-not-credited checkout, refunds take back at most what was granted.
- One switch, `BANDED_SALES_ENABLED`, default `false`, declared in `.env.example`, passed through `src/worker.ts`. Every new route answers 409 `not_on_sale` before any provider call while it is off. The release row turns it on.
- Never sell an outcome; a referral is spent only when a verified employee can see the request (D-034); declines keep the spend (D-147).
- The superseded D-132 per-level credit cost (`ASK_LEVEL_COST`) stays off and unused.
- Referrer purchases stay refused (`REFERRER_PURCHASES_ENABLED = false`, D-055).
- No real-money QA: the Chargebee TEST site and Razorpay test cards only (`docs/PAYMENTS_TEST_RUNBOOK.md`).
- Senior to Executive is "by application" (`byApplication` in `shared/planFamily.ts`): checkout refuses it until an application is approved; the application flow is out of scope here and the plan shows "Apply" with no checkout.

## 4. Rows (one agent each, D-223)
| Row | Tier | What | Depends on |
|---|---|---|---|
| BANDED-levels | 1 | `referralLevelForJobLevel(level)` and `jobLevelsInBand(id)` in `shared/planFamily.ts` with exhaustive tests for L1-L10. Pure, no runtime reader yet. | - |
| BANDED-schema | 1 | Contract and one forward-only migration: banded plan ids accepted where a seeker's plan is stored; a per-level referral balance (included this cycle, purchased) keyed by user and level; a founding-membership counter per band with a unique issued sequence so a cap can never be oversold. Reconcile on boot like earlier migrations. No reader yet. | - |
| BANDED-catalog-sync | 1 | `server/catalogSyncDesired.ts` generated from `shared/planFamily.ts`: one monthly item price per plan per currency and one extra-referral item price per level per currency. Dry run lists them; apply stays owner-only (D-069). | BANDED-levels |
| BANDED-checkout | 1 | Server routes behind `BANDED_SALES_ENABLED`: plan checkout (hosted page, INR/USD by the D-122 price book), extra-referral cart (only levels inside the buyer's band; volume discount computed from `VOLUME_DISCOUNTS`), founding cap reserved atomically at checkout creation and released if it expires unpaid, by-application refusal, cap-full refusal. Zod at the edge, idempotency key per checkout. | BANDED-schema, BANDED-catalog-sync |
| BANDED-grants | 1 | Webhook-confirmed subscription term grants each level's included referrals for the cycle (no carry-forward); a paid extra-referral invoice credits purchased referrals at that level once; refunds and cancellations take back only what is unspent; the hourly recovery finds a paid checkout with no grant; the daily money check reconciles both. | BANDED-schema, BANDED-checkout |
| BANDED-spend | 1 | Sending a request at level X spends the plan's included X referral, then the free allowance, then a purchased X referral; outside the plan's band only the free allowance. The quote states the level, the source and whether it is covered before send, and the charge equals the quote (re-sync the D-132-item3 guard to this model). | BANDED-levels, BANDED-schema |
| BANDED-ui | 1 | `/plans` buttons go live from the server's availability answer: buy a plan, buy extra referrals inside your band, the cap-full and by-application states, the balance by level. Goal UI only (`DESIGN.md`), captures at 1280 and 390. | BANDED-checkout |
| BANDED-release | 1 | Owner steps, then the switch: catalog-sync dry run and apply on the live site; Razorpay international payments on (for USD); test-site QA matrix INR and USD (plan, extra referrals, refund, recovery, cap reservation) with captures; set `BANDED_SALES_ENABLED=true`; live verification without paying. | every row above |

## 5. Owned files (starting points; verify before editing and record changes in the row's PR)
- BANDED-levels: `shared/planFamily.ts`, `shared/planFamily.test.ts`.
- BANDED-schema: `drizzle/schema.ts`, one new `drizzle/NNNN_banded_plans.sql` (next free number; `scripts/decision-id-check.mjs` refuses a used one), `server/schemaReconcile.ts`.
- BANDED-catalog-sync: `server/catalogSyncDesired.ts` and its test.
- BANDED-checkout: new `server/bandedCheckout.ts` and test, `shared/subscriptionManagement.ts`, `server/chargebeeRoutes.ts`, `.env.example`, `src/worker.ts`.
- BANDED-grants: `server/creditCycles.ts`, `server/dailyMoneyCheck.ts`, `server/paymentWebhooks.ts`, the `applyChargebeeSubscriptionEvent` area of `server/db.ts`.
- BANDED-spend: `server/creditLedger.ts`, `server/planGates.ts`, the quote in `server/privateReferralRoutes.ts`.
- BANDED-ui: `client/src/pages/PlansV2.tsx`, `client/src/pages/PlansV2Connected.tsx`, `client/src/components/plans/**`.

## 6. Done means
Each row lands on green required CI with its Tier 1 review (D-352), behaviour unchanged while the switch is off. The release row is done only when a buyer could buy on skipwait.me in INR and USD, proven on the TEST site and checked live up to the hosted payment page without paying.

## Status

- BANDED-levels: review — agent/queue/banded-levels — `b9216295b26b5ad3e7e75ff5178417950f1f4296` — GPT-6.1 Sol · 814e — 2026-11-20 — [draft PR #1370](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1370). Transferred source `6a712b01` and its tests are preserved; added packet-required `jobLevelsInBand(id)` and ordered assertions. Current main `bdcc1857`; 13 focused tests, `pnpm check`, scope and whitespace pass. Exact Tier 1 independent review and fresh CI are pending; draft has no auto-merge. No checkout, price, provider, payment or sale activation.
