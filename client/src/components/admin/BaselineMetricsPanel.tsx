import type { FlowBaseline } from "@shared/flowBaseline";
import { Activity, AlertTriangle, BarChart3, Clock, CreditCard, ShieldCheck, UsersRound } from "lucide-react";

// D-018 baseline panel. Aggregate only: every value here is a count, a rate or a
// duration the server derived from timestamps. No names, ids, emails or request
// text exist in the payload, so none can leak into this view.

const HOUR = "h";

/**
 * A duration in hours, switching to days past three of them: precise where the
 * 7-day ask window makes hours the useful unit, readable where it does not. An
 * empty sample shows an em dash, never a zero.
 */
function hours(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value > 72 ? `${Math.round((value / 24) * 10) / 10} d` : `${value} ${HOUR}`;
}

const number = (value: number) => new Intl.NumberFormat("en-IN").format(value);

function Panel({ title, subtitle, children, icon: Icon }: { title: string; subtitle: string; children: React.ReactNode; icon: typeof Activity }) {
  return <section className="rounded-2xl border border-[#e5e5e5] bg-white p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-semibold tracking-[-.035em]">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#505050]">{subtitle}</p></div><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f5f5f5] text-black"><Icon className="h-5 w-5" /></span></div>{children}</section>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-[#e5e5e5] bg-white p-4"><p className="text-3xl font-semibold tracking-[-.04em] text-black">{value}</p><p className="mt-1 text-sm font-bold text-black">{label}</p><p className="mt-1 text-xs leading-5 text-[#505050]">{detail}</p></div>;
}

