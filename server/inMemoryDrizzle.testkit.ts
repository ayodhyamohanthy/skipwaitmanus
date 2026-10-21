/*
 * Test-only in-memory stand-in for the drizzle MySQL client. A test installs it
 * with vi.mock("drizzle-orm/mysql2", () => ({ drizzle: () => store.db })) so
 * server/db.ts runs its real queries: joins, where clauses, limits, unique keys
 * (read from drizzle/schema.ts) and upserts are evaluated against plain rows
 * instead of canned answers. It understands the operators the referral store
 * uses (eq, ne, and, or, gt/gte/lt/lte, isNull, isNotNull, inArray, `col + n`),
 * GROUP BY columns with count(col)/count(*) fields, and throws on anything else,
 * so an unsupported query fails loudly rather than passing by accident. Rows
 * come back in insertion order (ORDER BY is ignored), which is what makes a
 * query that relies on row order observable in a test.
 */
import { Column, DrizzleQueryError, Param, SQL, StringChunk, Table, getTableColumns, getTableName, is, type SQLChunk } from "drizzle-orm";
import { getTableConfig, type MySqlTable } from "drizzle-orm/mysql-core";

export type Cell = string | number | boolean | Date | null;
export type Row = { [column: string]: Cell };
type Joined = Map<string, Row | null>;
/** A selected row: cells, or a whole table's row for `select({ request: referralRequests, ... })`. */
export type Selected = { [key: string]: Cell | Row };
type Projection = { readonly [key: string]: Column | Table | SQL };
type WriteResult = [{ insertId: number; affectedRows: number }];

const fail = (what: string): never => { throw new Error(`in-memory drizzle: unsupported ${what}`); };
const textOf = (chunk: SQLChunk): string | undefined => (is(chunk, StringChunk) ? chunk.value.join("") : undefined);

function toCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof Date) return value;
  return fail("value");
}

function keyOf(column: Column): { table: string; key: string } {
  const entry = Object.entries(getTableColumns(column.table)).find(([, candidate]) => candidate === column);
  return entry ? { table: getTableName(column.table), key: entry[0] } : fail(`column ${column.name}`);
}

function cellOf(column: Column, joined: Joined): Cell {
  const { table, key } = keyOf(column);
  return joined.get(table)?.[key] ?? null;
}

type Operand = Cell | Cell[];
function operandOf(chunk: SQLChunk, joined: Joined): Operand {
  if (is(chunk, Column)) return cellOf(chunk, joined);
  if (is(chunk, Param)) return Array.isArray(chunk.value) ? chunk.value.map(item => toCell(item)) : toCell(chunk.value);
  if (Array.isArray(chunk)) return chunk.map(item => { const value = operandOf(item, joined); return Array.isArray(value) ? fail("nested list") : value; });
  return fail("operand");
}

const comparable = (value: Cell) => (value instanceof Date ? value.getTime() : value);
function equal(left: Operand, right: Operand) {
  if (Array.isArray(left) || Array.isArray(right) || left === null || right === null) return false;
  return comparable(left) === comparable(right);
}
function order(left: Operand, right: Operand): number | undefined {
  if (Array.isArray(left) || Array.isArray(right) || left === null || right === null) return undefined;
  const a = comparable(left), b = comparable(right);
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  return undefined;
}

const significant = (sql: SQL) => sql.queryChunks.filter(chunk => textOf(chunk) !== "");

