// D-049 identity proof: a seeker who signed in with an emailed code and later creates a WorkOS password lands on
// the same canonical account through verified-email linking, and an unverified WorkOS email never links to anyone.
// Exercises resolveLoginIdentity's serialized linking transaction against an in-memory fixture of the three tables.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { canonicalPeople, identityLinkAudits, profiles, users, verifiedLoginAliases } from "../drizzle/schema";
import { resolveLoginIdentity, revokeUserSessions } from "./db";
import { sdk } from "./_core/sdk";
import { waitForSessionEpoch } from "./_core/workosSession";
vi.mock("./_core/env", () => ({ ENV: { appId: "skipwait-test", cookieSecret: "synthetic-session-precision-secret" } }));

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();
const now = new Date("2026-10-18T00:00:00.000Z");
type Row = Record<string, unknown>;
const tables = { users: [] as Row[], people: [] as Row[], aliases: [] as Row[], audits: [] as Row[], profiles: [] as Row[] };
let nextId = 100;

function rowsOf(table: unknown): Row[] {
  if (table === users) return tables.users;
  if (table === canonicalPeople) return tables.people;
  if (table === verifiedLoginAliases) return tables.aliases;
  if (table === identityLinkAudits) return tables.audits;
  if (table === profiles) return tables.profiles;
  throw new Error("Unexpected table");
}

