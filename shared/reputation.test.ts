import { describe, expect, it } from "vitest";
import { computeJobSeekerReliability, computeReferrerReputation, type ReputationReferralRow, type ReputationTransitionEvent } from "./reputation";

const row = (id: number, overrides: Partial<ReputationReferralRow> = {}): ReputationReferralRow => ({
  id,
  referrerId: 7,
  jobSeekerId: 3,
  status: "pending",
  createdAt: "2026-09-01T00:00:00.000Z",
  ...overrides,
});

const event = (referralRequestId: number, overrides: Partial<ReputationTransitionEvent> = {}): ReputationTransitionEvent => ({
  referralRequestId,
  actorUserId: 7,
  action: "review",
  resultingStatus: "approved",
  createdAt: "2026-09-02T00:00:00.000Z",
  ...overrides,
});

describe("computeReferrerReputation", () => {
  it("returns zero counts and null rates for a referrer with no history", () => {
    expect(computeReferrerReputation(7, [], [])).toEqual({
      decisions: 0, approvals: 0, declines: 0, approvalRate: null,
      introductions: 0, interviews: 0, offers: 0,
      interviewHitRate: null, offerRate: null, medianResponseHours: null,
    });
  });

  it("counts one decision per request and splits approvals from declines", () => {
    const events = [
      event(1, { resultingStatus: "approved" }),
      event(1, { action: "approve", resultingStatus: "approved", createdAt: "2026-09-03T00:00:00.000Z" }), // replay/duplicate: still one decision
      event(2, { resultingStatus: "declined" }),
      event(3, { resultingStatus: "approved" }),
    ];
    const reputation = computeReferrerReputation(7, [row(1), row(2), row(3)], events);
    expect(reputation.decisions).toBe(3);
    expect(reputation.approvals).toBe(2);
    expect(reputation.declines).toBe(1);
    expect(reputation.approvalRate).toBeCloseTo(2 / 3);
  });

  it("attributes milestone outcomes only to requests this referrer approved", () => {
    const events = [
      event(1, { resultingStatus: "approved" }),
      event(2, { resultingStatus: "approved" }),
      event(1, { actorUserId: 3, action: "progress", resultingStatus: "interview" }),
      event(9, { actorUserId: 3, action: "progress", resultingStatus: "offer" }), // not this referrer's request
      event(2, { actorUserId: 3, action: "progress", resultingStatus: "offer" }),
    ];
    const reputation = computeReferrerReputation(7, [row(1), row(2)], events);
    expect(reputation.introductions).toBe(2);
    expect(reputation.interviews).toBe(2);
    expect(reputation.offers).toBe(1);
    expect(reputation.interviewHitRate).toBe(1);
    expect(reputation.offerRate).toBe(0.5);
  });

  it("keeps milestones cumulative when a request later closes", () => {
    const events = [
      event(1, { resultingStatus: "approved" }),
      event(1, { actorUserId: 3, action: "progress", resultingStatus: "interview" }),
      event(1, { actorUserId: 3, action: "progress", resultingStatus: "closed" }),
    ];
    const reputation = computeReferrerReputation(7, [row(1, { status: "closed" })], events);
    expect(reputation.interviews).toBe(1);
    expect(reputation.interviewHitRate).toBe(1);
  });

  it("computes median response hours in JS and ignores unknown actions and negative durations", () => {
    const rows = [row(1), row(2), row(3, { createdAt: "2026-09-05T00:00:00.000Z" })];
    const events = [
      event(1, { resultingStatus: "approved", createdAt: "2026-09-01T02:00:00.000Z" }),
      event(2, { resultingStatus: "approved", createdAt: "2026-09-01T06:00:00.000Z" }),
      event(3, { resultingStatus: "approved", createdAt: "2026-09-01T00:00:00.000Z" }), // negative skew: excluded
      event(1, { action: "withdraw", resultingStatus: "withdrawn" }),
      event(2, { action: "pass", resultingStatus: "pending" }),
    ];
    const reputation = computeReferrerReputation(7, rows, events);
    expect(reputation.decisions).toBe(3);
    expect(reputation.medianResponseHours).toBe(4);
  });

  it("ignores decisions made by other actors", () => {
    const reputation = computeReferrerReputation(7, [row(1)], [event(1, { actorUserId: 99, resultingStatus: "approved" })]);
    expect(reputation.decisions).toBe(0);
    expect(reputation.approvalRate).toBeNull();
  });
});

describe("computeJobSeekerReliability", () => {
  it("returns zero counts and null completion rate for a seeker with no requests", () => {
    expect(computeJobSeekerReliability(3, [], [])).toEqual({
      totalRequests: 0, withdrawnBeforeClaim: 0, reviewsReceived: 0, approvalsReceived: 0,
      introductions: 0, interviews: 0, offers: 0, completionRate: null,
    });
  });

  it("tracks requests, pre-claim withdrawals, reviews, and milestone completion", () => {
    const rows = [row(1, { jobSeekerId: 3 }), row(2, { jobSeekerId: 3 }), row(3, { jobSeekerId: 3 }), row(4, { jobSeekerId: 8 })];
    const events = [
      event(1, { actorUserId: 7, resultingStatus: "approved" }),
      event(1, { actorUserId: 3, action: "progress", resultingStatus: "intro_made" }),
      event(2, { actorUserId: 7, resultingStatus: "approved" }),
      event(2, { actorUserId: 7, action: "progress", resultingStatus: "offer" }),
      event(3, { actorUserId: 3, action: "withdraw", resultingStatus: "withdrawn" }),
      event(4, { actorUserId: 8, action: "withdraw", resultingStatus: "withdrawn" }), // another seeker's request
    ];
    const reliability = computeJobSeekerReliability(3, rows, events);
    expect(reliability.totalRequests).toBe(3);
    expect(reliability.withdrawnBeforeClaim).toBe(1);
    expect(reliability.reviewsReceived).toBe(2);
    expect(reliability.approvalsReceived).toBe(2);
    expect(reliability.introductions).toBe(2);
    expect(reliability.interviews).toBe(1);
    expect(reliability.offers).toBe(1);
    expect(reliability.completionRate).toBe(1);
  });

  it("counts declined reviews without inflating approvals and keeps completion null without approvals", () => {
    const rows = [row(1, { jobSeekerId: 3 })];
    const events = [event(1, { actorUserId: 7, resultingStatus: "declined" })];
    const reliability = computeJobSeekerReliability(3, rows, events);
    expect(reliability.reviewsReceived).toBe(1);
    expect(reliability.approvalsReceived).toBe(0);
    expect(reliability.completionRate).toBeNull();
  });

  it("ignores transition events for requests owned by other seekers", () => {
    const rows = [row(1, { jobSeekerId: 3 })];
    const events = [event(9, { actorUserId: 3, action: "withdraw", resultingStatus: "withdrawn" })];
    expect(computeJobSeekerReliability(3, rows, events).withdrawnBeforeClaim).toBe(0);
  });
});
