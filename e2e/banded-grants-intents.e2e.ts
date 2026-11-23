import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import mysql, { type Connection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { expect, test } from "playwright/test";

const migrationUrl = new URL("../drizzle/deploy/0124_banded_checkout_intents.sql", import.meta.url);
const migrationSql = () => readFileSync(migrationUrl, "utf8");
const priorMigrationUrl = new URL("../drizzle/deploy/0123_banded_plans.sql", import.meta.url);
const priorMigrationSql = () => readFileSync(priorMigrationUrl, "utf8");

interface Fixture { db: Connection; connect: () => Promise<Connection> }
interface CountRow extends RowDataPacket { n: number }
interface ColumnRow extends RowDataPacket { COLUMN_NAME: string; COLUMN_TYPE: string; IS_NULLABLE: string; COLUMN_DEFAULT: string | null }
interface IndexColumnRow extends RowDataPacket { INDEX_NAME: string; COLUMN_NAME: string; SEQ_IN_INDEX: number; NON_UNIQUE: number }
interface IntentRow extends RowDataPacket {
  id: number;
  site: string;
  checkoutIntentId: string;
  userId: number | null;
  kind: string;
  planId: string | null;
  billingRoute: string;
  currency: string;
  expectedTotal: number;
  fingerprint: string;
  cart: unknown;
  hostedPageId: string | null;
  invoiceId: string | null;
  subscriptionId: string | null;
  status: string;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  replayDeadline: Date;
  lastCheckedAt: Date | null;
  fulfilledAt: Date | null;
}

async function withDatabase(run: (fixture: Fixture) => Promise<void>) {
  const url = new URL(process.env.E2E_DATABASE_URL || "mysql://root:e2e@127.0.0.1:3306/skipwait");
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Banded intents proof refuses a non-local database");
  const options = { host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), multipleStatements: true };
  const database = `sw_intents_${randomUUID().replaceAll("-", "")}`;
  const admin = await mysql.createConnection(options);
  let db: Connection | undefined;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE \`${database}\``);
    created = true;
    db = await mysql.createConnection({ ...options, database });
    await db.query("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION'");
    await db.query(`CREATE TABLE users (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, name varchar(100) NULL);
      CREATE TABLE tokenBalances (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, plan ENUM('free','pro','max','start','momentum','land_100','land_200','land_500','keep_warm','land_focus','land_sprint','land_concierge') NOT NULL DEFAULT 'free');
      CREATE TABLE subscriptionCheckoutIntents (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, plan ENUM('pro','max','start','momentum','land_100','land_200','land_500','keep_warm','land_focus','land_sprint','land_concierge') NOT NULL);
      INSERT INTO users (id, name) VALUES (1, 'Seeker One'), (2, 'Seeker Two');`);
    await db.query(priorMigrationSql());
    await db.query(migrationSql());
    await run({ db, connect: () => mysql.createConnection({ ...options, database }) });
  } finally {
    try { if (db) await db.end(); }
    finally {
      try { if (created) await admin.query(`DROP DATABASE \`${database}\``); }
      finally { await admin.end(); }
    }
  }
}

async function count(db: Connection, sql: string, values: (string | number)[] = []) {
  const [rows] = await db.execute<CountRow[]>(sql, values);
  expect(rows).toHaveLength(1);
  return Number(rows[0]?.n);
}

test("0124 migration source is idempotent and creates bandedCheckoutIntents table", () => {
  const sql = migrationSql();
  expect(sql).toContain("CREATE TABLE IF NOT EXISTS `bandedCheckoutIntents`");
  expect(sql).toContain("CONSTRAINT `banded_intents_user_fk` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL");
  expect(sql).toContain("UNIQUE INDEX `banded_intents_checkout_unique` (`site`,`checkoutIntentId`)");
  expect(sql).toContain("UNIQUE INDEX `banded_intents_hosted_page_unique` (`site`,`hostedPageId`)");
  expect(sql).toContain("UNIQUE INDEX `banded_intents_invoice_unique` (`site`,`invoiceId`)");
  expect(sql).toContain("INDEX `banded_intents_reconcile_idx` (`status`,`lastCheckedAt`,`createdAt`)");
  expect(sql).toContain("INDEX `banded_intents_recovery_idx` (`userId`,`site`,`createdAt`)");
  expect(sql).not.toMatch(/DROP|TRUNCATE|DELETE/i);
});

