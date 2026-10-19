# Usage panel & upgrade nudges (implementation spec)

Design lives on `/plans` ("Your usage this cycle" + "Upgrade moments"). Values there come only from the signed-in account's own credit summary and slots; nothing renders when no limit applies, and no preview or sample data ships (D-001's lasting rule, kept by D-059).

## Usage panel (signed-in user's OWN data only)
| Stat | Source | Notes |
|---|---|---|
| Open asks used | count of the user's requests in `pending` state vs the plan cap (Free 3, Keep warm 5, Start 8, Momentum 15, Land 30/50/75) | slot frees when the ask is accepted, withdrawn or expires; a pass reopens it to colleagues (D-021); a waiting ask will use no slot until a referrer can see it (D-061, not built yet) |
| Credits used | ledger: spent vs granted this cycle | purchased credits never expire |
| Plan credits expiring | included credits whose rollover window ends within 7 days | Keep warm 1 mo, Start 1 mo, Momentum 3 mo, Land while the pass is active |

## Nudges — show only at the moment of the constraint
1. **Slot cap reached** — on submitting a new request when open = limit. CTA "See" the next plan from Start up with more open asks (e.g. "See Start" on Free) / "I'll wait" (`shared/openAskSlots.ts`; no plan CTA until that plan is on sale).
2. **Credits = 0** — when starting a paid tool. CTA "Add credits" (opens credits modal) / "Compare plans".
3. **Expiry in 7 days** — once, on /plans and in inbox. CTA "Use credits" / "Dismiss".

## Rules (non-negotiable)
- Never fabricate stats, other users' numbers, success rates or scarcity.
- Paying never changes queue position, referral access or acceptance odds; say so in slot nudges.
- Max one nudge per session per trigger; dismissal remembered 7 days.
- No persistent banners or ads outside these moments.
