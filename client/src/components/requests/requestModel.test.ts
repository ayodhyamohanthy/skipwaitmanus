import { describe, expect, it } from "vitest";
import { countExpiringSoon, countInConversation, requestNote, requestPillStatus, slotMeter, slotsFullCopy } from "./requestModel";
import { parseCreditSummary, type CreditSummary, type ReferralRequest } from "./requestsApi";

const now = Date.parse("2026-10-08T04:30:00.000Z");
const day = 24 * 60 * 60 * 1000;
const ask = (patch: Partial<ReferralRequest>): ReferralRequest => ({ id: 1, title: "Designer", targetRoleUrl: null, companyDomain: "acme.com", compensation: null, status: "pending", referrerId: null, queueStatus: null, referrerMessage: null, unreadMessageCount: 0, createdAt: new Date(now - day).toISOString(), updatedAt: new Date(now - day).toISOString(), attachmentCount: 1, expiresAt: null, ...patch });
const wallet = (patch: Partial<CreditSummary>): CreditSummary => ({ plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 3, purchasedCreditsRemaining: 0, totalAvailable: 3, cycleKey: "2026-10", subscriptionStatus: null, subscriptionCurrentTermEnd: null, ...patch });

describe("requests view model", () => {
  it("maps every live status onto the kit pill vocabulary", () => {
    expect(requestPillStatus(ask({ status: "pending" }))).toBe("Requested");
    expect(requestPillStatus(ask({ status: "approved", referrerId: 7 }))).toBe("Accepted");
    expect(requestPillStatus(ask({ status: "intro_made", referrerId: 7 }))).toBe("Referred");
    expect(requestPillStatus(ask({ status: "interview", referrerId: 7 }))).toBe("Interviewing");
    expect(requestPillStatus(ask({ status: "offer", referrerId: 7 }))).toBe("Offer");
    expect(requestPillStatus(ask({ status: "declined", referrerId: 7 }))).toBe("Declined");
    expect(requestPillStatus(ask({ status: "withdrawn" }))).toBe("Withdrawn");
    expect(requestPillStatus(ask({ status: "closed", referrerId: null }))).toBe("Expired");
    expect(requestPillStatus(ask({ status: "closed", referrerId: 7 }))).toBe("Closed");
  });

  it("writes the next real step, never an invented one", () => {
    expect(requestNote(ask({ status: "approved", referrerId: 7 }), now)).toBe("Message your referrer");
    expect(requestNote(ask({ status: "approved", referrerId: 7, unreadMessageCount: 3 }), now)).toBe("3 new");
    expect(requestNote(ask({ status: "declined", referrerId: 7, referrerMessage: "Not my team" }), now)).toBe("Not my team");
    expect(requestNote(ask({ status: "pending", referrerId: 7, queueStatus: "available_for_review" }), now)).toBe("Available for review");
    expect(requestNote(ask({ queueStatus: "waiting_for_coverage" }), now)).toBe("Expires in 6 days · Waiting for coverage");
    expect(requestNote(ask({ status: "interview", referrerId: 7 }), now)).toMatch(/^Updated /);
  });

  it("counts conversations and expiring asks from the list alone", () => {
    const list = [ask({ status: "approved", referrerId: 7 }), ask({ status: "interview", referrerId: 7 }), ask({ status: "closed", referrerId: 7 }), ask({ status: "pending", referrerId: 7 }), ask({ id: 2, createdAt: new Date(now - 6 * day).toISOString() }), ask({ id: 3 })];
    expect(countInConversation(list)).toBe(2);
    expect(countExpiringSoon(list, now)).toBe(1);
  });

  it("meters open slots from the monthly wallet and names the next real plan", () => {
    expect(slotMeter(wallet({ monthlyCreditsRemaining: 1, totalAvailable: 1 }))).toMatchObject({ planLabel: "Free", open: 1, allowance: 3, full: false, nextPlan: { label: "Pro", monthlyAllowance: 10 } });
    const full = slotMeter(wallet({ monthlyCreditsRemaining: 0, totalAvailable: 0 }));
    expect(full).toMatchObject({ open: 0, full: true });
    expect(slotsFullCopy(full, true)).toEqual({ lead: "All 3 slots are in use.", next: "Wait for an unclaimed ask to expire, withdraw one, or get more slots with Pro (10)." });
    const max = slotMeter(wallet({ plan: "max", monthlyAllowance: 30, monthlyCreditsRemaining: 0, totalAvailable: 0, subscriptionCurrentTermEnd: "2026-11-01T00:00:00.000Z" }));
    expect(max.nextPlan).toBeNull();
    expect(max.renewsOn).not.toBeNull();
    expect(slotsFullCopy(max, false)).toEqual({ lead: "All 30 slots are in use.", next: "Add one-time credits." });
  });

  it("keeps the meter inside the allowance and only calls it full when no credit of any kind is left", () => {
    expect(slotMeter(wallet({ monthlyCreditsRemaining: 5, totalAvailable: 5 })).open).toBe(3);
    expect(slotMeter(wallet({ monthlyCreditsRemaining: -1, totalAvailable: 0 })).open).toBe(0);
    expect(slotMeter(wallet({ monthlyCreditsRemaining: 0, purchasedCreditsRemaining: 2, totalAvailable: 2 }))).toMatchObject({ open: 0, packCredits: 2, full: false });
  });

  it("rejects a malformed credit summary instead of drawing a fake meter", () => {
    expect(parseCreditSummary({ plan: "free", monthlyAllowance: "3" })).toBeNull();
    expect(parseCreditSummary(wallet({}))).toMatchObject({ plan: "free", monthlyAllowance: 3 });
  });
});
