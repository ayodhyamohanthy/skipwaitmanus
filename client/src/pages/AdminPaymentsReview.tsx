import { AlertCircle, CreditCard, LoaderCircle, RotateCcw, ShieldCheck } from "lucide-react";
import React, { useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Brand } from "@/components/Brand";
import { AdminNav } from "@/components/AdminNav";
import StatusBadge from "@/components/StatusBadge";
import PaymentReviewRow, { type ReviewQueuePayment, type ReviewSubmitResult } from "@/components/admin/PaymentReviewRow";
import { compactDate, displayPaymentRef as displayRef, formatAmount } from "@/components/admin/paymentReviewCopy";
import { readApiJson } from "@/lib/apiResponse";
import { paymentReviewOutcomeSchema, type PaymentReviewRequestBody } from "@shared/paymentReview";

type ReviewPayment = { id: number; provider: string; providerHostedPageId: string | null; checkoutIntentId: string | null; userId: number; role: "job_seeker" | "referrer"; tokenCount: number; amount: number; currency: string; reconciliationReason: string | null; createdAt: string | Date; userEmail: string | null; status?: "credited" | "refunded" | "requires_review" };

export default function AdminPaymentsReview() {
  const { isSignedIn, getToken } = useAuth();
  const [payments, setPayments] = useState<ReviewQueuePayment[]>([]);
  const [recent, setRecent] = useState<ReviewPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refundTarget, setRefundTarget] = useState<ReviewPayment | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState("");

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
  if (!isSignedIn) return <main className="min-h-screen bg-white px-6 py-6 text-black"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-2xl border border-[#e5e5e5] bg-white p-8"><ShieldCheck className="h-7 w-7 text-black" /><h1 className="mt-4 text-2xl font-semibold">Administrator payment reviews</h1><p className="mt-2 text-sm leading-6 text-[#505050]">Sign in with an administrator account to reconcile credit-pack payments that need a manual review.</p><SignInButton><button type="button" className="mt-5 rounded-lg bg-[#141414] px-4 py-3 text-sm font-semibold text-white">Secure sign in</button></SignInButton></section></div></main>;
  return <main className="min-h-screen bg-white px-5 py-6 text-black sm:px-6"><div className="mx-auto max-w-6xl"><AdminNav current="payments" badge="Administrator diagnostics" /><section className="mt-10 rounded-2xl border border-[#e5e5e5] bg-white p-5 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-black">Payment review queue</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Reconcile held credit-pack payments.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#505050]">Each payment shows why it is held and offers only the safe actions: a pack that was never added can be added once or rejected, and a pack Chargebee refunded after its credits were added can have its unused credits taken back or be kept and closed.</p></div><span className="inline-flex items-center gap-2 text-xs font-semibold text-[#505050]"><CreditCard className="h-4 w-4 text-black" />{payments.length ? `${payments.length} under review` : "Queue"}</span></div>{error && <div className="mt-5 flex items-start justify-between gap-3 rounded-xl border border-[#b45309]/30 bg-[#b45309]/10 p-4 text-sm text-[#B45309]"><span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></span><button type="button" onClick={() => void load()} className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-[#b45309]/30 bg-white px-4 py-2 text-xs font-bold text-[#B45309]">Retry</button></div>}{loading ? <div className="mt-8 flex items-center gap-2 text-sm text-[#505050]"><LoaderCircle className="h-4 w-4 animate-spin" />Loading payment review queue…</div> : !payments.length ? <div className="mt-7 rounded-xl border border-dashed border-[#e5e5e5] p-10 text-center"><p className="text-sm font-bold text-black">Queue clear</p><p className="mt-1 text-sm text-[#505050]">No payments need review. Reconciled rows move out of this queue.</p></div> : <div className="mt-7 grid gap-3"><ul className="grid gap-3">{payments.map(payment => <PaymentReviewRow key={payment.id} payment={payment} submit={submitReview} onReload={() => void load()} />)}</ul></div>}</section><section className="mt-8 rounded-2xl border border-[#e5e5e5] bg-white p-5 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-black">Recently completed payments</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">Credited payment rows.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#505050]">Latest credited credit-pack payments. Credit revocation is a ledger-only action and never claims to return provider money.</p></div><span className="inline-flex items-center gap-2 text-xs font-semibold text-[#505050]"><CreditCard className="h-4 w-4 text-black" />{recent.length ? `${recent.length} recent` : "Ledger"}</span></div>{recent.length ? <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-[#e5e5e5] text-xs font-bold uppercase tracking-[.12em] text-[#505050]"><tr><th className="pb-3 pr-4">Payment</th><th className="pb-3 pr-4">Amount</th><th className="pb-3 pr-4">Tokens</th><th className="pb-3 pr-4">Status</th><th className="pb-3">Action</th></tr></thead><tbody>{recent.map(payment => { const isRefunded = payment.status === "refunded"; return <tr key={payment.id} className="border-b border-[#e5e5e5] last:border-0"><td className="py-4 pr-4"><p className="font-semibold text-black">{displayRef(payment.id)}</p><p className="mt-0.5 truncate text-[11px] text-[#505050]">{payment.provider} · {payment.userEmail || `User #${payment.userId}`} · {compactDate(payment.createdAt)}</p></td><td className="py-4 pr-4 text-black">{formatAmount(payment.amount, payment.currency)}</td><td className="py-4 pr-4 text-black">{payment.tokenCount} token{payment.tokenCount === 1 ? "" : "s"}</td><td className="py-4 pr-4">{isRefunded ? <StatusBadge label="Refunded" tone="slate" /> : <StatusBadge label="Credited" tone="green" />}</td><td className="py-4">{payment.status === "credited" && !isRefunded ? <button type="button" onClick={() => { setRefundError(""); setRefundTarget(payment); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[#cfcfcf] bg-white px-3 py-1.5 text-xs font-bold text-black hover:border-[#b45309]/30 hover:bg-[#b45309]/10"><RotateCcw className="h-3.5 w-3.5" />Revoke credits</button> : <span className="text-xs font-semibold text-[#505050]">Closed</span>}</td></tr>; })}</tbody></table></div> : <div className="mt-7 rounded-xl border border-dashed border-[#e5e5e5] p-10 text-center"><p className="text-sm font-bold text-black">No completed payments yet</p><p className="mt-1 text-sm text-[#505050]">Credited credit-pack payments will appear here for refunds.</p></div>}</section>{refundTarget ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Confirm credit revocation"><div className="w-full max-w-md rounded-2xl border border-[#e5e5e5] bg-white p-6"><h2 className="text-lg font-semibold text-black">Revoke these credits?</h2><p className="mt-2 text-sm leading-6 text-[#505050]">Remove {refundTarget.tokenCount} unspent credits from this user? This does not refund provider money. If any credits were spent, the action is blocked.</p>{refundError ? <p role="alert" className="mt-3 rounded-lg border border-[#b91c1c]/30 bg-[#b91c1c]/10 px-3 py-2 text-xs font-semibold text-[#B91C1C]">{refundError}</p> : null}<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={refunding} onClick={() => setRefundTarget(null)} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[#cfcfcf] bg-white px-4 py-2 text-sm font-bold text-black">Cancel</button><button type="button" disabled={refunding} onClick={() => void refund()} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#b91c1c] px-4 py-2 text-sm font-bold text-white hover:bg-[#B91C1C]/85">{refunding ? "Revoking…" : "Confirm credit revocation"}</button></div></div></div> : null}</div></main>;
}
