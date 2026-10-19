import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { MySqlDialect, type MySqlTable, type SelectedFields } from "drizzle-orm/mysql-core";
import { jobs, messages, profiles, referralAttachments, referralRequests, tokenBalances, tokenTransactions } from "../drizzle/schema";
import { createCompanyReferralRequest, getClaimedCompanyReferralDetail, getUnclaimedCompanyReferralPreview, listCompanyReferralInboxByState, listJobSeekerCompanyReferrals } from "./db";

/*
 * D-019 seeker basics, persistence side of askNoteRoundTrip.test.ts: the
 * note is written verbatim to referralRequests.personalPitch and read back to
 * the seeker as `pitch`. Referrer-facing reads are pinned field by field: the
 * inbox list stays note-free, the unclaimed preview carries the note as
 * candidateMessage, and the claimed detail now serves the ask the referrer
 * accepted (role title + note, D-019(d)).
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

/** A selected row as the fake database returns it: column values keyed by the select's field names. */
type FixtureValue = string | number | boolean | Date | null;
type Row = Readonly<Record<string, FixtureValue>>;
type SelectCall = { projection: SelectedFields | undefined; table: MySqlTable | undefined; where: SQL | undefined };
type WalletRow = typeof tokenBalances.$inferSelect;
type ReferrerProfileRow = Pick<typeof profiles.$inferSelect, "id" | "userId" | "accountType" | "workEmailDomain" | "workEmailVerifiedAt">;

const dialect = new MySqlDialect();
const NOTE = "I led the redesign of an approvals product used by 3,000 people and would value an honest fit check.";
// 30+ words with a specific proof, so the inbox enrichment scores it as a full fit note.
const FIT_NOTE = "I led the redesign of the approvals product at my current company, which 3,000 people use every day. I shipped the new review flow in six weeks and cut the average approval time from two days to four hours.";
const ROLE_URL = "https://careers.acme.com/jobs/design-1";
const SEEKER = 7;
const REFERRER = 2;

let rowsByTable: Map<MySqlTable, readonly Row[]>;
let selects: SelectCall[];
let inserts: Array<{ table: MySqlTable; values: object }>;

/** Like drizzle, a select with a field map returns only those fields. */
function project(row: Row, projection: SelectedFields | undefined): Row {
  if (!projection) return row;
  return Object.fromEntries(Object.keys(projection).filter(key => key in row).map(key => [key, row[key]]));
}

function fixtureDatabase() {
  const select = (projection?: SelectedFields) => {
    const call: SelectCall = { projection, table: undefined, where: undefined };
    selects.push(call);
    const result = () => (call.table ? rowsByTable.get(call.table) ?? [] : []).map(row => project(structuredClone(row), call.projection));
    const query = {
      from: (table: MySqlTable) => { call.table = table; return query; },
      innerJoin: () => query, leftJoin: () => query, groupBy: () => query, orderBy: () => query, limit: () => query,
      where: (condition: SQL) => { call.where = condition; return query; },
      for: async () => result(),
      then: <T>(resolve: (rows: Row[]) => T, reject?: (error: Error) => T) => Promise.resolve(result()).then(resolve, reject),
    };
    return query;
  };
  const insert = (table: MySqlTable) => ({
    values: (values: object) => {
      inserts.push({ table, values: structuredClone(values) });
      const done = Promise.resolve([{ insertId: 900 + inserts.length, affectedRows: 1 }]);
      return Object.assign(done, { onDuplicateKeyUpdate: async () => [{ insertId: 0, affectedRows: 1 }] });
    },
  });
  const update = () => ({ set: () => ({ where: async () => [{ affectedRows: 1 }] }) });
  const api = { select, insert, update };
  return { ...api, transaction: async <T>(run: (tx: typeof api) => Promise<T>): Promise<T> => run(api) };
}

