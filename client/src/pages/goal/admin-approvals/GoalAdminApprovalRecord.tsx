// Goal /admin/approvals/:kind/:id (D-048-p3-admin-approvals): "Decide this
// approval." with the decision as the one commit. Guardrail 1
// (D-048-admin.md §4): the two reads, the decision call with its optional note,
// the failure copy, the retry and the local history line are the kit page's
// own (approvalsData.ts); only the presentation changes. Guardrail 3: the
// credit lines on the record and in its history come from shared/moneyCopy
// (creditLine), never a string of this page.
import { useEffect, useState, type ReactNode } from "react";
import { useRoute } from "wouter";
import { useAuth } from "@/_core/auth";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalSkeletonRows } from "@/components/goal/GoalStates";
import { GoalStatus } from "@/components/goal/GoalStatus";
import { compactDateTime, formatAmount, itemTitle, type AdminApprovalQueueItem, type AdminApprovalQueueKind } from "@/lib/adminApproval";
import { cn } from "@/lib/utils";
import { AdminGoalFrame, AdminGoalHeading } from "../admin/AdminGoalFrame";
import { ACCESS_MESSAGE, adminSignInHref, approvalStatus, creditLine, decisionFailureCopy, decisionFailureOf, decisionLabel, isResolved, KIND_LABEL, loadApprovalRecord, postApprovalDecision, RECORD_LOAD_FALLBACK, statusAfter, tokenCountLine, type ApprovalDecision, type DecisionFailure, type HistoryEvent } from "./approvalsData";

export const GOAL_PAGE = { goalLine: "Decide this approval." } as const;
const BODY = "Read the record and its history, then approve or reject it. The decision and its note are recorded on the item's audit trail.";
const QUEUE_HREF = "/admin/approvals";

function RecordBlock({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 border border-g-hairline bg-g-surface p-4">
      <p className="text-g-meta text-g-ink-3">{eyebrow}</p>
      <h3 className="mt-0.5 break-words text-g-label text-g-ink">{title}</h3>
      <div className="mt-2 text-g-meta text-g-ink-2">{children}</div>
    </section>
  );
}

