import { describe, expect, it } from "vitest";
import { companyReferralRequestBodySchema } from "./companyReferralRequest";

describe("companyReferralRequestBodySchema (POST /api/company-referrals body)", () => {
  const base = {
    targetRoleUrl: "https://careers.acme.com/jobs/123",
    attachmentIds: [1],
    personalPitch: "I would love to join your engineering team.",
  };

  it("accepts a standard referral request body", () => {
    const result = companyReferralRequestBodySchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("accepts a body carrying an optional catalogJobId", () => {
    const result = companyReferralRequestBodySchema.safeParse({
      ...base,
      catalogJobId: 42,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.catalogJobId).toBe(42);
    }
  });

  it("accepts an optional opportunityId", () => {
    const result = companyReferralRequestBodySchema.safeParse({
      ...base,
      opportunityId: 99,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.opportunityId).toBe(99);
    }
  });

  it("refuses unknown fields", () => {
    const result = companyReferralRequestBodySchema.safeParse({
      ...base,
      unknownField: "not_allowed",
    });
    expect(result.success).toBe(false);
  });

  it("refuses a non-positive integer catalogJobId", () => {
    expect(companyReferralRequestBodySchema.safeParse({ ...base, catalogJobId: 0 }).success).toBe(false);
    expect(companyReferralRequestBodySchema.safeParse({ ...base, catalogJobId: -5 }).success).toBe(false);
    expect(companyReferralRequestBodySchema.safeParse({ ...base, catalogJobId: 1.5 }).success).toBe(false);
    expect(companyReferralRequestBodySchema.safeParse({ ...base, catalogJobId: "42" }).success).toBe(false);
  });
});
