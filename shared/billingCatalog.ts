/**
 * The billing view of the price book: which Chargebee item price means which
 * plan or credit pack, the amount the server charges for it, and how a plan
 * change moves (PRICING.md, shared/planCatalog.ts). Grandfathered Pro/Max keep
 * their monthly prices from shared/subscriptionPlans.ts. Pure; the server and
 * the client read the same answers.
 */
import { z } from "zod";
import { CATALOG_PACK_IDS, CATALOG_PLAN_IDS, CATALOG_PLANS, CREDIT_PACKS, catalogItemPriceId, catalogPackById, catalogPackItemPriceId, catalogPlanById, tierRank, type CatalogCurrency, type CatalogInterval, type CatalogPackId, type CatalogPlanId } from "./planCatalog";
import { planEntitlementsFor } from "./planEntitlements";
import { SUBSCRIPTION_PLANS } from "./subscriptionPlans";

export const BILLING_INTERVALS = ["monthly", "yearly"] as const satisfies readonly CatalogInterval[];
export const BILLING_CURRENCIES = ["USD", "INR"] as const satisfies readonly CatalogCurrency[];
export const LEGACY_PLAN_IDS = ["pro", "max"] as const;
/** Every plan a subscription can bill: the kit tiers plus grandfathered Pro/Max. */
export const BILLABLE_PLAN_IDS = [...CATALOG_PLAN_IDS, ...LEGACY_PLAN_IDS] as const;
export type BillablePlanId = (typeof BILLABLE_PLAN_IDS)[number];
/** tokenBalances.plan: existing values first and in order (a MySQL ENUM stores the index). */
export const WALLET_PLAN_IDS = ["free", ...LEGACY_PLAN_IDS, ...CATALOG_PLAN_IDS] as const;
export type WalletPlanId = (typeof WALLET_PLAN_IDS)[number];
/** subscriptionCheckoutIntents.plan, same ordering rule. */
export const INTENT_PLAN_IDS = [...LEGACY_PLAN_IDS, ...CATALOG_PLAN_IDS] as const;

export function isBillablePlanId(value: unknown): value is BillablePlanId {
  return typeof value === "string" && (BILLABLE_PLAN_IDS as readonly string[]).includes(value);
}

export function isCatalogPlanId(value: unknown): value is CatalogPlanId {
  return typeof value === "string" && (CATALOG_PLAN_IDS as readonly string[]).includes(value);
}

export type PlanPrice = { kind: "plan"; plan: BillablePlanId; interval: CatalogInterval; currency: CatalogCurrency; amount: number; itemPriceId: string; legacy: boolean };
export type PackPrice = { kind: "pack"; packId: CatalogPackId; credits: number; currency: CatalogCurrency; amount: number; itemPriceId: string };

/** The price the server charges for a plan term. Pro/Max are sold monthly only. */
export function planPrice(plan: BillablePlanId, interval: CatalogInterval, currency: CatalogCurrency): PlanPrice | undefined {
  if (plan === "pro" || plan === "max") {
    if (interval !== "monthly") return undefined;
    const price = SUBSCRIPTION_PLANS[plan].prices[currency];
    return { kind: "plan", plan, interval, currency, amount: price.amount, itemPriceId: price.itemPriceId, legacy: true };
  }
  const catalog = catalogPlanById(plan);
  if (!catalog || catalog.id === "free") return undefined;
  return { kind: "plan", plan, interval, currency, amount: catalog.prices[interval][currency], itemPriceId: catalogItemPriceId(plan, interval, currency), legacy: false };
}

export function packPrice(packId: CatalogPackId, currency: CatalogCurrency): PackPrice | undefined {
  const pack = catalogPackById(packId);
  if (!pack) return undefined;
  return { kind: "pack", packId: pack.id, credits: pack.credits, currency, amount: pack.prices[currency], itemPriceId: catalogPackItemPriceId(pack.id, currency) };
}

const ALL_PRICES: ReadonlyArray<PlanPrice | PackPrice> = [
  ...BILLABLE_PLAN_IDS.flatMap(plan => BILLING_INTERVALS.flatMap(interval => BILLING_CURRENCIES.map(currency => planPrice(plan, interval, currency)))),
  ...CATALOG_PACK_IDS.flatMap(packId => BILLING_CURRENCIES.map(currency => packPrice(packId, currency))),
].flatMap(price => (price ? [price] : []));
const ITEM_PRICES: ReadonlyMap<string, PlanPrice | PackPrice> = new Map(ALL_PRICES.map(price => [price.itemPriceId, price] as const));

/** What a Chargebee item price id sells, or undefined for an id outside the price book. */
export function resolveItemPrice(itemPriceId: unknown): PlanPrice | PackPrice | undefined {
  return typeof itemPriceId === "string" ? ITEM_PRICES.get(itemPriceId) : undefined;
}

export function resolvePlanItemPrice(itemPriceId: unknown): PlanPrice | undefined {
  const price = resolveItemPrice(itemPriceId);
  return price?.kind === "plan" ? price : undefined;
}

