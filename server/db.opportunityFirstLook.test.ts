import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableColumns, getTableName, SQL, type SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  canonicalPeople, companyOpportunities, jobs, notifications, operationalActivityLogs, profiles,
  promoCreditGrants, planCreditGrants, referralAttachments, referralAvailabilitySlots,
  referralDocumentAccessGrants, referralRequestPasses, referralRequestSaves,
  referralRequests, referralReviewDeliveries, referralTransitionEvents, referrerReviewEmailLinks,
  referrerFastTrackLinks, tokenBalances, tokenTransactions, userBlocks, users,
} from "../drizzle/schema";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { OPPORTUNITY_FIRST_LOOK_MS, OPPORTUNITY_TTL_MS } from "../shared/companyOpportunities";
import {
  claimCompanyReferralRequest, closeCompanyOpportunity, companyReferralFingerprint,
  createCompanyReferralRequest, firstLookExcludesViewer, getUnclaimedCompanyReferralPreview,
  listCompanyOpportunityPosts, listCompanyReferralInboxByState, listMyCompanyOpportunities,
  oneClickReviewReferralRequest, publishCompanyOpportunity, releaseFirstLookForRequest, renewCompanyOpportunity,
  saveCompanyReferralRequest, opportunityPosterOf,
} from "./db";
import { listLapsedFirstLooks } from "./firstLookRelease";
import { BlockedPersonalLinkError, PERSONAL_LINK_UNAVAILABLE } from "./blockedPairs";

/*
 * D-022 referrer-posted roles: an ask written from a post goes to the poster
 * alone for 24 hours (owner rule, Oct 25 2026); every other read path (inbox, preview, save, claim,
 * decision, email/Slack delivery) hides it until the first look lapses or the
 * poster decides, and the lapsed first look opens the ask to the company once.
 *
 * These are real calls into server/db.ts against a fixture client that
 * implements the slice of SQL the create path, the guards and the release use
 * (select with joins, groupBy, <=/>=/</>/=/<>/is null, update, insert with
 * onDuplicateKeyUpdate, transaction).
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn(), capture: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));
vi.mock("./sentry", async importOriginal => ({ ...(await importOriginal<typeof import("./sentry")>()), captureServerError: mocks.capture }));

const dialect = new MySqlDialect();
const NOW = Date.parse("2026-10-16T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SEEKER = 7;
const POSTER = 9;
const COLLEAGUE = 10;
const URL_ = "https://careers.acme.com/jobs/123";

type Row = Record<string, unknown>;
const TABLES = [tokenBalances, tokenTransactions, planCreditGrants, promoCreditGrants, jobs, notifications, profiles, referralAttachments, referralAvailabilitySlots, referralDocumentAccessGrants, referralRequestPasses, referralRequestSaves, referralRequests, referralReviewDeliveries, referralTransitionEvents, referrerReviewEmailLinks, companyOpportunities, users, canonicalPeople, operationalActivityLogs, userBlocks, referrerFastTrackLinks];
const TABLE_BY_NAME = new Map(TABLES.map(table => [getTableName(table), table]));
const COLUMNS_BY_NAME = new Map(TABLES.map(table => [getTableName(table), Object.keys(getTableColumns(table))]));

let rows: Record<string, Row[]>;
let sequence: Record<string, number>;
/** When true, every read of userBlocks throws like a missing table (the fail-open case). */
let failBlockReads = false;

const tableNameOf = (table: unknown) => getTableName(table as never);
const bucket = (table: unknown) => (rows[tableNameOf(table)] ??= []);

/** Every column of every joined table keyed "table.column"; a left join with no match is all null. */
function flatten(parts: Array<{ table: string; row: Row | null }>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const part of parts) for (const column of COLUMNS_BY_NAME.get(part.table) ?? []) flat[`${part.table}.${column}`] = part.row ? part.row[column] ?? null : null;
  return flat;
}

/** drizzle hands timestamp params to the driver as "YYYY-MM-DD HH:MM:SS.mmm" (UTC) strings. */
const asMs = (value: unknown) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) return Date.parse(`${value.replace(" ", "T")}Z`);
  return value;
};

/** Splits a condition at depth 0 on a boolean operator, so nested groups keep their meaning. */
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
/** The SQL text of a fragment (count(), sum(), ...); null for plain columns and tables. */
const sqlTextOf = (value: unknown): string | null => (value instanceof SQL ? dialect.sqlToQuery(value).sql.trim() : null);

/** MySQL ordering: NULL sorts before every value ascending (after the direction flip, last descending); numbers and dates compare by value. */
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

