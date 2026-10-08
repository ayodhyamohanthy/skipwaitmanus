import { ArrowRight, BadgeCheck, CreditCard, ReceiptText } from "lucide-react";
import { useEffect, useState } from "react";
import { SignInButton, useAuth } from "@/_core/auth";
import { Link } from "wouter";
import { usePersistFn } from "@/hooks/usePersistFn";
import { readApiJson } from "@/lib/apiResponse";

type CreditSummary = { plan: string; monthlyAllowance: number; monthlyCreditsRemaining: number; totalAvailable: number; subscriptionStatus: string | null; subscriptionCurrentTermEnd: string | null };
type Receipt = { id: number; provider: string; amount: number; currency: string; tokenCount: number; status: string; providerInvoiceId: string | null; createdAt: string };

const PLAN_LABELS: Record<string, string> = { free: "Free", pro: "Pro", max: "Max" };

function money(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

function compactDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recorded";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export default function Billing() {
  const { isSignedIn, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    setLoading(true); setError("");
    void (async () => {
      try {
        const token = await fetchToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const [summaryResponse, receiptsResponse] = await Promise.all([
          fetch("/api/credits/summary?role=job_seeker", { credentials: "include", headers }),
          fetch("/api/billing/receipts?role=job_seeker", { credentials: "include", headers }),
        ]);
        const summaryPayload = await readApiJson<{ summary?: CreditSummary }>(summaryResponse, "We could not load your plan");
        const receiptsPayload = await readApiJson<{ receipts?: Receipt[] }>(receiptsResponse, "We could not load your receipts");
        if (!active) return;
        if (!summaryResponse.ok) throw new Error("We could not load your plan");
        if (!receiptsResponse.ok) throw new Error("We could not load your receipts");
        if (summaryPayload.summary) setSummary(summaryPayload.summary);
        setReceipts(Array.isArray(receiptsPayload.receipts) ? receiptsPayload.receipts : []);
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "We could not load billing"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [fetchToken, isSignedIn]);

  const cancelPlan = async () => {
    setCancelling(true); setError("");
    try {
      const token = await fetchToken();
      const response = await fetch("/api/chargebee/subscription-cancel", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ role: "job_seeker" }) });
      const payload = await readApiJson<{ currentTermEnd?: string; error?: string }>(response, "We could not schedule your cancellation");
      if (!response.ok) throw new Error(payload.error || "We could not schedule your cancellation");
      setSummary(current => current ? { ...current, subscriptionStatus: "non_renewing", subscriptionCurrentTermEnd: payload.currentTermEnd ?? current.subscriptionCurrentTermEnd } : current);
      setConfirmingCancel(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not schedule your cancellation"); }
    finally { setCancelling(false); }
  };

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="billing-sign-in" className="mx-auto max-w-xl px-5 py-6">
        <p className="eyebrow">Plans &amp; credits</p>
        <h1 className="mt-2 text-3xl font-semibold">Manage plan<span className="brand-dot">.</span></h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">Sign in to see your plan, payment history, and cancellation options.</p>
        <div className="mt-6"><SignInButton><button type="button" className="brand-button w-full">Sign in</button></SignInButton></div>
      </main>
    );
  }

  const planName = summary ? (PLAN_LABELS[summary.plan] ?? summary.plan) : null;
  const isPaid = summary && summary.plan !== "free" && (summary.subscriptionStatus === "active" || summary.subscriptionStatus === "non_renewing");
  const isCancelling = summary?.subscriptionStatus === "non_renewing";

  return (
    <main data-skipwait-screen="billing" className="page-content mx-auto max-w-2xl">
      <div className="mb-6"><span className="eyebrow">Plans &amp; credits</span><h1 className="mt-2 text-4xl font-semibold">Manage plan<span className="brand-dot">.</span></h1><p className="mt-2 max-w-xl text-[var(--muted-foreground)]">Your plan, payment history, and cancellation — in one place.</p></div>

      {loading ? <p className="mt-10 text-center text-sm text-[var(--muted-foreground)]">Loading billing…</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/10 p-4 text-sm">{error}</p> : null}

      {!loading && !error && summary ? (
        <>
          <section aria-label="Current plan" className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-7">
            <span className="eyebrow">Current plan</span>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-2xl font-semibold">{planName}{isPaid ? <span className="ml-2 align-middle text-sm font-semibold text-[var(--muted-foreground)]">{summary.monthlyAllowance} credits/month</span> : null}</h2>
              {isPaid ? <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-bold">{isCancelling ? "Cancelling" : "Active"}</span> : <span className="rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-bold">Free</span>}
            </div>
            {isPaid && summary.subscriptionCurrentTermEnd ? <p className="mt-2 text-sm text-[var(--muted-foreground)]">{isCancelling ? `Ends ${compactDate(summary.subscriptionCurrentTermEnd)} — access continues until then.` : `Renews ${compactDate(summary.subscriptionCurrentTermEnd)}.`}</p> : null}
            {!isPaid ? <p className="mt-2 text-sm text-[var(--muted-foreground)]">Free includes 3 referral requests every month. Plans raise the monthly allowance.</p> : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/plans" className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">{isPaid ? "Compare plans" : "Upgrade"} <ArrowRight /></Link>
              {isPaid && !isCancelling ? (
                confirmingCancel
                  ? <>
                    <button type="button" disabled={cancelling} onClick={() => { void cancelPlan(); }} className="brand-button">{cancelling ? "Cancelling…" : "Confirm cancellation"}</button>
                    <button type="button" onClick={() => setConfirmingCancel(false)} className="brand-button border-2 border-[var(--foreground)] bg-[var(--background)] text-[var(--foreground)]">Keep my plan</button>
                  </>
                  : <button type="button" onClick={() => setConfirmingCancel(true)} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-[var(--muted-foreground)]">Cancel plan</button>
              ) : null}
            </div>
          </section>

          <section aria-label="Payment methods" className="mt-4 rounded-3xl border border-[var(--border)] p-5">
            <h2 className="flex items-center gap-2 font-semibold"><CreditCard className="size-5" />How you pay</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Checkout runs on the payment provider&apos;s hosted page. Card and bank details stay with them — SkipWait never sees or stores them, so there are no saved methods to list here.</p>
          </section>

          <section aria-label="Receipts" className="mt-4">
            <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold"><ReceiptText className="size-5" />Receipts</h2>
            {receipts.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[var(--border)] p-8 text-center">
                <p className="font-medium">No payments yet.</p>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">Settled payments appear here with provider references.</p>
              </div>
            ) : (
              <ul className="grid gap-3">
                {receipts.map(receipt => (
                  <li key={receipt.id} className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div><p className="font-semibold">{money(receipt.amount, receipt.currency)} · {receipt.tokenCount} credit{receipt.tokenCount === 1 ? "" : "s"}</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">{compactDate(receipt.createdAt)} · {receipt.provider}{receipt.providerInvoiceId ? ` · ${receipt.providerInvoiceId}` : ""}</p></div>
                      {receipt.status === "refunded" ? <span className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-3 py-1 text-xs font-bold"><BadgeCheck className="size-3.5" />Refunded</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
