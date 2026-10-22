import { describe, expect, it } from "vitest";
import * as giftContract from "@shared/giftSubscriptions";
import {
  buyerUserIdFromGifter,
  giftClaimRequestSchema,
  gifterCustomerId,
  isGiftStatus,
  normalizeGiftEmail,
} from "@shared/giftSubscriptions";

describe("gift subscription contract", () => {
  // D-067: gifts only ever sold Pro or Max, so no gift can be bought any more.
  it("has no gift checkout request: nothing can be gifted", () => {
    expect(giftContract).not.toHaveProperty("giftCheckoutRequestSchema");
  });

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
