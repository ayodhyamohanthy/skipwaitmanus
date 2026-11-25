# Group Plan provider contract (GROUP-provider, packet §6.2)

Scope: the typed Chargebee adapter in `server/groupPlanProvider.ts` and its tests in
`server/groupPlanProvider.test.ts`. This row proves the hosted-page composition and the provider
boundary. It creates no Group SKU, changes no live customer, price or setting, and performs no
payment. `GROUP_PLAN_ENABLED` stays false and no route calls this adapter yet.

Checked 2026-11-25 against the current official Chargebee documentation. Every claim below names
the source it came from; anything the documentation could not confirm is listed as unverified
rather than assumed.

## 1. Sources read (URL and date)

| Source | Read | What it established |
| --- | --- | --- |
| https://apidocs.chargebee.com/docs/api/hosted_pages | 2026-11-25 | Hosted-page object bounds: `id` ≤ 70 chars, `url` ≤ 250, `pass_thru_content` ≤ 2048, `business_entity_id`/`brand_id` ≤ 50. Checkout URLs (`checkout_new`, `checkout_existing`, `checkout_one_time`) expire after 3 hours; `collect_now`/`manage_payment_sources` after 5 days. |
| https://apidocs.chargebee.com/docs/api/hosted_pages/create-checkout-for-a-new-subscription | 2026-11-25 | Subscription checkout fields: `subscription_items[item_price_id][0]`, `subscription_items[quantity][0]`, `discounts[apply_on][0]`, `discounts[amount][0]`, `customer[id]`, `redirect_url` ≤ 250, `cancel_url` ≤ 250, `pass_thru_content` ≤ 2048. |
| https://apidocs.chargebee.com/docs/api/idempotency | 2026-11-25 | Header `chargebee-idempotency-key`; keys are retained for a 30-minute window; a duplicate returns the original response with `chargebee-idempotency-replayed: true`; a key still in flight returns 409 with `retry-after`; different parameters under one key can return 422. |
| https://apidocs.chargebee.com/docs/api/events | 2026-11-25 | Event `id` ≤ 40 chars, `occurred_at` in UTC seconds, `content` object. Deduplicate by `id` and retain processed ids for about 3 days 7 hours; order deliveries by `resource_version` and ignore an older one. Chargebee retries non-2XX deliveries for up to 2 days, with a final retry around 3 days 7 hours, so duplicates are expected. Verify by re-fetching the event, basic auth or a secret in the URL, and its published IPs. |

## 2. What could not be verified today, and what stands in

| Gap | Why | What the adapter does instead |
| --- | --- | --- |
| The one-time checkout endpoint's own parameter page | The documentation slugs tried on 2026-11-25 (`create-checkout-for-one-time-charges`, `...-for-items`, `create-checkout-one-time-for-items`) all returned HTTP 404, and the hosted-pages index lists the `checkout_one_time` type without its request fields. | The one-time field names (`item_prices[item_price_id][n]`, `item_prices[quantity][n]`, `discounts[apply_on][n]`, `discounts[amount][n]`, `currency_code`) are taken from this repository's existing `server/bandedCheckoutProvider.ts`, which already calls `/hosted_pages/checkout_one_time_for_items` behind `BANDED_SALES_ENABLED`. That is in-repo precedent, **not** a documentation read. A TEST-site call must confirm the field names before any Group sale is enabled. |
| The event-type catalogue page | `https://apidocs.chargebee.com/docs/api/event_types` returned HTTP 404 on 2026-11-25. | `GROUP_PROVIDER_EVENT_TYPES` lists only types this repository already handles elsewhere (`invoice.paid`, `payment.succeeded`, `payment.failed`, `refund.*`). Any other type is reported as `supported: false` and never inferred. |
| The pagination page | `https://apidocs.chargebee.com/docs/api/pagination` returned HTTP 404 on 2026-11-25. | This row makes no list call, so pagination is out of scope. A later row that lists invoices or events must read the current pagination contract first. |

No unsupported API is hidden behind a passing fixture: the two gaps above are named, bounded and
carry the check that must happen before activation.

## 3. Component mapping (packet §6.2)

The adapter accepts components only — an item price id, a quantity and `recurring`/`one_time`. It
never accepts a recipient list, so no candidate identity can reach the provider.

| Order shape | Provider composition | Pages |
| --- | --- | --- |
| Single-band group (one level, N candidates) | One recurring component, `quantity = N` | 1 recurring page |
| Mixed-band order (several levels) | One recurring component per level, in order, each with its own quantity | 1 recurring page |
| One added seat | One recurring component, `quantity = 1` | 1 recurring page |
| Plan plus extra referrals | Recurring components **and** one-time components | 2 pages: one subscription checkout, one one-time checkout |

The last row is the documented provider limit: Chargebee has separate endpoints for a subscription
checkout and a one-time checkout. `planGroupCheckout` returns `requiresSeparatePages: true` for it,
and the caller must show the exact components and the payment progress for confirmation. **The two
pages are not atomic**: a failure on the second leaves the first created. The adapter returns the
pages it did open and never reports the order as paid.

Amounts are never sent. Chargebee charges the provisioned item prices; the only computed figure is
the approved fixed discount, sent as `discounts[apply_on][0]=invoice_amount` with
`discounts[amount][0]` in whole minor units, so the page total equals the quote. No Group SKU, no
new item price and no commercial default is introduced here; the discount value comes from the
approved policy, and an order without a policy version is refused before any provider call.

## 4. Boundary behaviour the tests pin

`server/groupPlanProvider.test.ts` (22 tests) proves:

- **Exact form fields** for the recurring page, the one-time page and the fixed discount, including
  that no price or amount field is sent for the item lines.
- **A nonempty, deterministic idempotency key** per intent and page, inside Chargebee's 100-character
  bound, with long intents kept distinct by a content hash.
- **Bounded deadlines**: every request carries an `AbortSignal` (20 s recurring, 25 s one-time).
- **Safe provider response validation**: a malformed `hosted_page` body is rejected as
  `invalid_response` instead of being reported as a page.
- **Wrong-site refusal**: an order whose site differs from the configured site is refused before any
  request, and the test asserts no fetch happened.
- **Page-loss recovery**: a retried call reuses the same key, so Chargebee replays the same page
  inside its 30-minute window rather than opening a second one.
- **Provider errors surface** with their status (for example 429) instead of a partial success.
- **Event handling**: a supported type is read with its `resource_version`; an unknown type is
  reported as unsupported; a lower `resource_version` is stale and an unorderable one is stale once
  a version is stored.

## 5. Not claimed

- No TEST-site or live provider call was made by this row. The tests stub `fetch`.
- No Group SKU, item price, customer, subscription, invoice or setting was created or changed.
- No route, flag or UI calls this adapter; `GROUP_PLAN_ENABLED` remains false.
- Cross-page atomicity is explicitly not claimed.
- The one-time field names and the event-type list still need a TEST-site confirmation before any
  Group sale is enabled (section 2).
