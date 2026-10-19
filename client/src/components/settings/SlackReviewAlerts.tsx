// Slack review alerts: an opt-in private Slack channel for verified referrers,
// shown as one row of the Notifications "How we reach you" Panel.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Unlink } from "lucide-react";
import { Button } from "@/components/kit/button";
import { field } from "@/components/kit/preview-kit";
import { DoneNotice, ErrorNotice, Loading } from "./settingsUi";
import { SLACK_CONNECT_ERROR, SLACK_DISCONNECT_ERROR, SLACK_STATUS_ERROR, connectSlack, disconnectSlack, fetchSlackStatus, isSlackWebhookUrl, settingsKeys, type SlackStatus, type TokenSource } from "./settingsApi";

const messageOf = (reason: unknown, fallback: string) => (reason instanceof Error && reason.message ? reason.message : fallback);

export function SlackReviewAlerts({ getToken }: { getToken: TokenSource }) {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: settingsKeys.slack, retry: false, queryFn: () => fetchSlackStatus(getToken) });
  const [webhookUrl, setWebhookUrl] = useState("");
  const [notice, setNotice] = useState("");
  const setStatus = (next: SlackStatus) => queryClient.setQueryData(settingsKeys.slack, next);
  const connect = useMutation({
    mutationFn: (url: string) => connectSlack(url, getToken),
    onMutate: () => setNotice(""),
    onSuccess: () => { setStatus({ connected: true, active: true }); setWebhookUrl(""); setNotice("Your private Slack triage channel is connected."); },
  });
  const disconnect = useMutation({
    mutationFn: () => disconnectSlack(getToken),
    onMutate: () => setNotice(""),
    onSuccess: () => { setStatus({ connected: false, active: false }); setNotice("Your Slack triage channel is disconnected."); },
  });
  const saving = connect.isPending || disconnect.isPending;
  const trimmed = webhookUrl.trim();
  const actionError = connect.error ? messageOf(connect.error, SLACK_CONNECT_ERROR) : disconnect.error ? messageOf(disconnect.error, SLACK_DISCONNECT_ERROR) : "";

  return <section data-skipwait-screen="slack-triage" aria-label="Slack review alerts" className="border-b border-border py-3 last:border-0">
    <strong className="block text-sm">Slack review alerts</strong>
    <small className="block text-muted-foreground">A private Slack message when a referral review is ready at your company. Messages carry the company name and your authenticated review link only — never candidate names, resumes, or documents.</small>
    {actionError ? <ErrorNotice message={actionError} /> : null}
    {notice ? <DoneNotice>{notice}</DoneNotice> : null}
    {status.isPending ? <Loading>Checking your Slack triage connection…</Loading>
      : status.isError ? <ErrorNotice message={messageOf(status.error, SLACK_STATUS_ERROR)} onRetry={() => void status.refetch()} />
      : status.data.connected && status.data.active ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm"><strong className="block">Slack triage connected</strong><small className="block text-muted-foreground">Review-ready notices arrive in your channel alongside email.</small></span>
        <Button variant="ghost" size="sm" className="min-h-11" disabled={saving} onClick={() => disconnect.mutate()}><Unlink />{disconnect.isPending ? "Disconnecting…" : "Disconnect Slack"}</Button>
      </div>
      : <div className="mt-3">
        <label htmlFor="slack-webhook-url" className="text-sm font-medium">Slack incoming-webhook URL</label>
        <input id="slack-webhook-url" name="slackWebhookUrl" type="url" inputMode="url" autoComplete="off" placeholder="https://hooks.slack.com/services/…" value={webhookUrl} onChange={event => setWebhookUrl(event.target.value)} className={field} />
        {trimmed && !isSlackWebhookUrl(trimmed) ? <p className="mt-2 text-sm text-destructive">Slack incoming webhooks start with https://hooks.slack.com/</p> : null}
        <Button variant="outline" className="mt-3" disabled={saving || !trimmed} onClick={() => connect.mutate(trimmed)}><Link2 />{connect.isPending ? "Connecting…" : "Connect Slack"}</Button>
      </div>}
    <p className="mt-3 text-xs text-muted-foreground">Optional. Delivery failures never block email or your inbox. Disconnect any time; it takes effect for the next review notice.</p>
  </section>;
}
