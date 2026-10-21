// The by-level ask quote for the V2 cost line (D-132): one fetch of
// /api/company-referrals/quote for a validated job link, shared by /ask and
// the explore ask drawer. A failed or pending quote is null and the caller
// keeps its flat one-credit line.
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { isValidTargetRoleUrl } from "@shared/referralUrl";
import type { AskCostQuote } from "@/pages/explore/findModel";

export function useAskQuote(url: string, enabled: boolean): AskCostQuote | null {
  const { isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const trimmed = url.trim();
  const quotable = enabled && isSignedIn && isValidTargetRoleUrl(trimmed);
  const query = useQuery({
    queryKey: ["ask-quote", userId ?? null, trimmed],
    enabled: quotable,
    retry: 1,
    staleTime: 30_000,
    queryFn: async (): Promise<AskCostQuote | null> => {
      const token = await fetchToken();
      const response = await fetch(`/api/company-referrals/quote?url=${encodeURIComponent(trimmed)}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) return null;
      const payload = await response.json() as { cost?: unknown; totalAvailable?: unknown; shortfall?: unknown };
      return typeof payload.cost === "number" && typeof payload.totalAvailable === "number" && typeof payload.shortfall === "number"
        ? { cost: payload.cost, totalAvailable: payload.totalAvailable, shortfall: payload.shortfall }
        : null;
    },
  });
  return quotable ? query.data ?? null : null;
}
