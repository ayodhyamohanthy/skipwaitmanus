/**
 * The billing view of the price book (shared/planCatalog.ts): which Chargebee
 * item price means which plan term, credit pack or human session, the amount
 * the server charges for it, when a pass may auto-extend, how a plan change
 * moves, and the public catalog payload. Only the kit catalog is billable: the
 * retired monthly Pro/Max (D-067) have no price here and no item price resolves
 * to them. Pure; the server and the client read the same answers.
 */
import { z } from "zod";
import { BILLING_REGIONS, indiaPriceNote, currencyForRegion, type BillingRegion } from "./billingRegion";
import { CATALOG_CURRENCIES, CATALOG_INTERVALS, CATALOG_PACK_IDS, CATALOG_PLAN_IDS, CATALOG_PLANS, CREDIT_PACKS, CREDIT_TOOLS, CREDIT_TOOL_IDS, FREE_PLAN, HUMAN_SESSIONS, HUMAN_SESSION_IDS, MAX_OPEN_ASKS_PER_COMPANY, PASS_DAYS, PASS_SALES_ENABLED, REVERSE_TRIAL, REVERSE_TRIAL_ON_OFFER, catalogItemPriceId, catalogPackById, catalogPackItemPriceId, catalogPlanById, catalogSessionItemPriceId, humanSessionById, planDisplayName, planIntervals, tierRank, type CatalogCurrency, type CatalogInterval, type CatalogPackId, type CatalogPlanId, type HumanSessionId, type PaidCatalogPlan } from "./planCatalog";
import { planEntitlementsFor } from "./planEntitlements";
import { PLAN_CREDIT_LADDER, PLAN_FAMILY, type PlanCreditRung, type PlanFamilyId } from "./planFamily";
import { packItemPriceId as v2PackItemPriceId, planCreditsItemPriceId as v2CreditsItemPriceId, planItemPriceId as v2PlanItemPriceId } from "./planFamilyBilling";

export const BILLING_INTERVALS = CATALOG_INTERVALS;
export const BILLING_CURRENCIES = CATALOG_CURRENCIES;
/**
 * Stored billing periods (tokenBalances.subscriptionBillingPeriod and the intent
 * and invoice columns): existing values first and in order (a MySQL ENUM stores
 * the index), then the passes 0091 added. "monthly" was the retired Pro/Max
 * term (D-067): storage-only, never sold or resolved, kept first because it is
 * ENUM index 0.
 */
export const BILLING_PERIODS = ["monthly", "yearly", "30d", "90d"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

/**
 * The pre-kit monthly plans D-067 removed completely (owner, Oct 18 2026). No
 * checkout sells them (POST /api/chargebee/subscription-checkout answers 410
 * plan_retired), no item price resolves to them, they are never billable and a
 * wallet holding one reads as Free. They stay in the column ENUMs, in place,
 * only because removing an ENUM member is not an additive migration and history
 * (wallets, intents, gift receipts, ledger rows) must stay readable.
 */
export const RETIRED_PLAN_IDS = ["pro", "max"] as const;
export type RetiredPlanId = (typeof RETIRED_PLAN_IDS)[number];

export function isRetiredPlanId(value: unknown): value is RetiredPlanId {
  return typeof value === "string" && (RETIRED_PLAN_IDS as readonly string[]).includes(value);
}

/**
 * A retired plan's Chargebee item price (skipwait_pro_monthly-INR and the like).
 * Never sold and never resolved to a plan: recognised only so a late provider
 * event that names one is recorded, refused (it grants nothing) and alerted.
 */
export function isRetiredPlanItemPrice(itemPriceId: unknown): boolean {
  return typeof itemPriceId === "string" && RETIRED_PLAN_IDS.some(plan => BILLING_CURRENCIES.some(currency => itemPriceId === `skipwait_${plan}_monthly-${currency}`));
}
/**
 * Plan ids 0090 stored before the Oct 14 2026 decision renamed the Land levels.
 * Never sold or written; they stay in the column ENUMs only because removing an
 * ENUM member is not an additive migration. A wallet holding one reads as Free.
 */
export const RESERVED_PLAN_IDS = ["land_100", "land_200", "land_500"] as const;
/** Every plan a subscription can bill: the kit catalog plans only (D-067). */
export const BILLABLE_PLAN_IDS = CATALOG_PLAN_IDS;
export type BillablePlanId = (typeof BILLABLE_PLAN_IDS)[number];
/** tokenBalances.plan: existing values first and in order (0090, then 0091, then 0102 the D-132 families). */
export const WALLET_PLAN_IDS = ["free", ...RETIRED_PLAN_IDS, "start", "momentum", ...RESERVED_PLAN_IDS, "keep_warm", "land_focus", "land_sprint", "land_concierge", "fast_track", "insider"] as const;
export type WalletPlanId = (typeof WALLET_PLAN_IDS)[number];
/** subscriptionCheckoutIntents.plan, same ordering rule. */
export const INTENT_PLAN_IDS = [...RETIRED_PLAN_IDS, "start", "momentum", ...RESERVED_PLAN_IDS, "keep_warm", "land_focus", "land_sprint", "land_concierge", "fast_track", "insider"] as const;

export function isBillablePlanId(value: unknown): value is BillablePlanId {
  return typeof value === "string" && (BILLABLE_PLAN_IDS as readonly string[]).includes(value);
}

export function isCatalogPlanId(value: unknown): value is CatalogPlanId {
  return typeof value === "string" && (CATALOG_PLAN_IDS as readonly string[]).includes(value);
}

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return typeof value === "string" && (BILLING_PERIODS as readonly string[]).includes(value);
}

