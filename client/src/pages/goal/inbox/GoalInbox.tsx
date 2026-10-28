// /inbox on the goal UI (D-048-p3-inbox, D-150): the user's goal first, one
// "Your next step" block holding the page's only black commit, everything else
// dot + text. The data contract is unchanged - buildInboxThreads keeps the
// pre-acceptance privacy rule (no seeker identity before a referrer's own
// acceptance) and both list fetches stay exactly the kit page's calls, so this
// surface adds no API, credit or privacy rule of its own.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { LockKeyhole } from "lucide-react";
import { useAuth, useUser } from "@/_core/auth";
import {
  GoalButton,
  GoalFilterChip,
  GoalListSection,
  GoalNextStep,
  GoalSearchInput,
  GoalSkeletonRows,
  useOnlineStatus,
} from "@/components/goal";
import {
  buildInboxThreads,
  fetchAskingRows,
  fetchReferringRows,
  filterInboxThreads,
  type InboxSide,
  type InboxThread,
} from "@/components/inbox/inboxThreads";
import { usePersistFn } from "@/hooks/usePersistFn";
import { useSlowLoad } from "@/hooks/useSlowLoad";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import { ThreadRow, splitByOwner } from "./inboxRows";

export const GOAL_PAGE = { goalLine: "Keep your referrals moving." };
const SUBTITLE = "Every referrer is work-email verified. Names stay private until they accept.";

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Check your connection and try again.";
}

type NextStep =
  | { kind: "link"; reason: string; detail: string; label: string; href: string }
  | { kind: "reset"; reason: string; detail: string; label: string };

/** The single next step for what the reader can actually do right now. */
function planNextStep(threads: readonly InboxThread[], visible: readonly InboxThread[]): NextStep {
  const reply = visible.find(thread => thread.unread > 0);
  if (reply) return { kind: "link", reason: reply.who, detail: `${reply.unread} unread message${reply.unread === 1 ? "" : "s"}.`, label: "Reply", href: reply.href };
  const review = visible.find(thread => thread.side === "referring" && thread.pill === "Requested");
  if (review) return { kind: "link", reason: review.who, detail: `A new ask at ${review.companyName} is waiting for your decision.`, label: "Review the ask", href: review.href };
  if (visible.length === 0 && threads.length > 0) {
    return { kind: "reset", reason: "No matching conversations.", detail: "Try another search, or switch between Asking and Referring.", label: "Show all conversations" };
  }
  if (threads.length === 0) {
    return { kind: "link", reason: "No conversations yet.", detail: "They open when a referrer accepts your ask. Send one ask to one company.", label: "Find a referrer", href: "/explore" };
  }
  return { kind: "link", reason: "Nothing needs you right now.", detail: "A reply or a new ask appears here when it does. Until then, one more good ask moves you faster.", label: "Find a referrer", href: "/explore" };
}

function PageHeading() {
  return (
    <header className="grid gap-1 px-4 pt-6 pb-1 gdesk:px-5 gdesk:pt-7 gdesk:pb-2">
      <h1 className="text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
      <p className="text-g-body text-g-ink-2">{SUBTITLE}</p>
    </header>
  );
}

/** The one bordered block: its heading, the reason in words, then the page's only black commit. */
function NextStepBlock({ plan, onReset }: { plan: NextStep; onReset(): void }) {
  return (
    <div className="mx-4 my-5 gdesk:mx-5">
      <GoalNextStep reason={plan.reason}>
        <p className="mt-2 text-g-meta text-g-ink-2">{plan.detail}</p>
        <GoalButton variant="primary" asChild={plan.kind === "link"} className="mt-4" onClick={plan.kind === "reset" ? onReset : undefined}>
          {plan.kind === "link" ? <Link href={plan.href}>{plan.label}</Link> : plan.label}
        </GoalButton>
      </GoalNextStep>
    </div>
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
        <div className="mx-4 my-5 gdesk:mx-5">
          <GoalNextStep reason="Sign in to read and reply. Conversations stay private until a referrer accepts.">
            <GoalButton variant="primary" leadingIcon={LockKeyhole} className="mt-4" onClick={() => openSignIn()}>Sign in</GoalButton>
          </GoalNextStep>
        </div>
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
  const { waitingOnYou, waitingOnThem } = splitByOwner(threads, side);
  const plan = planNextStep(threads, visible);

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

      {!showSkeleton && failed.length > 0 && !partial ? (
        <div className="mx-4 my-5 gdesk:mx-5">
          <GoalNextStep reason={`We couldn't load your inbox. ${errorMessage(failed[0])}. Your conversations are still there — nothing was lost.`}>
            <GoalButton variant="primary" className="mt-4" onClick={retry} busy={retrying} busyLabel="Trying again…">Try again</GoalButton>
          </GoalNextStep>
        </div>
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

      {!showSkeleton && !(failed.length > 0 && !partial) ? (
        <>
          <NextStepBlock plan={plan} onReset={() => { setQuery(""); setSide("all"); }} />
          {threads.length > 0 ? (
            <div className="mx-4 mb-3 flex flex-wrap items-center gap-2 gdesk:mx-5">
              <GoalFilterChip label="All" pressed={side === "all"} onPressedChange={pressed => { if (pressed) setSide("all"); }} count={threads.length} />
              <GoalFilterChip label="Asking" pressed={side === "asking"} onPressedChange={pressed => { if (pressed) setSide("asking"); }} count={threads.filter(thread => thread.side === "asking").length} />
              {isReferrer ? <GoalFilterChip label="Referring" pressed={side === "referring"} onPressedChange={pressed => { if (pressed) setSide("referring"); }} count={threads.filter(thread => thread.side === "referring").length} /> : null}
              <span className="min-w-40 flex-1"><GoalSearchInput label="Search conversations" value={query} onChange={setQuery} placeholder="Search" /></span>
            </div>
          ) : null}
          {visible.length > 0 ? (
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
          ) : null}
        </>
      ) : null}
    </main>
  );
}
