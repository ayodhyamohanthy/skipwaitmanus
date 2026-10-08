import { AlertCircle, ArrowRight, CheckCircle2, FileText, Inbox, ShieldCheck, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Brand } from "@/components/Brand";
import { AdminNav } from "@/components/AdminNav";
import { Link } from "wouter";
import { readApiJson } from "@/lib/apiResponse";

type Funnel = { requestsCreated: number; requestsClaimed: number; decisionsRecorded: number; waitingForCoverage: number };
type CoverageGap = { companyDomain: string; waitingRequests: number; verifiedCoverage: number };

const TOOLS = [
  { href: "/admin/approvals", title: "Approval queue", body: "Seeker requests, referrer enrollments, and payments needing reconciliation." },
  { href: "/admin-review", title: "Safety review", body: "Reports, verification exceptions, and company submissions with audit trail." },
  { href: "/admin/payments", title: "Payment reviews", body: "Held credit-pack payments awaiting a manual credit decision." },
  { href: "/admin/users", title: "Users", body: "Account roster with role, company, and suspension state." },
  { href: "/admin/activity", title: "Activity log", body: "Privacy-safe operational diagnostics for every material workflow." },
  { href: "/admin/flow-health", title: "Flow health", body: "Funnel, revenue, and coverage diagnostics." },
] as const;

export default function AdminOverview() {
  const { isSignedIn, getToken } = useAuth();
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [gaps, setGaps] = useState<CoverageGap[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    setLoading(true); setError("");
    void (async () => {
      try {
        const token = await getToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const response = await fetch("/api/admin/flow-health", { credentials: "include", headers });
        const payload = await readApiJson<{ funnel?: Funnel; coverageGaps?: CoverageGap[]; error?: string }>(response, "We could not load operations");
        if (!response.ok) throw new Error(payload.error || "We could not load operations");
        if (!active) return;
        if (payload.funnel) setFunnel(payload.funnel);
        setGaps(Array.isArray(payload.coverageGaps) ? payload.coverageGaps : []);
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "We could not load operations"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn]);

  if (!isSignedIn) return <main className="min-h-screen bg-white px-6 py-6 text-black"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-2xl border border-[#e5e5e5] bg-white p-8"><ShieldCheck className="h-7 w-7 text-black" /><h1 className="mt-4 text-2xl font-semibold">Operations console</h1><p className="mt-2 text-sm leading-6 text-[#505050]">Sign in with the designated administrator account to operate for trust, not vanity.</p><SignInButton><button type="button" className="mt-5 rounded-lg bg-[#141414] px-4 py-3 text-sm font-semibold text-white">Secure sign in</button></SignInButton></section></div></main>;

  return <main data-skipwait-screen="admin-overview" className="min-h-screen bg-white px-5 py-6 text-black sm:px-6"><div className="mx-auto max-w-6xl"><AdminNav current="overview" badge="Internal operations" />
    <section className="mt-10">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-black">Internal operations</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Operate for trust, not vanity.</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#505050]">Live aggregates only — never individual seekers, documents, or private conversations. Every tool below keeps its own audit trail.</p>
    </section>
    {error ? <p role="alert" className="mt-6 rounded-xl border border-[#B91C1C]/30 bg-[#B91C1C]/5 p-4 text-sm text-[#B91C1C]">{error}</p> : null}
    {loading ? <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map(index => <div key={index} className="h-32 animate-pulse rounded-2xl border border-[#e5e5e5] bg-white" />)}</div> : funnel ? (
      <section aria-label="Live funnel" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: FileText, label: "Requests created", value: funnel.requestsCreated },
          { icon: UsersRound, label: "Requests claimed", value: funnel.requestsClaimed },
          { icon: CheckCircle2, label: "Decisions recorded", value: funnel.decisionsRecorded },
          { icon: AlertCircle, label: "Waiting for coverage", value: funnel.waitingForCoverage },
        ].map(({ icon: Icon, label, value }) => (
          <article key={label} className="rounded-2xl border border-[#e5e5e5] bg-white p-5"><Icon className="h-5 w-5 text-black" /><p className="mt-4 text-3xl font-semibold tracking-[-.04em]">{value}</p><p className="mt-1 text-sm font-bold">{label}</p></article>
        ))}
      </section>
    ) : null}
    {!loading && !error ? (
      <section aria-label="Coverage gaps" className="mt-6 rounded-2xl border border-[#e5e5e5] bg-white p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-xl font-semibold"><Inbox className="h-5 w-5" />Company corridors without coverage</h2>
        {gaps.length === 0
          ? <p className="mt-2 text-sm text-[#505050]">No waiting requests lack verified coverage right now.</p>
          : <ul className="mt-4 grid gap-2">{gaps.map(gap => <li key={gap.companyDomain} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f5f5f5] px-4 py-3 text-sm"><strong>{gap.companyDomain}</strong><span className="text-[#505050]">{gap.waitingRequests} waiting · {gap.verifiedCoverage} verified</span></li>)}</ul>}
      </section>
    ) : null}
    <section aria-label="Operations tools" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {TOOLS.map(tool => (
        <Link key={tool.href} href={tool.href} className="rounded-2xl border border-[#e5e5e5] bg-white p-5 hover:border-[#141414]"><p className="flex items-center justify-between font-semibold">{tool.title}<ArrowRight className="h-4 w-4" /></p><p className="mt-2 text-sm leading-6 text-[#505050]">{tool.body}</p></Link>
      ))}
    </section>
  </div></main>;
}
