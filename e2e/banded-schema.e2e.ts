import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import mysql, { type Connection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { test, expect } from "playwright/test";
import { INTENT_PLAN_IDS, WALLET_PLAN_IDS } from "../shared/billingCatalog";
import { PLAN_FAMILY, PLAN_FAMILY_IDS } from "../shared/planFamily";

const migration = readFileSync(new URL("../drizzle/deploy/0123_banded_plans.sql", import.meta.url), "utf8");
const oldWalletPlans = WALLET_PLAN_IDS.slice(0, 12);
const oldIntentPlans = INTENT_PLAN_IDS.slice(0, 11);
const literals = (values: readonly string[]) => values.map(value => `'${value}'`).join(",");

type Fixture = { db: Connection; connect: () => Promise<Connection> };
async function withDatabase(run: (fixture: Fixture) => Promise<void>) {
  const url = new URL(process.env.E2E_DATABASE_URL || "mysql://root:e2e@127.0.0.1:3306/skipwait");
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Banded schema proof refuses a non-local database");
  const options = { host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), multipleStatements: true };
  const database = `sw_banded_${randomUUID().replaceAll("-", "")}`;
  const admin = await mysql.createConnection(options);
  let db: Connection | undefined;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE \`${database}\``);
    created = true;
    db = await mysql.createConnection({ ...options, database });
    await db.query("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION'");
    // The actual forward migration starts from the old storage shape, not the
    // PR's Drizzle schema; otherwise CREATE TABLE could hide an invalid DDL.
    await db.query(`CREATE TABLE users (id int NOT NULL AUTO_INCREMENT PRIMARY KEY);
      CREATE TABLE tokenBalances (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, plan ENUM(${literals(oldWalletPlans)}) NOT NULL DEFAULT 'free');
      CREATE TABLE subscriptionCheckoutIntents (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, plan ENUM(${literals(oldIntentPlans)}) NOT NULL);
      INSERT INTO users (id) VALUES (1),(2);`);
    for (const plan of oldWalletPlans) await db.execute("INSERT INTO tokenBalances (plan) VALUES (?)", [plan]);
    for (const plan of oldIntentPlans) await db.execute("INSERT INTO subscriptionCheckoutIntents (plan) VALUES (?)", [plan]);
    await db.query(migration);
    await run({ db, connect: () => mysql.createConnection({ ...options, database }) });
  } finally {
    try { if (db) await db.end(); }
    finally {
      try { if (created) await admin.query(`DROP DATABASE \`${database}\``); }
      finally { await admin.end(); }
    }
  }
}

async function count(db: Connection, query: string, values: unknown[] = []) {
  const [rows] = await db.execute<RowDataPacket[]>(query, values);
  return Number(rows[0]?.n);
}

test("band migration preserves every legacy ENUM ordinal and accepts the new plans", async () => {
  await withDatabase(async ({ db }) => {
    for (const [table, old] of [["tokenBalances", oldWalletPlans], ["subscriptionCheckoutIntents", oldIntentPlans]] as const) {
      const [rows] = await db.query<RowDataPacket[]>(`SELECT plan, plan + 0 AS ordinal FROM \`${table}\` ORDER BY id`);
      expect(rows.map(row => [row.plan, row.ordinal])).toEqual(old.map((plan, index) => [plan, index + 1]));
      for (const plan of PLAN_FAMILY_IDS) await db.execute(`INSERT INTO \`${table}\` (plan) VALUES (?)`, [plan]);
      expect(await count(db, `SELECT COUNT(*) AS n FROM \`${table}\``)).toBe(old.length + PLAN_FAMILY_IDS.length);
    }
    await expect(db.execute("INSERT INTO tokenBalances (plan) VALUES ('not_a_plan')")).rejects.toMatchObject({ code: "WARN_DATA_TRUNCATED" });
  });
});

test("level balances isolate users and levels, reject negatives and require the included cycle", async () => {
  await withDatabase(async ({ db }) => {
    await db.execute("INSERT INTO bandedReferralBalances (userId,level,purchasedRemaining) VALUES (1,'early',7),(1,'mid',4),(2,'early',2)");
    await db.execute("UPDATE bandedReferralBalances SET includedRemaining=3,includedCycleKey='subscription-1:2026-11',includedExpiresAt='2026-12-20 00:00:00' WHERE userId=1 AND level='early'");
    await expect(db.execute("INSERT INTO bandedReferralBalances (userId,level) VALUES (1,'early')")).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    await expect(db.execute("UPDATE bandedReferralBalances SET purchasedRemaining=-1 WHERE userId=1 AND level='early'")).rejects.toMatchObject({ code: "ER_WARN_DATA_OUT_OF_RANGE" });
    await expect(db.execute("UPDATE bandedReferralBalances SET includedRemaining=1 WHERE userId=1 AND level='mid'")).rejects.toMatchObject({ code: "ER_CHECK_CONSTRAINT_VIOLATED" });
    await db.execute("UPDATE bandedReferralBalances SET includedRemaining=0,includedCycleKey=NULL,includedExpiresAt=NULL WHERE userId=1 AND level='early'");
    const [rows] = await db.query<RowDataPacket[]>("SELECT userId,level,includedRemaining,purchasedRemaining FROM bandedReferralBalances ORDER BY userId,level");
    expect(rows.map(row => [row.userId,row.level,row.includedRemaining,row.purchasedRemaining])).toEqual([[1,"early",0,7],[1,"mid",0,4],[2,"early",0,2]]);
  });
});

