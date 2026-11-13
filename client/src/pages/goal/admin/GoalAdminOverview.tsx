// Goal /admin (D-048-p3-admin): "See what needs a decision." with the oldest
// open case as the one next step. Same reads as the kit overview through the
// read-only admin API module; status is dot + text with tokens.
import { useQuery } from "@tanstack/react-query";
import { SignInButton, useAuth } from "@/_core/auth";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalErrorState, GoalSkeletonRows } from "@/components/goal/GoalStates";
import { GoalStatus } from "@/components/goal/GoalStatus";
import { ADMIN_ACCESS_MESSAGE, AdminAccessError, adminKeys, adminRequest, adminRetry, companySuggestionsSchema, flowHealthSchema, loadEnrollments, OPEN_ENROLLMENT_STATUSES, safetyReportsSchema, TERMINAL_CASE_STATUSES } from "@/components/admin/adminApi";
import { caseAge, companyCase, enrollmentCase, reportCase, type ReviewCase } from "@/components/admin/reviewCases";
import { usePersistFn } from "@/hooks/usePersistFn";
import { UnlistedDemandView } from "@/components/admin/UnlistedDemandView";
import { AdminGoalFrame, AdminGoalHeading } from "./AdminGoalFrame";
import { adminTabFor, plural } from "./adminGoalCopy";

export const GOAL_PAGE = { goalLine: "See what needs a decision." } as const;
const BODY = "Reports, referrer enrollments and company suggestions that are still open, oldest first.";

/** The oldest case that still needs a decision, or null. */
export function oldestOpenCase(cases: ReviewCase[]): ReviewCase | null {
  return cases.filter(item => !item.terminal).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0] ?? null;
}

function CountLine({ label, count, detail }: { label: string; count: number; detail: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-g-hairline py-3 last:border-b-0">
      <span className="text-g-label text-g-ink">{label}</span>
      <GoalStatus status={count > 0 ? "waiting" : "withdrawn"} label={detail} />
    </li>
  );
}

export default function GoalAdminOverview() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const health = useQuery({ queryKey: adminKeys.flowHealth, enabled: Boolean(isSignedIn), retry: adminRetry, queryFn: async () => (await adminRequest("/api/admin/flow-health", flowHealthSchema, fetchToken, "We could not load operations")).health });
  const enrollments = useQuery({ queryKey: adminKeys.enrollments, enabled: Boolean(isSignedIn), retry: adminRetry, queryFn: () => loadEnrollments(fetchToken) });
  const reports = useQuery({ queryKey: adminKeys.reports, enabled: Boolean(isSignedIn), retry: adminRetry, queryFn: async () => (await adminRequest("/api/admin/safety-reports", safetyReportsSchema, fetchToken, "We could not load safety reports")).reports });
  const suggestions = useQuery({ queryKey: adminKeys.suggestions, enabled: Boolean(isSignedIn), retry: adminRetry, queryFn: async () => (await adminRequest("/api/admin/company-suggestions", companySuggestionsSchema, fetchToken, "We could not load company suggestions")).suggestions });

  if (!isSignedIn) {
    return (
      <AdminGoalFrame screen="admin-sign-in">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="Sign in with the designated administrator account. Operations data is never shown to other accounts." />
        <GoalNextStep>
          <SignInButton>
            <GoalButton variant="primary" className="mt-3">Sign in</GoalButton>
          </SignInButton>
        </GoalNextStep>
      </AdminGoalFrame>
    );
  }

  const queries = [health, enrollments, reports, suggestions];
  const denied = queries.some(query => query.error instanceof AdminAccessError);
  if (denied) {
    return (
      <AdminGoalFrame screen="admin-forbidden" current="/admin">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="Operations data is never shown to other accounts." />
        <section role="alert" className="border border-g-hairline bg-g-surface p-5">
          <p className="text-g-label text-g-ink">{ADMIN_ACCESS_MESSAGE}</p>
          <p className="mt-1 text-g-meta text-g-ink-2">Sign in with the designated administrator account.</p>
        </section>
      </AdminGoalFrame>
    );
  }

  const loading = queries.some(query => query.isLoading);
  const failed = queries.filter(query => query.error);
  const retry = () => { for (const query of failed) void query.refetch(); };

  const openEnrollments = (enrollments.data ?? []).filter(item => OPEN_ENROLLMENT_STATUSES.has(item.status));
  const openReports = (reports.data ?? []).filter(item => !TERMINAL_CASE_STATUSES.has(item.status));
  const urgent = openReports.filter(item => item.urgent).length;
  const openSuggestions = (suggestions.data ?? []).filter(item => !TERMINAL_CASE_STATUSES.has(item.status));
  const oldest = oldestOpenCase([...(reports.data ?? []).map(reportCase), ...(enrollments.data ?? []).map(enrollmentCase), ...(suggestions.data ?? []).map(companyCase)]);
  const funnel = health.data?.funnel;

  return (
    <AdminGoalFrame screen="admin-overview" current="/admin">
      <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body={BODY} />
      {loading ? <GoalSkeletonRows density="queue" count={3} className="px-0" /> : null}
      {!loading && failed.length ? (
        <GoalErrorState className="mb-6 border border-g-hairline px-5" title={failed.map(query => query.error?.message).filter(Boolean).join(" ")} body="Nothing is shown as clear while a list failed to load." retry={{ label: "Try again", onClick: retry }} />
      ) : null}
      {!loading && !failed.length ? (
        <div className="grid items-start gap-6 gdesk:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <GoalNextStep reason={oldest ? `Oldest open case: ${oldest.title} · ${oldest.ref} · opened ${caseAge(oldest.createdAt)} ago` : "Nothing needs a decision right now."}>
            <GoalButton variant="primary" asChild className="mt-3">
              {oldest ? <a href={`/admin-review?tab=${adminTabFor(oldest.kind)}`}>Open the oldest case</a> : <a href="/admin-review">Open the review queue</a>}
            </GoalButton>
          </GoalNextStep>
          <section aria-labelledby="admin-waiting" className="border border-g-hairline bg-g-surface px-4 gdesk:px-5">
            <h2 id="admin-waiting" className="pt-4 text-g-label text-g-ink-2">Waiting for a decision</h2>
            <ul>
              <CountLine label="Referrer enrollments" count={openEnrollments.length} detail={`${plural(openEnrollments.length, "enrollment", "enrollments")} waiting`} />
              <CountLine label="Safety reports" count={openReports.length} detail={`${plural(openReports.length, "open report", "open reports")} · ${urgent ? `${urgent} urgent` : "none urgent"}`} />
              <CountLine label="Company suggestions" count={openSuggestions.length} detail={`${plural(openSuggestions.length, "company suggestion", "company suggestions")} waiting`} />
            </ul>
            {funnel ? <p className="border-t border-g-hairline py-3 text-g-meta text-g-ink-3">{`${funnel.requestsCreated} requests created · ${funnel.requestsClaimed} claimed · ${funnel.decisionsRecorded} decisions recorded · ${funnel.waitingForCoverage} waiting for coverage`}</p> : null}
          </section>
        </div>
      ) : null}
      <UnlistedDemandView />
    </AdminGoalFrame>
  );
}
