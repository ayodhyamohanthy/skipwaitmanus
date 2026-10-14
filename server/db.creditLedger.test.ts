import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { notifications, operationalActivityLogs, planCreditGrants, promoCreditGrants, referralRequests, subscriptionCheckoutIntents, subscriptionEvents, tokenBalances, tokenTransactions, users } from "../drizzle/schema";
import { creditsLedgerSchema } from "../shared/creditLedger";
import { InsufficientCreditsError } from "./creditLedger";
import { applyChargebeeSubscriptionEvent, ensureTokenWallet, getCreditLedgerAudit, getTokenWallet, grantWelcomeCredits, listCreditLedger, reconcileSeekerCredits, spendCredits, spendToken } from "./db";
import { listWalletsDueForCreditCycle } from "./planCreditCycleJob";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

// An in-memory MySQL stand-in for the ledger paths: it evaluates the drizzle
// predicates these paths use (=, <>, <, <=, >, IS [NOT] NULL, [NOT] IN, AND),
// orders and limits, enforces the unique keys the ledger relies on for
// idempotency, and rolls a failed transaction back.
type Row = Record<string, unknown>;
const dialect = new MySqlDialect();
let db: Record<string, Row[]>;

const TABLES = new Map<unknown, string>([[tokenBalances, "wallets"], [tokenTransactions, "txns"], [planCreditGrants, "grants"], [promoCreditGrants, "promo"], [notifications, "notes"], [users, "users"], [subscriptionEvents, "events"], [subscriptionCheckoutIntents, "intents"], [operationalActivityLogs, "activity"], [referralRequests, "requests"]]);
const rowsOf = (table: unknown) => { const name = TABLES.get(table); if (!name) throw new Error("Unexpected table"); return db[name]; };

const asValue = (value: unknown) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) return Date.parse(`${value.replace(" ", "T")}Z`);
  return value;
};

function matches(condition: SQL | undefined, row: Row): boolean {
  if (!condition) return true;
  const query = dialect.sqlToQuery(condition);
  if (/\bor\b/i.test(query.sql)) throw new Error(`OR predicates are not modelled: ${query.sql}`);
  const tokens = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)`\s*(<>|<=|>=|=|<|>|is not null|is null|not in|in)\s*(\((?:\?(?:,\s*)?)+\))?/gi)];
  let i = 0;
  for (const [, column, rawOp, list] of tokens) {
    const op = rawOp.toLowerCase();
    const value = asValue(row[column] ?? null);
    if (op === "is null") { if (value !== null) return false; continue; }
    if (op === "is not null") { if (value === null) return false; continue; }
    if (op === "in" || op === "not in") {
      const size = (list?.match(/\?/g) ?? []).length;
      const params = query.params.slice(i, i + size).map(asValue); i += size;
      if (params.includes(value) === (op === "not in")) return false;
      continue;
    }
    const param = asValue(query.params[i++]);
    if (op === "=" && value !== param) return false;
    if (op === "<>" && value === param) return false;
    if ((op === "<" || op === "<=" || op === ">" || op === ">=") && (typeof value !== "number" || typeof param !== "number")) return false;
    if (op === "<" && !((value as number) < (param as number))) return false;
    if (op === "<=" && !((value as number) <= (param as number))) return false;
    if (op === ">" && !((value as number) > (param as number))) return false;
    if (op === ">=" && !((value as number) >= (param as number))) return false;
  }
  return true;
}

function sorter(orders: SQL[]) {
  const keys = orders.map(order => { const { sql } = dialect.sqlToQuery(order); const match = /`([^`]+)`\s*(asc|desc)?$/i.exec(sql.trim()); return { column: match?.[1] ?? "id", desc: /desc$/i.test(sql.trim()) }; });
  return (a: Row, b: Row) => { for (const key of keys) { const x = asValue(a[key.column]) as number; const y = asValue(b[key.column]) as number; if (x !== y) return (x < y ? -1 : 1) * (key.desc ? -1 : 1); } return 0; };
}

function selection(table: unknown, projection: Row | undefined, where?: SQL) {
  let orders: SQL[] = [];
  let limit = Number.POSITIVE_INFINITY;
  const run = () => {
    const rows = rowsOf(table).filter(row => matches(where, row)).sort(sorter(orders)).slice(0, limit);
    const cloned = structuredClone(rows);
    return projection ? cloned.map(row => Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[(column as { name: string }).name] ?? null]))) : cloned;
  };
  const chain = {
    where: (condition: SQL) => selection(table, projection, condition),
    orderBy: (...next: SQL[]) => { orders = next; return chain; },
    limit: (n: number) => { limit = n; return chain; },
    for: async () => run(),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve().then(run).then(resolve, reject),
  };
  return chain;
}

