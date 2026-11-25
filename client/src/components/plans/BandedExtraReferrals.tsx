// BANDED-ui: buy extra referrals at levels inside the member's band. The
// total and volume discount are bandedReferralQuote (the same function the
// server charges with), so the quote shown is the amount on the hosted page.
// Shown only while the server's offer is on sale.
import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { BAND_LEVELS, LEVEL_DISPLAY_NAME, REFERRAL_LEVELS, topUpMinor, type ReferralLevel } from "@shared/planFamily";
import { BANDED_MAX_REFERRALS_PER_CHECKOUT, bandedReferralQuote } from "@shared/subscriptionManagement";
import { EXTRAS_KEY, type BandedSales } from "./bandedSales";
import { inertButton, outlineButton, primaryButton } from "./BandedPlanAction";
import { money } from "./format";

const clampQuantity = (value: number) => (Number.isFinite(value) ? Math.min(BANDED_MAX_REFERRALS_PER_CHECKOUT, Math.max(0, Math.trunc(value))) : 0);
const stepButton = "g-hit flex size-11 shrink-0 items-center justify-center rounded-[10px] border border-g-control-edge bg-g-surface text-g-ink hover:bg-g-surface-hover";
const eyebrow = "font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3";

function QuantityRow({ level, book, quantity, onChange }: { level: ReferralLevel; book: BandedSales["book"]; quantity: number; onChange: (next: number) => void }) {
  const name = LEVEL_DISPLAY_NAME[level];
  const inputId = `extras-qty-${level}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-g-hairline py-3 first:border-t-0">
      <div className="min-w-0">
        <label htmlFor={inputId} className="text-g-small font-semibold text-g-ink">{name}</label>
        <p className="text-g-badge text-g-ink-3">{money(topUpMinor(level, book), book)} per referral request</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`Remove one ${name} referral request`} className={stepButton} onClick={() => onChange(clampQuantity(quantity - 1))}>
          <Minus aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
        <input
          id={inputId}
          aria-label={`${name} referral requests`}
          type="number"
          inputMode="numeric"
          min={0}
          max={BANDED_MAX_REFERRALS_PER_CHECKOUT}
          value={quantity}
          onChange={event => onChange(clampQuantity(Number(event.target.value)))}
          className="h-11 w-20 rounded-[10px] border border-g-control-edge bg-g-surface px-2 text-center font-g-mono text-[13px] text-g-ink"
        />
        <button type="button" aria-label={`Add one ${name} referral request`} className={stepButton} onClick={() => onChange(clampQuantity(quantity + 1))}>
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

function QuoteLine({ label, testId, value }: { label: string; testId: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-g-small">
      <dt className="text-g-ink-2">{label}</dt>
      <dd data-testid={testId} className="font-g-mono text-[13px] text-g-ink">{value}</dd>
    </div>
  );
}

/** The on-sale extras block; renders nothing unless the offer is on sale. */
export function BandedExtraReferrals({ sales, primary }: { sales?: BandedSales; primary: boolean }) {
  const [quantities, setQuantities] = useState<Partial<Record<ReferralLevel, number>>>({});
  if (!sales || sales.offer.status !== "ready" || !sales.offer.offer.onSale) return null;
  const memberPlan = sales.offer.offer.memberPlan;
  const { book } = sales;

  if (memberPlan === null) {
    return (
      <section aria-label="Buy extra referrals" className="mt-6 rounded-2xl border border-g-hairline bg-g-surface p-5">
        <p className={eyebrow}>Buy extra referrals</p>
        <p className="mt-2 text-g-small text-g-ink-2">Extra referrals are for plan members. Choose a plan first.</p>
      </section>
    );
  }

  const levels = REFERRAL_LEVELS.filter(level => BAND_LEVELS[memberPlan].includes(level));
  const items = levels.map(level => ({ level, quantity: quantities[level] ?? 0 })).filter(item => item.quantity > 0);
  const quote = bandedReferralQuote(items, book);
  const opening = sales.buying === EXTRAS_KEY;
  const blocked = sales.buying !== null || quote.quantity === 0;
  const failure = sales.failure?.key === EXTRAS_KEY ? sales.failure.message : null;

  return (
    <section aria-label="Buy extra referrals" className="mt-6 rounded-2xl border border-g-hairline bg-g-surface p-5 gdesk:p-6">
      <p className={eyebrow}>Buy extra referrals</p>
      <p className="mt-2 max-w-[640px] text-g-small text-g-ink-2">Only at the levels in your plan’s band. Buying never unlocks another level.</p>
      <div className="mt-3">
        {levels.map(level => (
          <QuantityRow key={level} level={level} book={book} quantity={quantities[level] ?? 0} onChange={next => setQuantities(current => ({ ...current, [level]: next }))} />
        ))}
      </div>
      <dl className="mt-3 space-y-1.5 border-t border-g-hairline pt-3">
        <QuoteLine label="Referral requests" testId="extras-quantity" value={String(quote.quantity)} />
        <QuoteLine label="Subtotal" testId="extras-subtotal" value={money(quote.subtotal, book)} />
        {quote.discountPct > 0 ? <QuoteLine label="Volume discount" testId="extras-discount" value={`${quote.discountPct}% · −${money(quote.discount, book)}`} /> : null}
        <div className="flex justify-between gap-3 text-g-body font-semibold">
          <dt>Total</dt>
          <dd data-testid="extras-total" className="font-g-mono text-[13px]">{money(quote.total, book)}</dd>
        </div>
      </dl>
      <div className="mt-4 gdesk:max-w-[360px]">
        <button
          type="button"
          data-g-primary={primary && !blocked ? true : undefined}
          aria-disabled={blocked ? "true" : undefined}
          aria-busy={opening ? "true" : undefined}
          onClick={() => { if (!blocked) void sales.buyReferrals(items); }}
          className={blocked ? inertButton : primary ? primaryButton : outlineButton}
        >
          {opening ? "Opening secure checkout…" : quote.quantity === 0 ? "Buy extra referrals" : `Buy extra referrals · ${money(quote.total, book)}`}
        </button>
        <p className="mt-2 text-g-badge text-g-ink-3">The total shown is the amount charged on the secure checkout.</p>
        {failure ? <p role="alert" className="mt-2 text-g-small text-g-ink">{failure}</p> : null}
      </div>
    </section>
  );
}
