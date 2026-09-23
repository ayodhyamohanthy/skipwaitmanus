import { z } from "zod";
import { isPaidSubscriptionPlan, type PaidSubscriptionPlan, type SubscriptionCurrency } from "./subscriptionPlans";

/**
 * Gift subscriptions contract (shared client/server).
 *
 * A buyer (gifter) purchases a Pro/Max subscription for a recipient through
 * Chargebee's gift checkout. The recipient claims it; only the recipient's
 * wallet is ever credited. The buyer receives a receipt and nothing else.
 */

export const giftStatuses = ["scheduled", "unclaimed", "claimed", "expired", "cancelled"] as const;
export type GiftStatus = (typeof giftStatuses)[number];

export const giftFulfillmentStatuses = ["pending", "credited", "conflict", "expired", "cancelled"] as const;
export type GiftFulfillmentStatus = (typeof giftFulfillmentStatuses)[number];

export function isGiftStatus(value: unknown): value is GiftStatus {
  return typeof value === "string" && (giftStatuses as readonly string[]).includes(value);
}

/** Buyer-facing request: which plan to gift, on which billing route. */
export const giftCheckoutRequestSchema = z.object({
  plan: z.custom<PaidSubscriptionPlan>(isPaidSubscriptionPlan, { message: "Choose Pro or Max" }),
  currency: z.enum(["INR", "USD"]),
  billingCountry: z.enum(["IN", "INTL"]),
}).refine(
  input => (input.billingCountry === "IN" ? input.currency === "INR" : input.currency === "USD"),
  { message: "That currency is not available for the selected billing route" },
);
export type GiftCheckoutRequest = z.infer<typeof giftCheckoutRequestSchema>;

/** Recipient-facing claim: no body needed; identity comes from the session. */
export const giftClaimRequestSchema = z.object({
  giftId: z.string().min(1).max(150),
});
export type GiftClaimRequest = z.infer<typeof giftClaimRequestSchema>;

/** Gifter customer reference embedded in the Chargebee gift checkout. */
export function gifterCustomerId(userId: number): string {
  return `skipwait-u${userId}`;
}

export function buyerUserIdFromGifter(customerId: unknown): number | undefined {
  if (typeof customerId !== "string") return undefined;
  const match = /^skipwait-u(\d{1,10})$/.exec(customerId.trim());
  if (!match) return undefined;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export function normalizeGiftEmail(email: unknown): string | undefined {
  if (typeof email !== "string") return undefined;
  const normalized = email.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 70 || !/^\S+@\S+\.\S+$/.test(normalized)) return undefined;
  return normalized;
}

export type { PaidSubscriptionPlan, SubscriptionCurrency };