/** True when the plan is sold for that term (Keep warm yearly only; every other plan 30 or 90 days). */
export function planSellsInterval(planId: CatalogPlanId, interval: CatalogInterval): boolean {
  const plan = catalogPlanById(planId);
  return Boolean(plan && plan.prices[interval]);
}

export type PlanPrice = { kind: "plan"; plan: BillablePlanId; interval: BillingPeriod; currency: CatalogCurrency; amount: number; itemPriceId: string };
export type PackPrice = { kind: "pack"; packId: CatalogPackId; credits: number; currency: CatalogCurrency; amount: number; itemPriceId: string };
export type SessionPrice = { kind: "session"; sessionId: HumanSessionId; currency: CatalogCurrency; amount: number; itemPriceId: string };
// D-132 v2 bundle catalog: the monthly plan fee (a plan item), its in-plan
// monthly credits rung (an ADDON item - a subscription holds one plan plus
// addons, never two plans), and the one-time top-up pack (a charge item).
export type V2PlanPrice = { kind: "v2plan"; planFamily: PlanFamilyId; currency: CatalogCurrency; amount: number; itemPriceId: string };
export type V2CreditsPrice = { kind: "v2credits"; rung: PlanCreditRung; currency: CatalogCurrency; amount: number; itemPriceId: string };
export type V2PackPrice = { kind: "v2pack"; rung: PlanCreditRung; currency: CatalogCurrency; amount: number; itemPriceId: string };
export type V2Price = V2PlanPrice | V2CreditsPrice | V2PackPrice;
export type CatalogPrice = PlanPrice | PackPrice | SessionPrice | V2Price;

/** The price the server charges for a plan term: kit plans for the terms they list; no plan sells "monthly". */
export function planPrice(plan: BillablePlanId, interval: BillingPeriod, currency: CatalogCurrency): PlanPrice | undefined {
  if (interval === "monthly") return undefined;
  const amount = catalogPlanById(plan)?.prices[interval]?.[currency];
  if (amount === undefined) return undefined;
  return { kind: "plan", plan, interval, currency, amount, itemPriceId: catalogItemPriceId(plan, interval, currency) };
}

export function packPrice(packId: CatalogPackId, currency: CatalogCurrency): PackPrice | undefined {
  const pack = catalogPackById(packId);
  const amount = pack?.prices[currency];
  if (!pack || amount === undefined) return undefined;
  return { kind: "pack", packId: pack.id, credits: pack.credits, currency, amount, itemPriceId: catalogPackItemPriceId(pack.id, currency) };
}

export function sessionPrice(sessionId: HumanSessionId, currency: CatalogCurrency): SessionPrice | undefined {
  const session = humanSessionById(sessionId);
  if (!session) return undefined;
  return { kind: "session", sessionId: session.id, currency, amount: session.prices[currency], itemPriceId: catalogSessionItemPriceId(session.id, currency) };
}

/** Every v2 price the bundle sells: 2 plan fees + 6 monthly rungs + 6 top-up packs, per currency (28). Open Door is free and lists nothing. */
function v2CatalogPrices(): V2Price[] {
  const prices: V2Price[] = [];
  for (const currency of BILLING_CURRENCIES) {
    for (const plan of PLAN_FAMILY) {
      if (plan.id === "open_door") continue;
      const amount = currency === "INR" ? plan.monthlyInrPaise : plan.monthlyUsdCents;
      prices.push({ kind: "v2plan", planFamily: plan.id, currency, amount, itemPriceId: v2PlanItemPriceId(plan.id, currency) });
    }
    for (const rung of PLAN_CREDIT_LADDER) {
      const amount = currency === "INR" ? rung.inrPaise : rung.usdCents;
      prices.push({ kind: "v2credits", rung: rung.credits, currency, amount, itemPriceId: v2CreditsItemPriceId(rung.credits, currency) });
      prices.push({ kind: "v2pack", rung: rung.credits, currency, amount, itemPriceId: v2PackItemPriceId(rung.credits, currency) });
    }
  }
  return prices;
}

