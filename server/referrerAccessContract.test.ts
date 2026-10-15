import { describe, expect, it } from "vitest";
import { isVerifiedReferrer, referrerAccessResponseSchema, type ReferrerAccessResponse } from "../shared/referrerAccess";

const verified: ReferrerAccessResponse = { verifiedCompanyAccess: true, workEmailDomain: "skipwait.me", companyName: "SkipWait", companyInitials: "SW" };

describe("referrer access contract", () => {
  it("round-trips the server response unchanged", () => {
    expect(referrerAccessResponseSchema.parse(JSON.parse(JSON.stringify(verified)))).toEqual(verified);
    const unverified: ReferrerAccessResponse = { verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null };
    expect(referrerAccessResponseSchema.parse(unverified)).toEqual(unverified);
  });

  it("reads absent directory and domain fields as null and drops unknown fields", () => {
    expect(referrerAccessResponseSchema.parse({ verifiedCompanyAccess: true, workEmailDomain: "acme.com", extra: "ignored" })).toEqual({ verifiedCompanyAccess: true, workEmailDomain: "acme.com", companyName: null, companyInitials: null });
    expect(referrerAccessResponseSchema.parse({ verifiedCompanyAccess: false })).toEqual({ verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null });
  });

  it("rejects a payload that does not say whether access is verified, instead of reading it as not verified", () => {
    expect(referrerAccessResponseSchema.safeParse({}).success).toBe(false);
    expect(referrerAccessResponseSchema.safeParse({ requests: [] }).success).toBe(false);
    expect(referrerAccessResponseSchema.safeParse({ error: "Sign in with your company email to continue" }).success).toBe(false);
    expect(referrerAccessResponseSchema.safeParse({ verifiedCompanyAccess: "true", workEmailDomain: "acme.com" }).success).toBe(false);
    expect(referrerAccessResponseSchema.safeParse({ verifiedCompanyAccess: true, workEmailDomain: 7 }).success).toBe(false);
    expect(referrerAccessResponseSchema.safeParse({ verifiedCompanyAccess: true, workEmailDomain: "acme.com", companyInitials: "TOOLONG" }).success).toBe(false);
  });

  it("counts a referrer as verified only when the server granted access for a company domain", () => {
    expect(isVerifiedReferrer(verified)).toBe(true);
    expect(isVerifiedReferrer({ verifiedCompanyAccess: false, workEmailDomain: "skipwait.me" })).toBe(false);
    expect(isVerifiedReferrer({ verifiedCompanyAccess: true, workEmailDomain: null })).toBe(false);
    expect(isVerifiedReferrer({ verifiedCompanyAccess: true, workEmailDomain: "" })).toBe(false);
    expect(isVerifiedReferrer(null)).toBe(false);
    expect(isVerifiedReferrer(undefined)).toBe(false);
  });
});
