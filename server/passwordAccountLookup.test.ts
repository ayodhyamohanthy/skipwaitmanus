// D-078 ruling 3 (findings S-2, S-3): what SkipWait knows about an email is decided by reads only, before any
// identity write, session revocation, WorkOS call or email. A verified referrer's work email is found whichever way
// that referrer's account was made: a work-email code alias, a WorkOS alias for the same WorkOS user, or a legacy
// account row from before canonical identity. A missing database fails closed (it throws) instead of guessing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { users, verifiedLoginAliases } from "../drizzle/schema";

type Row = Record<string, unknown>;
const fixture = vi.hoisted(() => ({ aliases: [] as Record<string, unknown>[], users: [] as Record<string, unknown>[], domains: new Map<number, string>(), writes: 0, db: true }));
vi.mock("./db", () => ({
  getDb: vi.fn(async () => (fixture.db ? database : undefined)),
  normalizeVerifiedEmail: (email: string) => email.trim().normalize("NFKC").toLowerCase(),
  getVerifiedWorkEmailAccess: vi.fn(async (userId: number) => (fixture.domains.has(userId) ? { workEmailDomain: fixture.domains.get(userId) } : undefined)),
}));
import { passwordEmailStanding } from "./passwordAccountLookup";

const dialect = new MySqlDialect();
function matches(condition: SQL, row: Row): boolean {
  const query = dialect.sqlToQuery(condition);
  let index = 0;
  for (const match of query.sql.matchAll(/(lower\(trim\()?`[^`]+`\.`([^`]+)`(\)\))? = \?/gi)) {
    const value = row[match[2]];
    const actual = match[1] ? String(value ?? "").trim().toLowerCase() : value;
    if (actual !== query.params[index]) return false;
    index += 1;
  }
  return index > 0;
}
const database = {
  select: (projection: Record<string, { name: string }>) => ({ from: (table: unknown) => ({ where: (condition: SQL) => ({ limit: async (limit: number) => {
    const rows = table === verifiedLoginAliases ? fixture.aliases : table === users ? fixture.users : [];
    return rows.filter(row => matches(condition, row)).slice(0, limit).map(row => Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[column.name]])));
  } }) }) }),
  insert: () => { fixture.writes += 1; throw new Error("standing must not write"); },
  update: () => { fixture.writes += 1; throw new Error("standing must not write"); },
  delete: () => { fixture.writes += 1; throw new Error("standing must not write"); },
};

beforeEach(() => {
  fixture.aliases = []; fixture.users = []; fixture.domains.clear(); fixture.writes = 0; fixture.db = true;
});
afterEach(() => { expect(fixture.writes).toBe(0); });

const alias = (overrides: Row) => ({ provider: "workos", subject: "user_x", canonicalUserId: 1, normalizedVerifiedEmail: null, ...overrides });

describe("passwordEmailStanding (read-only)", () => {
  it("finds a referrer who signed in with a work-email code, including a subdomain address", async () => {
    fixture.aliases = [alias({ provider: "work_email_otp", subject: "asha@wipro.com", canonicalUserId: 7, normalizedVerifiedEmail: "asha@wipro.com" }), alias({ provider: "work_email_otp", subject: "ravi@in.wipro.com", canonicalUserId: 8, normalizedVerifiedEmail: "ravi@in.wipro.com" })];
    fixture.domains.set(7, "wipro.com").set(8, "wipro.com");
    expect(await passwordEmailStanding(" Asha@Wipro.com ")).toBe("referrer_work_email");
    expect(await passwordEmailStanding("ravi@in.wipro.com")).toBe("referrer_work_email");
  });

  it("finds a referrer through the WorkOS alias of the same WorkOS user even when that alias holds no email", async () => {
    fixture.aliases = [alias({ subject: "user_ref", canonicalUserId: 9 })];
    fixture.domains.set(9, "wipro.com");
    expect(await passwordEmailStanding("asha@wipro.com")).toBe("unknown");
    expect(await passwordEmailStanding("asha@wipro.com", { workosUserId: "user_ref" })).toBe("referrer_work_email");
  });

  it("finds a referrer on a legacy account row from before canonical identity", async () => {
    fixture.users = [{ id: 12, email: " Asha@Wipro.com" }];
    fixture.domains.set(12, "wipro.com");
    expect(await passwordEmailStanding("asha@wipro.com")).toBe("referrer_work_email");
  });

  it("a personal email of someone who verified a work email elsewhere is not a referrer work email", async () => {
    fixture.aliases = [alias({ subject: "user_x", canonicalUserId: 3, normalizedVerifiedEmail: "asha@gmail.com" })];
    fixture.domains.set(3, "wipro.com");
    expect(await passwordEmailStanding("asha@gmail.com", { workosUserId: "user_x" })).toBe("unknown");
  });

  it("a code-only seeker is a verified seeker; anything else is unknown", async () => {
    fixture.aliases = [alias({ provider: "email_code", subject: "code@gmail.com", canonicalUserId: 4, normalizedVerifiedEmail: "code@gmail.com" })];
    expect(await passwordEmailStanding("code@gmail.com")).toBe("verified_seeker");
    expect(await passwordEmailStanding("nobody@gmail.com")).toBe("unknown");
  });

  it("fails closed without a database instead of answering unknown", async () => {
    fixture.db = false;
    await expect(passwordEmailStanding("asha@wipro.com")).rejects.toThrow();
  });
});
