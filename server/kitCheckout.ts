/**
 * Kit checkout (spec 4.1 step 2): a 30/90-day pass, Keep warm by the year, or a
 * credit pack. The client names a plan term or a pack; the server charges the
 * catalog amount (shared/billingCatalog.ts) and never trusts a client price.
 *
 * Two rules every caller must keep:
 *  - Nothing is sold until its Chargebee item price exists (owner action). The
 *    answer is `409 not_available_yet` with an honest sentence, and no hosted
 *    page is opened, so a missing item price can never charge the wrong amount.
 *  - A refusal is always answered before any provider call. The intent row (and
 *    therefore the entitlement) is written by the caller only after Chargebee
 *    returned a page, and the pass becomes real only from a verified webhook
 *    (server/db.ts applyChargebeeSubscriptionEvent).
 * No card data reaches skipwait.me: every payment happens on Chargebee's page.
 */
import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { billingPlanLabel, packPrice, planPrice, type CatalogPrice, type PackPrice, type PlanPrice } from "../shared/billingCatalog";
import { CREDIT_PACKS, type CatalogCurrency } from "../shared/planCatalog";
import { PASS_SALES_ENABLED, catalogPlanById } from "../shared/planCatalog";
import { NOT_AVAILABLE_CODE, type KitPlanCheckoutRequest, type PackCheckoutRequest } from "../shared/subscriptionManagement";
import { itemPriceAvailability, type AvailabilityDeps, type PriceAvailability } from "./billingAvailability";
import { createPackCheckout, createPlanCheckout, type CheckoutCustomer, type HostedPageResult } from "./chargebeeSubscriptionApi";
import { resolveChargebeeRuntime } from "./chargebeeEnvironment";

export type KitCheckoutDeps = {
  /** Chargebee credentials for this request, or null when billing is not configured. */
  credentials?: (req: Request) => AvailabilityDeps["credentials"];
  /** Tests: the availability answer for one item price. */
  isAvailable?: (req: Request, price: CatalogPrice) => boolean | Promise<boolean>;
  /** Tests: how the provider is asked about one item price, and the budget for one probe. */
  lookup?: AvailabilityDeps["lookup"];
  probeTimeoutMs?: number;
  /** Tests: bound provider calls; the defaults resolve the site from the request host. */
  createPlanCheckout?: typeof createPlanCheckout;
  createPackCheckout?: typeof createPackCheckout;
  /** Tests: a deterministic checkout intent id. */
  newCheckoutIntentId?: () => string;
};

export type KitCheckoutRefusal = { ok: false; status: number; error: string; code?: string };
export type KitPlanCheckout = { ok: true; price: PlanPrice; checkoutIntentId: string; checkout: HostedPageResult };
export type KitPackCheckout = { ok: true; price: PackPrice; checkoutIntentId: string; checkout: HostedPageResult };

/** The four fields the caller answers from the session; billing never reads a client price. */
export type KitCustomer = CheckoutCustomer;
export type KitReturnUrls = { redirectUrl: string; cancelUrl: string };

function credentialsFor(req: Request, deps: KitCheckoutDeps): AvailabilityDeps["credentials"] {
  if (deps.credentials) return deps.credentials(req);
  try {
    return resolveChargebeeRuntime(req.hostname);
  } catch {
    return null;
  }
}

async function availabilityOf(req: Request, price: CatalogPrice, deps: KitCheckoutDeps): Promise<PriceAvailability> {
  if (deps.isAvailable) return (await deps.isAvailable(req, price)) ? "available" : "missing";
  return itemPriceAvailability(price, { credentials: credentialsFor(req, deps), lookup: deps.lookup, probeTimeoutMs: deps.probeTimeoutMs });
}

/** "Momentum" / "Land Sprint"; the catalog label, never a client string. */
const kitPriceError = (price: PlanPrice): string => `${billingPlanLabel(price.plan)} is not on sale yet. Nothing has been charged.`;
const packPriceError = (price: PackPrice): string => `The ${price.credits}-credit pack is not on sale yet. Nothing has been charged.`;

export const APPLICATION_REQUIRED_CODE = "application_required";
const notConfigured: KitCheckoutRefusal = { ok: false, status: 503, error: "Payments are not available right now. Please try again in a moment." };

