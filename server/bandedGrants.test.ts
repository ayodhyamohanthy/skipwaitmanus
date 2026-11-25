import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  bandedIncludedCycleKey,
  bandedLedgerSource,
  type BandedCart,
} from "../shared/bandedGrants";
import {
  cancelBandedSubscriptionTx,
  fulfillBandedExtraReferralsTx,
  fulfillBandedPlanSubscriptionTx,
  refundBandedPurchaseTx,
  type BandedGrantDb,
} from "./bandedGrants";

// In-memory test mock for BandedGrantDb and LedgerTx
function createMockDb() {
  const intents: any[] = [];
  const balances: any[] = [];
  const counters: any[] = [
    { site: "test", planId: "early_to_mid", issuedCount: 0, reservedCount: 1 },
    { site: "test", planId: "mid_to_senior", issuedCount: 0, reservedCount: 0 },
    { site: "test", planId: "senior_to_executive", issuedCount: 100, reservedCount: 0 },
  ];
  const memberships: any[] = [];
  const wallets: any[] = [
    { id: 1, userId: 10, role: "job_seeker", plan: "free", monthlyCreditsRemaining: 3, balance: 0, subscriptionId: null, subscriptionStatus: null },
  ];
  const txns: any[] = [];
  const reviews: any[] = [];

  let nextId = 1;

  const mockDb: BandedGrantDb = {
    findIntent: async filter => {
      return intents.find(i =>
        i.site === filter.site &&
        (!filter.checkoutIntentId || i.checkoutIntentId === filter.checkoutIntentId) &&
        (!filter.hostedPageId || i.hostedPageId === filter.hostedPageId) &&
        (!filter.invoiceId || i.invoiceId === filter.invoiceId)
      ) || null;
    },
    updateIntent: async (id, patch) => {
      const intent = intents.find(i => i.id === id);
      if (intent) Object.assign(intent, patch);
    },
    getWallet: async (userId, role) => {
      return wallets.find(w => w.userId === userId && w.role === role) || null;
    },
    updateWallet: async (id, patch) => {
      const wallet = wallets.find(w => w.id === id);
      if (wallet) Object.assign(wallet, patch);
    },
    getCounter: async (site, planId) => {
      return counters.find(c => c.site === site && c.planId === planId) || null;
    },
    updateCounter: async (site, planId, patch) => {
      const counter = counters.find(c => c.site === site && c.planId === planId);
      if (counter) Object.assign(counter, patch);
    },
    getMembership: async filter => {
      return memberships.find(m =>
        m.site === filter.site &&
        (!filter.checkoutIntentId || m.checkoutIntentId === filter.checkoutIntentId) &&
        (!filter.subscriptionId || m.subscriptionId === filter.subscriptionId)
      ) || null;
    },
    updateMembership: async (id, patch) => {
      const mem = memberships.find(m => m.id === id);
      if (mem) Object.assign(mem, patch);
    },
    getLevelBalance: async (userId, level) => {
      return balances.find(b => b.userId === userId && b.level === level) || null;
    },
    upsertLevelBalance: async (userId, level, patch) => {
      let b = balances.find(row => row.userId === userId && row.level === level);
      if (!b) {
        b = { id: nextId++, userId, level, includedRemaining: 0, includedCycleKey: null, includedExpiresAt: null, purchasedRemaining: 0 };
        balances.push(b);
      }
      Object.assign(b, patch);
      return b;
    },
    insertLedgerRow: async row => {
      const id = nextId++;
      const inserted = { ...row, id, createdAt: new Date() };
      txns.push(inserted);
      return id;
    },
    listTransactions: async filter => {
      return txns.filter(t =>
        (!filter.userId || t.userId === filter.userId) &&
        (!filter.kind || t.kind === filter.kind) &&
        (!filter.referenceType || t.referenceType === filter.referenceType) &&
        (!filter.referenceIdPrefix || (t.referenceId && t.referenceId.startsWith(filter.referenceIdPrefix))) &&
        (!filter.creditGrantId || t.creditGrantId === filter.creditGrantId)
      );
    },
    enqueueReview: async review => {
      reviews.push(review);
    },
  };

  return { mockDb, intents, balances, counters, memberships, wallets, txns, reviews };
}

