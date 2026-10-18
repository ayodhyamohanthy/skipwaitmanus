import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { CATALOG_PLAN_IDS } from "../shared/planCatalog";
import { COMPANY_CAP_REACHED, companyCapCopy, companyCapReachedSchema, nextSlotPlan, nextSlotPlanAmong, openAskSlots, openAskSlotsSchema, slotCapNudgeCopy, slotCapReachedSchema, slotsFullCopy } from "../shared/openAskSlots";
import { resolvePlanEntitlements, type EntitlementWallet } from "../shared/planEntitlements";
import { ASK_TTL_MS } from "../shared/referral";
import { HELD_ASK_HISTORY_SINCE } from "./heldAsk";
import { OpenAskSlotCapError, openAskCondition } from "./planGates";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const paid = (plan: string): EntitlementWallet => ({ plan, subscriptionStatus: "active", subscriptionCurrentTermEnd: new Date(NOW.getTime() + 864e5) });
const ent = (plan: string) => resolvePlanEntitlements(plan === "free" ? null : paid(plan), NOW);
// The catalog walk and copy, as they read once every plan is on sale. What the live nudge names today is pinned in openAskSlots.sellable.test.ts.
const ALL_ON_SALE = CATALOG_PLAN_IDS;
const slotsOnSale = (entitlements: ReturnType<typeof ent>, open: number) => ({ ...openAskSlots(entitlements, open), nextPlan: nextSlotPlanAmong(entitlements, ALL_ON_SALE) });

describe("open-ask slots contract", () => {
  it("names the next self-serve plan with more room, from Start up (UPGRADE_NUDGES 'See Start')", () => {
    expect(nextSlotPlanAmong(ent("free"), ALL_ON_SALE)).toEqual({ id: "start", label: "Start", openRequests: 8 });
    expect(nextSlotPlanAmong(ent("keep_warm"), ALL_ON_SALE)).toEqual({ id: "start", label: "Start", openRequests: 8 });
    expect(nextSlotPlanAmong(ent("start"), ALL_ON_SALE)).toEqual({ id: "momentum", label: "Momentum", openRequests: 15 });
    // Legacy Pro holds 10 (above Start's 8), so the next plan with more room is Momentum.
    expect(nextSlotPlanAmong(ent("pro"), ALL_ON_SALE)).toEqual({ id: "momentum", label: "Momentum", openRequests: 15 });
    expect(nextSlotPlanAmong(ent("momentum"), ALL_ON_SALE)).toEqual({ id: "land_focus", label: "Land Focus", openRequests: 30 });
    // Legacy Max already holds 30, so Land Focus (30) adds nothing; Sprint does.
    expect(nextSlotPlanAmong(ent("max"), ALL_ON_SALE)).toEqual({ id: "land_sprint", label: "Land Sprint", openRequests: 50 });
    expect(nextSlotPlanAmong(ent("land_focus"), ALL_ON_SALE)).toEqual({ id: "land_sprint", label: "Land Sprint", openRequests: 50 });
    // Concierge is by application: no nudge points at it.
    expect(nextSlotPlanAmong(ent("land_sprint"), ALL_ON_SALE)).toBeNull();
    expect(nextSlotPlanAmong(ent("land_concierge"), ALL_ON_SALE)).toBeNull();
  });

  it("is full at or past the cap; every plan has a cap (Concierge 75)", () => {
    expect(slotsOnSale(ent("free"), 2)).toMatchObject({ plan: "free", planLabel: "Free", open: 2, cap: 3, full: false });
    expect(slotsOnSale(ent("free"), 3).full).toBe(true);
    expect(slotsOnSale(ent("free"), 5).full).toBe(true);
    expect(slotsOnSale(ent("land_concierge"), 74)).toMatchObject({ cap: 75, full: false, nextPlan: null });
    expect(slotsOnSale(ent("land_concierge"), 75).full).toBe(true);
    expect(openAskSlots(ent("free"), -1).open).toBe(0);
    for (const plan of ["free", "keep_warm", "start", "momentum", "land_focus", "land_sprint", "land_concierge", "pro", "max"]) expect(openAskSlotsSchema.safeParse(openAskSlots(ent(plan), 1)).success).toBe(true);
    expect(openAskSlotsSchema.safeParse({ ...slotsOnSale(ent("free"), 1), cap: null }).success).toBe(false);
  });

  it("writes the kit slots-full sentence with catalog numbers, naming only real options", () => {
    const full = slotsOnSale(ent("free"), 3);
    expect(slotsFullCopy(full, true)).toEqual({ lead: "All 3 slots are in use.", next: "Wait for an answer, withdraw an ask, or get more slots with Start (8)." });
    expect(slotsFullCopy(full, false)).toEqual({ lead: "All 3 slots are in use.", next: "Wait for an answer or get more slots with Start (8)." });
    expect(slotsFullCopy(slotsOnSale(ent("land_focus"), 30), true).next).toBe("Wait for an answer, withdraw an ask, or get more slots with Land Sprint (50).");
    expect(slotsFullCopy(slotsOnSale(ent("land_sprint"), 50), true).next).toBe("Wait for an answer or withdraw an ask.");
  });

  it("writes the UPGRADE_NUDGES slot-cap moment, saying queue position never changes", () => {
    expect(slotCapNudgeCopy(slotsOnSale(ent("free"), 3))).toEqual({ title: "Your 3 requests are all open", body: "Wait for an answer to free a slot, or move to Start for 8 open requests. Queue position stays equal either way.", cta: "See Start" });
    expect(slotCapNudgeCopy(slotsOnSale(ent("max"), 30)).cta).toBe("See Land Sprint");
    expect(slotCapNudgeCopy(slotsOnSale(ent("land_sprint"), 50))).toEqual({ title: "Your 50 requests are all open", body: "Wait for an answer to free a slot. Queue position stays equal either way.", cta: null });
  });

  it("a running reverse trial meters 15 slots and nudges past Momentum", () => {
    const trial = resolvePlanEntitlements({ plan: "free", subscriptionStatus: null, subscriptionCurrentTermEnd: null, trialEndsAt: new Date(NOW.getTime() + 864e5) }, NOW);
    expect(slotsOnSale(trial, 4)).toMatchObject({ plan: "free", planLabel: "Momentum trial", cap: 15, full: false, nextPlan: { id: "land_focus", openRequests: 30 } });
  });

  it("the 409 body is a strict, typed contract", () => {
    const slots = openAskSlots(ent("free"), 3);
    const error = new OpenAskSlotCapError(slots);
    expect(slotCapReachedSchema.parse({ error: error.message, code: error.code, slots: error.slots }).slots).toEqual(slots);
    expect(slotCapReachedSchema.safeParse({ error: "x", code: "credits", slots }).success).toBe(false);
    expect(slotCapReachedSchema.safeParse({ error: "x", code: "slot_cap_reached", slots: { ...slots, cap: 0 } }).success).toBe(false);
  });
});

