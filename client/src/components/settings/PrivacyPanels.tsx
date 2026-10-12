// Kit v4 Settings > Privacy: Blocked people, the binding Talent discovery
// consent, Connected assistants and Download your data. Cookie and analytics
// choices need a consent store that does not exist yet, so that kit Panel is
// left out rather than shown with switches that change nothing.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import BlockedPeople from "./BlockedPeople";
import { TalentConsentPanel } from "./TalentConsentPanel";
import { DoneNotice, ErrorNotice } from "./settingsUi";
import { EXPORT_ERROR, downloadPersonalData, type TokenSource } from "./settingsApi";

function DownloadDataPanel({ getToken }: { getToken: TokenSource }) {
  const [done, setDone] = useState(false);
  const exportData = useMutation({ mutationFn: () => downloadPersonalData(getToken), onMutate: () => setDone(false), onSuccess: () => setDone(true) });
  return <Panel>
    <Download className="mb-2 size-5" aria-hidden="true" />
    <h2 className="text-lg font-semibold">Download your data</h2>
    <p className="mt-1 text-sm text-muted-foreground">The account data we keep for you, as a JSON file. It downloads straight away.</p>
    {exportData.isError ? <ErrorNotice message={exportData.error instanceof Error && exportData.error.message ? exportData.error.message : EXPORT_ERROR} /> : null}
    {done ? <DoneNotice>Your personal data export has downloaded.</DoneNotice> : null}
    <Button variant="outline" className="mt-4" disabled={exportData.isPending} onClick={() => exportData.mutate()}>{exportData.isPending ? "Preparing export…" : "Download my data"}</Button>
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
