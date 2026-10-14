import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { nextSlotPlan, openAskSlots, openAskSlotsSchema, slotCapNudgeCopy, slotCapReachedSchema, slotsFullCopy } from "../shared/openAskSlots";
import { resolvePlanEntitlements, type EntitlementWallet } from "../shared/planEntitlements";
import { ASK_TTL_MS } from "../shared/referral";
import { OpenAskSlotCapError, openAskCondition } from "./planGates";

const NOW = new Date("2026-10-14T12:00:00.000Z");
const paid = (plan: string): EntitlementWallet => ({ plan, subscriptionStatus: "active", subscriptionCurrentTermEnd: new Date(NOW.getTime() + 864e5) });
const ent = (plan: string) => resolvePlanEntitlements(plan === "free" ? null : paid(plan), NOW);

describe("open-ask slots contract", () => {
  it("names the next plan with more room, from Momentum up (UPGRADE_NUDGES 'See Momentum')", () => {
    expect(nextSlotPlan(ent("free"))).toEqual({ id: "momentum", label: "Momentum", openRequests: 15 });
    expect(nextSlotPlan(ent("start"))).toEqual({ id: "momentum", label: "Momentum", openRequests: 15 });
    expect(nextSlotPlan(ent("pro"))).toEqual({ id: "momentum", label: "Momentum", openRequests: 15 });
    expect(nextSlotPlan(ent("momentum"))).toEqual({ id: "land_100", label: "Land Focus", openRequests: 30 });
    // Legacy Max already holds 30, so Land Focus (30) adds nothing; Sprint does.
    expect(nextSlotPlan(ent("max"))).toEqual({ id: "land_200", label: "Land Sprint", openRequests: 50 });
    expect(nextSlotPlan(ent("land_100"))).toEqual({ id: "land_200", label: "Land Sprint", openRequests: 50 });
    expect(nextSlotPlan(ent("land_200"))).toEqual({ id: "land_500", label: "Land Concierge", openRequests: null });
    expect(nextSlotPlan(ent("land_500"))).toBeNull();
  });

  it("is full only at or past a finite cap; unlimited is never full", () => {
    expect(openAskSlots(ent("free"), 2)).toMatchObject({ plan: "free", planLabel: "Free", open: 2, cap: 3, full: false });
    expect(openAskSlots(ent("free"), 3).full).toBe(true);
    expect(openAskSlots(ent("free"), 5).full).toBe(true);
    expect(openAskSlots(ent("land_500"), 900)).toMatchObject({ cap: null, full: false, nextPlan: null });
    expect(openAskSlots(ent("free"), -1).open).toBe(0);
    for (const plan of ["free", "start", "momentum", "land_100", "land_200", "land_500", "pro", "max"]) expect(openAskSlotsSchema.safeParse(openAskSlots(ent(plan), 1)).success).toBe(true);
  });

  it("writes the kit slots-full sentence with catalog numbers, naming only real options", () => {
    const full = openAskSlots(ent("free"), 3);
    expect(slotsFullCopy(full, true)).toEqual({ lead: "All 3 slots are in use.", next: "Wait for an answer, withdraw an ask, or get more slots with Momentum (15)." });
    expect(slotsFullCopy(full, false)).toEqual({ lead: "All 3 slots are in use.", next: "Wait for an answer or get more slots with Momentum (15)." });
    expect(slotsFullCopy(openAskSlots(ent("land_200"), 50), true).next).toBe("Wait for an answer, withdraw an ask, or get more slots with Land Concierge (unlimited).");
  });

  it("writes the UPGRADE_NUDGES slot-cap moment, saying queue position never changes", () => {
    expect(slotCapNudgeCopy(openAskSlots(ent("free"), 3))).toEqual({ title: "Your 3 requests are all open", body: "Wait for an answer to free a slot, or move to Momentum for 15 open requests. Queue position stays equal either way.", cta: "See Momentum" });
    expect(slotCapNudgeCopy(openAskSlots(ent("max"), 30)).cta).toBe("See Land Sprint");
    expect(slotCapNudgeCopy({ ...openAskSlots(ent("land_200"), 50), nextPlan: null })).toEqual({ title: "Your 50 requests are all open", body: "Wait for an answer to free a slot. Queue position stays equal either way.", cta: null });
  });

  it("the 409 body is a strict, typed contract", () => {
    const slots = openAskSlots(ent("free"), 3);
    const error = new OpenAskSlotCapError(slots);
    expect(slotCapReachedSchema.parse({ error: error.message, code: error.code, slots: error.slots }).slots).toEqual(slots);
    expect(slotCapReachedSchema.safeParse({ error: "x", code: "credits", slots }).success).toBe(false);
    expect(slotCapReachedSchema.safeParse({ error: "x", code: "slot_cap_reached", slots: { ...slots, cap: 0 } }).success).toBe(false);
  });
});

describe("open-ask predicate", () => {
  it("counts only the one seeker's pending, unexpired asks; claimed asks never expire", () => {
    const query = new MySqlDialect().sqlToQuery(openAskCondition(7, NOW.getTime()));
    expect(query.sql).toBe("(`referralRequests`.`jobSeekerId` = ? and `referralRequests`.`status` = ? and (`referralRequests`.`referrerId` is not null or `referralRequests`.`createdAt` > ?))");
    expect(query.params).toEqual([7, "pending", "2026-10-07 12:00:00.000"]);
    expect(Date.parse(`${String(query.params[2]).replace(" ", "T")}Z`)).toBe(NOW.getTime() - ASK_TTL_MS);
    expect(new MySqlDialect().sqlToQuery(openAskCondition(8, NOW.getTime())).params[0]).toBe(8);
  });
});
