import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import mysql, { type Connection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { expect, test } from "playwright/test";

const migrationUrl = new URL("../drizzle/deploy/0123_banded_plans.sql", import.meta.url);
const migrationSql = () => readFileSync(migrationUrl, "utf8");
// Pin the historical storage order independently of the evolving schema/model.
const walletPlans = ["free", "pro", "max", "start", "momentum", "land_100", "land_200", "land_500", "keep_warm", "land_focus", "land_sprint", "land_concierge"] as const;
const intentPlans = walletPlans.slice(1);
const bandedPlans = ["early_to_mid", "mid_to_senior", "senior_to_executive"] as const;
const caps = [500, 250, 100] as const;
const literals = (values: readonly string[]) => values.map(value => `'${value}'`).join(",");

interface Fixture { db: Connection; connect: () => Promise<Connection> }
interface PlanRow extends RowDataPacket { id: number; plan: string; ordinal: number; preserved: number }
interface ColumnRow extends RowDataPacket { COLUMN_TYPE: string; COLUMN_DEFAULT: string | null; IS_NULLABLE: string }
interface CountRow extends RowDataPacket { n: number }
interface BalanceRow extends RowDataPacket { userId: number; level: string; includedRemaining: number; purchasedRemaining: number }
interface CounterRow extends RowDataPacket { site: string; planId: string; issuedCount: number; reservedCount: number }
interface MembershipRow extends RowDataPacket { site: string; checkoutIntentId: string; status: string; issuedSequence: number | null; userId: number | null }

async function withDatabase(run: (fixture: Fixture) => Promise<void>) {
  const url = new URL(process.env.E2E_DATABASE_URL || "mysql://root:e2e@127.0.0.1:3306/skipwait");
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Migration proof refuses a non-local database");
  const options = { host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), multipleStatements: true };
  const database = `sw_migration_${randomUUID().replaceAll("-", "")}`;
  const admin = await mysql.createConnection(options);
  let db: Connection | undefined;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE \`${database}\``);
    created = true;
    db = await mysql.createConnection({ ...options, database });
    await db.query("SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION'");
    await db.query(`CREATE TABLE users (id int NOT NULL PRIMARY KEY);
      CREATE TABLE tokenBalances (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, plan ENUM(${literals(walletPlans)}) NOT NULL DEFAULT 'free', preserved int NOT NULL DEFAULT 73);
      CREATE TABLE subscriptionCheckoutIntents (id int NOT NULL AUTO_INCREMENT PRIMARY KEY, plan ENUM(${literals(intentPlans)}) NOT NULL, preserved int NOT NULL DEFAULT 91);
      INSERT INTO users (id) VALUES (1),(2);`);
    for (const plan of walletPlans) await db.execute("INSERT INTO tokenBalances (plan) VALUES (?)", [plan]);
    for (const plan of intentPlans) await db.execute("INSERT INTO subscriptionCheckoutIntents (plan) VALUES (?)", [plan]);
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
  return rows[0]?.n;
}

async function snapshot(db: Connection) {
  const [balances] = await db.query<BalanceRow[]>("SELECT userId,level,includedRemaining,purchasedRemaining FROM bandedReferralBalances ORDER BY userId,level");
  const [counters] = await db.query<CounterRow[]>("SELECT site,planId,issuedCount,reservedCount FROM bandedFoundingCounters ORDER BY site,planId");
  const [memberships] = await db.query<MembershipRow[]>("SELECT site,checkoutIntentId,status,issuedSequence,userId FROM bandedFoundingMemberships ORDER BY site,checkoutIntentId");
  return { balances, counters, memberships };
}

test("banded migration is the immutable SQL reviewed with the parent storage contract", () => {
  expect(createHash("sha256").update(migrationSql()).digest("hex")).toBe("0e81be7080d2fc8087cf278edb3858b5dc5b8846e95eb6819ee3eb2a1e9a28d2");
  const historicalSql = readFileSync(new URL("../drizzle/deploy/0091_pricing_model.sql", import.meta.url), "utf8");
  for (const [table, plans] of [["tokenBalances", walletPlans], ["subscriptionCheckoutIntents", intentPlans]] as const) {
    expect(historicalSql).toContain(`ALTER TABLE \`${table}\` MODIFY \`plan\` ENUM(${plans.map(plan => `''${plan}''`).join(",")})`);
  }
});

