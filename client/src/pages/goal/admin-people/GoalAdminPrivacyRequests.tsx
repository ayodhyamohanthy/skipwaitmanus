// Goal /admin/privacy-requests (D-048-p3-admin-people): the same people goal
// line at operational density. Guardrail 1 (D-048-admin.md §4): starting a
// review keeps the kit page's exact server call and body - POST
// /api/admin/privacy-requests/:id/review with { status: "in_review" } plus the
// typed note only when the admin typed one - and completion stays unavailable
// here, because no control on this page may record an erasure as done
// (server/privateReferralRoutes.ts:1683 refuses it). Names and emails come from
// the server's rows only; nothing is fabricated.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalEmptyState, GoalErrorState, GoalSkeletonRows } from "@/components/goal/GoalStates";
import { GoalStatus } from "@/components/goal/GoalStatus";
import { ADMIN_ACCESS_MESSAGE, AdminAccessError, adminRequest, adminRetry } from "@/components/admin/adminApi";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";
import { AdminGoalFrame, AdminGoalHeading } from "../admin/AdminGoalFrame";
import { adminPeopleKeys, adminPeoplePost, privacyRequestsResponseSchema, privacyReviewResultSchema, privacyStatus, requestedOn, requesterLabelOf, stamp, type PrivacyRequestRow } from "./adminPeopleData";

export const GOAL_PAGE = { goalLine: "Act on people requests." } as const;
const BODY = "Start deletion reviews deliberately. Completion is disabled until a real erasure workflow verifies every resource step and any approved retained-data exception.";
const BLOCKED = "Completion is blocked until a verified erasure workflow records every resource step and any approved retained-data exception.";
const LOAD_FALLBACK = "We could not load privacy requests";
const UPDATE_FALLBACK = "We could not update this request";

