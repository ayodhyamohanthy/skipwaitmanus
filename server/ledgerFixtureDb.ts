// In-memory MySQL stand-in for the credit-ledger tests (server/db.creditLedger*.test.ts,
// server/db.paymentReview.test.ts). It evaluates the drizzle predicates the ledger
// paths use (=, <>, <, <=, >, >=, IS [NOT] NULL, [NOT] IN, AND), orders and limits,
// enforces the unique keys the ledger relies on for idempotency, applies the
// `column + ?` / `column - ?` increments the wallet paths write, runs
// INSERT ... ON DUPLICATE KEY UPDATE against the colliding row, and rolls a failed
// transaction back. Any other SQL expression throws instead of being guessed. The
// tables object keeps its identity (reset and rollback replace its arrays), so a
// test can hold it while the server's cached db handle reads the same rows.
import { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { notifications, operationalActivityLogs, paymentFulfillments, planCreditGrants, promoCreditGrants, referralRequests, subscriptionCheckoutIntents, subscriptionEvents, tokenBalances, tokenTransactions, users } from "../drizzle/schema";

export type Row = Record<string, unknown>;
export const LEDGER_TABLE_NAMES = ["wallets", "txns", "grants", "promo", "notes", "users", "events", "intents", "activity", "requests", "payments"] as const;
export type LedgerTableName = (typeof LEDGER_TABLE_NAMES)[number];
export type LedgerTables = Record<LedgerTableName, Row[]>;

const dialect = new MySqlDialect();
const TABLES = new Map<unknown, LedgerTableName>([[tokenBalances, "wallets"], [tokenTransactions, "txns"], [planCreditGrants, "grants"], [promoCreditGrants, "promo"], [notifications, "notes"], [users, "users"], [subscriptionEvents, "events"], [subscriptionCheckoutIntents, "intents"], [operationalActivityLogs, "activity"], [referralRequests, "requests"], [paymentFulfillments, "payments"]]);
/** The unique keys of drizzle/schema.ts the ledger and payment paths rely on (a NULL member never collides, as in MySQL). */
const UNIQUE_KEYS: Partial<Record<LedgerTableName, readonly (readonly string[])[]>> = {
  txns: [["userId", "role", "idempotencyKey", "kind"], ["userId", "role", "kind", "referenceType", "referenceId"]],
  grants: [["grantKey"]],
  wallets: [["userId", "role"]],
  events: [["provider", "providerEventId"]],
  notes: [["eventKey"]],
  payments: [["provider", "providerEventId"]],
};

export function createLedgerFixture() {
  const tables: LedgerTables = { wallets: [], txns: [], grants: [], promo: [], notes: [], users: [], events: [], intents: [], activity: [], requests: [], payments: [] };
  /** Replaces every table's rows in place; a table left out is emptied. */
  const reset = (next: Partial<LedgerTables>) => { for (const name of LEDGER_TABLE_NAMES) tables[name] = next[name] ?? []; };
  const rowsOf = (table: unknown) => { const name = TABLES.get(table); if (!name) throw new Error("Unexpected table"); return tables[name]; };

  const asValue = (value: unknown) => {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) return Date.parse(`${value.replace(" ", "T")}Z`);
    return value;
  };

  function matches(condition: SQL | undefined, row: Row): boolean {
    if (!condition) return true;
    const query = dialect.sqlToQuery(condition);
    if (/\bor\b/i.test(query.sql)) throw new Error(`OR predicates are not modelled: ${query.sql}`);
    const tokens = Array.from(query.sql.matchAll(/`[^`]+`\.`([^`]+)`\s*(<>|<=|>=|=|<|>|is not null|is null|not in|in)\s*(\((?:\?(?:,\s*)?)+\))?/gi));
    let i = 0;
    for (const [, column, rawOp, list] of tokens) {
      const op = rawOp.toLowerCase();
      const value = asValue(row[column] ?? null);
      if (op === "is null") { if (value !== null) return false; continue; }
      if (op === "is not null") { if (value === null) return false; continue; }
      if (op === "in" || op === "not in") {
        const size = (list?.match(/\?/g) ?? []).length;
        const params = query.params.slice(i, i + size).map(asValue); i += size;
        if (params.includes(value) === (op === "not in")) return false;
        continue;
      }
      const param = asValue(query.params[i++]);
      if (op === "=" && value !== param) return false;
      if (op === "<>" && value === param) return false;
      if ((op === "<" || op === "<=" || op === ">" || op === ">=") && (typeof value !== "number" || typeof param !== "number")) return false;
      if (op === "<" && !((value as number) < (param as number))) return false;
      if (op === "<=" && !((value as number) <= (param as number))) return false;
      if (op === ">" && !((value as number) > (param as number))) return false;
      if (op === ">=" && !((value as number) >= (param as number))) return false;
    }
    return true;
  }

  function sorter(orders: SQL[]) {
    const keys = orders.map(order => { const { sql } = dialect.sqlToQuery(order); const match = /`([^`]+)`\s*(asc|desc)?$/i.exec(sql.trim()); return { column: match?.[1] ?? "id", desc: /desc$/i.test(sql.trim()) }; });
    return (a: Row, b: Row) => { for (const key of keys) { const x = asValue(a[key.column]) as number; const y = asValue(b[key.column]) as number; if (x !== y) return (x < y ? -1 : 1) * (key.desc ? -1 : 1); } return 0; };
  }

  function selection(table: unknown, projection: Row | undefined, where?: SQL) {
    let orders: SQL[] = [];
    let limit = Number.POSITIVE_INFINITY;
    const run = () => {
      const rows = rowsOf(table).filter(row => matches(where, row)).sort(sorter(orders)).slice(0, limit);
      const cloned = structuredClone(rows);
      return projection ? cloned.map(row => Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[(column as { name: string }).name] ?? null]))) : cloned;
    };
    const chain = {
      where: (condition: SQL) => selection(table, projection, condition),
      orderBy: (...next: SQL[]) => { orders = next; return chain; },
      limit: (n: number) => { limit = n; return chain; },
      for: async () => run(),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve().then(run).then(resolve, reject),
    };
    return chain;
  }

  /** The stored row a new row collides with on one of its table's unique keys, if any. */
  function uniqueConflict(name: LedgerTableName, row: Row): Row | undefined {
    for (const keys of UNIQUE_KEYS[name] ?? []) {
      if (!keys.every(key => row[key] !== null && row[key] !== undefined)) continue;
      const other = tables[name].find(stored => keys.every(key => stored[key] === row[key]));
      if (other) return other;
    }
    return undefined;
  }

  function enforceUnique(name: LedgerTableName, row: Row) {
    if (uniqueConflict(name, row)) throw Object.assign(new Error(`Duplicate entry in ${name}`), { code: "ER_DUP_ENTRY", errno: 1062 });
  }

  /** Writes one column of an UPDATE / ON DUPLICATE KEY UPDATE: a plain value, or `that column + ?` / `- ?` on a number. */
  function applyPatchValue(row: Row, key: string, value: unknown) {
    if (value === undefined) return;
    if (!(value instanceof SQL)) { row[key] = structuredClone(value); return; }
    const query = dialect.sqlToQuery(value);
    const increment = /^`[^`]+`\.`([^`]+)`\s*([+-])\s*\?$/.exec(query.sql.trim());
    const delta = query.params[0];
    if (!increment || increment[1] !== key || query.params.length !== 1 || typeof delta !== "number" || typeof row[key] !== "number") throw new Error(`SQL expressions in updates are not modelled: ${query.sql}`);
    row[key] = increment[2] === "+" ? (row[key] as number) + delta : (row[key] as number) - delta;
  }

  function api() {
    return {
      select: (projection?: Row) => ({ from: (table: unknown) => Object.assign(selection(table, projection), { leftJoin: () => ({ where: () => selection(referralRequests, projection, undefined) }) }) }),
      // Like drizzle, the insert runs when awaited: plainly (a unique collision throws
      // ER_DUP_ENTRY), or as an upsert that patches the colliding row instead.
      insert: (table: unknown) => ({ values: (input: Row | Row[]) => {
        const name = TABLES.get(table); if (!name) throw new Error("Unexpected table");
        const rows = Array.isArray(input) ? input : [input];
        const add = (row: Row) => { const insertId = (tables[name].reduce((max, other) => Math.max(max, Number(other.id ?? 0)), 0)) + 1; tables[name].push({ id: insertId, createdAt: new Date(), ...structuredClone(row) }); return insertId; };
        const run = async (onDuplicate?: { set: Row }) => {
          let insertId = 0;
          for (const row of rows) {
            const existing = onDuplicate ? uniqueConflict(name, row) : undefined;
            if (existing && onDuplicate) { for (const [key, value] of Object.entries(onDuplicate.set)) applyPatchValue(existing, key, value); insertId = Number(existing.id ?? 0); continue; }
            enforceUnique(name, row);
            insertId = add(row);
          }
          return [{ affectedRows: 1, insertId }];
        };
        const lazy = (onDuplicate?: { set: Row }) => ({ then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => run(onDuplicate).then(resolve, reject) });
        return { ...lazy(), onDuplicateKeyUpdate: (config: { set: Row }) => lazy(config) };
      } }),
      update: (table: unknown) => ({ set: (patch: Row) => ({ where: async (condition: SQL) => {
        const selected = rowsOf(table).filter(row => matches(condition, row));
        for (const row of selected) for (const [key, value] of Object.entries(patch)) applyPatchValue(row, key, value);
        return [{ affectedRows: selected.length }];
      } }) }),
    };
  }

  const base = api();
  const database = { ...base, transaction: async (callback: (tx: ReturnType<typeof api>) => Promise<unknown>) => {
    const snapshot = structuredClone(tables);
    try { return await callback(base); } catch (error) { reset(snapshot); throw error; }
  } };
  return { tables, reset, database };
}
