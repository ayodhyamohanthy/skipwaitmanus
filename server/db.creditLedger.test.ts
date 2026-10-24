import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creditsLedgerSchema } from "../shared/creditLedger";
import { InsufficientCreditsError, grantTrialCreditsTx, type LedgerTx } from "./creditLedger";
import { applyChargebeeSubscriptionEvent, ensureTokenWallet, getCreditLedgerAudit, getTokenWallet, listCreditLedger, reconcileSeekerCredits, spendCredits, spendToken } from "./db";
import { createLedgerFixture, type Row } from "./ledgerFixtureDb";
import { listWalletsDueForCreditCycle } from "./planCreditCycleJob";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

// The in-memory MySQL stand-in (server/ledgerFixtureDb.ts); `db` is its live tables object.
const fixture = createLedgerFixture();
const db = fixture.tables;

const at = (iso: string) => new Date(iso);
const SEEKER = 7;
const OTHER = 8;
// A Start 30-day pass (10 credits a cycle, one month of carryover) from 6 Sep to 6 Oct.
const wallet = (patch: Row = {}): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", balance: 2, monthlyCreditsRemaining: 4, monthlyAllowance: 10, monthlyCycleKey: "2026-09", plan: "start", subscriptionId: "sub_start", subscriptionStatus: "active", subscriptionCurrency: "USD", subscriptionCurrentTermStart: at("2026-09-06T00:00:00Z"), subscriptionCurrentTermEnd: at("2026-10-06T00:00:00Z"), subscriptionResourceVersion: 10, updatedAt: at("2026-09-06T00:00:00Z"), ...patch });
const renewal = (patch: Row = {}) => ({ eventId: "ev_renew_oct", eventType: "subscription_renewed", subscriptionId: "sub_start", plan: "start" as const, status: "active", currency: "USD" as const, currentTermStart: at("2026-10-06T00:00:00Z"), currentTermEnd: at("2026-11-05T00:00:00Z"), resourceVersion: 20, ...patch });
const purchaseRow = (): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", tokenCount: 2, kind: "purchase", source: "purchased_balance", referenceType: "payment_fulfillment", referenceId: "41", idempotencyKey: "payment-credit-41", createdAt: at("2026-08-01T00:00:00Z") });
const txns = (filter: Row = {}) => db.txns.filter(row => Object.entries(filter).every(([key, value]) => row[key] === value));
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("PROMO_GRANTS_ENABLED", "false");
  // The fixture wallet's 2 purchased credits have their purchase row, so the ledger audit reconciles from the start.
  fixture.reset({ wallets: [wallet()], txns: [purchaseRow()], users: [{ id: SEEKER, canonicalPersonId: 1 }, { id: OTHER, canonicalPersonId: 1 }, { id: 9, canonicalPersonId: 2 }] });
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixture.database);
  vi.useFakeTimers();
  vi.setSystemTime(at("2026-10-06T00:05:00Z"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("plan cycles from webhook-confirmed renewals", () => {
  it("a Start renewal carries the cycle's leftover for one month and grants the new cycle, once", async () => {
    expect(await applyChargebeeSubscriptionEvent(renewal())).toMatchObject({ status: "applied", plan: "start" });
    expect(db.wallets[0]).toMatchObject({ plan: "start", balance: 2, monthlyAllowance: 10, monthlyCreditsRemaining: 10, monthlyCycleKey: "2026-10" });
    expect(db.grants).toHaveLength(1);
    expect(db.grants[0]).toMatchObject({ userId: SEEKER, source: "carryover", subscriptionId: "sub_start", planId: "start", cycleKey: "2026-09", tokenCount: 4, creditsRemaining: 4, status: "active" });
    // Start carries one month: the Sep cycle plus 1 month.
    expect(iso(db.grants[0].expiresAt)).toBe("2026-11-06T00:00:00.000Z");
    expect(txns({ kind: "plan_credit_carryover" }).map(row => [row.tokenCount, row.source, row.creditGrantId ?? null])).toEqual([[-4, "monthly_allowance", null], [4, "carryover_grant", db.grants[0].id]]);
    expect(txns({ kind: "plan_grant" })).toEqual([expect.objectContaining({ tokenCount: 10, source: "monthly_allowance", sourceCycleKey: "2026-10" })]);
    // Replayed delivery: nothing granted or carried twice.
    expect(await applyChargebeeSubscriptionEvent(renewal())).toEqual({ status: "duplicate" });
    expect(db.txns).toHaveLength(4);
    expect(db.grants).toHaveLength(1);

    const summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(summary.totalAvailable).toBe(16);
    expect(creditsLedgerSchema.parse(summary.ledger)).toMatchObject({ balance: 16, buckets: { cycle: 10, carriedOver: 4, welcome: 0, purchased: 2, promo: 0 }, creditsPerMonth: 10, carryover: 1, cycle: { key: "2026-10", granted: 10, used: 0 }, nextExpiry: { credits: 4, expiresAt: "2026-11-06T00:00:00.000Z" }, planCreditsExpiringSoon: null });
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });

  it("an update inside the term keeps the cycle: no grant, no carry", async () => {
    Object.assign(db.wallets[0], { monthlyCycleKey: "2026-10", monthlyCreditsRemaining: 3, subscriptionCurrentTermStart: at("2026-10-06T00:00:00Z"), subscriptionCurrentTermEnd: at("2026-11-06T00:00:00Z") });
    await applyChargebeeSubscriptionEvent(renewal({ eventId: "ev_change", eventType: "subscription_changed", resourceVersion: 21 }));
    expect(db.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 3, monthlyCycleKey: "2026-10" });
    expect(db.txns).toEqual([purchaseRow()]);
  });

  it("a seeker's own subscription ending by webhook ends its plan credits; purchased credits stay; Free's month opens", async () => {
    db.grants.push({ id: 1, userId: SEEKER, role: "job_seeker", source: "carryover", grantKey: "carry:x", planId: "start", subscriptionId: "sub_start", cycleKey: "2026-08", tokenCount: 3, creditsRemaining: 3, status: "active", grantedAt: at("2026-09-06T00:00:00Z"), expiresAt: at("2026-10-06T00:00:00Z"), closedAt: null });
    await applyChargebeeSubscriptionEvent(renewal({ eventId: "ev_cancel", eventType: "subscription_cancelled", status: "cancelled", currentTermStart: at("2026-09-06T00:00:00Z"), currentTermEnd: at("2026-10-06T00:00:00Z") }));
    // Back on Free: the paid cycle's leftover expires and Free's 3 credits for October are granted, once.
    expect(db.wallets[0]).toMatchObject({ plan: "free", balance: 2, monthlyAllowance: 3, monthlyCreditsRemaining: 3, monthlyCycleKey: "2026-10" });
    expect(txns({ kind: "plan_credit_expiry" })).toEqual([expect.objectContaining({ tokenCount: -4, source: "monthly_allowance", sourceCycleKey: "2026-09" })]);
    expect(txns({ kind: "plan_grant" })).toEqual([expect.objectContaining({ tokenCount: 3, source: "monthly_allowance", sourceCycleKey: "2026-10" })]);
    const summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(db.grants[0]).toMatchObject({ status: "expired", creditsRemaining: 0 });
    expect(txns({ kind: "plan_credit_expiry", creditGrantId: 1 })).toEqual([expect.objectContaining({ tokenCount: -3 })]);
    expect(summary).toMatchObject({ plan: "free", totalAvailable: 5, ledger: { creditsPerMonth: 3, carryover: 0, buckets: { cycle: 3, carriedOver: 0, purchased: 2 } } });
    // The cycle bucket reconciles with its rows (the injected grant above has no carry-in row by construction).
    expect((await getCreditLedgerAudit()).mismatches.filter(row => row.bucket === "cycle")).toEqual([]);
  });
});

describe("spending", () => {
  beforeEach(async () => { await applyChargebeeSubscriptionEvent(renewal()); });

  it("spends carried credits first, then the cycle, then purchased; one ledger row per bucket; a replay never spends twice", async () => {
    const first = await spendCredits(SEEKER, "job_seeker", { credits: 6, idempotencyKey: "tool-run-0001", referenceType: "tool_run", referenceId: "run-1" });
    expect(first.replayed).toBe(false);
    expect(db.grants[0]).toMatchObject({ creditsRemaining: 0, status: "exhausted" });
    expect(db.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 8, balance: 2 });
    expect(txns({ kind: "credit_spend" }).map(row => [row.tokenCount, row.source, row.idempotencyKey, row.referenceId])).toEqual([[-4, "carryover_grant", "tool-run-0001#1", "run-1#1"], [-2, "monthly_allowance", "tool-run-0001#2", "run-1#2"]]);
    expect(first.summary.ledger).toMatchObject({ balance: 10, cycle: { used: 6 }, buckets: { carriedOver: 0, cycle: 8, purchased: 2 } });

    const replay = await spendCredits(SEEKER, "job_seeker", { credits: 6, idempotencyKey: "tool-run-0001", referenceType: "tool_run", referenceId: "run-1" });
    expect(replay.replayed).toBe(true);
    expect(db.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 8, balance: 2 });
    expect(txns({ kind: "credit_spend" })).toHaveLength(2);

    await spendCredits(SEEKER, "job_seeker", { credits: 9, idempotencyKey: "tool-run-0002", referenceType: "tool_run", referenceId: "run-2" });
    expect(db.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 0, balance: 1 });
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });

  it("refuses a spend larger than the balance and changes nothing", async () => {
    const before = structuredClone(db);
    await expect(spendCredits(SEEKER, "job_seeker", { credits: 17, idempotencyKey: "tool-run-0003", referenceType: "tool_run", referenceId: "run-3" })).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(db).toEqual(before);
  });

  it("spendToken keeps its single-credit contract on the new order", async () => {
    const summary = await spendToken(SEEKER, "job_seeker");
    expect(summary.totalAvailable).toBe(15);
    expect(db.grants[0]).toMatchObject({ creditsRemaining: 3 });
  });
});

