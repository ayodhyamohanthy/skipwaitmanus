/**
 * BANDED-checkout (D-219 frozen prices, D-366 (3), D-367, D-370 (6)): the whole
 * decision before any charge, behind BANDED_SALES_ENABLED (default off).
 *
 * Order every caller keeps, so a refusal never reaches the provider:
 *  1. switch off -> 409 not_on_sale, before any read;
 *  2. plan rules (by application, already a member / band, levels in band);
 *  3. billing keys and the provider's item price must match the frozen book;
 *  4. a plan reserves its founding place atomically (server/bandedCheckoutStore.ts);
 *  5. only then a hosted page, keyed by the checkout's idempotency key. A new
 *     reservation is released if the page cannot be opened.
 * Nothing is granted here: included and purchased referrals come only from a
 * verified webhook (BANDED-grants). No card data reaches skipwait.me.
 */
import { createHash } from "node:crypto";
import { bandedPlanCatalogPrice, bandedReferralCatalogPrice, type BandedCatalogPrice } from "../shared/bandedCatalog";
import { LEVEL_DISPLAY_NAME, bandIncludes, bandLevels, planFamilyEntry, type PlanFamilyId } from "../shared/planFamily";
import { BANDED_REFUSALS, bandedReferralQuote, currencyForCountry, type BandedPlanCheckoutRequest, type BandedReferralCheckoutRequest, type BandedReferralQuote } from "../shared/subscriptionManagement";
import { createBandedPlanPage, createBandedReferralPage } from "./bandedCheckoutProvider";
import { resolveChargebeeRuntime } from "./chargebeeEnvironment";
import { retrieveItemPrice, type CheckoutCustomer, type HostedPageResult, type ProviderItemPrice } from "./chargebeeSubscriptionApi";

/** A reservation outlives the provider page (3 hours) twice over; an unpaid one is then released. */
export const BANDED_RESERVATION_TTL_MS = 6 * 60 * 60 * 1000;
const PROBE_TIMEOUT_MS = 15_000;

/** BANDED_SALES_ENABLED: off unless exactly "true". The release row turns it on after TEST-site QA. */
export function bandedSalesEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return (env.BANDED_SALES_ENABLED ?? "").trim().toLowerCase() === "true";
}

export type BandedSite = "test" | "live";
export type BandedRuntime = { environment: BandedSite; site: string; apiKey: string };
export type FoundingReservation = { status: "reserved" | "existing" | "full" | "key_used" };
export type BandedMembership = { bandedPlan: PlanFamilyId | null; activeSubscription: boolean };

export type BandedCheckoutDeps = {
  /** Tests; production reads BANDED_SALES_ENABLED. */
  salesEnabled?: () => boolean;
  /** The configured billing site, or null when billing keys are missing. */
  credentials?: () => BandedRuntime | null;
  lookupItemPrice?: (credentials: { site: string; apiKey: string }, itemPriceId: string) => Promise<ProviderItemPrice | null>;
  probeTimeoutMs?: number;
  membership: (userId: number) => Promise<BandedMembership>;
  reserveFoundingPlace: (input: { site: BandedSite; planId: PlanFamilyId; userId: number; checkoutIntentId: string; now: Date; expiresAt: Date }) => Promise<FoundingReservation>;
  releaseFoundingPlace: (input: { site: BandedSite; checkoutIntentId: string; now: Date }) => Promise<{ released: boolean }>;
  foundingPlacesLeft: (site: BandedSite, now: Date) => Promise<Record<PlanFamilyId, number>>;
  createPlanPage?: typeof createBandedPlanPage;
  createReferralPage?: typeof createBandedReferralPage;
  now?: () => Date;
};

export type BandedRefusal = { ok: false; status: number; code?: string; error: string };
export type BandedPlanCheckout = { ok: true; site: BandedSite; price: Extract<BandedCatalogPrice, { kind: "banded_plan" }>; checkoutIntentId: string; checkout: HostedPageResult };
export type BandedReferralCheckout = { ok: true; site: BandedSite; quote: BandedReferralQuote; checkoutIntentId: string; checkout: HostedPageResult };
type Customer = Pick<CheckoutCustomer, "customerId" | "email" | "firstName" | "lastName">;
type ReturnUrls = { redirectUrl: string; cancelUrl: string };

