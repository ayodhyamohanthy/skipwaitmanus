// Chargebee calls for kit checkout and subscription lifecycle (hosted pages,
// plan changes, cancel, pause, reactivate). Every amount is the item price the
// server picked from the catalog; nothing here reads a client price. Each call
// is mocked in tests: real payment execution is prohibited in engineering/QA.
import { z } from "zod";
import { classifyV2SubscriptionItems } from "../shared/planFamilyBilling";
import { resolvePlanItemPrice } from "../shared/billingCatalog";
import { ChargebeeApiError, chargebeeRequest, idPath, providerDate, toProviderSeconds, type ChargebeeCredentials } from "./chargebeeApi";

const hostedPageSchema = z.object({
  hosted_page: z.object({ id: z.string().min(1).max(80), url: z.string().url() }),
});

export const providerSubscriptionSchema = z.object({
  id: z.string().min(1).max(80),
  status: z.string().min(1).max(32),
  customer_id: z.string().max(80).optional(),
  current_term_end: providerDate.optional(),
  has_scheduled_changes: z.boolean().optional(),
  pause_date: providerDate.optional(),
  resume_date: providerDate.optional(),
});
const subscriptionResponseSchema = z.object({ subscription: providerSubscriptionSchema });
export type ProviderSubscription = z.infer<typeof providerSubscriptionSchema>;

export type CheckoutCustomer = { customerId?: string; email?: string; firstName?: string; lastName?: string; billingCountry?: "IN" | "INTL" };
export type HostedPageResult = { checkoutUrl: string; hostedPageId: string };
type ReturnUrls = { redirectUrl: string; cancelUrl: string };

/** An existing billing customer is reused (one customer, one set of saved methods); otherwise Chargebee creates one. */
function setCustomer(form: URLSearchParams, customer: CheckoutCustomer) {
  if (customer.customerId) form.set("customer[id]", customer.customerId);
  if (customer.email) form.set("customer[email]", customer.email);
  if (customer.firstName) form.set("customer[first_name]", customer.firstName);
  if (customer.lastName) form.set("customer[last_name]", customer.lastName);
  if (customer.billingCountry === "IN") form.set("billing_address[country]", "IN");
}

async function hostedPage(credentials: ChargebeeCredentials, path: string, form: URLSearchParams): Promise<HostedPageResult> {
  // Hosted one-time pages are slower than subscription pages in live traffic (server/chargebee.ts).
  const body = await chargebeeRequest(credentials, { method: "POST", path, form, timeoutMs: 25_000 }, hostedPageSchema);
  return { checkoutUrl: body.hosted_page.url, hostedPageId: body.hosted_page.id };
}

