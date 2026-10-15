// Kit v4 Settings > Account: work-email status and the account-deletion review
// request. Signed-in device sessions come live from the hosted sign-in. The
// 14-day deletion grace needs a server that does not exist yet, so it is left out.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BriefcaseBusiness, Mail, MonitorSmartphone, Trash2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DoneNotice, ErrorNotice, Loading } from "./settingsUi";
import { ACCESS_ERROR, ERASURE_ERROR, PRIVACY_REQUESTS_ERROR, SESSIONS_ERROR, fetchPrivacyRequests, fetchSessions, hasVerifiedWorkEmail, requestErasure, revokeOtherSessions, revokeSessionById, settingsKeys, type TokenSource } from "./settingsApi";
import { useCompanyAccess } from "./settingsQueries";

const messageOf = (reason: unknown, fallback: string) => (reason instanceof Error && reason.message ? reason.message : fallback);

function WorkEmailPanel({ getToken }: { getToken: TokenSource }) {
  const [, setLocation] = useLocation();
  const access = useCompanyAccess(getToken);
  return <Panel>
    <Mail className="mb-2 size-5" aria-hidden="true" />
    <h2 className="text-lg font-semibold">Work email</h2>
    <p className="mt-1 text-sm text-muted-foreground">A verified company email unlocks private Job Referrer access. It is never shown to Job Seekers.</p>
    {access.isPending ? <Loading>Checking your work-email access…</Loading>
      : access.isError ? <ErrorNotice message={messageOf(access.error, ACCESS_ERROR)} onRetry={() => void access.refetch()} />
      : hasVerifiedWorkEmail(access.data) ? <div className="mt-4">
        <p className="text-sm"><strong className="block">Work email verified</strong><small className="block text-muted-foreground">{access.data.workEmailDomain} · your account can receive private company referral requests.</small></p>
        <Button className="mt-4" onClick={() => setLocation("/referrer")}><BriefcaseBusiness />Switch to Job Referrer mode</Button>
      </div>
      : <div className="mt-4">
        <p className="text-sm"><strong className="block">No verified work email yet</strong><small className="block text-muted-foreground">Use a company email and confirm the one-time code to unlock Job Referrer mode.</small></p>
        <Button asChild className="mt-4"><Link href="/verify">Add work email</Link></Button>
      </div>}
  </Panel>;
}

function DeleteAccountPanel({ getToken }: { getToken: TokenSource }) {
  const queryClient = useQueryClient();
  const requests = useQuery({ queryKey: settingsKeys.privacyRequests, retry: false, queryFn: () => fetchPrivacyRequests(getToken) });
  const [notice, setNotice] = useState("");
  const erasure = useMutation({
    mutationFn: () => requestErasure(getToken),
    onMutate: () => setNotice(""),
    onSuccess: async reply => {
      setNotice(reply.alreadyRequested ? "Your deletion request is already awaiting review." : "Your account deletion request is now awaiting review.");
      await queryClient.invalidateQueries({ queryKey: settingsKeys.privacyRequests });
    },
  });
  return <Panel className="border-destructive/40">
    <Trash2 className="mb-2 size-5 text-destructive" aria-hidden="true" />
    <h2 className="text-lg font-semibold">Delete account</h2>
    <p className="mt-1 text-sm text-muted-foreground">Ask for your account to be deleted. We review deletion requests rather than silently removing records that may need payment reconciliation or security handling.</p>
    {erasure.isError ? <ErrorNotice message={messageOf(erasure.error, ERASURE_ERROR)} /> : null}
    {notice ? <DoneNotice>{notice}</DoneNotice> : null}
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="outline" className="mt-4 text-destructive">Request account deletion</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Request account deletion review?</AlertDialogTitle>
          <AlertDialogDescription>This creates a review request. It does not immediately delete your account, resume, payments, or security records.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep my account</AlertDialogCancel>
          <AlertDialogAction disabled={erasure.isPending} onClick={() => erasure.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{erasure.isPending ? "Requesting…" : "Request review"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {requests.isPending ? <Loading>Checking privacy requests…</Loading>
      : requests.isError ? <p className="mt-3 text-sm text-muted-foreground">{messageOf(requests.error, PRIVACY_REQUESTS_ERROR)}.</p>
      : requests.data.length ? <ul className="mt-4 divide-y divide-border border-t border-border" aria-label="Your requests">
        {requests.data.slice(0, 3).map(request => <li key={request.id} className="py-3 text-sm"><strong className="font-semibold">Deletion request</strong> · {request.status.replace("_", " ")}{request.resolution ? ` · ${request.resolution}` : ""}</li>)}
      </ul> : null}
  </Panel>;
}

function SessionsPanel({ getToken }: { getToken: TokenSource }) {
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: settingsKeys.sessions, queryFn: () => fetchSessions(getToken) });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: settingsKeys.sessions }); };
  const revokeOne = useMutation({ mutationFn: (id: string) => revokeSessionById(id, getToken), onSettled: refresh });
  const revokeOthers = useMutation({ mutationFn: () => revokeOtherSessions(getToken), onSettled: refresh });
  const rows = sessions.data?.sessions ?? [];
  const others = rows.filter(row => !row.current);
  const error = revokeOne.error ?? revokeOthers.error;
  return <Panel>
    <MonitorSmartphone className="mb-2 size-5" aria-hidden="true" />
    <h2 className="text-lg font-semibold">Where you&apos;re signed in</h2>
    <p className="mt-1 text-sm text-muted-foreground">Devices that can keep you signed in. A device you sign out may stay signed in for up to 30 minutes.</p>
    {sessions.isPending ? <Loading>Loading your sessions…</Loading>
      : sessions.isError ? <ErrorNotice message={messageOf(sessions.error, SESSIONS_ERROR)} onRetry={() => void sessions.refetch()} />
      : rows.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">You are signed in on this device. We can only list devices that sign in through our hosted sign-in.</p>
      : <ul className="mt-3 divide-y">
        {rows.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="text-sm"><strong className="block">{row.device}{row.current ? " · This device" : ""}</strong>{row.lastActive ? <small className="block text-muted-foreground">Last active {new Date(row.lastActive).toLocaleString()}</small> : null}</span>
          {row.current ? null : <Button variant="outline" size="sm" disabled={revokeOne.isPending} onClick={() => revokeOne.mutate(row.id)}>Sign out</Button>}
        </li>)}
      </ul>}
    {error ? <ErrorNotice message={messageOf(error, SESSIONS_ERROR)} /> : null}
    {others.length > 0 && sessions.data?.currentKnown ? <Button variant="outline" className="mt-4" disabled={revokeOthers.isPending} onClick={() => revokeOthers.mutate()}>{revokeOthers.isPending ? "Signing out…" : "Sign out everywhere else"}</Button> : null}
  </Panel>;
}

export function AccountPanels({ getToken }: { getToken: TokenSource }) {
  return <><WorkEmailPanel getToken={getToken} /><SessionsPanel getToken={getToken} /><DeleteAccountPanel getToken={getToken} /></>;
}
