import { sql } from "drizzle-orm";
import mysql, { type Pool } from "mysql2/promise";
import { getDb } from "../db";
import { requireStringValue, selectRows, type SqlRow } from "./sandboxSql";

/**
 * Test infrastructure for real InnoDB concurrency. Every spec that imports this
 * runs against a rebuilt copy of `drizzle/schema.ts` on a throwaway MySQL 8
 * server and calls the *real* `server/db.ts` exports, so a race is observed in
 * the same locking environment production uses instead of being asserted against
 * source text.
 */

const SANDBOX_NAME = /^skipwait_test[0-9a-z_]*$/i;
const START_LINE_TIMEOUT_MS = 15_000;

/** Tables whose presence proves `prepare-mysql-test-schema.mjs` ran. */
const REQUIRED_TABLES = [
  "users",
  "jobs",
  "profiles",
  "referralRequests",
  "referralTransitionEvents",
  "referralDocumentAccessGrants",
  "tokenBalances",
  "tokenTransactions",
  "companyCoverageInvitations",
  "companyCoverageRewards",
  "notifications",
];

export type TestDatabase = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type ConcurrencyHarness = {
  /** Drizzle client owned by `server/db.ts`, bound to the sandbox. */
  readonly db: TestDatabase;
  /** Harness-owned pool for seeding and assertions, kept separate so the code
   * under test never competes with the observer for connections. */
  readonly pool: Pool;
  readonly database: string;
  readonly isolationLevel: string;
  reset(): Promise<void>;
  close(): Promise<void>;
};

export function concurrencyTestsEnabled(): boolean {
  return process.env.MYSQL_CONCURRENCY_TESTS === "1";
}

/** The known-open-race specs assert behaviour production does not have yet, so
 * they stay opt-in and run non-blocking in CI until the fixes land. */
export function raceProbeEnabled(): boolean {
  return concurrencyTestsEnabled() && process.env.MYSQL_RACE_PROBE === "1";
}

export const SKIP_NOTICE = "run `node scripts/prepare-mysql-test-schema.mjs` and set MYSQL_CONCURRENCY_TESTS=1";

