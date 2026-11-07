// Goal /admin/smoke (D-048-p3-admin-ops): the synthetic release fixture in goal
// UI. Everything load-bearing stays as AdminSmoke.tsx has it - no bearer (the
// fixture is cookie + CSRF only), the `noindex` robots meta, the "Not found"
// screen while the fixture is disabled, `window.location.reload()` after
// activate/exit, and the kit page's own action error copy. The four role
// buttons become one role choice plus one commit, because a goal page carries
// exactly one black commit (D-150).
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalStatus } from "@/components/goal/GoalStatus";
import { cn } from "@/lib/utils";
import { postSmokeAction, readSmokeSnapshot, readSmokeStatus } from "./adminOpsApi";
import { AdminGoalFrame, AdminGoalHeading } from "../admin/AdminGoalFrame";

export const GOAL_PAGE = { goalLine: "Open the synthetic smoke fixture." } as const;
const BODY = "Isolated synthetic state. No live users, messages, payments or files.";
const ROLES = ["seeker", "referrer", "admin", "employer"] as const;
type Role = (typeof ROLES)[number];

function NotFound() {
  return (
    <main className="g-scope min-h-dvh bg-g-canvas p-8 font-g-sans text-g-ink">
      <h1 className="text-g-heading">Not found</h1>
    </main>
  );
}

export default function GoalAdminSmoke() {
  const status = useQuery({ queryKey: ["admin-smoke-status"], retry: false, queryFn: readSmokeStatus });
  const active = Boolean(status.data?.active);
  const snapshot = useQuery({ queryKey: ["admin-smoke-snapshot"], retry: false, enabled: active, queryFn: readSmokeSnapshot });
  const [role, setRole] = useState<Role>("seeker");
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: Record<string, string> }) => postSmokeAction(path, status.data?.csrf ?? "", body ?? {}),
    onSuccess: (_result, { path }) => {
      if (path === "activate" || path === "exit") { window.location.reload(); return; }
      void Promise.all([status.refetch(), snapshot.refetch()]);
    },
  });

  // The fixture must never be indexed, on either variant of this route.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow,noarchive";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  if (!status.data?.enabled) return <NotFound />;

  return (
    <AdminGoalFrame screen="admin-smoke">
      <p className="mb-2 border border-g-hairline bg-g-surface p-3"><GoalStatus status="waiting" label="Smoke test · synthetic data" /></p>
      <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body={BODY} />

      {action.error ? <p role="alert" className="mb-4 border border-g-hairline p-3 text-g-meta text-g-crimson">{action.error.message}</p> : null}

      {active ? (
        <>
          <GoalNextStep reason="Exiting discards the synthetic state and reloads the app without it.">
            <GoalButton variant="primary" className="mt-3" busy={action.isPending} busyLabel="Working…" onClick={() => action.mutate({ path: "exit" })}>Exit the fixture</GoalButton>
            <GoalButton variant="outline" className="mt-3 ml-3" busy={action.isPending} busyLabel="Working…" onClick={() => action.mutate({ path: "reset" })}>Reset</GoalButton>
          </GoalNextStep>
          <section aria-label="Synthetic fixture snapshot" className="mt-6 border border-g-hairline bg-g-surface p-4">
            <p className="text-g-label text-g-ink-2">Fixture state</p>
            {snapshot.data === undefined ? (
              <p className="mt-2 text-g-meta text-g-ink-3" aria-busy={snapshot.isPending || undefined}>{snapshot.isPending ? "Loading the snapshot…" : "No snapshot is available."}</p>
            ) : (
              <pre className="mt-2 overflow-auto text-g-meta text-g-ink"><code className="g-num">{JSON.stringify(snapshot.data, null, 2)}</code></pre>
            )}
          </section>
        </>
      ) : (
        <GoalNextStep reason="Pick the plane to enter, and the fixture seeds its synthetic state for that role.">
          <fieldset className="mt-3" disabled={action.isPending}>
            <legend className="text-g-label text-g-ink-2">Enter as</legend>
            <div className="mt-2 grid gap-2 gdesk:grid-cols-2">
              {ROLES.map(option => (
                <label key={option} className={cn("flex cursor-pointer items-center gap-3 border p-3", role === option ? "border-g-ink" : "border-g-hairline")}>
                  <input type="radio" name="smoke-role" value={option} checked={role === option} onChange={() => setRole(option)} className="size-4 shrink-0 accent-g-ink" />
                  <span className="text-g-label capitalize text-g-ink">{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <GoalButton variant="primary" className="mt-4" busy={action.isPending} busyLabel="Entering…" onClick={() => action.mutate({ path: "activate", body: { role } })}>Enter as {role}</GoalButton>
        </GoalNextStep>
      )}
    </AdminGoalFrame>
  );
}
