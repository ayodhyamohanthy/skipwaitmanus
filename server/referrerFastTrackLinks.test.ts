import { describe, expect, it } from "vitest";
import { fastTrackLinkMatchesCompany, isVerifiedEmployeeOfCompany } from "./db";

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
});
