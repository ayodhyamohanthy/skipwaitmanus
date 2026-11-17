// In-memory MySQL stand-in for tests that run the real ask create path
// (`createCompanyReferralRequest` in server/db.ts) and must prove what a failed
// send left behind (D-132-item3, packet docs/plans/D-132-item3-accepted-price.md §7a).
//
// It is the SQL slice server/db.askCostStored.test.ts already uses to run that path
// (inner and left joins, `for("update")`, =, <>, <, <=, >, >=, IS [NOT] NULL, IN,
// AND/OR, the open-ask count's correlated EXISTS, ORDER BY, LIMIT, counts, and
// inserts into any table by name), moved into one module so it can be shared.
// It differs in one place: `transaction` snapshots every table and the id
// sequence, and on any throw restores both and rethrows, as MySQL rolls back.
// That is what makes a zero-write assertion after a refused send meaningful.
// `setRollback(false)` gives the permissive `cb(api)` semantics the older
// fixtures use, only so a test can show why they cannot prove atomicity.
// Any WHERE shape outside the slice throws instead of being guessed.
//
// The tables object and the sequence keep their identity (reset and rollback
// replace their contents), so a test can hold them while the server's cached
// db handle reads the same rows.
import { getTableColumns, getTableName, SQL, type SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  askCosts, askWorkItems, canonicalPeople, companyCoverageInvitations, jobs, notifications, operationalActivityLogs,
  planCreditGrants, profiles, promoCreditGrants, referralAttachments, referralDocumentAccessGrants,
  referralRequestPasses, referralRequestSaves, referralRequests, referralReviewDeliveries,
  referralTransitionEvents, referrerReviewEmailLinks, tokenBalances, tokenTransactions, users, workItems,
} from "../drizzle/schema";

export type Row = Record<string, unknown>;
export type AskFixtureTables = Record<string, Row[]>;

const dialect = new MySqlDialect();
const TABLES = [askCosts, askWorkItems, canonicalPeople, companyCoverageInvitations, jobs, notifications, operationalActivityLogs, planCreditGrants, profiles, promoCreditGrants, referralAttachments, referralDocumentAccessGrants, referralRequestPasses, referralRequestSaves, referralRequests, referralReviewDeliveries, referralTransitionEvents, referrerReviewEmailLinks, tokenBalances, tokenTransactions, users, workItems];
/** The SQL names of the tables whose columns the fixture knows (joins and predicates read these). */
export const ASK_CREATE_TABLE_NAMES: readonly string[] = TABLES.map(table => getTableName(table));
const COLUMNS_BY_NAME = new Map<string, string[]>(TABLES.map(table => [getTableName(table), Object.keys(getTableColumns(table))]));
/** One table's row inside a joined result; a left join with no match carries `null`. */
type Part = { table: string; row: Row | null };

const tableNameOf = (table: unknown) => getTableName(table as never);

/** Every column of every joined table keyed "table.column"; a left join with no match is all null. */
function flatten(parts: readonly Part[]): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const part of parts) for (const column of COLUMNS_BY_NAME.get(part.table) ?? []) flat[`${part.table}.${column}`] = part.row ? part.row[column] ?? null : null;
  return flat;
}

/** drizzle hands timestamp params to the driver as "YYYY-MM-DD HH:MM:SS.mmm" (UTC) strings. */
const asMs = (value: unknown) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) return Date.parse(`${value.replace(" ", "T")}Z`);
  return value;
};

/** Splits a condition at depth 0 on a boolean operator, so nested groups keep their meaning. */
function splitTopLevel(sql: string, operator: string): string[] {
  const parts: string[] = [];
  let depth = 0; let start = 0; let i = 0;
  while (i < sql.length) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") depth--;
    else if (depth === 0 && sql.startsWith(operator, i)) { parts.push(sql.slice(start, i)); i += operator.length; start = i; continue; }
    i++;
  }
  parts.push(sql.slice(start));
  return parts;
}

