import { drizzle } from "drizzle-orm/mysql-proxy";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as ReturnType<typeof drizzle> | null }));
vi.mock("./db", () => ({ getDb: async () => state.db }));

import { getBlockedRequestIds, getThreadBlockStatus } from "./blocksRoutes";

type Referral = { id: number; jobSeekerId: number; referrerId: number | null };
type Block = { blockerUserId: number; blockedUserId: number };
type FixtureRow = Referral | Block;
const referrals: Referral[] = [];
const blocks: Block[] = [];
const queries: Array<{ sql: string; params: number[] }> = [];

// Evaluate the small WHERE grammar against fixture records. The real Drizzle
// builder/driver compiles predicates, projection, and LIMIT, not a fluent mock.
function matches(where: string, params: number[], row: FixtureRow): boolean {
  const tokens = where.match(/`[^`]+`|\b(?:and|or|in)\b|[().,=?]/g) ?? [];
  let index = 0;
  let parameter = 0;
  const take = (expected: string) => {
    if (tokens[index++] !== expected) throw new Error(`Expected ${expected} in ${where}`);
  };
  const value = () => { take("?"); return params[parameter++]; };
  const atom = (): boolean => {
    if (tokens[index] === "(") {
      index++;
      const result = disjunction();
      take(")");
      return result;
    }
    let column = tokens[index++];
    if (tokens[index] === ".") { index++; column = tokens[index++]; }
    const name = column.replaceAll("`", "");
    const actual = Object.entries(row).find(([key]) => key === name)?.[1];
    if (tokens[index] === "=") { index++; return actual === value(); }
    take("in"); take("(");
    const values = [value()];
    while (tokens[index] === ",") { index++; values.push(value()); }
    take(")");
    return typeof actual === "number" && values.includes(actual);
  };
  const conjunction = (): boolean => {
    let result = atom();
    while (tokens[index] === "and") { index++; const next = atom(); result = result && next; }
    return result;
  };
  const disjunction = (): boolean => {
    let result = conjunction();
    while (tokens[index] === "or") { index++; const next = conjunction(); result = result || next; }
    return result;
  };
  const result = disjunction();
  if (index !== tokens.length) throw new Error(`Unsupported WHERE ${where}`);
  return result;
}

beforeEach(() => {
  referrals.length = 0; blocks.length = 0; queries.length = 0;
  state.db = drizzle(async (sql, rawParams) => {
    const params = rawParams.map(value => {
      if (typeof value !== "number") throw new Error("Expected numeric query parameter");
      return value;
    });
    queries.push({ sql, params });
    const match = /^select (.+) from `(\w+)` where (.+?)(?: limit \?)?$/.exec(sql);
    if (!match) throw new Error(`Unsupported fixture query ${sql}`);
    const [, projection, table, where] = match;
    const source = table === "referralRequests" ? referrals : table === "userBlocks" ? blocks : undefined;
    if (!source) throw new Error(`Unsupported fixture table ${table}`);
    const columns = [...projection.matchAll(/`(\w+)`/g)].map(column => column[1]);
    const filtered = source.filter(row => matches(where, params, row));
    const limited = sql.endsWith(" limit ?") ? filtered.slice(0, params[params.length - 1]) : filtered;
    return { rows: limited.map(row => columns.map(column => Object.entries(row).find(([key]) => key === column)?.[1])) };
  });
});

describe("real block lookup query coverage", () => {
  it("checks requests after the first 200 in bounded queries", async () => {
    referrals.push(...Array.from({ length: 451 }, (_, i) => ({ id: i + 1, jobSeekerId: 11, referrerId: i + 1000 })));
    blocks.push({ blockerUserId: 11, blockedUserId: 1450 });
    expect(await getBlockedRequestIds(11, referrals.map(row => row.id))).toEqual(new Set([451]));
    expect(queries.filter(query => query.sql.includes("from `referralRequests`"))).toHaveLength(3);
    expect(queries.every(query => query.params.length <= 402)).toBe(true);
  });

  it.each(["outgoing", "incoming"] as const)("finds a %s block beyond 500 unrelated pairs for a single-thread guard", async direction => {
    referrals.push({ id: 601, jobSeekerId: 11, referrerId: 22 });
    blocks.push(...Array.from({ length: 501 }, (_, i) => ({ blockerUserId: 11, blockedUserId: 1000 + i })));
    blocks.push(direction === "outgoing" ? { blockerUserId: 11, blockedUserId: 22 } : { blockerUserId: 22, blockedUserId: 11 });
    expect(await getThreadBlockStatus(11, 601)).toEqual({ blocked: true });
    const query = queries.find(query => query.sql.includes("from `userBlocks`"));
    expect(query?.sql).toContain(" in ");
    expect(query?.params).toEqual([11, 22, 11, 22]);
    expect(query?.sql).not.toContain(" limit ");
  });

  it("preserves both viewer sides and directions without blocking unassigned or unrelated pairs", async () => {
    referrals.push(
      { id: 1, jobSeekerId: 11, referrerId: 22 },
      { id: 2, jobSeekerId: 33, referrerId: 11 },
      { id: 3, jobSeekerId: 11, referrerId: null },
      { id: 4, jobSeekerId: 11, referrerId: 44 },
    );
    blocks.push({ blockerUserId: 11, blockedUserId: 22 }, { blockerUserId: 33, blockedUserId: 11 }, { blockerUserId: 99, blockedUserId: 44 });
    expect(await getBlockedRequestIds(11, [1, 2, 3, 4, 999])).toEqual(new Set([1, 2]));
  });

  it("does not treat a block between unrelated request owners as a viewer block", async () => {
    referrals.push({ id: 701, jobSeekerId: 55, referrerId: 66 });
    blocks.push({ blockerUserId: 55, blockedUserId: 66 }, { blockerUserId: 66, blockedUserId: 55 });
    // This helper filters block relationships only. Callers still own request
    // authorization; an empty result must never be treated as an access grant.
    expect(await getBlockedRequestIds(11, [701])).toEqual(new Set());
    expect(await getThreadBlockStatus(11, 701)).toEqual({ blocked: false });
  });

  it("deduplicates requested IDs and ignores invalid IDs", async () => {
    referrals.push({ id: 601, jobSeekerId: 11, referrerId: 22 });
    blocks.push({ blockerUserId: 11, blockedUserId: 22 });
    expect(await getBlockedRequestIds(11, [0, -1, 1.5, NaN, Infinity, 601, 601])).toEqual(new Set([601]));
    expect(queries[0].params).toEqual([601]);
  });

  it("skips block reads for missing or unassigned requests and skips queries for empty IDs", async () => {
    expect(await getBlockedRequestIds(11, [])).toEqual(new Set());
    expect(queries).toHaveLength(0);
    referrals.push({ id: 1, jobSeekerId: 11, referrerId: null });
    expect(await getBlockedRequestIds(11, [1, 999])).toEqual(new Set());
    expect(queries).toHaveLength(1);
  });

  it("preserves unavailable-database fallback and propagates query failures to the caller", async () => {
    state.db = null;
    expect(await getBlockedRequestIds(11, [1])).toEqual(new Set());
    state.db = drizzle(async () => { throw new Error("fixture database unavailable"); });
    await expect(getBlockedRequestIds(11, [1])).rejects.toThrow();
  });
});
