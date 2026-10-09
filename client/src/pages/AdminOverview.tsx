import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Button, buttonVariants } from "@/components/kit/button";
import { AdminShell, type AdminView } from "@/components/admin/AdminShell";
import { type LiveMetric, OverviewView } from "@/components/admin/AdminOverviewView";
import { CompaniesView, ReportsView, UsersView, VerificationsView } from "@/components/admin/AdminSectionViews";
import { AdminAccessError, adminKeys, adminRequest, adminRetry, flowHealthSchema, loadEnrollments, OPEN_ENROLLMENT_STATUSES, safetyReportsSchema, TERMINAL_CASE_STATUSES } from "@/components/admin/adminApi";
import { usePersistFn } from "@/hooks/usePersistFn";

export default function AdminOverview() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [view, setView] = useState<AdminView>("overview");
  const health = useQuery({ queryKey: adminKeys.flowHealth, enabled: isSignedIn, retry: adminRetry, queryFn: async () => (await adminRequest("/api/admin/flow-health", flowHealthSchema, fetchToken, "We could not load operations")).health });
  const enrollments = useQuery({ queryKey: adminKeys.enrollments, enabled: isSignedIn, retry: adminRetry, queryFn: () => loadEnrollments(fetchToken) });
  const reports = useQuery({ queryKey: adminKeys.reports, enabled: isSignedIn, retry: adminRetry, queryFn: async () => (await adminRequest("/api/admin/safety-reports", safetyReportsSchema, fetchToken, "We could not load safety reports")).reports });

  if (!isSignedIn) return <main data-skipwait-screen="admin-sign-in" className="admin-shell grid place-items-center px-4 py-10"><section className="admin-empty w-full max-w-xl"><span><ShieldCheck /></span><h1 className="mb-2 mt-4 text-[22px] font-semibold">Operations console</h1><p>Sign in with the designated administrator account to operate for trust, not vanity.</p><SignInButton className={buttonVariants({ className: "mt-5" })}>Secure sign in</SignInButton></section></main>;

  const queries = [health, enrollments, reports];
  const denied = queries.some(query => query.error instanceof AdminAccessError);
  const failure = health.error ?? enrollments.error ?? reports.error;
  const openEnrollments = enrollments.data?.filter(item => OPEN_ENROLLMENT_STATUSES.has(item.status)) ?? null;
  const openReports = reports.data?.filter(item => !TERMINAL_CASE_STATUSES.has(item.status)) ?? null;
  const urgent = openReports?.filter(item => item.urgent).length ?? 0;
  const verificationQueue: LiveMetric = { value: openEnrollments?.length ?? null, loading: enrollments.isLoading, failed: Boolean(enrollments.error), detail: "Referrer enrollments awaiting review" };
  const reportsMetric: LiveMetric = { value: openReports?.length ?? null, loading: reports.isLoading, failed: Boolean(reports.error), detail: urgent ? `${urgent} urgent` : "None urgent" };
  const retry = () => { for (const query of queries) if (query.error) void query.refetch(); };

  return <AdminShell view={view} onView={setView}><main data-skipwait-screen="admin-overview" className="admin-content">
    {denied ? <section className="admin-empty" role="alert"><span><ShieldCheck /></span><h2>Administrator access is required.</h2><p>Sign in with the designated administrator account. Operations data is never shown to other accounts.</p></section> : <>
      {failure ? <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[7px] border border-destructive bg-background p-4 text-sm"><span className="text-destructive">{failure.message}</span><Button variant="outline" size="sm" onClick={retry}>Try again</Button></div> : null}
      {view === "overview" && <OverviewView onView={setView} verificationQueue={verificationQueue} openReports={reportsMetric} health={health.data} healthLoading={health.isLoading} healthFailed={Boolean(health.error)} />}
      {view === "companies" && <CompaniesView />}
      {view === "verifications" && <VerificationsView queue={verificationQueue} />}
      {view === "reports" && <ReportsView reports={reportsMetric} />}
      {view === "users" && <UsersView />}
    </>}
  </main></AdminShell>;
}
