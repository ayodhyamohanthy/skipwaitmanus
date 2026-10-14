import { describe, expect, it } from "vitest";
import { openAskSlots, type OpenAskSlots } from "@shared/openAskSlots";
import { resolvePlanEntitlements } from "@shared/planEntitlements";
import { countExpiringSoon, countInConversation, requestNote, requestPillStatus, slotMeter, slotsFullCopy } from "./requestModel";
import type { ReferralRequest } from "./requestsApi";

const now = Date.parse("2026-10-08T04:30:00.000Z");
const day = 24 * 60 * 60 * 1000;
const ask = (patch: Partial<ReferralRequest>): ReferralRequest => ({ id: 1, title: "Designer", targetRoleUrl: null, companyDomain: "acme.com", compensation: null, status: "pending", referrerId: null, queueStatus: null, referrerMessage: null, unreadMessageCount: 0, createdAt: new Date(now - day).toISOString(), updatedAt: new Date(now - day).toISOString(), attachmentCount: 1, expiresAt: null, ...patch });
const termEnd = new Date(now + 20 * day);
const slots = (plan: string, open: number): OpenAskSlots => openAskSlots(resolvePlanEntitlements(plan === "free" ? null : { plan, subscriptionStatus: "active", subscriptionCurrentTermEnd: termEnd }, new Date(now)), open);

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

  it("meters open asks against the plan cap and fills the slots in use (kit OPEN SLOTS · FREE 2/3)", () => {
    expect(slotMeter(slots("free", 0))).toEqual({ label: "OPEN SLOTS · FREE", open: 0, cap: 3, filled: 0, full: false });
    expect(slotMeter(slots("free", 2))).toEqual({ label: "OPEN SLOTS · FREE", open: 2, cap: 3, filled: 2, full: false });
    expect(slotMeter(slots("free", 3))).toMatchObject({ filled: 3, full: true });
    // Asks opened on a richer plan stay open after a downgrade: the meter never overfills.
    expect(slotMeter(slots("free", 5))).toMatchObject({ open: 5, filled: 3, full: true });
    expect(slotMeter(slots("pro", 4))).toEqual({ label: "OPEN SLOTS · PRO", open: 4, cap: 10, filled: 4, full: false });
    expect(slotMeter(slots("land_sprint", 7)).label).toBe("OPEN SLOTS · LAND SPRINT");
    // Concierge holds 75 open asks (no plan is unlimited).
    expect(slotMeter(slots("land_concierge", 80))).toMatchObject({ cap: 75, filled: 75, full: true });
  });

  it("writes the kit slots-full nudge with the next plan and its cap from the catalog", () => {
    expect(slotsFullCopy(slots("free", 3), true)).toEqual({ lead: "All 3 slots are in use.", next: "Wait for an answer, withdraw an ask, or get more slots with Start (8)." });
    expect(slotsFullCopy(slots("free", 3), false)).toEqual({ lead: "All 3 slots are in use.", next: "Wait for an answer or get more slots with Start (8)." });
    expect(slotsFullCopy(slots("max", 30), true).next).toBe("Wait for an answer, withdraw an ask, or get more slots with Land Sprint (50).");
  });
});
