// Kit v4 plan grid (plan-grid individual-plan-grid) on the live Free / Pro / Max catalog.
// The kit's Monthly/Yearly segment is not rendered: live plans bill monthly only.
import { ArrowRight, Check, Crown, Gift, LoaderCircle } from "lucide-react";
import { Link } from "wouter";
import type { PaidSubscriptionPlan, SubscriptionCurrency } from "@shared/subscriptionPlans";
import { Button } from "@/components/kit/button";
import { planAmount, planCards, planLabel, planPriceDisplay, type PlanId } from "./planCatalog";

export type CancelRenewalState = {
  confirming: boolean;
  cancelling: boolean;
  onAsk: () => void;
  onConfirm: () => void;
  onKeep: () => void;
};

export type GiftState = { enabled: boolean; opening: boolean; isLoaded: boolean; onGift: (plan: PaidSubscriptionPlan) => void };

type PlanCardsProps = {
  currency: SubscriptionCurrency;
  featured: PlanId;
  activePlan: PaidSubscriptionPlan | null;
  renewing: boolean;
  isLoaded: boolean;
  onUpgrade: (plan: PaidSubscriptionPlan) => void;
  cancelRenewal: CancelRenewalState;
  gift: GiftState;
};

function CurrentPlanAction({ renewing, cancelRenewal }: { renewing: boolean; cancelRenewal: CancelRenewalState }) {
  return <div className="grid gap-2">
    <p role="status" className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[18px] border-2 border-foreground px-5 text-sm font-semibold"><Check className="size-4 text-primary" />{renewing ? "Your current plan is active" : "Renewal is off"}</p>
    {!renewing ? <p className="text-center text-xs leading-5 text-muted-foreground">Your current allowance remains available through this paid cycle.</p> : cancelRenewal.confirming
      ? <div className="rounded-xl border border-border p-3 text-center"><p className="text-xs leading-5 text-muted-foreground">Cancel at the end of this paid cycle? Your allowance stays until then.</p><div className="mt-2 flex flex-wrap justify-center gap-2"><Button size="sm" disabled={cancelRenewal.cancelling} onClick={cancelRenewal.onConfirm}>{cancelRenewal.cancelling ? "Scheduling…" : "Yes, cancel renewal"}</Button><Button size="sm" variant="ghost" onClick={cancelRenewal.onKeep}>Keep plan</Button></div></div>
      : <Button variant="ghost" onClick={cancelRenewal.onAsk}>Cancel renewal</Button>}
  </div>;
}

function GiftButton({ plan, currency, gift }: { plan: PaidSubscriptionPlan; currency: SubscriptionCurrency; gift: GiftState }) {
  if (!gift.enabled) return null;
  return <Button variant="ghost" className="mt-2 w-full" disabled={!gift.isLoaded || gift.opening} onClick={() => gift.onGift(plan)}>
    {!gift.isLoaded ? "Preparing gift options…" : gift.opening ? <><LoaderCircle className="animate-spin" />Preparing gift checkout…</> : <><Gift />Gift {planLabel(plan)} · {planPriceDisplay(plan, currency)}</>}
  </Button>;
}

export function PlanCards({ currency, featured, activePlan, renewing, isLoaded, onUpgrade, cancelRenewal, gift }: PlanCardsProps) {
  return <section className="plan-grid individual-plan-grid" aria-label="Individual plans">
    {planCards(currency).map(card => {
      const paid: PaidSubscriptionPlan | null = card.id === "free" ? null : card.id;
      return <article key={card.id} className={`plan-card ${card.id === featured ? "featured" : ""}`}>
        {paid !== null && paid === activePlan && <span className="plan-flag"><Crown />Your plan</span>}
        <h2>{card.name}</h2><p className="plan-tag">{card.tagline}</p>
        <div className="plan-price"><strong>{planAmount(card.id, currency)}</strong><span>per month</span></div>
        <ul>{card.features.map(feature => <li key={feature}><Check />{feature}</li>)}</ul>
        {paid === null
          ? <Button asChild className="brand-button"><Link href="/ask">{card.cta}<ArrowRight /></Link></Button>
          : <div>
            {paid === activePlan
              ? <CurrentPlanAction renewing={renewing} cancelRenewal={cancelRenewal} />
              : activePlan
                ? <Button asChild variant="outline" className="brand-button w-full"><Link href="/billing">Manage plan<ArrowRight /></Link></Button>
                : <Button className="brand-button w-full" disabled={!isLoaded} onClick={() => onUpgrade(paid)}>{isLoaded ? card.cta : "Checking sign-in…"}<ArrowRight /></Button>}
            <GiftButton plan={paid} currency={currency} gift={gift} />
          </div>}
      </article>;
    })}
  </section>;
}