const NOTHING_CHARGED = "Nothing has been charged.";
export const BANDED_NOT_ON_SALE: BandedRefusal = { ok: false, status: 409, code: BANDED_REFUSALS.notOnSale, error: `These plans are not on sale yet. ${NOTHING_CHARGED}` };
const outage: BandedRefusal = { ok: false, status: 503, error: "Payments are not available right now. Please try again in a moment." };
const refuse = (status: number, code: string, error: string): BandedRefusal => ({ ok: false, status, code, error });

/** The checkout's own id, sent as pass_thru_content and as the provider idempotency key (<= 96 chars). */
export function bandedCheckoutIntentId(kind: "plan" | "referral", site: BandedSite, userId: number, idempotencyKey: string): string {
  const digest = createHash("sha256").update(`${site}|${userId}|${kind}|${idempotencyKey}`).digest("hex").slice(0, 48);
  return `${kind === "plan" ? "bp" : "br"}_${digest}`;
}

/** The billing site this request sells on, or null when billing is not configured. */
export function bandedRuntime(deps: BandedCheckoutDeps): BandedRuntime | null {
  if (deps.credentials) return deps.credentials();
  try {
    return resolveChargebeeRuntime(undefined);
  } catch {
    return null;
  }
}

function isEnabled(deps: BandedCheckoutDeps): boolean {
  return (deps.salesEnabled ?? bandedSalesEnabled)();
}

/** True only when the site's item price sells exactly the frozen banded price. */
function priceMatches(found: ProviderItemPrice | null, expected: BandedCatalogPrice): boolean {
  if (!found || found.id !== expected.itemPriceId || found.status !== "active") return false;
  if (found.currency_code !== expected.currency || found.price !== expected.amount) return false;
  if (expected.kind === "banded_referral") return found.item_type === undefined || found.item_type === "charge";
  if (found.item_type !== undefined && found.item_type !== "plan") return false;
  return found.period_unit === "month" && found.period === 1;
}

