import fs from "node:fs";
import { describe, expect, it } from "vitest";
const db = fs.readFileSync(new URL("./db.ts", import.meta.url), "utf8");
describe("sponsorship purchase integrity", () => {
  const body = db.slice(db.indexOf("export async function sponsorCompanyOpportunity"), db.indexOf("export async function endCompanyOpportunitySponsorship"));
  it("locks and checks an active opportunity before charging", () => { expect(body).toContain('.for("update")'); expect(body).toContain("if (!opportunity.isActive)"); expect(body.indexOf("if (!opportunity.isActive)")).toBeLessThan(body.indexOf("employerAccounts.credits} -")); });
  it("claims an immutable idempotent entitlement and extends paid time", () => { expect(body).toContain("tx.insert(opportunitySponsorshipPurchases)"); expect(body).toContain("eq(opportunitySponsorshipPurchases.idempotencyKey, input.idempotencyKey)"); expect(body).toContain("opportunity.sponsoredUntil > purchasedAt ? opportunity.sponsoredUntil : purchasedAt"); });
  it("binds payer and benefit owner and guards concurrent opportunity changes", () => { expect(body).toContain("chargedUserId"); expect(body).toContain("opportunityOwnerId: opportunity.ownerId"); expect(body).toContain("eq(companyOpportunities.updatedAt, opportunity.updatedAt)"); });
});
