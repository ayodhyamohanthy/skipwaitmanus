// One verified-referrer gate for every referrer surface (/queue, /inbox,
// /referrer/impact). It reads the server's verdict from
// GET /api/company-referrals/access and judges it with the shared predicate
// (shared/referrerAccess.ts). It never looks at the sign-in account's email
// addresses: a Google SSO session that verified a work email by one-time code
// only carries the personal address, yet the server counts it as verified.
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { fetchCompanyAccess, type CompanyAccess } from "@/components/referrer-home/referrerData";

export type ReferrerAccessState =
  | { status: "signed-out" }
  | { status: "checking" }
  | { status: "error"; error: Error; retrying: boolean; retry: () => void }
  | { status: "unverified"; access: CompanyAccess }
  | { status: "verified"; access: CompanyAccess };

export const referrerAccessKey = (userId: string | null) => ["referrer-access", userId] as const;

export function useReferrerAccess(): ReferrerAccessState {
  const { isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const query = useQuery({
    queryKey: referrerAccessKey(userId ?? null),
    queryFn: () => fetchCompanyAccess(fetchToken),
    enabled: Boolean(isSignedIn),
    retry: 1,
    refetchOnWindowFocus: false,
    // Re-checked on every visit: a code verified on /verify must open the queue next.
    staleTime: 0,
  });

  if (!isSignedIn) return { status: "signed-out" };
  const access = query.data;
  // A verified answer stays verified while it is re-checked; the server still
  // enforces verification on every queue read and decision.
  if (access?.verified) return { status: "verified", access };
  // A failed check is an error with a retry, never the "verify your work email" gate.
  if (query.isError) return { status: "error", error: query.error, retrying: query.isFetching, retry: () => { void query.refetch(); } };
  // A cached "not verified" is never shown as the gate while a fresh check is in flight.
  if (!access || query.isFetching) return { status: "checking" };
  return { status: "unverified", access };
}
