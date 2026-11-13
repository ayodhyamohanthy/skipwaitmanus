/**
 * FROZEN banded pricing (owner freeze Oct 25, 2026 ~19:31 IST,
 * phonemsg-01M5SNVZEY1P8K169J48T2HGTJ "Freeze and push immediately update our
 * pricing plans" + "Push to repo" / "Ffor replacement" phonemsg-01M5SNW7YRNXPSS152WD09R2CW /
 * phonemsg-01M5SNWD4WS0TRCRHDFENYZ97X), approving the banded proposal delivered
 * in reply to phonemsg-01M5SMSX1TT758PTX4S53MMW4X. Band naming per
 * phonemsg-01M5SMNMN1041B9W7M8WJN2KYH ("Senior to Executive", no plus).
 * SUPERSEDES the D-115/D-128/D-132 Open Door / Fast Track / Insider +
 * credits-ladder model, which is retained below only as history pointers.
 *
 * ONE config source for plan names, prices, included referrals and top-ups.
 * Amounts are minor units (cents / paise), monthly, no GST (D-007). The two
 * price books follow D-122: India only when profile AND payment method are
 * both India, otherwise global - never by IP alone.
 *
 * NOTHING here is live: the legacy catalog (shared/planCatalog.ts) stays the
 * only catalog until pricing go-live. The flag (PLAN_FAMILY_V2, default off)
 * gates every reader of this module. Go-live bars that SURVIVE the freeze:
 * USD monthly billing is blocked pending PayPal Reference Transactions
 * (reserved owner step) and a real out-of-India USD test (D-065); the INR
 * rail is configured, not transaction-verified at scale.
 */

export const PLAN_FAMILY_IDS = ["early_to_mid", "mid_to_senior", "senior_to_executive"] as const;
export type PlanFamilyId = (typeof PLAN_FAMILY_IDS)[number];

/** Referrer levels the bands span. */
export const REFERRAL_LEVELS = ["early", "mid", "senior", "executive"] as const;
export type ReferralLevel = (typeof REFERRAL_LEVELS)[number];

export const LEVEL_DISPLAY_NAME: Record<ReferralLevel, string> = {
  early: "Early",
  mid: "Mid",
  senior: "Senior",
  executive: "Executive",
} as const;

/** Bands are bounded and non-cumulative, overlapping at Mid and Senior (frozen). */
export const BAND_LEVELS: Record<PlanFamilyId, readonly ReferralLevel[]> = {
  early_to_mid: ["early", "mid"],
  mid_to_senior: ["mid", "senior"],
  senior_to_executive: ["senior", "executive"],
} as const;

export type PlanFamilyEntry = {
  id: PlanFamilyId;
  /** Frozen display name (band of referrer levels reachable). */
  label: "Early to Mid" | "Mid to Senior" | "Senior to Executive";
  /** Founding monthly price, USD cents (global book). */
  monthlyUsdCents: number;
  /** Founding monthly price, INR paise (India book). */
  monthlyInrPaise: number;
  /** Included referrals per month, fixed count at each of the band's levels. */
  includedReferrals: Record<string, number> & Partial<Record<ReferralLevel, number>>;
  /** Founding-member cap: cumulative memberships ever issued, never recycled. */
  foundingCap: number;
  /** Senior to Executive joins by application while senior/executive supply is uncertain. */
  byApplication?: boolean;
};

export const PLAN_FAMILY: readonly PlanFamilyEntry[] = [
  { id: "early_to_mid", label: "Early to Mid", monthlyUsdCents: 449, monthlyInrPaise: 22_900, includedReferrals: { early: 3, mid: 1 }, foundingCap: 500 },
  { id: "mid_to_senior", label: "Mid to Senior", monthlyUsdCents: 1_799, monthlyInrPaise: 89_900, includedReferrals: { mid: 3, senior: 2 }, foundingCap: 250 },
  { id: "senior_to_executive", label: "Senior to Executive", monthlyUsdCents: 2_599, monthlyInrPaise: 129_900, includedReferrals: { senior: 3, executive: 1 }, foundingCap: 100, byApplication: true },
] as const;

