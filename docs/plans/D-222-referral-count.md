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

## Status

- D-222-referral-count-shell: implementation checkpoint — Codex GPT-6 · 2295 takeover — 2026-11-17 — branch `agent/queue/d222-referral-count`. Read receipt: current main `cec3f143`, BRIEF, PRD, AGENTS, BUILD_CONTINUITY, collaboration rules, DESIGN, money test runbook, D-222 and register through D-356; current main integrated in `415f60c1`. Prior outcome preserved: Claude Code · 64db's red-first tests `7f4ae4f5` and claim/status; no prior implementation or PR. Reproduced 10 failed / 9 passed on that source. The count now reads the same person-owned hook on every signed-in route; a `referralCountLinked` prop defaults to today's seeker link, while AppShell passes false on the referrer matcher. Referrer ready/zero are text only, no plan path or icon; phone text retains the unit and an accessible “left”; seeker linkage/wording remains as landed in D-344. Loading uses the existing busy skeleton, error retains the real retry, signed-out stays absent. Header sticks at top while scrolling. One duplicate mobile account-menu bell is hidden inside GoalShell so the existing top-bar alerts control, account menu, beta badge and count fit at 390; desktop menu unchanged. No hook, query key, endpoint, ledger, price, flag, schema or dependency change (L6: clear remaining allowance without a purchase prompt in referrer context).
  - Focused checks: AppShell/composites/harness 51/51; expanded AppShell/composites/balance-hook/code-required/focus-clearance 57/57. Typecheck, production build, token audit, migration lint, deploy-trigger and scope checks passed. No test skipped or loosened: the two old hide assertions are ported to the owner-approved visible/nonlinked assertions; all earlier navigation, auth and error checks remain.
  - Before captures `/tmp/skipwait-d222-before/` pair `/verify` with the absent count and seeker money icon; header y goes 0 -> -600 after scroll. First after captures caught 26px referrer-ready / 52px error phone overflow; fixed within GoalShell by removing the duplicate phone bell and stacking compact error text/retry. Final built-preview `/tmp/skipwait-d222-after2/manifest.json`: 10 state/viewport records, ready seeker/referrer, referrer zero, both errors and four successful retry recoveries; all have 0 horizontal overflow and 0 page errors; header y stays 0 after scroll at 1280 and 390. Viewport PNGs (not full-page stitches) inspected and retained under `design/goal-ui/captures/shell/d222/` with the manifest. Synthetic data only, no real request, payment or email sent.
  - Remaining before acceptance: required full-suite CI on the exact final head, independent review of source and captures by another session, then protected landing and exact-release verification. No production release or full-gate pass claimed at this checkpoint.
