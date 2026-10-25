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

- **CORRECTION (controlling clarification phonemsg-01M5SG36CB2WMTCKY6HFRS4X7A, Oct 25 ~17:50 IST, verbatim: "As usual after taking the plan they can get as many referrals they want. Like 10 senior + referrals , 1 mid level referrals etc . Each plan gives certain referrals . Pricing is our past pricing only ( in place of credits we are using name referrals, and plan names have changed )").** An earlier reading of "pricing is simple, subscriptions" as superseding D-110/D-132's level-denominated paid contract was WRONG and is retracted: the PRIOR prices and quantities are retained. What changed: the customer term "credits" becomes "referrals" (internal denomination/accounting unchanged; user-facing "credits" stays retired per D-173/D-180), the plan names changed (D-152), and buyers choose referral quantities BY LEVEL (owner example: 10 senior-level referrals + 1 mid-level referral). Each plan gives certain referrals; a plan is NOT unlimited use. The free exception stands controlling: 3 free referral requests/month for everyone (verified card), ANY level, no carry-forward. The ASK_LEVEL_COST and PLAN_FAMILY_V2 flags stay OFF; the money-core audit lane reconciles implementation before anything is enabled.
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

Seeker side: **CANCELED as speculation.** The controlling clarification (phonemsg-01M5SG36CB2WMTCKY6HFRS4X7A) says prior pricing is retained - no remapping was needed. The recorded mapping stands as canonized in D-148/D-152 (Entry = the Open Door terms, Mid = the Fast Track terms, Senior = the Insider terms; fees unchanged from D-132: Mid $9.99 / Rs499 monthly, Senior $59 / Rs1,299 monthly by application; referral quantity ladder 5/10/25/50/100/200 at single $1 / Rs49 with save 2-20%). The Entry tier mapping to the $0 Open Door terms is consistent with free-for-everyone and is NOT a conflict - the owner never said every tier is paid.

