// D-079 slice checks (the D-065 pattern: each money packet adds its own): with
// the flag on, a locked wallet holding free credits, or free credits without a
// grant row, reaches the owner's daily money check.
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
const freeWallet = (patch: Row = {}): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 0, monthlyAllowance: 0, monthlyCycleKey: "2026-10", plan: "free", cardValidatedAt: null, updatedAt: at("2026-10-01T00:00:00Z"), ...patch });
const grantRow = (patch: Row = {}): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", tokenCount: 3, kind: "plan_grant", source: "monthly_allowance", sourceCycleKey: "2026-10", referenceType: "plan_cycle", referenceId: "2026-10:abc", idempotencyKey: "plan-cycle:abc", createdAt: at("2026-10-01T00:00:00Z"), ...patch });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("FREE_CREDITS_REQUIRE_CARD_VALIDATION", "true");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixture.database);
  vi.useFakeTimers();
  vi.setSystemTime(at("2026-10-06T00:05:00Z"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("daily money check: card-validation slices (D-079, flag on)", () => {
  it("flags a locked wallet that holds free credits anyway", async () => {
    fixture.reset({ wallets: [freeWallet({ monthlyCreditsRemaining: 3, monthlyAllowance: 3 })], txns: [grantRow()], users: [{ id: SEEKER }] });
    const audit = await getCreditLedgerAudit();
    expect(audit.integrity).toEqual([expect.objectContaining({ type: "locked_wallet_holds_free_credits", userId: SEEKER })]);
  });

  it("flags free credits without a grant row on a validated wallet", async () => {
    fixture.reset({ wallets: [freeWallet({ monthlyCreditsRemaining: 3, monthlyAllowance: 3, cardValidatedAt: at("2026-10-02T00:00:00Z") })], txns: [], users: [{ id: SEEKER }] });
    const audit = await getCreditLedgerAudit();
    expect(audit.integrity).toEqual([expect.objectContaining({ type: "validated_wallet_missing_cycle_grant", userId: SEEKER })]);
  });

  it("a clean validated wallet with its grant row reports nothing", async () => {
    fixture.reset({ wallets: [freeWallet({ monthlyCreditsRemaining: 3, monthlyAllowance: 3, cardValidatedAt: at("2026-10-02T00:00:00Z") })], txns: [grantRow()], users: [{ id: SEEKER }] });
    const audit = await getCreditLedgerAudit();
    expect(audit.integrity).toEqual([]);
    expect(audit.mismatches).toEqual([]);
  });

  it("flag off: the locked-wallet check stays silent (today's behaviour)", async () => {
    vi.stubEnv("FREE_CREDITS_REQUIRE_CARD_VALIDATION", "false");
    fixture.reset({ wallets: [freeWallet({ monthlyCreditsRemaining: 3, monthlyAllowance: 3 })], txns: [grantRow()], users: [{ id: SEEKER }] });
    const audit = await getCreditLedgerAudit();
    expect(audit.integrity).toEqual([]);
  });
});
