# Usage panel & upgrade nudges (implementation spec)

> [!NOTE]
> Historical spec (v4 kit passes). Fixed-term passes (Start, Momentum, Land) and Keep warm are not sold (D-146, `PASS_SALES_ENABLED = false`). The current model is D-132 (plans with in-plan referral rungs, off behind `PLAN_FAMILY_V2`, D-146); see [`docs/PRICING.md`](docs/PRICING.md) and [`docs/DECISIONS.md`](docs/DECISIONS.md).

Design lives on `/plans` ("Your usage this cycle" + "Upgrade moments"). Values there come only from the signed-in account's own referral/credit summary and slots; nothing renders when no limit applies, and no preview or sample data ships (D-001's lasting rule, kept by D-059).

## Usage panel (signed-in user's OWN data only)
| Stat | Source | Notes |
|---|---|---|
| Open requests used | count of the user's requests in `pending` state vs the plan cap (Free 3; max 2 per company, D-006) | slot frees when the ask is accepted, withdrawn or expires; a waiting ask will use no slot until a referrer can see it (D-034, D-061) |
| Referrals used | ledger: spent vs granted this cycle | purchased referrals never expire |
| Plan referrals expiring | included monthly referrals whose rollover window ends with UTC month | Free 3 monthly end with UTC calendar month (D-039) |

## Nudges — show only at the moment of the constraint
1. **Slot cap reached** — on submitting a new request when open = limit. CTA "See plans" / "I'll wait" (`shared/openAskSlots.ts`; no plan CTA until that plan is on sale).
2. **Referrals = 0** — when starting a request without sufficient referrals. CTA "Add referrals" (opens pack purchase modal) / "Compare plans".
3. **Expiry in 7 days** — once, on /plans and in inbox. CTA "Use referrals" / "Dismiss".

## Rules (non-negotiable)
- Never fabricate stats, other users' numbers, success rates or scarcity.
- Paying never changes queue position, referral access or acceptance odds; say so in slot nudges.
- Max one nudge per session per trigger; dismissal remembered 7 days.
- No persistent banners or ads outside these moments.
