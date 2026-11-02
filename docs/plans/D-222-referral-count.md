# D-222: persistent person-owned remaining-referral count (shell)

Decision: D-222 (docs/DECISIONS.md). Owner steering Oct 27 13:03:58 IST (phonemsg-01M5Y4FF0TWKZ5HGJQ4XSWQ4KR): the number of referrals stays visible to the signed-in person anywhere in the app. Designer treatment: Oct 27 13:05 IST proposal, recorded here verbatim in substance.

## Element
One shell-level element in the existing meta slot where CreditsPill renders today (client/src/components/goal/GoalShell.tsx:153-154), desktop and mobile top bar. Current bordered control form (border-g-control-edge, rounded-g-control, h-8/h-9 compact): mono numeral + sans words, NO icon at all.

- Words: "N referrals left". The meaning of the count stays explicit at 390px too - never an ambiguous numeral badge; if space truly forbids the full words, the accessible name carries "N referrals left" and the visible compact form keeps "referrals" (designer's final call, verified in the 390 capture).
- Zero: "0 referrals left" - honest, no promise.
- Never "credits", never a money glyph, never a plan/tier name.

## The number
GET /api/credits/summary?role=job_seeker -> totalAvailable, via the existing useCreditBalance hook. Hook, query key, endpoint and ledger semantics stay UNCHANGED. This element shows ONLY remaining allowance. Completed referrals and referrer impact stats keep living on their own surfaces; the three numbers are never merged or co-located.

## Role behavior (D-222 (2), reconciling D-055)
- Every signed-in shell route shows the count, including /queue, /referrer-home, /verify, /post-opportunity: AppShell.tsx stops passing `!onReferrerSurface` as the hook's enabled condition (the role=job_seeker query is correct as-is; same account, person-owned balance).
- On REFERRER surfaces the element is PLAIN TEXT: not a link, no path to /plans, no purchase affordance (D-055 core untouched: never paid, never charged, no plan/pricing surface).
- On seeker surfaces it may keep today's quiet link to referral/plan details, aria-label "N referrals left. See referral details."
- Signed-out renders nothing, as today.

## States (DOCTRINE.md benefit bar, D-153 honest status)
- loading: existing skeleton bar, aria-busy.
- error: "Balance didn't load" + ghost Retry (existing pattern) - never a false zero.
- ready: "N referrals left"; zero: "0 referrals left".

## Tests (red-first, same PR)
appShell.test.tsx pins: count renders on a seeker route AND on each referrer matcher route (/queue, /referrer-home, /verify, /post-opportunity); plain non-linked on referrer routes (no href, no /plans path); zero renders "0 referrals left"; error renders the didn't-load + retry state; signed-out renders nothing; the noun is "referrals" (no "credit(s)" in the element).

## Captures (viewport-true, both widths)
1280x900 and 390x844@2x viewport-true (not full-page stitches): ready state on a seeker route and on /verify (referrer context, plain text, no link); zero; error/retry; plus a scroll pass showing the bar stays put. Commit under design/goal-ui/captures/shell/.

## Review
Tier 1: one independent D-151 review (non-builder, non-fixer of this delta) covering code + captures; the designer does a bounded re-review of the captures at the fix head. Reviewer never merges; the coordinator lands after green required CI (typecheck, unit + component + route tests, production build) plus both passes.

## Out of scope
No ledger, hook, endpoint, plan, pricing, checkout or flag change. No "completed referrals" or impact numbers in this element. The legacy header wording lane (#711) and the shared-nav rename keep their own rows.
