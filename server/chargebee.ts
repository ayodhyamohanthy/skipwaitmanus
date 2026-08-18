import crypto from "node:crypto";
import { SUBSCRIPTION_PLANS, subscriptionPlanFromItemPrice, type PaidSubscriptionPlan } from "../shared/subscriptionPlans";

export type TokenRole = "job_seeker" | "referrer";

export const CHARGEBEE_TOKEN_PACKS = {
  "skipwait_token_1-INR": { tokenCount: 1, amount: 9900, currency: "INR" },
  "skipwait_token_1-USD": { tokenCount: 1, amount: 100, currency: "USD" },
} as const;

export const MAX_TOKEN_QUANTITY = 1000;

export type ChargebeeTokenPackId = keyof typeof CHARGEBEE_TOKEN_PACKS;

export type ParsedPaidPaymentEvent = {
  eventId: string;
  invoiceId?: string;
  hostedPageId?: string;
  passThruContent?: string;
  amount: number;
  currency: string;
};

export type VerifiedChargebeeHostedPage = {
  hostedPageId: string;
  invoiceId?: string;
  passThruContent?: string;
  amount?: number;
  currency?: string;
};

export type ParsedSubscriptionEvent = {
  eventId: string;
  eventType: string;
  hostedPageId?: string;
  passThruContent?: string;
  subscriptionId: string;
  plan?: PaidSubscriptionPlan;
  status: string;
  currency?: "INR" | "USD";
  currentTermStart?: Date;
  currentTermEnd?: Date;
  resourceVersion?: number;
};

export type ChargebeeBillingAddress = {
  firstName?: string;
  lastName?: string;
  line1?: string;
  line2?: string;
  city?: string;
  zip?: string;
  stateCode?: string;
  country?: string;
};

export function isTokenPackId(value: unknown): value is ChargebeeTokenPackId {
  return typeof value === "string" && value in CHARGEBEE_TOKEN_PACKS;
}

export function isTokenQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= MAX_TOKEN_QUANTITY;
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
  const payment = payload?.content?.payment ?? payload?.content?.transaction;
  const invoice = payload?.content?.invoice;
  if (!payment || typeof payment !== "object") return undefined;
  const amount = Number(payment.amount ?? invoice?.amount_paid ?? invoice?.total);
  const currency = String(payment.currency_code ?? payment.currency ?? invoice?.currency_code ?? invoice?.currency ?? "").toUpperCase();
  if (!Number.isInteger(amount) || amount <= 0 || !["INR", "USD"].includes(currency)) return undefined;
  const eventId = getChargebeeEventId(payload);
  if (!eventId) return undefined;
  const invoiceId = typeof payment.invoice_id === "string" ? payment.invoice_id : typeof invoice?.id === "string" ? invoice.id : undefined;
  const hostedPageId = typeof payload?.content?.hosted_page?.id === "string" ? payload.content.hosted_page.id : typeof payment.hosted_page_id === "string" ? payment.hosted_page_id : undefined;
  const passThruContent = typeof payload?.content?.hosted_page?.pass_thru_content === "string"
    ? payload.content.hosted_page.pass_thru_content
    : typeof payment.pass_thru_content === "string"
      ? payment.pass_thru_content
      : undefined;
  return { eventId, invoiceId, hostedPageId, passThruContent, amount, currency } satisfies ParsedPaidPaymentEvent;
}

function dateFromChargebeeSeconds(value: unknown) {
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds > 0 ? new Date(seconds * 1000) : undefined;
}

export function parseSubscriptionEvent(payload: any): ParsedSubscriptionEvent | undefined {
  const eventType = typeof payload?.event_type === "string" ? payload.event_type : "";
  if (!eventType.startsWith("subscription_") && eventType !== "payment_succeeded") return undefined;
  const eventId = getChargebeeEventId(payload);
  const subscription = payload?.content?.subscription;
  const subscriptionId = typeof subscription?.id === "string" ? subscription.id : undefined;
  if (!eventId || !subscriptionId) return undefined;
  const itemPriceId = subscription?.subscription_items?.find?.((item: any) => typeof item?.item_price_id === "string")?.item_price_id;
  const parsedPlan = subscriptionPlanFromItemPrice(itemPriceId);
  const currency = typeof subscription?.currency_code === "string" ? subscription.currency_code.toUpperCase() : undefined;
  const hostedPage = payload?.content?.hosted_page;
  const resourceVersion = Number(subscription?.resource_version);
  return {
    eventId,
    eventType,
    hostedPageId: typeof hostedPage?.id === "string" ? hostedPage.id : undefined,
    passThruContent: typeof hostedPage?.pass_thru_content === "string" ? hostedPage.pass_thru_content : undefined,
    subscriptionId,
    plan: parsedPlan?.plan,
    status: typeof subscription?.status === "string" ? subscription.status : "cancelled",
    currency: currency === "INR" || currency === "USD" ? currency : parsedPlan?.currency,
    currentTermStart: dateFromChargebeeSeconds(subscription?.current_term_start),
    currentTermEnd: dateFromChargebeeSeconds(subscription?.current_term_end),
    resourceVersion: Number.isSafeInteger(resourceVersion) && resourceVersion > 0 ? resourceVersion : undefined,
  };
}

