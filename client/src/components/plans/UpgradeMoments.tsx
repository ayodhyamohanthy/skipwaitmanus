// Kit v4 "Upgrade moments" (UPGRADE_NUDGES.md), shown only for a limit this
// account has really hit: every open slot in use, a credit balance spent down
// to 0, or plan credits rolling off within 7 days. Each card is derived from
// the signed-in account's own credit summary; nothing renders when no limit applies.
//
// D-067 removed the Pro/Max plans and the compare table, so no moment pitches a
// plan: a full slot set points at the asks, and credits point at /premium.
import { useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "wouter";
import { kitDate } from "./format";
import type { CreditSummary } from "./planCatalog";

type Action = { label: string; href: string };
export type Moment = { id: string; trigger: string; title: string; copy: string; cta: Action; alt: Action | "dismiss" };

const DAY_MS = 86_400_000;
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export function upgradeMoments(summary: CreditSummary, now: Date, creditsHref: string): Moment[] {
  const moments: Moment[] = [];
  const { slots, ledger } = summary;
  if (slots?.full && slots.cap !== null) {
    moments.push({
      id: "slots",
      trigger: "All open slots in use",
      title: `Your ${slots.cap} requests are all open`,
      copy: "Wait for an answer to free a slot. Queue position stays equal either way.",
      cta: { label: "View my requests", href: "/requests" },
      alt: "dismiss",
    });
  }
  // "Reaches 0": the account spent credits this cycle and has none left (never having had any is not a limit hit).
  if (ledger && ledger.balance <= 0 && ledger.cycle.used > 0) {
    moments.push({
      id: "credits",
      trigger: "Credit balance reaches 0",
      title: "You're out of credits",
      copy: "One credit buys one finished piece of work, including the next referral request. Purchased credits never expire.",
      cta: { label: "Add credits", href: creditsHref },
      alt: "dismiss",
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
      cta: { label: "Ask for a referral", href: "/ask" },
      alt: "dismiss",
    });
  }
  return moments;
}

function ActionLink({ action, className }: { action: Action; className: string }) {
  return <Link href={action.href} className={className}>{action.label}</Link>;
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
