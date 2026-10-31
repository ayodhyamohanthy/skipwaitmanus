/**
 * skipwait.me plan catalog: the pricing model the owner decided on Oct 14 2026
 * (docs/PRICING_RECOMMENDATION.md, "Owner decisions" and sections 3 to 5),
 * amended Oct 16–17 2026 (D-036–D-046 in docs/DECISIONS.md). It
 * overrides PRICING.md, UPGRADE_NUDGES.md and the kit PNG numbers wherever
 * they differ; those files now repeat these numbers.
 *
 *  - Paid plans are 30-day and 90-day passes paid once. Keep warm is the only
 *    yearly plan. A 90-day pass grants credits in three cycles of about 30 days.
 *    Every payment option goes on sale now, before referrers onboard (D-046,
 *    Oct 17 2026: no supply gate; supersedes D-037's timing and D-045; plan
 *    contents and prices unchanged; the purchase entry points switch fully
 *    on with queue task 1 step 3).
 *  - Prices: one global USD price and an India price in INR, no GST
 *    (D-007: Indian sole proprietorship, not GST-registered).
 *  - Free: 3 open asks, 3 credits every UTC calendar month (no carryover).
 *    No welcome credits (D-039). The one-time 14-day Momentum reverse trial
 *    stays in code, switched off and off the public catalog until its
 *    trigger ships (D-051, REVERSE_TRIAL_ON_OFFER).
 *  - Keep warm carries 4 credits a month, Momentum 36 per 30 days (D-041).
 *  - Land Focus/Sprint human review and live sessions read as "coming later"
 *    until reviewers are staffed (D-041); Concierge is by application.
 *  - Land Concierge holds 75 open asks and is sold by application.
 *  - Human time is sold as sessions, never for credits.
 *  - Every plan holds at most 2 open asks per company; referrers never see a plan.
 *
 * Amounts are minor units (cents for USD, paise for INR). Changeable data.
 */
export type CatalogTier = "free" | "keep_warm" | "start" | "momentum" | "land";
export const CATALOG_TIER_ORDER: readonly CatalogTier[] = ["free", "keep_warm", "start", "momentum", "land"];

export const CATALOG_PLAN_IDS = ["keep_warm", "start", "momentum", "land_focus", "land_sprint", "land_concierge"] as const;
export type CatalogPlanId = (typeof CATALOG_PLAN_IDS)[number];

/** What a plan term sells: a 30-day pass, a 90-day pass, or a year (Keep warm only). */
export const CATALOG_INTERVALS = ["30d", "90d", "yearly"] as const;
export type CatalogInterval = (typeof CATALOG_INTERVALS)[number];
export const PASS_INTERVALS = ["30d", "90d"] as const satisfies readonly CatalogInterval[];
/** Days a pass covers. A yearly term is twelve calendar months. */
export const PASS_DAYS = { "30d": 30, "90d": 90 } as const;

export const CATALOG_CURRENCIES = ["USD", "INR"] as const;
export type CatalogCurrency = (typeof CATALOG_CURRENCIES)[number];

/** Credit carryover: months unused plan credits survive; "subscribed" keeps them while the paid plan is active (Land). */
export type Carryover = 0 | 1 | 3 | "subscribed";

/** Human time a plan includes in each 30-day cycle (written reviews, live sessions, Concierge hours). */
export type HumanTime = { writtenReviews: number; liveSessions: number; hours: number };
const NO_HUMAN_TIME: HumanTime = { writtenReviews: 0, liveSessions: 0, hours: 0 };

export type CatalogPlan = {
  id: "free" | CatalogPlanId;
  tier: CatalogTier;
  /** Land has three levels; every other tier has one. */
  level: number;
  /** Tier name shown on the plan card: Free, Keep warm, Start, Momentum or Land. */
  label: string;
  /** Land level name (Focus, Sprint, Concierge); null for single-level tiers. */
  levelLabel: string | null;
  /** Plan credits granted at the start of each cycle (a calendar month, about 30 days). */
  creditsPerMonth: number;
  /** Open asks held at once. No plan is unlimited. */
  openRequests: number;
  carryover: Carryover;
  humanTime: HumanTime;
  /** Concierge: sold after an application, never from self-serve checkout. */
  byApplication: boolean;
  /** "Recommended" label (never "Most chosen" until purchase data supports it). */
  recommended: boolean;
  /** The terms this plan is sold for, each with its USD and INR price. */
  prices: Partial<Record<CatalogInterval, Record<CatalogCurrency, number>>>;
};

