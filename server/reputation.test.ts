import { beforeEach, describe, expect, it, vi } from "vitest";
import { referralRequests, referralTransitionEvents } from "../drizzle/schema";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), getVerifiedWorkEmailAccess: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb, getVerifiedWorkEmailAccess: mocks.getVerifiedWorkEmailAccess }));

import { getJobSeekerReliability, getReferrerReputation } from "./reputation";

const requestRows = [
  { id: 1, referrerId: 7, jobSeekerId: 3, status: "interview", createdAt: new Date("2026-09-01T00:00:00.000Z") },
  { id: 2, referrerId: 7, jobSeekerId: 4, status: "declined", createdAt: new Date("2026-09-01T00:00:00.000Z") },
];
const transitionRows = [
  { referralRequestId: 1, actorUserId: 7, action: "review", resultingStatus: "approved", createdAt: new Date("2026-09-01T03:00:00.000Z") },
  { referralRequestId: 1, actorUserId: 3, action: "progress", resultingStatus: "interview", createdAt: new Date("2026-09-05T00:00:00.000Z") },
  { referralRequestId: 2, actorUserId: 7, action: "review", resultingStatus: "declined", createdAt: new Date("2026-09-01T01:00:00.000Z") },
];

function fakeDb(rows: unknown[], events: unknown[]) {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => (table === referralRequests ? rows : table === referralTransitionEvents ? events : []),
      }),
    }),
  };
}

beforeEach(() => {
  mocks.getDb.mockReset();
  mocks.getVerifiedWorkEmailAccess.mockReset();
});

describe("getReferrerReputation", () => {
  it("requires a verified work email before any database read", async () => {
    mocks.getVerifiedWorkEmailAccess.mockResolvedValue(undefined);
    await expect(getReferrerReputation(7)).rejects.toThrow(/verify your company email/i);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("derives cumulative stats from the transition log for the signed-in referrer", async () => {
    mocks.getVerifiedWorkEmailAccess.mockResolvedValue({ workEmailDomain: "acme.com" });
    mocks.getDb.mockResolvedValue(fakeDb(requestRows, transitionRows));
    const reputation = await getReferrerReputation(7);
    expect(reputation).toEqual({
      decisions: 2, approvals: 1, declines: 1, approvalRate: 0.5,
      introductions: 1, interviews: 1, offers: 0,
      interviewHitRate: 1, offerRate: 0, medianResponseHours: 2,
    });
  });

  it("fails loudly when the database is unavailable", async () => {
    mocks.getVerifiedWorkEmailAccess.mockResolvedValue({ workEmailDomain: "acme.com" });
    mocks.getDb.mockResolvedValue(null);
    await expect(getReferrerReputation(7)).rejects.toThrow("Database unavailable");
  });
});

describe("getJobSeekerReliability", () => {
  it("does not require work-email verification and derives the seeker's own record", async () => {
    mocks.getDb.mockResolvedValue(fakeDb(requestRows, transitionRows));
    const reliability = await getJobSeekerReliability(3);
    expect(mocks.getVerifiedWorkEmailAccess).not.toHaveBeenCalled();
    expect(reliability.totalRequests).toBe(1);
    expect(reliability.approvalsReceived).toBe(1);
    expect(reliability.interviews).toBe(1);
    expect(reliability.completionRate).toBe(1);
  });

  it("returns zeroed signals with null rates when the seeker has no requests", async () => {
    mocks.getDb.mockResolvedValue(fakeDb([], []));
    const reliability = await getJobSeekerReliability(99);
    expect(reliability.totalRequests).toBe(0);
    expect(reliability.completionRate).toBeNull();
  });
});
