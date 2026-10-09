import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { notifications, seekerAlerts, tokenBalances } from "../drizzle/schema";
import { createSeekerAlert, deleteSeekerAlert, listSeekerAlerts, notifySeekerAlertsForCompany, setSeekerAlertPaused } from "./db";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();
const NOW = new Date("2026-10-09T12:00:00.000Z");

type Table = typeof seekerAlerts | typeof tokenBalances | typeof notifications;
let tables: Record<string, Array<Record<string, unknown>>>;

function rowsFor(table: Table): Array<Record<string, unknown>> {
  if (table === seekerAlerts) return tables.alerts;
  if (table === tokenBalances) return tables.wallets;
  if (table === notifications) return tables.notes;
  throw new Error("Unexpected table");
}

function matches(condition: SQLQuery, row: Record<string, unknown>): boolean {
  const query = dialect.sqlToQuery(condition);
  const tokens = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)`\s*(=|is null|is not null)/gi)];
  let i = 0;
  for (const token of tokens) {
    const col = token[1];
    const op = token[2].toLowerCase();
    if (op === "is null") {
      if (row[col] !== null && row[col] !== undefined) return false;
      continue;
    }
    if (op === "is not null") {
      if (row[col] === null || row[col] === undefined) return false;
      continue;
    }
    if (row[col] !== query.params[i++]) return false;
  }
  return true;
}

function chainable(selected: () => Array<Record<string, unknown>>) {
  const slice = (n: number) => structuredClone(selected().slice(0, n));
  const self = {
    orderBy: (..._cols: unknown[]) => self,
    limit: (n: number) => ({ for: async (_mode: string) => slice(n), then: (resolve: (v: unknown) => unknown) => Promise.resolve(slice(n)).then(resolve) }),
    for: async (_mode: string) => structuredClone(selected()),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(structuredClone(selected())).then(resolve),
  };
  return self;
}

function fixtureDatabase() {
  const select = (projection?: Record<string, unknown>) => ({
    from: (table: Table) => ({
      where: (condition: SQLQuery) => {
        const run = () => {
          const selected = rowsFor(table).filter(row => matches(condition, row));
          if (projection) return selected.map(row => Object.fromEntries(Object.entries(projection).map(([k, c]) => [k, row[(c as { name: string }).name]])));
          return selected;
        };
        return chainable(run);
      },
    }),
  });
  const update = (table: Table) => ({
    set: (patch: Record<string, unknown>) => ({
      where: async (condition: SQLQuery) => {
        const selected = rowsFor(table).filter(row => matches(condition, row));
        selected.forEach(row => {
          for (const [key, value] of Object.entries(patch)) row[key] = structuredClone(value);
        });
        return [{ affectedRows: selected.length }];
      },
    }),
  });
  const insert = (table: Table) => ({
    values: (row: Record<string, unknown> | Array<Record<string, unknown>>) => {
      const input = (Array.isArray(row) ? row[0] : row) as Record<string, unknown>;
      if (table === seekerAlerts && rowsFor(table).some(r => r.userId === input.userId && r.companyDomain === input.companyDomain)) {
        throw Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
      }
      const rows = rowsFor(table);
      const id = rows.length + 1;
      const defaults = table === seekerAlerts ? { paused: false, notifiedAt: null, createdAt: NOW } : {};
      rows.push({ id, ...defaults, ...structuredClone(input) });
      const done = Promise.resolve([{ affectedRows: 1, insertId: id }]);
      return Object.assign(done, { onDuplicateKeyUpdate: async () => [{ affectedRows: 1, insertId: 0 }] });
    },
  });
  const del = (table: Table) => ({
    where: async (condition: SQLQuery) => {
      const rows = rowsFor(table);
      const keep = rows.filter(row => !matches(condition, row));
      const removed = rows.length - keep.length;
      rows.splice(0, rows.length, ...keep);
      return [{ affectedRows: removed }];
    },
  });
  const api = { select, update, insert, delete: del };
  return { ...api, transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(api) };
}

const walletRow = (plan: string) => ({ id: 1, userId: 7, role: "job_seeker" as const, balance: 0, monthlyCreditsRemaining: 3, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan, subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, updatedAt: NOW });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  tables = { alerts: [], wallets: [walletRow("free")], notes: [] };
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("seeker alerts", () => {
  it("creates, lists, and rejects duplicates and bad domains", async () => {
    const created = await createSeekerAlert(7, { companyDomain: "Acme.COM " });
    expect(created).toMatchObject({ userId: 7, companyDomain: "acme.com", paused: false });
    await expect(createSeekerAlert(7, { companyDomain: "acme.com" })).rejects.toThrow(/already watch/);
    await expect(createSeekerAlert(7, { companyDomain: "not a domain" })).rejects.toThrow(/valid company domain/);
    expect((await listSeekerAlerts(7)).map(a => a.companyDomain)).toEqual(["acme.com"]);
    expect(await listSeekerAlerts(8)).toEqual([]);
  });

  it("caps free accounts at 3, paid unlimited", async () => {
    tables.alerts = [
      { id: 1, userId: 7, companyDomain: "a.com", paused: false, notifiedAt: null, createdAt: NOW },
      { id: 2, userId: 7, companyDomain: "b.com", paused: false, notifiedAt: null, createdAt: NOW },
      { id: 3, userId: 7, companyDomain: "c.com", paused: false, notifiedAt: null, createdAt: NOW },
    ];
    await expect(createSeekerAlert(7, { companyDomain: "d.com" })).rejects.toThrow(/3 alerts/);
    tables.wallets = [walletRow("pro")];
    const created = await createSeekerAlert(7, { companyDomain: "d.com" });
    expect(created.companyDomain).toBe("d.com");
  });

  it("pauses, resumes, and deletes with ownership enforcement", async () => {
    tables.alerts = [{ id: 1, userId: 7, companyDomain: "a.com", paused: false, notifiedAt: null, createdAt: NOW }];
    expect((await setSeekerAlertPaused(7, 1, true)).paused).toBe(true);
    expect((await setSeekerAlertPaused(7, 1, false)).paused).toBe(false);
    await expect(setSeekerAlertPaused(8, 1, true)).rejects.toThrow(/not in your account/);
    expect(await deleteSeekerAlert(7, 1)).toMatchObject({ deleted: true, id: 1 });
    await expect(deleteSeekerAlert(7, 1)).rejects.toThrow(/not in your account/);
  });

  it("notifies unpaused unnotified watchers exactly once", async () => {
    tables.alerts = [
      { id: 1, userId: 7, companyDomain: "acme.com", paused: false, notifiedAt: null, createdAt: NOW },
      { id: 2, userId: 8, companyDomain: "acme.com", paused: true, notifiedAt: null, createdAt: NOW },
      { id: 3, userId: 9, companyDomain: "acme.com", paused: false, notifiedAt: new Date("2026-10-01T00:00:00.000Z"), createdAt: NOW },
      { id: 4, userId: 7, companyDomain: "other.com", paused: false, notifiedAt: null, createdAt: NOW },
    ];
    expect(await notifySeekerAlertsForCompany("acme.com", NOW)).toEqual({ notified: 1 });
    expect(tables.notes).toHaveLength(1);
    expect(tables.notes[0]).toMatchObject({ userId: 7, category: "status", eventKey: "alert-coverage:1" });
    expect(String(tables.notes[0].title)).toContain("acme.com");
    expect(await notifySeekerAlertsForCompany("acme.com", NOW)).toEqual({ notified: 0 });
    expect(await notifySeekerAlertsForCompany("not-a-domain!!", NOW)).toEqual({ notified: 0 });
  });
});
