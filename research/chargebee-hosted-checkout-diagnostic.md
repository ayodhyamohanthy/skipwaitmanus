

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

## 2026-08-16: Supported Razorpay currency selection

The checkout now presents two allowlisted options rather than an unrestricted currency dropdown. India billing uses the active `skipwait_token_1-INR` Chargebee item price at ₹99.00 and the Razorpay Domestic route. International/export billing uses the active `skipwait_token_1-USD` item price at $1.00 and is exposed only as Razorpay International / Export. PayPal remains disconnected and is not used.

The server requires both an allowlisted item-price ID and a matching billing route (`IN` with INR or `INTL` with USD) before creating a hosted page. Paid webhook parsing accepts only INR or USD amounts that match an active token price, and fulfillment continues to require the stored hosted-page and opaque pass-through checkout intent. Non-payment helper smoke tests created valid hosted pages for both item prices and preserved distinct checkout intent identifiers. The previous generic invalid-request error occurred before a Razorpay transaction because a USD hosted checkout was attempted with an India billing address; the supported route is now explicit in the UI and server contract.

Automated validation after this change: 70 tests passed, TypeScript passed, production build passed, and the currency-selector UI was visually reviewed for both Job Seeker and Referrer modes. No paid test transaction was submitted; real card and OTP entry remains user-controlled.

## 2026-08-16: Controlled INR payment and webhook reconciliation finding

The controlled ₹99.00 INR checkout `d1K4LmDBrcilga6NbE8iYLVbw1vi37y1` was created with persisted checkout intent `8296df8f-816c-4b78-b4a7-9ce749f5e432`, a prefilled India billing address, and Chargebee’s built-in valid `4111 1111 1111 1111` sandbox fixture. Chargebee redirected with `state=succeeded`, and its Events API reports the corresponding ₹99.00 INR `payment_succeeded` transaction with masked card ending `1111` and a paid invoice.

The stored application row remains the pending checkout-intent placeholder (`providerEventId = pending:d1K4LmDBrcilga6NbE8iYLVbw1vi37y1`) rather than an event-id-backed fulfillment. Chargebee marks the event webhook status as `not_configured` and its listed webhook attempt as `re_scheduled`. This establishes that the provider-side payment succeeded, but the configured webhook did not produce the required server-side reconciliation and token credit. The next corrective step is to restore successful `payment_succeeded` webhook delivery, including a payload shape that supplies—or can securely resolve—the hosted-page and pass-through checkout intent before fulfillment.

## 2026-08-16: Verified webhook recovery

The investigation identified two independent causes. The test endpoint was configured to call `https://skipwait.me/api/chargebee/webhook`, but the public site currently returned HTTP 404 for that route. The active project preview accepted the same authenticated non-payment probe with HTTP 202. In addition, the test site sends API v2 `payment_succeeded` events with `transaction` and `invoice` content rather than the legacy `payment` object; the v2 event does not carry the hosted-page pass-through value directly.

The server now parses both the legacy and v2 paid-event shapes. For v2 events, it restricts resolution to the 25 most recent pending Chargebee intents, retrieves each candidate hosted page server-to-server, and credits only when the hosted page is `succeeded` and its invoice ID, amount, currency, hosted-page ID, and opaque pass-through checkout intent all agree. This retains event-id idempotency and never credits from the browser redirect. Chargebee requires a 2XX webhook response for successful delivery and retries failed notifications, which is why the first valid-card transaction was credited once delivery was repaired. [1]

The Chargebee test webhook endpoint `whv2_16CRYhVSSWfBsH0V` was temporarily redirected to the active project preview with Basic Auth and `payment_succeeded` as its only enabled event. The previously paid hosted page `d1K4LmDBrcilga6NbE8iYLVbw1vi37y1` reconciled to event `ev_Azq95gVSUn7Gz2dHe`. A fresh post-repair checkout `KcdiIqi8Nu6czcBlf42UgULXVtQeCvC6m` reconciled to event `ev_16CRYhVSUpfk2vEs`. Each distinct ₹99.00 INR payment added exactly one purchase transaction; the controlled Job Seeker wallet moved from its initial three tokens to five. Chargebee reports a successful webhook attempt for both events.

> **Production requirement:** The preview URL is suitable only for test verification. Before publishing, the current project must be deployed to the custom `skipwait.me` domain (or another stable HTTPS receiver), and this Chargebee endpoint must be updated to that deployed `/api/chargebee/webhook` URL. Hosted pages redirect with their ID and state, but the server-side webhook remains the authoritative fulfillment mechanism. [2]

## References

[1]: https://apidocs.chargebee.com/docs/api/events "Chargebee Events API — webhook retry and idempotency guidance"
[2]: https://apidocs.chargebee.com/docs/api/hosted_pages "Chargebee Hosted Pages API — redirect and pass-through behavior"


## Country and card test-matrix basis

Chargebee’s Test Gateway documents the valid `4111 1111 1111 1111` Visa fixture as a successful transaction, `4119 8627 6033 8320` as a gateway verification failure, and `4005 5192 0000 0004` as an insufficient-funds failure. These fixtures simulate payment outcomes; they are not country-issued cards. Razorpay separately documents Indian and international test-card families and states that test cards are for test mode only, with no real money deducted. Therefore, this matrix will vary both billing country and currency route, while recording that the Chargebee fixture’s card country cannot be inferred from its number. [3] [4]

