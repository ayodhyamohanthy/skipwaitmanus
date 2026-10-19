// D-079: applying a provider-confirmed card to the wallet: map customer, stamp
// once, grant the current Free month once; unmatched customers surface for the
// owner alert; non-valid statuses never stamp.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyCardValidationEvent, getTokenWallet } from "./db";
import { createLedgerFixture, type Row } from "./ledgerFixtureDb";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const fixture = createLedgerFixture();
const db = fixture.tables;
const at = (iso: string) => new Date(iso);
const SEEKER = 7;
const freeWallet = (patch: Row = {}): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 0, monthlyAllowance: 0, monthlyCycleKey: "2026-10", plan: "free", cardValidatedAt: null, updatedAt: at("2026-10-01T00:00:00Z"), ...patch });
const event = (over: Record<string, unknown> = {}) => ({ eventId: "ev_ps_1", eventType: "payment_source_added", customerId: "cb_cust_1", paymentSourceId: "pm_1", status: "valid", ...over });
const planGrants = () => db.txns.filter(row => row.kind === "plan_grant");

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("FREE_CREDITS_REQUIRE_CARD_VALIDATION", "true");
  fixture.reset({ wallets: [freeWallet()], txns: [], users: [{ id: SEEKER, canonicalPersonId: 1, chargebeeCustomerId: "cb_cust_1" }] });
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixture.database);
  vi.useFakeTimers();
  vi.setSystemTime(at("2026-10-06T00:05:00Z"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("applyCardValidationEvent (D-079)", () => {
  it("a valid source stamps the wallet once and grants the current month once", async () => {
    expect(await applyCardValidationEvent(event())).toEqual({ status: "applied", userId: SEEKER, granted: true });
    expect(db.wallets[0].cardValidatedAt).toBeTruthy();
    expect(db.wallets[0]).toMatchObject({ monthlyAllowance: 3, monthlyCreditsRemaining: 3 });
    expect(planGrants()).toHaveLength(1);

    expect(await applyCardValidationEvent(event({ eventId: "ev_ps_2" }))).toEqual({ status: "applied", userId: SEEKER, granted: false });
    expect(planGrants()).toHaveLength(1);
    expect(db.wallets[0].cardValidatedAt).toBeTruthy();
  });

  it("an unknown Chargebee customer is unmatched (the webhook alerts the owner)", async () => {
    expect(await applyCardValidationEvent(event({ customerId: "cb_other" }))).toEqual({ status: "unmatched", reason: "no_user_for_customer" });
    expect(db.wallets[0].cardValidatedAt).toBeNull();
    expect(planGrants()).toHaveLength(0);
  });

  it("the summary reports the lock state for the client", async () => {
    let summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(summary.cardValidated).toBe(false);
    expect(summary.freeCreditsLocked).toBe(true);

    await applyCardValidationEvent(event());
    summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(summary.cardValidated).toBe(true);
    expect(summary.freeCreditsLocked).toBe(false);

    vi.stubEnv("FREE_CREDITS_REQUIRE_CARD_VALIDATION", "false");
    summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(summary.freeCreditsLocked).toBe(false);
  });

  it("a declined or pending source never stamps and never grants", async () => {
    expect(await applyCardValidationEvent(event({ status: "invalid" }))).toEqual({ status: "invalid_source", reason: "invalid" });
    expect(await applyCardValidationEvent(event({ status: "pending_verification" }))).toEqual({ status: "ignored", reason: "pending_verification" });
    expect(db.wallets[0].cardValidatedAt).toBeNull();
    expect(planGrants()).toHaveLength(0);
  });
});