const usd = (dollars: number) => Math.round(dollars * 100);
const inr = (rupees: number) => rupees * 100;
const pass = (usd30: number, inr30: number, usd90: number, inr90: number): CatalogPlan["prices"] => ({
  "30d": { USD: usd(usd30), INR: inr(inr30) },
  "90d": { USD: usd(usd90), INR: inr(inr90) },
});

/** A sold plan: every catalog plan except Free. */
export type PaidCatalogPlan = CatalogPlan & { id: CatalogPlanId };

/**
 * Credit PACKS (the D-005/D-036 ladder: first pack ₹99 for 2 / $5 for 5, then
 * 25 / 60 / 150) stay on sale alongside the passes (D-036/D-046). The flag
 * below only hides client entry points: the payment-recovery screen is
 * untouched, so a checkout started before the pause still finishes.
 *
 * PAUSED Oct 25 2026: the owner froze pricing/plans/referrals ("You can pause
 * old pricing once and start pushing this immediately", iMessage
 * phonemsg-01M5SP3S0WNXCX7F1V5Z3PDX9D) ahead of the banded-plans replacement
 * (shared/planFamily.ts). New pack purchases stop here and at the server
 * (LEGACY_PACK_SALES_PAUSED below); credits already bought keep working and
 * never expire, and nothing is cancelled or refunded.
 */
export const CREDIT_PACKS_ON_SALE = false;

/**
 * Server half of the Oct 25 2026 old-pricing pause: the kit pack checkout
 * refuses NEW credit-pack purchases before any provider call. Entitlements are
 * untouched (balances, withdrawals, payment recovery and verified webhooks run
 * as before); the legacy single credit stays retired. Off when the banded
 * plans (shared/planFamily.ts) open their own checkout.
 */
export const LEGACY_PACK_SALES_PAUSED: boolean = true;
export const LEGACY_PACK_SALES_PAUSED_CODE = "legacy_pricing_paused";
export const LEGACY_PACK_SALES_PAUSED_ERROR =
  "Credit pack purchases are paused while pricing is updated. Nothing has been charged; credits you already have still work.";

/**
 * D-084 (P0, Oct 20): passes and Keep warm are sold only once a paid pass can
 * always be activated. Today one activates only when the subscription webhook
 * names its checkout page, and nothing recovers it otherwise (GO-LIVE-1b adds
 * the recovery). While false, the catalog reports every plan term unavailable
 * and the subscription checkout refuses with 409 not_available_yet before any
 * provider call. Kept in code and switched on when it can deliver (D-042).
 */
export const PASS_SALES_ENABLED: boolean = false;

export const FREE_PLAN: CatalogPlan & { id: "free" } = {
  id: "free", tier: "free", level: 1, label: "Free", levelLabel: null,
  creditsPerMonth: 3, openRequests: 3, carryover: 0, humanTime: NO_HUMAN_TIME, byApplication: false, recommended: false, prices: {},
};


/** GO-LIVE-1 (D-036): the legacy per-credit checkout answers this when retired. */
export const SINGLE_CREDIT_RETIRED_CODE = "single_credit_retired";
export const SINGLE_CREDIT_RETIRED_ERROR = "Single credits are replaced by credit packs. Nothing has been charged.";

/**
 * The ₹99/$1 single credit retires in a currency once any credit pack is on sale
 * in it (D-036). A computed switch (D-042): the server answers from the live
 * availability probe, so a pack that goes off sale re-opens the single credit.
 */
export function singleCreditRetired(args: { currency: CatalogCurrency; anyPackAvailable: boolean }): boolean {
  return args.anyPackAvailable;
}