describe("reconcile and the scheduled safety net", () => {
  it("a 90-day Momentum pass opens a cycle every month, catching up missed months, and carries up to 3 months", async () => {
    db.txns = [];
    // 1 Sep + 90 days = 30 Nov: three monthly cycles (Sep, Oct, Nov).
    db.wallets[0] = wallet({ plan: "momentum", subscriptionId: "sub_mom", monthlyAllowance: 36, monthlyCreditsRemaining: 25, balance: 0, monthlyCycleKey: "2026-09", subscriptionCurrentTermStart: at("2026-09-01T00:00:00Z"), subscriptionCurrentTermEnd: at("2026-11-30T00:00:00Z") });
    expect(await listWalletsDueForCreditCycle(at("2026-11-15T00:00:00Z"), 50)).toEqual([SEEKER]);
    expect(await reconcileSeekerCredits(SEEKER, at("2026-11-15T00:00:00Z"))).toEqual({ changed: true });
    expect(db.wallets[0]).toMatchObject({ monthlyCycleKey: "2026-11", monthlyCreditsRemaining: 36 });
    expect(txns({ kind: "plan_grant" }).map(row => row.sourceCycleKey)).toEqual(["2026-10", "2026-11"]);
    expect(db.grants.map(grant => [grant.cycleKey, grant.tokenCount, iso(grant.expiresAt)])).toEqual([["2026-09", 25, "2027-01-01T00:00:00.000Z"], ["2026-10", 36, "2027-02-01T00:00:00.000Z"]]);
    // Same window again: nothing due, nothing written.
    expect(await reconcileSeekerCredits(SEEKER, at("2026-11-15T01:00:00Z"))).toEqual({ changed: false });
    expect(await listWalletsDueForCreditCycle(at("2026-11-15T01:00:00Z"), 50)).toEqual([]);
    expect(db.txns).toHaveLength(6);
    // A reader whose clock is behind (another instance, before the boundary) never rolls the wallet back.
    expect(await reconcileSeekerCredits(SEEKER, at("2026-10-31T23:59:00Z"))).toEqual({ changed: false });
    expect(db.txns).toHaveLength(6);
    vi.setSystemTime(at("2026-11-15T02:00:00Z"));
    const summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(summary.ledger).toMatchObject({ creditsPerMonth: 36, carryover: 3, buckets: { cycle: 36, carriedOver: 61 }, planCreditsExpiringSoon: null, nextExpiry: { credits: 25, expiresAt: "2027-01-01T00:00:00.000Z" } });
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });

  it("a yearly Keep warm term opens a cycle every month across the year boundary, and dated carries roll off with one row each", async () => {
    db.txns = [];
    db.wallets[0] = wallet({ plan: "keep_warm", subscriptionId: "sub_warm", monthlyAllowance: 4, monthlyCreditsRemaining: 3, balance: 0, monthlyCycleKey: "2026-09", subscriptionCurrentTermStart: at("2026-09-01T00:00:00Z"), subscriptionCurrentTermEnd: at("2027-09-01T00:00:00Z") });
    expect(await listWalletsDueForCreditCycle(at("2026-11-15T00:00:00Z"), 50)).toEqual([SEEKER]);
    expect(await reconcileSeekerCredits(SEEKER, at("2026-11-15T00:00:00Z"))).toEqual({ changed: true });
    expect(db.wallets[0]).toMatchObject({ monthlyCycleKey: "2026-11", monthlyCreditsRemaining: 4 });
    expect(txns({ kind: "plan_grant" }).map(row => [row.sourceCycleKey, row.tokenCount])).toEqual([["2026-10", 4], ["2026-11", 4]]);
    // September's window (Sep + 1 month) had already closed when it was caught up: it expires; October's carries to 1 Dec.
    expect(txns({ kind: "plan_credit_expiry" })).toEqual([expect.objectContaining({ tokenCount: -3, sourceCycleKey: "2026-09" })]);
    expect(db.grants.map(grant => [grant.cycleKey, grant.tokenCount, iso(grant.expiresAt)])).toEqual([["2026-10", 4, "2026-12-01T00:00:00.000Z"]]);
    expect(await reconcileSeekerCredits(SEEKER, at("2026-11-15T01:00:00Z"))).toEqual({ changed: false });
    // January: October's carry has rolled off (one ledger row), December and January open.
    await reconcileSeekerCredits(SEEKER, at("2027-01-02T00:00:00Z"));
    expect(db.grants[0]).toMatchObject({ status: "expired", creditsRemaining: 0 });
    expect(txns({ kind: "plan_credit_expiry", creditGrantId: db.grants[0].id })).toEqual([expect.objectContaining({ tokenCount: -4 })]);
    expect(db.wallets[0]).toMatchObject({ monthlyCycleKey: "2027-01", monthlyCreditsRemaining: 4 });
    expect(txns({ kind: "plan_grant" }).map(row => row.sourceCycleKey)).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"]);
    // A reader whose clock is behind (another instance, before the boundary) never rolls the wallet back.
    const written = db.txns.length;
    expect(await reconcileSeekerCredits(SEEKER, at("2026-12-31T23:59:00Z"))).toEqual({ changed: false });
    expect(db.txns).toHaveLength(written);
    vi.setSystemTime(at("2027-01-02T00:00:00Z"));
    const summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(summary.ledger).toMatchObject({ creditsPerMonth: 4, carryover: 1, buckets: { cycle: 4, carriedOver: 4 }, nextExpiry: { credits: 4, expiresAt: "2027-02-01T00:00:00.000Z" } });
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });

  it("a renewing plan waiting for its webhook keeps its credits through the grace, then the renewal carries them", async () => {
    vi.setSystemTime(at("2026-10-07T00:00:00Z"));
    const waiting = await getTokenWallet(SEEKER, "job_seeker");
    expect(db.txns).toEqual([purchaseRow()]);
    expect(db.wallets[0]).toMatchObject({ plan: "start", monthlyCreditsRemaining: 4 });
    // Not spendable while the plan reads as lapsed, but not destroyed either.
    expect(waiting.ledger).toMatchObject({ buckets: { cycle: 0 }, balance: 2 });
    await applyChargebeeSubscriptionEvent(renewal());
    expect(db.grants[0]).toMatchObject({ tokenCount: 4, status: "active" });
  });

  it("a non-renewing plan's credits end at its term end", async () => {
    Object.assign(db.wallets[0], { subscriptionStatus: "non_renewing" });
    vi.setSystemTime(at("2026-10-06T01:00:00Z"));
    const summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(db.wallets[0]).toMatchObject({ plan: "free", subscriptionStatus: "cancelled", monthlyCreditsRemaining: 3, monthlyAllowance: 3, balance: 2 });
    expect(txns({ kind: "plan_credit_expiry" })).toEqual([expect.objectContaining({ tokenCount: -4 })]);
    expect(summary.totalAvailable).toBe(5);
  });

  it("a pass that ends and a second return to Free in the same month grant Free's month once", async () => {
    Object.assign(db.wallets[0], { subscriptionStatus: "non_renewing" });
    vi.setSystemTime(at("2026-10-06T01:00:00Z"));
    await getTokenWallet(SEEKER, "job_seeker");
    expect(txns({ kind: "plan_grant", sourceCycleKey: "2026-10" })).toHaveLength(1);
    // Same month: a webhook moves the wallet to a new paid term, which then lapses again.
    Object.assign(db.wallets[0], { plan: "start", subscriptionId: "sub_two", subscriptionStatus: "non_renewing", subscriptionCurrentTermStart: at("2026-10-06T02:00:00Z"), subscriptionCurrentTermEnd: at("2026-10-07T00:00:00Z"), monthlyCreditsRemaining: 0, monthlyAllowance: 0, monthlyCycleKey: "2026-10" });
    vi.setSystemTime(at("2026-10-08T00:00:00Z"));
    await getTokenWallet(SEEKER, "job_seeker");
    expect(db.wallets[0]).toMatchObject({ plan: "free", monthlyAllowance: 0, monthlyCreditsRemaining: 0, monthlyCycleKey: "2026-10" });
    expect(txns({ kind: "plan_grant", sourceCycleKey: "2026-10" })).toHaveLength(1);
  });

  it("Free: a legacy mid-month wallet keeps its credits; at the month boundary they expire and Free's 3 are granted, once", async () => {
    db.txns = [];
    db.wallets[0] = wallet({ plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, monthlyAllowance: 3, monthlyCreditsRemaining: 2, monthlyCycleKey: "2026-10", balance: 4 });
    expect((await getTokenWallet(SEEKER, "job_seeker")).totalAvailable).toBe(6);
    expect(db.txns).toEqual([]);
    vi.setSystemTime(at("2026-11-01T00:10:00Z"));
    expect(await listWalletsDueForCreditCycle(at("2026-11-01T00:10:00Z"), 50)).toEqual([SEEKER]);
    const summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(db.wallets[0]).toMatchObject({ monthlyAllowance: 3, monthlyCreditsRemaining: 3, monthlyCycleKey: "2026-11", balance: 4 });
    expect(txns({ kind: "plan_credit_expiry" })).toEqual([expect.objectContaining({ tokenCount: -2, sourceCycleKey: "2026-10" })]);
    expect(txns({ kind: "plan_grant" })).toEqual([expect.objectContaining({ tokenCount: 3, sourceCycleKey: "2026-11", source: "monthly_allowance" })]);
    expect(summary).toMatchObject({ totalAvailable: 7, ledger: { creditsPerMonth: 3, carryover: 0, buckets: { cycle: 3, purchased: 4 }, cycle: { key: "2026-11", granted: 3, endsAt: "2026-12-01T00:00:00.000Z" } } });
    await getTokenWallet(SEEKER, "job_seeker");
    await reconcileSeekerCredits(SEEKER, at("2026-11-01T00:20:00Z"));
    expect(db.txns).toHaveLength(2);
    // The scheduled job sees nothing more to do this month.
    expect(await listWalletsDueForCreditCycle(at("2026-11-01T01:10:00Z"), 50)).toEqual([]);
  });

  it("new seeker wallets open Free's month with 3 credits and a ledger row; referrer wallets keep 3 a month", async () => {
    db.wallets = [];
    db.txns = [];
    expect(await ensureTokenWallet(9, "job_seeker")).toMatchObject({ plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 3, monthlyCycleKey: "2026-10", balance: 0 });
    expect(txns({ userId: 9, kind: "plan_grant" })).toEqual([expect.objectContaining({ tokenCount: 3, source: "monthly_allowance", sourceCycleKey: "2026-10", role: "job_seeker" })]);
    expect(await ensureTokenWallet(9, "job_seeker")).toMatchObject({ monthlyCreditsRemaining: 3 });
    expect(txns({ userId: 9 })).toHaveLength(1);
    expect(await ensureTokenWallet(9, "referrer")).toMatchObject({ monthlyAllowance: 3, monthlyCreditsRemaining: 3 });
    expect(txns({ userId: 9 })).toHaveLength(1);
  });
});

