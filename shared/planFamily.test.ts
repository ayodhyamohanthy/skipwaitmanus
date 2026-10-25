import { describe, expect, it } from "vitest";
import {
  BAND_LEVELS,
  FREE_REFERRALS_PER_MONTH,
  PLAN_FAMILY,
  REFERRER_PLANS,
  COMPANY_PLANS,
  TOPUP_PRICE,
  VOLUME_DISCOUNTS,
  bandIncludes,
  includedReferralList,
  includedReferralTotal,
  planFamilyEntry,
  planFeeMinor,
  topUpMinor,
  volumeDiscountPct,
} from "./planFamily";

describe("frozen banded plan family (owner freeze Oct 25)", () => {
  it("has exactly the three frozen bands in order", () => {
    expect(PLAN_FAMILY.map(p => p.id)).toEqual(["early_to_mid", "mid_to_senior", "senior_to_executive"]);
    expect(PLAN_FAMILY.map(p => p.label)).toEqual(["Early to Mid", "Mid to Senior", "Senior to Executive"]);
  });

  it("frozen monthly prices (minor units)", () => {
    expect(planFeeMinor("early_to_mid", "INR")).toBe(22_900);
    expect(planFeeMinor("early_to_mid", "USD")).toBe(449);
    expect(planFeeMinor("mid_to_senior", "INR")).toBe(89_900);
    expect(planFeeMinor("mid_to_senior", "USD")).toBe(1_799);
    expect(planFeeMinor("senior_to_executive", "INR")).toBe(129_900);
    expect(planFeeMinor("senior_to_executive", "USD")).toBe(2_599);
  });

  it("frozen included referrals per band, both levels covered", () => {
    expect(includedReferralList("early_to_mid")).toEqual([{ level: "early", count: 3 }, { level: "mid", count: 1 }]);
    expect(includedReferralList("mid_to_senior")).toEqual([{ level: "mid", count: 3 }, { level: "senior", count: 2 }]);
    expect(includedReferralList("senior_to_executive")).toEqual([{ level: "senior", count: 3 }, { level: "executive", count: 1 }]);
    expect(includedReferralTotal("early_to_mid")).toBe(4);
    expect(includedReferralTotal("mid_to_senior")).toBe(5);
    expect(includedReferralTotal("senior_to_executive")).toBe(4);
  });

  it("bands are bounded, non-cumulative, overlapping at Mid and Senior", () => {
    expect(BAND_LEVELS.early_to_mid).toEqual(["early", "mid"]);
    expect(BAND_LEVELS.mid_to_senior).toEqual(["mid", "senior"]);
    expect(BAND_LEVELS.senior_to_executive).toEqual(["senior", "executive"]);
    expect(bandIncludes("early_to_mid", "senior")).toBe(false);
    expect(bandIncludes("senior_to_executive", "mid")).toBe(false);
    expect(bandIncludes("senior_to_executive", "executive")).toBe(true);
  });

  it("top-up prices: one price per level, same across plans", () => {
    expect(topUpMinor("early", "INR")).toBe(4_900);
    expect(topUpMinor("early", "USD")).toBe(100);
    expect(topUpMinor("mid", "INR")).toBe(19_900);
    expect(topUpMinor("mid", "USD")).toBe(400);
    expect(topUpMinor("senior", "INR")).toBe(39_900);
    expect(topUpMinor("senior", "USD")).toBe(800);
    expect(topUpMinor("executive", "INR")).toBe(79_900);
    expect(topUpMinor("executive", "USD")).toBe(1_600);
    expect(Object.keys(TOPUP_PRICE)).toEqual(["early", "mid", "senior", "executive"]);
  });

  it("volume discount ladder 2/4/8/12/16/20 at 5/10/25/50/100/200", () => {
    expect(volumeDiscountPct(1)).toBe(0);
    expect(volumeDiscountPct(4)).toBe(0);
    expect(volumeDiscountPct(5)).toBe(2);
    expect(volumeDiscountPct(10)).toBe(4);
    expect(volumeDiscountPct(25)).toBe(8);
    expect(volumeDiscountPct(50)).toBe(12);
    expect(volumeDiscountPct(100)).toBe(16);
    expect(volumeDiscountPct(200)).toBe(20);
    expect(volumeDiscountPct(999)).toBe(20);
    expect(VOLUME_DISCOUNTS.map(r => [r.minQuantity, r.savePct])).toEqual([[5, 2], [10, 4], [25, 8], [50, 12], [100, 16], [200, 20]]);
  });

  it("free allowance is 3 per month at any level", () => {
    expect(FREE_REFERRALS_PER_MONTH).toBe(3);
  });

  it("Senior to Executive is by application; founding caps frozen", () => {
    expect(planFamilyEntry("senior_to_executive").byApplication).toBe(true);
    expect(planFamilyEntry("early_to_mid").byApplication).toBeUndefined();
    expect(PLAN_FAMILY.map(p => p.foundingCap)).toEqual([500, 250, 100]);
  });

  it("readiness gates survive the freeze: referrer and company plans are not chargeable", () => {
    expect(REFERRER_PLANS.chargeable).toBe(false);
    expect(COMPANY_PLANS.built).toBe(false);
    expect(COMPANY_PLANS.chargeable).toBe(false);
  });
});
