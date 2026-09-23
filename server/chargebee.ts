import crypto from "node:crypto";
import { SUBSCRIPTION_PLANS, subscriptionPlanFromItemPrice, type PaidSubscriptionPlan } from "../shared/subscriptionPlans";
import { buyerUserIdFromGifter, normalizeGiftEmail } from "../shared/giftSubscriptions";

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
  pageState: string;
  invoiceStatus?: string;
  paymentStatus?: string;
  paid: boolean;
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

export type GiftEventType = "gift_scheduled" | "gift_unclaimed" | "gift_claimed" | "gift_expired" | "gift_cancelled" | "gift_updated";

const GIFT_EVENT_TYPES: readonly string[] = ["gift_scheduled", "gift_unclaimed", "gift_claimed", "gift_expired", "gift_cancelled", "gift_updated"];

export type ParsedGiftEvent = {
  eventId: string;
  eventType: GiftEventType;
  giftId: string;
  status: string;
  receiverEmail?: string;
  receiverCustomerId?: string;
  subscriptionId?: string;
  buyerUserId?: number;
  gifterSignature?: string;
  resourceVersion?: number;
};

export function parseGiftEvent(payload: any): ParsedGiftEvent | undefined {
  const eventType = typeof payload?.event_type === "string" ? payload.event_type : "";
  if (!(GIFT_EVENT_TYPES as readonly string[]).includes(eventType)) return undefined;
  const eventId = getChargebeeEventId(payload);
  const gift = payload?.content?.gift;
  const giftId = typeof gift?.id === "string" && gift.id.length > 0 ? gift.id : undefined;
  if (!eventId || !giftId) return undefined;
  const receiver = gift?.gift_receiver ?? {};
  const gifter = gift?.gifter ?? {};
  const resourceVersion = Number(gift?.resource_version);
  return {
    eventId,
    eventType: eventType as GiftEventType,
    giftId,
    status: typeof gift?.status === "string" ? gift.status : "unknown",
    receiverEmail: normalizeGiftEmail(receiver?.email),
    receiverCustomerId: typeof receiver?.customer_id === "string" ? receiver.customer_id : undefined,
    subscriptionId: typeof receiver?.subscription_id === "string" ? receiver.subscription_id : undefined,
    buyerUserId: buyerUserIdFromGifter(gifter?.customer_id),
    gifterSignature: typeof gifter?.signature === "string" ? gifter.signature.slice(0, 50) : undefined,
    resourceVersion: Number.isSafeInteger(resourceVersion) && resourceVersion > 0 ? resourceVersion : undefined,
  };
}

export function buildGiftSubscriptionCheckoutForm(input: { plan: PaidSubscriptionPlan; currency: "INR" | "USD"; gifterCustomerId: string; redirectUrl: string; cancelUrl: string }) {
  const price = SUBSCRIPTION_PLANS[input.plan].prices[input.currency];
  const form = new URLSearchParams();
  form.set("subscription_items[item_price_id][0]", price.itemPriceId);
  form.set("subscription_items[quantity][0]", "1");
  form.set("gifter[customer_id]", input.gifterCustomerId);
  form.set("redirect_url", input.redirectUrl);
  form.set("cancel_url", input.cancelUrl);
  return form;
}

