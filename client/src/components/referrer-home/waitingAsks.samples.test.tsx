// D-048-K-referrer-home: the goal route tests cover inert sample rendering and
// counts. These cases pin the server-history and verification eligibility rules.
import { describe, expect, it } from "vitest";
import { deriveReferrerHome, type ReferrerHomeData } from "./referrerData";

const ACCESS = { verified: true, domain: "example.com", companyName: "Example", companyInitials: "E" };

function data(overrides: Partial<ReferrerHomeData> = {}): ReferrerHomeData {
  return { access: ACCESS, preferences: null, verifiedAt: "2026-10-01T00:00:00.000Z", profileCapacity: 3, impact: null, thankYous: null, fresh: [], completed: [], hasEverReviewed: false, ...overrides };
}

describe("referrer-home sample empty state", () => {
  it("allows samples for a verified first-timer with an empty queue", () => {
    const view = deriveReferrerHome(data(), Date.now());
    expect(view.showSamples).toBe(true);
  });

  it("disallows samples when the server has recorded prior review", () => {
    const view = deriveReferrerHome(data({ hasEverReviewed: true }), Date.now());
    expect(view.showSamples).toBe(false);
  });

  it("disallows samples when the server did not report review history", () => {
    const view = deriveReferrerHome(data({ hasEverReviewed: null }), Date.now());
    expect(view.showSamples).toBe(false);
  });

  it("never shows samples over real waiting asks or when unverified", () => {
    const waitingRow = { id: 7, companyDomain: "example.com", jobFunction: null, status: "pending" as const, createdAt: "2026-10-20T00:00:00.000Z", isClaimedByYou: false, unreadMessageCount: 0, attachmentCount: 0, expiresAt: null, waitingForCoverage: false, coverageVisibleAt: null, jobTitle: "Analyst", askStrength: null };
    const withWaiting = deriveReferrerHome(data({ fresh: [waitingRow] }), Date.now());
    expect(withWaiting.showSamples).toBe(false);
    const unverified = deriveReferrerHome(data({ access: { ...ACCESS, verified: false } }), Date.now());
    expect(unverified.showSamples).toBe(false);
  });
});
