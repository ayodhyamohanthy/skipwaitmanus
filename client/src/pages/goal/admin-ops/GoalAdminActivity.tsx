// Goal /admin/activity (D-048-p3-admin-ops): "Diagnose the referral journey."
// The search is the one next step; the event list is the five-column
// diagnostic table the kit page shows, with outcome as dot + text. The server
// call, its params and its error copy stay exactly as AdminActivity.tsx makes
// them (guardrail 1, D-048-admin.md §4) - only the presentation changes.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/_core/auth";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalEmptyState, GoalErrorState, GoalSkeletonRows } from "@/components/goal/GoalStates";
import { GoalStatus, type GoalStatusValue } from "@/components/goal/GoalStatus";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";
import { loadActivity } from "./adminOpsApi";
import { AdminGoalFrame, AdminGoalHeading } from "../admin/AdminGoalFrame";

export const GOAL_PAGE = { goalLine: "Diagnose the referral journey." } as const;
const BODY = "Every authenticated material workflow request is recorded with minimized metadata. No document contents or names, target URLs, OTPs, referral text, invite codes, or payment credentials are stored.";

const OUTCOMES = [
  { value: "", label: "All outcomes" },
  { value: "success", label: "Success" },
  { value: "failure", label: "Failure" },
  { value: "denied", label: "Denied" },
] as const;

/** Outcome keeps the kit page's meaning: emerald did it, amber was refused, crimson failed. */
const OUTCOME_STATUS: Record<string, { status: GoalStatusValue; label: string }> = {
  success: { status: "referred", label: "Success" },
  failure: { status: "expired", label: "Failure" },
  denied: { status: "waiting", label: "Denied" },
};

export default function GoalAdminActivity() {
  const { isSignedIn, getToken, openSignIn } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [actor, setActor] = useState("");
  const [outcome, setOutcome] = useState("");
  const [applied, setApplied] = useState({ query: "", outcome: "" });
  const events = useQuery({
    queryKey: ["admin-activity", applied.query, applied.outcome],
    enabled: Boolean(isSignedIn),
    retry: false,
    queryFn: () => loadActivity(fetchToken, applied.query, applied.outcome),
  });

  if (!isSignedIn) {
    return (
      <AdminGoalFrame screen="admin-activity-sign-in">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="Sign in with an administrator account to view privacy-safe operational diagnostics." />
        <GoalNextStep>
          {/* SignInButton renders its own <button>; wrapping GoalButton in it nests buttons. */}
          <GoalButton variant="primary" className="mt-3" onClick={() => openSignIn()}>Sign in</GoalButton>
        </GoalNextStep>
      </AdminGoalFrame>
    );
  }

  const search = () => setApplied({ query: actor.trim(), outcome });
  const loading = events.isPending || events.isFetching;

  return (
    <AdminGoalFrame screen="admin-activity">
      <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body={BODY} />
      <GoalNextStep reason="Search the recorded events by actor, action, company or resource, and narrow them by outcome.">
        <form className="mt-3 grid gap-3 gdesk:grid-cols-[minmax(0,1fr)_170px_auto] gdesk:items-end" onSubmit={event => { event.preventDefault(); search(); }}>
          <label className="block text-g-label text-g-ink">Search activity
            <input value={actor} onChange={event => setActor(event.target.value)} placeholder="Search actor, action, company, or resource"
              className="mt-1.5 block h-(--g-control-h) w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-body text-g-ink" />
          </label>
          <label className="block text-g-label text-g-ink">Outcome
            <select value={outcome} onChange={event => setOutcome(event.target.value)}
              className="mt-1.5 block h-(--g-control-h) w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-body text-g-ink">
              {OUTCOMES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <GoalButton variant="primary" type="submit" busy={loading} busyLabel="Searching…">Search</GoalButton>
        </form>
      </GoalNextStep>

      <section aria-label="Operational activity" className="mt-6 border border-g-hairline bg-g-surface">
        <p className="border-b border-g-hairline px-4 py-3 text-g-meta text-g-ink-3">Most recent 250 events</p>
        {events.error ? (
          <GoalErrorState title={events.error.message} body="Nothing is shown as clear while the event list failed to load." retry={{ label: "Try again", onClick: () => void events.refetch() }} />
        ) : loading ? (
          <GoalSkeletonRows density="queue" count={4} className="py-4" />
        ) : events.data && events.data.length === 0 ? (
          <GoalEmptyState title="No matching operational activity yet." body="Widen the search or choose another outcome." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-g-hairline text-g-label text-g-ink-3">
                  <th scope="col" className="px-4 py-3 font-medium">Time</th>
                  <th scope="col" className="px-4 py-3 font-medium">Actor</th>
                  <th scope="col" className="px-4 py-3 font-medium">Action</th>
                  <th scope="col" className="px-4 py-3 font-medium">Context</th>
                  <th scope="col" className="px-4 py-3 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {(events.data ?? []).map(item => {
                  const mark = OUTCOME_STATUS[item.outcome] ?? { status: "withdrawn" as GoalStatusValue, label: item.outcome };
                  return (
                    <tr key={item.id} className="border-b border-g-hairline last:border-b-0">
                      <td className="px-4 py-3 align-top"><span className="g-num text-g-ink-2">{new Date(item.createdAt).toLocaleString()}</span></td>
                      <td className="px-4 py-3 align-top"><span className="block text-g-label text-g-ink">{item.actorName || "System"}</span><span className="block text-g-meta text-g-ink-3">{item.actorEmail || ""}</span></td>
                      <td className="px-4 py-3 align-top"><span className="g-num text-g-ink">{item.action}</span></td>
                      <td className="px-4 py-3 align-top"><span className="block text-g-meta text-g-ink-2">{item.companyDomain || item.resourceType || "—"}{item.resourceId ? ` · ${item.resourceId}` : ""}</span><span className={cn("block max-w-80 truncate text-g-meta text-g-ink-3", item.metadata && "g-num")}>{item.metadata || ""}</span></td>
                      <td className="px-4 py-3 align-top"><GoalStatus status={mark.status} label={mark.label} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminGoalFrame>
  );
}
