// /inbox moved in place to the goal UI (D-048-p3-inbox, D-149). One screen,
// one job: the conversation that needs you is on top, everything else reads
// as dot + text. The data contract is unchanged: buildInboxThreads keeps the
// pre-acceptance privacy rule (no seeker identity before a referrer's own
// acceptance) and both list fetches stay exactly the kit's calls.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { LockKeyhole } from "lucide-react";
import { useAuth, useUser } from "@/_core/auth";
import {
  GoalButton,
  GoalCompanyMark,
  GoalEmptyState,
  GoalErrorState,
  GoalFilterChip,
  GoalListSection,
  GoalNum,
  GoalSearchInput,
  GoalSkeletonRows,
  GoalStatus,
  useOnlineStatus,
  type GoalStatusValue,
} from "@/components/goal";
import {
  buildInboxThreads,
  fetchAskingRows,
  fetchReferringRows,
  filterInboxThreads,
  timeAgo,
  type InboxSide,
  type InboxThread,
} from "@/components/inbox/inboxThreads";
import { usePersistFn } from "@/hooks/usePersistFn";
import { useSlowLoad } from "@/hooks/useSlowLoad";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";

const HEADING = "Keep your referrals moving.";
const SUBTITLE = "Every referrer is work-email verified. Names stay private until they accept.";

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Check your connection and try again.";
}

/** The dot + text vocabulary of My asks and the conversation, keyed off the model's kit status. */
function threadView(thread: InboxThread): { status: GoalStatusValue; label: string } {
  if (thread.side === "referring" && thread.pill === "Requested") return { status: "queue_new", label: "New ask" };
  switch (thread.pill) {
    case "Accepted": return { status: "accepted", label: "Accepted" };
    case "Referred": return { status: "referred", label: "Referred" };
    case "Interviewing": return { status: "accepted", label: "Interviewing" };
    case "Offer": return { status: "accepted", label: "Offer" };
    case "Closed": return { status: "withdrawn", label: "Closed" };
    case "Expired": return { status: "expired", label: "Expired" };
    case "Declined": return { status: "expired", label: "Declined" };
    case "Withdrawn": return { status: "withdrawn", label: "Withdrawn" };
    default: return { status: "waiting", label: "Waiting" };
  }
}

/** The thread that needs the reader first: an unread reply, then a fresh ask to review. */
function needsYou(thread: InboxThread): boolean {
  return thread.unread > 0 || (thread.side === "referring" && thread.pill === "Requested");
}

function ThreadRow({ thread }: { thread: InboxThread }) {
  const view = threadView(thread);
  return (
    <li data-testid="goal-list-row">
      <Link
        href={thread.href}
        aria-label={`${thread.who}, ${thread.role}, ${view.label}${thread.unread ? `, ${thread.unread} unread` : ""}`}
        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-g-tile px-3 py-3 text-left hover:bg-g-surface-hover"
      >
        <span className="row-span-2"><GoalCompanyMark initials={thread.mark} /></span>
        <span className="min-w-0 truncate text-g-label text-g-ink">{thread.who}</span>
        <span className="justify-self-end"><GoalStatus status={view.status} label={view.label} /></span>
        <span className="min-w-0 truncate text-g-meta text-g-ink-2">{thread.role} · {thread.note}</span>
        <span className="justify-self-end whitespace-nowrap text-g-meta text-g-ink-3"><GoalNum>{timeAgo(thread.updatedAt)}</GoalNum></span>
      </Link>
    </li>
  );
}