function RequestQueue({ list, selectedId, loading, error, onRetry, onPick }: { list: PrivacyRequestRow[]; selectedId: number | null; loading: boolean; error: string; onRetry: () => void; onPick: (id: number) => void }) {
  return (
    <section aria-label="Privacy requests" className="min-w-0 border border-g-hairline bg-g-surface">
      {loading ? <GoalSkeletonRows density="queue" count={3} className="py-3" /> : null}
      {!loading && error ? <GoalErrorState title={error} retry={{ label: "Try again", onClick: onRetry }} /> : null}
      {!loading && !error && list.length === 0 ? <GoalEmptyState title="Nothing is waiting for review." body="Deletion requests appear here as account holders submit them." /> : null}
      <ul>
        {list.map(request => (
          <li key={request.id} className="border-b border-g-hairline last:border-b-0">
            <button type="button" aria-current={selectedId === request.id || undefined} onClick={() => onPick(request.id)}
              className={cn("block w-full px-4 py-3 text-left", selectedId === request.id ? "bg-g-surface-hover" : "hover:bg-g-surface-hover")}>
              <GoalStatus {...privacyStatus(request)} />
              <span className="mt-1 block text-g-label text-g-ink">Account deletion review</span>
              <span className="block truncate text-g-meta text-g-ink-2">{requesterLabelOf(request)}</span>
              <span className="block text-g-meta text-g-ink-3">{requestedOn(request.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function GoalAdminPrivacyRequests() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [failed, setFailed] = useState<{ id: number; message: string } | null>(null);

  const requests = useQuery({ queryKey: adminPeopleKeys.privacyRequests, enabled: Boolean(isSignedIn), retry: adminRetry, queryFn: async () => (await adminRequest("/api/admin/privacy-requests?limit=100", privacyRequestsResponseSchema, fetchToken, LOAD_FALLBACK)).requests });
  const review = useMutation({
    // Same call, same body shape as the kit page: the note goes only when the
    // admin typed one, so a recorded note never re-posts itself unnoticed.
    mutationFn: async ({ request, resolution }: { request: PrivacyRequestRow; resolution: string | undefined }) =>
      adminPeoplePost(`/api/admin/privacy-requests/${request.id}/review`, privacyReviewResultSchema, fetchToken, UPDATE_FALLBACK, { status: "in_review", resolution }),
    onSuccess: (result, { request }) => {
      queryClient.setQueryData<PrivacyRequestRow[]>(adminPeopleKeys.privacyRequests, rows => (rows ?? []).map(row => row.id === request.id ? { ...row, ...result.request } : row));
      setFailed(null);
    },
    onError: (error, { request }) => setFailed({ id: request.id, message: error instanceof Error ? error.message : UPDATE_FALLBACK }),
  });

  if (!isSignedIn) {
    return (
      <AdminGoalFrame screen="admin-privacy-requests-sign-in">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="Sign in with the designated administrator account. Requests and the people behind them stay hidden from other accounts." />
        <GoalNextStep>
          <SignInButton>
            <GoalButton variant="primary" className="mt-3">Sign in</GoalButton>
          </SignInButton>
        </GoalNextStep>
      </AdminGoalFrame>
    );
  }

  if (requests.error instanceof AdminAccessError) {
    return (
      <AdminGoalFrame screen="admin-privacy-requests-forbidden">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="Privacy requests stay hidden without administrator access." />
        <section role="alert" className="border border-g-hairline bg-g-surface p-5">
          <p className="text-g-label text-g-ink">{ADMIN_ACCESS_MESSAGE}</p>
          <p className="mt-1 text-g-meta text-g-ink-2">Sign in with the designated administrator account.</p>
        </section>
      </AdminGoalFrame>
    );
  }

  const list = requests.data ?? [];
  const selected = list.find(request => request.id === selectedId) ?? null;
  const loadError = requests.error ? requests.error.message : "";
  const failure = failed && selected && failed.id === selected.id ? failed : null;
  const note = selected ? notes[selected.id] ?? selected.resolution ?? "" : "";
  const typed = selected ? notes[selected.id] : undefined;

  return (
    <AdminGoalFrame screen="admin-privacy-requests">
      <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body={BODY} />
      <div className="grid gap-6 gdesk:grid-cols-[340px_minmax(0,1fr)]">
        <RequestQueue list={list} selectedId={selectedId} loading={requests.isLoading} error={loadError} onRetry={() => void requests.refetch()} onPick={id => { setSelectedId(id); setFailed(null); }} />
        <section aria-live="polite" className="min-w-0 border border-g-hairline bg-g-surface p-5 gdesk:p-6">
          {selected ? (
            <>
              <h2 className="text-g-heading text-g-ink">Account deletion review</h2>
              <p className="mt-1 text-g-meta text-g-ink-2">{requesterLabelOf(selected)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <GoalStatus {...privacyStatus(selected)} />
                <p className="text-g-meta text-g-ink-3">{requestedOn(selected.createdAt)}</p>
                {selected.reviewedAt ? <p className="text-g-meta text-g-ink-3">{`Reviewed ${stamp(selected.reviewedAt)}`}</p> : null}
              </div>
            </>
          ) : (
            <p className="text-g-meta text-g-ink-2" aria-busy={requests.isLoading || undefined}>{requests.isLoading ? "Loading privacy requests…" : loadError ? "No request is shown while the queue failed to load." : "No request is selected."}</p>
          )}
          <div className="mt-6">
            <GoalNextStep reason={selected ? "Starting the review records it against this request and its audit trail. Completion stays with a verified erasure workflow, never this page." : "Pick a request to read who asked and start its review."}>
              {selected ? (
                <>
                  <label className="mt-3 block text-g-label text-g-ink">Internal resolution note
                    <textarea value={note} maxLength={500} rows={2} placeholder="Record the next step or outcome."
                      onChange={event => setNotes(current => ({ ...current, [selected.id]: event.target.value.slice(0, 500) }))}
                      className="mt-2 block min-h-24 w-full rounded-g-control border border-g-control-edge bg-g-surface p-3 text-g-body text-g-ink placeholder:text-g-ink-3" />
                  </label>
                  <p className="mt-3 text-g-meta text-g-ink-2">{BLOCKED}</p>
                  {failure ? <p role="alert" className="mt-3 text-g-meta text-g-ink">{`This request is unchanged — ${failure.message}`}</p> : null}
                </>
              ) : null}
              <GoalButton
                variant="primary"
                className="mt-4"
                busy={review.isPending}
                busyLabel="Starting…"
                disabledReason={selected ? undefined : "Choose a request first"}
                onClick={() => { if (selected && !review.isPending) review.mutate({ request: selected, resolution: typed || undefined }); }}
              >
                {selected ? "Start review" : "Choose a request"}
              </GoalButton>
            </GoalNextStep>
          </div>
        </section>
      </div>
    </AdminGoalFrame>
  );
}
