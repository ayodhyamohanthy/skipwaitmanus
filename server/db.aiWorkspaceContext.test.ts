import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type Table } from "drizzle-orm";
import { getAiWorkspaceContext } from "./db";

// P0-referrer-exposure: the AI workspace context feeds a third-party model and its
// reply goes back to the member, so it must never carry another person's referrer row.
const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const memberProfile = { id: 7, userId: 12, accountType: "job_seeker", headline: "Product Designer", skills: "Figma", experience: null };
// A referrer who never accepted anything from this member.
const referrer = { userId: 41, name: "zoya.quill", company: "quasar-ledgers.com", title: "Principal Payments Engineer", location: "Lisbon", expertise: "ledger reconciliation", capacity: 3, headline: "Payments at Quasar" };

/**
 * A read-only stand-in for drizzle: the member's own profile for a plain profiles
 * read, the referrer row for any read that joins accounts onto profiles (the
 * referrer directory), and nothing for every other table.
 */
function fakeDatabase() {
  return {
    select: () => ({
      from: (table: Table) => {
        const joins: string[] = [];
        const rows = () => (getTableName(table) !== "profiles" ? [] : joins.includes("users") ? [referrer] : [memberProfile]);
        const query = {
          innerJoin: (joined: Table) => { joins.push(getTableName(joined)); return query; },
          leftJoin: (joined: Table) => { joins.push(getTableName(joined)); return query; },
          where: () => query,
          orderBy: () => query,
          groupBy: () => query,
          limit: () => query,
          then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(rows()).then(resolve, reject),
        };
        return query;
      },
    }),
  };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fakeDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("AI workspace context", () => {
  it("carries the member's own context and no referrer row, even while referrers exist", async () => {
    const context = await getAiWorkspaceContext(12);
    expect(context.profile).toMatchObject({ userId: 12, headline: "Product Designer" });
    expect(context.referrers).toEqual([]);
    expect(JSON.stringify(context)).not.toMatch(/zoya|quill|quasar|Principal Payments|ledger reconciliation|Lisbon|"userId":41/i);
  });
});
