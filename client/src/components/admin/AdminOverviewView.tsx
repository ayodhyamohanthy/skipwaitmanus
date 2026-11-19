import { ArrowRight, Building2, CheckCircle2, CircleDollarSign, Eye, type LucideIcon, ShieldAlert, ShieldCheck, UsersRound } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import type { AdminCompany } from "@shared/companies";
import { AdminHeading, type AdminView } from "./AdminShell";
import type { FlowHealth } from "./adminApi";

export type LiveMetric = { value: number | null; loading: boolean; failed: boolean; detail: string };

/** Company coverage: listed companies with an open door right now (a verified, available referrer). */
export function companyCoverageMetric(companies: readonly AdminCompany[] | undefined, loading: boolean, failed: boolean): LiveMetric {
  const listed = companies?.filter(company => company.status === "listed");
  const open = listed?.filter(company => company.openToReferrals).length ?? null;
  const detail = !listed || listed.length === 0 ? "No companies listed yet" : open === listed.length ? "Confirmed launch companies" : `${open ?? 0} of ${listed.length} listed companies open`;
  return { value: open, loading, failed, detail };
}

const TASKS = [
  ["Review company submissions", "Validate domains and prevent duplicates", "companies"],
  ["Review work-email exceptions", "Resolve only with sufficient evidence", "verifications"],
  ["Handle safety reports", "Urgent harm and payment requests first", "reports"],
] as const;

// Kit .chart-columns geometry: bars scale to the largest funnel stage, peaking at
// the kit's tallest column (84%). Static class strings so Tailwind emits them.
const BAR_HEIGHTS = ["h-px", "h-[8%]", "h-[17%]", "h-[25%]", "h-[34%]", "h-[42%]", "h-[50%]", "h-[59%]", "h-[67%]", "h-[76%]", "h-[84%]"] as const;
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
    { label: "Created", name: "Requests created", value: funnel.requestsCreated, demand: true },
    { label: "Claimed", name: "Requests claimed", value: funnel.requestsClaimed, demand: false },
    { label: "Decided", name: "Decisions recorded", value: funnel.decisionsRecorded, demand: false },
    { label: "Waiting", name: "Waiting for coverage", value: funnel.waitingForCoverage, demand: true },
  ];
  const max = Math.max(...columns.map(column => column.value));
  // Kit chart: no value labels on the bars; exact counts are in the accessible name and on Flow health.
  return <div className="chart-columns grid-cols-4!" role="list" aria-label="Referral funnel, all time">
    {columns.map(column => <div key={column.label} role="listitem" aria-label={`${column.name}: ${column.value}`} title={`${column.name}: ${column.value}`}><span className={`${barHeight(column.value, max)} ${column.demand ? "" : "border border-b-0 border-foreground bg-secondary!"}`} /><small aria-hidden="true">{column.label}</small></div>)}
  </div>;
}

export function OverviewView({ onView, verificationQueue, openReports, companyCoverage, health, healthLoading, healthFailed }: { onView: (view: AdminView) => void; verificationQueue: LiveMetric; openReports: LiveMetric; companyCoverage: LiveMetric; health: FlowHealth | undefined; healthLoading: boolean; healthFailed: boolean }) {
  const marketplaceUsers: LiveMetric = { value: null, loading: false, failed: false, detail: "No fabricated count" };
  return <>
    <AdminHeading eyebrow="MARKETPLACE CONTROL ROOM" title="Operate for trust, not vanity." body="Prioritize safety, healthy supply, and useful introductions. Never optimize for referral volume alone." />
    <section className="admin-kpi-grid" aria-label="Operations snapshot"><Kpi icon={ShieldCheck} label="Verification queue" metric={verificationQueue} /><Kpi icon={ShieldAlert} label="Open reports" metric={openReports} /><Kpi icon={Building2} label="Company coverage" metric={companyCoverage} /><Kpi icon={UsersRound} label="Marketplace users" metric={marketplaceUsers} /></section>
    <section className="admin-grid">
      <div className="admin-panel"><header><div><span className="eyebrow">OPERATIONS</span><h2>Priority queues</h2></div></header>{TASKS.map(([title, body, target]) => <Button key={title} variant="ghost" className="admin-task" onClick={() => onView(target)}><span><strong>{title}</strong><small>{body}</small></span><ArrowRight /></Button>)}</div>
      <div className="admin-panel monetization-panel"><span className="eyebrow">SUSTAINABLE, NOT PAY-TO-WIN</span><h2>Monetization guardrails</h2><div><CircleDollarSign /><span><strong>Employer subscriptions</strong><small>Hiring-team workflow and aggregate insights.</small></span></div><div><Eye /><span><strong>Promoted employer profiles</strong><small>Clearly labeled, never prioritized in referral matching.</small></span></div><div><CheckCircle2 /><span><strong>Referrers are never paid</strong><small>No commissions or paid queue position.</small></span></div></div>
    </section>
    {healthFailed ? null : <section className="sample-chart" aria-label="Live funnel">
      <header><div><span className="eyebrow">LIVE REFERRAL FUNNEL</span><h2>Healthy growth balances both sides.</h2></div><Link href="/admin/flow-health" className="text-link">Flow health <ArrowRight /></Link></header>
      {health ? <FunnelChart health={health} /> : <div className="h-[180px] animate-pulse rounded-[7px] bg-muted" aria-busy={healthLoading || undefined} />}
      <div className="chart-legend"><span><i />Seeker demand</span><span><i />Referrer response</span></div>
    </section>}
  </>;
}
