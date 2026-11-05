// Goal /admin/flow-health (D-048-p3-admin-ops): "See where the referral flow
// needs work." The surface is read-mostly (D-048-admin.md §3), so the one next
// step is the re-check that runs the same two GETs the kit page makes; every
// section, figure and wording below stays as AdminFlowHealth.tsx shows it
// (guardrail 1). Fixtures in the tests are synthetic.
import { useQuery } from "@tanstack/react-query";
import { BarChart3, UsersRound } from "lucide-react";
import { useAuth } from "@/_core/auth";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalErrorState, GoalSkeletonRows } from "@/components/goal/GoalStates";
import { GoalStatus } from "@/components/goal/GoalStatus";
import { usePersistFn } from "@/hooks/usePersistFn";
import { loadFlowHealth } from "./adminOpsApi";
import { OpsMetric, OpsNote, OpsPanel, OpsTable, formatRevenueTotal } from "./goalOpsParts";
import { GoalFlowBaselinePanel } from "./GoalFlowBaselinePanel";
import { AdminGoalFrame, AdminGoalHeading } from "../admin/AdminGoalFrame";

export const GOAL_PAGE = { goalLine: "See where the referral flow needs work." } as const;
const BODY = "Requests, claims, decisions and company corridors without verified coverage. No candidate documents, request text, OTPs, or employee identities appear here.";

export default function GoalAdminFlowHealth() {
  const { isSignedIn, getToken, openSignIn } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const report = useQuery({ queryKey: ["admin-flow-health"], enabled: Boolean(isSignedIn), retry: false, queryFn: () => loadFlowHealth(fetchToken) });

  if (!isSignedIn) {
    return (
      <AdminGoalFrame screen="admin-flow-health-sign-in">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="Sign in with the designated administrator account to view aggregate referral performance and privacy-safe coverage gaps." />
        <GoalNextStep>
          {/* SignInButton renders its own <button>; wrapping GoalButton in it nests buttons. */}
          <GoalButton variant="primary" className="mt-3" onClick={() => openSignIn()}>Sign in</GoalButton>
        </GoalNextStep>
      </AdminGoalFrame>
    );
  }

  const health = report.data?.health;
  const revenue = report.data?.revenue;
  const recheck = () => void report.refetch();

  return (
    <AdminGoalFrame screen="admin-flow-health">
      <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body={BODY} />

      <GoalNextStep reason="Nothing here changes a request or a payment. Re-check pulls the same aggregates again, so the picture is current before you act on it.">
        <GoalButton variant="primary" className="mt-3" busy={report.isFetching} busyLabel="Re-checking…" onClick={recheck}>Re-check the flow</GoalButton>
      </GoalNextStep>

      {report.error ? (
        <GoalErrorState className="mt-6" title={report.error.message} body="No figures are shown as zero while the flow health failed to load." retry={{ label: "Try again", onClick: recheck }} />
      ) : report.isPending ? (
        <div className="mt-6 border border-g-hairline bg-g-surface py-4"><GoalSkeletonRows density="company" count={5} /></div>
      ) : health && revenue ? (
        <>
          <section aria-label="Referral funnel" className="mt-6 grid gap-4 gdesk:grid-cols-4">
            <OpsMetric label="Requests created" value={String(health.funnel.requestsCreated)} detail="Private Job Seeker requests routed." />
            <OpsMetric label="Requests claimed" value={String(health.funnel.requestsClaimed)} detail="A verified employee chose to review." />
            <OpsMetric label="Decisions recorded" value={String(health.funnel.decisionsRecorded)} detail="Approved or declined, factually recorded." />
            <OpsMetric label="Waiting for coverage" value={String(health.funnel.waitingForCoverage)} detail="Pending requests with no employee claim." />
          </section>
          <p className="mt-3">
            {health.funnel.waitingForCoverage > 0
              ? <GoalStatus status="waiting" label={`${health.funnel.waitingForCoverage} waiting for coverage`} />
              : <GoalStatus status="accepted" label="No request waiting for coverage" />}
          </p>

          <GoalFlowBaselinePanel baseline={report.data?.baseline ?? null} />

          <OpsPanel className="mt-5" icon={BarChart3} title="Credit-pack payments" subtitle="Minor-unit totals from the payment ledger, settled in the currency each checkout was billed in.">
            {revenue.totalsByCurrency.length ? (
              <div className="mt-4 grid gap-4 gdesk:grid-cols-3">
                {revenue.totalsByCurrency.map(total => <OpsMetric key={total.currency} label={`${total.currency} settled`} value={formatRevenueTotal(total.totalAmount, total.currency)} detail={`${total.count} payment${total.count === 1 ? "" : "s"}`} />)}
              </div>
            ) : <OpsNote>No revenue recorded yet</OpsNote>}
            {revenue.byProvider.length ? (
              <OpsTable
                className="mt-6"
                head={["Provider", "Currency", "Settled", "Payments"]}
                rows={revenue.byProvider.map(row => [row.provider, row.currency, formatRevenueTotal(row.totalAmount, row.currency), row.count])}
              />
            ) : null}
            {revenue.refundedTotalByCurrency.length ? (
              <ul className="mt-4 grid gap-1">
                {revenue.refundedTotalByCurrency.map(row => (
                  <li key={row.currency}><GoalStatus status="expired" label={`Refunded ${formatRevenueTotal(row.totalAmount, row.currency)} · ${row.count} payment${row.count === 1 ? "" : "s"}`} /></li>
                ))}
              </ul>
            ) : null}
          </OpsPanel>

          <div className="mt-5 grid gap-5 gdesk:grid-cols-[1.2fr_.8fr]">
            <OpsPanel icon={UsersRound} title="Company coverage gaps" subtitle="Use this to improve liquidity with a careful, company-specific invitation—not a broadcast or contact scrape.">
              {health.coverageGaps.length ? (
                <OpsTable head={["Company corridor", "Private requests waiting", "Verified coverage"]} rows={health.coverageGaps.map(gap => [gap.companyDomain, gap.waitingRequests, gap.verifiedCoverage])} />
              ) : (
                <OpsNote>No uncovered pending company corridors are currently recorded. This does not reveal individual employee availability.</OpsNote>
              )}
            </OpsPanel>
            <OpsPanel title="Instrumentation health" subtitle="Signal quality behind the numbers above.">
              <div className="mt-4 grid gap-3">
                <OpsMetric label="Secure document uploads recorded" value={String(health.instrumentation.uploadedDocuments)} />
                <OpsMetric label="Recent denied or failed metadata events" value={String(health.instrumentation.recordedFailures)} />
              </div>
              <GoalButton asChild variant="outline" className="mt-4 w-full">
                <a href="/admin/activity">Inspect activity metadata</a>
              </GoalButton>
            </OpsPanel>
          </div>

          <p className="mt-4 text-g-meta text-g-ink-3">Privacy boundary: metrics are aggregated. Company gaps show only the need for coverage—not the people behind a request.</p>
        </>
      ) : null}
    </AdminGoalFrame>
  );
}
