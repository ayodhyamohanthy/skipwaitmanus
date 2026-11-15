// Goal /admin/payments (D-048-p3-admin-money). The three server calls below are
// copied verbatim from AdminPaymentsReview.tsx: load, one decision per parked
// payment, and the credit-revocation refund. Only the presentation changes
// (packet §4.1). Status is dot+text with goal tokens, never inline colour.
// Design-review repairs (2026-11-05): the queue renders the goal review row
// (GoalPaymentReviewRow) instead of the kit's coloured pills, and the error
// state wins over the empty states while the queue is not answering.
import { useEffect, useState } from "react";
import { useAuth } from "@/_core/auth";
import { compactDate, displayPaymentRef as displayRef, formatAmount } from "@/components/admin/paymentReviewCopy";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalEmptyState, GoalErrorState, GoalSkeletonRows } from "@/components/goal/GoalStates";
import { GoalNextStep } from "@/components/goal/GoalNextStep";
import { GoalStatus } from "@/components/goal/GoalStatus";
import { readApiJson } from "@/lib/apiResponse";
import { paymentReviewOutcomeSchema, type PaymentReviewRequestBody } from "@shared/paymentReview";
import type { ReviewQueuePayment, ReviewSubmitResult } from "@/components/admin/PaymentReviewRow";
import { AdminMoneyGoalFrame, AdminMoneyHeading } from "./AdminMoneyGoalFrame";
import { MONEY_GOAL_LINE } from "./adminMoneyCopy";
import GoalPaymentReviewRow from "./GoalPaymentReviewRow";

export const GOAL_PAGE = { goalLine: MONEY_GOAL_LINE } as const;

type ReviewPayment = { id: number; provider: string; providerHostedPageId: string | null; checkoutIntentId: string | null; userId: number; role: "job_seeker" | "referrer"; tokenCount: number; amount: number; currency: string; reconciliationReason: string | null; createdAt: string | Date; userEmail: string | null; status?: "credited" | "refunded" | "requires_review" };

