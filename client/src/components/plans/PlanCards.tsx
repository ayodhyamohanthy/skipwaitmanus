// Kit v4 plan grid (Start / Momentum featured / Land) on the live catalog, with
// a Monthly / 90-day billing toggle and a Land Focus/Sprint/Concierge level
// selector. Every price and allowance derives from shared/planCatalog.ts through
// ./kitPlans, so the grid can never drift from the Chargebee price book.
import React from "react";
import { ArrowRight, Check, Crown, Gift, LoaderCircle } from "lucide-react";
import { Link } from "wouter";
import type { PaidSubscriptionPlan, SubscriptionCurrency, SubscriptionInterval } from "@shared/subscriptionPlans";
import { Button } from "@/components/kit/button";
import { KEEP_WARM_CARD, KIT_PLAN_CARDS, LAND_LEVELS, kitPlanCard, kitPlanLabel, kitPlanPrice, type KitPlanCard } from "./kitPlans";

export type CancelRenewalState = { confirming: boolean; cancelling: boolean; onAsk: () => void; onConfirm: () => void; onKeep: () => void };
export type GiftState = { enabled: boolean; opening: boolean; isLoaded: boolean; onGift: (plan: PaidSubscriptionPlan) => void };

type PlanCardsProps = {
  currency: SubscriptionCurrency;
  interval: SubscriptionInterval;
  onIntervalChange: (interval: SubscriptionInterval) => void;
  /** The Land level shown on the Land card (Focus / Sprint / Concierge). */
  landPlan: PaidSubscriptionPlan;
  onLandPlanChange: (plan: PaidSubscriptionPlan) => void;
  activePlan: PaidSubscriptionPlan | null;
  renewing: boolean;
  isLoaded: boolean;
  onUpgrade: (plan: PaidSubscriptionPlan, interval: SubscriptionInterval) => void;
  cancelRenewal: CancelRenewalState;
  gift: GiftState;
};

const INTERVAL_LABEL: Record<SubscriptionInterval, string> = { monthly: "Monthly", quarterly: "90-day", yearly: "Yearly" };

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
  const price = kitPlanPrice(plan, currency, "monthly");
  return <Button variant="ghost" className="mt-2 w-full" disabled={!gift.isLoaded || gift.opening} onClick={() => gift.onGift(plan)}>
    {!gift.isLoaded ? "Preparing gift options…" : gift.opening ? <><LoaderCircle className="animate-spin" />Preparing gift checkout…</> : <><Gift />Gift {kitPlanLabel(plan)} · {price}</>}
  </Button>;
}

function PlanCard({ card, currency, interval, activePlan, renewing, isLoaded, onUpgrade, cancelRenewal, gift, children }: {
  card: KitPlanCard; currency: SubscriptionCurrency; interval: SubscriptionInterval; activePlan: PaidSubscriptionPlan | null; renewing: boolean; isLoaded: boolean; onUpgrade: PlanCardsProps["onUpgrade"]; cancelRenewal: CancelRenewalState; gift: GiftState; children?: React.ReactNode;
}) {
  const isActive = card.plan === activePlan;
  const price = kitPlanPrice(card.id, currency, interval);
  const [amount, cadence] = price.split("/");
  return <article className={`plan-card ${card.featured ? "featured" : ""}`}>
    {card.featured && <span className="plan-flag"><Crown />Most chosen</span>}
    {isActive && <span className="plan-flag alt"><Crown />Your plan</span>}
    <h2>{card.label}</h2><p className="plan-tag">{card.tagline}</p>
    <div className="plan-price"><strong>{amount}</strong><span>{cadence ? `per ${cadence}` : ""}</span></div>
    {children}
    <ul>{card.features.map(feature => <li key={feature}><Check />{feature}</li>)}</ul>
    {isActive
      ? <CurrentPlanAction renewing={renewing} cancelRenewal={cancelRenewal} />
      : activePlan
        ? <Button asChild variant="outline" className="brand-button w-full"><Link href="/billing">Manage plan<ArrowRight /></Link></Button>
        : card.applicationOnly
          ? <Button className="brand-button w-full" disabled title="Land Concierge is sold by application">Apply for {card.label}</Button>
          : <Button className="brand-button w-full" disabled={!isLoaded} onClick={() => onUpgrade(card.plan, interval)}>{isLoaded ? card.cta : "Checking sign-in…"}<ArrowRight /></Button>}
    {!card.applicationOnly && <GiftButton plan={card.plan} currency={currency} gift={gift} />}
  </article>;
}

export function PlanCards({ currency, interval, onIntervalChange, landPlan, onLandPlanChange, activePlan, renewing, isLoaded, onUpgrade, cancelRenewal, gift }: PlanCardsProps) {
  const landDetail = kitPlanCard(landPlan) ?? LAND_LEVELS[0];
  const landCard: KitPlanCard = { ...landDetail, label: "Land", tagline: "For a search that is your full-time job: the most tools and hands-on human time.", cta: `Upgrade to ${landDetail.label}` };
  return <section className="plans-section" aria-label="Individual plans">
    <div className="billing-toggle" role="radiogroup" aria-label="Billing period">
      {(["monthly", "quarterly"] as const).map(value => <button key={value} type="button" role="radio" aria-checked={interval === value} className={interval === value ? "selected" : ""} onClick={() => onIntervalChange(value)}>{INTERVAL_LABEL[value]}{value === "quarterly" ? <em>Save up to 22%</em> : null}</button>)}
    </div>
    <div className="plan-grid individual-plan-grid">
      {KIT_PLAN_CARDS.filter(card => card.id !== "land_100").map(card => <PlanCard key={card.id} card={card} currency={currency} interval={interval} activePlan={activePlan} renewing={renewing} isLoaded={isLoaded} onUpgrade={onUpgrade} cancelRenewal={cancelRenewal} gift={gift} />)}
      <PlanCard card={landCard} currency={currency} interval={interval} activePlan={activePlan} renewing={renewing} isLoaded={isLoaded} onUpgrade={onUpgrade} cancelRenewal={cancelRenewal} gift={gift}>
        <div className="billing-toggle" role="radiogroup" aria-label="Land level">
          {LAND_LEVELS.map(level => <button key={level.id} type="button" role="radio" aria-checked={landPlan === level.plan} className={landPlan === level.plan ? "selected" : ""} onClick={() => onLandPlanChange(level.plan)}>{level.label.replace(/^Land /, "")}</button>)}
        </div>
        <p className="plan-tag" data-testid="land-detail">{landDetail.label} · {landDetail.creditsPerMonth} credits/month · {landDetail.openRequests} open asks</p>
      </PlanCard>
    </div>
    <p className="plan-grid-note">Looking to keep your account warm for a year? <Link href="/plans?plan=keep_warm" className="font-semibold text-foreground underline underline-offset-4">{KEEP_WARM_CARD.label} — {kitPlanPrice("keep_warm", currency, "yearly")}</Link>. Referrals stay free on every plan, and queue position never changes.</p>
  </section>;
}
