// /plans purchase sections from GET /api/plans/catalog (GO-LIVE-1 C3, C8):
// a loading skeleton, the catalog error with Try again (the shared network
// copy when offline), one line when nothing is on sale, else the credit packs
// and the passes. A catalog already on screen stays while a refetch runs or
// fails, so prices and the checkout body always come from one response.
import type { UseQueryResult } from "@tanstack/react-query";
import type { PlanCatalogResponse } from "@shared/billingCatalog";
import { LoadingNote } from "@/components/app-states/SystemStates";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import { PackCards, type BuyControls } from "./PackCards";
import { PassCards } from "./PassCards";
import { packOnSale } from "./plansCatalogApi";

export const NOTHING_ON_SALE = "Packs and passes go on sale soon.";

/** True when the catalog sells at least one pack or one plan term right now. */
export function catalogOnSale(catalog: PlanCatalogResponse): boolean {
  return packOnSale(catalog) || catalog.plans.some(plan => plan.terms.some(term => term.available));
}

export function CatalogSections({ query, buy }: { query: UseQueryResult<PlanCatalogResponse, Error>; buy: BuyControls }) {
  const catalog = query.data;
  if (!catalog) {
    if (!query.isError) return <section className="plans-section" aria-label="Prices"><LoadingNote>Loading prices…</LoadingNote></section>;
    return <section className="plans-section" aria-label="Prices">
      <Panel tone="muted" className="border border-destructive/40">
        <div role="alert"><strong className="text-destructive">{query.error.message}</strong><p className="mt-1 text-sm">Nothing has been charged, and your credits are unchanged.</p></div>
        <Button size="sm" className="mt-3" disabled={query.isFetching} onClick={() => { void query.refetch(); }}>Try again</Button>
      </Panel>
    </section>;
  }
  if (!catalogOnSale(catalog)) return <p className="plan-grid-note font-semibold">{NOTHING_ON_SALE}</p>;
  return <>
    <PackCards catalog={catalog} buy={buy} />
    <PassCards catalog={catalog} buy={buy} />
  </>;
}