const ALL_PRICES: readonly CatalogPrice[] = [
  ...BILLABLE_PLAN_IDS.flatMap(plan => BILLING_PERIODS.flatMap(interval => BILLING_CURRENCIES.map(currency => planPrice(plan, interval, currency)))),
  ...CATALOG_PACK_IDS.flatMap(packId => BILLING_CURRENCIES.map(currency => packPrice(packId, currency))),
  ...HUMAN_SESSION_IDS.flatMap(sessionId => BILLING_CURRENCIES.map(currency => sessionPrice(sessionId, currency))),
  // D-132 v2 bundle book: plan fees, monthly credits rungs and top-up packs.
  ...v2CatalogPrices(),
].flatMap(price => (price ? [price] : []));
const ITEM_PRICES: ReadonlyMap<string, CatalogPrice> = new Map(ALL_PRICES.map(price => [price.itemPriceId, price] as const));

/** What a Chargebee item price id sells, or undefined for an id outside the price book. */
export function resolveItemPrice(itemPriceId: unknown): CatalogPrice | undefined {
  return typeof itemPriceId === "string" ? ITEM_PRICES.get(itemPriceId) : undefined;
}

export function resolvePlanItemPrice(itemPriceId: unknown): PlanPrice | undefined {
  const price = resolveItemPrice(itemPriceId);
  return price?.kind === "plan" ? price : undefined;
}

/** A paid invoice amount that is exactly one catalog pack in that currency (the checkout intent still decides the credits). */
export function catalogPackForAmount(amount: number, currency: string): PackPrice | undefined {
  return ALL_PRICES.find((price): price is PackPrice => price.kind === "pack" && price.amount === amount && price.currency === currency);
}

/** Every item price the kit sells, for availability probes: 22 plan terms, 8 packs and 4 sessions. */
export function sellableItemPrices(): CatalogPrice[] {
  return [...ALL_PRICES];
}

// ---- Auto-extend: opt-in renewal only where a renewal needs no extra authentication ----

export const AUTO_EXTEND_METHODS = ["upi_autopay", "card_netbanking_mandate", "usd_recurring"] as const;
export type AutoExtendMethod = (typeof AUTO_EXTEND_METHODS)[number];
/** Chargebee's default UPI AutoPay mandate maximum (it can only be lowered). */
export const UPI_AUTOPAY_MAX_PAISE = 500_000;
/** RBI limit for card and netbanking e-mandate debits without extra authentication. */
export const EMANDATE_MAX_PAISE = 1_500_000;

/**
 * How a pass may renew itself at the same price, or [] for one-time only.
 * Concierge and Land 90-day passes never auto-renew (reminders and one-tap
 * re-buy instead). INR follows the mandate limits; USD stays one-time until
 * PayPal reference transactions or a card route are confirmed (the server's
 * single capability flag, server/billingSettings.ts).
 */
export function autoExtendMethods(planId: CatalogPlanId, interval: CatalogInterval, currency: CatalogCurrency, usdRecurringConfirmed: boolean): AutoExtendMethod[] {
  const plan = catalogPlanById(planId);
  const amount = plan?.prices[interval]?.[currency];
  if (!plan || amount === undefined || plan.byApplication) return [];
  if (plan.tier === "land" && interval === "90d") return [];
  if (currency === "USD") return usdRecurringConfirmed ? ["usd_recurring"] : [];
  const methods: AutoExtendMethod[] = [];
  if (amount <= UPI_AUTOPAY_MAX_PAISE) methods.push("upi_autopay");
  if (amount <= EMANDATE_MAX_PAISE) methods.push("card_netbanking_mandate");
  return methods;
}

// ---- Plan changes ----

/** "Momentum", "Land Sprint", "Free" (a retired or unknown id reads as "Free"). */
export function billingPlanLabel(plan: string): string {
  return planEntitlementsFor(plan).planLabel;
}

/** Entitlement strength: tier first, then the Land level. */
function strength(plan: BillablePlanId): number {
  const entitlements = planEntitlementsFor(plan);
  return tierRank(entitlements.tier) * 10 + entitlements.level;
}

