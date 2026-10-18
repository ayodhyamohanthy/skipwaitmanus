// Pure view model for My asks (design/goal-ui/content.json screenC; DESIGN.md binding rules). Every status, date,
// next step and credit line is derived from the live ask and the seeker's own ledger rows; nothing is sampled.
// Money lines say what the code does (shared/moneyCopy.ts, D-063): a waiting ask spends nothing (D-034), a held ask
// waits for a credit (D-047), and a returned credit is shown only when a refund row exists.
import type { CreditLedgerEntry } from "@shared/creditLedger";
import { CREDIT_ENDED_CAVEAT } from "@shared/moneyCopy";
import { COVERAGE_WAIT_DAYS } from "@shared/referral";
import { displayRoleTitle } from "@shared/roleTitle";
import type { MyAsk } from "./myAsksApi";

export type AskStatusKind = "waiting" | "under_review" | "accepted" | "referred" | "expired" | "withdrawn";

export type AskCredit = { label: string; detail: string | null };
export type AskHistoryItem = { at: string | null; text: string; credit: string | null; tense: "past" | "current" | "future" };

export type AskView = {
  id: number;
  ref: string | null;
  company: string;
  role: string;
  status: AskStatusKind;
  label: string;
  statusLine: string;
  stage: number;
  terminal: "expired" | "withdrawn" | null;
  section: "active" | "closed";
  date: { label: string; at: string };
  next: string;
  credit: AskCredit | null;
  canWithdraw: boolean;
  needsCredit: boolean;
  conversationHref: string;
  hasConversation: boolean;
  history: AskHistoryItem[];
};

/** Per-ask credit movement from the seeker's ledger (reference type "referral_request", id "<ask>", "<ask>#n" or "<ask>#refund"). */
export type AskLedger = { spent: number; returned: number };