const wallet: WalletRow = { id: 1, userId: SEEKER, role: "job_seeker", balance: 2, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, updatedAt: new Date("2026-10-01T00:00:00Z") };
const referrerProfile: ReferrerProfileRow = { id: 3, userId: REFERRER, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date("2026-09-01T00:00:00Z") };
const columnsOf = (call: SelectCall | undefined) => Object.keys(call?.projection ?? {}).sort();
const exposesNote = (call: SelectCall | undefined) => Object.values(call?.projection ?? {}).includes(referralRequests.personalPitch);
const selectsFrom = (table: MySqlTable) => selects.filter(call => call.table === table);
const selectFrom = (table: MySqlTable) => selectsFrom(table)[0];

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
    rowsByTable.set(tokenTransactions, [{ id: 5 }]); // the fake database ignores where: the ask's spend row, read back for debitTransactionId
    rowsByTable.set(referralAttachments, [{ id: 77 }]);
    const created = await createCompanyReferralRequest(SEEKER, { targetRoleUrl: ROLE_URL, personalPitch: NOTE, attachmentIds: [77], idempotencyKey: "ask-note-projection-0001" });
    expect(created.replayed).toBe(false);
    const written = inserts.filter(entry => entry.table === referralRequests);
    expect(written).toHaveLength(1);
    expect(written[0].values).toMatchObject({ jobSeekerId: SEEKER, personalPitch: NOTE, status: "pending" });
  });

  it("reads the stored note back to its seeker as pitch, scoped to that seeker", async () => {
    rowsByTable.set(referralRequests, [{ id: 501, title: "Role from shared job link", pitch: NOTE, targetRoleUrl: ROLE_URL, companyDomain: "acme.com", jobFunction: null, compensation: null, status: "pending", referrerId: null, waitingForCoverage: false, referrerMessage: null, createdAt: new Date(), updatedAt: new Date(), attachmentCount: 1 }]);
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

describe("referrer-facing reads", () => {
  beforeEach(() => { rowsByTable.set(profiles, [referrerProfile]); });

  it("inbox rows carry no note, even though the enrichment reads it to score the ask", async () => {
    const now = new Date();
    // One open ask at the referrer's company: the list query and the enrichment query (title + note) both run.
    rowsByTable.set(referralRequests, [{ id: 501, targetRoleUrl: ROLE_URL, companyDomain: "acme.com", jobFunction: null, compensation: null, status: "pending", referrerId: null, savedAt: null, createdAt: now, updatedAt: now, attachmentCount: 1, queueAllocationId: null, savedByYouAt: null, title: "Product Designer", pitch: FIT_NOTE }]);
    rowsByTable.set(messages, []);
    const rows = await listCompanyReferralInboxByState(REFERRER, "new");
    const [inbox, enrichment] = selectsFrom(referralRequests);
    expect(exposesNote(inbox)).toBe(false);
    expect(columnsOf(inbox)).toEqual(["attachmentCount", "companyDomain", "compensation", "coverageHeldAt", "coverageVisibleAt", "createdAt", "firstLookReferrerId", "firstLookUntil", "id", "jobFunction", "queueAllocationId", "referrerId", "savedAt", "savedByYouAt", "status", "targetRoleUrl", "updatedAt", "waitingForCoverage"]);
    expect(enrichment).toBeDefined();
    expect(rows).toHaveLength(1);
    // The note reached the scorer (a full fit note, strong ask) ...
    expect(rows[0]).toMatchObject({ id: 501, jobTitle: "Product Designer", fitNoteIncluded: true, askStrength: "strong" });
    // ... but no row field carries it.
    expect(rows[0]).not.toHaveProperty("pitch");
    expect(rows[0]).not.toHaveProperty("personalPitch");
    expect(rows[0]).not.toHaveProperty("candidateMessage");
    expect(JSON.stringify(rows)).not.toContain("approvals product");
  });

  it("the unclaimed preview keeps its current fields, with the note as candidateMessage", async () => {
    rowsByTable.set(referralRequests, []);
    await getUnclaimedCompanyReferralPreview(REFERRER, 501);
    const preview = selectFrom(referralRequests);
    // No seeker name before acceptance (#224); the route strips it as well (privateReferralRoutes.integration.test.ts).
    expect(columnsOf(preview)).toEqual(["candidateMessage", "companyDomain", "id", "jobFunction", "targetRoleUrl", "title"]);
    expect(preview?.projection?.candidateMessage).toBe(referralRequests.personalPitch);
  });

  it("the assigned referrer's detail reads the note and what access needs, and reveals identity only to the accepting referrer", async () => {
    const DAY = 24 * 60 * 60 * 1000;
    const ask = { id: 501, title: "Product Designer", targetRoleUrl: ROLE_URL, companyDomain: "acme.com", jobFunction: null, candidateName: "Avery", candidateMessage: NOTE, referrerId: REFERRER, revision: 2, passId: null };
    rowsByTable.set(referralAttachments, []);
    // Accepted directly before acceptance wrote grants: no grant row, the referrer's own acceptance a day ago (rule (e)).
    rowsByTable.set(referralRequests, [{ ...ask, status: "approved", grantId: null, grantRevokedAt: null, grantExpiresAt: null, acceptedByActorAt: new Date(Date.now() - DAY) }]);
    const detail = await getClaimedCompanyReferralDetail(REFERRER, 501);
    const select = selectFrom(referralRequests);
    // D-019(d) was an omission, not a privacy rule: every verified employee at the
    // company already saw this note in the unclaimed preview, so the accepted
    // referrer's own thread must show it too. Same field name as the preview and
    // the client's detailSchema.
    expect(select?.projection?.candidateMessage).toBe(referralRequests.personalPitch);
    expect(select?.projection?.title).toBe(jobs.title);
    expect(exposesNote(select)).toBe(true);
    expect(columnsOf(select)).toEqual(["acceptedByActorAt", "candidateMessage", "candidateName", "companyDomain", "grantExpiresAt", "grantId", "grantRevokedAt", "id", "jobFunction", "passId", "referrerId", "revision", "status", "targetRoleUrl", "title"]);
    // D-019(e): the ask loads on its assignment alone (a claim writes no grant); no grant condition gates the row.
    const where = select?.where ? dialect.sqlToQuery(select.where) : undefined;
    expect(where?.params).toEqual([501, REFERRER, "pending", "approved", "intro_made", "interview", "offer"]);
    expect(where?.sql).not.toContain("referralDocumentAccessGrants");
    expect(detail).toMatchObject({ id: 501, title: "Product Designer", candidateMessage: NOTE, candidateName: "Avery", documentAccessActive: true });
    for (const internal of ["grantId", "grantRevokedAt", "grantExpiresAt", "passId", "acceptedByActorAt", "grantVersion", "grantRevision"]) expect(detail).not.toHaveProperty(internal);

    // Claimed but pending, holding a claim-era grant: no name and no document access before acceptance.
    rowsByTable.set(referralRequests, [{ ...ask, status: "pending", grantId: 9, grantRevokedAt: null, grantExpiresAt: new Date(Date.now() + DAY), acceptedByActorAt: null }]);
    expect(await getClaimedCompanyReferralDetail(REFERRER, 501)).toMatchObject({ status: "pending", candidateName: null, documentAccessActive: false });

    // Assigned to an accepted ask with no evidence this referrer accepted it: nothing.
    rowsByTable.set(referralRequests, [{ ...ask, status: "approved", grantId: null, grantRevokedAt: null, grantExpiresAt: null, acceptedByActorAt: null }]);
    expect(await getClaimedCompanyReferralDetail(REFERRER, 501)).toBeUndefined();

    // An unexpired claim-era grant is not an acceptance (an administrator approved the claimed ask before ee226f3): nothing.
    rowsByTable.set(referralRequests, [{ ...ask, status: "approved", grantId: 9, grantRevokedAt: null, grantExpiresAt: new Date(Date.now() + DAY), acceptedByActorAt: null }]);
    expect(await getClaimedCompanyReferralDetail(REFERRER, 501)).toBeUndefined();
  });
});
