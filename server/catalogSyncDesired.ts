// The 26 item prices the catalog sells, derived from shared/planCatalog.ts so a
// catalog or price change needs no edit here. Nothing in this file touches the
// provider: it only describes what the sync would create.
import type { CatalogPrice } from "../shared/billingCatalog";
import { resolveItemPrice } from "../shared/billingCatalog";
import type { ItemPriceSpec } from "../shared/catalogSync";
import {
  CATALOG_PLANS,
  CREDIT_PACKS,
  HUMAN_SESSION_IDS,
  catalogItemPriceId,
  catalogPackItemPriceId,
  catalogSessionItemPriceId,
  planDisplayName,
} from "../shared/planCatalog";

/** A provider item as the sync would create it, before the family is attached. */
export type ItemSpec = {
  id: string;
  name: string;
  type: "plan" | "charge";
  externalName: string;
  enabledInPortal: boolean | null;
};

export type DesiredCatalogEntry = { spec: ItemPriceSpec; item: ItemSpec; price: CatalogPrice };

const CURRENCIES = ["INR", "USD"] as const;
/** Packs first, then 30-day passes, the yearly Keep warm, and the 90-day passes last. */
const TERMS = ["30d", "yearly", "90d"] as const;

function priceFor(itemPriceId: string): CatalogPrice {
  const price = resolveItemPrice(itemPriceId);
  if (!price) throw new Error(`The catalog has no price for ${itemPriceId}`);
  return price;
}

function packEntry(pack: (typeof CREDIT_PACKS)[number], currency: "INR" | "USD"): DesiredCatalogEntry | null {
  const amount = pack.prices[currency];
  if (amount === undefined) return null;
  const itemId = `skipwait_${pack.id}`;
  const itemPriceId = catalogPackItemPriceId(pack.id, currency);
  const externalName = `${pack.credits} credits`;
  return {
    price: priceFor(itemPriceId),
    item: { id: itemId, name: itemId, type: "charge", externalName, enabledInPortal: null },
    spec: {
      id: itemPriceId,
      name: itemPriceId,
      itemId,
      itemType: "charge",
      pricingModel: "per_unit",
      price: amount,
      currencyCode: currency,
      externalName,
      period: null,
      periodUnit: null,
      billingCycles: null,
    },
  };
}

function planEntry(plan: (typeof CATALOG_PLANS)[number], term: (typeof TERMS)[number], currency: "INR" | "USD"): DesiredCatalogEntry | null {
  const amount = plan.prices[term]?.[currency];
  if (amount === undefined) return null;
  const itemId = `skipwait_${plan.id}`;
  const itemPriceId = catalogItemPriceId(plan.id, term, currency);
  const externalName = `${planDisplayName(plan)}, ${term === "yearly" ? "1 year" : term === "90d" ? "90 days" : "30 days"}`;
  const period = term === "yearly" ? { period: 1, periodUnit: "year" as const } : term === "90d" ? { period: 3, periodUnit: "month" as const } : { period: 1, periodUnit: "month" as const };
  return {
    price: priceFor(itemPriceId),
    item: { id: itemId, name: itemId, type: "plan", externalName: planDisplayName(plan), enabledInPortal: false },
    spec: {
      id: itemPriceId,
      name: itemPriceId,
      itemId,
      itemType: "plan",
      pricingModel: "flat_fee",
      price: amount,
      currencyCode: currency,
      externalName,
      ...period,
      billingCycles: 1,
    },
  };
}

/** Every item price the catalog sells: 8 packs, 16 passes and 2 Keep warm prices. */
export function desiredCatalog(): DesiredCatalogEntry[] {
  const entries: DesiredCatalogEntry[] = [];
  for (const currency of CURRENCIES) {
    for (const pack of CREDIT_PACKS) {
      const entry = packEntry(pack, currency);
      if (entry) entries.push(entry);
    }
  }
  for (const term of TERMS) {
    for (const plan of CATALOG_PLANS) {
      if (plan.byApplication) continue;
      for (const currency of CURRENCIES) {
        const entry = planEntry(plan, term, currency);
        if (entry) entries.push(entry);
      }
    }
  }
  return entries;
}

/** Prices the catalog lists but never sells: Concierge (by application) and the human sessions. */
export function excludedItemPrices(): Array<{ itemPriceId: string; reason: string }> {
  const excluded: Array<{ itemPriceId: string; reason: string }> = [];
  for (const plan of CATALOG_PLANS) {
    if (!plan.byApplication) continue;
    for (const term of ["30d", "90d"] as const) {
      for (const currency of CURRENCIES) {
        if (plan.prices[term]?.[currency] === undefined) continue;
        excluded.push({ itemPriceId: catalogItemPriceId(plan.id, term, currency), reason: "Land Concierge is sold by application, never from self-serve checkout." });
      }
    }
  }
  for (const session of HUMAN_SESSION_IDS) {
    for (const currency of CURRENCIES) {
      excluded.push({
        itemPriceId: catalogSessionItemPriceId(session, currency),
        reason: session === "written_review" ? "A written expert review is sold only once reviewers are staffed." : "A live expert session is sold only once reviewers are staffed.",
      });
    }
  }
  return excluded;
}
