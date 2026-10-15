// Kit v4 Settings > Privacy: Blocked people, the binding Talent discovery
// consent, Connected assistants and Download your data. Cookie and analytics
// choices need a consent store that does not exist yet, so that kit Panel is
// left out rather than shown with switches that change nothing.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import BlockedPeople from "./BlockedPeople";
import { TalentConsentPanel } from "./TalentConsentPanel";
import { ErrorNotice } from "./settingsUi";
import { EXPORT_ERROR, downloadDataExport, fetchLatestDataExport, requestDataExport, settingsKeys, type DataExportSummary, type TokenSource } from "./settingsApi";

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function DownloadDataPanel({ getToken }: { getToken: TokenSource }) {
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
  const error = request.error ?? download.error;
  return <Panel>
    <Download className="mb-2 size-5" aria-hidden="true" />
    <h2 className="text-lg font-semibold">Download your data</h2>
    <p className="mt-1 text-sm text-muted-foreground">The account data we keep for you, as a ZIP of JSON files. Request it here; it is usually ready within the hour and stays available for 7 days.</p>
    {error ? <ErrorNotice message={error instanceof Error && error.message ? error.message : EXPORT_ERROR} /> : null}
    {current?.status === "failed" ? <ErrorNotice message="Your last export could not be prepared. You can request it again." /> : null}
    {preparing ? <p className="mt-3 text-sm" role="status">Preparing your export. We will keep it here once it is ready.</p> : null}
    {ready ? <p className="mt-3 text-sm" role="status">Your export is ready ({formatSize(ready.byteSize)}){ready.expiresAt ? `, available until ${new Date(ready.expiresAt).toLocaleDateString()}` : ""}.</p> : null}
    {ready ? <Button variant="outline" className="mt-4" disabled={download.isPending} onClick={() => download.mutate(ready)}>{download.isPending ? "Downloading…" : "Download my data"}</Button> : null}
    {!ready && !preparing ? <Button variant="outline" className="mt-4" onClick={() => request.mutate()}>Request my data</Button> : null}
  </Panel>;
}

export function PrivacyPanels({ getToken }: { getToken: TokenSource }) {
  return <>
    <BlockedPeople />
    <TalentConsentPanel />
    <Panel>
      <h2 className="text-lg font-semibold">Connected assistants</h2>
      <p className="mt-1 text-sm text-muted-foreground">ChatGPT, Claude and API tokens that can use your account.</p>
      <Link href="/assistants" className="text-link mt-2 inline-block text-sm">Manage assistants</Link>
    </Panel>
    <DownloadDataPanel getToken={getToken} />
  </>;
}
