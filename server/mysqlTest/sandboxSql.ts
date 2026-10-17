import type { Pool, PoolConnection } from "mysql2/promise";

/** One row straight from the driver, before a spec narrows it. */
export type SqlRow = Record<string, unknown>;

/**
 * The single mysql2 read boundary for `server/mysqlTest`. The driver types
 * `query()` as a union of result shapes, so every read funnels through here
 * instead of casting inline, and a spec only ever sees `SqlRow`.
 */
export async function selectRows(executor: Pool | PoolConnection, query: string, params: unknown[] = []): Promise<SqlRow[]> {
  const [result] = await executor.query(query, params);
  return Array.isArray(result) ? (result as unknown as SqlRow[]) : [];
}

/** `COUNT(*)` aliased as `n`. */
export async function selectCount(executor: Pool | PoolConnection, query: string, params: unknown[]): Promise<number> {
  const [row] = await selectRows(executor, query, params);
  const value = row?.n;
  if (value === undefined) throw new Error(`count query returned no row: ${query}`);
  return Number(value);
}

export function requireStringValue(row: SqlRow | undefined, column: string, context: string): string {
  if (!row) throw new Error(`${context}: query returned no row`);
  return stringColumn(row, column, context);
}

/** Driver columns become domain types one field at a time, so a schema change
 * reports which column stopped matching instead of failing a cast elsewhere. */
export function numberColumn(row: SqlRow, column: string, context: string): number {
  const value = row[column];
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${context}: expected number "${column}", got ${JSON.stringify(value ?? null)}`);
  return parsed;
}

export function stringColumn(row: SqlRow, column: string, context: string): string {
  const value = row[column];
  if (typeof value !== "string") throw new Error(`${context}: expected string "${column}", got ${JSON.stringify(value ?? null)}`);
  return value;
}

export function optionalNumberColumn(row: SqlRow, column: string, context: string): number | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  return numberColumn(row, column, context);
}
