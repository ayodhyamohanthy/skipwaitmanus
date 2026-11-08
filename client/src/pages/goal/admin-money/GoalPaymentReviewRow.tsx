// Goal /admin/payments review row (D-048-p3-admin-money). The decision logic
// mirrors the kit row (client/src/components/admin/PaymentReviewRow.tsx): same
// kinds, same allowed decisions, same note, same confirm steps for take-back
// and keep-and-close, and every server call goes through the page's `submit`
// prop, which is byte-identical to the kit page's fetch. Only the presentation
// differs: goal tokens, dot+text status, ghost/outline controls - the kit's
// coloured pills do not survive here (design-review finding 1, 2026-11-05).
import { useState } from "react";
import { DECISIONS_BY_KIND, parsePaymentReviewKind, paymentRefundSummarySchema, type PaymentReviewDecision, type PaymentReviewOutcome, type PaymentReviewRequestBody } from "@shared/paymentReview";
import { compactDate, creditCount, decisionLabel, displayPaymentRef, formatAmount, outcomeText, parseTakeBackCount, refundLine, reviewReasonText, takeBackCountNote } from "@/components/admin/paymentReviewCopy";
import { GoalButton } from "@/components/goal/GoalButton";
import { GoalStatus } from "@/components/goal/GoalStatus";
import type { ReviewQueuePayment, ReviewSubmitResult } from "@/components/admin/PaymentReviewRow";

type Failure = { message: string; decision: PaymentReviewDecision; credits?: number; retryable: boolean };
type Props = { payment: ReviewQueuePayment; submit: (paymentId: number, body: PaymentReviewRequestBody) => Promise<ReviewSubmitResult>; onReload: () => void; onConfirmingChange?: (open: boolean) => void };

