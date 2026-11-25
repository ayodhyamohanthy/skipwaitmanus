import { describe, expect, it } from "vitest";
import { resolveItemPrice } from "../shared/billingCatalog";
import { catalogSyncDryRunSchema, itemPriceSpecSchema } from "../shared/catalogSync";
import { PLAN_FAMILY, REFERRAL_LEVELS, planFeeMinor, topUpMinor } from "../shared/planFamily";
import { desiredCatalog, excludedItemPrices } from "./catalogSyncDesired";
import { providerItemPriceFor, syncedSiteState } from "./catalogSyncFixtures";
import { planCatalogSync } from "./catalogSyncPlan";

const currencies = ["INR", "USD"] as const;
const planIds = PLAN_FAMILY.flatMap(plan => currencies.map(currency => `skipwait_${plan.id}_monthly-${currency}`));
const referralIds = REFERRAL_LEVELS.flatMap(level => currencies.map(currency => `skipwait_referral_${level}-${currency}`));
const allIds = [...planIds, ...referralIds];
const dryRun = () => planCatalogSync({ desired: desiredCatalog(), excluded: excludedItemPrices(), state: syncedSiteState(), site: "skipwait-test", environment: "test", checkedAt: new Date("2026-11-20T16:00:00Z") });

describe("D-367 banded catalog generation", () => {
  it("generates exactly six monthly plans and eight level-specific extras in stable order", () => {
    expect(desiredCatalog().map(entry => entry.spec.id)).toEqual(allIds);
    expect(new Set(desiredCatalog().map(entry => entry.spec.id)).size).toBe(14);
  });

  it("derives every plan amount and name from the frozen family, including the application-only plan", () => {
    const desired = desiredCatalog();
    for (const plan of PLAN_FAMILY) for (const currency of currencies) {
      const entry = desired.find(candidate => candidate.spec.id === `skipwait_${plan.id}_monthly-${currency}`);
      expect(entry?.item).toEqual({ id: `skipwait_${plan.id}`, name: `skipwait_${plan.id}`, type: "plan", externalName: plan.label, enabledInPortal: false });
      expect(entry?.spec).toEqual({ id: `skipwait_${plan.id}_monthly-${currency}`, name: `skipwait_${plan.id}_monthly-${currency}`, itemId: `skipwait_${plan.id}`, itemType: "plan", pricingModel: "flat_fee", price: planFeeMinor(plan.id, currency), currencyCode: currency, externalName: `${plan.label}, monthly`, period: 1, periodUnit: "month", billingCycles: null });
    }
  });

  it("makes extras per-unit one-time charges with a single price per level across bands", () => {
    for (const level of REFERRAL_LEVELS) for (const currency of currencies) {
      const entry = desiredCatalog().find(candidate => candidate.spec.id === `skipwait_referral_${level}-${currency}`);
      expect(entry?.spec).toMatchObject({ itemId: `skipwait_referral_${level}`, itemType: "charge", pricingModel: "per_unit", price: topUpMinor(level, currency), currencyCode: currency, period: null, periodUnit: null, billingCycles: null });
      expect(entry?.spec.externalName).toMatch(/referral request$/);
    }
  });

  it("validates and round-trips every provider spec while keeping all banded IDs out of legacy checkout", () => {
    for (const entry of desiredCatalog()) {
      expect(itemPriceSpecSchema.parse(JSON.parse(JSON.stringify(entry.spec)))).toEqual(entry.spec);
      expect(resolveItemPrice(entry.spec.id)).toBeUndefined();
      expect(entry.spec.externalName).not.toMatch(/credit|guarantee|priority/i);
    }
    expect(desiredCatalog()).toHaveLength(14);
  });

  it("does not recreate paused packs, passes, human sessions, referrer or company plans", () => {
    expect(desiredCatalog().map(entry => entry.spec.id)).not.toEqual(expect.arrayContaining(["skipwait_pack_2-INR"]));
    const excluded = excludedItemPrices();
    expect(new Set(excluded.map(entry => entry.itemPriceId)).size).toBe(excluded.length);
    expect(excluded.map(entry => entry.itemPriceId)).toEqual(expect.arrayContaining(["skipwait_pack_2-INR", "skipwait_pack_5-USD", "skipwait_start_30d-INR", "skipwait_keep_warm_yearly-USD", "skipwait_land_concierge_90d-INR", "skipwait_written_review-USD"]));
    expect(excluded.every(entry => entry.reason.length > 10)).toBe(true);
    for (const id of allIds) expect(excluded.map(entry => entry.itemPriceId)).not.toContain(id);
  });

  it("reports monthly plans truthfully and refuses to call provisioned banded prices sellable", () => {
    const result = dryRun();
    expect(catalogSyncDryRunSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(result.counts.correct).toBe(14);
    expect(result.correct.filter(price => price.term === "monthly").map(price => price.itemPriceId)).toEqual(planIds);
    const desired = desiredCatalog();
    const state = syncedSiteState();
    const first = desired[0];
    if (!first) throw new Error("Missing desired plan");
    const changed = planCatalogSync({ desired, excluded: excludedItemPrices(), state: { ...state, itemPrices: state.itemPrices.map(price => price.id === first.spec.id ? { ...providerItemPriceFor(first.spec), price: first.spec.price + 1 } : price) }, site: "skipwait-test", environment: "test", checkedAt: new Date("2026-11-20T16:00:00Z") });
    expect(changed.mismatched).toEqual([expect.objectContaining({ itemPriceId: first.spec.id, sellableNow: false, term: "monthly" })]);
  });
});
