// Live plan catalog for the kit v4 /plans and /billing screens.
//
// D-067 (owner, Oct 18 2026) removed the retired monthly Pro/Max plans: /plans
// now shows Free, and the account's own catalog plan card when it holds one
// (the D-046 passes go on sale here in their own slice). Every number comes
// from shared/planCatalog.ts — the catalog the server enforces — never from
// copy written here.
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
import type { PlanCatalogResponse } from "@shared/billingCatalog";
import { money } from "./format";
import type { CreditSummary } from "./billingApi";

export type PlanId = "free" | PaidCatalogPlan["id"];

export type { CreditSummary } from "./billingApi";

/** One extra credit, as sold on /premium. */
/**
 * The lowest per-credit price across the packs on sale, from the live catalog only (no price is
 * written here). null until the catalog loads or when no pack is on sale.
 */
export function creditFrom(catalog: { currency: CatalogCurrency; packs: ReadonlyArray<{ credits: number; amount: number; available: boolean }> } | null | undefined): string | null {
  const per = (catalog?.packs ?? []).filter(pack => pack.available && pack.credits > 0).map(pack => pack.amount / pack.credits);
  if (!catalog || per.length === 0) return null;
  const minor = Math.round(Math.min(...per));
  const whole = minor % 100 === 0;
  try { return `from ${new Intl.NumberFormat("en-US", { style: "currency", currency: catalog.currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(minor / 100)}`; } catch { return null; }
}

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

function carryoverFeature(carryover: Carryover): string {
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
 * one. No other plan is sold from this screen until the D-046 pass cards land.
 */
export function planCards(currency: CatalogCurrency, active: PaidCatalogPlan | null = null, creditPrice: string | null = null): PlanCardCopy[] {
  const free = planLimits("free");
  const cards: PlanCardCopy[] = [{
    id: "free",
    name: FREE_PLAN.label,
    tagline: "For getting started: a few private asks at a time.",
    price: planAmount("free", currency),
    per: planTerm("free"),
    features: [
      `${openRequestsLabel(free.openRequests)} referral requests open at once`,
      "Track every request in one place",
      ...(CREDIT_PACKS_ON_SALE ? [creditPrice ? `Add credits anytime in packs, ${creditPrice} a credit` : "Add credits anytime in packs"] : []),
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
    ["What are credits for?", `1 credit = one finished piece of work from skipwait.me's tools. Each referral request uses 1 credit; ${CREDIT_RULE_SHORT}. Extra credits are sold in packs; the price per credit is shown with the packs.`],
    ["Do unused credits expire?", "Credits you buy never expire, and they are spent only when a verified employee can first see your ask."],
    ["Do referrers pay?", "No. Referrers never pay to review requests, skipwait.me never pays them, and they never ask you for money."],
    ["Is pricing local?", "Yes. Prices show in rupees in India and in dollars everywhere else, from the live price list."],
  ];
}

// --- Live-catalog view models (GO-LIVE-1) -------------------------------------
// Packs and passes are rendered from the server's /api/plans/catalog payload
// (availability included), so a price that goes off sale disappears on its own.

export type PackCardCopy = { id: string; credits: number; price: string; available: boolean; firstPack: boolean; recommended: boolean };

export function catalogPackCards(catalog: PlanCatalogResponse): PackCardCopy[] {
  return catalog.packs.map(pack => ({
    id: pack.id,
    credits: pack.credits,
    price: money(pack.amount, catalog.currency),
    available: pack.available,
    firstPack: pack.firstPack,
    recommended: pack.recommended,
  }));
}

export type PassTerm = "30d" | "90d";

export type PassCardCopy = {
  id: PlanId;
  displayName: string;
  tagline: string;
  price: string;
  per: string;
  interval: "30d" | "90d" | "yearly";
  available: boolean;
  /** A plan of a lower or equal level is not sold while this plan is active. */
  buyable: boolean;
  byApplication: boolean;
  recommended: boolean;
  humanTimeOffered: boolean;
  autoExtend: boolean;
  features: string[];
};

/** One card per catalog plan: Keep warm yearly always; the passes follow the 30/90-day toggle. */
export function catalogPassCards(catalog: PlanCatalogResponse, term: PassTerm, active: PaidCatalogPlan | null): PassCardCopy[] {
  return catalog.plans.flatMap(plan => {
    const catalogPlan = catalogPlanById(plan.id);
    if (!catalogPlan) return [];
    const wanted = plan.id === "keep_warm" ? "yearly" : term;
    const chosen = plan.terms.find(candidate => candidate.interval === wanted) ?? plan.terms[0];
    if (!chosen) return [];
    const buyable = active === null || catalogPlan.level > active.level;
    const features = [
      `${openRequestsLabel(plan.openRequests)} referral requests open at once`,
      `${plan.creditsPerMonth} credits every month`,
      carryoverFeature(plan.carryover),
      ...(plan.humanTimeOffered && (plan.humanTime.writtenReviews > 0 || plan.humanTime.liveSessions > 0 || plan.humanTime.hours > 0) ? ["Human review time included"] : []),
      "Paid once — never renews by itself",
      "Same referrer queue as every plan",
    ];
    return [{
      id: plan.id as PlanId,
      displayName: plan.displayName,
      tagline: TAGLINES[plan.tier],
      price: money(chosen.amount, catalog.currency),
      per: chosen.interval === "yearly" ? "a year" : `for ${chosen.days ?? 30} days`,
      interval: chosen.interval,
      available: chosen.available,
      buyable,
      byApplication: plan.byApplication,
      recommended: plan.recommended,
      humanTimeOffered: plan.humanTimeOffered,
      autoExtend: chosen.autoExtend.length > 0,
      features,
    }];
  });
}
