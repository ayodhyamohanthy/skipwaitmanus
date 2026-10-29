// Goal /settings > Privacy. The next step is the data export (the only action
// here that moves a user forward); every other control is a plain row below.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GoalButton, GoalNextStep } from "@/components/goal";
import { EXPORT_ERROR, downloadDataExport, fetchLatestDataExport, requestDataExport, settingsKeys, type DataExportSummary, type TokenSource } from "@/components/settings/settingsApi";
import { InlineError, InlineLink, Section } from "./settingsParts";
import { BlockedPeoplePanel, CookiePanel, TalentConsentPanel } from "./privacyPanels";

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function PrivacySection({ getToken, online }: { getToken: TokenSource; online: boolean }) {
  const queryClient = useQueryClient();
  const latest = useQuery({
    queryKey: settingsKeys.dataExport,
    queryFn: () => fetchLatestDataExport(getToken),
    refetchInterval: query => (query.state.data?.status === "requested" ? 60_000 : false),
  });
  const request = useMutation({ mutationFn: () => requestDataExport(getToken), onSettled: () => { void queryClient.invalidateQueries({ queryKey: settingsKeys.dataExport }); } });
  const download = useMutation({ mutationFn: (item: DataExportSummary) => downloadDataExport(item.id, item.fileName, getToken) });
  const current = latest.data ?? null;
  const preparing = current?.status === "requested" || request.isPending;
  const ready = current?.status === "ready" ? current : null;
  const actionError = request.error ?? download.error ?? (latest.isError ? latest.error : null);
  const offlineReason = "Reconnect to request or download your data.";

  return (
    <>
      <GoalNextStep reason="Your account data, as a ZIP of JSON files. Request it here; it is usually ready within the hour and stays available for 7 days.">
        <div className="mt-3">
          {actionError ? <InlineError>{actionError instanceof Error && actionError.message ? actionError.message : EXPORT_ERROR}</InlineError> : null}
          {current?.status === "failed" ? <InlineError>Your last export could not be prepared. You can request it again.</InlineError> : null}
          {preparing ? <p className="text-g-meta text-g-ink-2" role="status">Preparing your export. We will keep it here once it is ready.</p> : null}
          {ready ? <p className="text-g-meta text-g-ink-2" role="status">Your export is ready ({formatSize(ready.byteSize)}){ready.expiresAt ? `, available until ${new Date(ready.expiresAt).toLocaleDateString()}` : ""}.</p> : null}
          <div className="mt-4">
            {ready ? (
              <GoalButton variant="primary" touch="large" busy={download.isPending} busyLabel="Downloading…" disabledReason={!online ? offlineReason : undefined} onClick={() => download.mutate(ready)}>Download my data</GoalButton>
            ) : preparing ? (
              <GoalButton variant="primary" touch="large" busy busyLabel="Preparing…">Preparing…</GoalButton>
            ) : (
              <GoalButton variant="primary" touch="large" disabledReason={!online ? offlineReason : undefined} onClick={() => request.mutate()}>Request my data</GoalButton>
            )}
          </div>
        </div>
      </GoalNextStep>

      <div className="mt-8"><BlockedPeoplePanel getToken={getToken} online={online} /></div>
      <TalentConsentPanel />
      <CookiePanel />
      <Section title="Connected assistants">
        <p className="mt-2 text-g-meta text-g-ink-2">ChatGPT, Claude and API tokens that can use your account.</p>
        <p className="mt-2 text-g-label text-g-ink"><InlineLink href="/assistants">Manage assistants</InlineLink></p>
      </Section>
    </>
  );
}
