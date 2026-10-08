// Seeker Requests (kit v4 /requests, app/src/routes/requests.tsx) on live data:
// asks from /api/company-referrals/mine, the credit meter from
// /api/credits/summary, and withdraw with its confirm dialog, retry and credit
// restore. No preview states, sample asks or invented counts ship here.
import { ArrowRight, LockKeyhole, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { Button, buttonVariants } from "@/components/kit/button";
import { Heading, Panel } from "@/components/kit/preview-kit";
import { RequestRow } from "@/components/requests/RequestRow";
import { RequestSummary } from "@/components/requests/RequestSummary";
import { RequestsAlert, RequestsEmpty, RequestsLoading } from "@/components/requests/RequestStates";
import { canWithdrawRequest, countExpiringSoon, countInConversation, isClosedRequest } from "@/components/requests/requestModel";
import { WITHDRAW_ERROR, fetchMyRequests, fetchSeekerCredits, withdrawMyRequest, type CreditSummary, type ReferralRequest } from "@/components/requests/requestsApi";
import { useSlowLoad } from "@/hooks/useSlowLoad";
import { usePersistFn } from "@/hooks/usePersistFn";

const HEADING = { eyebrow: "MY ASKS", title: "Requests", text: "Track every ask in one place. Withdrawn or expired asks return their credit." } as const;
const NEW_ASK = <Button asChild><Link href="/explore"><Plus />New ask</Link></Button>;
const TABS = [{ value: "active", label: "Active" }, { value: "closed", label: "Closed" }] as const;
type Tab = (typeof TABS)[number]["value"];

export default function MyRequests() {
  const [, go] = useLocation();
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("active");
  const [withdrawingId, setWithdrawingId] = useState<number | null>(null);
  const [withdrawError, setWithdrawError] = useState("");
  const [failedRequest, setFailedRequest] = useState<ReferralRequest | null>(null);

  const scope = userId ?? "session";
  const requestsKey = ["requests", "mine", scope] as const;
  const creditsKey = ["requests", "credits", scope] as const;
  const requestsQuery = useQuery({ queryKey: requestsKey, enabled: isSignedIn, retry: false, queryFn: () => fetchMyRequests(fetchToken) });
  const creditsQuery = useQuery({ queryKey: creditsKey, enabled: isSignedIn, retry: false, queryFn: () => fetchSeekerCredits(fetchToken) });

  const loading = isSignedIn && (requestsQuery.isPending || (requestsQuery.isError && requestsQuery.isFetching));
  const { showSkeleton, isSlow } = useSlowLoad(loading);

  const withdrawRequest = async (request: ReferralRequest) => {
    setWithdrawingId(request.id); setWithdrawError(""); setFailedRequest(null);
    try {
      const result = await withdrawMyRequest(request.id, fetchToken);
      if (result.creditSummary) queryClient.setQueryData<CreditSummary>(creditsKey, result.creditSummary);
      else void queryClient.invalidateQueries({ queryKey: creditsKey });
      queryClient.setQueryData<ReferralRequest[]>(requestsKey, current => (current ?? []).map(item => item.id === request.id ? { ...item, status: "withdrawn", referrerId: null, queueStatus: null } : item));
    } catch (reason) {
      setWithdrawError(reason instanceof Error ? reason.message : WITHDRAW_ERROR);
      setFailedRequest(request);
    } finally { setWithdrawingId(null); }
  };

  if (!isLoaded) {
    return <main data-skipwait-screen="my-requests" className="page-content"><Heading {...HEADING} aside={NEW_ASK} /><RequestsLoading slow={false} /></main>;
  }

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="my-requests-sign-in" className="page-content">
        <Heading {...HEADING} aside={NEW_ASK} />
        <Panel tone="muted" className="mt-6 text-center">
          <LockKeyhole className="mx-auto mb-3 size-8" aria-hidden="true" />
          <h2 className="text-lg font-semibold">See the real status.</h2>
          <p className="mt-1 text-sm text-muted-foreground">Return to your private request updates. We show routing, claim, and real decisions only.</p>
          <div className="mt-4 flex justify-center">
            <SignInButton><button type="button" className={buttonVariants()}>Secure sign in <ArrowRight /></button></SignInButton>
          </div>
        </Panel>
      </main>
    );
  }

  const requests = requestsQuery.data ?? [];
  const loadError = requestsQuery.isError && !requestsQuery.isFetching ? requestsQuery.error.message : "";
  const ready = !showSkeleton && !loadError && requestsQuery.isSuccess;
  const nowMs = Date.now();
  const visible = requests.filter(request => (tab === "closed") === isClosedRequest(request));

  let body: ReactNode = null;
  if (showSkeleton) body = <RequestsLoading slow={isSlow} />;
  else if (loadError) {
    body = <RequestsAlert className="mt-6" title="We couldn’t load your requests" detail={loadError} reassurance="Your requests are still active and nothing was lost." retryLabel="Try again" onRetry={() => { void requestsQuery.refetch(); }} dismissLabel="Back to home" onDismiss={() => go("/")} />;
  } else if (ready) {
    body = (
      <>
        <RequestSummary
          credits={creditsQuery.data ?? null}
          creditsFailed={creditsQuery.isError && !creditsQuery.isFetching}
          inConversation={countInConversation(requests)}
          expiringSoon={countExpiringSoon(requests, nowMs)}
          hasWithdrawableAsk={requests.some(canWithdrawRequest)}
          onRetryCredits={() => { void creditsQuery.refetch(); }}
        />
        <div className="directory-tabs section-tabs mt-6" role="tablist" aria-label="Request groups">
          {TABS.map(item => <Button key={item.value} type="button" variant="ghost" role="tab" aria-selected={tab === item.value} className={tab === item.value ? "selected" : ""} onClick={() => setTab(item.value)}>{item.label}</Button>)}
        </div>
        {withdrawError ? (
          <RequestsAlert
            className="mt-4"
            title="Withdraw didn't go through"
            detail={withdrawError}
            reassurance="Your request is still active and nothing was lost."
            retryLabel="Try again"
            onRetry={() => { if (failedRequest) void withdrawRequest(failedRequest); }}
            dismissLabel="Keep request"
            onDismiss={() => { setWithdrawError(""); setFailedRequest(null); }}
          />
        ) : null}
        {visible.length === 0 ? <RequestsEmpty tab={tab} firstTime={requests.length === 0} /> : (
          <ul className="mt-4 space-y-3">
            {visible.map(request => <RequestRow key={request.id} request={request} nowMs={nowMs} withdrawing={withdrawingId === request.id} onWithdraw={candidate => { void withdrawRequest(candidate); }} />)}
          </ul>
        )}
      </>
    );
  }

  return (
    <main data-skipwait-screen="my-requests" className="page-content">
      <Heading {...HEADING} aside={NEW_ASK} />
      {body}
    </main>
  );
}
