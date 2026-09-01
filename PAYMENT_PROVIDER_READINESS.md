# Live Payment Provider Readiness

The current token checkout remains intentionally **simulated**. The screen distinguishes the intended roles—**Razorpay** for India, **PayPal** for international checkout, and **Chargebee** for business billing—without attempting to collect or process a payment.

## Required activation contract

| Provider | Intended role | Required configuration | Token-credit trigger |
| --- | --- | --- | --- |
| Razorpay | Domestic India checkout | Live key ID, key secret, webhook secret, allowed return URL | Verified server-side payment or order webhook with an idempotency key |
| PayPal | International checkout | Client ID, client secret, webhook ID, allowed return URL | Verified capture or order-completed webhook with an idempotency key |
| Chargebee | Business billing and invoices | Site, API key, webhook secret, item price IDs, entitlement mapping | Verified invoice or subscription payment event with an idempotency key |

## Non-negotiable server behavior

The client must never credit tokens from a redirect or browser success message. Each provider’s webhook must be verified on the server, mapped to one internal payment record, and processed idempotently. Only the first accepted payment event should write the paid-token transaction and update the user’s balance.

The selected provider, provider transaction ID, currency, amount, token quantity, event ID, verification time, and token transaction ID should be retained for reconciliation. Failed, pending, refunded, disputed, duplicate, or signature-invalid events must not credit tokens.

## Current readiness

No live Razorpay, PayPal, Chargebee, or Chargebee knowledge-base connector is enabled in the current session. Before activation, supply the provider credentials and confirm the public webhook URLs and the exact Chargebee one-time token product or price IDs. Until then, the current simulation remains the approved checkout experience.

## Local dummy configuration

The gitignored `.env` (template: `.env.example`) ships **dummy** payment credentials so a fresh clone boots locally with the payment routes in their *configured* state:

- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (`rzp_test_1DUMMYKEYID` / `dummy_razorpay_key_secret`)
- `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` + `PAYPAL_ENV=sandbox`
- `CHARGEBEE_SITE=skipwait-test` + `CHARGEBEE_API_KEY` / `CHARGEBEE_WEBHOOK_SECRET` dummies

**What works locally:** the app boots, and the checkout endpoints no longer answer `503 … is not configured` — `POST /api/payments/razorpay/order`, `POST /api/payments/paypal/order`, and `POST /api/chargebee/*` all pass their configuration gate.

**What still fails:** every real charge. Dummy keys are rejected by the provider APIs (Razorpay/PayPal order creation returns a provider error surfaced as `502`), and Chargebee checkout URLs `404` because the `skipwait-test` dummy site does not exist. Webhook deliveries cannot be verified against a dummy secret. Nothing here reaches production: `.env` is gitignored and no dummy secret is written to `wrangler.jsonc`, CI files, or any tracked file.

**Going live — exact env-var swap list** (set in the deploy secret store, never in tracked files):

| Provider | Replace | Also configure |
| --- | --- | --- |
| Razorpay | Real `RAZORPAY_KEY_ID` (`rzp_live_…`) + `RAZORPAY_KEY_SECRET` | Payment webhook URL in the Razorpay dashboard |
| PayPal | Real `PAYPAL_CLIENT_ID` + `PAYPAL_SECRET`, `PAYPAL_ENV=live` | PayPal webhook endpoint in the developer dashboard |
| Chargebee (test) | Real `CHARGEBEE_API_KEY` for the test site + `CHARGEBEE_WEBHOOK_SECRET` + item price IDs | Webhook URL pointing at `/api/chargebee/webhook` |
| Chargebee (live) | `CHARGEBEE_LIVE_ENABLED=true` + `CHARGEBEE_LIVE_API_KEY` + `CHARGEBEE_LIVE_SITE` + `CHARGEBEE_LIVE_DOMAIN` + `CHARGEBEE_LIVE_WEBHOOK_SECRET` | Live-site webhook URL |
