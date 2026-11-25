import { describe, expect, it } from "vitest";
import { bandedCatalogPriceSchema, bandedPlanCatalogPrice, bandedPlanItemPriceId, bandedReferralCatalogPrice, bandedReferralItemPriceId } from "./bandedCatalog";
import { PLAN_FAMILY_IDS, REFERRAL_LEVELS, planFeeMinor, topUpMinor } from "./planFamily";

describe("banded catalog provisioning contract", () => {
  it("round-trips every plan and level in both currencies without duplicating IDs", () => {
    const prices = [
      ...PLAN_FAMILY_IDS.flatMap(plan => (["INR", "USD"] as const).map(currency => bandedPlanCatalogPrice(plan, currency))),
      ...REFERRAL_LEVELS.flatMap(level => (["INR", "USD"] as const).map(currency => bandedReferralCatalogPrice(level, currency))),
    ];
    expect(prices).toHaveLength(14);
    expect(new Set(prices.map(price => price.itemPriceId)).size).toBe(14);
    for (const price of prices) {
      expect(bandedCatalogPriceSchema.parse(JSON.parse(JSON.stringify(price)))).toEqual(price);
      if (price.kind === "banded_plan") {
        expect(price.itemPriceId).toBe(bandedPlanItemPriceId(price.plan, price.currency));
        expect(price.amount).toBe(planFeeMinor(price.plan, price.currency));
      } else {
        expect(price.itemPriceId).toBe(bandedReferralItemPriceId(price.level, price.currency));
        expect(price.amount).toBe(topUpMinor(price.level, price.currency));
      }
    }
  });

  it("rejects wrong amounts, currencies, identifiers, terms, unknown keys and incomplete values", () => {
    const plan = bandedPlanCatalogPrice("early_to_mid", "USD");
    const referral = bandedReferralCatalogPrice("early", "INR");
    const { itemPriceId: _omitted, ...incomplete } = plan;
    for (const input of [
      { ...plan, amount: 448 }, { ...plan, amount: "449" }, { ...plan, currency: "EUR" },
      { ...plan, interval: "30d" }, { ...plan, plan: "pro" }, { ...plan, itemPriceId: "skipwait_early_to_mid_monthly-INR" },
      { ...plan, extra: true }, incomplete,
      { ...referral, amount: -1 }, { ...referral, level: "staff" },
      { ...referral, itemPriceId: "skipwait_referral_mid-INR" }, { ...referral, interval: "monthly" },
    ]) expect(bandedCatalogPriceSchema.safeParse(input).success).toBe(false);
  });
});
