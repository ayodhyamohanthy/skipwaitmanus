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
- **Referrer plans, Entry/Mid/Senior level Candidates**: SHAPE SETTLED by D-196 (Oct 24). Owner verbatim, Oct 24 12:56-12:57 IST: "Basic referring is free. If they take a plan they get priority referrals first then to the free pool guys" (phonemsg-01M5PCTYNS691PYJJ4DGJRG4QY, 12:56:07); "If they take senior plan they get senior referrals first over free" (phonemsg-01M5PCVJPYDBTH963Q4T1NVF8Q, 12:56:28); "This should be shown in plan / Feature" (phonemsg-01M5PCWF2FH1XBBZ6C6WJA2CRY, 12:56:57/12:57:00). Settled: basic referring stays free; the opt-in plan benefit is level-matched FIRST ACCESS to referral requests, then the free pool; the benefit shows on the plan card; copy promises first access, never a guaranteed referral. D-156's "shape OPEN" reading is SUPERSEDED by D-196 and must stop being cited as open. Genuinely unresolved, owner-only: the plan PRICES and the first-access WINDOW LENGTH. Today's message confirms the plans exist on both sides; it supplies neither.

## Open items routed to their lanes

- Referrer-plan PRICES and first-access WINDOW LENGTH: owner's call (D-196's only open items; the benefit/shape is settled). Nothing may be built, priced or enabled until he supplies them.
- Free-allowance implementation reconciliation (3 requests any level vs level-denominated grant): money-core, with D-132-audit.
- Buyer-facing terminology ("referrals", never "credits"): D-173/D-180 sweep lane, PR #598.


## Controlling pricing + matching specification (owner, Oct 25 ~17:48 IST, phonemsg-01M5SFYFY54D3VAEDAEA3591SS)

Raw original, verbatim: "Our pricing is simple , subscriptions , free 3 job referrals for everyone who has verified card for anti spam doesnt carry forward, 2) job seeker plans: early career referrer ( job seekers referral requests get matched/access with early career professionals) , mid career referrers(job seekers referral requests get matched/access with mid level career professionals/referrers), senior level referrers plans (job seekers referral requests get matched/access with senior career level professionals) . Same with referrers but referring is free . They can opt in for plans early career job seeker requests , mid career job requests, senior level job requests . They get priority access of respective level job seeker requests than free pool referrers. For companies they can post internal jobs , employees can also post internal jobs ,who ever posted they get priority first than the rest if any matching requests happen. Eg: an employee posted internal referrerals they get firs match when someone sends request , then if dont accept in 24 hours it moves to next referrers ."

Canonical reading (controls over older rows where they conflict):

1. **Free allowance**: 3 free job referrals per month for everyone whose card is verified (anti-spam). Unused free referrals do NOT carry forward. Amends D-039/D-173: adds the verified-card condition and the no-carry-forward rule.
2. **Seeker subscriptions**: the plan names the REFERRER career level the seeker's requests get matched with - early career referrers / mid career referrers / senior level referrers. Confirms and clarifies D-152 (the plan describes the referrer level reached, not the buyer's own stage).
3. **Referrer side**: referring stays FREE. Optional referrer subscriptions name the SEEKER career level whose requests the referrer gets PRIORITY access to (early career job seeker requests / mid career job requests / senior level job requests), ahead of the free referrer pool. Confirms and extends D-196.
4. **Internal-job postings**: companies can post internal jobs; employees can also post internal jobs. Whoever posted gets FIRST match priority when a matching referral request arrives. If the poster does not accept within 24 HOURS, the request moves to the next eligible referrers. The 24-hour window is the poster's first-match window only - it is not a general request expiry, and it is not the paid referrer priority window (whose length stays open).

Explicit reconciliation of older rows against this controlling spec:

- **D-110/D-132 per-level per-ask spend (ASK_LEVEL_COST) CONFLICTS with "Our pricing is simple, subscriptions" and is SUPERSEDED as the go-forward pricing shape.** Paid usage is subscription-based plan access; no per-request paid debit is introduced as a substitute. The ASK_LEVEL_COST and PLAN_FAMILY_V2 flags stay OFF; nothing already live changes; the money-core audit lane reconciles implementation against this spec before anything is enabled. The free-allowance rule above replaces D-110's level-denominated free grant outright.
- **D-132's plan contents (rungs/dropdowns)**: the subscription model stands; exact plan contents and prices were NOT supplied in this message - none are invented.
- **D-196**: confirmed and extended by point 3. Still open from D-196, owner-only: the plan PRICES and the paid-priority WINDOW LENGTH (the 24-hour rule in point 4 is the poster window, not this one).
- **Matching/allocation behavior** (current code): poster-first matching with the 24-hour handoff is NEW scope to reconcile in the allocation implementation; it does not alter ask expiry (D-174 launch rule: asks do not expire) or the D-034/D-047 spend rules.


