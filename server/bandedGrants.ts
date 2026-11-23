/**
 * BANDED-grants (D-219, D-366 (3), D-367, D-370): core fulfillment transactions.
 *
 * Rules:
 *  1. Plan term grants each level's included referrals for the cycle (no carry-forward).
 *  2. Paid extra referrals credit purchased referrals once into the ledger lots.
 *  3. Refunds take back only unspent purchased referrals; spent shortfall is parked for review.
 *  4. Term expiry/cancellation removes only unspent included amount; free allowance and
 *     purchased referrals stay intact.
 *  5. Late payments on released founding reservations never oversell the cap: issue only if
 *     counter can safely accommodate it, otherwise park for review/refund without an invented price.
 */
import {
  bandedIncludedCycleKey,
  bandedIncludedReferralsForPlan,
  bandedLedgerSource,
  bandedReferralCartSchema,
  type BandedCart,
  type BandedCurrency,
  type BandedSite,
} from "../shared/bandedGrants";
import {
  bandLevels,
  planFamilyEntry,
  REFERRAL_LEVELS,
  type PlanFamilyId,
  type ReferralLevel,
} from "../shared/planFamily";
import { digest } from "./creditLedger";

export const cycleIdentity = (key: string) => digest("banded-cycle", key).slice(0, 16);

export interface BandedGrantDb {
  findIntent(filter: { site: BandedSite; checkoutIntentId?: string; hostedPageId?: string; invoiceId?: string }): Promise<any | null>;
  updateIntent(id: number, patch: Record<string, unknown>): Promise<void>;
  getWallet(userId: number, role: "job_seeker" | "referrer"): Promise<any | null>;
  updateWallet(id: number, patch: Record<string, unknown>): Promise<void>;
  getCounter(site: BandedSite, planId: PlanFamilyId): Promise<any | null>;
  updateCounter(site: BandedSite, planId: PlanFamilyId, patch: Record<string, unknown>): Promise<void>;
  getMembership(filter: { site: BandedSite; checkoutIntentId?: string; subscriptionId?: string }): Promise<any | null>;
  updateMembership(id: number, patch: Record<string, unknown>): Promise<void>;
  getLevelBalance(userId: number, level: ReferralLevel): Promise<any | null>;
  upsertLevelBalance(userId: number, level: ReferralLevel, patch: Record<string, unknown>): Promise<any>;
  insertLedgerRow(row: Record<string, unknown>): Promise<number>;
  listTransactions(filter: { userId?: number; kind?: string; referenceType?: string; referenceIdPrefix?: string; creditGrantId?: number }): Promise<any[]>;
  enqueueReview(review: { eventId?: string; eventType?: string; subscriptionId?: string; itemPriceId?: string; reason: string; metadata?: Record<string, unknown> }): Promise<void>;
}

export interface FulfillBandedPlanInput {
  site: BandedSite;
  subscriptionId: string;
  checkoutIntentId?: string;
  hostedPageId?: string;
  invoiceId?: string;
  planId: PlanFamilyId;
  userId: number;
  currency: BandedCurrency;
  amount: number;
  currentTermStart: Date;
  currentTermEnd: Date;
  now: Date;
}

export interface FulfillBandedExtraInput {
  site: BandedSite;
  invoiceId: string;
  checkoutIntentId?: string;
  hostedPageId?: string;
  userId: number;
  currency: BandedCurrency;
  amount: number;
  now: Date;
}

export interface RefundBandedPurchaseInput {
  site: BandedSite;
  refundId: string;
  invoiceId: string;
  amount?: number;
  now: Date;
}

export interface CancelBandedSubscriptionInput {
  site: BandedSite;
  subscriptionId: string;
  planId?: PlanFamilyId;
  userId?: number;
  now: Date;
}

