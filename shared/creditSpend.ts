// Kit credit spend order and summary (contract: shared/creditLedger.ts):
// which bucket a spend draws from first and the ledger block the Plans,
// Billing and usage panels read. Pure: callers pass the JS clock.
import type { Carryover } from "./planCatalog";
import { isPaidPlanActive } from "./planEntitlements";
import { addMonthsUtc, cycleCreditsExpireAt, grantExpiresAt, grantIsSpendable, planCycleAt, walletCycleStart } from "./creditCycles";
import { BUCKET_SOURCES, CREDIT_BUCKETS, EXPIRING_SOON_MS, REFUND_KINDS, SPEND_KINDS, type CreditBucket, type CreditExpiry, type CreditGrantSource, type CreditsLedger, type LedgerGrant, type LedgerWallet, type PromoBucket } from "./creditLedger";

export type SpendableBucket = { bucket: CreditBucket; credits: number; expiresAt: Date | null; grantId: number | null };
export type SpendAllocation = { bucket: CreditBucket; credits: number; grantId: number | null };

const BUCKET_PRIORITY: Readonly<Record<CreditBucket, number>> = { promo: 0, carryover: 1, cycle: 2, welcome: 3, purchased: 4 };

/** Deterministic spend order: soonest expiry first (none = last), then promo, carried, cycle, welcome, purchased, then oldest grant. */
export function orderBuckets(buckets: readonly SpendableBucket[]): SpendableBucket[] {
  const at = (bucket: SpendableBucket) => (bucket.expiresAt ? bucket.expiresAt.getTime() : Number.POSITIVE_INFINITY);
  return buckets.filter(bucket => bucket.credits > 0).sort((a, b) => at(a) - at(b) || BUCKET_PRIORITY[a.bucket] - BUCKET_PRIORITY[b.bucket] || (a.grantId ?? 0) - (b.grantId ?? 0));
}

/** Splits a spend across buckets in spend order. A shortfall means the spend must be refused whole. */
export function allocateSpend(buckets: readonly SpendableBucket[], credits: number): { allocations: SpendAllocation[]; shortfall: number } {
  if (!Number.isSafeInteger(credits) || credits < 1) throw new Error("A spend takes a positive whole number of credits");
  const allocations: SpendAllocation[] = [];
  let left = credits;
  for (const bucket of orderBuckets(buckets)) {
    if (left === 0) break;
    const take = Math.min(left, bucket.credits);
    allocations.push({ bucket: bucket.bucket, credits: take, grantId: bucket.grantId });
    left -= take;
  }
  return { allocations, shortfall: left };
}

/** A paid plan past its term end (awaiting renewal) holds its cycle credits but cannot spend them. */
export function spendableCycleCredits(wallet: LedgerWallet, now: Date): number {
  if (wallet.plan !== "free" && !isPaidPlanActive(wallet, now)) return 0;
  return Math.max(0, wallet.monthlyCreditsRemaining);
}

/** Every bucket the seeker can spend now, with the expiry that orders it. */
export function spendableBuckets(input: { wallet: LedgerWallet; carryover: Carryover; grants: readonly LedgerGrant[]; promo: PromoBucket | null; now: Date }): SpendableBucket[] {
  const { wallet, now } = input;
  const buckets: SpendableBucket[] = [];
  if (input.promo && input.promo.credits > 0 && input.promo.expiresAt.getTime() > now.getTime()) buckets.push({ bucket: "promo", credits: input.promo.credits, expiresAt: input.promo.expiresAt, grantId: input.promo.grantId });
  for (const grant of input.grants) {
    if (!grantIsSpendable(grant, wallet, now)) continue;
    buckets.push({ bucket: grant.source, credits: grant.creditsRemaining, expiresAt: grantExpiresAt(grant, wallet, now), grantId: grant.id });
  }
  const cycle = spendableCycleCredits(wallet, now);
  if (cycle > 0) buckets.push({ bucket: "cycle", credits: cycle, expiresAt: cycleCreditsExpireAt(wallet, input.carryover, now), grantId: null });
  if (wallet.balance > 0) buckets.push({ bucket: "purchased", credits: wallet.balance, expiresAt: null, grantId: null });
  return orderBuckets(buckets);
}

// ---- Summary ----

export type LedgerAmountRow = { kind: string; tokenCount: number };

