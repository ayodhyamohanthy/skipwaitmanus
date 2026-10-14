// Kit v4 "Upgrade moments" (UPGRADE_NUDGES.md), shown only for a limit this
// account has really hit: every open slot in use, a credit balance spent down
// to 0, or plan credits rolling off within 7 days. Each card is derived from
// the signed-in account's own credit summary; nothing renders when no limit applies.
import { useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "wouter";
import { SUBSCRIPTION_PLANS, type PaidSubscriptionPlan } from "@shared/subscriptionPlans";
import { kitDate } from "./format";
import { hasActivePaidPlan, nextPlanUp, openRequestsLabel, planLimits, type CreditSummary } from "./planCatalog";

type Action = { label: string; href: string } | { label: string; onClick: () => void };
export type Moment = { id: string; trigger: string; title: string; copy: string; cta: Action; alt: Action | "dismiss" };

const DAY_MS = 86_400_000;
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export function upgradeMoments(summary: CreditSummary, now: Date, creditsHref: string, onSeePlan: (plan: PaidSubscriptionPlan) => void): Moment[] {
  const moments: Moment[] = [];
  const next = nextPlanUp(summary.plan);
  // Live checkout cannot switch an active subscription, so only Free accounts are pointed at a plan.
  const nextPlan = next && !hasActivePaidPlan(summary) ? { id: next, label: SUBSCRIPTION_PLANS[next].label, ...planLimits(next) } : null;
  const { slots, ledger } = summary;
  if (slots?.full && slots.cap !== null) {
    moments.push({
      id: "slots",
      trigger: "All open slots in use",
      title: `Your ${slots.cap} requests are all open`,
      copy: `Wait for an answer to free a slot${nextPlan ? `, or move to ${nextPlan.label} for ${openRequestsLabel(nextPlan.openRequests)} open requests` : ""}. Queue position stays equal either way.`,
      cta: nextPlan ? { label: `See ${nextPlan.label}`, onClick: () => onSeePlan(nextPlan.id) } : { label: "View my requests", href: "/requests" },
      alt: "dismiss",
    });
  }
  // "Reaches 0": the account spent credits this cycle and has none left (never having had any is not a limit hit).
  if (ledger && ledger.balance <= 0 && ledger.cycle.used > 0) {
    moments.push({
      id: "credits",
      trigger: "Credit balance reaches 0",
      title: "You're out of credits",
      copy: nextPlan ? `Add a pack once, or get ${nextPlan.creditsPerMonth} credits every month with ${nextPlan.label}.` : "Add a pack once. Credits you buy never expire.",
      cta: { label: "Add credits", href: creditsHref },
      alt: { label: "Compare plans", href: "#compare" },
    });
  }
  const expiring = ledger?.planCreditsExpiringSoon;
  const daysLeft = expiring ? Math.max(1, Math.ceil((Date.parse(expiring.expiresAt) - now.getTime()) / DAY_MS)) : Number.NaN;
  if (expiring && Number.isFinite(daysLeft)) {
    moments.push({
      id: "expiring",
      trigger: "Plan credits about to roll off",
      title: `${plural(expiring.credits, "credit")} expire${expiring.credits === 1 ? "s" : ""} in ${plural(daysLeft, "day")}`,
      copy: `Unused plan credits roll off on ${kitDate(expiring.expiresAt) ?? "that date"}. They are always spent before credits you buy.`,
      cta: { label: "Compare plans", href: "#compare" },
      alt: "dismiss",
    });
  }
  return moments;
}

function ActionLink({ action, className }: { action: Action; className: string }) {
  if ("href" in action) return action.href.startsWith("#") ? <a href={action.href} className={className}>{action.label}</a> : <Link href={action.href} className={className}>{action.label}</Link>;
  return <button type="button" className={className} onClick={action.onClick}>{action.label}</button>;
}

export function UpgradeMoments({ moments }: { moments: Moment[] }) {
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  const visible = moments.filter(moment => !dismissed.includes(moment.id));
  if (!visible.length) return null;
  return <section className="plans-section" aria-label="Upgrade moments">
    <span className="eyebrow">SHOWN ONLY WHEN A LIMIT IS HIT</span>
    <h2>Upgrade moments</h2>
    <div className="moment-grid">{visible.map(moment => <article key={moment.id} className="moment-card"><Bell /><span className="mini-ghost">{moment.trigger}</span><h3>{moment.title}</h3><p>{moment.copy}</p><div className="moment-actions">
      <ActionLink action={moment.cta} className="mini-btn" />
      {moment.alt === "dismiss"
        ? <button type="button" className="mini-ghost" onClick={() => setDismissed(current => [...current, moment.id])}>{moment.id === "slots" ? "I'll wait" : "Dismiss"}</button>
        : <ActionLink action={moment.alt} className="mini-ghost" />}
    </div></article>)}</div>
  </section>;
}
