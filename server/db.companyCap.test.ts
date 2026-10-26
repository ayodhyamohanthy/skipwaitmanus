import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { profiles, referralAttachments, referralRequests, tokenBalances } from "../drizzle/schema";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { companyReferralFingerprint, createCompanyReferralRequest, getOpenAskSlots, resolveEmployerDomainFromTargetUrl } from "./db";
import { MAX_OPEN_ASKS_PER_COMPANY } from "../shared/planCatalog";
import { planEntitlementsFor } from "../shared/planEntitlements";
import { AskPriceChangedError, CompanyCapReachedError, CoverageOpenedUpError, OpenAskSlotCapError } from "./planGates";

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
 * predates recorded claims or was claimed, and, when the SQL carries the queue-allocation clause, holds an allocation.
 * Parameters are read by position, so the allocation clause's parameter is read only when the SQL renders it.
 */
function isOpenAsk(condition: SQLQuery, row: Row): boolean {
  const { sql, params } = dialect.sqlToQuery(condition);
  if (!sql.includes("`referralRequests`.`waitingForCoverage` = ?") || !sql.includes("`referralRequests`.`coverageVisibleAt` is null and `referralRequests`.`createdAt` > ?")) throw new Error(`Unexpected open-ask SQL: ${sql}`);
  const allocationClause = sql.includes("from `referralAvailabilitySlots`");
  const [seeker, status, waiting, since, claimAction, ...rest] = params;
  const [allocatedStatus, visibilityCutoff, creationCutoff] = allocationClause ? rest : [undefined, ...rest];
  if (row.jobSeekerId !== seeker || row.status !== status || row.waitingForCoverage !== waiting) return false;
  const claimed = tables.events.some(event => event.referralRequestId === row.id && event.action === claimAction);
  const allocated = allocationClause && tables.slots.some(slot => slot.referralRequestId === row.id && slot.status === allocatedStatus);
  if (row.referrerId != null && (asMs(row.createdAt) < asMs(since) || claimed || allocated)) return true;
  return row.coverageVisibleAt != null ? asMs(row.coverageVisibleAt) > asMs(visibilityCutoff) : asMs(row.createdAt) > asMs(creationCutoff);
}

/** The per-company cap query appends `jobs`.`company` = ? after the open-ask predicate's params; the global slot count passes no company. */
function companyMatches(condition: SQLQuery, row: Row): boolean {
  const { sql, params } = dialect.sqlToQuery(condition);
  if (!sql.includes("`jobs`.`company` = ?")) return true;
  return String(row.company).toLowerCase() === String(params[params.length - 1]).toLowerCase();
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
        if (projection && "open" in projection) return chain(() => [{ open: rowsOf(table).filter(row => isOpenAsk(condition, row) && companyMatches(condition, row)).length }], `${label}-count`);
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
  id: userId, userId, role: "job_seeker", balance: 5, monthlyCreditsRemaining: planEntitlementsFor(plan).creditsPerMonth, monthlyAllowance: planEntitlementsFor(plan).creditsPerMonth, monthlyCycleKey: currentMonthlyCycleKey(), plan,
  subscriptionId: plan === "free" ? null : `sub_${userId}`, subscriptionStatus: plan === "free" ? null : "active", subscriptionCurrency: null, subscriptionCurrentTermStart: null,
  subscriptionCurrentTermEnd: plan === "free" ? null : new Date(Date.now() + 20 * DAY), subscriptionResourceVersion: null, updatedAt: new Date(),
});

