// One verified-referrer gate for every referrer surface (/queue, /inbox,
// /referrer/impact, /post-opportunity, /alerts routing, account-menu links). It reads the server's verdict from
// GET /api/company-referrals/access and judges it with the shared predicate
// (shared/referrerAccess.ts). It never looks at the sign-in account's email
// addresses: a Google SSO session that verified a work email by one-time code
// only carries the personal address, yet the server counts it as verified.
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { fetchCompanyAccess, type CompanyAccess } from "@/components/referrer-home/referrerData";
import { onWorkEmailCodeRequired } from "@/lib/referrerStepUpApi";

export type ReferrerAccessState =
  | { status: "signed-out" }
  | { status: "checking" }
  | { status: "error"; error: Error; retrying: boolean; retry: () => void }
  | { status: "unverified"; access: CompanyAccess }
  // D-057 (D-245): verified, but this session needs the in-session work-email step-up
  // (GoalWorkEmailStepUp) before any referrer action. Never the standalone code sign-in.
  | { status: "code_required"; access: CompanyAccess }
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
  const queryClient = useQueryClient();
  const accountKey = userId ?? null;
  // A referrer action refused with work_email_code_required re-checks the verdict, so the page flips to the step-up.
  useEffect(() => onWorkEmailCodeRequired(() => { void queryClient.invalidateQueries({ queryKey: referrerAccessKey(accountKey) }); }), [queryClient, accountKey]);

  if (!isSignedIn) return { status: "signed-out" };
  const access = query.data;
  // A verified answer stays verified while it is re-checked; the server still
  // enforces verification on every queue read and decision.
  if (access?.verified && access.codeRequired) return { status: "code_required", access };
  if (access?.verified) return { status: "verified", access };
  // A failed check is an error with a retry, never the "verify your work email" gate.
  if (query.isError) return { status: "error", error: query.error, retrying: query.isFetching, retry: () => { void query.refetch(); } };
  // A cached "not verified" is never shown as the gate while this reader's first check is in
  // flight (a code just verified on /verify must open the queue). Once this reader has its own
  // answer, a re-check started by another reader (the account menu opening) keeps that answer.
  if (!access || (query.isFetching && !query.isFetchedAfterMount)) return { status: "checking" };
  return { status: "unverified", access };
}
