# Usage panel & upgrade nudges (implementation spec)

Design lives on `/plans` ("Your usage this cycle" + "Upgrade moments"). Values there are preview placeholders.

## Usage panel (signed-in user's OWN data only)
| Stat | Source | Notes |
|---|---|---|
| Open referral slots used | count of user's requests in `pending` state vs plan limit (Free 3, Start 8, Momentum 15, Land 30/50/unlimited) | slot frees on answered/passed |
| Credits used | ledger: spent vs granted this cycle | purchased credits never expire |
| Plan credits expiring | included credits whose rollover window ends within 7 days | Start 1 mo, Momentum 3 mo, Land while subscribed |

## Nudges — show only at the moment of the constraint
1. **Slot cap reached** — on submitting a new request when open = limit. CTA "See Momentum" / "I'll wait".
2. **Credits = 0** — when starting a paid tool. CTA "Add credits" (opens credits modal) / "Compare plans".
3. **Expiry in 7 days** — once, on /plans and in inbox. CTA "Use credits" / "Dismiss".

## Rules (non-negotiable)
- Never fabricate stats, other users' numbers, success rates or scarcity.
- Paying never changes queue position, referral access or acceptance odds; say so in slot nudges.
- Max one nudge per session per trigger; dismissal remembered 7 days.
- No persistent banners or ads outside these moments.
