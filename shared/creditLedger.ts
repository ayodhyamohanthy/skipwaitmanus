/**
 * Kit credit ledger (PRICING.md "Credits", UPGRADE_NUDGES.md usage panel).
 * $1 = 1 credit = one finished piece of work. A seeker's credits sit in buckets,
 * spent soonest-expiring first:
 *
 *  - cycle: this plan cycle's included credits (tokenBalances.monthlyCreditsRemaining
 *    for monthlyCycleKey). Each cycle start grants the plan's creditsPerMonth:
 *    Free 2 a calendar month (no carryover), a 90-day pass three cycles, a
 *    yearly plan twelve.
 *  - carryover: what a cycle left unspent, kept by the granting plan's rule
 *    (planCreditGrants source "carryover"): Keep warm and Start 1 month,
 *    Momentum 3 months, Land while the plan is active. Every plan credit ends
 *    with the paid term or pass.
 *  - trial: the reverse trial's 5 credits (planCreditGrants source "trial"),
 *    once per person, ending with the 14-day trial.
 *  - welcome: 3 one-time credits per person (planCreditGrants source "welcome"). Never expire.
 *  - purchased: packs, rewards and support recovery (tokenBalances.balance). Never expire.
 *  - promo: the paused first-payment promo (promoCreditGrants), 30 days.
 *
 * Every grant, spend, carryover, expiry and refund is an append-only
 * tokenTransactions row; the maintained buckets reconcile against those rows
 * (server/db.ts getCreditLedgerAudit). All dates are computed on the JS clock.
 *
 * This file is the wire and storage contract; shared/creditCycles.ts holds the
 * cycle and expiry rules and shared/creditSpend.ts the spend order and summary.
 */
import { z } from "zod";

const DAY_MS = 24 * 60 * 60 * 1000;

/** One-time credits for every person (keyed on the canonical person, never per alias). */
export const WELCOME_CREDITS = 3;
/**
 * A renewing plan whose term end has passed is waiting for the provider's
 * renewal webhook. Its plan credits stop being spendable at the term end (the
 * plan reads as Free) but are only expired once this grace has also passed, so
 * a late webhook never costs a renewing subscriber their carried-over credits.
 */
export const RENEWAL_GRACE_MS = 3 * DAY_MS;
/** UPGRADE_NUDGES "Plan credits expiring": credits that roll off within 7 days. */
export const EXPIRING_SOON_MS = 7 * DAY_MS;
export const LEDGER_PAGE_DEFAULT = 50;
export const LEDGER_PAGE_MAX = 100;

/** tokenTransactions.kind, in drizzle/schema.ts order (pinned by server/creditLedgerContract.test.ts): 0079's list, then 0081's. */
export const TOKEN_LEDGER_KINDS = [
  "purchase", "direct_request", "admin_adjustment", "company_coverage_reward", "personal_referral_reward",
  "invite_reward_pending", "invite_reward_granted", "withdrawal_refund", "promo_grant", "promo_spend", "expiry_refund",
  "plan_grant", "plan_credit_carryover", "plan_credit_expiry", "welcome_grant", "credit_spend",
  "trial_grant",
] as const;
export type TokenLedgerKind = (typeof TOKEN_LEDGER_KINDS)[number];

/** Ledger rows that take credits out (spends) and that return a spent credit (refunds). */
export const SPEND_KINDS: readonly TokenLedgerKind[] = ["direct_request", "promo_spend", "credit_spend"];
export const REFUND_KINDS: readonly TokenLedgerKind[] = ["withdrawal_refund", "expiry_refund"];
/** Pending invite rewards are not credits yet; they become an invite_reward_granted row. */
export const HIDDEN_LEDGER_KINDS: readonly TokenLedgerKind[] = ["invite_reward_pending"];

/** planCreditGrants.source: 0079's values, then 0081's "trial". */
export const CREDIT_GRANT_SOURCES = ["carryover", "welcome", "trial"] as const;
export type CreditGrantSource = (typeof CREDIT_GRANT_SOURCES)[number];
export const CREDIT_GRANT_STATUSES = ["active", "exhausted", "expired", "revoked"] as const;
export type CreditGrantStatus = (typeof CREDIT_GRANT_STATUSES)[number];

export const CREDIT_BUCKETS = ["promo", "carryover", "trial", "cycle", "welcome", "purchased"] as const;
export type CreditBucket = (typeof CREDIT_BUCKETS)[number];

