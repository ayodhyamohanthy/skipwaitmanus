// Goal /admin/schema (D-048-p3-admin-ops): "Reconcile the database schema."
// The one commit is the same POST the kit page makes - the fixed allowlisted
// ALTER/CREATE list in server/schemaReconcile.ts, never free-form SQL - and its
// result replaces the snapshot exactly as AdminSchema.tsx does (guardrail 1).
// Each statement's outcome reads as dot + text instead of a tinted chip.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/_core/auth";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalErrorState, GoalSkeletonRows } from "@/components/goal/GoalStates";
import { GoalStatus } from "@/components/goal/GoalStatus";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readSchemaReconcile, runSchemaReconcile } from "./adminOpsApi";
import { OpsPanel } from "./goalOpsParts";
import { AdminGoalFrame, AdminGoalHeading } from "../admin/AdminGoalFrame";

export const GOAL_PAGE = { goalLine: "Reconcile the database schema." } as const;
const BODY = "Runs the fixed, allowlisted ALTER/CREATE statements the app expects (missing columns and B2B tables). Only statements still missing are executed — the run is idempotent and safe to repeat. No free-form SQL can be submitted here.";

export default function GoalAdminSchema() {
  const { isSignedIn, getToken, openSignIn } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  const snapshot = useQuery({ queryKey: ["admin-schema-reconcile"], enabled: Boolean(isSignedIn), retry: false, queryFn: () => readSchemaReconcile(fetchToken) });
  const run = useMutation({
    mutationFn: () => runSchemaReconcile(fetchToken),
    onSuccess: result => queryClient.setQueryData(["admin-schema-reconcile"], result),
  });

  if (!isSignedIn) {
    return (
      <AdminGoalFrame screen="admin-schema-sign-in">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="Sign in with the designated administrator account to inspect and run the pending database schema reconciliation." />
        <GoalNextStep>
          {/* SignInButton renders its own <button>; wrapping GoalButton in it nests buttons. */}
          <GoalButton variant="primary" className="mt-3" onClick={() => openSignIn()}>Sign in</GoalButton>
        </GoalNextStep>
      </AdminGoalFrame>
    );
  }

  const current = snapshot.data;

  return (
    <AdminGoalFrame screen="admin-schema">
      <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body={BODY} />

      <GoalNextStep reason="A run executes only what is still missing, so re-running changes nothing that already exists.">
        <GoalButton variant="primary" className="mt-3" busy={run.isPending} busyLabel="Running…" onClick={() => run.mutate()}>Run reconcile</GoalButton>
        {run.error ? <p role="alert" className="mt-3 text-g-meta text-g-crimson">{run.error.message}</p> : null}
      </GoalNextStep>

      {snapshot.error && !current ? (
        <GoalErrorState className="mt-6" title={snapshot.error.message} body="The reconcile status is not shown as clear while it failed to load." retry={{ label: "Try again", onClick: () => void snapshot.refetch() }} />
      ) : snapshot.isPending ? (
        <div className="mt-6 border border-g-hairline bg-g-surface py-4"><GoalSkeletonRows density="ask" count={2} /></div>
      ) : current ? (
        <>
          <div className="mt-6 grid gap-4 gdesk:grid-cols-2">
            <section className="border border-g-hairline bg-g-surface p-4">
              <p className="text-g-label text-g-ink-2">Status</p>
              <p className="mt-2">
                {current.reconciled
                  ? <GoalStatus status="accepted" label="Reconciled" />
                  : <GoalStatus status="waiting" label="Not fully reconciled" />}
              </p>
              <p className="mt-1 text-g-meta text-g-ink-2">{current.reconciled ? "Every expected column and table exists." : "Some statements failed or have not run yet. Re-running is safe."}</p>
            </section>
            <section className="border border-g-hairline bg-g-surface p-4">
              <p className="text-g-label text-g-ink-2">First error</p>
              {current.firstError ? (
                <>
                  <p className="mt-2"><GoalStatus status="expired" label="One statement failed" /></p>
                  <p className="mt-1 break-words text-g-meta text-g-ink">{current.firstError}</p>
                </>
              ) : <p className="mt-2 break-words text-g-meta text-g-ink">None recorded — the last run had no statement failures.</p>}
            </section>
          </div>

          <OpsPanel title="Per-statement results" subtitle={current.results.length ? "Outcome of each allowlisted statement from the most recent run." : "No run has happened yet in this server process. Use Run reconcile to attempt the pending statements now."}>
            {current.results.length ? (
              <ul className="mt-4 grid gap-2">
                {current.results.map((item, index) => (
                  <li key={`${item.statement}-${index}`} className="border border-g-hairline p-3">
                    <GoalStatus status={item.ok ? "accepted" : "expired"} label={item.ok ? "Ran" : "Failed"} />
                    <p className="mt-1 break-words text-g-meta text-g-ink"><span className="g-num">{item.statement}</span></p>
                    {item.error ? <p className="mt-1 break-words text-g-meta text-g-crimson">{item.error}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </OpsPanel>
        </>
      ) : null}
    </AdminGoalFrame>
  );
}