export async function createGiftSubscriptionCheckout(input: { plan: PaidSubscriptionPlan; currency: "INR" | "USD"; buyerUserId: number; site?: string; apiKey?: string; redirectUrl: string; cancelUrl: string }) {
  const site = input.site ?? process.env.CHARGEBEE_SITE ?? "skipwait-test";
  const apiKey = input.apiKey ?? process.env.CHARGEBEE_API_KEY;
  if (!apiKey) throw new Error("Chargebee API key is not configured");
  const response = await fetch(`https://${site}.chargebee.com/api/v2/hosted_pages/checkout_gift_for_items`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: buildGiftSubscriptionCheckoutForm({ plan: input.plan, currency: input.currency, gifterCustomerId: `skipwait-u${input.buyerUserId}`, redirectUrl: input.redirectUrl, cancelUrl: input.cancelUrl }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Chargebee gift checkout failed (${response.status})`);
  const hostedPage = body?.hosted_page;
  const checkoutUrl = hostedPage?.url ?? hostedPage?.checkout_url;
  const hostedPageId = hostedPage?.id;
  if (typeof checkoutUrl !== "string" || typeof hostedPageId !== "string") throw new Error("Chargebee returned an incomplete gift checkout");
  return { checkoutUrl, hostedPageId };
}

export type RetrievedGiftSubscription = {
  subscriptionId: string;
  plan?: PaidSubscriptionPlan;
  currency?: "INR" | "USD";
  status?: string;
};

export async function retrieveGiftSubscriptionPlan(subscriptionId: string, input: { site?: string; apiKey?: string } = {}): Promise<RetrievedGiftSubscription | undefined> {
  const site = input.site ?? process.env.CHARGEBEE_SITE ?? "skipwait-test";
  const apiKey = input.apiKey ?? process.env.CHARGEBEE_API_KEY;
  if (!apiKey) throw new Error("Chargebee API key is not configured");
  const response = await fetch(`https://${site}.chargebee.com/api/v2/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return undefined;
  const subscription = (await response.json().catch(() => ({})))?.subscription;
  if (!subscription || subscription.id !== subscriptionId) return undefined;
  const itemPriceId = subscription?.subscription_items?.find?.((item: any) => typeof item?.item_price_id === "string")?.item_price_id;
  const parsed = subscriptionPlanFromItemPrice(itemPriceId);
  const currency = typeof subscription?.currency_code === "string" ? subscription.currency_code.toUpperCase() : undefined;
  return {
    subscriptionId,
    plan: parsed?.plan,
    currency: currency === "INR" || currency === "USD" ? currency : parsed?.currency,
    status: typeof subscription?.status === "string" ? subscription.status : undefined,
  };
}

export async function retrieveChargebeeHostedPage(hostedPageId: string, input: { site?: string; apiKey?: string } = {}): Promise<VerifiedChargebeeHostedPage | undefined> {
  const site = input.site ?? process.env.CHARGEBEE_SITE ?? "skipwait-test";
  const apiKey = input.apiKey ?? process.env.CHARGEBEE_API_KEY;
  if (!apiKey) throw new Error("Chargebee API key is not configured");
  const authorization = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
  const response = await fetch(`https://${site}.chargebee.com/api/v2/hosted_pages/${encodeURIComponent(hostedPageId)}`, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) return undefined;
  const hostedPage = (await response.json().catch(() => ({})))?.hosted_page;
  if (!hostedPage || hostedPage.id !== hostedPageId) return undefined;
  const embeddedInvoice = hostedPage.content?.invoice;
  const invoiceId = typeof embeddedInvoice?.id === "string" ? embeddedInvoice.id : undefined;
  let invoice = embeddedInvoice;
  // Recovery credits require the invoice source of truth, not a checkout page
  // snapshot alone. Missing/ambiguous invoice state always stays uncredited.
  if (invoiceId) {
    const invoiceResponse = await fetch(`https://${site}.chargebee.com/api/v2/invoices/${encodeURIComponent(invoiceId)}`, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(8_000) });
    if (invoiceResponse.ok) invoice = (await invoiceResponse.json().catch(() => ({})))?.invoice;
    else invoice = undefined;
  }
  const pageState = typeof hostedPage.state === "string" ? hostedPage.state.toLowerCase() : "unknown";
  const invoiceStatus = typeof invoice?.status === "string" ? invoice.status.toLowerCase() : undefined;
  const paymentStatus = typeof invoice?.payment_status === "string" ? invoice.payment_status.toLowerCase() : undefined;
  const total = Number(invoice?.total); const amountPaid = Number(invoice?.amount_paid);
  const invoicePaid = invoiceStatus === "paid" && Number.isInteger(total) && total > 0 && Number.isInteger(amountPaid) && amountPaid >= total;
  const paymentSucceeded = paymentStatus === undefined || ["paid", "succeeded", "success"].includes(paymentStatus);
  return { hostedPageId, invoiceId, passThruContent: typeof hostedPage.pass_thru_content === "string" ? hostedPage.pass_thru_content : undefined, amount: Number.isInteger(total) ? total : undefined, currency: typeof invoice?.currency_code === "string" ? invoice.currency_code.toUpperCase() : undefined, pageState, invoiceStatus, paymentStatus, paid: pageState === "succeeded" && invoicePaid && paymentSucceeded };
}

export async function resolveChargebeeHostedPageForPayment(input: { invoiceId?: string; amount: number; currency: string; pendingHostedPageIds: string[]; site?: string; apiKey?: string }) {
  if (!input.invoiceId) return undefined;
  for (const hostedPageId of input.pendingHostedPageIds.slice(0, 25)) {
    const hostedPage = await retrieveChargebeeHostedPage(hostedPageId, { site: input.site, apiKey: input.apiKey });
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
  const pack = CHARGEBEE_TOKEN_PACKS[input.itemPriceId];
  const quantity = input.quantity ?? 1;
  if (!isTokenQuantity(quantity)) throw new Error("Invalid credit quantity");
  if (quantity === 1) {
    // Credit prices are per_unit in Chargebee (switched 2026-09-23). A per_unit
    // line item requires a quantity; omitting it fails the hosted page on load
    // with "line_items[0].quantity cannot be blank".
    form.set("item_prices[item_price_id][0]", input.itemPriceId);
    form.set("item_prices[quantity][0]", "1");
  } else {
    // Multi-credit purchases go as one server-computed ad hoc charge. The amount
    // comes only from the catalog constant, never from the client, and payment
    // reconciliation already matches on invoice amount + currency.
    form.set("charges[amount][0]", String(pack.amount * quantity));
    form.set("charges[description][0]", `SkipWait credits x ${quantity}`);
  }
  form.set("currency_code", pack.currency);
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
  form.set("subscription_items[item_price_id][0]", price.itemPriceId);
  form.set("subscription_items[quantity][0]", "1");
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
    // Chargebee's one-time hosted-page path is materially slower than its
    // subscription path in live traffic. Keep this bounded, but allow enough
    // time for the provider to return a page instead of aborting at 10 seconds.
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const cleanDiagnostic = (value: unknown, max: number) => typeof value === "string"
      ? value.replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7E]/g, "").slice(0, max)
      : "";
    const providerCode = cleanDiagnostic(body?.api_error_code ?? body?.type, 80) || "UNKNOWN";
    const providerParam = cleanDiagnostic(body?.param, 120) || "unknown";
    const providerMessage = cleanDiagnostic(body?.message, 240) || "unavailable";
    throw new Error(`Chargebee checkout failed (${response.status}, ${providerCode}, param=${providerParam}, message=${providerMessage})`);
  }
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
    signal: AbortSignal.timeout(10_000),
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
