import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InsufficientCreditsError } from "./creditLedger";
import { applyChargebeeSubscriptionEvent, getCreditLedgerAudit, getTokenWallet, reconcileSeekerCredits, spendCredits } from "./db";
import { createLedgerFixture, type Row } from "./ledgerFixtureDb";
import { listWalletsDueForCreditCycle } from "./planCreditCycleJob";

// Credit-ledger guards: a cycle is granted once whichever path opens it, one
// person's credits never move another's, and the switch to the ledger leaves
// every pre-kit balance exactly where it was (so no data backfill is needed).
const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const fixture = createLedgerFixture();
const db = fixture.tables;

const at = (iso: string) => new Date(iso);
const SEEKER = 7;
const OTHER = 8;
// A Start 30-day pass (10 credits a cycle, one month of carryover) from 6 Sep to 6 Oct.
const wallet = (patch: Row = {}): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", balance: 2, monthlyCreditsRemaining: 4, monthlyAllowance: 10, monthlyCycleKey: "2026-09", plan: "start", subscriptionId: "sub_start", subscriptionStatus: "active", subscriptionCurrency: "USD", subscriptionCurrentTermStart: at("2026-09-06T00:00:00Z"), subscriptionCurrentTermEnd: at("2026-10-06T00:00:00Z"), subscriptionResourceVersion: 10, updatedAt: at("2026-09-06T00:00:00Z"), ...patch });
const renewal = (patch: Row = {}) => ({ eventId: "ev_renew_oct", eventType: "subscription_renewed", subscriptionId: "sub_start", plan: "start" as const, status: "active", currency: "USD" as const, currentTermStart: at("2026-10-06T00:00:00Z"), currentTermEnd: at("2026-11-05T00:00:00Z"), resourceVersion: 20, ...patch });
const purchase = (id: number, userId: number, tokenCount: number, role = "job_seeker"): Row => ({ id, userId, role, tokenCount, kind: "purchase", source: "purchased_balance", referenceType: "payment_fulfillment", referenceId: String(40 + id), idempotencyKey: `payment-credit-${40 + id}`, createdAt: at("2026-08-01T00:00:00Z") });
const rowsOf = (userId: number) => ({ wallets: db.wallets.filter(row => row.userId === userId), grants: db.grants.filter(row => row.userId === userId), txns: db.txns.filter(row => row.userId === userId) });
const kinds = (kind: string) => db.txns.filter(row => row.kind === kind);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("PROMO_GRANTS_ENABLED", "false");
  fixture.reset({ wallets: [wallet()], txns: [purchase(1, SEEKER, 2)], users: [{ id: SEEKER, canonicalPersonId: 1 }, { id: OTHER, canonicalPersonId: 2 }] });
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixture.database);
  vi.useFakeTimers();
  vi.setSystemTime(at("2026-10-06T00:05:00Z"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("a plan cycle is granted once", () => {
  it("a renewal confirmed by two events and swept by the hourly job grants and carries once", async () => {
    expect(await applyChargebeeSubscriptionEvent(renewal())).toMatchObject({ status: "applied" });
    // A second provider event for the same term (new id, newer resource version) is an update inside the term.
    expect(await applyChargebeeSubscriptionEvent(renewal({ eventId: "ev_changed_oct", eventType: "subscription_changed", resourceVersion: 21 }))).toMatchObject({ status: "applied" });
    expect(await listWalletsDueForCreditCycle(at("2026-10-06T01:00:00Z"), 50)).toEqual([]);
    expect(await reconcileSeekerCredits(SEEKER, at("2026-10-06T01:00:00Z"))).toEqual({ changed: false });
    await getTokenWallet(SEEKER, "job_seeker");
    expect(kinds("plan_grant")).toHaveLength(1);
    expect(kinds("plan_credit_carryover")).toHaveLength(2);
    expect(db.grants).toHaveLength(1);
    expect(db.wallets[0]).toMatchObject({ monthlyCreditsRemaining: 10, monthlyCycleKey: "2026-10", subscriptionResourceVersion: 21 });
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });

  it.each([["the carried leftover", 4], ["the cycle grant", 0]] as const)("a wallet read back to before its renewal cannot be paid the same cycle twice: the key on %s refuses it and nothing is written", async (_bucket, leftover) => {
    db.wallets[0].monthlyCreditsRemaining = leftover;
    await applyChargebeeSubscriptionEvent(renewal());
    // Simulate a wallet whose cycle columns went stale (restored row, lost write): it reads as September again.
    Object.assign(db.wallets[0], { monthlyCycleKey: "2026-09", monthlyCreditsRemaining: leftover, subscriptionCurrentTermStart: at("2026-09-06T00:00:00Z"), subscriptionCurrentTermEnd: at("2026-10-06T00:00:00Z"), subscriptionResourceVersion: 10 });
    const before = structuredClone(db);
    // Production shape: drizzle's DrizzleQueryError carrying the mysql2 duplicate-key error as its cause.
    await expect(applyChargebeeSubscriptionEvent(renewal({ eventId: "ev_renew_oct_again", resourceVersion: 22 }))).rejects.toMatchObject({ cause: { code: "ER_DUP_ENTRY", errno: 1062 } });
    expect(db).toEqual(before);
    expect(kinds("plan_grant")).toHaveLength(1);
  });

  it("the multi-cycle safety net and an in-term webhook never open the same month twice", async () => {
    // A 90-day Momentum pass (1 Sep to 30 Nov): three monthly cycles of 36 credits.
    fixture.reset({ wallets: [wallet({ plan: "momentum", subscriptionId: "sub_mom", monthlyAllowance: 36, monthlyCreditsRemaining: 25, subscriptionCurrentTermStart: at("2026-09-01T00:00:00Z"), subscriptionCurrentTermEnd: at("2026-11-30T00:00:00Z") })], txns: [purchase(1, SEEKER, 2)], users: [{ id: SEEKER, canonicalPersonId: 1 }] });
    vi.setSystemTime(at("2026-10-02T00:00:00Z"));
    expect(await reconcileSeekerCredits(SEEKER, at("2026-10-02T00:00:00Z"))).toEqual({ changed: true });
    const inTerm = { eventId: "ev_mom_changed", eventType: "subscription_changed", subscriptionId: "sub_mom", plan: "momentum" as const, status: "active", currency: "USD" as const, currentTermStart: at("2026-09-01T00:00:00Z"), currentTermEnd: at("2026-11-30T00:00:00Z"), resourceVersion: 30 };
    expect(await applyChargebeeSubscriptionEvent(inTerm)).toMatchObject({ status: "applied" });
    await getTokenWallet(SEEKER, "job_seeker");
    expect(await reconcileSeekerCredits(SEEKER, at("2026-10-02T01:00:00Z"))).toEqual({ changed: false });
    expect(kinds("plan_grant").map(row => row.sourceCycleKey)).toEqual(["2026-10"]);
    expect(db.wallets[0]).toMatchObject({ monthlyCycleKey: "2026-10", monthlyCreditsRemaining: 36 });
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });
});

describe("one person's credits never move another's", () => {
  const otherWallet = (patch: Row = {}): Row => wallet({ id: 2, userId: OTHER, balance: 5, monthlyCreditsRemaining: 6, monthlyCycleKey: "2026-10", subscriptionId: "sub_other", subscriptionCurrentTermStart: at("2026-10-01T00:00:00Z"), subscriptionCurrentTermEnd: at("2026-11-01T00:00:00Z"), ...patch });
  const otherGrant = (patch: Row = {}): Row => ({ id: 1, userId: OTHER, role: "job_seeker", source: "carryover", grantKey: "carry:other", planId: "start", subscriptionId: "sub_other", cycleKey: "2026-09", tokenCount: 8, creditsRemaining: 8, status: "active", grantedAt: at("2026-10-01T00:00:00Z"), expiresAt: at("2026-11-01T00:00:00Z"), closedAt: null, ...patch });

  beforeEach(() => {
    db.wallets.push(otherWallet());
    db.grants.push(otherGrant());
    db.txns.push(purchase(2, OTHER, 5), { id: 3, userId: OTHER, role: "job_seeker", tokenCount: 8, kind: "plan_credit_carryover", source: "carryover_grant", referenceType: "credit_grant", referenceId: "1", idempotencyKey: "carry-in:1", creditGrantId: 1, createdAt: at("2026-10-01T00:00:00Z") });
  });

  it("a spend draws only the caller's own buckets and is refused past them, whatever another seeker holds", async () => {
    await applyChargebeeSubscriptionEvent(renewal());
    const otherBefore = structuredClone(rowsOf(OTHER));
    const spent = await spendCredits(SEEKER, "job_seeker", { credits: 16, idempotencyKey: "tool-run-0100", referenceType: "tool_run", referenceId: "run-100" });
    expect(spent.summary.totalAvailable).toBe(0);
    await expect(spendCredits(SEEKER, "job_seeker", { credits: 1, idempotencyKey: "tool-run-0101", referenceType: "tool_run", referenceId: "run-101" })).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(rowsOf(OTHER)).toEqual(otherBefore);
    const spendRows = kinds("credit_spend");
    expect(spendRows.length).toBeGreaterThan(0);
    expect(spendRows.every(row => row.userId === SEEKER && row.creditGrantId !== 1)).toBe(true);
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });

  it("reconcile and the summary stay inside the caller's wallet; the job expires each seeker's grant as its own owner", async () => {
    db.grants[0].expiresAt = at("2026-10-05T00:00:00Z");
    await applyChargebeeSubscriptionEvent(renewal());
    const summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(summary.ledger).toMatchObject({ buckets: { carriedOver: 4, cycle: 10, purchased: 2 }, balance: 16 });
    expect(db.grants.find(row => row.userId === OTHER)).toMatchObject({ status: "active", creditsRemaining: 8 });
    expect(rowsOf(OTHER).txns.some(row => row.kind === "plan_credit_expiry")).toBe(false);
    expect(await listWalletsDueForCreditCycle(at("2026-10-06T01:00:00Z"), 50)).toEqual([OTHER]);
    expect(await reconcileSeekerCredits(OTHER, at("2026-10-06T01:00:00Z"))).toEqual({ changed: true });
    expect(db.grants.find(row => row.userId === OTHER)).toMatchObject({ status: "expired", creditsRemaining: 0 });
    expect(kinds("plan_credit_expiry")).toEqual([expect.objectContaining({ userId: OTHER, tokenCount: -8, creditGrantId: 1 })]);
    expect(db.grants.find(row => row.userId === SEEKER)).toMatchObject({ status: "active", creditsRemaining: 4 });
  });
});

describe("the switch to the ledger moves nobody's credits", () => {
  it("pre-kit wallets read the total they held before, and reading writes nothing", async () => {
    vi.setSystemTime(at("2026-10-14T12:00:00Z"));
    const pre = [
      wallet({ id: 1, userId: 11, monthlyCycleKey: "2026-10", monthlyCreditsRemaining: 7, balance: 2, subscriptionId: "sub_a", subscriptionCurrentTermStart: at("2026-10-06T00:00:00Z"), subscriptionCurrentTermEnd: at("2026-11-06T00:00:00Z") }),
      wallet({ id: 2, userId: 12, plan: "momentum", monthlyAllowance: 36, monthlyCycleKey: "2026-09", monthlyCreditsRemaining: 12, balance: 0, subscriptionId: "sub_b", subscriptionStatus: "non_renewing", subscriptionCurrentTermStart: at("2026-09-20T00:00:00Z"), subscriptionCurrentTermEnd: at("2026-10-20T00:00:00Z") }),
      wallet({ id: 3, userId: 13, plan: "free", monthlyAllowance: 3, monthlyCycleKey: "2026-10", monthlyCreditsRemaining: 1, balance: 4, subscriptionId: null, subscriptionStatus: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null }),
      wallet({ id: 4, userId: 13, role: "referrer", plan: "free", monthlyAllowance: 3, monthlyCycleKey: "2026-10", monthlyCreditsRemaining: 2, balance: 1, subscriptionId: null, subscriptionStatus: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null }),
    ];
    fixture.reset({ wallets: pre, txns: [purchase(1, 11, 2), purchase(2, 13, 4), purchase(3, 13, 1, "referrer")] });
    const before = structuredClone(db);
    for (const held of pre) {
      const legacyTotal = Number(held.monthlyCreditsRemaining) + Number(held.balance);
      const summary = await getTokenWallet(Number(held.userId), held.role === "referrer" ? "referrer" : "job_seeker");
      expect({ userId: held.userId, role: held.role, total: summary.totalAvailable, ledger: summary.ledger?.balance }).toEqual({ userId: held.userId, role: held.role, total: legacyTotal, ledger: legacyTotal });
    }
    expect(db).toEqual(before);
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });
});

// D-067: a referrer wallet still marked pro or max reads as Free on the pre-kit referrer
// path (normalizedWalletState): 3 a month from the next month, purchased credits untouched.
describe("a referrer wallet still marked with a retired plan", () => {
  it.each(["pro", "max"] as const)("a referrer %s wallet normalizes to Free on read and keeps its purchased credits", async plan => {
    vi.setSystemTime(at("2026-10-14T12:00:00Z"));
    const referrer = wallet({ id: 5, userId: 21, role: "referrer", plan, monthlyAllowance: 30, monthlyCreditsRemaining: 2, monthlyCycleKey: "2026-10", balance: 6, subscriptionId: `sub_ref_${plan}`, subscriptionStatus: "active", subscriptionCurrentTermStart: at("2026-10-01T00:00:00Z"), subscriptionCurrentTermEnd: at("2026-11-01T00:00:00Z") });
    fixture.reset({ wallets: [referrer], txns: [purchase(1, 21, 6, "referrer")], users: [{ id: 21, canonicalPersonId: 3 }] });
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
    const summary = await getTokenWallet(21, "referrer");
    expect(summary).toMatchObject({ plan: "free", monthlyAllowance: 3, purchasedCreditsRemaining: 6 });
    expect(db.wallets[0]).toMatchObject({ plan: "free", subscriptionStatus: "cancelled", monthlyAllowance: 3, balance: 6, subscriptionId: `sub_ref_${plan}` });
    // What this month already granted stays for the month (the pre-kit rule for any lapsed referrer plan); next month is Free's 3.
    expect(db.wallets[0].monthlyCreditsRemaining).toBe(2);
    expect(db.txns).toEqual([purchase(1, 21, 6, "referrer")]);
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
    vi.setSystemTime(at("2026-11-02T00:00:00Z"));
    expect(await getTokenWallet(21, "referrer")).toMatchObject({ plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 3, purchasedCreditsRemaining: 6 });
  });
});
