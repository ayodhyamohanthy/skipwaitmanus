# W3 SPEC - money (Tier 1: every line is a truth claim) [re-created Oct 22 from my record]

> **Current rules (DECISION-SYNC-oct26, Nov 1 2026).** D-219 superseded the D-132 (V2) model this spec gates (its code stays behind off flags, D-221) and paused the legacy packs (D-219 (6); runtime `CREDIT_PACKS_ON_SALE = true` until PR #666). The /premium "V2 OFF" pack copy, the "V2 ON" ladder and the ENABLE CHECKLIST (#416, which the D-221 audit section 7 recommends closing) are history: where this spec disagrees with D-219, D-219 and `docs/PRICING.md` win (D-202), and each activation needs the owner's word (D-123). The live money constants (`ASK_COST_SENTENCE` and the rest) stay in code until the D-173/D-180 wording sweep.

Source of truth: shared/moneyCopy.ts + shared/planFamily.ts constants. No money sentence may be re-authored in a page - import the constant. Copy re-read is against the LIVE model; the D-132 (V2) model stays gated until the owner's enable word.

## Live-model truths pages must keep saying
- 3 free credits every month; extra asks use credits (ASK_COST_SENTENCE).
- Purchased credits NEVER expire (already live truth). Bonus/promo credits expire in 30 days and are used before monthly credits (Premium - keep verbatim).
- Referrers are never paid and never ask for money (REFERRER_MONEY_SENTENCE).
- CREDIT_RULE as shipped; every employee decline keeps the credit spent, whatever the reason (D-147, superseding D-035 and D-052's decline release); a lapse returns it (D-038). One runtime edge, a pass made without a claim, is an open owner question (DECISION-AUDIT-oct26 section 8 (a)).
- Referrer-role checkout refuses with 403 (D-067) - no purchase UI on referrer surfaces.

## Pages
/plans: PlansV2 ("Choose your reach.") built behind VITE_PLAN_FAMILY_V2. Fees read from planFamily. No India/Global toggle. Needs 1280+390 captures.
/premium: goal migration. V2 OFF: "$1 each (Rs99 in India). Never expire." + bonus honesty + "Credits are added only after verified payment." V2 ON: PLAN_CREDIT_LADDER rungs 5/10/25/50/100/200 (Save 2/4/8/12/16/20%), single Rs49/$1, one black commit naming the amount, ?quantity=K pre-selects the nearest rung. Remove kit layout, font-display, #141414/#505050 literals. Mock: premium-1280/390.png.
/billing: goal migration, KEEP section order (plan -> payment history -> cancellation); cancellation copy untouched; mono numerals.
/pricing (public): goal marketing frame (judgement, changeable). At enable: Rs49 single + ladder + level-cost sentence; employers section post-D-133 only.

## ENABLE CHECKLIST (all in #416, HOLD for owner go-live; re-verify file list after rebase)
1 Landing FAQ Rs99->Rs49  2 /pricing  3 /premium Rs99-floor sentence  4 CREDIT_RULE->V2 everywhere  5 ask-cost quote on /ask + bridge  6 top-up links pre-select K  7 ASK_COST_SENTENCE unchanged  8 slots meter plan label from planFamily (free = "Open Door")  9 /explore drawer costLine V2 branch
