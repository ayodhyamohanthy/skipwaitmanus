import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { MySqlDialect, type MySqlTable, type SelectedFields } from "drizzle-orm/mysql-core";
import { assistantApprovals, jobs, messages, profiles, referralAttachments, referralRequests, tokenBalances } from "../drizzle/schema";
import { NO_PERSONAL_NOTE_TEXT } from "../shared/askNote";
import { createCompanyReferralRequest, decideAssistantApproval, getClaimedCompanyReferralDetail, getUnclaimedCompanyReferralPreview, listCompanyReferralInboxByState, listJobSeekerCompanyReferrals } from "./db";

/*
 * D-019 seeker basics, persistence side of askNoteRoundTrip.test.ts: the
 * note is written verbatim to referralRequests.personalPitch and read back to
 * the seeker as `pitch`. Referrer-facing reads are pinned field by field: the
 * inbox list stays note-free, the unclaimed preview carries the note as
 * candidateMessage, and the detail of the ask assigned to a referrer serves
 * the role title and note (D-019(d)); which identity fields and file links
 * leave the server, and when, is pinned at the route in
 * referrerAskPrivacy.test.ts.
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
    rowsByTable.set(referralAttachments, [{ id: 77 }]);
    const created = await createCompanyReferralRequest(SEEKER, { targetRoleUrl: ROLE_URL, personalPitch: NOTE, attachmentIds: [77], idempotencyKey: "ask-note-projection-0001" });
    expect(created.replayed).toBe(false);
    const written = inserts.filter(entry => entry.table === referralRequests);
    expect(written).toHaveLength(1);
    expect(written[0].values).toMatchObject({ jobSeekerId: SEEKER, personalPitch: NOTE, status: "pending" });
  });

  it("an assistant-proposed ask approved without a note stores the shared placeholder", async () => {
    rowsByTable.set(tokenBalances, [wallet]);
    rowsByTable.set(referralAttachments, [{ id: 77 }]);
    rowsByTable.set(assistantApprovals, [{ id: 41, userId: SEEKER, kind: "ask_send", status: "pending", provider: "ChatGPT", note: "   ", targetRoleUrl: ROLE_URL, attachmentIds: "[77]", idempotencyKey: "assistant-ask-note-0001", expiresAt: new Date(Date.now() + 60 * 60 * 1000) }]);
    expect(await decideAssistantApproval(SEEKER, 41, "approved")).toMatchObject({ id: 41, status: "approved" });
    const written = inserts.filter(entry => entry.table === referralRequests);
    expect(written).toHaveLength(1);
    expect(written[0].values).toMatchObject({ jobSeekerId: SEEKER, personalPitch: NO_PERSONAL_NOTE_TEXT });
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
    expect(columnsOf(inbox)).toEqual(["attachmentCount", "companyDomain", "compensation", "createdAt", "id", "jobFunction", "queueAllocationId", "referrerId", "savedAt", "savedByYouAt", "status", "targetRoleUrl", "updatedAt"]);
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

  it("the assigned referrer's detail reads the note, the role title and what document access needs", async () => {
    rowsByTable.set(referralRequests, []);
    await getClaimedCompanyReferralDetail(REFERRER, 501);
    const detail = selectFrom(referralRequests);
    // D-019(d): the accepted referrer's thread shows the seeker's note (it was missing before).
    expect(detail?.projection?.candidateMessage).toBe(referralRequests.personalPitch);
    expect(detail?.projection?.title).toBe(jobs.title);
    expect(exposesNote(detail)).toBe(true);
    expect(columnsOf(detail)).toEqual(["candidateMessage", "candidateName", "companyDomain", "grantExpiresAt", "grantId", "grantRevokedAt", "id", "jobFunction", "passId", "referrerId", "revision", "status", "targetRoleUrl", "title"]);
    // Only the referrer the ask is assigned to, claimed or accepted; a claim needs no grant (it grants none, D-019(e)).
    const where = detail?.where ? dialect.sqlToQuery(detail.where) : undefined;
    expect(where?.sql).toContain("`referralRequests`.`referrerId` = ?");
    expect(where?.params).toEqual([501, REFERRER, "pending", "approved", "intro_made", "interview", "offer"]);
    expect(where?.sql).not.toContain("referralDocumentAccessGrants");
  });

  it("the detail row reports document access by the shared rule and lists the files without storage keys", async () => {
    const accepted = { id: 501, title: "Product Designer", targetRoleUrl: ROLE_URL, companyDomain: "acme.com", jobFunction: null, candidateName: "Avery Lee", candidateMessage: NOTE, referrerId: REFERRER, status: "approved", revision: 4, passId: null };
    rowsByTable.set(referralRequests, [{ ...accepted, grantId: 12, grantRevokedAt: null, grantExpiresAt: new Date(Date.now() - 60_000) }]);
    rowsByTable.set(referralAttachments, [{ id: 77, fileName: "Avery_Lee_Resume.pdf", mimeType: "application/pdf", fileSize: 2048 }]);
    const expired = await getClaimedCompanyReferralDetail(REFERRER, 501);
    expect(expired).toMatchObject({ id: 501, candidateMessage: NOTE, status: "approved", documentAccessActive: false });
    for (const field of ["grantId", "grantRevokedAt", "grantExpiresAt", "passId"]) expect(expired).not.toHaveProperty(field);
    expect(columnsOf(selectFrom(referralAttachments))).toEqual(["fileName", "fileSize", "id", "mimeType"]);
    rowsByTable.set(referralRequests, [{ ...accepted, grantId: 12, grantRevokedAt: null, grantExpiresAt: new Date(Date.now() + 60_000) }]);
    expect(await getClaimedCompanyReferralDetail(REFERRER, 501)).toMatchObject({ documentAccessActive: true });
    // Accepted before acceptance wrote grants: no grant row, access follows the accepted state.
    rowsByTable.set(referralRequests, [{ ...accepted, grantId: null, grantRevokedAt: null, grantExpiresAt: null }]);
    expect(await getClaimedCompanyReferralDetail(REFERRER, 501)).toMatchObject({ documentAccessActive: true });
    // Claimed but pending: never, whatever grant a claim left behind.
    rowsByTable.set(referralRequests, [{ ...accepted, status: "pending", grantId: 12, grantRevokedAt: null, grantExpiresAt: new Date(Date.now() + 60_000) }]);
    expect(await getClaimedCompanyReferralDetail(REFERRER, 501)).toMatchObject({ status: "pending", documentAccessActive: false });
  });
});
