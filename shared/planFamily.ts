/**
 * The D-115/D-128 seeker plan family: Open Door, Fast Track, Insider.
 * ONE config source for display names and prices (D-124's single-source rule).
 *
 * Amounts are minor units (cents / paise), monthly, no GST (D-007). The two
 * price books follow D-122: India only when profile AND payment method are
 * both India, otherwise global - never by IP alone.
 *
 * NOTHING here is live: the legacy catalog (shared/planCatalog.ts) stays the
 * only catalog until pricing go-live, which needs the owner's one-word "A"
 * plus QA and payment-reliability checks (D-115 bar). The flag
 * (PLAN_FAMILY_V2, default off) gates every future reader of this module.
 *
 * Credit allowances per plan are intentionally absent: the owner has locked
 * names and prices only (D-128); allowances land with the pricing build
 * (D-115/D-124), same module, before go-live.
 */

export const PLAN_FAMILY_IDS = ["open_door", "fast_track", "insider"] as const;
export type PlanFamilyId = (typeof PLAN_FAMILY_IDS)[number];

export type PlanFamilyEntry = {
  id: PlanFamilyId;
  /** Locked display name (D-128). */
  label: "Open Door" | "Fast Track" | "Insider";
  /** Monthly price, USD cents (global book). */
  monthlyUsdCents: number;
  /** Monthly price, INR paise (India book). */
  monthlyInrPaise: number;
  /**
   * Insider is automated-only: no human reviewer, no live session (main,
   * Oct 21). Open Door and Fast Track keep the normal flow.
   */
  automatedOnly: boolean;
  /** Features folded into the plan instead of billed separately. */
  includes: { stealth: boolean; reachUp: boolean };
};

export const PLAN_FAMILY: readonly PlanFamilyEntry[] = [
  { id: "open_door", label: "Open Door", monthlyUsdCents: 0, monthlyInrPaise: 0, automatedOnly: false, includes: { stealth: false, reachUp: false } },
  { id: "fast_track", label: "Fast Track", monthlyUsdCents: 999, monthlyInrPaise: 49900, automatedOnly: false, includes: { stealth: false, reachUp: true } },
  { id: "insider", label: "Insider", monthlyUsdCents: 5900, monthlyInrPaise: 129900, automatedOnly: true, includes: { stealth: true, reachUp: true } },
] as const;

/**
 * Benefit caps per plan, transcribed verbatim from the growth table (main,
 * Oct 21): open asks 3/4/6; ask coach 0/10/30; profile check 0/2/4; resume
 * tailoring 0/3/10; follow-up drafts 0/6/20; company brief 0/0/10; interview
 * dossier 0/0/4; mock interview 0/0/4; offer comparison 0/0/2; salary coach
 * 0/0/2. Stealth is included in Insider; reach-up in Fast Track and Insider.
 *
 * Past a cap, normal credits apply (PLAN_CAP_OVERAGE). The metering window and
 * enforcement are the pricing build's call (D-115); this module only owns the
 * numbers, from one config source. AI cost per tool call is logged
 * (server/aiCostLog.ts) so caps can be re-set from real cost before go-live.
 */
export const PLAN_BENEFIT_TOOL_IDS = [
  "ask_coach",
  "profile_check",
  "resume_tailoring",
  "follow_up_drafts",
  "company_brief",
  "interview_dossier",
  "mock_interview",
  "offer_comparison",
  "salary_coach",
] as const;
export type PlanBenefitToolId = (typeof PLAN_BENEFIT_TOOL_IDS)[number];

export type PlanBenefitCaps = {
  openAsks: number;
  tools: Record<PlanBenefitToolId, number>;
};

export const PLAN_BENEFIT_CAPS: Record<PlanFamilyId, PlanBenefitCaps> = {
  open_door: {
    openAsks: 3,
    tools: { ask_coach: 0, profile_check: 0, resume_tailoring: 0, follow_up_drafts: 0, company_brief: 0, interview_dossier: 0, mock_interview: 0, offer_comparison: 0, salary_coach: 0 },
  },
  fast_track: {
    openAsks: 4,
    tools: { ask_coach: 10, profile_check: 2, resume_tailoring: 3, follow_up_drafts: 6, company_brief: 0, interview_dossier: 0, mock_interview: 0, offer_comparison: 0, salary_coach: 0 },
  },
  insider: {
    openAsks: 6,
    tools: { ask_coach: 30, profile_check: 4, resume_tailoring: 10, follow_up_drafts: 20, company_brief: 10, interview_dossier: 4, mock_interview: 4, offer_comparison: 2, salary_coach: 2 },
  },
};

/** Past a cap, usage bills from the member's normal credits. */
export const PLAN_CAP_OVERAGE = "credits" as const;

export function planBenefitCaps(id: PlanFamilyId): PlanBenefitCaps {
  return PLAN_BENEFIT_CAPS[id];
}

export function planFamilyEntry(id: PlanFamilyId): PlanFamilyEntry {
  const entry = PLAN_FAMILY.find(plan => plan.id === id);
  if (!entry) throw new Error(`unknown plan family id: ${id}`);
  return entry;
}

/** Server-side gate for every reader of the new family. Default off. */
export function planFamilyV2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.PLAN_FAMILY_V2 ?? "").trim().toLowerCase() === "true";
}
