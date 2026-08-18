import { describe, expect, it } from "vitest";
import { isVerifiedEmployeeOfCompany } from "./db";

describe("private referral employee eligibility", () => {
  const verifiedAt = new Date("2026-08-18T00:00:00.000Z");

  it("allows only a verified Referrer whose exact work-email domain matches the resolved employer", () => {
    expect(isVerifiedEmployeeOfCompany({ accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: verifiedAt }, "acme.com")).toBe(true);
    expect(isVerifiedEmployeeOfCompany({ accountType: "referrer", workEmailDomain: "acme.io", workEmailVerifiedAt: verifiedAt }, "acme.com")).toBe(false);
    expect(isVerifiedEmployeeOfCompany({ accountType: "referrer", workEmailDomain: "linkedin.com", workEmailVerifiedAt: verifiedAt }, "acme.com")).toBe(false);
    expect(isVerifiedEmployeeOfCompany({ accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: null }, "acme.com")).toBe(false);
    expect(isVerifiedEmployeeOfCompany({ accountType: "job_seeker", workEmailDomain: "acme.com", workEmailVerifiedAt: verifiedAt }, "acme.com")).toBe(false);
  });
});
