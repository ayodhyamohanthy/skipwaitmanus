import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askCreditCost, askLevelCostEnabled, refundLedgerSpendTx, spendCredits } from "./db";
import { createLedgerFixture, type Row } from "./ledgerFixtureDb";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const fixture = createLedgerFixture();
const db = fixture.tables;
const at = (iso: string) => new Date(iso);
const SEEKER = 7;
const wallet = (patch: Row = {}): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", balance: 4, monthlyCreditsRemaining: 3, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, ...patch });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("PROMO_GRANTS_ENABLED", "false");
  fixture.reset({ wallets: [wallet()], txns: [], users: [{ id: SEEKER, canonicalPersonId: 1 }] });
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixture.database);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("ask credit cost by job level (flag ASK_LEVEL_COST)", () => {
  it("flag off keeps the flat one-credit cost whatever the link says", () => {
    vi.stubEnv("ASK_LEVEL_COST", "false");
    expect(askLevelCostEnabled()).toBe(false);
    expect(askCreditCost({ url: "https://acme.com/careers/senior-frontend-engineer" })).toBe(1);
  });

  it("flag on costs the classified level: a senior link costs 5, a plain link 2", () => {
    vi.stubEnv("ASK_LEVEL_COST", "true");
    expect(askCreditCost({ url: "https://acme.com/careers/senior-frontend-engineer" })).toBe(5);
    expect(askCreditCost({ url: "https://acme.com/jobs/12345" })).toBe(2);
  });

  it("a 5-credit spend draws every bucket it needs and refunds in full", async () => {
    await spendCredits(SEEKER, "job_seeker", { credits: 5, idempotencyKey: "ask-l5", referenceType: "referral_request", referenceId: "900" });
    expect(db.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 0, balance: 2 });
    const refunded = await (fixture.database as any).transaction(async (tx: any) =>
      refundLedgerSpendTx(tx, { userId: SEEKER, requestId: 900, kind: "withdrawal_refund", wallet: db.wallets[0] as any, now: new Date() }));
    expect(refunded.returned).toBe(5);
    expect(db.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 3, balance: 4 });
  });

  it("refund finds spend rows beyond the old six-allocation bound", async () => {
    fixture.reset({
      wallets: [wallet({ balance: 0, monthlyCreditsRemaining: 0 })],
      txns: [7, 8].map(n => ({ id: n, userId: SEEKER, role: "job_seeker", tokenCount: -1, kind: "credit_spend", source: "purchased_balance", referenceType: "referral_request", referenceId: `901#${n}`, idempotencyKey: `ask-wide#${n}`, createdAt: at("2026-10-01T00:00:00Z") })),
      users: [{ id: SEEKER, canonicalPersonId: 1 }],
    });
    const refunded = await (fixture.database as any).transaction(async (tx: any) =>
      refundLedgerSpendTx(tx, { userId: SEEKER, requestId: 901, kind: "withdrawal_refund", wallet: db.wallets[0] as any, now: new Date() }));
    expect(refunded.returned).toBe(2);
  });
});
