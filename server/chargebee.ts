import crypto from "node:crypto";
import { resolvePlanItemPrice, type BillablePlanId, type BillingPeriod } from "../shared/billingCatalog";
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
  subscriptionId?: string;
  customerId?: string;
  occurredAt?: Date;
  /** The invoice and subscription objects named different subscriptions - never stamp paid evidence from this event. */
  subscriptionIdentityConflict?: boolean;
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
  /** The plan the subscription's item price sells (a kit pass or Keep warm); undefined for any other item price, including the retired Pro/Max (D-067). */
  plan?: BillablePlanId;
  /** The term that item price sells ("30d"/"90d" pass, "yearly" Keep warm). */
  interval?: BillingPeriod;
  /** The item price itself, so a webhook can be tied to the term the checkout intent named. */
  itemPriceId?: string;
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
  // D-155: the subscription this settled invoice belongs to. The invoice's
  // own subscription_id is authoritative - the invoice is what was actually
  // paid. A content.subscription.id that disagrees with it is a provider
  // identity conflict, not paid evidence: no subscription id is returned and
  // the caller alerts rather than stamps. A bare content.subscription.id
  // with no invoice reference is likewise not enough: it is detached from
  // the settled invoice.
  const invoiceSubscriptionId = typeof invoice?.subscription_id === "string" && invoice.subscription_id.length > 0 ? invoice.subscription_id : undefined;
  const contentSubscriptionId = typeof payload?.content?.subscription?.id === "string" && payload.content.subscription.id.length > 0 ? payload.content.subscription.id : undefined;
  const subscriptionIdentityConflict = invoiceSubscriptionId !== undefined && contentSubscriptionId !== undefined && invoiceSubscriptionId !== contentSubscriptionId;
  const subscriptionId = subscriptionIdentityConflict ? undefined : invoiceSubscriptionId;
  const customerId = typeof payload?.content?.customer?.id === "string" ? payload.content.customer.id : undefined;
  const occurredAt = dateFromChargebeeSeconds(payload?.occurred_at);
  return { eventId, invoiceId, hostedPageId, passThruContent, amount, currency, subscriptionId, customerId, occurredAt, subscriptionIdentityConflict } satisfies ParsedPaidPaymentEvent;
}

export type ParsedRefundEvent = { eventId: string; invoiceId?: string; refundAmount?: number; currency?: string };

/**
 * A provider refund (event `payment_refunded`). Fields that cannot be read are
 * left undefined and the handler treats that as "needs a human", never as
 * "nothing to do": a refund we cannot map must not disappear silently.
 */
export function parseRefundEvent(payload: any): ParsedRefundEvent | undefined {
  if (payload?.event_type !== "payment_refunded") return undefined;
  const eventId = getChargebeeEventId(payload);
  if (!eventId) return undefined;
  const content = payload?.content ?? {};
  const transaction = content.transaction;
  const creditNote = content.credit_note;
  const invoice = content.invoice;
  const invoiceId = typeof invoice?.id === "string" ? invoice.id : typeof creditNote?.reference_invoice_id === "string" ? creditNote.reference_invoice_id : undefined;
  const rawAmount = transaction && (transaction.type === undefined || transaction.type === "refund") && transaction.amount !== undefined ? transaction.amount : creditNote?.total;
  const amount = Number(rawAmount);
  const rawCurrency = transaction?.currency_code ?? creditNote?.currency_code ?? invoice?.currency_code;
  const currency = typeof rawCurrency === "string" ? rawCurrency.toUpperCase() : undefined;
  return { eventId, invoiceId, refundAmount: Number.isInteger(amount) && amount > 0 ? amount : undefined, currency };
}

function dateFromChargebeeSeconds(value: unknown) {
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds > 0 ? new Date(seconds * 1000) : undefined;
}

/** D-079: the payment-source events that confirm a validated card. Deletions and
 * every other event are ignored; the caller needs every field to act, so a
 * partial payload parses to nothing. */
export type ParsedPaymentSourceEvent = { eventId: string; eventType: string; customerId: string; paymentSourceId: string; status: string };
export function parsePaymentSourceEvent(payload: any): ParsedPaymentSourceEvent | undefined {
  const eventType = typeof payload?.event_type === "string" ? payload.event_type : "";
  if (eventType !== "payment_source_added" && eventType !== "payment_source_updated") return undefined;
  const source = payload?.content?.payment_source;
  const eventId = typeof payload?.id === "string" && payload.id ? payload.id : undefined;
  const customerId = typeof source?.customer_id === "string" && source.customer_id ? source.customer_id : undefined;
  const paymentSourceId = typeof source?.id === "string" && source.id ? source.id : undefined;
  const status = typeof source?.status === "string" && source.status ? source.status : undefined;
  if (!eventId || !customerId || !paymentSourceId || !status) return undefined;
  return { eventId, eventType, customerId, paymentSourceId, status };
}

export function parseSubscriptionEvent(payload: any): ParsedSubscriptionEvent | undefined {
  const eventType = typeof payload?.event_type === "string" ? payload.event_type : "";
  if (!eventType.startsWith("subscription_") && eventType !== "payment_succeeded") return undefined;
  const eventId = getChargebeeEventId(payload);
  const subscription = payload?.content?.subscription;
  const subscriptionId = typeof subscription?.id === "string" ? subscription.id : undefined;
  if (!eventId || !subscriptionId) return undefined;
  const itemPriceId = subscription?.subscription_items?.find?.((item: any) => typeof item?.item_price_id === "string")?.item_price_id;
  // One price book decides which plan and term an item price sells: the kit
  // catalog (30/90-day passes, Keep warm yearly) resolves here, so a live kit
  // pass can never arrive unmatched. A retired Pro/Max item price (D-067)
  // resolves to no plan, so the wallet records the event and grants nothing.
  const resolvedPrice = resolvePlanItemPrice(itemPriceId);
  const currency = typeof subscription?.currency_code === "string" ? subscription.currency_code.toUpperCase() : undefined;
  const hostedPage = payload?.content?.hosted_page;
  const resourceVersion = Number(subscription?.resource_version);
  return {
    eventId,
    eventType,
    hostedPageId: typeof hostedPage?.id === "string" ? hostedPage.id : undefined,
    passThruContent: typeof hostedPage?.pass_thru_content === "string" ? hostedPage.pass_thru_content : undefined,
    subscriptionId,
    plan: resolvedPrice?.plan,
    interval: resolvedPrice?.interval,
    itemPriceId: typeof itemPriceId === "string" ? itemPriceId : undefined,
    status: typeof subscription?.status === "string" ? subscription.status : "cancelled",
    currency: currency === "INR" || currency === "USD" ? currency : resolvedPrice?.currency,
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
    form.set("charges[description][0]", `skipwait.me credits x ${quantity}`);
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
