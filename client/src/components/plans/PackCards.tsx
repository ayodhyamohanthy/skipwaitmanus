// Kit v4 credit pack cards on /plans (GO-LIVE-1 C3): one card per pack the
// catalog lists in its currency, at the catalog's amount and with its
// "India price" note. A pack the catalog marks unavailable reads "Not on sale
// yet" with no button. "Recommended" only where the catalog says so (D-084 (4)).
// A link to /plans#credits (from /premium, or the sign-in return) lands on
// this section once the catalog has rendered it.
import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { Link } from "wouter";
import type { PlanCatalogResponse } from "@shared/billingCatalog";
import { Button } from "@/components/kit/button";
import { money } from "./format";
import { purchaseKey, type CheckoutFailure, type KitPurchase } from "./kitCheckoutApi";

/** Ruling 4.4: the refund page's own sentence for purchased credits (client/src/pages/RefundPolicy.tsx), quoted verbatim. */
export const PACK_REFUND_SENTENCE = "Unused purchased credits can be refunded on request within 14 days of purchase, less any credits already consumed by accepted referrals.";

export type BuyControls = {
  /** The purchase key sending right now, if any. */
  sending: string | null;
  /** Every Buy is disabled while sign-in is loading or a purchase is sending. */
  disabled: boolean;
  failure: CheckoutFailure | null;
  onBuy: (purchase: KitPurchase) => void;
};

export function CheckoutFailureLine({ failure }: { failure: CheckoutFailure | null }) {
  return failure ? <p role="alert" className="plan-grid-note font-semibold text-destructive">{failure.message}</p> : null;
}

export function PackCards({ catalog, buy }: { catalog: PlanCatalogResponse; buy: BuyControls }) {
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = section.current;
    if (window.location.hash === "#credits" && node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "start" });
  }, []);
  return <section ref={section} className="plans-section" id="credits" aria-labelledby="credit-packs-heading">
    <span className="eyebrow">CREDIT PACKS · PAID ONCE</span>
    <h2 id="credit-packs-heading">Credit packs</h2>
    <div className="pack-grid">
      {catalog.packs.map(pack => {
        const purchase: KitPurchase = { kind: "pack", packId: pack.id };
        return <article key={pack.id} aria-label={`${pack.credits} credits`} className={`pack-card ${pack.recommended ? "featured" : ""}`}>
          {pack.recommended ? <span className="pack-note">Recommended</span> : null}
          <strong>{pack.credits}<small> credits</small></strong>
          <span className="pack-price">{money(pack.amount, catalog.currency)}{catalog.priceNote ? <> <em>{catalog.priceNote}</em></> : null}</span>
          {pack.available
            ? <Button className="brand-button" disabled={buy.disabled} aria-label={`Buy ${pack.credits} credits`} onClick={() => buy.onBuy(purchase)}>{buy.sending === purchaseKey(purchase) ? "Opening…" : "Buy"}</Button>
            : <span className="pack-note">Not on sale yet</span>}
        </article>;
      })}
    </div>
    {buy.failure?.kind === "pack" ? <CheckoutFailureLine failure={buy.failure} /> : null}
    <p className="credits-fine"><Check /><span>{PACK_REFUND_SENTENCE} <Link href="/refunds" className="font-semibold text-foreground underline underline-offset-4">Refund policy</Link></span></p>
  </section>;
}
