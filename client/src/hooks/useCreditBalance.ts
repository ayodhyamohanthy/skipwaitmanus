// The seeker's spendable credits for the goal shell pill (D-048 phase 3).
// One source of truth per account: GET /api/credits/summary `totalAvailable`,
// the same figure the ledger reconciles (shared/creditLedger.ts).
// A failed or malformed response is an error with a retry, never a 0 balance.
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";

export const CREDIT_BALANCE_ERROR = "We could not load your credits";

const balanceSchema = z.object({ summary: z.object({ totalAvailable: z.number().int().min(0) }) });

export type CreditBalanceState =
  | { state: "ready"; count: number }
  | { state: "loading" }
  | { state: "error"; onRetry(): void }
  | null;

export const creditBalanceKey = (userId: string | null) => ["credit-balance", "job_seeker", userId] as const;

/**
 * `enabled` is false for a verified referrer (no credits pill, D-055) and while
 * the referrer verdict is still being checked, so the pill never flashes on a
 * referrer surface. Signed-out readers get null without a request.
 */
export function useCreditBalance(enabled: boolean): CreditBalanceState {
  const { isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const query = useQuery({
    queryKey: creditBalanceKey(userId ?? null),
    enabled: enabled && isSignedIn,
    retry: 1,
    staleTime: 30_000,
    queryFn: async () => {
      const token = await fetchToken();
      const response = await fetch("/api/credits/summary?role=job_seeker", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const payload = await readApiJson<Record<string, unknown>>(response, CREDIT_BALANCE_ERROR);
      if (!response.ok) throw new Error(CREDIT_BALANCE_ERROR);
      const parsed = balanceSchema.safeParse(payload);
      if (!parsed.success) throw new Error(CREDIT_BALANCE_ERROR);
      return parsed.data.summary.totalAvailable;
    },
  });
  if (!enabled || !isSignedIn) return null;
  if (query.isError) return { state: "error", onRetry: () => { void query.refetch(); } };
  if (query.data === undefined) return { state: "loading" };
  return { state: "ready", count: query.data };
}
