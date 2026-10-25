// Plans v2 ("Choose your referrers.") - FROZEN banded model (owner freeze
// Oct 25, phonemsg-01M5SNVZEY1P8K169J48T2HGTJ; replacement push
// phonemsg-01M5SNY88BXE470FEN4Z0K7KWF). Published READ-ONLY by default
// (client/src/lib/planFamilyFlag.ts): prices display, but no checkout exists
// here yet - billing switch-on waits for the payment readiness bars in
// shared/planFamily.ts (USD rail blocked, INR not transaction-verified).
import { useEffect, useRef, useState } from "react";
import {
  BAND_LEVELS,
  FOUNDING_TERMS,
  FREE_REFERRALS_PER_MONTH,
  LEVEL_DISPLAY_NAME,
  PLAN_FAMILY,
  TOPUP_PRICE,
  VOLUME_DISCOUNTS,
  includedReferralList,
  planFeeMinor,
  topUpMinor,
  type PlanFamilyId,
  type PlanPriceBook,
  type ReferralLevel,
} from "@shared/planFamily";
import { money } from "@/components/plans/format";

const CARD_COPY: Record<PlanFamilyId, { tagline: string; primary: boolean }> = {
  early_to_mid: {
    tagline: "Start your search with early and mid-career referrers.",
    primary: false,
  },
  mid_to_senior: {
    tagline: "Reach mid and senior professionals who can refer you.",
    primary: true,
  },
  senior_to_executive: {
    tagline: "Senior and executive referrers, by application.",
    primary: false,
  },
};

// Read-only state (billing not switched on): the same non-transactional label
// on every card, disabled, with the reason inline - never a purchase-looking CTA.
const CHECKOUT_OFF_LABEL = "Checkout not switched on yet";

function IncludedList({ planId, book }: { planId: PlanFamilyId; book: PlanPriceBook }) {
  void book;
  const items = includedReferralList(planId);
  return (
    <dl className="mt-4 space-y-1.5 border-t border-g-hairline pt-4 text-g-small">
      {items.map(item => (
        <div key={item.level} className="flex justify-between">
          <dt className="text-g-ink-2">{LEVEL_DISPLAY_NAME[item.level]} referrals</dt>
          <dd className="font-g-mono text-[13px]" data-testid={`included-${planId}-${item.level}`}>{item.count} / month</dd>
        </div>
      ))}
    </dl>
  );
}

function BandRow({ planId }: { planId: PlanFamilyId }) {
  const names = BAND_LEVELS[planId].map(level => LEVEL_DISPLAY_NAME[level]).join(" + ");
  return (
    <div className="mt-4 border-t border-g-hairline pt-4" data-testid={`band-${planId}`}>
      <p className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">Referrers you can reach</p>
      <p className="mt-1 text-g-small">{names}</p>
    </div>
  );
}

function PlanCard({ planId, book }: { planId: PlanFamilyId; book: PlanPriceBook }) {
  const entry = PLAN_FAMILY.find(p => p.id === planId)!;
  const copy = CARD_COPY[planId];
  const fee = planFeeMinor(planId, book);
  return (
    <section aria-label={entry.label} className="flex flex-col rounded-2xl border border-g-hairline bg-g-surface p-5 gdesk:p-6">
      <p className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">{entry.label}</p>
      <h2 className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.01em]">{copy.tagline}</h2>
      <p className="mt-1 text-g-small text-g-ink-2">
        Founding price {money(fee, book)} / month{entry.byApplication ? " - by application" : ""}
      </p>
      <IncludedList planId={planId} book={book} />
      <BandRow planId={planId} />
      <ul className="mt-4 space-y-1.5 border-t border-g-hairline pt-4">
        <li className="flex items-start gap-2 text-g-small text-g-ink-2"><span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-g-ink" />Founding member {entry.foundingCap} spots - price locked while your membership stays active</li>
        <li className="flex items-start gap-2 text-g-small text-g-ink-2"><span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-g-ink" />Extra referrals only inside your band - buying never unlocks another level</li>
        <li className="flex items-start gap-2 text-g-small text-g-ink-2"><span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-g-ink" />Cost shown before every referral - included first, then your free allowance, then bought</li>
      </ul>
      <div className="mt-auto pt-5">
        <p
          data-g-primary={copy.primary || undefined}
          aria-disabled="true"
          className="g-hit flex w-full items-center justify-center rounded-[10px] border border-g-hairline bg-g-surface px-5 text-g-small font-semibold text-g-ink-3"
        >
          {CHECKOUT_OFF_LABEL}
        </p>
        <p className="mt-2 text-g-badge text-g-ink-3">These are the frozen founding prices; billing starts soon.</p>
      </div>
    </section>
  );
}

