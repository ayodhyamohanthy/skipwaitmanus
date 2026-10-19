// 0096: a Free seeker month grants its credits only while a payment method is on
// file. These run against the in-memory ledger fixture (server/ledgerFixtureDb.ts)
// so the grant, its ledger row and the wallet patch are the real code paths.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seekerCycleDue } from "./creditCycles";
import { getTokenWallet, setPaymentMethodOnFile } from "./db";
import { createLedgerFixture, type Row } from "./ledgerFixtureDb";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const fixture = createLedgerFixture();
const db = fixture.tables;

const at = (iso: string) => new Date(iso);
const SEEKER = 7;
const REFERRER = 8;

const freeWallet = (patch: Row = {}): Row => ({
  id: 1, userId: SEEKER, role: "job_seeker", balance: 0,
  monthlyCreditsRemaining: 0, monthlyAllowance: 0, monthlyCycleKey: "2026-09",
  plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null,
  subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null,
  paymentMethodOnFileAt: null, updatedAt: at("2026-09-06T00:00:00Z"), ...patch,
});

const planGrants = () => db.txns.filter(row => row.kind === "plan_grant");
const asWallet = (row: Row) => row as unknown as Parameters<typeof seekerCycleDue>[0];

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("PROMO_GRANTS_ENABLED", "false");
  // D-079 is behind an owner switch and ships OFF; these tests pin the rule ON, and
  // "ships off, so Free grants as it always did" is asserted below.
  vi.stubEnv("FREE_CREDITS_REQUIRE_PAYMENT_METHOD", "true");
  fixture.reset({ wallets: [freeWallet()], txns: [], users: [{ id: SEEKER, canonicalPersonId: 1 }, { id: REFERRER, canonicalPersonId: 2 }] });
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixture.database);
  vi.useFakeTimers();
  vi.setSystemTime(at("2026-10-06T00:05:00Z"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("Free monthly credits require a payment method on file", () => {
  it("ships behind the owner switch: with it off, Free grants its month with no card at all", async () => {
    vi.stubEnv("FREE_CREDITS_REQUIRE_PAYMENT_METHOD", "false");
    const summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(summary).toMatchObject({ monthlyAllowance: 3, monthlyCreditsRemaining: 3, paymentMethodOnFile: false, paymentMethodRequiredForFreeCredits: false });
    expect(planGrants()).toEqual([expect.objectContaining({ tokenCount: 3, sourceCycleKey: "2026-10" })]);
  });

  it("opens the month with no credits and no ledger row while no card is on file", async () => {
    const summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(summary).toMatchObject({ monthlyAllowance: 0, monthlyCreditsRemaining: 0, paymentMethodOnFile: false });
    expect(db.wallets[0]).toMatchObject({ monthlyCycleKey: "2026-10", monthlyAllowance: 0, monthlyCreditsRemaining: 0 });
    // A zero grant must not leave a plan_grant row behind: no credit appears without one.
    expect(planGrants()).toEqual([]);
  });

  it("grants that same month once the card is confirmed, and only once", async () => {
    await getTokenWallet(SEEKER, "job_seeker");
    await setPaymentMethodOnFile(SEEKER, "job_seeker", at("2026-10-06T01:00:00Z"));

    const granted = await getTokenWallet(SEEKER, "job_seeker");
    expect(granted).toMatchObject({ monthlyAllowance: 3, monthlyCreditsRemaining: 3, paymentMethodOnFile: true });
    expect(planGrants()).toEqual([expect.objectContaining({ tokenCount: 3, sourceCycleKey: "2026-10" })]);

    const reread = await getTokenWallet(SEEKER, "job_seeker");
    expect(reread.monthlyCreditsRemaining).toBe(3);
    expect(planGrants()).toHaveLength(1);
  });

  it("grants the month when the card was already on file before the month opened", async () => {
    fixture.reset({ wallets: [freeWallet({ paymentMethodOnFileAt: at("2026-09-20T00:00:00Z") })], txns: [], users: [{ id: SEEKER, canonicalPersonId: 1 }] });
    const summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(summary).toMatchObject({ monthlyAllowance: 3, monthlyCreditsRemaining: 3, paymentMethodOnFile: true });
    expect(planGrants()).toEqual([expect.objectContaining({ tokenCount: 3, sourceCycleKey: "2026-10" })]);
  });

  it("stops granting the next month once the last card is removed", async () => {
    await setPaymentMethodOnFile(SEEKER, "job_seeker", at("2026-10-06T01:00:00Z"));
    expect((await getTokenWallet(SEEKER, "job_seeker")).monthlyCreditsRemaining).toBe(3);

    await setPaymentMethodOnFile(SEEKER, "job_seeker", null);
    vi.setSystemTime(at("2026-11-02T00:05:00Z"));

    const november = await getTokenWallet(SEEKER, "job_seeker");
    expect(november).toMatchObject({ monthlyAllowance: 0, monthlyCreditsRemaining: 0, paymentMethodOnFile: false });
    expect(planGrants().map(row => row.sourceCycleKey)).toEqual(["2026-10"]);
  });

  it("leaves the paid plans alone: a term that was paid for still grants with no card", async () => {
    fixture.reset({
      wallets: [freeWallet({ plan: "pro", subscriptionId: "sub_pro", subscriptionStatus: "active", subscriptionCurrency: "USD", subscriptionCurrentTermStart: at("2026-09-06T00:00:00Z"), subscriptionCurrentTermEnd: at("2026-11-06T00:00:00Z"), monthlyAllowance: 10, monthlyCreditsRemaining: 4, monthlyCycleKey: "2026-09" })],
      txns: [],
      users: [{ id: SEEKER, canonicalPersonId: 1 }],
    });
    const summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(summary).toMatchObject({ monthlyAllowance: 10, monthlyCreditsRemaining: 10, paymentMethodOnFile: false });
    expect(planGrants()).toEqual([expect.objectContaining({ tokenCount: 10, sourceCycleKey: "2026-10" })]);
  });

  it("keeps the referrer wallet's 3 a month, card or not", async () => {
    fixture.reset({
      wallets: [freeWallet({ id: 2, userId: REFERRER, role: "referrer", monthlyAllowance: 3, monthlyCreditsRemaining: 3, monthlyCycleKey: "2026-09" })],
      txns: [],
      users: [{ id: REFERRER, canonicalPersonId: 2 }],
    });
    const summary = await getTokenWallet(REFERRER, "referrer");
    expect(summary).toMatchObject({ monthlyAllowance: 3, monthlyCreditsRemaining: 3 });
  });
});

describe("seekerCycleDue sees a month that a late card makes payable", () => {
  it("is due when the month opened gated and a card has since been confirmed", () => {
    const opened = asWallet(freeWallet({ monthlyCycleKey: "2026-10", monthlyAllowance: 0, monthlyCreditsRemaining: 0, paymentMethodOnFileAt: at("2026-10-06T01:00:00Z") }));
    expect(seekerCycleDue(opened, at("2026-10-06T02:00:00Z"))).toBe(true);
  });

  it("is not due when the month opened gated and no card was ever confirmed", () => {
    const opened = asWallet(freeWallet({ monthlyCycleKey: "2026-10", monthlyAllowance: 0, monthlyCreditsRemaining: 0 }));
    expect(seekerCycleDue(opened, at("2026-10-06T02:00:00Z"))).toBe(false);
  });

  it("is not due once the month's credits are already granted", () => {
    const granted = asWallet(freeWallet({ monthlyCycleKey: "2026-10", monthlyAllowance: 3, monthlyCreditsRemaining: 2, paymentMethodOnFileAt: at("2026-10-06T01:00:00Z") }));
    expect(seekerCycleDue(granted, at("2026-10-06T02:00:00Z"))).toBe(false);
  });
});
