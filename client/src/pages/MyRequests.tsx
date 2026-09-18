import { ArrowLeft, ArrowRight, BriefcaseBusiness, CheckCircle2, ExternalLink, FileText, MailOpen, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { useLocation } from "wouter";
import { AccountMenu } from "@/components/AccountMenu";
import { ZeroActivityShareCard } from "@/components/ZeroActivityShareCard";
import ReferralProgress from "@/components/ReferralProgress";
import StatusBadge from "@/components/StatusBadge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { SeekerCreditsCard, type SeekerCredits } from "@/components/SeekerCreditsCard";
import { ActionErrorCard } from "@/components/ActionErrorCard";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { buildRequestTimeline, RequestStatusTimeline } from "@/components/RequestStatusTimeline";
import { useSlowLoad } from "@/hooks/useSlowLoad";
import { usePersistFn } from "@/hooks/usePersistFn";
import { getJobSeekerReferralState, type ReferralStatus } from "@shared/referral";
import { readApiJson } from "@/lib/apiResponse";

type ReferralRequest = { id: number; targetRoleUrl: string | null; companyDomain: string; compensation?: string | null; status: ReferralStatus; referrerId: number | null; queueStatus?: "available_for_review" | "waiting_for_coverage" | null; referrerMessage: string | null; unreadMessageCount: number; createdAt: string; updatedAt: string; attachmentCount: number };

const stateBadgeTones = { blue: "blue", amber: "amber", emerald: "green", slate: "slate" } as const;

function compactDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recorded";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

const displayRef = (id: number) => `Ref-${1000 + id}`;

function RequestProgress({ request }: { request: ReferralRequest }) {
  const reviewed = request.status !== "pending" && request.status !== "withdrawn";
  const matched = Boolean(request.referrerId);
  return <div className="mt-4 rounded-xl border border-[#e5e5e5] bg-white p-3"><ol aria-label="Request progress" className="grid grid-cols-3 gap-2 text-center"><li><span className="mx-auto grid h-6 w-6 place-items-center rounded-full bg-[#ededff] text-xs font-bold text-black">1</span><p className="mt-1 text-[11px] font-bold text-black">Sent</p><p className="mt-0.5 text-[10px] text-[#505050]">{compactDate(request.createdAt)}</p></li><li><span className={`mx-auto grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${matched ? "bg-[#ededff] text-black" : "bg-[#f0f0f0] text-[#505050]"}`}>2</span><p className="mt-1 text-[11px] font-bold text-black">Matched</p><p className="mt-0.5 text-[10px] text-[#505050]">{matched ? `Updated ${compactDate(request.updatedAt)}` : "Waiting"}</p></li><li><span className={`mx-auto grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${reviewed ? "bg-[#15803d]/10 text-[#15803d]" : "bg-[#f0f0f0] text-[#505050]"}`}>3</span><p className="mt-1 text-[11px] font-bold text-black">Reviewed</p><p className="mt-0.5 text-[10px] text-[#505050]">{reviewed ? `Updated ${compactDate(request.updatedAt)}` : "Not yet"}</p></li></ol><div className="mt-4 border-t border-[#e5e5e5] pt-3"><ReferralProgress status={request.status} /></div><div className="mt-4 border-t border-[#e5e5e5] pt-3"><p className="mb-2.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#505050]">Status history</p><RequestStatusTimeline entries={buildRequestTimeline(request)} /></div></div>;
}

export default function MyRequests() {
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const [requests, setRequests] = useState<ReferralRequest[]>([]);
  const [credits, setCredits] = useState<SeekerCredits | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");

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
        if (active) { setRequests(payload.requests || []); setActiveIndex(0); }
        const creditsResponse = await fetch("/api/credits/summary?role=job_seeker", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (creditsResponse.ok && active) { const creditsData = await creditsResponse.json() as { summary?: SeekerCredits }; if (creditsData.summary) setCredits(creditsData.summary); }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "We could not load your referral requests"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [fetchToken, isSignedIn, loadNonce]);

  if (!isSignedIn) return <main data-skipwait-screen="my-requests-sign-in" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 items-center"><button type="button" onClick={() => go("/")} className="inline-flex items-center gap-1 text-sm font-bold text-[#505050]"><ArrowLeft className="h-4 w-4" />Back</button></header><section className="flex flex-1 flex-col justify-center"><h1 className="font-display mt-6 text-[2.35rem] font-semibold leading-[.94] tracking-[-.02em]">See the real status.</h1><p className="mt-4 text-sm leading-6 text-[#505050]">Return to your private request updates. We show routing, claim, and real decisions only.</p></section><footer className="pb-[max(0.75rem,env(safe-area-inset-bottom))]"><SignInButton><button type="button" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 py-3.5 text-sm font-bold text-white">Secure sign in <ArrowRight className="h-4 w-4" /></button></SignInButton></footer></div></main>;

  const request = requests[activeIndex];
  const state = request ? request.queueStatus === "available_for_review" ? { label: "Available for review", title: `A verified employee at ${request.companyDomain} can now review your request.`, detail: "Their identity remains private. You will see a factual update when they make a decision.", tone: "blue" as const } : request.queueStatus === "waiting_for_coverage" ? { label: "Waiting for coverage", title: "Your request is waiting for company coverage.", detail: "It remains private until a verified employee at the target company is available.", tone: "amber" as const } : getJobSeekerReferralState(request) : null;
  const switchRequest = (next: number) => setActiveIndex(Math.max(0, Math.min(requests.length - 1, next)));
  const canMessageReferrer = request?.status === "approved";
  const availableForReview = request?.queueStatus === "available_for_review";
  const unreadConversationCount = canMessageReferrer ? request.unreadMessageCount : 0;
  const canWithdraw = Boolean(request && request.status === "pending" && !request.referrerId);
  const withdrawRequest = async () => {
    if (!request) return;
    setWithdrawing(true); setWithdrawError("");
    try {
      const token = await getToken();
      const response = await fetch(`/api/company-referrals/${request.id}/withdraw`, { method: "POST", credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const payload = await readApiJson<{ withdrawn?: boolean; creditSummary?: SeekerCredits; error?: string }>(response, "Withdraw didn't go through");
      if (!response.ok) throw new Error(payload.error || "Withdraw didn't go through");
      if (payload.creditSummary) setCredits(payload.creditSummary);
      setRequests(current => current.map(item => item.id === request.id ? { ...item, status: "withdrawn" as ReferralStatus, referrerId: null, queueStatus: null } : item));
    } catch (reason) { setWithdrawError(reason instanceof Error ? reason.message : "We could not withdraw this request"); }
    finally { setWithdrawing(false); }
  };

  return <main data-skipwait-screen="my-requests" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center justify-between gap-3"><button type="button" onClick={() => go("/")} className="inline-flex items-center gap-1 text-sm font-bold text-[#505050]"><ArrowLeft className="h-4 w-4" />Back</button><AccountMenu /></header>{showSkeleton ? <section className="flex flex-1 flex-col justify-center"><LoadingSkeleton title="Loading your requests…" caption="Routing checks usually take a second." slow={isSlow} /></section> : error ? <section className="flex flex-1 flex-col justify-center"><ActionErrorCard title="We couldn’t load your requests" detail={error} reassurance="Your requests are still active and nothing was lost." onRetry={reload} dismissLabel="Back to home" onDismiss={() => go("/")} /></section> : request && state ? <section className="flex min-h-0 flex-1 flex-col">{credits ? <div className="shrink-0 pb-3"><SeekerCreditsCard credits={credits} compact /></div> : null}<div className="flex min-h-0 flex-1 flex-col justify-center"><div className="flex min-h-0 flex-1 flex-col justify-center"><div className="mt-4 flex items-start justify-between gap-3"><div><p className="text-sm font-bold uppercase tracking-[.14em] text-[#505050]">{request.companyDomain}{request.compensation ? <> · <span className="normal-case tracking-normal">{request.compensation}</span></> : null} · <span className="normal-case tracking-normal">{displayRef(request.id)}</span></p><h1 className="font-display mt-2 text-[2.35rem] font-semibold leading-[.94] tracking-[-.02em]">Your referral request</h1></div><span className="shrink-0"><StatusBadge label={state.label} tone={stateBadgeTones[state.tone]} /></span></div><a href={request.targetRoleUrl || undefined} target="_blank" rel="noreferrer" className="mt-5 inline-flex max-w-full items-center gap-2 truncate text-sm font-semibold text-black"><ExternalLink className="h-4 w-4 shrink-0" /><span className="truncate">{request.targetRoleUrl || "Role link unavailable"}</span></a><div className="mt-5 rounded-xl border border-[#e5e5e5] bg-white p-4"><p className="text-sm font-bold text-black">{state.title}</p><p className="mt-2 text-sm leading-6 text-[#505050]">{state.detail}</p></div>{request.referrerMessage && request.status !== "pending" ? <aside aria-label="Referrer update" className="mt-3 rounded-xl border border-[#c2c2ff] bg-[#ededff]/60 p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-black">Referrer update</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#505050]">{request.referrerMessage}</p></aside> : null}<RequestProgress request={request} /></div></div><footer className="shrink-0 border-t border-[#e5e5e5] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">{withdrawError ? <ActionErrorCard className="mb-3" title="Withdraw didn't go through" detail={withdrawError} reassurance="Your request is still active and nothing was lost." onRetry={() => { setWithdrawError(""); void withdrawRequest(); }} retrying={withdrawing} dismissLabel="Keep request" onDismiss={() => setWithdrawError("")} /> : null}{requests.length > 1 ? <div className="mb-3 grid grid-cols-2 gap-2"><button type="button" disabled={activeIndex === 0} onClick={() => switchRequest(activeIndex - 1)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#e5e5e5] px-3 py-2.5 text-sm font-semibold text-[#505050]"><ArrowLeft className="h-4 w-4" />Previous</button><button type="button" disabled={activeIndex === requests.length - 1} onClick={() => switchRequest(activeIndex + 1)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#e5e5e5] px-3 py-2.5 text-sm font-semibold text-[#505050]">Next<ArrowRight className="h-4 w-4" /></button></div> : null}{canMessageReferrer ? <><button type="button" onClick={() => go(`/conversation/${request.id}`)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 py-3.5 text-sm font-bold text-white">{unreadConversationCount ? `Open conversation · ${unreadConversationCount} new` : "Message your Referrer"} <ArrowRight className="h-4 w-4" /></button><button type="button" onClick={() => go("/start")} className="mt-3 inline-flex w-full items-center justify-center gap-2 text-sm font-semibold text-[#505050]">Request another referral</button></> : availableForReview ? <a href={request.targetRoleUrl || undefined} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 py-3.5 text-sm font-bold text-white">View request <ArrowRight className="h-4 w-4" /></a> : <><button type="button" onClick={() => go("/start")} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 py-3.5 text-sm font-bold text-white">Request another referral <ArrowRight className="h-4 w-4" /></button>{canWithdraw ? <AlertDialog><AlertDialogTrigger asChild><button type="button" disabled={withdrawing} className="mt-3 inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold text-[#b91c1c]">{withdrawing ? "Withdrawing…" : "Withdraw"}</button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Withdraw this request?</AlertDialogTitle><AlertDialogDescription>{request.companyDomain} employees will no longer see it. Your credit returns to your balance.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep request</AlertDialogCancel><AlertDialogAction disabled={withdrawing} onClick={() => void withdrawRequest()} className="border border-[#b91c1c]/30 bg-white text-[#b91c1c] hover:bg-[#b91c1c]/10">{withdrawing ? "Withdrawing…" : "Withdraw request"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> : null}</>}</footer></section> : <section aria-label="No referral requests" className="flex flex-1 flex-col items-center justify-center"><article data-skipwait-empty-preview="job-seeker" aria-label="Illustrative private referral request" className="w-full max-w-sm rounded-3xl border border-dashed border-[#0000ff] bg-white p-5"><div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#ededff] text-black"><BriefcaseBusiness className="h-5 w-5" /></span><span className="h-2 w-16 rounded-full bg-[#f0f0f0]" /></div><div className="mt-6 grid grid-cols-3 gap-3"><span className="grid h-12 place-items-center rounded-xl bg-white text-black"><FileText className="h-4 w-4" /></span><span className="grid h-12 place-items-center rounded-xl bg-white text-[#505050]"><ShieldCheck className="h-4 w-4" /></span><span className="grid h-12 place-items-center rounded-xl bg-white text-[#15803d]"><CheckCircle2 className="h-4 w-4" /></span></div></article>{credits ? <div className="mt-6 w-full max-w-sm"><SeekerCreditsCard credits={credits} /></div> : null}<div className="mt-5 w-full max-w-sm text-center"><span className="mx-auto grid h-9 w-9 place-items-center rounded-lg bg-[#f0f0f0] text-[#505050]"><MailOpen className="h-4 w-4" /></span><h1 className="font-display mt-3 text-lg font-bold tracking-[-.02em] text-black">Nothing pending right now</h1><p className="mt-1 text-sm leading-6 text-[#505050]">Your sent requests and their outcomes will appear here.</p></div><ZeroActivityShareCard audience="job_seeker" /><footer className="mt-auto w-full pb-[max(0.75rem,env(safe-area-inset-bottom))]"><button type="button" onClick={() => go("/start")} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0000ff] px-5 py-3 text-sm font-bold text-white">Request a referral <ArrowRight className="h-4 w-4" /></button></footer></section>}</div></main>;
}