function TopUpTable({ book }: { book: PlanPriceBook }) {
  const maxDiscount = VOLUME_DISCOUNTS[VOLUME_DISCOUNTS.length - 1];
  return (
    <section aria-label="Extra referrals" className="mt-12">
      <p className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">Extra referrals</p>
      <p className="mt-2 max-w-[640px] text-g-small text-g-ink-3">
        One price per level, the same in every plan. Buy only within your band. Volume saves up to {maxDiscount.savePct}% at {maxDiscount.minQuantity}+ referrals.
      </p>
      <div className="mt-4 grid gap-4 gdesk:grid-cols-4">
        {(Object.keys(TOPUP_PRICE) as ReferralLevel[]).map(level => (
          <div key={level} className="rounded-2xl border border-g-hairline bg-g-surface p-4">
            <p className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">{LEVEL_DISPLAY_NAME[level]}</p>
            <p className="mt-2 text-[18px] font-semibold" data-testid={`topup-${level}`}>{money(topUpMinor(level, book), book)}</p>
            <p className="mt-1 text-g-badge text-g-ink-3">per referral</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PlansV2({ book = "INR" }: { book?: PlanPriceBook; seekerLevel?: number | null; onPickLevel?: (level: number | null) => void }) {
  const cmpRef = useRef<HTMLDivElement>(null);
  const [cmpCanScrollRight, setCmpCanScrollRight] = useState(false);
  useEffect(() => {
    const el = cmpRef.current;
    if (!el) return;
    const update = () => setCmpCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    update();
    el.addEventListener("scroll", update, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
    }
    window.addEventListener("resize", update);
    return () => { el.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  void cmpCanScrollRight;
  return (
    <div className="mx-auto max-w-[1120px] px-5 py-8 gdesk:px-8 gdesk:py-12">
      <h1 className="text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] gdesk:text-[44px]">Choose your referrers.</h1>
      <p className="mt-3 max-w-[640px] text-g-body text-g-ink-2">
        Every account starts with {FREE_REFERRALS_PER_MONTH} free referrals every month at any level, with a verified card. Plans add monthly referrals inside a band of referrer levels.
      </p>
      <p className="mt-2 text-g-small text-g-ink-3">
        {book === "INR"
          ? "Founding-member prices for India - set by your profile location, confirmed against your card's billing country at checkout."
          : "Founding-member global prices - set by your profile location, confirmed against your card's billing country at checkout."}
      </p>
      <p className="mt-2 max-w-[640px] text-g-small text-g-ink-3">Plan names say which referrers you can reach, not how senior you are.</p>
      <p className="mt-1 max-w-[640px] text-g-small text-g-ink-3">Bands overlap at Mid and Senior on purpose. The free allowance spans every level, Executive included.</p>
      <div className="mt-8 grid gap-4 gdesk:grid-cols-3">
        <PlanCard planId="early_to_mid" book={book} />
        <PlanCard planId="mid_to_senior" book={book} />
        <PlanCard planId="senior_to_executive" book={book} />
      </div>
      <TopUpTable book={book} />
      <section aria-label="Founding-member terms" className="mt-12">
        <p className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">Founding-member terms</p>
        <ul className="mt-3 max-w-[640px] space-y-1.5">
          <li className="text-g-small text-g-ink-2">Limited memberships per plan, counted as issued - a cancelled membership does not reopen its spot.</li>
          <li className="text-g-small text-g-ink-2">Your founding price stays while your membership stays continuously active{FOUNDING_TERMS.basePriceLock === "continuously_active" ? "" : " for the stated hold"}.</li>
          <li className="text-g-small text-g-ink-2">If payment lapses, the lock ends; new members after the cap pay the regular price.</li>
        </ul>
      </section>
    </div>
  );
}