describe("per-company cap contract (every plan)", () => {
  it("the 409 body names the company, the caller's own open count and the shared cap of 2", () => {
    const body = { error: companyCapCopy("acme.com"), code: COMPANY_CAP_REACHED, companyDomain: "acme.com", open: 2, cap: 2 };
    expect(companyCapReachedSchema.parse(body)).toEqual(body);
    expect(companyCapReachedSchema.safeParse({ ...body, cap: 3 }).success).toBe(false);
    expect(companyCapReachedSchema.safeParse({ ...body, plan: "momentum" }).success).toBe(false);
    expect(companyCapCopy("acme.com")).toBe("You already have 2 open asks at acme.com. Wait for an answer or withdraw one before asking there again. This limit is the same on every plan.");
  });
});

describe("open-ask predicate", () => {
  it("counts only the one seeker's pending, unexpired, covered asks; waiting asks never hold a slot; claimed, queue-allocated and pre-history assigned asks never expire, a held personal-link ask does (D-050/D-061)", () => {
    const query = new MySqlDialect().sqlToQuery(openAskCondition(7, NOW.getTime()));
    expect(query.sql).toBe("(`referralRequests`.`jobSeekerId` = ? and `referralRequests`.`status` = ? and `referralRequests`.`waitingForCoverage` = ? and ((`referralRequests`.`referrerId` is not null and (`referralRequests`.`createdAt` < ? or exists (select 1 from `referralTransitionEvents` where `referralTransitionEvents`.`referralRequestId` = `referralRequests`.`id` and `referralTransitionEvents`.`action` = ?) or exists (select 1 from `referralAvailabilitySlots` where `referralAvailabilitySlots`.`referralRequestId` = `referralRequests`.`id` and `referralAvailabilitySlots`.`status` = ?))) or (`referralRequests`.`coverageVisibleAt` is not null and `referralRequests`.`coverageVisibleAt` > ?) or (`referralRequests`.`coverageVisibleAt` is null and `referralRequests`.`createdAt` > ?)))");
    expect(query.params).toEqual([7, "pending", false, "2026-09-21 00:00:00.000", "claim", "allocated", "2026-10-07 12:00:00.000", "2026-10-07 12:00:00.000"]);
    expect(Date.parse(`${String(query.params[3]).replace(" ", "T")}Z`)).toBe(HELD_ASK_HISTORY_SINCE.getTime());
    // D-061: the 7-day clock runs from first visibility; pre-0095 rows (no coverageVisibleAt) keep the creation clock.
    expect(Date.parse(`${String(query.params[6]).replace(" ", "T")}Z`)).toBe(NOW.getTime() - ASK_TTL_MS);
    expect(Date.parse(`${String(query.params[7]).replace(" ", "T")}Z`)).toBe(NOW.getTime() - ASK_TTL_MS);
    expect(new MySqlDialect().sqlToQuery(openAskCondition(8, NOW.getTime())).params[0]).toBe(8);
  });
});