function RecordBlocks({ item }: { item: AdminApprovalQueueItem }) {
  const tokens = tokenCountLine(item.meta.tokenCount);
  if (item.kind === "referral_request") {
    return (
      <div className="grid gap-3">
        <div className="grid gap-3 gdesk:grid-cols-2">
          <RecordBlock eyebrow="Seeker" title={item.meta.seekerName || "Job seeker"}>
            <p className="break-words">{item.meta.seekerEmail || "Email hidden"}</p>
            <p className="mt-2">“{item.meta.pitch || item.summary}”</p>
          </RecordBlock>
          <RecordBlock eyebrow="Referrer" title={item.meta.referrerName || "Awaiting claim"}>
            <p className="break-words">{item.meta.referrerEmail || "No verified referrer claimed this request"}</p>
            <p className="mt-2">{item.meta.claimTime ? `Claimed ${compactDateTime(item.meta.claimTime)}` : "Claimed by a verified employee updates this block."}</p>
          </RecordBlock>
        </div>
        <RecordBlock eyebrow="Role link" title={item.meta.roleTitle || "Role from shared job link"}>
          <p>{item.companyDomain}{item.meta.waitingForCoverage ? " · waiting for company coverage" : ""}</p>
          {item.meta.targetRoleUrl ? <GoalButton size="sm" variant="outline" className="mt-2" asChild><a href={item.meta.targetRoleUrl} target="_blank" rel="noreferrer">Open job link</a></GoalButton> : null}
        </RecordBlock>
        <RecordBlock eyebrow="Credit movement" title={creditLine()}>
          <p>Reserved when the request was created. Returned on withdraw, consumed on accept, never consumed on decline.</p>
        </RecordBlock>
      </div>
    );
  }
  if (item.kind === "referrer_enrollment") {
    return (
      <div className="grid gap-3">
        <RecordBlock eyebrow="Referrer enrollment" title={item.meta.referrerName || "Verified referrer"}>
          <p className="break-words">{item.meta.referrerEmail || "Email hidden"} · work email verified for {item.companyDomain}</p>
          <p className="mt-2">Work email OTP verified {item.meta.otpTime ? compactDateTime(item.meta.otpTime) : "—"}. The referrer has not yet claimed or reviewed a request.</p>
        </RecordBlock>
        <RecordBlock eyebrow="Credit movement" title="No credit movement yet">
          <p>Verification grants nothing. Invite credits unlock after the first accepted referral.</p>
        </RecordBlock>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <RecordBlock eyebrow="Credit pack payment" title={item.provider || "Payment"}>
        <p className="break-words">{item.meta.userEmail || "User email hidden"} · {item.meta.role?.replace("_", " ") || "credit pack"}</p>
        <p className="mt-2">{item.amount != null ? `${formatAmount(item.amount, item.currency || "")} for ${tokens}` : tokens}{item.meta.reason ? ` · ${item.meta.reason}` : ""}</p>
      </RecordBlock>
      <RecordBlock eyebrow="Credit movement" title="Pending token credit">
        {item.status === "approved" ? <p>Tokens were credited to the wallet when this payment was approved.</p>
          : item.status === "declined" ? <p>No tokens were granted; the payment row closed without crediting.</p>
          : <p>{tokens} are held until an administrator approves this payment.</p>}
      </RecordBlock>
    </div>
  );
}

function History({ events }: { events: HistoryEvent[] }) {
  return (
    <section aria-labelledby="approval-history" className="border border-g-hairline bg-g-surface p-4 gdesk:p-5">
      <h2 id="approval-history" className="text-g-label text-g-ink">History</h2>
      <p className="text-g-meta text-g-ink-3">Ordered events with actor and timestamp.</p>
      {events.length ? (
        <ol className="mt-4 grid gap-4">
          {events.map(event => {
            const tone = event.label === "Approved by admin" || event.label === "Approved by referrer" ? "bg-g-emerald" : event.label === "Rejected by admin" || event.label === "Rejected by referrer" ? "bg-g-crimson" : "bg-g-ink";
            return (
              <li key={event.id} className="flex gap-3">
                <span aria-hidden="true" className={cn("mt-1.5 size-(--g-dot) shrink-0 rounded-full", tone)} />
                <div className="min-w-0">
                  <p className="text-g-label text-g-ink">{event.label}</p>
                  <span className="block text-g-meta text-g-ink-3">{event.actor} · {compactDateTime(event.time)}</span>
                  {event.note ? <span className="mt-1 block break-words text-g-meta text-g-ink-2">Note: {event.note}</span> : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : <p className="mt-4 text-g-meta text-g-ink-2">No history events are recorded for this item yet.</p>}
    </section>
  );
}

export default function GoalAdminApprovalRecord() {
  const { isSignedIn, getToken, openSignIn } = useAuth();
  const [match, params] = useRoute<{ kind: string; id: string }>("/admin/approvals/:kind/:id");
  const kind = (match ? params.kind : "") as AdminApprovalQueueKind;
  const itemId = Number(match ? params.id : 0);
  const [item, setItem] = useState<AdminApprovalQueueItem | null>(null);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [workingDecision, setWorkingDecision] = useState<ApprovalDecision | null>(null);
  const [decisionError, setDecisionError] = useState<DecisionFailure | null>(null);

  const load = async () => {
    if (!isSignedIn) return;
    setLoading(true); setError(""); setDenied(false);
    try {
      const result = await loadApprovalRecord(getToken, kind, itemId);
      if (result.denied) { setDenied(true); return; }
      setItem(result.item);
      setEvents(result.events);
      setDecisionError(null);
      setLoaded(true);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : RECORD_LOAD_FALLBACK); }
    finally { setLoading(false); }
  };

  const decide = async (decision: ApprovalDecision) => {
    if (!item || !kind) return;
    setWorkingDecision(decision); setDecisionError(null);
    try {
      const payload = await postApprovalDecision(getToken, kind, item.id, { decision, note: note.trim() || undefined });
      const nextStatus = statusAfter(decision, payload.status);
      const now = new Date();
      setItem(current => current ? { ...current, status: nextStatus, meta: { ...current.meta, approvalNote: note.trim() || current.meta.approvalNote } } : current);
      setEvents(current => [...current.filter(event => event.label !== decisionLabel(decision)), { id: `local-decision-${now.getTime()}`, label: decisionLabel(decision), actor: "You (administrator)", time: now, note: note.trim() || undefined }].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()));
    } catch (resolveError) { setDecisionError(decisionFailureOf(resolveError)); }
    finally { setWorkingDecision(null); }
  };

  useEffect(() => { void load(); }, [isSignedIn, kind, itemId]);

  if (!isSignedIn) {
    return (
      <AdminGoalFrame screen="admin-approval-record-sign-in">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="Sign in with an administrator account to view and decide this record." />
        <GoalNextStep>
          {/* SignInButton renders its own <button>; wrapping GoalButton in it nests buttons. */}
          <GoalButton variant="primary" className="mt-3" onClick={() => openSignIn()}>Sign in</GoalButton>
        </GoalNextStep>
      </AdminGoalFrame>
    );
  }

  if (denied) {
    return (
      <AdminGoalFrame screen="admin-approval-record-forbidden">
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body="This record is available only to the designated administrator account." />
        <GoalNextStep reason={ACCESS_MESSAGE}>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <GoalButton variant="primary" asChild><a href={adminSignInHref(typeof window === "undefined" ? "/admin" : window.location.pathname)}>Sign in as administrator</a></GoalButton>
            <GoalButton variant="ghost" asChild><a href={QUEUE_HREF}>Back to approvals</a></GoalButton>
          </div>
        </GoalNextStep>
      </AdminGoalFrame>
    );
  }

  const back = <a href={QUEUE_HREF} className="mb-4 inline-flex text-g-meta text-g-ink underline decoration-g-hairline underline-offset-4 hover:decoration-g-ink">Back to approvals</a>;

  if (error) {
    return (
      <AdminGoalFrame screen="admin-approval-record-error">
        {back}
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body={BODY} />
        <GoalNextStep reason="This record didn't load. Trying again only re-reads it.">
          <p role="alert" className="mt-3 text-g-label text-g-ink">{error}</p>
          <GoalButton variant="primary" className="mt-3" busy={loading} busyLabel="Loading…" onClick={() => void load()}>Try again</GoalButton>
        </GoalNextStep>
      </AdminGoalFrame>
    );
  }

  if (!loaded || (loading && !item)) {
    return (
      <AdminGoalFrame screen="admin-approval-record-loading">
        {back}
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body={BODY} />
        <GoalSkeletonRows density="ask" count={3} className="px-0" />
      </AdminGoalFrame>
    );
  }

  if (!item) {
    return (
      <AdminGoalFrame screen="admin-approval-record-missing">
        {back}
        <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body={BODY} />
        <GoalNextStep reason="This record is no longer listed in the approval queue.">
          <p className="mt-3 text-g-label text-g-ink">Record not found</p>
          <GoalButton variant="primary" className="mt-3" asChild><a href={QUEUE_HREF}>Back to approvals</a></GoalButton>
        </GoalNextStep>
      </AdminGoalFrame>
    );
  }

  const resolved = isResolved(item.status);
  // A failed decision leaves the server state unknown: hold both actions until
  // the offered reload reconciles the record (coordinator finding, Nov 6).
  const held = resolved ? "This record is already resolved" : decisionError ? "Reload this record before you decide again" : undefined;
  const working = workingDecision !== null;
  return (
    <AdminGoalFrame screen="admin-approval-record">
      {back}
      <AdminGoalHeading goalLine={GOAL_PAGE.goalLine} body={BODY} />
      {/* Phone order: the record (with any amount) first, then the decision, then the history. */}
      <div className="grid items-start gap-6 gdesk:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-4 gdesk:col-start-1 gdesk:row-start-1">
          <section aria-labelledby="approval-record-title" className="border border-g-hairline bg-g-surface p-4 gdesk:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-g-meta text-g-ink-3">{KIND_LABEL[item.kind]}</p>
                <h2 id="approval-record-title" className="break-words text-g-heading text-g-ink">{itemTitle(item)}</h2>
                <p className="mt-1 text-g-meta text-g-ink-2">{item.companyDomain || item.provider || "Credit pack"} · {compactDateTime(item.createdAt)}</p>
              </div>
              <GoalStatus {...approvalStatus(item.status)} />
            </div>
          </section>
          <RecordBlocks item={item} />
        </div>
        <div className="min-w-0 gdesk:col-start-2 gdesk:row-span-2 gdesk:row-start-1">
          <GoalNextStep reason="Record a decision on this item. The note is optional and recorded on the item.">
            {resolved ? <p className="mt-3"><GoalStatus status="withdrawn" label="Already resolved" /></p> : null}
            <label htmlFor="decision-note" className="mt-3 block text-g-label text-g-ink">Decision note (optional, recorded on the item)</label>
            <textarea id="decision-note" value={note} onChange={event => setNote(event.target.value)} placeholder="Operational context for the audit trail" rows={2}
              className="mt-2 block w-full resize-none rounded-g-control border border-g-control-edge bg-g-surface p-3 text-g-body text-g-ink placeholder:text-g-ink-3" />
            {decisionError ? (
              <div role="alert" className="mt-3 border-l-2 border-g-crimson pl-3">
                <p className="text-g-meta text-g-crimson">{decisionFailureCopy(decisionError, "this record")}</p>
                <GoalButton size="sm" variant="outline" className="mt-2" busy={loading} busyLabel="Loading…" onClick={() => void load()}>Reload this record</GoalButton>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <GoalButton variant="primary" busy={workingDecision === "approved"} busyLabel="Saving…" disabledReason={held ?? (working && workingDecision !== "approved" ? "A decision is being recorded" : undefined)} onClick={() => void decide("approved")}>Approve</GoalButton>
              <GoalButton variant="ghost" className="text-g-crimson" busy={workingDecision === "rejected"} busyLabel="Saving…" disabledReason={held ?? (working && workingDecision !== "rejected" ? "A decision is being recorded" : undefined)} onClick={() => void decide("rejected")}>Reject</GoalButton>
            </div>
          </GoalNextStep>
        </div>
        <div className="min-w-0 gdesk:col-start-1 gdesk:row-start-2">
          <History events={events} />
        </div>
      </div>
    </AdminGoalFrame>
  );
}
