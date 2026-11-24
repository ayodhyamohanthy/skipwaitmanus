// A person's referral-request history on /admin/activity (ADMIN-activity-log, D-393): every transition of the
// requests they sent, received or acted on, including the ones scheduled jobs make (lapse, expiry, delivery).
import { useQuery } from "@tanstack/react-query";
import { GoalEmptyState, GoalErrorState, GoalSkeletonRows } from "@/components/goal/GoalStates";
import { usePersistFn } from "@/hooks/usePersistFn";
import { loadPersonRequests, type TokenSource } from "./adminOpsApi";

const ROLE_LABEL = { seeker: "Their request", referrer: "Sent to them", actor: "They acted" } as const;

export function PersonRequestHistory({ person, getToken }: { person: string; getToken: TokenSource }) {
  const fetchToken = usePersistFn(getToken);
  const history = useQuery({ queryKey: ["admin-activity-requests", person], retry: false, queryFn: () => loadPersonRequests(fetchToken, person) });
  return (
    <section aria-label="Referral request history" className="mt-6 border border-g-hairline bg-g-surface">
      <h2 className="border-b border-g-hairline px-4 py-3 text-g-label text-g-ink">Referral request history</h2>
      {history.error ? (
        <GoalErrorState title={history.error.message} body="The request history did not load; the activity above is unaffected." retry={{ label: "Try again", onClick: () => void history.refetch() }} />
      ) : history.isPending ? (
        <GoalSkeletonRows density="queue" count={3} className="py-4" />
      ) : history.data.length === 0 ? (
        <GoalEmptyState title="No referral requests for this person." body="Requests they send, receive or act on appear here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-g-hairline text-g-label text-g-ink-3">
                <th scope="col" className="px-4 py-3 font-medium">Time</th>
                <th scope="col" className="px-4 py-3 font-medium">Request</th>
                <th scope="col" className="px-4 py-3 font-medium">Step</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.data.map(item => (
                <tr key={item.id} className="border-b border-g-hairline last:border-b-0">
                  <td className="px-4 py-3 align-top"><span className="g-num text-g-ink-2">{new Date(item.createdAt).toLocaleString()}</span></td>
                  <td className="px-4 py-3 align-top"><span className="block g-num text-g-ink">#{item.referralRequestId}</span><span className="block text-g-meta text-g-ink-3">{ROLE_LABEL[item.role]}</span></td>
                  <td className="px-4 py-3 align-top"><span className="g-num text-g-ink">{item.action}</span></td>
                  <td className="px-4 py-3 align-top"><span className="g-num text-g-ink-2">{item.fromStatus} → {item.resultingStatus}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
