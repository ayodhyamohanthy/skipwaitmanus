/**
 * Open-ask slots (kit /requests meter, the slots-full nudge, the ask-time cap).
 * An ask holds a slot while it is pending and unexpired; it frees the slot when
 * it is answered (accepted or passed), withdrawn, or expires unclaimed
 * (shared/referral.ts isAskExpired). The cap is the plan entitlement's
 * openRequests (every plan has one; Land Concierge holds 75). On every plan a
 * seeker also holds at most MAX_OPEN_ASKS_PER_COMPANY open asks at one company.
 */
import { z } from "zod";
import { CATALOG_PLANS, CATALOG_PLAN_IDS, MAX_OPEN_ASKS_PER_COMPANY, planDisplayName, tierRank, type CatalogTier } from "./planCatalog";
import { ENTITLED_PLAN_IDS, type PlanEntitlements } from "./planEntitlements";

export const SLOT_CAP_REACHED = "slot_cap_reached" as const;

export const nextSlotPlanSchema = z.object({
  id: z.enum(CATALOG_PLAN_IDS),
  label: z.string().min(1),
  openRequests: z.number().int().positive(),
});
export type NextSlotPlan = z.infer<typeof nextSlotPlanSchema>;

export const openAskSlotsSchema = z.object({
  plan: z.enum(ENTITLED_PLAN_IDS),
  planLabel: z.string().min(1),
  /** The caller's own pending, unexpired asks. */
  open: z.number().int().min(0),
  cap: z.number().int().positive(),
  full: z.boolean(),
  nextPlan: nextSlotPlanSchema.nullable(),
});
export type OpenAskSlots = z.infer<typeof openAskSlotsSchema>;

/** POST /api/company-referrals (and an assistant-approved ask) at the cap: 409 with this body. */
export const slotCapReachedSchema = z.object({
  error: z.string().min(1),
  code: z.literal(SLOT_CAP_REACHED),
  slots: openAskSlotsSchema,
});
export type SlotCapReached = z.infer<typeof slotCapReachedSchema>;

/**
 * UPGRADE_NUDGES "Slot cap reached: See Start" (docs/PRICING_RECOMMENDATION.md
 * section 5: the cheapest fix first). The nudge names the first self-serve
 * catalog plan from Start up whose cap is larger than the caller's, so the
 * number it quotes always comes from the catalog. Concierge is by application,
 * so no nudge points at it. Changeable owner decision.
 */
export const SLOT_NUDGE_FLOOR_TIER: CatalogTier = "start";

/**
 * Catalog plans a person can actually buy today. The nudge only ever names a
 * plan on this list, so it never points at a pass /plans does not sell yet
 * (until the pass item prices exist /plans sells no plan). Add an id
 * here in the same change that puts that plan on sale; empty means the nudge
 * names no plan and shows no CTA.
 */
export const SLOT_NUDGE_SELLABLE_PLAN_IDS: readonly string[] = [];

export function nextSlotPlan(entitlements: PlanEntitlements): NextSlotPlan | null {
  return nextSlotPlanAmong(entitlements, SLOT_NUDGE_SELLABLE_PLAN_IDS);
}

/** The catalog walk behind nextSlotPlan, over an explicit set of sellable plan ids. */
export function nextSlotPlanAmong(entitlements: PlanEntitlements, sellable: readonly string[]): NextSlotPlan | null {
  const cap = entitlements.openRequests;
  const floor = Math.max(tierRank(SLOT_NUDGE_FLOOR_TIER), tierRank(entitlements.tier));
  for (const plan of CATALOG_PLANS) {
    if (plan.byApplication || tierRank(plan.tier) < floor) continue;
    if (!sellable.includes(plan.id)) continue;
    if (plan.openRequests > cap) return { id: plan.id, label: planDisplayName(plan), openRequests: plan.openRequests };
  }
  return null;
}

