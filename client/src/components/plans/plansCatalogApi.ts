// GET /api/plans/catalog client boundary (GO-LIVE-1). The server owns every
// amount, label, term and availability on /plans; the payload is parsed with
// the shared Zod contract here and a payload that does not parse is an error,
// never a guess. Screens read it through React Query (pattern:
// client/src/lib/companyDirectory.ts).
import { useQuery } from "@tanstack/react-query";
import { planCatalogResponseSchema, type PlanCatalogResponse } from "@shared/billingCatalog";
import type { BillingRegion } from "@shared/billingRegion";
import { readApiJson } from "@/lib/apiResponse";
import { NETWORK_ERROR } from "./billingApi";

export type { PlanCatalogResponse } from "@shared/billingCatalog";

export const CATALOG_ERROR = "We could not load prices. Try again in a moment.";

/** One cache entry per asked region; "edge" is the region the server picks from the request. */
export const plansCatalogKeys = {
  region: (region?: BillingRegion) => ["plans-catalog", region ?? "edge"] as const,
};

export async function fetchPlansCatalog(region?: BillingRegion): Promise<PlanCatalogResponse> {
  const path = region ? `/api/plans/catalog?region=${region}` : "/api/plans/catalog";
  let response: Response;
  // "no-cache": the catalog is served public for 5 minutes, so a refetch after a
  // 409 not_available_yet must revalidate rather than read the browser cache.
  try { response = await fetch(path, { credentials: "same-origin", cache: "no-cache" }); } catch { throw new Error(NETWORK_ERROR); }
  const payload = await readApiJson<Record<string, unknown>>(response, CATALOG_ERROR);
  if (!response.ok) throw new Error(typeof payload.error === "string" && payload.error ? payload.error : CATALOG_ERROR);
  const parsed = planCatalogResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error(CATALOG_ERROR);
  return parsed.data;
}

/** True when the catalog sells at least one credit pack right now. */
export function packOnSale(catalog: PlanCatalogResponse): boolean {
  return catalog.packs.some(pack => pack.available);
}

/** The catalog for the edge region, or for one region when the seeker asked for it. */
export function usePlansCatalog(region?: BillingRegion, options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: plansCatalogKeys.region(region), queryFn: () => fetchPlansCatalog(region), retry: 1, enabled: options.enabled ?? true });
}