function parseUrl(raw: string | undefined): URL | undefined {
  if (!raw) return undefined;
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

type SandboxTarget = { url: URL; host: string; port: number; user: string; password: string; database: string };

function sandboxTarget(): SandboxTarget {
  const raw = process.env.MYSQL_TEST_URL;
  if (!raw) throw new Error(`MYSQL_TEST_URL is required. ${SKIP_NOTICE}`);
  const url = new URL(raw);
  const database = url.pathname.replace(/^\//, "");
  if (!SANDBOX_NAME.test(database)) {
    throw new Error(`MYSQL_TEST_URL must point at a sandbox database named skipwait_test*, got "${database}"`);
  }
  const app = parseUrl(process.env.DATABASE_URL);
  if (app && app.hostname === url.hostname && app.pathname === url.pathname) {
    throw new Error("MYSQL_TEST_URL resolves to the DATABASE_URL target; these specs reset tables and will not run there");
  }
  return { url, host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database };
}

async function assertSchemaReady(pool: Pool, database: string): Promise<void> {
  const rows = await selectRows(pool, "SELECT TABLE_NAME AS tableName, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'", [database]);
  const engineByTable = new Map(rows.map(row => [String(row.tableName), String(row.engine)]));
  const missing = REQUIRED_TABLES.filter(table => !engineByTable.has(table));
  if (missing.length) {
    throw new Error(`sandbox "${database}" is not provisioned (missing ${missing.join(", ")})`);
  }
  const nonInnoDB = Array.from(engineByTable.entries()).filter(([, engine]) => engine !== "InnoDB");
  if (nonInnoDB.length) {
    throw new Error(`sandbox "${database}" has non-InnoDB tables (${nonInnoDB.map(([table, engine]) => `${table}=${engine}`).join(", ")}); row locks do not apply there`);
  }
}

/**
 * Opens the sandbox and rebinds `server/db.ts` to it. `getDb()` caches its pool
 * on first use and falls back to `null` on connection failure, so both are
 * asserted here rather than trusted.
 */
export async function openConcurrencyHarness(): Promise<ConcurrencyHarness> {
  const target = sandboxTarget();
  const pool = mysql.createPool({
    host: target.host,
    port: target.port,
    user: target.user,
    password: target.password,
    database: target.database,
    connectionLimit: 5,
  });
  await assertSchemaReady(pool, target.database);

  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = target.url.toString();
  const db = await getDb();
  if (!db) {
    process.env.DATABASE_URL = previousUrl;
    await pool.end();
    throw new Error("server/db.ts could not bind to the sandbox (getDb returned null)");
  }
  // drizzle's execute() has no row generic; this mirrors the raw-probe pattern
  // already used by getDomainIntegrity in server/db.ts.
  const probe = await db.execute(sql`SELECT DATABASE() AS databaseName, @@transaction_isolation AS isolationLevel`);
  const probeRows = (Array.isArray(probe[0]) ? probe[0] : []) as unknown as SqlRow[];
  const boundDatabase = requireStringValue(probeRows[0], "databaseName", "sandbox probe");
  const isolationLevel = requireStringValue(probeRows[0], "isolationLevel", "sandbox probe");
  if (boundDatabase !== target.database) {
    process.env.DATABASE_URL = previousUrl;
    await pool.end();
    await endDrizzlePool(db);
    throw new Error(`server/db.ts is bound to "${boundDatabase}", not the sandbox "${target.database}"`);
  }

  return {
    db,
    pool,
    database: target.database,
    isolationLevel,
    async reset() {
      const connection = await pool.getConnection();
      try {
        await connection.query("SET FOREIGN_KEY_CHECKS = 0");
        const rows = await selectRows(connection, "SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'");
        for (const row of rows) {
          const table = String(row.tableName);
          if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(table)) throw new Error(`refusing to truncate unexpected table name "${table}"`);
          await connection.query(`TRUNCATE TABLE \`${table}\``);
        }
      } finally {
        await connection.query("SET FOREIGN_KEY_CHECKS = 1");
        connection.release();
      }
    },
    async close() {
      process.env.DATABASE_URL = previousUrl;
      await pool.end();
      await endDrizzlePool(db);
    },
  };
}

/** `getDb()` exposes no teardown, so release its cached mysql2 pool through the
 * drizzle session shape; otherwise queued connections keep the worker alive and
 * Vitest reports a hang instead of a result. */
type ClosableClient = { end?: () => Promise<void> };

function clientOf(db: TestDatabase): ClosableClient | undefined {
  return (db as { session?: { client?: ClosableClient } }).session?.client;
}

async function endDrizzlePool(db: TestDatabase): Promise<void> {
  const client = clientOf(db);
  if (typeof client?.end === "function") await client.end();
}

export type RaceOutcome<T> = Array<PromiseSettledResult<T>>;

/**
 * Dispatches `parties` calls only once every party has arrived, so the window
 * being measured is the transaction body rather than test scheduling.
 */
export async function raceOnStartLine<T>(parties: number, work: (index: number) => Promise<T>): Promise<RaceOutcome<T>> {
  if (parties < 2) throw new Error("a race needs at least two parties");
  let arrived = 0;
  let openLine: (() => void) | undefined;
  const line = new Promise<void>(resolve => { openLine = resolve; });
  const timer = setTimeout(() => openLine?.(), START_LINE_TIMEOUT_MS);
  const runners = Array.from({ length: parties }, (_unused, index) => (async () => {
    arrived += 1;
    if (arrived === parties) openLine?.();
    await line;
    return work(index);
  })());
  const outcomes = await Promise.allSettled(runners);
  clearTimeout(timer);
  if (arrived !== parties) throw new Error(`start line released ${arrived} of ${parties} parties`);
  return outcomes;
}

export function fulfilledValues<T>(outcomes: RaceOutcome<T>): T[] {
  return outcomes.filter((outcome): outcome is PromiseFulfilledResult<T> => outcome.status === "fulfilled").map(outcome => outcome.value);
}

function describeRejection(reason: unknown): string {
  const code = typeof reason === "object" && reason !== null && "code" in reason && typeof reason.code === "string" ? reason.code : "";
  const message = reason instanceof Error ? reason.message : String(reason);
  return `${code} ${message}`.trim();
}

export function rejectionReasons(outcomes: RaceOutcome<unknown>): string[] {
  return outcomes
    .filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected")
    .map(outcome => describeRejection(outcome.reason));
}
