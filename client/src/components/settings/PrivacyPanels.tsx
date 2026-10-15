// Kit v4 Settings > Privacy: Blocked people, the binding Talent discovery
// consent, Cookies & analytics (Essential locked, Product analytics stored on
// the device and driving Clarity; client error reports are not gated),
// Connected assistants and Download your data.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import BlockedPeople from "./BlockedPeople";
import { TalentConsentPanel } from "./TalentConsentPanel";
import { ErrorNotice } from "./settingsUi";
import { readCookieConsent, saveCookieConsent } from "@/components/CookieConsent";
import { EXPORT_ERROR, downloadDataExport, fetchLatestDataExport, requestDataExport, settingsKeys, type DataExportSummary, type TokenSource } from "./settingsApi";

/** Cookies & analytics: Essential is always on; Product analytics is the only optional category and is stored on this device. */
function CookiePanel() {
  const [analytics, setAnalytics] = useState(() => readCookieConsent() === "all");
  const toggle = () => { const next = !analytics; saveCookieConsent(next ? "all" : "essential"); setAnalytics(next); };
  const row = "flex w-full items-center justify-between gap-3 py-2 text-left";
  return <Panel>
    <h2 className="text-lg font-semibold">Cookies &amp; analytics</h2>
    <p className="mt-1 text-sm text-muted-foreground">Saved on this device only. Never sold, never used for ads.</p>
    <div className="mt-3 divide-y">
      <div className={row}><span className="text-sm"><strong className="block">Essential</strong><small className="block text-muted-foreground">Keeps you signed in and the site working. Always on.</small></span><span className="text-sm text-muted-foreground">Always on</span></div>
      <button type="button" role="switch" aria-checked={analytics} aria-label="Product analytics" onClick={toggle} className={row}><span className="text-sm"><strong className="block">Product analytics</strong><small className="block text-muted-foreground">Anonymous usage recordings that help us fix and improve SkipWait.</small></span><span className="text-sm font-medium">{analytics ? "On" : "Off"}</span></button>
    </div>
  </Panel>;
}

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
    <CookiePanel />
    <Panel>
      <h2 className="text-lg font-semibold">Connected assistants</h2>
      <p className="mt-1 text-sm text-muted-foreground">ChatGPT, Claude and API tokens that can use your account.</p>
      <Link href="/assistants" className="text-link mt-2 inline-block text-sm">Manage assistants</Link>
    </Panel>
    <DownloadDataPanel getToken={getToken} />
  </>;
}
