import crypto from "node:crypto";

export type TokenRole = "job_seeker" | "referrer";

export const CHARGEBEE_TOKEN_PACKS = {
  "skipwait_token_1-USD": { tokenCount: 1, amount: 100, currency: "USD" },
  "skipwait_token_5-USD": { tokenCount: 5, amount: 500, currency: "USD" },
  "skipwait_token_10-USD": { tokenCount: 10, amount: 1000, currency: "USD" },
} as const;

export type ChargebeeTokenPackId = keyof typeof CHARGEBEE_TOKEN_PACKS;

export function isTokenPackId(value: unknown): value is ChargebeeTokenPackId {
  return typeof value === "string" && value in CHARGEBEE_TOKEN_PACKS;
}

export function basicAuthMatches(authorization: string | undefined, password: string): boolean {
  if (!authorization || !password || !authorization.startsWith("Basic ")) return false;
  const expected = Buffer.from(`skipwait:${password}`).toString("base64");
  const actual = authorization.slice(6);
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && crypto.timingSafeEqual(expectedBytes, actualBytes);
}

export function getChargebeeEventId(payload: any): string | undefined {
  return typeof payload?.id === "string" && payload.id.length > 0 ? payload.id : undefined;
}

export function parsePaidPaymentEvent(payload: any) {
  if (payload?.event_type !== "payment_succeeded") return undefined;
  const payment = payload?.content?.payment;
  if (!payment || typeof payment !== "object") return undefined;
  const amount = Number(payment.amount);
  const currency = String(payment.currency_code ?? payment.currency ?? "").toUpperCase();
  if (!Number.isInteger(amount) || amount <= 0 || currency !== "USD") return undefined;
  const eventId = getChargebeeEventId(payload);
  if (!eventId) return undefined;
  const invoiceId = typeof payment.invoice_id === "string" ? payment.invoice_id : undefined;
  const hostedPageId = typeof payment.hosted_page_id === "string" ? payment.hosted_page_id : undefined;
  const customerId = typeof payment.customer_id === "string" ? payment.customer_id : undefined;
  const passThruContent = typeof payload?.content?.hosted_page?.pass_thru_content === "string"
    ? payload.content.hosted_page.pass_thru_content
    : typeof payment.pass_thru_content === "string"
      ? payment.pass_thru_content
      : undefined;
  return { eventId, invoiceId, hostedPageId, customerId, passThruContent, amount, currency };
}

export function tokenPackFromAmount(amount: number): { tokenCount: number; itemPriceId: ChargebeeTokenPackId } | undefined {
  const match = Object.entries(CHARGEBEE_TOKEN_PACKS).find(([, pack]) => pack.amount === amount);
  return match ? { itemPriceId: match[0] as ChargebeeTokenPackId, tokenCount: match[1].tokenCount } : undefined;
}

export function buildCheckoutForm(input: { itemPriceId: ChargebeeTokenPackId; email?: string; firstName?: string; lastName?: string; redirectUrl: string; cancelUrl: string; checkoutIntentId: string }) {
  const form = new URLSearchParams();
  form.set("item_prices[item_price_id][0]", input.itemPriceId);
  form.set("item_prices[quantity][0]", "1");
  form.set("currency_code", "USD");
  if (input.email) form.set("customer[email]", input.email);
  if (input.firstName) form.set("customer[first_name]", input.firstName);
  if (input.lastName) form.set("customer[last_name]", input.lastName);
  form.set("redirect_url", input.redirectUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("pass_thru_content", input.checkoutIntentId);
  return form;
}

export async function createChargebeeCheckout(input: { itemPriceId: ChargebeeTokenPackId; email?: string; firstName?: string; lastName?: string; site?: string; apiKey?: string; redirectUrl: string; cancelUrl: string; checkoutIntentId?: string }) {
  const site = input.site ?? process.env.CHARGEBEE_SITE ?? "skipwait-test";
  const apiKey = input.apiKey ?? process.env.CHARGEBEE_API_KEY;
  if (!apiKey) throw new Error("Chargebee API key is not configured");
  const checkoutIntentId = input.checkoutIntentId ?? crypto.randomUUID();
  const response = await fetch(`https://${site}.chargebee.com/api/v2/hosted_pages/checkout_one_time_for_items`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: buildCheckoutForm({ ...input, checkoutIntentId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Chargebee checkout failed (${response.status})`);
  const hostedPage = body?.hosted_page;
  const checkoutUrl = hostedPage?.url ?? hostedPage?.checkout_url;
  const hostedPageId = hostedPage?.id;
  if (typeof checkoutUrl !== "string" || typeof hostedPageId !== "string") throw new Error("Chargebee returned an incomplete hosted checkout");
  return { checkoutUrl, hostedPageId, checkoutIntentId, customerId: typeof hostedPage?.customer?.id === "string" ? hostedPage.customer.id : undefined };
}