export async function fulfillBandedPlanSubscriptionTx(
  db: BandedGrantDb,
  input: FulfillBandedPlanInput
): Promise<{ status: "applied" | "duplicate" | "requires_review"; plan?: PlanFamilyId; reason?: string }> {
  // 1. Check intent if checkout identifiers are supplied
  let intent: any = null;
  if (input.checkoutIntentId || input.hostedPageId) {
    intent = await db.findIntent({
      site: input.site,
      checkoutIntentId: input.checkoutIntentId,
      hostedPageId: input.hostedPageId,
    });
    if (intent) {
      if (
        intent.userId !== input.userId ||
        intent.planId !== input.planId ||
        intent.currency !== input.currency ||
        intent.expectedTotal !== input.amount
      ) {
        await db.enqueueReview({
          subscriptionId: input.subscriptionId,
          reason: "intent_mismatch",
          metadata: { intentId: intent.id, expected: intent.expectedTotal, received: input.amount },
        });
        return { status: "requires_review", reason: "intent_mismatch" };
      }
    }
  }

  // 2. Founding membership and counter handling
  const cap = planFamilyEntry(input.planId).foundingCap;
  let membership: any = null;
  if (input.checkoutIntentId) {
    membership = await db.getMembership({ site: input.site, checkoutIntentId: input.checkoutIntentId });
  }
  if (!membership && input.subscriptionId) {
    membership = await db.getMembership({ site: input.site, subscriptionId: input.subscriptionId });
  }

  if (membership) {
    const counter = await db.getCounter(input.site, input.planId);
    if (!counter) {
      throw new Error(`Founding counter missing for ${input.site}/${input.planId}`);
    }

    if (membership.status === "reserved") {
      const nextSequence = counter.issuedCount + 1;
      if (nextSequence > cap) {
        await db.enqueueReview({
          subscriptionId: input.subscriptionId,
          reason: "founding_cap_exceeded",
        });
        return { status: "requires_review", reason: "founding_cap_exceeded" };
      }
      await db.updateMembership(membership.id, {
        status: "issued",
        issuedSequence: nextSequence,
        issuedAt: input.now,
        subscriptionId: input.subscriptionId,
      });
      await db.updateCounter(input.site, input.planId, {
        issuedCount: counter.issuedCount + 1,
        reservedCount: Math.max(0, counter.reservedCount - 1),
        updatedAt: input.now,
      });
    } else if (membership.status === "released") {
      // Late payment: issue only if locked counter can safely accommodate it
      if (counter.issuedCount >= cap) {
        await db.enqueueReview({
          subscriptionId: input.subscriptionId,
          reason: "founding_cap_exceeded",
        });
        return { status: "requires_review", reason: "founding_cap_exceeded" };
      }
      const nextSequence = counter.issuedCount + 1;
      await db.updateMembership(membership.id, {
        status: "issued",
        issuedSequence: nextSequence,
        issuedAt: input.now,
        subscriptionId: input.subscriptionId,
        releasedAt: null,
      });
      await db.updateCounter(input.site, input.planId, {
        issuedCount: counter.issuedCount + 1,
        updatedAt: input.now,
      });
    }
  }

  // 3. Update user wallet
  const wallet = await db.getWallet(input.userId, "job_seeker");
  if (!wallet) throw new Error(`User wallet missing for user ${input.userId}`);
  await db.updateWallet(wallet.id, {
    plan: input.planId,
    subscriptionId: input.subscriptionId,
    subscriptionStatus: "active",
    subscriptionCurrentTermStart: input.currentTermStart,
    subscriptionCurrentTermEnd: input.currentTermEnd,
  });

  // 4. Included referral grants
  const included = bandedIncludedReferralsForPlan(input.planId);
  let grantedAny = false;
  for (const { level, count } of included) {
    const cycleKey = bandedIncludedCycleKey(input.site, input.subscriptionId, input.currentTermStart, level);
    const balance = await db.getLevelBalance(input.userId, level);

    // Skip if already granted for this cycle or if newer term active
    if (balance?.includedCycleKey === cycleKey) {
      continue;
    }
    if (balance?.includedExpiresAt && balance.includedExpiresAt > input.currentTermEnd) {
      continue;
    }

    grantedAny = true;
    await db.upsertLevelBalance(input.userId, level, {
      includedRemaining: count,
      includedCycleKey: cycleKey,
      includedExpiresAt: input.currentTermEnd,
      updatedAt: input.now,
    });

    await db.insertLedgerRow({
      userId: input.userId,
      role: "job_seeker",
      tokenCount: count,
      kind: "plan_grant",
      source: bandedLedgerSource.included(level),
      sourceCycleKey: cycleIdentity(cycleKey),
      referenceType: "subscription_term",
      referenceId: `${input.subscriptionId}:${level}:${input.currentTermStart.getTime()}`,
      idempotencyKey: `banded_grant:${input.site}:${input.subscriptionId}:${input.currentTermStart.getTime()}:${level}`,
      balanceAfter: wallet.balance,
      monthlyCreditsAfter: wallet.monthlyCreditsRemaining,
    });
  }

  // 5. Update intent if present
  if (intent) {
    await db.updateIntent(intent.id, {
      status: "fulfilled",
      subscriptionId: input.subscriptionId,
      invoiceId: input.invoiceId ?? intent.invoiceId,
      fulfilledAt: input.now,
      updatedAt: input.now,
    });
  }

  return {
    status: grantedAny || !intent || intent.status !== "fulfilled" ? "applied" : "duplicate",
    plan: input.planId,
  };
}

