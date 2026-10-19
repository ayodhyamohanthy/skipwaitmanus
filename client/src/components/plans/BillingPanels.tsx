// Kit v4 /billing panels (app/src/routes/billing.tsx) on the live ledger:
// current plan from the credit summary, the saved payment methods, and settled
// receipts. Only actions the server really offers are rendered (cancel at term
// end, manage methods on the provider's hosted page).
import { ArrowRight, CreditCard, Plus, ShieldCheck, X } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import type { CreditSummary, PaymentMethods, Receipt } from "./billingApi";
import { kitDate, money } from "./format";
import { billingPlanLabel } from "@shared/billingCatalog";
import { CREDIT_PACKS_ON_SALE } from "@shared/planCatalog";
import { hasActivePaidPlan } from "./planCatalog";

/** "8 open asks" from the caller's own slots; left out when the server did not send them. */
function openAsks(summary: CreditSummary): string | null {
  const cap = summary.slots?.cap;
  if (cap === undefined) return null;
  return cap === null ? "Unlimited open asks" : `${cap} open ask${cap === 1 ? "" : "s"}`;
}

/** True when this Free wallet is owed credits it cannot receive until a card is saved. */
function freeCreditsGated(summary: CreditSummary): boolean {
  return !hasActivePaidPlan(summary) && !summary.paymentMethodOnFile;
}

export function CurrentPlanPanel({ summary, onCancel }: { summary: CreditSummary; onCancel: () => void }) {
  if (!hasActivePaidPlan(summary)) {
    return <Panel>
      <span className="eyebrow">CURRENT PLAN</span>
      <h2 className="mt-1 text-2xl font-semibold">Free</h2>
      <p className="text-sm text-muted-foreground">{CREDIT_PACKS_ON_SALE ? (openAsks(summary) ? `${openAsks(summary)} · buy credits anytime` : "Buy credits anytime") : (openAsks(summary) || "Free plan")}</p>
      {/* The monthly grant is 0 while no card is on file, so say why instead of
          letting a 0-credit wallet read as a broken account. */}
      {freeCreditsGated(summary) ? <p className="mt-2 text-sm text-muted-foreground">No payment method on file, so this month&apos;s free credits are paused. Add one below to unlock them.</p> : null}
      {CREDIT_PACKS_ON_SALE ? <Button asChild className="mt-4"><Link href="/premium?role=job_seeker">Add credits</Link></Button> : null}
    </Panel>;
  }
  const cancelling = summary.subscriptionStatus === "non_renewing";
  const termEnd = summary.subscriptionCurrentTermEnd ? kitDate(summary.subscriptionCurrentTermEnd) : null;
  // Kit: "Renews 6 Nov 2026 · 8 open asks · 30 credits/month", every part from the server.
  const credits = summary.ledger && summary.ledger.creditsPerMonth > 0 ? `${summary.ledger.creditsPerMonth} credits/month` : null;
  const renewing = [termEnd ? `Renews ${termEnd}` : null, openAsks(summary), credits].filter(Boolean).join(" · ");
  return <Panel>
    <div className="flex flex-wrap items-start justify-between gap-3"><div>
      <span className="eyebrow">CURRENT PLAN</span>
      <h2 className="mt-1 text-2xl font-semibold">{billingPlanLabel(summary.plan)}</h2>
      <p className="text-sm text-muted-foreground">{cancelling
        ? `${termEnd ? `Ends ${termEnd}` : "Ends at the end of this paid cycle"} — you keep everything until then.`
        : renewing || "Renews with your plan cycle"}</p>
    </div></div>
    {!cancelling && <div className="mt-5 grid gap-2 sm:grid-cols-3"><Button variant="outline" asChild><Link href="/plans">See plans<ArrowRight /></Link></Button><Button variant="ghost" className="sm:col-start-3" onClick={onCancel}>Cancel plan</Button></div>}
  </Panel>;
}

/**
 * The prompt the billing screen opens with: no saved card means no free monthly
 * credits. Dismissible, because the panel below it still says the same thing and
 * stays reachable; nothing is lost by closing it.
 */
