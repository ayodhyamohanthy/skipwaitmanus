import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableColumns, getTableName, SQL, type SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  askCosts, askWorkItems, bandedReferralBalances, canonicalPeople, catalogJobs,
  companies, companyDomains, companyJobSources, companyOpportunities,
  jobs, notifications, operationalActivityLogs, planCreditGrants,
  profiles, promoCreditGrants, referralAttachments, referralDocumentAccessGrants,
  referralRequestPasses, referralRequestSaves, referralRequests, referralReviewDeliveries,
  referralTransitionEvents, referrerReviewEmailLinks, tokenBalances, tokenTransactions,
  users, workItems,
} from "../drizzle/schema";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { sameAcceptedAskCost } from "../shared/acceptedAskCost";
import {
  createCompanyReferralRequest, previewBandedAskCost,
  type CreateCompanyReferralInput,
} from "./db";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();
const NOW = Date.parse("2026-10-17T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const SEEKER = 7;
const REFERRER = 9;

type Row = Record<string, unknown>;
const TABLES = [
  bandedReferralBalances, askCosts, askWorkItems, canonicalPeople, catalogJobs,
  companies, companyDomains, companyJobSources, companyOpportunities,
  jobs, notifications, operationalActivityLogs, planCreditGrants, profiles,
  promoCreditGrants, referralAttachments, referralDocumentAccessGrants,
  referralRequestPasses, referralRequestSaves, referralRequests,
  referralReviewDeliveries, referralTransitionEvents, referrerReviewEmailLinks,
  tokenBalances, tokenTransactions, users, workItems,
];
const COLUMNS_BY_NAME = new Map(TABLES.map(table => [getTableName(table), Object.keys(getTableColumns(table))]));

let rows: Record<string, Row[]>;
let sequence: Record<string, number>;

const tableNameOf = (table: unknown) => getTableName(table as never);
const bucket = (table: unknown) => (rows[tableNameOf(table)] ??= []);

function flatten(parts: Array<{ table: string; row: Row | null }>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const part of parts) for (const column of COLUMNS_BY_NAME.get(part.table) ?? []) flat[`${part.table}.${column}`] = part.row ? part.row[column] ?? null : null;
  return flat;
}

const asMs = (value: unknown) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) return Date.parse(`${value.replace(" ", "T")}Z`);
  return value;
};

function splitTopLevel(sql: string, operator: string): string[] {
  const parts: string[] = [];
  let depth = 0; let start = 0; let i = 0;
  while (i < sql.length) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") depth--;
    else if (depth === 0 && sql.startsWith(operator, i)) { parts.push(sql.slice(start, i)); i += operator.length; start = i; continue; }
    i++;
  }
  parts.push(sql.slice(start));
  return parts;
}