/**
 * FREE ALLOWANCE (controlling rule, unchanged): 3 referrals per month at ANY
 * level including Executive, verified card required, no carry-forward.
 * Additional to the paid bundles. The $1 starter pack was NOT adopted.
 */
export const FREE_REFERRALS_PER_MONTH = 3;
export const FREE_ALLOWANCE_REQUIRES_VERIFIED_CARD = true;
export const FREE_ALLOWANCE_NO_CARRY_FORWARD = true;

/**
 * Purchased referrals never expire; free monthly referrals still end with the
 * month. Kept from the D-132 family because `server/db.ts` reads it on the
 * cycle-roll refund path (D-132 audit item 4, f2a335c2). The Oct 25 freeze does
 * not change it, and removing it would change refund behaviour (D-042, D-147).
 */
export const PAID_CREDITS_NEVER_EXPIRE = true;

/**
 * TOP-UPS: one price per level, the SAME price in every plan. Buy only within
 * your band's access; buying never unlocks another level.
 */
export const TOPUP_PRICE: Record<ReferralLevel, { usdCents: number; inrPaise: number }> = {
  early: { usdCents: 100, inrPaise: 4_900 },
  mid: { usdCents: 400, inrPaise: 19_900 },
  senior: { usdCents: 800, inrPaise: 39_900 },
  executive: { usdCents: 1_600, inrPaise: 79_900 },
} as const;

/** Volume discounts on a mixed cart; quantities count actual requests. */
export const VOLUME_DISCOUNTS: readonly { minQuantity: number; savePct: number }[] = [
  { minQuantity: 5, savePct: 2 },
  { minQuantity: 10, savePct: 4 },
  { minQuantity: 25, savePct: 8 },
  { minQuantity: 50, savePct: 12 },
  { minQuantity: 100, savePct: 16 },
  { minQuantity: 200, savePct: 20 },
] as const;

/**
 * SPENDING ORDER (frozen): included referral for that level first, then the
 * free allowance, then a purchased referral. Outside your band only the free
 * allowance applies. Balance and charge shown before sending; spend only when
 * a verified employee can see the request.
 */
export const SPENDING_ORDER = ["included", "free", "purchased"] as const;
export type SpendSource = (typeof SPENDING_ORDER)[number];

/**
 * REFERRER PLANS (optional priority, same bands, both audiences): priority
 * access to requests from seekers in the band. Overlap members share the same
 * priority stage - no paying precedence over each other. Basic referring
 * stays free and unlimited. READINESS GATE (survives the freeze): DO NOT
 * CHARGE until a verified matching flow exists to make priority genuinely
 * useful; no guaranteed requests or bonuses.
 */
export const REFERRER_PLANS = {
  chargeable: false,
  gate: "no charge until verified matching flow exists",
  entries: [
    { id: "early_to_mid", label: "Early to Mid", monthlyUsdCents: 199, monthlyInrPaise: 9_900, foundingCap: 100 },
    { id: "mid_to_senior", label: "Mid to Senior", monthlyUsdCents: 399, monthlyInrPaise: 19_900, foundingCap: 100 },
    { id: "senior_to_executive", label: "Senior to Executive", monthlyUsdCents: 699, monthlyInrPaise: 34_900, foundingCap: 100 },
  ],
} as const;

/**
 * COMPANY PLANS: management of internal openings + employee referrals.
 * Companies cannot buy referrals, rank or hires; no fee depends on a hire;
 * free posting and the 24h poster first-look stay free. READINESS GATE
 * (survives the freeze): features are PROPOSED, NOT BUILT - NO CHARGE until
 * built and tested; caps open only after the tooling is verified.
 */
export const COMPANY_PLANS = {
  built: false,
  chargeable: false,
  gate: "no charge until built and tested",
  entries: [
    { id: "team", label: "Team", monthlyUsdCents: 9_900, monthlyInrPaise: 499_900, seats: 3, activeOpenings: 10, foundingCap: 25 },
    { id: "growth", label: "Growth", monthlyUsdCents: 19_900, monthlyInrPaise: 999_900, seats: 10, activeOpenings: 50, foundingCap: 10 },
    { id: "scale", label: "Scale", quoteOnly: true },
  ],
} as const;