function enforceUnique(name: string, row: Row) {
  const rows = db[name];
  const dup = (keys: string[]) => keys.every(key => row[key] !== null && row[key] !== undefined) && rows.some(other => keys.every(key => other[key] === row[key]));
  const violated = name === "txns" ? dup(["userId", "role", "idempotencyKey", "kind"]) || dup(["userId", "role", "kind", "referenceType", "referenceId"])
    : name === "grants" ? dup(["grantKey"])
    : name === "wallets" ? dup(["userId", "role"])
    : name === "events" ? dup(["provider", "providerEventId"])
    : name === "notes" ? dup(["eventKey"]) : false;
  if (violated) throw Object.assign(new Error(`Duplicate entry in ${name}`), { code: "ER_DUP_ENTRY", errno: 1062 });
}

function api() {
  return {
    select: (projection?: Row) => ({ from: (table: unknown) => Object.assign(selection(table, projection), { leftJoin: () => ({ where: () => selection(referralRequests, projection, undefined) }) }) }),
    insert: (table: unknown) => ({ values: async (input: Row | Row[]) => {
      const name = TABLES.get(table); if (!name) throw new Error("Unexpected table");
      let insertId = 0;
      for (const row of Array.isArray(input) ? input : [input]) { enforceUnique(name, row); insertId = (db[name].reduce((max, other) => Math.max(max, Number(other.id ?? 0)), 0)) + 1; db[name].push({ id: insertId, createdAt: new Date(), ...structuredClone(row) }); }
      return [{ affectedRows: 1, insertId }];
    } }),
    update: (table: unknown) => ({ set: (patch: Row) => ({ where: async (condition: SQL) => {
      const selected = rowsOf(table).filter(row => matches(condition, row));
      for (const row of selected) for (const [key, value] of Object.entries(patch)) { if (value instanceof SQL) throw new Error("SQL expressions in updates are not modelled"); if (value !== undefined) row[key] = structuredClone(value); }
      return [{ affectedRows: selected.length }];
    } }) }),
  };
}

function fixtureDatabase() {
  const base = api();
  return { ...base, transaction: async (callback: (tx: ReturnType<typeof api>) => Promise<unknown>) => {
    const snapshot = structuredClone(db);
    try { return await callback(base); } catch (error) { db = snapshot; throw error; }
  } };
}

