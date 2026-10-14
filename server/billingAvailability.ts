// Which catalog prices can be sold right now. A plan term, credit pack or human
// session becomes purchasable only once the owner has created its Chargebee item
// price, active, in the catalog's currency, at the catalog's amount and billing
// period (30 or 90 days for a pass, 1 year for Keep warm). Until then checkout
// answers "not available yet" instead of opening a broken page.
//
// Answers are cached per site and item price in process memory: this is a
// routing hint, not a money decision (Chargebee itself refuses an unknown item
// price, and every paid state still comes only from a verified webhook).
import type { BillingPeriod, CatalogPrice } from "../shared/billingCatalog";
import type { ChargebeeCredentials } from "./chargebeeApi";
import { retrieveItemPrice, type ProviderItemPrice } from "./chargebeeSubscriptionApi";

export type ItemPriceLookup = (credentials: ChargebeeCredentials, itemPriceId: string) => Promise<ProviderItemPrice | null>;

const AVAILABLE_TTL_MS = 5 * 60 * 1000;
const MISSING_TTL_MS = 60 * 1000;
const ERROR_TTL_MS = 30 * 1000;

type Entry = { available: boolean; expiresAt: number };
const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<boolean>>();

/** The Chargebee billing period an item price must carry: passes in days, legacy monthly in months, Keep warm in years. */
const EXPECTED_PERIOD: Readonly<Record<BillingPeriod, { unit: "day" | "month" | "year"; count: number }>> = {
  monthly: { unit: "month", count: 1 },
  yearly: { unit: "year", count: 1 },
  "30d": { unit: "day", count: 30 },
  "90d": { unit: "day", count: 90 },
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
  if (expected.kind === "pack" || expected.kind === "session") return price.item_type === undefined || price.item_type === "charge";
  if (price.item_type !== undefined && price.item_type !== "plan") return false;
  return periodMatches(price, expected.interval);
}

export type AvailabilityDeps = { credentials: ChargebeeCredentials | null; lookup?: ItemPriceLookup; now?: () => number };

/** One price's availability on the configured site; false when billing is not configured. */
export async function isPriceAvailable(expected: CatalogPrice, deps: AvailabilityDeps): Promise<boolean> {
  const { credentials } = deps;
  if (!credentials) return false;
  const now = deps.now ?? Date.now;
  const key = `${credentials.site}:${expected.itemPriceId}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now()) return cached.available;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const lookup = deps.lookup ?? retrieveItemPrice;
  const probe = lookup(credentials, expected.itemPriceId)
    .then(price => {
      const available = itemPriceMatches(price, expected);
      if (price && !available) console.warn("[Billing] item price does not match the catalog", { itemPriceId: expected.itemPriceId });
      cache.set(key, { available, expiresAt: now() + (available ? AVAILABLE_TTL_MS : MISSING_TTL_MS) });
      return available;
    })
    .catch(() => {
      cache.set(key, { available: false, expiresAt: now() + ERROR_TTL_MS });
      return false;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, probe);
  return probe;
}

/** Availability for many prices at once, as the set of item price ids that can be sold. */
export async function availablePriceIds(prices: readonly CatalogPrice[], deps: AvailabilityDeps): Promise<Set<string>> {
  const answers = await Promise.all(prices.map(async price => [price.itemPriceId, await isPriceAvailable(price, deps)] as const));
  return new Set(answers.filter(([, available]) => available).map(([id]) => id));
}

/** Tests and the admin catalog check start from a clean cache. */
export function clearPriceAvailabilityCache(): void {
  cache.clear();
  inFlight.clear();
}
