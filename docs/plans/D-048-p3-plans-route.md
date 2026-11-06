# D-048-p3-plans-route: goal-focused UI/UX repair of `/plans` (frozen banded content preserved exactly)

Status: **architect** (D-109). This row is registered only. Nothing is built here. Registered by Hark · 5de4 on 2026-11-06, at the coordinator's request (16:00 IST), through the normal FIFO and review queue (D-200 (2)).

## 1. Why this row exists

`D-048-p3-plans` (done) carries the note "The plans id is /billing only; no legacy /plans re-skin." It entered the registry as session-written routing in registry commit `28e10546` (Oct 26). It is not an owner freeze.

The coordinator resolved the "failure-9" doctrine question on Nov 6 from owner originals. Hark has not read these originals itself; the IDs below are as the coordinator relayed them.

- **Owner freeze, Oct 25.** It covers pricing, plans and referrals *content* only (`phonemsg-01M5SNVZEY1P8K169J48T2HGTJ`, `phonemsg-01M5SNY88BXE470FEN4Z0K7KWF`).
- **Owner design mandate.** It covers the entire platform, `/plans` included.
  - Oct 22: `phonemsg-01M5HBJ8CJAJVP7M6PBA7HPDT4`, `phonemsg-01M5HBK8J1T665QJG599BNPHFB`.
  - Restated Oct 25: "Entire platform should only have goal focused design" (`phonemsg-01M5STEZ4F7S410PFJ6ASSS43Y`), "Not reskinning" (`phonemsg-01M5STFBWMKPCM7AZ2ERKZC5XS`), and "A proper goal focused ui and ux" (`phonemsg-01M5STFM8C562Z826QDRP8VGYR`).

So `/plans` is reopened for a goal-focused UI/UX repair. This is not a reskin. It is a proper goal-focused page under the D-048 contract (`docs/plans/GOAL_UI_COVERAGE.md` §1, `docs/plans/GOAL_UI_MIGRATION.md`).

## 2. Scope

- **In scope:** the page structure, hierarchy, goal line, states and interaction of the `/plans` route (`client/src/App.tsx` `<Route path="/plans">`), built with goal-native components.
- **Frozen, must be preserved exactly:** the banded pricing content of the Oct 25 owner freeze. This means every plan name, band, price, inclusion, limit, label and legal/price line, as the `PRICING-banded-oct25` row (PR #666) and its packet `docs/plans/PRICING-banded-oct25.md` define it. The repair may change how that content is laid out. It may not change its words or numbers, or add or drop any of it.
- **Out of scope:**
  - Any pricing, catalogue, checkout or routing change.
  - Any redirect. `/plans` stays `/plans`, and `/wallet` → `/plans` is unchanged.
  - Any pricing or cost flag (`VITE_PLAN_FAMILY_V2`, `PASS_SALES_ENABLED`, and the like).
  - `/billing` release work. That stays with `D-048-p3-plans` and its release path, separately.
  - Owner-only text: legal, hours, price and positive service commitments.

## 3. What the architect step must settle (before any BUILD)

1. **Which render path to repair, using separate files.** `/plans` renders `PlansV2` when `VITE_PLAN_FAMILY_V2 === "true"`, and legacy `Plans` otherwise (`client/src/App.tsx`, `client/src/lib/planFamilyFlag.ts`). Coordinator ruling (Nov 6, 16:19 IST): this row **owns separate files and keeps `dependsOn` empty**. It does not wait on the owner-held `PRICING-banded-oct25` (PR #666). Its `owns` must not include any file that row owns, among them `PlansV2.tsx`, `PlansV2.test.tsx`, `plansGoal.test.tsx`, `useGoalShellMeta.ts`, `shared/planFamily.ts`, `shared/planCatalog.ts` and `AppShell.tsx`. The frozen banded content is read from its source, never copied or edited.
2. **The `owns` list.** Goal-page files go under a new path, with goal-native components only and no runtime kit imports from goal pages. Captures go at 1280 and 390, with fixtures.
3. **The content-equality pin.** A red-first test that renders the repaired page and asserts the frozen banded content (every price, band, label and inclusion) equals the frozen source byte-for-byte. Use catalogue-derived values, not copied literals.
4. **The goal line** (GOAL_UI_COVERAGE §1 rule 1). Propose it in `GOAL_UI_MIGRATION.md`'s contract table. Its captures go to the owner (D-150).

## 4. Review and landing

Tier 1, since it is money-adjacent and in the d048-money lane. It needs an independent review by a model with no builder or fixer history on the row (D-151), and a distinct lander. It lands dark (behind `goalSurfaceOn`). It lands only as a two-parent merge, with required CI green on the exact post-sync head.
