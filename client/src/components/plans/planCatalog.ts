// Live plan catalog for the kit v4 /plans and /billing screens.
//
// D-067 (owner, Oct 18 2026) removed the retired monthly Pro/Max plans: this
// grid shows Free, and the account's own catalog plan card when it holds one.
// Every number comes from shared/planCatalog.ts — the catalog the server
// enforces — never from copy written here. What is for sale, and at what
// price, comes only from GET /api/plans/catalog (PackCards, PassCards); no
// single-credit price is printed here (GO-LIVE-1 C10, D-084 (6)).
import { ASK_COST_SENTENCE, CREDIT_RULE_SHORT, REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";
import {
  CATALOG_PLANS,
  CREDIT_PACKS_ON_SALE,
  FREE_PLAN,
  catalogPlanById,
  planDisplayName,
  type Carryover,
  type CatalogCurrency,
  type CatalogPlan,
  type PaidCatalogPlan,
} from "@shared/planCatalog";
import { money } from "./format";
import type { CreditSummary } from "./billingApi";

export type PlanId = "free" | PaidCatalogPlan["id"];

export type { CreditSummary } from "./billingApi";

function paidPlan(plan: string): PaidCatalogPlan | undefined {
  return CATALOG_PLANS.find(candidate => candidate.id === plan);
}

/** The term a plan card prices: a 30-day pass, else the 90-day pass, else the year. */
function priceTerm(plan: PaidCatalogPlan): { minor: Record<CatalogCurrency, number>; per: string } | null {
  if (plan.prices["30d"]) return { minor: plan.prices["30d"], per: "for 30 days" };
  if (plan.prices["90d"]) return { minor: plan.prices["90d"], per: "for 90 days" };
  if (plan.prices.yearly) return { minor: plan.prices.yearly, per: "a year" };
  return null;
}

function amount(plan: CatalogPlan, currency: CatalogCurrency): string {
  if (plan.id === "free") return money(0, currency);
  const paid = paidPlan(plan.id);
  const term = paid ? priceTerm(paid) : null;
  return money(term?.minor[currency] ?? 0, currency);
}

export function planAmount(plan: PlanId, currency: CatalogCurrency): string {
  if (plan === "free") return amount(FREE_PLAN, currency);
  const paid = paidPlan(plan);
  return paid ? amount(paid, currency) : amount(FREE_PLAN, currency);
}

/** The cadence line under the price: "always", "for 30 days", "a year". */
export function planTerm(plan: PlanId): string {
  if (plan === "free") return "always";
  const paid = paidPlan(plan);
  return (paid && priceTerm(paid)?.per) || "";
}

/** Open requests at once, plan credits a cycle and carryover, as the server enforces them. */
export function planLimits(plan: PlanId) {
  const catalog = catalogPlanById(plan) ?? FREE_PLAN;
  return { openRequests: catalog.openRequests, creditsPerMonth: catalog.creditsPerMonth, carryover: catalog.carryover };
}

export function openRequestsLabel(openRequests: number | null): string {
  return openRequests === null ? "Unlimited" : String(openRequests);
}

/** "1 month", "3 months", "Rolls over" (while subscribed) or "—" (none). */
export function carryoverLabel(carryover: Carryover): string {
  if (carryover === "subscribed") return "Rolls over";
  return carryover === 0 ? "—" : `${carryover} month${carryover === 1 ? "" : "s"}`;
}

export function carryoverFeature(carryover: Carryover): string {
  if (carryover === "subscribed") return "Unused plan credits roll over while you're subscribed";
  return carryover === 0 ? "Unused plan credits end with the cycle" : `Unused plan credits carry over ${carryover === 1 ? "1 month" : `up to ${carryover} months`}`;
}

/** A catalog plan the account is paying for right now (renewing, or ending at term end). */
export function hasActivePaidPlan(summary: CreditSummary | null): boolean {
  return activePaidPlan(summary) !== null;
}

/**
 * The catalog plan the account holds right now, or null on Free. A stored plan
 * outside the catalog (a retired Pro/Max wallet) reads as Free: the server
 * already resolves it to Free (shared/planEntitlements.ts), and this screen
 * never names a plan the product no longer sells.
 */
export function activePaidPlan(summary: CreditSummary | null): PaidCatalogPlan | null {
  if (!summary || (summary.subscriptionStatus !== "active" && summary.subscriptionStatus !== "non_renewing")) return null;
  return paidPlan(summary.plan) ?? null;
}

const TAGLINES: Record<CatalogPlan["tier"], string> = {
  free: "For getting started: a few private asks at a time.",
  keep_warm: "For staying ready between searches, with no card on file.",
  start: "For a focused search: more open asks and credits every cycle.",
  momentum: "For a search that is your full-time job: the most open asks and credits.",
  land: "For a search with human review, once reviewers are staffed.",
};

/** price/per are null on the account's own plan card: the summary carries no term or subscription currency to price it from. */
export type PlanCardCopy = { id: PlanId; name: string; tagline: string; price: string | null; per: string | null; features: string[]; cta: string };

/**
 * The plan grid: Free always, plus the account's own catalog plan when it holds
 * one. Passes are sold from their own section (PassCards). Free is priced in
 * the catalog's currency once it is on screen, and states no price before.
 */
export function planCards(currency: CatalogCurrency | null, active: PaidCatalogPlan | null = null): PlanCardCopy[] {
  const free = planLimits("free");
  const cards: PlanCardCopy[] = [{
    id: "free",
    name: FREE_PLAN.label,
    tagline: "For getting started: a few private asks at a time.",
    price: currency ? planAmount("free", currency) : null,
    per: currency ? planTerm("free") : null,
    features: [
      `${openRequestsLabel(free.openRequests)} referral requests open at once`,
      "Track every request in one place",
      ...(CREDIT_PACKS_ON_SALE ? ["Add credits anytime"] : []),
      "Same referrer queue as every plan",
    ],
    cta: "Ask for a referral",
  }];
  if (active) {
    // No price: a pass is sold for 30 or 90 days in either currency, and the credit summary says
    // neither, so a price here could misstate what the holder paid (receipts are on /billing).
    cards.push({
      id: active.id,
      name: planDisplayName(active),
      tagline: TAGLINES[active.tier],
      price: null,
      per: null,
      features: [
        `${openRequestsLabel(active.openRequests)} referral requests open at once`,
        `${active.creditsPerMonth} credits every month`,
        carryoverFeature(active.carryover),
        "Cancel anytime; access stays through the paid cycle",
        "Same referrer queue as every plan",
      ],
      cta: "Your plan",
    });
  }
  return cards;
}

// D-063: the band carries the whole money sentence, one half per rule.
export const fairnessRules = [
  ASK_COST_SENTENCE,
  "Paying never moves you up a referrer's queue.",
  REFERRER_MONEY_SENTENCE,
  "No commissions on hires. No paid priority.",
];

/** Free-only answers: what /plans can promise today, nothing about a plan it does not sell. */
export function planFaqs(): Array<readonly [string, string]> {
  const free = planLimits("free");
  return [
    ["Does paying help me get referred?", "No. Referrers see the same queue whatever you have paid for. Credits you buy pay for asks and tools; they never change how many requests you can have open or your place in the queue. The decision to refer stays human."],
    ["How many referral requests can I have open?", `Free includes ${openRequestsLabel(free.openRequests)} open requests at a time. A request that's answered, passed, withdrawn or expired frees its slot. Every account shares the same queue.`],
    ["What are credits for?", `1 credit = one finished piece of work from SkipWait's tools. Each referral request uses 1 credit; ${CREDIT_RULE_SHORT}. Buy credits anytime in packs.`],
    ["Do unused credits expire?", "Credits you buy never expire, and they are spent only when a verified employee can first see your ask."],
    ["Do referrers pay?", "No. Referrers never pay to review requests, SkipWait never pays them, and they never ask you for money."],
    ["Is pricing local?", "Yes. India sees India prices in rupees; everywhere else pays in US dollars."],
  ];
}
