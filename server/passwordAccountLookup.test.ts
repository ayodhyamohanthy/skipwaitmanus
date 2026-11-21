// D-078 ruling 3 (findings S-2, S-3): what SkipWait knows about an email is decided by reads only, before any
// identity write, session revocation, WorkOS call or email. A verified referrer's work email is found whichever way
// that referrer's account was made: a work-email code alias, a WorkOS alias for the same WorkOS user, or a legacy
// account row from before canonical identity. A missing database fails closed (it throws) instead of guessing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { profiles, users, verifiedLoginAliases } from "../drizzle/schema";

type Row = Record<string, unknown>;
const fixture = vi.hoisted(() => ({ aliases: [] as Record<string, unknown>[], users: [] as Record<string, unknown>[], profiles: [] as Record<string, unknown>[], domains: new Map<number, string>(), writes: 0, db: true }));
vi.mock("./db", () => ({
  getDb: vi.fn(async () => (fixture.db ? database : undefined)),
  normalizeVerifiedEmail: (email: string) => email.trim().normalize("NFKC").toLowerCase(),
  getVerifiedWorkEmailAccess: vi.fn(async (userId: number) => (fixture.domains.has(userId) ? { workEmailDomain: fixture.domains.get(userId) } : undefined)),
}));
import { passwordEmailStanding } from "./passwordAccountLookup";

const dialect = new MySqlDialect();
/** Matches drizzle `col = ?`, `lower(trim(col)) = ?`, `col in (?, …)` and `col is not null`, joined by `and`. */
function matches(condition: SQL, row: Row): boolean {
  const query = dialect.sqlToQuery(condition);
  let index = 0;
  let checked = 0;
  for (const match of query.sql.matchAll(/(lower\(trim\()?`[^`]+`\.`([^`]+)`(\)\))?\s+(= \?|in \(([?, ]+)\)|is not null)/gi)) {
    const value = row[match[2]];
    checked += 1;
    if (/^is not null$/i.test(match[4])) { if (value === null || value === undefined) return false; continue; }
    if (match[5]) {
      const count = match[5].split("?").length - 1;
      const wanted = query.params.slice(index, index + count);
      index += count;
      if (!wanted.includes(value)) return false;
      continue;
    }
    const actual = match[1] ? String(value ?? "").trim().toLowerCase() : value;
    if (actual !== query.params[index]) return false;
    index += 1;
  }
  return checked > 0;
}
const database = {
  select: (projection: Record<string, { name: string }>) => ({ from: (table: unknown) => ({ where: (condition: SQL) => ({ limit: async (limit: number) => {
    const rows = table === verifiedLoginAliases ? fixture.aliases : table === users ? fixture.users : table === profiles ? fixture.profiles : [];
    return rows.filter(row => matches(condition, row)).slice(0, limit).map(row => Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[column.name]])));
  } }) }) }),
  insert: () => { fixture.writes += 1; throw new Error("standing must not write"); },
  update: () => { fixture.writes += 1; throw new Error("standing must not write"); },
  delete: () => { fixture.writes += 1; throw new Error("standing must not write"); },
};

beforeEach(() => {
  fixture.aliases = []; fixture.users = []; fixture.profiles = []; fixture.domains.clear(); fixture.writes = 0; fixture.db = true;
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

  // D-081 (review F-R1): a work email verified inside a seeker account keeps only the company domain on the profile,
  // so no lookup can see that exact address. On the password paths every address at a verified referrer domain is
  // treated as a referrer work email; social sign-in keeps the exact-email rule.
  it("on the password paths, any address at a verified referrer domain is a referrer work email", async () => {
    fixture.aliases = [alias({ subject: "user_g", canonicalUserId: 3, normalizedVerifiedEmail: "asha@gmail.com" })];
    fixture.users = [{ id: 3, email: "asha@gmail.com" }];
    fixture.profiles = [{ id: 30, userId: 3, workEmailDomain: "wipro.com", workEmailVerifiedAt: new Date("2026-10-01T00:00:00Z") }];
    fixture.domains.set(3, "wipro.com");
    for (const email of ["asha@wipro.com", "Someone.Else@Wipro.com", "ravi@in.wipro.com"]) {
      expect(await passwordEmailStanding(email), email).toBe("referrer_work_email");
      expect(await passwordEmailStanding(email, { rule: "password" }), email).toBe("referrer_work_email");
    }
    // Social sign-in keeps the exact-email rule: a seeker's Google account at that company still signs in.
    expect(await passwordEmailStanding("asha@wipro.com", { rule: "social" })).toBe("unknown");
    // Controls: personal-email families are never a referrer domain; an unverified profile domain counts for nothing.
    expect(await passwordEmailStanding("asha@gmail.com")).toBe("unknown");
    fixture.profiles.push({ id: 31, userId: 4, workEmailDomain: "gmail.com", workEmailVerifiedAt: new Date("2026-10-01T00:00:00Z") }, { id: 32, userId: 5, workEmailDomain: "tcs.com", workEmailVerifiedAt: null });
    expect(await passwordEmailStanding("someone@gmail.com")).toBe("unknown");
    expect(await passwordEmailStanding("someone@tcs.com")).toBe("unknown");
    expect(await passwordEmailStanding("someone@notwipro.com")).toBe("unknown");
  });

  it("fails closed without a database instead of answering unknown", async () => {
    fixture.db = false;
    await expect(passwordEmailStanding("asha@wipro.com")).rejects.toThrow();
  });
});
