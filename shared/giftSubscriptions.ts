import { z } from "zod";

/**
 * Gift subscriptions contract (shared client/server): receipts only.
 *
 * Gifts only ever sold the monthly Pro and Max plans, which D-067 removed
 * completely, so nothing can be gifted any more. Provider gift events are
 * still parsed and recorded as receipts (giftSubscriptionFulfillments).
 */

export const giftStatuses = ["scheduled", "unclaimed", "claimed", "expired", "cancelled"] as const;
export type GiftStatus = (typeof giftStatuses)[number];

export const giftFulfillmentStatuses = ["pending", "credited", "conflict", "expired", "cancelled"] as const;
export type GiftFulfillmentStatus = (typeof giftFulfillmentStatuses)[number];

export function isGiftStatus(value: unknown): value is GiftStatus {
  return typeof value === "string" && (giftStatuses as readonly string[]).includes(value);
}

/** Recipient-facing claim: the gift id only; identity comes from the session. */
export const giftClaimRequestSchema = z.object({
  giftId: z.string().min(1).max(150),
});
export type GiftClaimRequest = z.infer<typeof giftClaimRequestSchema>;

/** Gifter customer reference the retired gift checkout embedded; still read back from provider gift events. */
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
