import { describe, expect, it } from "vitest";
import {
  buyerUserIdFromGifter,
  giftClaimRequestSchema,
  gifterCustomerId,
  isGiftStatus,
  normalizeGiftEmail,
} from "@shared/giftSubscriptions";

// D-067 (owner, Oct 18 2026) removed Pro/Max and retired gift checkout, so the
// buyer request schema is gone with it. What stays is the claim contract and the
// identity helpers the webhook branch still reads on historic rows.
describe("gift subscription contract", () => {
  it("round-trips the gifter customer reference", () => {
    expect(buyerUserIdFromGifter(gifterCustomerId(42))).toBe(42);
    expect(buyerUserIdFromGifter("gifter")).toBeUndefined();
    expect(buyerUserIdFromGifter("skipwait-u0")).toBeUndefined();
    expect(buyerUserIdFromGifter("skipwait-uabc")).toBeUndefined();
    expect(buyerUserIdFromGifter(undefined)).toBeUndefined();
  });

  it("normalizes receiver emails strictly", () => {
    expect(normalizeGiftEmail("  James@User.com ")).toBe("james@user.com");
    expect(normalizeGiftEmail("not-an-email")).toBeUndefined();
    expect(normalizeGiftEmail("")).toBeUndefined();
    expect(normalizeGiftEmail(undefined)).toBeUndefined();
  });

  it("validates claim and status inputs", () => {
    expect(giftClaimRequestSchema.safeParse({ giftId: "gift_123" }).success).toBe(true);
    expect(giftClaimRequestSchema.safeParse({ giftId: "" }).success).toBe(false);
    expect(giftClaimRequestSchema.safeParse({}).success).toBe(false);
    expect(isGiftStatus("claimed")).toBe(true);
    expect(isGiftStatus("refunded")).toBe(false);
  });
});
