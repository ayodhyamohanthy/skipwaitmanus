// Provision the D-219/D-367 banded catalog from its frozen source. This only
// describes provider objects; checkout and sales activation have separate gates.
import type { CatalogPrice } from "../shared/billingCatalog";
import {
  BANDED_CATALOG_CURRENCIES,
  bandedPlanCatalogPrice,
  bandedReferralCatalogPrice,
  type BandedCatalogPrice,
} from "../shared/bandedCatalog";
import { itemPriceSpecSchema, type ItemPriceSpec } from "../shared/catalogSync";
import { LEVEL_DISPLAY_NAME, PLAN_FAMILY, REFERRAL_LEVELS } from "../shared/planFamily";
import {
  CATALOG_PLANS,
  CREDIT_PACKS,
  HUMAN_SESSION_IDS,
  catalogItemPriceId,
  catalogPackItemPriceId,
  catalogSessionItemPriceId,
} from "../shared/planCatalog";

/** A provider item as the sync would create it, before the family is attached. */
export type ItemSpec = {
  id: string;
  name: string;
  type: "plan" | "charge";
  externalName: string;
  enabledInPortal: boolean | null;
};

export type DesiredCatalogEntry = { spec: ItemPriceSpec; item: ItemSpec; price: CatalogPrice | BandedCatalogPrice };

/** All three plans are provisioned; the application gate remains in checkout. */
export function desiredCatalog(): DesiredCatalogEntry[] {
  const entries: DesiredCatalogEntry[] = [];
  for (const plan of PLAN_FAMILY) for (const currency of BANDED_CATALOG_CURRENCIES) {
    const price = bandedPlanCatalogPrice(plan.id, currency);
    const itemId = `skipwait_${plan.id}`;
    entries.push({
      price,
      item: { id: itemId, name: itemId, type: "plan", externalName: plan.label, enabledInPortal: false },
      spec: itemPriceSpecSchema.parse({
        id: price.itemPriceId, name: price.itemPriceId, itemId,
        itemType: "plan", pricingModel: "flat_fee", price: price.amount,
        currencyCode: currency, externalName: `${plan.label}, monthly`,
        period: 1, periodUnit: "month", billingCycles: null,
      }),
    });
  }
  for (const level of REFERRAL_LEVELS) for (const currency of BANDED_CATALOG_CURRENCIES) {
    const price = bandedReferralCatalogPrice(level, currency);
    const itemId = `skipwait_referral_${level}`;
    const externalName = `${LEVEL_DISPLAY_NAME[level]} referral request`;
    entries.push({
      price,
      item: { id: itemId, name: itemId, type: "charge", externalName, enabledInPortal: null },
      spec: itemPriceSpecSchema.parse({
        id: price.itemPriceId, name: price.itemPriceId, itemId,
        itemType: "charge", pricingModel: "per_unit", price: price.amount,
        currencyCode: currency, externalName,
        period: null, periodUnit: null, billingCycles: null,
      }),
    });
  }
  return entries;
}

/** Historical products are reported, never recreated or restored by this sync. */
export function excludedItemPrices(): Array<{ itemPriceId: string; reason: string }> {
  const excluded: Array<{ itemPriceId: string; reason: string }> = [];
  for (const pack of CREDIT_PACKS) for (const currency of BANDED_CATALOG_CURRENCIES) {
    if (pack.prices[currency] === undefined) continue;
    excluded.push({ itemPriceId: catalogPackItemPriceId(pack.id, currency), reason: "Legacy referral packs are paused under D-219; left alone." });
  }
  for (const plan of CATALOG_PLANS) for (const term of ["30d", "yearly", "90d"] as const) {
    for (const currency of BANDED_CATALOG_CURRENCIES) {
      if (plan.prices[term]?.[currency] === undefined) continue;
      excluded.push({ itemPriceId: catalogItemPriceId(plan.id, term, currency), reason: "Legacy fixed-term plans are not sold under D-219; left alone." });
    }
  }
  for (const session of HUMAN_SESSION_IDS) for (const currency of BANDED_CATALOG_CURRENCIES) {
    excluded.push({ itemPriceId: catalogSessionItemPriceId(session, currency), reason: "Human sessions are not sold until reviewers are staffed; left alone." });
  }
  return excluded;
}
