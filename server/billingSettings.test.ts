import { describe, expect, it } from "vitest";
import { humanReviewersStaffed, indiaGstRegistered, usdRecurringConfirmed } from "./billingSettings";

describe("billing switches", () => {
  it("is off by default and on only for a literal \"true\"", () => {
    for (const read of [indiaGstRegistered, usdRecurringConfirmed, humanReviewersStaffed]) {
      expect(read({})).toBe(false);
      expect(read({ INDIA_GST_REGISTERED: "1", USD_RECURRING_CONFIRMED: "yes", HUMAN_REVIEWERS_STAFFED: "" })).toBe(false);
    }
    expect(indiaGstRegistered({ INDIA_GST_REGISTERED: "true" })).toBe(true);
    expect(indiaGstRegistered({ INDIA_GST_REGISTERED: "TRUE" })).toBe(true);
    expect(indiaGstRegistered({ INDIA_GST_REGISTERED: " true " })).toBe(true);
    expect(usdRecurringConfirmed({ USD_RECURRING_CONFIRMED: "true" })).toBe(true);
    expect(humanReviewersStaffed({ HUMAN_REVIEWERS_STAFFED: "true" })).toBe(true);
  });
});
