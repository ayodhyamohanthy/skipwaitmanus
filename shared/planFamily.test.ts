// D-128 + main 15:28: the new plan family is a flag-off, config-sourced
// catalog. These pins prove the names/prices come from one source, the flag
// defaults off, and Rs 1,299 belongs to Insider alone.
import { describe, expect, it } from "vitest";
import { PLAN_BENEFIT_CAPS, PLAN_BENEFIT_TOOL_IDS, PLAN_CAP_OVERAGE, PLAN_FAMILY, PLAN_FAMILY_IDS, planBenefitCaps, planFamilyEntry, planFamilyV2Enabled } from "./planFamily";

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

describe("benefit caps (growth table via main, Oct 21)", () => {
  it("locks the cap table verbatim", () => {
    expect(PLAN_BENEFIT_CAPS.open_door).toEqual({
      openAsks: 3,
      tools: { ask_coach: 0, profile_check: 0, resume_tailoring: 0, follow_up_drafts: 0, company_brief: 0, interview_dossier: 0, mock_interview: 0, offer_comparison: 0, salary_coach: 0 },
    });
    expect(PLAN_BENEFIT_CAPS.fast_track).toEqual({
      openAsks: 4,
      tools: { ask_coach: 10, profile_check: 2, resume_tailoring: 3, follow_up_drafts: 6, company_brief: 0, interview_dossier: 0, mock_interview: 0, offer_comparison: 0, salary_coach: 0 },
    });
    expect(PLAN_BENEFIT_CAPS.insider).toEqual({
      openAsks: 6,
      tools: { ask_coach: 30, profile_check: 4, resume_tailoring: 10, follow_up_drafts: 20, company_brief: 10, interview_dossier: 4, mock_interview: 4, offer_comparison: 2, salary_coach: 2 },
    });
  });

  it("covers every benefit tool on every plan, monotonic across tiers", () => {
    for (const plan of PLAN_FAMILY_IDS) {
      for (const tool of PLAN_BENEFIT_TOOL_IDS) {
        expect(typeof PLAN_BENEFIT_CAPS[plan].tools[tool]).toBe("number");
      }
    }
    for (const tool of PLAN_BENEFIT_TOOL_IDS) {
      expect(PLAN_BENEFIT_CAPS.open_door.tools[tool]).toBeLessThanOrEqual(PLAN_BENEFIT_CAPS.fast_track.tools[tool]);
      expect(PLAN_BENEFIT_CAPS.fast_track.tools[tool]).toBeLessThanOrEqual(PLAN_BENEFIT_CAPS.insider.tools[tool]);
    }
    expect(PLAN_BENEFIT_CAPS.open_door.openAsks).toBeLessThanOrEqual(PLAN_BENEFIT_CAPS.fast_track.openAsks);
    expect(PLAN_BENEFIT_CAPS.fast_track.openAsks).toBeLessThanOrEqual(PLAN_BENEFIT_CAPS.insider.openAsks);
  });

  it("planBenefitCaps returns the plan's row", () => {
    expect(planBenefitCaps("fast_track").tools.ask_coach).toBe(10);
  });

  it("bills over-cap usage from normal credits", () => {
    expect(PLAN_CAP_OVERAGE).toBe("credits");
  });
});

describe("plan service model + included features", () => {
  it("Insider is automated-only; the other plans keep the normal flow", () => {
    expect(planFamilyEntry("insider").automatedOnly).toBe(true);
    expect(planFamilyEntry("open_door").automatedOnly).toBe(false);
    expect(planFamilyEntry("fast_track").automatedOnly).toBe(false);
  });

  it("stealth is Insider-only; reach-up is Fast Track and Insider", () => {
    expect(planFamilyEntry("insider").includes).toEqual({ stealth: true, reachUp: true });
    expect(planFamilyEntry("fast_track").includes).toEqual({ stealth: false, reachUp: true });
    expect(planFamilyEntry("open_door").includes).toEqual({ stealth: false, reachUp: false });
  });
});