/** A paid invoice amount that is exactly one catalog pack (the checkout intent still decides the credits). */
export function catalogPackForAmount(amount: number, currency: string): PackPrice | undefined {
  return ALL_PRICES.find((price): price is PackPrice => price.kind === "pack" && price.amount === amount && price.currency === currency);
}

/** "Momentum", "Land Sprint", "Pro", "Free". */
export function billingPlanLabel(plan: string): string {
  return planEntitlementsFor(plan).planLabel;
}

/** Entitlement strength: tier first, then the Land level. Pro/Max rank as the tier they map to. */
function strength(plan: BillablePlanId): number {
  const entitlements = planEntitlementsFor(plan);
  return tierRank(entitlements.tier) * 10 + entitlements.level;
}

export type PlanChangeDirection = "upgrade" | "downgrade" | "none";
export type PlanTerm = { plan: BillablePlanId; interval: CatalogInterval; amount: number };

/**
 * How a change of an existing subscription moves. A stronger plan, or monthly to
 * yearly, upgrades now (prorated, paid on a hosted checkout). A weaker plan, or
 * yearly to monthly, switches at term end, so nothing paid for is cut short.
 * Pro/Max to the tier they map to: a higher price upgrades now, otherwise term end.
 */
export function planChangeDirection(from: PlanTerm, to: PlanTerm): PlanChangeDirection {
  if (from.plan === to.plan && from.interval === to.interval) return "none";
  const delta = strength(to.plan) - strength(from.plan);
  if (delta !== 0) return delta > 0 ? "upgrade" : "downgrade";
  if (from.interval !== to.interval) return to.interval === "yearly" ? "upgrade" : "downgrade";
  return to.amount > from.amount ? "upgrade" : "downgrade";
}

/** The kit ladder the billing actions walk: Start, Momentum, Land Focus, Sprint, Concierge. */
const LADDER: readonly CatalogPlanId[] = CATALOG_PLANS.map(plan => plan.id).filter(isCatalogPlanId);

/** The next plan up and down for the billing action grid; Pro sits at Start, Max at Momentum. */
export function adjacentPlans(plan: string): { up: CatalogPlanId | null; down: CatalogPlanId | null } {
  if (plan === "pro") return { up: "momentum", down: null };
  if (plan === "max") return { up: "land_100", down: "start" };
  const index = LADDER.indexOf(plan as CatalogPlanId);
  if (index < 0) return { up: null, down: null };
  return { up: LADDER[index + 1] ?? null, down: LADDER[index - 1] ?? null };
}

const priceSchema = z.object({ amount: z.number().int().nonnegative(), available: z.boolean() }).strict();
const priceByCurrencySchema = z.object({ USD: priceSchema, INR: priceSchema }).strict();

/** GET /api/plans/catalog: the price book with each price's live availability on the billing site. */
export const planCatalogResponseSchema = z.object({
  plans: z.array(z.object({
    id: z.enum(CATALOG_PLAN_IDS),
    tier: z.enum(["start", "momentum", "land"]),
    level: z.number().int().min(1),
    label: z.string().min(1),
    levelLabel: z.string().nullable(),
    creditsPerMonth: z.number().int().nonnegative(),
    openRequests: z.number().int().positive().nullable(),
    carryover: z.union([z.literal(0), z.literal(1), z.literal(3), z.literal("subscribed")]),
    prices: z.object({ monthly: priceByCurrencySchema, yearly: priceByCurrencySchema }).strict(),
  }).strict()),
  packs: z.array(z.object({ id: z.enum(CATALOG_PACK_IDS), credits: z.number().int().positive(), prices: priceByCurrencySchema }).strict()),
}).strict();
export type PlanCatalogResponse = z.infer<typeof planCatalogResponseSchema>;

/** Builds the catalog payload from the price book and an availability answer per item price id. */
export function planCatalogResponse(available: (itemPriceId: string) => boolean): PlanCatalogResponse {
  const price = (amount: number, itemPriceId: string) => ({ amount, available: available(itemPriceId) });
  return planCatalogResponseSchema.parse({
    plans: CATALOG_PLANS.flatMap(plan => (plan.id === "free" || plan.tier === "free" ? [] : [{
      id: plan.id,
      tier: plan.tier,
      level: plan.level,
      label: plan.label,
      levelLabel: plan.levelLabel,
      creditsPerMonth: plan.creditsPerMonth,
      openRequests: plan.openRequests,
      carryover: plan.carryover,
      prices: Object.fromEntries(BILLING_INTERVALS.map(interval => [interval, Object.fromEntries(BILLING_CURRENCIES.map(currency => [currency, price(plan.prices[interval][currency], catalogItemPriceId(plan.id, interval, currency))]))])),
    }])),
    packs: CREDIT_PACKS.map(pack => ({ id: pack.id, credits: pack.credits, prices: Object.fromEntries(BILLING_CURRENCIES.map(currency => [currency, price(pack.prices[currency], catalogPackItemPriceId(pack.id, currency))])) })),
  });
}

/** Every item price the kit sells, for availability probes: 20 plan prices and 8 pack prices. */
export function sellableItemPrices(): Array<PlanPrice | PackPrice> {
  return ALL_PRICES.filter(price => price.kind === "pack" || !price.legacy);
}
