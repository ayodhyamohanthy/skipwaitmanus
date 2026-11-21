import { z } from "zod";
import type { PaymentRoute } from "./paymentRoute";
import type { TokenRole } from "./tokens";

export const LEGACY_PREMIUM_PACKS = [
  { id: "skipwait_token_1-INR", price: 99, currency: "INR" },
  { id: "skipwait_token_1-USD", price: 1, currency: "USD" },
] as const;
export const PENDING_PREMIUM_CHECKOUT_KEY = "skipwait.pending-chargebee-checkout";

export function premiumMoney(value: number, route: PaymentRoute): string {
  return route === "INR" ? `₹${value.toLocaleString("en-IN")}` : `$${value.toLocaleString("en-US")}`;
}

export const premiumBalanceSchema = z.object({
  totalAvailable: z.number().int().nonnegative(),
  ledger: z.object({ buckets: z.object({ purchased: z.number().int().nonnegative() }) }).nullish(),
  promoCreditsRemaining: z.number().int().nonnegative().optional(),
  promoExpiresAt: z.string().datetime().nullable().optional(),
  promoStatus: z.string().nullable().optional(),
  promoOfferActive: z.boolean().optional(),
});
export type PremiumBalance = z.infer<typeof premiumBalanceSchema>;
export const premiumSummarySchema = z.object({ summary: premiumBalanceSchema });
export const premiumRecoverySchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("credited"), tokenCount: z.number().int().positive(), summary: premiumBalanceSchema.optional() }),
  z.object({ status: z.literal("pending"), summary: premiumBalanceSchema.optional() }),
  z.object({ status: z.literal("requires_review"), summary: premiumBalanceSchema.optional() }),
]);
export const premiumCheckoutSchema = z.object({
  checkoutUrl: z.url().refine(value => new URL(value).protocol === "https:"),
  hostedPageId: z.string().min(1).max(255),
});
const pendingSchema = z.object({ hostedPageId: z.string().min(1).max(255), role: z.enum(["job_seeker", "referrer"]) });

export function readPremiumCheckout(role: TokenRole): string | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_PREMIUM_CHECKOUT_KEY);
    const parsed = pendingSchema.safeParse(raw ? JSON.parse(raw) : null);
    return parsed.success && parsed.data.role === role ? parsed.data.hostedPageId : null;
  } catch {
    return null;
  }
}