test("migration retains historical data, ENUM ordinals and defaults and adds empty storage", async () => {
  await withDatabase(async ({ db }) => {
    for (const [table, oldPlans, preserved, defaultPlan] of [["tokenBalances", walletPlans, 73, "free"], ["subscriptionCheckoutIntents", intentPlans, 91, null]] as const) {
      const [rows] = await db.query<PlanRow[]>(`SELECT id,plan,plan+0 AS ordinal,preserved FROM \`${table}\` ORDER BY id`);
      expect(rows.map(row => [row.id, row.plan, row.ordinal, row.preserved])).toEqual(oldPlans.map((plan, index) => [index + 1, plan, index + 1, preserved]));
      const [columns] = await db.execute<ColumnRow[]>("SELECT COLUMN_TYPE,COLUMN_DEFAULT,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='plan'", [table]);
      expect(columns.map(column => [column.COLUMN_TYPE, column.COLUMN_DEFAULT, column.IS_NULLABLE])).toEqual([[`enum(${literals([...oldPlans, ...bandedPlans])})`, defaultPlan, "NO"]]);
      for (const plan of bandedPlans) await db.execute(`INSERT INTO \`${table}\` (plan) VALUES (?)`, [plan]);
      expect(await count(db, `SELECT COUNT(*) AS n FROM \`${table}\``)).toBe(oldPlans.length + bandedPlans.length);
    }
    await db.execute("INSERT INTO tokenBalances () VALUES ()");
    expect(await count(db, "SELECT COUNT(*) AS n FROM tokenBalances WHERE plan='free' AND preserved=73")).toBe(2);
    await expect(db.execute("INSERT INTO tokenBalances (plan) VALUES ('invented')")).rejects.toMatchObject({ code: "WARN_DATA_TRUNCATED" });
    expect(await snapshot(db)).toEqual({
      balances: [], memberships: [],
      counters: ["test", "live"].flatMap(site => bandedPlans.map(planId => ({ site, planId, issuedCount: 0, reservedCount: 0 }))),
    });
  });
});

test("balance and membership constraints enforce isolation, valid states and retained issued places", async () => {
  await withDatabase(async ({ db }) => {
    await db.execute("INSERT INTO bandedReferralBalances (userId,level,purchasedRemaining) VALUES (1,'early',7),(1,'mid',4),(2,'early',2)");
    await expect(db.execute("INSERT INTO bandedReferralBalances (userId,level) VALUES (1,'early')")).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    await expect(db.execute("INSERT INTO bandedReferralBalances (userId,level) VALUES (999,'early')")).rejects.toMatchObject({ code: "ER_NO_REFERENCED_ROW_2" });
    await expect(db.execute("UPDATE bandedReferralBalances SET purchasedRemaining=-1 WHERE userId=1 AND level='early'")).rejects.toMatchObject({ code: "ER_WARN_DATA_OUT_OF_RANGE" });
    await expect(db.execute("UPDATE bandedReferralBalances SET includedRemaining=1 WHERE userId=1 AND level='early'")).rejects.toMatchObject({ code: "ER_CHECK_CONSTRAINT_VIOLATED" });
    await expect(db.execute("UPDATE bandedReferralBalances SET includedRemaining=1,includedCycleKey='cycle' WHERE userId=1 AND level='early'")).rejects.toMatchObject({ code: "ER_CHECK_CONSTRAINT_VIOLATED" });
    await db.execute("UPDATE bandedReferralBalances SET includedRemaining=3,includedCycleKey='cycle',includedExpiresAt='2026-12-20 00:00:00' WHERE userId=1 AND level='early'");
    expect((await snapshot(db)).balances.map(row => [row.userId,row.level,row.includedRemaining,row.purchasedRemaining])).toEqual([[1,"early",3,7],[1,"mid",0,4],[2,"early",0,2]]);
    const insert = "INSERT INTO bandedFoundingMemberships (site,planId,userId,checkoutIntentId,subscriptionId,status,issuedSequence,expiresAt,issuedAt) VALUES (?,'early_to_mid',1,?,?,'issued',?,'2026-12-20 00:00:00','2026-11-20 00:00:00')";
    await db.execute(insert, ["test", "checkout", "subscription", 1]);
    await expect(db.execute(insert, ["test", "checkout", "another", 2])).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    await expect(db.execute(insert, ["test", "another", "subscription", 2])).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    await expect(db.execute(insert, ["test", "another", "another", 1])).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
    await expect(db.execute(insert, ["test", "outside-cap", "outside-cap", 501])).rejects.toMatchObject({ code: "ER_CHECK_CONSTRAINT_VIOLATED" });
    await db.execute(insert, ["live", "checkout", "subscription", 1]);
    await expect(db.execute("UPDATE bandedFoundingMemberships SET status='released',releasedAt='2026-11-20 00:00:00' WHERE site='test'")).rejects.toMatchObject({ code: "ER_CHECK_CONSTRAINT_VIOLATED" });
    await db.execute("DELETE FROM users WHERE id=1");
    expect(await count(db, "SELECT COUNT(*) AS n FROM bandedFoundingMemberships WHERE status='issued' AND userId IS NULL")).toBe(2);
    expect(await count(db, "SELECT COUNT(*) AS n FROM bandedReferralBalances WHERE userId=1")).toBe(0);
    expect(await count(db, "SELECT purchasedRemaining AS n FROM bandedReferralBalances WHERE userId=2 AND level='early'")).toBe(2);
  });
});