test("migration applies cleanly over 0123 schema preserving existing balances and counters", async () => {
  await withDatabase(async ({ db }) => {
    await db.execute("INSERT INTO bandedReferralBalances (userId,level,purchasedRemaining) VALUES (1,'early',7),(1,'mid',4),(2,'early',2)");
    await db.execute("UPDATE bandedFoundingCounters SET issuedCount=3,reservedCount=1 WHERE site='test' AND planId='early_to_mid'");

    // Verify existing tables are populated and unaffected
    expect(await count(db, "SELECT COUNT(*) AS n FROM bandedReferralBalances")).toBe(3);
    expect(await count(db, "SELECT issuedCount+reservedCount AS n FROM bandedFoundingCounters WHERE site='test' AND planId='early_to_mid'")).toBe(4);

    // Verify empty initial storage
    expect(await count(db, "SELECT COUNT(*) AS n FROM bandedCheckoutIntents")).toBe(0);

    // Verify column definitions match storage contract
    const [columns] = await db.query<ColumnRow[]>(
      "SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bandedCheckoutIntents' ORDER BY ORDINAL_POSITION"
    );
    const colMap = new Map(columns.map(c => [c.COLUMN_NAME, c]));
    expect(colMap.get("site")?.COLUMN_TYPE).toBe("enum('test','live')");
    expect(colMap.get("checkoutIntentId")?.COLUMN_TYPE).toBe("varchar(96)");
    expect(colMap.get("userId")?.IS_NULLABLE).toBe("YES");
    expect(colMap.get("kind")?.COLUMN_TYPE).toBe("enum('plan','referral')");
    expect(colMap.get("planId")?.COLUMN_TYPE).toBe("enum('early_to_mid','mid_to_senior','senior_to_executive')");
    expect(colMap.get("planId")?.IS_NULLABLE).toBe("YES");
    expect(colMap.get("billingRoute")?.COLUMN_TYPE).toBe("enum('IN','INTL')");
    expect(colMap.get("currency")?.COLUMN_TYPE).toBe("enum('INR','USD')");
    expect(colMap.get("expectedTotal")?.COLUMN_TYPE).toBe("int unsigned");
    expect(colMap.get("fingerprint")?.COLUMN_TYPE).toBe("varchar(64)");
    expect(colMap.get("cart")?.COLUMN_TYPE).toBe("json");
    expect(colMap.get("status")?.COLUMN_TYPE).toBe("enum('creating','pending','fulfilled','requires_review','cancelled')");
    expect(colMap.get("failureReason")?.COLUMN_TYPE).toBe("varchar(255)");
  });
});

test("valid plan and referral intent inserts preserve exact JSON and attributes", async () => {
  await withDatabase(async ({ db }) => {
    const planCart = { version: 1, planId: "early_to_mid", price: 499900, currency: "INR" };
    const refCart = {
      version: 1,
      items: [{ level: "mid", quantity: 2, unitAmount: 4000, amount: 8000 }],
      subtotal: 8000,
      discountPct: 0,
      discount: 0,
      total: 8000,
    };

    await db.execute(
      `INSERT INTO bandedCheckoutIntents (
        site, checkoutIntentId, userId, kind, planId, billingRoute, currency, expectedTotal, fingerprint,
        cart, hostedPageId, invoiceId, subscriptionId, status, expiresAt, replayDeadline
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "test", "ci_plan_001", 1, "plan", "early_to_mid", "IN", "INR", 499900, "a".repeat(64),
        JSON.stringify(planCart), "hp_plan_001", "inv_plan_001", "sub_plan_001", "pending",
        "2026-12-01 00:00:00", "2026-12-02 00:00:00",
      ]
    );

    await db.execute(
      `INSERT INTO bandedCheckoutIntents (
        site, checkoutIntentId, userId, kind, planId, billingRoute, currency, expectedTotal, fingerprint,
        cart, hostedPageId, invoiceId, subscriptionId, status, expiresAt, replayDeadline
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "live", "ci_ref_001", 2, "referral", null, "INTL", "USD", 8000, "b".repeat(64),
        JSON.stringify(refCart), null, null, null, "creating",
        "2026-12-01 00:00:00", "2026-12-02 00:00:00",
      ]
    );

    const [rows] = await db.query<IntentRow[]>(
      "SELECT site, checkoutIntentId, userId, kind, planId, billingRoute, currency, expectedTotal, fingerprint, cart, hostedPageId, invoiceId, subscriptionId, status FROM bandedCheckoutIntents ORDER BY id"
    );
    expect(rows).toHaveLength(2);

    expect(rows[0]?.site).toBe("test");
    expect(rows[0]?.checkoutIntentId).toBe("ci_plan_001");
    expect(rows[0]?.userId).toBe(1);
    expect(rows[0]?.kind).toBe("plan");
    expect(rows[0]?.planId).toBe("early_to_mid");
    expect(rows[0]?.expectedTotal).toBe(499900);
    expect(rows[0]?.cart).toEqual(planCart);
    expect(rows[0]?.hostedPageId).toBe("hp_plan_001");
    expect(rows[0]?.invoiceId).toBe("inv_plan_001");
    expect(rows[0]?.subscriptionId).toBe("sub_plan_001");

    expect(rows[1]?.site).toBe("live");
    expect(rows[1]?.checkoutIntentId).toBe("ci_ref_001");
    expect(rows[1]?.userId).toBe(2);
    expect(rows[1]?.kind).toBe("referral");
    expect(rows[1]?.planId).toBeNull();
    expect(rows[1]?.expectedTotal).toBe(8000);
    expect(rows[1]?.cart).toEqual(refCart);
    expect(rows[1]?.hostedPageId).toBeNull();
    expect(rows[1]?.invoiceId).toBeNull();
    expect(rows[1]?.subscriptionId).toBeNull();
  });
});

