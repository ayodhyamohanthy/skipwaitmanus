// My asks (D-048 phase 3; approved comp design/goal-ui/pick/my-asks.*): the seeker's asks in one list, grouped
// Active and Closed, with the opened ask on desktop (stepper, next step, credit line, history, withdraw). Phones show
// the list; a row opens the ask's thread. Data: GET /mine (+ displayRef) and the seeker's own ledger rows.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Plus } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/auth";
import { AppShell } from "@/components/AppShell";
import {
  GoalButton,
  GoalConfirmDialog,
  GoalEmptyState,
  GoalErrorState,
  GoalListRow,
  GoalListSection,
  GoalNum,
  GoalSkeletonRows,
  GoalStatus,
  GoalStepper,
  useGoalDesktop,
  useOnlineStatus,
} from "@/components/goal";
import { usePersistFn } from "@/hooks/usePersistFn";
import { formatDay } from "@/lib/displayPrefs";
import { CREDIT_ENDED_CAVEAT } from "@shared/moneyCopy";
import { fetchMyAsks, fetchSeekerLedger, withdrawAsk } from "./myAsksApi";
import { groupAskViews, indexLedger, slotsLine, toAskView, type AskView } from "./myAsksModel";

const formatDate = (iso: string) => formatDay(iso) ?? "—";
const OFFLINE = "You’re offline. Withdrawing needs a connection.";

