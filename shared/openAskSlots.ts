/**
 * Open-ask slots (kit /requests meter, the slots-full nudge, the ask-time cap).
 * An ask holds a slot while it is pending and unexpired; it frees the slot when
 * it is answered (accepted or passed), withdrawn, or expires unclaimed
 * (shared/referral.ts isAskExpired). The cap is the plan entitlement's
 * openRequests; null means unlimited (Land Concierge).
 */
import { z } from "zod";
import { CATALOG_PLANS, CATALOG_PLAN_IDS, planDisplayName, tierRank, type CatalogTier } from "./planCatalog";
import { ENTITLED_PLAN_IDS, type PlanEntitlements } from "./planEntitlements";

export const SLOT_CAP_REACHED = "slot_cap_reached" as const;

export const nextSlotPlanSchema = z.object({
  id: z.enum(CATALOG_PLAN_IDS),
  label: z.string().min(1),
  /** null means unlimited. */
  openRequests: z.number().int().positive().nullable(),
});
export type NextSlotPlan = z.infer<typeof nextSlotPlanSchema>;

export const openAskSlotsSchema = z.object({
  plan: z.enum(ENTITLED_PLAN_IDS),
  planLabel: z.string().min(1),
  /** The caller's own pending, unexpired asks. */
  open: z.number().int().min(0),
  /** null means unlimited. */
  cap: z.number().int().positive().nullable(),
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
 * UPGRADE_NUDGES "Slot cap reached: See Momentum". The nudge names the first
 * catalog plan from Momentum up whose cap is larger than the caller's, so the
 * number it quotes always comes from the catalog. Changeable owner decision.
 */
export const SLOT_NUDGE_FLOOR_TIER: CatalogTier = "momentum";

export function nextSlotPlan(entitlements: PlanEntitlements): NextSlotPlan | null {
  const cap = entitlements.openRequests;
  if (cap === null) return null;
  const floor = Math.max(tierRank(SLOT_NUDGE_FLOOR_TIER), tierRank(entitlements.tier));
  for (const plan of CATALOG_PLANS) {
    if (plan.id === "free" || tierRank(plan.tier) < floor) continue;
    if (plan.openRequests === null || plan.openRequests > cap) return { id: plan.id, label: planDisplayName(plan), openRequests: plan.openRequests };
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
    full: cap !== null && used >= cap,
    nextPlan: nextSlotPlan(entitlements),
  };
}

function joinOptions(options: readonly string[]): string {
  if (options.length <= 1) return options.join("");
  if (options.length === 2) return `${options[0]} or ${options[1]}`;
  return `${options.slice(0, -1).join(", ")}, or ${options[options.length - 1]}`;
}

const capText = (openRequests: number | null) => (openRequests === null ? "unlimited" : String(openRequests));

/**
 * Kit /requests sentence: "All 3 slots are in use. Wait for an answer, withdraw
 * an ask, or get more slots with Momentum (15)." Only options that exist are named.
 */
export function slotsFullCopy(slots: OpenAskSlots, canWithdraw: boolean): { lead: string; next: string } {
  const lead = `All ${slots.cap ?? slots.open} slots are in use.`;
  const more = slots.nextPlan ? `get more slots with ${slots.nextPlan.label} (${capText(slots.nextPlan.openRequests)})` : null;
  const options = ["Wait for an answer", ...(canWithdraw ? ["withdraw an ask"] : []), ...(more ? [more] : [])];
  return { lead, next: `${joinOptions(options)}.` };
}

/**
 * UPGRADE_NUDGES #1 at the moment a send hits the cap (kit /plans "Upgrade
 * moments" copy). Paying never changes queue position, and the copy says so.
 */
export function slotCapNudgeCopy(slots: OpenAskSlots): { title: string; body: string; cta: string | null } {
  const title = `Your ${slots.cap ?? slots.open} requests are all open`;
  if (!slots.nextPlan) return { title, body: "Wait for an answer to free a slot. Queue position stays equal either way.", cta: null };
  const room = `${capText(slots.nextPlan.openRequests)} open requests`;
  return { title, body: `Wait for an answer to free a slot, or move to ${slots.nextPlan.label} for ${room}. Queue position stays equal either way.`, cta: `See ${slots.nextPlan.label}` };
}
