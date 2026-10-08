import { ArrowRight, Check, Clock3, MailOpen, Plus, X } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link, useLocation } from "wouter";
import { ZeroActivityShareCard } from "@/components/ZeroActivityShareCard";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { SeekerCreditsCard, type SeekerCredits } from "@/components/SeekerCreditsCard";
import { ActionErrorCard } from "@/components/ActionErrorCard";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { getJobSeekerReferralState, isPostApprovalReferralStatus, type ReferralStatus } from "@shared/referral";
import { readApiJson } from "@/lib/apiResponse";
import { useSlowLoad } from "@/hooks/useSlowLoad";
import { usePersistFn } from "@/hooks/usePersistFn";

type ReferralRequest = { id: number; title?: string | null; targetRoleUrl: string | null; companyDomain: string; compensation?: string | null; status: ReferralStatus; referrerId: number | null; queueStatus?: "available_for_review" | "waiting_for_coverage" | null; referrerMessage: string | null; unreadMessageCount: number; createdAt: string; updatedAt: string; attachmentCount: number };

const CLOSED_STATUSES: ReferralStatus[] = ["declined", "closed", "withdrawn"];

function compactDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recorded";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

const displayRef = (id: number) => `Ref-${1000 + id}`;
const isClosed = (request: ReferralRequest) => CLOSED_STATUSES.includes(request.status);
const canMessage = (request: ReferralRequest) => isPostApprovalReferralStatus(request.status);
const canWithdraw = (request: ReferralRequest) => request.status === "pending" && !request.referrerId;

function rowNote(request: ReferralRequest) {
  if (request.unreadMessageCount > 0 && canMessage(request)) return `${request.unreadMessageCount} new`;
  if (request.queueStatus === "available_for_review") return "Available for review";
  if (request.queueStatus === "waiting_for_coverage") return "Waiting for coverage";
  return `Updated ${compactDate(request.updatedAt)}`;
}

function rowState(request: ReferralRequest) {
  if (request.queueStatus === "available_for_review") return { label: "Available for review", tone: "blue" as const };
  if (request.queueStatus === "waiting_for_coverage") return { label: "Waiting for coverage", tone: "amber" as const };
  const state = getJobSeekerReferralState(request);
  return { label: state.label, tone: state.tone };
}

type RowProps = {
  request: ReferralRequest;
  withdrawing: boolean;
  onWithdraw: (request: ReferralRequest) => void;
};

