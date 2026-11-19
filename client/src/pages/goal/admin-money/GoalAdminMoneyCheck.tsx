import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/_core/auth";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalErrorState, GoalSkeletonRows } from "@/components/goal/GoalStates";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalNum } from "@/components/goal/GoalNum";
import { GoalStatus } from "@/components/goal/GoalStatus";
import { adminSignInHref } from "@/components/admin/AdminSignInCta";
import { moneyCheckAlertStatusSchema, moneyCheckRunSchema, responseError, testAlertResponseSchema, type MoneyCheckAlertStatus, type MoneyCheckRun } from "./adminMoneyCheckContracts";
import { AdminMoneyGoalFrame, AdminMoneyHeading } from "./AdminMoneyGoalFrame";
import { GoalAbandonedCheckoutPanel } from "./GoalAbandonedCheckoutPanel";

export const GOAL_PAGE = { goalLine: "Keep the money truthful." } as const;
const STATUS_PATH = "/api/admin/money-check/status";
const RUN_PATH = "/api/admin/money-check/run";

class AdminMoneyCheckAccessError extends Error {}

function time(value: string | null): string {
  return value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "Not recorded";
}

export default function GoalAdminMoneyCheck() {
  const { isSignedIn } = useAuth();
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const statusQuery = useQuery({
    queryKey: ["admin-money-check-alert-status"],
    enabled: Boolean(isSignedIn),
    retry: false,
    queryFn: async (): Promise<MoneyCheckAlertStatus> => {
      const response = await fetch(STATUS_PATH, { credentials: "include" });
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) throw new AdminMoneyCheckAccessError("Administrator access is required");
      if (!response.ok) throw new Error(responseError(payload, "We could not load the owner-alert status."));
      const parsed = moneyCheckAlertStatusSchema.safeParse(payload);
      if (!parsed.success) throw new Error("The owner-alert status could not be read. It is not shown as clear.");
      return parsed.data;
    },
  });
  const status = statusQuery.data ?? null;
  const [run, setRun] = useState<MoneyCheckRun | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testingAlert, setTestingAlert] = useState(false);

  const runCheck = async () => {
    if (runLoading) return;
    setRunLoading(true);
    setRunError("");
    setRun(null);
    try {
      const response = await fetch(RUN_PATH, { method: "POST", credentials: "include" });
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        setNeedsSignIn(true);
        return;
      }
      if (!response.ok) {
        setRunError(response.status === 429 ? "The check just ran. Wait 5 minutes before running it again." : responseError(payload, "The money check could not run."));
        return;
      }
      const parsed = moneyCheckRunSchema.safeParse(payload);
      if (!parsed.success) {
        setRunError("The run result could not be read. Its outcome is unconfirmed; check the owner-alert status before another run.");
        return;
      }
      setRun(parsed.data);
      void statusQuery.refetch();
    } catch {
      setRunError("The run result could not be confirmed. Check the owner-alert status before another run.");
    } finally {
      setRunLoading(false);
    }
  };

  const sendTestAlert = async () => {
    if (testingAlert) return;
    setTestingAlert(true);
    setTestMessage("");
    try {
      const response = await fetch("/api/admin/alerts/test", { method: "POST", credentials: "include" });
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        setNeedsSignIn(true);
        return;
      }
      if (!response.ok) {
        setTestMessage(response.status === 429 ? "A test alert was sent recently. Wait 5 minutes before another." : responseError(payload, "The test alert could not be sent."));
        return;
      }
      const parsed = testAlertResponseSchema.safeParse(payload);
      setTestMessage(!parsed.success ? "The test alert result could not be read. Check the owner inbox before sending another." : parsed.data.sent ? "Test alert sent. Check the owner inbox." : "The mail service did not confirm the test alert.");
    } catch {
      setTestMessage("The test alert result is unconfirmed. Check the owner inbox before sending another.");
    } finally {
      setTestingAlert(false);
    }
  };

  if (!isSignedIn || needsSignIn || statusQuery.error instanceof AdminMoneyCheckAccessError) {
    return (
      <AdminMoneyGoalFrame screen="admin-money-check-sign-in" current="/admin/money-check">
        <AdminMoneyHeading current="/admin/money-check" />
        <GoalNextStep reason="Sign in with the designated administrator account before reading or running the money check.">
          <GoalButton variant="primary" className="mt-3" asChild><a href={adminSignInHref("/admin/money-check")}>Sign in as administrator</a></GoalButton>
        </GoalNextStep>
      </AdminMoneyGoalFrame>
    );
  }

  return (
    <AdminMoneyGoalFrame screen="admin-money-check" current="/admin/money-check">
      <AdminMoneyHeading current="/admin/money-check" />
      <GoalNextStep reason="This check reads wallet, payment, parked-payment and refund records. If it finds an issue, it sends the usual owner alert. It can run once every 5 minutes.">
        <GoalButton variant="primary" className="mt-3" busy={runLoading} busyLabel="Running the check…" onClick={() => { void runCheck(); }}>Run money check now</GoalButton>
        <GoalButton variant="outline" className="mt-3 ml-2" busy={testingAlert} busyLabel="Sending…" onClick={() => { void sendTestAlert(); }}>Send test alert</GoalButton>
      </GoalNextStep>

      {testMessage ? <p role="status" className="mt-4 border border-g-hairline p-3 text-g-meta text-g-ink">{testMessage}</p> : null}
      {runError ? <GoalErrorState className="mt-4 border border-g-hairline" title={runError} retry={{ label: "Dismiss", onClick: () => setRunError("") }} /> : null}
      {run ? (
        <section aria-label="Money check result" className="mt-6 border border-g-hairline bg-g-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-g-label text-g-ink">{run.findingsFound ? run.subject ?? "Findings found" : "All clear. Nothing to flag."}</h2>
            <GoalStatus status={run.findingsFound ? "waiting" : "accepted"} label={run.findingsFound ? "Findings" : "No findings"} />
          </div>
          <p className="mt-2 text-g-meta text-g-ink-2">Ran {time(run.ranAt)}.</p>
          <p className="mt-1 text-g-meta text-g-ink-2">{run.findingsFound ? run.emailSent ? "The owner alert was sent." : "The owner alert was not sent; review the findings below." : "No owner email was needed."}</p>
          {run.findings ? <pre className="mt-3 whitespace-pre-wrap break-words border-t border-g-hairline pt-3 text-g-meta text-g-ink">{run.findings}</pre> : null}
        </section>
      ) : null}

      <section aria-label="Owner alert delivery" className="mt-6 border border-g-hairline bg-g-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-g-label text-g-ink">Owner alert delivery</h2>
          {statusQuery.isPending ? <GoalStatus status="queue_review" label="Checking delivery" /> : statusQuery.isError ? <GoalStatus status="queue_review" label="Not confirmed" /> : <GoalStatus status={status?.ownerNotReached ? "waiting" : "accepted"} label={status?.ownerNotReached ? "Latest alert failed" : "Latest alert delivered or not needed"} />}
        </div>
        {statusQuery.isPending ? <GoalSkeletonRows density="company" count={2} className="mt-3 px-0" /> : null}
        {statusQuery.isError ? <GoalErrorState className="mt-2 px-0" title={statusQuery.error instanceof Error ? statusQuery.error.message : "The delivery state is unconfirmed."} retry={{ label: "Check alert status again", onClick: () => { void statusQuery.refetch(); } }} /> : null}
        {!statusQuery.isPending && !statusQuery.isError && status ? (
          <div className="mt-3 grid gap-2 text-g-meta text-g-ink-2">
            <p>Latest attempt: {time(status.latestAt)}{status.latestOutcome ? ` · ${status.latestOutcome}` : ""}</p>
            <p>Last successful delivery: {time(status.lastSuccessAt)}</p>
            <p>Failed sends in the last 7 days: <GoalNum>{status.failuresLast7Days}</GoalNum></p>
            {status.ownerNotReached ? <p role="alert" className="border-t border-g-hairline pt-3 text-g-ink">The latest owner alert failed. Review the money-check result and delivery status; do not assume the owner was reached.</p> : null}
          </div>
        ) : null}
      </section>

      <GoalAbandonedCheckoutPanel onNeedsSignIn={() => setNeedsSignIn(true)} />
    </AdminMoneyGoalFrame>
  );
}
