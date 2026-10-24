/**
 * D-132 plan family checkout (flag PLAN_FAMILY_V2, OFF until QA's payment-path
 * check passes and main relays the owner's enable word). The same rules as the
 * kit checkout (server/kitCheckout.ts), kept verbatim:
 *  - Nothing is sold until its Chargebee item price exists: the answer is
 *    `409 not_available_yet` with an honest sentence, and no hosted page opens.
 *  - A refusal is always answered before any provider call.
 *  - No card data reaches skipwait.me: every payment happens on Chargebee's page.
 *  - Insider is BY APPLICATION (D-132): refused 403 before any provider call.
 *  - Referrers never pay (D-055): the route refuses before reaching here.
 */
import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { planFamilyEntry, planFamilyV2Enabled, type PlanCreditRung } from "../shared/planFamily";
import { packItemPriceId, planCreditsItemPriceId, planItemPriceId, parseV2ItemPriceId } from "../shared/planFamilyBilling";
import { NOT_AVAILABLE_CODE, type V2PackCheckoutRequest, type V2PlanCheckoutRequest } from "../shared/subscriptionManagement";
import { itemPriceAvailability, type AvailabilityDeps, type PriceAvailability } from "./billingAvailability";
import { resolveItemPrice, type CatalogPrice } from "../shared/billingCatalog";
import { createBundleCheckout, createPackCheckout, type CheckoutCustomer, type HostedPageResult } from "./chargebeeSubscriptionApi";
import { resolveChargebeeRuntime } from "./chargebeeEnvironment";

type CheckoutCredentials = NonNullable<AvailabilityDeps["credentials"]>;

export type V2CheckoutDeps = {
  credentials?: (req: Request) => AvailabilityDeps["credentials"];
  isAvailable?: (req: Request, price: CatalogPrice) => boolean | Promise<boolean>;
  lookup?: AvailabilityDeps["lookup"];
  probeTimeoutMs?: number;
  // Test seams: a fake may be consulted before provider credentials resolve.
  createPackCheckout?: (credentials: CheckoutCredentials | null, input: Parameters<typeof createPackCheckout>[1]) => ReturnType<typeof createPackCheckout>;
  createBundleCheckout?: (credentials: CheckoutCredentials | null, input: Parameters<typeof createBundleCheckout>[1]) => ReturnType<typeof createBundleCheckout>;
  newCheckoutIntentId?: () => string;
};

export type V2CheckoutRefusal = { ok: false; status: number; error: string; code?: string };
export type V2PackCheckout = { ok: true; credits: number; amount: number; currency: "INR" | "USD"; itemPriceId: string; checkoutIntentId: string; checkout: HostedPageResult };
export type V2PlanCheckout = { ok: true; plan: "fast_track" | "insider"; rung: PlanCreditRung | 0; amount: number; currency: "INR" | "USD"; planItemPriceId: string; creditsItemPriceId?: string; checkoutIntentId: string; checkout: HostedPageResult };

const flagOff: V2CheckoutRefusal = { ok: false, status: 404, error: "Not available. Nothing has been charged." };
const notConfigured: V2CheckoutRefusal = { ok: false, status: 503, error: "Payments are not available right now. Please try again in a moment." };

function credentialsFor(req: Request, deps: V2CheckoutDeps): AvailabilityDeps["credentials"] {
  if (deps.credentials) return deps.credentials(req);
  try {
    return resolveChargebeeRuntime(req.hostname);
  } catch {
    return null;
  }
}

async function availabilityOf(req: Request, itemPriceId: string, deps: V2CheckoutDeps): Promise<PriceAvailability> {
  // The price book (shared/billingCatalog) resolves v2 ids to their true
  // kinds: plan fee, monthly addon rung or one-time charge pack.
  const expected = resolveItemPrice(itemPriceId);
  if (!expected) return "missing";
  if (deps.isAvailable) return (await deps.isAvailable(req, expected)) ? "available" : "missing";
  return itemPriceAvailability(expected, { credentials: credentialsFor(req, deps), lookup: deps.lookup, probeTimeoutMs: deps.probeTimeoutMs });
}