const ATOM = /^`([^`]+)`\.`([^`]+)`\s*(?:(is not null|is null)|(<>|<=|>=|=|<|>)\s*(?:(`([^`]+)`\.`([^`]+)`)|\?))$/i;
const COUNT_ALL = /^count\(\*\)$/i;
const COUNT_COLUMN = /^count\(`([^`]+)`\.`([^`]+)`\)$/i;
const sqlTextOf = (value: unknown): string | null => (value instanceof SQL ? dialect.sqlToQuery(value).sql.trim() : null);

/** MySQL ordering: NULL sorts before every value ascending; numbers and dates compare by value. */
function compareValues(a: unknown, b: unknown): number {
  const av = asMs(a); const bv = asMs(b);
  const aNull = av === null || av === undefined; const bNull = bv === null || bv === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return -1;
  if (bNull) return 1;
  if (typeof av === "number" && typeof bv === "number") return av === bv ? 0 : av < bv ? -1 : 1;
  const as = String(av); const bs = String(bv);
  return as === bs ? 0 : as < bs ? -1 : 1;
}

/**
 * The WHERE slice this suite exercises: =, <, <=, >, >=, <>, is (not) null, in, and/or,
 * and the open-ask count's correlated `exists (select 1 from <table> where ...)`
 * (a match against any of that table's rows, with the outer row in scope).
 */
function matches(tables: AskFixtureTables, condition: unknown, flat: Record<string, unknown>): boolean {
  const query = dialect.sqlToQuery(condition as SQLQuery);
  const cursor = { index: 0 };
  let scope = flat;
  const unwrap = (sql: string): string => {
    let text = sql.trim();
    while (text.startsWith("(")) {
      let depth = 0; let closesAt = -1;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === "(") depth++;
        else if (text[i] === ")") { depth--; if (depth === 0) { closesAt = i; break; } }
      }
      if (closesAt !== text.length - 1) break;
      text = text.slice(1, -1).trim();
    }
    return text;
  };
  const evaluate = (sql: string): boolean => {
    const trimmed = unwrap(sql);
    if (!trimmed) return true;
    const orParts = splitTopLevel(trimmed, " or ");
    if (orParts.length > 1) return orParts.map(evaluate).some(Boolean);
    const andParts = splitTopLevel(trimmed, " and ");
    if (andParts.length > 1) return andParts.map(evaluate).every(Boolean);
    const inMatch = /^`([^`]+)`\.`([^`]+)` in \((.+)\)$/.exec(trimmed);
    if (inMatch) {
      const size = (inMatch[3].match(/\?/g) ?? []).length;
      const values = query.params.slice(cursor.index, cursor.index + size);
      cursor.index += size;
      return values.includes(scope[`${inMatch[1]}.${inMatch[2]}`]);
    }
    // The open-ask count asks whether a claim ever happened for this request:
    // evaluate the inner condition once per row of the subquery's table, with
    // the outer row still in scope for the correlation.
    const existsMatch = /^exists \(select 1 from `([^`]+)` where (.+)\)$/.exec(trimmed);
    if (existsMatch) {
      const [, table, inner] = existsMatch;
      const start = cursor.index; const outer = scope;
      let found = false;
      for (const row of tables[table] ?? []) {
        cursor.index = start;
        scope = { ...outer, ...flatten([{ table, row }]) };
        if (evaluate(inner)) found = true;
      }
      scope = outer;
      cursor.index = start + (inner.match(/\?/g) ?? []).length;
      return found;
    }
    const match = ATOM.exec(trimmed);
    if (!match) throw new Error(`fixture cannot evaluate: ${trimmed}`);
    const value = scope[`${match[1]}.${match[2]}`];
    const [, , , nullOp, compareOp, rightColumn, rightTable, rightName] = match;
    if (nullOp) return /is not null/i.test(nullOp) ? value !== null && value !== undefined : value === null || value === undefined;
    const right = rightColumn ? scope[`${rightTable}.${rightName}`] : query.params[cursor.index++];
    if (compareOp === "=") return asMs(value) === asMs(right);
    if (compareOp === "<>") return asMs(value) !== asMs(right);
    const left = asMs(value); const bound = asMs(right);
    if (typeof left !== "number" || typeof bound !== "number") return false;
    if (compareOp === "<") return left < bound;
    if (compareOp === "<=") return left <= bound;
    if (compareOp === ">") return left > bound;
    return left >= bound;
  };
  return evaluate(query.sql);
}

/**
 * A fresh fixture: `tables` (SQL table name -> rows), `sequence` (the next id per
 * table), `reset` to seed both in place, and `database` for `drizzle()` to return.
 */
export function createAskCreateFixture() {
  const tables: AskFixtureTables = {};
  const sequence: Record<string, number> = {};
  let rollback = true;
  const bucket = (table: unknown) => (tables[tableNameOf(table)] ??= []);
  /** Replaces every table's rows and the id sequence in place; a table left out is emptied. */
  const reset = (next: AskFixtureTables, nextSequence: Record<string, number> = {}) => {
    for (const name of Object.keys(tables)) delete tables[name];
    for (const [name, list] of Object.entries(next)) tables[name] = list;
    for (const name of Object.keys(sequence)) delete sequence[name];
    Object.assign(sequence, nextSequence);
  };

  const select = (projection?: Record<string, unknown>) => {
    const state: {
      from?: unknown;
      joins: Array<{ table: unknown; on: unknown; kind: "inner" | "left" }>;
      where?: unknown;
      groups: unknown[];
      orders: Array<{ table: string; column: string; direction: 1 | -1 }>;
    } = { joins: [], groups: [], orders: [] };
    const project = (combo: Part[]): Row => {
      if (!projection) return structuredClone(combo[0].row ?? {});
      const flat = flatten(combo);
      const out: Row = {};
      for (const [key, value] of Object.entries(projection)) {
        const selectedTable = TABLES.find(table => table === value);
        if (selectedTable) { out[key] = structuredClone(combo.find(part => part.table === tableNameOf(selectedTable))?.row ?? null); continue; }
        const text = sqlTextOf(value);
        if (text !== null) {
          const column = COUNT_COLUMN.exec(text);
          const cell = column ? flat[`${column[1]}.${column[2]}`] : undefined;
          out[key] = COUNT_ALL.test(text) ? 1 : column ? (cell === null || cell === undefined ? 0 : 1) : null;
          continue;
        }
        out[key] = flat[`${tableNameOf((value as { table: unknown }).table)}.${(value as { name: string }).name}`];
      }
      return out;
    };
    const run = (): Row[] => {
      let combos: Part[][] = bucket(state.from).map(row => [{ table: tableNameOf(state.from), row }]);
      for (const join of state.joins) {
        const name = tableNameOf(join.table);
        const next: Part[][] = [];
        for (const combo of combos) {
          const matched = bucket(join.table).filter(candidate => matches(tables, join.on, flatten([...combo, { table: name, row: candidate }])));
          for (const candidate of matched) next.push([...combo, { table: name, row: candidate }]);
          if (join.kind === "left" && matched.length === 0) next.push([...combo, { table: name, row: null }]);
        }
        combos = next;
      }
      if (state.where) combos = combos.filter(combo => matches(tables, state.where, flatten(combo)));
      if (state.orders.length) combos = [...combos].sort((a, b) => {
        const fa = flatten(a); const fb = flatten(b);
        for (const order of state.orders) {
          const result = compareValues(fa[`${order.table}.${order.column}`], fb[`${order.table}.${order.column}`]);
          if (result !== 0) return result * order.direction;
        }
        return 0;
      });
      const entries = projection ? Object.entries(projection) : [];
      const onlyCounts = entries.length > 0 && entries.every(([, value]) => { const text = sqlTextOf(value); return text !== null && (COUNT_ALL.test(text) || COUNT_COLUMN.test(text)); });
      if (onlyCounts && state.groups.length === 0) {
        return [Object.fromEntries(entries.map(([key, value]) => {
          const column = COUNT_COLUMN.exec(sqlTextOf(value)!);
          return [key, column
            ? combos.filter(combo => { const cell = flatten(combo)[`${column[1]}.${column[2]}`]; return cell !== null && cell !== undefined; }).length
            : combos.length];
        }))];
      }
      return combos.map(project);
    };
    const slice = (n: number) => run().slice(0, n);
    const chain = {
      from: (table: unknown) => { state.from = table; return chain; },
      innerJoin: (table: unknown, on: unknown) => { state.joins.push({ table, on, kind: "inner" }); return chain; },
      leftJoin: (table: unknown, on: unknown) => { state.joins.push({ table, on, kind: "left" }); return chain; },
      where: (condition: unknown) => { state.where = condition; return chain; },
      groupBy: (...group: unknown[]) => { state.groups = group; return chain; },
      orderBy: (...order: unknown[]) => {
        for (const term of order) {
          const match = /^`([^`]+)`\.`([^`]+)`\s+(asc|desc)$/i.exec(sqlTextOf(term) ?? "");
          if (match) state.orders.push({ table: match[1], column: match[2], direction: match[3].toLowerCase() === "desc" ? -1 : 1 });
        }
        return chain;
      },
      limit: (n: number) => ({ for: async (_mode: string) => slice(n), then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(slice(n)).then(resolve, reject) }),
      for: async (_mode: string) => run(),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    };
    return chain;
  };
  const update = (table: unknown) => ({
    set: (patch: Row) => ({
      where: async (condition: unknown) => {
        const matched = bucket(table).filter(row => matches(tables, condition, flatten([{ table: tableNameOf(table), row }])));
        for (const row of matched) for (const [key, value] of Object.entries(patch)) row[key] = structuredClone(value);
        return [{ affectedRows: matched.length }];
      },
    }),
  });
  const insert = (table: unknown) => ({
    values: (input: Row | Row[]) => {
      const name = tableNameOf(table);
      const insertedIds: number[] = [];
      for (const item of Array.isArray(input) ? input : [input]) {
        const id = (sequence[name] = (sequence[name] ?? 0) + 1);
        insertedIds.push(id);
        bucket(table).push({ id, ...structuredClone(item) });
      }
      return Object.assign(Promise.resolve([{ affectedRows: 1, insertId: insertedIds[0] }]), { onDuplicateKeyUpdate: async () => [{ affectedRows: 1 }] });
    },
  });
  const api = { select, update, insert };
  const database = {
    ...api,
    transaction: async (callback: (tx: typeof api) => Promise<unknown>) => {
      if (!rollback) return callback(api);
      const snapshot = structuredClone({ tables, sequence });
      try {
        return await callback(api);
      } catch (error) {
        reset(snapshot.tables, snapshot.sequence);
        throw error;
      }
    },
  };
  /** True (the default) rolls a failed transaction back; false is the permissive `cb(api)` of the older fixtures. */
  const setRollback = (on: boolean) => { rollback = on; };
  return { tables, sequence, reset, database, setRollback };
}