const INTERVAL_RANK: Readonly<Record<BillingPeriod, number>> = { monthly: 0, "30d": 0, "90d": 1, yearly: 2 };

export type PlanChangeDirection = "upgrade" | "downgrade" | "none";
export type PlanTerm = { plan: BillablePlanId; interval: BillingPeriod; amount: number };

/**
 * How a change of an existing subscription moves. A stronger plan, or a longer
 * term of the same plan, upgrades now (prorated, paid on a hosted checkout). A
 * weaker plan or a shorter term switches at term end, so nothing paid for is
 * cut short.
 */
export function planChangeDirection(from: PlanTerm, to: PlanTerm): PlanChangeDirection {
  if (from.plan === to.plan && from.interval === to.interval) return "none";
  const delta = strength(to.plan) - strength(from.plan);
  if (delta !== 0) return delta > 0 ? "upgrade" : "downgrade";
  const longer = INTERVAL_RANK[to.interval] - INTERVAL_RANK[from.interval];
  if (longer !== 0) return longer > 0 ? "upgrade" : "downgrade";
  return to.amount > from.amount ? "upgrade" : "downgrade";
}

/** The self-serve ladder: Keep warm, Start, Momentum, Land Focus, Land Sprint. Concierge is by application. */
const LADDER: readonly CatalogPlanId[] = CATALOG_PLANS.filter(plan => !plan.byApplication).map(plan => plan.id);

/** The next plan up and down for the billing action grid; none for Free or a plan outside the ladder. */
export function adjacentPlans(plan: string): { up: CatalogPlanId | null; down: CatalogPlanId | null } {
  const index = isCatalogPlanId(plan) ? LADDER.indexOf(plan) : -1;
  if (index < 0) return { up: null, down: null };
  return { up: LADDER[index + 1] ?? null, down: LADDER[index - 1] ?? null };
}

// ---- GET /api/plans/catalog: the caller's region, prices and what can be bought now ----

const amount = z.number().int().nonnegative();
const carryoverSchema = z.union([z.literal(0), z.literal(1), z.literal(3), z.literal("subscribed")]);
const humanTimeSchema = z.strictObject({ writtenReviews: z.number().int().min(0), liveSessions: z.number().int().min(0), hours: z.number().int().min(0) });

export const planCatalogResponseSchema = z.strictObject({
  region: z.enum(BILLING_REGIONS),
  currency: z.enum(BILLING_CURRENCIES),
  /** "India price" for INR (adds ", incl. GST" only once GST-registered); null for USD. */
  priceNote: z.string().min(1).nullable(),
  free: z.strictObject({
    openRequests: z.number().int().positive(),
    creditsPerMonth: z.number().int().min(0),
    /** Present only while the reverse trial is on offer (REVERSE_TRIAL_ON_OFFER); absent until its trigger ships (D-051). */
    trial: z.strictObject({ plan: z.enum(CATALOG_PLAN_IDS), planLabel: z.string().min(1), days: z.number().int().positive(), openRequests: z.number().int().positive(), credits: z.number().int().min(0) }).optional(),
  }),
  plans: z.array(z.strictObject({
    id: z.enum(CATALOG_PLAN_IDS),
    tier: z.enum(["keep_warm", "start", "momentum", "land"]),
    level: z.number().int().min(1),
    label: z.string().min(1),
    levelLabel: z.string().nullable(),
    displayName: z.string().min(1),
    openRequests: z.number().int().positive(),
    creditsPerMonth: z.number().int().nonnegative(),
    carryover: carryoverSchema,
    humanTime: humanTimeSchema,
    /** The plan's included human time can be delivered now; false reads as "coming later" (D-041). */
    humanTimeOffered: z.boolean(),
    byApplication: z.boolean(),
    recommended: z.boolean(),
    terms: z.array(z.strictObject({
      interval: z.enum(BILLING_INTERVALS),
      /** 30 or 90 for passes; null for a yearly term. */
      days: z.number().int().positive().nullable(),
      amount,
      /** Sold now: the item price is live at this amount, and the plan is self-serve. */
      available: z.boolean(),
      /** Opt-in renewal methods at checkout; empty means paid once only. */
      autoExtend: z.array(z.enum(AUTO_EXTEND_METHODS)),
    })).min(1),
  })),
  packs: z.array(z.strictObject({ id: z.enum(CATALOG_PACK_IDS), credits: z.number().int().positive(), amount, available: z.boolean(), firstPack: z.boolean(), recommended: z.boolean() })),
  sessions: z.array(z.strictObject({ id: z.enum(HUMAN_SESSION_IDS), label: z.string().min(1), detail: z.string().min(1), amount, available: z.boolean() })),
  creditCosts: z.array(z.strictObject({ id: z.enum(CREDIT_TOOL_IDS), label: z.string().min(1), credits: z.number().int().positive() })),
  fairness: z.strictObject({ maxOpenAsksPerCompany: z.number().int().positive(), planVisibleToReferrers: z.literal(false) }),
});
export type PlanCatalogResponse = z.infer<typeof planCatalogResponseSchema>;

