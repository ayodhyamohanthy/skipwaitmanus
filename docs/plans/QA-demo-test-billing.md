# QA-demo-test-billing: the demo accounts pay with test cards on the Chargebee TEST site from skipwait.me (D-393)

Tier 1 · lane `qa-demo-test-billing` · branch `agent/queue/qa-demo-test-billing` · epic D-212 · depends on `QA-sandbox-requests`

## Why

The owner wants to test paid referrals with test accounts (Nov 24, D-393) and chose, over a separate paid QA
copy of the site, to let **only the two reviewer demo accounts** check out against the Chargebee **TEST** site
(`skipwait-test`) on skipwait.me with test cards, even while sales are off for everyone else, and with no
limits: any plan, any band, any extra referral, as often as needed (Nov 24: "any referrals free or paid there
shouldnt be any limits"). Paid sandbox requests then reach only the demo referrer (`QA-sandbox-requests`). Today the billing
site is fixed for the whole process by `BILLING_ENV` (`server/chargebeeEnvironment.ts`: "Billing environment is
immutable for the process"), so production can only reach the live site. D-393 relaxes that rule for the two
demo accounts only.

## The build

Behind a new switch `DEMO_TEST_BILLING_ENABLED` (default **false**; declared in `.env.example`, the config
contract test and the Worker passthrough):

1. **Runtime selection by identity, never by request input.** A helper decides the Chargebee runtime for a
   signed-in account: the TEST runtime (`CHARGEBEE_SITE`, `CHARGEBEE_API_KEY`, `CHARGEBEE_WEBHOOK_SECRET`, the
   existing TEST names) only when the switch is on **and** the canonical account's verified email is
   `seeker@reviewer.skipwait.me`; every other account, and any doubt, gets today's runtime. Host, headers,
   query and body never choose it.
2. **Checkout.** For that account, the banded offer and plan/referral checkout routes treat banded sales as
   on (only for it) and open hosted pages on the TEST site, with the same frozen prices and idempotency. The
   demo seeker is not limited: one-plan-per-seeker, the band, the by-application gate and the founding cap do
   not stop it (a TEST founding purchase never takes a real founding place). Nothing changes for anyone else;
   `BANDED_SALES_ENABLED` stays false.
3. **Webhooks.** A separate endpoint (for example `POST /api/chargebee/test-webhook`) verifies with the TEST
   webhook secret and applies an event only when its customer/subscription maps to a reviewer demo account;
   anything else is recorded once, grants nothing and alerts the owner. The live webhook route keeps
   refusing TEST-site events, as today.
4. **Ledger marking.** Every grant, debit and refund that came from the TEST site carries a TEST marker in its
   reference so reports can exclude it; the daily money check flags any TEST-marked row on a non-demo account
   as an incident.
5. **Recovery.** Pending-checkout reconcile and refund recovery read the TEST site for TEST-marked intents
   only.

**Read before writing:** `server/chargebeeEnvironment.ts`, `server/chargebeeApi.ts`, `server/bandedCheckout*.ts`,
`server/chargebeeRoutes.ts`, `server/paymentWebhooks.ts`, `server/chargebeePendingReconcile.ts`,
`server/dailyMoneyCheck.ts`, `server/billingSettings.ts`, `src/worker.ts`, `.env.example`,
`docs/PAYMENTS_TEST_RUNBOOK.md`.

## Owner actions (named, not done by sessions)

- Set the TEST site's API key and webhook secret as production secrets through the release-time secrets file
  path (`OPS-deploy-secrets-file`; `QA_CHARGEBEE_TEST_API_KEY` already exists as a repository secret, D-387 (4)).
- In the Chargebee TEST dashboard, add the webhook endpoint the build names.
- Turn `DEMO_TEST_BILLING_ENABLED` on after QA.

## Hard limits

- Never a real card, never the live site for a demo TEST checkout, never a TEST checkout for a real account.
- No price, plan content, legal text, login rule or sales switch change for anyone but the demo seeker.
- A wrong identity, a missing secret or an unmapped TEST event fails closed and alerts; it never falls back to
  the other site.

## Tests (red first)

Identity gate (demo seeker TEST; every other account, signed out, spoofed host/header/body: live or refused);
switch off: no change at all; offer/checkout parity with the frozen book on the TEST runtime; TEST webhook
signature and demo-only mapping; live webhook still refuses TEST events; TEST-marked ledger rows; the daily
money check incident; config contract for the new switch.

## Acceptance

Focused tests, `pnpm check`, required CI. After the owner actions, on the deployed exact SHA: the demo seeker
buys one plan and one extra referral with test Visa 4012 8888 8888 1881 on the TEST site from skipwait.me, the
grant lands, one paid referral is spent on a sandbox request to a real company (`QA-sandbox-requests`), a refund settles, and the subscription is
cancelled; a real account's `/plans` still reads `onSale:false`. Captures at 1280 and 390.

## Status

- QA-demo-test-billing: in progress — DeepSeek V4.1 Flash · f2a2 — 2026-11-24 — branch agent/queue/qa-demo-test-billing
