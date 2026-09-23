import { describe, expect, it } from "vitest";
import {
  buyerUserIdFromGifter,
  giftCheckoutRequestSchema,
  giftClaimRequestSchema,
  gifterCustomerId,
  isGiftStatus,
  normalizeGiftEmail,
} from "@shared/giftSubscriptions";

describe("gift subscription contract", () => {
  it("accepts Pro/Max on the matching billing route", () => {
    expect(giftCheckoutRequestSchema.safeParse({ plan: "pro", currency: "USD", billingCountry: "INTL" }).success).toBe(true);
    expect(giftCheckoutRequestSchema.safeParse({ plan: "max", currency: "INR", billingCountry: "IN" }).success).toBe(true);
  });

  it("rejects every invalid edge and tolerates unknown fields", () => {
    expect(giftCheckoutRequestSchema.safeParse({ plan: "free", currency: "USD", billingCountry: "INTL" }).success).toBe(false);
    expect(giftCheckoutRequestSchema.safeParse({ plan: "pro", currency: "USD", billingCountry: "IN" }).success).toBe(false);
    expect(giftCheckoutRequestSchema.safeParse({ plan: "pro", currency: "INR", billingCountry: "INTL" }).success).toBe(false);
    expect(giftCheckoutRequestSchema.safeParse({ plan: "pro", currency: "EUR", billingCountry: "INTL" }).success).toBe(false);
    expect(giftCheckoutRequestSchema.safeParse({ plan: "pro", currency: "USD" }).success).toBe(false);
    expect(giftCheckoutRequestSchema.safeParse({}).success).toBe(false);
    expect(giftCheckoutRequestSchema.safeParse({ plan: "pro", currency: "USD", billingCountry: "INTL", receiverEmail: "a@b.com" }).success).toBe(true);
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