export function openAskSlots(entitlements: PlanEntitlements, open: number): OpenAskSlots {
  const used = Math.max(0, Math.floor(open));
  const cap = entitlements.openRequests;
  return {
    plan: entitlements.plan,
    planLabel: entitlements.planLabel,
    open: used,
    cap,
    full: used >= cap,
    nextPlan: nextSlotPlan(entitlements),
  };
}

function joinOptions(options: readonly string[]): string {
  if (options.length <= 1) return options.join("");
  if (options.length === 2) return `${options[0]} or ${options[1]}`;
  return `${options.slice(0, -1).join(", ")}, or ${options[options.length - 1]}`;
}

/**
 * Kit /requests sentence: "All 3 slots are in use. Wait for an answer, withdraw
 * an ask, or get more slots with Momentum (15)." Only options that exist are named.
 */
export function slotsFullCopy(slots: OpenAskSlots, canWithdraw: boolean): { lead: string; next: string } {
  const lead = `All ${slots.cap} slots are in use.`;
  const more = slots.nextPlan ? `get more slots with ${slots.nextPlan.label} (${slots.nextPlan.openRequests})` : null;
  const options = ["Wait for an answer", ...(canWithdraw ? ["withdraw an ask"] : []), ...(more ? [more] : [])];
  return { lead, next: `${joinOptions(options)}.` };
}

/**
 * UPGRADE_NUDGES #1 at the moment a send hits the cap (kit /plans "Upgrade
 * moments" copy). Paying never changes queue position, and the copy says so.
 */
export function slotCapNudgeCopy(slots: OpenAskSlots): { title: string; body: string; cta: string | null } {
  const title = `Your ${slots.cap} requests are all open`;
  if (!slots.nextPlan) return { title, body: "Wait for an answer to free a slot. Queue position stays equal either way.", cta: null };
  const room = `${slots.nextPlan.openRequests} open requests`;
  return { title, body: `Wait for an answer to free a slot, or move to ${slots.nextPlan.label} for ${room}. Queue position stays equal either way.`, cta: `See ${slots.nextPlan.label}` };
}

// ---- Per-company fairness cap (every plan, docs/PRICING_RECOMMENDATION.md section 4) ----

export const COMPANY_CAP_REACHED = "company_cap_reached" as const;

/**
 * POST /api/company-referrals when the seeker composed under a known-uncovered
 * "waits free, nothing spent" representation (expectedCoverage) but coverage
 * opened up by commit: 409, the ask was NOT created and nothing was charged.
 * The client re-prices and the seeker sends again seeing the covered cost.
 */
export const COMPANY_COVERAGE_CHANGED = "company_coverage_changed" as const;

/**
 * POST /api/company-referrals when the commit-time cost no longer equals the
 * price the seeker accepted (flag or classification moved mid-send): 409, the
 * ask was NOT created and nothing was charged. Same re-confirm flow as
 * COMPANY_COVERAGE_CHANGED.
 */
export const ASK_PRICE_CHANGED = "ask_price_changed" as const;

/**
 * POST /api/company-referrals without a usable accepted price (missing or
 * malformed expectedCost): 400 before any work. Supported clients always send
 * the accepted price; a silent drop would bypass the accepted-price boundary.
 */
export const ASK_PRICE_UNCONFIRMED = "ask_price_unconfirmed" as const;

/** POST /api/company-referrals (and an assistant-approved ask) with 2 asks already open at that company: 409 with this body. */
export const companyCapReachedSchema = z.strictObject({
  error: z.string().min(1),
  code: z.literal(COMPANY_CAP_REACHED),
  companyDomain: z.string().min(1).max(255),
  /** The caller's own open asks at that company. */
  open: z.number().int().min(0),
  cap: z.literal(MAX_OPEN_ASKS_PER_COMPANY),
});
export type CompanyCapReached = z.infer<typeof companyCapReachedSchema>;

/** The same on every plan, and the copy says so: paying never buys more asks at one company. */
export function companyCapCopy(companyDomain: string): string {
  return `You already have ${MAX_OPEN_ASKS_PER_COMPANY} open asks at ${companyDomain}. Wait for an answer or withdraw one before asking there again. This limit is the same on every plan.`;
}
