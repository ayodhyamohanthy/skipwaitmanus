import { describe, expect, it } from "vitest";
import {
  bandedCartSchema,
  bandedIncludedCycleKey,
  bandedIncludedReferralsForPlan,
  bandedIntentFingerprint,
  bandedLedgerSource,
  bandedPurchasedLotKey,
  parseBandedSource,
  type BandedCart,
} from "./bandedGrants";

describe("shared/bandedGrants contract", () => {
  it("computes deterministic fingerprint for immutable checkout intent", () => {
    const cart: BandedCart = {
      kind: "plan",
      planId: "early_to_mid",
      itemPriceId: "skipwait_early_to_mid_monthly-INR",
      amount: 22900,
      currency: "INR",
      billingRoute: "IN",
    };
    const fp1 = bandedIntentFingerprint({
      site: "test",
      userId: 42,
      kind: "plan",
      planId: "early_to_mid",
      billingRoute: "IN",
      currency: "INR",
      expectedTotal: 22900,
      cart,
    });
    const fp2 = bandedIntentFingerprint({
      site: "test",
      userId: 42,
      kind: "plan",
      planId: "early_to_mid",
      billingRoute: "IN",
      currency: "INR",
      expectedTotal: 22900,
      cart,
    });
    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[0-9a-f]{64}$/);

    // Mismatched site or amount changes fingerprint
    const fpDiff = bandedIntentFingerprint({
      site: "live",
      userId: 42,
      kind: "plan",
      planId: "early_to_mid",
      billingRoute: "IN",
      currency: "INR",
      expectedTotal: 22900,
      cart,
    });
    expect(fpDiff).not.toBe(fp1);
  });

  it("validates plan cart and referral cart with bandedCartSchema", () => {
    const validPlan: BandedCart = {
      kind: "plan",
      planId: "mid_to_senior",
      itemPriceId: "skipwait_mid_to_senior_monthly-USD",
      amount: 1799,
      currency: "USD",
      billingRoute: "INTL",
    };
    expect(bandedCartSchema.parse(validPlan)).toEqual(validPlan);

    const validReferral: BandedCart = {
      kind: "referral",
      quantity: 3,
      subtotal: 1200,
      discount: 0,
      total: 1200,
      currency: "USD",
      billingRoute: "INTL",
      lines: [{ level: "mid", quantity: 3, unitAmount: 400, lineAmount: 1200 }],
    };
    expect(bandedCartSchema.parse(validReferral)).toEqual(validReferral);

    // Rejects invalid cart
    expect(() => bandedCartSchema.parse({ kind: "unknown" })).toThrow();
    expect(() => bandedCartSchema.parse({ ...validReferral, total: -10 })).toThrow();
  });

  it("generates structured cycle and lot keys", () => {
    const cycleKey = bandedIncludedCycleKey("test", "sub_123", 1700000000000, "early");
    expect(cycleKey).toBe("test:sub_123:1700000000000:early");

    const lotKey = bandedPurchasedLotKey("live", "inv_456", "senior");
    expect(lotKey).toBe("live:inv_456:senior");
  });

  it("provides included referrals per plan family ID", () => {
    expect(bandedIncludedReferralsForPlan("early_to_mid")).toEqual([
      { level: "early", count: 3 },
      { level: "mid", count: 1 },
    ]);
    expect(bandedIncludedReferralsForPlan("mid_to_senior")).toEqual([
      { level: "mid", count: 3 },
      { level: "senior", count: 2 },
    ]);
    expect(bandedIncludedReferralsForPlan("senior_to_executive")).toEqual([
      { level: "senior", count: 3 },
      { level: "executive", count: 1 },
    ]);
  });

  it("formats and parses banded ledger sources", () => {
    expect(bandedLedgerSource.included("mid")).toBe("banded:included:mid");
    expect(bandedLedgerSource.purchased("senior")).toBe("banded:purchased:senior");
    expect(bandedLedgerSource.refund("early")).toBe("banded:refund:early");

    expect(parseBandedSource("banded:included:mid")).toEqual({ bucket: "included", level: "mid" });
    expect(parseBandedSource("banded:purchased:executive")).toEqual({ bucket: "purchased", level: "executive" });
    expect(parseBandedSource("banded:refund:senior")).toEqual({ bucket: "refund", level: "senior" });
    expect(parseBandedSource("monthly_allowance")).toBeNull();
  });
});
