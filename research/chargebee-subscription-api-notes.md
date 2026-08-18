# Chargebee Subscription API Notes

## Sources

- [Hosted pages API](https://apidocs.chargebee.com/docs/api/hosted_pages?prod_cat_ver=2)
- [Item prices API](https://apidocs.chargebee.com/docs/api/item_prices?prod_cat_ver=2)

## Applicable provider contract

Chargebee Hosted Pages supports **Checkout new Subscription** through a secure hosted URL. A successful hosted page is marked `succeeded`; retrieving that hosted page makes the subscription, customer, and invoice details available. `pass_thru_content` is intended to associate a hosted checkout session with application-side state.

For Pro and Max, each recurring item must be a plan item price. Chargebee item prices support a fixed `flat_fee` price, ISO currency code, and a billing period. A monthly subscription plan requires `period=1` and `period_unit=month`; plan item prices are recurring subscription components. Item-price identifiers are immutable, and recurring pricing attributes cannot be changed after a subscription or invoice exists, so the initial price and identifiers must be chosen carefully.

The application should treat hosted-page redirect as informational only. Subscription entitlement remains server-side and should be activated or changed only from a verified Chargebee event or a verified succeeded hosted-page retrieval.

## Webhook synchronization safeguards

The Chargebee Events reference states that subscription cancellation due to non-payment emits subscription events and that webhook delivery can be retried and arrive out of order. Subscription synchronization must therefore persist processed event IDs for idempotency and retain the highest subscription `resource_version`, ignoring older events. The existing Basic-Auth webhook protection remains applicable, while the server continues to treat the browser redirect as non-authoritative.

## Subscription lifecycle treatment

Chargebee describes a subscription as `active` while it renews automatically and `non_renewing` when it has been scheduled to end at the current term boundary. The subscription resource exposes `current_term_start`, `current_term_end`, `status`, and a monotonic `resource_version`. skipwait.me can honor Pro or Max through the stated term for either active or non-renewing subscriptions; future monthly allowances must stop after the term ends. In-app cancellation should therefore schedule non-renewal rather than prematurely remove paid access.

Chargebee’s documented end-of-term cancellation endpoint is `POST /api/v2/subscriptions/{subscription-id}/cancel_for_items` with `cancel_option=end_of_term`. It changes an eligible subscription to `non_renewing`, preventing the next charge while retaining access through the current paid cycle. The app must only invoke this endpoint for the subscription identifier stored against the signed-in account and let the verified webhook synchronize the final entitlement state.

The approved recurring price policy is Pro at ₹599 in India or $10 globally, and Max at ₹1,299 in India or $20 globally. Both Chargebee Test USD recurring item prices were updated through the authenticated catalog API and returned the matching 1,000-cent and 2,000-cent price fields. India checkout can transparently identify its country-specific regional price against an indicative global equivalent, while the server continues to choose only the catalog price matching the verified billing route. The dashboard owner session is available and exposes Settings navigation, while the attempted generic v2 `/webhooks` listing endpoint returned 404; webhook event coverage must therefore be inspected in the dashboard UI rather than assumed from the catalog API.

The Chargebee Test configuration dashboard reports exactly one configured webhook. The recurring subscription implementation therefore needs that existing webhook to deliver subscription lifecycle events in addition to successful payment events. The Test site is configured for INR and USD and shows PayPal plus other gateways; the dedicated Webhooks settings page remains the source of truth for event selection and endpoint URL.

The Test dashboard exposes the active webhook under **Settings → Configure Chargebee → API Keys and Events → Webhooks**. This section is currently read-only for the audit; no endpoint or event selection has been changed.

The API Keys and Events page confirms one webhook and no Event Streams. The Webhooks tab is available as the only relevant event-delivery configuration surface for the current implementation.

The existing Test webhook is enabled for **payment succeed** only and points to the temporary development preview endpoint. It does not presently list the subscription created, renewed, changed, canceled, or payment-failed lifecycle events needed for live Pro/Max entitlement synchronization. Chargebee notes that Test-site deliveries can be delayed by 10–15 minutes; this delay does not apply in Live. The webhook event selection and endpoint URL must be updated before treating recurring plans as end-to-end payment-ready.

After the user approved the Test-webhook update, the existing protected webhook editor was opened without changing its name, endpoint, API version, or basic-authentication settings. The event selector shows Payment Succeeded still selected and the following standard subscription lifecycle events selected in the current unsaved editor state: Subscription Created, Subscription Activated, Subscription Changed, and Subscription Cancellation Scheduled. The editor supports granular event selection; only the minimum lifecycle events needed for the server’s entitlement synchronization will be retained before saving.

The current unsaved selection also includes Subscription Renewed, Subscription Cancelled, and Payment Failed. This combination is sufficient for initial activation, plan changes, end-of-term cancellation scheduling and completion, renewal reset, and failed-renewal state synchronization, while preserving the existing Payment Succeeded event. No endpoint, authentication, or API-version field has been changed.

After a browser reconnect, the editor’s selected-event summary confirmed eight intended events: Payment Succeeded plus Subscription Created, Subscription Activated, Subscription Changed, Subscription Cancellation Scheduled, Subscription Renewed, Subscription Cancelled, and Payment Failed. The event list is granular rather than “All Events,” and the webhook name, preview endpoint, basic-authentication toggle, username, password, API version, primary flag, and card-information flag remain unchanged. The only pending external action is saving this approved event-set update.

Chargebee Test confirmed **“Successfully updated the webhook”** after the user-approved configuration was submitted. The existing webhook retained its name, temporary preview endpoint, API version, and basic-authentication settings; it now delivers the eight documented payment and standard subscription lifecycle events needed for one-time packs and Pro/Max entitlement synchronization. Test-site delivery may still be delayed by Chargebee by up to 10–15 minutes. The stable production webhook URL migration remains a post-publish task.
