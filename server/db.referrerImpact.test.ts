import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { profiles, referralRequests, referralTransitionEvents } from "../drizzle/schema";
import { getPrivateReferrerImpactSummary } from "./db";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();

type Table = typeof profiles | typeof referralRequests | typeof referralTransitionEvents;
let tables: Record<string, Array<Record<string, unknown>>>;

function rowsFor(table: Table): Array<Record<string, unknown>> {
  if (table === profiles) return tables.profiles;
  if (table === referralRequests) return tables.requests;
  if (table === referralTransitionEvents) return tables.events;
  throw new Error("Unexpected table");
}

function matches(condition: SQLQuery, row: Record<string, unknown>): boolean {
  const query = dialect.sqlToQuery(condition);
  const equals = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)` = \?/g)].map(m => m[1]);
  return equals.every((col, i) => row[col] === query.params[i]);
}

function chainable(selected: () => Array<Record<string, unknown>>) {
  const slice = (n: number) => structuredClone(selected().slice(0, n));
  return {
    limit: (n: number) => ({ for: async (_mode: string) => slice(n), then: (resolve: (v: unknown) => unknown) => Promise.resolve(slice(n)).then(resolve) }),
    for: async (_mode: string) => structuredClone(selected()),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(structuredClone(selected())).then(resolve),
  };
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
  const api = { select };
  return { ...api, transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(api) };
}

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-10-01T00:00:00.000Z").getTime();

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  tables = {
    profiles: [{ id: 1, userId: 9, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date(T0 - 30 * DAY) }],
    requests: [
      { id: 101, status: "approved", referrerId: 9 },
      { id: 102, status: "interview", referrerId: 9 },
      { id: 103, status: "pending", referrerId: 9 },
    ],
    events: [
      { id: 1, referralRequestId: 101, operationKey: "claim:9", actorUserId: 9, action: "claim", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, createdAt: new Date(T0) },
      { id: 2, referralRequestId: 101, operationKey: "approve:9", actorUserId: 9, action: "approve", fromStatus: "pending", resultingStatus: "approved", resultingRevision: 2, createdAt: new Date(T0 + DAY) },
      { id: 3, referralRequestId: 102, operationKey: "claim:9", actorUserId: 9, action: "claim", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, createdAt: new Date(T0) },
      { id: 4, referralRequestId: 102, operationKey: "review:9:approved", actorUserId: 9, action: "review", fromStatus: "pending", resultingStatus: "interview", resultingRevision: 2, createdAt: new Date(T0 + 5 * DAY) },
    ],
  };
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("referrer impact reply latency", () => {
  it("counts decisions within 3 days of the referrer's own claim", async () => {
    const summary = await getPrivateReferrerImpactSummary(9);
    expect(summary).toMatchObject({ reviewed: 3, approved: 2, introductions: 1, interviews: 1, offers: 0 });
    expect(summary.repliedWithin3DaysPct).toBe(50);
  });

  it("returns null with no decisions yet", async () => {
    tables.events = tables.events.filter(e => e.action === "claim");
    const summary = await getPrivateReferrerImpactSummary(9);
    expect(summary.repliedWithin3DaysPct).toBeNull();
  });

  it("ignores other referrers' events and unverified access", async () => {
    tables.events.push({ id: 5, referralRequestId: 101, operationKey: "claim:4", actorUserId: 4, action: "claim", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, createdAt: new Date(T0) });
    const summary = await getPrivateReferrerImpactSummary(9);
    expect(summary.repliedWithin3DaysPct).toBe(50);
    tables.profiles = [];
    await expect(getPrivateReferrerImpactSummary(9)).rejects.toThrow(/verify your company email/i);
  });
});
