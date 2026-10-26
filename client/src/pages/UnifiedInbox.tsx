import { Search } from "lucide-react";
import { LoadingNote } from "@/components/app-states/SystemStates";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth, useUser } from "@/_core/auth";
import { Button } from "@/components/kit/button";
import { Heading } from "@/components/kit/preview-kit";
import { InboxEmpty, InboxLoadError, InboxThreadList } from "@/components/inbox/InboxThreadList";
import { buildInboxThreads, fetchAskingRows, fetchReferringRows, filterInboxThreads, type InboxSide } from "@/components/inbox/inboxThreads";
import { usePersistFn } from "@/hooks/usePersistFn";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";

const SIDES = [["all", "All"], ["asking", "Asking"], ["referring", "Referring"]] as const;
const HEADING = { eyebrow: "MESSAGES", title: "Inbox", text: "Conversations open when a referrer accepts. Until then, identities stay private." } as const;

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Check your connection and try again.";
}

export default function UnifiedInbox() {
  const { isLoaded, isSignedIn, getToken, openSignIn } = useAuth();
  const { user } = useUser();
  const fetchToken = usePersistFn(getToken);
  const [side, setSide] = useState<"all" | InboxSide>("all");
  const [query, setQuery] = useState("");

  // The referring side follows the server's verified-referrer verdict (shared predicate), never the
  // sign-in account's emails: an SSO account verified by one-time code is a referrer too.
  const access = useReferrerAccess();
  const isReferrer = access.status === "verified";

  const asking = useQuery({ queryKey: ["inbox", "asking", user?.id ?? null], queryFn: () => fetchAskingRows(fetchToken), enabled: Boolean(isSignedIn), retry: 1, refetchOnWindowFocus: false });
  const referring = useQuery({ queryKey: ["inbox", "referring", user?.id ?? null], queryFn: () => fetchReferringRows(fetchToken), enabled: Boolean(isSignedIn) && isReferrer, retry: 1, refetchOnWindowFocus: false });

  const threads = useMemo(() => buildInboxThreads(asking.data ?? [], referring.data ? [...referring.data.fresh, ...referring.data.completed] : []), [asking.data, referring.data]);
  const visible = useMemo(() => filterInboxThreads(threads, side, query), [threads, side, query]);

  if (!isLoaded) {
    return <main data-skipwait-screen="inbox" className="page-content"><Heading {...HEADING} /><LoadingNote>Loading your conversations…</LoadingNote></main>;
  }

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="inbox-sign-in" className="page-content">
        <Heading {...HEADING} />
        <Button className="mt-5" onClick={() => openSignIn()}>Sign in</Button>
      </main>
    );
  }

  const loading = asking.isPending || access.status === "checking" || (isReferrer && referring.isPending);
  // A failed verification check is a failed source, not "not a referrer".
  const failed = [asking.isError ? asking.error : null, access.status === "error" ? access.error : null, isReferrer && referring.isError ? referring.error : null].filter(error => error !== null);
  const retrying = asking.isFetching || referring.isFetching || (access.status === "error" && access.retrying);
  const retry = () => { if (asking.isError) void asking.refetch(); if (access.status === "error") access.retry(); if (referring.isError) void referring.refetch(); };
  // Rows that did load stay visible; a failed source is never shown as an empty inbox.
  const partial = failed.length > 0 && threads.length > 0;

  return (
    <main data-skipwait-screen="inbox" className="page-content">
      <Heading {...HEADING} />

      <div className="mb-4 mt-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-muted p-1 text-sm" role="tablist" aria-label="Inbox side">
          {SIDES.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={side === value} onClick={() => setSide(value)} className={`min-h-9 rounded-full px-4 ${side === value ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>{label}</button>)}
        </div>
        <label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><span className="sr-only">Search conversations</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search" className="h-11 w-full rounded-full border border-input bg-background pl-9 pr-4" /></label>
      </div>

      {failed.length > 0 ? <InboxLoadError message={errorMessage(failed[0])} partial={partial} retrying={retrying} onRetry={retry} /> : null}
      {loading && threads.length === 0 ? <LoadingNote>Loading your conversations…</LoadingNote> : null}
      {!loading && failed.length === 0 && visible.length === 0 ? <InboxEmpty filtered={threads.length > 0} /> : null}
      {partial && visible.length === 0 ? <InboxEmpty filtered /> : null}
      {visible.length > 0 ? <InboxThreadList threads={visible} /> : null}
    </main>
  );
}
