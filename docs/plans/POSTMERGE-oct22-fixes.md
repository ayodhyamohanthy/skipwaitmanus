# Packet POSTMERGE-oct22-fixes: the four Oct 22 post-merge findings as code fixes (D-166)

> Read `docs/BRIEF.md` first, then `docs/plans/POSTMERGE-oct22-findings.md` (the audit this fixes), then this packet. One queue row. Fix exactly these four findings; no flag changes, no workflow edits, no pricing or window design work. `POSTMERGE-oct22-review` stays docs-only ("No code change in this row"); these fixes are its follow-up rows, as the row's note requires ("findings ... become fix rows").

| Field | Value |
|---|---|
| Decisions | D-166 (the post-merge review these findings came from); findings doc lands via #619 (merged before this registration) |
| Rows | `POSTMERGE-oct22-fixes` (Tier 1, lane `audit`) |
| Verified against | `main` `196103f6` (Oct 24); finding line references are from the findings doc against `02a8a028` and `main` |

## 0. Why
The post-merge Tier 1 review of the Oct 22-23 merges (#619) found four items needing code follow-up. The review row owns only the findings doc, so the fixes could not be pushed under it (scope-check correctly rejected them). This row owns the code and test paths so the picker can assign the fixes normally.

## 1. P1 - held-ask repricing guard (#482 finding, fix before any ASK_LEVEL_COST activation)
- A waiting ask created while the level-cost flag is off has no `askCosts` row; at first delivery the code falls back to `askCreditCost()`, which reads the CURRENT flag and can reprice a one-credit ask higher after the flag switches on.
- Fix: preserve the creation-time flat price for waiting asks without a stored row (or snapshot the pricing mode at creation), in `server/db.ts` (creation ~1967-1981, delivery ~2715-2722, current-flag helper ~4073-4082; line numbers per the findings doc).
- Tests first: regression test in `server/db.askCostStored.test.ts` - create a waiting ask with the flag off, switch it on, deliver, assert no repricing. Both flags stay off; this is an activation-time guard, not a behavior change on the current path.

## 2. P2 - stale-checkout sample window (#506 finding)
- The stale summary counts pending checkouts aged 1-7 days, but the sample query receives only the upper bound and can name aged-out (>7d) rows whose provider status is separately classed unverified.
- Fix: add the same 7-day lower bound to the sample query in `server/dailyMoneyCheck.ts` (~459-473).
- Tests first: `server/dailyMoneyCheck.test.ts` - one 1-7-day row and one >7-day row; assert the aged-out ID is absent from the sample.

## 3. P2 - catalog price display tests (#478 finding)
- `plans.kit.test.tsx:67,72`, `plans.paymentRecovery.test.tsx:60` and `plans.paymentRoute.test.tsx:31,38,52,55` assert generic `Credits`/`Packs` fallbacks, so a missing or wrong live catalog price passes.
- Fix: add rendered-page tests with successful USD and INR catalog responses asserting the displayed catalog-derived range; keep a separate no-catalog fallback test. Test-only change.

## 4. P2 - pack copy composed from the catalog (#534 finding)
- `client/src/pages/Pricing.tsx:23` and `shared/landingContent.ts:94` hard-code the first-pack claims; `shared/planCatalog.ts:146-160` is the canonical source and `docs/PRICING.md:37` says pack prices derive from it.
- Fix: compose the copy from the catalog (or a helper backed by it); update `client/src/pages/policyPages.test.tsx:127-128` to assert the rendered values against that source, not the literals. Wording must stay within D-042 (never promise what the product does not do).

## Status
- POSTMERGE-oct22-fixes: review — agent/queue/postmerge-oct22-fixes — 91e0b6c8 (Tier 1: draft PR, independent review needed on the exact head; built by DeepSeek V4.1 Flash Free · eccf, 2026-10-24)

## Validation
- Required CI green on the PR head (typecheck, unit + component + route tests, production build); Tier 1 independent review on the exact head before landing (D-074, D-151). No workflow edits (`.github/workflows/ci.yml` is owned by `D-048-F-flags`). No flags enabled. Migration: none.
- Owns: `server/db.ts`, `server/db.askCostStored.test.ts`, `server/dailyMoneyCheck.ts`, `server/dailyMoneyCheck.test.ts`, `client/src/pages/plans.kit.test.tsx`, `client/src/pages/plans.paymentRecovery.test.tsx`, `client/src/pages/plans.paymentRoute.test.tsx`, `client/src/pages/Pricing.tsx`, `shared/landingContent.ts`, `shared/planCatalog.ts`, `client/src/pages/policyPages.test.tsx`.
- Order: `#619` (the findings doc) merges before this registration; then waits for `D-048-fix-post-copy` (owns `server/db.ts`) and `D-048-fix-landing-flash-snapshot-v2` (owns `shared/landingContent.ts`) so the edits never collide (PICKER-owns-scope).