export function indexLedger(entries: readonly CreditLedgerEntry[]): Map<number, AskLedger> {
  const index = new Map<number, AskLedger>();
  for (const entry of entries) {
    if (entry.reference?.type !== "referral_request") continue;
    const id = Number(/^(\d+)(?:#.*)?$/.exec(entry.reference.id)?.[1]);
    if (!Number.isInteger(id) || id <= 0) continue;
    const current = index.get(id) ?? { spent: 0, returned: 0 };
    if (entry.credits < 0) current.spent += -entry.credits;
    else current.returned += entry.credits;
    index.set(id, current);
  }
  return index;
}

const plural = (count: number) => `${count} ${count === 1 ? "credit" : "credits"}`;

function creditFromLedger(ledger: AskLedger | undefined): AskCredit | null {
  if (!ledger || (ledger.spent === 0 && ledger.returned === 0)) return null;
  if (ledger.returned > 0 && ledger.returned >= ledger.spent) return { label: `${plural(ledger.returned)} returned`, detail: null };
  return { label: `${plural(ledger.spent)} spent`, detail: null };
}

type DateFormatter = (iso: string) => string;

export function toAskView(ask: MyAsk, ledger: AskLedger | undefined, formatDate: DateFormatter): AskView {
  const company = ask.companyName?.trim() || ask.companyDomain;
  const role = displayRoleTitle({ title: ask.title, targetRoleUrl: ask.targetRoleUrl, jobFunction: ask.jobFunction });
  const fromLedger = creditFromLedger(ledger);
  const base = { id: ask.id, ref: ask.displayRef, company, role, conversationHref: `/conversation/${ask.id}`, hasConversation: false, canWithdraw: false, needsCredit: false };
  const closes = ask.expiresAt ? formatDate(ask.expiresAt) : null;
  const sent = { at: ask.createdAt, text: `Sent to verified ${company} employees`, credit: null as string | null, tense: "past" as const };
  const changed = (label: string): AskView["date"] => ({ label, at: ask.updatedAt });

  if (ask.status === "pending") {
    const unclaimed = !ask.referrerId || ask.heldForReferrer;
    if (ask.queueStatus === "held_for_credit" || ask.coverageHeldAt) {
      return { ...base, status: "waiting", label: "Waiting", statusLine: "Waiting for a credit", stage: 0, terminal: null, section: "active", date: { label: "Sent", at: ask.createdAt }, canWithdraw: unclaimed, needsCredit: true,
        next: `A verified employee at ${company} can now see asks. Add a credit to send yours.`,
        credit: { label: "No credit used yet", detail: "It goes out as soon as you have one" },
        history: [{ ...sent, text: `Saved for ${company}` }, { at: ask.coverageHeldAt, text: "A verified employee can now see asks. Waiting for a credit", credit: null, tense: "current" }] };
    }
    if (ask.waitingForCoverage) {
      return { ...base, status: "waiting", label: "Waiting", statusLine: `Waiting for a verified employee at ${company}`, stage: 0, terminal: null, section: "active", date: { label: "Sent", at: ask.createdAt }, canWithdraw: unclaimed,
        next: `No verified employee at ${company} can see it yet. It waits up to ${COVERAGE_WAIT_DAYS} days and costs nothing until one can.`,
        credit: { label: "No credit used yet", detail: "1 credit is used when a verified employee can first see it" },
        history: [{ ...sent, text: `Saved while ${company} has no verified employee available` }, { at: null, text: "Waiting for a verified employee to join or open up", credit: null, tense: "current" }, ...(closes ? [{ at: ask.expiresAt, text: "Closes at no cost if nobody can see it by then", credit: null, tense: "future" as const }] : [])] };
    }
    if (!unclaimed) {
      return { ...base, status: "under_review", label: "Under review", statusLine: "A verified employee has it", stage: 1, terminal: null, section: "active", date: { label: "Sent", at: ask.createdAt },
        next: "Nothing to do yet. You’ll hear from us when they decide.",
        credit: fromLedger,
        history: [sent, { at: null, text: "With a verified employee for review", credit: null, tense: "current" }] };
    }
    const personal = ask.heldForReferrer;
    return { ...base, status: "waiting", label: "Waiting", statusLine: personal ? "Waiting for the employee whose link you used" : "Waiting for a verified employee", stage: 0, terminal: null, section: "active", date: { label: "Sent", at: ask.createdAt }, canWithdraw: true,
      next: closes
        ? `Nothing to do yet. If ${personal ? "they don’t pick it up" : "nobody picks it up"} by ${closes}, it closes and your credit comes back.`
        : "Nothing to do yet. You’ll hear from us when someone picks it up.",
      credit: fromLedger ? { label: fromLedger.label, detail: closes ? `Comes back if nobody picks it up by ${closes}, ${CREDIT_ENDED_CAVEAT}` : null } : null,
      history: [{ ...sent, credit: fromLedger?.label ?? null }, { at: null, text: personal ? "Waiting for that employee to pick it up" : "Waiting for a verified employee to pick it up", credit: null, tense: "current" }, ...(closes ? [{ at: ask.expiresAt, text: "Closes if nobody picks it up, and the credit comes back", credit: null, tense: "future" as const }] : [])] };
  }

  if (ask.status === "approved") {
    return { ...base, status: "accepted", label: "Accepted", statusLine: "Names are shared both ways", stage: 2, terminal: null, section: "active", date: changed("Accepted"), hasConversation: true,
      next: `Your referrer submits it through ${company}’s process, then marks it Referred.`,
      credit: fromLedger, history: [sent, { at: ask.updatedAt, text: "Accepted by a verified employee", credit: null, tense: "current" }] };
  }
  if (ask.status === "intro_made" || ask.status === "interview" || ask.status === "offer") {
    const label = ask.status === "intro_made" ? "Referred" : ask.status === "interview" ? "Interview" : "Offer";
    return { ...base, status: "referred", label, statusLine: ask.status === "intro_made" ? `Submitted through ${company}’s process` : "A milestone was recorded", stage: 3, terminal: null, section: "active", date: changed(ask.status === "intro_made" ? "Referred" : "Updated"), hasConversation: true,
      next: `Watch your email for ${company}’s recruiters. Companies decide hiring; add an update when you hear.`,
      credit: fromLedger, history: [sent, { at: ask.updatedAt, text: ask.status === "intro_made" ? "Referred" : `${label} recorded`, credit: null, tense: "current" }] };
  }
  if (ask.status === "withdrawn") {
    return { ...base, status: "withdrawn", label: "Withdrawn", statusLine: "You withdrew it", stage: 0, terminal: "withdrawn", section: "closed", date: changed("Withdrawn"),
      next: fromLedger?.label.endsWith("returned") ? "Nothing else to do. Your slot and credit came back." : "Nothing else to do. Its open slot is free again.",
      credit: fromLedger ?? { label: "No credit used", detail: null }, history: [sent, { at: ask.updatedAt, text: "Withdrawn", credit: fromLedger?.label.endsWith("returned") ? fromLedger.label : null, tense: "current" }] };
  }
  if (ask.status === "declined") {
    return { ...base, status: "expired", label: "Declined", statusLine: "A verified employee passed", stage: 1, terminal: "expired", section: "closed", date: changed("Declined"),
      next: "Refresh your reasons and ask again, or try a company that’s open to requests.", credit: fromLedger, history: [sent, { at: ask.updatedAt, text: "Declined", credit: null, tense: "current" }] };
  }
  // closed: after acceptance it ended there; without a referrer it expired unclaimed (the expiry path), or, for a
  // waiting ask, closed at no cost after the coverage wait (D-061).
  if (ask.referrerId) {
    return { ...base, status: "withdrawn", label: "Closed", statusLine: "This ask is closed", stage: 2, terminal: "withdrawn", section: "closed", date: changed("Closed"), hasConversation: true,
      next: "Nothing else to do here.", credit: fromLedger, history: [sent, { at: ask.updatedAt, text: "Closed", credit: null, tense: "current" }] };
  }
  const costFree = ask.waitingForCoverage || !fromLedger;
  return { ...base, status: "expired", label: "Expired", statusLine: costFree ? "Nobody could see it in time" : "Nobody picked it up in time", stage: 0, terminal: "expired", section: "closed", date: changed("Expired"),
    next: "Refresh your reasons and ask again, or try a company that’s open to requests.",
    credit: costFree ? { label: "No credit used", detail: null } : fromLedger, history: [sent, { at: ask.updatedAt, text: "Expired", credit: fromLedger?.label.endsWith("returned") ? fromLedger.label : null, tense: "current" }] };
}

/** Active first (newest first), then closed (most recently changed first). */
export function groupAskViews(views: readonly AskView[], asks: readonly MyAsk[]): { active: AskView[]; closed: AskView[] } {
  const byId = new Map(asks.map(ask => [ask.id, ask]));
  const time = (view: AskView, field: "createdAt" | "updatedAt") => Date.parse(byId.get(view.id)?.[field] ?? "") || 0;
  return {
    active: views.filter(view => view.section === "active").sort((a, b) => time(b, "createdAt") - time(a, "createdAt")),
    closed: views.filter(view => view.section === "closed").sort((a, b) => time(b, "updatedAt") - time(a, "updatedAt")),
  };
}

/** "Open asks 2 of 3 · Free plan" (an unlimited plan has no "of"). */
export function slotsLine(slots: { open: number; cap: number | null; planLabel: string } | null): string | null {
  if (!slots) return null;
  return slots.cap === null ? `Open asks ${slots.open} · ${slots.planLabel} plan` : `Open asks ${slots.open} of ${slots.cap} · ${slots.planLabel} plan`;
}