export type CatalogResponseInput = {
  region: BillingRegion;
  /** True when the item price is live on the billing site at the catalog amount. */
  available: (itemPriceId: string) => boolean;
  usdRecurringConfirmed: boolean;
  /** An admin has marked human reviewers available; until then sessions are not sold. */
  sessionsStaffed: boolean;
  /** GSTIN exists and Chargebee tax mode is on; off by default (D-007, Indian MSME not GST-registered). */
  indiaGstRegistered: boolean;
};

function planEntry(plan: PaidCatalogPlan, input: CatalogResponseInput, currency: CatalogCurrency) {
  const id = plan.id;
  const hasHumanTime = plan.humanTime.writtenReviews > 0 || plan.humanTime.liveSessions > 0 || plan.humanTime.hours > 0;
  return [{
    id,
    tier: plan.tier,
    level: plan.level,
    label: plan.label,
    levelLabel: plan.levelLabel,
    displayName: planDisplayName(plan),
    openRequests: plan.openRequests,
    creditsPerMonth: plan.creditsPerMonth,
    carryover: plan.carryover,
    humanTime: { ...plan.humanTime },
    // Concierge is delivered through its application path; Focus/Sprint need staffed reviewers (D-041).
    humanTimeOffered: !hasHumanTime || plan.byApplication || input.sessionsStaffed,
    byApplication: plan.byApplication,
    recommended: plan.recommended,
    terms: planIntervals(plan).flatMap(interval => {
      const price = planPrice(id, interval, currency);
      if (!price) return [];
      return [{
        interval,
        days: interval === "yearly" ? null : PASS_DAYS[interval],
        amount: price.amount,
        // D-084: no pass or Keep warm term sells until a paid pass can always be activated (GO-LIVE-1b).
        available: PASS_SALES_ENABLED && !plan.byApplication && input.available(price.itemPriceId),
        autoExtend: autoExtendMethods(id, interval, currency, input.usdRecurringConfirmed),
      }];
    }),
  }];
}

/** Builds the catalog payload for one region from the price book and the server's availability answers. */
export function planCatalogResponse(input: CatalogResponseInput): PlanCatalogResponse {
  const currency = currencyForRegion(input.region);
  const trialPlan = catalogPlanById(REVERSE_TRIAL.plan);
  return planCatalogResponseSchema.parse({
    region: input.region,
    currency,
    priceNote: currency === "INR" ? indiaPriceNote(input.indiaGstRegistered) : null,
    free: {
      openRequests: FREE_PLAN.openRequests,
      creditsPerMonth: FREE_PLAN.creditsPerMonth,
      // D-051: nothing grants the trial yet, so it is advertised only once it is on offer.
      ...(REVERSE_TRIAL_ON_OFFER ? { trial: { plan: REVERSE_TRIAL.plan, planLabel: trialPlan ? planDisplayName(trialPlan) : REVERSE_TRIAL.plan, days: REVERSE_TRIAL.days, openRequests: trialPlan?.openRequests ?? FREE_PLAN.openRequests, credits: REVERSE_TRIAL.credits } } : {}),
    },
    plans: CATALOG_PLANS.flatMap(plan => planEntry(plan, input, currency)),
    packs: CREDIT_PACKS.flatMap(pack => {
      const price = packPrice(pack.id, currency);
      return price ? [{ id: pack.id, credits: pack.credits, amount: price.amount, available: input.available(price.itemPriceId), firstPack: pack.firstPack, recommended: pack.recommended }] : [];
    }),
    sessions: HUMAN_SESSIONS.flatMap(session => {
      const price = sessionPrice(session.id, currency);
      return price ? [{ id: session.id, label: session.label, detail: session.detail, amount: price.amount, available: input.sessionsStaffed && input.available(price.itemPriceId) }] : [];
    }),
    creditCosts: CREDIT_TOOLS.map(tool => ({ ...tool })),
    fairness: { maxOpenAsksPerCompany: MAX_OPEN_ASKS_PER_COMPANY, planVisibleToReferrers: false },
  });
}
