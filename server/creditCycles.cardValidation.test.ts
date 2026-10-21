// D-127 (supersedes D-079): free monthly credits are NEVER gated on card
// validation at sign-up, whatever the retired flag says - card validation
// belongs to the first purchase. The grant-on-validation heal stays as an
// idempotent repair for historical wallets and grants nothing twice.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureTokenWallet, grantFreeCreditsOnValidation, reconcileSeekerCredits } from "./db";
import { createLedgerFixture, type Row } from "./ledgerFixtureDb";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const fixture = createLedgerFixture();
const db = fixture.tables;
const at = (iso: string) => new Date(iso);
const SEEKER = 7;
const freeWallet = (patch: Row = {}): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 0, monthlyAllowance: 0, monthlyCycleKey: "2026-09", plan: "free", cardValidatedAt: null, updatedAt: at("2026-09-01T00:00:00Z"), ...patch });
const planGrants = () => db.txns.filter(row => row.kind === "plan_grant");

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("FREE_CREDITS_REQUIRE_CARD_VALIDATION", "true"); // retired flag, set to prove it no longer gates
  fixture.reset({ wallets: [], txns: [], users: [{ id: SEEKER, canonicalPersonId: 1 }] });
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixture.database);
  vi.useFakeTimers();
  vi.setSystemTime(at("2026-10-06T00:05:00Z"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("Free cycle grants are never gated on card validation (D-127)", () => {
  it("a free user can spend free credits without a validated card - first cycle grants 3 even with the retired flag on", async () => {
    await ensureTokenWallet(SEEKER, "job_seeker");
    expect(db.wallets[0]).toMatchObject({ monthlyCycleKey: "2026-10", monthlyAllowance: 3, monthlyCreditsRemaining: 3 });
    expect(db.wallets[0].cardValidatedAt ?? null).toBeNull();
    expect(planGrants()).toHaveLength(1);
    expect(planGrants()[0]).toMatchObject({ tokenCount: 3, sourceCycleKey: "2026-10" });
  });

  it("flag off behaves identically", async () => {
    vi.stubEnv("FREE_CREDITS_REQUIRE_CARD_VALIDATION", "false");
    await ensureTokenWallet(SEEKER, "job_seeker");
    expect(db.wallets[0]).toMatchObject({ monthlyCycleKey: "2026-10", monthlyAllowance: 3, monthlyCreditsRemaining: 3 });
    expect(planGrants()).toHaveLength(1);
  });

  it("a monthly roll grants without validation (one plan_grant per month)", async () => {
    fixture.reset({ wallets: [freeWallet({ monthlyCycleKey: "2026-10", monthlyAllowance: 3, monthlyCreditsRemaining: 3 })], txns: [], users: [{ id: SEEKER, canonicalPersonId: 1 }] });
    expect(await reconcileSeekerCredits(SEEKER, at("2026-11-15T00:00:00Z"))).toEqual({ changed: true });
    expect(db.wallets[0]).toMatchObject({ monthlyCycleKey: "2026-11", monthlyAllowance: 3, monthlyCreditsRemaining: 3 });
    expect(planGrants().map(row => row.sourceCycleKey)).toEqual(["2026-11"]);
  });

  it("the validation heal grants a grant-less current cycle once, and a repeat signal grants nothing", async () => {
    fixture.reset({ wallets: [freeWallet({ monthlyCycleKey: "2026-10", cardValidatedAt: at("2026-10-06T08:00:00Z") })], txns: [], users: [{ id: SEEKER, canonicalPersonId: 1 }] });
    expect(await grantFreeCreditsOnValidation(SEEKER, at("2026-10-06T08:05:00Z"))).toEqual({ granted: true });
    expect(db.wallets[0]).toMatchObject({ monthlyAllowance: 3, monthlyCreditsRemaining: 3 });
    expect(planGrants()).toHaveLength(1);
    expect(planGrants()[0].idempotencyKey).toMatch(/^plan-cycle:/);

    expect(await grantFreeCreditsOnValidation(SEEKER, at("2026-10-06T08:06:00Z"))).toEqual({ granted: false });
    expect(planGrants()).toHaveLength(1);
    expect(db.wallets[0]).toMatchObject({ monthlyAllowance: 3, monthlyCreditsRemaining: 3 });
  });

  it("the heal refuses a cycle that is behind (reconcile owns the roll)", async () => {
    fixture.reset({ wallets: [freeWallet({ cardValidatedAt: at("2026-10-06T08:00:00Z") })], txns: [], users: [{ id: SEEKER, canonicalPersonId: 1 }] });
    expect(await grantFreeCreditsOnValidation(SEEKER, at("2026-10-06T08:05:00Z"))).toEqual({ granted: false });
    expect(planGrants()).toHaveLength(0);
  });
});