async function priceVerdict(credentials: BandedRuntime, price: BandedCatalogPrice, deps: BandedCheckoutDeps): Promise<"available" | "missing" | "unknown"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"unknown">(resolve => { timer = setTimeout(() => resolve("unknown"), deps.probeTimeoutMs ?? PROBE_TIMEOUT_MS); });
  const answer = (deps.lookupItemPrice ?? retrieveItemPrice)(credentials, price.itemPriceId)
    .then(found => (priceMatches(found, price) ? "available" as const : "missing" as const))
    // A provider error is not proof the price is absent: say we do not know.
    .catch(() => "unknown" as const);
  try {
    return await Promise.race([answer, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** POST /api/chargebee/banded/plan-checkout: one monthly banded plan, founding place reserved first. */
export async function startBandedPlanCheckout(input: { userId: number; request: BandedPlanCheckoutRequest; customer: Customer; urls: ReturnUrls; deps: BandedCheckoutDeps }): Promise<BandedPlanCheckout | BandedRefusal> {
  const { deps, userId, request } = input;
  if (!isEnabled(deps)) return BANDED_NOT_ON_SALE;
  const entry = planFamilyEntry(request.planId);
  if (entry.byApplication) return refuse(403, BANDED_REFUSALS.applicationRequired, `${entry.label} is by application. Apply and we'll set it up with you; nothing has been charged.`);
  const membership = await deps.membership(userId);
  if (membership.activeSubscription || membership.bandedPlan) return refuse(409, BANDED_REFUSALS.activeSubscription, `You already have an active plan. Manage it from Billing; nothing has been charged.`);
  const credentials = bandedRuntime(deps);
  if (!credentials) return outage;
  const price = bandedPlanCatalogPrice(request.planId, currencyForCountry(request.billingCountry));
  if (price.kind !== "banded_plan") return outage;
  const verdict = await priceVerdict(credentials, price, deps);
  if (verdict === "unknown") return outage;
  if (verdict === "missing") return refuse(409, BANDED_REFUSALS.notAvailable, `${entry.label} is not on sale yet. ${NOTHING_CHARGED}`);

  const site = credentials.environment;
  const now = (deps.now ?? (() => new Date()))();
  const checkoutIntentId = bandedCheckoutIntentId("plan", site, userId, request.idempotencyKey);
  const reservation = await deps.reserveFoundingPlace({ site, planId: request.planId, userId, checkoutIntentId, now, expiresAt: new Date(now.getTime() + BANDED_RESERVATION_TTL_MS) });
  // D-367 (5): a full band stops selling; the regular price is the owner's to set, never invented here.
  if (reservation.status === "full") return refuse(409, BANDED_REFUSALS.foundingFull, `Founding places for ${entry.label} are taken. ${NOTHING_CHARGED}`);
  if (reservation.status === "key_used") return refuse(409, BANDED_REFUSALS.checkoutKeyUsed, `This checkout was already started. Start a new one; nothing has been charged.`);
  try {
    const checkout = await (deps.createPlanPage ?? createBandedPlanPage)(credentials, {
      ...input.customer,
      billingCountry: request.billingCountry,
      itemPriceId: price.itemPriceId,
      checkoutIntentId,
      idempotencyKey: checkoutIntentId,
      redirectUrl: input.urls.redirectUrl,
      cancelUrl: input.urls.cancelUrl,
    });
    return { ok: true, site, price, checkoutIntentId, checkout };
  } catch (error) {
    // Only this request's own new reservation is released; a replayed key may already have a page someone can pay.
    if (reservation.status === "reserved") {
      await deps.releaseFoundingPlace({ site, checkoutIntentId, now }).catch(releaseError => {
        console.error("[Billing] banded founding release failed; the reservation expires on its own", { checkoutIntentId, error: releaseError instanceof Error ? releaseError.message : "unknown" });
      });
    }
    throw error;
  }
}

/** POST /api/chargebee/banded/referral-checkout: extra referrals at levels inside the member's band. */
export async function startBandedReferralCheckout(input: { userId: number; request: BandedReferralCheckoutRequest; customer: Customer; urls: ReturnUrls; deps: BandedCheckoutDeps }): Promise<BandedReferralCheckout | BandedRefusal> {
  const { deps, userId, request } = input;
  if (!isEnabled(deps)) return BANDED_NOT_ON_SALE;
  const { bandedPlan } = await deps.membership(userId);
  if (!bandedPlan) return refuse(409, BANDED_REFUSALS.noPlan, `Extra referrals are for plan members. Choose a plan first; nothing has been charged.`);
  if (request.items.some(item => !bandIncludes(bandedPlan, item.level))) {
    const levels = bandLevels(bandedPlan).map(level => LEVEL_DISPLAY_NAME[level]).join(" and ");
    return refuse(409, BANDED_REFUSALS.outsideBand, `Your plan covers ${levels} referral requests only. ${NOTHING_CHARGED}`);
  }
  const credentials = bandedRuntime(deps);
  if (!credentials) return outage;
  const currency = currencyForCountry(request.billingCountry);
  const quote = bandedReferralQuote(request.items, currency);
  const prices = quote.lines.map(line => bandedReferralCatalogPrice(line.level, currency));
  const verdicts = await Promise.all(prices.map(price => priceVerdict(credentials, price, deps)));
  if (verdicts.includes("unknown")) return outage;
  if (verdicts.includes("missing")) return refuse(409, BANDED_REFUSALS.notAvailable, `Extra referrals at this level are not on sale yet. ${NOTHING_CHARGED}`);

  const site = credentials.environment;
  const checkoutIntentId = bandedCheckoutIntentId("referral", site, userId, request.idempotencyKey);
  const checkout = await (deps.createReferralPage ?? createBandedReferralPage)(credentials, {
    ...input.customer,
    billingCountry: request.billingCountry,
    lines: quote.lines.map((line, index) => ({ itemPriceId: prices[index].itemPriceId, quantity: line.quantity })),
    currency,
    discountAmount: quote.discount,
    checkoutIntentId,
    idempotencyKey: checkoutIntentId,
    redirectUrl: input.urls.redirectUrl,
    cancelUrl: input.urls.cancelUrl,
  });
  return { ok: true, site, quote, checkoutIntentId, checkout };
}
