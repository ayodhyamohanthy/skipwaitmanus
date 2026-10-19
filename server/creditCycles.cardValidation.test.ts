// D-079: with FREE_CREDITS_REQUIRE_CARD_VALIDATION on, a seeker's Free monthly
// credits open locked (no plan_grant row) until the provider confirms a card;
// validation then grants the current month exactly once. The flag-off path is
// the control: today's behaviour, untouched.
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
  vi.stubEnv("FREE_CREDITS_REQUIRE_CARD_VALIDATION", "true");
  fixture.reset({ wallets: [], txns: [], users: [{ id: SEEKER, canonicalPersonId: 1 }] });
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixture.database);
  vi.useFakeTimers();
  vi.setSystemTime(at("2026-10-06T00:05:00Z"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("the card-validation gate on Free cycle grants (flag on)", () => {
  it("a new seeker's first cycle opens locked: 0 credits, current month, no plan_grant row", async () => {
    await ensureTokenWallet(SEEKER, "job_seeker");
    expect(db.wallets[0]).toMatchObject({ monthlyCycleKey: "2026-10", monthlyAllowance: 0, monthlyCreditsRemaining: 0 });
    expect(db.wallets[0].cardValidatedAt ?? null).toBeNull();
    expect(planGrants()).toHaveLength(0);
  });

  it("control: flag off grants 3 on the first cycle, as today", async () => {
    vi.stubEnv("FREE_CREDITS_REQUIRE_CARD_VALIDATION", "false");
    await ensureTokenWallet(SEEKER, "job_seeker");
    expect(db.wallets[0]).toMatchObject({ monthlyCycleKey: "2026-10", monthlyAllowance: 3, monthlyCreditsRemaining: 3 });
    expect(planGrants()).toHaveLength(1);
    expect(planGrants()[0]).toMatchObject({ tokenCount: 3, sourceCycleKey: "2026-10" });
  });

  it("a monthly roll stays locked while no card is validated, and grants once validated", async () => {
    fixture.reset({ wallets: [freeWallet()], txns: [], users: [{ id: SEEKER, canonicalPersonId: 1 }] });
    expect(await reconcileSeekerCredits(SEEKER, at("2026-10-06T00:05:00Z"))).toEqual({ changed: true });
    expect(db.wallets[0]).toMatchObject({ monthlyCycleKey: "2026-10", monthlyAllowance: 0, monthlyCreditsRemaining: 0 });
    expect(planGrants()).toHaveLength(0);

    Object.assign(db.wallets[0], { cardValidatedAt: at("2026-10-07T09:00:00Z") });
    expect(await reconcileSeekerCredits(SEEKER, at("2026-10-07T09:00:00Z"))).toEqual({ changed: true });
    expect(db.wallets[0]).toMatchObject({ monthlyCycleKey: "2026-10", monthlyAllowance: 3, monthlyCreditsRemaining: 3 });
    expect(planGrants()).toHaveLength(1);
  });

  it("validation mid-cycle grants the current month once, and a repeat signal grants nothing", async () => {
    fixture.reset({ wallets: [freeWallet({ monthlyCycleKey: "2026-10", cardValidatedAt: at("2026-10-06T08:00:00Z") })], txns: [], users: [{ id: SEEKER, canonicalPersonId: 1 }] });
    expect(await grantFreeCreditsOnValidation(SEEKER, at("2026-10-06T08:05:00Z"))).toEqual({ granted: true });
    expect(db.wallets[0]).toMatchObject({ monthlyAllowance: 3, monthlyCreditsRemaining: 3 });
    expect(planGrants()).toHaveLength(1);
    expect(planGrants()[0].idempotencyKey).toMatch(/^plan-cycle:/);

    expect(await grantFreeCreditsOnValidation(SEEKER, at("2026-10-06T08:06:00Z"))).toEqual({ granted: false });
    expect(planGrants()).toHaveLength(1);
    expect(db.wallets[0]).toMatchObject({ monthlyAllowance: 3, monthlyCreditsRemaining: 3 });
  });

  it("grant-on-validation refuses a cycle that is behind (reconcile owns the roll)", async () => {
    fixture.reset({ wallets: [freeWallet({ cardValidatedAt: at("2026-10-06T08:00:00Z") })], txns: [], users: [{ id: SEEKER, canonicalPersonId: 1 }] });
    expect(await grantFreeCreditsOnValidation(SEEKER, at("2026-10-06T08:05:00Z"))).toEqual({ granted: false });
    expect(planGrants()).toHaveLength(0);
  });

  it("the next month's roll grants normally once validated (one plan_grant per month)", async () => {
    fixture.reset({ wallets: [freeWallet({ monthlyCycleKey: "2026-10", monthlyAllowance: 3, monthlyCreditsRemaining: 3, cardValidatedAt: at("2026-10-06T08:00:00Z") })], txns: [], users: [{ id: SEEKER, canonicalPersonId: 1 }] });
    expect(await reconcileSeekerCredits(SEEKER, at("2026-11-15T00:00:00Z"))).toEqual({ changed: true });
    expect(db.wallets[0]).toMatchObject({ monthlyCycleKey: "2026-11", monthlyAllowance: 3, monthlyCreditsRemaining: 3 });
    expect(planGrants().map(row => row.sourceCycleKey)).toEqual(["2026-11"]);
  });

  it("an unvalidated wallet stays locked through later reconciles (no grant sneaks in)", async () => {
    fixture.reset({ wallets: [freeWallet()], txns: [], users: [{ id: SEEKER, canonicalPersonId: 1 }] });
    await reconcileSeekerCredits(SEEKER, at("2026-10-06T00:05:00Z"));
    expect(await reconcileSeekerCredits(SEEKER, at("2026-10-20T00:05:00Z"))).toEqual({ changed: false });
    expect(db.wallets[0]).toMatchObject({ monthlyCycleKey: "2026-10", monthlyCreditsRemaining: 0 });
    expect(planGrants()).toHaveLength(0);
  });
});