export const CATALOG_PLANS: readonly PaidCatalogPlan[] = [
  { id: "keep_warm", tier: "keep_warm", level: 1, label: "Keep warm", levelLabel: null, creditsPerMonth: 4, openRequests: 5, carryover: 1, humanTime: NO_HUMAN_TIME, byApplication: false, recommended: false, prices: { yearly: { USD: usd(29), INR: inr(999) } } },
  { id: "start", tier: "start", level: 1, label: "Start", levelLabel: null, creditsPerMonth: 10, openRequests: 8, carryover: 1, humanTime: NO_HUMAN_TIME, byApplication: false, recommended: false, prices: pass(8, 299, 19, 699) },
  { id: "momentum", tier: "momentum", level: 1, label: "Momentum", levelLabel: null, creditsPerMonth: 36, openRequests: 15, carryover: 3, humanTime: NO_HUMAN_TIME, byApplication: false, recommended: true, prices: pass(24, 999, 59, 2_499) },
  { id: "land_focus", tier: "land", level: 1, label: "Land", levelLabel: "Focus", creditsPerMonth: 120, openRequests: 30, carryover: "subscribed", humanTime: { writtenReviews: 1, liveSessions: 0, hours: 0 }, byApplication: false, recommended: false, prices: pass(100, 5_999, 249, 13_999) },
  { id: "land_sprint", tier: "land", level: 2, label: "Land", levelLabel: "Sprint", creditsPerMonth: 300, openRequests: 50, carryover: "subscribed", humanTime: { writtenReviews: 1, liveSessions: 1, hours: 0 }, byApplication: false, recommended: false, prices: pass(200, 11_999, 499, 27_999) },
  { id: "land_concierge", tier: "land", level: 3, label: "Land", levelLabel: "Concierge", creditsPerMonth: 1_000, openRequests: 75, carryover: "subscribed", humanTime: { writtenReviews: 0, liveSessions: 0, hours: 6 }, byApplication: true, recommended: false, prices: pass(750, 34_999, 1_990, 84_999) },
];

/** The intervals a plan is sold for, in catalog order. */
export function planIntervals(plan: CatalogPlan): CatalogInterval[] {
  return CATALOG_INTERVALS.filter(interval => plan.prices[interval] !== undefined);
}

// ---- Credit packs: one-time, never renew, never expire ----

export const CATALOG_PACK_IDS = ["pack_2", "pack_5", "pack_25", "pack_60", "pack_150"] as const;
export type CatalogPackId = (typeof CATALOG_PACK_IDS)[number];

export type CreditPack = {
  id: CatalogPackId;
  credits: number;
  /** Sold only in the currencies listed (pack sets differ by currency). */
  prices: Partial<Record<CatalogCurrency, number>>;
  /** The first-purchase pack of its currency: $5 for 5, or ₹99 for 2 (enough for one extra open ask). */
  firstPack: boolean;
  recommended: boolean;
};

/**
 * USD 5/$5, 25/$22, 60/$48, 150/$105. INR 2/₹99, 25/₹1,199, 60/₹2,599, 150/₹5,999.
 * Purchased credits never expire and never affect referral access or queue position.
 */
export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: "pack_2", credits: 2, prices: { INR: inr(99) }, firstPack: true, recommended: false },
  { id: "pack_5", credits: 5, prices: { USD: usd(5) }, firstPack: true, recommended: false },
  { id: "pack_25", credits: 25, prices: { USD: usd(22), INR: inr(1_199) }, firstPack: false, recommended: true },
  { id: "pack_60", credits: 60, prices: { USD: usd(48), INR: inr(2_599) }, firstPack: false, recommended: false },
  { id: "pack_150", credits: 150, prices: { USD: usd(105), INR: inr(5_999) }, firstPack: false, recommended: false },
];

export function catalogPackById(id: unknown): CreditPack | undefined {
  return CREDIT_PACKS.find(pack => pack.id === id);
}

/**
 * The first-pack claim the public copy quotes ("₹99 for 2 credits", "$5 for 5 credits"), composed from
 * CREDIT_PACKS so /pricing and the landing FAQ can never drift from the catalog the server sells
 * (docs/PRICING.md:37). null when that currency has no first pack: callers say something honest instead.
 */
export function firstPackClaim(currency: CatalogCurrency): string | null {
  const pack = CREDIT_PACKS.find(candidate => candidate.firstPack && candidate.prices[currency] !== undefined);
  const minor = pack?.prices[currency];
  if (!pack || minor === undefined) return null;
  const whole = minor % 100 === 0;
  try {
    const amount = new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(minor / 100);
    return `${amount} for ${pack.credits} credit${pack.credits === 1 ? "" : "s"}`;
  } catch { return null; }
}

// ---- Human sessions: one-time, sold only once reviewers are staffed ----

export const HUMAN_SESSION_IDS = ["written_review", "live_session"] as const;
export type HumanSessionId = (typeof HUMAN_SESSION_IDS)[number];
export type HumanSession = { id: HumanSessionId; label: string; detail: string; prices: Record<CatalogCurrency, number> };

/** Reviewers are never employees of, or skipwait.me referrers for, the seeker's target company. */
export const HUMAN_SESSIONS: readonly HumanSession[] = [
  { id: "written_review", label: "Written expert review", detail: "Returned within 48 hours", prices: { USD: usd(49), INR: inr(799) } },
  { id: "live_session", label: "Live 45-minute session", detail: "Mock interview or search strategy", prices: { USD: usd(99), INR: inr(1_499) } },
];

