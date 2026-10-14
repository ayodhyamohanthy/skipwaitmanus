import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { tokenBalances, users, workItems } from "../drizzle/schema";
import { createWorkItem, updateWorkItem } from "./db";
import { PlanLimitError } from "./planGates";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();
const DAY = 24 * 60 * 60 * 1000;
type Row = Record<string, unknown>;
let tables: { users: Row[]; items: Row[]; wallets: Row[] };
let locks: string[];

function rowsOf(table: unknown): Row[] {
  if (table === users) return tables.users;
  if (table === workItems) return tables.items;
  if (table === tokenBalances) return tables.wallets;
  throw new Error("Unexpected table");
}

function matches(condition: SQLQuery, row: Row): boolean {
  const query = dialect.sqlToQuery(condition);
  const columns = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)` = \?/g)].map(match => match[1]);
  return columns.every((column, index) => {
    const value = row[column];
    const param = query.params[index];
    return typeof value === "boolean" ? value === (param === 1 || param === true) : value === param;
  });
}

function chain(table: unknown, run: () => Row[]) {
  const label = table === users ? "users" : table === workItems ? "workItems" : "wallet";
  return {
    limit: (n: number) => ({ for: async (mode: string) => { locks.push(`${label}:${mode}`); return structuredClone(run().slice(0, n)); }, then: (resolve: (v: unknown) => unknown) => Promise.resolve(structuredClone(run().slice(0, n))).then(resolve) }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(structuredClone(run())).then(resolve),
  };
}

function fixtureDatabase() {
  const select = (projection?: Row) => ({
    from: (table: unknown) => ({
      where: (condition: SQLQuery) => chain(table, () => {
        const rows = rowsOf(table).filter(row => matches(condition, row));
        return projection ? rows.map(row => Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[(column as { name: string }).name]]))) : rows;
      }),
    }),
  });
  const insert = (table: unknown) => ({ values: async (row: Row) => { const rows = rowsOf(table); const id = 100 + rows.length; rows.push({ id, pinned: false, visibleOnProfile: false, kind: "other", ...row }); return [{ insertId: id, affectedRows: 1 }]; } });
  const update = (table: unknown) => ({ set: (patch: Row) => ({ where: async (condition: SQLQuery) => { const hit = rowsOf(table).filter(row => matches(condition, row)); hit.forEach(row => Object.assign(row, patch)); return [{ affectedRows: hit.length }]; } }) });
  const api = { select, insert, update };
  return { ...api, transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(api) };
}

const paidWallet = (userId: number, plan: string): Row => ({ id: userId, userId, role: "job_seeker", plan, subscriptionStatus: "active", subscriptionCurrentTermEnd: new Date(Date.now() + 20 * DAY) });
const item = (userId: number, id: number, pinned = false): Row => ({ id, userId, title: `Piece ${id}`, kind: "project", pinned, visibleOnProfile: true });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  tables = { users: [{ id: 7 }, { id: 8 }], items: [], wallets: [] };
  locks = [];
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("showcase limits read the plan entitlement", () => {
  it("Free holds 3 pieces: the fourth is refused under the owner's row lock", async () => {
    tables.items = [item(7, 1), item(7, 2)];
    expect(await createWorkItem(7, { title: "Third", kind: "project" })).toMatchObject({ userId: 7, title: "Third" });
    expect(locks[0]).toBe("users:update");
    const error = await createWorkItem(7, { title: "Fourth", kind: "project" }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(PlanLimitError);
    expect(error).toMatchObject({ limit: "showcase_pieces", cap: 3 });
    expect(tables.items.filter(row => row.userId === 7)).toHaveLength(3);
  });

  it("counts only the owner's pieces and reads only the owner's plan (cross-user)", async () => {
    tables.wallets = [paidWallet(8, "max")];
    tables.items = [item(8, 1), item(8, 2), item(8, 3), item(8, 4), item(7, 5), item(7, 6)];
    expect(await createWorkItem(7, { title: "Mine", kind: "project" })).toMatchObject({ userId: 7 });
    expect(await createWorkItem(8, { title: "Theirs", kind: "project" })).toMatchObject({ userId: 8 });
    await expect(createWorkItem(7, { title: "Too many", kind: "project" })).rejects.toBeInstanceOf(PlanLimitError);
  });

  it("Free pins 1 piece; an unpin or other edit is never blocked", async () => {
    tables.items = [item(7, 1, true), item(7, 2)];
    await expect(updateWorkItem(7, 2, { pinned: true })).rejects.toMatchObject({ limit: "showcase_pins", cap: 1 });
    expect(tables.items[1].pinned).toBe(false);
    expect(await updateWorkItem(7, 2, { title: "Renamed" })).toMatchObject({ title: "Renamed" });
    expect(await updateWorkItem(7, 1, { pinned: false })).toMatchObject({ pinned: false });
    expect(await updateWorkItem(7, 2, { pinned: true })).toMatchObject({ pinned: true });
    await expect(createWorkItem(7, { title: "Pinned at birth", kind: "project", pinned: true })).rejects.toMatchObject({ limit: "showcase_pins" });
  });

  it("a downgrade keeps every piece and pin already shown and only blocks new ones", async () => {
    tables.items = Array.from({ length: 8 }, (_, index) => item(7, index + 1, index < 4));
    expect(await updateWorkItem(7, 2, { title: "Still editable" })).toMatchObject({ title: "Still editable", pinned: true });
    await expect(createWorkItem(7, { title: "New", kind: "project" })).rejects.toMatchObject({ limit: "showcase_pieces" });
    expect(tables.items).toHaveLength(8);
  });

  it("Momentum has an unlimited showcase and 6 pins; grandfathered Pro keeps the pre-kit 20 pieces", async () => {
    tables.wallets = [paidWallet(7, "momentum")];
    tables.items = Array.from({ length: 25 }, (_, index) => item(7, index + 1, index < 5));
    expect(await createWorkItem(7, { title: "Twenty-sixth", kind: "project" })).toMatchObject({ userId: 7 });
    expect(await updateWorkItem(7, 10, { pinned: true })).toMatchObject({ pinned: true });
    await expect(updateWorkItem(7, 11, { pinned: true })).rejects.toMatchObject({ limit: "showcase_pins", cap: 6 });
    tables.wallets = [paidWallet(7, "pro")];
    tables.items = Array.from({ length: 19 }, (_, index) => item(7, index + 1));
    expect(await createWorkItem(7, { title: "Twentieth", kind: "project" })).toMatchObject({ userId: 7 });
    await expect(createWorkItem(7, { title: "Twenty-first", kind: "project" })).rejects.toMatchObject({ limit: "showcase_pieces", cap: 20 });
  });

  it("never edits another owner's piece", async () => {
    tables.items = [item(8, 1)];
    await expect(updateWorkItem(7, 1, { pinned: true })).rejects.toThrow(/not in your account/);
    expect(tables.items[0].pinned).toBe(false);
  });
});
