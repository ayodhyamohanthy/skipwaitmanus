import { ArrowRight, Building2, CheckCircle2, CircleDollarSign, Eye, type LucideIcon, ShieldAlert, ShieldCheck, UsersRound } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { LAUNCH_COMPANIES } from "@/lib/companies";
import { AdminHeading, type AdminView } from "./AdminShell";
import type { FlowHealth } from "./adminApi";

export type LiveMetric = { value: number | null; loading: boolean; failed: boolean; detail: string };

const TASKS = [
  ["Review company submissions", "Validate domains and prevent duplicates", "companies"],
  ["Review work-email exceptions", "Resolve only with sufficient evidence", "verifications"],
  ["Handle safety reports", "Urgent harm and payment requests first", "reports"],
] as const;

export const ADMIN_TOOLS = [
  { href: "/admin/approvals", title: "Approval queue", body: "Seeker requests, referrer enrollments, and payments needing reconciliation." },
  { href: "/admin-review", title: "Safety review", body: "Reports, verification exceptions, and company submissions with audit trail." },
  { href: "/admin/payments", title: "Payment reviews", body: "Held credit-pack payments awaiting a manual credit decision." },
  { href: "/admin/users", title: "Users", body: "Account roster with role, company, and suspension state." },
  { href: "/admin/activity", title: "Activity log", body: "Privacy-safe operational diagnostics for every material workflow." },
  { href: "/admin/flow-health", title: "Flow health", body: "Funnel, revenue, and coverage diagnostics." },
] as const;

// Static class strings so Tailwind emits them; bars scale to the largest funnel stage.
const BAR_HEIGHTS = ["h-px", "h-[7%]", "h-[14%]", "h-[21%]", "h-[28%]", "h-[35%]", "h-[42%]", "h-[49%]", "h-[56%]", "h-[63%]", "h-[70%]"] as const;
function barHeight(value: number, max: number) {
  if (value <= 0 || max <= 0) return BAR_HEIGHTS[0];
  return BAR_HEIGHTS[Math.max(1, Math.round((value / max) * 10))] ?? BAR_HEIGHTS[10];
}

function Kpi({ icon: Icon, label, metric }: { icon: LucideIcon; label: string; metric: LiveMetric }) {
  return <div aria-busy={metric.loading || undefined}><Icon /><span>{label}</span><strong>{metric.value ?? "—"}</strong><small>{metric.loading ? "Loading live count" : metric.failed ? "Could not load" : metric.detail}</small></div>;
}

function FunnelChart({ health }: { health: FlowHealth }) {
  const { funnel } = health;
  const columns = [
    { label: "Requests created", value: funnel.requestsCreated, demand: true },
    { label: "Requests claimed", value: funnel.requestsClaimed, demand: false },
    { label: "Decisions recorded", value: funnel.decisionsRecorded, demand: false },
    { label: "Waiting for coverage", value: funnel.waitingForCoverage, demand: true },
  ];
  const max = Math.max(...columns.map(column => column.value));
  return <div className="grid h-[180px] grid-cols-4 items-end gap-3.5 border-b border-border px-[15px] pt-5 max-md:gap-[7px] max-md:px-[5px]">
    {columns.map(column => <div key={column.label} className="flex h-full flex-col items-center justify-end gap-[7px]"><strong className="shrink-0 text-sm font-semibold">{column.value}</strong><span className={`w-[45%] rounded-t-[4px] ${barHeight(column.value, max)} ${column.demand ? "bg-primary" : "border border-b-0 border-foreground bg-secondary"}`} /><small className="h-[18px] shrink-0 text-center font-mono text-[9px] leading-tight max-md:h-6">{column.label}</small></div>)}
  </div>;
}

export function OverviewView({ onView, verificationQueue, openReports, health, healthLoading, healthFailed }: { onView: (view: AdminView) => void; verificationQueue: LiveMetric; openReports: LiveMetric; health: FlowHealth | undefined; healthLoading: boolean; healthFailed: boolean }) {
  const companyCoverage: LiveMetric = { value: LAUNCH_COMPANIES.length, loading: false, failed: false, detail: "Confirmed launch companies" };
  const marketplaceUsers: LiveMetric = { value: null, loading: false, failed: false, detail: "No fabricated count" };
  return <>
    <AdminHeading eyebrow="MARKETPLACE CONTROL ROOM" title="Operate for trust, not vanity." body="Prioritize safety, healthy supply, and useful introductions. Never optimize for referral volume alone." />
    <section className="admin-kpi-grid" aria-label="Operations snapshot"><Kpi icon={ShieldCheck} label="Verification queue" metric={verificationQueue} /><Kpi icon={ShieldAlert} label="Open reports" metric={openReports} /><Kpi icon={Building2} label="Company coverage" metric={companyCoverage} /><Kpi icon={UsersRound} label="Marketplace users" metric={marketplaceUsers} /></section>
    <section className="admin-grid">
      <div className="admin-panel"><header><div><span className="eyebrow">OPERATIONS</span><h2>Priority queues</h2></div></header>{TASKS.map(([title, body, target]) => <Button key={title} variant="ghost" className="admin-task" onClick={() => onView(target)}><span><strong>{title}</strong><small>{body}</small></span><ArrowRight /></Button>)}</div>
      <div className="admin-panel monetization-panel"><span className="eyebrow">SUSTAINABLE, NOT PAY-TO-WIN</span><h2>Monetization guardrails</h2><div><CircleDollarSign /><span><strong>Employer credits</strong><small>Talent unlocks and a self-serve promotion budget.</small></span></div><div><Eye /><span><strong>Sponsored roles</strong><small>Clearly labeled, never prioritized in referral matching.</small></span></div><div><CheckCircle2 /><span><strong>Free requests every month</strong><small>No commissions or paid queue position.</small></span></div></div>
    </section>
    {healthFailed ? null : <section className="sample-chart" aria-label="Live funnel">
      <header><div><span className="eyebrow">LIVE REFERRAL FUNNEL</span><h2>Healthy growth balances both sides.</h2></div></header>
      {health ? <FunnelChart health={health} /> : <div className="h-[180px] animate-pulse rounded-[7px] bg-muted" aria-busy={healthLoading || undefined} />}
      <div className="chart-legend"><span><i />Seeker demand</span><span><i />Referrer response</span></div>
    </section>}
    {health ? <section className="admin-panel mt-3.5" aria-label="Coverage gaps">
      <header><div><span className="eyebrow">COVERAGE GAPS</span><h2>Company corridors without coverage</h2></div></header>
      {health.coverageGaps.length === 0
        ? <p className="text-[13px] text-muted-foreground">No waiting requests lack verified coverage right now.</p>
        : <ul>{health.coverageGaps.map(gap => <li key={gap.companyDomain} className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-0.5 py-4 text-sm"><strong>{gap.companyDomain}</strong><span className="text-[11px] text-muted-foreground">{gap.waitingRequests} waiting · {gap.verifiedCoverage} verified</span></li>)}</ul>}
    </section> : null}
    <section className="admin-panel mt-3.5" aria-label="Operations tools">
      <header><div><span className="eyebrow">TOOLS</span><h2>Every tool keeps its own audit trail</h2></div></header>
      <div className="grid gap-x-6 md:grid-cols-2">{ADMIN_TOOLS.map(tool => <Button key={tool.href} variant="ghost" asChild className="admin-task whitespace-normal"><Link href={tool.href}><span><strong>{tool.title}</strong><small>{tool.body}</small></span><ArrowRight /></Link></Button>)}</div>
    </section>
  </>;
}