describe("server/bandedGrants core fulfillment", () => {
  it("fulfills a valid plan subscription, issuing founding place and granting included referrals", async () => {
    const { mockDb, intents, balances, counters, memberships, wallets, txns } = createMockDb();

    // Setup intent and reservation
    const cart: BandedCart = {
      kind: "plan",
      planId: "early_to_mid",
      itemPriceId: "skipwait_early_to_mid_monthly-INR",
      amount: 22900,
      currency: "INR",
      billingRoute: "IN",
    };
    intents.push({
      id: 1,
      site: "test",
      checkoutIntentId: "bp_123",
      userId: 10,
      kind: "plan",
      planId: "early_to_mid",
      billingRoute: "IN",
      currency: "INR",
      expectedTotal: 22900,
      cart,
      status: "pending",
    });
    memberships.push({
      id: 1,
      site: "test",
      planId: "early_to_mid",
      userId: 10,
      checkoutIntentId: "bp_123",
      status: "reserved",
      expiresAt: new Date(Date.now() + 100000),
    });

    const now = new Date("2026-11-23T12:00:00Z");
    const termStart = new Date("2026-11-23T12:00:00Z");
    const termEnd = new Date("2026-12-23T12:00:00Z");

    const result = await fulfillBandedPlanSubscriptionTx(mockDb, {
      site: "test",
      subscriptionId: "sub_early_1",
      checkoutIntentId: "bp_123",
      invoiceId: "inv_1",
      planId: "early_to_mid",
      userId: 10,
      currency: "INR",
      amount: 22900,
      currentTermStart: termStart,
      currentTermEnd: termEnd,
      now,
    });

    expect(result.status).toBe("applied");

    // Check membership and counter
    expect(memberships[0].status).toBe("issued");
    expect(memberships[0].issuedSequence).toBe(1);
    expect(counters[0].issuedCount).toBe(1);
    expect(counters[0].reservedCount).toBe(0);

    // Check wallet updated
    expect(wallets[0].plan).toBe("early_to_mid");
    expect(wallets[0].subscriptionId).toBe("sub_early_1");
    expect(wallets[0].subscriptionStatus).toBe("active");

    // Check included referral balances for Early to Mid (Early: 3, Mid: 1)
    const earlyBal = balances.find(b => b.level === "early");
    const midBal = balances.find(b => b.level === "mid");
    expect(earlyBal?.includedRemaining).toBe(3);
    expect(midBal?.includedRemaining).toBe(1);

    // Check ledger rows (2 plan_grant rows)
    const grantTxns = txns.filter(t => t.kind === "plan_grant");
    expect(grantTxns).toHaveLength(2);
    expect(grantTxns.find(t => t.source === "banded:included:early")?.tokenCount).toBe(3);
    expect(grantTxns.find(t => t.source === "banded:included:mid")?.tokenCount).toBe(1);

    // Idempotent replay with same term start skips duplicate grant
    const replay = await fulfillBandedPlanSubscriptionTx(mockDb, {
      site: "test",
      subscriptionId: "sub_early_1",
      checkoutIntentId: "bp_123",
      invoiceId: "inv_1",
      planId: "early_to_mid",
      userId: 10,
      currency: "INR",
      amount: 22900,
      currentTermStart: termStart,
      currentTermEnd: termEnd,
      now,
    });
    expect(replay.status).toBe("duplicate");
    expect(txns.filter(t => t.kind === "plan_grant")).toHaveLength(2);
  });

  it("parks for review when late payment arrives for a plan whose founding cap is full", async () => {
    const { mockDb, intents, counters, memberships, reviews } = createMockDb();

    // Plan with cap full (senior_to_executive cap is 100, issuedCount is 100)
    const cart: BandedCart = {
      kind: "plan",
      planId: "senior_to_executive",
      itemPriceId: "skipwait_senior_to_executive_monthly-USD",
      amount: 2599,
      currency: "USD",
      billingRoute: "INTL",
    };
    intents.push({
      id: 2,
      site: "test",
      checkoutIntentId: "bp_full",
      userId: 10,
      kind: "plan",
      planId: "senior_to_executive",
      billingRoute: "INTL",
      currency: "USD",
      expectedTotal: 2599,
      cart,
      status: "pending",
    });
    // Reservation was released before payment arrived
    memberships.push({
      id: 2,
      site: "test",
      planId: "senior_to_executive",
      userId: 10,
      checkoutIntentId: "bp_full",
      status: "released",
      expiresAt: new Date(Date.now() - 5000),
    });

    const result = await fulfillBandedPlanSubscriptionTx(mockDb, {
      site: "test",
      subscriptionId: "sub_late_1",
      checkoutIntentId: "bp_full",
      planId: "senior_to_executive",
      userId: 10,
      currency: "USD",
      amount: 2599,
      currentTermStart: new Date(),
      currentTermEnd: new Date(Date.now() + 30 * 86400000),
      now: new Date(),
    });

    expect(result.status).toBe("requires_review");
    expect(result.reason).toBe("founding_cap_exceeded");
    expect(reviews).toHaveLength(1);
    expect(counters.find(c => c.planId === "senior_to_executive")?.issuedCount).toBe(100);
  });

  it("fulfills extra referrals purchase and records keyed ledger rows", async () => {
    const { mockDb, intents, balances, txns } = createMockDb();

    const cart: BandedCart = {
      kind: "referral",
      quantity: 5,
      subtotal: 2000,
      discount: 200,
      total: 1800,
      currency: "USD",
      billingRoute: "INTL",
      lines: [
        { level: "mid", quantity: 3, unitAmount: 400, lineAmount: 1200 },
        { level: "senior", quantity: 2, unitAmount: 800, lineAmount: 1600 },
      ],
    };
    intents.push({
      id: 3,
      site: "test",
      checkoutIntentId: "br_extra_1",
      userId: 10,
      kind: "referral",
      planId: null,
      billingRoute: "INTL",
      currency: "USD",
      expectedTotal: 1800,
      cart,
      status: "pending",
    });

    const result = await fulfillBandedExtraReferralsTx(mockDb, {
      site: "test",
      invoiceId: "inv_extra_100",
      checkoutIntentId: "br_extra_1",
      userId: 10,
      currency: "USD",
      amount: 1800,
      now: new Date(),
    });

    expect(result.status).toBe("applied");

    const midBal = balances.find(b => b.level === "mid");
    const seniorBal = balances.find(b => b.level === "senior");
    expect(midBal?.purchasedRemaining).toBe(3);
    expect(seniorBal?.purchasedRemaining).toBe(2);

    const purchaseTxns = txns.filter(t => t.kind === "purchase");
    expect(purchaseTxns).toHaveLength(2);
    expect(purchaseTxns.find(t => t.source === "banded:purchased:mid")?.tokenCount).toBe(3);
    expect(purchaseTxns.find(t => t.source === "banded:purchased:senior")?.tokenCount).toBe(2);
  });

  it("revokes only unspent units upon provider refund and parks spent shortfall for review", async () => {
    const { mockDb, balances, txns, reviews } = createMockDb();

    // Seed a purchase of 4 mid referrals
    const purchaseTxId = await mockDb.insertLedgerRow({
      userId: 10,
      role: "job_seeker",
      tokenCount: 4,
      kind: "purchase",
      source: "banded:purchased:mid",
      referenceType: "chargebee_invoice",
      referenceId: "inv_ref_1:mid",
      idempotencyKey: "banded_purchase:test:inv_ref_1:mid",
      creditGrantId: null,
    });
    await mockDb.upsertLevelBalance(10, "mid", { purchasedRemaining: 3 });

    // 1 unit was spent with creditGrantId pointing to purchaseTxId
    await mockDb.insertLedgerRow({
      userId: 10,
      role: "job_seeker",
      tokenCount: -1,
      kind: "credit_spend",
      source: "banded:purchased:mid",
      referenceType: "referral_request",
      referenceId: "req_1#1",
      creditGrantId: purchaseTxId,
      idempotencyKey: "k_spend_1#1",
    });

    // Provider attempts to refund all 4 units
    const refundResult = await refundBandedPurchaseTx(mockDb, {
      site: "test",
      refundId: "ref_cb_999",
      invoiceId: "inv_ref_1",
      now: new Date(),
    });

    expect(refundResult.handled).toBe(true);
    expect(refundResult.revoked).toBe(3); // only the 3 unspent units are revoked

    // Balance decreased by 3 (from 3 down to 0)
    const midBal = await mockDb.getLevelBalance(10, "mid");
    expect(midBal?.purchasedRemaining).toBe(0);

    // Shortfall (1 unit already spent) is parked for billing review
    expect(reviews).toHaveLength(1);
    expect(reviews[0].reason).toBe("partial_refund_already_spent");
  });

  it("cancels subscription term removing unspent included balance while preserving purchased balance", async () => {
    const { mockDb, balances, wallets, txns } = createMockDb();

    wallets[0].plan = "early_to_mid";
    wallets[0].subscriptionId = "sub_to_cancel";
    wallets[0].subscriptionStatus = "active";

    // Setup active included cycle + purchased balance
    const cycleKey = bandedIncludedCycleKey("test", "sub_to_cancel", 10000, "early");
    await mockDb.upsertLevelBalance(10, "early", {
      includedRemaining: 2,
      includedCycleKey: cycleKey,
      includedExpiresAt: new Date(Date.now() + 100000),
      purchasedRemaining: 5,
    });

    const result = await cancelBandedSubscriptionTx(mockDb, {
      site: "test",
      subscriptionId: "sub_to_cancel",
      planId: "early_to_mid",
      userId: 10,
      now: new Date(),
    });

    expect(result.status).toBe("cancelled");
    expect(wallets[0].plan).toBe("free");
    expect(wallets[0].subscriptionStatus).toBe("cancelled");

    const bal = await mockDb.getLevelBalance(10, "early");
    expect(bal?.includedRemaining).toBe(0);
    expect(bal?.includedCycleKey).toBeNull();
    // Purchased balance preserved intact!
    expect(bal?.purchasedRemaining).toBe(5);

    // Ledger row for expiry of the 2 unspent included referrals
    const expiryTx = txns.find(t => t.kind === "plan_credit_expiry");
    expect(expiryTx?.tokenCount).toBe(-2);
    expect(expiryTx?.source).toBe("banded:included:early");
  });
});
