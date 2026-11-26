import { randomUUID } from "node:crypto";
import mysql, { type Connection } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { test, expect } from "playwright/test";
import { bandedReferralBalances, tokenBalances, tokenTransactions } from "../drizzle/schema";
import { spendBandedReferralTx } from "../server/bandedSpend";
import { AskPriceChangedError } from "../server/planGates";

/** Copy only table structures from the already-migrated local CI database. */
async function withSpendDatabase(run: (connect: () => Promise<Connection>) => Promise<void>) {
  const url = new URL(process.env.E2E_DATABASE_URL || "mysql://root:e2e@127.0.0.1:3306/skipwait");
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Banded spend proof refuses a non-local database");
  const source = url.pathname.slice(1);
  if (!/^[a-zA-Z0-9_]+$/.test(source)) throw new Error("Invalid local fixture database name");
  const options = { host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) };
  const name = `sw_spend_${randomUUID().replaceAll("-", "")}`;
  const admin = await mysql.createConnection(options);
  let created = false;
  try {
    await admin.query(`CREATE DATABASE \`${name}\``);
    created = true;
    for (const table of ["tokenBalances", "tokenTransactions", "bandedReferralBalances"]) {
      await admin.query(`CREATE TABLE \`${name}\`.\`${table}\` LIKE \`${source}\`.\`${table}\``);
    }
    const connect = () => mysql.createConnection({ ...options, database: name });
    const connection = await connect();
    try {
      const db = drizzle(connection);
      const now = new Date();
      await db.insert(tokenBalances).values({ userId: 1, role: "job_seeker", plan: "early_to_mid", balance: 0, monthlyAllowance: 3, monthlyCreditsRemaining: 0, monthlyCycleKey: "2026-11", subscriptionId: "fixture-paid-term", subscriptionStatus: "active", subscriptionCurrentTermStart: new Date(now.getTime() - 86_400_000), subscriptionCurrentTermEnd: new Date(now.getTime() + 86_400_000) });
      await db.insert(bandedReferralBalances).values({ userId: 1, level: "early", includedRemaining: 1, includedCycleKey: "fixture-cycle", includedExpiresAt: new Date(now.getTime() + 86_400_000), purchasedRemaining: 0 });
    } finally { await connection.end(); }
    await run(connect);
  } finally {
    try { if (created) await admin.query(`DROP DATABASE \`${name}\``); }
    finally { await admin.end(); }
  }
}

test("banded final-referral race: eight transactions spend exactly once", async () => {
  await withSpendDatabase(async connect => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, async (_, index) => {
      const connection = await connect();
      try {
        return await drizzle(connection).transaction(async tx => {
          const wallet = (await tx.select().from(tokenBalances).where(eq(tokenBalances.userId, 1)).limit(1).for("update"))[0];
          if (!wallet) throw new Error("Fixture wallet missing");
          return spendBandedReferralTx(tx, { wallet, level: 2, now: new Date(), meta: { idempotencyKey: `banded-race-${index}`, referenceType: "referral_request", referenceId: String(index + 100) } });
        });
      } finally { await connection.end(); }
    }));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ name: "InsufficientCreditsError" });
    const connection = await connect();
    try {
      const db = drizzle(connection);
      expect((await db.select().from(bandedReferralBalances))[0]?.includedRemaining).toBe(0);
      expect(await db.select().from(tokenTransactions)).toHaveLength(1);
    } finally { await connection.end(); }
  });
});

test("banded MySQL stale confirmation rolls back the debit and permits reconfirmation", async () => {
  await withSpendDatabase(async connect => {
    const connection = await connect();
    try {
      const db = drizzle(connection);
      const spend = (stale: boolean) => db.transaction(async tx => {
        const wallet = (await tx.select().from(tokenBalances).where(eq(tokenBalances.userId, 1)).limit(1).for("update"))[0];
        if (!wallet) throw new Error("Fixture wallet missing");
        return spendBandedReferralTx(tx, { wallet, level: 2, now: new Date(), meta: { idempotencyKey: "banded-reconfirm", referenceType: "referral_request", referenceId: "101" }, ...(stale ? { expectedCost: { units: 1 as const, band: "early" as const, source: [{ bucket: "free" as const, units: 1 as const, cycleKey: "2026-11" }] } } : {}) });
      });
      await expect(spend(true)).rejects.toBeInstanceOf(AskPriceChangedError);
      expect(await db.select().from(tokenTransactions)).toHaveLength(0);
      expect((await db.select().from(bandedReferralBalances))[0]?.includedRemaining).toBe(1);
      await spend(false);
      expect(await db.select().from(tokenTransactions)).toHaveLength(1);
    } finally { await connection.end(); }
  });
});
