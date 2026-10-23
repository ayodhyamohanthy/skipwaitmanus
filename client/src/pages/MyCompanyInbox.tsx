// Referral queue (goal UI, D-048 phase 3 W1). Faithful transcription of
// design/goal-ui/pick/referral-queue: the master list (dot+text New / Under
// review, mono days-left, amber at <=2) beside the reading pane (HMAC public
// ref, dates, Why me, ask quality, identity lock) with the one decision dock
// (Pass privately [P] ghost, Accept & connect [A] primary). Asks come from
// GET /api/company-referrals/inbox (new + saved); the unclaimed preview
// supplies the pitch and document count. Public refs are the server's HMAC
// R-XXXXX, never the sequential id.
import { ChevronDown, ChevronUp, HandHelping, Settings } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/_core/auth";
import {
  GoalAppShell,
  GoalButton,
  GoalDetailPane,
  GoalEmptyState,
  GoalErrorState,
  GoalIconButton,
  GoalListRow,
  GoalLockedPanel,
  GoalNum,
  GoalSheet,
  GoalSkeletonRows,
  GoalStatus,
  GoalVerifiedMark,
} from "@/components/goal";
import { useReferrerAccess } from "@/hooks/useReferrerAccess";
import { useSlowLoad } from "@/hooks/useSlowLoad";
import { displayJobFunction, parseJobFunction, type JobFunction } from "@shared/jobFunctions";
import { getAskShelfLifeEndsAtMs, type ReferralStatus } from "@shared/referral";
import { PASS_REASON_OPTIONS, type PassReasonCode } from "@shared/passReasons";
import { askWorkItemsListSchema, ASK_WORK_SECTION_TITLE, safeAskWorkUrl } from "@shared/askWorkItems";
import { workKindLabel } from "@/components/profile/workItems";
import { splitWhyMe } from "@shared/whyMe";
import { formatDay } from "@/lib/displayPrefs";
import { readApiJson } from "@/lib/apiResponse";
import { cn } from "@/lib/utils";

type QueueItem = {
  id: number;
  publicRef?: string;
  targetRoleUrl: string | null;
  companyDomain: string;
  companyName?: string | null;
  companyInitials?: string | null;
  jobFunction?: JobFunction | null;
  jobTitle?: string | null;
  askStrength?: "strong" | "good" | "basic" | null;
  status: ReferralStatus;
  createdAt: string;
  attachmentCount: number;
  isClaimedByYou: boolean;
  expiresAt?: string | null;
  decisionDueAt?: string | null;
  waitingForCoverage?: boolean | null;
  coverageVisibleAt?: string | null;
};
type Preview = { id: number; candidateMessage: string; targetRoleUrl: string | null; attachments: unknown[]; publicRef?: string; /** Task 13: parsed at this boundary (below). */ workItems?: unknown };
type InboxPayload = { requests?: QueueItem[] };
/** Read model for the honest empty state: paused / active (capacity left) / at_capacity. */
type RoutingState = "paused" | "active" | "at_capacity";
type ReferrerHomePayload = { home?: { routing?: { state?: string } } };
type ReferrerPrefsPayload = { preferences?: { notifyNewAsk?: boolean } };
/** Prod has no Resend key yet, so ask emails are not reliably sent. Do not promise
    email in copy until the key is live; then the promise also respects notifyNewAsk. */
const EMAIL_DELIVERY_LIVE = false;

const DAY_MS = 86_400_000;

/** Comp rule: "N days left" reads neutral until 2 days, then amber - never crimson in the queue. */
function daysLeft(item: QueueItem, nowMs: number): { label: string; soon: boolean } | null {
  if (item.status !== "pending") return null;
  const ms = item.expiresAt ? Date.parse(item.expiresAt) : getAskShelfLifeEndsAtMs({ createdAt: item.createdAt, waitingForCoverage: item.waitingForCoverage, coverageVisibleAt: item.coverageVisibleAt });
  if (ms === null || Number.isNaN(ms)) return null;
  const days = Math.ceil((ms - nowMs) / DAY_MS);
  if (days < 0) return { label: "Expired", soon: false };
  return { label: days === 1 ? "1 day left" : `${days} days left`, soon: days <= 2 };
}

function roleTitle(item: QueueItem): string {
  return item.jobTitle?.trim() || "Private ask";
}

/** D-038-A: the server's 48-hour decision deadline for the viewer's own claim or allocation.
    Neutral wording, never a countdown: the ask goes back to colleagues and nothing is taken. */