export async function fulfillBandedExtraReferralsTx(
  db: BandedGrantDb,
  input: FulfillBandedExtraInput
): Promise<{ status: "applied" | "duplicate" | "requires_review"; lines?: any[]; reason?: string }> {
  // 1. Locate and validate intent
  let intent: any = null;
  if (input.checkoutIntentId) {
    intent = await db.findIntent({ site: input.site, checkoutIntentId: input.checkoutIntentId });
  }
  if (!intent && input.hostedPageId) {
    intent = await db.findIntent({ site: input.site, hostedPageId: input.hostedPageId });
  }
  if (!intent && input.invoiceId) {
    intent = await db.findIntent({ site: input.site, invoiceId: input.invoiceId });
  }

  if (!intent) {
    await db.enqueueReview({
      reason: "intent_not_found",
      metadata: { invoiceId: input.invoiceId, checkoutIntentId: input.checkoutIntentId },
    });
    return { status: "requires_review", reason: "intent_not_found" };
  }

  if (intent.status === "fulfilled" && intent.invoiceId === input.invoiceId) {
    return { status: "duplicate" };
  }

  if (intent.currency !== input.currency || intent.expectedTotal !== input.amount) {
    await db.enqueueReview({
      reason: "amount_mismatch",
      metadata: { expected: intent.expectedTotal, received: input.amount },
    });
    return { status: "requires_review", reason: "amount_mismatch" };
  }

  const parsedCart = bandedReferralCartSchema.safeParse(intent.cart);
  if (!parsedCart.success) {
    await db.enqueueReview({
      reason: "invalid_cart_json",
      metadata: { intentId: intent.id },
    });
    return { status: "requires_review", reason: "invalid_cart_json" };
  }

  const wallet = await db.getWallet(input.userId, "job_seeker");
  if (!wallet) throw new Error(`User wallet missing for user ${input.userId}`);

  // 2. Fulfill each line in cart
  for (const line of parsedCart.data.lines) {
    const balance = await db.getLevelBalance(input.userId, line.level);
    const currentPurchased = balance?.purchasedRemaining ?? 0;
    await db.upsertLevelBalance(input.userId, line.level, {
      purchasedRemaining: currentPurchased + line.quantity,
      updatedAt: input.now,
    });

    await db.insertLedgerRow({
      userId: input.userId,
      role: "job_seeker",
      tokenCount: line.quantity,
      kind: "purchase",
      source: bandedLedgerSource.purchased(line.level),
      sourceCycleKey: null,
      referenceType: "chargebee_invoice",
      referenceId: `${input.invoiceId}:${line.level}`,
      idempotencyKey: `banded_purchase:${input.site}:${input.invoiceId}:${line.level}`,
      creditGrantId: null,
      balanceAfter: wallet.balance,
      monthlyCreditsAfter: wallet.monthlyCreditsRemaining,
    });
  }

  // 3. Mark intent fulfilled
  await db.updateIntent(intent.id, {
    status: "fulfilled",
    invoiceId: input.invoiceId,
    fulfilledAt: input.now,
    updatedAt: input.now,
  });

  return { status: "applied", lines: parsedCart.data.lines };
}

