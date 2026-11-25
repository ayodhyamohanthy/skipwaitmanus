# Post-merge review findings — Oct 22 audit

This review covers PRs [#465](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/465), [#478](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/478), [#534](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/534), [#535](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/535), [#506](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/506), [#517](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/517), [#482](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/482), [#490](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/490), [#479](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/479), and [#510](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/510), against their merged changes and current `main`.

## Follow-up status (re-checked against `main` on 2026-10-28)

All four findings are fixed on `main` by row `POSTMERGE-oct22-fixes`, each with a regression test that fails without the fix. No finding here is open, nothing is waiting on a code change, and no further fix row is needed from this audit.

| Finding | Fix on `main` | Regression test |
|---|---|---|
| P1 #482, a held ask repriced across an activation | `821399d4`, delivery charges the stored row or the flat one-credit price (`server/db.ts`) | `server/db.askCostStored.test.ts:366` |
| P2 #478, no test proves the live catalog price reaches the page | `09891b3b` | `client/src/pages/plans.kit.test.tsx:90` |
| P2 #534, pack-price copy duplicates the catalog | `91e0b6c8`, copy composed through `firstPackClaim()` in `shared/planCatalog.ts` | `client/src/pages/policyPages.test.tsx` |
| P2 #506, the stale-checkout sample can name aged-out rows | `01928e67` + `5ff7ef2c` | `server/dailyMoneyCheck.test.ts:569` |

## Findings as found (each one now fixed)

### P1 — #482: a held ask can be repriced when `ASK_LEVEL_COST` is enabled

The feature-off path creates a waiting ask without an `askCosts` row; migration 0106 explicitly says that rows are written only while the flag is on and that the flag-off price is one credit. At first delivery, however, a request without a stored row falls back to `askCreditCost()`, which reads the *current* flag and classifies the current job row. A waiting ask created for one credit while the flag was off can therefore cost more than one credit if it first reaches a referrer after the flag is switched on. This is an activation-time money risk, not a charge on the currently flag-off path. The relevant code is [`server/db.ts` at creation](https://github.com/ayodhyamohanthy/skipwaitmanus/blob/02a8a0281113d54300591d96511b540c8a9767b9/server/db.ts#L1967-L1981), [`server/db.ts` at delivery](https://github.com/ayodhyamohanthy/skipwaitmanus/blob/02a8a0281113d54300591d96511b540c8a9767b9/server/db.ts#L2715-L2722), the current-flag helper in [`server/db.ts`](https://github.com/ayodhyamohanthy/skipwaitmanus/blob/02a8a0281113d54300591d96511b540c8a9767b9/server/db.ts#L4073-L4082), and the intent recorded in [`0106_ask_costs.sql`](https://github.com/ayodhyamohanthy/skipwaitmanus/blob/02a8a0281113d54300591d96511b540c8a9767b9/drizzle/deploy/0106_ask_costs.sql#L1-L14).

The added tests cover flag-off creation and flag-on creation/replay, but not an ask that waits across a flag change (`server/db.askCostStored.test.ts`). Before enabling level pricing, preserve the creation-time flat price for missing-row legacy asks (or snapshot the pricing mode for waiting asks) and add a regression test that creates a waiting ask with the flag off, turns it on, then delivers it without repricing. The plan currently records the D-132 feature flags as off, so this should be fixed before activation.

**Fixed on `main` (`821399d4`).** Delivery now charges the stored `askCosts` row when one exists and the flat one-credit price when none does, so an ask that waited across the activation is never reclassified against the flag as it stands at delivery. The regression test creates a waiting ask with the flag off, turns the flag on, delivers it, and asserts one credit (`server/db.askCostStored.test.ts:366`).

### P2 — #478: UI tests no longer verify that a live catalog price is displayed

The PR replaced assertions for the displayed `$1 a credit` / `₹99 a credit` and price-strip values with generic `Credits` / `Packs` fallback assertions. This remains in `client/src/pages/plans.kit.test.tsx:67,72`, `client/src/pages/plans.paymentRecovery.test.tsx:60`, and `client/src/pages/plans.paymentRoute.test.tsx:31,38,52,55`. The added `creditFrom()` unit test checks price-range calculation, but no component test verifies that loaded catalog prices reach the price badge and cost strip. A missing or incorrect page-level price can therefore pass these tests. Add rendered-page tests with successful USD and INR catalog responses, asserting the displayed catalog-derived range; keep a separate test for the no-catalog fallback.

**Fixed on `main` (`09891b3b`).** `client/src/pages/plans.kit.test.tsx:90` renders the page against a real catalog response for both USD and INR, asserts the catalog-derived per-credit range in the price badge and the cost strip, and keeps the no-catalog fallback as its own case.

### P2 — #534: public pack-price copy duplicates the catalog values

The user-facing text hard-codes the first-pack claims (`₹99 for 2 credits in India` and `$5 for 5 credits elsewhere`) in `client/src/pages/Pricing.tsx:23` and `shared/landingContent.ts:94`. The canonical current pack values live in `shared/planCatalog.ts:146-160`; the pricing guide says pack prices are derived from the catalog (`docs/PRICING.md:37`). The current literals match the first packs, but a later catalog change could leave the landing and pricing copy stale. `client/src/pages/policyPages.test.tsx:127-128` asserts those same literals rather than tying them to the catalog. Compose the copy from the shared catalog or a helper backed by it, then test the rendered values against that source.

**Fixed on `main` (`91e0b6c8`).** `firstPackClaim()` in `shared/planCatalog.ts` composes the claim from the catalog packs, and both `client/src/pages/Pricing.tsx` and `shared/landingContent.ts` read it instead of holding literals, so a catalog change moves the copy with it.

### P2 — #506: the stale-checkout sample can include aged-out checkouts

The stale summary covers pending checkouts older than one day but younger than seven days, using both `staleCutoff` and `agedOutCutoff`. Its sample query currently receives only `staleCutoff`, so it can return older-than-seven-day checkout IDs whose provider status is unverified under the separate aged-out rule. This can make the “stale checkouts” line name examples outside its stated window. Add the same seven-day lower bound to the sample query and a regression test with one 1–7-day row and one older-than-seven-day row; assert the aged-out ID is absent. Relevant code: [`server/dailyMoneyCheck.ts`](https://github.com/ayodhyamohanthy/skipwaitmanus/blob/main/server/dailyMoneyCheck.ts#L459-L473).

**Fixed on `main` (`01928e67`, `5ff7ef2c`).** The sample query receives `agedOutCutoff` as its lower bound, and `server/dailyMoneyCheck.test.ts:569` runs the real query over an in-memory database with one in-window row and one aged-out row and asserts the aged-out ID is absent.

## Resolved items and clean reviews

- **#534 accidental deletion — resolved by #535.** Merge #534 deleted `drizzle/0000_bouncy_victor_mancha.sql`; #535 restored it byte-for-byte. The migration is present on current `main`, so no deletion fix remains.
- **#478 stale `₹99` floor claim — corrected on current `main`.** The merged PR temporarily showed “same ₹99 floor” on the retired single-credit `/premium` page. A later change removed that claim; it is not present on the current page and needs no separate fix row.
- **No additional findings:** #465 (API input checks), #517 (money-check reconciliation), #490 (seeker-level migration and flag-gated UI), #479 (admin sign-in return path), #510 (plan display names), and #535 (migration restoration). The migration review found 0106/0107 additive and idempotent, mirrored in schema reconciliation, and listed in the migration plan. No reviewed PR deleted tests; the #478 assertion reductions above are the test-coverage exception.

## Validation note

The audit itself (Oct 22-24) ran in a worktree with no local `node_modules/.bin/vitest`, so a complete local suite was not available then. The review compared each exact merged diff with its first parent and checked the resulting code and tests; required CI on the findings pull request was the gate. No production database or checkout was accessed.

The follow-up status above was re-checked on 2026-10-28 by reading each fix commit and its regression test on `main`, and by running the four named test files against `main` in a clean checkout. This pull request changes documentation only, so required CI is the gate for it.