/** POST /api/chargebee/subscription-checkout for a kit plan term: the whole decision before any charge. */
export async function startKitPlanCheckout(input: { req: Request; request: KitPlanCheckoutRequest; customer: KitCustomer; urls: KitReturnUrls; deps?: KitCheckoutDeps }): Promise<KitPlanCheckout | KitCheckoutRefusal> {
  const deps = input.deps ?? {};
  const { planId, interval, currency } = input.request;
  const price = planPrice(planId, interval, currency);
  // The request schema already refuses a term the plan does not sell; this is defence in depth.
  if (!price) return { ok: false, status: 400, error: "That plan is not sold for this term" };
  // A by-application plan (Land Concierge) is never self-serve: refuse before any provider call, whatever the client sends.
  if (catalogPlanById(planId)?.byApplication) return { ok: false, status: 403, code: APPLICATION_REQUIRED_CODE, error: `${billingPlanLabel(price.plan)} is by application. Apply and we'll set it up with you; nothing has been charged.` };
  // D-084: passes and Keep warm are not sold until a paid pass can always be activated
  // (GO-LIVE-1b). Refused before credentials or any probe, so nothing reaches the provider.
  if (!PASS_SALES_ENABLED) return { ok: false, status: 409, code: NOT_AVAILABLE_CODE, error: kitPriceError(price) };
  const credentials = credentialsFor(input.req, deps);
  if (!credentials && !deps.createPlanCheckout) return notConfigured;
  const verdict = await availabilityOf(input.req, price, deps);
  // The provider did not answer: that is an outage, not a price that is missing.
  if (verdict === "unknown") return notConfigured;
  if (verdict !== "available") return { ok: false, status: 409, code: NOT_AVAILABLE_CODE, error: kitPriceError(price) };
  const checkoutIntentId = (deps.newCheckoutIntentId ?? randomUUID)();
  const checkout = await (deps.createPlanCheckout ?? createPlanCheckout)(credentials!, {
    ...input.customer,
    itemPriceId: price.itemPriceId,
    checkoutIntentId,
    redirectUrl: input.urls.redirectUrl,
    cancelUrl: input.urls.cancelUrl,
  });
  return { ok: true, price, checkoutIntentId, checkout };
}

/** POST /api/chargebee/checkout for a kit credit pack: one unit of the pack's own item price. */
export async function startKitPackCheckout(input: { req: Request; request: PackCheckoutRequest; customer: KitCustomer; urls: KitReturnUrls; deps?: KitCheckoutDeps }): Promise<KitPackCheckout | KitCheckoutRefusal> {
  const deps = input.deps ?? {};
  const price = packPrice(input.request.packId, input.request.billingCountry === "IN" ? "INR" : "USD");
  if (!price) return { ok: false, status: 400, error: "That credit pack is not available for this billing route" };
  const credentials = credentialsFor(input.req, deps);
  if (!credentials && !deps.createPackCheckout) return notConfigured;
  const verdict = await availabilityOf(input.req, price, deps);
  // The provider did not answer: that is an outage, not a price that is missing.
  if (verdict === "unknown") return notConfigured;
  if (verdict !== "available") return { ok: false, status: 409, code: NOT_AVAILABLE_CODE, error: packPriceError(price) };
  const checkoutIntentId = (deps.newCheckoutIntentId ?? randomUUID)();
  const checkout = await (deps.createPackCheckout ?? createPackCheckout)(credentials!, {
    ...input.customer,
    itemPriceId: price.itemPriceId,
    currency: price.currency,
    checkoutIntentId,
    redirectUrl: input.urls.redirectUrl,
    cancelUrl: input.urls.cancelUrl,
  });
  return { ok: true, price, checkoutIntentId, checkout };
}

/**
 * GO-LIVE-1 (D-036): is any credit pack on sale in this currency right now?
 * Drives the per-currency retirement of the legacy single credit. An
 * unreachable or unconfigured provider answers false, so an outage never
 * retires a checkout path.
 */
export async function anyPackAvailableForCurrency(req: Request, currency: CatalogCurrency, deps: KitCheckoutDeps = {}): Promise<boolean> {
  for (const pack of CREDIT_PACKS) {
    const price = packPrice(pack.id, currency);
    if (!price) continue;
    if ((await availabilityOf(req, price, deps)) === "available") return true;
  }
  return false;
}

/** The JSON body for a refusal: the code lets the kit UI branch, `error` is shown as written. */
export function refusalBody(refusal: KitCheckoutRefusal): { error: string; code?: string } {
  return refusal.code ? { error: refusal.error, code: refusal.code } : { error: refusal.error };
}