// D-067: Pro and Max are removed completely (owner attests no subscribers; no dry run).
// A wallet still marked pro or max is lapsed now: the existing ledger roll moves it to
// Free with one row per credit that ends, keeps its purchased credits and its
// subscription id, and the ledger audit keeps reconciling. Nothing is deleted.
describe("a wallet still marked with a retired plan", () => {
  const legacyWallet = (plan: "pro" | "max"): Row => wallet({ plan, subscriptionId: `sub_${plan}`, monthlyAllowance: 10, monthlyCreditsRemaining: 4, monthlyCycleKey: "2026-10", subscriptionCurrentTermStart: at("2026-10-06T00:00:00Z"), subscriptionCurrentTermEnd: at("2026-11-06T00:00:00Z") });
  const legacyHistory = (plan: "pro" | "max"): Row[] => [
    purchaseRow(),
    { id: 2, userId: SEEKER, role: "job_seeker", tokenCount: -3, kind: "plan_credit_carryover", source: "monthly_allowance", sourceCycleKey: "2026-09", referenceType: "plan_cycle", referenceId: "2026-09:legacy", idempotencyKey: `carry-out:${plan}-sep`, createdAt: at("2026-10-06T00:00:00Z") },
    { id: 3, userId: SEEKER, role: "job_seeker", tokenCount: 3, kind: "plan_credit_carryover", source: "carryover_grant", sourceCycleKey: "2026-09", referenceType: "credit_grant", referenceId: "1", idempotencyKey: "carry-in:1", creditGrantId: 1, createdAt: at("2026-10-06T00:00:00Z") },
    { id: 4, userId: SEEKER, role: "job_seeker", tokenCount: 10, kind: "plan_grant", source: "monthly_allowance", sourceCycleKey: "2026-10", referenceType: "plan_cycle", referenceId: "2026-10:legacy", idempotencyKey: `plan-cycle:${plan}-oct`, createdAt: at("2026-10-06T00:00:00Z") },
    { id: 5, userId: SEEKER, role: "job_seeker", tokenCount: -6, kind: "credit_spend", source: "monthly_allowance", sourceCycleKey: "2026-10", referenceType: "tool_run", referenceId: "run-legacy#1", idempotencyKey: "tool-run-legacy#1", createdAt: at("2026-10-07T00:00:00Z") },
  ];
  const legacyCarry = (plan: "pro" | "max"): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", source: "carryover", grantKey: `carry:${plan}-sep`, planId: plan, subscriptionId: `sub_${plan}`, cycleKey: "2026-09", tokenCount: 3, creditsRemaining: 3, status: "active", grantedAt: at("2026-10-06T00:00:00Z"), expiresAt: at("2026-11-06T00:00:00Z"), closedAt: null });

  it.each(["pro", "max"] as const)("an active %s wallet is read as Free through the ledger roll, and the audit still reconciles", async plan => {
    fixture.reset({ wallets: [legacyWallet(plan)], txns: legacyHistory(plan), grants: [legacyCarry(plan)], users: [{ id: SEEKER, canonicalPersonId: 1 }] });
    vi.setSystemTime(at("2026-10-15T00:00:00Z"));
    expect(await getCreditLedgerAudit()).toMatchObject({ mismatches: [], integrity: [] });
    // The hourly plan-credit-cycles job finds it too, so a wallet nobody reads still moves.
    expect(await listWalletsDueForCreditCycle(at("2026-10-15T00:00:00Z"), 50)).toEqual([SEEKER]);

    const summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(summary).toMatchObject({ plan: "free", totalAvailable: 5, ledger: { creditsPerMonth: 3, carryover: 0, buckets: { cycle: 3, carriedOver: 0, purchased: 2 } } });
    expect(db.wallets[0]).toMatchObject({ plan: "free", subscriptionStatus: "cancelled", subscriptionId: `sub_${plan}`, balance: 2, monthlyAllowance: 3, monthlyCreditsRemaining: 3, monthlyCycleKey: "2026-10" });
    // The retired cycle's leftover and the carried grant each expire with exactly one row; Free's month is granted once.
    expect(txns({ kind: "plan_credit_expiry", source: "monthly_allowance" })).toEqual([expect.objectContaining({ tokenCount: -4, sourceCycleKey: "2026-10" })]);
    expect(txns({ kind: "plan_credit_expiry", creditGrantId: 1 })).toEqual([expect.objectContaining({ tokenCount: -3, source: "carryover_grant" })]);
    expect(db.grants[0]).toMatchObject({ planId: plan, status: "expired", creditsRemaining: 0 });
    expect(txns({ kind: "plan_grant", tokenCount: 3, sourceCycleKey: "2026-10" })).toHaveLength(1);
    // History stays: every retired-plan row is still there.
    for (const row of legacyHistory(plan)) expect(db.txns).toContainEqual(expect.objectContaining({ id: row.id, kind: row.kind, tokenCount: row.tokenCount }));
    expect(await getCreditLedgerAudit()).toMatchObject({ mismatches: [], integrity: [] });

    // A second read, and the hourly job, write nothing.
    const written = db.txns.length;
    await getTokenWallet(SEEKER, "job_seeker");
    expect(await reconcileSeekerCredits(SEEKER, at("2026-10-15T01:00:00Z"))).toEqual({ changed: false });
    expect(await listWalletsDueForCreditCycle(at("2026-10-15T01:00:00Z"), 50)).toEqual([]);
    expect(db.txns).toHaveLength(written);
    expect((await listCreditLedger(SEEKER, "job_seeker", 100)).length).toBeGreaterThan(0);
  });
});

