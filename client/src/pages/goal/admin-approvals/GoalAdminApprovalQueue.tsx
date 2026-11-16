// Goal /admin/approvals (D-048-p3-admin-approvals): "Decide this approval."
// with the oldest open record as the one next step. Guardrail 1
// (D-048-admin.md §4): the read and the inline Approve/Reject keep the kit
// page's exact calls (approvalsData.ts) and its failure copy and retry; only
// the presentation changes. Guardrail 3: the credit line on a seeker request
// comes from shared/moneyCopy (creditLine), never a string of this page.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/_core/auth";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalEmptyState, GoalSkeletonRows } from "@/components/goal/GoalStates";
import { GoalStatus } from "@/components/goal/GoalStatus";
import { itemKey, itemTitle, openApprovalStatuses, type AdminApprovalQueueItem, type AdminApprovalQueueKind, type AdminApprovalQueueStatus } from "@/lib/adminApproval";
import { AdminGoalFrame, AdminGoalHeading } from "../admin/AdminGoalFrame";
import { ACCESS_MESSAGE, adminSignInHref, approvalStatus, creditLine, decisionFailureCopy, decisionFailureOf, isResolved, KIND_LABEL, loadApprovalQueue, oldestOpen, postApprovalDecision, QUEUE_LOAD_FALLBACK, recordHref, rowContext, statusAfter, tokenCountLine, type ApprovalDecision, type DecisionFailure } from "./approvalsData";

export const GOAL_PAGE = { goalLine: "Decide this approval." } as const;
const BODY = "Seeker requests under review, referrer enrollments awaiting a first action, and credit-pack payments needing reconciliation — one queue, one status vocabulary, one audit trail.";