/** Evaluates a drizzle condition against one joined row. */
export function matches(condition: SQL | undefined, joined: Joined): boolean {
  if (!condition) return true;
  const chunks = significant(condition);
  const [first, second, third] = chunks;
  if (chunks.length === 1 && is(first, SQL)) return matches(first, joined);
  if (chunks.length === 3 && textOf(first) === "(" && textOf(third) === ")" && is(second, SQL)) return matches(second, joined);
  const joiners = chunks.filter((_, index) => index % 2 === 1).map(textOf);
  const parts = chunks.filter((_, index) => index % 2 === 0);
  if (chunks.length >= 3 && parts.every(part => is(part, SQL))) {
    const conditions = parts.filter((part): part is SQL => is(part, SQL));
    if (joiners.every(joiner => joiner === " and ")) return conditions.every(part => matches(part, joined));
    if (joiners.every(joiner => joiner === " or ")) return conditions.some(part => matches(part, joined));
  }
  const operator = second === undefined ? undefined : textOf(second)?.trim();
  if (first === undefined || operator === undefined) return fail("condition");
  const left = operandOf(first, joined);
  if (operator === "is null") return left === null;
  if (operator === "is not null") return left !== null;
  const right = third === undefined ? fail(`operator ${operator}`) : operandOf(third, joined);
  const compared = order(left, right);
  switch (operator) {
    case "=": return equal(left, right);
    case "<>": return !equal(left, right) && left !== null && right !== null;
    case ">": return compared !== undefined && compared > 0;
    case ">=": return compared !== undefined && compared >= 0;
    case "<": return compared !== undefined && compared < 0;
    case "<=": return compared !== undefined && compared <= 0;
    case "in": return Array.isArray(right) && right.some(item => equal(left, item));
    default: return fail(`operator ${operator}`);
  }
}

/** A `set` value: a plain cell, a column copy, or `col + n`. */
function setValue(value: Cell | Column | SQL, row: Row, table: string): Cell {
  if (is(value, Column)) return cellOf(value, new Map([[table, row]]));
  if (!is(value, SQL)) return value;
  const expression = significant(value).map(chunk => {
    const literal = textOf(chunk);
    if (literal !== undefined) return literal;
    const operand = operandOf(chunk, new Map([[table, row]]));
    return Array.isArray(operand) ? fail("list in set") : String(comparable(operand));
  }).join("");
  const sum = /^\s*(-?\d+)\s*\+\s*(-?\d+)\s*$/.exec(expression);
  if (sum) return Number(sum[1]) + Number(sum[2]);
  return /^\s*-?\d+\s*$/.test(expression) ? Number(expression) : fail(`set expression ${expression}`);
}

/** The target of a `count(col)` or `count(*)` field as drizzle renders it; undefined for any other SQL. */
function countTarget(field: SQL): Column | "*" | undefined {
  const chunks = significant(field);
  const [open, target, close] = chunks;
  if (chunks.length !== 3 || textOf(open) !== "count(" || textOf(close) !== ")") return undefined;
  if (is(target, Column)) return target;
  return is(target, SQL) && significant(target).map(textOf).join("") === "*" ? "*" : undefined;
}

/** The target of a `min(col)` field as drizzle renders it; undefined for any other SQL. */
function minTarget(field: SQL): Column | undefined {
  const chunks = significant(field);
  const [open, target, close] = chunks;
  if (chunks.length !== 3 || textOf(open) !== "min(" || textOf(close) !== ")") return undefined;
  return is(target, Column) ? target : undefined;
}

/** One output row per GROUP BY group (one group over every row for a bare count, as MySQL does). */
function aggregate(projection: Projection, groups: readonly Column[] | undefined, kept: readonly Joined[]): Selected[] {
  const fields = Object.entries(projection);
  if (!groups && fields.some(([, field]) => !is(field, SQL) || !countTarget(field))) return fail("plain field in an aggregate without GROUP BY");
  const grouped = new Map<string, Joined[]>(groups ? [] : [["", []]]);
  for (const candidate of kept) {
    const key = groups ? JSON.stringify(groups.map(column => comparable(cellOf(column, candidate)))) : "";
    grouped.set(key, [...(grouped.get(key) ?? []), candidate]);
  }
  return Array.from(grouped.values()).map((members: readonly Joined[]) => {
    const out: Selected = {};
    for (const [key, field] of fields) {
      const target = is(field, SQL) ? countTarget(field) : undefined;
      const minColumn = is(field, SQL) ? minTarget(field) : undefined;
      if (target) out[key] = target === "*" ? members.length : members.filter((member: Joined) => cellOf(target, member) !== null).length;
      else if (minColumn) { const values = members.map((member: Joined) => cellOf(minColumn, member)).filter((value): value is Cell => value !== null); out[key] = values.length === 0 ? null : values.reduce((lowest, value) => (comparable(value) < comparable(lowest) ? value : lowest)); }
      else if (is(field, Column)) out[key] = members[0] ? structuredClone(cellOf(field, members[0])) : null;
      else return fail(`computed projection ${key}`);
    }
    return out;
  });
}