describe("retired welcome grants still read, and nothing grants new ones", () => {
  it("a historic welcome grant row still reconciles in the ledger", async () => {
    db.wallets[0] = wallet({ plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, monthlyAllowance: 0, monthlyCreditsRemaining: 0, monthlyCycleKey: "2026-10", balance: 0 });
    // Exactly what a pre-D-039 wallet holds: the grant row plus its original grant txn row.
    db.grants = [{ id: 1, userId: SEEKER, role: "job_seeker", source: "welcome", grantKey: "welcome:person:1", tokenCount: 3, creditsRemaining: 3, status: "active", grantedAt: at("2026-09-01T00:00:00Z"), expiresAt: null }];
    db.txns = [{ id: 1, userId: SEEKER, role: "job_seeker", tokenCount: 3, kind: "welcome_grant", source: "welcome_grant", referenceType: "credit_grant", referenceId: "1", idempotencyKey: "welcome:1", creditGrantId: 1, createdAt: at("2026-09-01T00:00:00Z") }];
    expect((await getTokenWallet(SEEKER, "job_seeker")).ledger).toMatchObject({ balance: 3, welcome: { granted: true, credits: 3, remaining: 3 } });
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
    // The granter is gone (D-039): reintroducing it must touch this test.
    expect(await import("./db")).not.toHaveProperty("grantWelcomeCredits");
  });

  it("lists only the caller's own rows, newest first, without pending invite rewards", async () => {
    db.txns = [
      { id: 1, userId: SEEKER, role: "job_seeker", tokenCount: 10, kind: "purchase", source: null, referenceType: null, referenceId: null, createdAt: at("2026-09-01T00:00:00Z") },
      { id: 2, userId: OTHER, role: "job_seeker", tokenCount: 5, kind: "purchase", source: null, referenceType: null, referenceId: null, createdAt: at("2026-09-02T00:00:00Z") },
      { id: 3, userId: SEEKER, role: "job_seeker", tokenCount: 1, kind: "invite_reward_pending", source: null, referenceType: null, referenceId: null, createdAt: at("2026-09-03T00:00:00Z") },
      { id: 4, userId: SEEKER, role: "job_seeker", tokenCount: -1, kind: "credit_spend", source: "monthly_allowance", referenceType: "tool_run", referenceId: "run-1#1", createdAt: at("2026-09-04T00:00:00Z") },
      { id: 5, userId: SEEKER, role: "referrer", tokenCount: 3, kind: "admin_adjustment", source: "admin_recovery", referenceType: null, referenceId: null, createdAt: at("2026-09-05T00:00:00Z") },
    ];
    expect(await listCreditLedger(SEEKER, "job_seeker", 50)).toEqual([
      { id: 4, kind: "credit_spend", credits: -1, bucket: "cycle", reference: { type: "tool_run", id: "run-1#1" }, createdAt: "2026-09-04T00:00:00.000Z" },
      { id: 1, kind: "purchase", credits: 10, bucket: "purchased", reference: null, createdAt: "2026-09-01T00:00:00.000Z" },
    ]);
    expect(await listCreditLedger(SEEKER, "job_seeker", 1)).toHaveLength(1);
  });
});

