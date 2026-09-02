import { AlertCircle, CreditCard, LoaderCircle, RotateCcw, ShieldCheck } from "lucide-react";
import React, { useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Brand } from "@/components/Brand";
import StatusBadge from "@/components/StatusBadge";
import { readApiJson } from "@/lib/apiResponse";

type ReviewPayment = { id: number; provider: string; providerHostedPageId: string | null; checkoutIntentId: string | null; userId: number; role: "job_seeker" | "referrer"; tokenCount: number; amount: number; currency: string; reconciliationReason: string | null; createdAt: string | Date; userEmail: string | null; status?: "credited" | "refunded" | "requires_review" };
type PaymentDecision = "credited" | "rejected";

const displayRef = (id: number) => `Ref-PMT-${1000 + id}`;

function formatAmount(amount: number, currency: string) {
  const major = amount / 100;
  return `${currency} ${major % 1 === 0 ? major.toFixed(0) : major.toFixed(2)}`;
}

function compactDate(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recorded";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export default function AdminPaymentsReview() {
  const { isSignedIn, getToken } = useAuth();
  const [payments, setPayments] = useState<ReviewPayment[]>([]);
  const [recent, setRecent] = useState<ReviewPayment[]>([]);
  const [decided, setDecided] = useState<Record<number, PaymentDecision>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState<Record<number, { message: string; decision: PaymentDecision }>>({});
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
      const queuePayload = await readApiJson<{ payments?: ReviewPayment[]; error?: string }>(queueResponse, "We could not load the payment review queue");
      const recentPayload = await readApiJson<{ payments?: ReviewPayment[]; error?: string }>(recentResponse, "We could not load recent payments");
      if (!queueResponse.ok) throw new Error(queuePayload.error || "We could not load the payment review queue");
      if (!recentResponse.ok) throw new Error(recentPayload.error || "We could not load recent payments");
      setPayments(queuePayload.payments || []);
      setRecent(recentPayload.payments || []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "We could not load the payment review queue"); }
    finally { setLoading(false); }
  };

  const resolve = async (payment: ReviewPayment, decision: PaymentDecision) => {
    setWorkingId(payment.id); setRowErrors(current => { const next = { ...current }; delete next[payment.id]; return next; });
    try {
      const token = await getToken();
      const note = notes[payment.id]?.trim();
      const response = await fetch(`/api/admin/payments/review/${payment.id}`, { method: "POST", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ decision, note: note || undefined }) });
      const payload = await readApiJson<{ payment?: { decision?: PaymentDecision }; error?: string }>(response, "We could not record this payment decision");
      if (!response.ok) throw new Error(payload.error || "We could not record this payment decision");
      setDecided(current => ({ ...current, [payment.id]: payload.payment?.decision ?? decision }));
    } catch (resolveError) { setRowErrors(current => ({ ...current, [payment.id]: { message: resolveError instanceof Error ? resolveError.message : "We could not record this payment decision", decision } })); }
    finally { setWorkingId(null); }
  };

  const refund = async () => {
    if (!refundTarget) return;
    setRefunding(true); setRefundError("");
    try {
      const token = await getToken();
      const response = await fetch(`/api/admin/payments/review/${refundTarget.id}/refund`, { method: "POST", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({}) });
      const payload = await readApiJson<{ error?: string }>(response, "We could not refund this payment");
      if (!response.ok) throw new Error(payload.error || "We could not refund this payment");
      setRecent(current => current.map(item => item.id === refundTarget.id ? { ...item, status: "refunded" } : item));
      setRefundTarget(null);
    } catch (refundFailure) { setRefundError(refundFailure instanceof Error ? refundFailure.message : "We could not refund this payment"); }
    finally { setRefunding(false); }
  };

  useEffect(() => { void load(); }, [isSignedIn]);
  if (!isSignedIn) return <main className="min-h-screen bg-slate-50 px-6 py-6 text-slate-950"><div className="mx-auto max-w-xl"><Brand /><section className="mt-20 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><ShieldCheck className="h-7 w-7 text-[#0B57D0]" /><h1 className="mt-4 text-2xl font-semibold">Administrator payment reviews</h1><p className="mt-2 text-sm leading-6 text-slate-600">Sign in with an administrator account to reconcile credit-pack payments that need a manual review.</p><SignInButton><button type="button" className="mt-5 rounded-lg bg-[#0B57D0] px-4 py-3 text-sm font-semibold text-white">Secure sign in</button></SignInButton></section></div></main>;
  return <main className="min-h-screen bg-slate-50 px-5 py-6 text-slate-950 sm:px-6"><div className="mx-auto max-w-6xl"><header className="flex items-center justify-between gap-4"><Brand /><span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-[#0B57D0]"><ShieldCheck className="h-3.5 w-3.5" />Administrator diagnostics</span></header><section className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Payment review queue</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Reconcile held credit-pack payments.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">These payments need a manual decision before tokens are granted. Mark a payment credited to grant its tokens and record the decision, or reject it to close the row without crediting.</p></div><span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500"><CreditCard className="h-4 w-4 text-[#0B57D0]" />{payments.length ? `${payments.length} under review` : "Queue"}</span></div>{error && <div className="mt-5 flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></span><button type="button" onClick={() => void load()} className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-900">Retry</button></div>}{loading ? <div className="mt-8 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading payment review queue…</div> : !payments.length ? <div className="mt-7 rounded-xl border border-dashed border-slate-200 p-10 text-center"><p className="text-sm font-bold text-slate-800">Queue clear</p><p className="mt-1 text-sm text-slate-600">No payments need review. Reconciled rows move out of this queue.</p></div> : <div className="mt-7 grid gap-3"><ul className="grid gap-3">{payments.map(payment => { const currentDecision = decided[payment.id]; return <li key={payment.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><h2 className="truncate text-sm font-bold text-slate-900">{displayRef(payment.id)}</h2>{currentDecision ? <StatusBadge label={currentDecision === "credited" ? "Credited" : "Rejected"} tone={currentDecision === "credited" ? "green" : "red"} /> : <StatusBadge label="Under review" tone="blue" />}</div><p className="mt-1 truncate text-[11px] text-[#78716c]">{payment.provider} · {formatAmount(payment.amount, payment.currency)} · {compactDate(payment.createdAt)}</p><p className="mt-1 text-xs text-slate-600">{payment.reconciliationReason || "Flagged for manual reconciliation"}</p><p className="mt-1 truncate text-[11px] text-slate-500">{payment.userEmail || `User #${payment.userId}`} · {payment.role.replace("_", " ")} · {payment.tokenCount} token{payment.tokenCount === 1 ? "" : "s"}</p>{currentDecision ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">Decision recorded: {currentDecision === "credited" ? "tokens credited to the wallet" : "closed without crediting"}.</p> : <div className="mt-3"><label htmlFor={`payment-note-${payment.id}`} className="text-[11px] font-bold uppercase tracking-[.12em] text-slate-500">Decision note (optional, recorded on the payment)</label><input id={`payment-note-${payment.id}`} value={notes[payment.id] ?? ""} onChange={event => setNotes(current => ({ ...current, [payment.id]: event.target.value }))} placeholder="Payment reference or reconciliation context" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0B57D0]" />{rowErrors[payment.id] ? <div role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800"><p>Decision failed to save — {rowErrors[payment.id].message} The record is unchanged and still in the queue. No notifications were sent.</p><button type="button" disabled={workingId === payment.id} onClick={() => void resolve(payment, rowErrors[payment.id].decision)} className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[11px] font-bold text-rose-800">Retry decision</button></div> : null}<div className="mt-3 flex flex-col gap-2 sm:flex-row"><button type="button" disabled={workingId === payment.id} onClick={() => void resolve(payment, "credited")} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-emerald-300 bg-white px-4 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">{workingId === payment.id ? "Recording…" : `Mark credited · ${payment.tokenCount} token${payment.tokenCount === 1 ? "" : "s"}`}</button><button type="button" disabled={workingId === payment.id} onClick={() => void resolve(payment, "rejected")} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-rose-300 bg-white px-4 py-2.5 text-xs font-bold text-[#b91c1c] hover:bg-rose-50 disabled:opacity-50">{workingId === payment.id ? "Recording…" : "Reject"}</button></div></div>}</li>; })}</ul></div>}</section><section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#0B57D0]">Recently completed payments</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.035em]">Credited and refunded rows.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Latest credited credit-pack payments and any administrator refunds. Refunding deducts the tokens from the user's credit balance; the original payment record is preserved.</p></div><span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500"><CreditCard className="h-4 w-4 text-[#0B57D0]" />{recent.length ? `${recent.length} recent` : "Ledger"}</span></div>{recent.length ? <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-slate-200 text-xs font-bold uppercase tracking-[.12em] text-slate-500"><tr><th className="pb-3 pr-4">Payment</th><th className="pb-3 pr-4">Amount</th><th className="pb-3 pr-4">Tokens</th><th className="pb-3 pr-4">Status</th><th className="pb-3">Action</th></tr></thead><tbody>{recent.map(payment => { const isRefunded = payment.status === "refunded"; return <tr key={payment.id} className="border-b border-slate-100 last:border-0"><td className="py-4 pr-4"><p className="font-semibold text-slate-900">{displayRef(payment.id)}</p><p className="mt-0.5 truncate text-[11px] text-[#78716c]">{payment.provider} · {payment.userEmail || `User #${payment.userId}`} · {compactDate(payment.createdAt)}</p></td><td className="py-4 pr-4 text-slate-700">{formatAmount(payment.amount, payment.currency)}</td><td className="py-4 pr-4 text-slate-700">{payment.tokenCount} token{payment.tokenCount === 1 ? "" : "s"}</td><td className="py-4 pr-4">{isRefunded ? <StatusBadge label="Refunded" tone="slate" /> : <StatusBadge label="Credited" tone="green" />}</td><td className="py-4">{isRefunded ? <span className="text-xs font-semibold text-slate-400">Closed</span> : <button type="button" onClick={() => { setRefundError(""); setRefundTarget(payment); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-amber-300 hover:bg-amber-50"><RotateCcw className="h-3.5 w-3.5" />Refund</button>}</td></tr>; })}</tbody></table></div> : <div className="mt-7 rounded-xl border border-dashed border-slate-200 p-10 text-center"><p className="text-sm font-bold text-slate-800">No completed payments yet</p><p className="mt-1 text-sm text-slate-600">Credited credit-pack payments will appear here for refunds.</p></div>}</section>{refundTarget ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-label="Confirm refund"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"><h2 className="text-lg font-semibold text-slate-950">Refund this payment?</h2><p className="mt-2 text-sm leading-6 text-slate-600">Refund {formatAmount(refundTarget.amount, refundTarget.currency)} to the user's credit balance? The original payment record is preserved.</p>{refundError ? <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{refundError}</p> : null}<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" disabled={refunding} onClick={() => setRefundTarget(null)} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50">Cancel</button><button type="button" disabled={refunding} onClick={() => void refund()} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#b91c1c] px-4 py-2 text-sm font-bold text-white hover:bg-[#991b1b] disabled:opacity-50">{refunding ? "Refunding…" : "Confirm refund"}</button></div></div></div> : null}</div></main>;
}
