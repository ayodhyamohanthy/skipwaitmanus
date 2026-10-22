/**
 * Plan entitlements: one pure resolver from a seeker wallet to what the plan
 * in force includes (shared/planCatalog.ts, the Oct 14 2026 pricing decision,
 * the 19_plans compare table). Server gates (open-ask slots, assistants, saved
 * alerts, work showcase) and client meters read the same answer.
 *
 * A paid plan or pass counts only while its subscription is active or
 * non-renewing and inside its current term: the rule the wallet normalizer
 * applies in server/db.ts (normalizedWalletState). A pass ends cleanly: the
 * plan reads as Free once the term is over, open asks stay live until they are
 * answered or expire, and only new asks meet the Free cap.
 *
 * The one-time 14-day Momentum reverse trial lifts open asks to Momentum's 15
 * while it runs (trial credits are a ledger grant, not a plan cycle). It never
 * lowers what a paid plan gives.
 *
 * Only the Free plan and the kit catalog plans entitle anything. Any other
 * stored plan id reads as Free with no grandfathering: the retired monthly Pro
 * and Max plans (D-067, owner, Oct 18 2026: "Pro/Max are removed completely";
 * the Oct 9 grandfathering is withdrawn) and the reserved pre-decision Land ids.
 */
import { z } from "zod";
import { FREE_ALERT_LIMIT } from "./alerts";
import { CATALOG_PLANS, CATALOG_PLAN_IDS, FREE_PLAN, REVERSE_TRIAL, catalogPlanById, planDisplayName, tierAtLeast, type CatalogPlan, type CatalogTier } from "./planCatalog";
import { PLAN_FAMILY_IDS, planBenefitCaps, planFamilyEntry, type PlanFamilyId } from "./planFamily";

export const ENTITLED_PLAN_IDS = ["free", ...CATALOG_PLAN_IDS, "fast_track", "insider"] as const;
export type EntitledPlanId = (typeof ENTITLED_PLAN_IDS)[number];

export const CATALOG_TIERS = ["free", "keep_warm", "start", "momentum", "land"] as const satisfies readonly CatalogTier[];

/** Compare-table rows "Preparation tools", "Uploads and memory", "Role and company research". */
export const PREPARATION_LEVELS = ["limited", "expanded", "advanced", "maximum"] as const;
export const UPLOAD_LEVELS = ["limited", "expanded", "more", "highest"] as const;
export const RESEARCH_LEVELS = ["basic", "advanced", "maximum"] as const;

/**
 * Signature tools ("Use credits, or get them included from the plan shown").
 * Anyone may still use one for credits. Human expert review left this list on
 * Oct 14 2026: it is a separately priced session, never a credit tool.
 */
export const SIGNATURE_TOOL_IDS = ["onepager", "salary", "dossier", "offer", "pack"] as const;
export type SignatureToolId = (typeof SIGNATURE_TOOL_IDS)[number];
export const SIGNATURE_TOOL_INCLUDED_FROM: Readonly<Record<SignatureToolId, Exclude<CatalogTier, "free" | "keep_warm">>> = {
  onepager: "start",
  salary: "momentum",
  dossier: "momentum",
  offer: "momentum",
  pack: "start",
};

/** Abuse ceiling behind an "unlimited" showcase. Never shown as a plan number. */
export const SHOWCASE_HARD_CAP = 200;

const isoTimestamp = z.iso.datetime();

export const planEntitlementsSchema = z.object({
  plan: z.enum(ENTITLED_PLAN_IDS),
  planLabel: z.string().min(1),
  tier: z.enum(CATALOG_TIERS),
  level: z.number().int().min(1),
  /** Always false since D-067 removed the grandfathered Pro/Max; kept so a cached client still parses the payload. */
  legacy: z.boolean(),
  /** Open asks held at once. Every plan has a number (Concierge 75). */
  openRequests: z.number().int().positive(),
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
  /** Human time included in each 30-day cycle (Land). */
  humanTime: z.object({ writtenReviews: z.number().int().min(0), liveSessions: z.number().int().min(0), hours: z.number().int().min(0) }),
  /** End of the paid term or pass in force; null on Free (and for planEntitlementsFor). */
  paidThrough: isoTimestamp.nullable(),
  /** End of the running reverse trial; null when no trial is running. */
  trialEndsAt: isoTimestamp.nullable(),
}).strict();
export type PlanEntitlements = z.infer<typeof planEntitlementsSchema>;

