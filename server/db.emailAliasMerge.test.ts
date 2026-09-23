import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { canonicalEmailAliases, canonicalPeople, identityLinkAudits, users, verifiedLoginAliases } from "../drizzle/schema";
import { resolveLoginIdentity } from "./db";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();
const now = new Date("2026-09-24T00:00:00.000Z");
type Row = Record<string, unknown>;
let rows: Map<unknown, Row[]>;

function tableRows(table: unknown): Row[] {
  const found = rows.get(table);
  if (!found) throw new Error("Unexpected table");
  return found;
}

// Matches drizzle `col = ?` conjunctions, which is all the alias path issues.
function matches(condition: SQL, row: Row): boolean {
  const query = dialect.sqlToQuery(condition);
  const columns = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)` = \?/g)].map(m => m[1]);
  return columns.every((column, index) => row[column] === query.params[index]);
}

function selectBuilder() {
  return { from: (table: unknown) => ({ where: (condition: SQL) => {
    const run = (limit: number) => Promise.resolve(structuredClone(tableRows(table).filter(row => matches(condition, row)).slice(0, limit)));
    return { limit: (limit: number) => Object.assign(run(limit), { for: () => run(limit) }), for: () => run(Number.MAX_SAFE_INTEGER) };
  } }) };
}

function database() {
  const tx = {
    select: () => selectBuilder(),
    insert: (table: unknown) => ({ values: (value: Row) => {
      const list = tableRows(table);
      const inserted = { id: list.length + 100, createdAt: now, ...value };
      list.push(inserted);
      return Object.assign(Promise.resolve([{ insertId: inserted.id }]), { onDuplicateKeyUpdate: () => Promise.resolve([{ insertId: inserted.id }]) });
    } }),
    update: (table: unknown) => ({ set: (patch: Row) => ({ where: async (condition: SQL) => {
      tableRows(table).filter(row => matches(condition, row)).forEach(row => Object.assign(row, patch));
      return [{}];
    } }) }),
  };
  return { select: () => selectBuilder(), transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) };
}

const founder = { id: 6, openId: "workemail_ayodhya@skipwait.me", canonicalPersonId: 5, name: "Ayodhya", email: "ayodhyarammohanthy@gmail.com", loginMethod: "otp_work_email", role: "admin", suspended: false, sessionsValidAfter: now, createdAt: now, updatedAt: now, lastSignedIn: now };
const person = { id: 5, normalizedVerifiedEmail: "ayodhya@skipwait.me", suspended: false, sessionsValidAfter: now, reviewReason: null, createdAt: now, updatedAt: now };
const gmailWorkos = { provider: "workos", subject: "user_gmail", openId: "workos_user_gmail", email: "AyodhyaRamMohanthy@gmail.com ", emailVerified: true, name: "Ayodhya", loginMethod: "workos" };

const db = database();
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  rows = new Map<unknown, Row[]>([
    [users, [structuredClone(founder)]],
    [canonicalPeople, [structuredClone(person)]],
    [verifiedLoginAliases, []],
    [identityLinkAudits, []],
    [canonicalEmailAliases, [{ id: 1, normalizedEmail: "ayodhyarammohanthy@gmail.com", canonicalPersonId: 5, reason: "founder_identity_merge_sep24", createdAt: now }]],
  ]);
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(db);
});
afterEach(() => vi.unstubAllEnvs());

describe("resolveLoginIdentity operator email alias", () => {
  it("signs a verified aliased email into the existing person's account and records the provider alias", async () => {
    const account = await resolveLoginIdentity(gmailWorkos);
    expect(account).toMatchObject({ id: 6, role: "admin" });
    expect(tableRows(canonicalPeople)).toHaveLength(1);
    expect(tableRows(users)).toHaveLength(1);
    expect(tableRows(verifiedLoginAliases)).toEqual([expect.objectContaining({ provider: "workos", subject: "user_gmail", canonicalPersonId: 5, canonicalUserId: 6 })]);
  });

  it("does not use the alias for an unverified email", async () => {
    await resolveLoginIdentity({ ...gmailWorkos, emailVerified: false });
    expect(tableRows(verifiedLoginAliases)[0]).not.toMatchObject({ canonicalUserId: 6 });
  });

  it("blocks when the aliased person is frozen for review", async () => {
    tableRows(canonicalPeople)[0].reviewReason = "multiple_canonical_users";
    await expect(resolveLoginIdentity(gmailWorkos)).rejects.toThrow("IDENTITY_REVIEW_REQUIRED");
  });
});