const ATOM = /^`([^`]+)`\.`([^`]+)`\s*(?:(is not null|is null)|(<>|<=|>=|=|<|>)\s*(?:(`([^`]+)`\.`([^`]+)`)|\?))$/i;
const COUNT_ALL = /^count\(\*\)$/i;
const COUNT_COLUMN = /^count\(`([^`]+)`\.`([^`]+)`\)$/i;
const sqlTextOf = (value: unknown): string | null => (value instanceof SQL ? dialect.sqlToQuery(value).sql.trim() : null);

function compareValues(a: unknown, b: unknown): number {
  const av = asMs(a); const bv = asMs(b);
  const aNull = av === null || av === undefined; const bNull = bv === null || bv === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return -1;
  if (bNull) return 1;
  if (typeof av === "number" && typeof bv === "number") return av === bv ? 0 : av < bv ? -1 : 1;
  const as = String(av); const bs = String(bv);
  return as === bs ? 0 : as < bs ? -1 : 1;
}

function matches(condition: unknown, flat: Record<string, unknown>): boolean {
  const query = dialect.sqlToQuery(condition as SQLQuery);
  const cursor = { index: 0 };
  let scope = flat;
  const unwrap = (sql: string): string => {
    let text = sql.trim();
    while (text.startsWith("(")) {
      let depth = 0; let closesAt = -1;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === "(") depth++;
        else if (text[i] === ")") { depth--; if (depth === 0) { closesAt = i; break; } }
      }
      if (closesAt !== text.length - 1) break;
      text = text.slice(1, -1).trim();
    }
    return text;
  };
  const evaluate = (sql: string): boolean => {
    const trimmed = unwrap(sql);
    if (!trimmed) return true;
    const orParts = splitTopLevel(trimmed, " or ");
    if (orParts.length > 1) return orParts.map(evaluate).some(Boolean);
    const andParts = splitTopLevel(trimmed, " and ");
    if (andParts.length > 1) return andParts.map(evaluate).every(Boolean);
    const inMatch = /^`([^`]+)`\.`([^`]+)` in \((.+)\)$/.exec(trimmed);
    if (inMatch) {
      const size = (inMatch[3].match(/\?/g) ?? []).length;
      const values = query.params.slice(cursor.index, cursor.index + size);
      cursor.index += size;
      return values.includes(scope[`${inMatch[1]}.${inMatch[2]}`]);
    }
    const existsMatch = /^exists \(select 1 from `([^`]+)` where (.+)\)$/.exec(trimmed);
    if (existsMatch) {
      const [, table, inner] = existsMatch;
      const start = cursor.index; const outer = scope;
      let found = false;
      for (const row of rows[table] ?? []) {
        cursor.index = start;
        scope = { ...outer, ...flatten([{ table, row }]) };
        if (evaluate(inner)) found = true;
      }
      scope = outer;
      cursor.index = start + (inner.match(/\?/g) ?? []).length;
      return found;
    }
    const match = ATOM.exec(trimmed);
    if (!match) throw new Error(`fixture cannot evaluate: ${trimmed}`);
    const value = scope[`${match[1]}.${match[2]}`];
    const [, , , nullOp, compareOp, rightColumn, rightTable, rightName] = match;
    if (nullOp) return /is not null/i.test(nullOp) ? value !== null && value !== undefined : value === null || value === undefined;
    const right = rightColumn ? scope[`${rightTable}.${rightName}`] : query.params[cursor.index++];
    if (compareOp === "=") return asMs(value) === asMs(right);
    if (compareOp === "<>") return asMs(value) !== asMs(right);
    const left = asMs(value); const bound = asMs(right);
    if (typeof left !== "number" || typeof bound !== "number") return false;
    if (compareOp === "<") return left < bound;
    if (compareOp === "<=") return left <= bound;
    if (compareOp === ">") return left > bound;
    if (compareOp === ">=") return left >= bound;
    return false;
  };
  return evaluate(query.sql);
}

function fixtureDatabase() {
  const select = (projection?: Record<string, unknown>) => {
    const state = { from: null as unknown, joins: [] as Array<{ table: unknown; on: unknown; kind: "inner" | "left" }>, where: null as unknown, groups: [] as unknown[], orders: [] as Array<{ table: string; column: string; direction: number }> };
    const project = (combo: Array<{ table: string; row: Row | null }>): Row => {
      if (!projection) return Object.assign({}, ...combo.map(part => (part.row ? structuredClone(part.row) : {})));
      const flat = flatten(combo);
      const out: Row = {};
      for (const [key, value] of Object.entries(projection)) {
        if (value instanceof SQL) {
          const text = sqlTextOf(value);
          const col = text ? /^`([^`]+)`\.`([^`]+)`$/.exec(text) : null;
          out[key] = col ? flat[`${col[1]}.${col[2]}`] ?? null : null;
        } else {
          out[key] = flat[`${tableNameOf((value as { table: unknown }).table)}.${(value as { name: string }).name}`] ?? null;
        }
      }
      return out;
    };
    const run = (): Row[] => {
      const fromName = tableNameOf(state.from);
      let combos: Array<Array<{ table: string; row: Row | null }>> = (bucket(state.from) ?? []).map(row => [{ table: fromName, row }]);
      for (const join of state.joins) {
        const name = tableNameOf(join.table);
        const next: Array<Array<{ table: string; row: Row | null }>> = [];
        for (const combo of combos) {
          const matched = bucket(join.table).filter(candidate => matches(join.on, flatten([...combo, { table: name, row: candidate }])));
          for (const candidate of matched) next.push([...combo, { table: name, row: candidate }]);
          if (join.kind === "left" && matched.length === 0) next.push([...combo, { table: name, row: null }]);
        }
        combos = next;
      }
      if (state.where) combos = combos.filter(combo => matches(state.where, flatten(combo)));
      if (state.orders.length) combos = [...combos].sort((a, b) => {
        const fa = flatten(a); const fb = flatten(b);
        for (const order of state.orders) {
          const result = compareValues(fa[`${order.table}.${order.column}`], fb[`${order.table}.${order.column}`]);
          if (result !== 0) return result * order.direction;
        }
        return 0;
      });
      const entries = projection ? Object.entries(projection) : [];
      const onlyCounts = entries.length > 0 && entries.every(([, value]) => { const text = sqlTextOf(value); return text !== null && (COUNT_ALL.test(text) || COUNT_COLUMN.test(text)); });
      if (onlyCounts && state.groups.length === 0) {
        return [Object.fromEntries(entries.map(([key, value]) => {
          const column = COUNT_COLUMN.exec(sqlTextOf(value)!);
          return [key, column
            ? combos.filter(combo => { const cell = flatten(combo)[`${column[1]}.${column[2]}`]; return cell !== null && cell !== undefined; }).length
            : combos.length];
        }))];
      }
      return combos.map(project);
    };
    const slice = (n: number) => run().slice(0, n);
    const chain = {
      from: (table: unknown) => { state.from = table; return chain; },
      innerJoin: (table: unknown, on: unknown) => { state.joins.push({ table, on, kind: "inner" }); return chain; },
      leftJoin: (table: unknown, on: unknown) => { state.joins.push({ table, on, kind: "left" }); return chain; },
      where: (condition: unknown) => { state.where = condition; return chain; },
      groupBy: (...group: unknown[]) => { state.groups = group; return chain; },
      orderBy: (...order: unknown[]) => {
        for (const term of order) {
          const match = /^`([^`]+)`\.`([^`]+)`\s+(asc|desc)$/i.exec(sqlTextOf(term) ?? "");
          if (match) state.orders.push({ table: match[1], column: match[2], direction: match[3].toLowerCase() === "desc" ? -1 : 1 });
        }
        return chain;
      },
      limit: (n: number) => ({ for: async (_mode: string) => slice(n), then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(slice(n)).then(resolve, reject) }),
      for: async (_mode: string) => run(),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    };
    return chain;
  };
  const update = (table: unknown) => ({
    set: (patch: Row) => ({
      where: async (condition: unknown) => {
        const matched = bucket(table).filter(row => matches(condition, flatten([{ table: tableNameOf(table), row }])));
        for (const row of matched) for (const [key, value] of Object.entries(patch)) row[key] = structuredClone(value);
        return [{ affectedRows: matched.length }];
      },
    }),
  });
  const insert = (table: unknown) => ({
    values: (input: Row | Row[]) => {
      const name = tableNameOf(table);
      const insertedIds: number[] = [];
      for (const item of Array.isArray(input) ? input : [input]) {
        const id = (sequence[name] = (sequence[name] ?? 0) + 1);
        insertedIds.push(id);
        bucket(table).push({ id, ...structuredClone(item) });
      }
      return Object.assign(Promise.resolve([{ affectedRows: 1, insertId: insertedIds[0] }]), { onDuplicateKeyUpdate: async () => [{ affectedRows: 1 }] });
    },
  });
  const api = { select, update, insert };
  return { ...api, transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
    const before = structuredClone({ rows, sequence });
    try { return await cb(api); }
    catch (error) { rows = before.rows; sequence = before.sequence; throw error; }
  } };
}

const referrerProfile = (userId: number, domain = "acme.com") => ({
  id: userId, userId, accountType: "referrer", workEmailDomain: domain,
  workEmailVerifiedAt: new Date(NOW - 30 * DAY), paused: false, notifyNewAsk: true, referralCapacity: null,
});

const wallet = (plan = "momentum"): Row => ({
  id: 1, userId: SEEKER, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 3, monthlyAllowance: 3,
  monthlyCycleKey: currentMonthlyCycleKey(new Date(NOW)), plan, subscriptionId: `sub_${plan}`,
  subscriptionStatus: "active", subscriptionCurrency: null, subscriptionCurrentTermStart: null,
  subscriptionCurrentTermEnd: new Date(NOW + 20 * DAY), subscriptionResourceVersion: null,
});

function seed() {
  rows = {
    users: [
      { id: SEEKER, name: "Sam Seeker", email: "sam@example.com", suspended: false, canonicalPersonId: null },
      { id: REFERRER, name: "Maya Chen", email: "maya@acme.com", suspended: false, canonicalPersonId: null },
    ],
    canonicalPeople: [],
    companyCoverageInvitations: [],
    profiles: [referrerProfile(REFERRER, "acme.com")],
    jobs: [],
    tokenBalances: [wallet("momentum")],
    bandedReferralBalances: [
      { id: 1, userId: SEEKER, plan: "momentum", includedCycleKey: currentMonthlyCycleKey(new Date(NOW)), includedRemaining: 2, purchasedRemaining: 0, updatedAt: new Date(NOW) },
    ],
    tokenTransactions: [],
    planCreditGrants: [],
    promoCreditGrants: [],
    referralRequests: [],
    referralAttachments: [
      { id: 41, ownerId: SEEKER, referralRequestId: null, fileName: "resume.pdf", fileKey: "private/resume", mimeType: "application/pdf", fileSize: 3 },
    ],
    workItems: [],
    askCosts: [],
    askWorkItems: [],
    notifications: [],
    referrerReviewEmailLinks: [],
    referralReviewDeliveries: [],
    companies: [
      { id: 1, slug: "stripe", name: "Stripe", initials: "S", industry: "Fintech", location: "SF", functions: "[]", blurb: "Payments", status: "listed", sortOrder: 0 },
      { id: 2, slug: "airbnb", name: "Airbnb", initials: "A", industry: "Travel", location: "SF", functions: "[]", blurb: "Travel", status: "listed", sortOrder: 1 },
      { id: 3, slug: "acme", name: "Acme", initials: "A", industry: "Tech", location: "Global", functions: "[]", blurb: "Tech", status: "listed", sortOrder: 2 },
    ],
    companyDomains: [
      { id: 1, companyId: 1, domain: "stripe.com", isPrimary: true },
      { id: 2, companyId: 2, domain: "airbnb.com", isPrimary: true },
      { id: 3, companyId: 3, domain: "acme.com", isPrimary: true },
    ],
    companyJobSources: [
      { id: 1, companyId: 1, provider: "greenhouse", boardToken: "stripe", evidenceUrl: "https://stripe.com/jobs", status: "verified" },
      { id: 2, companyId: 2, provider: "greenhouse", boardToken: "airbnb", evidenceUrl: "https://airbnb.com/jobs", status: "verified" },
      { id: 3, companyId: 3, provider: "greenhouse", boardToken: "acme", evidenceUrl: "https://acme.com/jobs", status: "verified" },
    ],
    catalogJobs: [
      {
        id: 101,
        companyId: 1, // Stripe (no referrers)
        sourceId: 1,
        externalId: "ext-101",
        title: "Senior Backend Engineer",
        rawLocation: "San Francisco, CA",
        locations: '["San Francisco, CA"]',
        workMode: "hybrid",
        department: "Engineering",
        jobFunction: "Engineering",
        level: 4,
        applyUrl: "https://boards.greenhouse.io/stripe/jobs/101",
        snippet: "Build resilient payment infrastructure and global API services.",
        publishedAt: new Date(NOW - DAY),
        closedAt: null,
      },
      {
        id: 102,
        companyId: 2, // Airbnb
        sourceId: 2,
        externalId: "ext-102",
        title: "Staff Product Designer",
        rawLocation: "Remote",
        locations: '["Remote"]',
        workMode: "remote",
        department: "Design",
        jobFunction: "Design",
        level: 5,
        applyUrl: "https://boards.greenhouse.io/airbnb/jobs/102",
        snippet: "Lead design across host experience and search interfaces.",
        publishedAt: new Date(NOW - DAY),
        closedAt: null,
      },
      {
        id: 103, // Closed catalog job
        companyId: 1,
        sourceId: 1,
        externalId: "ext-103",
        title: "Staff Data Scientist",
        rawLocation: "Seattle, WA",
        locations: '["Seattle, WA"]',
        workMode: "onsite",
        department: "Data",
        jobFunction: "Data",
        level: 5,
        applyUrl: "https://boards.greenhouse.io/stripe/jobs/103",
        snippet: "Lead data modeling and transaction scoring pipelines.",
        publishedAt: new Date(NOW - 10 * DAY),
        closedAt: new Date(NOW - DAY), // closed
      },
      {
        id: 104, // Acme catalog job (has referrer at acme.com)
        companyId: 3,
        sourceId: 3,
        externalId: "ext-104",
        title: "Principal Infrastructure Engineer",
        rawLocation: "New York, NY",
        locations: '["New York, NY"]',
        workMode: "onsite",
        department: "Infrastructure",
        jobFunction: "Engineering",
        level: 6,
        applyUrl: "https://boards.greenhouse.io/acme/jobs/104",
        snippet: "Scale platform infrastructure and distributed cloud systems.",
        publishedAt: new Date(NOW - DAY),
        closedAt: null,
      },
    ],
    companyOpportunities: [
      {
        id: 201,
        ownerId: REFERRER,
        companyDomain: "acme.com",
        kind: "hiring_now",
        roleTitle: "Staff Systems Engineer",
        targetRoleUrl: "https://careers.acme.com/jobs/staff-systems",
        location: "New York, NY",
        compensation: "$200,000 - $250,000",
        isActive: true,
        expiresAt: new Date(NOW + 10 * DAY),
      },
    ],
  };
  sequence = Object.fromEntries(TABLES.map(table => [tableNameOf(table), bucket(table).length]));
  mocks.drizzle.mockReturnValue(fixtureDatabase());
}

describe("D-174-ask-from-job (D-193 §5.8)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    seed();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("a catalog job at a company with no available referrer creates a waiting request bound to that company", async () => {
    const result = await createCompanyReferralRequest(SEEKER, {
      catalogJobId: 101,
      attachmentIds: [41],
      idempotencyKey: "ask-catalog-waiting-001",
      personalPitch: "Excited about Stripe payments platform.",
    });

    expect(result.coverageStatus).toBe("waiting_for_company_coverage");
    expect(result.companyDomain).toBe("stripe.com");

    const createdJob = rows.jobs[rows.jobs.length - 1];
    expect(createdJob).toMatchObject({
      company: "stripe.com",
      title: "Senior Backend Engineer",
      location: "San Francisco, CA",
      description: "Build resilient payment infrastructure and global API services.",
      targetRoleUrl: "https://boards.greenhouse.io/stripe/jobs/101",
    });
  });

  it("a catalogJobId from another company is refused", async () => {
    await expect(
      createCompanyReferralRequest(SEEKER, {
        catalogJobId: 102, // Airbnb job
        selectedCompany: { name: "Stripe", domains: ["stripe.com"] },
        attachmentIds: [41],
        idempotencyKey: "ask-catalog-mismatch-002",
        personalPitch: "Pitch",
      })
    ).rejects.toThrow("Stripe");
  });

  it("a closed catalog job is refused with a plain message", async () => {
    await expect(
      createCompanyReferralRequest(SEEKER, {
        catalogJobId: 103, // closed
        attachmentIds: [41],
        idempotencyKey: "ask-catalog-closed-003",
        personalPitch: "Pitch",
      })
    ).rejects.toThrow(/closed|no longer available/i);
  });

  it("with BANDED_SALES_ENABLED on, quote acceptedCost for catalogJobId equals charged cost (sameAcceptedAskCost), and holds for opportunityId", async () => {
    vi.stubEnv("BANDED_SALES_ENABLED", "true");

    // Catalog job 104 is at Acme, where REFERRER exists and SEEKER has balance
    const catalogQuote = await previewBandedAskCost(SEEKER, { catalogJobId: 104 });
    expect(catalogQuote.coverageStatus).toBe("covered");
    expect(catalogQuote.acceptedCost.units).toBe(1);

    const catalogCreated = await createCompanyReferralRequest(SEEKER, {
      catalogJobId: 104,
      attachmentIds: [41],
      idempotencyKey: "ask-quote-match-catalog-004",
      personalPitch: "Pitch for catalog job",
      expectedCost: catalogQuote.acceptedCost,
    });
    expect(catalogCreated.chargedCost).toBeDefined();
    expect(sameAcceptedAskCost(catalogQuote.acceptedCost, catalogCreated.chargedCost!)).toBe(true);

    // And the same holds for opportunityId (opportunity 201 at Acme)
    const oppQuote = await previewBandedAskCost(SEEKER, { opportunityId: 201 });
    expect(oppQuote.coverageStatus).toBe("covered");
    expect(oppQuote.acceptedCost.units).toBe(1);

    const oppCreated = await createCompanyReferralRequest(SEEKER, {
      opportunityId: 201,
      attachmentIds: [41],
      idempotencyKey: "ask-quote-match-opp-005",
      personalPitch: "Pitch for opportunity",
      expectedCost: oppQuote.acceptedCost,
    });
    expect(oppCreated.chargedCost).toBeDefined();
    expect(sameAcceptedAskCost(oppQuote.acceptedCost, oppCreated.chargedCost!)).toBe(true);
  });
});
