# v2 catalog apply to the LIVE Chargebee site — audit (Oct 23, 2026)

Required by docs/PRICING.md ("audit file owed at apply time"). Create-only,
additive, no customers, subscriptions, invoices or payments touched. Founder
instruction: "change the plans in razorpay,paypal and chatgebee and up"
(Oct 23 09:24 IST), within the
frozen D-132/D-152 catalog (names Entry / Mid / Senior level Referrers, fees
and credits unchanged).

## What was created on the LIVE site, all status active

- 2 plan items + 4 plan item prices:
  - skipwait_v2plan_fast_track: INR Rs499.00/mo, USD $9.99/mo, external name "Mid level Referrers, monthly"
  - skipwait_v2plan_insider: INR Rs1,299.00/mo, USD $59.00/mo, external name "Senior level Referrers, monthly"
  - enabled_in_portal=false (matches TEST)
- 6 monthly credits addon items + 12 item prices (skipwait_v2credits_N, "N credits, monthly", enabled_in_portal=true):
  5/10/25/50/100/200 credits at Rs240/470/1,125/2,150/4,100/7,840 and $4.90/9.60/23/44/84/160 per month
- 6 one-time pack charge items + 12 item prices (skipwait_v2pack_N, "N credits", per_unit, same amounts)
- Item family skipwait_credits reused; nothing updated, archived or deleted.

28 item prices, 14 items — exact parity with the TEST-site catalog
inventoried Oct 23 (docs/PRICING.md step 3), with D-152 display names. Entry
level Referrers (open_door) is free: no Chargebee item, as designed.

## TEST-site name alignment

The two TEST plan item prices were renamed from "Fast Track, monthly" /
"Insider, monthly" to the D-152 names so future proof carts render the frozen
names (external_name only; ids, prices unchanged).

## Impact check at apply time

- Live subscriptions: 0. Live invoices: 0. Live payment sources: 0.
  The catalog apply did not touch customer records.
- Nothing sells these items yet: the checkout code path is #523 (held),
  PLAN_FAMILY_V2 and friends stay OFF, and no hosted page was created.
- Razorpay and PayPal are gateways inside Chargebee, not separate plan
  catalogs: there is nothing plan-shaped to "change" in them. Gateway wiring /
  INR hosted-checkout status is tracked separately in docs/PRICING.md.

## Limits (do not over-claim)

This proves the live catalog exists and matches the frozen numbers. It is NOT
a checkout run, NOT a payment, NOT fulfillment, NOT launch readiness. Launch
still needs #523's safety review, the D-132 audit, production captures, and
the founder's enable word.
