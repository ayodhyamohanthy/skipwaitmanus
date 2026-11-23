// BANDED-grants (D-219, D-366, D-367, D-370): real MySQL fulfillment proof for banded
// plan subscription grants, founding cap enforcement, extra referrals fulfillment, spend
// attribution to purchase lots, and revocation on refund.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import mysql, { type Connection } from "mysql2/promise";
import { expect, test } from "playwright/test";
import { drizzle } from "drizzle-orm/mysql2";
import {
  cancelBandedSubscriptionTx,
  fulfillBandedExtraReferralsTx,
  fulfillBandedPlanSubscriptionTx,
  refundBandedPurchaseTx,
} from "../server/bandedGrants";
import { drizzleBandedGrantDb } from "../server/bandedGrantStore";
import { spendBandedReferralTx } from "../server/bandedSpend";
import { bandedIntentFingerprint, type BandedCart } from "../shared/bandedGrants";
import { bandedReferralItemPriceId } from "../shared/bandedCatalog";
import {
  bandedCheckoutIntents,
  bandedFoundingCounters,
  bandedFoundingMemberships,
  bandedReferralBalances,
  tokenBalances,
  tokenTransactions,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";

const migration0123Url = new URL("../drizzle/deploy/0123_banded_plans.sql", import.meta.url);
const migration0124Url = new URL("../drizzle/deploy/0124_banded_checkout_intents.sql", import.meta.url);

interface Fixture {
  db: Connection;
  connect: () => Promise<Connection>;
}

async function withDatabase(run: (fixture: Fixture) => Promise<void>) {
  const url = new URL(process.env.E2E_DATABASE_URL || "mysql://root:e2e@127.0.0.1:3306/skipwait");
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("Banded grants proof refuses a non-local database");
  }
  const options = {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    multipleStatements: true,
  };
  const database = `sw_grants_${randomUUID().replaceAll("-", "")}`;
  const admin = await mysql.createConnection(options);
  let db: Connection | undefined;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE \`${database}\``);
    created = true;
    db = await mysql.createConnection({ ...options, database });
    await db.query("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION'");
    await db.query(`
      CREATE TABLE users (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, name varchar(100) NULL);
      CREATE TABLE tokenBalances (
        id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId int NOT NULL,
        role ENUM('job_seeker','referrer') NOT NULL DEFAULT 'job_seeker',
        plan ENUM('free','pro','max','start','momentum','land_100','land_200','land_500','keep_warm','land_focus','land_sprint','land_concierge') NOT NULL DEFAULT 'free',
        balance int NOT NULL DEFAULT 0,
        monthlyAllowance int NOT NULL DEFAULT 3,
        monthlyCreditsRemaining int NOT NULL DEFAULT 3,
        monthlyCycleKey varchar(32) NULL,
        cardValidatedAt timestamp NULL,
        subscriptionId varchar(80) NULL,
        subscriptionStatus varchar(32) NULL,
        subscriptionCurrency varchar(3) NULL,
        subscriptionCurrentTermStart datetime NULL,
        subscriptionCurrentTermEnd datetime NULL,
        subscriptionResourceVersion int NULL,
        subscriptionItemPriceId varchar(100) NULL,
        subscriptionBillingPeriod varchar(32) NULL,
        subscriptionAmount int NULL,
        pendingPlan varchar(32) NULL,
        pendingBillingPeriod varchar(32) NULL,
        pendingPlanEffectiveAt timestamp NULL,
        subscriptionPauseAt timestamp NULL,
        subscriptionResumeAt timestamp NULL,
        paymentDueSince timestamp NULL,
        paymentDueInvoiceId varchar(80) NULL,
        paymentDueAmount int NULL,
        paymentNextRetryAt timestamp NULL,
        paymentFailureReason varchar(32) NULL,
        paymentRetryRequestedAt timestamp NULL,
        trialStartedAt timestamp NULL,
        trialEndsAt timestamp NULL,
        lastPaidAt datetime NULL,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY token_balances_user_role_unique (userId, role)
      );
      CREATE TABLE subscriptionCheckoutIntents (
        id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId int NOT NULL,
        role ENUM('job_seeker','referrer') NOT NULL DEFAULT 'job_seeker',
        plan ENUM('pro','max','start','momentum','land_100','land_200','land_500','keep_warm','land_focus','land_sprint','land_concierge') NOT NULL,
        itemPriceId varchar(80) NOT NULL,
        hostedPageId varchar(80) NOT NULL,
        checkoutIntentId varchar(96) NOT NULL,
        amount int NOT NULL,
        currency varchar(8) NOT NULL,
        status varchar(32) NOT NULL,
        billingPeriod varchar(32) NOT NULL DEFAULT 'monthly',
        kind varchar(32) NOT NULL DEFAULT 'new'
      );
      CREATE TABLE tokenTransactions (
        id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId int NOT NULL,
        role ENUM('job_seeker','referrer') NOT NULL DEFAULT 'job_seeker',
        tokenCount int NOT NULL,
        kind varchar(40) NOT NULL,
        source varchar(64) NULL,
        sourceCycleKey varchar(32) NULL,
        referenceType varchar(40) NULL,
        referenceId varchar(80) NULL,
        idempotencyKey varchar(80) NULL,
        creditGrantId int NULL,
        reversesTransactionId int NULL,
        rewardStatus varchar(32) NULL,
        qualifiedByType varchar(40) NULL,
        qualifiedById varchar(80) NULL,
        qualifiedAt timestamp NULL,
        balanceAfter int NULL,
        monthlyCreditsAfter int NULL,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE billingReviewOutbox (
        id int NOT NULL AUTO_INCREMENT PRIMARY KEY,
        obligationKey varchar(128) NOT NULL,
        eventId varchar(80) NULL,
        eventType varchar(80) NULL,
        subscriptionId varchar(80) NULL,
        invoiceId varchar(80) NULL,
        reason varchar(64) NOT NULL,
        metadata json NULL,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY billing_review_outbox_obligation_unique (obligationKey)
      );
      INSERT INTO users (id, name) VALUES (1, 'Seeker One'), (2, 'Seeker Two');
      INSERT INTO tokenBalances (userId, role, plan, balance, monthlyAllowance, monthlyCreditsRemaining) VALUES (1, 'job_seeker', 'free', 0, 3, 3);
    `);
    await db.query(readFileSync(migration0123Url, "utf8"));
    await db.query(readFileSync(migration0124Url, "utf8"));
    await run({ db, connect: () => mysql.createConnection({ ...options, database }) });
  } finally {
    try {
      if (db) await db.end();
    } finally {
      try {
        if (created) await admin.query(`DROP DATABASE \`${database}\``);
      } finally {
        await admin.end();
      }
    }
  }
}

