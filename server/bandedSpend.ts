import { and, asc, eq } from "drizzle-orm";
import { bandedReferralBalances, tokenBalances, tokenTransactions } from "../drizzle/schema";
import { acceptedAskCostSchema, isBandedPlan, sameAcceptedAskCost, type AcceptedAskCost } from "../shared/acceptedAskCost";
import { bandIncludes, referralLevelForJobLevel, type JobLevelNumber } from "../shared/planFamily";
import { AskPriceChangedError } from "./planGates";
import { CreditSpendConflictError, InsufficientCreditsError, digest, writeLedgerRow, type LedgerTx, type SpendMeta, type WalletRow } from "./creditLedger";

type LevelBalance = typeof bandedReferralBalances.$inferSelect;
const sourcePrefix = "banded:";
const cycleIdentity = (key: string) => digest("banded-cycle", key).slice(0, 16);

function activeBand(wallet: WalletRow, now: Date) {
  return isBandedPlan(wallet.plan) && wallet.subscriptionId !== null &&
    (wallet.subscriptionStatus === "active" || wallet.subscriptionStatus === "non_renewing") &&
    wallet.subscriptionCurrentTermStart !== null && wallet.subscriptionCurrentTermStart.getTime() <= now.getTime() &&
    wallet.subscriptionCurrentTermEnd !== null && wallet.subscriptionCurrentTermEnd.getTime() > now.getTime()
    ? wallet.plan : null;
}

export async function readBandedAllocationTx(tx: LedgerTx, wallet: WalletRow, level: JobLevelNumber, now: Date): Promise<{ cost: AcceptedAskCost; balance: LevelBalance | undefined; available: number }> {
  const band = referralLevelForJobLevel(level);
  const plan = activeBand(wallet, now);
  const inBand = plan !== null && bandIncludes(plan, band);
  const balance = (await tx.select().from(bandedReferralBalances).where(and(eq(bandedReferralBalances.userId, wallet.userId), eq(bandedReferralBalances.level, band))).limit(1).for("update"))[0];
  const included = inBand && balance?.includedCycleKey && balance.includedExpiresAt && balance.includedExpiresAt.getTime() > now.getTime() ? balance.includedRemaining : 0;
  const free = Math.max(0, wallet.monthlyCreditsRemaining);
  const purchased = inBand ? balance?.purchasedRemaining ?? 0 : 0;
  const cost: AcceptedAskCost = included > 0 && balance?.includedCycleKey
    ? { units: 1, band, source: [{ bucket: "included", units: 1, cycleKey: cycleIdentity(balance.includedCycleKey) }] }
    : free > 0
      ? { units: 1, band, source: [{ bucket: "free", units: 1, cycleKey: wallet.monthlyCycleKey }] }
      : purchased > 0
        ? { units: 1, band, source: [{ bucket: "purchased", units: 1, cycleKey: null }] }
        : { units: 0, band, source: [] };
  return { cost, balance, available: included + free + purchased };
}

/** Allocation is selected once under the wallet/level locks, compared and then spent unchanged. */
export async function spendBandedReferralTx(tx: LedgerTx, input: { wallet: WalletRow; level: JobLevelNumber; now: Date; meta: SpendMeta; expectedCost?: AcceptedAskCost }): Promise<{ wallet: WalletRow; chargedCost: AcceptedAskCost }> {
  const allocation = await readBandedAllocationTx(tx, input.wallet, input.level, input.now);
  if (input.expectedCost && !sameAcceptedAskCost(input.expectedCost, allocation.cost)) throw new AskPriceChangedError(allocation.cost);
  if (allocation.cost.units === 0) throw new InsufficientCreditsError(1, 0);
  const source = allocation.cost.source[0];
  if (!source) throw new CreditSpendConflictError();
  let wallet = input.wallet;
  if (source.bucket === "free") {
    const remaining = wallet.monthlyCreditsRemaining - 1;
    const changed = await tx.update(tokenBalances).set({ monthlyCreditsRemaining: remaining }).where(and(eq(tokenBalances.id, wallet.id), eq(tokenBalances.userId, wallet.userId), eq(tokenBalances.monthlyCycleKey, wallet.monthlyCycleKey), eq(tokenBalances.monthlyCreditsRemaining, wallet.monthlyCreditsRemaining)));
    if (Number(changed[0]?.affectedRows) !== 1) throw new CreditSpendConflictError();
    wallet = { ...wallet, monthlyCreditsRemaining: remaining };
  } else {
    const balance = allocation.balance;
    if (!balance) throw new CreditSpendConflictError();
    const column = source.bucket === "included" ? bandedReferralBalances.includedRemaining : bandedReferralBalances.purchasedRemaining;
    const current = source.bucket === "included" ? balance.includedRemaining : balance.purchasedRemaining;
    const patch = source.bucket === "included" ? { includedRemaining: current - 1 } : { purchasedRemaining: current - 1 };
    const changed = await tx.update(bandedReferralBalances).set(patch).where(and(eq(bandedReferralBalances.id, balance.id), eq(bandedReferralBalances.userId, wallet.userId), eq(column, current)));
    if (Number(changed[0]?.affectedRows) !== 1) throw new CreditSpendConflictError();
  }
  let creditGrantId: number | null = null;
  if (source.bucket === "purchased") {
    // Attribute to oldest purchase row with available units
    const candidatePurchases = await tx.select().from(tokenTransactions)
      .where(and(
        eq(tokenTransactions.userId, wallet.userId),
        eq(tokenTransactions.role, "job_seeker"),
        eq(tokenTransactions.kind, "purchase"),
        eq(tokenTransactions.source, `${sourcePrefix}purchased:${allocation.cost.band}`)
      ))
      .orderBy(asc(tokenTransactions.id));
    for (const purchase of candidatePurchases) {
      const related = await tx.select().from(tokenTransactions)
        .where(eq(tokenTransactions.creditGrantId, purchase.id));
      const debits = related.filter(r => r.kind === "credit_spend").reduce((sum, d) => sum + Math.abs(d.tokenCount), 0);
      const reversals = related.filter(r => r.kind === "withdrawal_refund" || r.kind === "expiry_refund").reduce((sum, r) => sum + r.tokenCount, 0);
      const netSpent = debits - reversals;
      if (purchase.tokenCount > netSpent) {
        creditGrantId = purchase.id;
        break;
      }
    }
  }
  await writeLedgerRow(tx, { userId: wallet.userId, role: "job_seeker", tokenCount: -1, kind: "credit_spend", source: `${sourcePrefix}${source.bucket}:${allocation.cost.band}`, sourceCycleKey: source.cycleKey, referenceType: input.meta.referenceType, referenceId: `${input.meta.referenceId}#1`, idempotencyKey: `${input.meta.idempotencyKey}#1`, creditGrantId, monthlyCreditsAfter: wallet.monthlyCreditsRemaining, balanceAfter: wallet.balance });
  return { wallet, chargedCost: allocation.cost };
}

