// Goal /settings > Notifications: the opt-in Slack review channel for verified
// referrers. Same route, same validation and same copy as the kit panel; only
// the visual language changes.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GoalButton, GoalErrorState } from "@/components/goal";
import { SLACK_CONNECT_ERROR, SLACK_DISCONNECT_ERROR, SLACK_STATUS_ERROR, connectSlack, disconnectSlack, fetchSlackStatus, isSlackWebhookUrl, settingsKeys, type SlackStatus, type TokenSource } from "@/components/settings/settingsApi";
import { DoneNote, InlineError } from "./settingsParts";

const messageOf = (reason: unknown, fallback: string) => (reason instanceof Error && reason.message ? reason.message : fallback);

export default function SlackAlerts({ getToken, online }: { getToken: TokenSource; online: boolean }) {
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
  const offlineReason = "Reconnect to change your Slack triage channel.";
  const connectReason = !online ? offlineReason : !trimmed ? "Paste your Slack webhook URL first." : !isSlackWebhookUrl(trimmed) ? "This webhook URL is not a Slack incoming webhook." : undefined;
  const actionError = connect.error ? messageOf(connect.error, SLACK_CONNECT_ERROR) : disconnect.error ? messageOf(disconnect.error, SLACK_DISCONNECT_ERROR) : "";

  return (
    <section data-skipwait-screen="slack-triage" aria-label="Slack review alerts" className="mt-6 border-t border-g-hairline pt-5">
      <h4 className="text-g-label text-g-ink">Slack review alerts</h4>
      <p className="mt-1 text-g-meta text-g-ink-2">A private Slack message when a referral review is ready at your company. Messages carry the company name and your authenticated review link only — never candidate names, resumes, or documents.</p>
      {actionError ? <InlineError>{actionError}</InlineError> : null}
      {notice ? <DoneNote>{notice}</DoneNote> : null}
      {status.isPending ? <p role="status" className="mt-3 text-g-meta text-g-ink-3">Checking your Slack triage connection…</p>
        : status.isError ? <GoalErrorState className="mt-3 px-0" title={messageOf(status.error, SLACK_STATUS_ERROR)} body="Nothing was changed. Check your connection and try again." retry={{ label: "Try again", onClick: () => { void status.refetch(); } }} />
        : status.data.connected && status.data.active ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span><strong className="block text-g-label text-g-ink">Slack review alerts connected</strong><span className="mt-1 block text-g-meta text-g-ink-3">Review-ready notices arrive in your channel alongside email.</span></span>
            <GoalButton variant="outline" busy={disconnect.isPending} busyLabel="Disconnecting…" disabledReason={!online ? offlineReason : undefined} onClick={() => disconnect.mutate()}>Disconnect Slack</GoalButton>
          </div>
        ) : (
          <div className="mt-3">
            <label htmlFor="goal-slack-webhook" className="text-g-label text-g-ink">Slack incoming-webhook URL</label>
            <input id="goal-slack-webhook" name="slackWebhookUrl" type="url" inputMode="url" autoComplete="off" placeholder="https://hooks.slack.com/services/…" value={webhookUrl} onChange={event => setWebhookUrl(event.target.value)}
              className="mt-2 flex min-h-11 w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-label text-g-ink" />
            {trimmed && !isSlackWebhookUrl(trimmed) ? <InlineError>Slack incoming webhooks start with https://hooks.slack.com/</InlineError> : null}
            <GoalButton className="mt-3" variant="outline" busy={connect.isPending} busyLabel="Connecting…" disabledReason={connectReason} onClick={() => connect.mutate(trimmed)}>Connect Slack</GoalButton>
          </div>
        )}
      <p className="mt-3 text-g-meta text-g-ink-3">Optional. Delivery failures never block email or your inbox. Disconnect any time; it takes effect for the next review notice.</p>
    </section>
  );
}
