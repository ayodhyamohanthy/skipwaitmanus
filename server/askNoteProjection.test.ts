import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { MySqlDialect, type MySqlTable } from "drizzle-orm/mysql-core";
import { messages, profiles, referralAttachments, referralRequests, tokenBalances } from "../drizzle/schema";
import { createCompanyReferralRequest, getClaimedCompanyReferralDetail, getUnclaimedCompanyReferralPreview, listCompanyReferralInboxByState, listJobSeekerCompanyReferrals } from "./db";

/*
 * D-019 seeker basics, persistence side of askNoteRoundTrip.test.ts: the
 * note is written verbatim to referralRequests.personalPitch and read back to
 * the seeker as `pitch`. The referrer-facing projections are pinned as they
 * are today so this fix exposes nothing new to referrers.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

type Row = Record<string, unknown>;
type SelectCall = { projection: Record<string, unknown> | undefined; table: MySqlTable | undefined; where: SQL | undefined };
const dialect = new MySqlDialect();
const NOTE = "I led the redesign of an approvals product used by 3,000 people and would value an honest fit check.";
const SEEKER = 7;
const REFERRER = 2;

let rowsByTable: Map<MySqlTable, Row[]>;
let selects: SelectCall[];
let inserts: Array<{ table: MySqlTable; values: Row }>;

function fixtureDatabase() {
  const select = (projection?: Record<string, unknown>) => {
    const call: SelectCall = { projection, table: undefined, where: undefined };
    selects.push(call);
    const result = () => structuredClone(call.table ? rowsByTable.get(call.table) ?? [] : []);
    const query = {
      from: (table: MySqlTable) => { call.table = table; return query; },
      innerJoin: () => query, leftJoin: () => query, groupBy: () => query, orderBy: () => query, limit: () => query,
      where: (condition: SQL) => { call.where = condition; return query; },
      for: async () => result(),
      then: (resolve: (rows: Row[]) => unknown, reject?: (error: Error) => unknown) => Promise.resolve(result()).then(resolve, reject),
    };
    return query;
  };
  const insert = (table: MySqlTable) => ({
    values: (values: Row) => {
      inserts.push({ table, values: structuredClone(values) });
      const done = Promise.resolve([{ insertId: 900 + inserts.length, affectedRows: 1 }]);
      return Object.assign(done, { onDuplicateKeyUpdate: async () => [{ insertId: 0, affectedRows: 1 }] });
    },
  });
  const update = () => ({ set: () => ({ where: async () => [{ affectedRows: 1 }] }) });
  const api = { select, insert, update };
  return { ...api, transaction: async (run: (tx: typeof api) => Promise<unknown>) => run(api) };
}

const wallet = { id: 1, userId: SEEKER, role: "job_seeker", balance: 2, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, updatedAt: new Date("2026-10-01T00:00:00Z") };
const referrerProfile = { id: 3, userId: REFERRER, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date("2026-09-01T00:00:00Z") };
const columnsOf = (call: SelectCall | undefined) => Object.keys(call?.projection ?? {}).sort();
const exposesNote = (call: SelectCall | undefined) => Object.values(call?.projection ?? {}).includes(referralRequests.personalPitch);
const selectFrom = (table: MySqlTable) => selects.find(call => call.table === table);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  rowsByTable = new Map(); selects = []; inserts = [];
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("seeker note persistence", () => {
  it("writes the note to referralRequests.personalPitch exactly as the route resolved it", async () => {
    rowsByTable.set(tokenBalances, [wallet]);
    rowsByTable.set(referralAttachments, [{ id: 77 }]);
    const created = await createCompanyReferralRequest(SEEKER, { targetRoleUrl: "https://careers.acme.com/jobs/design-1", personalPitch: NOTE, attachmentIds: [77], idempotencyKey: "ask-note-projection-0001" });
    expect(created.replayed).toBe(false);
    const written = inserts.filter(entry => entry.table === referralRequests);
    expect(written).toHaveLength(1);
    expect(written[0].values).toMatchObject({ jobSeekerId: SEEKER, personalPitch: NOTE, status: "pending" });
  });

  it("reads the stored note back to its seeker as pitch, scoped to that seeker", async () => {
    rowsByTable.set(referralRequests, [{ id: 501, title: "Role from shared job link", pitch: NOTE, targetRoleUrl: "https://careers.acme.com/jobs/design-1", companyDomain: "acme.com", jobFunction: null, compensation: null, status: "pending", referrerId: null, waitingForCoverage: false, referrerMessage: null, createdAt: new Date(), updatedAt: new Date(), attachmentCount: 1 }]);
    rowsByTable.set(messages, []);
    const rows = await listJobSeekerCompanyReferrals(SEEKER);
    const listed = selectFrom(referralRequests);
    expect(listed?.projection?.pitch).toBe(referralRequests.personalPitch);
    const where = listed?.where ? dialect.sqlToQuery(listed.where) : undefined;
    expect(where?.sql).toContain("`jobSeekerId` = ?");
    expect(where?.params).toEqual([SEEKER]);
    expect(rows[0]).toMatchObject({ id: 501, pitch: NOTE });
  });
});

describe("referrer projections stay as they are", () => {
  beforeEach(() => { rowsByTable.set(profiles, [referrerProfile]); });

  it("inbox rows carry no note", async () => {
    rowsByTable.set(referralRequests, []); rowsByTable.set(messages, []);
    await listCompanyReferralInboxByState(REFERRER, "new");
    const inbox = selectFrom(referralRequests);
    expect(exposesNote(inbox)).toBe(false);
    expect(columnsOf(inbox)).toEqual(["attachmentCount", "companyDomain", "compensation", "createdAt", "id", "jobFunction", "queueAllocationId", "referrerId", "savedAt", "savedByYouAt", "status", "targetRoleUrl", "updatedAt"]);
  });

  it("the unclaimed preview keeps its current fields, with the note as candidateMessage", async () => {
    rowsByTable.set(referralRequests, []);
    await getUnclaimedCompanyReferralPreview(REFERRER, 501);
    const preview = selectFrom(referralRequests);
    // candidateName here is NOT an approved field. It is a known exposure: the
    // pre-acceptance preview sends the seeker's real name to any verified
    // referrer at the company (the client drops it, the API does not). It is
    // pinned only so this unit changes nothing for referrers; removing it waits
    // on the owner's answer to open question 1 and is a separate unit.
    expect(columnsOf(preview)).toEqual(["candidateMessage", "candidateName", "companyDomain", "id", "jobFunction", "targetRoleUrl", "title"]);
    expect(preview?.projection?.candidateMessage).toBe(referralRequests.personalPitch);
  });

  it("the claimed detail keeps its current fields", async () => {
    rowsByTable.set(referralRequests, []);
    await getClaimedCompanyReferralDetail(REFERRER, 501);
    const detail = selectFrom(referralRequests);
    expect(exposesNote(detail)).toBe(false);
    expect(columnsOf(detail)).toEqual(["candidateName", "companyDomain", "grantExpiresAt", "grantRevision", "grantVersion", "id", "jobFunction", "referrerId", "revision", "status", "targetRoleUrl"]);
  });
});
