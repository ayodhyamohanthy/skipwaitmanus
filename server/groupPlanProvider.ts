/**
 * GROUP-provider (packet docs/plans/GROUP-plan-split.md §6.2): the typed
 * Chargebee adapter for a Group Plan order's immutable component contract.
 *
 * It takes components (item price id, quantity, recurring or one-time) and
 * never a recipient list, so no candidate identity can reach the provider.
 * Amounts are never sent: Chargebee charges the provisioned item prices, and
 * the only computed figure is the approved fixed discount, sent as a whole
 * minor-unit amount so the page total equals the quote.
 *
 * Chargebee has one hosted-page endpoint for a subscription checkout and a
 * different one for one-time charges. An order that holds both therefore needs
 * two pages. This module says so explicitly (`requiresSeparatePages`) and never
 * claims the two pages are atomic: the caller must show the components and the
 * payment progress for confirmation (§6.2).
 *
 * No Group SKU is introduced here, no live write happens without an explicit
 * caller, and no commercial default is invented: an unresolved policy refuses
 * before any provider call.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { chargebeeRequest, type ChargebeeCredentials } from "./chargebeeApi";

/** One provider component: an existing item price and how many of it. */
export const groupComponentSchema = z.object({
  itemPriceId: z.string().min(1).max(100),
  quantity: z.number().int().positive().max(1000),
  kind: z.enum(["recurring", "one_time"]),
});
export type GroupComponent = z.infer<typeof groupComponentSchema>;

const customerSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  email: z.string().email().max(200).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
});

/**
 * The immutable order projection this adapter accepts. `policyVersion` is
 * required so a caller cannot reach the provider with an unversioned quote.
 */
export const groupCheckoutRequestSchema = z.object({
  site: z.string().min(1).max(100),
  policyVersion: z.string().min(1).max(100),
  currency: z.enum(["INR", "USD"]),
  components: z.array(groupComponentSchema).min(1).max(50),
  /** Whole minor units, already allocated by the approved policy. */
  discountAmount: z.number().int().min(0),
  checkoutIntentId: z.string().min(1).max(200),
  redirectUrl: z.string().url().max(250),
  cancelUrl: z.string().url().max(250),
  billingCountry: z.enum(["IN", "INTL"]),
  customer: customerSchema.optional(),
});
export type GroupCheckoutRequest = z.infer<typeof groupCheckoutRequestSchema>;

export type GroupCheckoutPageKind = "recurring" | "one_time";

export type GroupCheckoutPage = {
  kind: GroupCheckoutPageKind;
  components: GroupComponent[];
  /** Deterministic per intent and page, so a retried call replays the same page. */
  idempotencyKey: string;
};

export type GroupCheckoutPlan = {
  pages: GroupCheckoutPage[];
  /** True when the order needs both endpoints; the caller must not claim atomicity. */
  requiresSeparatePages: boolean;
  discountAmount: number;
};

/** A refusal the caller must show, never swallow. */
export class GroupProviderRefusal extends Error {
  constructor(readonly code: "wrong_site" | "unsupported_composition" | "policy_unresolved", message: string) {
    super(message);
    this.name = "GroupProviderRefusal";
  }
}

/** Chargebee's documented idempotency-key bound (server/chargebeeApi.ts enforces 1-100). */
const IDEMPOTENCY_MAX = 100;

/**
 * A stable key per intent and page kind. Chargebee replays the first answer for
 * the same key inside its 30-minute window, so a retried request opens the same
 * page instead of a second one.
 */
export function groupIdempotencyKey(checkoutIntentId: string, kind: GroupCheckoutPageKind): string {
  const key = `group-${checkoutIntentId}-${kind}`;
  if (key.length <= IDEMPOTENCY_MAX) return key;
  // Keep the head (readable) and a content hash of the whole key, so two long
  // intents that differ only near the end cannot collapse onto one key.
  const digest = createHash("sha256").update(key).digest("base64url").slice(0, 12);
  return `${key.slice(0, IDEMPOTENCY_MAX - 13)}-${digest}`;
}

/**
 * Maps an order's components onto hosted pages without any provider call.
 * Refuses a wrong site and an order whose policy version is unresolved, so the
 * caller learns the exact reason before anything is created.
 */
export function planGroupCheckout(input: GroupCheckoutRequest, configuredSite: string): GroupCheckoutPlan {
  const order = groupCheckoutRequestSchema.parse(input);
  if (order.site !== configuredSite) {
    throw new GroupProviderRefusal("wrong_site", `This order belongs to site ${order.site}, not ${configuredSite}; refusing to open a page on the wrong site.`);
  }
  if (order.policyVersion.trim() === "") {
    throw new GroupProviderRefusal("policy_unresolved", "The order carries no approved policy version, so no payable page may be created.");
  }
  const recurring = order.components.filter(component => component.kind === "recurring");
  const oneTime = order.components.filter(component => component.kind === "one_time");
  const pages: GroupCheckoutPage[] = [];
  if (recurring.length > 0) pages.push({ kind: "recurring", components: recurring, idempotencyKey: groupIdempotencyKey(order.checkoutIntentId, "recurring") });
  if (oneTime.length > 0) pages.push({ kind: "one_time", components: oneTime, idempotencyKey: groupIdempotencyKey(order.checkoutIntentId, "one_time") });
  return { pages, requiresSeparatePages: pages.length > 1, discountAmount: order.discountAmount };
}

const hostedPageSchema = z.object({ hosted_page: z.object({ id: z.string().min(1).max(70), url: z.string().url().max(250) }) });

export type GroupHostedPage = { kind: GroupCheckoutPageKind; hostedPageId: string; checkoutUrl: string };

