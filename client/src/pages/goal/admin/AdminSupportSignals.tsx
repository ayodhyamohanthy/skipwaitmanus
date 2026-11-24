// ADMIN-support-view (D-393) packet item 3: the trouble signals on /admin. Last 24 hours and 7 days of
// sign-in failures and send refusals by reason, checkout refusals, held requests, review-email failures and
// client errors recorded in the activity log — counts only, each linking to the filtered activity log.
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/_core/auth";
import { GoalEmptyState, GoalErrorState, GoalSkeletonRows } from "@/components/goal/GoalStates";
import { usePersistFn } from "@/hooks/usePersistFn";
import { loadSupportSignals } from "./adminSupportData";
import type { SupportSignalCount, SupportSignalWindowCounts } from "@shared/adminSupport";

const CARD = "border border-g-hairline bg-g-surface";
const HEAD = "border-b border-g-hairline px-4 py-3 text-g-label text-g-ink";

/** One counted reason, linked to the activity log filtered to that action. */
function ReasonLine({ label, rows, action }: { label: string; rows: SupportSignalCount[]; action: string }) {
  if (rows.length === 0) return <li className="flex items-center justify-between gap-2 border-b border-g-hairline px-4 py-2 last:border-b-0"><span className="text-g-meta text-g-ink-2">{label}</span><span className="g-num text-g-meta text-g-ink-3">none</span></li>;
  return (
    <>
      {rows.map(row => (
        <li key={`${label}-${row.reason}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-g-hairline px-4 py-2 last:border-b-0">
          <a className="text-g-meta text-g-ink underline decoration-g-hairline underline-offset-4 hover:text-g-ink" href={`/admin/activity?action=${encodeURIComponent(action)}&outcome=denied`}>{`${label}: ${row.reason}`}</a>
          <span className="g-num text-g-meta text-g-ink-2">{row.count}</span>
        </li>
      ))}
    </>
  );
}

function Window({ title, counts }: { title: string; counts: SupportSignalWindowCounts }) {
  return (
    <div className="min-w-0">
      <h3 className="px-4 pt-4 text-g-label text-g-ink-2">{title}</h3>
      <ul className="mt-2">
        <ReasonLine label="Sign-in failures" rows={counts.signInFailures} action="auth." />
        <ReasonLine label="Send refusals" rows={counts.sendRefusals} action="company_referral." />
        <ReasonLine label="Checkout refusals" rows={counts.checkoutRefusals} action="billing." />
        <li className="flex items-center justify-between gap-2 border-b border-g-hairline px-4 py-2">
          <a className="text-g-meta text-g-ink underline decoration-g-hairline underline-offset-4 hover:text-g-ink" href="/admin/activity?query=held">Requests held for a referral</a>
          <span className="g-num text-g-meta text-g-ink-2">{counts.heldRequests}</span>
        </li>
        <li className="flex items-center justify-between gap-2 border-b border-g-hairline px-4 py-2">
          <span className="text-g-meta text-g-ink-2">Review emails still failing</span>
          <span className="g-num text-g-meta text-g-ink-2">{counts.reviewEmailFailures}</span>
        </li>
        <li className="flex items-center justify-between gap-2 px-4 py-2">
          <span className="text-g-meta text-g-ink-2">Client errors in the activity log (Sentry holds the full feed)</span>
          <span className="g-num text-g-meta text-g-ink-2">{counts.clientErrors}</span>
        </li>
      </ul>
    </div>
  );
}

export function AdminSupportSignals() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const signals = useQuery({ queryKey: ["admin-support-signals"], enabled: Boolean(isSignedIn), retry: false, queryFn: () => loadSupportSignals(fetchToken) });
  return (
    <section aria-label="Trouble signals" className={`${CARD} mt-6`}>
      <h2 className={HEAD}>Trouble signals</h2>
      {signals.isPending ? <GoalSkeletonRows density="queue" count={3} className="py-4" /> : null}
      {signals.error ? <GoalErrorState title={signals.error.message} body="Nothing is shown as clear while the signals failed to load." retry={{ label: "Try again", onClick: () => void signals.refetch() }} /> : null}
      {signals.data ? (
        <div className="grid gap-6 pb-4 gdesk:grid-cols-2">
          <Window title="Last 24 hours" counts={signals.data.windows["24h"]} />
          <Window title="Last 7 days" counts={signals.data.windows["7d"]} />
        </div>
      ) : null}
      {signals.data && !signals.data.windows["24h"] && !signals.data.windows["7d"] ? <GoalEmptyState title="No signals yet." body="Counts appear as people sign in and send requests." /> : null}
    </section>
  );
}
