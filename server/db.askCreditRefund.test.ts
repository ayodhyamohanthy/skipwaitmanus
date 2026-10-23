import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refundLedgerSpendTx, spendCredits } from "./db";
import { createLedgerFixture, type Row } from "./ledgerFixtureDb";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const fixture = createLedgerFixture();
const db = fixture.tables;
const at = (iso: string) => new Date(iso);
const SEEKER = 7;
const wallet = (patch: Row = {}): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 3, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, ...patch });
const ask = (n: number) => ({ credits: 1, idempotencyKey: `ask-${n}`, referenceType: "referral_request", referenceId: String(500 + n) });

async function refund(requestId: number, kind: "withdrawal_refund" | "expiry_refund" = "withdrawal_refund") {
  return (fixture.database as any).transaction(async (tx: any) => {
    const current = db.wallets[0];
    return refundLedgerSpendTx(tx, { userId: SEEKER, requestId, kind, wallet: current as any, now: new Date() });
  });
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("PROMO_GRANTS_ENABLED", "false");
  fixture.reset({ wallets: [wallet()], txns: [], users: [{ id: SEEKER, canonicalPersonId: 1 }] });
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixture.database);
  vi.useFakeTimers();
  vi.setSystemTime(at("2026-10-16T00:00:00Z"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("ledger-spent ask credit refund", () => {
  it("spends one monthly credit at send and returns it once on withdraw, replay changes nothing", async () => {
    await spendCredits(SEEKER, "job_seeker", ask(1));
    expect(db.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 2, balance: 0 });
    const first = await refund(501);
    expect(first.returned).toBe(1);
    expect(db.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 3 });
    const again = await refund(501);
    expect(again.returned).toBe(0);
    expect(db.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 3 });
    expect(db.txns.filter(row => row.kind === "withdrawal_refund")).toHaveLength(1);
  });

  it("returns a purchased credit to the purchased balance", async () => {
    fixture.reset({ wallets: [wallet({ balance: 2, monthlyCreditsRemaining: 0 })], txns: [{ id: 1, userId: SEEKER, role: "job_seeker", tokenCount: 2, kind: "purchase", source: "purchased_balance", referenceType: "payment_fulfillment", referenceId: "1", idempotencyKey: "p1", createdAt: at("2026-10-01T00:00:00Z") }], users: [{ id: SEEKER, canonicalPersonId: 1 }] });
    await spendCredits(SEEKER, "job_seeker", ask(2));
    expect(db.wallets[0]).toMatchObject({ balance: 1 });
    await refund(502, "expiry_refund");
    expect(db.wallets[0]).toMatchObject({ balance: 2 });
    expect(db.txns.filter(row => row.kind === "expiry_refund")).toEqual([expect.objectContaining({ tokenCount: 1, source: "purchased_balance" })]);
  });

  it("a monthly credit spent in a cycle that has since rolled logs a 0-credit refund and mints nothing", async () => {
    await spendCredits(SEEKER, "job_seeker", ask(3));
    Object.assign(db.wallets[0], { monthlyCycleKey: "2026-11", monthlyCreditsRemaining: 3 });
    const result = await refund(503);
    expect(result.returned).toBe(0);
    expect(db.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 3, balance: 0 });
    expect(db.txns.filter(row => row.kind === "withdrawal_refund")).toEqual([expect.objectContaining({ tokenCount: 0 })]);
  });

  it("never refunds a claimed or unrelated ask: only spend rows of this ask are reversed", async () => {
    await spendCredits(SEEKER, "job_seeker", ask(4));
    await spendCredits(SEEKER, "job_seeker", ask(5));
    await refund(504);
    expect(db.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 2 });
    expect(db.txns.filter(row => row.kind === "withdrawal_refund").map(row => row.referenceId)).toEqual(["504#refund#1"]);
  });

  it("an empty wallet refuses the spend and records nothing", async () => {
    Object.assign(db.wallets[0], { monthlyCreditsRemaining: 0, balance: 0 });
    await expect(spendCredits(SEEKER, "job_seeker", ask(6))).rejects.toThrow(/credit/i);
    expect(db.txns.filter(row => row.kind === "credit_spend")).toHaveLength(0);
  });

  it("a grant credit goes back to its own grant, and a grant that expired meanwhile takes nothing back", async () => {
    Object.assign(db.wallets[0], { monthlyCreditsRemaining: 0, balance: 0 });
    // A historic pre-D-039 welcome grant row: the refund plumbing is source-agnostic, so it covers every grant source.
    db.grants = [{ id: 1, userId: SEEKER, role: "job_seeker", source: "welcome", grantKey: "welcome:person:1", tokenCount: 3, creditsRemaining: 3, status: "active", grantedAt: at("2026-10-01T00:00:00Z"), expiresAt: null }];
    await spendCredits(SEEKER, "job_seeker", ask(7));
    expect(db.grants[0]).toMatchObject({ creditsRemaining: 2 });
    const back = await refund(507);
    expect(back.returned).toBe(1);
    expect(db.grants[0]).toMatchObject({ creditsRemaining: 3, status: "active" });
    expect(db.txns.filter(row => row.kind === "withdrawal_refund")).toEqual([expect.objectContaining({ tokenCount: 1, creditGrantId: db.grants[0].id })]);
    await spendCredits(SEEKER, "job_seeker", ask(8));
    Object.assign(db.grants[0], { status: "expired", creditsRemaining: 0 });
    const lost = await refund(508);
    expect(lost.returned).toBe(0);
    expect(db.grants[0]).toMatchObject({ creditsRemaining: 0, status: "expired" });
    expect(db.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 0, balance: 0 });
  });

  it("mixed free+paid spend across month rollover: only paid credits return on refund", async () => {
    Object.assign(db.wallets[0], { monthlyCreditsRemaining: 3, monthlyAllowance: 3, monthlyCycleKey: "2026-10", balance: 2 });
    db.txns.push({ id: 10, userId: SEEKER, role: "job_seeker", tokenCount: 2, kind: "purchase", source: "purchased_balance", referenceType: "payment_fulfillment", referenceId: "10", idempotencyKey: "p10", createdAt: at("2026-10-01T00:00:00Z") });
    await spendCredits(SEEKER, "job_seeker", { credits: 5, idempotencyKey: "ask-509", referenceType: "referral_request", referenceId: "509" });
    expect(db.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 0, balance: 0 });
    // Month rolls over
    Object.assign(db.wallets[0], { monthlyCycleKey: "2026-11", monthlyCreditsRemaining: 3 });
    const result = await refund(509);
    // Only the 2 paid credits return to balance; the 3 monthly credits expired with cycle 2026-10
    expect(result.returned).toBe(2);
    expect(db.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 3, balance: 2 });
    const reversals = db.txns.filter(row => row.kind === "withdrawal_refund");
    expect(reversals).toEqual(expect.arrayContaining([
      expect.objectContaining({ tokenCount: 0, source: "monthly_allowance" }),
      expect.objectContaining({ tokenCount: 2, source: "purchased_balance" }),
    ]));
  });

  it("a paid rung credit spent on a paid plan returns after cycle roll under PAID_CREDITS_NEVER_EXPIRE only when ASK_LEVEL_COST is on", async () => {
    Object.assign(db.wallets[0], {
      plan: "start",
      subscriptionId: "sub_start",
      subscriptionStatus: "active",
      subscriptionCurrentTermStart: at("2026-10-01T00:00:00Z"),
      subscriptionCurrentTermEnd: at("2026-11-01T00:00:00Z"),
      monthlyCreditsRemaining: 1,
      monthlyAllowance: 10,
      monthlyCycleKey: "2026-10",
      balance: 0,
    });
    await spendCredits(SEEKER, "job_seeker", { credits: 1, idempotencyKey: "ask-510", referenceType: "referral_request", referenceId: "510" });
    expect(db.wallets[0].monthlyCreditsRemaining).toBe(0);
    // Cycle rolls over to 2026-11
    Object.assign(db.wallets[0], { monthlyCycleKey: "2026-11", monthlyCreditsRemaining: 10 });

    // Live flags-off path: cycle credits expire and are not returned
    const offResult = await refund(510);
    expect(offResult.returned).toBe(0);
    expect(db.wallets[0].balance).toBe(0);

    // Flags-on counterpart: paid subscriber cycle credits never expire and return to balance
    vi.stubEnv("ASK_LEVEL_COST", "true");
    db.txns = db.txns.filter(t => t.kind !== "withdrawal_refund");
    const onResult = await refund(510);
    expect(onResult.returned).toBe(1);
    expect(db.wallets[0].balance).toBe(1);
  });
});