/**
 * Evaluates the WHERE slice this suite exercises: =, <, <=, >, >=, <>, is (not) null, in, and/or, column or param right
 * side, and the open-ask count's correlated `exists (select 1 from <table> where ...)` (a match against any of that table's rows).
 */
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
      const count = (inMatch[3].match(/\?/g) ?? []).length;
      const values = query.params.slice(cursor.index, cursor.index + count);
      cursor.index += count;
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
    return left >= bound;
  };
  return evaluate(query.sql);
}

function fixtureDatabase() {
  const select = (projection?: Record<string, unknown>) => {
    const state: {
      from?: unknown;
      joins: Array<{ table: unknown; on: unknown; kind: "inner" | "left" }>;
      where?: unknown;
      groups: unknown[];
      orders: Array<{ table: string; column: string; direction: 1 | -1 }>;
    } = { joins: [], groups: [], orders: [] };
    const project = (combo: Array<{ table: string; row: Row | null }>): Row => {
      if (!projection) return structuredClone(combo[0].row ?? {});
      const flat = flatten(combo);
      const out: Row = {};
      for (const [key, value] of Object.entries(projection)) {
        const selectedTable = [...TABLE_BY_NAME.values()].find(table => table === value);
        if (selectedTable) { out[key] = structuredClone(combo.find(part => part.table === tableNameOf(selectedTable))?.row ?? null); continue; }
        const text = sqlTextOf(value);
        if (text !== null) {
          const column = COUNT_COLUMN.exec(text);
          const cell = column ? flat[`${column[1]}.${column[2]}`] : undefined;
          // Other fragments read as null here; add support when a tested path needs one.
          out[key] = COUNT_ALL.test(text) ? 1 : column ? (cell === null || cell === undefined ? 0 : 1) : null;
          continue;
        }
        out[key] = flat[`${tableNameOf((value as { table: unknown }).table)}.${(value as { name: string }).name}`];
      }
      return out;
    };
    const compareCombos = (a: Array<{ table: string; row: Row | null }>, b: Array<{ table: string; row: Row | null }>): number => {
      const fa = flatten(a); const fb = flatten(b);
      for (const order of state.orders) {
        const result = compareValues(fa[`${order.table}.${order.column}`], fb[`${order.table}.${order.column}`]);
        if (result !== 0) return result * order.direction;
      }
      return 0;
    };
    const run = (): Row[] => {
      let combos = bucket(state.from).map(row => [{ table: tableNameOf(state.from), row }]);
      for (const join of state.joins) {
        const name = tableNameOf(join.table);
        const next: typeof combos = [];
        for (const combo of combos) {
          const matched = bucket(join.table).filter(candidate => matches(join.on, flatten([...combo, { table: name, row: candidate }])));
          for (const candidate of matched) next.push([...combo, { table: name, row: candidate }]);
          if (join.kind === "left" && matched.length === 0) next.push([...combo, { table: name, row: null }]);
        }
        combos = next;
      }
      if (state.where) combos = combos.filter(combo => matches(state.where, flatten(combo)));
      if (state.orders.length) combos = [...combos].sort(compareCombos);
      const entries = projection ? Object.entries(projection) : [];
      // A bare SELECT count(...) with no GROUP BY collapses to one row in MySQL, even over zero rows.
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
      from: (table: unknown) => { if (failBlockReads && table === userBlocks) throw Object.assign(new Error("Table 'userBlocks' doesn't exist"), { code: "ER_NO_SUCH_TABLE" }); state.from = table; return chain; },
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
        const name = tableNameOf(table);
        const matched = bucket(table).filter(row => matches(condition, flatten([{ table: name, row }])));
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
  const remove = (table: unknown) => ({
    where: async (condition: unknown) => {
      const name = tableNameOf(table);
      const kept = bucket(table).filter(row => !matches(condition, flatten([{ table: name, row }])));
      const removed = bucket(table).length - kept.length;
      rows[name] = kept;
      return [{ affectedRows: removed }];
    },
  });
  const api = { select, update, insert, delete: remove };
  return { ...api, transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(api) };
}

const userRow = (id: number, name: string, email: string) => ({ id, name, email, suspended: false, canonicalPersonId: null });
const referrerProfile = (id: number, userId: number, over: Row = {}) => ({ id, userId, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date(NOW - 30 * DAY), paused: false, notifyNewAsk: true, referralCapacity: null, ...over });
const post = (over: Row = {}) => ({ id: 55, ownerId: POSTER, companyDomain: "acme.com", kind: "hiring_now", roleTitle: "Product Designer", targetRoleUrl: "https://careers.acme.com/designer", location: null, compensation: null, walkInAt: null, walkInEndsAt: null, isActive: true, expiresAt: new Date(NOW + 10 * DAY), showPosterFirstName: false, createdAt: new Date(NOW - 6 * DAY), ...over });
const wallet = () => ({ id: 1, userId: SEEKER, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 3, monthlyAllowance: 3, monthlyCycleKey: currentMonthlyCycleKey(new Date(NOW)), plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null });
const askFromPost = (over: Row = {}) => ({ id: 501, jobId: 3, jobSeekerId: SEEKER, referrerId: null, personalPitch: "I shipped the approvals redesign this role describes.", status: "pending", revision: 4, referrerMessage: null, debitTransactionId: null, waitingForCoverage: false, createdAt: new Date(NOW - 1 * HOUR), updatedAt: new Date(NOW - 1 * HOUR), firstLookReferrerId: POSTER, firstLookUntil: new Date(NOW + 24 * HOUR), ...over });
const jobRow = () => ({ id: 3, company: "acme.com", title: "Role from shared job link", targetRoleUrl: URL_, jobFunction: "Design" });

function seed() {
  rows = {
    // The colleague's first.last address keeps "Ravi" safe to show; a first@ address would make
    // the first name rebuild it, so the poster would show as anonymous (see the withheld-name test).
    users: [userRow(SEEKER, "Sam Seeker", "sam@example.com"), userRow(POSTER, "Maya Chen", "maya@acme.com"), userRow(COLLEAGUE, "Ravi Patel", "ravi.patel@acme.com")],
    canonicalPeople: [],
    profiles: [referrerProfile(1, POSTER), referrerProfile(2, COLLEAGUE)],
    companyOpportunities: [post()],
    jobs: [jobRow()],
    tokenBalances: [wallet()],
    tokenTransactions: [],
    planCreditGrants: [],
    promoCreditGrants: [],
    referralRequests: [],
    referralAttachments: [{ id: 41, ownerId: SEEKER, referralRequestId: null, fileName: "resume.pdf", fileKey: "private/resume", mimeType: "application/pdf", fileSize: 3 }],
    referralTransitionEvents: [],
    referralRequestPasses: [],
    referralRequestSaves: [],
    referralAvailabilitySlots: [],
    referralDocumentAccessGrants: [],
    referrerReviewEmailLinks: [],
    referralReviewDeliveries: [],
    notifications: [],
    operationalActivityLogs: [],
    userBlocks: [],
    referrerFastTrackLinks: [],
  };
  sequence = {};
  failBlockReads = false;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  seed();
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

const sendWithPost = (over: Record<string, unknown> = {}) => createCompanyReferralRequest(SEEKER, { targetRoleUrl: URL_, personalPitch: "I shipped the approvals redesign this role describes.", attachmentIds: [41], idempotencyKey: "post-ask-key-0001", opportunityId: 55, ...over });
const insertedRequest = () => rows.referralRequests.find(row => row.jobSeekerId === SEEKER && row.idempotencyKey === "post-ask-key-0001")!;

describe("an ask written from a post", () => {
  it("gives the poster the 24-hour first look and tells nobody else", async () => {
    const result = await sendWithPost();

    expect(result).toMatchObject({ fromPost: true, firstLook: true, notifiedEmployees: 1, coverageStatus: "covered", replayed: false });
    const request = insertedRequest();
    expect(request).toMatchObject({ opportunityId: 55, firstLookReferrerId: POSTER });
    expect((request.firstLookUntil as Date).getTime()).toBe(NOW + OPPORTUNITY_FIRST_LOOK_MS);
    // Only the poster is notified; the in-app copy names the 24 hours.
    expect(rows.notifications).toHaveLength(1);
    expect(rows.notifications[0]).toMatchObject({ userId: POSTER, kind: "ask_new", category: "referral", title: "A candidate asked from your post" });
    expect(String(rows.notifications[0].body)).toContain("first look for 24 hours");
    // The email/Slack grant rows exist only for the poster.
    expect(rows.referrerReviewEmailLinks).toEqual([expect.objectContaining({ referralRequestId: request.id, referrerId: POSTER })]);
    expect(rows.referralReviewDeliveries).toEqual([expect.objectContaining({ referralRequestId: request.id, referrerId: POSTER, channel: "email" })]);
    // The spend is unchanged: one credit from the monthly cycle.
    expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(2);
  });

  it("opens the ask to the whole company when the poster is paused", async () => {
    rows.profiles[0].paused = true;
    const result = await sendWithPost();

    expect(result).toMatchObject({ fromPost: true, firstLook: false, notifiedEmployees: 2 });
    expect(insertedRequest()).toMatchObject({ opportunityId: 55, firstLookReferrerId: null, firstLookUntil: null });
    expect(rows.notifications.map(row => row.userId).sort((a, b) => Number(a) - Number(b))).toEqual([POSTER, COLLEAGUE]);
    expect(String(rows.notifications[0].body)).toContain("A Job Seeker shared a role at acme.com");
  });

  it("never first-looks an ask written by the poster's own account", async () => {
    rows.companyOpportunities[0].ownerId = SEEKER;
    const result = await sendWithPost();

    expect(result).toMatchObject({ fromPost: true, firstLook: false, notifiedEmployees: 2 });
    expect(insertedRequest()).toMatchObject({ opportunityId: 55, firstLookReferrerId: null });
  });

  it.each([
    ["closed", { isActive: false }],
    ["lapsed", { expiresAt: new Date(NOW - 1 * DAY) }],
    ["for another company", { companyDomain: "other.com" }],
  ])("refuses a post that is %s before any side effect", async (_label, patch) => {
    Object.assign(rows.companyOpportunities[0], patch);
    await expect(sendWithPost()).rejects.toThrow(/opening is no longer available/);
    expect(rows.jobs).toHaveLength(1); // the seeded row only
    expect(rows.referralRequests).toEqual([]);
    expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(3);
  });

  it("refuses a post selection combined with a fast-track link", async () => {
    await expect(sendWithPost({ fastTrackCode: "abcdefghijklmnop" })).rejects.toThrow("Use one private referral link at a time");
    expect(rows.referralRequests).toEqual([]);
  });

  it("replays an exact retry with the stored post and first-look facts", async () => {
    const input = { targetRoleUrl: URL_, personalPitch: "I shipped the approvals redesign this role describes.", attachmentIds: [41], idempotencyKey: "post-ask-key-0001", opportunityId: 55 };
    const companyDomain = "acme.com";
    rows.referralRequests.push(askFromPost({ idempotencyKey: input.idempotencyKey, requestFingerprint: companyReferralFingerprint(input, companyDomain), opportunityId: 55 }));
    // A retry that drops the post is a different ask, never a silent replay.
    expect(companyReferralFingerprint({ ...input, opportunityId: undefined }, companyDomain)).not.toBe(companyReferralFingerprint(input, companyDomain));

    const replay = await sendWithPost();
    expect(replay).toMatchObject({ replayed: true, fromPost: true, firstLook: true, notifiedEmployees: 0 });
    expect(rows.jobs).toHaveLength(1);
    expect(rows.notifications).toEqual([]);
  });
});

describe("P0-block-delivery: a block on the create path", () => {
  const blockPair = (blocker: number, blocked: number) => { rows.userBlocks.push({ id: rows.userBlocks.length + 1, blockerUserId: blocker, blockedUserId: blocked, reason: null, createdAt: new Date(NOW) }); };
  const sendPlain = () => createCompanyReferralRequest(SEEKER, { targetRoleUrl: URL_, personalPitch: "I shipped the approvals redesign this role describes.", attachmentIds: [41], idempotencyKey: "plain-ask-key-0001" });
  const recipients = (table: Row[]) => table.map(row => row.userId ?? row.referrerId).sort((a, b) => Number(a) - Number(b));
  const DIRECTIONS = [
    ["the poster blocked the seeker", POSTER, SEEKER],
    ["the seeker blocked the poster", SEEKER, POSTER],
  ] as const;
  beforeEach(() => { mocks.capture.mockClear(); vi.spyOn(console, "warn").mockImplementation(() => undefined); });
  afterEach(() => { vi.restoreAllMocks(); });

  it.each(DIRECTIONS)("tells only the unblocked colleague about a plain ask when %s, and the ask still costs its one credit", async (_label, blocker, blocked) => {
    blockPair(blocker, blocked);
    const result = await sendPlain();
    expect(result).toMatchObject({ coverageStatus: "covered", notifiedEmployees: 1, firstLook: false, fastTrack: false, replayed: false });
    expect(recipients(rows.notifications)).toEqual([COLLEAGUE]);
    expect(recipients(rows.referrerReviewEmailLinks)).toEqual([COLLEAGUE]);
    expect(recipients(rows.referralReviewDeliveries)).toEqual([COLLEAGUE]);
    expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(2);
  });

  it.each(DIRECTIONS)("gives a blocked poster no first look when %s: the ask opens to the colleagues at once", async (_label, blocker, blocked) => {
    blockPair(blocker, blocked);
    const result = await sendWithPost();
    expect(result).toMatchObject({ fromPost: true, firstLook: false, notifiedEmployees: 1 });
    expect(insertedRequest()).toMatchObject({ opportunityId: 55, firstLookReferrerId: null, firstLookUntil: null });
    expect(recipients(rows.notifications)).toEqual([COLLEAGUE]);
    expect(String(rows.notifications[0].body)).toContain("A Job Seeker shared a role at acme.com");
    expect(recipients(rows.referrerReviewEmailLinks)).toEqual([COLLEAGUE]);
  });

  it("keeps the ask covered when every employee is blocked, so its status never reveals a block", async () => {
    blockPair(POSTER, SEEKER);
    blockPair(SEEKER, COLLEAGUE);
    const result = await sendPlain();
    expect(result).toMatchObject({ coverageStatus: "covered", notifiedEmployees: 0 });
    expect(rows.notifications).toEqual([]);
    expect(rows.referrerReviewEmailLinks).toEqual([]);
    expect(rows.referralRequests[0]).toMatchObject({ waitingForCoverage: false, referrerId: null });
  });

  it("ignores blocks with other people", async () => {
    blockPair(POSTER, 99);
    blockPair(98, COLLEAGUE);
    expect(await sendPlain()).toMatchObject({ notifiedEmployees: 2 });
    expect(recipients(rows.notifications)).toEqual([POSTER, COLLEAGUE]);
  });

  it("fails open when the block lookup fails: the ask goes out as before and the failure is reported", async () => {
    blockPair(POSTER, SEEKER);
    failBlockReads = true;
    expect(await sendWithPost()).toMatchObject({ firstLook: true, notifiedEmployees: 1 });
    expect(recipients(rows.notifications)).toEqual([POSTER]);
    expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({ code: "ER_NO_SUCH_TABLE" }), expect.objectContaining({ area: "ask_create_delivery" }));
  });

  describe("through a personal link (D-017)", () => {
    const LINK = "personal-link-code-0001";
    beforeEach(() => {
      rows.referrerFastTrackLinks = [{ id: 1, referrerId: POSTER, companyDomain: "acme.com", linkCode: LINK, vanityAlias: null, isActive: true, createdAt: new Date(NOW), updatedAt: new Date(NOW), deactivatedAt: null }];
    });
    const sendViaLink = () => createCompanyReferralRequest(SEEKER, { targetRoleUrl: URL_, personalPitch: "I shipped the approvals redesign this role describes.", attachmentIds: [41], idempotencyKey: "link-ask-key-0001", fastTrackCode: LINK });
    const refusalOf = (work: Promise<unknown>) => work.then(() => undefined, (reason: unknown) => reason);

    it.each(DIRECTIONS)("is refused with the inactive-link words before any write or credit when %s", async (_label, blocker, blocked) => {
      blockPair(blocker, blocked);
      const refusal = await refusalOf(sendViaLink());
      expect(refusal).toBeInstanceOf(BlockedPersonalLinkError);
      expect(refusal instanceof Error ? refusal.message : "").toBe(PERSONAL_LINK_UNAVAILABLE);
      expect(rows.referralRequests).toEqual([]);
      expect(rows.jobs).toHaveLength(1); // the seeded row only
      expect(rows.tokenTransactions).toEqual([]);
      expect(rows.planCreditGrants).toEqual([]);
      expect(rows.tokenBalances[0]).toMatchObject({ monthlyCreditsRemaining: 3, balance: 0 });
      expect(rows.referralAttachments[0].referralRequestId).toBeNull();
      expect(rows.notifications).toEqual([]);
      expect(rows.referrerReviewEmailLinks).toEqual([]);
      expect(rows.referralReviewDeliveries).toEqual([]);
    });

    it("answers a blocked link with exactly the words an inactive link gets", async () => {
      rows.referrerFastTrackLinks[0].isActive = false;
      const inactive = await refusalOf(sendViaLink());
      expect(inactive instanceof Error ? inactive.message : "").toBe(PERSONAL_LINK_UNAVAILABLE);
      expect(inactive).not.toBeInstanceOf(BlockedPersonalLinkError);
    });

    it("still goes to the link owner alone when nothing is blocked", async () => {
      blockPair(COLLEAGUE, SEEKER);
      expect(await sendViaLink()).toMatchObject({ fastTrack: true, notifiedEmployees: 1, replayed: false });
      expect(rows.referralRequests[0]).toMatchObject({ referrerId: POSTER, status: "pending" });
      expect(recipients(rows.notifications)).toEqual([POSTER]);
      expect(rows.tokenBalances[0].monthlyCreditsRemaining).toBe(2);
    });
  });
});

describe("the first look hides the ask from everyone else", () => {
  beforeEach(() => {
    rows.referralRequests = [askFromPost()];
  });

  it("keeps the ask out of a colleague's inbox and preview while the poster sees it", async () => {
    expect(await listCompanyReferralInboxByState(POSTER, "new")).toHaveLength(1);
    expect(await listCompanyReferralInboxByState(COLLEAGUE, "new")).toEqual([]);
    expect(await getUnclaimedCompanyReferralPreview(POSTER, 501)).toBeDefined();
    expect(await getUnclaimedCompanyReferralPreview(COLLEAGUE, 501)).toBeUndefined();
  });

  it("blocks a colleague's save, claim and decline, and keeps the poster able to act", async () => {
    await expect(saveCompanyReferralRequest(COLLEAGUE, 501, true)).rejects.toThrow(/no longer available to save/);
    await expect(claimCompanyReferralRequest(COLLEAGUE, 501)).rejects.toThrow(/first look/);
    await expect(oneClickReviewReferralRequest(COLLEAGUE, { requestId: 501, decision: "declined", declineReason: "timing" })).rejects.toThrow(/first look/);
    expect(rows.referralRequestPasses).toEqual([]);
    expect(rows.notifications).toEqual([]);

    await expect(saveCompanyReferralRequest(POSTER, 501, true)).resolves.toMatchObject({ saved: true });
    expect(await claimCompanyReferralRequest(POSTER, 501)).toMatchObject({ claimed: true });
  });

  it("lets a colleague in once the poster decides to pass, and clears the first look with the decision", async () => {
    const result = await oneClickReviewReferralRequest(POSTER, { requestId: 501, decision: "declined", declineReason: "timing" });

    expect(result).toMatchObject({ status: "passed" });
    expect(rows.referralRequests[0]).toMatchObject({ status: "pending", referrerId: null, firstLookReferrerId: null, firstLookUntil: null });
    expect(await getUnclaimedCompanyReferralPreview(COLLEAGUE, 501)).toBeDefined();
    expect(await listCompanyReferralInboxByState(COLLEAGUE, "new")).toHaveLength(1);
  });

  it("lets a colleague in once the 24 hours lapse, even before the sweep runs", async () => {
    vi.setSystemTime(NOW + 49 * HOUR);
    expect(await getUnclaimedCompanyReferralPreview(COLLEAGUE, 501)).toBeDefined();
    expect(await claimCompanyReferralRequest(COLLEAGUE, 501)).toMatchObject({ claimed: true });
  });
});

describe("releasing a lapsed first look", () => {
  beforeEach(() => {
    rows.referralRequests = [askFromPost({ firstLookUntil: new Date(NOW - 1 * HOUR) })];
  });

  it("opens the ask to the company once, notifying every colleague except the poster and past passers", async () => {
    rows.referralRequestPasses.push({ id: 1, referralRequestId: 501, referrerId: COLLEAGUE }); // already passed: never told again
    rows.users.push(userRow(11, "Lena Fischer", "lena@acme.com"));
    rows.profiles.push(referrerProfile(3, 11));

    expect(await listLapsedFirstLooks(new Date(NOW), 200)).toEqual([{ id: 501 }]);
    const released = await releaseFirstLookForRequest(501, NOW);

    expect(released).toEqual({ released: true, notified: 1 });
    expect(rows.referralRequests[0]).toMatchObject({ status: "pending", referrerId: null, firstLookReferrerId: null, firstLookUntil: null });
    expect(rows.notifications).toEqual([expect.objectContaining({ userId: 11, kind: "ask_new", title: "A referral request is open at acme.com", eventKey: "first_look_released:501:11" })]);
    expect(rows.operationalActivityLogs).toEqual([expect.objectContaining({ action: "first_look.released", outcome: "success", resourceType: "referral_request", resourceId: "501" })]);
    // Repeated sweeps release nothing twice and add no rows.
    expect(await releaseFirstLookForRequest(501, NOW)).toEqual({ released: false, notified: 0 });
    expect(rows.notifications).toHaveLength(1);
    expect(await listLapsedFirstLooks(new Date(NOW), 200)).toEqual([]);
  });

  it("does nothing for a claimed, decided, still-running or already-expired ask", async () => {
    rows.referralRequests.push(
      askFromPost({ id: 502, referrerId: COLLEAGUE, firstLookUntil: new Date(NOW - 1 * HOUR) }),
      askFromPost({ id: 503, status: "approved", firstLookUntil: new Date(NOW - 1 * HOUR) }),
      askFromPost({ id: 504, firstLookUntil: new Date(NOW + 1 * HOUR) }),
      askFromPost({ id: 505, firstLookUntil: new Date(NOW - 1 * HOUR), createdAt: new Date(NOW - 8 * DAY) }),
    );

    expect(await listLapsedFirstLooks(new Date(NOW), 200)).toEqual([{ id: 501 }]);
    expect(await releaseFirstLookForRequest(502, NOW)).toEqual({ released: false, notified: 0 });
    expect(await releaseFirstLookForRequest(503, NOW)).toEqual({ released: false, notified: 0 });
    expect(await releaseFirstLookForRequest(504, NOW)).toEqual({ released: false, notified: 0 });
    expect(await releaseFirstLookForRequest(505, NOW)).toEqual({ released: false, notified: 0 });
    expect(await releaseFirstLookForRequest(999, NOW)).toEqual({ released: false, notified: 0 });
    expect(rows.referralRequests.find(row => row.id === 501)!.firstLookReferrerId).toBe(POSTER); // untouched
    expect(rows.notifications).toEqual([]);
  });
});

describe("post lists and the poster's controls", () => {
  it("lists only live posts for a company, newest first, with the poster's chosen face", async () => {
    rows.companyOpportunities.push(
      post({ id: 56, ownerId: COLLEAGUE, roleTitle: "Backend Engineer", showPosterFirstName: true, createdAt: new Date(NOW - 2 * DAY) }),
      post({ id: 57, isActive: false, createdAt: new Date(NOW - 1 * DAY) }),
      post({ id: 58, expiresAt: new Date(NOW - 1 * DAY), createdAt: new Date(NOW - 3 * DAY) }),
      post({ id: 59, companyDomain: "other.com", createdAt: new Date(NOW - 4 * DAY) }),
    );

    const posts = await listCompanyOpportunityPosts(["acme.com", "other.com"]);
    expect(posts.map((item: { id: number }) => item.id)).toEqual([56, 59, 55]);
    expect(posts[0]).toMatchObject({ id: 56, poster: { kind: "firstName", firstName: "Ravi" } });
    expect(posts[1]).toMatchObject({ id: 59, companyDomain: "other.com" });
    expect(posts[2]).toMatchObject({ id: 55, poster: { kind: "anonymous" }, postedAt: new Date(NOW - 6 * DAY).toISOString(), expiresAt: new Date(NOW + 10 * DAY).toISOString() });
    // A post never carries owner ids or emails.
    expect(JSON.stringify(posts)).not.toContain("maya@acme.com");
    expect(Object.keys(posts[0])).not.toContain("ownerId");
  });

  it("shows the poster their own posts, expired and closed included, with renewable flags", async () => {
    rows.companyOpportunities.push(post({ id: 57, isActive: false, createdAt: new Date(NOW - 1 * DAY) }), post({ id: 58, expiresAt: new Date(NOW - 1 * DAY), createdAt: new Date(NOW - 3 * DAY) }));
    const mine = await listMyCompanyOpportunities(POSTER);

    expect(mine.find((item: { id: number }) => item.id === 55)).toMatchObject({ isActive: true, expired: false, renewable: false });
    expect(mine.find((item: { id: number }) => item.id === 57)).toMatchObject({ isActive: false, expired: false, renewable: true });
    expect(mine.find((item: { id: number }) => item.id === 58)).toMatchObject({ isActive: true, expired: true, renewable: true });
    expect(mine.every((item: { id: number }) => item.id !== 56)).toBe(true);
  });

  it("renews and closes only the caller's own post", async () => {
    expect(await renewCompanyOpportunity(COLLEAGUE, 55)).toBeUndefined();
    expect(await closeCompanyOpportunity(COLLEAGUE, 55)).toBeUndefined();
    expect(rows.companyOpportunities[0].isActive).toBe(true);

    const renewed = await renewCompanyOpportunity(POSTER, 55);
    expect(renewed).toMatchObject({ id: 55, renewed: true });
    expect((rows.companyOpportunities[0].expiresAt as Date).getTime()).toBe(NOW + OPPORTUNITY_TTL_MS);
    expect(rows.companyOpportunities[0].isActive).toBe(true);

    rows.companyOpportunities[0].isActive = false;
    expect(await closeCompanyOpportunity(POSTER, 55)).toMatchObject({ closed: true });
    expect(rows.companyOpportunities[0].isActive).toBe(false);
  });

  it("never shows a last name even when the poster asked to be named", () => {
    expect(opportunityPosterOf({ showPosterFirstName: false, ownerName: "Maya Chen" })).toEqual({ kind: "anonymous" });
    expect(opportunityPosterOf({ showPosterFirstName: true, ownerName: "Maya Chen" })).toEqual({ kind: "firstName", firstName: "Maya" });
    expect(opportunityPosterOf({ showPosterFirstName: true, ownerName: null })).toEqual({ kind: "anonymous" });
  });

  // P0-referrer-exposure: work-email sign-ups stored the address's local part as the name, and the
  // card sits next to the company domain ("Your last name and work email never appear").
  it("withholds a chosen first name that would rebuild the poster's work email", async () => {
    expect(opportunityPosterOf({ showPosterFirstName: true, ownerName: "zoya.quill", ownerEmail: "zoya.quill@acme.com" })).toEqual({ kind: "anonymous" });
    expect(opportunityPosterOf({ showPosterFirstName: true, ownerName: "Maya Chen", ownerEmail: "maya@acme.com" })).toEqual({ kind: "anonymous" });
    expect(opportunityPosterOf({ showPosterFirstName: true, ownerName: "zoya_q", ownerEmail: null })).toEqual({ kind: "anonymous" });
    expect(opportunityPosterOf({ showPosterFirstName: true, ownerName: "Maya Chen", ownerEmail: "maya.chen@acme.com" })).toEqual({ kind: "firstName", firstName: "Maya" });

    // Through the real list: the poster (Maya Chen, maya@acme.com) ticked the box and stays anonymous.
    rows.companyOpportunities[0].showPosterFirstName = true;
    const posts = await listCompanyOpportunityPosts(["acme.com"]);
    expect(posts).toEqual([expect.objectContaining({ id: 55, poster: { kind: "anonymous" } })]);
    expect(JSON.stringify(posts)).not.toMatch(/maya/i);
  });
});

describe("firstLookExcludesViewer", () => {
  it("hides an active first look from others, never from the poster, and never on bad data", () => {
    const active = { firstLookReferrerId: POSTER, firstLookUntil: new Date(NOW + HOUR) };
    expect(firstLookExcludesViewer(active, COLLEAGUE, NOW)).toBe(true);
    expect(firstLookExcludesViewer(active, POSTER, NOW)).toBe(false);
    expect(firstLookExcludesViewer({ firstLookReferrerId: null, firstLookUntil: new Date(NOW + HOUR) }, COLLEAGUE, NOW)).toBe(false);
    expect(firstLookExcludesViewer({ firstLookReferrerId: POSTER, firstLookUntil: new Date(NOW - HOUR) }, COLLEAGUE, NOW)).toBe(false);
    expect(firstLookExcludesViewer({ firstLookReferrerId: POSTER, firstLookUntil: null }, COLLEAGUE, NOW)).toBe(false);
    expect(firstLookExcludesViewer({ firstLookReferrerId: POSTER, firstLookUntil: "not-a-date" }, COLLEAGUE, NOW)).toBe(false);
  });
});

describe("the posting caps and the one expiry clock", () => {
  const walkIn = () => ({ kind: "walk_in" as const, roleTitle: "Store Associate", location: "Pune", walkInAt: new Date(NOW + HOUR), walkInEndsAt: new Date(NOW + 3 * HOUR) });

  it("blocks a fourth live post with the open-cap message and writes nothing", async () => {
    rows.companyOpportunities = [post({ id: 60 }), post({ id: 61 }), post({ id: 62 })];
    await expect(publishCompanyOpportunity(POSTER, walkIn())).rejects.toThrow(/3 openings/);
    expect(rows.companyOpportunities).toHaveLength(3);
  });

  it("blocks the day's eleventh post even when nothing is live", async () => {
    const ended = new Date(NOW - HOUR);
    rows.companyOpportunities = Array.from({ length: 10 }, (_, index) => post({ id: 70 + index, kind: "walk_in", walkInEndsAt: ended, expiresAt: ended, createdAt: new Date(NOW - HOUR) }));
    await expect(publishCompanyOpportunity(POSTER, walkIn())).rejects.toThrow(/today's posting limit/);
    expect(rows.companyOpportunities).toHaveLength(10);
  });

  it("a walk-in post lands with its own end as the expiry, name off by default", async () => {
    rows.companyOpportunities = [];
    const created = await publishCompanyOpportunity(POSTER, walkIn());
    const stored = rows.companyOpportunities.find(row => row.id === created.id)!;
    expect(stored).toMatchObject({ kind: "walk_in", isActive: true, showPosterFirstName: false });
    expect((stored.expiresAt as Date).getTime()).toBe(NOW + 3 * HOUR);
  });
});