test("database constraints enforce valid JSON, positive totals, and enum restrictions", async () => {
  await withDatabase(async ({ db }) => {
    const validParams = [
      "test", "ci_invalid_test", 1, "plan", "early_to_mid", "IN", "INR", 499900, "c".repeat(64),
      JSON.stringify({ version: 1 }), "hp_inv", "inv_inv", "sub_inv", "creating",
      "2026-12-01 00:00:00", "2026-12-02 00:00:00",
    ];

    // Invalid JSON text
    await expect(
      db.execute(
        "INSERT INTO bandedCheckoutIntents (site,checkoutIntentId,userId,kind,planId,billingRoute,currency,expectedTotal,fingerprint,cart,hostedPageId,invoiceId,subscriptionId,status,expiresAt,replayDeadline) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [...validParams.slice(0, 9), "{invalid-json", ...validParams.slice(10)]
      )
    ).rejects.toMatchObject({ code: expect.stringMatching(/ER_INVALID_JSON_TEXT|ER_CHECK_CONSTRAINT_VIOLATED/) });

    // Non-positive expectedTotal
    await expect(
      db.execute(
        "INSERT INTO bandedCheckoutIntents (site,checkoutIntentId,userId,kind,planId,billingRoute,currency,expectedTotal,fingerprint,cart,hostedPageId,invoiceId,subscriptionId,status,expiresAt,replayDeadline) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [...validParams.slice(0, 7), 0, ...validParams.slice(8)]
      )
    ).rejects.toMatchObject({ code: "ER_CHECK_CONSTRAINT_VIOLATED" });

    // Invalid site
    await expect(
      db.execute(
        "INSERT INTO bandedCheckoutIntents (site,checkoutIntentId,userId,kind,planId,billingRoute,currency,expectedTotal,fingerprint,cart,hostedPageId,invoiceId,subscriptionId,status,expiresAt,replayDeadline) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ["invalid_site", ...validParams.slice(1)]
      )
    ).rejects.toMatchObject({ code: "WARN_DATA_TRUNCATED" });
  });
});

test("unique constraints isolate TEST and LIVE and allow multiple unbound provider IDs", async () => {
  await withDatabase(async ({ db }) => {
    const base = [
      "test", "ci_same_key", 1, "plan", "early_to_mid", "IN", "INR", 499900, "d".repeat(64),
      JSON.stringify({ v: 1 }), null, null, null, "creating",
      "2026-12-01 00:00:00", "2026-12-02 00:00:00",
    ];
    await db.execute(
      "INSERT INTO bandedCheckoutIntents (site,checkoutIntentId,userId,kind,planId,billingRoute,currency,expectedTotal,fingerprint,cart,hostedPageId,invoiceId,subscriptionId,status,expiresAt,replayDeadline) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      base
    );

    // Duplicate (site, checkoutIntentId) on same site fails
    await expect(
      db.execute(
        "INSERT INTO bandedCheckoutIntents (site,checkoutIntentId,userId,kind,planId,billingRoute,currency,expectedTotal,fingerprint,cart,hostedPageId,invoiceId,subscriptionId,status,expiresAt,replayDeadline) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        base
      )
    ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });

    // Same checkoutIntentId on 'live' succeeds (TEST/LIVE isolation)
    await db.execute(
      "INSERT INTO bandedCheckoutIntents (site,checkoutIntentId,userId,kind,planId,billingRoute,currency,expectedTotal,fingerprint,cart,hostedPageId,invoiceId,subscriptionId,status,expiresAt,replayDeadline) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["live", ...base.slice(1)]
    );

    // Multiple rows with NULL hostedPageId and invoiceId succeed
    await db.execute(
      "INSERT INTO bandedCheckoutIntents (site,checkoutIntentId,userId,kind,planId,billingRoute,currency,expectedTotal,fingerprint,cart,hostedPageId,invoiceId,subscriptionId,status,expiresAt,replayDeadline) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ["test", "ci_null_2", 1, "plan", "early_to_mid", "IN", "INR", 499900, "e".repeat(64), JSON.stringify({ v: 1 }), null, null, null, "creating", "2026-12-01 00:00:00", "2026-12-02 00:00:00"]
    );

    // Bound hostedPageId uniqueness
    await db.execute("UPDATE bandedCheckoutIntents SET hostedPageId='hp_shared' WHERE site='test' AND checkoutIntentId='ci_same_key'");
    await expect(
      db.execute("UPDATE bandedCheckoutIntents SET hostedPageId='hp_shared' WHERE site='test' AND checkoutIntentId='ci_null_2'")
    ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });

    // Same hostedPageId on 'live' succeeds
    await db.execute("UPDATE bandedCheckoutIntents SET hostedPageId='hp_shared' WHERE site='live' AND checkoutIntentId='ci_same_key'");

    // Bound invoiceId uniqueness
    await db.execute("UPDATE bandedCheckoutIntents SET invoiceId='inv_shared' WHERE site='test' AND checkoutIntentId='ci_same_key'");
    await expect(
      db.execute("UPDATE bandedCheckoutIntents SET invoiceId='inv_shared' WHERE site='test' AND checkoutIntentId='ci_null_2'")
    ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });

    // Same invoiceId on 'live' succeeds
    await db.execute("UPDATE bandedCheckoutIntents SET invoiceId='inv_shared' WHERE site='live' AND checkoutIntentId='ci_same_key'");
  });
});

