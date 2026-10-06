import { describe, expect, it } from "vitest";
import { canReviewReferral, getReferralProgress, referralStatusLabels } from "../shared/referral";

describe("Referral Request state helpers", () => {
  it("uses request-accepted and participant-reported labels in notifications", () => {
    expect(referralStatusLabels.pending).toBe("Request sent");
    expect(referralStatusLabels.approved).toBe("Request accepted");
    expect(referralStatusLabels.intro_made).toBe("Introduction reported");
    expect(referralStatusLabels.interview).toBe("Interview reported");
    expect(referralStatusLabels.offer).toBe("Offer reported");
  });

  it("allows Referrer review only for a pending Referral Request", () => {
    expect(canReviewReferral("pending")).toBe(true);
    expect(canReviewReferral("approved")).toBe(false);
  });

  it("returns increasing progress through the application status stages", () => {
    expect(getReferralProgress("pending")).toBe(0);
    expect(getReferralProgress("interview")).toBeGreaterThan(getReferralProgress("approved"));
    expect(getReferralProgress("offer")).toBeGreaterThan(getReferralProgress("interview"));
  });
});
