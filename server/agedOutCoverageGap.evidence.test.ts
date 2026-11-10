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

// A bounded, generic reader of the SQL shape drizzle renders for a single-table select:
//   select `c`, ... from `t` where <expr> order by `t`.`c` asc|desc, ... limit ?
// where <expr> is built from and / or / parentheses over `t`.`c` (= | <> | != | < | <= | > | >=) ?,
// `t`.`c` like ?, and `t`.`c` is [not] null. Placeholders bind in textual order, as drizzle numbers them.
// It never compares the query's text to an expected string (the shape pin above does that, separately),
// so a dropped, flipped or reordered clause is judged only by the rows it returns. Anything outside this
// grammar throws "unsupported SQL" rather than guessing.
type Cmp = "=" | "<>" | "!=" | "<" | "<=" | ">" | ">=";
type Node = { and: Node[] } | { or: Node[] } | { col: string; cmp: Cmp; param: number } | { col: string; like: number } | { col: string; isNull: boolean };

function tokenize(text: string): string[] {
  const tokens = text.match(/`[^`]+`(?:\.`[^`]+`)?|<=|>=|<>|!=|[=<>?()]|[a-z]+/gi) ?? [];
  if (tokens.join("").replace(/\s+/g, "") !== text.replace(/\s+/g, "")) throw new Error(`unsupported SQL: ${text}`);
  return tokens;
}
const column = (token: string | undefined) => {
  const match = token?.match(/^`[^`]+`\.`([^`]+)`$|^`([^`]+)`$/);
  if (!match) throw new Error(`unsupported SQL near: ${token}`);
  return match[1] ?? match[2];
};

function parseWhere(text: string, nextParam: () => number): Node {
  const tokens = tokenize(text);
  let at = 0;
  const peek = () => tokens[at]?.toLowerCase();
  const take = (expected?: string) => {
    const token = tokens[at++];
    if (expected && token?.toLowerCase() !== expected) throw new Error(`unsupported SQL: expected ${expected}, got ${token}`);
    return token;
  };
  const factor = (): Node => {
    if (peek() === "(") { take("("); const inner = expr(); take(")"); return inner; }
    const col = column(take());
    const op = take()?.toLowerCase();
    if (op === "like") { take("?"); return { col, like: nextParam() }; }
    if (op === "is") { const not = peek() === "not"; if (not) take("not"); take("null"); return { col, isNull: !not }; }
    if (op && ["=", "<>", "!=", "<", "<=", ">", ">="].includes(op)) { take("?"); return { col, cmp: op as Cmp, param: nextParam() }; }
    throw new Error(`unsupported SQL operator: ${op}`);
  };
  const term = (): Node => { const parts = [factor()]; while (peek() === "and") { take(); parts.push(factor()); } return parts.length === 1 ? parts[0] : { and: parts }; };
  const expr = (): Node => { const parts = [term()]; while (peek() === "or") { take(); parts.push(term()); } return parts.length === 1 ? parts[0] : { or: parts }; };
  const tree = expr();
  if (at !== tokens.length) throw new Error(`unsupported SQL trailing: ${tokens.slice(at).join(" ")}`);
  return tree;
}

// Row values against bound params: a Date column compares by instant (drizzle sends 'YYYY-MM-DD HH:MM:SS.mmm' UTC).
const comparable = (value: unknown, sample: unknown) => sample instanceof Date ? asDate(value).getTime() : typeof sample === "number" ? Number(value) : String(value);
function holds(node: Node, row: Record<string, unknown>, params: unknown[]): boolean {
  if ("and" in node) return node.and.every(part => holds(part, row, params));
  if ("or" in node) return node.or.some(part => holds(part, row, params));
  if (!(node.col in row)) throw new Error(`unknown column: ${node.col}`);
  const value = row[node.col];
  if ("isNull" in node) return (value === null) === node.isNull;
  if (value === null || value === undefined) return false; // SQL: a comparison with NULL is never true
  if ("like" in node) {
    const pattern = String(params[node.like]).replace(/[.*+^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
    return new RegExp(`^${pattern}$`, "s").test(String(value));
  }
  const left = value instanceof Date ? value.getTime() : value as number | string;
  const right = comparable(params[node.param], value);
  switch (node.cmp) {
    case "=": return left === right;
    case "<>": case "!=": return left !== right;
    case "<": return left < right;
    case "<=": return left <= right;
    case ">": return left > right;
    case ">=": return left >= right;
  }
}

function evaluate(sql: string, params: unknown[]) {
  state.queries.push({ sql, params });
  const shape = sql.match(/^select (.+?) from `(\w+)` where (.+) order by (.+) limit \?$/s);
  if (!shape) throw new Error(`unsupported SQL: ${sql}`);
  const [, columnList, , where, orderList] = shape;
  let bound = 0;
  const tree = parseWhere(where, () => bound++);
  const limit = Number(params[bound++]);
  if (bound !== params.length) throw new Error(`placeholder count ${bound} != params ${params.length}`);
  const columns = columnList.split(",").map(item => column(item.trim()));
  const order = orderList.split(",").map(item => { const [col, dir = "asc"] = item.trim().split(/\s+/); if (!/^(asc|desc)$/i.test(dir)) throw new Error(`unsupported SQL order: ${item}`); return { col: column(col), sign: dir.toLowerCase() === "desc" ? -1 : 1 }; });
  const key = (value: unknown) => value instanceof Date ? value.getTime() : value as number | string;
  return (state.rows as unknown as Array<Record<string, unknown>>)
    .filter(row => holds(tree, row, params))
    .sort((a, b) => { for (const { col, sign } of order) { const x = key(a[col]); const y = key(b[col]); if (x !== y) return (x < y ? -1 : 1) * sign; } return 0; })
    .slice(0, limit)
    .map(row => columns.map(col => row[col]));
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

// #973 review (2026-11-03): the behaviour oracle must not be the query's text. The fixture engine reads
// the rendered SQL by its semantics, so a dropped or flipped clause changes which rows are re-read
// (a behaviour failure), while an equivalent reorder returns the same rows. The text pin above stays
// separate as the shape pin.
describe("the fixture engine reads the query's semantics, not its text (#973 review)", () => {
  beforeEach(() => { state.rows = []; state.queries = []; });
  const params = (nowMs: number) => [
    "chargebee", "pending", "pending:%",
    new Date(nowMs - PENDING_GRACE_MS).toISOString().replace("T", " ").replace("Z", ""),
    new Date(nowMs - PENDING_MAX_AGE_MS).toISOString().replace("T", " ").replace("Z", ""),
    new Date(nowMs - PENDING_RECHECK_MS).toISOString().replace("T", " ").replace("Z", ""),
    50,
  ];
  const AGED = "`paymentFulfillments`.`createdAt` > ?";
  const ids = (rows: unknown[][]) => rows.map(row => row[0]);

  it("an equivalent reorder of the where clause returns the same rows as the real query", () => {
    state.rows = [pendingRow(71, new Date(NOW.getTime() - PENDING_MAX_AGE_MS - DAY)), pendingRow(72, new Date(NOW.getTime() - PENDING_MAX_AGE_MS + DAY))];
    // Swap the two createdAt bounds; the params swap with them, as drizzle numbers them by position.
    const reordered = PENDING_QUERY.replace("`paymentFulfillments`.`createdAt` < ? and `paymentFulfillments`.`createdAt` > ?", "`paymentFulfillments`.`createdAt` > ? and `paymentFulfillments`.`createdAt` < ?");
    expect(reordered).not.toBe(PENDING_QUERY);
    const p = params(NOW.getTime());
    const swapped = [...p.slice(0, 3), p[4], p[3], ...p.slice(5)];
    expect(ids(evaluate(reordered, swapped))).toEqual(ids(evaluate(PENDING_QUERY, p)));
    expect(ids(evaluate(PENDING_QUERY, p))).toEqual([72]);
  });

  it("dropping the createdAt lower bound re-reads the aged-out row; flipping it keeps only the aged-out row", () => {
    state.rows = [pendingRow(71, new Date(NOW.getTime() - PENDING_MAX_AGE_MS - DAY)), pendingRow(72, new Date(NOW.getTime() - PENDING_MAX_AGE_MS + DAY))];
    const p = params(NOW.getTime());
    const dropped = PENDING_QUERY.replace(` and ${AGED}`, "");
    expect(ids(evaluate(dropped, [...p.slice(0, 4), ...p.slice(5)]))).toEqual([71, 72]);
    const flipped = PENDING_QUERY.replace(AGED, "`paymentFulfillments`.`createdAt` < ?");
    expect(ids(evaluate(flipped, p))).toEqual([71]);
  });
});

// Boundary controls at the age limit, in the job's own constant (no new literal age pin): the lower
// bound is strict, so a row exactly PENDING_MAX_AGE_MS old is already out, one second younger is in.
describe("aged-out boundary controls (#973 review)", () => {
  beforeAll(() => { process.env.DATABASE_URL = "mysql://fixture:fixture@localhost/fixture"; });
  beforeEach(() => { state.rows = []; state.queries = []; });
  const reread = async (ageMs: number) => {
    state.rows = [pendingRow(80, new Date(NOW.getTime() - ageMs))];
    const deps = makeDeps();
    const output = await runAt(deps, NOW.getTime());
    return { pages: deps.retrieveHostedPage.mock.calls, output, alerted: deps.alert.mock.calls.length };
  };

  it("exactly PENDING_MAX_AGE_MS old: not re-read, no alert", async () => {
    expect(await reread(PENDING_MAX_AGE_MS)).toEqual({ pages: [], output: { processed: 0, failed: 0 }, alerted: 0 });
  });
  it("one second older than PENDING_MAX_AGE_MS: not re-read, no alert", async () => {
    expect(await reread(PENDING_MAX_AGE_MS + 1_000)).toEqual({ pages: [], output: { processed: 0, failed: 0 }, alerted: 0 });
  });
  it("one second younger than PENDING_MAX_AGE_MS: re-read and credited", async () => {
    expect(await reread(PENDING_MAX_AGE_MS - 1_000)).toEqual({ pages: [["hp_80"]], output: { processed: 1, failed: 0 }, alerted: 0 });
  });
});
