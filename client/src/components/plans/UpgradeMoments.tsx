// Kit v4 "Upgrade moments" (UPGRADE_NUDGES.md), shown only for a limit this
// account has really hit: every open slot in use, or a credit balance spent
// down to 0. Each card is derived from the signed-in account's own credit
// summary; nothing renders when no limit applies.
//
// D-067 (owner, Oct 18 2026) removed Pro/Max, so a moment can no longer point at
// a plan to buy. It points at the ask it unblocks or at the credits on sale.
import { useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "wouter";
import { CREDIT_PACKS_ON_SALE } from "@shared/planCatalog";
import type { CreditSummary } from "./billingApi";

type Action = { label: string; href: string };
export type Moment = { id: string; trigger: string; title: string; copy: string; cta: Action; alt: Action | "dismiss" };

export function upgradeMoments(summary: CreditSummary, creditsHref: string): Moment[] {
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
      copy: CREDIT_PACKS_ON_SALE ? "Buy credits one at a time; they never expire." : "Your free credits reset at the start of next month.",
      cta: CREDIT_PACKS_ON_SALE ? { label: "Add credits", href: creditsHref } : { label: "View my requests", href: "/requests" },
      alt: "dismiss",
    });
  }
  return moments;
}

function ActionLink({ action, className }: { action: Action; className: string }) {
  return action.href.startsWith("#") ? <a href={action.href} className={className}>{action.label}</a> : <Link href={action.href} className={className}>{action.label}</Link>;
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