function AskDetail({ view, online, onWithdraw }: { view: AskView; online: boolean; onWithdraw: () => void }) {
  const titleId = `ask-${view.id}-title`;
  return (
    <article aria-labelledby={titleId} data-testid="goal-ask-detail" className="max-w-[calc(var(--g-detail-max)+80px)] px-10 pb-10 pt-9">
      {view.ref ? <p className="g-num text-g-ink-3">{view.ref}</p> : null}
      <h2 id={titleId} className="mt-1 text-balance text-g-heading text-g-ink">
        {view.company} <span className="text-g-ink-3">{view.role}</span>
      </h2>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <GoalStatus status={view.status} label={view.label} className="text-g-label" />
        <span className="text-g-meta text-g-ink-2">{view.statusLine}</span>
        <span className="ml-auto text-g-meta text-g-ink-3">
          {view.date.label} <GoalNum className="text-g-ink-2">{formatDate(view.date.at)}</GoalNum>
        </span>
      </div>
      <div className="mt-6">
        <GoalStepper stage={view.stage} status={view.status} label={view.label} terminal={view.terminal ?? undefined} />
      </div>
      <p className="mt-6 text-pretty text-g-body text-g-ink">{view.next}</p>
      {view.credit ? (
        <p className="mt-3 text-pretty text-g-meta text-g-ink-2">
          <Coins aria-hidden="true" className="mr-2 inline-block size-4 align-[-3px] text-g-ink-3" strokeWidth={1.75} />
          <span className="text-g-label text-g-ink">{view.credit.label}</span>
          {view.credit.detail ? <> <span aria-hidden="true" className="px-1">·</span> {view.credit.detail}</> : null}
        </p>
      ) : null}
      <ol aria-label="History" className="mt-7 grid gap-3 border-t border-g-hairline pt-5">
        {view.history.map((item, index) => (
          <li key={index} className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 text-g-meta">
            <span className={item.tense === "current" ? "g-num text-g-ink-2" : "g-num text-g-ink-3"}>{item.at ? formatDate(item.at) : ""}</span>
            <span className={item.tense === "current" ? "font-semibold text-g-ink" : item.tense === "future" ? "text-g-ink-3" : "text-g-ink-2"}>
              {item.text}
              {item.credit ? <span className="mt-0.5 block font-medium text-g-ink-3">{item.credit}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {view.canWithdraw || view.hasConversation || view.needsCredit ? (
        <div className="mt-7 flex flex-wrap gap-2 border-t border-g-hairline pt-4">
          {view.needsCredit ? (
            <GoalButton asChild variant="ghost" className="-ml-3.5">
              <Link href="/plans">Add a credit</Link>
            </GoalButton>
          ) : null}
          {view.hasConversation ? (
            <GoalButton asChild variant="ghost" className="-ml-3.5">
              <Link href={view.conversationHref}>Open conversation</Link>
            </GoalButton>
          ) : null}
          {view.canWithdraw ? (
            <GoalButton variant="ghost" className={view.needsCredit ? undefined : "-ml-3.5"} disabledReason={online ? undefined : OFFLINE} onClick={onWithdraw}>
              Withdraw
            </GoalButton>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default function MyAsks() {
  const { isLoaded, isSignedIn, userId, getToken, openSignIn } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const desktop = useGoalDesktop();
  const online = useOnlineStatus();
  const [, navigate] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const scope = userId ?? "session";
  const asksQuery = useQuery({ queryKey: ["requests", "mine", scope], enabled: Boolean(isSignedIn), retry: false, queryFn: () => fetchMyAsks(fetchToken) });
  const ledgerQuery = useQuery({ queryKey: ["credits", "ledger", "job_seeker", scope], enabled: Boolean(isSignedIn), retry: false, queryFn: () => fetchSeekerLedger(fetchToken) });
  const [confirming, setConfirming] = useState<AskView | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState("");
  const [notice, setNotice] = useState("");

  const asks = asksQuery.data?.asks ?? [];
  const ledger = useMemo(() => indexLedger(ledgerQuery.data ?? []), [ledgerQuery.data]);
  const views = useMemo(() => asks.map(ask => toAskView(ask, ledger.get(ask.id), formatDate)), [asks, ledger]);
  const groups = useMemo(() => groupAskViews(views, asks), [views, asks]);
  const requested = Number(new URLSearchParams(search).get("ask"));
  const selected = views.find(view => view.id === requested) ?? groups.active[0] ?? groups.closed[0] ?? null;
  const select = (id: number) => navigate(`/requests?ask=${id}`, { replace: true });

  const withdraw = async () => {
    if (!confirming || withdrawing) return;
    setWithdrawing(true);
    setWithdrawError("");
    try {
      await withdrawAsk(confirming.id, fetchToken);
      setNotice(`Withdrawn. Your ask to ${confirming.company} is closed and its open slot is free again.`);
      setConfirming(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["requests", "mine"] }),
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
      ]);
    } catch (reason) {
      setWithdrawError(reason instanceof Error ? reason.message : "We couldn’t withdraw this ask");
    } finally {
      setWithdrawing(false);
    }
  };

  const header = (
    <div className="grid gap-1 px-5 pb-2 pt-7 max-gdesk:px-4 max-gdesk:pb-1 max-gdesk:pt-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-g-display text-g-ink">My asks</h1>
        <GoalButton asChild variant="primary" className="max-gdesk:pl-3">
          <Link href="/explore">
            <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
            Ask for a referral
          </Link>
        </GoalButton>
      </div>
      <p className="text-pretty text-g-body text-g-ink-2">Where each ask stands and what happens next.</p>
      {asksQuery.data?.slots ? <p className="mt-1 text-g-meta text-g-ink-2">{slotsLine(asksQuery.data.slots)}</p> : null}
      {notice ? <p role="status" className="mt-2 text-g-meta text-g-ink">{notice}</p> : null}
    </div>
  );

  let list: ReactNode;
  if (!isLoaded || (isSignedIn && asksQuery.isPending)) list = <GoalSkeletonRows density="ask" count={4} label="Loading your asks" />;
  else if (!isSignedIn) {
    list = (
      <div className="grid justify-items-start gap-1 px-5 py-6 max-gdesk:px-4">
        <p className="text-g-label text-g-ink">Sign in to see your asks.</p>
        <p className="text-g-meta text-g-ink-2">Your asks and their status stay private to you.</p>
        <div className="mt-2">
          <GoalButton variant="ghost" size="sm" className="-ml-3" onClick={() => openSignIn({ returnTo: "/requests" })}>Sign in</GoalButton>
        </div>
      </div>
    );
  } else if (asksQuery.isError) {
    list = <GoalErrorState title="We couldn’t load your asks" body="Your asks are still active and nothing was lost." retry={{ label: "Try again", onClick: () => { void asksQuery.refetch(); } }} />;
  } else if (views.length === 0) {
    list = <GoalEmptyState title="No asks yet." body="Pick a company, find a verified referrer, and write one great ask." />;
  } else {
    const row = (view: AskView) => (
      <GoalListRow
        key={view.id}
        density="ask"
        selectable={desktop}
        selected={selected?.id === view.id}
        href={desktop ? undefined : view.conversationHref}
        onSelect={desktop ? () => select(view.id) : undefined}
        aria-label={`${view.company}, ${view.role}, ${view.label}`}
        testId={`goal-ask-row-${view.id}`}
        title={view.company}
        trailing={<GoalStatus status={view.status} label={view.label} stepper={{ stage: view.stage, terminal: view.terminal ?? undefined }} />}
        meta={view.role}
        metaTrailing={
          <>
            {view.date.label} <GoalNum className="text-g-ink-2">{formatDate(view.date.at)}</GoalNum>
          </>
        }
        footer={
          <>
            {view.section === "closed" && view.credit ? (
              <>
                <span className="text-g-ink">{view.credit.label}</span>
                <span aria-hidden="true" className="px-1.5">·</span>
              </>
            ) : null}
            {view.next}
          </>
        }
      />
    );
    list = (
      <div className="px-2 max-gdesk:px-1">
        {groups.active.length ? <GoalListSection id="asks-active" label="Active" count={groups.active.length}>{groups.active.map(row)}</GoalListSection> : null}
        {groups.closed.length ? <GoalListSection id="asks-closed" label="Closed" count={groups.closed.length}>{groups.closed.map(row)}</GoalListSection> : null}
      </div>
    );
  }

  return (
    <AppShell active="asks" title="My asks">
      <div data-skipwait-screen="my-asks" className="gdesk:grid gdesk:h-[calc(100dvh-var(--g-topbar-h))] gdesk:grid-cols-[var(--g-asks-list-w)_minmax(0,1fr)]">
        <section aria-label="Your asks" className="flex min-w-0 flex-col pb-4 max-gdesk:pb-6 gdesk:overflow-y-auto gdesk:border-r gdesk:border-g-hairline">
          {header}
          {list}
        </section>
        <section aria-label="Opened ask" className="hidden min-w-0 gdesk:block gdesk:overflow-y-auto">
          {selected && desktop ? <AskDetail view={selected} online={online} onWithdraw={() => { setWithdrawError(""); setConfirming(selected); }} /> : null}
        </section>
      </div>
      <GoalConfirmDialog
        open={confirming !== null}
        onOpenChange={open => { if (!open && !withdrawing) setConfirming(null); }}
        title="Withdraw this ask?"
        body={`It closes now and its open slot frees up. Your credit comes back if nobody has picked it up, ${CREDIT_ENDED_CAVEAT}.`}
        actions={
          <>
            <GoalButton variant="ghost" size="sm" touch="large" onClick={() => setConfirming(null)}>Keep it</GoalButton>
            <GoalButton variant="outline" size="sm" touch="large" busy={withdrawing} busyLabel="Withdrawing…" onClick={() => { void withdraw(); }}>Withdraw</GoalButton>
          </>
        }
      >
        {withdrawError ? <p role="alert" className="text-g-meta text-g-ink">{withdrawError}</p> : null}
      </GoalConfirmDialog>
    </AppShell>
  );
}