test("each founding cap resists concurrent oversell and TEST never consumes LIVE capacity", async () => {
  await withDatabase(async ({ db, connect }) => {
    for (const [index, plan] of bandedPlans.entries()) {
      const cap = caps[index];
      if (cap === undefined) throw new Error("Missing pinned founding cap");
      await db.execute("UPDATE bandedFoundingCounters SET issuedCount=?,reservedCount=1 WHERE site='test' AND planId=?", [cap - 1, plan]);
      await expect(db.execute("UPDATE bandedFoundingCounters SET reservedCount=2 WHERE site='test' AND planId=?", [plan])).rejects.toMatchObject({ code: "ER_CHECK_CONSTRAINT_VIOLATED" });
      expect(await count(db, "SELECT issuedCount+reservedCount AS n FROM bandedFoundingCounters WHERE site='live' AND planId=?", [plan])).toBe(0);
      await db.execute("UPDATE bandedFoundingCounters SET reservedCount=0 WHERE site='test' AND planId=?", [plan]);
      const outcomes = await Promise.all(Array.from({ length: 4 }, async () => {
        const connection = await connect();
        try {
          const [result] = await connection.execute<ResultSetHeader>("UPDATE bandedFoundingCounters SET reservedCount=reservedCount+1 WHERE site='test' AND planId=?", [plan]);
          expect(result.affectedRows).toBe(1);
          return "reserved";
        } catch (error) {
          expect(error).toMatchObject({ code: "ER_CHECK_CONSTRAINT_VIOLATED" });
          return "full";
        } finally { await connection.end(); }
      }));
      expect(outcomes.sort()).toEqual(["full", "full", "full", "reserved"]);
      expect(await count(db, "SELECT issuedCount+reservedCount AS n FROM bandedFoundingCounters WHERE site='test' AND planId=?", [plan])).toBe(cap);
    }
  });
});

test("reapplying the actual SQL preserves balances, both sites and every membership state", async () => {
  await withDatabase(async ({ db }) => {
    await db.execute("INSERT INTO bandedReferralBalances (userId,level,includedRemaining,includedCycleKey,includedExpiresAt,purchasedRemaining) VALUES (1,'senior',3,'cycle','2026-12-20 00:00:00',9)");
    await db.execute("UPDATE bandedFoundingCounters SET issuedCount=1,reservedCount=2 WHERE site='test' AND planId='mid_to_senior'");
    await db.execute("UPDATE bandedFoundingCounters SET issuedCount=4,reservedCount=5 WHERE site='live' AND planId='mid_to_senior'");
    await db.execute("INSERT INTO bandedFoundingMemberships (site,planId,userId,checkoutIntentId,status,issuedSequence,expiresAt,issuedAt,releasedAt) VALUES ('test','mid_to_senior',1,'issued','issued',1,'2026-12-20 00:00:00','2026-11-20 00:00:00',NULL),('test','mid_to_senior',1,'reserved','reserved',NULL,'2026-12-20 00:00:00',NULL,NULL),('live','mid_to_senior',2,'released','released',NULL,'2026-12-20 00:00:00',NULL,'2026-11-20 00:00:00')");
    const before = await snapshot(db);
    await db.query(migrationSql());
    await db.query(migrationSql());
    expect(await snapshot(db)).toEqual(before);
    expect(await count(db, "SELECT COUNT(*) AS n FROM bandedFoundingCounters")).toBe(6);
    expect(await count(db, "SELECT COUNT(*) AS n FROM tokenBalances")).toBe(walletPlans.length);
    expect(await count(db, "SELECT COUNT(*) AS n FROM subscriptionCheckoutIntents")).toBe(intentPlans.length);
  });
});