export default function GoalAdminPayments() {
  const { isSignedIn, getToken, openSignIn } = useAuth();
  const [payments, setPayments] = useState<ReviewQueuePayment[]>([]);
  const [recent, setRecent] = useState<ReviewPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refundTarget, setRefundTarget] = useState<ReviewPayment | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState("");
  // An open row confirm dialog owns the one black commit while it is open (D-150).
  // Keyed by row so a repeated or late notification cannot release another row's.
  const [openRowDialogs, setOpenRowDialogs] = useState<ReadonlySet<number>>(() => new Set());

  const load = async () => {
    if (!isSignedIn) return;
    setLoading(true); setError("");
    try {
      const token = await getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [queueResponse, recentResponse] = await Promise.all([fetch("/api/admin/payments/review", { headers, credentials: "include" }), fetch("/api/admin/payments/review?scope=credited", { headers, credentials: "include" })]);
      const queuePayload = await readApiJson<{ payments?: ReviewQueuePayment[]; error?: string }>(queueResponse, "We could not load the payment review queue");
      const recentPayload = await readApiJson<{ payments?: ReviewPayment[]; error?: string }>(recentResponse, "We could not load recent payments");
      if (!queueResponse.ok) throw new Error(queuePayload.error || "We could not load the payment review queue");
      if (!recentResponse.ok) throw new Error(recentPayload.error || "We could not load recent payments");
      setPayments(queuePayload.payments || []);
      setRecent(recentPayload.payments || []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "We could not load the payment review queue"); }
    finally { setLoading(false); }
  };

  // One decision on one parked payment; the row turns the result into plain words (PaymentReviewRow).
  const submitReview = async (paymentId: number, body: PaymentReviewRequestBody): Promise<ReviewSubmitResult> => {
    const fallback = "We could not record this payment decision.";
    let response: Response;
    try {
      const token = await getToken();
      response = await fetch(`/api/admin/payments/review/${paymentId}`, { method: "POST", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
    } catch { return { ok: false, status: 0, message: `${fallback} Check your connection and try again.` }; }
    let payload: { payment?: unknown; error?: string };
    try { payload = await readApiJson<{ payment?: unknown; error?: string }>(response, fallback); }
    catch { return response.ok ? { ok: true, outcome: null } : { ok: false, status: response.status, message: fallback }; }
    if (!response.ok) return { ok: false, status: response.status, message: payload.error || fallback };
    const outcome = paymentReviewOutcomeSchema.safeParse(payload.payment);
    return { ok: true, outcome: outcome.success ? outcome.data : null };
  };

  const refund = async () => {
    if (!refundTarget) return;
    setRefunding(true); setRefundError("");
    try {
      const token = await getToken();
      const response = await fetch(`/api/admin/payments/review/${refundTarget.id}/revoke-credits`, { method: "POST", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({}) });
      const payload = await readApiJson<{ error?: string }>(response, "We could not revoke these credits");
      if (!response.ok) throw new Error(payload.error || "We could not revoke these credits");
      setRecent(current => current.filter(item => item.id !== refundTarget.id));
      setRefundTarget(null);
    } catch (refundFailure) { setRefundError(refundFailure instanceof Error ? refundFailure.message : "We could not revoke these credits"); }
    finally { setRefunding(false); }
  };

  useEffect(() => { void load(); }, [isSignedIn]);

  // The next step is the oldest flagged discrepancy: bring its row into view
  // and focus its first control. The money decisions themselves stay in the row.
  const revealOldest = () => {
    const first = payments[0];
    if (!first) return;
    const row = document.getElementById(`payment-row-${first.id}`);
    row?.scrollIntoView?.({ block: "center" });
    row?.querySelector<HTMLElement>("input, button")?.focus();
  };
  // Only a row still in the queue can hold the commit: an id left behind by a
  // row that a reload removed must not keep the page's next step ghost.
  const rowDialogOpen = payments.some(payment => openRowDialogs.has(payment.id));
  const oldest = payments[0] ?? null;
  const nextStep = error
    ? { label: "Reload the queue", reason: "The review queue is not answering. Reload it before deciding anything.", onClick: () => { void load(); }, busy: false }
    : oldest
      ? { label: "Review the oldest flagged payment", reason: "The oldest flagged discrepancy comes first. Every decision keeps its confirm step and its audit trail.", onClick: revealOldest, busy: false }
      : loading
        ? { label: "Review the oldest flagged payment", reason: "Reading the review queue. Nothing is shown as clear until it loads.", onClick: () => {}, busy: true }
        : { label: "Reload the queue", reason: "Nothing is waiting for a decision right now. Reload to check again.", onClick: () => { void load(); }, busy: false };

  if (!isSignedIn) {
    return (
      <AdminMoneyGoalFrame screen="admin-payments-sign-in" current="/admin/payments">
        <AdminMoneyHeading current="/admin/payments" />
        <GoalNextStep reason="Sign in with the designated administrator account before reviewing payment decisions.">
          <GoalButton variant="primary" className="mt-3" onClick={() => openSignIn()}>Sign in</GoalButton>
        </GoalNextStep>
      </AdminMoneyGoalFrame>
    );
  }

  return (
    <AdminMoneyGoalFrame screen="admin-payments" current="/admin/payments">
      <AdminMoneyHeading current="/admin/payments" />
      <GoalNextStep reason={nextStep.reason}>
        <GoalButton variant={refundTarget || rowDialogOpen ? "ghost" : "primary"} className="mt-3" busy={nextStep.busy} busyLabel="Reading the queue…" onClick={nextStep.onClick}>{nextStep.label}</GoalButton>
      </GoalNextStep>
      {error ? <GoalErrorState className="mt-6" title={error} retry={{ label: "Try again", onClick: () => { void load(); } }} /> : null}
      <section aria-label="Payments under review" className="mt-6 border border-g-hairline bg-g-surface">
        <div className="flex items-center justify-between gap-3 border-b border-g-hairline p-4">
          <h2 className="text-g-label text-g-ink">Flagged discrepancies</h2>
          <GoalStatus status={payments.length ? "waiting" : "accepted"} label={payments.length ? `${payments.length} under review` : "Queue clear"} />
        </div>
        {loading ? <GoalSkeletonRows density="queue" count={3} className="p-4" /> : null}
        {!loading && !error && !payments.length ? <GoalEmptyState title="Nothing needs review right now." body="Reconciled rows move out of this queue." /> : null}
        <ul>{payments.map(payment => <GoalPaymentReviewRow key={payment.id} payment={payment} submit={submitReview} onReload={() => { void load(); }} onConfirmingChange={open => setOpenRowDialogs(current => { const next = new Set(current); if (open) next.add(payment.id); else next.delete(payment.id); return next; })} />)}</ul>
      </section>
      <section aria-label="Recent credited payments" className="mt-6 border border-g-hairline bg-g-surface">
        <h2 className="border-b border-g-hairline p-4 text-g-label text-g-ink">Recent credited payments</h2>
        {loading ? <GoalSkeletonRows density="queue" count={2} className="p-4" /> : null}
        {!loading && !error && recent.length ? (
          <ul>{recent.map(item => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-g-hairline p-4 last:border-b-0">
              <span className="min-w-0">
                <span className="block truncate text-g-label text-g-ink">{displayRef(item.id)}</span>
                <span className="block text-g-meta text-g-ink-3">{compactDate(item.createdAt)} · {formatAmount(item.amount, item.currency)} · {item.tokenCount} credits</span>
              </span>
              {item.status === "refunded" ? <GoalStatus status="withdrawn" label="Closed" /> : (
                <GoalButton variant="outline" size="sm" onClick={() => { setRefundTarget(item); setRefundError(""); }}>Revoke credits</GoalButton>
              )}
            </li>
          ))}</ul>
        ) : null}
        {!loading && !error && !recent.length ? <GoalEmptyState title="No completed payments yet." body="Credited credit-pack payments appear here for refunds." /> : null}
      </section>
      {refundTarget ? (
        <div role="dialog" aria-modal="true" aria-label="Confirm credit revocation" className="fixed inset-0 z-50 grid place-items-center bg-g-canvas/80 p-4">
          <section className="w-full max-w-md border border-g-hairline bg-g-surface p-6">
            <h2 className="text-g-heading text-g-ink">Revoke these credits?</h2>
            <p className="mt-2 text-g-body text-g-ink-2">Remove {refundTarget.tokenCount} unspent credits from this user? This does not refund provider money. If any credits were spent, the action is blocked.</p>
            {refundError ? <p role="alert" className="mt-3 text-g-meta text-g-crimson">{refundError}</p> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <GoalButton variant="ghost" disabledReason={refunding ? "Revoking…" : undefined} onClick={() => setRefundTarget(null)}>Cancel</GoalButton>
              <GoalButton variant="primary" busy={refunding} busyLabel="Revoking…" onClick={() => { void refund(); }}>Confirm credit revocation</GoalButton>
            </div>
          </section>
        </div>
      ) : null}
    </AdminMoneyGoalFrame>
  );
}
