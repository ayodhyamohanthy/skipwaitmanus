import { describe, expect, it } from "vitest";
import { SLOT_NUDGE_SELLABLE_PLAN_IDS, nextSlotPlan, openAskSlots, slotCapNudgeCopy, slotsFullCopy } from "../shared/openAskSlots";
import { planEntitlementsFor } from "../shared/planEntitlements";

describe("slot nudge only names plans that are on sale", () => {
  it("names no plan while no catalog plan is sellable", () => {
    expect(SLOT_NUDGE_SELLABLE_PLAN_IDS).toEqual([]);
    expect(nextSlotPlan(planEntitlementsFor("free"))).toBeNull();
    expect(nextSlotPlan(planEntitlementsFor("pro"))).toBeNull();
  });

  it("falls back to the wait-for-an-answer copy with no CTA", () => {
    const slots = openAskSlots(planEntitlementsFor("free"), 3);
    expect(slots).toMatchObject({ cap: 3, full: true, nextPlan: null });
    expect(slotCapNudgeCopy(slots)).toEqual({ title: "Your 3 requests are all open", body: "Wait for an answer to free a slot. Queue position stays equal either way.", cta: null });
    expect(slotsFullCopy(slots, true).next).toBe("Wait for an answer or withdraw an ask.");
  });
});
