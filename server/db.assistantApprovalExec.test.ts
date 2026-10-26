import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { assistantApprovals, profiles, referralAttachments, referralRequests, tokenBalances, tokenTransactions } from "../drizzle/schema";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { askCreditCost, COMPANY_ASK_PRICE_DESCRIPTION, COMPANY_ASK_PRICE_TITLE, decideAssistantApproval } from "./db";
import { planEntitlementsFor } from "../shared/planEntitlements";
import { AskPriceChangedError } from "./planGates";

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
let tables: { wallets: Row[]; requests: Row[]; events: Row[]; slots: Row[]; referrers: Row[]; approvals: Row[]; attachments: Row[]; ledger: Row[] };
let sideEffects: string[];
let lockedReads: string[];

const asMs = (value: unknown) => (typeof value === "string" ? Date.parse(`${value.replace(" ", "T")}Z`) : value instanceof Date ? value.getTime() : Number.NaN);

/** Plain `and` chains of `col = ?` (wallet, idempotency) as drizzle renders them. */
function matchesEq(condition: SQLQuery, row: Row): boolean {
  const query = dialect.sqlToQuery(condition);
  const columns = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)` = \?/g)].map(match => match[1]);
  // Membership match: mixed inArray/isNull predicates shift param positions, so
  // each equality column's row value must appear among the query's params.
  return columns.every(column => query.params.some(param => row[column] === param));
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
  if (table === referralAttachments) return tables.attachments;
  if (table === assistantApprovals) return tables.approvals;
  if (table === tokenTransactions) return tables.ledger;
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
  // Inserts succeed and are recorded; request/attachment rows actually land in
  // the fixture tables so later reads (fingerprint replay, binds) see them.
  let nextInsertId = 1000;
  const insert = (table: unknown) => ({ values: (row: Row | Row[]) => {
    const name = table === referralRequests ? "referralRequests" : table === referralAttachments ? "attachments" : table === assistantApprovals ? "approvals" : table === tokenTransactions ? "tokenTransactions" : "other";
    sideEffects.push(`insert:${name}`);
    const id = nextInsertId++;
    if (table === referralRequests || table === referralAttachments || table === assistantApprovals || table === tokenTransactions) {
      for (const r of Array.isArray(row) ? row : [row]) rowsOf(table).push({ id, ...r });
    }
    return [{ insertId: id }];
  } });
  const update = (table: unknown) => ({ set: (values: Row) => ({ where: async (condition: SQLQuery) => {
    const rows = rowsOf(table);
    let affected = 0;
    for (const row of rows) if (matchesEq(condition, row)) { Object.assign(row, values); affected++; }
    sideEffects.push(`update:${table === assistantApprovals ? "approvals" : table === referralRequests ? "referralRequests" : table === referralAttachments ? "attachments" : "other"}`);
    return [{ affectedRows: affected }];
  } }) });
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
const approval = (patch: Row = {}): Row => ({
  id: 900, userId: SEEKER, connectionId: null, kind: "ask_send", status: "pending", provider: "assistant",
  companyDomain: "acme.com", role: null, note: "I shipped the approvals redesign this role describes.",
  creditCount: 1, slotCount: null, targetRoleUrl: URL_, attachmentIds: "[41]", idempotencyKey: "appr-key-0001",
  expiresAt: new Date(Date.now() + 3600_000), decidedAt: null, createdAt: new Date(), executedRequestId: null, ...patch,
});
const resume = (): Row => ({ id: 41, ownerId: SEEKER, referralRequestId: null, fileName: "asha.pdf", fileKey: "k/41" });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  tables = { wallets: [wallet(SEEKER), wallet(OTHER, "start")], requests: [], events: [], slots: [], referrers: [eligibleReferrer()], approvals: [approval()], attachments: [resume()], ledger: [] };
  sideEffects = [];
  lockedReads = [];
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); });

/** The exact cost the create path would commit for this target right now (flag-aware). */
const currentCommitCost = () => askCreditCost({ title: COMPANY_ASK_PRICE_TITLE, description: COMPANY_ASK_PRICE_DESCRIPTION, url: URL_ });

describe("assistant approval execution binds the approved cost (D-132 item 3)", () => {
  it("flags OFF, legacy approval (creditCount 1): approves and executes, spending exactly 1", async () => {
    const result = await decideAssistantApproval(SEEKER, 900, "approved");
    expect(result.status).toBe("approved");
    expect((result as { requestId?: number }).requestId).toBeGreaterThan(0);
    expect(tables.approvals[0].status).toBe("approved");
    expect(tables.approvals[0].executedRequestId).toBe((result as { requestId?: number }).requestId);
    expect(sideEffects).toContain("insert:referralRequests");
  });

  it("flags ON, approval whose stored cost no longer matches: refuses, back to pending, no charge", async () => {
    vi.stubEnv("ASK_LEVEL_COST", "true");
    // Premise: pricing moved since the approval stored 1 (classification is above 1 here).
    expect(currentCommitCost()).toBeGreaterThan(1);
    await expect(decideAssistantApproval(SEEKER, 900, "approved")).rejects.toBeInstanceOf(AskPriceChangedError);
    // The approval goes back to pending so the owner sees why; nothing was created or charged.
    expect(tables.approvals[0].status).toBe("pending");
    expect(tables.approvals[0].decidedAt).toBeNull();
    expect(sideEffects).not.toContain("insert:referralRequests");
    // Usable recovery: the pending row is repriced to the live cost, so the next
    // review shows the true number and approving it executes - no repropose needed.
    expect(tables.approvals[0].creditCount).toBe(currentCommitCost());
    const retry = await decideAssistantApproval(SEEKER, 900, "approved");
    expect(retry.status).toBe("approved");
    expect(sideEffects).toContain("insert:referralRequests");
  });

  it("flags ON, approval re-stored at the current classified cost: executes at exactly that cost", async () => {
    vi.stubEnv("ASK_LEVEL_COST", "true");
    const classified = currentCommitCost();
    expect(classified).toBeGreaterThan(1);
    tables.approvals[0] = approval({ creditCount: classified, idempotencyKey: "appr-key-0002" });
    const result = await decideAssistantApproval(SEEKER, 900, "approved");
    expect(result.status).toBe("approved");
    expect(sideEffects).toContain("insert:referralRequests");
  });

  it("a decided approval never re-executes", async () => {
    tables.approvals[0] = approval({ status: "approved", decidedAt: new Date() });
    await expect(decideAssistantApproval(SEEKER, 900, "approved")).rejects.toThrow(/already handled/);
    expect(sideEffects).not.toContain("insert:referralRequests");
  });
});
