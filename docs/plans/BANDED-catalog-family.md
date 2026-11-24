# BANDED-catalog-family: the reviewed catalog sync can provision a site whose legacy items sit in other product families (D-387)

Tier 1 · lane `banded-catalog-family` · branch `agent/queue/banded-catalog-family` · epic BANDED-release

## The defect

`chooseFamily` in `server/catalogSyncPlan.ts` collects the product family of **every** SkipWait
item and item price, archived ones included. On the Chargebee TEST site (`skipwait-test`) they span
`skipwait_credits`, `skipwait_plans` and `skipwait_topups`, so the plan is `blocked` and the apply
refuses all 14 banded prices (run 45287747237, `docs/qa/banded-release-qa.md` §2b). The legacy
credit packs were archived by the owner (D-214 (3)), so they can never be sold again and should not
decide where new prices go. The probe run 45361686115 (Nov 24) also found that the TEST site has no
item price `skipwait_early_to_mid_monthly-USD`: the banded prices there carry older ids.

## The fix (decide against the real catalog, fail closed)

1. **Read the TEST catalog first.** Use the existing read-only paths (the admin catalog-sync dry
   run or `scripts/bandedTestCardQa.ts probe`, which already holds `QA_CHARGEBEE_TEST_API_KEY` in
   GitHub Actions) and record in this packet, by id, status and family only, which SkipWait objects
   are active and which archived. No key, customer or payment data is recorded. Never use a key
   pasted into chat or a session credential (D-387 (5)).
2. `chooseFamily` ignores archived items and archived item prices when it collects families.
3. If the active SkipWait objects still span more than one family, the plan stays `blocked`, exactly
   as today, and the reason names each family with its active ids, so the owner sees what to resolve.
   No per-type guessing unless step 1 shows it is needed; if it is, stop and report with the data.
4. Unchanged: create-only apply (D-069), never update, archive or delete; the `planHash` re-check;
   dry run first; the apply stays owner-only, typed site name.
5. If step 1 shows the TEST site's banded prices exist under older ids, record the exact mapping
   and stop for the owner's ruling (create the app ids alongside, or retire the old ones by hand):
   that is a provider-state decision, not this code change.

## Tests (red first)

`server/catalogSyncPlan.test.ts`: archived items in another family no longer block (reuse the active
family); archived item prices likewise; two active families still block with a reason naming both;
no SkipWait objects still creates `skipwait`; fixtures in `server/catalogSyncFixtures.ts`.

## Acceptance

Focused catalog-sync suites (`catalogSyncPlan`, `catalogSyncApply`, `catalogSyncContract`,
`adminCatalogSyncRoutes`) and `pnpm check` green; required CI green. Then a TEST-site dry run linked
in the Status section showing 14 prices planned or the exact remaining refusal.

## Coordination

`BANDED-release` (held by Qoder · 4e6f on `agent/queue/banded-release-activation`) is the consumer.
This row does not change that row's owns or acceptance. Read its branch before building and keep
both changes when merging.

## Status

- BANDED-catalog-family: in progress — Claude Code · 075d — 2026-11-24 — branch agent/queue/banded-catalog-family
