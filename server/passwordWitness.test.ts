// D-078 ruling 5 (S-5): a password counts only after whoever set it proved the inbox. The proof is a
// verifiedLoginAliases row with provider "workos_password" (subject = the WorkOS user id), written when a reset
// confirm succeeds, on the same canonical person and account as that WorkOS user's own alias. Existing tables, no
// migration; the row carries no email and its openId never names a session.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { identityLinkAudits, verifiedLoginAliases } from "../drizzle/schema";

type Row = Record<string, unknown>;
const fixture = vi.hoisted(() => ({ aliases: [] as Record<string, unknown>[], audits: [] as Record<string, unknown>[], db: true, locks: 0 }));
vi.mock("./db", () => ({ getDb: vi.fn(async () => (fixture.db ? database : undefined)) }));
import { PASSWORD_WITNESS_PROVIDER, passwordWitnessStore } from "./passwordWitness";

const dialect = new MySqlDialect();
function matches(condition: SQL, row: Row): boolean {
  const query = dialect.sqlToQuery(condition);
  const columns = Array.from(query.sql.matchAll(/`[^`]+`\.`([^`]+)` = \?/g), match => match[1]);
  return columns.length > 0 && columns.every((column, index) => row[column] === query.params[index]);
}
const rowsOf = (table: unknown) => (table === verifiedLoginAliases ? fixture.aliases : table === identityLinkAudits ? fixture.audits : []);
const select = (projection?: Record<string, { name: string }>) => ({ from: (table: unknown) => ({ where: (condition: SQL) => ({ limit: (limit: number) => {
  const run = () => {
    const found = rowsOf(table).filter(row => matches(condition, row)).slice(0, limit);
    return projection ? found.map(row => Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[column.name]]))) : structuredClone(found);
  };
  return { for: () => { fixture.locks += 1; return Promise.resolve(run()); }, then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject) };
} }) }) });
const insert = (table: unknown) => ({ values: async (values: Row) => { rowsOf(table).push({ id: rowsOf(table).length + 1, ...structuredClone(values) }); return [{ affectedRows: 1 }]; } });
const database = { select, insert, transaction: async <T>(work: (tx: unknown) => Promise<T>) => work({ select, insert }) };

const ownAlias = { provider: "workos", subject: "user_pw", openId: "workos_user_pw", canonicalPersonId: 3, canonicalUserId: 9, normalizedVerifiedEmail: "asha@gmail.com" };
beforeEach(() => { fixture.aliases = [{ id: 1, ...ownAlias }]; fixture.audits = []; fixture.db = true; fixture.locks = 0; });
afterEach(() => vi.clearAllMocks());

describe("the password witness (inbox proven for this WorkOS user's password)", () => {
  it("is written once, on the WorkOS user's own person and account, with no email, under row locks", async () => {
    expect(await passwordWitnessStore.has("user_pw")).toBe(false);
    await passwordWitnessStore.record({ workosUserId: "user_pw" });
    await passwordWitnessStore.record({ workosUserId: "user_pw" });
    const witnesses = fixture.aliases.filter(row => row.provider === PASSWORD_WITNESS_PROVIDER);
    expect(PASSWORD_WITNESS_PROVIDER).toBe("workos_password");
    expect(witnesses).toEqual([expect.objectContaining({ provider: "workos_password", subject: "user_pw", openId: "workospw_user_pw", canonicalPersonId: 3, canonicalUserId: 9, normalizedVerifiedEmail: null, verifiedAt: expect.any(Date) })]);
    expect(fixture.audits).toEqual([expect.objectContaining({ canonicalPersonId: 3, canonicalUserId: 9, provider: "workos_password", subject: "user_pw", action: "password_inbox_proven" })]);
    expect(fixture.locks).toBeGreaterThan(0);
    expect(await passwordWitnessStore.has("user_pw")).toBe(true);
    expect(await passwordWitnessStore.has("user_other")).toBe(false);
  });

  it("refuses to write without the WorkOS user's own alias, or onto another person's witness", async () => {
    await expect(passwordWitnessStore.record({ workosUserId: "user_unknown" })).rejects.toThrow("PASSWORD_WITNESS_WITHOUT_ACCOUNT");
    fixture.aliases.push({ id: 2, provider: "workos_password", subject: "user_pw", openId: "workospw_user_pw", canonicalPersonId: 4, canonicalUserId: 10, normalizedVerifiedEmail: null });
    await expect(passwordWitnessStore.record({ workosUserId: "user_pw" })).rejects.toThrow("PASSWORD_WITNESS_CONFLICT");
    expect(fixture.audits).toEqual([]);
  });

  it("fails closed without a database", async () => {
    fixture.db = false;
    await expect(passwordWitnessStore.has("user_pw")).rejects.toThrow();
    await expect(passwordWitnessStore.record({ workosUserId: "user_pw" })).rejects.toThrow();
  });
});
