// D-048-R-admin-money capture-only fixture (docs/plans/D-048-phase-3-split.md, "Admin-money capture unblock
// contract", D-200, Nov 21): the release-capture harness has no Chargebee test site, so the real
// GET /api/admin/billing/catalog-sync answers 502 there. This deterministic TEST-environment dry-run plan is
// served for that one GET, on that one capture route, so the capture shows the loaded catalog plan.
//
// It is built from the real banded desired catalog (server/catalogSyncDesired.ts, D-219/D-367), so its IDs and
// prices follow the frozen price book, and it is parsed with the page's own catalogSyncDryRunSchema at import,
// so a contract change fails loudly instead of capturing a stale shape. No provider call, account or payment.
import { catalogSyncDryRunSchema, type CatalogSyncAction, type CatalogSyncDryRun } from "../shared/catalogSync";
import { desiredCatalog, excludedItemPrices } from "../server/catalogSyncDesired";

export const CATALOG_SYNC_CAPTURE_PATH = "/api/admin/billing/catalog-sync";

const termOf = (itemType: "plan" | "charge") => (itemType === "plan" ? "monthly" : "one_time") as "monthly" | "one_time";

const desired = desiredCatalog();
// The last two desired prices (the Executive referral request in INR and USD) are shown as missing, with their item.
const missing = desired.slice(-2);
const present = desired.slice(0, -2);
const toCreate: CatalogSyncAction[] = [
  { kind: "item", params: { ...missing[0].item, itemFamilyId: "skipwait_banded" } },
  ...missing.map(entry => ({ kind: "item_price" as const, params: entry.spec })),
];
const excluded = excludedItemPrices().slice(0, 3);
const extras = [{ kind: "item_price" as const, id: "skipwait_pro_monthly-INR", status: "archived", note: "Retired Pro plan (D-067): not in the banded catalog; the sync never updates, archives or deletes it." }];

export const CATALOG_SYNC_CAPTURE_PLAN: CatalogSyncDryRun = catalogSyncDryRunSchema.parse({
  version: 1,
  site: "skipwait-test",
  environment: "test",
  checkedAt: "2026-11-22T00:00:00.000Z",
  planHash: "c0ffee00".repeat(8),
  family: { id: "skipwait_banded", action: "reuse", reason: "The banded item family already exists on the test site." },
  toCreate,
  correct: present.map(entry => ({ itemPriceId: entry.spec.id, currencyCode: entry.spec.currencyCode, price: entry.spec.price, term: termOf(entry.spec.itemType) })),
  mismatched: [],
  blocked: [],
  extras,
  excluded,
  counts: {
    desired: desired.length,
    correct: present.length,
    mismatched: 0,
    blocked: 0,
    toCreate: toCreate.length,
    itemPricesToCreate: missing.length,
    extras: extras.length,
    excluded: excluded.length,
  },
});