test("BANDED-grants real-MySQL fulfillment: subscription grants and founding place issued", async () => {
  await withDatabase(async ({ db }) => {
    const d = drizzle(db);
    const now = new Date("2026-11-23T10:00:00.000Z");
    const termStart = new Date("2026-11-23T00:00:00.000Z");
    const termEnd = new Date("2026-12-23T00:00:00.000Z");
    const checkoutIntentId = "bp_test_intent_001";
    const subscriptionId = "sub_test_001";

    // 1. Reserve founding place
    await d.insert(bandedFoundingMemberships).values({
      site: "test",
      planId: "early_to_mid",
      userId: 1,
      checkoutIntentId,
      status: "reserved",
      expiresAt: new Date(now.getTime() + 6 * 3600_000),
      createdAt: now,
    });
    await d.update(bandedFoundingCounters).set({ reservedCount: 1 }).where(eq(bandedFoundingCounters.planId, "early_to_mid"));

    // 2. Fulfill plan subscription
    const outcome = await d.transaction(async tx => {
      const grantDb = drizzleBandedGrantDb(tx);
      return fulfillBandedPlanSubscriptionTx(grantDb, {
        site: "test",
        userId: 1,
        subscriptionId,
        planId: "early_to_mid",
        checkoutIntentId,
        currentTermStart: termStart,
        currentTermEnd: termEnd,
        now,
      });
    });

    expect(outcome.status).toBe("applied");

    // Founding place sequence issued
    const [membership] = await d.select().from(bandedFoundingMemberships).where(eq(bandedFoundingMemberships.checkoutIntentId, checkoutIntentId));
    expect(membership.status).toBe("issued");
    expect(membership.issuedSequence).toBe(1);

    // Included balances granted (3 early, 1 mid for early_to_mid)
    const balances = await d.select().from(bandedReferralBalances).where(eq(bandedReferralBalances.userId, 1));
    const earlyBalance = balances.find(b => b.level === "early");
    const midBalance = balances.find(b => b.level === "mid");
    expect(earlyBalance?.includedRemaining).toBe(3);
    expect(midBalance?.includedRemaining).toBe(1);

    // Cancel removes unspent included
    await d.transaction(async tx => {
      const grantDb = drizzleBandedGrantDb(tx);
      await cancelBandedSubscriptionTx(grantDb, {
        site: "test",
        subscriptionId,
        userId: 1,
        planId: "early_to_mid",
        now: new Date(now.getTime() + 86_400_000),
      });
    });

    const afterCancel = await d.select().from(bandedReferralBalances).where(eq(bandedReferralBalances.userId, 1));
    expect(afterCancel.find(b => b.level === "early")?.includedRemaining).toBe(0);
    expect(afterCancel.find(b => b.level === "mid")?.includedRemaining).toBe(0);
  });
});

