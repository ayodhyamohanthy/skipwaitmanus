// Client boundary for the company responsiveness signal (D-104). The server returns 404 while the flag is
// off, so a failed or missing read means "render nothing", never an error banner.
import { useQuery } from "@tanstack/react-query";
import type { CompanyResponseSignal } from "@shared/companyResponseSignal";
import { COMPANY_RESPONSE_SIGNAL } from "@/lib/flags";

export async function fetchCompanyResponseSignal(slug: string): Promise<CompanyResponseSignal | null> {
  try {
    const response = await fetch(`/api/companies/${encodeURIComponent(slug)}/response-signal`, { credentials: "same-origin" });
    if (!response.ok) return null;
    const body = await response.json() as { signal?: CompanyResponseSignal };
    const signal = body.signal;
    if (!signal) return null;
    if (signal.state === "insufficient") return signal;
    if (signal.state === "shown" && Number.isFinite(signal.usualFirstReplyDays) && Number.isFinite(signal.answeredThisMonth) && Number.isFinite(signal.referrersInside)) return signal;
    return null;
  } catch { return null; }
}

export function useCompanyResponseSignal(slug: string) {
  return useQuery({ queryKey: ["company-response-signal", slug] as const, queryFn: () => fetchCompanyResponseSignal(slug), staleTime: 60_000, retry: false, enabled: COMPANY_RESPONSE_SIGNAL && Boolean(slug) });
}
