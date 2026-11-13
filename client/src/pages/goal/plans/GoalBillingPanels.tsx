// Goal /billing sections (D-048-p3-plans, D-048-money.md §4). Presentation only:
// every number arrives from the server's credit summary or receipts payload and
// every money rule stays in shared/ and server code. Wording is referral-only
// (D-173, D-180): no string here says "credit", "credits" or the noun "ask".
import { GoalNum, GoalStatus } from "@/components/goal";
import type { CreditSummary, Receipt } from "@/components/plans/billingApi";
import { kitDate, money } from "@/components/plans/format";

const PROVIDER_NAMES: Record<string, string> = { chargebee: "Chargebee", razorpay: "Razorpay", paypal: "PayPal" };

/** One settled payment: what was added, who took it and what came back. */
function receiptLabel(receipt: Receipt): string {
  return `${receipt.tokenCount} referral request${receipt.tokenCount === 1 ? "" : "s"}`;
}

export function BalanceSection({ summary }: { summary: CreditSummary }) {
  const ledger = summary.ledger;
  const rows: Array<{ label: string; value: number }> = [];
  if (ledger) {
    rows.push({ label: "From your plan", value: ledger.planCreditsRemaining });
    if (ledger.buckets.purchased > 0) rows.push({ label: "Added", value: ledger.buckets.purchased });
    rows.push({ label: "Used this cycle", value: ledger.cycle.used });
  }
  return (
    <section data-testid="goal-billing-balance" className="mt-6 border border-g-hairline p-4 gdesk:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-g-heading text-g-ink">Referral requests left</h2>
        <GoalNum className="text-g-heading text-g-ink">{summary.totalAvailable}</GoalNum>
      </div>
      {rows.length > 0 ? (
        <dl className="mt-3 grid gap-1.5">
          {rows.map(row => (
            <div key={row.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-g-meta text-g-ink-2">{row.label}</dt>
              <dd className="text-g-meta text-g-ink"><GoalNum>{row.value}</GoalNum></dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

export function PlanSection({ summary, onCancelRenewal }: { summary: CreditSummary; onCancelRenewal: (() => void) | null }) {
  const ledger = summary.ledger;
  const slots = summary.slots;
  return (
    <section data-testid="goal-billing-plan" className="mt-6 border border-g-hairline p-4 gdesk:p-5">
      <h2 className="text-g-heading text-g-ink">Your plan</h2>
      <div className="mt-3 grid gap-1.5">
        {slots ? (
          <p className="text-g-meta text-g-ink-2">
            <GoalNum>{slots.open}</GoalNum> of <GoalNum>{slots.cap}</GoalNum> open at once
          </p>
        ) : null}
        {ledger && ledger.creditsPerMonth > 0 ? (
          <p className="text-g-meta text-g-ink-2">
            <GoalNum>{ledger.creditsPerMonth}</GoalNum> referral requests each month
          </p>
        ) : null}
        {summary.subscriptionStatus === "non_renewing" ? (
          <p className="text-g-meta text-g-ink-2">Nothing else is charged. You keep everything until the term ends.</p>
        ) : null}
      </div>
      {onCancelRenewal ? (
        <div className="mt-4">
          <button type="button" onClick={onCancelRenewal} className="text-g-meta text-g-ink-2 underline underline-offset-[3px] hover:text-g-ink">Cancel renewal</button>
        </div>
      ) : null}
    </section>
  );
}

export function PaymentMethodSection() {
  return (
    <section data-testid="goal-billing-payment-method" className="mt-6 border border-g-hairline p-4 gdesk:p-5">
      <h2 className="text-g-heading text-g-ink">Payment method</h2>
      <p className="mt-3 text-g-meta text-g-ink-2">
        Checkout runs on the payment provider&apos;s hosted page. Card and bank details stay with them — skipwait.me never sees or stores them, so there are no saved methods to list here.
      </p>
      <p className="mt-2 text-g-meta text-g-ink-3">Plans are charged in rupees in India and in US dollars elsewhere. The provider shows the payment methods available to you at checkout.</p>
    </section>
  );
}

export function ReceiptsSection({ receipts }: { receipts: Receipt[] }) {
  return (
    <section data-testid="goal-billing-receipts" className="mt-6 border border-g-hairline p-4 gdesk:p-5">
      <h2 className="text-g-heading text-g-ink">Receipts</h2>
      {receipts.length === 0 ? (
        <>
          <p className="mt-3 min-h-12 content-center text-g-label text-g-ink">No payments yet.</p>
          <p className="mt-1 text-g-meta text-g-ink-2">Settled payments appear here with provider references.</p>
        </>
      ) : (
        <ul className="mt-2">
          {receipts.map(receipt => (
            <li key={receipt.id} className="flex min-h-12 items-center gap-3 border-b border-g-hairline py-3 last:border-b-0">
              <span className="w-24 shrink-0 text-g-meta text-g-ink-3">{kitDate(receipt.createdAt) ?? "Recorded"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-g-label text-g-ink">{receiptLabel(receipt)}</span>
                <span className="block truncate text-g-meta text-g-ink-3">
                  {PROVIDER_NAMES[receipt.provider] ?? receipt.provider}
                  {receipt.providerInvoiceId ? <> · <span>{receipt.providerInvoiceId}</span></> : null}
                </span>
              </span>
              {receipt.status === "refunded" ? <GoalStatus status="withdrawn" label="Refunded" /> : null}
              <span className="text-g-label text-g-ink"><GoalNum>{money(receipt.amount, receipt.currency)}</GoalNum></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