type TierLimits = Pick<PlanEntitlements, "savedAlerts" | "showcase" | "customLink" | "privateInsights" | "guidedWorkflows" | "assistants"> & Omit<PlanEntitlements["tools"], "included">;

/**
 * The 19_plans compare table, per tier. Saved alerts follow the live rule: Free
 * keeps 3, every paid plan is unlimited. Keep warm (yearly, for people not yet
 * searching) has Free's tools and showcase plus unlimited alerts.
 */
const TIER_LIMITS: Readonly<Record<CatalogTier, TierLimits>> = {
  free: { savedAlerts: FREE_ALERT_LIMIT, showcase: { pieces: 3, pins: 1 }, customLink: false, privateInsights: false, guidedWorkflows: false, assistants: false, preparation: "limited", uploads: "limited", research: "basic" },
  keep_warm: { savedAlerts: null, showcase: { pieces: 3, pins: 1 }, customLink: false, privateInsights: false, guidedWorkflows: false, assistants: false, preparation: "limited", uploads: "limited", research: "basic" },
  start: { savedAlerts: null, showcase: { pieces: 10, pins: 3 }, customLink: false, privateInsights: false, guidedWorkflows: false, assistants: false, preparation: "expanded", uploads: "expanded", research: "basic" },
  momentum: { savedAlerts: null, showcase: { pieces: null, pins: 6 }, customLink: true, privateInsights: true, guidedWorkflows: false, assistants: false, preparation: "advanced", uploads: "more", research: "advanced" },
  land: { savedAlerts: null, showcase: { pieces: null, pins: 6 }, customLink: true, privateInsights: true, guidedWorkflows: true, assistants: true, preparation: "maximum", uploads: "highest", research: "maximum" },
};

export function includedSignatureTools(tier: CatalogTier): SignatureToolId[] {
  return SIGNATURE_TOOL_IDS.filter(tool => tierAtLeast(tier, SIGNATURE_TOOL_INCLUDED_FROM[tool]));
}

/** The wallet fields that decide a plan. Matches tokenBalances' job_seeker row (trialEndsAt from 0091). */
export type EntitlementWallet = {
  plan: string;
  subscriptionStatus: string | null;
  subscriptionCurrentTermEnd: Date | null;
  trialEndsAt?: Date | null;
};

/** A catalog plan id: the only stored plans a subscription can still entitle (D-067). */
function isCatalogPlan(plan: string): boolean {
  return (CATALOG_PLAN_IDS as readonly string[]).includes(plan);
}

/**
 * A D-132 family plan id a subscription can bill (Open Door is free: it never
 * sits on a wallet as a paid plan). A wallet carrying one is a real paying
 * subscriber - never grandfathered-away like the retired Pro/Max ids - so it
 * follows the same active/lapse rules as a catalog plan.
 */
export function isPlanFamilyPaidPlan(plan: string): plan is Exclude<PlanFamilyId, "open_door"> {
  return (PLAN_FAMILY_IDS as readonly string[]).includes(plan) && plan !== "open_door";
}

/**
 * True while a catalog plan or pass is billing: active or non-renewing, inside the current term (JS clock, never DB NOW()).
 * A stored plan outside the catalog (retired Pro/Max, reserved Land ids) is never active, whatever its status.
 */
