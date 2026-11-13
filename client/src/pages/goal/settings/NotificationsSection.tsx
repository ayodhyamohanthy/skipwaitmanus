// Goal /settings > Notifications. Per-event notification choices need a
// preferences store that does not exist yet, so this section shows the channels
// skipwait.me really uses: email (always on), Alerts in the app, and the opt-in
// referrer email and Slack channels for verified referrers.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GoalButton, GoalErrorState, GoalNextStep } from "@/components/goal";
import { fetchReferrerPreferences, saveReferrerPreferences } from "@/components/referrer-home/referrerData";
import { hasVerifiedWorkEmail, type TokenSource } from "@/components/settings/settingsApi";
import { useCompanyAccess } from "@/components/settings/settingsQueries";
import { Link } from "wouter";
import { InlineError, Row, Section, Switch } from "./settingsParts";
import SlackAlerts from "./slackAlerts";

const PREFERENCES_KEY = ["settings", "referrer-preferences"] as const;
const messageOf = (reason: unknown, fallback: string) => (reason instanceof Error && reason.message ? reason.message : fallback);

function NewAskEmailRow({ getToken, online }: { getToken: TokenSource; online: boolean }) {
  const queryClient = useQueryClient();
  const prefs = useQuery({ queryKey: PREFERENCES_KEY, retry: false, queryFn: () => fetchReferrerPreferences(getToken) });
  const save = useMutation({
    mutationFn: (notifyNewAsk: boolean) => saveReferrerPreferences(getToken, { notifyNewAsk }),
    onSuccess: next => queryClient.setQueryData(PREFERENCES_KEY, next),
  });
  if (prefs.isPending) return <p role="status" className="mt-3 text-g-meta text-g-ink-3">Loading your email setting…</p>;
  if (prefs.isError) return <GoalErrorState className="mt-3 px-0" title="We could not load your email setting." body={messageOf(prefs.error, "Check your connection and try again.")} retry={{ label: "Try again", onClick: () => { void prefs.refetch(); } }} />;
  return (
    <>
      <Row label="Email when a new referral request arrives" hint="Off means no review emails while you stay verified.">
        <Switch on={prefs.data.notifyNewAsk} label="Email when a new referral request arrives" disabledReason={!online ? "Reconnect to change your email setting." : undefined} onChange={value => save.mutate(value)} />
      </Row>
      {save.isError ? <InlineError>We could not save that. Try again.</InlineError> : null}
    </>
  );
}

export default function NotificationsSection({ getToken, online }: { getToken: TokenSource; online: boolean }) {
  const access = useCompanyAccess(getToken);
  return (
    <>
      <GoalNextStep reason="Email keeps a record of every referral request and reply. Alerts collect everything that needs you inside skipwait.me.">
        <GoalButton className="mt-4" variant="primary" touch="large" asChild>
          <Link href="/alerts">Open Alerts</Link>
        </GoalButton>
      </GoalNextStep>

      <Section title="How we reach you">
        <div className="mt-2">
          <Row label="Email" hint="Accepts and replies"><span className="text-g-meta text-g-ink-3">Always on</span></Row>
          <Row label="Alerts" hint="Your notifications inside skipwait.me"><span className="text-g-meta text-g-ink-3">In the app</span></Row>
        </div>
      </Section>

      {access.isError ? (
        <Section title="Referrer alerts">
          <GoalErrorState className="mt-3 px-0" title="We could not check your work email." body="Your referrer alert settings stay hidden until the check works. Nothing was changed." retry={{ label: "Try again", onClick: () => { void access.refetch(); } }} />
        </Section>
      ) : hasVerifiedWorkEmail(access.data) ? (
        <Section title="Referrer alerts">
          <p className="mt-2 text-g-meta text-g-ink-2">These reach you because your work email is verified. They never replace the email record above.</p>
          <div className="mt-1"><NewAskEmailRow getToken={getToken} online={online} /></div>
          <SlackAlerts getToken={getToken} online={online} />
        </Section>
      ) : null}
    </>
  );
}
