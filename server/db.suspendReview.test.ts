import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { canonicalPeople, users, verifiedLoginAliases } from "../drizzle/schema";
import { setUserSuspended } from "./db";

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
    update: (table: unknown) => ({ set: (patch: Record<string, unknown>) => ({ where: async (condition: SQL) => {
      const selected = tableRows(table).filter(row => matches(condition, row));
      selected.forEach(row => Object.assign(row, structuredClone(patch)));
      return [{ affectedRows: selected.length }];
    } }) }),
  };
}

const baseUser: User = { id: 7, openId: "workemail_frozen@company.com", canonicalPersonId: 1, name: "Frozen", email: "frozen@company.com", loginMethod: "otp_work_email", role: "user", suspended: true, sessionsValidAfter: new Date("2026-09-01T00:00:00.000Z"), createdAt: now, updatedAt: now, lastSignedIn: now };
const basePerson: Person = { id: 1, normalizedVerifiedEmail: "frozen@company.com", suspended: true, sessionsValidAfter: new Date("2026-09-01T00:00:00.000Z"), reviewReason: "ambiguous_historic_verified_email", createdAt: now, updatedAt: now };

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  userRows = [structuredClone(baseUser)];
  personRows = [structuredClone(basePerson)];
  aliasRows = [{ id: 1, provider: "work_email_otp", subject: "frozen@company.com", openId: baseUser.openId, canonicalPersonId: 1, canonicalUserId: 7, normalizedVerifiedEmail: "frozen@company.com", verifiedAt: now }];
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => vi.unstubAllEnvs());

describe("setUserSuspended identity-review clearing", () => {
  it("clears the freeze reason when an admin unsuspends, so sign-in works again", async () => {
    await expect(setUserSuspended(7, false)).resolves.toEqual({ userId: 7, suspended: false });
    expect(personRows[0]).toMatchObject({ suspended: false, reviewReason: null });
    expect(userRows[0]).toMatchObject({ suspended: false });
  });

  it("never clears the freeze reason when suspending", async () => {
    userRows[0].suspended = false;
    personRows[0].suspended = false;
    await expect(setUserSuspended(7, true)).resolves.toEqual({ userId: 7, suspended: true });
    expect(personRows[0]).toMatchObject({ suspended: true, reviewReason: "ambiguous_historic_verified_email" });
  });

  it("unsuspends standalone rows without a canonical person", async () => {
    userRows[0].canonicalPersonId = null;
    await expect(setUserSuspended(7, false)).resolves.toEqual({ userId: 7, suspended: false });
    expect(userRows[0]).toMatchObject({ suspended: false });
    expect(personRows[0]).toMatchObject({ suspended: true, reviewReason: "ambiguous_historic_verified_email" });
  });
});
