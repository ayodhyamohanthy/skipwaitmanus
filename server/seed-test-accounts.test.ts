// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { seedTestAccounts } from "../scripts/seed-test-accounts";
import { profiles, users } from "../drizzle/schema";

function fakeDb() {
  const calls: Array<{ op: string; table?: string }> = [];
  const rows: Record<string, Array<Record<string, unknown>>> = { users: [], profiles: [] };
  const chainable = (result: unknown) => ({
    // deno-lint-ignore no-explicit-any
    from: (_table: any) => ({
      where: (_condition: unknown) => ({
        limit: async () => result,
      }),
    }),
  });
  const tableKey = (table: unknown) => {
    if (table === profiles) return "profiles";
    if (table === users) return "users";
    throw new Error("unexpected table in seed test");
  };
  return {
    calls,
    rows,
    select: vi.fn((_projection?: unknown) => chainable([])),
    insert: vi.fn((table: unknown) => ({
      values: (row: Record<string, unknown>) => {
        const run = async () => {
          const key = tableKey(table);
          calls.push({ op: "insert", table: key });
          const tableRows = rows[key];
          const id = tableRows.length + 1;
          tableRows.push({ id, ...row });
          return [{ affectedRows: 1, insertId: id }];
        };
        return {
          onDuplicateKeyUpdate: vi.fn(() => run()),
          then: (resolve: (v: unknown) => unknown) => run().then(resolve),
        };
      },
    })),
    delete: vi.fn(() => ({ where: vi.fn(async () => { calls.push({ op: "delete" }); return [{ affectedRows: 1 }]; }) })),
  };
}

describe("seed-test-accounts", () => {
  it("creates three marked accounts with profiles and session cookies", async () => {
    const db = fakeDb();
    // First select per account finds nothing (fresh DB); profiles upsert path.
    const logged: string[] = [];
    const seeded = await seedTestAccounts(
      { db: db as never, createSessionToken: async openId => `token-for-${openId}`, log: message => { logged.push(message); } },
      {},
    );
    expect(seeded).toHaveLength(3);
    expect(seeded.map(s => s.openId)).toEqual(["test_seeker_qa", "test_referrer_qa", "test_admin_qa"]);
    expect(seeded.every(s => s.cookie.startsWith("token-for-"))).toBe(true);
    expect(logged.join("\n")).toContain("app_session_id=token-for-test_admin_qa");
    expect(db.rows.users).toHaveLength(3);
    expect(db.rows.users.every(u => (u as { loginMethod?: string }).loginMethod === "test_seed")).toBe(true);
    expect(db.rows.profiles).toHaveLength(2);
    expect(db.calls.filter(c => c.op === "delete")).toHaveLength(0);
  });

  it("resets only the seeded openIds when asked", async () => {
    const db = fakeDb();
    await seedTestAccounts(
      { db: db as never, createSessionToken: async () => "token", log: () => {} },
      { reset: true },
    );
    expect(db.calls.filter(c => c.op === "delete")).toHaveLength(3);
  });
});