const at = (iso: string) => new Date(iso);
const SEEKER = 7;
const OTHER = 8;
const wallet = (patch: Row = {}): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", balance: 2, monthlyCreditsRemaining: 4, monthlyAllowance: 10, monthlyCycleKey: "2026-09", plan: "pro", subscriptionId: "sub_pro", subscriptionStatus: "active", subscriptionCurrency: "USD", subscriptionCurrentTermStart: at("2026-09-06T00:00:00Z"), subscriptionCurrentTermEnd: at("2026-10-06T00:00:00Z"), subscriptionResourceVersion: 10, updatedAt: at("2026-09-06T00:00:00Z"), ...patch });
const renewal = (patch: Row = {}) => ({ eventId: "ev_renew_oct", eventType: "subscription_renewed", subscriptionId: "sub_pro", plan: "pro" as const, status: "active", currency: "USD" as const, currentTermStart: at("2026-10-06T00:00:00Z"), currentTermEnd: at("2026-11-06T00:00:00Z"), resourceVersion: 20, ...patch });
const purchaseRow = (): Row => ({ id: 1, userId: SEEKER, role: "job_seeker", tokenCount: 2, kind: "purchase", source: "purchased_balance", referenceType: "payment_fulfillment", referenceId: "41", idempotencyKey: "payment-credit-41", createdAt: at("2026-08-01T00:00:00Z") });
const txns = (filter: Row = {}) => db.txns.filter(row => Object.entries(filter).every(([key, value]) => row[key] === value));
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("PROMO_GRANTS_ENABLED", "false");
  // The fixture wallet's 2 purchased credits have their purchase row, so the ledger audit reconciles from the start.
  db = { wallets: [wallet()], txns: [purchaseRow()], grants: [], promo: [], notes: [], users: [{ id: SEEKER, canonicalPersonId: 1 }, { id: OTHER, canonicalPersonId: 1 }, { id: 9, canonicalPersonId: 2 }], events: [], intents: [], activity: [], requests: [] };
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
  vi.useFakeTimers();
  vi.setSystemTime(at("2026-10-06T00:05:00Z"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("plan cycles from webhook-confirmed renewals", () => {
  it("a legacy Pro renewal carries the cycle's leftover for one month and grants the new cycle, once", async () => {
    expect(await applyChargebeeSubscriptionEvent(renewal())).toMatchObject({ status: "applied", plan: "pro" });
    expect(db.wallets[0]).toMatchObject({ plan: "pro", balance: 2, monthlyAllowance: 10, monthlyCreditsRemaining: 10, monthlyCycleKey: "2026-10" });
    expect(db.grants).toHaveLength(1);
    expect(db.grants[0]).toMatchObject({ userId: SEEKER, source: "carryover", subscriptionId: "sub_pro", planId: "pro", cycleKey: "2026-09", tokenCount: 4, creditsRemaining: 4, status: "active" });
    // Pro is grandfathered at Start: one month of carryover (Sep cycle + 1 month).
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

  it("a seeker's own subscription ending by webhook ends its plan credits; purchased credits stay", async () => {
    db.grants.push({ id: 1, userId: SEEKER, role: "job_seeker", source: "carryover", grantKey: "carry:x", planId: "pro", subscriptionId: "sub_pro", cycleKey: "2026-08", tokenCount: 3, creditsRemaining: 3, status: "active", grantedAt: at("2026-09-06T00:00:00Z"), expiresAt: at("2026-10-06T00:00:00Z"), closedAt: null });
    await applyChargebeeSubscriptionEvent(renewal({ eventId: "ev_cancel", eventType: "subscription_cancelled", status: "cancelled", currentTermStart: at("2026-09-06T00:00:00Z"), currentTermEnd: at("2026-10-06T00:00:00Z") }));
    expect(db.wallets[0]).toMatchObject({ plan: "free", balance: 2, monthlyAllowance: 0, monthlyCreditsRemaining: 0 });
    expect(txns({ kind: "plan_credit_expiry" })).toEqual([expect.objectContaining({ tokenCount: -4, source: "monthly_allowance", sourceCycleKey: "2026-09" })]);
    const summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(db.grants[0]).toMatchObject({ status: "expired", creditsRemaining: 0 });
    expect(txns({ kind: "plan_credit_expiry", creditGrantId: 1 })).toEqual([expect.objectContaining({ tokenCount: -3 })]);
    expect(summary).toMatchObject({ plan: "free", totalAvailable: 2, ledger: { buckets: { cycle: 0, carriedOver: 0, purchased: 2 } } });
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
  it("a yearly Max term opens a cycle every month, catching up missed months, and carries up to 3 months", async () => {
    db.txns = [];
    db.wallets[0] = wallet({ plan: "max", subscriptionId: "sub_max", monthlyAllowance: 30, monthlyCreditsRemaining: 25, balance: 0, monthlyCycleKey: "2026-09", subscriptionCurrentTermStart: at("2026-09-01T00:00:00Z"), subscriptionCurrentTermEnd: at("2027-09-01T00:00:00Z") });
    expect(await listWalletsDueForCreditCycle(at("2026-11-15T00:00:00Z"), 50)).toEqual([SEEKER]);
    expect(await reconcileSeekerCredits(SEEKER, at("2026-11-15T00:00:00Z"))).toEqual({ changed: true });
    expect(db.wallets[0]).toMatchObject({ monthlyCycleKey: "2026-11", monthlyCreditsRemaining: 30 });
    expect(txns({ kind: "plan_grant" }).map(row => row.sourceCycleKey)).toEqual(["2026-10", "2026-11"]);
    expect(db.grants.map(grant => [grant.cycleKey, grant.tokenCount, iso(grant.expiresAt)])).toEqual([["2026-09", 25, "2027-01-01T00:00:00.000Z"], ["2026-10", 30, "2027-02-01T00:00:00.000Z"]]);
    // Same window again: nothing due, nothing written.
    expect(await reconcileSeekerCredits(SEEKER, at("2026-11-15T01:00:00Z"))).toEqual({ changed: false });
    expect(await listWalletsDueForCreditCycle(at("2026-11-15T01:00:00Z"), 50)).toEqual([]);
    expect(db.txns).toHaveLength(6);
    // January: the September carry has rolled off (one ledger row), two more cycles open.
    await reconcileSeekerCredits(SEEKER, at("2027-01-02T00:00:00Z"));
    expect(db.grants[0]).toMatchObject({ status: "expired", creditsRemaining: 0 });
    expect(txns({ kind: "plan_credit_expiry", creditGrantId: db.grants[0].id })).toEqual([expect.objectContaining({ tokenCount: -25 })]);
    expect(db.wallets[0]).toMatchObject({ monthlyCycleKey: "2027-01", monthlyCreditsRemaining: 30 });
    // A reader whose clock is behind (another instance, before the boundary) never rolls the wallet back.
    expect(await reconcileSeekerCredits(SEEKER, at("2026-12-31T23:59:00Z"))).toEqual({ changed: false });
    vi.setSystemTime(at("2027-01-02T00:00:00Z"));
    const summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(summary.ledger).toMatchObject({ creditsPerMonth: 30, carryover: 3, buckets: { cycle: 30, carriedOver: 90 }, planCreditsExpiringSoon: null, nextExpiry: { credits: 30, expiresAt: "2027-02-01T00:00:00.000Z" } });
    expect((await getCreditLedgerAudit()).mismatches).toEqual([]);
  });

  it("a renewing plan waiting for its webhook keeps its credits through the grace, then the renewal carries them", async () => {
    vi.setSystemTime(at("2026-10-07T00:00:00Z"));
    const waiting = await getTokenWallet(SEEKER, "job_seeker");
    expect(db.txns).toEqual([purchaseRow()]);
    expect(db.wallets[0]).toMatchObject({ plan: "pro", monthlyCreditsRemaining: 4 });
    // Not spendable while the plan reads as lapsed, but not destroyed either.
    expect(waiting.ledger).toMatchObject({ buckets: { cycle: 0 }, balance: 2 });
    await applyChargebeeSubscriptionEvent(renewal());
    expect(db.grants[0]).toMatchObject({ tokenCount: 4, status: "active" });
  });

  it("a non-renewing plan's credits end at its term end", async () => {
    Object.assign(db.wallets[0], { subscriptionStatus: "non_renewing" });
    vi.setSystemTime(at("2026-10-06T01:00:00Z"));
    const summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(db.wallets[0]).toMatchObject({ plan: "free", subscriptionStatus: "cancelled", monthlyCreditsRemaining: 0, monthlyAllowance: 0, balance: 2 });
    expect(txns({ kind: "plan_credit_expiry" })).toEqual([expect.objectContaining({ tokenCount: -4 })]);
    expect(summary.totalAvailable).toBe(2);
  });

  it("Free: a legacy mid-month wallet keeps its credits; at the month boundary they expire and no Free credits are granted", async () => {
    db.txns = [];
    db.wallets[0] = wallet({ plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, monthlyAllowance: 3, monthlyCreditsRemaining: 2, monthlyCycleKey: "2026-10", balance: 4 });
    expect((await getTokenWallet(SEEKER, "job_seeker")).totalAvailable).toBe(6);
    expect(db.txns).toEqual([]);
    vi.setSystemTime(at("2026-11-01T00:10:00Z"));
    expect(await listWalletsDueForCreditCycle(at("2026-11-01T00:10:00Z"), 50)).toEqual([SEEKER]);
    const summary = await getTokenWallet(SEEKER, "job_seeker");
    expect(db.wallets[0]).toMatchObject({ monthlyAllowance: 0, monthlyCreditsRemaining: 0, monthlyCycleKey: "2026-11", balance: 4 });
    expect(txns({ kind: "plan_credit_expiry" })).toEqual([expect.objectContaining({ tokenCount: -2, sourceCycleKey: "2026-10" })]);
    expect(summary).toMatchObject({ totalAvailable: 4, ledger: { creditsPerMonth: 0, buckets: { purchased: 4 } } });
    await getTokenWallet(SEEKER, "job_seeker");
    expect(db.txns).toHaveLength(1);
  });

  it("new seeker wallets hold no plan credits; referrer wallets keep 3 a month", async () => {
    db.wallets = [];
    expect(await ensureTokenWallet(9, "job_seeker")).toMatchObject({ monthlyAllowance: 0, monthlyCreditsRemaining: 0, balance: 0 });
    expect(await ensureTokenWallet(9, "referrer")).toMatchObject({ monthlyAllowance: 3, monthlyCreditsRemaining: 3 });
  });
});

describe("welcome credits and the ledger read", () => {
  it("grants 3 welcome credits once per person across aliases, with a ledger row and a notice", async () => {
    db.wallets[0] = wallet({ plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, monthlyAllowance: 0, monthlyCreditsRemaining: 0, monthlyCycleKey: "2026-10", balance: 0 });
    expect(await grantWelcomeCredits(SEEKER)).toEqual({ granted: true });
    expect(await grantWelcomeCredits(SEEKER)).toEqual({ granted: false });
    expect(await grantWelcomeCredits(OTHER)).toEqual({ granted: false });
    expect(db.grants).toEqual([expect.objectContaining({ userId: SEEKER, source: "welcome", grantKey: "welcome:person:1", tokenCount: 3, expiresAt: null })]);
    expect(txns({ kind: "welcome_grant" })).toEqual([expect.objectContaining({ userId: SEEKER, tokenCount: 3, creditGrantId: db.grants[0].id })]);
    expect(db.notes).toHaveLength(1);
    expect((await getTokenWallet(SEEKER, "job_seeker")).ledger).toMatchObject({ balance: 3, welcome: { granted: true, credits: 3, remaining: 3 } });
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