function RequestRow({ request, withdrawing, onWithdraw }: RowProps) {
  const state = rowState(request);
  const label = `${request.companyDomain} request, ${state.label}`;
  const mark = (request.companyDomain.charAt(0) || "?").toUpperCase();
  const PillIcon = ["approved", "intro_made", "interview", "offer", "closed"].includes(request.status) ? Check : request.status === "pending" ? Clock3 : X;
  return (
    <li>
      <Link href={`/conversation/${request.id}`} className="flex min-h-20 items-center gap-3 rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4" aria-label={label}>
        <span className="company-mark" aria-hidden="true">{mark}</span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate">{request.title || "Referral request"}</strong>
          <small className="block truncate text-[var(--muted-foreground)]">{request.companyDomain} · {displayRef(request.id)} · {rowNote(request)}</small>
        </span>
        <span className={`status-pill status-${request.status}`}><PillIcon />{state.label}</span>
        <ArrowRight className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
      </Link>
      {request.referrerMessage && request.status !== "pending" ? (
        <aside aria-label="Referrer update" className="mt-2 rounded-xl border border-[#c2c2ff] bg-[#ededff]/60 p-3">
          <p className="text-xs leading-5 text-[#505050]">{request.referrerMessage}</p>
        </aside>
      ) : null}
      {canWithdraw(request) ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button type="button" className="mt-2 inline-flex min-h-11 items-center px-1 text-sm font-semibold text-[#b91c1c]">Withdraw</button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Withdraw this request?</AlertDialogTitle>
              <AlertDialogDescription>{request.companyDomain} employees will no longer see it. Your credit returns to your balance.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep request</AlertDialogCancel>
              <AlertDialogAction
                disabled={withdrawing}
                onClick={() => onWithdraw(request)}
                className="border border-[#b91c1c]/30 bg-white text-[#b91c1c] hover:bg-[#b91c1c]/10"
              >
                {withdrawing ? "Withdrawing…" : "Withdraw request"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </li>
  );
}

export default function MyRequests() {
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const [requests, setRequests] = useState<ReferralRequest[]>([]);
  const [credits, setCredits] = useState<SeekerCredits | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"active" | "closed">("active");
  const [withdrawingId, setWithdrawingId] = useState<number | null>(null);
  const [withdrawError, setWithdrawError] = useState("");
  const [failedRequest, setFailedRequest] = useState<ReferralRequest | null>(null);

  const { showSkeleton, isSlow } = useSlowLoad(loading);
  const [loadNonce, setLoadNonce] = useState(0);
  const reload = useCallback(() => setLoadNonce(current => current + 1), []);
  // Stable identity: the auth context may hand out a fresh getToken on every
  // render, and a load effect keyed on it would refetch in a loop.
  const fetchToken = usePersistFn(getToken);

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    setLoading(true); setError("");
    void (async () => {
      try {
        const token = await fetchToken();
        const response = await fetch("/api/company-referrals/mine", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const payload = await readApiJson<{ requests?: ReferralRequest[]; error?: string }>(response, "We could not load your referral requests");
        if (!response.ok) throw new Error(payload.error || "We could not load your referral requests");
        if (active) setRequests(payload.requests || []);
        const creditsResponse = await fetch("/api/credits/summary?role=job_seeker", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (creditsResponse.ok && active) { const creditsData = await creditsResponse.json() as { summary?: SeekerCredits }; if (creditsData.summary) setCredits(creditsData.summary); }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "We could not load your referral requests"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [fetchToken, isSignedIn, loadNonce]);

  const withdrawRequest = async (request: ReferralRequest) => {
    setWithdrawingId(request.id); setWithdrawError(""); setFailedRequest(null);
    try {
      const token = await getToken();
      const response = await fetch(`/api/company-referrals/${request.id}/withdraw`, { method: "POST", credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const payload = await readApiJson<{ withdrawn?: boolean; creditSummary?: SeekerCredits; error?: string }>(response, "Withdraw didn't go through");
      if (!response.ok) throw new Error(payload.error || "Withdraw didn't go through");
      if (payload.creditSummary) setCredits(payload.creditSummary);
      setRequests(current => current.map(item => item.id === request.id ? { ...item, status: "withdrawn" as ReferralStatus, referrerId: null, queueStatus: null } : item));
    } catch (reason) {
      setWithdrawError(reason instanceof Error ? reason.message : "We could not withdraw this request");
      setFailedRequest(request);
    } finally { setWithdrawingId(null); }
  };

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="my-requests-sign-in" className="mx-auto max-w-xl px-5 py-6 text-black">
        <p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#505050]">My asks</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-.02em]">See the real status.</h1>
        <p className="mt-3 text-sm leading-6 text-[#505050]">Return to your private request updates. We show routing, claim, and real decisions only.</p>
        <div className="mt-6">
          <SignInButton>
            <button type="button" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 text-sm font-bold text-white">
              Secure sign in <ArrowRight className="h-4 w-4" />
            </button>
          </SignInButton>
        </div>
      </main>
    );
  }

  const openCount = requests.filter(request => request.status === "pending").length;
  const inConversation = requests.filter(request => request.referrerId || isPostApprovalReferralStatus(request.status)).length;
  const unreadTotal = requests.reduce((sum, request) => sum + request.unreadMessageCount, 0);
  const visible = requests.filter(request => (tab === "closed") === isClosed(request));

  let body: ReactNode;
  if (showSkeleton) {
    body = (
      <section className="mt-6">
        <LoadingSkeleton title="Loading your requests…" caption="Routing checks usually take a second." slow={isSlow} />
      </section>
    );
  } else if (error) {
    body = (
      <section className="mt-6">
        <ActionErrorCard title="We couldn’t load your requests" detail={error} reassurance="Your requests are still active and nothing was lost." onRetry={reload} dismissLabel="Back to home" onDismiss={() => go("/")} />
      </section>
    );
  } else if (requests.length === 0) {
    body = (
      <section aria-label="No referral requests" className="mt-6 flex flex-col items-center text-center">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f0f0f0] text-[#505050]"><MailOpen className="h-4 w-4" /></span>
        <h2 className="mt-3 text-lg font-bold tracking-[-.02em]">Nothing pending right now</h2>
        <p className="mt-1 text-sm leading-6 text-[#505050]">Your sent requests and their outcomes will appear here.</p>
        <ZeroActivityShareCard audience="job_seeker" />
        <div className="mt-5 w-full">
          <button type="button" onClick={() => go("/start")} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 text-sm font-bold text-white">
            Request a referral <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>
    );
  } else if (visible.length === 0) {
    body = (
      <section className="mt-6 text-center">
        <h2 className="text-lg font-bold">{tab === "active" ? "No open asks." : "Nothing closed yet."}</h2>
        <p className="mt-1 text-sm leading-6 text-[#505050]">{tab === "active" ? "Request a referral to open your first ask." : "Answered, passed, or withdrawn asks will appear here."}</p>
        {tab === "active" ? (
          <button type="button" onClick={() => go("/start")} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 text-sm font-bold text-white">
            Request a referral <ArrowRight className="h-4 w-4" />
          </button>
        ) : null}
      </section>
    );
  } else {
    body = (
      <ul className="mt-4 space-y-3">
        {visible.map(request => (
          <RequestRow
            key={request.id}
            request={request}
            withdrawing={withdrawingId === request.id}
            onWithdraw={candidate => { void withdrawRequest(candidate); }}
          />
        ))}
      </ul>
    );
  }

  return (
    <main data-skipwait-screen="my-requests" className="page-content">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="page-heading">
          <span className="eyebrow">My asks</span>
          <h1 className="mt-2">Requests<span className="brand-dot">.</span></h1>
          <p className="mt-2 max-w-xl">Track every ask in one place. Answered, passed, or withdrawn asks free a slot.</p>
        </div>
        <button type="button" onClick={() => go("/explore")} className="brand-button shrink-0">
          <Plus className="size-4" />New ask
        </button>
      </div>
      {credits ? <div className="mb-4"><SeekerCreditsCard credits={credits} compact /></div> : null}
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Request summary">
        <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5"><span className="eyebrow">Open asks</span><p className="mt-1 text-3xl font-semibold">{openCount}</p></section>
        <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5"><span className="eyebrow">In conversation</span><p className="mt-1 text-3xl font-semibold">{inConversation}</p></section>
        <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5"><span className="eyebrow">Unread updates</span><p className="mt-1 text-3xl font-semibold">{unreadTotal}</p></section>
      </div>
      {requests.length > 0 && !showSkeleton && !error ? (
        <div className="directory-tabs section-tabs mt-6" role="tablist" aria-label="Request groups">
          {(["active", "closed"] as const).map(value => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={tab === value ? "selected" : ""}
            >
              {value === "active" ? "Active" : "Closed"}
            </button>
          ))}
        </div>
      ) : null}
      {withdrawError ? (
        <div role="alert" className="mt-4 rounded-xl border border-[#b91c1c]/30 bg-[#b91c1c]/10 p-4">
          <p className="text-sm font-bold text-[#B91C1C]">Withdraw didn't go through</p>
          <p className="mt-1 text-sm text-[#B91C1C]">{withdrawError}</p>
          <p className="mt-1 text-sm text-[#505050]">Your request is still active and nothing was lost.</p>
          <div className="mt-3 flex gap-2">
            {failedRequest ? (
              <button type="button" onClick={() => { void withdrawRequest(failedRequest); }} className="inline-flex min-h-11 items-center rounded-lg bg-[#B91C1C] px-4 text-sm font-bold text-white">
                Try again
              </button>
            ) : null}
            <button type="button" onClick={() => { setWithdrawError(""); setFailedRequest(null); }} className="inline-flex min-h-11 items-center rounded-lg border border-[#e5e5e5] bg-white px-4 text-sm font-bold text-black">
              Keep request
            </button>
          </div>
        </div>
      ) : null}
      {body}
    </main>
  );
}
