// D-127 retired the D-079 sign-up card gate and its two audit slices
// (locked_wallet_holds_free_credits / validated_wallet_missing_cycle_grant):
// the conditions can no longer occur. What remains worth proving is that a
// normal free wallet with its grant row passes the daily money check clean,
// with or without a validated card.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCreditLedgerAudit } from "./db";
import { createLedgerFixture, type Row } from "./ledgerFixtureDb";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const fixture = createLedgerFixture();
const db = fixture.tables;
const at = (iso: string) => new Date(iso);
const SEEKER = 7;
const freeWallet = (patch: Row = {}): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 3, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan: "free", cardValidatedAt: null, updatedAt: at("2026-10-01T00:00:00Z"), ...patch });
const grantRow = (patch: Row = {}): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", tokenCount: 3, kind: "plan_grant", source: "monthly_allowance", sourceCycleKey: "2026-10", referenceType: "plan_cycle", referenceId: "2026-10:abc", idempotencyKey: "plan-cycle:abc", createdAt: at("2026-10-01T00:00:00Z"), ...patch });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixture.database);
  vi.useFakeTimers();
  vi.setSystemTime(at("2026-10-06T00:05:00Z"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("daily money check after the D-127 gate retirement", () => {
  it("an unvalidated free wallet holding its granted credits reports nothing", async () => {
    fixture.reset({ wallets: [freeWallet()], txns: [grantRow()], users: [{ id: SEEKER }] });
    const audit = await getCreditLedgerAudit();
    expect(audit.integrity).toEqual([]);
    expect(audit.mismatches).toEqual([]);
  });
});
