// D-128 + main 15:28: the new plan family is a flag-off, config-sourced
// catalog. These pins prove the names/prices come from one source, the flag
// defaults off, and Rs 1,299 belongs to Insider alone.
import { describe, expect, it } from "vitest";
import { PLAN_FAMILY, PLAN_FAMILY_IDS, planFamilyEntry, planFamilyV2Enabled } from "./planFamily";

describe("plan family (Open Door / Fast Track / Insider, flag OFF)", () => {
  it("locks the D-128 names in order", () => {
    expect(PLAN_FAMILY_IDS).toEqual(["open_door", "fast_track", "insider"]);
    expect(PLAN_FAMILY.map(plan => plan.label)).toEqual(["Open Door", "Fast Track", "Insider"]);
  });

  it("carries the decided monthly prices in both books", () => {
    expect(planFamilyEntry("open_door")).toMatchObject({ monthlyUsdCents: 0, monthlyInrPaise: 0 });
    expect(planFamilyEntry("fast_track")).toMatchObject({ monthlyUsdCents: 999, monthlyInrPaise: 49900 });
    expect(planFamilyEntry("insider")).toMatchObject({ monthlyUsdCents: 5900, monthlyInrPaise: 129900 });
  });

  it("Rs 1,299 (129900 paise) belongs to Insider and no other plan", () => {
    const carriers = PLAN_FAMILY.filter(plan => plan.monthlyInrPaise === 129900);
    expect(carriers.map(plan => plan.id)).toEqual(["insider"]);
  });

  it("never uses the retired working names", () => {
    expect(PLAN_FAMILY.map(plan => plan.label)).not.toContain("Inner Circle");
    expect(PLAN_FAMILY.map(plan => plan.label)).not.toContain("Reach");
  });

  it("the flag defaults off and reads only PLAN_FAMILY_V2", () => {
    expect(planFamilyV2Enabled({})).toBe(false);
    expect(planFamilyV2Enabled({ PLAN_FAMILY_V2: "false" })).toBe(false);
    expect(planFamilyV2Enabled({ PLAN_FAMILY_V2: "true" })).toBe(true);
  });
});