/** Matches drizzle `col = ?`, `col is null` and `col in (?, …)` conditions (joined by `and`) against a row. */
function matches(condition: SQL, row: Row): boolean {
  const query = dialect.sqlToQuery(condition);
  const equals = Array.from(query.sql.matchAll(/`[^`]+`\.`([^`]+)` = \?/g), match => match[1]);
  const nulls = Array.from(query.sql.matchAll(/`[^`]+`\.`([^`]+)` is null/gi), match => match[1]);
  const inMatch = query.sql.match(/`[^`]+`\.`([^`]+)` in \((?:\?,? ?)+\)/i);
  let index = 0;
  for (const column of equals) { if (row[column] !== query.params[index]) return false; index += 1; }
  if (nulls.some(column => row[column] !== null && row[column] !== undefined)) return false;
  const present = Array.from(query.sql.matchAll(/`[^`]+`\.`([^`]+)` is not null/gi), match => match[1]);
  if (present.some(column => row[column] === null || row[column] === undefined)) return false;
  if (inMatch && !(query.params.slice(index) as unknown[]).includes(row[inMatch[1]])) return false;
  return true;
}

function defaultsFor(table: unknown): Row {
  if (table === users) return { suspended: false, role: "user", sessionsValidAfter: now, createdAt: now, updatedAt: now, lastSignedIn: now };
  if (table === canonicalPeople) return { suspended: false, reviewReason: null, sessionsValidAfter: now, createdAt: now, updatedAt: now };
  return { createdAt: now };
}

function fixtureDatabase() {
  const select = (projection?: Record<string, { name: string }>) => ({ from: (table: unknown) => ({ where: (condition: SQL) => {
    const run = (limit: number) => {
      const found = rowsOf(table).filter(row => matches(condition, row)).slice(0, limit);
      return projection ? found.map(row => Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[column.name]]))) : structuredClone(found);
    };
    const bounded = (limit: number) => ({ for: () => Promise.resolve(run(limit)), then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(run(limit)).then(resolve, reject) });
    return { limit: bounded, ...bounded(Number.MAX_SAFE_INTEGER) };
  } }) });
  const insert = (table: unknown) => ({ values: (values: Row) => {
    const write = () => {
      const rows = rowsOf(table);
      // canonicalPeople.normalizedVerifiedEmail is unique: a duplicate insert is a no-op (ON DUPLICATE KEY UPDATE).
      if (table === canonicalPeople && values.normalizedVerifiedEmail && rows.some(row => row.normalizedVerifiedEmail === values.normalizedVerifiedEmail)) return [{ insertId: 0, affectedRows: 0 }];
      const id = nextId++;
      rows.push({ ...defaultsFor(table), ...structuredClone(values), id });
      return [{ insertId: id, affectedRows: 1 }];
    };
    return { onDuplicateKeyUpdate: () => Promise.resolve(write()), then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(write()).then(resolve, reject) };
  } });
  const update = (table: unknown) => ({ set: (patch: Row) => ({ where: async (condition: SQL) => {
    const found = rowsOf(table).filter(row => matches(condition, row));
    found.forEach(row => Object.assign(row, structuredClone(patch)));
    return [{ affectedRows: found.length }];
  } }) });
  const handle = { select, insert, update, transaction: async <T>(work: (tx: unknown) => Promise<T>) => {
    const before = structuredClone(tables);
    try { return await work({ select, insert, update }); }
    catch (error) { Object.assign(tables, before); throw error; }
  } };
  return handle;
}

const database = fixtureDatabase();
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(database);
  nextId = 100;
  // A seeker who only ever signed in with an emailed six-digit code.
  tables.people = [{ id: 3, normalizedVerifiedEmail: "asha@gmail.com", suspended: false, reviewReason: null, sessionsValidAfter: now, createdAt: now, updatedAt: now }];
  tables.users = [{ id: 9, openId: "emailcode_asha@gmail.com", canonicalPersonId: 3, name: "asha", email: "asha@gmail.com", loginMethod: "email_code", role: "user", suspended: false, sessionsValidAfter: now, createdAt: now, updatedAt: now, lastSignedIn: now }];
  tables.aliases = [{ id: 1, provider: "email_code", subject: "asha@gmail.com", openId: "emailcode_asha@gmail.com", canonicalPersonId: 3, canonicalUserId: 9, normalizedVerifiedEmail: "asha@gmail.com", verifiedAt: now, createdAt: now }];
  tables.audits = [];
  tables.profiles = [];
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

const passwordLogin = (overrides: Partial<Parameters<typeof resolveLoginIdentity>[0]> = {}) => ({ provider: "workos", subject: "user_pw", openId: "workos_user_pw", email: " Asha@Gmail.com ", emailVerified: true, name: "Asha", loginMethod: "workos", ...overrides });

describe("a seeker password account resolves to the one canonical person (D-049)", () => {
  it("links a WorkOS-verified email to the code-only seeker's existing account", async () => {
    const account = await resolveLoginIdentity(passwordLogin());
    expect(account.id).toBe(9);
    expect(tables.users).toHaveLength(1);
    expect(tables.aliases).toContainEqual(expect.objectContaining({ provider: "workos", subject: "user_pw", canonicalPersonId: 3, canonicalUserId: 9, normalizedVerifiedEmail: "asha@gmail.com" }));
    expect(tables.audits).toContainEqual(expect.objectContaining({ canonicalPersonId: 3, canonicalUserId: 9, provider: "workos", action: "verified_alias_linked" }));
  });

  it("the next sign-in uses the stored alias and still lands on the same account", async () => {
    await resolveLoginIdentity(passwordLogin());
    const again = await resolveLoginIdentity(passwordLogin());
    expect(again.id).toBe(9);
    expect(tables.aliases.filter(alias => alias.provider === "workos")).toHaveLength(1);
  });

  it("never links on an unverified WorkOS email: that login gets its own isolated account", async () => {
    const account = await resolveLoginIdentity(passwordLogin({ emailVerified: false }));
    expect(account.id).not.toBe(9);
    expect(tables.users).toHaveLength(2);
    expect(tables.aliases).toContainEqual(expect.objectContaining({ provider: "workos", subject: "user_pw", canonicalUserId: account.id, normalizedVerifiedEmail: null }));
    expect(tables.audits).toContainEqual(expect.objectContaining({ action: "unverified_alias_isolated" }));
    expect(tables.people.find(person => person.id === 3)).toEqual(expect.objectContaining({ suspended: false, reviewReason: null }));
  });

  it("refuses a covered work domain before creating a person, alias or audit", async () => {
    tables.profiles = [{ id: 4, userId: 44, workEmailDomain: "acme.test", workEmailVerifiedAt: now }];
    const before = structuredClone(tables);
    await expect(resolveLoginIdentity({ ...passwordLogin(), email: "new@acme.test", passwordLogin: true })).rejects.toThrow("WORK_EMAIL_PASSWORD_REFUSED");
    expect(tables).toEqual(before);
  });

  it("checks the actual provider alias without changing identity state", async () => {
    await resolveLoginIdentity(passwordLogin());
    tables.profiles = [{ id: 4, userId: 9, workEmailDomain: "acme.test", workEmailVerifiedAt: now }];
    const before = structuredClone(tables);
    await expect(resolveLoginIdentity({ ...passwordLogin(), email: "owner@acme.test", passwordLogin: true })).rejects.toThrow("WORK_EMAIL_PASSWORD_REFUSED");
    expect(tables).toEqual(before);
  });

  it("keeps a dual-role person's personal password on the same account", async () => {
    tables.profiles = [{ id: 4, userId: 9, workEmailDomain: "acme.test", workEmailVerifiedAt: now }];
    expect((await resolveLoginIdentity({ ...passwordLogin(), passwordLogin: true })).id).toBe(9);
    expect(tables.users).toHaveLength(1);
  });

  it.each([0, 1, 999])("revokes a real token from the same second at millisecond %i and accepts the fresh reset token", async fraction => {
    vi.useFakeTimers();
    const issued = Date.parse("2026-11-21T12:00:00Z") + fraction;
    vi.setSystemTime(issued);
    const openId = "emailcode_asha@gmail.com";
    const old = await sdk.createSessionToken(openId);
    expect(await sdk.verifySession(old)).not.toBeNull();
    await revokeUserSessions(openId);
    expect(await sdk.verifySession(old)).toBeNull();
    const cutoff = (Math.floor(issued / 1000) + 1) * 1000;
    expect(tables.users[0].sessionsValidAfter).toEqual(new Date(cutoff));
    expect(tables.people[0].sessionsValidAfter).toEqual(new Date(cutoff));
    await waitForSessionEpoch(openId, async delay => { vi.setSystemTime(Date.now() + delay); });
    const fresh = await sdk.createSessionToken(openId);
    expect((await sdk.verifySession(fresh))?.openId).toBe(openId);
    expect(await sdk.verifySession(old)).toBeNull();
  });

  it("refuses a person frozen for review instead of linking a password to it", async () => {
    tables.people[0] = { ...tables.people[0], reviewReason: "ambiguous_historic_verified_email" };
    await expect(resolveLoginIdentity(passwordLogin())).rejects.toThrow("IDENTITY_REVIEW_REQUIRED");
    expect(tables.aliases.some(alias => alias.provider === "workos")).toBe(false);
  });
});
