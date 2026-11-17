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

- D-222-referral-count-shell: implementation checkpoint — Codex GPT-6 · 2295 takeover — 2026-11-17 — branch `agent/queue/d222-referral-count`. Read receipt: current main `cec3f143`, BRIEF, PRD, AGENTS, BUILD_CONTINUITY, collaboration rules, DESIGN, money test runbook, D-222 and register through D-356; current main integrated in `415f60c1`. Prior outcome preserved: Claude Code · 64db's red-first tests `7f4ae4f5` and claim/status; no prior implementation or PR. Reproduced 10 failed / 9 passed on that source. The count now reads the same person-owned hook on every signed-in route; a `referralCountLinked` prop defaults to today's seeker link, while AppShell passes false on the referrer matcher. Referrer ready/zero are text only, no plan path or icon; phone text retains the unit and an accessible “left”; seeker linkage/wording remains as landed in D-344. Loading uses the existing busy skeleton, error retains the real retry, signed-out stays absent. Header sticks at top while scrolling. One duplicate mobile account-menu bell is hidden inside GoalShell so the existing top-bar alerts control, account menu, beta badge and count fit at 390; desktop menu unchanged. A second red-first mobile geometry pin expands the phone row only for the two-line retry state (72px vs the existing 56px). A code_required test pins referrer navigation and plain count during the in-session step-up. No hook, query key, endpoint, ledger, price, flag, schema or dependency change (L6: clear remaining allowance without a purchase prompt in referrer context).
  - Focused checks: AppShell/composites/harness 51/51; expanded AppShell/composites/balance-hook/code-required/focus-clearance 57/57; final five suites 57/57 plus the separate final code-required AppShell test 21/21. Typecheck, production build, token audit, migration lint, deploy-trigger and scope checks passed. No test skipped or loosened: the two old hide assertions are ported to the owner-approved visible/nonlinked assertions; all earlier navigation, auth and error checks remain.
  - Before captures `/tmp/skipwait-d222-before/` pair `/verify` with the absent count and seeker money icon; header y goes 0 -> -600 after scroll. First after captures caught 26px referrer-ready / 52px error phone overflow; fixed within GoalShell by removing the duplicate phone bell and stacking compact error text/retry. A further geometry check caught the 64px compact error group overflowing the 56px header vertically. Red-first height pin failed, then passed with the error-only 72px phone header and matching grid track (ready remains 56px). Final built-preview `/tmp/skipwait-d222-final/manifest.json`: 10 state/viewport records, ready seeker/referrer, referrer zero, both errors and four successful retry recoveries; 0 horizontal overflow, 0 page errors and every visible header control inside the viewport/header bounds; header y stays 0 after scroll at 1280 and 390. Viewport PNGs (not full-page stitches) inspected and retained under `design/goal-ui/captures/shell/d222/` with the geometry manifest. Synthetic data only, no real request, payment or email sent.
  - Draft [PR #1257](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1257), implementation `91e945e7`, mobile-error correction `8f0694ba`, and code_required regression/docs checkpoint pending. [CI 44126092793](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44126092793) passed on `8f0694ba`: exact-head typecheck, production build, E2E 8/8, unit shards, aggregate and review-gate step. Shards: 7,687 passed / 18 skipped. The actual changed paths compute Tier 2 with no Tier 1 reason (`classifyTier`/`tierReasonPaths`), so D-352 exempts this client-only delta from independent review despite the row's declared tier. The gate's generic success text says “independent passing review” even on that exemption; no review marker or GitHub review object exists, and no independent review is claimed. The advisory reviewer invocation failed before starting (unsupported sub-agent client). Fresh required CI will run for the final test/docs push.
  - Full local `pnpm quality:gate` exited 1 after 1,935 s: typecheck passed; 732 files / 7,686 tests passed, 5 files / 18 tests skipped, one failure in `server/seekerSetupRoutes.test.ts:58` (expected 400, received 404), outside owns. The chained build did not run after that failure; separate production rebuilds passed. Isolated rerun of that unchanged test passed 7/7. The full-run body was `{"userId":22}`; no task-owned test failed. No assertion was weakened. No production release claimed.
  - Final correction test-only and packet update: focused AppShell 21/21; source/capture ownership passes, diff clean. After pushing, wait for exact-head required CI; keep PR draft until its checks are green. Protected auto-merge follows D-347 (2)/D-352; exact production release verification remains pending.