export function humanSessionById(id: unknown): HumanSession | undefined {
  return HUMAN_SESSIONS.find(session => session.id === id);
}

// ---- What credits buy (AI-made finished work); human review is not on this list ----

export const CREDIT_TOOL_IDS = ["ask_rewrite", "profile_check", "thank_you_pack", "ask_one_pager", "extra_open_ask", "company_research", "resume_overhaul", "offer_comparison", "interview_dossier", "mock_interview", "salary_coach"] as const;
export type CreditToolId = (typeof CREDIT_TOOL_IDS)[number];
export type CreditTool = { id: CreditToolId; label: string; credits: number };

export const CREDIT_TOOLS: readonly CreditTool[] = [
  { id: "ask_rewrite", label: "Ask rewrite", credits: 1 },
  { id: "profile_check", label: "Profile check", credits: 1 },
  { id: "thank_you_pack", label: "Thank-you pack", credits: 1 },
  { id: "ask_one_pager", label: "Ask One-Pager", credits: 2 },
  { id: "extra_open_ask", label: "Extra open ask for 30 days", credits: 2 },
  { id: "company_research", label: "Company research", credits: 3 },
  { id: "resume_overhaul", label: "Resume overhaul", credits: 3 },
  { id: "offer_comparison", label: "Offer comparison", credits: 3 },
  { id: "interview_dossier", label: "Interview dossier", credits: 4 },
  { id: "mock_interview", label: "AI mock interview", credits: 5 },
  { id: "salary_coach", label: "Salary coach", credits: 5 },
];

export function creditToolCost(id: CreditToolId): number {
  const tool = CREDIT_TOOLS.find(candidate => candidate.id === id);
  if (!tool) throw new Error(`Unknown credit tool ${id}`);
  return tool.credits;
}

// ---- Fairness and the Free plan's one-time trial ----

/** Every plan: no more than 2 open asks at one company at a time (enforced at ask creation). */
export const MAX_OPEN_ASKS_PER_COMPANY = 2;

/** One-time reverse trial after the first ask: Momentum's open asks and 5 trial credits for 14 days, no card, once per person. */
export const REVERSE_TRIAL = { plan: "momentum", days: 14, credits: 5 } as const satisfies { plan: CatalogPlanId; days: number; credits: number };

/**
 * D-051: nothing grants the reverse trial yet (grantTrialCreditsTx has no runtime caller), so
 * it is not offered: the public catalog (GET /api/plans/catalog) and every screen leave it
 * out (D-044: nothing advertised that code does not grant). It stays in code, switched off,
 * not removed (D-042). Turn this on in the same change that ships its trigger (recommended:
 * the seeker's first ask that reaches an available verified referrer).
 */
export const REVERSE_TRIAL_ON_OFFER: boolean = false;

// ---- Lookups ----

/** "Land Focus", "Momentum": the tier label plus the Land level when there is one. */
export function planDisplayName(plan: CatalogPlan): string {
  return plan.levelLabel ? `${plan.label} ${plan.levelLabel}` : plan.label;
}

export function catalogPlanById(id: unknown): CatalogPlan | undefined {
  if (id === FREE_PLAN.id) return FREE_PLAN;
  return CATALOG_PLANS.find(p => p.id === id);
}

export function tierRank(tier: CatalogTier): number {
  return CATALOG_TIER_ORDER.indexOf(tier);
}

/** Tier-based capability check, so access follows the tier and never a price. */
export function tierAtLeast(tier: CatalogTier, minimum: CatalogTier): boolean {
  return tierRank(tier) >= tierRank(minimum);
}

/** Chargebee item price id, e.g. skipwait_momentum_90d-INR or skipwait_keep_warm_yearly-USD. Sold only once the server sees it live (server/billingAvailability.ts). */
export function catalogItemPriceId(planId: CatalogPlanId, interval: CatalogInterval, currency: CatalogCurrency): string {
  return `skipwait_${planId}_${interval}-${currency}`;
}

/** One-time Chargebee item price for a credit pack, e.g. skipwait_pack_25-USD. */
export function catalogPackItemPriceId(packId: CatalogPackId, currency: CatalogCurrency): string {
  return `skipwait_${packId}-${currency}`;
}

/** One-time Chargebee item price for a human session, e.g. skipwait_written_review-INR. */
export function catalogSessionItemPriceId(sessionId: HumanSessionId, currency: CatalogCurrency): string {
  return `skipwait_${sessionId}-${currency}`;
}
