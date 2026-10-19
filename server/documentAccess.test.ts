import { describe, expect, it } from "vitest";
import { canAccessReferralAttachment } from "./db";

describe("private referral document access", () => {
  const attachment = { ownerId: 12, referrerId: 28, requestStatus: "approved" };

  it("allows the Job Seeker who owns the document", () => {
    expect(canAccessReferralAttachment(12, attachment)).toBe(true);
    expect(canAccessReferralAttachment(12, { ...attachment, requestStatus: "pending" })).toBe(true);
  });

  it("allows only the Referrer assigned through the linked Referral Request, once they accepted it", () => {
    for (const requestStatus of ["approved", "intro_made", "interview", "offer"]) expect(canAccessReferralAttachment(28, { ...attachment, requestStatus })).toBe(true);
  });

  it("denies the assigned Referrer before acceptance (D-019(e): a claim is not an acceptance)", () => {
    expect(canAccessReferralAttachment(28, { ...attachment, requestStatus: "pending" })).toBe(false);
  });

  it("denies the assigned Referrer once the request ended", () => {
    for (const requestStatus of ["declined", "withdrawn", "closed"]) expect(canAccessReferralAttachment(28, { ...attachment, requestStatus })).toBe(false);
  });

  it("denies the assigned Referrer when the request status is unknown", () => {
    expect(canAccessReferralAttachment(28, { ownerId: 12, referrerId: 28 })).toBe(false);
  });

  it("denies every unrelated signed-in user", () => {
    expect(canAccessReferralAttachment(99, attachment)).toBe(false);
  });

  it("denies an otherwise eligible employee who is not assigned the request", () => {
    expect(canAccessReferralAttachment(28, { ownerId: 12, referrerId: null, requestStatus: "approved" })).toBe(false);
  });
});