describe("reverse trial credits", () => {
  const freeWallet = () => wallet({ plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, monthlyAllowance: 3, monthlyCreditsRemaining: 3, monthlyCycleKey: "2026-10", balance: 0 });
  // The fixture database stands in for drizzle's transaction handle.
  const grantTrial = (userId: number, canonicalPersonId: number | null, endsAt: Date) => fixture.database.transaction(tx => grantTrialCreditsTx(tx as unknown as LedgerTx, { userId, canonicalPersonId, now: new Date(), endsAt }));

  it("grants 5 credits ending with the trial, once per person across aliases, each with its ledger row", async () => {
    db.txns = [];
    db.wallets[0] = freeWallet();
    const endsAt = at("2026-10-20T00:05:00Z");
    expect(await grantTrial(SEEKER, 1, endsAt)).toMatchObject({ granted: true });
    expect(await grantTrial(SEEKER, 1, endsAt)).toEqual({ granted: false, grantId: null });
    expect(await grantTrial(OTHER, 1, endsAt)).toEqual({ granted: false, grantId: null });
    expect(db.grants).toEqual([expect.objectContaining({ userId: SEEKER, role: "job_seeker", source: "trial", grantKey: "trial:person:1", planId: "momentum", tokenCount: 5, creditsRemaining: 5, status: "active" })]);
    expect(iso(db.grants[0].expiresAt)).toBe("2026-10-20T00:05:00.000Z");
    expect(txns({ kind: "trial_grant" })).toEqual([expect.objectContaining({ userId: SEEKER, tokenCount: 5, source: "trial_grant", creditGrantId: db.grants[0].id })]);
    expect((await getTokenWallet(SEEKER, "job_seeker")).ledger).toMatchObject({ balance: 8, buckets: { trial: 5, cycle: 3 }, nextExpiry: { credits: 5, expiresAt: "2026-10-20T00:05:00.000Z" } });
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });

  it("are spent before Free's month and the rest expire with a ledger row when the trial ends", async () => {
    db.txns = [];
    db.wallets[0] = freeWallet();
    await grantTrial(SEEKER, 1, at("2026-10-20T00:05:00Z"));
    await spendCredits(SEEKER, "job_seeker", { credits: 3, idempotencyKey: "tool-run-0001", referenceType: "tool_run", referenceId: "run-1" });
    expect(db.grants[0]).toMatchObject({ creditsRemaining: 2, status: "active" });
    expect(db.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 3 });
    expect(txns({ kind: "credit_spend" })).toEqual([expect.objectContaining({ tokenCount: -3, source: "trial_grant", creditGrantId: db.grants[0].id })]);
    vi.setSystemTime(at("2026-10-20T00:06:00Z"));
    expect(await listWalletsDueForCreditCycle(at("2026-10-20T00:06:00Z"), 50)).toEqual([SEEKER]);
    await reconcileSeekerCredits(SEEKER, at("2026-10-20T00:06:00Z"));
    expect(db.grants[0]).toMatchObject({ status: "expired", creditsRemaining: 0 });
    expect(txns({ kind: "plan_credit_expiry", creditGrantId: db.grants[0].id })).toEqual([expect.objectContaining({ tokenCount: -2, source: "trial_grant" })]);
    expect((await getTokenWallet(SEEKER, "job_seeker")).ledger).toMatchObject({ balance: 3, buckets: { trial: 0, cycle: 3 } });
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });
});

