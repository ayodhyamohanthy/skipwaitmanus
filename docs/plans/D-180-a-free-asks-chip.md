# D-180-a-free-asks-chip

**Row:** COPY / terminology lane. **Tier:** 1 (money copy on released surfaces). **Branch:** agent/copy/free-asks-chip-terminology.

## Scope
One headline slice of D-180 ahead of the full D-180-referral-words pass: the free monthly allowance phrase becomes "3 free referrals every month" (owner headline decision, iMessage phonemsg-01M5MXXXXCF1Z6SSY4F2420XB9, Oct 23 23:16 IST). Changes `FREE_ASKS_CHIP` in shared/moneyCopy.ts, the three static meta embeds in client/index.html, the PlansV2 card bullet, and the test expectations + two pre-D-180 guard regexes (guards still ban every unqualified "free referrals" form; only the monthly-limited form is permitted).

## Out of scope
Paid-unit "credits", noun "asks", ASK_COST_SENTENCE tail ("extra asks use credits"), CREDIT_RULE family, docs prose mentions: all stay with D-180-referral-words (its row waits on D-174-held-ask-reconfirm, D-048-F-credits, D-099-bonus-pages). No behavior, amount, eligibility or flag change; card-gated eligibility wording waits for the PR 666 behavior sync (D-042).

## Gate
Green required CI + one independent (non-builder, non-Instinct) review per D-151.
