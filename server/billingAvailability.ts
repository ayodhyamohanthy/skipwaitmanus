// Which catalog prices can be sold right now. A plan term, credit pack or human
// session becomes purchasable only once the owner has created its Chargebee item
// price, active, in the catalog's currency, at the catalog's amount and billing
// period (1 or 3 months for a 30 or 90 day pass, 1 year for Keep warm). Until then checkout
// answers "not available yet" instead of opening a broken page.
//
// Answers are cached per site and item price in process memory: this is a
// routing hint, not a money decision (Chargebee itself refuses an unknown item
// price, and every paid state still comes only from a verified webhook).
//
// Every probe is bounded twice: the Chargebee call stops at 8s
// (server/chargebeeSubscriptionApi.ts) and the whole probe stops here at
// PROBE_DEADLINE_MS whatever the network does. A probe that never answers is
// reported as "unknown", never as "not on sale": the caller decides what to say,
// and a stuck probe can neither hang a request nor leave an in-flight entry that
// blocks every later caller.
import type { BillingPeriod, CatalogPrice } from "../shared/billingCatalog";
import type { ChargebeeCredentials } from "./chargebeeApi";
import { retrieveItemPrice, type ProviderItemPrice } from "./chargebeeSubscriptionApi";

export type ItemPriceLookup = (credentials: ChargebeeCredentials, itemPriceId: string) => Promise<ProviderItemPrice | null>;

/** Sellable now, not created yet, or the provider did not answer. */
export type PriceAvailability = "available" | "missing" | "unknown";

const AVAILABLE_TTL_MS = 5 * 60 * 1000;
const MISSING_TTL_MS = 60 * 1000;
const ERROR_TTL_MS = 30 * 1000;

/**
 * The budget for one probe, however slow the provider or the network is.
 *
 * It sits above the provider layer's own 8s abort on purpose: a live cold
 * resolve of the whole catalog measured 7.0-7.6s (warm, cached: 0.5-1.5s), so a
 * tighter budget would report a working provider as "unknown" and make the
 * catalog answer 503 while the prices were readable. This is the backstop for
 * the case the provider abort did not cover (a connection that never settles),
 * not the primary bound.
 */
export const PROBE_DEADLINE_MS = 15_000;

type Entry = { verdict: PriceAvailability; expiresAt: number };
const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<PriceAvailability>>();

/** Resolves `onTimeout()` if `work` has not settled in `ms`; `work` never rejects here. */
function withDeadline<T>(work: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>(resolve => { timer = setTimeout(() => resolve(onTimeout()), ms); });
  return Promise.race([work, deadline]).finally(() => { if (timer) clearTimeout(timer); });
}

/** The Chargebee billing period an item price must carry: 30 and 90 day passes as 1 and 3 months, legacy monthly in months, Keep warm in years. */
const EXPECTED_PERIOD: Readonly<Record<BillingPeriod, { unit: "day" | "month" | "year"; count: number }>> = {
  monthly: { unit: "month", count: 1 },
  yearly: { unit: "year", count: 1 },
  // Chargebee accepts a day period only as 1, so a 30 or 90 day pass is one or
  // three months on the provider side (the amounts do not change).
  "30d": { unit: "month", count: 1 },
  "90d": { unit: "month", count: 3 },
};

function periodMatches(price: ProviderItemPrice, interval: BillingPeriod): boolean {
  const expected = EXPECTED_PERIOD[interval];
  if (price.period_unit === expected.unit) return price.period === expected.count;
  // A year configured as 12 months sells the same term.
  return interval === "yearly" && price.period_unit === "month" && price.period === 12;
}

