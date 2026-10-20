// Kit v4 "Upgrade moments" (UPGRADE_NUDGES.md), shown only for a limit this
// account has really hit: every open slot in use, a credit balance spent down
// to 0, or plan credits rolling off within 7 days. Each card is derived from
// the signed-in account's own credit summary; nothing renders when no limit applies.
//
// D-067 removed the Pro/Max plans and the compare table, so no moment pitches a
// plan: a full slot set points at the asks, and credits point at where credits
// are bought (the page's creditsHref: the packs on /plans while one is on sale,
// else /premium) only while credit packs are on sale (CREDIT_PACKS_ON_SALE,
// D-042); off sale the credits moment is dismiss-only, never a link to the
// paused screen.
import { useState } from "react";
import { Bell } from "lucide-react";
import { CREDIT_PACKS_ON_SALE } from "@shared/planCatalog";
import { kitDate } from "./format";
import type { CreditSummary } from "./planCatalog";
import { PlansLink } from "./PlansLink";

type Action = { label: string; href: string };
/** cta is null when the moment has nothing to offer but a dismiss (credits while packs are off sale). */
export type Moment = { id: string; trigger: string; title: string; copy: string; cta: Action | null; alt: Action | "dismiss" };

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
      copy: CREDIT_PACKS_ON_SALE
        ? "One credit buys one finished piece of work, including the next referral request. Purchased credits never expire."
        : "One credit buys one finished piece of work, including the next referral request.",
      cta: CREDIT_PACKS_ON_SALE ? { label: "Add credits", href: creditsHref } : null,
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
  return <PlansLink href={action.href} className={className}>{action.label}</PlansLink>;
}

export function UpgradeMoments({ moments }: { moments: Moment[] }) {
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  const visible = moments.filter(moment => !dismissed.includes(moment.id));
  if (!visible.length) return null;
  return <section className="plans-section" aria-label="Upgrade moments">
    <span className="eyebrow">SHOWN ONLY WHEN A LIMIT IS HIT</span>
    <h2>Upgrade moments</h2>
    <div className="moment-grid">{visible.map(moment => <article key={moment.id} className="moment-card"><Bell /><span className="mini-ghost">{moment.trigger}</span><h3>{moment.title}</h3><p>{moment.copy}</p><div className="moment-actions">
      {moment.cta ? <ActionLink action={moment.cta} className="mini-btn" /> : null}
      {moment.alt === "dismiss"
        ? <button type="button" className="mini-ghost" onClick={() => setDismissed(current => [...current, moment.id])}>{moment.id === "slots" ? "I'll wait" : "Dismiss"}</button>
        : <ActionLink action={moment.alt} className="mini-ghost" />}
    </div></article>)}</div>
  </section>;
}
