// Goal /admin/users (D-048-p3-admin-people): "Act on people requests." The
// roster is the list, the selected account is the detail, and the suspension
// commit is the one black action. Guardrail 1 (D-048-admin.md §4): suspending
// keeps the kit page's exact server call and body - POST
// /api/admin/users/:id/suspend with { suspended } and nothing else - and its
// two-step confirm, consequence copy and "the account is unchanged" revert;
// only the presentation changes. A failed update re-reads the directory before
// it says anything: "unchanged" only when the server's row shows it (PR 1205).
// Suspension covers every alias of the canonical
// person, which the server decides: this page never computes access.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalEmptyState, GoalErrorState, GoalSkeletonRows } from "@/components/goal/GoalStates";
import { GoalStatus } from "@/components/goal/GoalStatus";
import { GoalVerifiedMark } from "@/components/goal/GoalVerifiedMark";
import { ADMIN_ACCESS_MESSAGE, AdminAccessError, adminRequest, adminRetry } from "@/components/admin/adminApi";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";
import { AdminGoalFrame, AdminGoalHeading } from "../admin/AdminGoalFrame";
import { GoalSuspendConfirm } from "./GoalSuspendConfirm";
import { accountLabelOf, adminPeopleKeys, adminPeoplePaths, adminPeoplePost, adminUsersResponseSchema, asSentence, joinedOn, onDate, rereadOrNull, suspendResultSchema, suspensionOutcome, userStatus, type AdminUserRow } from "./adminPeopleData";

export const GOAL_PAGE = { goalLine: "Act on people requests." } as const;
const BODY = "Newest accounts first, with role, company, and suspension state. Suspending an account removes its access immediately; unsuspending restores it.";
const LOAD_FALLBACK = "We could not load the users directory";
const UPDATE_FALLBACK = "We could not update this user account";

type SuspendCall = { user: AdminUserRow; suspended: boolean };
type Failure = SuspendCall & { message: string; outcome: "unchanged" | "unknown" };
const RECOVERED = "The update was saved. Its confirmation was lost, so this page re-read the account.";

