import { SignInButton, useAuth } from "@clerk/react";
import { ArrowRight, BriefcaseBusiness, CheckCircle2, CircleDotDashed, Clock3, ExternalLink, FileText, ShieldCheck, UserRoundCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AccountMenu } from "@/components/AccountMenu";
import { Brand } from "@/components/Brand";
import { getJobSeekerReferralState, type ReferralStatus } from "@shared/referral";

type ReferralRequest = {
  id: number;
  targetRoleUrl: string | null;
  companyDomain: string;
  status: ReferralStatus;
  referrerId: number | null;
  createdAt: string;
  updatedAt: string;
  attachmentCount: number;
};

const toneClasses = {
  blue: "border-blue-200 bg-blue-50 text-[#0B57D0]",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  slate: "border-slate-200 bg-slate-100 text-slate-700",
} as const;

function formattedDate(value: string) {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function RequestTimeline({ request }: { request: ReferralRequest }) {
  const state = getJobSeekerReferralState(request);
  const decisionMade = request.status !== "pending";
  return <ol className="mt-6 space-y-0" aria-label={`Referral timeline for ${request.companyDomain}`}>
    <li className="relative flex gap-3 pb-5 before:absolute before:left-[9px] before:top-5 before:h-[calc(100%-6px)] before:w-px before:bg-slate-200"><span className="relative z-10 grid h-5 w-5 place-items-center rounded-full bg-[#0B57D0] text-white"><CheckCircle2 className="h-3.5 w-3.5" /></span><div><p className="text-sm font-bold text-slate-900">Request routed privately</p><p className="mt-0.5 text-xs text-slate-500">{formattedDate(request.createdAt)} · {request.attachmentCount} private document{request.attachmentCount === 1 ? "" : "s"} attached</p></div></li>
    <li className="relative flex gap-3 pb-5 before:absolute before:left-[9px] before:top-5 before:h-[calc(100%-6px)] before:w-px before:bg-slate-200"><span className={`relative z-10 grid h-5 w-5 place-items-center rounded-full ${request.referrerId ? "bg-[#0B57D0] text-white" : "border border-slate-300 bg-white text-slate-400"}`}>{request.referrerId ? <UserRoundCheck className="h-3.5 w-3.5" /> : <CircleDotDashed className="h-3.5 w-3.5" />}</span><div><p className="text-sm font-bold text-slate-900">{request.referrerId ? "Verified employee reviewing" : "Available to verified employees"}</p><p className="mt-0.5 text-xs text-slate-500">{request.referrerId ? `Claimed ${formattedDate(request.updatedAt)}` : "No employee has claimed it yet. Your request remains private."}</p></div></li>
    <li className="flex gap-3"><span className={`relative z-10 grid h-5 w-5 place-items-center rounded-full ${decisionMade ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white text-slate-400"}`}>{decisionMade ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}</span><div><p className="text-sm font-bold text-slate-900">{decisionMade ? state.label : "Decision pending"}</p><p className="mt-0.5 text-xs text-slate-500">{decisionMade ? `Updated ${formattedDate(request.updatedAt)}` : "You will see an update only when a real decision is recorded."}</p></div></li>
  </ol>;
}

export default function MyRequests() {
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const [requests, setRequests] = useState<ReferralRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    setLoading(true); setError("");
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch("/api/company-referrals/mine", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "We could not load your referral requests");
        if (active) setRequests(payload.requests || []);
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "We could not load your referral requests"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn]);

  if (!isSignedIn) return <main data-skipwait-screen="my-requests-sign-in" className="min-h-screen bg-slate-50 px-5 py-6 text-slate-950 sm:px-6"><div className="mx-auto max-w-xl"><Brand /><section className="mt-16 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Your referral requests</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.045em]">See the factual status of every request.</h1><p className="mt-3 text-sm leading-6 text-slate-600">Sign in to return to your private referral requests. We only show verified routing, claim, and decision updates.</p><SignInButton mode="modal"><button type="button" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0B57D0] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0847AD]">Secure sign in <ArrowRight className="h-4 w-4" /></button></SignInButton></section></div></main>;

  return <main data-skipwait-screen="my-requests" className="min-h-screen bg-slate-50 px-5 py-6 text-slate-950 sm:px-6"><div className="mx-auto max-w-5xl"><header className="flex items-center justify-between gap-3"><Brand /><AccountMenu /></header><section className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]"><div><p className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#0B57D0]"><ShieldCheck className="h-3.5 w-3.5" />Private request tracking</p><h1 className="mt-4 text-4xl font-semibold tracking-[-.055em] sm:text-5xl">My referral requests</h1><p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">A quiet, factual view of your requests. No false activity, no exposed employee identities—only real routing and decision updates.</p></div><aside className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm"><BriefcaseBusiness className="h-5 w-5 text-blue-200" /><p className="mt-4 text-base font-semibold">Need another referral?</p><p className="mt-2 text-sm leading-6 text-slate-300">Reuse your process for the next role in a few focused steps.</p><button type="button" onClick={() => go("/start")} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-blue-50">Request a referral <ArrowRight className="h-4 w-4" /></button><button type="button" onClick={() => go("/wall")} className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-white/20 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-white/10">Browse Internal Openings</button></aside></section>
    {error && <div role="alert" className="mt-8 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
    {loading ? <div className="mt-8 grid gap-4"><div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-white" /><div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-white" /></div> : requests.length ? <section className="mt-8 space-y-4">{requests.map(request => { const state = getJobSeekerReferralState(request); return <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-500">{request.companyDomain}</p><h2 className="mt-2 text-xl font-semibold tracking-[-.03em] text-slate-950">Private referral request</h2><a href={request.targetRoleUrl || undefined} target="_blank" rel="noreferrer" className="mt-3 inline-flex max-w-full items-center gap-2 truncate text-sm font-semibold text-[#0B57D0] hover:underline"><ExternalLink className="h-4 w-4 shrink-0" /><span className="truncate">{request.targetRoleUrl || "Role link unavailable"}</span></a></div><span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold ${toneClasses[state.tone]}`}>{state.label}</span></div><div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4"><p className="text-sm font-bold text-slate-900">{state.title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{state.detail}</p></div><RequestTimeline request={request} /></article>; })}</section> : <section className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm sm:p-12"><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-[#0B57D0]"><FileText className="h-6 w-6" /></span><h2 className="mt-5 text-2xl font-semibold tracking-[-.035em]">No referral requests yet.</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">Start with a real employer job link and a resume. We will route your request privately to eligible employees at that company.</p><button type="button" onClick={() => go("/start")} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0B57D0] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0847AD]">Request a referral <ArrowRight className="h-4 w-4" /></button></section>}
  </div></main>;
}
