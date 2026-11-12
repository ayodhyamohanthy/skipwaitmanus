// D-086.ui: React Query hooks for the public demand payload. The server answers
// 404 while the switch is off, so a failed, missing or unparsable read resolves
// to null and the components render nothing (the D-104 pattern).
import { useQuery } from "@tanstack/react-query";
import {
  COMPANY_DEMAND_PUBLIC_ENABLED,
  companyDemandDetailResponseSchema,
  companyDemandListResponseSchema,
  type DemandListEntry,
  type PublicDemand,
} from "@shared/companyDemand";

const STALE_TIME_MS = 300_000;

async function readBody(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}

export async function fetchCompanyDemandList(): Promise<DemandListEntry[] | null> {
  const parsed = companyDemandListResponseSchema.safeParse(await readBody("/api/company-demand"));
  return parsed.success ? parsed.data.companies : null;
}

export async function fetchCompanyDemand(slug: string): Promise<PublicDemand | null> {
  const parsed = companyDemandDetailResponseSchema.safeParse(await readBody(`/api/company-demand/${encodeURIComponent(slug)}`));
  return parsed.success ? parsed.data.demand : null;
}

export function useCompanyDemandList() {
  return useQuery({
    queryKey: ["company-demand-list"] as const,
    queryFn: fetchCompanyDemandList,
    enabled: COMPANY_DEMAND_PUBLIC_ENABLED,
    retry: false,
    staleTime: STALE_TIME_MS,
  });
}

export function useCompanyDemand(slug: string) {
  return useQuery({
    queryKey: ["company-demand", slug] as const,
    queryFn: () => fetchCompanyDemand(slug),
    enabled: COMPANY_DEMAND_PUBLIC_ENABLED && Boolean(slug),
    retry: false,
    staleTime: STALE_TIME_MS,
  });
}
