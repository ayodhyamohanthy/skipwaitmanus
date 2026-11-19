# Existing D-180: isolated referral-copy preparation

## Purpose and evidence
The current shared money-copy footer and kit/goal email-gallery labels still expose "credits" and "asks" to people. The original authenticated owner messages Oct23/24 require referral-only public nouns. This bounded preparation is a split of the already-decided D-180 wording work under the Nov9 instruction to use many independent builders. It is not a new pricing, release or behavior decision. It helps seekers understand what they can request without mistaking an accepted request for a completed referral.

Originals personally recovered by the coordinator: phonemsg-01M5MXXXXCF1Z6SSY4F2420XB9 ("Just say 3 free referrals"), phonemsg-01M5MXYDWXDCYCV39DP8VHYCWV ("Use term referrals get rid of credits"), phonemsg-01M5MY021FHBE9CCBP9YVNCAEQ ("dont use word credits"), phonemsg-01M5NCM1K63RW8RRWFCQ4PBT05 ("just use referral term only"). The repository does not authenticate these instructions. Check newer owner decisions and actual current catalog before choosing wording.

## Existing work and safe parallel start
Fetch all current refs and inspect existing pricing and D-180 sweep branches, actual current main and reports. Preserve their hunks and any reported unpublished state. Do not take over or rewrite another branch. Use the actual available picker offer and actual session identity, or explicitly report isolated PREP if registration is still under review. No fabricated claim or automatic status cleanup. Do not duplicate R7 eb38's GoalEmails work.

The parent D-180-referral-words row keeps its history and remaining dependencies. This preparation does not need those unrelated outputs merely to draft/test presentation-only hunks. At integration, compare the actual combined current catalog/money behavior again. If a hunk depends on a future behavior change, leave it unchanged and report it rather than promise future behavior or wait the whole preparation task.