Referrer side, grounded in the referrer's own economics (D-119 owner: referrers monetise "because more senior greater the referral bonus" - employer referral bonuses run roughly Rs10k-Rs1L / $1k-5k per successful referral, so a monthly fee for priority access to convertible requests has clear ROI) plus D-096's win-win rule:
- Same three price points by level: **$9.99 / $24 / $59 per month (Rs499 / Rs999 / Rs1,299)** for early / mid / senior seeker-request priority.
- UNKNOWN (owner's call): referrers are the scarce supply side - a launch discount or free-launch window for referrer plans is defensible; not assumed.

### D. Priority timing recommendation (respecting the frozen poster-first 24h)

- A request matching a posted internal job: the poster holds first match for the frozen 24 HOURS; on non-acceptance it moves to the next eligible referrers (owner's rule today). How the paid-priority stage orders after that window, and its OWN window length, are OPEN - owner decision, no recommendation encoded yet (a prior 12-hour suggestion is WITHDRAWN as unsupported).
- Neither the poster window nor any future paid-priority window is a request expiry (D-174: asks do not expire).


### E. Units vs requests - what is recorded, and the exact open classification gaps

Recorded (anchored):
- The customer-facing unit is ONE REFERRAL REQUEST (D-173 owner: "When buying show 10 senior referrals, 1 junior referrals. Users will buy as they like, dont use word credits"). The ledger stays denominated in underlying units; the customer never sees "credits" (D-180).
- Spend contract (D-110, retained by today's clarification): a request consumes units equal to the JOB's level, L1=1 ... L10=10. The buy ladder prices are UNIT prices (single $1 / Rs49; rungs 5/10/25/50/100/200 at save 2-20%).

Exactly open (NO source settles these; do not present arithmetic that presumes answers):
1. **Label mapping**: no source maps the shop's senior/mid/junior REQUEST labels to L-numbers (L1-L10) or to the new referrer-career axes. Any "10 senior = 100 units" style math is unsupported until the owner maps the labels.
2. **Mixed-quantity checkout**: how a combined pick (e.g. 10 of one level + 1 of another) prices against the fixed rungs is not defined in the catalog or any decision - per-rung, combined-units, or per-request pricing is undecided.
3. **Plan included counts**: inclusion is SETTLED - each plan gives certain referrals (owner today; consistent with D-173's allowance + in-plan purchase wording). OPEN: the included COUNT per seeker plan (early/mid/senior) - asked of the owner Oct 25 ~17:54, reply pending. The v2 config on main carries no allowances yet ("allowances land with the pricing build"). How included referrals interact with the separately priced dropdown is part of the same count answer; no fee-plus-separate-only model is encoded.
4. **Axes**: recorded rules denominate cost by JOB level only; today's plan axis is target REFERRER career level. No recorded rule prices by referrer career level; whether it should is a new decision, not an assumption.
5. **Spending order** (raised by the proposal review, Oct 25 ~18:19): if the ANY-level free grant is spent first, a low-level early request can burn it and leave a later senior-level need to the plan's narrower included bundle. Whether spend order is free-first, included-first, or user-chosen is UNDECIDED - the proposals' free-first order is not agreed, and no order is encoded.


## Pricing-page value communication (owner, Oct 25 ~17:58 IST, phonemsg-01M5SGJ2YR4JC775A9H14HQKBQ)

Verbatim: "We should somehow convince them a single referral will buy out the entire years plan amount. So we should elevate this communication in pricing page. A single referrer got in through will get you the full years amount break eve, for job seeker a single job's first salary will break even ."

Recorded intent with guardrails (so copy stays truthful):
- The pricing page SHOULD carry a prominent value comparison: annual plan cost vs what ONE success is worth - for a referrer, one successful employer referral bonus; for a seeker, the first salary from one landed job.
- It is a COMPARISON, never a promise: no "a referral WILL pay for your year", no guaranteed bonus, hire, salary or outcome (D-006/D-040 stand; copy promises first access and matching, never results).
- The employer referral bonus is paid by the EMPLOYER under its own policy (eligibility, amount, tenure conditions), not by skipwait; copy must say so.
- Any numbers shown must come from real sourced examples or be labeled hypothetical arithmetic; the annualized cost must match the actual proposed billing cadence (no invented annual discount).
- Exact pricing-page words follow the owner's price decision; nothing here approves publication or live prices.


## Marketing positioning directive (owner, Oct 25 ~18:00 IST, phonemsg-01M5SGNG5TKJ26KPNF9WX372VR + phonemsg-01M5SGNTHM0236HNH1HGST8GS6)

Verbatim: "Job hunting? never cold-apply. Check if you can get referred first.this should be used left right and center" and "In all our marketing efforts".

Recorded:
- The founder's EXACT words are the canonical tagline: **"Job hunting? never cold-apply. Check if you can get referred first."** Referral-first positioning goes across the website and all marketing ("left right and center").
- Working tagline (FINAL, owner-chosen): **"Rule #1: Never cold-apply. Check if you can get referred first."** - exact wording, casing and punctuation as chosen (Oct 25 ~18:11, "Lets use this then" phonemsg-01M5SH9VV1PZPWF65X4XFN4MGC + the line itself phonemsg-01M5SHA6SYKAB2DQQXEN39FPCK + "In all our marketing efforts" phonemsg-01M5SHACHBKFYQR6H7ENYH1KK6). Full chronology: softer variant proposed ("Before you cold-apply", received "Lovely"/"Like it") -> owner preferred his original "Job hunting? Never cold-apply..." (phonemsg-01M5SGTJ5EW3467MWXXWEYQ7XD) -> owner then offered the two "Rule #1" forms and CHOSE this one. This supersedes every earlier opener.
- Rhetoric, not literal advice: the tagline is marketing positioning; supporting copy may add deadline-awareness where it matters (do not wait past an application deadline), without altering the tagline itself and without any success guarantee.
- Guardrails: the positioning never claims a guaranteed referral, job, or better success rate, and never tells users not to apply elsewhere; it presents referral-first as the smarter first step.
- Channel permissions are unchanged: website and product copy go through the normal queue/review lanes; external posting in the owner's name (LinkedIn/X/email) needs its own per-channel approval - this directive is not a blanket posting grant.


## Pricing proposal status (Oct 25 ~18:22 IST - REOPENED by owner)

**The first proposal is REJECTED (Oct 25 ~18:21, phonemsg-01M5SHVTBD1GFGGK9X30YZCZWH):** "I dont think the pricing is well thought . Reiterate pricing . And early career referrals is 0$ it should be some amount as it a plan. Rethink and give me monetisation and pricing plan again". Pricing is REOPENED: the early-career seeker plan must cost money (a plan is not $0), the free allowance is separate, and the owner wants a full monetisation + pricing rethink (India + global). A rebuilt proposal (v2) was delivered Oct 25 ~18:28 in the same private File: paid seeker tiers early Rs149/$2.99 + 5 early-level referrals, mid Rs499/$9.99 + 4 up-to-mid, senior Rs1,299/$25.99 + 5 any-level (the $25.99 is an explicit proposed test, not an FX derivation); top-ups gated by plan level at Rs49/$1, Rs199/$4, Rs399/$8; optional referrer plans Rs99/$1.99, Rs199/$3.99, Rs349/$6.99 priority-only, with a recommendation to hold charging until real flow/value is proven. **v2 is also NOT adopted** - the owner has not accepted any prices or counts. Nothing in v1 or v2 may be implemented or treated as frozen. The previously recorded frozen fees stay as the last canonical record but no longer bind the rethink - the owner explicitly reopened them. OPEN EXPLORATION (not adopted): the owner is considering replacing the free-3 grant with a limited-launch "3 referrals for $1" pack (phonemsg-01M5SJWRWBW4K96ZGJDD1TDCVQ, Oct 25 ~18:39, "Im thinking"). One-time-per-person vs recurring-monthly is unresolved; payment-cost and India-offer grounding is in progress. The free-3 rule STANDS until he decides. LATEST OWNER DIRECTION (Oct 25 ~18:42-18:52, category-level decisions; prices/caps/renewals NOT adopted):
- Three audience sections: seeker plans, referrer plans, company plans ("Lets have seeker, referrer, company plans too", phonemsg-01M5SK4VFNDMJ2M73656G2KJPG). Company benefits/prices are proposals pending; existing free company/employee job posting and 24h poster first-look stay unchanged (no silent paywall).
- Launch offer format decided: "Founding-member launch price" with a limited NUMBER of memberships ("limited number of memberships. Is fine uner Founding-member launch price", phonemsg-01M5SKCDRY6PQP7J5G9933AF9C). Exact cap, prices, and renewal terms NOT chosen - pending his decision on the recommendation.
- Discount display guardrail: no fabricated percentage off (his "90% discounted or somting" idea, phonemsg-01M5SK8P8CTC8ZSNDDPV94HW9P, was answered with honest founding-price labeling; he accepted the honest format). No invented regular price, no fake spots-left count.
- The $1-for-3 exploration is superseded as a launch offer by this direction: free 3 ANY level stands for launch; $1 starter remains only a possible later experiment.
- NEW OPEN EXPLORATION (Oct 25 ~19:00, phonemsg-01M5SM31QRFWBSQ9PKFYRG2K2J, "what do you say" - NOT adopted): replace the early/mid/senior ladder with three bands - early-to-mid, mid-to-senior, senior+-to-executive - for BOTH seekers and referrers. If adopted this remaps plan access axes, included quantities and top-up gating (it is not a rename); the confirmed any-level free-3 grant and the current access schema stand until he decides. Awaiting his decision; pricing impact analysis in progress.

What STAYS confirmed regardless: free 3 referrals/month ANY level with verified card, no carry-forward; basic referring free; subscription access axes (seeker plan = referrer level, referrer plan = seeker-level priority); poster-first 24h matching; "referrals" terminology; the final tagline.


A full pricing recommendation (seeker and optional referrer plans, included referral counts, extra-referral prices, INR + USD) was delivered to the owner as a private proposal File (https://files.instinct.com/ndpk6adodk6k-skipwait-pricing-recommended-plans). **None of its numbers are adopted.** They are a proposal awaiting the owner's decision; only the recorded frozen fees (Mid $9.99/Rs499, Senior $59/Rs1,299, Entry $0 terms) and the controlling spec in this document are canonical. The proposal's suggested changes (e.g. a $39 senior global fee, per-referrer-level top-up prices, optional referrer plan fees) must not be implemented or treated as frozen until the owner explicitly decides. Tax treatment for checkout publication is unresolved.

## Anchors


phonemsg-01M5SEXKKF8QTNV1T46DK3GTN1 (today); phonemsg-01M5MXXXXCF1Z6SSY4F2420XB9 ("Just say 3 free referrals"); phonemsg-01M5MXYDWXDCYCV39DP8VHYCWV ("Use term referrals get rid of credits"); phonemsg-01M5MYCBQ8BGB3NDKR5QPDWKRN (D-173); phonemsg-01M5PCTYNS691PYJJ4DGJRG4QY, phonemsg-01M5PCVJPYDBTH963Q4T1NVF8Q, phonemsg-01M5PCWF2FH1XBBZ6C6WJA2CRY (D-196).

Controlling spec: phonemsg-01M5SFYFY54D3VAEDAEA3591SS (Oct 25 ~17:48 IST).