/** One bordered block, one black commit: the single most important pending conversation. */
function NextStep({ threads }: { threads: readonly InboxThread[] }) {
  const replyTarget = threads.find(thread => thread.unread > 0);
  const reviewTarget = threads.find(thread => thread.side === "referring" && thread.pill === "Requested");
  const target = replyTarget ?? reviewTarget ?? null;
  const label = replyTarget ? "Reply" : reviewTarget ? "Review the ask" : "Find a referrer";
  const href = target ? target.href : "/explore";
  const detail = replyTarget
    ? `${replyTarget.who}: ${replyTarget.unread} unread message${replyTarget.unread === 1 ? "" : "s"}.`
    : reviewTarget
      ? `A new ask at ${reviewTarget.companyName} is waiting for your decision.`
      : "Conversations open when a referrer accepts your ask. Start with one company and one great ask.";
  return (
    <section aria-labelledby="inbox-next-step" className="mx-4 my-5 border border-g-hairline p-4 gdesk:mx-5">
      <h2 id="inbox-next-step" className="text-g-heading text-g-ink">Your next step</h2>
      {target ? <p className="mt-2 text-g-label text-g-ink">{target.who}</p> : null}
      <p className="mt-2 text-g-meta text-g-ink-2">{detail}</p>
      <GoalButton variant="primary" asChild className="mt-4">
        <Link href={href}>{label}</Link>
      </GoalButton>
    </section>
  );
}

function PageHeading() {
  return (
    <header className="grid gap-1 px-4 pt-6 pb-1 gdesk:px-5 gdesk:pt-7 gdesk:pb-2">
      <h1 className="text-g-display text-g-ink">{HEADING}</h1>
      <p className="text-g-body text-g-ink-2">{SUBTITLE}</p>
    </header>
  );
}