[3]: https://www.chargebee.com/docs/payments/2.0/payment-gateways-and-configuration/chargebee-test-gateway "Chargebee Test Gateway test-card outcomes"
[4]: https://razorpay.com/docs/payments/payments/test-card-details/ "Razorpay test-card details for Indian and international payments"


## 2026-08-16: India versus international payment matrix

The supported route matrix was exercised without real money. The India path used INR, the `skipwait_token_1-INR` item price, India/Karnataka billing details, and Chargebee’s valid sandbox Visa fixture `4111 1111 1111 1111`. Two earlier controlled INR payments completed successfully through the configured Razorpay Domestic route; both produced successful Chargebee webhook delivery and exactly one token credit each.

The international path used USD, the `skipwait_token_1-USD` item price, United States/New York billing details, and the international Chargebee sandbox fixture displayed as `5267 3181 8797 5449`. The checkout rendered at $1.00 and showed the non-India address correctly, but the submitted sandbox attempt returned `Your request is invalid. Review your details and try again.` No paid event, fulfillment, or token credit was created; the database retained only the pending checkout intent. This indicates the configured Razorpay international/export route or its test-site eligibility is not currently accepting this hosted-checkout scenario, rather than an application-side crediting issue.

The route-level negative matrix is covered in automated tests. India billing with the USD item price is rejected with HTTP 400, and international billing with the INR item price is also rejected with HTTP 400. Neither mismatch reaches Chargebee checkout creation or token fulfillment. The Chargebee sandbox fixtures are outcome simulators rather than reliable country-of-issuance indicators; country behavior is therefore evaluated using the billing address and selected currency route, while card behavior is recorded separately. Razorpay documents separate Indian and international test-card families, but the current Chargebee-hosted international form exposed only its own configured fixture. [5] [6]

| Scenario | Billing country | Item/currency | Sandbox card | Result | Token credit |
|---|---|---|---|---|---|
| India domestic success | India | INR / ₹99 | Chargebee valid `4111 1111 1111 1111` | Successful; webhook delivered | Exactly 1 per payment |
| India billing with international item | India | USD / $1 | Not submitted | Application rejected with HTTP 400 | None |
| International export attempt | United States | USD / $1 | Chargebee international fixture `5267 3181 8797 5449` | Hosted checkout rendered; provider returned invalid request | None |
| International billing with domestic item | United States | INR / ₹99 | Not submitted | Application rejected with HTTP 400 | None |

A true Razorpay-issued international-card comparison remains a provider-configuration test, not an application test. The current Chargebee sandbox did not expose a usable Razorpay international card fixture in this flow, and no real card was used. Before enabling international production billing, Razorpay International/Export eligibility, the Chargebee Smart Routing mapping, and a provider-supported international test card must be validated together.

## 2026-08-17: Razorpay International/Export audit

The signed-in Razorpay dashboard is in **Test** mode. Its home-page update presents an **“Enabled: International payments request”** card with the supporting text beginning “You can accept now International…”. This is evidence that International/Export capability is not silently available through the application’s API keys alone and must be confirmed or completed within the Razorpay account before a Chargebee-hosted USD card payment can be expected to succeed. The app’s USD checkout contract, US billing prefill, and Chargebee Card → USD mapping are already present; the observed failure is therefore consistent with an unresolved gateway-side international-payment state rather than client or token-credit logic.

Razorpay’s current documentation confirms that existing Indian merchants must activate **International Cards** from **Account & Settings → International payments** and complete any further requested information. The feature depends on banking-partner approval and requires an active KYC-verified account plus a public website that clearly exposes Terms and Conditions, Privacy Policy, Refund and Cancellation Policy, and Shipping Policy. This project’s test dashboard exposes International payment reporting but the Account & Settings deep link redirected back to the home view, so there is no verified dashboard control available to submit this activation automatically. The necessary business/KYC documentation must be supplied through Razorpay’s own activation workflow. [7] [8] [9]

### Connector and dashboard follow-up

The existing Razorpay MCP connector was enabled and its OAuth status now reports **Authenticated**. Its tool-discovery command did not return before the available timeout, so it has not yet been used for any payment operation. The signed-in Razorpay dashboard does load the Account & Settings overview and lists International payment settings, but the browser automation extension subsequently timed out while waiting for the page to render again. No International Cards activation request was submitted, no provider setting was changed, and no USD payment was retried during this follow-up.

[7]: https://razorpay.com/docs/payments/international-payments/ "Razorpay International Payments — existing-business activation steps"
[8]: https://razorpay.com/docs/payments/international-payments/international-debit-credit-cards/ "Razorpay International Debit and Credit Cards — eligibility and application requirements"
[9]: https://razorpay.com/docs/payments/dashboard/test-live-modes/ "Razorpay Test and Live Modes"

[5]: https://www.chargebee.com/docs/payments/2.0/payment-gateways-and-configuration/chargebee-test-gateway "Chargebee Test Gateway test-card outcomes"
[6]: https://razorpay.com/docs/payments/payments/test-card-details/ "Razorpay test-card details for Indian and international payments"
