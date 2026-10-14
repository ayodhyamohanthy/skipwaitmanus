/**
 * Kit v4 plan entitlements: one pure resolver from a seeker wallet's
 * subscription state to what the plan includes (PRICING.md, the 19_plans
 * compare table, UPGRADE_NUDGES.md). Server gates (open-ask slots, assistants,
 * saved alerts, work showcase) and client meters read the same answer.
 *
 * A paid plan counts only while its subscription is active or non-renewing and
 * inside its current term: the rule the wallet normalizer applies in
 * server/db.ts (normalizedWalletState), so a lapsed plan reads as Free.
 *
 * Legacy Pro and Max subscribers are grandfathered (owner decision, Oct 9 2026):
 * they keep their Pro/Max label and billing, receive at least the entitlements
 * of Start (Pro) / Momentum (Max), never fewer open asks than the monthly
 * requests they pay for, never fewer showcase pieces than the pre-kit cap, and
 * Max keeps assistant access.
 */
import { z } from "zod";
import { FREE_ALERT_LIMIT } from "./alerts";
import { CATALOG_PLANS, CATALOG_PLAN_IDS, FREE_PLAN, LEGACY_PLAN_MAP, planDisplayName, tierAtLeast, type CatalogPlan, type CatalogTier } from "./planCatalog";
import { SUBSCRIPTION_PLANS, type PaidSubscriptionPlan } from "./subscriptionPlans";

export const ENTITLED_PLAN_IDS = ["free", ...CATALOG_PLAN_IDS, "pro", "max"] as const;
export type EntitledPlanId = (typeof ENTITLED_PLAN_IDS)[number];

export const CATALOG_TIERS = ["free", "start", "momentum", "land"] as const satisfies readonly CatalogTier[];

/** Compare-table rows "Preparation tools", "Uploads and memory", "Role and company research". */
export const PREPARATION_LEVELS = ["limited", "expanded", "advanced", "maximum"] as const;
export const UPLOAD_LEVELS = ["limited", "expanded", "more", "highest"] as const;
export const RESEARCH_LEVELS = ["basic", "advanced", "maximum"] as const;

/** Signature tools (PRICING.md; 19_plans "Use credits, or get them included from the plan shown"). Anyone may still use one for credits. */
export const SIGNATURE_TOOL_IDS = ["onepager", "salary", "review", "dossier", "offer", "pack"] as const;
export type SignatureToolId = (typeof SIGNATURE_TOOL_IDS)[number];
export const SIGNATURE_TOOL_INCLUDED_FROM: Readonly<Record<SignatureToolId, Exclude<CatalogTier, "free">>> = {
  onepager: "start",
  salary: "momentum",
  review: "land",
  dossier: "momentum",
  offer: "momentum",
  pack: "start",
};

/** Abuse ceiling behind an "unlimited" showcase. Never shown as a plan number. */
export const SHOWCASE_HARD_CAP = 200;
/** The showcase cap every account had before the kit tiers; grandfathered Pro/Max never drop below it. */
export const LEGACY_SHOWCASE_PIECES = 20;

export const planEntitlementsSchema = z.object({
  plan: z.enum(ENTITLED_PLAN_IDS),
  planLabel: z.string().min(1),
  tier: z.enum(CATALOG_TIERS),
  level: z.number().int().min(1),
  legacy: z.boolean(),
  /** Concurrent open asks; null means unlimited. */
  openRequests: z.number().int().positive().nullable(),
  creditsPerMonth: z.number().int().min(0),
  carryover: z.union([z.literal(0), z.literal(1), z.literal(3), z.literal("subscribed")]),
  /** Saved company alerts; null means unlimited. */
  savedAlerts: z.number().int().positive().nullable(),
  /** Showcase pieces (null = unlimited, up to SHOWCASE_HARD_CAP) and pieces pinned to requests. */
  showcase: z.object({ pieces: z.number().int().positive().nullable(), pins: z.number().int().min(0) }),
  customLink: z.boolean(),
  privateInsights: z.boolean(),
  guidedWorkflows: z.boolean(),
  assistants: z.boolean(),
  tools: z.object({
    preparation: z.enum(PREPARATION_LEVELS),
    uploads: z.enum(UPLOAD_LEVELS),
    research: z.enum(RESEARCH_LEVELS),
    included: z.array(z.enum(SIGNATURE_TOOL_IDS)),
  }),
}).strict();
export type PlanEntitlements = z.infer<typeof planEntitlementsSchema>;

