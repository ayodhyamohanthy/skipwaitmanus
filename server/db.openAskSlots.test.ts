import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { referralAttachments, referralRequests, tokenBalances } from "../drizzle/schema";
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
let tables: { wallets: Row[]; requests: Row[] };
let sideEffects: string[];
let lockedReads: string[];

const asMs = (value: unknown) => (typeof value === "string" ? Date.parse(`${value.replace(" ", "T")}Z`) : value instanceof Date ? value.getTime() : Number.NaN);

/** Plain `and` chains of `col = ?` (wallet, idempotency) as drizzle renders them. */
function matchesEq(condition: SQLQuery, row: Row): boolean {
  const query = dialect.sqlToQuery(condition);
  const columns = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)` = \?/g)].map(match => match[1]);
  return columns.every((column, index) => row[column] === query.params[index]);
}

/** The open-ask predicate (server/planGates.ts openAskCondition), evaluated row by row. */
function isOpenAsk(condition: SQLQuery, row: Row): boolean {
  const { sql, params } = dialect.sqlToQuery(condition);
  if (!sql.includes("`referrerId` is not null or `referralRequests`.`createdAt` > ?")) throw new Error(`Unexpected open-ask SQL: ${sql}`);
  const [seeker, status, cutoff] = params;
  return row.jobSeekerId === seeker && row.status === status && (row.referrerId != null || asMs(row.createdAt) > asMs(cutoff));
}

function rowsOf(table: unknown): Row[] {
  if (table === tokenBalances) return tables.wallets;
  if (table === referralRequests) return tables.requests;
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
      const label = table === tokenBalances ? "wallet" : table === referralRequests ? "requests" : table === referralAttachments ? "attachments" : "other";
      const where = (condition: SQLQuery) => {
        if (projection && "open" in projection) return chain(() => [{ open: rowsOf(table).filter(row => isOpenAsk(condition, row)).length }], `${label}-count`);
        return chain(() => project(rowsOf(table).filter(row => label === "attachments" || label === "other" || matchesEq(condition, row)), projection), label);
      };
      return { where, innerJoin: () => ({ where }) };
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
const ask = (patch: Row = {}): Row => ({ id: nextId++, jobSeekerId: SEEKER, status: "pending", referrerId: null, createdAt: new Date(Date.now() - DAY), idempotencyKey: `key-${nextId}`, requestFingerprint: "fp", waitingForCoverage: false, company: "acme.com", jobFunction: null, ...patch });
const send = (idempotencyKey = "new-ask-key-0001") => createCompanyReferralRequest(SEEKER, { targetRoleUrl: URL_, personalPitch: "I shipped the approvals redesign this role describes.", attachmentIds: [41], idempotencyKey });
const PAST_CAP = /resume documents are unavailable/;

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  tables = { wallets: [wallet(SEEKER), wallet(OTHER, "max")], requests: [] };
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
    expect((error as OpenAskSlotCapError).slots).toEqual({ plan: "free", planLabel: "Free", open: 3, cap: 3, full: true, nextPlan: { id: "momentum", label: "Momentum", openRequests: 15 } });
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
    tables.requests = [ask(), ask(), ask({ referrerId: 501, createdAt: new Date(Date.now() - 30 * DAY) })];
    await expect(send()).rejects.toBeInstanceOf(OpenAskSlotCapError);
  });

  it("counts only the caller's own asks (cross-user)", async () => {
    tables.requests = [ask(), ask(), ...Array.from({ length: 6 }, () => ask({ jobSeekerId: OTHER }))];
    await expect(send()).rejects.toThrow(PAST_CAP);
    expect((await getOpenAskSlots(SEEKER)).open).toBe(2);
    expect(await getOpenAskSlots(OTHER)).toMatchObject({ plan: "max", planLabel: "Max", open: 6, cap: 30, full: false });
  });

  it("a grandfathered Pro subscriber keeps the 10 open asks Pro sells", async () => {
    tables.wallets = [wallet(SEEKER, "pro")];
    tables.requests = Array.from({ length: 9 }, () => ask());
    await expect(send()).rejects.toThrow(PAST_CAP);
    tables.requests.push(ask());
    const error = await send().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(OpenAskSlotCapError);
    expect((error as OpenAskSlotCapError).slots).toMatchObject({ planLabel: "Pro", open: 10, cap: 10, nextPlan: { label: "Momentum", openRequests: 15 } });
    expect((error as Error).message).toBe("All 10 slots are in use. Wait for an answer, withdraw an ask, or get more slots with Momentum (15).");
  });

  it("a lapsed paid plan falls back to the Free cap", async () => {
    tables.wallets = [{ ...wallet(SEEKER, "max"), subscriptionCurrentTermEnd: new Date(Date.now() - DAY) }];
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
    expect(await getOpenAskSlots(SEEKER)).toEqual({ plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: { id: "momentum", label: "Momentum", openRequests: 15 } });
  });
});