/** Credits spent in a cycle from any bucket, net of refunds, from that cycle's ledger rows (sourceCycleKey). */
export function usedInCycle(rows: readonly LedgerAmountRow[]): number {
  let used = 0;
  for (const row of rows) {
    if ((SPEND_KINDS as readonly string[]).includes(row.kind) || (REFUND_KINDS as readonly string[]).includes(row.kind)) used -= row.tokenCount;
  }
  return Math.max(0, used);
}

/** Pre-kit wallets: a spend row with no source drew from a bucket the ledger did not record. */
export function bucketOfLedgerRow(kind: string, source: string | null): CreditBucket | null {
  for (const bucket of CREDIT_BUCKETS) if (BUCKET_SOURCES[bucket] === source) return bucket;
  if (source === null && ["purchase", "admin_adjustment", "company_coverage_reward", "personal_referral_reward", "invite_reward_granted"].includes(kind)) return "purchased";
  if (kind === "promo_grant" || kind === "promo_spend") return "promo";
  return null;
}

export function buildCreditsLedger(input: {
  wallet: LedgerWallet;
  rules: { creditsPerMonth: number; carryover: Carryover };
  /** Every planCreditGrants row of the wallet (any status). */
  grants: readonly LedgerGrant[];
  promo: PromoBucket | null;
  usedThisCycle: number;
  now: Date;
}): CreditsLedger {
  const { wallet, rules, now } = input;
  const spendable = input.grants.filter(grant => grantIsSpendable(grant, wallet, now));
  const sum = (source: CreditGrantSource) => spendable.filter(grant => grant.source === source).reduce((total, grant) => total + grant.creditsRemaining, 0);
  const carriedOver = sum("carryover");
  const welcome = sum("welcome");
  const cycle = spendableCycleCredits(wallet, now);
  const purchased = Math.max(0, wallet.balance);
  const promo = input.promo && input.promo.expiresAt.getTime() > now.getTime() ? Math.max(0, input.promo.credits) : 0;
  const buckets = spendableBuckets({ wallet, carryover: rules.carryover, grants: input.grants, promo: input.promo, now });
  const dated = buckets.filter((bucket): bucket is SpendableBucket & { expiresAt: Date } => bucket.expiresAt !== null && bucket.expiresAt.getTime() > now.getTime());
  const soonest = (list: Array<SpendableBucket & { expiresAt: Date }>): CreditExpiry | null => {
    if (list.length === 0) return null;
    const first = list.reduce((min, bucket) => (bucket.expiresAt.getTime() < min.expiresAt.getTime() ? bucket : min));
    const credits = list.filter(bucket => bucket.expiresAt.getTime() === first.expiresAt.getTime()).reduce((total, bucket) => total + bucket.credits, 0);
    return { credits, expiresAt: first.expiresAt.toISOString() };
  };
  const horizon = now.getTime() + EXPIRING_SOON_MS;
  const planDated = dated.filter(bucket => (bucket.bucket === "cycle" || bucket.bucket === "carryover") && bucket.expiresAt.getTime() <= horizon);
  const expiringSoon = planDated.length === 0 ? null : { credits: planDated.reduce((total, bucket) => total + bucket.credits, 0), expiresAt: planDated.reduce((min, bucket) => (bucket.expiresAt.getTime() < min.getTime() ? bucket.expiresAt : min), planDated[0].expiresAt).toISOString() };
  const welcomeGrant = input.grants.find(grant => grant.source === "welcome");
  const cycleStart = walletCycleStart(wallet);
  const term = wallet.subscriptionCurrentTermStart && wallet.subscriptionCurrentTermEnd && isPaidPlanActive(wallet, now) ? planCycleAt(wallet.subscriptionCurrentTermStart, wallet.subscriptionCurrentTermEnd, now) : null;
  const cycleEnd = term && term.key === wallet.monthlyCycleKey ? term.endsAt : cycleStart ? addMonthsUtc(cycleStart, 1) : null;
  return {
    balance: cycle + carriedOver + welcome + purchased + promo,
    buckets: { cycle, carriedOver, welcome, purchased, promo },
    creditsPerMonth: rules.creditsPerMonth,
    carryover: rules.carryover,
    cycle: { key: wallet.monthlyCycleKey, startsAt: cycleStart?.toISOString() ?? null, endsAt: cycleEnd?.toISOString() ?? null, granted: Math.max(0, wallet.monthlyAllowance), used: Math.max(0, input.usedThisCycle) },
    planCreditsRemaining: cycle + carriedOver,
    nextExpiry: soonest(dated),
    planCreditsExpiringSoon: expiringSoon,
    welcome: { granted: welcomeGrant !== undefined, credits: welcomeGrant?.tokenCount ?? 0, remaining: welcome },
  };
}