## RECOMMENDATION package (NOT a decision - owner rules; prepared Oct 25 for the narrow open items)

### A. Old fees vs new level-access model - reconciliation status

The frozen v2 family (shared/planFamily.ts on main, frozen Oct 21 under D-132) has TWO paid tiers with RELATIVE reach: Fast Track $9.99 / Rs499 monthly (up to 2 levels above the seeker's level) and Insider $59 / Rs1,299 monthly, by application (up to 4 levels). The controlling spec has THREE paid levels with ABSOLUTE career-level access (early / mid / senior career referrers). There is no 1:1 mapping: 2 tiers vs 3 levels, relative-reach vs absolute-category semantics. D-148/D-152's "fees unchanged" covered renames of the same SKUs, not this re-cut - a lead, not proof. No fee is asserted settled for the new tiers.

### B. Actual unresolved contradictions (not "everything settled")

1. **Free "3 referrals any level" vs paid level access.** If a free request can reach senior referrers, the subscription's core benefit collapses. Grounded reading (ASSUMPTION, needs owner confirmation): "any level" applies to the JOB level of the ask (no level-based debit of the free grant), while the subscription governs which REFERRER pool the request reaches - free requests go to the general/free referrer pool; plans unlock the level-matched pools. This preserves both of the owner's statements.
2. **Subscription contents.** Per D-173 (owner): each plan carries an included referral allowance and extras are bought inside the plan. Not unlimited use; no per-request debit (superseded). The included allowance counts are NOT decided.

### C. Price recommendation (owner decides; two price books per D-122; no GST per D-007)

Seeker side, anchored to the frozen v2 price points and the Oct 14 market research (Naukri Pro Rs999/mo, comparable tools $24-29):
- Early career referrers plan: **$9.99 / Rs499 per month** (the frozen Fast Track entry point).
- Mid career referrers plan: **$24 / Rs999 per month** (market midpoint; matches Naukri Pro).
- Senior level referrers plan: **$59 / Rs1,299 per month** (the frozen Insider point; whether "by application" carries over is UNKNOWN).
- Included monthly allowances (ASSUMPTION, matching the frozen ladder rungs): Early 5 / Mid 10 / Senior 25 included referrals; in-plan extras at the frozen ladder (single $1 / Rs49; 5-200 rungs at save 2-20%).

Referrer side, grounded in the referrer's own economics (D-119 owner: referrers monetise "because more senior greater the referral bonus" - employer referral bonuses run roughly Rs10k-Rs1L / $1k-5k per successful referral, so a monthly fee for priority access to convertible requests has clear ROI) plus D-096's win-win rule:
- Same three price points by level: **$9.99 / $24 / $59 per month (Rs499 / Rs999 / Rs1,299)** for early / mid / senior seeker-request priority.
- UNKNOWN (owner's call): referrers are the scarce supply side - a launch discount or free-launch window for referrer plans is defensible; not assumed.

### D. Priority timing recommendation (respecting the frozen poster-first 24h)

- A request matching a posted internal job: the poster holds first match for the frozen 24 HOURS; on non-acceptance it moves to paid-priority referrers of the matching level, then the free pool.
- A request with no posted-job match: paid-priority referrers of the matching level get **12 HOURS** first access (RECOMMENDATION - half the poster window, keeps the free pool viable per D-096), then the free pool.
- The 12h paid-priority window and the 24h poster window are distinct clocks; neither is a request expiry (D-174: asks do not expire).

## Anchors


phonemsg-01M5SEXKKF8QTNV1T46DK3GTN1 (today); phonemsg-01M5MXXXXCF1Z6SSY4F2420XB9 ("Just say 3 free referrals"); phonemsg-01M5MXYDWXDCYCV39DP8VHYCWV ("Use term referrals get rid of credits"); phonemsg-01M5MYCBQ8BGB3NDKR5QPDWKRN (D-173); phonemsg-01M5PCTYNS691PYJJ4DGJRG4QY, phonemsg-01M5PCVJPYDBTH963Q4T1NVF8Q, phonemsg-01M5PCWF2FH1XBBZ6C6WJA2CRY (D-196).

Controlling spec: phonemsg-01M5SFYFY54D3VAEDAEA3591SS (Oct 25 ~17:48 IST).