/**
 * FOUNDING-MEMBER FORMAT (frozen): caps count cumulative memberships ever
 * issued and are never recycled (a cancelled membership does not reopen its
 * spot; a spot returns only if payment fails or is fully refunded before the
 * membership starts). The base plan price is LOCKED while the membership
 * stays continuously active; a lapse ends the lock. Any regular price for
 * new customers after the cap fills is NOT set: the owner decides it before
 * anything changes (the unapproved +50% multiplier was removed Oct 25 2026).
 * No fabricated discount percentages; spots-left shown only from the real count.
 */
export const FOUNDING_TERMS = {
  capsCumulative: true,
  capsRecycle: false,
  basePriceLock: "continuously_active",
} as const;

/** Server-side gate for every reader of the new family. Default off. */
export function planFamilyV2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.PLAN_FAMILY_V2 ?? "").trim().toLowerCase() === "true";
}

// ---- helpers ----

export type PlanPriceBook = "USD" | "INR";

export function planFamilyEntry(id: PlanFamilyId): PlanFamilyEntry {
  const entry = PLAN_FAMILY.find(plan => plan.id === id);
  if (!entry) throw new Error(`unknown plan family id: ${id}`);
  return entry;
}

/** Levels a plan's member can reach (paid access). */
export function bandLevels(id: PlanFamilyId): readonly ReferralLevel[] {
  return BAND_LEVELS[id];
}

/** Whether a level is inside a plan's band. */
export function bandIncludes(id: PlanFamilyId, level: ReferralLevel): boolean {
  return BAND_LEVELS[id].includes(level);
}

/** Plan fee per month in minor units. */
export function planFeeMinor(id: PlanFamilyId, book: PlanPriceBook): number {
  const entry = planFamilyEntry(id);
  return book === "INR" ? entry.monthlyInrPaise : entry.monthlyUsdCents;
}

/** Top-up price for one referral at a level, minor units. */
export function topUpMinor(level: ReferralLevel, book: PlanPriceBook): number {
  return book === "INR" ? TOPUP_PRICE[level].inrPaise : TOPUP_PRICE[level].usdCents;
}

/** Volume discount percent for a cart quantity (0 below the first rung). */
export function volumeDiscountPct(quantity: number): number {
  let pct = 0;
  for (const rung of VOLUME_DISCOUNTS) {
    if (quantity >= rung.minQuantity) pct = rung.savePct;
  }
  return pct;
}

/** Included referrals for a plan as an ordered, display-ready list. */
export function includedReferralList(id: PlanFamilyId): { level: ReferralLevel; count: number }[] {
  const entry = planFamilyEntry(id);
  return BAND_LEVELS[id]
    .filter(level => (entry.includedReferrals[level] ?? 0) > 0)
    .map(level => ({ level, count: entry.includedReferrals[level]! }));
}

/** Total included referrals per month for a plan. */
export function includedReferralTotal(id: PlanFamilyId): number {
  return includedReferralList(id).reduce((sum, item) => sum + item.count, 0);
}

/**
 * Level names for display (D-148 job-level naming kept for the job wall).
 * Unrelated to plan band names: plans are named by the referrer levels they
 * reach, jobs keep the L1-L10 ladder.
 */
export const REACH_LEVEL_NAMES: Record<number, string> = {
  1: "Intern", 2: "Entry-level", 3: "Early mid-level", 4: "Mid-level", 5: "Senior",
  6: "Senior II", 7: "Staff or lead", 8: "Principal", 9: "Director or head", 10: "VP or C-level",
};

/**
 * SUPERSEDED (kept as history pointers only, do not wire):
 * - D-115/D-128 Open Door / Fast Track / Insider names and fees.
 * - D-132 credits ladder (5-200 at 2-20% save) - its volume percentages
 *   survive as the frozen VOLUME_DISCOUNTS above, now on per-level top-ups.
 * - PLAN_CREDIT_RUNGS / PLAN_CREDIT_LADDER / MENTOR_ADD_ON / PLAN_BENEFIT_CAPS
 *   and the reach-levels-above model (+0/+2/+4) - replaced by bands with
 *   fixed included referrals per level.
 * - The Oct 21-23 "credits" terminology - replaced by referrals per the
 *   Oct 25 controlling spec (phonemsg-01M5SFYFY54D3VAEDAEA3591SS).
 */