/** A new subscription to one catalog item price (kit plan, monthly or yearly). */
export function createPlanCheckout(credentials: ChargebeeCredentials, input: CheckoutCustomer & ReturnUrls & { itemPriceId: string; checkoutIntentId: string }): Promise<HostedPageResult> {
  const form = new URLSearchParams();
  form.set("subscription_items[item_price_id][0]", input.itemPriceId);
  form.set("subscription_items[quantity][0]", "1");
  // GO-LIVE-1 (D-005, D-046): every kit plan term is paid once. Without an explicit
  // billing_cycles the subscription renews on the item price's default term; a pass
  // must never renew unless the seeker opted in (opt-in is GO-LIVE-2).
  form.set("subscription_items[billing_cycles][0]", "1");
  setCustomer(form, input);
  form.set("redirect_url", input.redirectUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("pass_thru_content", input.checkoutIntentId);
  return hostedPage(credentials, "/hosted_pages/checkout_new_for_items", form);
}

/** A D-132 bundle: the plan fee plus the in-plan monthly credits rung as one renewing monthly subscription ("change or cancel any time" - unlike the kit passes there is no single-term cap). */
export function createBundleCheckout(credentials: ChargebeeCredentials, input: CheckoutCustomer & ReturnUrls & { planItemPriceId: string; creditsItemPriceId?: string; checkoutIntentId: string }): Promise<HostedPageResult> {
  const form = new URLSearchParams();
  form.set("subscription_items[item_price_id][0]", input.planItemPriceId);
  form.set("subscription_items[quantity][0]", "1");
  if (input.creditsItemPriceId) {
    form.set("subscription_items[item_price_id][1]", input.creditsItemPriceId);
    form.set("subscription_items[quantity][1]", "1");
  }
  setCustomer(form, input);
  form.set("redirect_url", input.redirectUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("pass_thru_content", input.checkoutIntentId);
  return hostedPage(credentials, "/hosted_pages/checkout_new_for_items", form);
}

/** A one-time credit pack: one unit of the pack's own item price, never a computed charge. */
export function createPackCheckout(credentials: ChargebeeCredentials, input: CheckoutCustomer & ReturnUrls & { itemPriceId: string; currency: "USD" | "INR"; checkoutIntentId: string }): Promise<HostedPageResult> {
  const form = new URLSearchParams();
  form.set("item_prices[item_price_id][0]", input.itemPriceId);
  form.set("item_prices[quantity][0]", "1");
  form.set("currency_code", input.currency);
  setCustomer(form, input);
  form.set("redirect_url", input.redirectUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("pass_thru_content", input.checkoutIntentId);
  return hostedPage(credentials, "/hosted_pages/checkout_one_time_for_items", form);
}

/** An upgrade of an existing subscription: the member confirms and pays the prorated difference on Chargebee's page. */
export function createChangeCheckout(credentials: ChargebeeCredentials, input: ReturnUrls & { subscriptionId: string; itemPriceId: string; checkoutIntentId: string }): Promise<HostedPageResult> {
  const form = new URLSearchParams();
  form.set("subscription[id]", input.subscriptionId);
  form.set("replace_items_list", "true");
  form.set("subscription_items[item_price_id][0]", input.itemPriceId);
  form.set("subscription_items[quantity][0]", "1");
  form.set("redirect_url", input.redirectUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("pass_thru_content", input.checkoutIntentId);
  return hostedPage(credentials, "/hosted_pages/checkout_existing_for_items", form);
}

async function subscriptionCall(credentials: ChargebeeCredentials, subscriptionId: string, action: string, form: URLSearchParams = new URLSearchParams()): Promise<ProviderSubscription> {
  const body = await chargebeeRequest(credentials, { method: "POST", path: `/subscriptions/${idPath(subscriptionId)}/${action}`, form }, subscriptionResponseSchema);
  if (body.subscription.id !== subscriptionId) throw new Error("Chargebee answered for a different subscription");
  return body.subscription;
}

/** A switch down at term end: nothing is charged now and nothing paid for is cut short. */
export function scheduleSubscriptionChange(credentials: ChargebeeCredentials, input: { subscriptionId: string; itemPriceId: string }): Promise<ProviderSubscription> {
  const form = new URLSearchParams();
  form.set("replace_items_list", "true");
  form.set("subscription_items[item_price_id][0]", input.itemPriceId);
  form.set("subscription_items[quantity][0]", "1");
  form.set("change_option", "end_of_term");
  return subscriptionCall(credentials, input.subscriptionId, "update_for_items", form);
}

export function removeScheduledChanges(credentials: ChargebeeCredentials, subscriptionId: string): Promise<ProviderSubscription> {
  return subscriptionCall(credentials, subscriptionId, "remove_scheduled_changes");
}

export function cancelAtTermEnd(credentials: ChargebeeCredentials, subscriptionId: string): Promise<ProviderSubscription> {
  return subscriptionCall(credentials, subscriptionId, "cancel_for_items", new URLSearchParams({ cancel_option: "end_of_term" }));
}

/** "Keep my plan": the scheduled cancellation is removed and the plan renews as before. */
export function removeScheduledCancellation(credentials: ChargebeeCredentials, subscriptionId: string): Promise<ProviderSubscription> {
  return subscriptionCall(credentials, subscriptionId, "remove_scheduled_cancellation");
}

/** "Pause for 1 month" from the end of the paid term, resuming on `resumeAt`. */
export function pauseAtTermEnd(credentials: ChargebeeCredentials, input: { subscriptionId: string; resumeAt: Date }): Promise<ProviderSubscription> {
  return subscriptionCall(credentials, input.subscriptionId, "pause", new URLSearchParams({ pause_option: "end_of_term", resume_date: toProviderSeconds(input.resumeAt) }));
}

export function removeScheduledPause(credentials: ChargebeeCredentials, subscriptionId: string): Promise<ProviderSubscription> {
  return subscriptionCall(credentials, subscriptionId, "remove_scheduled_pause");
}

/** Resumes a paused plan now; Chargebee opens a new term and invoices it. */
export function resumeNow(credentials: ChargebeeCredentials, subscriptionId: string): Promise<ProviderSubscription> {
  return subscriptionCall(credentials, subscriptionId, "resume", new URLSearchParams({ resume_option: "immediately" }));
}

const itemPriceSchema = z.object({
  item_price: z.object({
    id: z.string(),
    status: z.string().optional(),
    currency_code: z.string().optional(),
    price: z.number().int().optional(),
    period: z.number().int().optional(),
    period_unit: z.string().optional(),
    item_type: z.string().optional(),
  }),
});
export type ProviderItemPrice = z.infer<typeof itemPriceSchema>["item_price"];

/** The item price as configured on the site, or null when it does not exist there. */
export async function retrieveItemPrice(credentials: ChargebeeCredentials, itemPriceId: string): Promise<ProviderItemPrice | null> {
  try {
    const body = await chargebeeRequest(credentials, { method: "GET", path: `/item_prices/${idPath(itemPriceId)}`, timeoutMs: 8_000 }, itemPriceSchema);
    return body.item_price.id === itemPriceId ? body.item_price : null;
  } catch (error) {
    if (error instanceof ChargebeeApiError && error.status === 404) return null;
    throw error;
  }
}

const subscriptionHostedPageSchema = z.object({
  hosted_page: z.object({
    id: z.string(),
    state: z.string().optional(),
    pass_thru_content: z.string().optional(),
    content: z.object({
      subscription: z.object({
        id: z.string(),
        customer_id: z.string().optional(),
        status: z.string().optional(),
        currency_code: z.string().optional(),
        current_term_start: z.number().optional(),
        current_term_end: z.number().optional(),
        resource_version: z.number().optional(),
        subscription_items: z.array(z.object({ item_price_id: z.string().optional() })).optional(),
      }).optional(),
    }).optional(),
  }),
});

/** The provider's own record of one checkout page's subscription: every field recovery activates from. */
export type CheckoutPageSubscription = {
  id: string;
  customerId?: string;
  status: string;
  currency?: "INR" | "USD";
  itemPriceId?: string;
  itemPriceIds?: string[];
  currentTermStart?: Date;
  currentTermEnd?: Date;
  resourceVersion?: number;
};

export type RetrievedCheckoutSubscription = {
  hostedPageId: string;
  state: string;
  passThruContent: string | null;
  subscriptionId: string | null;
  customerId: string | null;
  subscription: CheckoutPageSubscription | null;
};

/** The subscription a hosted checkout created, read server-to-server to tie a webhook to its intent. */
export async function retrieveCheckoutSubscription(credentials: ChargebeeCredentials, hostedPageId: string): Promise<RetrievedCheckoutSubscription | null> {
  const body = await chargebeeRequest(credentials, { method: "GET", path: `/hosted_pages/${idPath(hostedPageId)}`, timeoutMs: 8_000 }, subscriptionHostedPageSchema).catch(() => null);
  if (!body || body.hosted_page.id !== hostedPageId) return null;
  const subscription = body.hosted_page.content?.subscription;
  const record: CheckoutPageSubscription | null = subscription
    ? {
        id: subscription.id,
        customerId: subscription.customer_id,
        status: (subscription.status ?? "unknown").toLowerCase(),
        currency: subscription.currency_code === "INR" || subscription.currency_code === "USD" ? subscription.currency_code : undefined,
        itemPriceId: subscription.subscription_items?.find(item => typeof item.item_price_id === "string")?.item_price_id,
        itemPriceIds: Array.isArray(subscription.subscription_items) ? subscription.subscription_items.map(item => item.item_price_id).filter((id): id is string => typeof id === "string") : undefined,
        currentTermStart: typeof subscription.current_term_start === "number" ? new Date(subscription.current_term_start * 1000) : undefined,
        currentTermEnd: typeof subscription.current_term_end === "number" ? new Date(subscription.current_term_end * 1000) : undefined,
        resourceVersion: Number.isSafeInteger(subscription.resource_version) && (subscription.resource_version ?? 0) > 0 ? subscription.resource_version : undefined,
      }
    : null;
  return { hostedPageId, state: (body.hosted_page.state ?? "unknown").toLowerCase(), passThruContent: body.hosted_page.pass_thru_content ?? null, subscriptionId: subscription?.id ?? null, customerId: subscription?.customer_id ?? null, subscription: record };
}

/**
 * GO-LIVE-1b ruling 1: recovery builds the same activation input the webhook
 * builds, from the provider's own checkout page - never from the client. The
 * event id keys it `hosted_page:<id>`, so a replay, and a webhook for the same
 * subscription after recovery, grant once. Null when the page does not carry a
 * complete subscription (an unfinished checkout; the caller stays pending).
 */
export function subscriptionEventFromCheckoutPage(page: RetrievedCheckoutSubscription) {
  const subscription = page.subscription;
  if (!subscription) return null;
  const resolvedPrice = resolvePlanItemPrice(subscription.itemPriceId);
  const v2 = classifyV2SubscriptionItems(subscription.itemPriceIds ?? (subscription.itemPriceId ? [subscription.itemPriceId] : []));
  return {
    eventId: `hosted_page:${page.hostedPageId}`,
    eventType: "subscription_created",
    hostedPageId: page.hostedPageId,
    passThruContent: page.passThruContent ?? undefined,
    subscriptionId: subscription.id,
    plan: resolvedPrice?.plan,
    planFamily: v2.plan?.planId,
    planFamilyRung: v2.credits?.rung,
    interval: resolvedPrice?.interval,
    itemPriceId: subscription.itemPriceId,
    status: subscription.status,
    currency: subscription.currency ?? resolvedPrice?.currency,
    currentTermStart: subscription.currentTermStart,
    currentTermEnd: subscription.currentTermEnd,
    resourceVersion: subscription.resourceVersion,
  };
}
