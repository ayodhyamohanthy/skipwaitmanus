# PREMIUM-total-label packet draft

## 1. Authority and registration
Owner explicitly requested the narrow Premium total-label repair on Oct22. Prepared by Kat under D-109's open-model packet permission. This draft is not a queue registration, claim, CEO ruling or P0 classification. Owner Ayu explicitly authorizes the registration below because the coordinator is unavailable. Runtime work waits for this registration to land on origin/main and an eligible picker claim. Do not merge the earlier local registration proposal 5e71cc41, which edited CEO-owned coordination files without authority.

## 2. Goal and evidence
At origin/main d5b95696, client/src/pages/Premium.tsx computes totalLabel from selected.price times quantity with currency. Footer and checkout CTA use it; the Pay callout uses money(selected.price, route), misleading a seeker buying ten credits. Make that callout show the existing totalLabel. Keep the per-credit heading unchanged. No new pricing, catalog, flag or purchase behavior is approved.

## 3. Risk and decisions
Docs draft is Tier 3. Proposed implementation is conservatively Tier 1 because it displays a payment total; independent review is mandatory. D-044 truthful offers, D-055 referrer purchase prohibition, D-036 current-currency pack retirement, D-095 one-tap sign-in, D-132/D-135 current flagged pricing and D-134 registration remain intact. CEO determines queue order and any unresolved tier/registration details, not this author.

## 4. Required reading
Read docs/BRIEF.md, docs/DELEGATION.md and docs/PAYMENTS_TEST_RUNBOOK.md. Read current Premium.tsx, existing Premium/one-tap/catalog/referrer purchase tests and their mocks before drafting regressions. Stop and report if fresh main differs from the cited behavior.

## 5. In scope
After registration only, edit client/src/pages/Premium.tsx for one expression, add client/src/pages/premium.totalLabel.test.tsx, and update this packet's Status/evidence. After this owner registration, all coordination files, existing tests, catalog, checkout, backend, flags, styles and dependencies are read-only. No migration, secrets, provider calls, production SQL or real payment.

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

## Owner registration, Oct 22 (supersedes draft registration restrictions above)

registered by owner Ayu, coordinator unavailable, Oct 22. Owner explicitly registers both existing packets, PR #462 and PR #463, now because Claude coordinator timed out. This is owner authority, not a Claude/CEO attestation or P0 reclassification. The two new rows precede the unchanged existing queue, run in separate narrow lanes and have no new dependencies. Registration lands through normal review and green gates; implementation starts only after an eligible picker claim reads origin/main. No migration, SQL, provider, catalog, production or money-policy authorization is implied. Independent exact-head implementation review remains mandatory.

Status is registered in this coordination candidate, not yet landed or claimed; no runtime edit.

## Active owner-directed implementation claim
Owner standing instruction Oct 22 authorizes all repo TODO packets while coordinator unavailable, including standalone packet owner attestation without waiting for coordination landing. This supersedes this packet's earlier origin/main-registration wait only. Registered by owner Ayu, coordinator unavailable, Oct 22. Kat owner-registration session exclusively claims this Premium repair on agent/kat/premium-total-repair-oct22; no shared registry edits. Scope remains Premium.tsx one expression, premium.totalLabel.test.tsx and this packet. Plan is red-first literal currency/quantity assertions and unchanged payload/guards, then one-expression fix, focused/full gates and independent exact-head review. No production/payment calls or price change. Existing styles and React data flow unchanged; no dependency added.

Implementation evidence: one existing Pay callout now reads the already-derived totalLabel, matching footer/CTA. No style, unit-price heading, checkout, catalog, retirement or referrer guard change. New literal tests cover USD/INR quantities 1 and 10, quantity increment/decrement/input, currency toggle, exact checkout payload with no client amount, current-catalog retirement and referrer purchase guard. Red first against registration base: 5 failing total-display tests, 4 passing controls. After fix: all 25 Premium tests across 6 files pass. Typecheck passed after initial implementation. Exact-candidate full gate and independent review pending; not merged or live. Logs /tmp/owner-register-oct22/premium-red.log and premium-focused.log.

## Owner-approved route-test expectation repair

Additional allowed path: `client/src/pages/tokenRecovery.routes.test.tsx`, four stale literal Pay callout assertions only. Exact frozen a42baa59 reproduction: 2 failing route-display tests and 4 passing controls; CI likewise 2 failures, 4037 passes, 17 skips. Default quantity is 10, so callouts must assert Pay $10 USD and Pay ₹990 INR. All route, gateway, quantity, checkout and balance checks remain unchanged. No runtime or production change. Approval under Ayu standing ALL TODO authorization. New candidate requires fresh focused/full gate, CI and independent delta review. Failure logs remain in /tmp/owner-register-oct22/premium-ci-failure-whole.log and premium-route-repro.log.
