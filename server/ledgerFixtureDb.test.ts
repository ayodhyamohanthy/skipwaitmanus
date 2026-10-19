import { describe, expect, it } from "vitest";
import { DrizzleQueryError, and, eq, sql } from "drizzle-orm";
import { paymentFulfillments, tokenBalances, tokenTransactions } from "../drizzle/schema";
import { isDuplicateKey } from "./creditLedger";
import { createLedgerFixture } from "./ledgerFixtureDb";

// The in-memory MySQL stand-in must model exactly the SQL the money paths use and
// throw on anything else: a guessed write would let a ledger test pass on a lie.
const wallet = { id: 1, userId: 7, role: "job_seeker", balance: 5, monthlyCreditsRemaining: 0 };
/** What drizzle-orm 0.45 throws for a unique-key collision: its query error, with the mysql2 error as the cause. */
const DUPLICATE = { cause: { code: "ER_DUP_ENTRY", errno: 1062, sqlState: "23000" } };

describe("ledger fixture database", () => {
  it("applies `column + ?` and `column - ?` to the column being set", async () => {
    const fixture = createLedgerFixture();
    fixture.reset({ wallets: [{ ...wallet }] });
    await fixture.database.update(tokenBalances).set({ balance: sql`${tokenBalances.balance} + ${3}` }).where(eq(tokenBalances.id, 1));
    expect(fixture.tables.wallets[0].balance).toBe(8);
    const debited = await fixture.database.update(tokenBalances).set({ balance: sql`${tokenBalances.balance} - ${2}` }).where(and(eq(tokenBalances.id, 1), eq(tokenBalances.balance, 8)));
    expect(debited).toEqual([{ affectedRows: 1 }]);
    expect(fixture.tables.wallets[0].balance).toBe(6);
    const stale = await fixture.database.update(tokenBalances).set({ balance: sql`${tokenBalances.balance} - ${2}` }).where(and(eq(tokenBalances.id, 1), eq(tokenBalances.balance, 8)));
    expect(stale).toEqual([{ affectedRows: 0 }]);
    expect(fixture.tables.wallets[0].balance).toBe(6);
  });

  it("still throws on any other SQL expression in an update", async () => {
    const fixture = createLedgerFixture();
    fixture.reset({ wallets: [{ ...wallet }] });
    await expect(fixture.database.update(tokenBalances).set({ balance: sql`${tokenBalances.balance} * ${2}` }).where(eq(tokenBalances.id, 1))).rejects.toThrow(/not modelled/);
    await expect(fixture.database.update(tokenBalances).set({ balance: sql`${tokenBalances.monthlyCreditsRemaining} + ${2}` }).where(eq(tokenBalances.id, 1))).rejects.toThrow(/not modelled/);
    await expect(fixture.database.update(tokenBalances).set({ balance: sql`NOW()` }).where(eq(tokenBalances.id, 1))).rejects.toThrow(/not modelled/);
  });

  it("upserts onto the colliding row and inserts when nothing collides", async () => {
    const fixture = createLedgerFixture();
    fixture.reset({ wallets: [{ ...wallet }] });
    await fixture.database.insert(tokenBalances).values({ userId: 7, role: "job_seeker", balance: 4 }).onDuplicateKeyUpdate({ set: { balance: sql`${tokenBalances.balance} + ${4}` } });
    expect(fixture.tables.wallets).toHaveLength(1);
    expect(fixture.tables.wallets[0].balance).toBe(9);
    await fixture.database.insert(tokenBalances).values({ userId: 8, role: "job_seeker", balance: 4 }).onDuplicateKeyUpdate({ set: { balance: sql`${tokenBalances.balance} + ${4}` } });
    expect(fixture.tables.wallets.map(row => [row.userId, row.balance])).toEqual([[7, 9], [8, 4]]);
  });

  it("runs an insert only when it is awaited, and refuses a duplicate payment event or ledger reference", async () => {
    const fixture = createLedgerFixture();
    const pending = fixture.database.insert(paymentFulfillments).values({ provider: "chargebee", providerEventId: "evt_1", userId: 7, role: "job_seeker", tokenCount: 5, amount: 500, currency: "USD" });
    expect(fixture.tables.payments).toHaveLength(0);
    await pending;
    expect(fixture.tables.payments).toHaveLength(1);
    const replay = fixture.database.insert(paymentFulfillments).values({ provider: "chargebee", providerEventId: "evt_1", userId: 8, role: "job_seeker", tokenCount: 5, amount: 500, currency: "USD" });
    await expect(replay).rejects.toBeInstanceOf(DrizzleQueryError);
    await expect(replay).rejects.toMatchObject(DUPLICATE);
    const purchase = { userId: 7, role: "job_seeker", tokenCount: 5, kind: "purchase", source: "purchased_balance", referenceType: "payment_fulfillment", referenceId: "1" };
    await fixture.database.insert(tokenTransactions).values({ ...purchase, idempotencyKey: "payment-credit-1" });
    await expect(fixture.database.insert(tokenTransactions).values({ ...purchase, idempotencyKey: "another-key" })).rejects.toMatchObject(DUPLICATE);
    // A NULL key member never collides, as in MySQL: legacy untagged purchase rows coexist.
    await fixture.database.insert(tokenTransactions).values({ userId: 7, role: "job_seeker", tokenCount: 5, kind: "purchase" });
    await fixture.database.insert(tokenTransactions).values({ userId: 7, role: "job_seeker", tokenCount: 5, kind: "purchase" });
    expect(fixture.tables.txns).toHaveLength(3);
  });

  it("rolls a failed transaction back, increments and upserts included", async () => {
    const fixture = createLedgerFixture();
    fixture.reset({ wallets: [{ ...wallet }] });
    await expect(fixture.database.transaction(async tx => {
      await tx.update(tokenBalances).set({ balance: sql`${tokenBalances.balance} + ${5}` }).where(eq(tokenBalances.id, 1));
      await tx.insert(tokenBalances).values({ userId: 7, role: "job_seeker", balance: 1 }).onDuplicateKeyUpdate({ set: { balance: sql`${tokenBalances.balance} + ${1}` } });
      throw new Error("boom");
    })).rejects.toThrow("boom");
    expect(fixture.tables.wallets).toEqual([wallet]);
  });
});

