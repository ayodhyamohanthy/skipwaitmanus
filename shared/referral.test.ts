import { describe, expect, it } from "vitest";
import { canReviewReferral, getJobSeekerReferralState, getReferralProgress, getReferrerInboxState, isPostApprovalReferralStatus, isReferralProgressUpdateStatus, referralStatusLabels } from "./referral";

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

  it("allows only factual post-approval lifecycle progress updates", () => {
    expect(isPostApprovalReferralStatus("approved")).toBe(true);
    expect(isPostApprovalReferralStatus("interview")).toBe(true);
    expect(isPostApprovalReferralStatus("pending")).toBe(false);
    expect(isReferralProgressUpdateStatus("intro_made")).toBe(true);
    expect(isReferralProgressUpdateStatus("offer")).toBe(true);
    expect(isReferralProgressUpdateStatus("approved")).toBe(false);
  });

  it("keeps Job Seeker status copy factual about routing, claim, and decision", () => {
    expect(getJobSeekerReferralState({ status: "pending", referrerId: null })).toMatchObject({ label: "Privately routed", tone: "amber" });
    expect(getJobSeekerReferralState({ status: "pending", referrerId: 4 })).toMatchObject({ label: "Under review", tone: "blue" });
    expect(getJobSeekerReferralState({ status: "declined", referrerId: 4 })).toMatchObject({ label: "Request closed", tone: "slate" });
    expect(getJobSeekerReferralState({ status: "interview", referrerId: 4 })).toMatchObject({ label: "Interview in progress", tone: "blue" });
  });

  it("separates new, saved, and completed Referrer inbox work without fabricating activity", () => {
    expect(getReferrerInboxState({ status: "pending", referrerId: null, savedAt: null })).toBe("new");
    expect(getReferrerInboxState({ status: "pending", referrerId: null, savedAt: new Date() })).toBe("saved");
    expect(getReferrerInboxState({ status: "pending", referrerId: 2, savedAt: null })).toBe("saved");
    expect(getReferrerInboxState({ status: "approved", referrerId: 2, savedAt: null })).toBe("completed");
  });
});
