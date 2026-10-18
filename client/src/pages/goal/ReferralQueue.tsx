// Referral queue (D-048 phase 3; approved comp design/goal-ui/pick/referral-queue.*): a verified referrer's company
// asks, soonest to close first, with the opened ask, the identity lock and the pinned decision bar. Accepting needs
// the ethics confirmation; passing needs one of the seven shipped reasons (D-052). Keys open steps and never commit.
// Before acceptance the referrer sees the role, link, reasons, checks, a day-level clock and a document COUNT only.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HandHelping } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/auth";
import { AppShell } from "@/components/AppShell";
import {
  GoalButton,
  GoalCheckbox,
  GoalCheckList,
  GoalClock,
  GoalConfirmDialog,
  GoalDecisionBar,
  GoalDetailHeader,
  GoalDetailPane,
  GoalEmptyState,
  GoalErrorState,
  GoalExternalLink,
  GoalListRow,
  GoalLockedPanel,
  GoalNum,
  GoalPassReasons,
  GoalPhoneSubheader,
  GoalPosition,
  GoalProps,
  GoalReasonList,
  GoalSection,
  GoalSkeletonRows,
  GoalStatus,
  GoalVerifiedMark,
  useGoalDesktop,
  useOnlineStatus,
} from "@/components/goal";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import { usePersistFn } from "@/hooks/usePersistFn";
import { formatDay } from "@/lib/displayPrefs";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { PASS_REASON_OPTIONS, type PassReasonCode } from "@shared/passReasons";
import { displayJobLink } from "@shared/roleTitle";
import { whyMeForReader } from "@shared/whyMe";
import { possessive } from "./copy";
import { PersonalLinkPanel } from "./PersonalLinkPanel";
import { acceptAsk, fetchPreview, fetchQueue, openOneSlot, passAsk, QueueRequestError, type QueueRow } from "./queueApi";
import { clockText, qualityChecks, readOpened, sortQueue, toQueueItem, writeOpened, type QueueItem } from "./queueModel";