/** Hosted one-time pages are slower than subscription pages in live traffic (server/chargebee.ts). */
const RECURRING_TIMEOUT_MS = 20_000;
const ONE_TIME_TIMEOUT_MS = 25_000;

function setCommon(form: URLSearchParams, order: GroupCheckoutRequest) {
  if (order.customer?.id) form.set("customer[id]", order.customer.id);
  if (order.customer?.email) form.set("customer[email]", order.customer.email);
  if (order.customer?.firstName) form.set("customer[first_name]", order.customer.firstName);
  if (order.customer?.lastName) form.set("customer[last_name]", order.customer.lastName);
  // The India book is charged only with an Indian billing address (D-122, shared/billingRegion.ts).
  if (order.billingCountry === "IN") form.set("billing_address[country]", "IN");
  form.set("redirect_url", order.redirectUrl);
  form.set("cancel_url", order.cancelUrl);
  form.set("pass_thru_content", order.checkoutIntentId);
}

/** The exact form for one page. Exported so a test can pin every field name. */
export function groupPageForm(page: GroupCheckoutPage, order: GroupCheckoutRequest): URLSearchParams {
  const form = new URLSearchParams();
  if (page.kind === "recurring") {
    page.components.forEach((component, index) => {
      form.set(`subscription_items[item_price_id][${index}]`, component.itemPriceId);
      form.set(`subscription_items[quantity][${index}]`, String(component.quantity));
    });
  } else {
    page.components.forEach((component, index) => {
      form.set(`item_prices[item_price_id][${index}]`, component.itemPriceId);
      form.set(`item_prices[quantity][${index}]`, String(component.quantity));
    });
    form.set("currency_code", order.currency);
  }
  if (order.discountAmount > 0) {
    form.set("discounts[apply_on][0]", "invoice_amount");
    form.set("discounts[amount][0]", String(order.discountAmount));
  }
  setCommon(form, order);
  return form;
}

/**
 * Opens every page the plan needs. Each page carries its own idempotency key, so
 * a retry after a lost response replays the same page rather than creating a
 * second one. A failure on a later page leaves the earlier page created: the
 * caller must treat the order as partially opened and show it, never as paid.
 */
export async function createGroupCheckoutPages(credentials: ChargebeeCredentials, input: GroupCheckoutRequest): Promise<GroupHostedPage[]> {
  const order = groupCheckoutRequestSchema.parse(input);
  const plan = planGroupCheckout(order, credentials.site);
  const opened: GroupHostedPage[] = [];
  for (const page of plan.pages) {
    const path = page.kind === "recurring" ? "/hosted_pages/checkout_new_for_items" : "/hosted_pages/checkout_one_time_for_items";
    const body = await chargebeeRequest(credentials, {
      method: "POST",
      path,
      form: groupPageForm(page, order),
      timeoutMs: page.kind === "recurring" ? RECURRING_TIMEOUT_MS : ONE_TIME_TIMEOUT_MS,
      idempotencyKey: page.idempotencyKey,
    }, hostedPageSchema);
    opened.push({ kind: page.kind, hostedPageId: body.hosted_page.id, checkoutUrl: body.hosted_page.url });
  }
  return opened;
}

/**
 * The provider event this adapter accepts. Chargebee sends `id` (max 40),
 * `occurred_at` in UTC seconds and a `content` object; `resource_version`
 * orders out-of-order deliveries. Raw bodies are never stored (§4.3).
 */
export const groupProviderEventSchema = z.object({
  id: z.string().min(1).max(40),
  event_type: z.string().min(1).max(100),
  occurred_at: z.number().int().nonnegative(),
  resource_version: z.number().int().nonnegative().optional(),
  content: z.object({
    invoice: z.object({ id: z.string().min(1).max(100), status: z.string().max(50).optional(), total: z.number().int().optional(), currency_code: z.string().max(10).optional() }).optional(),
    transaction: z.object({ id: z.string().min(1).max(100), status: z.string().max(50).optional(), amount: z.number().int().optional() }).optional(),
    subscription: z.object({ id: z.string().min(1).max(100), status: z.string().max(50).optional() }).optional(),
    customer: z.object({ id: z.string().min(1).max(100) }).optional(),
  }),
});
export type GroupProviderEvent = z.infer<typeof groupProviderEventSchema>;

/** The event types this adapter understands; anything else is reported, not guessed. */
export const GROUP_PROVIDER_EVENT_TYPES = [
  "invoice.paid",
  "invoice.payment_failed",
  "payment.succeeded",
  "payment.failed",
  "refund.created",
  "refund.succeeded",
] as const;

export type GroupProviderEventOutcome = {
  eventId: string;
  eventType: string;
  /** True when the adapter can act on this type; false means report it, never infer. */
  supported: boolean;
  /** The provider's own ordering value; a lower value than the stored one is stale. */
  resourceVersion: number | null;
};

/** Parses one delivery and reports whether it is a type this adapter acts on. */
export function readGroupProviderEvent(body: unknown): GroupProviderEventOutcome {
  const event = groupProviderEventSchema.parse(body);
  return {
    eventId: event.id,
    eventType: event.event_type,
    supported: (GROUP_PROVIDER_EVENT_TYPES as readonly string[]).includes(event.event_type),
    resourceVersion: event.resource_version ?? null,
  };
}

/**
 * Out-of-order delivery: Chargebee retries for up to two days and can deliver an
 * older event after a newer one, so a lower `resource_version` than the stored
 * one is stale and must not overwrite it. A missing version is treated as stale
 * only when a version is already stored, because it cannot be ordered.
 */
export function isStaleGroupProviderEvent(incoming: GroupProviderEventOutcome, storedResourceVersion: number | null): boolean {
  if (storedResourceVersion === null) return false;
  if (incoming.resourceVersion === null) return true;
  return incoming.resourceVersion < storedResourceVersion;
}
