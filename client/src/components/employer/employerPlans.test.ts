import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EMPLOYER_PLANS, employerPlanPriceLabel } from "./employerPlans";

/** The owner price book line under "## Employers (/for-companies)" in PRICING.md. */
function priceBookLine() {
  const doc = readFileSync(path.resolve(__dirname, "../../../../PRICING.md"), "utf8");
  const lines = doc.split("\n");
  const heading = lines.findIndex(line => line.trim() === "## Employers (/for-companies)");
  expect(heading).toBeGreaterThan(-1);
  return lines.slice(heading + 1).find(line => line.trim().length > 0)?.trim() ?? "";
}

describe("employer plan catalog", () => {
  it("matches the owner price book in PRICING.md", () => {
    const fromCatalog = EMPLOYER_PLANS.map(plan => `${plan.name} ${employerPlanPriceLabel(plan.price).toLowerCase()}`).join(" · ");
    expect(`${fromCatalog}.`).toBe(priceBookLine());
  });

  it("features exactly one plan and keeps ids unique", () => {
    expect(EMPLOYER_PLANS.filter(plan => plan.featured).map(plan => plan.id)).toEqual(["referral_programme"]);
    expect(new Set(EMPLOYER_PLANS.map(plan => plan.id)).size).toBe(EMPLOYER_PLANS.length);
  });

  it("labels every price kind", () => {
    expect(employerPlanPriceLabel({ kind: "free" })).toBe("Free");
    expect(employerPlanPriceLabel({ kind: "from", monthlyUsd: 199 })).toBe("From $199/mo");
    expect(employerPlanPriceLabel({ kind: "contact" })).toBe("Talk to us");
  });
});
