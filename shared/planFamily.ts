import { creditsForLevel } from "./jobLevel";
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
  /** Insider joins by application only (D-132). Absent = open signup. */
  byApplication?: boolean;
  /** Features folded into the plan instead of billed separately. */
  includes: { stealth: boolean; reachUp: boolean };
};

export const PLAN_FAMILY: readonly PlanFamilyEntry[] = [
  { id: "open_door", label: "Open Door", monthlyUsdCents: 0, monthlyInrPaise: 0, automatedOnly: false, includes: { stealth: false, reachUp: false } },
  { id: "fast_track", label: "Fast Track", monthlyUsdCents: 999, monthlyInrPaise: 49900, automatedOnly: false, includes: { stealth: false, reachUp: true } },
  { id: "insider", label: "Insider", monthlyUsdCents: 5900, monthlyInrPaise: 129900, automatedOnly: true, byApplication: true, includes: { stealth: true, reachUp: true } },
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

// ---------------------------------------------------------------------------
// D-132 (frozen Oct 21 18:42 IST, phonemsg-01M5F9FRS2N26EMEYNEBHK65Q0 "Now
// freeze", author=user): the bundled Lovable-style model. Each plan = perks
// fee (PLAN_FAMILY above) + an in-plan monthly credits dropdown; one monthly
// total = plan fee + credits. Supersedes D-115's plan-less dropdown model.
// All numbers CURRENT BEST AND CHANGEABLE (D-116). NOTHING here is live:
// PLAN_FAMILY_V2 stays OFF until QA's payment-path check passes (stop at the
// hosted payment form) and the owner's enable word is relayed by main.
// ---------------------------------------------------------------------------

/**
 * What happens to a Free seeker's unspent monthly credits when a paid family
 * plan activates. NOTE (instinct port, Oct 23): the source branch comment
 * claims an "owner call, Oct 22" - that claim is UNVERIFIED repo text, not a
 * founder message relayed by Main. The value below is the held branch's
 * behavior ported for TEST-only verification, not a confirmed founder decision.
 */

/** Dropdown rungs inside every plan (credits per month). */
export const PLAN_CREDIT_RUNGS = [5, 10, 25, 50, 100, 200] as const;
export type PlanCreditRung = (typeof PLAN_CREDIT_RUNGS)[number];

/** Single-credit reference prices the "Save %" is measured against. */
export const CREDIT_SINGLE_PRICE = { usdCents: 100, inrPaise: 4_900 } as const;

/**
 * The frozen ladder (screenshot phonemsg-01M5F8EDCXCWN99MSM1V433WA9):
 * INR Rs240/470/1,125/2,150/4,100/7,840 = Save 2/4/8/12/16/20% vs Rs49 single.
 * USD derived at the same percent off the $1 single (changeable default,
 * confirmed by main Oct 21 18:50). "This month" on the plans page =
 * plan fee + the picked rung.
 */
export const PLAN_CREDIT_LADDER: readonly { credits: PlanCreditRung; savePct: number; usdCents: number; inrPaise: number }[] = [
  { credits: 5, savePct: 2, usdCents: 490, inrPaise: 24_000 },
  { credits: 10, savePct: 4, usdCents: 960, inrPaise: 47_000 },
  { credits: 25, savePct: 8, usdCents: 2_300, inrPaise: 112_500 },
  { credits: 50, savePct: 12, usdCents: 4_400, inrPaise: 215_000 },
  { credits: 100, savePct: 16, usdCents: 8_400, inrPaise: 410_000 },
  { credits: 200, savePct: 20, usdCents: 16_000, inrPaise: 784_000 },
] as const;

/** Open Door is truly free: 3 free credits a month, no paid default pick. */
export const OPEN_DOOR_FREE_CREDITS_PER_MONTH = 3;

/** Paid credits never expire; free monthly credits still end with the month. */
export const PAID_CREDITS_NEVER_EXPIRE = true;

/**
 * Plan reach (owner liked main's pick, changeable): how far above the
 * seeker's profile level the plan's asks may target. Open Door = own level.
 */
export const PLAN_REACH_LEVELS_ABOVE: Record<PlanFamilyId, number> = {
  open_door: 0,
  fast_track: 2,
  insider: 4,
} as const;

/**
 * Ask cost in credits by target job level: L1 = 1 credit up to L10 = 10
 * credits, linear (D-132; owner confirmed "Yes",
 * phonemsg-01M5FBYVJEA1TA99YPH6HZCQX5, 2026-10-21 19:26 IST, author=user).
 * Changeable default per owner. The ask screen must state this plainly before
 * sending, e.g. "This ask costs 5 credits. You have 3. Add 2 more.", with a
 * one-tap top-up (owner, phonemsg-01M5FBZE51NZYPG6MZAQ7N9XXS, 19:26 IST).
 */
export const ASK_CREDITS_BY_LEVEL = (level: number): number => creditsForLevel(Math.min(10, Math.max(1, Math.round(level))) as Parameters<typeof creditsForLevel>[0]);

/**
 * Mentor (referrer side): opt-in Rs199/$2.99 per month, first 60 days free;
 * the month's fee returns as earned credits when the mentor handles 2 asks
 * that month. Referrers are never paid cash (D-006); credits are usable on
 * their own asks.
 */
export const MENTOR_ADD_ON = {
  monthlyUsdCents: 299,
  monthlyInrPaise: 19_900,
  freeDays: 60,
  feeReturnThresholdAsksPerMonth: 2,
} as const;

/* Referrers earn NOTHING for referring or accepting asks - no credits, no
 * money, ever (D-055; the D-059 freeze STANDS: the owner reversed the 18:46
 * approval with a thumbs-down 19:15, relayed by main). Mentor (above) is the
 * only referrer-side programme, and its fee return is credits, never cash. */

/**
 * Company tier: DRAFT, unbuilt. Name FROZEN by the owner Oct 21 19:10
 * (phonemsg-01M5FB1XYT5GY6VAGH7GCEC0SZ "Lets stick to organisations",
 * author=user): "Organisation" - Organisation Free / Organisation Plus,
 * subtitle "for companies, colleges and training institutes buying for many
 * people" (supersedes the 18:52 "Group Plan" pick). Draft shape only:
 * Organisation Plus gives verified employees Mentor free. Do not build
 * while draft.
 */
export const COMPANY_TIER_DRAFT = { built: false, name: "Organisation" } as const;

// ---- D-132 derivation helpers (plans page "Choose your reach.") ----

export type PlanPriceBook = "USD" | "INR";

export function ladderRung(credits: number): (typeof PLAN_CREDIT_LADDER)[number] {
  const rung = PLAN_CREDIT_LADDER.find(entry => entry.credits === credits);
  if (!rung) throw new Error(`unknown credit rung: ${credits}`);
  return rung;
}

/** Rung price in minor units for a price book. */
export function rungPriceMinor(credits: PlanCreditRung, book: PlanPriceBook): number {
  const rung = ladderRung(credits);
  return book === "INR" ? rung.inrPaise : rung.usdCents;
}

/** Per-credit minor units for a rung (exact for every frozen rung). */
export function perCreditMinor(credits: PlanCreditRung, book: PlanPriceBook): number {
  return rungPriceMinor(credits, book) / credits;
}

/** What the rung saves vs buying the same credits at the single price. */
export function rungSavingsMinor(credits: PlanCreditRung, book: PlanPriceBook): number {
  const single = book === "INR" ? CREDIT_SINGLE_PRICE.inrPaise : CREDIT_SINGLE_PRICE.usdCents;
  return single * credits - rungPriceMinor(credits, book);
}

/** Plan perks fee per month in minor units. */
export function planFeeMinor(id: PlanFamilyId, book: PlanPriceBook): number {
  const entry = planFamilyEntry(id);
  return book === "INR" ? entry.monthlyInrPaise : entry.monthlyUsdCents;
}

/**
 * "This month" = plan fee + picked rung. A null rung is the free pick
 * (Open Door's default: its 3 free monthly credits, no charge).
 */
export function thisMonthMinor(id: PlanFamilyId, rung: PlanCreditRung | null, book: PlanPriceBook): number {
  return planFeeMinor(id, book) + (rung === null ? 0 : rungPriceMinor(rung, book));
}

/**
 * Plan display names (D-152, relayed founder message Oct 23 05:52 IST, verbatim "plans should
 * be Entry level Referrers, Mid level Referrers, Senior level Referrers"; supersedes the
 * D-148 names Junior / Mid / Senior+). Names only: ids, fees, credits, benefits and the
 * +0/+2/+4 reach numbers are unchanged from D-132/D-148, and these names do NOT settle the
 * unresolved reach mapping (docs/PRICING.md, open launch gaps). Changeable.
 */
export const PLAN_DISPLAY_NAME: Record<PlanFamilyId, string> = { open_door: "Entry level Referrers", fast_track: "Mid level Referrers", insider: "Senior level Referrers" } as const;

/** Level names for the "Who you can ask" row (D-148 designer copy). Job-level names only, never the plan names. */
export const REACH_LEVEL_NAMES: Record<number, string> = {
  1: "Intern", 2: "Entry-level", 3: "Early mid-level", 4: "Mid-level", 5: "Senior",
  6: "Senior II", 7: "Staff or lead", 8: "Principal", 9: "Director or head", 10: "VP or C-level",
};

export type PlanReach = { level: number; top: number; levelNames: string; levelText: string };

/** Who a plan lets the seeker ask, from the seeker's own level L (1-10). Display only, never a gate. */
export function planReachFor(planId: PlanFamilyId, seekerLevel: number): PlanReach {
  const l = Math.min(10, Math.max(1, Math.round(seekerLevel)));
  const top = Math.min(10, l + PLAN_REACH_LEVELS_ABOVE[planId]);
  return {
    level: l,
    top,
    levelNames: top === l ? REACH_LEVEL_NAMES[l] : `${REACH_LEVEL_NAMES[l]} up to ${REACH_LEVEL_NAMES[top]}`,
    levelText: top === l ? `L${l}` : `L${l} to L${top}`,
  };
}
