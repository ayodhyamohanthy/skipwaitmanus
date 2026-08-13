import { describe, expect, it } from "vitest";
import { canAccessReferralAttachment } from "./db";

describe("private referral document access", () => {
  const attachment = { ownerId: 12, referrerId: 28 };

  it("allows the Job Seeker who owns the document", () => {
    expect(canAccessReferralAttachment(12, attachment)).toBe(true);
  });

  it("allows only the Referrer assigned through the linked Referral Request", () => {
    expect(canAccessReferralAttachment(28, attachment)).toBe(true);
  });

  it("denies every unrelated signed-in user", () => {
    expect(canAccessReferralAttachment(99, attachment)).toBe(false);
  });

  it("denies an otherwise eligible employee until that employee has claimed the request", () => {
    expect(canAccessReferralAttachment(28, { ownerId: 12, referrerId: null })).toBe(false);
  });
});