test("BANDED-grants real-MySQL fulfillment: extra referrals fulfillment, spend attribution, and refund revocation", async () => {
  await withDatabase(async ({ db }) => {
    const d = drizzle(db);
    const now = new Date("2026-11-23T10:00:00.000Z");
    const checkoutIntentId = "br_test_intent_002";
    const invoiceId = "inv_test_002";

    const cart: BandedCart = {
      kind: "referral",
      currency: "INR",
      lines: [
        {
          level: "early",
          quantity: 2,
          itemPriceId: bandedReferralItemPriceId("early", "INR"),
          unitAmount: 149900,
          amount: 299800,
        },
      ],
      subtotal: 299800,
      total: 299800,
    };

    // Insert intent
    await d.insert(bandedCheckoutIntents).values({
      site: "test",
      checkoutIntentId,
      hostedPageId: "hp_test_002",
      userId: 1,
      kind: "referral",
      planId: "early_to_mid",
      billingRoute: "IN",
      currency: "INR",
      expectedTotal: 299800,
      fingerprint: bandedIntentFingerprint(cart),
      cart,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 6 * 3600_000),
      replayDeadline: new Date(now.getTime() + 25 * 60_000),
    });

    // 1. Fulfill extra referrals
    const outcome = await d.transaction(async tx => {
      const grantDb = drizzleBandedGrantDb(tx);
      return fulfillBandedExtraReferralsTx(grantDb, {
        site: "test",
        userId: 1,
        checkoutIntentId,
        invoiceId,
        amount: 299800,
        currency: "INR",
        now,
      });
    });

    expect(outcome.status).toBe("applied");

    const [balance] = await d.select().from(bandedReferralBalances).where(eq(bandedReferralBalances.userId, 1));
    expect(balance.purchasedRemaining).toBe(2);

    const [purchaseTx] = await d.select().from(tokenTransactions).where(eq(tokenTransactions.kind, "purchase"));
    expect(purchaseTx.tokenCount).toBe(2);
    expect(purchaseTx.source).toBe("banded:purchased:early");

    // 2. Spend 1 purchased referral and verify creditGrantId attribution
    await d.transaction(async tx => {
      const [wallet] = await tx.select().from(tokenBalances).where(eq(tokenBalances.userId, 1)).limit(1).for("update");
      await spendBandedReferralTx(tx as any, {
        wallet: wallet as any,
        level: 2, // Early
        now,
        meta: {
          idempotencyKey: "spend-key-001",
          referenceType: "referral_request",
          referenceId: "101",
        },
      });
    });

    const [spendTx] = await d.select().from(tokenTransactions).where(eq(tokenTransactions.kind, "credit_spend"));
    expect(spendTx.tokenCount).toBe(-1);
    expect(spendTx.creditGrantId).toBe(purchaseTx.id);

    // Balance now has 1 purchased remaining
    const [balanceAfterSpend] = await d.select().from(bandedReferralBalances).where(eq(bandedReferralBalances.userId, 1));
    expect(balanceAfterSpend.purchasedRemaining).toBe(1);

    // 3. Provider refund of the invoice: revokes unspent units only (1 unit revoked, 1 spent shortfall parked)
    const refundOutcome = await d.transaction(async tx => {
      const grantDb = drizzleBandedGrantDb(tx);
      return refundBandedPurchaseTx(grantDb, {
        site: "test",
        invoiceId,
        refundId: "ref_test_002",
        now,
      });
    });

    expect(refundOutcome.handled).toBe(true);
    expect(refundOutcome.revoked).toBe(1);

    // Balance now 0 purchased remaining
    const [balanceAfterRefund] = await d.select().from(bandedReferralBalances).where(eq(bandedReferralBalances.userId, 1));
    expect(balanceAfterRefund.purchasedRemaining).toBe(0);
  });
});