type StatusFilter = "all" | AdminApprovalQueueStatus;
type KindFilter = "all" | AdminApprovalQueueKind;
type RangeFilter = "all" | "24h" | "7d" | "30d";
const rangeCutoffs: Record<RangeFilter, number> = { all: 0, "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000 };
const SELECT = "h-9 rounded-g-control border border-g-control-edge bg-g-surface px-2.5 text-g-meta text-g-ink";

function RecordFacts({ item }: { item: AdminApprovalQueueItem }) {
  const facts: { key: string; node: ReactNode }[] = [];
  if (item.kind === "referral_request") {
    if (item.meta.targetRoleUrl) facts.push({ key: "role", node: <a href={item.meta.targetRoleUrl} target="_blank" rel="noreferrer" className="text-g-ink underline decoration-g-hairline underline-offset-4 hover:decoration-g-ink">Role link</a> });
    facts.push({ key: "credit", node: <span>{creditLine()}</span> });
    if (item.meta.waitingForCoverage) facts.push({ key: "coverage", node: <span className="text-g-amber">Waiting for coverage</span> });
  } else if (item.kind === "referrer_enrollment") {
    facts.push({ key: "verified", node: <span>Work email verified</span> });
    if (item.meta.referrerEmail) facts.push({ key: "email", node: <span>{item.meta.referrerEmail}</span> });
  } else {
    facts.push({ key: "tokens", node: <span>{tokenCountLine(item.meta.tokenCount)}</span> });
    facts.push({ key: "reason", node: item.meta.reason ? <span className="text-g-amber">{item.meta.reason}</span> : <span>{item.meta.userEmail || `User #${item.id}`}</span> });
  }
  return (
    <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-g-meta text-g-ink-2">
      {facts.map(fact => <li key={fact.key}>{fact.node}</li>)}
    </ul>
  );
}

function QueueRow({ item, working, reloading, error, onDecide, onReload }: { item: AdminApprovalQueueItem; working: boolean; reloading: boolean; error?: DecisionFailure; onDecide: (decision: ApprovalDecision) => void; onReload: () => void }) {
  const resolved = isResolved(item.status);
  // A failed decision leaves the server state unknown: hold both actions until
  // the queue reload reconciles the row (coordinator finding, Nov 6).
  const held = resolved ? "Already resolved" : error ? "Reload the queue before you decide again" : undefined;
  return (
    <li className="border-b border-g-hairline px-4 py-4 last:border-b-0 gdesk:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-g-meta text-g-ink-3">{KIND_LABEL[item.kind]}</p>
          <h3 className="truncate text-g-label text-g-ink">{itemTitle(item)}</h3>
        </div>
        <GoalStatus {...approvalStatus(item.status)} />
      </div>
      <p className="mt-1 truncate text-g-meta text-g-ink-2">{rowContext(item)}</p>
      {item.summary ? <p className="mt-1 text-g-meta text-g-ink-2">{item.summary}</p> : null}
      <RecordFacts item={item} />
      {error ? (
        <div role="alert" className="mt-3 border-l-2 border-g-crimson pl-3">
          <p className="text-g-meta text-g-crimson">{decisionFailureCopy(error, "the queue")}</p>
          <GoalButton size="sm" variant="outline" className="mt-2" busy={reloading} busyLabel="Loading…" onClick={onReload}>Reload the queue</GoalButton>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <GoalButton size="sm" variant="outline" asChild><a href={recordHref(item)}>Open record</a></GoalButton>
        <GoalButton size="sm" variant="ghost" busy={working} busyLabel="Recording…" disabledReason={held} onClick={() => onDecide("approved")}>Approve</GoalButton>
        <GoalButton size="sm" variant="ghost" className="text-g-crimson" busy={working} busyLabel="Recording…" disabledReason={held} onClick={() => onDecide("rejected")}>Reject</GoalButton>
      </div>
    </li>
  );
}

export default function GoalAdminApprovalQueue() {
  const { isSignedIn, getToken, openSignIn } = useAuth();
  const [items, setItems] = useState<AdminApprovalQueueItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>("all");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, DecisionFailure>>({});

  const load = async () => {
    if (!isSignedIn) return;
    setLoading(true); setError(""); setDenied(false);
    try {
      const result = await loadApprovalQueue(getToken);
      if (result.denied) { setDenied(true); setItems([]); return; }
      setItems(result.items);
      setRowErrors({});
      setLoaded(true);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : QUEUE_LOAD_FALLBACK); }
    finally { setLoading(false); }
  };

  const decide = async (item: AdminApprovalQueueItem, decision: ApprovalDecision) => {
    const key = itemKey(item);
    setWorkingKey(key); setRowErrors(current => { const next = { ...current }; delete next[key]; return next; });
    try {
      const payload = await postApprovalDecision(getToken, item.kind, item.id, { decision });
      setItems(current => current.map(row => row.kind === item.kind && row.id === item.id ? { ...row, status: statusAfter(decision, payload.status) } : row));
    } catch (resolveError) { setRowErrors(current => ({ ...current, [key]: decisionFailureOf(resolveError) })); }
    finally { setWorkingKey(null); }
  };

  useEffect(() => { void load(); }, [isSignedIn]);

  const filteredItems = useMemo(() => {
    const cutoff = rangeFilter === "all" ? 0 : Date.now() - rangeCutoffs[rangeFilter];
    return items.filter(item => (statusFilter === "all" || item.status === statusFilter) && (kindFilter === "all" || item.kind === kindFilter) && new Date(item.updatedAt).getTime() >= cutoff);
  }, [items, statusFilter, kindFilter, rangeFilter]);
  const filtersApplied = statusFilter !== "all" || kindFilter !== "all" || rangeFilter !== "all";
  const openCount = filteredItems.filter(item => openApprovalStatuses.has(item.status)).length;
  const clearFilters = () => { setStatusFilter("all"); setKindFilter("all"); setRangeFilter("all"); };

  if (!isSignedIn) {
    return (
      <AdminGoalFrame screen="admin-approvals-sign-in">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="Sign in with an administrator account to triage pending referral requests, referrer enrollments, and credit-pack payments." />
        <GoalNextStep>
          {/* SignInButton renders its own <button>; wrapping GoalButton in it nests buttons. */}
          <GoalButton variant="primary" className="mt-3" onClick={() => openSignIn()}>Sign in</GoalButton>
        </GoalNextStep>
      </AdminGoalFrame>
    );
  }

  if (denied) {
    return (
      <AdminGoalFrame screen="admin-approvals-forbidden">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="This queue is available only to the designated administrator account." />
        <GoalNextStep reason={ACCESS_MESSAGE}>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <GoalButton variant="primary" asChild><a href={adminSignInHref(typeof window === "undefined" ? "/admin" : window.location.pathname)}>Sign in as administrator</a></GoalButton>
            <GoalButton variant="ghost" asChild><a href="/">Back to skipwait.me</a></GoalButton>
          </div>
        </GoalNextStep>
      </AdminGoalFrame>
    );
  }

  const oldest = oldestOpen(items);
  const showSkeleton = loading && !loaded;
  const nextStep = error ? (
    <GoalNextStep reason="This list didn't load. Trying again only re-reads it.">
      <GoalButton variant="primary" className="mt-3" busy={loading} busyLabel="Loading…" onClick={() => void load()}>Try again</GoalButton>
    </GoalNextStep>
  ) : showSkeleton ? (
    <GoalNextStep reason="Loading the approval queue…">
      <GoalButton variant="primary" className="mt-3" busy busyLabel="Loading…">Open the oldest record</GoalButton>
    </GoalNextStep>
  ) : oldest ? (
    <GoalNextStep reason={`Oldest open record: ${KIND_LABEL[oldest.kind]} · ${itemTitle(oldest)} · ${rowContext(oldest)}`}>
      <GoalButton variant="primary" className="mt-3" asChild><a href={recordHref(oldest)}>Open the oldest record</a></GoalButton>
    </GoalNextStep>
  ) : (
    <GoalNextStep reason="Nothing in this queue is waiting. Reports and company suggestions are decided in the review queue.">
      <GoalButton variant="primary" className="mt-3" asChild><a href="/admin-review">Open the review queue</a></GoalButton>
    </GoalNextStep>
  );

  return (
    <AdminGoalFrame screen="admin-approvals">
      <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body={BODY} />
      <div className="grid items-start gap-6 gdesk:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 gdesk:order-last">{nextStep}</div>
        <section aria-label="Approval queue" className="min-w-0 border border-g-hairline bg-g-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-g-hairline p-3">
            <select aria-label="Filter by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value as StatusFilter)} className={SELECT}>
              <option value="all">Status: All</option><option value="pending">Pending</option><option value="under_review">Under review</option><option value="requires_review">Requires review</option><option value="approved">Approved</option><option value="declined">Declined</option>
            </select>
            <select aria-label="Filter by record type" value={kindFilter} onChange={event => setKindFilter(event.target.value as KindFilter)} className={SELECT}>
              <option value="all">Role: All</option><option value="referral_request">Seeker request</option><option value="referrer_enrollment">Referrer enrollment</option><option value="payment">Credit pack</option>
            </select>
            <select aria-label="Filter by date range" value={rangeFilter} onChange={event => setRangeFilter(event.target.value as RangeFilter)} className={SELECT}>
              <option value="all">Recent: Any time</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option>
            </select>
            <span className="ml-auto text-g-meta text-g-ink-3">{filtersApplied ? `${openCount} open` : items.length ? `${items.length} in queue` : "Queue"}</span>
          </div>
          {error ? (
            <div role="alert" className="px-5 py-6 max-gdesk:px-4">
              <p className="text-g-label text-g-ink">{error}</p>
              <p className="mt-1 text-g-meta text-g-ink-2">Nothing is shown as clear while the queue failed to load.</p>
            </div>
          ) : showSkeleton ? (
            <GoalSkeletonRows density="queue" count={3} className="py-3" />
          ) : !filteredItems.length ? (
            <GoalEmptyState
              title={`Queue clear${filtersApplied ? " — No items match these filters" : ""}`}
              body={filtersApplied ? "Widen the date range or clear filters." : "No items need an administrator decision right now."}
              action={filtersApplied ? { label: "Clear filters", onClick: clearFilters } : undefined}
            />
          ) : (
            <ul>
              {filteredItems.map(item => {
                const key = itemKey(item);
                return <QueueRow key={key} item={item} working={workingKey === key} reloading={loading} error={rowErrors[key]} onDecide={decision => void decide(item, decision)} onReload={() => void load()} />;
              })}
            </ul>
          )}
        </section>
      </div>
    </AdminGoalFrame>
  );
}
