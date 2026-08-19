import { SignInButton, useAuth } from "@clerk/react";
import { Activity, AlertCircle, ArrowRight, BarChart3, CheckCircle2, FileText, Gauge, ShieldCheck, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Brand } from "@/components/Brand";
import { readApiJson } from "@/lib/apiResponse";

type FlowHealth = {
  funnel: { requestsCreated: number; requestsClaimed: number; decisionsRecorded: number; waitingForCoverage: number };
  coverageGaps: Array<{ companyDomain: string; waitingRequests: number; verifiedCoverage: number }>;
  instrumentation: { uploadedDocuments: number; recordedFailures: number };
};

const emptyHealth: FlowHealth = { funnel: { requestsCreated: 0, requestsClaimed: 0, decisionsRecorded: 0, waitingForCoverage: 0 }, coverageGaps: [], instrumentation: { uploadedDocuments: 0, recordedFailures: 0 } };

function StatCard({ icon: Icon, label, value, detail, tone = "blue" }: { icon: typeof Activity; label: string; value: number; detail: string; tone?: "blue" | "amber" | "emerald" | "slate" }) {
  const iconTone = { blue: "bg-blue-50 text-[#0B57D0]", amber: "bg-amber-50 text-amber-800", emerald: "bg-emerald-50 text-emerald-800", slate: "bg-slate-100 text-slate-700" }[tone];
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className={`grid h-10 w-10 place-items-center rounded-xl ${iconTone}`}><Icon className="h-5 w-5" /></span><p className="mt-5 text-3xl font-semibold tracking-[-.04em] text-slate-950">{value}</p><p className="mt-1 text-sm font-bold text-slate-900">{label}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></article>;
}

export default function AdminFlowHealth() {
  const { isSignedIn, getToken } = useAuth();
  const [health, setHealth] = useState<FlowHealth>(emptyHealth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true; setLoading(true); setError("");
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch("/api/admin/flow-health", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const payload = await readApiJson<{ health?: FlowHealth; error?: string }>(response, "We could not load referral flow health");
        if (!response.ok) throw new Error(payload.error || "We could not load referral flow health");
        if (active) setHealth(payload.health || emptyHealth);
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "We could not load referral flow health"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn]);

  if (!isSignedIn) return <main className="min-h-screen bg-slate-50 px-5 py-6 text-slate-950 sm:px-6"><div className="mx-auto max-w-xl"><Brand /><section className="mt-16 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-[#0B57D0]"><ShieldCheck className="h-5 w-5" /></span><h1 className="mt-6 text-3xl font-semibold tracking-[-.045em]">Admin Flow Health</h1><p className="mt-3 text-sm leading-6 text-slate-600">Sign in with the designated administrator account to view aggregate referral performance and privacy-safe coverage gaps.</p><SignInButton mode="modal"><button type="button" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0B57D0] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0847AD]">Secure sign in <ArrowRight className="h-4 w-4" /></button></SignInButton></section></div></main>;

  return <main data-skipwait-screen="admin-flow-health" className="min-h-screen bg-slate-50 px-5 py-6 text-slate-950 sm:px-6"><div className="mx-auto max-w-6xl"><header className="flex flex-wrap items-center justify-between gap-4"><Brand /><div className="flex items-center gap-2"><a href="/admin/activity" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-blue-200 hover:bg-blue-50"><Activity className="h-4 w-4 text-[#0B57D0]" />Activity log</a><span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-[#0B57D0]"><ShieldCheck className="h-3.5 w-3.5" />Admin only</span></div></header><section className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"><div><p className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#0B57D0]"><Gauge className="h-3.5 w-3.5" />Referral operating system</p><h1 className="mt-4 text-4xl font-semibold tracking-[-.055em] sm:text-5xl">Flow health, not surveillance.</h1><p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">See where the referral flow needs product attention: requests, claims, decisions, and company corridors without verified coverage. No candidate documents, request text, OTPs, or employee identities appear here.</p></div><aside className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm"><ShieldCheck className="h-5 w-5 text-blue-200" /><p className="mt-4 text-base font-semibold">Privacy boundary</p><p className="mt-2 text-sm leading-6 text-slate-300">Metrics are aggregated. Company gaps show only the need for coverage—not the people behind a request.</p></aside></section>
  {error && <div role="alert" className="mt-7 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
  {loading ? <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map(index => <div key={index} className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}</div> : <><section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><StatCard icon={FileText} label="Requests created" value={health.funnel.requestsCreated} detail="Private Job Seeker requests routed." /><StatCard icon={UsersRound} label="Requests claimed" value={health.funnel.requestsClaimed} detail="A verified employee chose to review." tone="emerald" /><StatCard icon={CheckCircle2} label="Decisions recorded" value={health.funnel.decisionsRecorded} detail="Approved or declined, factually recorded." tone="emerald" /><StatCard icon={AlertCircle} label="Waiting for coverage" value={health.funnel.waitingForCoverage} detail="Pending requests with no employee claim." tone="amber" /></section><section className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Company coverage gaps</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">Where private coverage is missing</h2><p className="mt-2 text-sm leading-6 text-slate-600">Use this to improve liquidity with a careful, company-specific invitation—not a broadcast or contact scrape.</p></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-800"><UsersRound className="h-5 w-5" /></span></div>{health.coverageGaps.length ? <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[460px] text-left text-sm"><thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-[.12em] text-slate-500"><tr><th className="pb-3 pr-4">Company corridor</th><th className="pb-3 pr-4">Private requests waiting</th><th className="pb-3">Verified coverage</th></tr></thead><tbody>{health.coverageGaps.map(gap => <tr key={gap.companyDomain} className="border-b border-slate-100 last:border-0"><td className="py-4 pr-4 font-semibold text-slate-900">{gap.companyDomain}</td><td className="py-4 pr-4 text-slate-700">{gap.waitingRequests}</td><td className="py-4 text-slate-700">{gap.verifiedCoverage}</td></tr>)}</tbody></table></div> : <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">No uncovered pending company corridors are currently recorded. This does not reveal individual employee availability.</div>}</article><aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Instrumentation health</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">Signal quality</h2><div className="mt-6 space-y-3"><div className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-semibold tracking-[-.03em] text-slate-950">{health.instrumentation.uploadedDocuments}</p><p className="mt-1 text-xs font-semibold text-slate-600">Secure document uploads recorded</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-2xl font-semibold tracking-[-.03em] text-slate-950">{health.instrumentation.recordedFailures}</p><p className="mt-1 text-xs font-semibold text-slate-600">Recent denied or failed metadata events</p></div></div><a href="/admin/activity" className="mt-6 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:border-blue-200 hover:bg-blue-50">Inspect activity metadata <ArrowRight className="h-4 w-4" /></a></aside></section></>}
  </div></main>;
}