export default function GoalPaymentReviewRow({ payment, submit, onReload, onConfirmingChange }: Props) {
  const kind = parsePaymentReviewKind(payment.reviewKind);
  const pack = payment.tokenCount;
  const countNote = takeBackCountNote(payment.reconciliationReason);
  const refunds = paymentRefundSummarySchema.safeParse(payment.refunds);
  const who = payment.userEmail || `User #${payment.userId}`;
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [done, setDone] = useState<{ decision: PaymentReviewDecision; text: string } | null>(null);
  const [confirming, setConfirming] = useState<"revoke_unused" | "keep_credits" | null>(null);
  const [takeBack, setTakeBack] = useState("");
  const takeBackCount = parseTakeBackCount(takeBack, pack);

  const decide = async (decision: PaymentReviewDecision, credits?: number) => {
    setWorking(true); setFailure(null);
    const trimmed = note.trim();
    const withNote = trimmed ? { note: trimmed } : {};
    const body: PaymentReviewRequestBody = decision === "revoke_unused" ? { decision, ...withNote, ...(credits === undefined ? {} : { credits }) } : { decision, ...withNote };
    const result = await submit(payment.id, body);
    setWorking(false);
    // Every terminal answer closes the confirm step: the recorded result, the
    // reloaded queue or the failure alert must be visible, and a settled
    // dialog could send the same money decision a second time (review F1).
    setConfirm(null);
    if (result.ok) { setDone({ decision, text: result.outcome ? outcomeText(result.outcome) : "Saved. Reload this page to see the result." }); return; }
    // Someone already decided this payment: show the queue as it is now rather than a failed save.
    if (result.status === 409 && /already resolved/i.test(result.message)) { onReload(); return; }
    setFailure({ message: result.message, decision, credits, retryable: result.status === 0 || result.status >= 500 });
  };

  const setConfirm = (next: "revoke_unused" | "keep_credits" | null) => { setConfirming(next); onConfirmingChange?.(next !== null); };
  const open = (decision: PaymentReviewDecision) => {
    if (decision === "revoke_unused") { setTakeBack(countNote ? "" : String(pack)); setConfirm(decision); return; }
    if (decision === "keep_credits") { setConfirm(decision); return; }
    void decide(decision);
  };

  return <li id={`payment-row-${payment.id}`} className="border-b border-g-hairline p-4 last:border-b-0">
    <div className="flex items-start justify-between gap-3">
      <h3 className="truncate text-g-label text-g-ink">{displayPaymentRef(payment.id)}</h3>
      {done ? <GoalStatus status="accepted" label="Recorded" /> : <GoalStatus status="waiting" label="Under review" />}
    </div>
    <p className="mt-1 truncate text-g-meta text-g-ink-3">{payment.provider} · {formatAmount(payment.amount, payment.currency)} · {compactDate(payment.createdAt)}</p>
    <p className="mt-1 text-g-body text-g-ink-2">{reviewReasonText(payment.reconciliationReason)}</p>
    {refunds.success ? <p className="mt-1 text-g-body text-g-ink">{refundLine(refunds.data)}</p> : null}
    <p className="mt-1 truncate text-g-meta text-g-ink-3">{who} · {(payment.role ?? "account").replace("_", " ")} · {creditCount(pack)} in this pack</p>
    {done ? <p className="mt-3 text-g-body text-g-ink-2">{done.text}</p>
      : !kind ? <div className="mt-3 border border-g-hairline p-3 text-g-body text-g-ink-2">
        <p>This payment's review state could not be read, so no action is offered here.</p>
        <GoalButton variant="outline" size="sm" className="mt-2" onClick={onReload}>Reload this page</GoalButton>
      </div>
      : <div className="mt-3">
        <label htmlFor={`payment-note-${payment.id}`} className="text-g-meta text-g-ink-3">Decision note (optional, recorded on the payment)</label>
        <input id={`payment-note-${payment.id}`} value={note} onChange={event => setNote(event.target.value)} placeholder="Chargebee reference or reconciliation context" className="mt-1 block w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 py-2.5 text-g-body text-g-ink" />
        {failure ? <div role="alert" className="mt-2 text-g-body text-g-crimson">
          <p>{failure.message}</p>
          <p className="mt-1">The payment is unchanged and still in this queue.</p>
          {failure.retryable ? <GoalButton variant="outline" size="sm" disabledReason={working ? "Recording…" : undefined} className="mt-2" onClick={() => void decide(failure.decision, failure.credits)}>Retry decision</GoalButton> : null}
        </div> : null}
        <div className="mt-3 flex flex-col gap-2 gdesk:flex-row">{DECISIONS_BY_KIND[kind].map(decision => (
          <GoalButton key={decision} variant="ghost" disabledReason={working ? "Recording…" : undefined} onClick={() => open(decision)}>{working ? "Recording…" : decisionLabel(decision, kind, pack)}</GoalButton>
        ))}</div>
      </div>}
    {confirming === "revoke_unused" ? (
      <div role="dialog" aria-modal="true" aria-label="Take back unused credits?" className="fixed inset-0 z-50 grid place-items-center bg-g-canvas/80 p-4">
        <section className="w-full max-w-md border border-g-hairline bg-g-surface p-6">
          <h4 className="text-g-heading text-g-ink">Take back unused credits?</h4>
          <p className="mt-2 text-g-body text-g-ink-2">Chargebee already returned this payment's money. This removes up to the number below from {who}'s unused purchased credits. Nothing goes below zero: credits already used stay used, and plan or promo credits are not touched.</p>
          {countNote ? <p className="mt-2 text-g-body text-g-ink-2">{countNote}</p> : null}
          <label htmlFor={`take-back-${payment.id}`} className="mt-3 block text-g-meta text-g-ink-3">Credits to take back (1 to {pack})</label>
          <input id={`take-back-${payment.id}`} type="number" inputMode="numeric" min={1} max={pack} step={1} value={takeBack} onChange={event => setTakeBack(event.target.value)} className="mt-1 block w-full rounded-g-control border border-g-control-edge bg-g-surface px-3 py-2.5 text-g-body text-g-ink" />
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <GoalButton variant="ghost" onClick={() => setConfirm(null)}>Cancel</GoalButton>
            <GoalButton variant="primary" busy={working} busyLabel="Recording…" disabledReason={takeBackCount === null ? `Enter the credits to take back (1 to ${pack}).` : undefined} onClick={() => { if (takeBackCount !== null) void decide("revoke_unused", takeBackCount); }}>Take back credits</GoalButton>
          </div>
        </section>
      </div>
    ) : null}
    {confirming === "keep_credits" ? (
      <div role="dialog" aria-modal="true" aria-label="Keep the credits and close?" className="fixed inset-0 z-50 grid place-items-center bg-g-canvas/80 p-4">
        <section className="w-full max-w-md border border-g-hairline bg-g-surface p-6">
          <h4 className="text-g-heading text-g-ink">Keep the credits and close?</h4>
          <p className="mt-2 text-g-body text-g-ink-2">Chargebee already returned this payment's money. Nothing is taken back from {who}'s wallet, and this payment closes for good: there is no undo.</p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <GoalButton variant="ghost" onClick={() => setConfirm(null)}>Cancel</GoalButton>
            <GoalButton variant="primary" busy={working} busyLabel="Recording…" onClick={() => void decide("keep_credits")}>Confirm: keep credits and close</GoalButton>
          </div>
        </section>
      </div>
    ) : null}
  </li>;
}
