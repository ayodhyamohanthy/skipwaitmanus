import { describe, expect, it } from "vitest";
import { catalogSyncApplyRequestSchema, catalogSyncApplyResponseSchema, catalogSyncDryRunSchema, catalogSyncErrorSchema } from "../shared/catalogSync";

const HASH = "0123456789abcdef".repeat(4);

const packSpec = { id: "skipwait_pack_25-INR", name: "skipwait_pack_25-INR", itemId: "skipwait_pack_25", itemType: "charge", pricingModel: "per_unit", price: 119900, currencyCode: "INR", externalName: "25 credits", period: null, periodUnit: null, billingCycles: null };
const planSpec = { id: "skipwait_start_90d-USD", name: "skipwait_start_90d-USD", itemId: "skipwait_start", itemType: "plan", pricingModel: "flat_fee", price: 1900, currencyCode: "USD", externalName: "Start, 90 days", period: 3, periodUnit: "month", billingCycles: 1 };

const validDryRun = () => ({
  version: 1,
  site: "skipwait",
  environment: "live",
  checkedAt: "2026-10-18T10:00:00.000Z",
  planHash: HASH,
  family: { id: "skipwait_credits", action: "reuse", reason: "Existing SkipWait prices use this product family." },
  toCreate: [
    { kind: "item", params: { id: "skipwait_pack_25", name: "skipwait_pack_25", type: "charge", itemFamilyId: "skipwait_credits", externalName: "25 credits", enabledInPortal: null } },
    { kind: "item_price", params: packSpec },
    { kind: "item_price", params: planSpec },
  ],
  correct: [{ itemPriceId: "skipwait_pack_2-INR", currencyCode: "INR", price: 9900, term: "one_time" }],
  mismatched: [{ itemPriceId: "skipwait_pack_5-USD", currencyCode: "USD", price: 500, term: "one_time", diffs: [{ field: "pricing_model", expected: "per_unit", actual: "flat_fee" }], sellableNow: true }],
  blocked: [{ itemPriceId: "skipwait_land_focus_30d-INR", currencyCode: "INR", price: 599900, term: "30d", reason: "Another price on skipwait_land_focus already sells INR every 1 month." }],
  extras: [{ kind: "item_price", id: "skipwait_token_1-INR", status: "active", note: "Legacy single-credit price (D-036); left alone." }],
  excluded: [{ itemPriceId: "skipwait_land_concierge_30d-INR", reason: "Land Concierge is sold by application." }],
  counts: { desired: 26, correct: 1, mismatched: 1, blocked: 1, toCreate: 3, itemPricesToCreate: 2, extras: 1, excluded: 1 },
});

const validReport = () => ({
  outcome: "partial",
  site: "skipwait",
  environment: "live",
  planHash: HASH,
  created: [{ kind: "item_price", id: "skipwait_pack_25-INR", diffs: [] }],
  failed: { kind: "item_price", id: "skipwait_start_90d-USD", httpStatus: 400, apiErrorCode: "invalid_request", errorCode: "param_wrong_value", message: "Billing frequency is not configured" },
  notAttempted: [{ kind: "item_price", id: "skipwait_momentum_90d-USD" }],
  stoppedReason: "provider_error",
});

describe("catalog sync contracts", () => {
  it("accept valid dry-run, apply request and apply report examples", () => {
    expect(catalogSyncDryRunSchema.safeParse(validDryRun()).success).toBe(true);
    expect(catalogSyncApplyRequestSchema.safeParse({ planHash: HASH, confirmSite: "skipwait" }).success).toBe(true);
    expect(catalogSyncApplyResponseSchema.safeParse(validReport()).success).toBe(true);
    expect(catalogSyncApplyResponseSchema.safeParse({ outcome: "nothing_to_do", site: "skipwait", environment: "live", planHash: HASH, created: [], failed: null, notAttempted: [], stoppedReason: null }).success).toBe(true);
    expect(catalogSyncErrorSchema.safeParse({ error: "The Chargebee catalog changed.", code: "stale_plan", currentHash: HASH }).success).toBe(true);
  });

  it("reject unknown fields at every level", () => {
    expect(catalogSyncDryRunSchema.safeParse({ ...validDryRun(), extra: true }).success).toBe(false);
    const nested = validDryRun();
    expect(catalogSyncDryRunSchema.safeParse({ ...nested, family: { ...nested.family, note: "x" } }).success).toBe(false);
    expect(catalogSyncDryRunSchema.safeParse({ ...nested, toCreate: [{ kind: "item_price", params: { ...packSpec, is_taxable: false } }] }).success).toBe(false);
    expect(catalogSyncApplyRequestSchema.safeParse({ planHash: HASH, confirmSite: "skipwait", force: true }).success).toBe(false);
    expect(catalogSyncApplyResponseSchema.safeParse({ ...validReport(), extra: 1 }).success).toBe(false);
  });

  it("reject a non-hex, short or uppercase planHash and an empty confirmSite", () => {
    for (const planHash of ["abc", HASH.slice(1), HASH.toUpperCase(), `${HASH.slice(0, 63)}g`]) {
      expect(catalogSyncApplyRequestSchema.safeParse({ planHash, confirmSite: "skipwait" }).success).toBe(false);
      expect(catalogSyncDryRunSchema.safeParse({ ...validDryRun(), planHash }).success).toBe(false);
    }
    expect(catalogSyncApplyRequestSchema.safeParse({ planHash: HASH, confirmSite: "" }).success).toBe(false);
    expect(catalogSyncApplyRequestSchema.safeParse({ planHash: HASH }).success).toBe(false);
  });

  it("reject an unknown outcome and a report whose outcome and stop reason disagree", () => {
    expect(catalogSyncApplyResponseSchema.safeParse({ ...validReport(), outcome: "ok" }).success).toBe(false);
    expect(catalogSyncApplyResponseSchema.safeParse({ ...validReport(), outcome: "applied" }).success).toBe(false);
    expect(catalogSyncApplyResponseSchema.safeParse({ ...validReport(), failed: null }).success).toBe(false);
    expect(catalogSyncApplyResponseSchema.safeParse({ ...validReport(), stoppedReason: "time_budget" }).success).toBe(false);
    expect(catalogSyncApplyResponseSchema.safeParse({ ...validReport(), created: [] , outcome: "partial" }).success).toBe(false);
  });

  it("reject a charge price with a billing period and a plan price without one", () => {
    const withPeriod = { ...packSpec, period: 1, periodUnit: "month" };
    const withoutPeriod = { ...planSpec, period: null, periodUnit: null };
    expect(catalogSyncDryRunSchema.safeParse({ ...validDryRun(), toCreate: [{ kind: "item_price", params: withPeriod }] }).success).toBe(false);
    expect(catalogSyncDryRunSchema.safeParse({ ...validDryRun(), toCreate: [{ kind: "item_price", params: withoutPeriod }] }).success).toBe(false);
    expect(catalogSyncDryRunSchema.safeParse({ ...validDryRun(), toCreate: [{ kind: "item_price", params: { ...packSpec, pricingModel: "flat_fee" } }] }).success).toBe(false);
  });

  it("reject ids Chargebee would refuse: spaces, slashes, over-long ids", () => {
    for (const id of ["skipwait pack", "skipwait/pack", "x".repeat(101)]) {
      expect(catalogSyncDryRunSchema.safeParse({ ...validDryRun(), toCreate: [{ kind: "item_price", params: { ...packSpec, id, name: id } }] }).success).toBe(false);
    }
  });
});
