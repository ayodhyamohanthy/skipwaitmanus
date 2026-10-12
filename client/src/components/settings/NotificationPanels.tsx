// Kit v4 Settings > Notifications. Per-event notification choices need a
// preferences store that does not exist yet, so this section shows the
// channels SkipWait really uses: email (always on), Alerts in the app, and the
// opt-in Slack review channel for verified referrers.
import { Bell } from "lucide-react";
import { Link } from "wouter";
import { Panel } from "@/components/kit/preview-kit";
import { SettingsRow } from "./settingsUi";
import { SlackReviewAlerts } from "./SlackReviewAlerts";
import { hasVerifiedWorkEmail, type TokenSource } from "./settingsApi";
import { useCompanyAccess } from "./settingsQueries";

export function NotificationPanels({ getToken }: { getToken: TokenSource }) {
  const access = useCompanyAccess(getToken);
  return <Panel>
    <Bell className="mb-2 size-5" aria-hidden="true" />
    <h2 className="text-lg font-semibold">How we reach you</h2>
    <div className="mt-2">
      <SettingsRow label="Email" hint="Accepts and replies"><span className="shrink-0 text-sm text-muted-foreground">Always on</span></SettingsRow>
      <SettingsRow label="Alerts" hint="Your notifications inside SkipWait"><Link href="/alerts" className="text-link shrink-0">Open Alerts</Link></SettingsRow>
      {hasVerifiedWorkEmail(access.data) ? <SlackReviewAlerts getToken={getToken} /> : null}
    </div>
  </Panel>;
}
