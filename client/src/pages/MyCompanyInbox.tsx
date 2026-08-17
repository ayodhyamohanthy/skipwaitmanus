import { SignInButton, useAuth, useUser } from "@clerk/react";
import { ArrowRight, Bookmark, BriefcaseBusiness, CheckCircle2, ExternalLink, Inbox, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AccountMenu } from "@/components/AccountMenu";
import { Brand } from "@/components/Brand";
import { referralStatusLabels, type ReferralStatus } from "@shared/referral";

type InboxScope = "new" | "saved" | "completed";
type CompanyInboxItem = { id: number; targetRoleUrl: string | null; companyDomain: string; status: ReferralStatus; savedAt: string | null; createdAt: string; updatedAt: string; attachmentCount: number; isClaimedByYou: boolean };
const personalEmailDomains = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "outlook.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com"]);

const scopes: Array<{ id: InboxScope; label: string; description: string }> = [
  { id: "new", label: "New", description: "Available private requests" },
  { id: "saved", label: "Saved", description: "Return when you are ready" },
  { id: "completed", label: "Completed", description: "Your recorded decisions" },
];

function formattedDate(value: string) { return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }

export default function MyCompanyInbox() {
  const [, go] = useLocation();
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [scope, setScope] = useState<InboxScope>("new");
  const [requests, setRequests] = useState<CompanyInboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [workingId, setWorkingId] = useState<number | null>(null);
  const hasVerifiedWorkEmail = Boolean(user?.emailAddresses.some(address => { const domain = address.emailAddress.trim().toLowerCase().split("@")[1]; return address.verification?.status === "verified" && domain && !personalEmailDomains.has(domain); }));

  const companyFetch = async (path: string, init?: RequestInit) => {
    const token = await getToken();
    const response = await fetch(path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "We could not complete that private company request");
    return payload;
  };

  const loadInbox = async (nextScope = scope) => {
    if (!isSignedIn) return;
    setLoading(true); setError("");
    try { const payload = await companyFetch(`/api/company-referrals/inbox?scope=${nextScope}`); setRequests(payload.requests || []); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "We could not load your private company inbox"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadInbox(scope); }, [isSignedIn, scope]);

  const save = async (requestId: number, saved: boolean) => {
    setWorkingId(requestId); setError("");
    try { await companyFetch(`/api/company-referrals/${requestId}/save`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saved }) }); await loadInbox(scope); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "We could not update this private request"); }
    finally { setWorkingId(null); }
  };
  const claim = async (requestId: number) => {
    setWorkingId(requestId); setError("");
    try { await companyFetch(`/api/company-referrals/${requestId}/claim`, { method: "POST" }); go(`/referrer?request=${requestId}`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "This request is no longer available"); }
    finally { setWorkingId(null); }
  };

  if (!isSignedIn) return <main data-skipwait-screen="company-inbox-sign-in" className="min-h-screen bg-slate-50 px-5 py-6 text-slate-950 sm:px-6"><div className="mx-auto max-w-xl"><Brand /><section className="mt-16 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Private company inbox</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.045em]">Give referrals with context and control.</h1><p className="mt-3 text-sm leading-6 text-slate-600">Sign in, then verify a work email to see only the private requests that match your company. Your identity stays hidden from Job Seekers.</p><SignInButton mode="modal"><button type="button" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0B57D0] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0847AD]">Secure employee sign in <ArrowRight className="h-4 w-4" /></button></SignInButton></section></div></main>;

  if (!hasVerifiedWorkEmail) return <main data-skipwait-screen="company-inbox-setup" className="min-h-screen bg-slate-50 px-5 py-6 text-slate-950 sm:px-6"><div className="mx-auto max-w-xl"><header className="flex items-center justify-between gap-3"><Brand /><AccountMenu /></header><section className="mt-16 rounded-2xl border border-blue-100 bg-white p-7 shadow-sm sm:p-9"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-[#0B57D0]"><LockKeyhole className="h-5 w-5" /></span><p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Private company access</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.045em]">Verify your work email to open your inbox.</h1><p className="mt-3 text-sm leading-6 text-slate-600">A one-time code confirms your company corridor. It never makes your name, work email, or profile visible to Job Seekers.</p><button type="button" onClick={() => go("/referrer?setup=work-email")} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0B57D0] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0847AD]">Add work email <ArrowRight className="h-4 w-4" /></button></section></div></main>;

  return <main data-skipwait-screen="company-inbox" className="min-h-screen bg-slate-50 px-5 py-6 text-slate-950 sm:px-6"><div className="mx-auto max-w-5xl"><header className="flex items-center justify-between gap-3"><Brand /><AccountMenu /></header><section className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]"><div><p className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#0B57D0]"><ShieldCheck className="h-3.5 w-3.5" />Verified employee access</p><h1 className="mt-4 text-4xl font-semibold tracking-[-.055em] sm:text-5xl">My Company Inbox</h1><p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">Review only relevant private requests. Claim before opening documents, save one for later when needed, and decide in your own time.</p></div><aside className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm"><BriefcaseBusiness className="h-5 w-5 text-blue-200" /><p className="mt-4 text-base font-semibold">Hiring at your company?</p><p className="mt-2 text-sm leading-6 text-slate-300">Share one real opportunity without exposing your identity.</p><button type="button" onClick={() => go("/post-opportunity")} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-blue-50">Share an opportunity <ArrowRight className="h-4 w-4" /></button></aside></section>
  <div className="mt-8 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm" role="tablist" aria-label="Company inbox views">{scopes.map(item => <button key={item.id} type="button" role="tab" aria-selected={scope === item.id} onClick={() => setScope(item.id)} className={`min-h-10 rounded-lg px-4 py-2 text-sm font-bold transition ${scope === item.id ? "bg-[#0B57D0] text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}>{item.label}</button>)}</div>
  <p className="mt-3 text-sm text-slate-500">{scopes.find(item => item.id === scope)?.description}</p>
  {error && <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
  {loading ? <div className="mt-6 grid gap-4"><div className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white" /><div className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white" /></div> : requests.length ? <section className="mt-6 space-y-4">{requests.map(request => <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[.14em] text-slate-500">{request.companyDomain} · {request.attachmentCount} document{request.attachmentCount === 1 ? "" : "s"}</p><a href={request.targetRoleUrl || undefined} target="_blank" rel="noreferrer" className="mt-3 inline-flex max-w-full items-center gap-2 truncate text-sm font-bold text-[#0B57D0] hover:underline"><ExternalLink className="h-4 w-4 shrink-0" /><span className="truncate">{request.targetRoleUrl || "Role link unavailable"}</span></a></div><span className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-bold ${scope === "completed" ? "bg-emerald-50 text-emerald-800" : scope === "saved" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-[#0B57D0]"}`}>{scope === "completed" ? referralStatusLabels[request.status] : scope === "saved" ? "Saved privately" : "New private request"}</span></div><p className="mt-4 text-sm leading-6 text-slate-600">{scope === "completed" ? `Decision recorded ${formattedDate(request.updatedAt)}.` : scope === "saved" ? "You saved this request without opening the candidate documents. Claim it when you are ready to review." : "A candidate has shared a private request. Claim it to view their documents and make a thoughtful decision."}</p><div className="mt-5 flex flex-wrap gap-2">{scope !== "completed" && <button type="button" onClick={() => { void claim(request.id); }} disabled={workingId === request.id} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#0B57D0] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0847AD] disabled:opacity-50">{workingId === request.id ? "Opening…" : scope === "saved" ? "Claim & review" : "Claim this request"}<ArrowRight className="h-4 w-4" /></button>}{scope === "new" && <button type="button" onClick={() => { void save(request.id, true); }} disabled={workingId === request.id} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-blue-200 hover:bg-blue-50 disabled:opacity-50"><Bookmark className="h-4 w-4 text-[#0B57D0]" />Save for later</button>}{scope === "saved" && <button type="button" onClick={() => { void save(request.id, false); }} disabled={workingId === request.id} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-blue-200 hover:bg-blue-50 disabled:opacity-50">Return to New</button>}</div></article>)}</section> : <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm sm:p-12"><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-[#0B57D0]">{scope === "completed" ? <CheckCircle2 className="h-6 w-6" /> : <Inbox className="h-6 w-6" />}</span><h2 className="mt-5 text-2xl font-semibold tracking-[-.035em]">{scope === "new" ? "No new private requests." : scope === "saved" ? "Nothing saved for later." : "No completed requests yet."}</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">{scope === "new" ? "When a Job Seeker shares a role at your verified company, it will appear here. You are never required to help." : "This view will update only after a real referral action."}</p></section>}
  </div></main>;
}