// D-165 (3): upgrading from Free neither refuses the checkout nor forfeits the
// free month's unused credits. They move into a carry-over grant bound to the
// new subscription, ending when their own free month would have, are spent
// soonest-expiring first, and never become paid credits (D-132).
describe("Free monthly credits carried into a v2 upgrade (D-165 (3))", () => {
  const freeMonthKey = "2026-10";
  const freeUpgradeWallet = (patch: Row = {}): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", balance: 2, monthlyCreditsRemaining: 3, monthlyAllowance: 3, monthlyCycleKey: freeMonthKey, plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, updatedAt: at("2026-10-01T00:00:00Z"), ...patch });
  const freeMonthGrant = (key = freeMonthKey): Row => ({ id: 2, userId: SEEKER, role: "job_seeker", tokenCount: 3, kind: "plan_grant", source: "monthly_allowance", sourceCycleKey: key, referenceType: "plan_cycle", referenceId: `${key}:fixture`, idempotencyKey: `plan-cycle:fixture-${key}`, createdAt: at("2026-10-01T00:00:00Z") });
  const upgradeIntent = (): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", hostedPageId: "page_v2", checkoutIntentId: "intent_v2", plan: "fast_track", itemPriceId: "skipwait_v2plan_fast_track-INR", amount: 162_400, currency: "INR", status: "pending", createdAt: at("2026-10-06T00:00:00Z"), updatedAt: at("2026-10-06T00:00:00Z") });
  const upgrade = (patch: Row = {}) => ({ eventId: "ev_v2_upgrade", eventType: "subscription_created", hostedPageId: "page_v2", passThruContent: "intent_v2", subscriptionId: "sub_v2", planFamily: "fast_track" as const, planFamilyRung: 25 as const, currency: "INR" as const, status: "active", currentTermStart: at("2026-10-06T00:00:00Z"), currentTermEnd: at("2026-11-06T00:00:00Z"), resourceVersion: 10, ...patch });

  beforeEach(() => {
    fixture.reset({ wallets: [freeUpgradeWallet()], txns: [purchaseRow(), freeMonthGrant()], users: [{ id: SEEKER, canonicalPersonId: 1 }], intents: [upgradeIntent()] });
  });

  it("carries 3 unused Free credits into a grant that ends with their month, once", async () => {
    expect(await applyChargebeeSubscriptionEvent(upgrade())).toMatchObject({ status: "applied", plan: "fast_track" });
    expect(db.wallets[0]).toMatchObject({ plan: "fast_track", subscriptionId: "sub_v2", balance: 2, monthlyAllowance: 0, monthlyCreditsRemaining: 0, monthlyCycleKey: freeMonthKey });
    expect(db.grants).toHaveLength(1);
    expect(db.grants[0]).toMatchObject({ userId: SEEKER, role: "job_seeker", source: "carryover", planId: "free", subscriptionId: "sub_v2", cycleKey: freeMonthKey, tokenCount: 3, creditsRemaining: 3, status: "active" });
    // The free month ends at the first instant of the next UTC month.
    expect(iso(db.grants[0].expiresAt)).toBe("2026-11-01T00:00:00.000Z");
    expect(txns({ kind: "plan_credit_carryover" }).map(row => [row.tokenCount, row.source, row.creditGrantId ?? null])).toEqual([[-3, "monthly_allowance", null], [3, "carryover_grant", db.grants[0].id]]);
    // Read back as the ledger: carried credits are spendable, free credits never became paid.
    const summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(summary.ledger).toMatchObject({ balance: 5, buckets: { carriedOver: 3, cycle: 0, purchased: 2 }, nextExpiry: { credits: 3, expiresAt: "2026-11-01T00:00:00.000Z" } });
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
    // A replayed delivery is a duplicate: nothing carried twice.
    expect(await applyChargebeeSubscriptionEvent(upgrade())).toEqual({ status: "duplicate" });
    expect(db.grants).toHaveLength(1);
    expect(txns({ kind: "plan_credit_carryover" })).toHaveLength(2);
  });

  it("upgrades with no unused Free credits without creating a grant", async () => {
    db.wallets[0] = freeUpgradeWallet({ monthlyCreditsRemaining: 0 });
    db.txns.push({ id: 3, userId: SEEKER, role: "job_seeker", tokenCount: -3, kind: "credit_spend", source: "monthly_allowance", sourceCycleKey: freeMonthKey, referenceType: "referral_request", referenceId: "55", idempotencyKey: "ask-delivery:55#1", createdAt: at("2026-10-02T00:00:00Z") });
    expect(await applyChargebeeSubscriptionEvent(upgrade())).toMatchObject({ status: "applied", plan: "fast_track" });
    expect(db.wallets[0]).toMatchObject({ plan: "fast_track", subscriptionId: "sub_v2", monthlyCreditsRemaining: 0 });
    expect(db.grants).toEqual([]);
    expect(txns({ kind: "plan_credit_carryover" })).toEqual([]);
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });

  it("spends carried Free credits first, and they expire on their own date with one row", async () => {
    await applyChargebeeSubscriptionEvent(upgrade());
    await spendCredits(SEEKER, "job_seeker", { credits: 1, idempotencyKey: "tool-run-0100", referenceType: "tool_run", referenceId: "run-100" });
    expect(db.grants[0]).toMatchObject({ creditsRemaining: 2 });
    expect(txns({ kind: "credit_spend" })).toEqual([expect.objectContaining({ tokenCount: -1, source: "carryover_grant", creditGrantId: db.grants[0].id })]);
    vi.setSystemTime(at("2026-11-02T00:05:00Z"));
    expect(await reconcileSeekerCredits(SEEKER, at("2026-11-02T00:05:00Z"))).toEqual({ changed: true });
    expect(db.grants[0]).toMatchObject({ status: "expired", creditsRemaining: 0 });
    expect(txns({ kind: "plan_credit_expiry", creditGrantId: db.grants[0].id })).toEqual([expect.objectContaining({ tokenCount: -2, source: "carryover_grant" })]);
    expect((await getTokenWallet(SEEKER, "job_seeker")).ledger).toMatchObject({ buckets: { carriedOver: 0, purchased: 2 } });
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });

  it("a Free month that already ended carries nothing and expires its leftover", async () => {
    db.wallets[0] = freeUpgradeWallet({ monthlyCycleKey: "2026-08", monthlyCreditsRemaining: 2 });
    db.txns = [purchaseRow(), freeMonthGrant("2026-08"), { id: 3, userId: SEEKER, role: "job_seeker", tokenCount: -1, kind: "credit_spend", source: "monthly_allowance", sourceCycleKey: "2026-08", referenceType: "referral_request", referenceId: "54", idempotencyKey: "ask-delivery:54#1", createdAt: at("2026-08-10T00:00:00Z") }];
    expect(await applyChargebeeSubscriptionEvent(upgrade())).toMatchObject({ status: "applied", plan: "fast_track" });
    expect(db.wallets[0]).toMatchObject({ plan: "fast_track", subscriptionId: "sub_v2", monthlyAllowance: 0, monthlyCreditsRemaining: 0 });
    expect(db.grants).toEqual([]);
    expect(txns({ kind: "plan_credit_expiry" })).toEqual([expect.objectContaining({ tokenCount: -2, source: "monthly_allowance", sourceCycleKey: "2026-08" })]);
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });
});
