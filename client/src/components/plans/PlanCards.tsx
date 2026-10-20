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
};

// GO-LIVE-1b ruling 6: a catalog pass is a fixed non-renewing term - the card
// says when it ends and offers no renewal control.
function CurrentPlanAction({ endsAt }: { endsAt: string | null }) {
  const ends = endsAt ? kitDate(endsAt) : null;
  return <div className="grid gap-2">
    <p role="status" className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[18px] border-2 border-foreground px-5 text-sm font-semibold"><Check className="size-4 text-primary" />Your plan is active</p>
    <p className="text-center text-xs leading-5 text-muted-foreground">{ends ? `Ends ${ends} — your allowance stays until then.` : "Your current allowance remains available through this paid cycle."}</p>
  </div>;
}

export function PlanCards({ currency, activePlan, endsAt }: PlanCardsProps) {
  return <section className="plan-grid individual-plan-grid" aria-label="Individual plans">
    {planCards(currency, activePlan).map(card => {
      const isActive = activePlan !== null && card.id === activePlan.id;
      return <article key={card.id} className={`plan-card ${isActive || (activePlan === null && card.id === "free") ? "featured" : ""}`}>
        {isActive && <span className="plan-flag"><Crown />Your plan</span>}
        <h2>{card.name}</h2><p className="plan-tag">{card.tagline}</p>
        {card.price !== null ? <div className="plan-price"><strong>{card.price}</strong><span>{card.per}</span></div> : null}
        <ul>{card.features.map(feature => <li key={feature}><Check />{feature}</li>)}</ul>
        {isActive
          ? <CurrentPlanAction endsAt={endsAt} />
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