function Table({ head, rows }: { head: string[]; rows: Array<Array<string | number>> }) {
  return <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="border-b border-[#e5e5e5] text-xs font-bold uppercase tracking-[.12em] text-[#505050]"><tr>{head.map(label => <th key={label} className="pb-3 pr-4">{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-b border-[#e5e5e5] last:border-0">{row.map((cell, cellIndex) => <td key={cellIndex} className={cellIndex === 0 ? "py-3 pr-4 font-semibold text-black" : "py-3 pr-4 text-black"}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

export function BaselineMetricsPanel({ baseline }: { baseline: FlowBaseline | null }) {
  if (!baseline) {
    return <Panel icon={BarChart3} title="Baseline" subtitle="Four-week aggregates, measured from real rows only."><p className="mt-6 rounded-xl border border-dashed border-[#cfcfcf] bg-white p-6 text-sm leading-6 text-[#505050]">The baseline is unavailable in this session. Nothing is estimated or filled in — reload to try again.</p></Panel>;
  }

  const asks = baseline.weeks.reduce((total, week) => total + week.asks, 0);
  const coverage = baseline.coverage;
  const corridorReady = coverage.filter(row => row.availableReferrers >= 3).length;

  return <div className="mt-8 grid gap-5">
    <Panel icon={BarChart3} title="Baseline" subtitle={`The last ${baseline.windowDays} days by UTC week, generated ${baseline.generatedAt.slice(0, 16).replace("T", " ")} UTC. Counts only: this view has no person, address or request text in it.`}>        {asks === 0 ? <p className="mt-6 rounded-xl border border-dashed border-[#cfcfcf] bg-white p-6 text-sm leading-6 text-[#505050]">No asks were recorded in this window yet. A baseline starts on the first real ask — nothing here is backfilled or assumed.</p> : <><Table
        head={["Week of", "Asks", "Accepted", "Passed", "Expired", "Declined", "Withdrawn", "Waiting", "No coverage"]}
        rows={[...baseline.weeks].reverse().map(week => [week.weekStart, number(week.asks), number(week.accepted), number(week.passed), number(week.expired), number(week.declined), number(week.withdrawn), number(week.waiting), number(week.uncovered)])}
      /><p className="mt-3 text-xs leading-5 text-[#505050]">Outcome is the ask's state now, grouped by the week it was created. “Waiting” means no referrer has decided it yet; a passed ask still counts in waiting demand below, because it is open to that company again. “No coverage” counts asks at a company with no verified referrer today.</p></>}
    </Panel>

    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Expiries, last 7 days" value={number(baseline.expiries.last7Days)} detail={`${number(baseline.expiries.total)} unclaimed asks expired in the window.`} />
      <Metric label="Median time to first decision" value={hours(baseline.decisionLatency.medianHours)} detail={baseline.decisionLatency.sampleSize === 0 ? "No referrer decision in the window yet." : `${number(baseline.decisionLatency.sampleSize)} asks with an accept or pass.`} />
      <Metric label="90th percentile decision" value={hours(baseline.decisionLatency.p90Hours)} detail="The slow tail a seeker actually feels." />
      <Metric label="External referrers active, 7 days" value={number(baseline.externalReferrers.activeLast7Days)} detail={`${number(baseline.externalReferrers.activeInWindow)} in the whole window. Operator domains excluded.`} />
    </section>

    <section className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
      <Panel icon={UsersRound} title="Verified coverage by company" subtitle="Verified referrers, how many of them can take an ask now (unpaused, below capacity), and how much demand is waiting.">
        {coverage.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-[#cfcfcf] bg-white p-6 text-sm leading-6 text-[#505050]">No company has a verified referrer yet. That is the supply gap, not a measurement error.</p> : <><Table
          head={["Company", "Verified", "Available now", "Paused or full", "Waiting asks"]}
          rows={coverage.map(row => [row.companyDomain, number(row.verifiedReferrers), number(row.availableReferrers), number(row.pausedOrFull), number(row.waitingAsks)])}
        /><p className="mt-3 text-xs leading-5 text-[#505050]">Companies at or above 3 available referrers: {number(corridorReady)}. The D-037 supply bar for turning passes on is 3 such companies. This panel measures it; whether checkout is open is decided in the pricing path.</p></>}
      </Panel>
      <div className="grid gap-5">
        <Panel icon={CreditCard} title="Paying subscribers" subtitle="Wallets on a paid plan, and Free wallets inside the one-time reverse trial.">
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Metric label="Paid plans" value={number(baseline.subscribers.paid)} detail="Any plan other than Free." />
            <Metric label="In reverse trial" value={number(baseline.subscribers.trialing)} detail="Free wallet inside its 14-day window." />
          </div>
          {baseline.subscribers.byPlan.length ? <div className="mt-4 flex flex-wrap gap-2">{baseline.subscribers.byPlan.map(row => <span key={row.plan} className="rounded-full border border-[#e5e5e5] bg-[#f5f5f5] px-3 py-1.5 text-xs font-bold text-black">{row.plan.replace(/_/g, " ")} · {number(row.count)}</span>)}</div> : <p className="mt-4 text-xs leading-5 text-[#505050]">No paid plan is active yet.</p>}
        </Panel>
        <Panel icon={ShieldCheck} title="External referrer rule" subtitle="Operator activity never counts as marketplace supply, so these domains are excluded.">
          <div className="mt-4 flex flex-wrap gap-2">{baseline.externalReferrers.excludedOperatorDomains.map(domain => <span key={domain} className="rounded-full border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs font-bold text-[#505050]">{domain}</span>)}</div>
        </Panel>
      </div>
    </section>

    <section className="grid gap-5 lg:grid-cols-2">
      <Panel icon={Clock} title="Waiting demand by company" subtitle="Where seekers are waiting and for how long — choose a corridor from this, never from a guess.">
        {baseline.demand.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-[#cfcfcf] bg-white p-6 text-sm leading-6 text-[#505050]">Nothing is waiting for coverage right now.</p> : <Table
          head={["Company", "Waiting asks", "Oldest waiting", "Verified referrers"]}
          rows={baseline.demand.map(row => [row.companyDomain, number(row.waitingAsks), `${row.oldestWaitingDays} d`, number(row.verifiedReferrers)])}
        />}
      </Panel>
      <Panel icon={AlertTriangle} title="Data quality" subtitle="Rows that are impossible or degraded in the data itself. Empty means every check passed.">
        {baseline.dataQuality.length === 0 ? <p className="mt-6 rounded-xl border border-dashed border-[#cfcfcf] bg-white p-6 text-sm leading-6 text-[#505050]">Every data-quality check passed in this window.</p> : <ul className="mt-6 grid gap-3">{baseline.dataQuality.map(row => <li key={row.id} className="rounded-xl border border-[#b45309]/30 bg-[#b45309]/10 p-4"><div className="flex items-baseline justify-between gap-3"><p className="text-sm font-bold text-black">{row.label}</p><p className="text-2xl font-semibold tracking-[-.03em] text-[#B45309]">{number(row.count)}</p></div><p className="mt-1 text-xs leading-5 text-[#505050]">{row.hint}</p></li>)}</ul>}
      </Panel>
    </section>
  </div>;
}
