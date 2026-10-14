import { describe, expect, it } from "vitest";
import { FREE_PLAN } from "@shared/planCatalog";
import { subscriptionPlanFromItemPrice } from "@shared/subscriptionPlans";
import { FREE_FACTS, KEEP_WARM_CARD, KIT_PLAN_CARDS, LAND_LEVELS, creditPackCards, humanProductCards, kitPlanCard, kitPlanItemPriceId, kitPlanPrice } from "./kitPlans";

describe("Kit v4 plan view model derives from the shared catalog", () => {
  it("renders Start / Momentum (featured) / Land Focus as the main grid", () => {
    expect(KIT_PLAN_CARDS.map(c => c.id)).toEqual(["start", "momentum", "land_100"]);
    expect(KIT_PLAN_CARDS.map(c => c.label)).toEqual(["Start", "Momentum", "Land Focus"]);
    expect(KIT_PLAN_CARDS.filter(c => c.featured).map(c => c.id)).toEqual(["momentum"]);
  });

  it("offers monthly and quarterly on the grid and yearly only on Keep warm", () => {
    expect(KIT_PLAN_CARDS[0].intervals).toEqual(["monthly", "quarterly"]);
    expect(KEEP_WARM_CARD.intervals).toEqual(["yearly"]);
    expect(KEEP_WARM_CARD.id).toBe("keep_warm");
  });

  it("exposes the three Land levels with human time on each", () => {
    expect(LAND_LEVELS.map(c => [c.id, c.label, c.openRequests])).toEqual([
      ["land_100", "Land Focus", 30],
      ["land_200", "Land Sprint", 50],
      ["land_500", "Land Concierge", 75],
    ]);
    expect(LAND_LEVELS.every(c => c.humanIncluded.length > 0)).toBe(true);
    expect(LAND_LEVELS.find(c => c.id === "land_500")?.applicationOnly).toBe(true);
  });

  it("prices each plan on the selected currency and interval, matching Chargebee", () => {
    expect(kitPlanPrice("start", "USD", "monthly")).toBe("$8/month");
    expect(kitPlanPrice("start", "INR", "quarterly")).toBe("₹699/quarter");
    expect(kitPlanPrice("keep_warm", "USD", "yearly")).toBe("$29/year");
    // The displayed price resolves to the same item price the server charges.
    const itemPriceId = kitPlanItemPriceId("momentum", "INR", "quarterly");
    expect(itemPriceId).toBe("skipwait_momentum_quarterly-INR");
    expect(subscriptionPlanFromItemPrice(itemPriceId)).toEqual({ plan: "momentum", currency: "INR", amount: 249_900, interval: "quarterly" });
  });

  it("shows per-currency credit packs with the first pack flagged", () => {
    expect(creditPackCards("USD").map(p => [p.credits, p.display, p.firstPack])).toEqual([
      [5, "$5", true],
      [25, "$22", false],
      [60, "$48", false],
      [150, "$105", false],
    ]);
    expect(creditPackCards("INR").map(p => [p.credits, p.display, p.firstPack])).toEqual([
      [2, "₹99", true],
      [25, "₹1,199", false],
      [60, "₹2,599", false],
      [150, "₹5,999", false],
    ]);
  });

  it("sells human review and session as separate one-time products", () => {
    expect(humanProductCards("USD").map(p => [p.id, p.display])).toEqual([
      ["review", "$49"],
      ["session", "$99"],
    ]);
    expect(humanProductCards("INR").map(p => [p.id, p.display])).toEqual([
      ["review", "₹799"],
      ["session", "₹1,499"],
    ]);
  });

  it("resolves a card by id and mirrors the Free facts", () => {
    expect(kitPlanCard("land_200")?.label).toBe("Land Sprint");
    expect(kitPlanCard("nope")).toBeUndefined();
    expect(FREE_FACTS.openRequests).toBe(FREE_PLAN.openRequests);
  });
});
