// Kit v4 "Upgrade moments", shown only for a limit this account has really hit.
// Each card is derived from the signed-in account's own credit summary; nothing
// renders when no limit applies.
import { useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "wouter";
import { SUBSCRIPTION_PLANS, type PaidSubscriptionPlan } from "@shared/subscriptionPlans";
import { hasActivePaidPlan, nextPlanUp, type CreditSummary } from "./planCatalog";

type Action = { label: string; href: string } | { label: string; onClick: () => void };
export type Moment = { id: string; trigger: string; title: string; copy: string; cta: Action; alt: Action | "dismiss" };

const DAY_MS = 86_400_000;

export function upgradeMoments(summary: CreditSummary, now: Date, creditsHref: string, onSeePlan: (plan: PaidSubscriptionPlan) => void): Moment[] {
  const moments: Moment[] = [];
  const next = nextPlanUp(summary.plan);
  const paid = hasActivePaidPlan(summary);
  // Live checkout cannot switch an active subscription, so only Free accounts are pointed at a plan.
  const nextPlan = next && !paid ? SUBSCRIPTION_PLANS[next] : null;
  if (summary.monthlyAllowance > 0 && summary.monthlyCreditsRemaining <= 0) {
    moments.push({
      id: "slots",
      trigger: "All monthly requests in use",
      title: `Your ${summary.monthlyAllowance} requests are all in use`,
      copy: `${paid ? "Your requests reset with your plan cycle" : "Free requests reset on the 1st of each month"}. A withdrawn or expired ask frees its slot${nextPlan ? `, or move to ${nextPlan.label} for ${nextPlan.monthlyAllowance} requests a month` : ""}. Queue position stays equal either way.`,
      cta: next && nextPlan ? { label: `See ${nextPlan.label}`, onClick: () => onSeePlan(next) } : { label: "Add credits", href: creditsHref },
      alt: "dismiss",
    });
  }
  if (summary.totalAvailable <= 0) {
    moments.push({
      id: "credits",
      trigger: "Credit balance reaches 0",
      title: "You're out of credits",
      copy: nextPlan ? `Add a pack once, or get ${nextPlan.monthlyAllowance} requests every month with ${nextPlan.label}.` : "Add a pack once. Credits you buy never expire.",
      cta: { label: "Add credits", href: creditsHref },
      alt: { label: "Compare plans", href: "#compare" },
    });
  }
  const termEnd = summary.subscriptionCurrentTermEnd ? Date.parse(summary.subscriptionCurrentTermEnd) : Number.NaN;
  const daysLeft = Math.ceil((termEnd - now.getTime()) / DAY_MS);
  if (paid && summary.subscriptionStatus === "active" && summary.monthlyCreditsRemaining > 0 && daysLeft > 0 && daysLeft <= 7) {
    moments.push({
      id: "reset",
      trigger: "Plan requests about to reset",
      title: `${summary.monthlyCreditsRemaining} request${summary.monthlyCreditsRemaining === 1 ? "" : "s"} reset in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
      copy: "Unused monthly requests do not carry over. Use them on a referral request before your cycle renews.",
      cta: { label: "Use credits", href: "/ask" },
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