let nextId = 1;
const ask = (patch: Row = {}): Row => ({ id: nextId++, jobSeekerId: SEEKER, status: "pending", referrerId: null, createdAt: new Date(Date.now() - DAY), idempotencyKey: `key-${nextId}`, requestFingerprint: "fp", waitingForCoverage: false, coverageVisibleAt: null, coverageHeldAt: null, company: "acme.com", jobFunction: null, ...patch });
/** A verified, unpaused acme.com employee under capacity: coverage exists, so a new ask is covered. */
const eligibleReferrer = (): Row => ({ id: 91, userId: 501, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date(), paused: false, referralCapacity: 3 });
const send = (idempotencyKey = "new-ask-key-0001", extra: Record<string, unknown> = {}) => createCompanyReferralRequest(SEEKER, { targetRoleUrl: URL_, personalPitch: "I shipped the approvals redesign this role describes.", attachmentIds: [41], idempotencyKey, ...extra });
const PAST_CAP = /resume documents are unavailable/;

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  tables = { wallets: [wallet(SEEKER), wallet(OTHER, "start")], requests: [], events: [], slots: [], referrers: [eligibleReferrer()] };
  sideEffects = [];
  lockedReads = [];
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("per-company fairness cap at ask creation (D-006)", () => {
  it("refuses a third open ask at the same company, before any side effect, with the typed payload", async () => {
    tables.requests = [ask(), ask()];
    const error = await send().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(CompanyCapReachedError);
    const cap = error as CompanyCapReachedError;
    expect(cap.code).toBe("company_cap_reached");
    expect(cap.companyDomain).toBe("acme.com");
    expect(cap.open).toBe(2);
    expect(cap.cap).toBe(MAX_OPEN_ASKS_PER_COMPANY);
    expect(cap.message).toBe("You already have 2 open asks at acme.com. Wait for an answer or withdraw one before asking there again. This limit is the same on every plan.");
    expect(sideEffects).toEqual([]);
  });

  it("lets the ask through when the seeker's open asks are at other companies", async () => {
    tables.requests = [ask({ company: "globex.com" }), ask({ company: "initech.com" })];
    await expect(send()).rejects.toThrow(PAST_CAP);
  });

  it("counts a personal-link (assigned) open ask at the company", async () => {
    const assigned = ask({ referrerId: 501 });
    tables.requests = [ask(), assigned];
    tables.events = [{ referralRequestId: assigned.id, action: "claim" }];
    await expect(send()).rejects.toBeInstanceOf(CompanyCapReachedError);
  });

  it("an answered, withdrawn or expired ask at the company frees the room", async () => {
    tables.requests = [ask({ status: "approved", referrerId: 501 }), ask({ status: "declined", referrerId: 501 }), ask({ status: "withdrawn" }), ask({ coverageVisibleAt: new Date(Date.now() - 8 * DAY) })];
    await expect(send()).rejects.toThrow(PAST_CAP);
  });

  it("a waiting ask at the company holds no room until it reaches a referrer (D-061)", async () => {
    tables.requests = [ask({ waitingForCoverage: true }), ask({ waitingForCoverage: true, coverageHeldAt: new Date() })];
    await expect(send()).rejects.toThrow(PAST_CAP);
  });

  it("counts only the caller's own asks at the company (cross-user)", async () => {
    tables.requests = [ask({ jobSeekerId: OTHER }), ask({ jobSeekerId: OTHER })];
    await expect(send()).rejects.toThrow(PAST_CAP);
  });

  it("is the same on every plan: a paying seeker with plan slots left is still refused", async () => {
    tables.wallets = [wallet(SEEKER, "start")];
    tables.requests = [ask(), ask()];
    const error = await send().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(CompanyCapReachedError);
    expect((error as CompanyCapReachedError).cap).toBe(2);
  });

  it("refuses a covered commit that claimed waiting coverage, before any side effect (D-132 item 3)", async () => {
    // The transaction-boundary race: coverage opened between the seeker's read and the
    // commit - the precondition throws inside the transaction and no row is written.
    await expect(send("cov-race-0001", { expectedCoverage: "waiting_for_company_coverage" })).rejects.toBeInstanceOf(CoverageOpenedUpError);
    expect(sideEffects).toEqual([]);
  });

  it("charges exactly the accepted price and refuses a moved price, before the spend (D-132 item 3)", async () => {
    // Flag off means the flat cost 1 (same classification the live spend uses).
    // The matching accepted price sails past the precondition (the fixture's
    // attachment table is empty, so the later attachment check is what stops it).
    await expect(send("price-ok-0001", { expectedCost: 1 })).rejects.toThrow(/resume documents are unavailable/);
    expect(sideEffects).toEqual([]);
    // A moved price refuses at the precondition itself - before the request row
    // and before any wallet write: no silent debit at a price the seeker never accepted.
    await expect(send("price-race-0001", { expectedCost: 6 })).rejects.toBeInstanceOf(AskPriceChangedError);
    expect(sideEffects).toEqual([]);
  });

  it("replays an already-created ask instead of refusing it", async () => {
    const companyDomain = await resolveEmployerDomainFromTargetUrl(URL_);
    if (!companyDomain) throw new Error("fixture URL must resolve");
    const input = { targetRoleUrl: URL_, personalPitch: "I shipped the approvals redesign this role describes.", attachmentIds: [41], idempotencyKey: "replayed-key-0001" };
    tables.requests = [ask(), ask({ idempotencyKey: input.idempotencyKey, requestFingerprint: companyReferralFingerprint(input, companyDomain) })];
    const replay = await send(input.idempotencyKey);
    expect(replay).toMatchObject({ replayed: true, requestId: tables.requests[1].id });
    expect(sideEffects).toEqual([]);
  });
});
