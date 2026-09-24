import { describe, expect, it } from "vitest";
import { canReviewReferral, getJobSeekerReferralState, getReferralProgress, getReferrerInboxState, isPostApprovalReferralStatus, isReferralProgressUpdateStatus, referralStatusLabels } from "./referral";

describe("Referral Request state helpers", () => {
  it("distinguishes request acceptance from participant-reported milestones", () => {
    expect(referralStatusLabels.pending).toBe("Request sent");
    expect(referralStatusLabels.approved).toBe("Request accepted");
    expect(referralStatusLabels.intro_made).toBe("Introduction reported");
    expect(referralStatusLabels.interview).toBe("Interview reported");
    expect(referralStatusLabels.offer).toBe("Offer reported");
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

  it("allows only factual post-approval lifecycle progress updates", () => {
    expect(isPostApprovalReferralStatus("approved")).toBe(true);
    expect(isPostApprovalReferralStatus("interview")).toBe(true);
    expect(isPostApprovalReferralStatus("pending")).toBe(false);
    expect(isReferralProgressUpdateStatus("intro_made")).toBe(true);
    expect(isReferralProgressUpdateStatus("offer")).toBe(true);
    expect(isReferralProgressUpdateStatus("approved")).toBe(false);
  });

  it("keeps seeker copy precise about routing, acceptance, and unverified outcomes", () => {
    expect(getJobSeekerReferralState({ status: "pending", referrerId: null })).toMatchObject({ label: "Privately routed", tone: "amber" });
    expect(getJobSeekerReferralState({ status: "pending", referrerId: 4 })).toMatchObject({ label: "Under review", tone: "blue" });
    expect(getJobSeekerReferralState({ status: "declined", referrerId: 4 })).toMatchObject({ label: "Request closed", tone: "slate" });
    const accepted = getJobSeekerReferralState({ status: "approved", referrerId: 4 });
    expect(accepted.label).toBe("Request accepted");
    expect(accepted.detail).toMatch(/does not confirm.*submitted/i);
    for (const status of ["intro_made", "interview", "offer"] as const) {
      const state = getJobSeekerReferralState({ status, referrerId: 4 });
      expect(state.label).toMatch(/reported/i);
      expect(state.detail).toMatch(/not verified.*employer/i);
    }
  });

  it("separates new, saved, and completed Referrer inbox work without fabricating activity", () => {
    expect(getReferrerInboxState({ status: "pending", referrerId: null, savedAt: null })).toBe("new");
    expect(getReferrerInboxState({ status: "pending", referrerId: null, savedAt: new Date() })).toBe("saved");
    expect(getReferrerInboxState({ status: "pending", referrerId: 2, savedAt: null })).toBe("saved");
    expect(getReferrerInboxState({ status: "approved", referrerId: 2, savedAt: null })).toBe("completed");
  });
});
