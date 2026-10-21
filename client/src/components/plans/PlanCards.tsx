// /plans plan grid on the shared catalog: Free always, plus the account's own
// catalog plan while it is active. D-067 removed Pro/Max and the gift flow; the
// D-046 pass cards arrive here in their own slice, not before.
import { ArrowRight, Check, Crown } from "lucide-react";
import { Link } from "wouter";
import type { CatalogCurrency, PaidCatalogPlan } from "@shared/planCatalog";
import { Button } from "@/components/kit/button";
import { planCards, type PlanId } from "./planCatalog";
import { kitDate } from "./format";

export type CancelRenewalState = {
  confirming: boolean;
  cancelling: boolean;
  onAsk: () => void;
  onConfirm: () => void;
  onKeep: () => void;
};

type PlanCardsProps = {
  currency: CatalogCurrency;
  activePlan: PaidCatalogPlan | null;
  endsAt: string | null;
  renewing: boolean;
  cancelRenewal: CancelRenewalState;
};

// GO-LIVE-1b ruling 6, QA review (#359 finding 1): the cancel-renewal control
// only goes away once the subscription is confirmed fixed-term (non_renewing).
// While it still reads active - the billing_cycles=1 evidence is not proven yet -
// the card shows when it ends AND keeps the cancel control.
function CurrentPlanAction({ renewing, endsAt, cancelRenewal }: { renewing: boolean; endsAt: string | null; cancelRenewal: CancelRenewalState }) {
  const ends = endsAt ? kitDate(endsAt) : null;
  return <div className="grid gap-2">
    <p role="status" className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[18px] border-2 border-foreground px-5 text-sm font-semibold"><Check className="size-4 text-primary" />{renewing ? "Your plan is active" : "Renewal is off"}</p>
    {!renewing
      ? <p className="text-center text-xs leading-5 text-muted-foreground">Ends {ends ?? "at the end of this paid cycle"} — your allowance stays until then.</p>
      : <>
        {ends ? <p className="text-center text-xs leading-5 text-muted-foreground">Ends {ends} — your allowance stays until then.</p> : null}
        {cancelRenewal.confirming
          ? <div className="rounded-xl border border-border p-3 text-center"><p className="text-xs leading-5 text-muted-foreground">Cancel at the end of this paid cycle? Your allowance stays until then.</p><div className="mt-2 flex flex-wrap justify-center gap-2"><Button size="sm" disabled={cancelRenewal.cancelling} onClick={cancelRenewal.onConfirm}>{cancelRenewal.cancelling ? "Scheduling…" : "Yes, cancel renewal"}</Button><Button size="sm" variant="ghost" onClick={cancelRenewal.onKeep}>Keep plan</Button></div></div>
          : <Button variant="ghost" onClick={cancelRenewal.onAsk}>Cancel renewal</Button>}
      </>}
  </div>;
}

export function PlanCards({ currency, activePlan, endsAt, renewing, cancelRenewal }: PlanCardsProps) {
  return <section className="plan-grid individual-plan-grid" aria-label="Individual plans">
    {planCards(currency, activePlan).map(card => {
      const isActive = activePlan !== null && card.id === activePlan.id;
      return <article key={card.id} className={`plan-card ${isActive || (activePlan === null && card.id === "free") ? "featured" : ""}`}>
        {isActive && <span className="plan-flag"><Crown />Your plan</span>}
        <h2>{card.name}</h2><p className="plan-tag">{card.tagline}</p>
        {card.price !== null ? <div className="plan-price"><strong>{card.price}</strong><span>{card.per}</span></div> : null}
        <ul>{card.features.map(feature => <li key={feature}><Check />{feature}</li>)}</ul>
        {isActive
          ? <CurrentPlanAction renewing={renewing} endsAt={endsAt} cancelRenewal={cancelRenewal} />
          : <div>
            {card.id === "free"
              ? <Button asChild className="brand-button"><Link href="/ask">{card.cta}<ArrowRight /></Link></Button>
              : <Button asChild variant="outline" className="brand-button w-full"><Link href="/billing">Manage plan<ArrowRight /></Link></Button>}
          </div>}
      </article>;
    })}
  </section>;
}

export type { PlanId };
