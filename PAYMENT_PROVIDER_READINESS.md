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
