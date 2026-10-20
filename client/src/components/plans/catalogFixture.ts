// Test fixture for the GO-LIVE-1 /plans and /premium tests; no screen imports
// it. The payload is built by the server's own planCatalogResponse, so it
// always matches the strict contract, with every pack and term amount doubled
// so a test proves a screen prints the payload's prices, never a client
// constant. Plan terms are unavailable unless a test names one ("momentum:30d"):
// the server reports every term unavailable while PASS_SALES_ENABLED is false.
import { planCatalogResponse, type PlanCatalogResponse } from "@shared/billingCatalog";
import type { BillingRegion } from "@shared/billingRegion";

export type CatalogFixtureOptions = {
  /** true: every pack is on sale; false: none; a list: only those pack ids. */
  packs?: boolean | readonly string[];
  /** Plan terms on sale, as "<planId>:<interval>". */
  terms?: readonly string[];
};

export function catalogFixture(region: BillingRegion, options: CatalogFixtureOptions = {}): PlanCatalogResponse {
  const base = planCatalogResponse({ region, available: () => false, usdRecurringConfirmed: false, sessionsStaffed: false, indiaGstRegistered: false });
  const packs = options.packs ?? true;
  const terms = options.terms ?? [];
  return {
    ...base,
    packs: base.packs.map(pack => ({ ...pack, amount: pack.amount * 2, available: typeof packs === "boolean" ? packs : packs.includes(pack.id) })),
    plans: base.plans.map(plan => ({ ...plan, terms: plan.terms.map(term => ({ ...term, amount: term.amount * 2, available: terms.includes(`${plan.id}:${term.interval}`) })) })),
  };
}
