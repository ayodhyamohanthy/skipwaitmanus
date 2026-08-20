import { ArrowLeft, ArrowRight, BriefcaseBusiness, CheckCircle2, ExternalLink, FileText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { SignInButton, useAuth as useClerkAuth } from "@clerk/react";
import { useLocation } from "wouter";
import { AccountMenu } from "@/components/AccountMenu";
import { ZeroActivityShareCard } from "@/components/ZeroActivityShareCard";
import ReferralProgress from "@/components/ReferralProgress";
import { getJobSeekerReferralState, type ReferralStatus } from "@shared/referral";
import { readApiJson } from "@/lib/apiResponse";

type ReferralRequest = { id: number; targetRoleUrl: string | null; companyDomain: string; status: ReferralStatus; referrerId: number | null; referrerMessage: string | null; unreadMessageCount: number; createdAt: string; updatedAt: string; attachmentCount: number };

const toneClasses = { blue: "border-blue-200 bg-blue-50 text-[#0B57D0]", amber: "border-amber-200 bg-amber-50 text-amber-800", emerald: "border-emerald-200 bg-emerald-50 text-emerald-800", slate: "border-slate-200 bg-slate-100 text-slate-700" } as const;

function compactDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recorded";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function RequestProgress({ request }: { request: ReferralRequest }) {
  const reviewed = request.status !== "pending";
  const matched = Boolean(request.referrerId);
  return <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3"><ol aria-label="Request progress" className="grid grid-cols-3 gap-2 text-center"><li><span className="mx-auto grid h-6 w-6 place-items-center rounded-full bg-blue-50 text-xs font-bold text-[#0B57D0]">1</span><p className="mt-1 text-[11px] font-bold text-slate-800">Sent</p><p className="mt-0.5 text-[10px] text-slate-500">{compactDate(request.createdAt)}</p></li><li><span className={`mx-auto grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${matched ? "bg-blue-50 text-[#0B57D0]" : "bg-slate-100 text-slate-500"}`}>2</span><p className="mt-1 text-[11px] font-bold text-slate-800">Matched</p><p className="mt-0.5 text-[10px] text-slate-500">{matched ? `Updated ${compactDate(request.updatedAt)}` : "Waiting"}</p></li><li><span className={`mx-auto grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${reviewed ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>3</span><p className="mt-1 text-[11px] font-bold text-slate-800">Reviewed</p><p className="mt-0.5 text-[10px] text-slate-500">{reviewed ? `Updated ${compactDate(request.updatedAt)}` : "Not yet"}</p></li></ol><div className="mt-4 border-t border-slate-100 pt-3"><ReferralProgress status={request.status} /></div></div>;
}

export default function MyRequests() {
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useClerkAuth();
  const [requests, setRequests] = useState<ReferralRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    setLoading(true); setError("");
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch("/api/company-referrals/mine", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const payload = await readApiJson<{ requests?: ReferralRequest[]; error?: string }>(response, "We could not load your referral requests");
        if (!response.ok) throw new Error(payload.error || "We could not load your referral requests");
        if (active) { setRequests(payload.requests || []); setActiveIndex(0); }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "We could not load your referral requests"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn]);

  if (!isSignedIn) return <main data-skipwait-screen="my-requests-sign-in" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 items-center"><button type="button" onClick={() => go("/")} className="inline-flex items-center gap-1 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" />Back</button></header><section className="flex flex-1 flex-col justify-center"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Your referral requests</p><h1 className="mt-3 text-[2.35rem] font-semibold leading-[.96] tracking-[-.06em]">See the real status.</h1><p className="mt-4 text-sm leading-6 text-slate-600">Return to your private request updates. We show routing, claim, and real decisions only.</p></section><footer className="pb-[max(0.75rem,env(safe-area-inset-bottom))]"><SignInButton mode="modal"><button type="button" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-bold text-white">Secure sign in <ArrowRight className="h-4 w-4" /></button></SignInButton></footer></div></main>;

  const request = requests[activeIndex];
  const state = request ? getJobSeekerReferralState(request) : null;
  const switchRequest = (next: number) => setActiveIndex(Math.max(0, Math.min(requests.length - 1, next)));
  const canMessageReferrer = request?.status === "approved";
  const unreadConversationCount = canMessageReferrer ? request.unreadMessageCount : 0;

  return <main data-skipwait-screen="my-requests" className="h-dvh min-h-dvh overflow-hidden bg-slate-50 px-5 py-4 text-slate-950"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 shrink-0 items-center justify-between gap-3"><button type="button" onClick={() => go("/")} className="inline-flex items-center gap-1 text-sm font-bold text-slate-600"><ArrowLeft className="h-4 w-4" />Back</button><AccountMenu /></header>{loading ? <section className="flex flex-1 flex-col justify-center"><div className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white" /></section> : error ? <section className="flex flex-1 flex-col justify-center"><p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p></section> : request && state ? <section className="flex min-h-0 flex-1 flex-col"><div className="flex min-h-0 flex-1 flex-col justify-center"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Request {activeIndex + 1} of {requests.length}</p><div className="mt-4 flex items-start justify-between gap-3"><div><p className="text-sm font-bold uppercase tracking-[.14em] text-slate-500">{request.companyDomain}</p><h1 className="mt-2 text-[2.35rem] font-semibold leading-[.96] tracking-[-.06em]">Your referral request</h1></div><span className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${toneClasses[state.tone]}`}>{state.label}</span></div><a href={request.targetRoleUrl || undefined} target="_blank" rel="noreferrer" className="mt-5 inline-flex max-w-full items-center gap-2 truncate text-sm font-semibold text-[#0B57D0]"><ExternalLink className="h-4 w-4 shrink-0" /><span className="truncate">{request.targetRoleUrl || "Role link unavailable"}</span></a><div className="mt-5 rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm font-bold text-slate-900">{state.title}</p><p className="mt-2 text-sm leading-6 text-slate-600">{state.detail}</p></div>{request.referrerMessage && request.status !== "pending" ? <aside aria-label="Referrer update" className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#0B57D0]">Referrer update</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{request.referrerMessage}</p></aside> : null}<RequestProgress request={request} /></div><footer className="shrink-0 border-t border-slate-200 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">{requests.length > 1 ? <div className="mb-3 grid grid-cols-2 gap-2"><button type="button" disabled={activeIndex === 0} onClick={() => switchRequest(activeIndex - 1)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-35"><ArrowLeft className="h-4 w-4" />Previous</button><button type="button" disabled={activeIndex === requests.length - 1} onClick={() => switchRequest(activeIndex + 1)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-35">Next<ArrowRight className="h-4 w-4" /></button></div> : null}{canMessageReferrer ? <><button type="button" onClick={() => go(`/conversation/${request.id}`)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-bold text-white">{unreadConversationCount ? `Open conversation · ${unreadConversationCount} new` : "Message your Referrer"} <ArrowRight className="h-4 w-4" /></button><button type="button" onClick={() => go("/start")} className="mt-3 inline-flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-600">Request another referral</button></> : <button type="button" onClick={() => go("/start")} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3.5 text-sm font-bold text-white">Request another referral <ArrowRight className="h-4 w-4" /></button>}</footer></section> : <section aria-label="No referral requests" className="flex flex-1 flex-col items-center justify-center"><article data-skipwait-empty-preview="job-seeker" aria-label="Illustrative private referral request" className="w-full max-w-sm rounded-3xl border border-dashed border-blue-200 bg-white p-5"><div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-[#0B57D0]"><BriefcaseBusiness className="h-5 w-5" /></span><span className="h-2 w-16 rounded-full bg-slate-100" /></div><div className="mt-6 grid grid-cols-3 gap-3"><span className="grid h-12 place-items-center rounded-xl bg-slate-50 text-[#0B57D0]"><FileText className="h-4 w-4" /></span><span className="grid h-12 place-items-center rounded-xl bg-slate-50 text-slate-500"><ShieldCheck className="h-4 w-4" /></span><span className="grid h-12 place-items-center rounded-xl bg-slate-50 text-emerald-700"><CheckCircle2 className="h-4 w-4" /></span></div></article><ZeroActivityShareCard audience="job_seeker" /><footer className="mt-auto w-full pb-[max(0.75rem,env(safe-area-inset-bottom))]"><button type="button" onClick={() => go("/start")} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-5 py-3 text-sm font-bold text-white">Request a referral <ArrowRight className="h-4 w-4" /></button></footer></section>}</div></main>;
}
