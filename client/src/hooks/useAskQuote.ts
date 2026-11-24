// The by-level ask quote for the V2 cost line (D-132 item 3, option a): one
// fetch of /api/company-referrals/quote for a validated job link, shared by
// /ask, the explore drawer and the company door through the one composer.
//
// Safety contract (flag VITE_ASK_LEVEL_COST on): the server charges the level
// cost at submit (server/db.ts askCost), so the composer must never say
// "1 credit" — or enable Send — before the quote is in. The state is explicit:
// "pending" (Send waits), "error" (Send is blocked with the server's own
// wording), "ready" (the server's numbers drive the line). "off" bundles three
// states that share only the no-fetch behavior, not a price: the SERVER flag
// ASK_LEVEL_COST is off (the server charges 1 credit, so the flat line is
// truthful), the seeker is signed out (quote and send both 401; Send goes
// through the sign-in handoff and this gate applies once signed in), or the
// link is not a valid target (quote and send both 400; the composer's link
// guard already blocks Send).
// The query keys on the debounced link, so an edit never shows the old
// target's quote against the new one.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { isValidTargetRoleUrl } from "@shared/referralUrl";
import type { AcceptedAskCost } from "@shared/acceptedAskCost";

export type AskCostQuote = {
  cost: number;
  totalAvailable: number;
  shortfall: number;
  level?: number;
  coverageStatus?: "covered" | "waiting_for_company_coverage";
  acceptedCost?: AcceptedAskCost;
};

export type UseAskQuoteOptions = {
  catalogJobId?: number;
  opportunityId?: number;
};

export type AskQuoteState =
  | { status: "off" }
  | { status: "pending" }
  | { status: "error" }
  | { status: "ready"; quote: AskCostQuote };

export function useAskQuote(url: string, enabled: boolean, options?: UseAskQuoteOptions): AskQuoteState {
  const { isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const trimmed = url.trim();
  const catalogJobId = options?.catalogJobId;
  const opportunityId = options?.opportunityId;
  const hasTarget = Boolean(catalogJobId || opportunityId || (trimmed && isValidTargetRoleUrl(trimmed)));
  const quotable = enabled && isSignedIn && hasTarget;
  // Editing inside a still-valid link must not fire a fetch per keystroke.
  const [target, setTarget] = useState(trimmed);
  useEffect(() => {
    const timer = setTimeout(() => setTarget(trimmed), 300);
    return () => clearTimeout(timer);
  }, [trimmed]);
  const active = Boolean(quotable && (catalogJobId || opportunityId || target === trimmed));
  const query = useQuery({
    queryKey: ["ask-quote", userId ?? null, target, catalogJobId ?? null, opportunityId ?? null],
    enabled: active,
    retry: 1,
    staleTime: 30_000,
    queryFn: async (): Promise<AskCostQuote | null> => {
      const token = await fetchToken();
      const params = new URLSearchParams();
      if (catalogJobId) params.set("catalogJobId", String(catalogJobId));
      if (opportunityId) params.set("opportunityId", String(opportunityId));
      if (target) params.set("url", target);
      const response = await fetch(`/api/company-referrals/quote?${params.toString()}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) return null;
      const payload = await response.json() as {
        cost?: unknown;
        totalAvailable?: unknown;
        shortfall?: unknown;
        level?: unknown;
        coverageStatus?: unknown;
        acceptedCost?: unknown;
      };
      return typeof payload.cost === "number" && typeof payload.totalAvailable === "number" && typeof payload.shortfall === "number"
        ? {
            cost: payload.cost,
            totalAvailable: payload.totalAvailable,
            shortfall: payload.shortfall,
            ...(typeof payload.level === "number" ? { level: payload.level } : {}),
            ...(typeof payload.coverageStatus === "string" ? { coverageStatus: payload.coverageStatus as "covered" | "waiting_for_company_coverage" } : {}),
            ...(payload.acceptedCost ? { acceptedCost: payload.acceptedCost as AcceptedAskCost } : {}),
          }
        : null;
    },
  });
  if (!quotable) return { status: "off" };
  if (!active || query.isPending) return { status: "pending" };
  if (query.isError || !query.data) return { status: "error" };
  return { status: "ready", quote: query.data };
}