export function PaymentMethodNudge({ onAdd, onDismiss, adding }: { onAdd: () => void; onDismiss: () => void; adding: boolean }) {
  return <section data-skipwait-panel="payment-method-nudge" className="mt-4 rounded-3xl border border-primary/30 bg-primary/5 p-5 sm:p-6">
    <div className="flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><CreditCard className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Add a payment method to become eligible for free monthly credits.</p>
        <p className="mt-1 text-xs text-muted-foreground">Nothing is charged until you buy credits. Your free credits unlock as soon as the card is saved.</p>
        <Button size="sm" className="mt-3" onClick={onAdd} disabled={adding} aria-label="Add a payment method to unlock free monthly credits">{adding ? "Opening secure page…" : "Add a payment method"}<Plus /></Button>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss the payment method prompt" className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
    </div>
  </section>;
}

type PaymentMethodPanelProps = {
  methods: PaymentMethods | null;
  loading: boolean;
  error: string;
  adding: boolean;
  onManage: () => void;
};

/**
 * Saved methods, read as labels from the provider. `methods === null` means we
 * could not ask (or have not asked yet): the panel then says so and offers the
 * same hosted page, rather than claiming there is no card on file.
 */
export function PaymentMethodPanel({ methods, loading, error, adding, onManage }: PaymentMethodPanelProps) {
  const saved = methods?.methods ?? [];
  return <Panel className="mt-4">
    <h2 className="font-semibold">Payment methods</h2>
    {loading ? <p role="status" className="mt-2 min-h-12 content-center text-sm text-muted-foreground">Loading your payment methods…</p> : null}
    {!loading && error ? <p role="alert" className="mt-2 text-sm text-muted-foreground">{error} You can still open the secure card page below.</p> : null}
    {!loading && !error && methods && saved.length === 0 ? <div className="mt-3 flex items-start gap-3"><CreditCard className="mt-0.5 size-5 shrink-0" /><p className="flex-1 text-sm text-muted-foreground">No payment method on file. Free monthly credits stay paused until one is saved.</p></div> : null}
    {!loading && saved.length > 0 ? <ul className="mt-3 divide-y divide-border">{saved.map(method => <li key={method.id} className="flex min-h-12 items-center gap-3 text-sm">
      <CreditCard className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-medium">{method.label}{method.detail ? <span className="font-normal text-muted-foreground"> · {method.detail}</span> : null}</span>
      {method.isDefault ? <span className="status-pill">Default</span> : null}
    </li>)}</ul> : null}
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button variant={saved.length > 0 ? "outline" : "default"} onClick={onManage} disabled={adding}>{adding ? "Opening secure page…" : saved.length > 0 ? "Manage payment methods" : "Add a payment method"}</Button>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" />Cards are saved by the payment provider, never by SkipWait.</p>
    </div>
  </Panel>;
}

const PROVIDER_NAMES: Record<string, string> = { chargebee: "Chargebee", razorpay: "Razorpay", paypal: "PayPal" };

function receiptLabel(receipt: Receipt): string {
  return `${receipt.tokenCount} credit${receipt.tokenCount === 1 ? "" : "s"}`;
}

export function ReceiptsPanel({ receipts }: { receipts: Receipt[] }) {
  return <Panel className="mt-4">
    <h2 className="font-semibold">Receipts</h2>
    {receipts.length === 0
      ? <p className="mt-2 min-h-12 content-center text-sm font-medium">No payments yet.</p>
      : <ul className="mt-2 divide-y divide-border">{receipts.map(receipt => <li key={receipt.id} className="flex min-h-12 items-center gap-3 text-sm">
        <span className="w-24 shrink-0 text-muted-foreground">{kitDate(receipt.createdAt) ?? "Recorded"}</span>
        <span className="min-w-0 flex-1 truncate">{receiptLabel(receipt)}<span className="hidden text-muted-foreground sm:inline"> · {PROVIDER_NAMES[receipt.provider] ?? receipt.provider}{receipt.providerInvoiceId ? ` · ${receipt.providerInvoiceId}` : ""}</span></span>
        {receipt.status === "refunded" ? <span className="status-pill">Refunded</span> : null}
        <span>{money(receipt.amount, receipt.currency)}</span>
      </li>)}</ul>}
    <p className="mt-2 text-xs text-muted-foreground">Settled payments appear here with provider references.</p>
  </Panel>;
}
