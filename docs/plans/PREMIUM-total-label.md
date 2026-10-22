# PREMIUM-total-label packet draft

## 1. Authority and registration
Owner explicitly requested the narrow Premium total-label repair on Oct22. Prepared by Kat under D-109's open-model packet permission. This draft is not a queue registration, claim, CEO ruling or P0 classification. Only Claude Code as CEO may register and order the task in assignments.json. Runtime work waits for valid origin/main registration and the picker claim. Do not merge the earlier local registration proposal 5e71cc41, which edited CEO-owned coordination files without authority.

## 2. Goal and evidence
At origin/main d5b95696, client/src/pages/Premium.tsx computes totalLabel from selected.price times quantity with currency. Footer and checkout CTA use it; the Pay callout uses money(selected.price, route), misleading a seeker buying ten credits. Make that callout show the existing totalLabel. Keep the per-credit heading unchanged. No new pricing, catalog, flag or purchase behavior is approved.

## 3. Risk and decisions
Docs draft is Tier 3. Proposed implementation is conservatively Tier 1 because it displays a payment total; independent review is mandatory. D-044 truthful offers, D-055 referrer purchase prohibition, D-036 current-currency pack retirement, D-095 one-tap sign-in, D-132/D-135 current flagged pricing and D-134 registration remain intact. CEO determines queue order and any unresolved tier/registration details, not this author.

## 4. Required reading
Read docs/BRIEF.md, docs/DELEGATION.md and docs/PAYMENTS_TEST_RUNBOOK.md. Read current Premium.tsx, existing Premium/one-tap/catalog/referrer purchase tests and their mocks before drafting regressions. Stop and report if fresh main differs from the cited behavior.

## 5. In scope
After registration only, edit client/src/pages/Premium.tsx for one expression, add client/src/pages/premium.totalLabel.test.tsx, and update this packet's Status/evidence. All coordination files, existing tests, catalog, checkout, backend, flags, styles and dependencies are read-only. No migration, secrets, provider calls, production SQL or real payment.

## 6. Implementation
First add the focused component regressions below. Run red on the unfixed parent and retain the log. Replace only the Pay callout's money(selected.price, route) with totalLabel. Run green without changing checkout payload, guards, unit-price heading, footer, CTA or quantity behavior. Commit atomic tested steps, then freeze the integrated candidate SHA and logs for independent review. No runtime/main push before the coordinating review/gate authorization for this owner-directed scope.

## 7. Regression contract
Use literal expectations, not the production formatting helper. Render synthetic unavailable-pack catalog fixtures so the existing fallback is exercised without enabling retired sales. Test USD quantity 1 as $1 USD, USD 10 as $10 USD, INR 1 as ₹99 INR and INR 10 as ₹990 INR. Assert Pay callout, footer and CTA all show the selected total. The quantity-10 amount assertions must fail before repair; quantity-1 currency suffix also changes intentionally. Assert quantity controls and currency switching update the three totals. Mock fetch and openChargebeeCheckout; pin the existing checkout body fields itemPriceId, billingCountry, role and quantity, with no client amount. Existing one-tap sign-in/cart, referrer prohibition and catalog-retirement tests stay unchanged and pass. Never contact payment providers.

## 8. Gate and review
Run pnpm check, focused tests, design-token audit, migration lint, deploy-trigger check, full vitest and build on the candidate integrated with fresh main. Independent reviewer reproduces red/green, verifies the one-expression source diff, exact literals, payload and guards, and checks mock-only 1280/390 captures for clipping. Preserve logs and candidate SHA. Use the normal draft PR/exact-commit CI process; no main landing until independent review and all documented gates pass. No runtime is approved by publication of this draft.

## 9. CEO request
Register this owner-requested narrow task through the documented process, with its packet, lane, branch, tier and ordered position. Do not alter or take over another task's claim. No additional owner permission is requested or needed for preparing this packet.

## Status
Draft only, Kat, Oct22. No runtime edits, no valid registration and no build claim. Registration request remains blocked until CEO action. This packet-only branch does not change assignments.json, the plan board or the packet index.
