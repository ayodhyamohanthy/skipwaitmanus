import { describe, expect, it } from "vitest";
import { companySlugFromDomain, fastTrackLinkMatchesCompany, isSafeFastTrackAlias, isVerifiedEmployeeOfCompany } from "./db";

describe("Referrer Fast-Track Link contract", () => {
  it("routes only to the exact normalized verified company domain", () => {
    expect(fastTrackLinkMatchesCompany("stripe.com", "stripe.com")).toBe(true);
    expect(fastTrackLinkMatchesCompany("Stripe.com", "stripe.com")).toBe(true);
    expect(fastTrackLinkMatchesCompany("stripe.com", "stripe.jobs")).toBe(false);
    expect(fastTrackLinkMatchesCompany("stripe.com", "linkedin.com")).toBe(false);
  });

  it("keeps eligibility limited to a verified Referrer at that exact company", () => {
    const verified = { accountType: "referrer", workEmailDomain: "stripe.com", workEmailVerifiedAt: new Date("2026-08-21T00:00:00.000Z") };
    expect(isVerifiedEmployeeOfCompany(verified, "stripe.com")).toBe(true);
    expect(isVerifiedEmployeeOfCompany({ ...verified, workEmailVerifiedAt: null }, "stripe.com")).toBe(false);
    expect(isVerifiedEmployeeOfCompany({ ...verified, workEmailDomain: "other.com" }, "stripe.com")).toBe(false);
  });

  it("uses a non-identifying company-scoped alias format and rejects reserved or identity-shaped route values", () => {
    expect(companySlugFromDomain("stripe.com")).toBe("stripe");
    expect(companySlugFromDomain("www.google.co.in")).toBe("google");
    expect(isSafeFastTrackAlias("ref-a1b2c3d4e5")).toBe(true);
    expect(isSafeFastTrackAlias("stripe-employee")).toBe(true);
    expect(isSafeFastTrackAlias("admin")).toBe(false);
    expect(isSafeFastTrackAlias("@employee")).toBe(false);
    expect(isSafeFastTrackAlias("a")).toBe(false);
  });
});