## Exact manual allowlist
- shared/moneyCopy.ts: public presentation strings only. Keep exports/internal identifiers and all amounts, charges, card requirements, accounting semantics, timing, expiration and recovery behavior unchanged. Use the actual current catalog-derived allowance, never hardcode a new amount or imply inactive plans are sold.
- shared/moneyCopy.test.ts, shared/moneyCopy.item7.test.ts, server/moneyCopy.test.ts: direct wording pins needed for those presentation replacements only. Keep assertion count, behavior/amount/negative controls and all unrelated cases. Do not delete, skip, focus or relax assertions.
- client/src/pages/Emails.tsx: local template display names and public presentation nouns only. Preserve actual verified sender subject/body quotes and stage/trigger meaning. Do not edit server senders to fit a gallery. Flag a contradictory sender contract precisely.
- NEW scripts/referralCopyPrep.test.ts: red-first regression coverage of public terminology and unchanged catalog/behavior-sensitive facts, including accepted-not-completed and referrer-not-paid boundaries.
- design/goal-ui/captures/referral-copy-prep/**: sanitized actual local evidence and manifest, explicit synthetic/auth simulation labels.
- This packet Status only.

No owns is declared because existing pricing/sweep rows retain active overlapping shared-path history. This is not blanket scope: scope-check skipped means skipped, NOT pass. Review the exact file/hunk allowlist manually and report it. A new source, test or semantic edit outside this list needs a bounded correction through Instinct first.

## Red-first and proof
1. Reproduce current forbidden public nouns in the new test before changing source. Do not globally ban internal code identifiers or change the actual unit/transaction model.
2. Make the minimal presentation correction. Wording must state actual cost and eligibility honestly, not silently turn one internal unit into a guaranteed completed referral or invent a purchasable offer.
3. Run direct shared/server money-copy tests, current catalog/charge/card/refund regression tests, typecheck, token audit and applicable build. Capture actual output and exact head. Existing test behavior controls remain.
4. Inspect kit /emails at 1280 and 390. Final R7 composition consumes the shared-copy output and must rerender its own goal captures; current old captures are not proof of the new state.
5. Before integration, normally compose current main, preserve pricing/sweep outputs, run combined behavior-sensitive checks and get one qualified independent final-version review and required CI. Never bypass protection or weaken tests. The coordinator's routine merges retain their separate-review condition.

No flags, prices, plan availability, actual money flows, card requirements, expiration, legal text, API/auth, sender behavior or production mutation is authorized. Completion means reviewed presentation preparation landed, not R7 activation or every user flow verified.

## Status
Registered bounded isolated preparation (PR #1078 merged at `69627919`).

Prepared on `agent/d180prep/d1b4-referral-copy` (`Qoder · d1b4`, claim
`f9121732`): the allowlisted presentation hunks in `shared/moneyCopy.ts` and
`client/src/pages/Emails.tsx`, their direct wording pins, the red-first
`scripts/referralCopyPrep.test.ts` (red at `3 failed | 6 passed (9)`, green at
`9 passed`), before/after `/emails` captures at 1280 and 390, `pnpm check` and
the token audit. Evidence and the exact wording: `design/goal-ui/captures/referral-copy-prep/manifest.md`.

Open blocker, reported not worked around: 41 assertions in 12 files outside the
allowlist still pin the old nouns (`ask.costQuote.test.tsx` 20,
`home.world.test.tsx` 4, `explore.test.tsx` 3, `exploreDrawer.test.tsx` 3,
`policyPages.test.tsx` 3, `ask.test.tsx` 2, plus one each in
`GoalLanding.test.tsx`, `emails.test.tsx`, `systemGalleries.test.tsx`,
`home.mobileNav.test.tsx`, `planCatalog.test.ts` and `threadModel.test.ts`).
They need a bounded correction through Instinct or an allowlist amendment
before this copy can land. Pricing-dependent strings are left unchanged and
reported in the manifest.

No independent review, landing, capture acceptance or live release is claimed
by this document.
Registered bounded isolated preparation. No implementation, test result, capture acceptance or live release is claimed by this document.

## Nov 9 direct wording-pin correction (16:28 IST)
Actual isolated preparation `21f2e0dfeadc22dd92e31213e47d469feac46934` reproduces the forbidden public nouns: the new regression has 3 failures and 6 passing controls in an independent normal Vitest run. The first preparation correctly did not rewrite existing out-of-scope assertions. The implementation must now continue in parallel, not wait for every historical carrier.

Additional manual test allowlist, ONLY literal expected display text directly changed by the already-allowed shared functions or kit gallery labels:
- `client/src/pages/policyPages.test.tsx`: the `CREDIT_RULE` returned-text excerpts only (including the visibility charge and withdrawal-before-pickup excerpts). No Terms, Privacy, policy dates, consent or unrelated legal expectations.
- `client/src/pages/explore/ask.costQuote.test.tsx`: expected cost-line wording returned by `askCostLine` only. Preserve all flag-on/off cases, pending/failed pricing, coverage flips, numeric costs/balances/shortfalls, top-up links, POST bodies and no-fetch/no-send assertions. A shared function changes both callers; an inactive pricing branch is not permission to change its arithmetic or behavior.
- `client/src/pages/exploreDrawer.test.tsx`, `client/src/pages/explore.test.tsx` and `client/src/pages/ask.test.tsx`: direct expected returned cost-line text only. Do not rewrite the independently hardcoded queue, refund, send-action or coverage paragraphs.
- `client/src/pages/adminApprovalRecord.test.tsx` and `client/src/pages/adminApprovalQueue.test.tsx`: literal reserved-phrase output only, preserving the monthly qualifier and request metadata.
- `client/src/pages/GoalLanding.test.tsx`: the returned flat `askCostLanding` phrases only, including its step/fair-rule assertions. No GoalLanding runtime edit.
- `client/src/components/thread/threadModel.test.ts`: only the `creditUsedPhrase(false)` substring in the waiting-for-coverage expected sentence. Preserve the surrounding current hardcoded text, employee, wait state and other cases. `threadModel.ts` remains read-only and its remaining public nouns are a separately reported sweep gap.
- `client/src/pages/emails.test.tsx` and `client/src/pages/systemGalleries.test.tsx`: the two local accepted/passed selector names and their directly changed kit stage/trigger nouns only. Keep every template, button/article relationship, selected-state assertion and exact matching strength.

- For the unchanged-semantics shared footer/allowance replacement only: the exact literal chip, `ASK_COST_SENTENCE`, `MONEY_SENTENCE` or `MONEY_SENTENCE_SHORT` substrings in `client/src/components/plans/planCatalog.test.ts`, `client/src/pages/PlansV2.test.tsx`, `client/src/pages/home.mobileNav.test.tsx`, `client/src/pages/home.world.test.tsx`, plus the footer/metadata assertions in the already-listed `explore.test.tsx` and `policyPages.test.tsx`. Preserve all surrounding claims, no-paid-priority text, referrer-unpaid text, monthly amount and negative-visibility controls. Some of these pins are already changed by the existing chip carrier: preserve that work, then update only the remaining changed tail. This grants no plan availability, catalog, page runtime or legal-source edit.

Keep every existing test and assertion, all numeric and flag/negative controls, and full-string strength. No skip/focus/expected-failure wrapper, regex broadening, deletion or dynamic import of the production string to replace an independent literal pin. A line number is a locator, not permission to rewrite a whole test. Run each affected suite together with the original shared/server, new regression and catalog/charge/refund/card checks. This is a direct wording-pin correction, not additional runtime scope or a behavior, legal or pricing change. Existing external branches and unpublished hunks remain preserved; coordinator owns combined integration.

The existing chip branch `agent/copy/free-asks-chip-terminology` at `12157a9e7c0771be12685a0121bbeb597ffe5e64` already carries that bounded hunk. Consume/preserve it by normal forward composition rather than reimplementing or overwriting it. Do not claim the chip work as a new implementation.

The live source on main `6962791957126ffdd21d65698a7564b7dfd33ab7` has `FREE_PLAN.creditsPerMonth = 3`, `CREDIT_PACKS_ON_SALE = true`, `PASS_SALES_ENABLED = false`, and a flat default cost of one internal unit. Public referral-only nouns do not by themselves change those facts. The old `extra asks use credits` tail must not be declared pricing-dependent merely because it contains the old nouns. Replace it only with a truthful presentation of the same current allowance/usage, with no claim that an accepted request is a completed or guaranteed referral, and no claim that paused passes are sold. Existing paid-plan, charge/card/expiration and legal behavior restrictions stand. Leave any genuinely unresolved offer wording explicitly incomplete and report its exact source conflict; do not block independent local-label/cost-line development on it.


17:10 integration: preceding worker out-of-scope pin blocker is historical; the landed1079 exact-literal correction above now applies. Normal current-main composition preserves runtime0281201d and all status evidence. No acceptance inferred from this composition.

17:14 bounded contradictory-negative correction: policyPages Guidelines originally banned every occurrence of "free referrals", including the independently pinned, catalog-grounded "3 free referrals every month" required by the owner. Preserve the no-blanket-free/no-guarantee purpose by excluding ONLY the exact independently literal complete current allowance/cost/unpaid sentence, asserting catalog allowance3 and exactly one rendered occurrence, then applying the negative regex everywhere else. Additional real controls must reject a free promise, unlimited free referrals and a guaranteed referral outside that exact sentence. No production constant is its own oracle. No legal runtime source is edited. PlansV2's hardcoded inactive pricing allowance remains unchanged and explicitly outside this completed shared-copy scope. Admin-only reservation wording retains independent unchanged-fact controls; the shared full/short footers gain independent forbidden-public-noun pins. All numeric/flag/refund/charge/card semantics stay unchanged.


### Exact composed SEO followthrough (Nov9 17:27 IST)
Actual final85b full CI found two real dependent defects outside the focused226: server/appTitle static-description equality and prerender home description174>160. The shared longer truthful footer expanded LANDING_SUMMARY. Corrected only the summary lead to "Verified employees privately decide whether to refer you." and synced the three existing description/og/twitter shell attributes to the same155-character summary. Current allowance, cost, referrer non-payment, private employee choice and frozen160 bound preserved; neither failing test weakened. This narrowly adds shared/landingContent.ts (summary lead only) and client/index.html (three dependent description attributes only) to the already direct-dependent copy repair. Chipcarrier12157's historical index hunk is acknowledged, but obsolete extra-asks credits tail not imported. Actual23testsPASS for both previously failing suites. No title, JSON-LD, catalog, money behavior or legal text edit.


### Qualified review findings correction (Nov9 17:38 IST)
Actual Kimi636d static review returned FAIL on45756 (same D180delta as263a), not a PASS. The numeric cost wrongly called the balance debit a submitted referral request; corrected to amounts used/deducted from the balance, while keeping the submitted referral request as the object. Refund copy now names the charge refund, not the request coming back. Re-read actual server/db.ts refundLedgerSpendTx2360-2405: purchased balance returns; same-cycle allowance is capped; promo/grant require active/exhausted, unexpired and capacity; expired/revoked/ended buckets record0. Copy now explicitly requires the original balance/allowance not expired, ended or revoked and room for refund, including reopen conditional copy. No ledger implementation, amount, timer, eligibility, catalog, price, legal or flag change. Direct literal pins updated without changing behavioral assertions; new independent negative guards reject request-as-unit/refund conflation. Actual25suites256PASS before final reopen-clause literal correction; same qualified review remains open on corrected head. No override of referral-only terminology; legacy levelCost/admin/V2 gaps remain explicit.


### Direct end-to-end cost selector followthrough (Nov9 17:42 IST)
Exact b291 actual CI e2e had2FAIL/5PASS: cost-before-Send and withdrawal both stopped at e2e/fixtures.ts:167 costLine regex requiring retired credit/referral unit immediately after amount. The truthful new display says Uses N from your balance. This direct dependent expectation repair adds only that exact grounded phrase locator and its comment; quotedCost positive-number, pre-Send ordering, no-send, actual withdrawal/balance and every journey assertion remain unchanged. No timeout, test omission, retry, identity, database or runtime change. Final exact CI must rerun; static selector check is not a real browser/database journey pass.