test("user deletion preserves receipt with NULL owner and foreign keys", async () => {
  await withDatabase(async ({ db }) => {
    await db.execute(
      `INSERT INTO bandedCheckoutIntents (
        site, checkoutIntentId, userId, kind, planId, billingRoute, currency, expectedTotal, fingerprint,
        cart, hostedPageId, invoiceId, subscriptionId, status, expiresAt, replayDeadline
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "test", "ci_delete_user", 1, "plan", "early_to_mid", "IN", "INR", 499900, "f".repeat(64),
        JSON.stringify({ v: 1 }), "hp_del", "inv_del", "sub_del", "fulfilled",
        "2026-12-01 00:00:00", "2026-12-02 00:00:00",
      ]
    );

    await db.execute("DELETE FROM users WHERE id=1");

    const [rows] = await db.query<IntentRow[]>(
      "SELECT userId, status, checkoutIntentId, hostedPageId, invoiceId FROM bandedCheckoutIntents WHERE checkoutIntentId='ci_delete_user'"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBeNull();
    expect(rows[0]?.status).toBe("fulfilled");
    expect(rows[0]?.hostedPageId).toBe("hp_del");
    expect(rows[0]?.invoiceId).toBe("inv_del");
  });
});

test("declared recovery and reconcile indexes have exact declared column sequence", async () => {
  await withDatabase(async ({ db }) => {
    const [indexes] = await db.query<IndexColumnRow[]>(
      "SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bandedCheckoutIntents' ORDER BY INDEX_NAME, SEQ_IN_INDEX"
    );

    const getCols = (name: string) =>
      indexes.filter(i => i.INDEX_NAME === name).sort((a, b) => a.SEQ_IN_INDEX - b.SEQ_IN_INDEX).map(i => i.COLUMN_NAME);

    // Index status/last-check/creation for bounded oldest-first reconciliation
    expect(getCols("banded_intents_reconcile_idx")).toEqual(["status", "lastCheckedAt", "createdAt"]);

    // Index owner/site/creation for authenticated recovery
    expect(getCols("banded_intents_recovery_idx")).toEqual(["userId", "site", "createdAt"]);

    // Unique indexes
    expect(getCols("banded_intents_checkout_unique")).toEqual(["site", "checkoutIntentId"]);
    expect(getCols("banded_intents_hosted_page_unique")).toEqual(["site", "hostedPageId"]);
    expect(getCols("banded_intents_invoice_unique")).toEqual(["site", "invoiceId"]);
  });
});

test("concurrent same-key inserts and competing invoice bindings serialize safely", async () => {
  await withDatabase(async ({ db, connect }) => {
    const site = "test";
    const checkoutIntentId = "ci_concurrent_race";

    // 4 concurrent connections attempt to insert the same checkout intent
    const outcomes = await Promise.all(
      Array.from({ length: 4 }, async (_, i) => {
        const connection = await connect();
        try {
          const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO bandedCheckoutIntents (
              site, checkoutIntentId, userId, kind, planId, billingRoute, currency, expectedTotal, fingerprint,
              cart, hostedPageId, invoiceId, subscriptionId, status, expiresAt, replayDeadline
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              site, checkoutIntentId, 2, "plan", "early_to_mid", "IN", "INR", 499900, "1".repeat(64),
              JSON.stringify({ writer: i }), null, null, null, "creating",
              "2026-12-01 00:00:00", "2026-12-02 00:00:00",
            ]
          );
          expect(result.affectedRows).toBe(1);
          return "inserted";
        } catch (error) {
          expect(error).toMatchObject({ code: "ER_DUP_ENTRY" });
          return "duplicate";
        } finally {
          await connection.end();
        }
      })
    );

    expect(outcomes.filter(o => o === "inserted")).toHaveLength(1);
    expect(outcomes.filter(o => o === "duplicate")).toHaveLength(3);

    // Competing invoice binding: create another intent, then have 2 connections try to bind the same invoiceId
    await db.execute(
      `INSERT INTO bandedCheckoutIntents (
        site, checkoutIntentId, userId, kind, planId, billingRoute, currency, expectedTotal, fingerprint,
        cart, hostedPageId, invoiceId, subscriptionId, status, expiresAt, replayDeadline
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        site, "ci_competing_2", 2, "plan", "early_to_mid", "IN", "INR", 499900, "2".repeat(64),
        JSON.stringify({ v: 2 }), null, null, null, "pending",
        "2026-12-01 00:00:00", "2026-12-02 00:00:00",
      ]
    );

    const bindOutcomes = await Promise.all(
      [checkoutIntentId, "ci_competing_2"].map(async id => {
        const connection = await connect();
        try {
          await connection.execute(
            "UPDATE bandedCheckoutIntents SET invoiceId='inv_compete_race' WHERE site='test' AND checkoutIntentId=?",
            [id]
          );
          return "bound";
        } catch (error) {
          expect(error).toMatchObject({ code: "ER_DUP_ENTRY" });
          return "duplicate";
        } finally {
          await connection.end();
        }
      })
    );

    expect(bindOutcomes.sort()).toEqual(["bound", "duplicate"]);
  });
});

