import { z } from "zod";
import type { SubscriptionCurrency } from "./subscriptionPlans";

/**
 * Gift subscriptions contract (shared client/server).
 *
 * D-067 (owner, Oct 18 2026): gifting a Pro/Max subscription is removed with
 * the plans, so there is no buyer request to validate any more. The claim
 * contract stays: it reads historic gift rows, which keeps history readable.
 */

export const giftStatuses = ["scheduled", "unclaimed", "claimed", "expired", "cancelled"] as const;
export type GiftStatus = (typeof giftStatuses)[number];

export const giftFulfillmentStatuses = ["pending", "credited", "conflict", "expired", "cancelled"] as const;
export type GiftFulfillmentStatus = (typeof giftFulfillmentStatuses)[number];

export function isGiftStatus(value: unknown): value is GiftStatus {
  return typeof value === "string" && (giftStatuses as readonly string[]).includes(value);
}

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

export type { SubscriptionCurrency };
