// Wire contracts for the /plans and /billing screens, parsed at the edge with Zod.
// Shapes mirror server/privateReferralRoutes.ts (credits summary, receipts) and
// server/chargebeeRoutes.ts (gifts). Unknown fields are ignored; a payload that
// does not parse is treated as a failed load, never as an empty account.
import { z } from "zod";
import { paymentMethodsResponseSchema, type PaymentMethodsResponse } from "@shared/billingAccount";
import { creditsLedgerSchema } from "@shared/creditLedger";
import { openAskSlotsSchema } from "@shared/openAskSlots";

export const NETWORK_ERROR = "We couldn’t reach SkipWait. Check your connection and try again.";

const nullableString = z.string().nullish().transform(value => value ?? null);

export const creditSummarySchema = z.object({
  plan: z.string(),
  monthlyAllowance: z.number(),
  monthlyCreditsRemaining: z.number(),
  purchasedCreditsRemaining: z.number().optional(),
  totalAvailable: z.number(),
  subscriptionStatus: nullableString,
  subscriptionCurrentTermEnd: nullableString,
  // Kit ledger block (shared/creditLedger.ts): balance by bucket, cycle usage, expiries.
  // Missing or malformed reads as "not loaded" (null), never as invented numbers.
  ledger: creditsLedgerSchema.nullish().catch(null).transform(value => value ?? null),
  // Seeker open-ask slots (shared/openAskSlots.ts); the server omits them when the count fails.
  slots: openAskSlotsSchema.nullish().catch(null).transform(value => value ?? null),
  /**
   * A Free seeker month grants its credits only while a payment method is on
   * file (server/creditCycles.ts). Required rather than defaulted: a payload
   * without it comes from an older server, and guessing either way would show
   * the wrong state on a money screen.
   */
  paymentMethodOnFile: z.boolean(),
});
export type CreditSummary = z.infer<typeof creditSummarySchema>;

/** GET /api/billing/payment-methods: saved method labels, plus whether a billing customer exists at all. */
export type PaymentMethods = PaymentMethodsResponse;

export function parsePaymentMethods(payload: unknown): PaymentMethods | null {
  const parsed = paymentMethodsResponseSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export const receiptSchema = z.object({
  id: z.number(),
  provider: z.string(),
  amount: z.number(),
  currency: z.string(),
  tokenCount: z.number(),
  status: z.string(),
  providerInvoiceId: nullableString,
  createdAt: z.string(),
});
export type Receipt = z.infer<typeof receiptSchema>;

const sentGiftSchema = z.object({ giftId: z.string(), plan: nullableString, receiverEmail: nullableString, providerStatus: nullableString, fulfillmentStatus: z.string() });
const claimableGiftSchema = z.object({ giftId: z.string(), plan: nullableString, receiverEmail: nullableString });
export type SentGift = z.infer<typeof sentGiftSchema>;
export type ClaimableGift = z.infer<typeof claimableGiftSchema>;

export function parseSummary(payload: unknown): CreditSummary | null {
  const parsed = z.object({ summary: creditSummarySchema }).safeParse(payload);
  return parsed.success ? parsed.data.summary : null;
}

export function parseReceipts(payload: unknown): Receipt[] | null {
  const parsed = z.object({ receipts: z.array(receiptSchema) }).safeParse(payload);
  return parsed.success ? parsed.data.receipts : null;
}

export function parseGifts(payload: unknown): { sent: SentGift[]; claimable: ClaimableGift[] } {
  const parsed = z.object({ sent: z.array(sentGiftSchema).optional(), claimable: z.array(claimableGiftSchema).optional() }).safeParse(payload);
  return parsed.success ? { sent: parsed.data.sent ?? [], claimable: parsed.data.claimable ?? [] } : { sent: [], claimable: [] };
}

/** A thrown fetch (offline, DNS, CORS) becomes the shared network copy; server errors keep their message. */
export function failureMessage(reason: unknown, fallback: string): string {
  if (reason instanceof TypeError) return NETWORK_ERROR;
  return reason instanceof Error && reason.message ? reason.message : fallback;
}