function uniqueKeysOf(table: MySqlTable): string[][] {
  const config = getTableConfig(table);
  const names = (columns: readonly SQLChunk[]) => columns.map(column => (is(column, Column) ? keyOf(column).key : fail("index expression")));
  return [
    ...config.columns.filter(column => column.primary || column.isUnique).map(column => [keyOf(column).key]),
    ...config.indexes.filter(index => index.config.unique).map(index => names(index.config.columns)),
    ...config.uniqueConstraints.map(constraint => names(constraint.columns)),
  ];
}

export type Seed = ReadonlyArray<readonly [MySqlTable, readonly Row[]]>;
const tablesFrom = (seed: Seed) => new Map<string, Row[]>(seed.map(([table, rows]) => [getTableName(table), rows.map(row => ({ ...row }))]));

/** server/db.ts caches its client, so one instance serves a whole test file; `reset` reseeds it between tests. */
export function createInMemoryDrizzle(seed: Seed = []) {
  let tables = tablesFrom(seed);
  // Tables whose reads throw like a missing table (MySQL ER_NO_SUCH_TABLE), for fail-open tests.
  let unreadable = new Set<string>();
  const rowsOf = (name: string) => { const rows = tables.get(name) ?? []; tables.set(name, rows); return rows; };

  function select(projection?: Projection) {
    let source: MySqlTable | undefined; let condition: SQL | undefined; let max: number | undefined; let groups: Column[] | undefined;
    const joins: Array<{ inner: boolean; table: MySqlTable; on: SQL | undefined }> = [];
    const run = (): Selected[] => {
      if (!source) return fail("select without from");
      const from = getTableName(source);
      for (const name of [from, ...joins.map(join => getTableName(join.table))]) {
        if (unreadable.has(name)) throw Object.assign(new Error(`Table '${name}' doesn't exist`), { code: "ER_NO_SUCH_TABLE", errno: 1146 });
      }
      let joined: Joined[] = rowsOf(from).map((row): Joined => new Map([[from, row]]));
      for (const join of joins) {
        const name = getTableName(join.table);
        const extend = (base: Joined, row: Row | null): Joined => { const next: Joined = new Map(base); next.set(name, row); return next; };
        joined = joined.flatMap(base => {
          const hits = rowsOf(name).map(row => extend(base, row)).filter(candidate => matches(join.on, candidate));
          return hits.length ? hits : join.inner ? [] : [extend(base, null)];
        });
      }
      const filtered = joined.filter(candidate => matches(condition, candidate));
      if (projection && (groups || Object.values(projection).some(field => is(field, SQL) && countTarget(field)))) return aggregate(projection, groups, filtered).slice(0, max);
      const kept = filtered.slice(0, max);
      return kept.map(candidate => {
        if (!projection) return joins.length ? fail("select() without fields across a join") : structuredClone(candidate.get(from) ?? {});
        const out: Selected = {};
        for (const [key, field] of Object.entries(projection)) {
          if (is(field, Column)) out[key] = structuredClone(cellOf(field, candidate));
          else if (is(field, Table)) out[key] = structuredClone(candidate.get(getTableName(field)) ?? null);
          else return fail(`computed projection ${key}`);
        }
        return out;
      });
    };
    const query = {
      from: (table: MySqlTable) => { source = table; return query; },
      innerJoin: (table: MySqlTable, on?: SQL) => { joins.push({ inner: true, table, on }); return query; },
      leftJoin: (table: MySqlTable, on?: SQL) => { joins.push({ inner: false, table, on }); return query; },
      where: (where?: SQL) => { condition = where; return query; },
      groupBy: (...columns: ReadonlyArray<Column | SQL>) => { groups = columns.map(column => (is(column, Column) ? column : fail("GROUP BY expression"))); return query; },
      orderBy: () => query,
      limit: (limit: number) => { max = limit; return query; },
      for: async () => run(),
      then: <A, B = never>(resolve: (rows: Selected[]) => A | PromiseLike<A>, reject?: (error: Error) => B | PromiseLike<B>) => Promise.resolve().then(run).then(resolve, reject),
    };
    return query;
  }

  function insert(table: MySqlTable) {
    const name = getTableName(table);
    const write = (input: Row | readonly Row[], set?: { readonly [key: string]: Cell | Column | SQL }): WriteResult => {
      const rows = rowsOf(name); let insertId = 0; let affectedRows = 0;
      for (const value of Array.isArray(input) ? input : [input]) {
        const id = typeof value.id === "number" ? value.id : Math.max(0, ...rows.map(row => (typeof row.id === "number" ? row.id : 0))) + 1;
        const row: Row = { ...Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, null])), ...Object.fromEntries(Object.entries(value).filter(([, cell]) => cell !== undefined)), id };
        const duplicate = rows.find(existing => uniqueKeysOf(table).some(keys => keys.every(key => row[key] !== null && equal(existing[key] ?? null, row[key] ?? null))));
        if (duplicate && !set) {
          // Production shape: drizzle rethrows the driver error inside
          // DrizzleQueryError, so a duplicate check that reads only `.code`
          // passes here and misses in production (server/dbErrors.ts).
          const driverError = Object.assign(new Error(`Duplicate entry for ${name}`), { code: "ER_DUP_ENTRY", errno: 1062, sqlState: "23000" });
          throw new DrizzleQueryError(`insert into \`${name}\``, [], driverError);
        }
        if (duplicate && set) { for (const [key, cell] of Object.entries(set)) duplicate[key] = setValue(cell, duplicate, name); affectedRows += 2; continue; }
        rows.push(row); insertId = id; affectedRows += 1;
      }
      return [{ insertId, affectedRows }];
    };
    return {
      values: (input: Row | readonly Row[]) => ({
        onDuplicateKeyUpdate: async (config: { set: { readonly [key: string]: Cell | Column | SQL } }) => write(input, config.set),
        then: <A, B = never>(resolve: (result: WriteResult) => A | PromiseLike<A>, reject?: (error: Error) => B | PromiseLike<B>) => Promise.resolve().then(() => write(input)).then(resolve, reject),
      }),
    };
  }

  function update(table: MySqlTable) {
    const name = getTableName(table);
    return {
      set: (values: { readonly [key: string]: Cell | Column | SQL | undefined }) => ({
        where: async (where?: SQL): Promise<WriteResult> => {
          const hits = rowsOf(name).filter(row => matches(where, new Map([[name, row]])));
          for (const row of hits) for (const [key, cell] of Object.entries(values)) if (cell !== undefined) row[key] = setValue(cell, row, name);
          return [{ insertId: 0, affectedRows: hits.length }];
        },
      }),
    };
  }

  function remove(table: MySqlTable) {
    const name = getTableName(table);
    return {
      where: async (where?: SQL): Promise<WriteResult> => {
        const rows = rowsOf(name); const kept = rows.filter(row => !matches(where, new Map([[name, row]])));
        tables.set(name, kept);
        return [{ insertId: 0, affectedRows: rows.length - kept.length }];
      },
    };
  }

  const api = { select, insert, update, delete: remove };
  const transaction = async <T>(run: (tx: typeof api) => Promise<T>): Promise<T> => {
    const snapshot = structuredClone(tables);
    try { return await run(api); } catch (error) { tables = snapshot; throw error; }
  };
  return {
    db: { ...api, transaction },
    reset: (next: Seed) => { tables = tablesFrom(next); unreadable = new Set(); },
    /** Every later read of `table` throws as if it were missing, until the next reset. */
    failReads: (table: MySqlTable) => { unreadable.add(getTableName(table)); },
    /** A copy of a table's current rows, for assertions. */
    rows: (table: MySqlTable): Row[] => structuredClone(rowsOf(getTableName(table))),
  };
}