describe("duplicate-key errors the money paths see", () => {
  it("arrive wrapped the way drizzle wraps every driver error, and the ledger's duplicate check reads through the wrapper", async () => {
    const fixture = createLedgerFixture();
    await fixture.database.insert(tokenTransactions).values({ userId: 7, role: "job_seeker", tokenCount: 5, kind: "purchase", idempotencyKey: "payment-credit-1" });
    const error = await fixture.database.insert(tokenTransactions).values({ userId: 7, role: "job_seeker", tokenCount: 5, kind: "purchase", idempotencyKey: "payment-credit-1" }).then(() => undefined, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(DrizzleQueryError);
    expect((error as { code?: unknown }).code).toBeUndefined();
    expect(String((error as Error).message)).toMatch(/^Failed query: insert into `tokenTransactions`/);
    expect(isDuplicateKey(error)).toBe(true);
  });

  it("are told apart from every other database failure", () => {
    const mysql = (code: string, errno: number) => Object.assign(new Error(code), { code, errno });
    expect(isDuplicateKey(new DrizzleQueryError("insert into `tokenTransactions`", [], mysql("ER_DUP_ENTRY", 1062)))).toBe(true);
    expect(isDuplicateKey(mysql("ER_DUP_ENTRY", 1062))).toBe(true);
    expect(isDuplicateKey(new DrizzleQueryError("insert into `tokenTransactions`", [], mysql("ER_LOCK_DEADLOCK", 1213)))).toBe(false);
    expect(isDuplicateKey(new DrizzleQueryError("insert into `tokenTransactions`", [], mysql("ER_BAD_NULL_ERROR", 1048)))).toBe(false);
    expect(isDuplicateKey(new Error("Duplicate entry in txns"))).toBe(false);
    expect(isDuplicateKey(undefined)).toBe(false);
    const loop: { cause?: unknown } = {}; loop.cause = loop;
    expect(isDuplicateKey(loop)).toBe(false);
  });
});
