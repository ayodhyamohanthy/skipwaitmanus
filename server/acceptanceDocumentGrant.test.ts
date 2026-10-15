import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import type { MySqlTable, SelectedFields } from "drizzle-orm/mysql-core";
import { profiles, referralDocumentAccessGrants, referralRequests, referralTransitionEvents } from "../drizzle/schema";
import { oneClickReviewReferralRequest, reviewReferralRequest } from "./db";

/*
 * D-019 referrer basics: acceptance hands the accepting referrer the resume
 * (Terms: "On acceptance ... the Referrer receives the resume"). Before this,
 * only the API-only claim created a document grant, so a referrer who accepted
 * from the queue, the thread or the review email could not open the resume and
 * their thread detail returned 404.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

type FixtureValue = string | number | boolean | Date | null | { readonly [key: string]: FixtureValue };
type Row = { readonly [key: string]: FixtureValue };
type Write = { op: "insert" | "update" | "delete"; table: string; values?: object; upserted?: boolean };

const SEEKER = 7;
const REFERRER = 2;
const REQUEST_ID = 501;

let rowsByTable: Map<MySqlTable, readonly Row[]>;
let writes: Write[];

function project(row: Row, projection: SelectedFields | undefined): Row {
  if (!projection) return row;
  return Object.fromEntries(Object.keys(projection).filter(key => key in row).map(key => [key, row[key]]));
}

/** Answers every select on a table with that table's fixture rows; records writes in order. */
function fixtureDatabase() {
  const select = (projection?: SelectedFields) => {
    let table: MySqlTable | undefined;
    const result = () => (table ? rowsByTable.get(table) ?? [] : []).map(row => project(structuredClone(row), projection));
    const query = {
      from: (from: MySqlTable) => { table = from; return query; },
      innerJoin: () => query, leftJoin: () => query, where: () => query, orderBy: () => query, limit: () => query,
      for: async () => result(),
      then: <T>(resolve: (rows: Row[]) => T, reject?: (error: Error) => T) => Promise.resolve(result()).then(resolve, reject),
    };
    return query;
  };
  const insert = (table: MySqlTable) => ({
    values: (values: object) => {
      const write: Write = { op: "insert", table: getTableName(table), values: structuredClone(values) };
      writes.push(write);
      const done = Promise.resolve([{ insertId: 900 + writes.length, affectedRows: 1 }]);
      return Object.assign(done, { onDuplicateKeyUpdate: async () => { write.upserted = true; return [{ insertId: 0, affectedRows: 1 }]; } });
    },
  });
  const update = (table: MySqlTable) => ({ set: (values: object) => ({ where: async () => { writes.push({ op: "update", table: getTableName(table), values: structuredClone(values) }); return [{ affectedRows: 1 }]; } }) });
  const remove = (table: MySqlTable) => ({ where: async () => { writes.push({ op: "delete", table: getTableName(table) }); return [{ affectedRows: 1 }]; } });
  const api = { select, insert, update, delete: remove };
  return { ...api, transaction: async <T>(run: (tx: typeof api) => Promise<T>): Promise<T> => run(api) };
}

const referrerProfile: Row = { id: 3, userId: REFERRER, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date("2026-09-01T00:00:00Z") };
function askRow(overrides: Partial<Record<"status" | "referrerId" | "revision", FixtureValue>> = {}): Row {
  const request = { id: REQUEST_ID, jobId: 11, jobSeekerId: SEEKER, referrerId: null, status: "pending", revision: 3, personalPitch: "A note.", referrerMessage: null, createdAt: new Date(), ...overrides };
  // One fixture row answers both the full-row select and the { request, companyDomain } join select.
  return { ...request, request, companyDomain: "acme.com" };
}
const grantWrites = () => writes.filter(write => write.table === getTableName(referralDocumentAccessGrants));

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  rowsByTable = new Map([[profiles, [referrerProfile]], [referralRequests, [askRow()]], [referralTransitionEvents, []]]);
  writes = [];
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("acceptance grants the accepting referrer document access", () => {
  it("one-click acceptance writes the grant in the acceptance transaction, after the status change", async () => {
    await expect(oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" })).resolves.toMatchObject({ status: "approved", revision: 4, replayed: false });
    expect(grantWrites()).toEqual([{ op: "insert", table: "referralDocumentAccessGrants", upserted: true, values: expect.objectContaining({ referralRequestId: REQUEST_ID, referrerId: REFERRER, requestRevision: 4, grantVersion: 1 }) }]);
    const order = writes.map(write => `${write.op}:${write.table}`);
    expect(order.indexOf("update:referralRequests")).toBeLessThan(order.indexOf("insert:referralDocumentAccessGrants"));
    expect(order.indexOf("insert:referralDocumentAccessGrants")).toBeLessThan(order.indexOf("insert:referralTransitionEvents"));
    const [grant] = grantWrites();
    const expiresAtMs = grant?.values && "expiresAt" in grant.values && grant.values.expiresAt instanceof Date ? grant.values.expiresAt.getTime() : 0;
    expect(expiresAtMs - Date.now()).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
  });

  it("a replayed acceptance grants nothing twice", async () => {
    rowsByTable.set(referralTransitionEvents, [{ id: 1, referralRequestId: REQUEST_ID, operationKey: `one-click:${REFERRER}:approved`, resultingStatus: "approved", resultingRevision: 4 }]);
    await expect(oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" })).resolves.toMatchObject({ status: "approved", replayed: true });
    expect(grantWrites()).toEqual([]);
  });

  it("a pass grants nothing", async () => {
    await expect(oneClickReviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "declined", declineReason: "timing" })).resolves.toMatchObject({ status: "passed" });
    expect(grantWrites()).toEqual([]);
  });

  it("approving an ask already assigned to this referrer grants it to them too", async () => {
    rowsByTable.set(referralRequests, [askRow({ referrerId: REFERRER })]);
    await expect(reviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "approved" })).resolves.toMatchObject({ status: "approved", revision: 4 });
    expect(grantWrites()).toEqual([expect.objectContaining({ op: "insert", values: expect.objectContaining({ referrerId: REFERRER, requestRevision: 4 }) })]);
  });

  it("a declined review grants nothing (and revokes as before)", async () => {
    rowsByTable.set(referralRequests, [askRow({ referrerId: REFERRER })]);
    await expect(reviewReferralRequest(REFERRER, { requestId: REQUEST_ID, decision: "declined" })).resolves.toMatchObject({ status: "declined" });
    expect(grantWrites().map(write => write.op)).toEqual(["update"]);
  });
});
