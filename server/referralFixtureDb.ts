// Test support only (imported by *.test.ts, never by app code): an in-memory
// stand-in for the drizzle MySQL client, enough to run the referral lifecycle
// functions in db.ts against rows a test controls.
//
// WHERE clauses are evaluated, not ignored: each `table`.`column` comparison
// (=, <, >, IN, IS [NOT] NULL) is checked against the row, and conditions are
// AND-ed (OR is not supported, so do not use this for paths that need it).
// An inner-joined table reads its columns from the same row (put e.g. the
// job's `company` on the request row); a left-joined table has no row, so
// `IS NULL` on it holds. Transactions run the callback directly (no rollback).
import { Column, Table, getTableName, is, type SQL } from "drizzle-orm";
import { MySqlDialect, type MySqlTable, type SelectedFields } from "drizzle-orm/mysql-core";

export type FixtureValue = string | number | boolean | Date | null;
export type FixtureRow = Record<string, FixtureValue>;
export type FixtureStore = Map<string, FixtureRow[]>;

const dialect = new MySqlDialect();
const CONDITION = /`([^`]+)`\.`([^`]+)`\s*(is not null|is null|in|=|<|>)\s*(\([^)]*\)|\?|`[^`]+`\.`[^`]+`)?/gi;

// drizzle hands timestamps to the driver as "YYYY-MM-DD HH:MM:SS.mmm" (UTC) strings.
function comparable(value: FixtureValue | undefined | object): string | number | boolean | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) return Date.parse(`${value.replace(" ", "T")}Z`);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
}

// Driver params and inserted values are whatever drizzle produced; keep only plain column values.
function asFixtureValue(value: unknown): FixtureValue {
  if (value instanceof Date || value === null) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return null;
}

function toFixtureRow(values: object): FixtureRow {
  const row: FixtureRow = {};
  for (const [key, value] of Object.entries(values)) row[key] = value instanceof Date ? new Date(value.getTime()) : asFixtureValue(value);
  return row;
}

export function matchesWhere(where: SQL | undefined, row: FixtureRow, readable: ReadonlySet<string>): boolean {
  if (!where) return true;
  const query = dialect.sqlToQuery(where);
  const params = query.params.map(param => comparable(asFixtureValue(param)));
  let next = 0;
  for (const [, table, column, rawOperator, operand = ""] of Array.from(query.sql.matchAll(CONDITION))) {
    const operator = rawOperator.toLowerCase();
    const known = readable.has(table);
    const value = known ? comparable(row[column]) : null;
    if (operator === "is null") { if (value !== null) return false; continue; }
    if (operator === "is not null") { if (value === null) return false; continue; }
    if (operator === "in") {
      const count = (operand.match(/\?/g) ?? []).length;
      const list = params.slice(next, next + count);
      next += count;
      if (known && !list.includes(value)) return false;
      continue;
    }
    if (operand !== "?") continue; // column = column: a join condition
    const param = params[next++];
    if (!known) continue;
    if (operator === "=" && value !== param) return false;
    if (operator === "<" && !(typeof value === "number" && typeof param === "number" && value < param)) return false;
    if (operator === ">" && !(typeof value === "number" && typeof param === "number" && value > param)) return false;
  }
  return true;
}

type SelectedRow = Record<string, FixtureValue | FixtureRow>;

function project(row: FixtureRow, projection: SelectedFields | undefined, readable: ReadonlySet<string>): SelectedRow {
  if (!projection) return structuredClone(row);
  const picked: SelectedRow = {};
  for (const [key, field] of Object.entries(projection)) {
    if (is(field, Table)) picked[key] = structuredClone(row);
    // A left-joined table has no row here, so its columns read as NULL.
    else if (is(field, Column)) picked[key] = readable.has(getTableName(field.table)) ? row[field.name] ?? null : null;
    else picked[key] = row[key] ?? null;
  }
  return picked;
}

export function referralFixtureDb(store: () => FixtureStore) {
  const rowsOf = (table: MySqlTable): FixtureRow[] => {
    const name = getTableName(table);
    const rows = store().get(name);
    if (rows) return rows;
    const created: FixtureRow[] = [];
    store().set(name, created);
    return created;
  };
  const select = (projection?: SelectedFields) => {
    let from: MySqlTable | undefined;
    let where: SQL | undefined;
    let limit = Number.POSITIVE_INFINITY;
    const readable = new Set<string>();
    const run = async (): Promise<SelectedRow[]> => {
      if (!from) return [];
      return rowsOf(from).filter(row => matchesWhere(where, row, readable)).slice(0, limit).map(row => project(row, projection, readable));
    };
    const query = {
      from: (table: MySqlTable) => { from = table; readable.add(getTableName(table)); return query; },
      innerJoin: (table: MySqlTable) => { readable.add(getTableName(table)); return query; },
      leftJoin: () => query,
      where: (condition: SQL | undefined) => { where = condition; return query; },
      groupBy: () => query,
      orderBy: () => query,
      limit: (count: number) => { limit = count; return query; },
      for: () => run(),
      then: <T>(resolve: (rows: SelectedRow[]) => T, reject?: (error: Error) => T) => run().then(resolve, reject),
    };
    return query;
  };
  const insert = (table: MySqlTable) => ({
    values: (values: object | object[]) => {
      const rows = rowsOf(table);
      const inserted = (Array.isArray(values) ? values : [values]).map(value => {
        const ids = rows.map(row => (typeof row.id === "number" ? row.id : 0));
        const row: FixtureRow = { id: Math.max(0, ...ids) + 1, ...toFixtureRow(value) };
        rows.push(row);
        return row;
      });
      const result = Promise.resolve([{ insertId: inserted[0]?.id ?? 0, affectedRows: inserted.length }]);
      return Object.assign(result, { onDuplicateKeyUpdate: async () => [{ insertId: 0, affectedRows: 1 }] });
    },
  });
  const update = (table: MySqlTable) => ({
    set: (patch: object) => ({
      where: async (condition: SQL | undefined) => {
        const matched = rowsOf(table).filter(row => matchesWhere(condition, row, new Set([getTableName(table)])));
        for (const row of matched) Object.assign(row, toFixtureRow(patch));
        return [{ affectedRows: matched.length }];
      },
    }),
  });
  const remove = (table: MySqlTable) => ({
    where: async (condition: SQL | undefined) => {
      const rows = rowsOf(table);
      const kept = rows.filter(row => !matchesWhere(condition, row, new Set([getTableName(table)])));
      const removed = rows.length - kept.length;
      rows.splice(0, rows.length, ...kept);
      return [{ affectedRows: removed }];
    },
  });
  const api = { select, insert, update, delete: remove };
  return { ...api, transaction: async <T>(run: (tx: typeof api) => Promise<T>): Promise<T> => run(api) };
}
