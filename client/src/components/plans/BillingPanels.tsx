// Kit v4 /billing panels (app/src/routes/billing.tsx) on the live ledger:
// current plan from the credit summary, how payment works, and settled receipts.
// Only actions the server really offers are rendered (cancel at term end).
import { ArrowRight, CreditCard } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import type { CreditSummary, Receipt } from "./billingApi";
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

export function CurrentPlanPanel({ summary, onCancel }: { summary: CreditSummary; onCancel: () => void }) {
  if (!hasActivePaidPlan(summary)) {
    return <Panel>
      <span className="eyebrow">CURRENT PLAN</span>
      <h2 className="mt-1 text-2xl font-semibold">Free</h2>
      <p className="text-sm text-muted-foreground">{CREDIT_PACKS_ON_SALE ? (openAsks(summary) ? `${openAsks(summary)} · buy credits anytime` : "Buy credits anytime") : (openAsks(summary) || "Free plan")}</p>
      {CREDIT_PACKS_ON_SALE ? <Button asChild className="mt-4"><Link href="/premium?role=job_seeker">Add credits</Link></Button> : null}
    </Panel>;
  }
  // GO-LIVE-1b ruling 6, QA review (#359 finding 1): only a confirmed fixed-term
  // (non_renewing) subscription drops the cancel control; an active one keeps it.
  const cancelling = summary.subscriptionStatus === "non_renewing";
  const renewing = summary.subscriptionStatus === "active";
  const termEnd = summary.subscriptionCurrentTermEnd ? kitDate(summary.subscriptionCurrentTermEnd) : null;
  const credits = summary.ledger && summary.ledger.creditsPerMonth > 0 ? `${summary.ledger.creditsPerMonth} credits/month` : null;
  const parts = [openAsks(summary), credits].filter(Boolean).join(" · ");
  return <Panel>
    <div className="flex flex-wrap items-start justify-between gap-3"><div>
      <span className="eyebrow">CURRENT PLAN</span>
      <h2 className="mt-1 text-2xl font-semibold">{billingPlanLabel(summary.plan)}</h2>
      <p className="text-sm text-muted-foreground">{[
        termEnd ? `${renewing ? "Renews" : "Ends"} ${termEnd}` : (cancelling ? "Ends at the end of this paid cycle" : null),
        parts || null,
      ].filter(Boolean).join(" · ") || "Renews with your plan cycle"}{!renewing && (termEnd || cancelling) ? " — you keep everything until then." : ""}</p>
    </div></div>
    <div className="mt-5 grid gap-2 sm:grid-cols-3">
      <Button variant="outline" asChild><Link href="/plans">See plans<ArrowRight /></Link></Button>
      {renewing ? <Button variant="ghost" onClick={onCancel}>Cancel renewal</Button> : null}
    </div>
  </Panel>;
}

export function PaymentMethodPanel() {
  return <Panel className="mt-4">
    <h2 className="font-semibold">Payment method</h2>
    <div className="mt-3 flex items-start gap-3"><CreditCard className="mt-0.5 size-5 shrink-0" /><p className="flex-1 text-sm text-muted-foreground">Checkout runs on the payment provider&apos;s hosted page. Card and bank details stay with them — skipwait.me never sees or stores them, so there are no saved methods to list here.</p></div>
    <p className="mt-3 text-xs text-muted-foreground">Plans are charged in rupees in India and in US dollars elsewhere. The provider shows the payment methods available to you at checkout.</p>
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
