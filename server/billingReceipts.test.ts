import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { paymentFulfillments } from "../drizzle/schema";
import { listMyPaymentReceipts } from "./db";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();

type Table = typeof paymentFulfillments;
let tables: Record<string, Array<Record<string, unknown>>>;

function matches(condition: SQLQuery, row: Record<string, unknown>): boolean {
  const query = dialect.sqlToQuery(condition);
  const equals = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)` = \?/g)].map(m => m[1]);
  let i = 0;
  for (const col of equals) {
    if (row[col] !== query.params[i++]) return false;
  }
  const inMatch = query.sql.match(/`[^`]+`\.`([^`]+)` in \((?:\?,? ?)+\)/i);
  if (inMatch && !(query.params.slice(i) as unknown[]).includes(row[inMatch[1]])) return false;
  return true;
}

function orderDesc<T extends Record<string, unknown>>(rows: T[], sql: string): T[] {
  const col = sql.match(/order by `[^`]+`\.`([^`]+)` desc/i)?.[1];
  if (!col) return rows;
  return [...rows].sort((a, b) => {
    const left = a[col] instanceof Date ? (a[col] as Date).getTime() : Number(a[col]);
    const right = b[col] instanceof Date ? (b[col] as Date).getTime() : Number(b[col]);
    return right - left;
  });
}

function fixtureDatabase() {
  const select = (projection?: Record<string, unknown>) => ({
    from: (table: Table) => ({
      where: (condition: SQLQuery) => {
        const run = () => {
          const selected = tables.payments.filter(row => matches(condition, row));
          if (projection) return selected.map(row => Object.fromEntries(Object.entries(projection).map(([k, c]) => [k, row[(c as { name: string }).name]])));
          return selected;
        };
        const limited = (n: number, order?: SQLQuery) => {
          const rows = order ? orderDesc(run(), dialect.sqlToQuery(order).sql) : run();
          return structuredClone(rows.slice(0, n));
        };
        return {
          orderBy: (order: SQLQuery) => ({ limit: async (n: number) => limited(n, order) }),
          limit: async (n: number) => limited(n),
        };
      },
    }),
  });
  const api = { select };
  return { ...api, transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(api) };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  tables = {
    payments: [
      { id: 1, provider: "chargebee", userId: 7, role: "job_seeker", tokenCount: 10, amount: 59900, currency: "INR", status: "credited", providerInvoiceId: "inv-1", createdAt: new Date("2026-09-06T00:00:00.000Z") },
      { id: 2, provider: "chargebee", userId: 7, role: "job_seeker", tokenCount: 10, amount: 59900, currency: "INR", status: "refunded", providerInvoiceId: "inv-0", createdAt: new Date("2026-08-06T00:00:00.000Z") },
      { id: 3, provider: "chargebee", userId: 7, role: "job_seeker", tokenCount: 10, amount: 59900, currency: "INR", status: "pending", providerInvoiceId: null, createdAt: new Date("2026-10-01T00:00:00.000Z") },
      { id: 4, provider: "chargebee", userId: 8, role: "job_seeker", tokenCount: 10, amount: 59900, currency: "INR", status: "credited", providerInvoiceId: "inv-9", createdAt: new Date("2026-09-06T00:00:00.000Z") },
    ],
  };
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("seeker payment receipts", () => {
  it("lists only settled receipts for the requester, newest first", async () => {
    const receipts = await listMyPaymentReceipts(7, "job_seeker");
    expect(receipts.map(r => r.id)).toEqual([1, 2]);
    expect(receipts[0]).toMatchObject({ provider: "chargebee", amount: 59900, currency: "INR", status: "credited" });
  });

  it("serves receipts over HTTP with auth and role gating", async () => {
    const app = express();
    app.use(express.json());
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => (req.header("x-test-user") ? { account: { id: 7, openId: "workos-seeker" } } : undefined),
      listMyPaymentReceipts: async () => [{ id: 1, status: "credited" }],
    } as unknown as PrivateReferralRouteDeps);
    expect((await request(app).get("/api/billing/receipts")).status).toBe(401);
    const response = await request(app).get("/api/billing/receipts?role=referrer").set("x-test-user", "seeker");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ receipts: [{ id: 1, status: "credited" }] });
  });
});
