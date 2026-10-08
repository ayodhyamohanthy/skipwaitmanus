import { describe, expect, it } from "vitest";
import { ASK_EXPIRING_SOON_MS, ASK_TTL_MS, askDaysLeft, canReviewReferral, formatAskExpiry, getAskExpiresAtMs, getJobSeekerReferralState, getReferralProgress, getReferrerInboxState, isAskExpired, isPostApprovalReferralStatus, isReferralProgressUpdateStatus, referralStatusLabels } from "./referral";

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

  it("expires unclaimed pending asks 7 days after creation, computed in JS", () => {
    const now = new Date("2026-10-08T00:00:00.000Z").getTime();
    expect(ASK_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    const fresh = new Date("2026-10-06T00:00:00.000Z");
    expect(getAskExpiresAtMs(fresh)).toBe(new Date("2026-10-13T00:00:00.000Z").getTime());
    expect(isAskExpired({ status: "pending", referrerId: null, createdAt: fresh }, now)).toBe(false);
    const stale = new Date("2026-09-30T00:00:00.000Z");
    expect(isAskExpired({ status: "pending", referrerId: null, createdAt: stale }, now)).toBe(true);
    // Claimed asks and decided asks never auto-expire.
    expect(isAskExpired({ status: "pending", referrerId: 9, createdAt: stale }, now)).toBe(false);
    expect(isAskExpired({ status: "approved", referrerId: 9, createdAt: stale }, now)).toBe(false);
    // Unknown timestamps fail open: never strand an ask.
    expect(getAskExpiresAtMs(undefined)).toBeNull();
    expect(getAskExpiresAtMs("not-a-date")).toBeNull();
    expect(isAskExpired({ status: "pending", referrerId: null, createdAt: undefined }, now)).toBe(false);
  });

  it("labels the expiry countdown honestly", () => {
    const now = new Date("2026-10-08T12:00:00.000Z").getTime();
    expect(formatAskExpiry({ status: "pending", referrerId: null, createdAt: new Date("2026-10-03T12:00:00.000Z") }, now)).toBe("Expires in 2 days");
    expect(formatAskExpiry({ status: "pending", referrerId: null, createdAt: new Date("2026-10-02T12:00:00.000Z") }, now)).toBe("Expires tomorrow");
    expect(formatAskExpiry({ status: "pending", referrerId: null, createdAt: new Date("2026-10-01T13:00:00.000Z") }, now)).toBe("Expires today");
    expect(formatAskExpiry({ status: "pending", referrerId: null, createdAt: new Date("2026-09-01T00:00:00.000Z") }, now)).toBe("Expired");
    expect(formatAskExpiry({ status: "pending", referrerId: 9, createdAt: new Date("2026-09-01T00:00:00.000Z") }, now)).toBeNull();
    expect(formatAskExpiry({ status: "approved", referrerId: 9, createdAt: new Date("2026-10-03T12:00:00.000Z") }, now)).toBeNull();
    expect(askDaysLeft({ createdAt: undefined }, now)).toBeNull();
    expect(ASK_EXPIRING_SOON_MS).toBe(2 * 24 * 60 * 60 * 1000);
  });
});