/** POST /api/chargebee/checkout for a D-132 one-time top-up pack. */
export async function startV2PackCheckout(input: { req: Request; request: V2PackCheckoutRequest; customer: CheckoutCustomer; urls: { redirectUrl: string; cancelUrl: string }; deps?: V2CheckoutDeps }): Promise<V2PackCheckout | V2CheckoutRefusal> {
  if (!planFamilyV2Enabled()) return flagOff;
  const deps = input.deps ?? {};
  const currency: "INR" | "USD" = input.request.billingCountry === "IN" ? "INR" : "USD";
  const itemPriceId = packItemPriceId(input.request.v2Rung, currency);
  const parsed = parseV2ItemPriceId(itemPriceId);
  if (parsed?.kind !== "pack") return { ok: false, status: 400, error: "That credit pack is not available for this billing route" };
  const credentials = credentialsFor(input.req, deps);
  const createCheckout = deps.createPackCheckout;
  if (!credentials && !createCheckout) return notConfigured;
  const verdict = await availabilityOf(input.req, itemPriceId, deps);
  // The provider did not answer: that is an outage, not a price that is missing.
  if (verdict === "unknown") return notConfigured;
  if (verdict !== "available") return { ok: false, status: 409, code: NOT_AVAILABLE_CODE, error: `The ${input.request.v2Rung}-credit pack is not on sale yet. Nothing has been charged.` };
  const checkoutIntentId = (deps.newCheckoutIntentId ?? randomUUID)();
  const checkoutInput = { ...input.customer, itemPriceId, currency, checkoutIntentId, redirectUrl: input.urls.redirectUrl, cancelUrl: input.urls.cancelUrl };
  let checkout: HostedPageResult;
  if (createCheckout) checkout = await createCheckout(credentials, checkoutInput);
  else if (credentials) checkout = await createPackCheckout(credentials, checkoutInput);
  else return notConfigured;
  return { ok: true, credits: input.request.v2Rung, amount: parsed.amount, currency, itemPriceId, checkoutIntentId, checkout };
}

/** POST /api/chargebee/subscription-checkout for a D-132 plan: fee + optional monthly credits rung, one monthly total. */
export async function startV2PlanCheckout(input: { req: Request; request: V2PlanCheckoutRequest; customer: CheckoutCustomer; urls: { redirectUrl: string; cancelUrl: string }; deps?: V2CheckoutDeps }): Promise<V2PlanCheckout | V2CheckoutRefusal> {
  if (!planFamilyV2Enabled()) return flagOff;
  const deps = input.deps ?? {};
  const plan = planFamilyEntry(input.request.v2Plan);
  // Insider joins by application only (D-132): refused before credentials or any probe.
  if (plan.byApplication) return { ok: false, status: 403, code: "application_required", error: `${plan.label} is by application. Apply and we'll set it up with you; nothing has been charged.` };
  const currency = input.request.billingCountry === "IN" ? "INR" : "USD";
  const planId = planItemPriceId(plan.id, currency);
  const creditsId = input.request.v2Rung === 0 ? undefined : planCreditsItemPriceId(input.request.v2Rung, currency);
  const notOnSale: V2CheckoutRefusal = { ok: false, status: 409, code: NOT_AVAILABLE_CODE, error: `${plan.label} is not on sale yet. Nothing has been charged.` };
  const planRef = parseV2ItemPriceId(planId);
  if (planRef?.kind !== "plan") return notOnSale;
  let creditsAmount = 0;
  if (creditsId) {
    const creditsRef = parseV2ItemPriceId(creditsId);
    if (creditsRef?.kind !== "planCredits") return notOnSale;
    creditsAmount = creditsRef.amount;
  }
  const credentials = credentialsFor(input.req, deps);
  const createCheckout = deps.createBundleCheckout;
  if (!credentials && !createCheckout) return notConfigured;
  for (const itemPriceId of creditsId ? [planId, creditsId] : [planId]) {
    const verdict = await availabilityOf(input.req, itemPriceId, deps);
    if (verdict === "unknown") return notConfigured;
    if (verdict !== "available") return notOnSale;
  }
  const checkoutIntentId = (deps.newCheckoutIntentId ?? randomUUID)();
  const checkoutInput = { ...input.customer, planItemPriceId: planId, creditsItemPriceId: creditsId, checkoutIntentId, redirectUrl: input.urls.redirectUrl, cancelUrl: input.urls.cancelUrl };
  let checkout: HostedPageResult;
  if (createCheckout) checkout = await createCheckout(credentials, checkoutInput);
  else if (credentials) checkout = await createBundleCheckout(credentials, checkoutInput);
  else return notConfigured;
  return { ok: true, plan: input.request.v2Plan, rung: input.request.v2Rung, amount: planRef.amount + creditsAmount, currency, planItemPriceId: planId, creditsItemPriceId: creditsId, checkoutIntentId, checkout };
}
