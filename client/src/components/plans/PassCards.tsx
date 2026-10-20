// Kit v4 pass cards on /plans (GO-LIVE-1 C3, D-046, D-084): Start, Momentum,
// Land Focus and Land Sprint for 30 or 90 days, Keep warm for a year, and Land
// Concierge by application. Every price, limit and availability comes from the
// catalog; a term it marks unavailable reads "Not on sale yet" with no button
// (passes stay off sale until GO-LIVE-1b). Human time the plan cannot deliver
// yet reads "coming later" (D-041). The client ignores autoExtend (GO-LIVE-2).
import { useState } from "react";
import { ArrowRight, Check, Crown } from "lucide-react";
import { Link } from "wouter";
import type { PlanCatalogResponse } from "@shared/billingCatalog";
import { Button } from "@/components/kit/button";
import { money } from "./format";
import { carryoverFeature, openRequestsLabel } from "./planCatalog";
import { purchaseKey, type KitPurchase } from "./kitCheckoutApi";
import { CheckoutFailureLine, type BuyControls } from "./PackCards";

type CatalogPlan = PlanCatalogResponse["plans"][number];
type CatalogTerm = CatalogPlan["terms"][number];
type PassLength = "30d" | "90d";

const PASS_ORDER = ["start", "momentum", "land_focus", "land_sprint", "keep_warm", "land_concierge"] as const;
const LENGTHS: readonly { value: PassLength; label: string }[] = [{ value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }];
const TERM_PHRASE: Record<CatalogTerm["interval"], string> = { "30d": "for 30 days", "90d": "for 90 days", yearly: "a year" };
const TERM_NAME: Record<CatalogTerm["interval"], string> = { "30d": "30 days", "90d": "90 days", yearly: "a year" };

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** The plan's included human time, or null when it has none; "coming later" until it can be delivered. */
function humanTimeLine(plan: CatalogPlan): string | null {
  const { writtenReviews, liveSessions, hours } = plan.humanTime;
  const parts = [
    ...(writtenReviews > 0 ? [plural(writtenReviews, "written review")] : []),
    ...(liveSessions > 0 ? [plural(liveSessions, "live session")] : []),
    ...(hours > 0 ? [`${plural(hours, "hour")} of human help`] : []),
  ];
  if (parts.length === 0) return null;
  return `${parts.join(" and ")} each month${plan.humanTimeOffered ? "" : ": coming later"}`;
}

/** Keep warm sells a year; every pass shows the chosen length. */
function termFor(plan: CatalogPlan, length: PassLength): CatalogTerm | undefined {
  return plan.terms.find(term => term.interval === (plan.id === "keep_warm" ? "yearly" : length));
}

function PassAction({ plan, term, buy }: { plan: CatalogPlan; term: CatalogTerm | undefined; buy: BuyControls }) {
  if (plan.byApplication) return <Button asChild variant="outline" className="brand-button w-full"><Link href="/contact?topic=concierge">Apply<ArrowRight /></Link></Button>;
  if (!term?.available) return <span className="pack-note self-start">Not on sale yet</span>;
  const purchase: KitPurchase = { kind: "plan", planId: plan.id, interval: term.interval };
  return <Button className="brand-button w-full" disabled={buy.disabled} aria-label={`Buy ${plan.displayName}, ${TERM_NAME[term.interval]}`} onClick={() => buy.onBuy(purchase)}>{buy.sending === purchaseKey(purchase) ? "Opening…" : "Buy"}</Button>;
}

function PassCard({ plan, term, catalog, buy }: { plan: CatalogPlan; term: CatalogTerm | undefined; catalog: PlanCatalogResponse; buy: BuyControls }) {
  const human = humanTimeLine(plan);
  const features = [
    `${openRequestsLabel(plan.openRequests)} referral requests open at once`,
    `${plan.creditsPerMonth} credits every month`,
    carryoverFeature(plan.carryover),
    ...(human ? [human] : []),
    "Same referrer queue as every plan",
  ];
  return <article aria-label={plan.displayName} className={`plan-card ${plan.recommended ? "featured" : ""}`}>
    {plan.recommended ? <span className="plan-flag"><Crown />Recommended</span> : null}
    <h3>{plan.displayName}</h3>
    {term ? <div className="plan-price"><strong>{money(term.amount, catalog.currency)}</strong><span>{TERM_PHRASE[term.interval]}</span>{catalog.priceNote ? <span> · {catalog.priceNote}</span> : null}</div> : null}
    <ul>{features.map(feature => <li key={feature}><Check />{feature}</li>)}</ul>
    <PassAction plan={plan} term={term} buy={buy} />
  </article>;
}

export function PassCards({ catalog, buy }: { catalog: PlanCatalogResponse; buy: BuyControls }) {
  const [length, setLength] = useState<PassLength>("30d");
  const plans = PASS_ORDER.flatMap(id => catalog.plans.filter(plan => plan.id === id));
  return <section className="plans-section" aria-labelledby="passes-heading">
    <span className="eyebrow">PASSES · 30 OR 90 DAYS</span>
    <h2 id="passes-heading">Passes</h2>
    <div className="billing-toggle" role="radiogroup" aria-label="Pass length">
      {LENGTHS.map(option => <button key={option.value} type="button" role="radio" aria-checked={length === option.value} className={length === option.value ? "selected" : ""} onClick={() => setLength(option.value)}>{option.label}</button>)}
    </div>
    <div className="plan-grid">{plans.map(plan => <PassCard key={plan.id} plan={plan} term={termFor(plan, length)} catalog={catalog} buy={buy} />)}</div>
    {buy.failure?.kind === "plan" ? <CheckoutFailureLine failure={buy.failure} /> : null}
    <p className="plan-grid-note"><Link href="/refunds" className="font-semibold text-foreground underline underline-offset-4">Refund &amp; cancellation policy</Link></p>
  </section>;
}
