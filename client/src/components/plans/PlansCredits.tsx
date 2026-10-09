// Kit v4 credits bar ("NO SUBSCRIPTION NEEDED") and usage panel ("YOUR USAGE THIS
// CYCLE"), filled only from the signed-in account's own credit summary.
import { ArrowRight, Check, Coins, Gauge } from "lucide-react";
import { Link } from "wouter";
import { FREE_MONTHLY_ALLOWANCE, type SubscriptionCurrency } from "@shared/subscriptionPlans";
import { Button } from "@/components/kit/button";
import { kitDate, nextFreeReset } from "./format";
import { CREDIT_PRICE, hasActivePaidPlan, type CreditSummary } from "./planCatalog";

function creditCount(count: number): string {
  return `${count} credit${count === 1 ? "" : "s"}`;
}

/** Heading aside: the kit "3 free credits · ADD CREDITS" pill, with the real balance once signed in. */
export function CreditCta({ summary, href }: { summary: CreditSummary | null; href: string }) {
  return <div className="heading-aside"><Link href={href} className="credit-cta"><Coins /><b>{summary ? creditCount(summary.totalAvailable) : `${FREE_MONTHLY_ALLOWANCE} free credits`}</b><span>Add credits</span></Link></div>;
}

export function CreditsSection({ summary, currency, creditsHref }: { summary: CreditSummary | null; currency: SubscriptionCurrency; creditsHref: string }) {
  const costs = [["1 cr", "One private referral request"], [CREDIT_PRICE[currency], "Each extra credit"], [`${FREE_MONTHLY_ALLOWANCE} free`, "Requests every month"]] as const;
  return <section className="plans-section credits-section" id="credits">
    <span className="eyebrow">NO SUBSCRIPTION NEEDED</span>
    <div className="credits-bar-wrap">
      <div className="credits-bar">
        <div className="balance"><Coins /><div>{summary ? <><span className="eyebrow">YOUR BALANCE</span><strong>{summary.totalAvailable} <small>credit{summary.totalAvailable === 1 ? "" : "s"}</small></strong></> : <><span className="eyebrow">EVERY MONTH</span><strong>{FREE_MONTHLY_ALLOWANCE} <small>free credits</small></strong></>}</div></div>
        <ul className="cost-strip" aria-label="Credit costs">{costs.map(([badge, label]) => <li key={label}><span className="cost-badge">{badge}</span>{label}</li>)}</ul>
        <Button asChild className="brand-button"><Link href={creditsHref}>Add credits<ArrowRight /></Link></Button>
      </div>
      <p className="credits-fine"><Check />Every account gets <b>{FREE_MONTHLY_ALLOWANCE} free referral requests</b> every month. Credits you buy never expire and never change your queue position.</p>
    </div>
  </section>;
}

type UsageStat = { label: string; value: string; hint: string; pct: number | null };

function usageStats(summary: CreditSummary, now: Date): UsageStat[] {
  const allowance = Math.max(0, summary.monthlyAllowance);
  const used = Math.min(allowance, Math.max(0, allowance - summary.monthlyCreditsRemaining));
  const purchased = Math.max(0, summary.purchasedCreditsRemaining ?? summary.totalAvailable - summary.monthlyCreditsRemaining);
  const paid = hasActivePaidPlan(summary);
  const ending = summary.subscriptionStatus === "non_renewing";
  const stats: UsageStat[] = [
    { label: "Monthly requests used", value: `${used} of ${allowance}`, hint: paid ? "They reset with your plan cycle." : "Free requests reset on the 1st of each month.", pct: allowance > 0 ? Math.round((used / allowance) * 100) : 0 },
    { label: "Credits you bought", value: String(purchased), hint: "Purchased credits never expire.", pct: null },
  ];
  const resetDate = paid ? summary.subscriptionCurrentTermEnd : nextFreeReset(now).toISOString();
  const reset = resetDate ? kitDate(resetDate) : null;
  if (reset) stats.push({ label: paid ? (ending ? "Plan ends" : "Plan renews") : "Next reset", value: reset, hint: paid ? (ending ? "Your account returns to Free then." : "Your monthly requests reset then.") : "Unused free requests do not carry over.", pct: null });
  return stats;
}

export function UsagePanel({ summary, now = new Date() }: { summary: CreditSummary; now?: Date }) {
  return <section className="plans-section usage-panel" aria-label="Your usage this cycle">
    <span className="eyebrow">YOUR USAGE THIS CYCLE</span>
    <div className="moment-grid">
      {usageStats(summary, now).map(stat => <article key={stat.label} className="moment-card"><Gauge /><h3>{stat.value}</h3><p><b>{stat.label}.</b> {stat.hint}</p>{stat.pct !== null && <div className="usage-meter" role="meter" aria-valuenow={stat.pct} aria-valuemin={0} aria-valuemax={100} aria-label={stat.label}><span style={{ width: `${stat.pct}%` }} /></div>}</article>)}
    </div>
  </section>;
}
