import { describe, expect, it } from "vitest";
import { acceptedAskCostFrom, acceptedAskCostSchema, askBandForLevel, askPriceChangedSchema, ASK_PRICE_CHANGED, sameAcceptedAskCost, type AcceptedAskCost } from "./acceptedAskCost";
import { allocateSpend, type SpendableBucket } from "./creditSpend";

/*
 * D-132-item3 §7 tests 1-4: the identity a seeker accepts before a referral
 * request is charged. It states a count, a band (none yet, D-219 (8)) and the
 * buckets that pay, never a grant id or an expiry date.
 */

const NOW = Date.parse("2026-10-17T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const cycle = (credits: number): SpendableBucket => ({ bucket: "cycle", credits, expiresAt: new Date(NOW + 10 * DAY), grantId: null });
const purchased = (credits: number): SpendableBucket => ({ bucket: "purchased", credits, expiresAt: null, grantId: null });
const valid: AcceptedAskCost = { units: 3, band: null, source: [{ bucket: "cycle", units: 1 }, { bucket: "purchased", units: 2 }] };

describe("acceptedAskCostSchema (test 1): strict", () => {
  it("accepts a canonical cost", () => {
    expect(acceptedAskCostSchema.parse(valid)).toEqual(valid);
    expect(acceptedAskCostSchema.safeParse({ units: 1, band: "early-mid", source: [{ bucket: "promo", units: 1 }] }).success).toBe(true);
  });

  it.each([
    ["an unknown top-level field", { ...valid, grantId: 11 }],
    ["an unknown source field", { ...valid, source: [{ bucket: "cycle", units: 1, grantId: 11 }, { bucket: "purchased", units: 2 }] }],
    ["units below 1", { units: 0, band: null, source: [{ bucket: "cycle", units: 0 }] }],
    ["fractional units", { units: 1.5, band: null, source: [{ bucket: "cycle", units: 1.5 }] }],
    ["an empty source", { units: 1, band: null, source: [] }],
    ["an unknown bucket", { units: 1, band: null, source: [{ bucket: "gift", units: 1 }] }],
    ["source units that do not sum to units", { units: 3, band: null, source: [{ bucket: "cycle", units: 1 }, { bucket: "purchased", units: 1 }] }],
    ["a duplicate bucket", { units: 2, band: null, source: [{ bucket: "cycle", units: 1 }, { bucket: "cycle", units: 1 }] }],
    ["non-canonical bucket order", { units: 3, band: null, source: [{ bucket: "purchased", units: 2 }, { bucket: "cycle", units: 1 }] }],
    ["a missing band", { units: 1, source: [{ bucket: "cycle", units: 1 }] }],
    ["a bare number", 1],
  ])("refuses %s", (_label, value) => {
    expect(acceptedAskCostSchema.safeParse(value).success).toBe(false);
  });
});

describe("acceptedAskCostFrom (test 2): folds the real allocation per bucket in CREDIT_BUCKETS order", () => {
  it("cycle 1 + purchased 5 at 3 units gives cycle 1, purchased 2", () => {
    const { allocations } = allocateSpend([cycle(1), purchased(5)], 3);
    expect(acceptedAskCostFrom(3, null, allocations)).toEqual({ units: 3, band: null, source: [{ bucket: "cycle", units: 1 }, { bucket: "purchased", units: 2 }] });
  });

  it("cycle 2 + purchased 5 gives cycle 2, purchased 1, and the two splits are not the same cost", () => {
    const one = acceptedAskCostFrom(3, null, allocateSpend([cycle(1), purchased(5)], 3).allocations);
    const two = acceptedAskCostFrom(3, null, allocateSpend([cycle(2), purchased(5)], 3).allocations);
    expect(two.source).toEqual([{ bucket: "cycle", units: 2 }, { bucket: "purchased", units: 1 }]);
    expect(sameAcceptedAskCost(one, two)).toBe(false);
  });

  it("two carryover grants (ids 11 and 12) fold into one carryover entry", () => {
    const grants: SpendableBucket[] = [
      { bucket: "carryover", credits: 1, expiresAt: new Date(NOW + 2 * DAY), grantId: 11 },
      { bucket: "carryover", credits: 1, expiresAt: new Date(NOW + 3 * DAY), grantId: 12 },
    ];
    const { allocations } = allocateSpend(grants, 2);
    expect(allocations.map(allocation => allocation.grantId)).toEqual([11, 12]);
    expect(acceptedAskCostFrom(2, null, allocations)).toEqual({ units: 2, band: null, source: [{ bucket: "carryover", units: 2 }] });
  });

  it("orders the folded buckets canonically whatever the spend order was", () => {
    const allocations = [{ bucket: "purchased" as const, credits: 1, grantId: null }, { bucket: "promo" as const, credits: 1, grantId: 4 }];
    expect(acceptedAskCostFrom(2, null, allocations).source).toEqual([{ bucket: "promo", units: 1 }, { bucket: "purchased", units: 1 }]);
  });

  it("refuses allocations that do not add up to the units", () => {
    expect(() => acceptedAskCostFrom(2, null, [{ bucket: "cycle", credits: 1, grantId: null }])).toThrow();
  });
});

describe("sameAcceptedAskCost (test 3)", () => {
  it("is true only when every field is equal", () => {
    expect(sameAcceptedAskCost(valid, structuredClone(valid))).toBe(true);
    expect(sameAcceptedAskCost(valid, { ...valid, units: 4, source: [{ bucket: "cycle", units: 2 }, { bucket: "purchased", units: 2 }] })).toBe(false);
    expect(sameAcceptedAskCost(valid, { ...valid, band: "mid-senior" })).toBe(false);
    expect(sameAcceptedAskCost(valid, { ...valid, source: [{ bucket: "cycle", units: 2 }, { bucket: "purchased", units: 1 }] })).toBe(false);
    expect(sameAcceptedAskCost(valid, { ...valid, source: [{ bucket: "carryover", units: 1 }, { bucket: "purchased", units: 2 }] })).toBe(false);
    expect(sameAcceptedAskCost(valid, { units: 3, band: null, source: [{ bucket: "purchased", units: 3 }] })).toBe(false);
  });
});

describe("askBandForLevel (test 4): no band mapping exists yet (D-219 (8))", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])("level %i has no band", level => {
    expect(askBandForLevel(level)).toBeNull();
  });
});

describe("askPriceChangedSchema", () => {
  it("is the 409 body: an error line, the code and the current cost", () => {
    expect(askPriceChangedSchema.parse({ error: "The cost changed.", code: ASK_PRICE_CHANGED, acceptedCost: valid })).toEqual({ error: "The cost changed.", code: "ask_price_changed", acceptedCost: valid });
    expect(askPriceChangedSchema.safeParse({ error: "x", code: "ask_price_changed", acceptedCost: 1 }).success).toBe(false);
    expect(askPriceChangedSchema.safeParse({ error: "x", code: "other", acceptedCost: valid }).success).toBe(false);
  });
});
