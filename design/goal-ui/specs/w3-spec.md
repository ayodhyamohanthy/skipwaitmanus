# W3 SPEC - money (Tier 1: every line is a truth claim) [re-created Oct 22 from my record]

Source of truth: shared/moneyCopy.ts + shared/planFamily.ts constants. No money sentence may be re-authored in a page - import the constant. Copy re-read is against the LIVE model; the D-132 (V2) model stays gated until the owner's enable word.

## Live-model truths pages must keep saying
- 3 free credits every month; extra asks use credits (ASK_COST_SENTENCE).
- Purchased credits NEVER expire (already live truth). Bonus/promo credits expire in 30 days and are used before monthly credits (Premium - keep verbatim).
- Referrers are never paid and never ask for money (REFERRER_MONEY_SENTENCE).
- CREDIT_RULE as shipped; a not-fixable pass releases the credit (D-035/D-052); a lapse returns it (D-038).
- Referrer-role checkout refuses with 403 (D-067) - no purchase UI on referrer surfaces.

## Pages
/plans: PlansV2 ("Choose your reach.") built behind VITE_PLAN_FAMILY_V2. Fees read from planFamily. No India/Global toggle. Needs 1280+390 captures.
/premium: goal migration. V2 OFF: "$1 each (Rs99 in India). Never expire." + bonus honesty + "Credits are added only after verified payment." V2 ON: PLAN_CREDIT_LADDER rungs 5/10/25/50/100/200 (Save 2/4/8/12/16/20%), single Rs49/$1, one black commit naming the amount, ?quantity=K pre-selects the nearest rung. Remove kit layout, font-display, #141414/#505050 literals. Mock: premium-1280/390.png.
/billing: goal migration, KEEP section order (plan -> payment history -> cancellation); cancellation copy untouched; mono numerals.
/pricing (public): goal marketing frame (judgement, changeable). At enable: Rs49 single + ladder + level-cost sentence; employers section post-D-133 only.

## ENABLE CHECKLIST (all in #416, HOLD for owner go-live; re-verify file list after rebase)
1 Landing FAQ Rs99->Rs49  2 /pricing  3 /premium Rs99-floor sentence  4 CREDIT_RULE->V2 everywhere  5 ask-cost quote on /ask + bridge  6 top-up links pre-select K  7 ASK_COST_SENTENCE unchanged  8 slots meter plan label from planFamily (free = "Open Door")  9 /explore drawer costLine V2 branch