/** tokenTransactions.source values the ledger writes, one per bucket. */
export const BUCKET_SOURCES = {
  promo: "promo_grant",
  carryover: "carryover_grant",
  trial: "trial_grant",
  cycle: "monthly_allowance",
  welcome: "welcome_grant",
  purchased: "purchased_balance",
} as const satisfies Record<CreditBucket, string>;

const count = z.number().int().min(0);
const isoTimestamp = z.iso.datetime();
export const carryoverSchema = z.union([z.literal(0), z.literal(1), z.literal(3), z.literal("subscribed")]);
export const creditBucketSchema = z.enum(CREDIT_BUCKETS);

export const creditExpirySchema = z.strictObject({ credits: z.number().int().positive(), expiresAt: isoTimestamp });
export type CreditExpiry = z.infer<typeof creditExpirySchema>;

/** The ledger block of GET /api/credits/summary (`summary.ledger`): the kit Plans, Billing and usage panels read it. */
export const creditsLedgerSchema = z.strictObject({
  /** Every spendable credit: equals summary.totalAvailable. */
  balance: count,
  buckets: z.strictObject({ cycle: count, carriedOver: count, trial: count, welcome: count, purchased: count, promo: count }),
  /** The plan in effect: credits each cycle grants and how long unspent ones last. */
  creditsPerMonth: count,
  carryover: carryoverSchema,
  cycle: z.strictObject({
    key: z.string().min(1).max(16),
    startsAt: isoTimestamp.nullable(),
    endsAt: isoTimestamp.nullable(),
    /** Plan credits this cycle granted. */
    granted: count,
    /** Credits spent this cycle from any bucket, net of refunds. */
    used: count,
  }),
  /** Cycle plus carried-over credits. */
  planCreditsRemaining: count,
  /** The soonest dated expiry among the credits held, if any expire. */
  nextExpiry: creditExpirySchema.nullable(),
  /** Plan credits that roll off within 7 days (UPGRADE_NUDGES #3). */
  planCreditsExpiringSoon: creditExpirySchema.nullable(),
  welcome: z.strictObject({ granted: z.boolean(), credits: count, remaining: count }),
});
export type CreditsLedger = z.infer<typeof creditsLedgerSchema>;

export const creditLedgerEntrySchema = z.strictObject({
  id: z.number().int().positive(),
  kind: z.enum(TOKEN_LEDGER_KINDS),
  /** Signed: positive adds credits, negative takes them out. */
  credits: z.number().int(),
  bucket: creditBucketSchema.nullable(),
  reference: z.strictObject({ type: z.string().min(1).max(40), id: z.string().min(1).max(80) }).nullable(),
  createdAt: isoTimestamp,
});
export type CreditLedgerEntry = z.infer<typeof creditLedgerEntrySchema>;

/** GET /api/credits/ledger: the caller's own rows, newest first. */
export const creditLedgerResponseSchema = z.strictObject({ entries: z.array(creditLedgerEntrySchema) });
export type CreditLedgerResponse = z.infer<typeof creditLedgerResponseSchema>;

export const creditLedgerQuerySchema = z.object({
  role: z.enum(["job_seeker", "referrer"]).default("job_seeker"),
  limit: z.coerce.number().int().min(1).max(LEDGER_PAGE_MAX).default(LEDGER_PAGE_DEFAULT),
});

/** A caller-supplied spend key: one spend, however many buckets it draws from. */
export const spendIdempotencyKeySchema = z.string().regex(/^[A-Za-z0-9:_-]{8,56}$/);

/** The wallet fields the ledger reads (tokenBalances). */
export type LedgerWallet = {
  plan: string;
  balance: number;
  monthlyAllowance: number;
  monthlyCreditsRemaining: number;
  monthlyCycleKey: string;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  subscriptionCurrentTermStart: Date | null;
  subscriptionCurrentTermEnd: Date | null;
};

/** The planCreditGrants fields the ledger reads. */
export type LedgerGrant = {
  id: number;
  source: CreditGrantSource;
  subscriptionId: string | null;
  tokenCount: number;
  creditsRemaining: number;
  expiresAt: Date | null;
  status: CreditGrantStatus;
};

/** The paused first-payment promo grant, when active. */
export type PromoBucket = { grantId: number; credits: number; expiresAt: Date };
