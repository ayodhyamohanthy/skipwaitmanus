import { describe, expect, it } from "vitest";
import { bandedPlanCatalogPrice, bandedReferralCatalogPrice } from "../shared/bandedCatalog";
import { PLAN_FAMILY_IDS, REFERRAL_LEVELS } from "../shared/planFamily";
import { allocateGroupPlanDiscount, priceGroupPlanLine } from "./groupPlanQuote";

describe("Group quote arithmetic before the shared quote contract lands", () => {
  it("reads every plan and referral price from the existing currency-specific catalog", () => {
    for (const currency of ["INR", "USD"] as const) {
      for (const plan of PLAN_FAMILY_IDS) {
        const price = bandedPlanCatalogPrice(plan, currency);
        expect(priceGroupPlanLine({ kind: "plan", plan, quantity: 3 }, currency)).toEqual({
          itemPriceId: price.itemPriceId, currency, quantity: 3,
          unitAmount: price.amount, subtotal: price.amount * 3,
        });
      }
      for (const level of REFERRAL_LEVELS) {
        const price = bandedReferralCatalogPrice(level, currency);
        expect(priceGroupPlanLine({ kind: "referral", level, quantity: 7 }, currency)).toEqual({
          itemPriceId: price.itemPriceId, currency, quantity: 7,
          unitAmount: price.amount, subtotal: price.amount * 7,
        });
      }
    }
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid quantity %s", quantity => {
    expect(() => priceGroupPlanLine({ kind: "plan", plan: "early_to_mid", quantity }, "USD")).toThrow();
  });

  it("rejects multiplication overflow before returning a payable amount", () => {
    expect(() => priceGroupPlanLine({ kind: "referral", level: "executive", quantity: Number.MAX_SAFE_INTEGER }, "INR")).toThrow();
  });

  it("rejects extra fields and a currency outside the frozen books", () => {
    const withPrice = { kind: "plan" as const, plan: "early_to_mid" as const, quantity: 1, amount: 1 };
    expect(() => priceGroupPlanLine(withPrice, "USD")).toThrow();
    // Exercise the runtime validator independently of the compile-time union.
    expect(() => Reflect.apply(priceGroupPlanLine, undefined, [{ kind: "plan", plan: "early_to_mid", quantity: 1 }, "EUR"])).toThrow();
  });

  it("rounds the known ten percent once, then distributes exact minor units by largest remainder", () => {
    expect(allocateGroupPlanDiscount([449, 449, 1799], 10)).toEqual({
      subtotal: 2697, discount: 270, total: 2427,
      lines: [
        { subtotal: 449, discount: 45, total: 404 },
        { subtotal: 449, discount: 45, total: 404 },
        { subtotal: 1799, discount: 180, total: 1619 },
      ],
    });
  });

  it("breaks equal remainders by confirmed line order and never changes the aggregate total", () => {
    const result = allocateGroupPlanDiscount([1, 1, 1, 1, 1], 10);
    expect(result).toMatchObject({ subtotal: 5, discount: 1, total: 4 });
    expect(result.lines.map(line => line.discount)).toEqual([1, 0, 0, 0, 0]);
    expect(result.lines.reduce((sum, line) => sum + line.total, 0)).toBe(result.total);
  });

  it("uses exact integer math near the safe-integer limit", () => {
    const subtotal = Number.MAX_SAFE_INTEGER;
    const result = allocateGroupPlanDiscount([subtotal], 10);
    expect(result.discount).toBe(Number((BigInt(subtotal) * BigInt(10) + BigInt(50)) / BigInt(100)));
    expect(result.total + result.discount).toBe(subtotal);
  });

  it("preserves the undiscounted and fully discounted controls", () => {
    expect(allocateGroupPlanDiscount([1, 99], 0)).toMatchObject({ subtotal: 100, discount: 0, total: 100 });
    expect(allocateGroupPlanDiscount([1, 99], 100)).toMatchObject({ subtotal: 100, discount: 100, total: 0 });
    expect(allocateGroupPlanDiscount([0, 0], 10)).toEqual({
      subtotal: 0, discount: 0, total: 0,
      lines: [{ subtotal: 0, discount: 0, total: 0 }, { subtotal: 0, discount: 0, total: 0 }],
    });
  });

  it("reconciles all line shares for mixed amounts and integer percentages", () => {
    for (let pct = 0; pct <= 100; pct += 1) {
      const result = allocateGroupPlanDiscount([449, 1799, 1, 100, 799], pct);
      expect(result.lines.reduce((sum, line) => sum + line.discount, 0)).toBe(result.discount);
      expect(result.lines.reduce((sum, line) => sum + line.total, 0)).toBe(result.total);
      for (const line of result.lines) expect(line.discount).toBeGreaterThanOrEqual(0);
      for (const line of result.lines) expect(line.discount).toBeLessThanOrEqual(line.subtotal);
    }
  });

  it.each([-1, 101, 1.5, NaN, Infinity])("rejects invalid percentage %s", pct => {
    expect(() => allocateGroupPlanDiscount([100], pct)).toThrow();
  });

  it("rejects empty, invalid and overflowing line totals", () => {
    for (const amounts of [[], [-1], [1.5], [NaN], [Infinity], [Number.MAX_SAFE_INTEGER, 1]]) {
      expect(() => allocateGroupPlanDiscount(amounts, 10)).toThrow();
    }
  });
});