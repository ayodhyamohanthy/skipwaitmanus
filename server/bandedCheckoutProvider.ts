/**
 * BANDED-checkout provider calls (D-367): Chargebee hosted pages for a banded
 * plan and for extra referrals. Amounts are never sent: Chargebee charges the
 * provisioned item prices (shared/bandedCatalog.ts); the only computed figure
 * is the volume discount, sent as a fixed whole minor-unit amount so the page
 * total equals the quote exactly. Every call carries the checkout's
 * idempotency key, so a retried request opens the same page.
 */
import { z } from "zod";
import { chargebeeRequest, type ChargebeeCredentials } from "./chargebeeApi";
import type { CheckoutCustomer, HostedPageResult } from "./chargebeeSubscriptionApi";

const hostedPageSchema = z.object({ hosted_page: z.object({ id: z.string().min(1).max(80), url: z.string().url() }) });

type PageBase = CheckoutCustomer & {
  billingCountry: "IN" | "INTL";
  checkoutIntentId: string;
  idempotencyKey: string;
  redirectUrl: string;
  cancelUrl: string;
};

function setCommon(form: URLSearchParams, input: PageBase) {
  if (input.customerId) form.set("customer[id]", input.customerId);
  if (input.email) form.set("customer[email]", input.email);
  if (input.firstName) form.set("customer[first_name]", input.firstName);
  if (input.lastName) form.set("customer[last_name]", input.lastName);
  // The India book is charged only with an Indian billing address (D-122, shared/billingRegion.ts).
  if (input.billingCountry === "IN") form.set("billing_address[country]", "IN");
  form.set("redirect_url", input.redirectUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("pass_thru_content", input.checkoutIntentId);
}

async function open(credentials: ChargebeeCredentials, path: string, form: URLSearchParams, idempotencyKey: string): Promise<HostedPageResult> {
  // Hosted one-time pages are slower than subscription pages in live traffic (server/chargebee.ts).
  const body = await chargebeeRequest(credentials, { method: "POST", path, form, timeoutMs: 25_000, idempotencyKey }, hostedPageSchema);
  return { checkoutUrl: body.hosted_page.url, hostedPageId: body.hosted_page.id };
}

/** A new monthly subscription to one banded plan item price; it renews until cancelled (no fixed cycle count). */
export async function createBandedPlanPage(credentials: ChargebeeCredentials, input: PageBase & { itemPriceId: string }): Promise<HostedPageResult> {
  const form = new URLSearchParams();
  form.set("subscription_items[item_price_id][0]", input.itemPriceId);
  form.set("subscription_items[quantity][0]", "1");
  setCommon(form, input);
  return open(credentials, "/hosted_pages/checkout_new_for_items", form, input.idempotencyKey);
}

const referralPageSchema = z.object({
  lines: z.array(z.object({ itemPriceId: z.string().min(1).max(100), quantity: z.number().int().positive() })).min(1),
  currency: z.enum(["INR", "USD"]),
  discountAmount: z.number().int().min(0),
});

/** One-time extra referrals: one charge line per level, and the volume discount as a fixed amount off the invoice. */
export async function createBandedReferralPage(credentials: ChargebeeCredentials, input: PageBase & z.infer<typeof referralPageSchema>): Promise<HostedPageResult> {
  const cart = referralPageSchema.parse({ lines: input.lines, currency: input.currency, discountAmount: input.discountAmount });
  const form = new URLSearchParams();
  cart.lines.forEach((line, index) => {
    form.set(`item_prices[item_price_id][${index}]`, line.itemPriceId);
    form.set(`item_prices[quantity][${index}]`, String(line.quantity));
  });
  form.set("currency_code", cart.currency);
  if (cart.discountAmount > 0) {
    form.set("discounts[apply_on][0]", "invoice_amount");
    form.set("discounts[amount][0]", String(cart.discountAmount));
  }
  setCommon(form, input);
  return open(credentials, "/hosted_pages/checkout_one_time_for_items", form, input.idempotencyKey);
}