/** Replay never infers a charge from a client key or another user's request. */
export async function readBandedChargeTx(tx: LedgerTx, userId: number, requestId: number): Promise<AcceptedAskCost | undefined> {
  const debits = await tx.select().from(tokenTransactions).where(and(eq(tokenTransactions.userId, userId), eq(tokenTransactions.role, "job_seeker"), eq(tokenTransactions.referenceType, "referral_request"), eq(tokenTransactions.referenceId, `${requestId}#1`), eq(tokenTransactions.kind, "credit_spend")));
  const debit = debits.find(row => row.tokenCount === -1 && row.source?.startsWith(sourcePrefix));
  if (!debit?.source) return undefined;
  const [, bucket, band] = debit.source.split(":");
  return acceptedAskCostSchema.parse({ units: 1, band, source: [{ bucket, units: 1, cycleKey: debit.sourceCycleKey }] });
}

/** Historical banded debits remain recoverable even after the sales switch is off. */
export async function refundBandedDebitTx(tx: LedgerTx, wallet: WalletRow, debit: typeof tokenTransactions.$inferSelect, now: Date): Promise<{ handled: boolean; restored: number; monthly: number }> {
  if (!debit.source?.startsWith(sourcePrefix)) return { handled: false, restored: 0, monthly: wallet.monthlyCreditsRemaining };
  const parsed = acceptedAskCostSchema.parse({ units: 1, band: debit.source.split(":")[2], source: [{ bucket: debit.source.split(":")[1], units: 1, cycleKey: debit.sourceCycleKey }] });
  const source = parsed.source[0];
  if (!source || debit.tokenCount !== -1) throw new CreditSpendConflictError();
  if (source.bucket === "free") {
    const monthly = source.cycleKey === wallet.monthlyCycleKey ? Math.min(wallet.monthlyAllowance, wallet.monthlyCreditsRemaining + 1) : wallet.monthlyCreditsRemaining;
    return { handled: true, restored: monthly - wallet.monthlyCreditsRemaining, monthly };
  }
  const balance = (await tx.select().from(bandedReferralBalances).where(and(eq(bandedReferralBalances.userId, wallet.userId), eq(bandedReferralBalances.level, parsed.band))).limit(1).for("update"))[0];
  if (!balance) throw new Error("Banded refund balance is missing; retry after recovery");
  const plan = activeBand(wallet, now);
  let eligible = false;
  if (source.bucket === "purchased") {
    if (debit.creditGrantId != null) {
      const [purchase] = await tx.select().from(tokenTransactions).where(eq(tokenTransactions.id, debit.creditGrantId)).limit(1);
      if (purchase) {
        const revocations = (await tx.select().from(tokenTransactions).where(and(eq(tokenTransactions.creditGrantId, purchase.id), eq(tokenTransactions.referenceType, "chargebee_refund")))).reduce((sum, r) => sum + Math.abs(r.tokenCount), 0);
        eligible = purchase.tokenCount > revocations;
      } else {
        eligible = true;
      }
    } else {
      eligible = true;
    }
  } else {
    eligible = plan !== null && bandIncludes(plan, parsed.band) && balance.includedCycleKey !== null && cycleIdentity(balance.includedCycleKey) === source.cycleKey && balance.includedExpiresAt !== null && balance.includedExpiresAt.getTime() > now.getTime();
  }
  if (!eligible) return { handled: true, restored: 0, monthly: wallet.monthlyCreditsRemaining };
  const patch = source.bucket === "included" ? { includedRemaining: balance.includedRemaining + 1 } : { purchasedRemaining: balance.purchasedRemaining + 1 };
  await tx.update(bandedReferralBalances).set(patch).where(and(eq(bandedReferralBalances.id, balance.id), eq(bandedReferralBalances.userId, wallet.userId)));
  return { handled: true, restored: 1, monthly: wallet.monthlyCreditsRemaining };
}
