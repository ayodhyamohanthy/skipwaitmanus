# Live Payment Provider Readiness

**Chargebee** is the only plan and subscription holder; **Razorpay** (INR, India) and **PayPal** (USD, global) are gateways behind Chargebee hosted checkout (D-004, frozen; D-069). The direct Razorpay and PayPal seeker checkout routes stay disabled (503). The one direct route still on is the employer unlock-credit checkout (Razorpay orders), until Chargebee employer prices exist (D-069, D-042; D-040's move of employer payments to Chargebee follows).

## Required activation contract

| Provider | Intended role | Required configuration | Token-credit trigger |
| --- | --- | --- | --- |
| Razorpay | INR gateway behind Chargebee hosted checkout (D-004); its only direct use is the employer unlock-credit checkout (`/api/employer/unlock-credits/purchase`) until Chargebee employer prices exist (D-069) | Live key ID, key secret, webhook secret, allowed return URL | Seeker credits: none (they land only from the verified Chargebee event). Employer unlock credits: verified `payment.captured` webhook (`notes.kind=unlock_credits`) with an idempotency key |
| PayPal | USD gateway behind Chargebee hosted checkout (D-004); direct checkout off (503) | Client ID, client secret, webhook ID, allowed return URL | None: the PayPal webhook only records and correlates deliveries; USD credits land from the verified Chargebee event |
| Chargebee | The only plan and subscription holder: hosted checkout, invoices and a live item price for every sold catalog item (D-004, D-069) | Site, API key, webhook secret, item price IDs, entitlement mapping | Verified invoice or subscription payment event with an idempotency key |

## Non-negotiable server behavior

The client must never credit tokens from a redirect or browser success message. Each provider’s webhook must be verified on the server, mapped to one internal payment record, and processed idempotently. Only the first accepted payment event should write the paid-token transaction and update the user’s balance.

The selected provider, provider transaction ID, currency, amount, token quantity, event ID, verification time, and token transaction ID should be retained for reconciliation. Failed, pending, refunded, disputed, duplicate, or signature-invalid events must not credit tokens.

## Current readiness

Production checkout is live-wired through the live Chargebee site: completing a payment charges real money (`docs/BUGFREE_GATE.md`). Razorpay approved skipwait.chargebee.com on Oct 16 (BUGFREE_GATE 4.14). Only credit packs are sold, in INR and USD (D-146). Passes and Keep warm stay off (`PASS_SALES_ENABLED` false, D-084, D-146), and the D-132 plans stay behind flags that are off (D-135). `docs/PRICING.md` is the one pricing source. A plan or pack is sold only once its Chargebee item price exists with the exact catalog id; otherwise checkout answers `409 not_available_yet` and opens no page. D-069's admin catalog sync (`server/adminCatalogSyncRoutes.ts`: a dry run, then an apply step the owner triggers) creates missing item prices. Agents never make real payments; the owner runs one live ₹99 UPI buy-and-refund (D-065).

## Local dummy configuration

The gitignored `.env` (template: `.env.example`) ships **dummy** payment credentials so a fresh clone boots locally with the payment routes in their *configured* state:

- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (`rzp_test_1DUMMYKEYID` / `dummy_razorpay_key_secret`)
- `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` + `PAYPAL_ENV=sandbox`
- `CHARGEBEE_SITE=skipwait-test` + `CHARGEBEE_API_KEY` / `CHARGEBEE_WEBHOOK_SECRET` dummies

**What works locally:** the app boots, and `POST /api/chargebee/*` and the employer unlock-credit checkout pass their configuration gate. `POST /api/payments/razorpay/order` and `POST /api/payments/paypal/order` answer 503 ("Direct checkout is unavailable") for every signed-in caller (401 when signed out), by design (D-004).

**What still fails:** every real charge. Dummy keys are rejected by the provider APIs (a direct Razorpay order for employer unlock credits fails at the provider), and Chargebee checkout URLs `404` because the `skipwait-test` dummy site does not exist. Webhook deliveries cannot be verified against a dummy secret. Nothing here reaches production: `.env` is gitignored and no dummy secret is written to `wrangler.jsonc`, CI files, or any tracked file.

**Going live — exact env-var swap list** (set in the deploy secret store, never in tracked files):

| Provider | Replace | Also configure |
| --- | --- | --- |
| Razorpay | Real `RAZORPAY_KEY_ID` (`rzp_live_…`) + `RAZORPAY_KEY_SECRET` | Payment webhook URL in the Razorpay dashboard |
| PayPal | Real `PAYPAL_CLIENT_ID` + `PAYPAL_SECRET`, `PAYPAL_ENV=live` | PayPal webhook endpoint in the developer dashboard |
| Chargebee (test) | Real `CHARGEBEE_API_KEY` for the test site + `CHARGEBEE_WEBHOOK_SECRET` + item price IDs | Webhook URL pointing at `/api/chargebee/webhook` |
| Chargebee (live) | `CHARGEBEE_LIVE_ENABLED=true` + `CHARGEBEE_LIVE_API_KEY` + `CHARGEBEE_LIVE_SITE` + `CHARGEBEE_LIVE_DOMAIN` + `CHARGEBEE_LIVE_WEBHOOK_SECRET` | Live-site webhook URL |
