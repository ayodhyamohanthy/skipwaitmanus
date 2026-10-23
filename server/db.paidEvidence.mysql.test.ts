import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import { expect, it } from "vitest";

// D-155 paid evidence against an actual MySQL server: migration 0110 applies,
// the stamp lands on the wallet matched by provider subscriptionId, a
// redelivered event is a duplicate (unique key enforced by the server), and a
// payment recorded before the activation backfills on read. Explicit opt-in
// isolated fixture only. Never reads production application environment.
// Run with: D155_ISOLATED_MYSQL_URL=mysql://user:pass@127.0.0.1:34879 npx vitest run server/db.paidEvidence.mysql.test.ts
it.runIf(!!process.env.D155_ISOLATED_MYSQL_URL)("actual MySQL paid-evidence stamp, dedupe and out-of-order backfill", async () => {
  const url = process.env.D155_ISOLATED_MYSQL_URL;
  if (!url || !url.includes("127.0.0.1:34879")) throw new Error("Only isolated fixture allowed");
  const target = new URL(url);
  if (target.hostname !== "127.0.0.1" || target.port !== "34879" || (target.pathname && target.pathname !== "/" && !/^\/d155_paid_[a-zA-Z0-9_]+$/.test(target.pathname))) throw new Error("Explicit isolated paid-evidence database required");
  const database = `d155_paid_${randomBytes(8).toString("hex")}`;
  const admin = await mysql.createConnection(url);
  await admin.query(`CREATE DATABASE \`${database}\``);
  target.pathname = database;
  const pool = mysql.createPool({ uri: target.toString(), connectionLimit: 2, timezone: "Z", multipleStatements: true });
  try {
    // Minimal production-shaped tables (columns the evidence paths touch).
    await pool.query(`CREATE TABLE \`users\` (\`id\` int AUTO_INCREMENT NOT NULL PRIMARY KEY, \`email\` varchar(320) NULL)`);
    await pool.query(`CREATE TABLE \`tokenBalances\` (
      \`id\` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
      \`userId\` int NOT NULL,
      \`role\` enum('job_seeker','referrer') NOT NULL DEFAULT 'job_seeker',
      \`balance\` int NOT NULL DEFAULT 0,
      \`monthlyCreditsRemaining\` int NOT NULL DEFAULT 3,
      \`monthlyAllowance\` int NOT NULL DEFAULT 3,
      \`monthlyCycleKey\` varchar(16) NOT NULL DEFAULT 'legacy',
      \`cardValidatedAt\` timestamp NULL,
      \`plan\` enum('free','pro','max','start','momentum','land_100','land_200','land_500','keep_warm','land_focus','land_sprint','land_concierge') NOT NULL DEFAULT 'free',
      \`subscriptionId\` varchar(80) NULL,
      \`subscriptionStatus\` varchar(32) NULL,
      UNIQUE INDEX \`token_balances_user_role_unique\`(\`userId\`, \`role\`)
    )`);
    await pool.query(`CREATE TABLE \`subscriptionEvents\` (
      \`id\` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
      \`provider\` varchar(32) NOT NULL,
      \`providerEventId\` varchar(80) NOT NULL,
      \`subscriptionId\` varchar(80) NULL,
      \`resourceVersion\` bigint NULL,
      \`eventType\` varchar(80) NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE INDEX \`subscription_events_provider_event_unique\`(\`provider\`, \`providerEventId\`)
    )`);
    await pool.query(`CREATE TABLE \`paymentFulfillments\` (
      \`id\` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
      \`provider\` varchar(32) NOT NULL,
      \`providerEventId\` varchar(80) NOT NULL,
      \`userId\` int NOT NULL,
      \`role\` enum('job_seeker','referrer') NOT NULL DEFAULT 'job_seeker',
      \`tokenCount\` int NOT NULL,
      \`amount\` int NOT NULL,
      \`currency\` varchar(3) NOT NULL,
      \`status\` varchar(32) NOT NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE INDEX \`payment_fulfillments_provider_event_unique\`(\`provider\`, \`providerEventId\`)
    )`);

    // The migration under review applies twice without error (idempotent).
    const sql = await readFile("drizzle/deploy/0110_referral_paid_evidence.sql", "utf8");
    await pool.query(sql);
    await pool.query(sql);
    const [columns] = await pool.query<mysql.RowDataPacket[]>("SHOW COLUMNS FROM tokenBalances WHERE Field = 'lastPaidAt'");
    expect(columns).toHaveLength(1);

    // Drive the production code paths against this server.
    process.env.DATABASE_URL = target.toString();
    process.env.BILLING_ENV = "test"; process.env.CHARGEBEE_SITE = "fixture-test";
    const db = await import("./db");
    await pool.query(`INSERT INTO \`users\` (\`id\`, \`email\`) VALUES (7, 'seeker@example.invalid')`);
    await pool.query(`INSERT INTO \`tokenBalances\` (\`userId\`, \`role\`, \`plan\`, \`subscriptionId\`, \`subscriptionStatus\`) VALUES (7, 'job_seeker', 'fast_track', 'sub_123', 'active')`);

    const first = await db.recordSubscriptionPaymentEvidence({ eventId: "evt_pay_1", subscriptionId: "sub_123", occurredAt: new Date("2026-10-20T10:00:00Z") });
    expect(first).toEqual({ status: "recorded", reason: "stamped" });
    const [stamped] = await pool.query<mysql.RowDataPacket[]>("SELECT lastPaidAt FROM tokenBalances WHERE userId = 7");
    expect(new Date(stamped[0].lastPaidAt).toISOString()).toBe("2026-10-20T10:00:00.000Z");

    // Duplicate redelivery: server-enforced unique key path, stamp unmoved.
    const dup = await db.recordSubscriptionPaymentEvidence({ eventId: "evt_pay_1", subscriptionId: "sub_123", occurredAt: new Date("2026-10-21T10:00:00Z") });
    expect(dup).toEqual({ status: "duplicate" });
    const [afterDup] = await pool.query<mysql.RowDataPacket[]>("SELECT lastPaidAt FROM tokenBalances WHERE userId = 7");
    expect(new Date(afterDup[0].lastPaidAt).toISOString()).toBe("2026-10-20T10:00:00.000Z");

    // Gate reads the stamp.
    await expect(db.hasUserMadePayment(7)).resolves.toBe(true);

    // Out-of-order: a payment recorded for a subscription with no linked
    // wallet yet backfills once the wallet carries that subscriptionId.
    await pool.query(`INSERT INTO \`users\` (\`id\`, \`email\`) VALUES (8, 'late@example.invalid')`);
    await pool.query(`INSERT INTO \`tokenBalances\` (\`userId\`, \`role\`, \`plan\`) VALUES (8, 'job_seeker', 'free')`);
    const early = await db.recordSubscriptionPaymentEvidence({ eventId: "evt_pay_9", subscriptionId: "sub_late", occurredAt: new Date("2026-10-19T10:00:00Z") });
    expect(early).toEqual({ status: "recorded", reason: "wallet_not_linked_yet" });
    await expect(db.hasUserMadePayment(8)).resolves.toBe(false);
    await pool.query(`UPDATE \`tokenBalances\` SET \`subscriptionId\` = 'sub_late', \`subscriptionStatus\` = 'active' WHERE \`userId\` = 8`);
    await expect(db.hasUserMadePayment(8)).resolves.toBe(true);
    const [backfilled] = await pool.query<mysql.RowDataPacket[]>("SELECT lastPaidAt FROM tokenBalances WHERE userId = 8");
    expect(backfilled[0].lastPaidAt).not.toBeNull();

    // Gate: credited fulfillment unlocks; refunded-only, pending and
    // activation-alone do not.
    await pool.query(`INSERT INTO \`users\` (\`id\`, \`email\`) VALUES (9, 'refunded@example.invalid'), (10, 'pending@example.invalid'), (11, 'active-only@example.invalid')`);
    await pool.query(`INSERT INTO \`tokenBalances\` (\`userId\`, \`role\`, \`plan\`, \`subscriptionId\`, \`subscriptionStatus\`) VALUES (9, 'job_seeker', 'free', NULL, NULL), (10, 'job_seeker', 'free', NULL, NULL), (11, 'job_seeker', 'fast_track', 'sub_no_pay', 'active')`);
    await pool.query(`INSERT INTO \`paymentFulfillments\` (\`provider\`, \`providerEventId\`, \`userId\`, \`role\`, \`tokenCount\`, \`amount\`, \`currency\`, \`status\`) VALUES
      ('chargebee', 'evt_ref_1', 9, 'job_seeker', 5, 50000, 'INR', 'refunded'),
      ('chargebee', 'evt_pen_1', 10, 'job_seeker', 5, 50000, 'INR', 'pending')`);
    await expect(db.hasUserMadePayment(9)).resolves.toBe(false);
    await expect(db.hasUserMadePayment(10)).resolves.toBe(false);
    await expect(db.hasUserMadePayment(11)).resolves.toBe(false);
    await pool.query(`UPDATE \`paymentFulfillments\` SET \`status\` = 'credited' WHERE \`userId\` = 10`);
    await expect(db.hasUserMadePayment(10)).resolves.toBe(true);
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
    delete process.env.DATABASE_URL;
  }
});
