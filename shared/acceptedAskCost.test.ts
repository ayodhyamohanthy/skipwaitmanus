import { describe, expect, it } from "vitest";
import { acceptedAskCostSchema, sameAcceptedAskCost } from "./acceptedAskCost";

describe("accepted banded referral allocation", () => {
  const included = { units: 1, band: "early", source: [{ bucket: "included", units: 1, cycleKey: "cycle-one" }] };
  it("round trips the actual source and cycle", () => {
    const cost = acceptedAskCostSchema.parse(included);
    expect(acceptedAskCostSchema.parse(JSON.parse(JSON.stringify(cost)))).toEqual(cost);
    expect(sameAcceptedAskCost(cost, cost)).toBe(true);
    expect(sameAcceptedAskCost(cost, { ...cost, source: [{ bucket: "included", units: 1, cycleKey: "cycle-two" }] })).toBe(false);
    expect(sameAcceptedAskCost(cost, { ...cost, band: "senior" })).toBe(false);
  });
  it.each([
    { ...included, units: 2 },
    { ...included, units: 0 },
    { ...included, band: null },
    { ...included, unexpected: true },
    { ...included, source: [{ bucket: "included", units: 1, cycleKey: null }] },
    { ...included, source: [{ bucket: "purchased", units: 1, cycleKey: "cycle" }] },
    { ...included, source: [{ bucket: "free", units: 1, cycleKey: "" }] },
  ])("rejects malformed confirmations %#", value => {
    expect(acceptedAskCostSchema.safeParse(value).success).toBe(false);
  });
  it("accepts a no-charge waiting representation", () => {
    expect(acceptedAskCostSchema.parse({ units: 0, band: "executive", source: [] })).toEqual({ units: 0, band: "executive", source: [] });
  });
});
