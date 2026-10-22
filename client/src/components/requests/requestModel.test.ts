import { describe, expect, it } from "vitest";
import { nextSlotPlanAmong, openAskSlots, type OpenAskSlots } from "@shared/openAskSlots";
import { resolvePlanEntitlements } from "@shared/planEntitlements";
import { canWithdrawRequest, countExpiringSoon, countInConversation, isUrgentExpiry, requestNote, requestPillStatus, slotMeter, slotsFullCopy } from "./requestModel";
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
    // D-061: a waiting ask closes after 90 days, so the row shows no 7-day countdown.
    expect(requestNote(ask({ queueStatus: "waiting_for_coverage" }), now)).toBe("Waiting for coverage");
    // D-047: an available employee exists but the ask waits for a credit — the row says the next step.
    expect(requestNote(ask({ queueStatus: "held_for_credit" }), now)).toBe("Add a credit to send it");
    expect(requestNote(ask({ status: "interview", referrerId: 7 }), now)).toMatch(/^Updated /);
  });

  it("runs the 7-day clock from first visibility and skips waiting asks (D-061)", () => {
    // Sent 10 days ago, first visible 6.5 days ago: inside the last day, so urgent.
    const delivered = ask({ id: 9, createdAt: new Date(now - 10 * day).toISOString(), coverageVisibleAt: new Date(now - 6.5 * day).toISOString(), waitingForCoverage: false });
    expect(isUrgentExpiry(delivered, now)).toBe(true);
    // A waiting ask has no 7-day clock at all, however old it is.
    const waiting = ask({ id: 10, queueStatus: "waiting_for_coverage", waitingForCoverage: true, createdAt: new Date(now - 6.9 * day).toISOString(), expiresAt: new Date(now + day).toISOString() });
    expect(isUrgentExpiry(waiting, now)).toBe(false);
    expect(countExpiringSoon([waiting], now)).toBe(0);
  });

  it("counts conversations and expiring asks from the list alone", () => {
    const list = [ask({ status: "approved", referrerId: 7 }), ask({ status: "interview", referrerId: 7 }), ask({ status: "closed", referrerId: 7 }), ask({ status: "pending", referrerId: 7 }), ask({ id: 2, createdAt: new Date(now - 6 * day).toISOString() }), ask({ id: 3 })];
    expect(countInConversation(list)).toBe(2);
    expect(countExpiringSoon(list, now)).toBe(1);
  });

  it("treats a personal-link ask its employee has not acted on as unclaimed: withdrawable, with its countdown (D-050)", () => {
    const held = ask({ referrerId: 7, queueStatus: "available_for_review", heldForReferrer: true });
    expect(canWithdrawRequest(held)).toBe(true);
    expect(requestNote(held, now)).toBe("Expires in 6 days");
    const lastDays = ask({ id: 2, referrerId: 7, queueStatus: "available_for_review", heldForReferrer: true, createdAt: new Date(now - 6.5 * day).toISOString() });
    expect(isUrgentExpiry(lastDays, now)).toBe(true);
    expect(countExpiringSoon([held, lastDays], now)).toBe(1);
    // An assigned ask without the flag (claimed, or a payload from before the flag) keeps today's reading.
    const claimed = ask({ referrerId: 7, queueStatus: "available_for_review" });
    expect(canWithdrawRequest(claimed)).toBe(false);
    expect(requestNote(claimed, now)).toBe("Available for review");
    expect(isUrgentExpiry({ ...lastDays, heldForReferrer: undefined }, now)).toBe(false);
    expect(canWithdrawRequest(ask({ status: "approved", referrerId: 7, heldForReferrer: true }))).toBe(false);
  });

  it("meters open asks against the plan cap and fills the slots in use (kit OPEN SLOTS · FREE 2/3)", () => {
    expect(slotMeter(slots("free", 0))).toEqual({ label: "OPEN SLOTS · FREE", open: 0, cap: 3, filled: 0, full: false });
    expect(slotMeter(slots("free", 2))).toEqual({ label: "OPEN SLOTS · FREE", open: 2, cap: 3, filled: 2, full: false });
    expect(slotMeter(slots("free", 3))).toMatchObject({ filled: 3, full: true });
    // Asks opened on a richer plan stay open after a downgrade: the meter never overfills.
    expect(slotMeter(slots("free", 5))).toMatchObject({ open: 5, filled: 3, full: true });
    expect(slotMeter(slots("start", 4))).toEqual({ label: "OPEN SLOTS · START", open: 4, cap: 8, filled: 4, full: false });
    expect(slotMeter(slots("land_sprint", 7)).label).toBe("OPEN SLOTS · LAND SPRINT");
    // Concierge holds 75 open asks (no plan is unlimited).
    expect(slotMeter(slots("land_concierge", 80))).toMatchObject({ cap: 75, filled: 75, full: true });
  });

  it("writes the kit slots-full nudge with the next plan and its cap from the catalog", () => {
    // As it reads once the plans are on sale; the live server names none until then.
    const onSale = (plan: string, open: number): OpenAskSlots => {
      const base = slots(plan, open);
      const entitlements = resolvePlanEntitlements(plan === "free" ? null : { plan, subscriptionStatus: "active", subscriptionCurrentTermEnd: termEnd }, new Date(now));
      return { ...base, nextPlan: nextSlotPlanAmong(entitlements, ["start", "momentum", "land_focus", "land_sprint"]) };
    };
    expect(slotsFullCopy(onSale("free", 3), true)).toEqual({ lead: "All 3 slots are in use.", next: "Wait for an answer, withdraw an ask, or get more slots with Start (8)." });
    expect(slotsFullCopy(onSale("free", 3), false)).toEqual({ lead: "All 3 slots are in use.", next: "Wait for an answer or get more slots with Start (8)." });
    expect(slotsFullCopy(onSale("momentum", 15), true).next).toBe("Wait for an answer, withdraw an ask, or get more slots with Land Focus (30).");
    expect(slotsFullCopy(slots("free", 3), true).next).toBe("Wait for an answer or withdraw an ask.");
  });
});
