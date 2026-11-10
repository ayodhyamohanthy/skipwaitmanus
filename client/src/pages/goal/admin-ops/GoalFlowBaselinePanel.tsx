// The D-018 baseline panel in goal UI (D-048-p3-admin-ops). Same payload, same
// panels, same wording as components/admin/BaselineMetricsPanel.tsx - that
// module stays untouched and the goal page re-renders it with tokens, because
// a goal page may only import goal code (client/src/test/goalPagesBoundary).
// Aggregate only: every value is a count, a rate or a duration the server
// derived from timestamps, so nothing personal can leak into this view.
import { BarChart3, CreditCard, UsersRound } from "lucide-react";
import type { FlowBaseline } from "@shared/flowBaseline";
import { REVERSE_TRIAL, REVERSE_TRIAL_ON_OFFER } from "@shared/planCatalog";
import { GoalNum } from "@/components/goal/GoalNum";
import { OpsMetric, OpsNote, OpsPanel, OpsTable, hours, number } from "./goalOpsParts";

export function GoalFlowBaselinePanel({ baseline }: { baseline: FlowBaseline | null }) {
  if (!baseline) {
    return (
      <OpsPanel icon={BarChart3} title="Baseline" subtitle="Four-week aggregates, measured from real rows only.">
        <OpsNote>The baseline is unavailable in this session. Nothing is estimated or filled in — reload to try again.</OpsNote>
      </OpsPanel>
    );
  }

  const asks = baseline.weeks.reduce((total, week) => total + week.asks, 0);
  const corridorReady = baseline.coverage.filter(row => row.availableReferrers >= 3).length;
  // D-051: the reverse trial shows only while it is on offer, or when a wallet is inside one anyway.
  const showTrial = REVERSE_TRIAL_ON_OFFER || baseline.subscribers.trialing > 0;

  return (
    <div className="mt-5 grid gap-5">
      <OpsPanel icon={BarChart3} title="Baseline" subtitle={`The last ${baseline.windowDays} days by UTC week, generated ${baseline.generatedAt.slice(0, 16).replace("T", " ")} UTC. Counts only: this view has no person, address or request text in it.`}>
        {asks === 0 ? (
          <OpsNote>No asks were recorded in this window yet. A baseline starts on the first real ask — nothing here is backfilled or assumed.</OpsNote>
        ) : (
          <>
            <OpsTable
              head={["Week of", "Asks", "Accepted", "Passed", "Expired", "Declined", "Withdrawn", "Waiting", "No coverage", "Referred ≤7d"]}
              rows={[...baseline.weeks].reverse().map(week => [week.weekStart, number(week.asks), number(week.accepted), number(week.passed), number(week.expired), number(week.declined), number(week.withdrawn), number(week.waiting), number(week.uncovered), number(week.referredWithin7Days ?? 0)])}
            />
            <p className="mt-2 text-g-meta text-g-ink-2">Outcome is the ask&rsquo;s state now, grouped by the week it was created. &ldquo;Waiting&rdquo; means no referrer has decided it yet; a passed ask still counts in waiting demand below, because it is open to that company again. &ldquo;No coverage&rdquo; counts asks at a company with no verified referrer today.</p>
          </>
        )}
      </OpsPanel>

      <div className="grid gap-4 gdesk:grid-cols-5">
        <OpsMetric label="Expiries, last 7 days" value={number(baseline.expiries.last7Days)} detail={`${number(baseline.expiries.total)} unclaimed asks expired in the window.`} />
        <OpsMetric label="Median time to first decision" value={hours(baseline.decisionLatency.medianHours)} detail={baseline.decisionLatency.sampleSize === 0 ? "No referrer decision in the window yet." : `${number(baseline.decisionLatency.sampleSize)} asks with an accept or pass.`} />
        <OpsMetric label="90th percentile decision" value={hours(baseline.decisionLatency.p90Hours)} detail="The slow tail a seeker actually feels." />
        <OpsMetric label="External referrers active, 7 days" value={number(baseline.externalReferrers.activeLast7Days)} detail={`${number(baseline.externalReferrers.activeInWindow)} in the whole window. Operator domains excluded.`} />
        <OpsMetric label="Referred within 7 days" value={baseline.referredWithin7DaysPct === undefined ? "—" : `${number(baseline.referredWithin7DaysPct)}%`} detail="Share of asks first marked Referred within 7 days of first visibility (D-038-B north star)." />
      </div>

      <div className="grid gap-5 gdesk:grid-cols-[1.25fr_.75fr]">
        <OpsPanel icon={UsersRound} title="Verified coverage by company" subtitle="Verified referrers, how many of them can take an ask now (unpaused, below capacity), and how much demand is waiting.">
          {baseline.coverage.length === 0 ? (
            <OpsNote>No company has a verified referrer yet. That is the supply gap, not a measurement error.</OpsNote>
          ) : (
            <>
              <OpsTable head={["Company", "Verified", "Available now", "Paused or full", "Waiting asks"]} rows={baseline.coverage.map(row => [row.companyDomain, number(row.verifiedReferrers), number(row.availableReferrers), number(row.pausedOrFull), number(row.waitingAsks)])} />
              <p className="mt-2 text-g-meta text-g-ink-2">Companies at or above 3 available referrers: {number(corridorReady)}. The D-037 supply bar for turning passes on is 3 such companies. This panel measures it; whether checkout is open is decided in the pricing path.</p>
            </>
          )}
        </OpsPanel>
        <div className="grid gap-5">
          <OpsPanel icon={CreditCard} title="Paying subscribers" subtitle={showTrial ? "Wallets on a paid plan, and Free wallets inside the one-time reverse trial." : "Wallets on a paid plan."}>
            <div className="mt-4 grid gap-3 gdesk:grid-cols-2">
              <OpsMetric label="Paid plans" value={number(baseline.subscribers.paid)} detail="Any plan other than Free." />
              {showTrial ? <OpsMetric label="In reverse trial" value={number(baseline.subscribers.trialing)} detail={REVERSE_TRIAL_ON_OFFER ? `Free wallet inside its ${REVERSE_TRIAL.days}-day window.` : "Free wallet inside a trial window while the trial is not on offer (D-051): check how it started."} /> : null}
            </div>
            {baseline.subscribers.byPlan.length ? (
              <ul className="mt-4 flex flex-wrap gap-2">
                {baseline.subscribers.byPlan.map(row => <li key={row.plan} className="border border-g-hairline px-2.5 py-1"><span className="text-g-meta text-g-ink-2">{row.plan.replace(/_/g, " ")}</span> <GoalNum>{number(row.count)}</GoalNum></li>)}
              </ul>
            ) : <p className="mt-4 text-g-meta text-g-ink-2">No paid plan is active yet.</p>}
          </OpsPanel>
          <OpsPanel title="External referrer rule" subtitle="Operator activity never counts as marketplace supply, so these domains are excluded.">
            <ul className="mt-4 flex flex-wrap gap-2">
              {baseline.externalReferrers.excludedOperatorDomains.map(domain => <li key={domain} className="border border-g-hairline px-2.5 py-1 text-g-meta text-g-ink-2">{domain}</li>)}
            </ul>
          </OpsPanel>
        </div>
      </div>

      <div className="grid gap-5 gdesk:grid-cols-2">
        <OpsPanel title="Waiting demand by company" subtitle="Where seekers are waiting and for how long — choose a corridor from this, never from a guess.">
          {baseline.demand.length === 0 ? <OpsNote>Nothing is waiting for coverage right now.</OpsNote> : <OpsTable head={["Company", "Waiting asks", "Oldest waiting", "Verified referrers"]} rows={baseline.demand.map(row => [row.companyDomain, number(row.waitingAsks), `${row.oldestWaitingDays} d`, number(row.verifiedReferrers)])} />}
        </OpsPanel>
        <OpsPanel title="Data quality" subtitle="Rows that are impossible or degraded in the data itself. Empty means every check passed.">
          {baseline.dataQuality.length === 0 ? (
            <OpsNote>Every data-quality check passed in this window.</OpsNote>
          ) : (
            <ul className="mt-4 grid gap-3">
              {baseline.dataQuality.map(row => (
                <li key={row.id} className="border border-g-hairline p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-g-label text-g-ink">{row.label}</p>
                    <GoalNum tone="warn">{number(row.count)}</GoalNum>
                  </div>
                  <p className="mt-1 text-g-meta text-g-ink-2">{row.hint}</p>
                </li>
              ))}
            </ul>
          )}
        </OpsPanel>
      </div>
    </div>
  );
}