/** True when the site's item price sells exactly what the catalog says. */
export function itemPriceMatches(price: ProviderItemPrice | null, expected: CatalogPrice): boolean {
  if (!price || price.id !== expected.itemPriceId) return false;
  if (price.status !== "active" || price.currency_code !== expected.currency || price.price !== expected.amount) return false;
  if (expected.kind === "pack" || expected.kind === "session" || expected.kind === "v2pack") return price.item_type === undefined || price.item_type === "charge";
  // D-132: the bundle's plan fee is a plan item, its monthly credits rung an
  // addon (a subscription holds one plan plus addons, never two plans); both
  // bill monthly.
  if (expected.kind === "v2plan") {
    if (price.item_type !== undefined && price.item_type !== "plan") return false;
    return periodMatches(price, "monthly");
  }
  if (expected.kind === "v2credits") {
    if (price.item_type !== undefined && price.item_type !== "addon") return false;
    return periodMatches(price, "monthly");
  }
  if (price.item_type !== undefined && price.item_type !== "plan") return false;
  return periodMatches(price, expected.interval);
}

export type AvailabilityDeps = { credentials: ChargebeeCredentials | null; lookup?: ItemPriceLookup; now?: () => number; /** Test override for the probe budget. */ probeTimeoutMs?: number };

/** What one catalog price is right now: sellable, not created yet, or unanswerable. */
export async function itemPriceAvailability(expected: CatalogPrice, deps: AvailabilityDeps): Promise<PriceAvailability> {
  const { credentials } = deps;
  // Billing that is not configured sells nothing here; that is a definite answer,
  // not an outage, so the catalog still renders with everything unavailable.
  if (!credentials) return "missing";
  const now = deps.now ?? Date.now;
  const key = `${credentials.site}:${expected.itemPriceId}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now()) return cached.verdict;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const lookup = deps.lookup ?? retrieveItemPrice;
  const answered = lookup(credentials, expected.itemPriceId)
    .then((price): PriceAvailability => {
      if (!price) return "missing";
      const matched = itemPriceMatches(price, expected);
      if (!matched) console.warn("[Billing] item price does not match the catalog", { itemPriceId: expected.itemPriceId });
      return matched ? "available" : "missing";
    })
    // A provider error is not proof the price is absent: say we do not know.
    .catch((): PriceAvailability => "unknown");
  const probe = withDeadline(answered, deps.probeTimeoutMs ?? PROBE_DEADLINE_MS, (): PriceAvailability => {
    console.warn("[Billing] item price lookup did not answer in time", { itemPriceId: expected.itemPriceId, deadlineMs: deps.probeTimeoutMs ?? PROBE_DEADLINE_MS });
    return "unknown";
  })
    .then(verdict => {
      cache.set(key, { verdict, expiresAt: now() + (verdict === "available" ? AVAILABLE_TTL_MS : verdict === "missing" ? MISSING_TTL_MS : ERROR_TTL_MS) });
      return verdict;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, probe);
  return probe;
}

/** One price's availability as a boolean; "unknown" reads as not available yet. */
export async function isPriceAvailable(expected: CatalogPrice, deps: AvailabilityDeps): Promise<boolean> {
  return (await itemPriceAvailability(expected, deps)) === "available";
}

/** Availability for many prices at once: sellable ids, and the ids the provider did not answer for. */
export async function priceAvailability(prices: readonly CatalogPrice[], deps: AvailabilityDeps): Promise<{ available: Set<string>; unknown: Set<string> }> {
  const answers = await Promise.all(prices.map(async price => [price.itemPriceId, await itemPriceAvailability(price, deps)] as const));
  return {
    available: new Set(answers.filter(([, verdict]) => verdict === "available").map(([id]) => id)),
    unknown: new Set(answers.filter(([, verdict]) => verdict === "unknown").map(([id]) => id)),
  };
}

/** Availability for many prices at once, as the set of item price ids that can be sold. */
export async function availablePriceIds(prices: readonly CatalogPrice[], deps: AvailabilityDeps): Promise<Set<string>> {
  return (await priceAvailability(prices, deps)).available;
}

/** Tests and the admin catalog check start from a clean cache. */
export function clearPriceAvailabilityCache(): void {
  cache.clear();
  inFlight.clear();
}
