// FIX-founder-admin-role (D-400): a provider-verified administrator email is an administrator on every sign-in, not
// only when its account was created. The founder's account predates D-400 and kept the `user` role, so every admin
// route refused it (owner report, Nov 26 2026). Promote only: never demote, never on an unverified email.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { canonicalPeople, users, verifiedLoginAliases } from "../drizzle/schema";
import { resolveLoginIdentity } from "./db";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();
const now = new Date("2026-09-22T00:00:00.000Z");

type User = typeof users.$inferSelect;
type Person = typeof canonicalPeople.$inferSelect;
type Alias = typeof verifiedLoginAliases.$inferSelect;

let userRows: User[];
let personRows: Person[];
let aliasRows: Alias[];

function tableRows(table: unknown): Array<Record<string, unknown>> {
  if (table === users) return userRows as Array<Record<string, unknown>>;
  if (table === canonicalPeople) return personRows as Array<Record<string, unknown>>;
  if (table === verifiedLoginAliases) return aliasRows as Array<Record<string, unknown>>;
  throw new Error("Unexpected table");
}

// Matches drizzle `col = ?` and `col IN (?, …)` conditions against a row.
function matches(condition: SQL, row: Record<string, unknown>): boolean {
  const query = dialect.sqlToQuery(condition);
  const equals = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)` = \?/g)].map(m => m[1]);
  const inMatch = query.sql.match(/`[^`]+`\.`([^`]+)` in \((?:\?,? ?)+\)/i);
  let paramIndex = 0;
  for (const column of equals) {
    if (row[column] !== query.params[paramIndex]) return false;
    paramIndex += 1;
  }
  if (inMatch) {
    const remaining = query.params.slice(paramIndex) as unknown[];
    if (!remaining.includes(row[inMatch[1]])) return false;
  }
  return true;
}

function fixtureDatabase() {
  return {
    select: (projection?: Record<string, unknown>) => ({ from: (table: unknown) => ({ where: (condition: SQL) => {
      const run = (limit: number) => {
        const selected = tableRows(table).filter(row => matches(condition, row)).slice(0, limit);
        if (projection) return selected.map(row => Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[(column as { name: string }).name]])));
        return structuredClone(selected);
      };
      return {
        limit: (limit: number) => Promise.resolve(run(limit)),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(run(Number.MAX_SAFE_INTEGER)).then(resolve),
      };
    } }) }),
    transaction: vi.fn(async () => { throw new Error("locking transaction used"); }),
    update: (table: unknown) => ({ set: (patch: Record<string, unknown>) => ({ where: async (condition: SQL) => {
      const selected = tableRows(table).filter(row => matches(condition, row));
      selected.forEach(row => Object.assign(row, structuredClone(patch)));
      return [{ affectedRows: selected.length }];
    } }) }),
  };
}

const baseUser: User = { id: 9, openId: "workos_user_canonical", canonicalPersonId: 3, name: "Canon", email: "canon@example.com", loginMethod: "workos", role: "user", suspended: false, sessionsValidAfter: new Date("2026-09-01T00:00:00.000Z"), createdAt: now, updatedAt: now, lastSignedIn: now } as User;
const basePerson: Person = { id: 3, normalizedVerifiedEmail: "canon@example.com", suspended: false, sessionsValidAfter: new Date("2026-09-10T00:00:00.000Z"), reviewReason: null, createdAt: now, updatedAt: now };
const input = { provider: "workos", subject: "user_second", openId: "workos_user_second", email: "canon@example.com", emailVerified: true, name: "Canon", loginMethod: "workos" };

// getDb caches the first handle, so every test shares one fixture database.
const database = fixtureDatabase();
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  userRows = [structuredClone(baseUser)];
  personRows = [structuredClone(basePerson)];
  aliasRows = [{ id: 1, provider: "workos", subject: "user_second", openId: "workos_user_second", canonicalPersonId: 3, canonicalUserId: 9, normalizedVerifiedEmail: "canon@example.com", verifiedAt: now }];
  database.transaction.mockClear();
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(database);
});
afterEach(() => vi.unstubAllEnvs());

const founder = { ...input, email: "ayodhya@skipwait.me" };
const seed = (email: string, role: "user" | "admin") => {
  userRows = [{ ...structuredClone(baseUser), email, role }];
  personRows = [{ ...structuredClone(basePerson), normalizedVerifiedEmail: email }];
  aliasRows = [{ ...aliasRows[0], normalizedVerifiedEmail: email }];
};

describe("FIX-founder-admin-role: administrator role on every verified sign-in (D-400)", () => {
  it("promotes the founder's returning account from user to admin, in the row and the returned account", async () => {
    seed("ayodhya@skipwait.me", "user");
    const account = await resolveLoginIdentity(founder);
    expect(account.role).toBe("admin");
    expect(userRows[0].role).toBe("admin");
  });

  it("promotes the configured administrator seat too", async () => {
    vi.stubEnv("SKIPWAIT_ADMIN_EMAIL", "admin@skipwait.me");
    seed("admin@skipwait.me", "user");
    expect((await resolveLoginIdentity({ ...input, email: "admin@skipwait.me" })).role).toBe("admin");
  });

  it("never promotes on an email the provider did not verify", async () => {
    seed("ayodhya@skipwait.me", "user");
    expect((await resolveLoginIdentity({ ...founder, emailVerified: false })).role).toBe("user");
    expect(userRows[0].role).toBe("user");
  });

  it("leaves every other address exactly as stored", async () => {
    seed("canon@example.com", "user");
    expect((await resolveLoginIdentity(input)).role).toBe("user");
    expect(userRows[0].role).toBe("user");
  });

  it("never demotes an existing administrator", async () => {
    seed("canon@example.com", "admin");
    expect((await resolveLoginIdentity(input)).role).toBe("admin");
    expect(userRows[0].role).toBe("admin");
  });
});