const PASS_COPY = {
  title: "Pass privately",
  description: "The seeker sees a kind note with your reason. Never your name.",
  note: "With Prefer not to say, the seeker sees no reason.",
  cancel: "Cancel",
  confirm: "Pass",
  busyLabel: "Passing…",
} as const;
const OFFLINE = "You’re offline. Decisions need a connection.";
const RACE = "Another employee accepted this ask a moment earlier.";
const fmt = (value: string | number) => formatDay(new Date(value)) ?? "—";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function Gate({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="grid max-w-[560px] justify-items-start gap-2 px-10 py-12 max-gdesk:px-4 max-gdesk:py-8">
      <h1 className="text-g-display text-g-ink">{title}</h1>
      <p className="text-pretty text-g-body text-g-ink-2">{body}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export default function ReferralQueue() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const access = useReferrerAccess();
  const verified = access.status === "verified";
  const company = access.status === "verified" ? access.access.companyName?.trim() || access.access.domain : "";
  const desktop = useGoalDesktop();
  const online = useOnlineStatus();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(useSearch());
  const requested = Number(params.get("ask") ?? params.get("request"));
  const queryClient = useQueryClient();
  const queueQuery = useQuery({ queryKey: ["queue", userId ?? "session"], enabled: verified, retry: false, queryFn: () => fetchQueue(fetchToken) });
  const [opened, setOpened] = useState<Set<number>>(() => readOpened(userId ?? null, storage()));
  const [notice, setNotice] = useState<ReactNode>(null);
  const [decisionError, setDecisionError] = useState("");
  const [busy, setBusy] = useState<"accept" | "pass" | null>(null);
  const [passOpen, setPassOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [ethics, setEthics] = useState(false);
  const [opening, setOpening] = useState(false);

  const rows = useMemo(() => new Map((queueQuery.data ?? []).map(row => [row.id, row] as const)), [queueQuery.data]);
  const items = useMemo(() => sortQueue((queueQuery.data ?? []).map(row => toQueueItem(row, opened, Date.now()))), [queueQuery.data, opened]);
  const requestedItem = Number.isInteger(requested) && requested > 0 ? items.find(item => item.id === requested) ?? null : null;
  const selected: QueueItem | null = requestedItem ?? (desktop ? items[0] ?? null : null);
  const index = selected ? items.findIndex(item => item.id === selected.id) : -1;
  const previewQuery = useQuery({ queryKey: ["queue", "preview", selected?.id ?? null], enabled: verified && selected !== null, retry: false, queryFn: () => (selected ? fetchPreview(selected.id, fetchToken) : Promise.reject(new Error("No ask selected"))) });

  useEffect(() => { setDecisionError(""); setPassOpen(false); }, [selected?.id]);

  const markOpened = (id: number) => {
    if (opened.has(id)) return;
    const next = new Set(opened);
    next.add(id);
    setOpened(next);
    writeOpened(userId ?? null, next, storage());
  };
  const select = (id: number) => {
    if (selected && selected.id !== id) markOpened(selected.id);
    markOpened(id);
    navigate(`/queue?ask=${id}`, { replace: desktop });
  };
  const neighbour = (offset: number) => items[index + offset];
  const after = (id: number) => {
    const at = items.findIndex(item => item.id === id);
    const next = items[at + 1] ?? items[at - 1];
    navigate(next ? `/queue?ask=${next.id}` : "/queue", { replace: true });
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["queue"] });

  const decide = async (kind: "accept" | "pass", run: (id: number) => Promise<void>, done: (id: number) => ReactNode) => {
    if (!selected || busy) return;
    const id = selected.id;
    setBusy(kind);
    setDecisionError("");
    try {
      await run(id);
      setNotice(done(id));
      setAcceptOpen(false);
      setPassOpen(false);
      setEthics(false);
      after(id);
      await refresh();
    } catch (reason) {
      const race = reason instanceof QueueRequestError && reason.status === 409;
      setDecisionError(race ? RACE : reason instanceof Error ? reason.message : "That didn’t go through. Nothing was recorded.");
      if (race) {
        setAcceptOpen(false);
        await refresh();
      }
    } finally {
      setBusy(null);
    }
  };
  const accept = () =>
    decide("accept", id => acceptAsk(id, fetchToken), id => (
      <>
        Accepted. You can message them privately now.{" "}
        <Link href={`/conversation/${id}?from=inbox`} className="underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">Open conversation</Link>
      </>
    ));
  const pass = (code: PassReasonCode) => {
    const option = PASS_REASON_OPTIONS.find(item => item.code === code);
    if (!option) return;
    void decide("pass", id => passAsk(id, option, fetchToken), () => "You passed privately. The ask stays open for other verified employees. Your identity was never revealed.");
  };
  const openSlot = async () => {
    setOpening(true);
    try {
      const count = await openOneSlot(fetchToken);
      setNotice(count ? `${count} waiting ${count === 1 ? "ask is" : "asks are"} now in your queue.` : "No waiting asks at your company right now.");
      await refresh();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "We couldn’t open a slot");
    } finally {
      setOpening(false);
    }
  };

  // Gates: a referrer surface signs in by work-email code only (D-030, D-049).
  if (!isLoaded || (isSignedIn && access.status === "checking")) {
    return <AppShell active="queue" title="Referral queue"><div className="px-6 py-8"><GoalSkeletonRows density="queue" count={4} label="Checking your verification" /></div></AppShell>;
  }
  if (access.status === "error") {
    return <AppShell active="queue" title="Referral queue"><GoalErrorState title="We couldn’t check your verification" body="Nothing changed on your account. Try again in a moment." retry={{ label: "Try again", onClick: access.retry }} /></AppShell>;
  }
  if (!isSignedIn || !verified) {
    return (
      <AppShell active="queue" title="Referral queue">
        <Gate
          title="Give referrals with control."
          body="Verify your work email with a one-time code. Seekers never see your name or work email unless you accept, and you choose every ask you take."
          action={<GoalButton asChild variant="primary"><Link href={referrerSignInHref("/queue")}>Verify work email</Link></GoalButton>}
        />
      </AppShell>
    );
  }

  const row: QueueRow | undefined = selected ? rows.get(selected.id) : undefined;
  const preview = previewQuery.data && selected && previewQuery.data.id === selected.id ? previewQuery.data : null;
  const showDetailOnPhone = !desktop && selected !== null;
  const unavailable = online ? undefined : OFFLINE;
  const documents = preview ? preview.attachments.length : row?.attachmentCount ?? 0;
  const previous = neighbour(-1);
  const next = neighbour(1);
  const position = selected ? { index: index + 1, total: items.length, onPrev: previous ? () => select(previous.id) : undefined, onNext: next ? () => select(next.id) : undefined } : undefined;

  const list = (
    <section aria-label="Asks for your company" className={showDetailOnPhone ? "hidden" : "flex min-w-0 flex-col gdesk:h-full gdesk:overflow-y-auto gdesk:border-r gdesk:border-g-hairline"}>
      <div className="grid gap-2 border-b border-g-hairline px-5 pb-4 pt-5 max-gdesk:px-4 max-gdesk:pt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-g-heading text-g-ink max-gdesk:text-g-display">Referral queue</h1>
          <span className="whitespace-nowrap text-g-meta text-g-ink-3"><GoalNum className="text-g-ink-2">{items.length}</GoalNum> waiting</span>
        </div>
        <div className="flex min-h-7 items-center justify-between gap-3">
          <GoalVerifiedMark as="span">{`Verified · ${company}`}</GoalVerifiedMark>
          <Link href="/referrer/impact" className="-mr-2 inline-flex h-7 items-center gap-1.5 rounded-g-control px-2 text-g-meta text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:bg-g-surface-hover hover:text-g-ink">
            <HandHelping aria-hidden="true" className="size-4" strokeWidth={1.75} />
            <span className="underline decoration-g-control-edge underline-offset-[3px]">Impact</span>
          </Link>
        </div>
        <p className="text-pretty text-g-meta text-g-ink-3">Asks for {company} roles. Names and resumes stay hidden until you accept.</p>
        {notice ? <p role="status" className="text-g-meta text-g-ink">{notice}</p> : null}
      </div>
      {queueQuery.isPending ? (
        <div className="p-2"><GoalSkeletonRows density="queue" count={4} label="Loading your queue" /></div>
      ) : queueQuery.isError ? (
        <GoalErrorState title="We couldn’t load your queue" body="Nothing changed on your side. Your queue is intact." retry={{ label: "Try again", onClick: () => { void queueQuery.refetch(); } }} />
      ) : items.length === 0 ? (
        <>
          <GoalEmptyState title="No asks right now." body="Enjoy the quiet." action={{ label: opening ? "Opening a slot…" : "Open one more slot", onClick: () => { if (!opening) void openSlot(); } }} />
          <PersonalLinkPanel />
        </>
      ) : (
        <>
          <ul className="grid gap-0.5 p-2 max-gdesk:px-1">
            {items.map(item => (
              <GoalListRow
                key={item.id}
                density="queue"
                selectable={desktop}
                selected={selected?.id === item.id}
                onSelect={() => select(item.id)}
                aria-label={`${item.role}, ${item.daysLeft === null ? "" : `${clockText(item.daysLeft)}, `}${item.state === "new" ? "New" : "Under review"}`}
                testId={`goal-queue-row-${item.id}`}
                title={item.role}
                meta={
                  <>
                    {item.fn ?? item.company}
                    {item.daysLeft !== null ? (
                      <>
                        <span aria-hidden="true" className="px-1.5">·</span>
                        <GoalClock daysLeft={item.daysLeft}>{clockText(item.daysLeft)}</GoalClock>
                      </>
                    ) : null}
                  </>
                }
                trailing={<GoalStatus status={item.state === "new" ? "queue_new" : "queue_review"} label={item.state === "new" ? "New" : "Under review"} className="gap-1.5" />}
              />
            ))}
          </ul>
          <div className="pb-4"><PersonalLinkPanel /></div>
        </>
      )}
      <p className="mt-auto flex h-[calc(var(--g-decision-bar-h)+1px)] shrink-0 items-center border-t border-g-hairline px-5 text-g-meta text-g-ink-3 max-gdesk:mt-2 max-gdesk:h-auto max-gdesk:p-4">Referrers are never charged.</p>
    </section>
  );

  const detail = selected ? (
    <GoalDetailPane
      labelledBy={`queue-ask-${selected.id}`}
      subheader={
        <GoalPhoneSubheader backHref="/queue" backLabel="Referral queue">
          {position ? <GoalPosition {...position} /> : null}
        </GoalPhoneSubheader>
      }
      dock={
        <>
          <div className="max-w-[calc(var(--g-detail-max)+80px)] px-10 max-gdesk:px-4">
            <GoalLockedPanel title="Identity and resume are shared after you accept" documents={documents ? `${documents} ${documents === 1 ? "document" : "documents"}` : undefined} />
            <p className="mb-4 mt-3 text-pretty text-g-meta text-g-ink-2">Accepting shares names both ways and their resume. Referring comes later, through {possessive(selected.company)} own process.</p>
          </div>
          <GoalDecisionBar
            position={position}
            secondary={{ label: "Pass privately", keyHint: "P", disabledReason: unavailable }}
            primary={{ label: "Accept & connect", keyHint: "A", onClick: () => { setDecisionError(""); setEthics(false); setAcceptOpen(true); }, busy: busy === "accept", busyLabel: "Accepting…", disabledReason: unavailable ?? (documents === 0 ? "This ask has no resume attached yet." : undefined) }}
            pass={{ open: passOpen, onOpenChange: setPassOpen, title: PASS_COPY.title, content: <GoalPassReasons copy={PASS_COPY} variant={desktop ? "popover" : "sheet"} busy={busy === "pass"} onCancel={() => setPassOpen(false)} onConfirm={pass} /> }}
            message={decisionError && !acceptOpen ? decisionError : undefined}
          />
        </>
      }
    >
      <div className="mb-4 gdesk:hidden"><GoalVerifiedMark>{`Verified · ${company}`}</GoalVerifiedMark></div>
      <GoalDetailHeader
        id={`queue-ask-${selected.id}`}
        eyebrow={selected.fn ? `${selected.fn} · ${selected.company}` : selected.company}
        title={selected.role}
        meta={
          <>
            {selected.ref ? <GoalNum className="text-g-ink-2">{selected.ref}</GoalNum> : null}
            {selected.daysLeft !== null ? <GoalClock daysLeft={selected.daysLeft} withIcon>{clockText(selected.daysLeft)}</GoalClock> : null}
            {selected.closesAt !== null ? <span>Closes <GoalNum>{fmt(selected.closesAt)}</GoalNum></span> : null}
            <span>Received <GoalNum>{fmt(selected.received)}</GoalNum></span>
          </>
        }
      />
      <GoalProps rows={[{ term: "Job posting", value: row?.targetRoleUrl ? <GoalExternalLink href={row.targetRoleUrl}>{displayJobLink(row.targetRoleUrl) ?? row.targetRoleUrl}</GoalExternalLink> : "Not shared" }]} />
      {previewQuery.isError ? (
        <GoalErrorState className="px-0" title="We couldn’t open this ask" body="Nothing was recorded. Try again in a moment." retry={{ label: "Try again", onClick: () => { void previewQuery.refetch(); } }} />
      ) : !preview ? (
        <div className="mt-8"><GoalSkeletonRows density="detail" count={3} label="Opening the ask" /></div>
      ) : (
        <>
          {whyMeForReader(preview.candidateMessage).length ? <GoalSection label="Why me"><GoalReasonList items={whyMeForReader(preview.candidateMessage)} /></GoalSection> : null}
          {row && qualityChecks(row, preview).length ? <GoalSection label="Ask quality"><GoalCheckList items={qualityChecks(row, preview)} note="Checks on the ask, never a score of the person." /></GoalSection> : null}
        </>
      )}
    </GoalDetailPane>
  ) : null;

  return (
    <AppShell active="queue" title="Referral queue" hideBottomBar={showDetailOnPhone}>
      <div data-skipwait-screen="referral-queue" className="gdesk:grid gdesk:h-[calc(100dvh-var(--g-topbar-h))] gdesk:grid-cols-[var(--g-list-w)_minmax(0,1fr)]">
        {list}
        {desktop ? <section aria-label="Opened ask" className="min-w-0 gdesk:h-full gdesk:overflow-y-auto">{detail}</section> : showDetailOnPhone ? detail : null}
      </div>
      <GoalConfirmDialog
        open={acceptOpen}
        onOpenChange={open => { if (!open && busy !== "accept") setAcceptOpen(false); }}
        title="Accept this request?"
        body="You’ll both see names, and you’ll get the resume."
        actions={
          <>
            <GoalButton variant="ghost" size="sm" touch="large" onClick={() => setAcceptOpen(false)}>Cancel</GoalButton>
            <GoalButton variant="primary" size="sm" touch="large" inactive={!ethics} busy={busy === "accept"} busyLabel="Accepting…" onClick={() => { void accept(); }}>Accept</GoalButton>
          </>
        }
      >
        <GoalCheckbox checked={ethics} onCheckedChange={setEthics}>I’ll refer only through {selected ? possessive(selected.company) : "the company’s"} official process and won’t accept anything in return.</GoalCheckbox>
        {decisionError ? <p role="alert" className="mt-3 text-g-meta text-g-ink">{decisionError}</p> : null}
      </GoalConfirmDialog>
    </AppShell>
  );
}
