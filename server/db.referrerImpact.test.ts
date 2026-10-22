import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { profiles, referralRequests, referralTransitionEvents } from "../drizzle/schema";
import { getPrivateReferrerImpactSummary, summarizeReferrerImpact } from "./db";

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

  it("counts a not-fixable pass (pass_release) as the referrer's own decision", async () => {
    // D-035: a not-fixable pass is recorded as pass_release and is a decision the referrer
    // made like any other, so the reply latency must count it exactly like "pass" — otherwise
    // a referrer who passes "not my team" never counts as having replied.
    tables.requests.push({ id: 104, status: "pending", referrerId: 9 });
    tables.events.push(
      { id: 6, referralRequestId: 104, operationKey: "claim:9", actorUserId: 9, action: "claim", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, createdAt: new Date(T0 + 2 * DAY) },
      { id: 7, referralRequestId: 104, operationKey: "one-click:9:declined:role_not_a_fit", actorUserId: 9, action: "pass_release", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 2, createdAt: new Date(T0 + 3 * DAY) },
    );
    const summary = await getPrivateReferrerImpactSummary(9);
    expect(summary).toMatchObject({ reviewed: 4 });
    // Three decisions (approve +1d, pass_release +3d, review +5d); the first two are inside 3 days.
    expect(summary.repliedWithin3DaysPct).toBe(67);
  });

  it("ignores other referrers' events and unverified access", async () => {
    tables.events.push({ id: 5, referralRequestId: 101, operationKey: "claim:4", actorUserId: 4, action: "claim", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, createdAt: new Date(T0) });
    const summary = await getPrivateReferrerImpactSummary(9);
    expect(summary.repliedWithin3DaysPct).toBe(50);
    tables.profiles = [];
    await expect(getPrivateReferrerImpactSummary(9)).rejects.toThrow(/verify your company email/i);
  });
});

describe("referrer impact kit metrics", () => {
  const ask = (id: number, status: string, updatedAtDays = 0) => ({ id, status, companyDomain: "acme.com", updatedAt: new Date(T0 + updatedAtDays * DAY) });
  const base = { milestones: [], threadedRequestIds: [], unreadMessageCount: 0, creditsRemaining: 0 };

  it("counts an introduction from the recorded milestone, not the status it later collapsed into", () => {
    const summary = summarizeReferrerImpact({
      ...base,
      requests: [ask(1, "closed"), ask(2, "approved")],
      milestones: [{ referralRequestId: 1, resultingStatus: "intro_made" }],
    });
    expect(summary).toMatchObject({ acceptedReferrals: 2, introductions: 1, outcomesShared: 0 });
  });

  it("counts each ask once for outcomes shared, however many milestones it collected", () => {
    const summary = summarizeReferrerImpact({
      ...base,
      requests: [ask(1, "offer")],
      milestones: [
        { referralRequestId: 1, resultingStatus: "intro_made" },
        { referralRequestId: 1, resultingStatus: "interview" },
        { referralRequestId: 1, resultingStatus: "offer" },
      ],
    });
    expect(summary).toMatchObject({ introductions: 1, outcomesShared: 1 });
  });

  it("counts an active conversation only while the referral is still running, once per ask", () => {
    const summary = summarizeReferrerImpact({
      ...base,
      requests: [ask(1, "approved"), ask(2, "closed"), ask(3, "pending")],
      threadedRequestIds: [1, 1, 2, 3],
    });
    expect(summary.activeConversations).toBe(1);
  });

  it("keeps the accepted list newest-first and capped at five", () => {
    const summary = summarizeReferrerImpact({ ...base, requests: [0, 1, 2, 3, 4, 5, 6].map(offset => ask(offset, "approved", offset)) });
    expect(summary.recentAccepted.map(row => row.id)).toEqual([6, 5, 4, 3, 2]);
    expect(summary.acceptedReferrals).toBe(7);
  });
});
