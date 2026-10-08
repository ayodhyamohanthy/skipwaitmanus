import { ArrowRight, Inbox as InboxIcon, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth, useUser } from "@/_core/auth";
import { Button } from "@/components/kit/button";
import { Heading } from "@/components/kit/preview-kit";
import { InboxEmpty, InboxLoadError, InboxThreadList } from "@/components/inbox/InboxThreadList";
import { buildInboxThreads, fetchAskingRows, fetchReferringRows, filterInboxThreads, type InboxSide } from "@/components/inbox/inboxThreads";
import { usePersistFn } from "@/hooks/usePersistFn";

const PERSONAL = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "proton.me"]);
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

  const hasVerifiedWorkEmail = Boolean(user?.emailAddresses?.some(address => {
    const domain = address.emailAddress.trim().toLowerCase().split("@")[1];
    return address.verification?.status === "verified" && domain && !PERSONAL.has(domain);
  }));

  const asking = useQuery({ queryKey: ["inbox", "asking", user?.id ?? null], queryFn: () => fetchAskingRows(fetchToken), enabled: Boolean(isSignedIn), retry: 1, refetchOnWindowFocus: false });
  const referring = useQuery({ queryKey: ["inbox", "referring", user?.id ?? null], queryFn: () => fetchReferringRows(fetchToken), enabled: Boolean(isSignedIn) && hasVerifiedWorkEmail, retry: 1, refetchOnWindowFocus: false });

  const threads = useMemo(() => buildInboxThreads(asking.data ?? [], referring.data ? [...referring.data.fresh, ...referring.data.completed] : []), [asking.data, referring.data]);
  const visible = useMemo(() => filterInboxThreads(threads, side, query), [threads, side, query]);
  const queueCount = hasVerifiedWorkEmail ? referring.data?.fresh.length ?? 0 : 0;

  if (!isLoaded) {
    return <main data-skipwait-screen="inbox" className="page-content"><Heading {...HEADING} /><p role="status" className="mt-10 text-center text-sm text-muted-foreground">Loading your conversations…</p></main>;
  }

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="inbox-sign-in" className="page-content">
        <Heading {...HEADING} />
        <Button className="mt-5" onClick={() => openSignIn()}>Sign in</Button>
      </main>
    );
  }

  const loading = asking.isPending || (hasVerifiedWorkEmail && referring.isPending);
  const failed = [asking.isError ? asking.error : null, hasVerifiedWorkEmail && referring.isError ? referring.error : null].filter(error => error !== null);
  const retrying = asking.isFetching || referring.isFetching;
  const retry = () => { if (asking.isError) void asking.refetch(); if (referring.isError) void referring.refetch(); };
  // Rows that did load stay visible; a failed source is never shown as an empty inbox.
  const partial = failed.length > 0 && threads.length > 0;

  return (
    <main data-skipwait-screen="inbox" className="page-content">
      <Heading {...HEADING} />

      {queueCount > 0 ? (
        <Link href="/queue" className="mt-5 flex min-h-20 items-center gap-3 rounded-3xl border border-border bg-primary/5 p-4 hover:bg-muted">
          <InboxIcon className="size-5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Review queue · {queueCount} new {queueCount === 1 ? "ask" : "asks"} waiting</span><span className="block text-sm text-muted-foreground">Decide as a referrer — your identity stays hidden.</span></span>
          <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
        </Link>
      ) : null}

      <div className="mb-4 mt-5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-muted p-1 text-sm" role="tablist" aria-label="Inbox side">
          {SIDES.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={side === value} onClick={() => setSide(value)} className={`min-h-11 rounded-full px-4 ${side === value ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>{label}</button>)}
        </div>
        <label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><span className="sr-only">Search conversations</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search" className="h-11 w-full rounded-full border border-input bg-background pl-9 pr-4" /></label>
      </div>

      {failed.length > 0 ? <InboxLoadError message={errorMessage(failed[0])} partial={partial} retrying={retrying} onRetry={retry} /> : null}
      {loading && threads.length === 0 ? <p role="status" className="mt-10 text-center text-sm text-muted-foreground">Loading your conversations…</p> : null}
      {!loading && failed.length === 0 && visible.length === 0 ? <InboxEmpty filtered={threads.length > 0} /> : null}
      {partial && visible.length === 0 ? <InboxEmpty filtered /> : null}
      {visible.length > 0 ? <InboxThreadList threads={visible} /> : null}
    </main>
  );
}
