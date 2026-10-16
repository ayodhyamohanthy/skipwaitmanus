// Kit v4 credits bar ("NO SUBSCRIPTION NEEDED") and usage panel ("YOUR USAGE THIS
// CYCLE"), filled only from the signed-in account's own credit summary: the
// ledger block (shared/creditLedger.ts) and the open-ask slots. A part the
// server did not send is left out, never filled with a guess.
import { ArrowRight, Check, Coins, Gauge } from "lucide-react";
import { Link } from "wouter";
import type { SubscriptionCurrency } from "@shared/subscriptionPlans";
import { Button } from "@/components/kit/button";
import { kitDate } from "./format";
import { CREDIT_PACKS_ON_SALE } from "@shared/planCatalog";
import { CREDIT_PRICE, hasActivePaidPlan, type CreditSummary } from "./planCatalog";

function creditCount(count: number): string {
  return `${count} credit${count === 1 ? "" : "s"}`;
}

/** Heading aside: the kit "credits · ADD CREDITS" pill with the real balance once signed in, the price of a credit before. */
export function CreditCta({ summary, currency, href }: { summary: CreditSummary | null; currency: SubscriptionCurrency; href: string }) {
  // Packs are off sale: show the real balance, no purchase link.
  if (!CREDIT_PACKS_ON_SALE) return summary ? <div className="heading-aside"><span className="credit-cta"><Coins /><b>{creditCount(summary.totalAvailable)}</b></span></div> : null;
  return <div className="heading-aside"><Link href={href} className="credit-cta"><Coins /><b>{summary ? creditCount(summary.totalAvailable) : `${CREDIT_PRICE[currency]} a credit`}</b><span>Add credits</span></Link></div>;
}

export function CreditsSection({ summary, currency, creditsHref }: { summary: CreditSummary | null; currency: SubscriptionCurrency; creditsHref: string }) {
  if (!CREDIT_PACKS_ON_SALE) return null;
  const costs = [["Free", "Every referral request"], [CREDIT_PRICE[currency], "Each credit you buy"], ["Never", "Bought credits expire"]] as const;
  return <section className="plans-section credits-section" id="credits">
    <span className="eyebrow">NO SUBSCRIPTION NEEDED</span>
    <div className="credits-bar-wrap">
      <div className="credits-bar">
        <div className="balance"><Coins /><div>{summary ? <><span className="eyebrow">YOUR BALANCE</span><strong>{summary.totalAvailable} <small>credit{summary.totalAvailable === 1 ? "" : "s"}</small></strong></> : <><span className="eyebrow">PAY AS YOU GO</span><strong>{CREDIT_PRICE[currency]} <small>a credit</small></strong></>}</div></div>
        <ul className="cost-strip" aria-label="Credit costs">{costs.map(([badge, label]) => <li key={label}><span className="cost-badge">{badge}</span>{label}</li>)}</ul>
        <Button asChild className="brand-button"><Link href={creditsHref}>Add credits<ArrowRight /></Link></Button>
      </div>
      <p className="credits-fine"><Check />Each referral request uses 1 credit, returned if you withdraw before pickup or it expires. Credits you buy <b>never expire</b> and never affect referral access or queue position.</p>
    </div>
  </section>;
}

type UsageStat = { label: string; value: string; hint: string; pct: number };

const percent = (part: number, whole: number) => (whole > 0 ? Math.min(100, Math.round((Math.max(0, part) / whole) * 100)) : 0);

/** The kit's three usage cards, each only when the summary carries its source. */
export function usageStats(summary: CreditSummary): UsageStat[] {
  const stats: UsageStat[] = [];
  const { slots, ledger } = summary;
  if (slots) stats.push({ label: "Open referral slots used", value: slots.cap === null ? `${slots.open} open` : `${slots.open} of ${slots.cap}`, hint: "A slot frees when a request is answered or passed.", pct: slots.cap === null ? 0 : percent(slots.open, slots.cap) });
  if (ledger) {
    // Used this cycle out of everything held this cycle (what is left plus what was spent).
    const held = ledger.cycle.used + ledger.balance;
    const paid = hasActivePaidPlan(summary) && ledger.creditsPerMonth > 0;
    stats.push({ label: "Credits used", value: held > 0 ? `${ledger.cycle.used} of ${held}` : "0", hint: paid ? `Your plan adds ${ledger.creditsPerMonth} each cycle. Purchased credits never expire.` : ledger.welcome.granted ? "Includes your free welcome credits. Purchased credits never expire." : "Purchased credits never expire.", pct: percent(ledger.cycle.used, held) });
    const expiring = ledger.planCreditsExpiringSoon;
    const on = expiring ? kitDate(expiring.expiresAt) : null;
    stats.push({ label: "Plan credits expiring", value: String(expiring?.credits ?? 0), hint: expiring && on ? `They roll off on ${on}; plan credits are spent before purchased ones.` : "Shown 7 days before included credits roll off.", pct: expiring ? percent(expiring.credits, ledger.planCreditsRemaining) : 0 });
  }
  return stats;
}

export function UsagePanel({ summary }: { summary: CreditSummary }) {
  const stats = usageStats(summary);
  if (stats.length === 0) return null;
  return <section className="plans-section usage-panel" aria-label="Your usage this cycle">
    <span className="eyebrow">YOUR USAGE THIS CYCLE</span>
    <div className="moment-grid">
      {stats.map(stat => <article key={stat.label} className="moment-card"><Gauge /><h3>{stat.value}</h3><p><b>{stat.label}.</b> {stat.hint}</p><div className="usage-meter" role="meter" aria-valuenow={stat.pct} aria-valuemin={0} aria-valuemax={100} aria-label={stat.label}><span style={{ width: `${stat.pct}%` }} /></div></article>)}
    </div>
  </section>;
}
