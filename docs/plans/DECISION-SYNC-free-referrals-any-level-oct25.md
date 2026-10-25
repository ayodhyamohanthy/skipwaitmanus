# DECISION-SYNC: free 3 referrals at any level + plan-freeze status (Oct 25, 2026)

Owner question and correction, iMessage Oct 25 ~17:30 IST (phonemsg-01M5SEXKKF8QTNV1T46DK3GTN1):
"And is our level based pricing freezed? We are giving free 3 job referrals to everyone (any level) and we have early mid senior plans both for seekers and referrers have you pushed to repo and updated the instructions?"

## What this settles

1. **The free entitlement is 3 free referral REQUESTS per month for everyone, at ANY job level.** This is request-denominated, not level-denominated: a free ask on an L8 job consumes one of the three free monthly referrals, same as an L1 job. This matches D-039 ("3 free asks every month") and D-173 ("the free plan keeps 3 free referrals every month"), and it supersedes the level-denominated reading of the free grant in D-110 ("3 free = one L3 ask or three L1 asks") for the free allowance only.
2. **Level pricing for PAID referrals is unchanged.** D-110/D-117/D-132 stay frozen as recorded: asks beyond the free allowance cost referrals by job level (L1-L10). This message makes no paid-unit formula change; none is inferred.
3. **Flags and gates are unchanged.** PLAN_FAMILY_V2 and ASK_LEVEL_COST stay OFF until D-132-audit (Tier 1, money-core) passes independent review. Nothing in this sync enables anything.

## Plan-freeze status at this date (verified against docs/DECISIONS.md on main)

- **Level-based pricing**: frozen in instructions (D-110, D-132 "Now freeze", D-135 sync), code merged behind flags OFF (#381, #410, #415), go-live gated on D-132-audit. NOT live: /api/plans/catalog serves the previous family with all plan terms unavailable.
- **Seeker plans, Entry/Mid/Senior**: FROZEN - D-152 owner verbatim "Entry level Referrers, Mid level Referrers, Senior level Referrers"; contents from D-132/D-148 behind flag.
- **Referrer plans, Entry/Mid/Senior level Candidates**: SHAPE SETTLED by D-196 (Oct 24, owner verbatim): basic referring stays free; an opt-in plan's benefit is level-matched FIRST ACCESS to referral requests, then the free pool; the benefit is shown on the plan card. OPEN only: the plans' prices, contents and the first-access window length. Today's message confirms the plans exist on both sides; it supplies no prices.

## Open items routed to their lanes

- Referrer-plan prices / contents / first-access window: owner's call (D-196's open items). Nothing may be built or priced until he supplies them.
- Free-allowance implementation reconciliation (3 requests any level vs level-denominated grant): money-core, with D-132-audit.
- Buyer-facing terminology ("referrals", never "credits"): D-173/D-180 sweep lane, PR #598.

## Anchors

phonemsg-01M5SEXKKF8QTNV1T46DK3GTN1 (today); phonemsg-01M5MXXXXCF1Z6SSY4F2420XB9 ("Just say 3 free referrals"); phonemsg-01M5MXYDWXDCYCV39DP8VHYCWV ("Use term referrals get rid of credits"); phonemsg-01M5MYCBQ8BGB3NDKR5QPDWKRN (D-173); phonemsg-01M5PCTYNS691PYJJ4DGJRG4QY, phonemsg-01M5PCVJPYDBTH963Q4T1NVF8Q, phonemsg-01M5PCWF2FH1XBBZ6C6WJA2CRY (D-196).
