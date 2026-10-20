// The live plan/pack catalog (GET /api/plans/catalog): every price, pack and
// pass shown to a seeker comes from this payload, never from copy written in
// the client. 503 means billing is unreachable; the screen says so and keeps
// retrying rather than showing stale prices.
import { useQuery } from "@tanstack/react-query";
import { planCatalogResponseSchema, type PlanCatalogResponse } from "@shared/billingCatalog";

export const PLANS_CATALOG_OFFLINE = "Billing is temporarily offline. Nothing is charged.";
export const PLANS_CATALOG_ERROR = "We could not load live prices. Check your connection and try again.";

/** The billing service answered "unreachable": rendered as its own honest state. */
export class PlansCatalogOfflineError extends Error {}

export const plansCatalogKeys = { catalog: ["plans-catalog"] as const };

export async function fetchPlansCatalog(): Promise<PlanCatalogResponse> {
  let response: Response;
  try { response = await fetch("/api/plans/catalog", { credentials: "same-origin" }); } catch { throw new Error(PLANS_CATALOG_ERROR); }
  if (response.status === 503) throw new PlansCatalogOfflineError(PLANS_CATALOG_OFFLINE);
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || payload === null) throw new Error(PLANS_CATALOG_ERROR);
  return planCatalogResponseSchema.parse(payload);
}

export function usePlansCatalog(enabled = true) {
  return useQuery<PlanCatalogResponse, Error>({
    queryKey: plansCatalogKeys.catalog,
    queryFn: fetchPlansCatalog,
    enabled,
    staleTime: 5 * 60_000,
    // A billing outage keeps retrying; a parse/transport failure retries once.
    retry: (count, error) => (error instanceof PlansCatalogOfflineError ? count < 3 : count < 1),
  });
}
