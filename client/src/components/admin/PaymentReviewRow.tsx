// One parked credit-pack payment in the admin review queue (client/src/pages/AdminPaymentsReview.tsx).
// The server says why it is parked (reviewKind, shared/paymentReview.ts) and the row offers only
// the decisions that kind allows: a pack never added can be added once or rejected; a pack refunded
// after its credits were added can have its unused credits taken back, or be kept and closed.
import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import StatusBadge from "@/components/StatusBadge";
import { DECISIONS_BY_KIND, parsePaymentReviewKind, type PaymentReviewDecision, type PaymentReviewOutcome, type PaymentReviewRequestBody } from "@shared/paymentReview";
import { compactDate, creditCount, decisionLabel, displayPaymentRef, formatAmount, outcomeBadge, outcomeText, parseTakeBackCount, reviewReasonText } from "./paymentReviewCopy";

export type ReviewQueuePayment = { id: number; provider: string; userId: number; role: string | null; tokenCount: number; amount: number; currency: string; reconciliationReason: string | null; createdAt: string | Date; userEmail: string | null; reviewKind?: unknown };
export type ReviewSubmitResult = { ok: true; outcome: PaymentReviewOutcome | null } | { ok: false; status: number; message: string };
type Props = { payment: ReviewQueuePayment; submit: (paymentId: number, body: PaymentReviewRequestBody) => Promise<ReviewSubmitResult>; onReload: () => void };
type Failure = { message: string; decision: PaymentReviewDecision; credits?: number; retryable: boolean };

const actionTone: Record<PaymentReviewDecision, string> = {
  credited: "border-[#15803d]/30 text-[#15803d] hover:bg-[#15803d]/10",
  rejected: "border-[#b91c1c]/30 text-[#b91c1c] hover:bg-[#b91c1c]/10",
  revoke_unused: "border-[#b45309]/30 text-[#B45309] hover:bg-[#b45309]/10",
  keep_credits: "border-[#cfcfcf] text-black hover:border-[#141414] hover:bg-[#f5f5f5]",
};

export default function PaymentReviewRow({ payment, submit, onReload }: Props) {
  const kind = parsePaymentReviewKind(payment.reviewKind);
  const pack = payment.tokenCount;
  const partialRefund = payment.reconciliationReason === "refund_partial";
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
    if (result.ok) { setDone({ decision, text: result.outcome ? outcomeText(result.outcome) : "Saved. Reload this page to see the result." }); return; }
    // Someone already decided this payment: show the queue as it is now rather than a failed save.
    if (result.status === 409 && /already resolved/i.test(result.message)) { onReload(); return; }
    setFailure({ message: result.message, decision, credits, retryable: result.status === 0 || result.status >= 500 });
  };

  const open = (decision: PaymentReviewDecision) => {
    if (decision === "revoke_unused") { setTakeBack(partialRefund ? "" : String(pack)); setConfirming(decision); return; }
    if (decision === "keep_credits") { setConfirming(decision); return; }
    void decide(decision);
  };

  const badge = done ? outcomeBadge(done.decision) : { label: "Under review", tone: "blue" as const };
  return <li className="rounded-xl border border-[#e5e5e5] bg-white p-4">
    <div className="flex items-start justify-between gap-3"><h2 className="truncate text-sm font-bold text-black">{displayPaymentRef(payment.id)}</h2><StatusBadge label={badge.label} tone={badge.tone} /></div>
    <p className="mt-1 truncate text-[11px] text-[#505050]">{payment.provider} · {formatAmount(payment.amount, payment.currency)} · {compactDate(payment.createdAt)}</p>
    <p className="mt-1 text-xs text-[#505050]">{reviewReasonText(payment.reconciliationReason)}</p>
    <p className="mt-1 truncate text-[11px] text-[#505050]">{who} · {(payment.role ?? "account").replace("_", " ")} · {creditCount(pack)} in this pack</p>
    {done ? <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#505050]">{done.text}</p>
      : !kind ? <div className="mt-3 rounded-lg border border-[#b45309]/30 bg-[#b45309]/10 px-3 py-2 text-xs font-semibold text-[#B45309]"><p>This payment's review state could not be read, so no action is offered here.</p><button type="button" onClick={onReload} className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-[#b45309]/30 bg-white px-3 py-1.5 text-[11px] font-bold text-[#B45309]">Reload this page</button></div>
      : <div className="mt-3">
        <label htmlFor={`payment-note-${payment.id}`} className="text-[11px] font-bold uppercase tracking-[.12em] text-[#505050]">Decision note (optional, recorded on the payment)</label>
        <input id={`payment-note-${payment.id}`} value={note} onChange={event => setNote(event.target.value)} placeholder="Chargebee reference or reconciliation context" className="mt-1 w-full rounded-lg border border-[#e5e5e5] px-3 py-2.5 text-sm outline-none focus:border-[#141414]" />
        {failure ? <div role="alert" className="mt-2 rounded-lg border border-[#b91c1c]/30 bg-[#b91c1c]/10 px-3 py-2 text-xs font-semibold text-[#B91C1C]"><p>{failure.message}</p><p className="mt-1">The payment is unchanged and still in this queue.</p>{failure.retryable ? <button type="button" disabled={working} onClick={() => void decide(failure.decision, failure.credits)} className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-[#b91c1c]/30 bg-white px-3 py-1.5 text-[11px] font-bold text-[#B91C1C]">Retry decision</button> : null}</div> : null}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">{DECISIONS_BY_KIND[kind].map(decision => <button key={decision} type="button" disabled={working} onClick={() => open(decision)} className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border bg-white px-4 py-2.5 text-xs font-bold ${actionTone[decision]}`}>{working ? "Recording…" : decisionLabel(decision, kind, pack)}</button>)}</div>
      </div>}
    <AlertDialog open={confirming === "revoke_unused"} onOpenChange={next => { if (!next) setConfirming(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Take back unused credits?</AlertDialogTitle>
          <AlertDialogDescription>Chargebee already returned this payment's money. This removes up to the number below from {who}'s unused purchased credits. Nothing goes below zero: credits already used stay used, and plan or promo credits are not touched.</AlertDialogDescription>
        </AlertDialogHeader>
        {partialRefund ? <p className="text-sm text-[#505050]">Only part of this payment was refunded. Check the refund in Chargebee and enter the credits it covers.</p> : null}
        <div><label htmlFor={`take-back-${payment.id}`} className="text-[11px] font-bold uppercase tracking-[.12em] text-[#505050]">Credits to take back (1 to {pack})</label><input id={`take-back-${payment.id}`} type="number" inputMode="numeric" min={1} max={pack} step={1} value={takeBack} onChange={event => setTakeBack(event.target.value)} className="mt-1 w-full rounded-lg border border-[#e5e5e5] px-3 py-2.5 text-sm outline-none focus:border-[#141414]" /></div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={takeBackCount === null || working} onClick={() => { if (takeBackCount !== null) void decide("revoke_unused", takeBackCount); }} className="border border-[#b45309]/30 bg-white text-[#B45309] hover:bg-[#b45309]/10">Take back credits</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={confirming === "keep_credits"} onOpenChange={next => { if (!next) setConfirming(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Keep the credits and close?</AlertDialogTitle>
          <AlertDialogDescription>Chargebee already returned this payment's money. Nothing is taken back from {who}'s wallet, and this payment closes for good: there is no undo.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={working} onClick={() => void decide("keep_credits")} className="border border-[#cfcfcf] bg-white text-black hover:border-[#141414] hover:bg-[#f5f5f5]">Keep credits and close</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </li>;
}