test("every frozen cap bounds issued plus reserved places, independently in TEST and LIVE", async () => {
  await withDatabase(async ({ db, connect }) => {
    for (const plan of PLAN_FAMILY) {
      await db.execute("UPDATE bandedFoundingCounters SET issuedCount=?,reservedCount=1 WHERE site='test' AND planId=?", [plan.foundingCap - 1, plan.id]);
      await expect(db.execute("UPDATE bandedFoundingCounters SET reservedCount=2 WHERE site='test' AND planId=?", [plan.id])).rejects.toMatchObject({ code: "ER_CHECK_CONSTRAINT_VIOLATED" });
      expect(await count(db, "SELECT issuedCount+reservedCount AS n FROM bandedFoundingCounters WHERE site='live' AND planId=?", [plan.id])).toBe(0);
    }
    await db.execute("UPDATE bandedFoundingCounters SET reservedCount=0 WHERE site='test' AND planId='early_to_mid'");
    // Each concurrent writer increments unconditionally. The database CHECK,
    // not a test-side capacity guard, must let exactly one take the last place.
    const outcomes = await Promise.all(Array.from({ length: 8 }, async () => {
      const connection = await connect();
      try {
        const [result] = await connection.execute<ResultSetHeader>("UPDATE bandedFoundingCounters SET reservedCount=reservedCount+1 WHERE site='test' AND planId='early_to_mid'");
        expect(result.affectedRows).toBe(1);
        return "reserved";
      } catch (error) {
        expect(error).toMatchObject({ code: "ER_CHECK_CONSTRAINT_VIOLATED" });
        return "full";
      } finally { await connection.end(); }
    }));
    expect(outcomes.filter(outcome => outcome === "reserved")).toHaveLength(1);
    expect(await count(db, "SELECT issuedCount+reservedCount AS n FROM bandedFoundingCounters WHERE site='test' AND planId='early_to_mid'")).toBe(PLAN_FAMILY[0].foundingCap);
  });
});

test("issued sequences and checkout ids are unique, bounded and survive account erasure", async () => {
  await withDatabase(async ({ db }) => {
    for (const plan of PLAN_FAMILY) {
      const insert = "INSERT INTO bandedFoundingMemberships (site,planId,userId,checkoutIntentId,subscriptionId,status,issuedSequence,expiresAt,issuedAt) VALUES ('test',?,1,?,?,'issued',?,'2026-12-20 00:00:00','2026-11-20 00:00:00')";
      await db.execute(insert, [plan.id, `checkout-${plan.id}`, `subscription-${plan.id}`, plan.foundingCap]);
      await expect(db.execute(insert, [plan.id, `other-${plan.id}`, `other-sub-${plan.id}`, plan.foundingCap])).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
      await expect(db.execute(insert, [plan.id, `overflow-${plan.id}`, `overflow-sub-${plan.id}`, plan.foundingCap + 1])).rejects.toMatchObject({ code: "ER_CHECK_CONSTRAINT_VIOLATED" });
      await expect(db.execute("UPDATE bandedFoundingMemberships SET status='released',releasedAt='2026-11-20 00:00:00' WHERE checkoutIntentId=?", [`checkout-${plan.id}`])).rejects.toMatchObject({ code: "ER_CHECK_CONSTRAINT_VIOLATED" });
    }
    await expect(db.execute("INSERT INTO bandedFoundingMemberships (site,planId,checkoutIntentId,expiresAt) VALUES ('test','early_to_mid','checkout-early_to_mid','2026-12-20 00:00:00')")).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    await db.execute("DELETE FROM users WHERE id=1");
    expect(await count(db, "SELECT COUNT(*) AS n FROM bandedFoundingMemberships WHERE status='issued' AND userId IS NULL")).toBe(PLAN_FAMILY.length);
  });
});

test("migration replay does not reset a balance, a reservation count or an issued sequence", async () => {
  await withDatabase(async ({ db }) => {
    await db.execute("INSERT INTO bandedReferralBalances (userId,level,purchasedRemaining) VALUES (1,'senior',9)");
    await db.execute("UPDATE bandedFoundingCounters SET issuedCount=1,reservedCount=2 WHERE site='test' AND planId='mid_to_senior'");
    await db.execute("INSERT INTO bandedFoundingMemberships (site,planId,userId,checkoutIntentId,status,issuedSequence,expiresAt,issuedAt) VALUES ('test','mid_to_senior',1,'replay-issued','issued',1,'2026-12-20 00:00:00','2026-11-20 00:00:00')");
    await db.query(migration);
    expect(await count(db, "SELECT purchasedRemaining AS n FROM bandedReferralBalances WHERE userId=1 AND level='senior'")).toBe(9);
    expect(await count(db, "SELECT issuedCount+reservedCount AS n FROM bandedFoundingCounters WHERE site='test' AND planId='mid_to_senior'")).toBe(3);
    expect(await count(db, "SELECT issuedSequence AS n FROM bandedFoundingMemberships WHERE checkoutIntentId='replay-issued'")).toBe(1);
  });
});
