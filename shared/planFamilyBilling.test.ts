import { describe, expect, it } from "vitest";
import { PLAN_CREDIT_LADDER, PLAN_CREDIT_RUNGS, PLAN_FAMILY } from "./planFamily";
import { monthlyTotal, packItemPriceId, parseV2ItemPriceId, planCreditsItemPriceId, planItemPriceId, v2ItemPriceIds } from "./planFamilyBilling";

describe("D-132 item price identities", () => {
  it("round-trips every generated id through the parser with the ladder/plan amount", () => {
    for (const id of v2ItemPriceIds()) {
      const parsed = parseV2ItemPriceId(id);
      expect(parsed, id).toBeTruthy();
      if (parsed!.kind === "plan") {
        const plan = PLAN_FAMILY.find(entry => entry.id === parsed!.planId)!;
        expect(parsed!.amount).toBe(parsed!.currency === "INR" ? plan.monthlyInrPaise : plan.monthlyUsdCents);
        expect(parsed!.recurring).toBe(true);
      } else {
        const rung = PLAN_CREDIT_LADDER.find(entry => entry.credits === parsed!.rung)!;
        expect(parsed!.amount).toBe(parsed!.currency === "INR" ? rung.inrPaise : rung.usdCents);
        expect(parsed!.recurring).toBe(parsed!.kind === "planCredits");
      }
    }
  });

  it("covers both currencies, both paid plans, and every rung for credits and packs", () => {
    const ids = v2ItemPriceIds();
    // 2 currencies x (2 paid plans + 6 credit rungs + 6 pack rungs)
    expect(ids).toHaveLength(2 * (2 + PLAN_CREDIT_RUNGS.length * 2));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("skipwait_v2plan_fast_track-INR");
    expect(ids).toContain("skipwait_v2plan_insider-USD");
    expect(ids).toContain("skipwait_v2credits_25-INR");
    expect(ids).toContain("skipwait_v2pack_200-USD");
  });

  it("refuses the free plan and foreign ids", () => {
    expect(parseV2ItemPriceId("skipwait_v2plan_open_door-INR")).toBeUndefined();
    expect(parseV2ItemPriceId("skipwait_v2pack_7-INR")).toBeUndefined();
    expect(parseV2ItemPriceId("skipwait_token_1-INR")).toBeUndefined();
    expect(parseV2ItemPriceId("skipwait_pack_25")).toBeUndefined();
    expect(parseV2ItemPriceId("")).toBeUndefined();
  });

  it("matches the frozen ladder and plan fees exactly", () => {
    expect(parseV2ItemPriceId(packItemPriceId(5, "INR"))).toMatchObject({ amount: 24_000 });
    expect(parseV2ItemPriceId(packItemPriceId(200, "INR"))).toMatchObject({ amount: 784_000 });
    expect(parseV2ItemPriceId(planCreditsItemPriceId(25, "USD"))).toMatchObject({ amount: 2_300, recurring: true });
    expect(parseV2ItemPriceId(planItemPriceId("fast_track", "INR"))).toMatchObject({ amount: 49_900 });
    expect(parseV2ItemPriceId(planItemPriceId("insider", "USD"))).toMatchObject({ amount: 5_900 });
  });

  it("computes the 'This month' total as plan fee + picked rung", () => {
    expect(monthlyTotal("fast_track", 25, "INR")).toBe(49_900 + 112_500);
    expect(monthlyTotal("insider", 0, "USD")).toBe(5_900);
    expect(monthlyTotal("open_door", 0, "INR")).toBe(0);
  });
});

describe("classifyV2SubscriptionItems", () => {
  it("classifies the D-132 bundle into plan + credits and leaves kit ids alone", async () => {
    const { classifyV2SubscriptionItems, planItemPriceId, planCreditsItemPriceId } = await import("./planFamilyBilling");
    const bundle = classifyV2SubscriptionItems([planItemPriceId("fast_track", "INR"), planCreditsItemPriceId(25, "INR")]);
    expect(bundle.plan).toMatchObject({ kind: "plan", planId: "fast_track", currency: "INR", recurring: true });
    expect(bundle.credits).toMatchObject({ kind: "planCredits", rung: 25, currency: "INR", recurring: true });
    expect(classifyV2SubscriptionItems([planItemPriceId("insider", "USD")])).toEqual({ plan: expect.objectContaining({ planId: "insider" }), credits: undefined });
    expect(classifyV2SubscriptionItems(["skipwait_start_30d-INR", "nope"])).toEqual({ plan: undefined, credits: undefined });
    expect(classifyV2SubscriptionItems([])).toEqual({ plan: undefined, credits: undefined });
  });
});
