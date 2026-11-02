// GO-LIVE-1b-agedout-evidence (D-084): evidence-only test of the pending-reconcile coverage gap.
// A paid Chargebee checkout whose pending row is older than PENDING_MAX_AGE_MS is never listed by the
// reconcile job's real query, so the job never re-reads it, never credits it and never alerts on it.
// Synthetic fixtures only: a recording MySQL client evaluates the job's real rendered query over
// in-memory rows, and the provider is a stub. No runtime change; the repair is a separate proposal.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createChargebeePendingReconcile, listPendingChargebeePayments, PENDING_GRACE_MS, PENDING_MAX_AGE_MS, PENDING_RECHECK_MS, type PendingReconcileDeps } from "./chargebeePendingReconcile";

type FixtureRow = { id: number; provider: string; status: string; providerEventId: string; providerHostedPageId: string; checkoutIntentId: string; amount: number; currency: string; createdAt: Date; lastCheckedAt: Date | null };

// The exact query `listPendingChargebeePayments` renders on main. If it changes, this evidence must be re-read.
const PENDING_QUERY = "select `id`, `providerHostedPageId`, `checkoutIntentId`, `amount`, `currency` from `paymentFulfillments` where (`paymentFulfillments`.`provider` = ? and `paymentFulfillments`.`status` = ? and `paymentFulfillments`.`providerEventId` like ? and `paymentFulfillments`.`createdAt` < ? and `paymentFulfillments`.`createdAt` > ? and (`paymentFulfillments`.`lastCheckedAt` is null or `paymentFulfillments`.`lastCheckedAt` < ?)) order by `paymentFulfillments`.`createdAt` asc, `paymentFulfillments`.`id` asc limit ?";

const state = vi.hoisted(() => ({ rows: [] as FixtureRow[], queries: [] as Array<{ sql: string; params: unknown[] }> }));

const asDate = (value: unknown) => new Date(`${String(value).replace(" ", "T")}Z`);

// Evaluates only the one query above, clause by clause, so the rows returned are what MySQL would return.
function evaluate(sql: string, params: unknown[]) {
  state.queries.push({ sql, params });
  if (sql !== PENDING_QUERY) throw new Error(`unexpected query: ${sql}`);
  const [provider, status, eventPrefix, olderThan, newerThan, recheckBefore, limit] = params;
  const prefix = String(eventPrefix).replace(/%$/, "");
  return state.rows
    .filter(row => row.provider === provider && row.status === status && row.providerEventId.startsWith(prefix))
    .filter(row => row.createdAt.getTime() < asDate(olderThan).getTime() && row.createdAt.getTime() > asDate(newerThan).getTime())
    .filter(row => row.lastCheckedAt === null || row.lastCheckedAt.getTime() < asDate(recheckBefore).getTime())
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)
    .slice(0, Number(limit))
    .map(row => [row.id, row.providerHostedPageId, row.checkoutIntentId, row.amount, row.currency]);
}

vi.mock("drizzle-orm/mysql2", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm/mysql2")>("drizzle-orm/mysql2");
  const run = async (query: { sql: string } | string, params?: unknown[]) => {
    const sql = typeof query === "string" ? query : query.sql;
    return [evaluate(sql, params ?? []), []];
  };
  return { drizzle: () => actual.drizzle({ query: run, execute: run } as never) };
});
vi.mock("mysql2/promise", () => ({ createPool: vi.fn(async () => ({})) }));

const NOW = new Date("2026-10-19T02:00:00Z");
const DAY = 24 * 60 * 60_000;

const pendingRow = (id: number, createdAt: Date): FixtureRow => ({
  id, provider: "chargebee", status: "pending", providerEventId: `pending:${id}`, providerHostedPageId: `hp_${id}`,
  checkoutIntentId: `ci_${id}`, amount: 9900, currency: "INR", createdAt, lastCheckedAt: null,
});

// The provider says every page is paid in full and matches its row: a checkout the job credits whenever it sees it.
function makeDeps() {
  const deps = {
    listPending: listPendingChargebeePayments,
    retrieveHostedPage: vi.fn(async (hostedPageId: string) => {
      const id = hostedPageId.replace("hp_", "");
      return { hostedPageId, invoiceId: `inv_${id}`, passThruContent: `ci_${id}`, amount: 9900, currency: "INR", paid: true };
    }),
    fulfill: vi.fn(async () => ({ status: "credited" })),
    markReview: vi.fn(async () => undefined),
    touch: vi.fn(async () => undefined),
    alert: vi.fn(async () => undefined),
  } satisfies PendingReconcileDeps;
  return deps;
}

const runAt = (deps: PendingReconcileDeps, nowMs: number) => createChargebeePendingReconcile(deps)({ nowMs, windowKey: "agedout-evidence" });

describe("aged-out paid checkout (GO-LIVE-1b-agedout-evidence, D-084)", () => {
  beforeAll(() => { process.env.DATABASE_URL = "mysql://fixture:fixture@localhost/fixture"; });
  beforeEach(() => { state.rows = []; state.queries = []; });

  it("the job's real query bounds createdAt below by now - PENDING_MAX_AGE_MS, inside an all-AND where clause", async () => {
    await runAt(makeDeps(), NOW.getTime());
    expect(state.queries).toHaveLength(1);
    const [{ sql, params }] = state.queries;
    expect(sql).toBe(PENDING_QUERY);
    expect(sql).toContain("`paymentFulfillments`.`createdAt` > ?");
    expect(asDate(params[3]).getTime()).toBe(NOW.getTime() - PENDING_GRACE_MS);
    expect(asDate(params[4]).getTime()).toBe(NOW.getTime() - PENDING_MAX_AGE_MS);
    expect(asDate(params[5]).getTime()).toBe(NOW.getTime() - PENDING_RECHECK_MS);
  });

  it("a paid checkout older than PENDING_MAX_AGE_MS is never re-read, credited, parked or alerted; an in-window one is credited", async () => {
    state.rows = [
      pendingRow(71, new Date(NOW.getTime() - PENDING_MAX_AGE_MS - DAY)), // aged out: paid at the provider
      pendingRow(72, new Date(NOW.getTime() - PENDING_MAX_AGE_MS + DAY)), // control: same row, inside the window
    ];
    const deps = makeDeps();
    const output = await runAt(deps, NOW.getTime());

    expect(deps.retrieveHostedPage.mock.calls).toEqual([["hp_72"]]);
    expect(deps.fulfill).toHaveBeenCalledTimes(1);
    expect(deps.fulfill).toHaveBeenCalledWith(expect.objectContaining({ hostedPageId: "hp_72", passThruContent: "ci_72" }));
    expect(deps.touch).not.toHaveBeenCalled();
    expect(deps.markReview).not.toHaveBeenCalled();
    expect(deps.alert).not.toHaveBeenCalled();
    expect(output).toEqual({ processed: 1, failed: 0 });
  });

  it("the in-window checkout ages out the same way once PENDING_MAX_AGE_MS has passed, with no failure and no alert", async () => {
    const createdAt = new Date(NOW.getTime() - PENDING_MAX_AGE_MS + DAY);
    state.rows = [pendingRow(72, createdAt)];
    const deps = makeDeps();
    const output = await runAt(deps, createdAt.getTime() + PENDING_MAX_AGE_MS + 60_000);

    expect(deps.retrieveHostedPage).not.toHaveBeenCalled();
    expect(deps.fulfill).not.toHaveBeenCalled();
    expect(deps.alert).not.toHaveBeenCalled();
    expect(output).toEqual({ processed: 0, failed: 0 });
  });
});