function decisionDue(item: QueueItem, nowMs: number): string | null {
  const ms = item.decisionDueAt ? Date.parse(item.decisionDueAt) : Number.NaN;
  if (Number.isNaN(ms)) return null;
  const hours = Math.ceil((ms - nowMs) / 3_600_000);
  return hours <= 0 ? "Decision due now" : `Decide within ${hours} hour${hours === 1 ? "" : "s"}`;
}

export default function MyCompanyInbox() {
  const [, go] = useLocation();
  const requestedId = Number(new URLSearchParams(useSearch()).get("request"));
  const { isSignedIn, getToken } = useAuth();
  const access = useReferrerAccess();
  const verified = access.status === "verified";
  const [requests, setRequests] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(Boolean(isSignedIn));
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [openingCapacity, setOpeningCapacity] = useState(false);
  const [routingState, setRoutingState] = useState<RoutingState | null>(null);
  const [notifyNewAsk, setNotifyNewAsk] = useState<boolean | null>(null);
  const { showSkeleton, isSlow } = useSlowLoad(loading);

  const companyFetch = async <T extends object>(path: string, init?: RequestInit): Promise<T & { error?: string }> => {
    const token = await getToken();
    const response = await fetch(path, { ...init, credentials: "include", headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    const payload = await readApiJson<T & { error?: string }>(response, "We could not complete that private company request");
    if (!response.ok) throw new Error(payload.error || "We could not complete that private company request");
    return payload;
  };

  const loadInbox = async () => {
    if (!isSignedIn) return;
    setLoading(true); setError(""); setLoadFailed(false);
    try {
      const [fresh, saved, home, prefs] = await Promise.all([
        companyFetch<InboxPayload>("/api/company-referrals/inbox?scope=new"),
        companyFetch<InboxPayload>("/api/company-referrals/inbox?scope=saved"),
        companyFetch<ReferrerHomePayload>("/api/referrer/home").catch(() => null),
        companyFetch<ReferrerPrefsPayload>("/api/referrer-preferences").catch(() => null),
      ]);
      const state = home?.home?.routing?.state;
      setRoutingState(state === "paused" || state === "active" || state === "at_capacity" ? state : null);
      setNotifyNewAsk(typeof prefs?.preferences?.notifyNewAsk === "boolean" ? prefs.preferences.notifyNewAsk : null);
      const withFunction = (row: QueueItem): QueueItem => ({ ...row, jobFunction: parseJobFunction(row.jobFunction) });
      const freshRows = (fresh.requests || []).map(withFunction);
      const seen = new Set(freshRows.map(row => row.id));
      setRequests([...freshRows, ...(saved.requests || []).filter(row => !seen.has(row.id)).map(withFunction)]);
    } catch (reason) { setLoadFailed(true); setError(reason instanceof Error ? reason.message : "We could not load your queue"); }
    finally { setLoading(false); }
  };
  // The queue loads once the server confirms verification; a retried check that
  // succeeds also brings the queue in, and an unverified account never requests it.
  useEffect(() => { if (verified) void loadInbox(); }, [isSignedIn, verified]);

  const selected = useMemo(() => requests.find(row => row.id === selectedId) ?? null, [requests, selectedId]);

  // /referrer-home rows link here as /queue?request=:id and open that ask directly.
  useEffect(() => {
    if (verified && Number.isInteger(requestedId) && requestedId > 0 && requests.length && !selectedId) setSelectedId(requestedId);
  }, [verified, requestedId, requests, selectedId]);

  // The pitch and document count only exist on the unclaimed preview; claimed
  // asks read from the conversation instead.
  useEffect(() => {
    if (!selected || selected.status !== "pending") { setPreview(null); return; }
    let cancelled = false;
    setPreviewLoading(true); setPreview(null);
    void companyFetch<{ request?: Preview }>(`/api/company-referrals/${selected.id}/preview`)
      .then(payload => {
        // Task 13: a preview without the list reads as "no pinned work" instead
        // of crashing the pane — the web bundle can lead the API by one deploy.
        const request = payload.request;
        if (!cancelled) setPreview(request ? { ...request, workItems: askWorkItemsListSchema.parse(request.workItems) } : null);
      })
      .catch(() => { if (!cancelled) setPreview(null); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const raceError = error.includes("Another employee accepted");
  const review = async (requestId: number, decision: "approved" | "declined", passReason?: PassReasonCode) => {
    setWorking(true); setError("");
    try {
      const option = passReason ? PASS_REASON_OPTIONS.find(entry => entry.code === passReason) : null;
      await companyFetch(`/api/company-referrals/${requestId}/one-click-review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(decision === "approved" ? { decision, ethicsConfirmed: true } : { decision, declineReason: option?.legacy, passReason }) });
      setPassOpen(false); setSelectedId(null); setPreview(null);
      setNotice(decision === "approved" ? "Request accepted. You can now message the job seeker privately." : "Passed privately. The job seeker gets a short private note - never your name.");
      await loadInbox();
    } catch (reason) { const message = reason instanceof Error ? reason.message : "This private request can no longer be reviewed"; setError(message.includes("no longer available") ? "Accept failed - Another employee accepted this request a moment earlier. Nothing was charged to your credits." : message); }
    finally { setWorking(false); }
  };

  const openReferralCapacity = async () => {
    setOpeningCapacity(true); setError(""); setNotice("");
    try {
      const payload = await companyFetch<{ availability?: { allocatedCount?: number } }>("/api/company-referrals/availability/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slotCount: 1 }) });
      const allocatedCount = payload.availability?.allocatedCount ?? 0;
      setNotice(allocatedCount ? `${allocatedCount} waiting request${allocatedCount === 1 ? " is" : "s are"} now available for your review.` : "No waiting requests at your company right now.");
      await loadInbox();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not open referral capacity"); }
    finally { setOpeningCapacity(false); }
  };

  // Keyboard: K previous, J next, P pass sheet, A accept (comp decision-dock hints).
  const openIndex = selected ? requests.findIndex(row => row.id === selected.id) : -1;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "j" || key === "k") {
        if (!requests.length) return;
        event.preventDefault();
        const next = key === "j" ? Math.min(requests.length - 1, openIndex + 1) : Math.max(0, openIndex < 0 ? 0 : openIndex - 1);
        setSelectedId(requests[next]?.id ?? null);
      } else if (key === "p" && selected?.status === "pending") { event.preventDefault(); setPassOpen(true); }
      else if (key === "a" && selected?.status === "pending" && !working && !passOpen) { event.preventDefault(); void review(selected.id, "approved"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const shell = (body: ReactNode) => <GoalAppShell active="queue" pageTitle="Referral queue">{body}</GoalAppShell>;

  if (!isSignedIn) return shell(<GoalEmptyState title="Give referrals with control." body="Use a company email to see only matching private requests. Your identity stays hidden." action={{ label: "Use company email", onClick: () => go("/sign-in") }} />);
  if (access.status === "checking") return shell(
    <section aria-busy="true" className="p-4">
      <p className="mb-2 text-g-meta text-g-ink-3">Checking your verification.</p>
      <GoalSkeletonRows density="queue" count={5} />
    </section>
  );
  if (access.status === "error") return shell(<GoalErrorState title="We couldn’t check your verification" body={`${access.error.message || "Check your connection and try again."} Nothing changed on your account. Try again in a moment.`} retry={{ label: "Try again", onClick: access.retry }} />);
  if (!verified) return shell(<GoalEmptyState title="Verify your work email." body="A one-time code confirms your company. Your name and work email never appear to job seekers." action={{ label: "Add work email", onClick: () => go("/sign-in") }} />);

  const nowMs = Date.now();
  const company = requests[0]?.companyName ?? null;

  const listHead = (
    <header className="border-b border-g-hairline px-3 pb-3 pt-4 gdesk:px-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-g-meta text-g-ink-2">Referral queue</h2>
        <span className="text-g-meta text-g-ink-3"><GoalNum>{requests.length}</GoalNum> waiting</span>
      </div>
      <h1 className="mt-3 text-g-heading text-g-ink">Open a door for someone.</h1>
      <p className="mt-2 text-g-meta text-g-ink-2">Read one ask. Accept only if you can use your company's referral process.</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <GoalVerifiedMark as="span" mutedText>{`Verified${company ? ` · ${company}` : ""}`}</GoalVerifiedMark>
        <Link href="/referrer/impact" className="flex min-h-11 items-center gap-1 text-g-meta text-g-ink-2"><HandHelping aria-hidden="true" className="size-4" />Impact</Link>
        <Link href="/referrer?view=setup" className="flex min-h-11 items-center gap-1 text-g-meta text-g-ink-2"><Settings aria-hidden="true" className="size-4" />Settings</Link>
      </div>
      <p className="mt-1 text-g-meta text-g-ink-3">Asks for {company ?? "your company"} roles. Names and resumes stay hidden until you accept.</p>
    </header>
  );

  let body: ReactNode;
  if (showSkeleton) body = (
    <section aria-busy="true" className="p-3">
      {isSlow ? <p role="status" className="mb-2 text-g-meta text-g-ink-2">Still loading. Your queue is intact.</p> : null}
      <GoalSkeletonRows density="queue" count={5} />
    </section>
  );
  else if (loadFailed || (error && !requests.length)) body = <GoalErrorState title="We could not load your queue" body={error} retry={{ label: "Try again", onClick: () => { setError(""); void loadInbox(); } }} />;
  else if (!requests.length) body = routingState === "paused" ? (
    <GoalEmptyState
      title="New asks are paused"
      body="You paused new private asks. Resume anytime from Setup & capacity."
      action={{ label: "Open settings", onClick: () => go("/referrer?view=setup") }}
    />
  ) : routingState === "active" ? (
    <GoalEmptyState title="No asks right now." body={EMAIL_DELIVERY_LIVE && notifyNewAsk ? "Enjoy the quiet. We'll email you when a private ask for your company arrives." : "Enjoy the quiet. New asks show up here."} />
  ) : (
    <GoalEmptyState
      title="Ready to help?"
      body="Open one real referral slot. Only the next private request for your company is notified."
      action={{ label: openingCapacity ? "Opening capacity…" : "Open referral capacity", onClick: () => { if (!openingCapacity) void openReferralCapacity(); } }}
    />
  );
  else body = (
    <div className="gdesk:grid gdesk:h-full gdesk:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
      <section aria-labelledby="queue-h" className={cn("min-w-0 gdesk:border-r gdesk:border-g-hairline", selected ? "max-gdesk:hidden" : "")}>
        <span id="queue-h" className="sr-only">Referral queue</span>
        {listHead}
        {notice ? <p role="status" className="mx-3 my-2 rounded-g-tile bg-g-surface-sunken px-3 py-2 text-g-meta text-g-ink-2 gdesk:mx-4">{notice}</p> : null}
        {error && requests.length ? <p role="alert" className="mx-3 my-2 rounded-g-tile bg-g-surface-sunken px-3 py-2 text-g-meta text-g-ink-2 gdesk:mx-4">{error}</p> : null}
        <ul>
          {requests.map(item => {
            const left = daysLeft(item, nowMs);
            const due = decisionDue(item, nowMs);
            const claimed = item.status !== "pending" || item.isClaimedByYou;
            return (
              <GoalListRow
                key={item.id}
                density="queue"
                selected={item.id === selectedId}
                onSelect={() => { setError(""); setNotice(""); if (claimed) go(`/conversation/${item.id}?from=inbox`); else setSelectedId(item.id); }}
                title={roleTitle(item)}
                trailing={<GoalStatus status={claimed ? "queue_review" : "queue_new"} label={claimed ? "Under review" : "New"} />}
                meta={<span>{displayJobFunction(item.jobFunction) ?? item.companyName ?? item.companyDomain}{left ? <>{" · "}<GoalNum tone={left.soon ? "warn" : undefined}>{left.label}</GoalNum></> : null}{due ? <>{" · "}<GoalNum>{due}</GoalNum></> : null}</span>}
              />
            );
          })}
        </ul>
        <p className="px-3 py-3 text-g-meta text-g-ink-3 gdesk:px-4">Referrers are never charged.</p>
      </section>
      <section className={cn("min-w-0 max-gdesk:pb-24", selected ? "" : "max-gdesk:hidden")} aria-label="Ask detail">
        {selected ? (
          <QueueDetail
            item={selected}
            index={openIndex}
            count={requests.length}
            preview={preview}
            previewLoading={previewLoading}
            nowMs={nowMs}
            working={working}
            passOpen={passOpen}
            onMove={step => {
              const next = Math.max(0, Math.min(requests.length - 1, openIndex + step));
              if (requests[next] && requests[next].id !== selected.id) setSelectedId(requests[next].id);
            }}
            onPassOpen={setPassOpen}
            onAccept={() => { void review(selected.id, "approved"); }}
            onPass={reason => { void review(selected.id, "declined", reason); }}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <GoalEmptyState title="Pick an ask to read it." className="max-gdesk:hidden" />
        )}
      </section>
    </div>
  );
  return shell(body);
}

function QueueDetail({ item, index, count, preview, previewLoading, nowMs, working, passOpen, onMove, onPassOpen, onAccept, onPass, onBack }: {
  item: QueueItem; index: number; count: number; preview: Preview | null; previewLoading: boolean; nowMs: number;
  working: boolean; passOpen: boolean; onMove(step: -1 | 1): void; onPassOpen(open: boolean): void; onAccept(): void; onPass(reason: PassReasonCode): void; onBack(): void;
}) {
  const left = daysLeft(item, nowMs);
  const reasons = splitWhyMe(preview?.candidateMessage ?? "");
  // Task 13: the send-time snapshot, parsed once here. Ordered as the seeker chose it.
  const pinnedWork = askWorkItemsListSchema.parse(preview?.workItems);
  const company = item.companyName ?? item.companyDomain;
  const fn = displayJobFunction(item.jobFunction);
  const closes = item.expiresAt ?? null;
  const strengthLabel = item.askStrength === "strong" ? "Strong" : item.askStrength === "good" ? "Good" : item.askStrength === "basic" ? "Basic" : null;
  return (
    <GoalDetailPane
      className="max-gdesk:h-auto [&>div]:max-gdesk:flex-none [&>div>div]:max-gdesk:flex-none"
      labelledBy="ask-role"
      titleSize="display"
      eyebrow={<>{fn ? `${fn} · ` : ""}{company}</>}
      refId={preview?.publicRef ?? item.publicRef}
      title={<span id="ask-role">{roleTitle(item)}</span>}
      meta={([
        left ? <span key="left"><GoalNum tone={left.soon ? "warn" : undefined}>{left.label}</GoalNum></span> : null,
        closes ? <span key="closes">Closes <GoalNum>{formatDay(closes) ?? ""}</GoalNum></span> : null,
        <span key="received">Received <GoalNum>{formatDay(item.createdAt) ?? ""}</GoalNum></span>,
      ] as (ReactNode | null)[]).filter(entry => entry !== null) as ReactNode[]}
      phoneBack={{ href: "/queue", label: "Referral queue" }}
      phonePosition={<GoalNum>{index + 1} / {count}</GoalNum>}
      dock={item.status === "pending" ? (
        <section aria-label="Your next step" className="border border-g-control-edge p-4">
          <h3 className="mb-2 text-g-label text-g-ink">Your next step</h3>
          <p className="mb-3 text-g-meta text-g-ink-2">Accept if you can refer through your company's official process. If not, pass privately.</p>
          <GoalLockedPanel title="Identity and resume are shared after you accept" documentCount={preview?.attachments.length ?? 0} />
          <p className="mt-2 text-g-meta text-g-ink-3">Accepting shares names both ways and their resume. Referring comes later, through {company}&rsquo;s own process.</p>
          <p className="mt-1 text-g-meta text-g-ink-3">By accepting, you confirm you&apos;ll refer only through {company}&apos;s official process.</p>
          <div className="mt-3 flex items-center gap-1.5">
            {/* Comp phone rule: position and K/J move to the sub bar (phonePosition
                above); the two actions split the bar evenly. */}
            <span className="contents max-gdesk:hidden">
              <GoalIconButton icon={ChevronUp} iconSize={18} aria-label="Previous ask" disabledReason={index <= 0 ? "First ask" : undefined} onClick={() => onMove(-1)} />
              <GoalIconButton icon={ChevronDown} iconSize={18} aria-label="Next ask" disabledReason={index >= count - 1 ? "Last ask" : undefined} onClick={() => onMove(1)} />
              <span className="text-g-meta text-g-ink-3"><GoalNum>{index + 1} / {count}</GoalNum></span>
            </span>
            <span className="ml-auto max-gdesk:hidden" />
            <GoalButton variant="ghost" keys={["P"]} disabledReason={working ? "Working…" : undefined} onClick={() => onPassOpen(true)} className="max-gdesk:flex-1 max-gdesk:scroll-mb-24">Pass privately</GoalButton>
            <GoalButton
              variant="primary"
              keys={["A"]}
              busy={working}
              busyLabel="Working…"
              onClick={onAccept}
              className="max-gdesk:flex-1 max-gdesk:scroll-mb-24"
              title={`By accepting, you confirm you'll refer only through ${company}'s official process.`}
              aria-keyshortcuts="a"
            >
              Accept &amp; connect
            </GoalButton>
          </div>
        </section>
      ) : undefined}
    >
      {previewLoading ? <GoalSkeletonRows density="queue" count={3} className="p-3" /> : (
        <div className="px-3 py-3 gdesk:px-4">
          {preview?.targetRoleUrl || item.targetRoleUrl ? (
            <p className="mb-3 text-g-meta text-g-ink-3">Job posting <a className="ml-2 text-g-ink underline underline-offset-2" href={(preview?.targetRoleUrl ?? item.targetRoleUrl) as string} target="_blank" rel="noreferrer">{(preview?.targetRoleUrl ?? item.targetRoleUrl)?.replace(/^https?:\/\//, "")}</a></p>
          ) : null}
          <section aria-labelledby="why-h">
            <h3 id="why-h" className="text-g-meta uppercase tracking-[0.12em] text-g-ink-3">Why me</h3>
            <ol className="mt-2 space-y-3">
              {reasons.filter(Boolean).map((reason, reasonIndex) => (
                <li key={reasonIndex} className="flex gap-3">
                  <span aria-hidden="true" className="text-g-meta text-g-ink-3"><GoalNum>{String(reasonIndex + 1).padStart(2, "0")}</GoalNum></span>
                  <p className="text-g-label text-g-ink">{reason}</p>
                </li>
              ))}
            </ol>
          </section>
          {pinnedWork.length > 0 ? (
            <section aria-labelledby="pinned-h" className="mt-5">
              <h3 id="pinned-h" className="text-g-meta uppercase tracking-[0.12em] text-g-ink-3">{ASK_WORK_SECTION_TITLE}</h3>
              <p className="mt-1 text-pretty text-g-meta text-g-ink-3">Work the seeker chose to show with this ask, from their own portfolio. It is what they sent — a later edit never rewrites it.</p>
              <ul className="mt-2 space-y-2">
                {pinnedWork.map((piece, pieceIndex) => {
                  const href = safeAskWorkUrl(piece.url);
                  return (
                    <li key={`${pieceIndex}-${piece.title}`} className="flex items-start gap-3">
                      <span aria-hidden="true" className="text-g-meta text-g-ink-3"><GoalNum>{String(pieceIndex + 1).padStart(2, "0")}</GoalNum></span>
                      <span className="min-w-0">
                        {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="block truncate text-g-label text-g-ink underline underline-offset-2">{piece.title}</a> : <span className="block truncate text-g-label text-g-ink">{piece.title}</span>}
                        <span className="text-g-meta text-g-ink-3">{workKindLabel(piece.kind)}{piece.source ? ` · ${piece.source}` : ""}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          <section aria-labelledby="quality-h" className="mt-5">
            <h3 id="quality-h" className="text-g-meta uppercase tracking-[0.12em] text-g-ink-3">Ask quality</h3>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-g-meta text-g-ink-2">
              <li>{(preview?.targetRoleUrl ?? item.targetRoleUrl) ? "✓" : "·"} Official job link</li>
              <li>{reasons.some(Boolean) ? "✓" : "·"} Specific proof of fit</li>
              <li>{(preview?.attachments.length ?? 0) > 0 ? "✓" : "·"} Resume attached</li>
              <li>{pinnedWork.length > 0 ? "✓" : "·"} Work attached</li>
              {strengthLabel ? <li>✓ Ask strength: {strengthLabel}</li> : null}
            </ul>
            <p className="mt-1 text-g-meta text-g-ink-3">Checks on the ask, never a score of the person.</p>
          </section>
        </div>
      )}
      <GoalSheet open={passOpen} onOpenChange={onPassOpen} title="Pass privately" description="The seeker sees a kind note with your reason. Never your name.">
        <ul className="mt-3 space-y-1" role="radiogroup" aria-label="Pass reason">
          {PASS_REASON_OPTIONS.map((option, optionIndex) => (
            <li key={option.code}>
              <button type="button" disabled={working} onClick={() => onPass(option.code)} className="flex min-h-11 w-full items-center gap-3 rounded-g-tile px-3 text-left text-g-label text-g-ink hover:bg-g-surface-hover">
                <span className="text-g-meta text-g-ink-3 flex-1">{option.label}</span>
                <GoalNum className="text-g-ink-3">{optionIndex + 1}</GoalNum>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-g-meta text-g-ink-3">With Prefer not to say, the seeker sees no reason.</p>
        <div className="mt-3 flex justify-end gap-2">
          <GoalButton variant="ghost" onClick={() => onPassOpen(false)}>Cancel</GoalButton>
        </div>
      </GoalSheet>
    </GoalDetailPane>
  );
}
