# Chargebee integration packet (Oct 25)

Lane: billing integration / user path (todo-01M5SPG19HQMANZC0D43C66GPE). Status: research draft, not owner-approved. Facts grounded in main 216066dd code and the Main pricing handoff of Oct 25 20:22; founder pricing freeze anchors phonemsg-01M5SNVZEY1P8K169J48T2HGTJ / -01M5SNW7YRNXPSS152WD09R2CW / -01M5SNWD4WS0TRCRHDFENYZ97X.

## FINAL price points (Chargebee item price IDs)

| Plan | INR (monthly) | USD (monthly) |
| --- | --- | --- |
| skipwait_seeker_early_to_mid | 229 | 4.49 |
| skipwait_seeker_mid_to_senior | 899 | 17.99 |
| skipwait_seeker_senior_to_executive | 1299 | 25.99 |
| skipwait_referrer_* (3 tiers) | 99 / 199 / 349 | 1.99 / 3.99 / 6.99 |
| skipwait_company_team | 4999 | 99 |
| skipwait_company_growth | 9999 | 199 |
| Top-ups: skipwait_topup_early / _mid / _senior / _executive | 49 / 199 / 399 / 799 | 1 / 4 / 8 / 16 |

ID format: `skipwait_<id>-INR-Monthly` / `skipwait_<id>-USD-Monthly`; top-ups `skipwait_topup_<id>-INR` / `-USD`.

## App-side mapping (shared/planFamily.ts, read in full)

- PLAN_FAMILY prices match the FINAL handoff exactly.
- REFERRER_PLANS: chargeable=false (gate: verified matching flow) - not sold at launch.
- COMPANY_PLANS: chargeable=false (not built) - not sold at launch.
- TOPUP_PRICE: early/mid/senior/executive = 100/400/800/1600 cents + 4_900/19_900/39_900/79_900 paise.
- VOLUME_DISCOUNTS are app-side (not Chargebee coupons).
- PLAN_FAMILY_V2 flag gates all readers.

## Format gap (load-bearing)

Legacy `shared/planCatalog.ts catalogItemPriceId(planId, interval, currency)` builds `skipwait_${planId}_${interval}-${currency}` (e.g. `skipwait_momentum_90d-INR`). The new format is `skipwait_<id>-INR-Monthly`. Any reader still on the legacy builder produces item price IDs that do not exist in the new price book. The replacement (#666 lane) must migrate every caller, not just add new constants.

## Checkout path facts (server/kitCheckout.ts)

- Server never trusts a client-sent price; it probes item-price availability server-side.
- Entitlement is written only after a Chargebee webhook event, never on redirect.
- Legacy hosted-cart creation for the archived Rs.99/credit pack is still live on prod (proven Oct 25 20:53) - #666 urgency evidence.

## Handoff caveats (carried from billing handoff)

- Retired-item API refusal is unobserved; hosted-page 404s are not proof of archival behavior.
- Hidden feature flags do not block API-driven checkout; app server gates must prevent unbuilt company/referrer/USD recurrence.
- Volume math stays app-side; no charge/renewal activation work in this packet; no gateway changes.

## Open items

- Full caller inventory of catalogItemPriceId (grep pass) and migration list for #666.
- Webhook handling for new item price IDs (PLAN_FAMILY_V2 on): which existing parsers accept the new format.
- USD recurrence gates (Chargebee site currency config vs app flags).