function AccountRoster({ list, term, total, selectedId, loading, error, onTerm, onRetry, onPick }: { list: AdminUserRow[]; term: string; total: number; selectedId: number | null; loading: boolean; error: string; onTerm: (value: string) => void; onRetry: () => void; onPick: (id: number) => void }) {
  const filtered = term.trim() !== "" && list.length === 0 && total > 0;
  return (
    <section aria-label="Accounts" className="min-w-0 border border-g-hairline bg-g-surface">
      <div className="border-b border-g-hairline p-3">
        <input aria-label="Search users" value={term} onChange={event => onTerm(event.target.value)} placeholder="Search by email or name"
          className="h-11 w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-body text-g-ink placeholder:text-g-ink-3" />
      </div>
      {loading ? <GoalSkeletonRows density="queue" count={3} className="py-3" /> : null}
      {!loading && error ? <GoalErrorState title={error} retry={{ label: "Try again", onClick: onRetry }} /> : null}
      {!loading && !error && total === 0 ? <GoalEmptyState title="No accounts yet" body="Accounts appear here as people join skipwait.me." /> : null}
      {!loading && filtered ? <GoalEmptyState title="No accounts match this search" body="Clear the search to see the full directory." /> : null}
      <ul>
        {list.map(user => (
          <li key={user.id} className="border-b border-g-hairline last:border-b-0">
            <button type="button" aria-current={selectedId === user.id || undefined} onClick={() => onPick(user.id)}
              className={cn("block w-full px-4 py-3 text-left", selectedId === user.id ? "bg-g-surface-hover" : "hover:bg-g-surface-hover")}>
              <span className="flex items-center justify-between gap-2">
                <GoalStatus {...userStatus(user)} />
                {user.workEmailVerifiedAt ? <GoalVerifiedMark as="span">Work email verified</GoalVerifiedMark> : null}
              </span>
              <span className="mt-1 block truncate text-g-label text-g-ink">{accountLabelOf(user)}</span>
              <span className="block truncate text-g-meta text-g-ink-2">{[user.name, user.company, joinedOn(user.createdAt)].filter(Boolean).join(" · ")}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function GoalAdminUsers() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<SuspendCall | null>(null);
  const [failed, setFailed] = useState<Failure | null>(null);
  const [recovered, setRecovered] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  const readUsers = async () => (await adminRequest(adminPeoplePaths.users, adminUsersResponseSchema, fetchToken, LOAD_FALLBACK)).users;
  const users = useQuery({ queryKey: adminPeopleKeys.users, enabled: Boolean(isSignedIn), retry: adminRetry, queryFn: readUsers });
  // Only the server's row says whether a failed call changed the account.
  const reconcile = async ({ user, suspended }: SuspendCall, message: string) => {
    const reread = await rereadOrNull(readUsers);
    if (reread) queryClient.setQueryData<AdminUserRow[]>(adminPeopleKeys.users, reread);
    const outcome = suspensionOutcome(user.id, suspended, reread);
    setRecovered(outcome === "saved" ? user.id : null);
    setFailed(outcome === "saved" ? null : { user, suspended, message, outcome });
  };
  const suspend = useMutation({
    mutationFn: async ({ user, suspended }: SuspendCall) => adminPeoplePost(`/api/admin/users/${user.id}/suspend`, suspendResultSchema, fetchToken, UPDATE_FALLBACK, { suspended }),
    onSuccess: (result, { user, suspended }) => {
      // The server's answer, never an optimistic guess: the row changes when the call does.
      queryClient.setQueryData<AdminUserRow[]>(adminPeopleKeys.users, rows => (rows ?? []).map(row => row.id === user.id ? { ...row, suspended: result.user.suspended ?? suspended } : row));
      setFailed(null);
      setRecovered(null);
    },
    // The access gate refuses before any write; every other failure (a lost response,
    // a gateway error) cannot prove a rollback, so the directory is re-read first.
    onError: async (error, call) => {
      const message = error instanceof Error ? error.message : UPDATE_FALLBACK;
      if (error instanceof AdminAccessError) { setRecovered(null); setFailed({ ...call, message, outcome: "unchanged" }); return; }
      await reconcile(call, message);
    },
    onSettled: () => setConfirm(null),
  });

  if (!isSignedIn) {
    return (
      <AdminGoalFrame screen="admin-users-sign-in">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="Sign in with the designated administrator account. The directory is never shown to other accounts." />
        <GoalNextStep>
          <SignInButton>
            <GoalButton variant="primary" className="mt-3">Sign in</GoalButton>
          </SignInButton>
        </GoalNextStep>
      </AdminGoalFrame>
    );
  }

  if (users.error instanceof AdminAccessError) {
    return (
      <AdminGoalFrame screen="admin-users-forbidden">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="The users directory stays hidden without administrator access." />
        <section role="alert" className="border border-g-hairline bg-g-surface p-5">
          <p className="text-g-label text-g-ink">{ADMIN_ACCESS_MESSAGE}</p>
          <p className="mt-1 text-g-meta text-g-ink-2">Sign in with the designated administrator account.</p>
        </section>
      </AdminGoalFrame>
    );
  }

  const rows = users.data ?? [];
  const query = term.trim().toLowerCase();
  const list = query === "" ? rows : rows.filter(user => `${user.email ?? ""} ${user.name ?? ""}`.toLowerCase().includes(query));
  const selected = rows.find(user => user.id === selectedId) ?? null;
  const asked = confirm ? rows.find(user => user.id === confirm.user.id) ?? null : null;
  const loadError = users.error ? users.error.message : "";
  const failure = failed && selected && failed.user.id === selected.id ? failed : null;
  const reason = !selected
    ? "Pick an account to see its state and what can be done about it."
    : selected.suspended
      ? "Unsuspension restores this account's access immediately."
      : "Suspension removes this account's access immediately; undo it here at any time.";

  return (
    <AdminGoalFrame screen="admin-users">
      <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body={BODY} />
      <div className="grid gap-6 gdesk:grid-cols-[340px_minmax(0,1fr)]">
        <AccountRoster
          list={list}
          term={term}
          total={rows.length}
          selectedId={selectedId}
          loading={users.isLoading}
          error={loadError}
          onTerm={setTerm}
          onRetry={() => void users.refetch()}
          onPick={setSelectedId}
        />
        <section aria-live="polite" className="min-w-0 border border-g-hairline bg-g-surface p-5 gdesk:p-6">
          {selected ? (
            <>
              <h2 className="text-g-heading text-g-ink">{accountLabelOf(selected)}</h2>
              <p className="mt-1 text-g-meta text-g-ink-2">{[selected.name, selected.company].filter(Boolean).join(" · ") || "No profile details recorded."}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <GoalStatus {...userStatus(selected)} />
                {selected.workEmailVerifiedAt
                  ? <GoalVerifiedMark as="span">{`Work email verified ${onDate(selected.workEmailVerifiedAt)}`}</GoalVerifiedMark>
                  : <p className="text-g-meta text-g-ink-3">Work email not verified</p>}
                <p className="text-g-meta text-g-ink-3">{joinedOn(selected.createdAt)}</p>
              </div>
              {/* ADMIN-activity-log (D-393): this person's sign-ins, attempts, requests and account actions. */}
              <a href={`/admin/activity?person=${selected.id}`} className="mt-3 inline-block text-g-meta text-g-ink-2 underline underline-offset-2 hover:text-g-ink">See this person's sign-ins and activity</a>
            </>
          ) : (
            <p className="text-g-meta text-g-ink-2" aria-busy={users.isLoading || undefined}>{users.isLoading ? "Loading accounts…" : loadError ? "No account is shown while the directory failed to load." : "No account is selected."}</p>
          )}
          <div className="mt-6">
            <GoalNextStep reason={reason}>
              <GoalButton
                variant={confirm || suspend.isPending ? "ghost" : "primary"}
                className="mt-3"
                disabledReason={selected ? undefined : "Choose an account first"}
                onClick={() => { if (selected && !suspend.isPending) setConfirm({ user: selected, suspended: !selected.suspended }); }}
              >
                {selected ? (selected.suspended ? "Unsuspend account" : "Suspend account") : "Choose an account"}
              </GoalButton>
              {failure ? (
                <div role="alert" className="mt-3 border border-g-hairline bg-g-surface p-3">
                  {failure.outcome === "unchanged" ? (
                    <>
                      <p className="text-g-meta text-g-ink">{`Update failed — ${asSentence(failure.message)} The account is unchanged.`}</p>
                      <GoalButton size="sm" variant="outline" className="mt-2" onClick={() => suspend.mutate({ user: failure.user, suspended: failure.suspended })}>Try again</GoalButton>
                    </>
                  ) : (
                    <>
                      <p className="text-g-meta text-g-ink">{`We could not confirm whether this update was saved. ${asSentence(failure.message)} Check the account before you retry.`}</p>
                      <GoalButton size="sm" variant="outline" className="mt-2" busy={checking} busyLabel="Checking…"
                        onClick={() => { setChecking(true); void reconcile(failure, failure.message).finally(() => setChecking(false)); }}>Check the account again</GoalButton>
                    </>
                  )}
                </div>
              ) : null}
              {selected && recovered === selected.id ? <p role="status" className="mt-3 text-g-meta text-g-ink-2">{RECOVERED}</p> : null}
            </GoalNextStep>
          </div>
        </section>
      </div>
      {asked && confirm ? (
        <GoalSuspendConfirm
          suspended={confirm.suspended}
          account={accountLabelOf(asked)}
          busy={suspend.isPending}
          onConfirm={() => suspend.mutate({ user: asked, suspended: confirm.suspended })}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </AdminGoalFrame>
  );
}
