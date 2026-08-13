import { describe, expect, it } from "vitest";
import { canReviewReferral, getReferralProgress, referralStatusLabels } from "./referral";

describe("Referral Request state helpers", () => {
  it("provides the prescribed request state labels", () => {
    expect(referralStatusLabels.pending).toBe("Request sent");
    expect(referralStatusLabels.intro_made).toBe("Introduction made");
  });

  it("allows referrer review only while a Referral Request is pending", () => {
    expect(canReviewReferral("pending")).toBe(true);
    expect(canReviewReferral("approved")).toBe(false);
  });

  it("maps completed application stages to increasing progress", () => {
    expect(getReferralProgress("pending")).toBe(0);
    expect(getReferralProgress("interview")).toBeGreaterThan(getReferralProgress("approved"));
    expect(getReferralProgress("offer")).toBeGreaterThan(getReferralProgress("interview"));
  });
});