export async function refundBandedPurchaseTx(
  db: BandedGrantDb,
  input: RefundBandedPurchaseInput
): Promise<{ handled: boolean; revoked: number; reason?: string }> {
  // 1. Find all purchase rows for this invoice
  const purchaseRows = await db.listTransactions({
    referenceType: "chargebee_invoice",
    referenceIdPrefix: `${input.invoiceId}:`,
    kind: "purchase",
  });

  if (purchaseRows.length === 0) {
    return { handled: false, revoked: 0, reason: "unknown_invoice" };
  }

  let totalRevoked = 0;
  for (const purchase of purchaseRows) {
    const parts = purchase.referenceId.split(":");
    const level = parts[1] as ReferralLevel;
    const granted = purchase.tokenCount;

    // Sum debits spent against this purchase
    const debits = await db.listTransactions({
      creditGrantId: purchase.id,
      kind: "credit_spend",
    });
    const spentUnits = debits.reduce((sum, d) => sum + Math.abs(d.tokenCount), 0);

    // Sum prior refunds against this purchase
    const priorRefunds = await db.listTransactions({
      creditGrantId: purchase.id,
      kind: "withdrawal_refund",
    });
    const priorRevokedUnits = priorRefunds.reduce((sum, r) => sum + Math.abs(r.tokenCount), 0);

    const availableUnspent = Math.max(0, granted - spentUnits - priorRevokedUnits);
    const revokedUnits = availableUnspent; // revoke whatever unspent remains

    if (revokedUnits > 0) {
      const balance = await db.getLevelBalance(purchase.userId, level);
      const current = balance?.purchasedRemaining ?? 0;
      await db.upsertLevelBalance(purchase.userId, level, {
        purchasedRemaining: Math.max(0, current - revokedUnits),
        updatedAt: input.now,
      });

      await db.insertLedgerRow({
        userId: purchase.userId,
        role: "job_seeker",
        tokenCount: -revokedUnits,
        kind: "withdrawal_refund",
        source: bandedLedgerSource.refund(level),
        creditGrantId: purchase.id,
        referenceType: "chargebee_refund",
        referenceId: `${input.refundId}:${level}`,
        idempotencyKey: `banded_refund:${input.site}:${input.refundId}:${level}`,
      });
      totalRevoked += revokedUnits;
    }

    // Shortfall check: if spent units prevented full revocation
    if (spentUnits > 0) {
      await db.enqueueReview({
        reason: "partial_refund_already_spent",
        metadata: {
          invoiceId: input.invoiceId,
          refundId: input.refundId,
          level,
          granted,
          spent: spentUnits,
          revoked: revokedUnits,
        },
      });
    }
  }

  return { handled: true, revoked: totalRevoked };
}

export async function cancelBandedSubscriptionTx(
  db: BandedGrantDb,
  input: CancelBandedSubscriptionInput
): Promise<{ status: "cancelled" }> {
  let userId = input.userId;
  let planId = input.planId;
  if (!userId || !planId) {
    const membership = await db.getMembership({ site: input.site, subscriptionId: input.subscriptionId });
    if (membership) {
      userId = userId ?? membership.userId;
      planId = planId ?? (membership.planId as PlanFamilyId);
    }
  }

  // 1. Remove included referrals for this subscription
  const levels = planId ? bandLevels(planId) : REFERRAL_LEVELS;
  if (userId) {
    for (const level of levels) {
      const balance = await db.getLevelBalance(userId, level);
      if (balance?.includedCycleKey && balance.includedCycleKey.includes(input.subscriptionId)) {
        const unspent = balance.includedRemaining;
        await db.upsertLevelBalance(userId, level, {
          includedRemaining: 0,
          includedCycleKey: null,
          includedExpiresAt: null,
          updatedAt: input.now,
        });

        if (unspent > 0) {
          await db.insertLedgerRow({
            userId,
            role: "job_seeker",
            tokenCount: -unspent,
            kind: "plan_credit_expiry",
            source: bandedLedgerSource.included(level),
            sourceCycleKey: null,
            referenceType: "subscription_cancellation",
            referenceId: `${input.subscriptionId}:${level}`,
            idempotencyKey: `banded_cancel:${input.site}:${input.subscriptionId}:${level}`,
          });
        }
      }
    }

    // 2. Reset wallet
    const wallet = await db.getWallet(userId, "job_seeker");
    if (wallet && wallet.subscriptionId === input.subscriptionId) {
      await db.updateWallet(wallet.id, {
        plan: "free",
        subscriptionStatus: "cancelled",
        subscriptionCancelledAt: input.now,
      });
    }
  }

  return { status: "cancelled" };
}