type TierLimits = Pick<PlanEntitlements, "savedAlerts" | "showcase" | "customLink" | "privateInsights" | "guidedWorkflows" | "assistants"> & Omit<PlanEntitlements["tools"], "included">;

/** The 19_plans compare table, per tier. Saved alerts follow the live rule: Free keeps 3, every paid plan is unlimited. */
const TIER_LIMITS: Readonly<Record<CatalogTier, TierLimits>> = {
  free: { savedAlerts: FREE_ALERT_LIMIT, showcase: { pieces: 3, pins: 1 }, customLink: false, privateInsights: false, guidedWorkflows: false, assistants: false, preparation: "limited", uploads: "limited", research: "basic" },
  start: { savedAlerts: null, showcase: { pieces: 10, pins: 3 }, customLink: false, privateInsights: false, guidedWorkflows: false, assistants: false, preparation: "expanded", uploads: "expanded", research: "basic" },
  momentum: { savedAlerts: null, showcase: { pieces: null, pins: 6 }, customLink: true, privateInsights: true, guidedWorkflows: false, assistants: false, preparation: "advanced", uploads: "more", research: "advanced" },
  land: { savedAlerts: null, showcase: { pieces: null, pins: 6 }, customLink: true, privateInsights: true, guidedWorkflows: true, assistants: true, preparation: "maximum", uploads: "highest", research: "maximum" },
};

export function includedSignatureTools(tier: CatalogTier): SignatureToolId[] {
  return SIGNATURE_TOOL_IDS.filter(tool => tierAtLeast(tier, SIGNATURE_TOOL_INCLUDED_FROM[tool]));
}

/** The wallet fields that decide a plan. Matches tokenBalances' job_seeker row. */
export type EntitlementWallet = {
  plan: string;
  subscriptionStatus: string | null;
  subscriptionCurrentTermEnd: Date | null;
};

/** True while a paid plan is billing: active or non-renewing, inside the current term (JS clock, never DB NOW()). */
export function isPaidPlanActive(wallet: EntitlementWallet, now: Date = new Date()): boolean {
  if (wallet.plan === "free") return false;
  if (wallet.subscriptionStatus !== "active" && wallet.subscriptionStatus !== "non_renewing") return false;
  return wallet.subscriptionCurrentTermEnd !== null && wallet.subscriptionCurrentTermEnd.getTime() > now.getTime();
}

function fromCatalog(plan: CatalogPlan): PlanEntitlements {
  const { preparation, uploads, research, ...limits } = TIER_LIMITS[plan.tier];
  return {
    plan: plan.id,
    planLabel: planDisplayName(plan),
    tier: plan.tier,
    level: plan.level,
    legacy: false,
    openRequests: plan.openRequests,
    creditsPerMonth: plan.creditsPerMonth,
    carryover: plan.carryover,
    ...limits,
    showcase: { ...limits.showcase },
    tools: { preparation, uploads, research, included: includedSignatureTools(plan.tier) },
  };
}

const atLeast = (limit: number | null, floor: number): number | null => (limit === null ? null : Math.max(limit, floor));

/** Grandfathering: the mapped tier, but never below what the legacy plan gives today. */
function fromLegacy(plan: PaidSubscriptionPlan): PlanEntitlements {
  const sold = SUBSCRIPTION_PLANS[plan];
  const mapped = CATALOG_PLANS.find(candidate => candidate.id === LEGACY_PLAN_MAP[plan]);
  const base = fromCatalog(mapped ?? FREE_PLAN);
  return {
    ...base,
    plan,
    planLabel: sold.label,
    legacy: true,
    openRequests: atLeast(base.openRequests, sold.monthlyAllowance),
    creditsPerMonth: Math.max(base.creditsPerMonth, sold.monthlyAllowance),
    showcase: { pieces: atLeast(base.showcase.pieces, LEGACY_SHOWCASE_PIECES), pins: base.showcase.pins },
    // Connecting an assistant is part of what Max sells today, so Max keeps it.
    assistants: base.assistants || plan === "max",
  };
}

export function resolvePlanEntitlements(wallet: EntitlementWallet | null | undefined, now: Date = new Date()): PlanEntitlements {
  if (!wallet || !isPaidPlanActive(wallet, now)) return fromCatalog(FREE_PLAN);
  if (wallet.plan === "pro" || wallet.plan === "max") return fromLegacy(wallet.plan);
  const catalog = CATALOG_PLANS.find(candidate => candidate.id === wallet.plan);
  return fromCatalog(catalog ?? FREE_PLAN);
}
