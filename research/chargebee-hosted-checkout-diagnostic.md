

## Current routing decision

The connected gateways on the Chargebee test site are **Chargebee Test Gateway** and **Razorpay-1**. PayPal is not connected; Chargebee’s PayPal connection flow requires a separate PayPal sandbox authorization. Per the current product decision, PayPal is deferred.

The Smart Routing editor supports selecting a gateway for the Card → USD rule. The draft now selects **Razorpay-1** for Card → USD, while UPI and Netbanking already select Razorpay-1 for INR. This is the current test-site routing configuration to publish and verify. Chargebee’s editor does not expose a country condition on this rule, so this configuration uses Razorpay as the interim route for the hosted USD checkout rather than claiming India-versus-rest-of-world routing that cannot yet be configured with the connected gateways.



## Razorpay route smoke verification

After publishing the Card → USD mapping to **Razorpay-1**, Chargebee accepted a non-payment `checkout_one_time_for_items` request for `skipwait_token_1-USD` with HTTP 200. The response created a `checkout_one_time` hosted page in `created` state and preserved the opaque `skipwait:checkout:razorpay-smoke-*` pass-through identifier. No payment was submitted and no token balance was credited during this smoke test.

## API-only verification after browser session expiry

On 16 August 2026, the available server-side credentials verified Razorpay authentication with HTTP 200 from the Razorpay test Orders API. The Chargebee catalogue still exposes the three approved USD item prices: `skipwait_token_1-USD` ($1), `skipwait_token_5-USD` ($5), and `skipwait_token_10-USD` ($10).

The application helper was restored to Chargebee's one-time-items contract: `POST /api/v2/hosted_pages/checkout_one_time_for_items`, plural `item_prices` fields, explicit `currency_code=USD`, and an opaque `pass_thru_content` checkout intent. A live non-payment call through that exact helper returned a newly created hosted page and preserved the generated intent identifier. The webhook path now requires the provider event ID, hosted-page ID, matching stored pass-through intent, amount, and currency before tokens can be credited.

The Chargebee dashboard browser session had expired during the final audit, so the provider's Card → USD Smart Routing rule and webhook are recorded from the prior authenticated configuration review rather than re-read through the dashboard. The earlier verified configuration was Razorpay-1 for Card → USD and one `payment_succeeded` webhook pointing to `https://skipwait.me/api/chargebee/webhook`. No payment was submitted, and no browser callback can credit tokens.

## Controlled checkout validation diagnostic

The controlled $1 hosted page `ixWpkcwiLrcurIKfAYpgdPpflqDcXayTk` was created with a persisted checkout intent and displays the Razorpay card form. After the first form attempt, Chargebee still reports the hosted-page state as `requested`, with no provider payment or gateway error record. The rendered form marks its account and billing fields as complete and embeds the card number, expiry, and CVV controls in secure iframes. Its test-site card selector exposes a `Valid Card` fixture, so the generic request-invalid message occurred before a visible gateway transaction and must be reproduced via the embedded test-card control or the gateway’s accepted sandbox input sequence.

## Root cause: Indian domestic billing versus USD presentment

Chargebee's current Razorpay documentation states that a Domestic Razorpay customer in India is collected in INR, whereas non-INR presentment through Razorpay requires an Export-enabled Domestic account and customers outside India. The controlled hosted checkout used an India billing address with USD presentment, so it remained pre-gateway and returned the generic request-invalid message even after the built-in sandbox valid-card fixture was applied. The appropriate next test is either a compliant US billing address with Razorpay Export confirmed on the account, or an INR domestic checkout for an India billing address. The product cannot truthfully force USD Razorpay card billing for an India-based customer without satisfying that export eligibility condition.