export function isPaidPlanActive(wallet: Omit<EntitlementWallet, "trialEndsAt">, now: Date = new Date()): boolean {
  if (!isCatalogPlan(wallet.plan) && !isPlanFamilyPaidPlan(wallet.plan)) return false;
  if (wallet.subscriptionStatus !== "active" && wallet.subscriptionStatus !== "non_renewing") return false;
  return wallet.subscriptionCurrentTermEnd !== null && wallet.subscriptionCurrentTermEnd.getTime() > now.getTime();
}

/** True while the one-time reverse trial runs. */
export function isTrialActive(wallet: Pick<EntitlementWallet, "trialEndsAt"> | null | undefined, now: Date = new Date()): boolean {
  const end = wallet?.trialEndsAt;
  return end instanceof Date && end.getTime() > now.getTime();
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
    humanTime: { ...plan.humanTime },
    paidThrough: null,
    trialEndsAt: null,
  };
}

/**
 * What a plan id includes, without the billing check: the credit ledger reads
 * the rules of the plan that granted a cycle's credits after that plan's term
 * has ended. Unknown ids, the retired Pro/Max (D-067) and the reserved
 * pre-decision Land ids read as Free.
 */
export function planEntitlementsFor(plan: string): PlanEntitlements {
  const catalog = CATALOG_PLANS.find(candidate => candidate.id === plan);
  return fromCatalog(catalog ?? FREE_PLAN);
}

const TRIAL_OPEN_REQUESTS = catalogPlanById(REVERSE_TRIAL.plan)?.openRequests ?? FREE_PLAN.openRequests;
const TRIAL_LABEL = `${planDisplayName(catalogPlanById(REVERSE_TRIAL.plan) ?? FREE_PLAN)} trial`;

/**
 * A D-132 family plan's entitlements (flag PLAN_FAMILY_V2). Catalog-tier
 * features stay at Free's level until the pricing build owns family metering
 * (D-115); what the family plan itself changes is here: its label, its
 * open-ask cap from the frozen growth table, and credits-per-month 0 because
 * family credits arrive per paid invoice, never from a monthly allowance.
 */
function fromFamilyPlan(id: Exclude<PlanFamilyId, "open_door">): PlanEntitlements {
  const free = fromCatalog(FREE_PLAN);
  return {
    ...free,
    plan: id,
    planLabel: planFamilyEntry(id).label,
    openRequests: planBenefitCaps(id).openAsks,
    creditsPerMonth: 0,
    // The live alerts rule: every paid plan is unlimited.
    savedAlerts: null,
  };
}

export function resolvePlanEntitlements(wallet: EntitlementWallet | null | undefined, now: Date = new Date(), opts?: { planFamilyV2?: boolean }): PlanEntitlements {
  const trialEnd = wallet && isTrialActive(wallet, now) ? wallet.trialEndsAt ?? null : null;
  const paid = wallet && isPaidPlanActive(wallet, now) && wallet.subscriptionCurrentTermEnd
    ? { ...(isPlanFamilyPaidPlan(wallet.plan) ? fromFamilyPlan(wallet.plan) : planEntitlementsFor(wallet.plan)), paidThrough: wallet.subscriptionCurrentTermEnd.toISOString() }
    : null;
  if (paid && paid.plan !== "free") {
    if (!trialEnd || paid.openRequests >= TRIAL_OPEN_REQUESTS) return paid;
    return { ...paid, openRequests: TRIAL_OPEN_REQUESTS, trialEndsAt: trialEnd.toISOString() };
  }
  // D-132 enable item 8: under PLAN_FAMILY_V2 the free tier reads "Open Door"
  // from the planFamily single source, never the legacy catalog label. The
  // reverse-trial label still wins while the trial runs.
  const free = fromCatalog(FREE_PLAN);
  const freeResolved = opts?.planFamilyV2 ? { ...free, planLabel: planFamilyEntry("open_door").label } : free;
  if (!trialEnd) return freeResolved;
  return { ...freeResolved, planLabel: TRIAL_LABEL, openRequests: TRIAL_OPEN_REQUESTS, trialEndsAt: trialEnd.toISOString() };
}
