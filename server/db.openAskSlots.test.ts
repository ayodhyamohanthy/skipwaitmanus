import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { profiles, referralAttachments, referralRequests, tokenBalances } from "../drizzle/schema";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { companyReferralFingerprint, createCompanyReferralRequest, getOpenAskSlots, resolveEmployerDomainFromTargetUrl } from "./db";
import { OpenAskSlotCapError } from "./planGates";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();
const DAY = 24 * 60 * 60 * 1000;
const SEEKER = 7;
const OTHER = 8;
const URL_ = "https://careers.acme.com/jobs/123";

type Row = Record<string, unknown>;
/** events: referralTransitionEvents (claims); slots: referralAvailabilitySlots (queue allocations); referrers: profiles (coverage). */
let tables: { wallets: Row[]; requests: Row[]; events: Row[]; slots: Row[]; referrers: Row[] };
let sideEffects: string[];
let lockedReads: string[];

const asMs = (value: unknown) => (typeof value === "string" ? Date.parse(`${value.replace(" ", "T")}Z`) : value instanceof Date ? value.getTime() : Number.NaN);

/** Plain `and` chains of `col = ?` (wallet, idempotency) as drizzle renders them. */
function matchesEq(condition: SQLQuery, row: Row): boolean {
  const query = dialect.sqlToQuery(condition);
  const columns = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)` = \?/g)].map(match => match[1]);
  return columns.every((column, index) => row[column] === query.params[index]);
}

/**
 * The open-ask predicate (server/planGates.ts openAskCondition, exact SQL pinned in openAskSlots.test.ts), evaluated row
 * by row. D-061: a waiting or held ask never holds a slot; a delivered ask counts while its 7-day visibility clock runs
 * (pre-0095 rows without coverageVisibleAt keep the creation clock); an older assigned ask keeps its slot only while it
 * predates recorded claims, was claimed or holds a queue allocation.
 */
function isOpenAsk(condition: SQLQuery, row: Row): boolean {
  const { sql, params } = dialect.sqlToQuery(condition);
  if (!sql.includes("`referralRequests`.`waitingForCoverage` = ?") || !sql.includes("`referralRequests`.`coverageVisibleAt` is null and `referralRequests`.`createdAt` > ?")) throw new Error(`Unexpected open-ask SQL: ${sql}`);
  const [seeker, status, waiting, since, claimAction, allocatedStatus, visibilityCutoff, creationCutoff] = params;
  if (row.jobSeekerId !== seeker || row.status !== status || row.waitingForCoverage !== waiting) return false;
  const claimed = tables.events.some(event => event.referralRequestId === row.id && event.action === claimAction);
  const allocated = tables.slots.some(slot => slot.referralRequestId === row.id && slot.status === allocatedStatus);
  if (row.referrerId != null && (asMs(row.createdAt) < asMs(since) || claimed || allocated)) return true;
  return row.coverageVisibleAt != null ? asMs(row.coverageVisibleAt) > asMs(visibilityCutoff) : asMs(row.createdAt) > asMs(creationCutoff);
}

function rowsOf(table: unknown): Row[] {
  if (table === tokenBalances) return tables.wallets;
  if (table === referralRequests) return tables.requests;
  if (table === profiles) return tables.referrers;
  if (table === referralAttachments) return [];
  return [];
}

function chain(run: () => Row[], label: string) {
  const self = {
    limit: (n: number) => ({ for: async (mode: string) => { lockedReads.push(`${label}:${mode}`); return structuredClone(run().slice(0, n)); }, then: (resolve: (v: unknown) => unknown) => Promise.resolve(structuredClone(run().slice(0, n))).then(resolve) }),
    for: async (mode: string) => { lockedReads.push(`${label}:${mode}`); return structuredClone(run()); },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(structuredClone(run())).then(resolve),
  };
  return self;
}

function project(rows: Row[], projection?: Row): Row[] {
  if (!projection) return rows;
  return rows.map(row => Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[(column as { name: string }).name]])));
}

function fixtureDatabase() {
  const select = (projection?: Row) => ({
    from: (table: unknown) => {
      const label = table === tokenBalances ? "wallet" : table === referralRequests ? "requests" : table === profiles ? "referrers" : table === referralAttachments ? "attachments" : "other";
      const where = (condition: SQLQuery) => {
        if (projection && "open" in projection) return chain(() => [{ open: rowsOf(table).filter(row => isOpenAsk(condition, row)).length }], `${label}-count`);
        return chain(() => project(rowsOf(table).filter(row => label === "attachments" || label === "other" || label === "referrers" || matchesEq(condition, row)), projection), label);
      };
      const joined: { where: typeof where; innerJoin: () => typeof joined; leftJoin: () => typeof joined } = { where, innerJoin: () => joined, leftJoin: () => joined };
      return joined;
    },
  });
  const insert = (table: unknown) => ({ values: () => { sideEffects.push(`insert:${rowsOf(table) === tables.requests ? "referralRequests" : "other"}`); throw new Error("side effect reached"); } });
  const update = () => ({ set: () => ({ where: async () => { sideEffects.push("update"); return [{ affectedRows: 0 }]; } }) });
  const api = { select, insert, update };
  return { ...api, transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(api) };
}

const wallet = (userId: number, plan = "free"): Row => ({
  id: userId, userId, role: "job_seeker", balance: 5, monthlyCreditsRemaining: 3, monthlyAllowance: 3, monthlyCycleKey: currentMonthlyCycleKey(), plan,
  subscriptionId: plan === "free" ? null : `sub_${userId}`, subscriptionStatus: plan === "free" ? null : "active", subscriptionCurrency: null, subscriptionCurrentTermStart: null,
  subscriptionCurrentTermEnd: plan === "free" ? null : new Date(Date.now() + 20 * DAY), subscriptionResourceVersion: null, updatedAt: new Date(),
});

let nextId = 1;
const ask = (patch: Row = {}): Row => ({ id: nextId++, jobSeekerId: SEEKER, status: "pending", referrerId: null, createdAt: new Date(Date.now() - DAY), idempotencyKey: `key-${nextId}`, requestFingerprint: "fp", waitingForCoverage: false, coverageVisibleAt: null, coverageHeldAt: null, company: "acme.com", jobFunction: null, ...patch });
/** A verified, unpaused acme.com employee under capacity: coverage exists, so a new ask is covered. */
const eligibleReferrer = (): Row => ({ id: 91, userId: 501, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date(), paused: false, referralCapacity: 3 });
const send = (idempotencyKey = "new-ask-key-0001") => createCompanyReferralRequest(SEEKER, { targetRoleUrl: URL_, personalPitch: "I shipped the approvals redesign this role describes.", attachmentIds: [41], idempotencyKey });
const PAST_CAP = /resume documents are unavailable/;

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  tables = { wallets: [wallet(SEEKER), wallet(OTHER, "momentum")], requests: [], events: [], slots: [], referrers: [eligibleReferrer()] };
  sideEffects = [];
  lockedReads = [];
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("open-ask slot cap at ask creation", () => {
  it("refuses a Free seeker's fourth open ask before any side effect, with the typed slots payload", async () => {
    tables.requests = [ask(), ask(), ask()];
    const error = await send().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(OpenAskSlotCapError);
    expect((error as OpenAskSlotCapError).slots).toEqual({ plan: "free", planLabel: "Free", open: 3, cap: 3, full: true, nextPlan: null });
    expect(sideEffects).toEqual([]);
    // The wallet row lock is taken first: it serializes concurrent creates for this seeker.
    expect(lockedReads[0]).toBe("wallet:update");
  });

  it("frees a slot once an ask is answered, withdrawn or expired unclaimed", async () => {
    tables.requests = [ask(), ask(), ask({ status: "approved", referrerId: 501 }), ask({ status: "declined", referrerId: 501 }), ask({ status: "withdrawn" }), ask({ status: "closed" }), ask({ createdAt: new Date(Date.now() - 8 * DAY) })];
    await expect(send()).rejects.toThrow(PAST_CAP);
    expect(sideEffects).toEqual([]);
  });

  it("a claimed pending ask keeps its slot however old it is", async () => {
    const claimed = ask({ referrerId: 501, createdAt: new Date(Date.now() - 30 * DAY) });
    tables.requests = [ask(), ask(), claimed];
    // Every claim has written this event since migration 0058.
    tables.events = [{ referralRequestId: claimed.id, action: "claim" }];
    await expect(send()).rejects.toBeInstanceOf(OpenAskSlotCapError);
  });

  it("a personal-link ask its employee never acted on frees its slot at day 7, like an unclaimed one (D-050)", async () => {
    tables.requests = [ask(), ask(), ask({ referrerId: 501, createdAt: new Date(Date.now() - 8 * DAY) })];
    await expect(send()).rejects.toThrow(PAST_CAP);
    expect(sideEffects).toEqual([]);
    expect((await getOpenAskSlots(SEEKER)).open).toBe(2);
  });

  it("a waiting or held ask never holds a slot, so asking outside coverage cannot fill the Free cap (D-061)", async () => {
    tables.requests = [ask({ waitingForCoverage: true }), ask({ waitingForCoverage: true }), ask({ waitingForCoverage: true, coverageHeldAt: new Date() })];
    expect(await getOpenAskSlots(SEEKER)).toMatchObject({ open: 0, full: false });
    // The create passes the cap (then fails only on the fixture's unattached document).
    await expect(send()).rejects.toThrow(PAST_CAP);
  });

  it("counts a delivered ask from first visibility, not creation (D-061)", async () => {
    tables.requests = [
      ask({ createdAt: new Date(Date.now() - 30 * DAY), coverageVisibleAt: new Date(Date.now() - 2 * DAY) }),
      ask({ createdAt: new Date(Date.now() - 30 * DAY), coverageVisibleAt: new Date(Date.now() - 8 * DAY) }),
      ask({ createdAt: new Date(Date.now() - 30 * DAY) }),
    ];
    expect(await getOpenAskSlots(SEEKER)).toMatchObject({ open: 1, full: false });
  });

  it.each<[string, Row, Partial<typeof tables>]>([
    ["queue-allocated", { referrerId: 501, createdAt: new Date(Date.now() - 8 * DAY) }, { slots: [{ referralRequestId: 0, status: "allocated" }] }],
    ["from before claims were recorded", { referrerId: 501, createdAt: new Date("2026-09-15T00:00:00Z") }, {}],
  ])("an assigned ask that is %s keeps its slot however old it is", async (_label, patch, history) => {
    const kept = ask(patch);
    tables.requests = [ask(), ask(), kept];
    tables.slots = (history.slots ?? []).map(slot => ({ ...slot, referralRequestId: kept.id }));
    await expect(send()).rejects.toBeInstanceOf(OpenAskSlotCapError);
    expect((await getOpenAskSlots(SEEKER)).open).toBe(3);
  });

  it("counts only the caller's own asks (cross-user)", async () => {
    tables.requests = [ask(), ask(), ...Array.from({ length: 6 }, () => ask({ jobSeekerId: OTHER }))];
    await expect(send()).rejects.toThrow(PAST_CAP);
    expect((await getOpenAskSlots(SEEKER)).open).toBe(2);
    expect(await getOpenAskSlots(OTHER)).toMatchObject({ plan: "momentum", planLabel: "Momentum", open: 6, cap: 15, full: false });
  });

  it("a Start subscriber holds Start's 8 open asks", async () => {
    tables.wallets = [wallet(SEEKER, "start")];
    tables.requests = Array.from({ length: 7 }, () => ask());
    await expect(send()).rejects.toThrow(PAST_CAP);
    tables.requests.push(ask());
    const error = await send().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(OpenAskSlotCapError);
    expect((error as OpenAskSlotCapError).slots).toMatchObject({ plan: "start", planLabel: "Start", open: 8, cap: 8, nextPlan: null });
    expect((error as Error).message).toBe("All 8 slots are in use. Wait for an answer or withdraw an ask.");
  });

  // D-067: Pro and Max are removed completely; no grandfathered 10 or 30 open asks.
  it.each(["pro", "max"])("a wallet still marked %s meets the Free cap of 3", async plan => {
    tables.wallets = [wallet(SEEKER, plan)];
    tables.requests = [ask(), ask(), ask()];
    expect(await getOpenAskSlots(SEEKER)).toEqual({ plan: "free", planLabel: "Free", open: 3, cap: 3, full: true, nextPlan: null });
    // Sending first brings the wallet up to date: the retired plan rolls to Free through the ledger
    // (rows pinned in db.creditLedger.test.ts), which this write-refusing fixture stops before any ask exists.
    await expect(send()).rejects.toThrow("side effect reached");
    expect(sideEffects).not.toContain("insert:referralRequests");
  });

  it("a lapsed paid plan falls back to the Free cap", async () => {
    tables.wallets = [{ ...wallet(SEEKER, "momentum"), subscriptionCurrentTermEnd: new Date(Date.now() - DAY) }];
    tables.requests = [ask(), ask(), ask()];
    await expect(send()).rejects.toBeInstanceOf(OpenAskSlotCapError);
  });

  it("replays an already-created ask at the cap instead of refusing it", async () => {
    const companyDomain = await resolveEmployerDomainFromTargetUrl(URL_);
    if (!companyDomain) throw new Error("fixture URL must resolve");
    const input = { targetRoleUrl: URL_, personalPitch: "I shipped the approvals redesign this role describes.", attachmentIds: [41], idempotencyKey: "replayed-key-0001" };
    tables.requests = [ask(), ask(), ask({ idempotencyKey: input.idempotencyKey, requestFingerprint: companyReferralFingerprint(input, companyDomain) })];
    const replay = await send(input.idempotencyKey);
    expect(replay).toMatchObject({ replayed: true, requestId: tables.requests[2].id, slots: { open: 3, cap: 3, full: true } });
    expect(sideEffects).toEqual([]);
  });
});

describe("open-ask slots read model", () => {
  it("reports the caller's open asks against the plan cap", async () => {
    tables.requests = [ask(), ask({ status: "approved", referrerId: 501 }), ask({ createdAt: new Date(Date.now() - 8 * DAY) })];
    expect(await getOpenAskSlots(SEEKER)).toEqual({ plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: null });
  });
});
