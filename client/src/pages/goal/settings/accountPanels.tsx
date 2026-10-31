// Goal /settings > Account panels: device sessions and the account-deletion
// review request. The confirm step sits in front of every erasure request,
// exactly as the kit AlertDialog did.
import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GoalButton, GoalErrorState } from "@/components/goal";
import { ERASURE_ERROR, PRIVACY_REQUESTS_ERROR, SESSIONS_ERROR, fetchPrivacyRequests, fetchSessions, requestErasure, revokeOtherSessions, revokeSessionById, settingsKeys, type TokenSource } from "@/components/settings/settingsApi";
import { DoneNote, InlineError } from "./settingsParts";

const messageOf = (reason: unknown, fallback: string) => (reason instanceof Error && reason.message ? reason.message : fallback);

export function SessionsPanel({ getToken, online }: { getToken: TokenSource; online: boolean }) {
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: settingsKeys.sessions, retry: false, queryFn: () => fetchSessions(getToken) });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: settingsKeys.sessions }); };
  const revokeOne = useMutation({ mutationFn: (id: string) => revokeSessionById(id, getToken), onSettled: refresh });
  const revokeOthers = useMutation({ mutationFn: () => revokeOtherSessions(getToken), onSettled: refresh });
  const rows = sessions.data?.sessions ?? [];
  const others = rows.filter(row => !row.current);
  const actionError = revokeOne.error ?? revokeOthers.error;

  return (
    <section className="mt-8">
      <h3 className="text-g-heading text-g-ink">Where you're signed in</h3>
      <p className="mt-2 text-g-meta text-g-ink-2">Devices that can keep you signed in. A device you sign out may stay signed in for up to 30 minutes.</p>
      {sessions.data && rows.length > 0 && !sessions.data.currentKnown ? <p className="mt-2 text-g-meta text-g-ink-3">Sign in again to sign out individual devices. We can't tell which one you are using yet.</p> : null}
      {sessions.isPending ? <p role="status" className="mt-3 text-g-meta text-g-ink-3">Loading your sessions…</p>
        : sessions.isError ? <GoalErrorState className="mt-3 px-0" title="We could not load your sessions." body="Nothing was changed. Check your connection and try again." retry={{ label: "Try again", onClick: () => { void sessions.refetch(); } }} />
        : rows.length === 0 ? <p className="mt-3 text-g-meta text-g-ink-2">You are signed in on this device. We can only list devices that sign in through our hosted sign-in.</p>
        : <ul className="mt-3">
          {rows.map(row => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-g-hairline py-3 last:border-0">
              <span className="text-g-label text-g-ink"><strong className="block">{row.device}{row.current ? " · This device" : ""}</strong>{row.lastActive ? <small className="block text-g-meta text-g-ink-3">Last active {new Date(row.lastActive).toLocaleString()}</small> : null}</span>
              {row.current || !sessions.data?.currentKnown ? null : <GoalButton variant="outline" size="sm" busy={revokeOne.isPending && revokeOne.variables === row.id} busyLabel="Signing out…" disabledReason={!online ? "Reconnect to sign out a device." : undefined} onClick={() => revokeOne.mutate(row.id)}>Sign out</GoalButton>}
            </li>
          ))}
        </ul>}
      {actionError ? <InlineError>{messageOf(actionError, SESSIONS_ERROR)}</InlineError> : null}
      {others.length > 0 && sessions.data?.currentKnown ? <GoalButton className="mt-4" variant="outline" busy={revokeOthers.isPending} busyLabel="Signing out…" disabledReason={!online ? "Reconnect to sign out your other devices." : undefined} onClick={() => revokeOthers.mutate()}>Sign out everywhere else</GoalButton> : null}
    </section>
  );
}

export function DeleteAccountPanel({ getToken, online }: { getToken: TokenSource; online: boolean }) {
  const queryClient = useQueryClient();
  const requests = useQuery({ queryKey: settingsKeys.privacyRequests, retry: false, queryFn: () => fetchPrivacyRequests(getToken) });
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const erasure = useMutation({
    mutationFn: () => requestErasure(getToken),
    onMutate: () => setNotice(""),
    onSuccess: async reply => {
      setConfirming(false);
      setNotice(reply.alreadyRequested ? "Your deletion request is already awaiting review." : "Your account deletion request is now awaiting review.");
      await queryClient.invalidateQueries({ queryKey: settingsKeys.privacyRequests });
    },
  });

  return (
    <section className="mt-8 border-t border-g-hairline pt-6">
      <h3 className="text-g-heading text-g-ink">Delete account</h3>
      <p className="mt-2 text-g-meta text-g-ink-2">Ask for your account to be deleted. We review deletion requests rather than silently removing records that may need payment reconciliation or security handling.</p>
      {erasure.isError ? <InlineError>{messageOf(erasure.error, ERASURE_ERROR)}</InlineError> : null}
      {notice ? <DoneNote>{notice}</DoneNote> : null}
      {confirming ? (
        <div role="alertdialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={descriptionId} className="mt-4 border border-g-control-edge p-4">
          <h4 id={titleId} className="text-g-label text-g-ink">Request account deletion review?</h4>
          <p id={descriptionId} className="mt-1 text-g-meta text-g-ink-2">This creates a review request. It does not immediately delete your account, resume, payments, or security records.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <GoalButton variant="ghost" autoFocus onClick={() => setConfirming(false)}>Keep my account</GoalButton>
            <GoalButton variant="outline" busy={erasure.isPending} busyLabel="Requesting…" disabledReason={!online ? "Reconnect to request account deletion." : undefined} onClick={() => erasure.mutate()}>Request review</GoalButton>
          </div>
        </div>
      ) : (
        <GoalButton className="mt-4" variant="outline" onClick={() => setConfirming(true)}>Request account deletion</GoalButton>
      )}
      {requests.isPending ? <p role="status" className="mt-3 text-g-meta text-g-ink-3">Checking privacy requests…</p>
        : requests.isError ? <p className="mt-3 text-g-meta text-g-ink-2">{messageOf(requests.error, PRIVACY_REQUESTS_ERROR)}.</p>
        : requests.data.length ? <ul className="mt-4" aria-label="Your requests">
          {requests.data.slice(0, 3).map(item => <li key={item.id} className="border-t border-g-hairline py-3 text-g-label text-g-ink">{`Deletion request · ${item.status.replace("_", " ")}${item.resolution ? ` · ${item.resolution}` : ""}`}</li>)}
        </ul> : null}
    </section>
  );
}