export async function retrieveChargebeeHostedPage(hostedPageId: string, input: { site?: string; apiKey?: string } = {}): Promise<VerifiedChargebeeHostedPage | undefined> {
  const site = input.site ?? process.env.CHARGEBEE_SITE ?? "skipwait-test";
  const apiKey = input.apiKey ?? process.env.CHARGEBEE_API_KEY;
  if (!apiKey) throw new Error("Chargebee API key is not configured");
  const response = await fetch(`https://${site}.chargebee.com/api/v2/hosted_pages/${encodeURIComponent(hostedPageId)}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return undefined;
  const hostedPage = (await response.json().catch(() => ({})))?.hosted_page;
  if (!hostedPage || hostedPage.id !== hostedPageId || hostedPage.state !== "succeeded") return undefined;
  const invoice = hostedPage.content?.invoice;
  return {
    hostedPageId,
    invoiceId: typeof invoice?.id === "string" ? invoice.id : undefined,
    passThruContent: typeof hostedPage.pass_thru_content === "string" ? hostedPage.pass_thru_content : undefined,
    amount: Number.isInteger(invoice?.total) ? invoice.total : undefined,
    currency: typeof invoice?.currency_code === "string" ? invoice.currency_code.toUpperCase() : undefined,
  };
}

export async function resolveChargebeeHostedPageForPayment(input: { invoiceId?: string; amount: number; currency: string; pendingHostedPageIds: string[] }) {
  if (!input.invoiceId) return undefined;
  for (const hostedPageId of input.pendingHostedPageIds.slice(0, 25)) {
    const hostedPage = await retrieveChargebeeHostedPage(hostedPageId);
    if (hostedPage?.invoiceId === input.invoiceId && hostedPage.amount === input.amount && hostedPage.currency === input.currency) return hostedPage;
  }
  return undefined;
}

export function tokenPackFromAmount(amount: number, currency: string): { tokenCount: number; itemPriceId: ChargebeeTokenPackId } | undefined {
  const match = Object.entries(CHARGEBEE_TOKEN_PACKS).find(([, pack]) => pack.currency === currency && amount >= pack.amount && amount % pack.amount === 0);
  if (!match) return undefined;
  const tokenCount = amount / match[1].amount;
  return isTokenQuantity(tokenCount) ? { itemPriceId: match[0] as ChargebeeTokenPackId, tokenCount } : undefined;
}

export function buildCheckoutForm(input: { itemPriceId: ChargebeeTokenPackId; quantity?: number; email?: string; firstName?: string; lastName?: string; billingAddress?: ChargebeeBillingAddress; redirectUrl: string; cancelUrl: string; checkoutIntentId: string }) {
  const form = new URLSearchParams();
  form.set("item_prices[item_price_id][0]", input.itemPriceId);
  form.set("item_prices[quantity][0]", String(input.quantity ?? 1));
  form.set("currency_code", CHARGEBEE_TOKEN_PACKS[input.itemPriceId].currency);
  if (input.email) form.set("customer[email]", input.email);
  if (input.firstName) form.set("customer[first_name]", input.firstName);
  if (input.lastName) form.set("customer[last_name]", input.lastName);
  if (input.billingAddress?.firstName) form.set("billing_address[first_name]", input.billingAddress.firstName);
  if (input.billingAddress?.lastName) form.set("billing_address[last_name]", input.billingAddress.lastName);
  if (input.billingAddress?.line1) form.set("billing_address[line1]", input.billingAddress.line1);
  if (input.billingAddress?.line2) form.set("billing_address[line2]", input.billingAddress.line2);
  if (input.billingAddress?.city) form.set("billing_address[city]", input.billingAddress.city);
  if (input.billingAddress?.zip) form.set("billing_address[zip]", input.billingAddress.zip);
  if (input.billingAddress?.stateCode) form.set("billing_address[state_code]", input.billingAddress.stateCode);
  if (input.billingAddress?.country) form.set("billing_address[country]", input.billingAddress.country);
  form.set("redirect_url", input.redirectUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("pass_thru_content", input.checkoutIntentId);
  return form;
}

export function buildSubscriptionCheckoutForm(input: { plan: PaidSubscriptionPlan; currency: "INR" | "USD"; email?: string; firstName?: string; lastName?: string; billingAddress?: ChargebeeBillingAddress; redirectUrl: string; cancelUrl: string; checkoutIntentId: string }) {
  const price = SUBSCRIPTION_PLANS[input.plan].prices[input.currency];
  const form = new URLSearchParams();
  form.set("item_prices[item_price_id][0]", price.itemPriceId);
  form.set("item_prices[quantity][0]", "1");
  form.set("currency_code", input.currency);
  if (input.email) form.set("customer[email]", input.email);
  if (input.firstName) form.set("customer[first_name]", input.firstName);
  if (input.lastName) form.set("customer[last_name]", input.lastName);
  if (input.billingAddress?.country) form.set("billing_address[country]", input.billingAddress.country);
  if (input.billingAddress?.stateCode) form.set("billing_address[state_code]", input.billingAddress.stateCode);
  if (input.billingAddress?.city) form.set("billing_address[city]", input.billingAddress.city);
  form.set("redirect_url", input.redirectUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("pass_thru_content", input.checkoutIntentId);
  return form;
}

export async function createChargebeeCheckout(input: { itemPriceId: ChargebeeTokenPackId; quantity?: number; email?: string; firstName?: string; lastName?: string; billingAddress?: ChargebeeBillingAddress; site?: string; apiKey?: string; redirectUrl: string; cancelUrl: string; checkoutIntentId?: string }) {
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

export async function createChargebeeSubscriptionCheckout(input: { plan: PaidSubscriptionPlan; currency: "INR" | "USD"; email?: string; firstName?: string; lastName?: string; billingAddress?: ChargebeeBillingAddress; site?: string; apiKey?: string; redirectUrl: string; cancelUrl: string; checkoutIntentId?: string }) {
  const site = input.site ?? process.env.CHARGEBEE_SITE ?? "skipwait-test";
  const apiKey = input.apiKey ?? process.env.CHARGEBEE_API_KEY;
  if (!apiKey) throw new Error("Chargebee API key is not configured");
  const checkoutIntentId = input.checkoutIntentId ?? crypto.randomUUID();
  const response = await fetch(`https://${site}.chargebee.com/api/v2/hosted_pages/checkout_new_for_items`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: buildSubscriptionCheckoutForm({ ...input, checkoutIntentId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Chargebee subscription checkout failed (${response.status})`);
  const hostedPage = body?.hosted_page;
  const checkoutUrl = hostedPage?.url ?? hostedPage?.checkout_url;
  const hostedPageId = hostedPage?.id;
  if (typeof checkoutUrl !== "string" || typeof hostedPageId !== "string") throw new Error("Chargebee returned an incomplete subscription checkout");
  return { checkoutUrl, hostedPageId, checkoutIntentId };
}

export async function scheduleChargebeeSubscriptionCancellation(input: { subscriptionId: string; site?: string; apiKey?: string }) {
  const site = input.site ?? process.env.CHARGEBEE_SITE ?? "skipwait-test";
  const apiKey = input.apiKey ?? process.env.CHARGEBEE_API_KEY;
  if (!apiKey) throw new Error("Chargebee API key is not configured");
  const response = await fetch(`https://${site}.chargebee.com/api/v2/subscriptions/${encodeURIComponent(input.subscriptionId)}/cancel_for_items`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ cancel_option: "end_of_term" }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Chargebee cancellation failed (${response.status})`);
  const subscription = body?.subscription;
  if (!subscription || subscription.id !== input.subscriptionId) throw new Error("Chargebee returned an incomplete cancellation response");
  return { status: typeof subscription.status === "string" ? subscription.status : "non_renewing", currentTermEnd: dateFromChargebeeSeconds(subscription.current_term_end) };
}