export default function GoalInbox() {
  const { isLoaded, isSignedIn, getToken, openSignIn } = useAuth();
  const { user } = useUser();
  const fetchToken = usePersistFn(getToken);
  const online = useOnlineStatus();
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
    return (
      <main data-skipwait-screen="inbox" data-skipwait-loading="true" className="g-scope pb-10">
        <PageHeading />
        <GoalSkeletonRows density="ask" count={3} className="mt-4" />
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="inbox-sign-in" className="g-scope pb-10">
        <PageHeading />
        <section aria-labelledby="inbox-sign-in" className="mx-4 my-6 border border-g-hairline p-4 gdesk:mx-5">
          <h2 id="inbox-sign-in" className="text-g-heading text-g-ink">Your next step</h2>
          <p className="mt-2 text-g-meta text-g-ink-2">Sign in to read and reply. Conversations stay private until a referrer accepts.</p>
          <GoalButton variant="primary" leadingIcon={LockKeyhole} className="mt-4" onClick={() => openSignIn()}>Sign in</GoalButton>
        </section>
      </main>
    );
  }

  const loading = asking.isPending || access.status === "checking" || (isReferrer && referring.isPending);
  const { showSkeleton, isSlow } = useSlowLoad(loading && threads.length === 0);
  // A failed verification check is a failed source, not "not a referrer".
  const failed = [asking.isError ? asking.error : null, access.status === "error" ? access.error : null, isReferrer && referring.isError ? referring.error : null].filter(error => error !== null);
  const retrying = asking.isFetching || referring.isFetching || (access.status === "error" && access.retrying);
  const retry = () => { if (asking.isError) void asking.refetch(); if (access.status === "error") access.retry(); if (referring.isError) void referring.refetch(); };
  // Rows that did load stay visible; a failed source is never shown as an empty inbox.
  const partial = failed.length > 0 && threads.length > 0;

  const waitingOnYou = visible.filter(needsYou);
  const waitingOnThem = visible.filter(thread => !needsYou(thread));

  return (
    <main data-skipwait-screen="inbox" className="g-scope pb-10">
      <PageHeading />

      {showSkeleton ? (
        <div role="status" aria-busy="true" aria-live="polite" data-skipwait-loading="true" className="mt-4">
          <p className="sr-only">Loading your conversations…</p>
          <GoalSkeletonRows density="ask" count={3} />
          {isSlow ? <p data-skipwait-loading-slow="true" className="px-3 pt-3 text-g-meta text-g-ink-2">This is taking longer than expected. Nothing was lost — you can keep waiting or come back in a moment.</p> : null}
        </div>
      ) : null}

      {!online && !loading ? (
        <p role="status" className="mx-4 mt-4 text-g-meta text-g-ink-2 gdesk:mx-5">You&apos;re offline. Reading still works; new messages load when you&apos;re back.</p>
      ) : null}

      {failed.length > 0 && !partial ? (
        <GoalErrorState
          className="mt-2"
          title="We couldn't load your inbox"
          body={`${errorMessage(failed[0])}. Your conversations are still there — nothing was lost.`}
          retry={{ label: "Try again", onClick: retry }}
        />
      ) : null}

      {partial ? (
        <div role="alert" className="mx-4 mt-4 flex flex-wrap items-center gap-3 border border-g-hairline p-4 gdesk:mx-5">
          <span aria-hidden="true" className="size-(--g-dot) shrink-0 rounded-full bg-g-crimson" />
          <span className="min-w-0 flex-1">
            <span className="block text-g-label text-g-ink">Some conversations could not load.</span>
            <span className="block text-g-meta text-g-ink-2">{errorMessage(failed[0])}</span>
          </span>
          <GoalButton size="sm" variant="ghost" onClick={retry} busy={retrying} busyLabel="Retrying…">Try again</GoalButton>
        </div>
      ) : null}

      {!loading && !(failed.length > 0 && !partial) && visible.length > 0 ? (
        <>
          <NextStep threads={visible} />
          <div className="mx-4 mb-3 flex flex-wrap items-center gap-2 gdesk:mx-5">
            <GoalFilterChip label="All" pressed={side === "all"} onPressedChange={pressed => { if (pressed) setSide("all"); }} count={threads.length} />
            <GoalFilterChip label="Asking" pressed={side === "asking"} onPressedChange={pressed => { if (pressed) setSide("asking"); }} count={threads.filter(thread => thread.side === "asking").length} />
            {isReferrer ? <GoalFilterChip label="Referring" pressed={side === "referring"} onPressedChange={pressed => { if (pressed) setSide("referring"); }} count={threads.filter(thread => thread.side === "referring").length} /> : null}
            <span className="min-w-40 flex-1"><GoalSearchInput label="Search conversations" value={query} onChange={setQuery} placeholder="Search" /></span>
          </div>
          <div className="px-1 gdesk:px-2">
            {waitingOnYou.length > 0 ? (
              <GoalListSection label="Waiting on you" count={waitingOnYou.length}>
                {waitingOnYou.map(thread => <ThreadRow key={thread.key} thread={thread} />)}
              </GoalListSection>
            ) : null}
            {waitingOnThem.length > 0 ? (
              <GoalListSection label="Waiting on them" count={waitingOnThem.length}>
                {waitingOnThem.map(thread => <ThreadRow key={thread.key} thread={thread} />)}
              </GoalListSection>
            ) : null}
          </div>
        </>
      ) : null}

      {!loading && failed.length === 0 && visible.length === 0 ? (
        threads.length > 0 ? (
          <section className="px-4 pt-6 gdesk:px-5" aria-labelledby="inbox-no-match">
            <h2 id="inbox-no-match" className="text-g-label text-g-ink">No matching conversations.</h2>
            <p className="mt-1 text-g-meta text-g-ink-2">Try another search, or switch between Asking and Referring.</p>
          </section>
        ) : (
          <GoalEmptyState
            title="No conversations yet."
            body="Send an ask to a verified referrer. When they accept, you'll talk here."
            action={{ label: "Find a referrer", href: "/explore" }}
          />
        )
      ) : null}
      {partial && visible.length === 0 ? (
        <section className="px-4 pt-6 gdesk:px-5" aria-labelledby="inbox-no-match-partial">
          <h2 id="inbox-no-match-partial" className="text-g-label text-g-ink">No matching conversations.</h2>
          <p className="mt-1 text-g-meta text-g-ink-2">Try another search, or switch between Asking and Referring.</p>
        </section>
      ) : null}
    </main>
  );
}