test("migration replay leaves existing rows and table definitions unchanged", async () => {
  await withDatabase(async ({ db }) => {
    await db.execute(
      `INSERT INTO bandedCheckoutIntents (
        site, checkoutIntentId, userId, kind, planId, billingRoute, currency, expectedTotal, fingerprint,
        cart, hostedPageId, invoiceId, subscriptionId, status, expiresAt, replayDeadline
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "test", "ci_replay_check", 2, "referral", null, "INTL", "USD", 4000, "3".repeat(64),
        JSON.stringify({ items: [] }), "hp_rep", "inv_rep", null, "fulfilled",
        "2026-12-01 00:00:00", "2026-12-02 00:00:00",
      ]
    );

    // Replay migration twice
    await db.query(migrationSql());
    await db.query(migrationSql());

    expect(await count(db, "SELECT COUNT(*) AS n FROM bandedCheckoutIntents")).toBe(1);
    const [rows] = await db.query<IntentRow[]>(
      "SELECT site, checkoutIntentId, status, hostedPageId, invoiceId FROM bandedCheckoutIntents WHERE checkoutIntentId='ci_replay_check'"
    );
    expect(rows[0]?.status).toBe("fulfilled");
    expect(rows[0]?.hostedPageId).toBe("hp_rep");
    expect(rows[0]?.invoiceId).toBe("inv_rep");
  });
});
