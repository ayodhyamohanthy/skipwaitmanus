import { describe, expect, it } from "vitest";
import { decideV2BundleGrant, expectedBundleAmount, v2CreditIdempotencyKey } from "./v2Crediting";

describe("D-132 bundle crediting decisions", () => {
  it("the expected month total is the frozen plan fee + rung ladder price", () => {
    // Fast Track Rs499 + 25-credit rung Rs1,125 = Rs1,624 (D-132 frozen ladder).
    expect(expectedBundleAmount("fast_track", 25, "INR")).toBe(49_900 + 112_500);
    // Insider $59 + 10-credit rung $9.60.
    expect(expectedBundleAmount("insider", 10, "USD")).toBe(5_900 + 960);
  });

  it("grants only when the paid amount is exactly the expected total", () => {
    expect(decideV2BundleGrant({ planFamily: "fast_track", rung: 25, amount: 162_400, currency: "INR" })).toEqual({ ok: true, expectedAmount: 162_400 });
    const mismatch = decideV2BundleGrant({ planFamily: "fast_track", rung: 25, amount: 112_500, currency: "INR" });
    expect(mismatch).toEqual({ ok: false, reason: "amount_mismatch", expectedAmount: 162_400 });
  });

  it("one idempotency key per invoice", () => {
    expect(v2CreditIdempotencyKey("inv_123")).toBe("v2credits-inv_123");
  });
});
