import { sql } from "drizzle-orm";
import { getDb } from "./db";

// Columns the running code expects. Each entry is applied idempotently at boot
// when missing (MySQL 8.0 has no ADD COLUMN IF NOT EXISTS, so check
// information_schema first). Add new columns here AND to drizzle/schema.ts.
// New tables are created idempotently (IF NOT EXISTS) so a drifted live DB
// self-heals without manual migration runs. Keep in sync with drizzle/schema.ts.
const DESIRED_TABLES: Array<{ table: string; createSql: string }> = [
  { table: "employerAccounts", createSql: `CREATE TABLE IF NOT EXISTS \`employerAccounts\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`companyName\` varchar(160) NOT NULL, \`billingEmail\` varchar(320) NOT NULL, \`credits\` int NOT NULL DEFAULT 0, \`budgetMonthlyUsdCents\` int NOT NULL DEFAULT 0, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE NOW, CONSTRAINT \`employerAccounts_id\` PRIMARY KEY(\`id\`))` },
  { table: "profileUnlocks", createSql: `CREATE TABLE IF NOT EXISTS \`profileUnlocks\` (\`id\` int AUTO_INCREMENT NOT NULL, \`employerUserId\` int NOT NULL, \`seekerProfileUserId\` int NOT NULL, \`unlockedAt\` timestamp NOT NULL DEFAULT (now()), \`creditsSpent\` int NOT NULL, CONSTRAINT \`profileUnlocks_id\` PRIMARY KEY(\`id\`))` },
  { table: "partnerModules", createSql: `CREATE TABLE IF NOT EXISTS \`partnerModules\` (\`id\` int AUTO_INCREMENT NOT NULL, \`partnerName\` varchar(160) NOT NULL, \`category\` ENUM('interview_prep','resume_vetting','skill_assessment','other') NOT NULL, \`headline\` varchar(255) NOT NULL, \`description\` text NOT NULL, \`targetRoles\` text, \`ctaLabel\` varchar(80) NOT NULL, \`ctaUrl\` varchar(1024) NOT NULL, \`isActive\` boolean NOT NULL DEFAULT true, \`impressions\` int NOT NULL DEFAULT 0, \`clicks\` int NOT NULL DEFAULT 0, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE NOW, CONSTRAINT \`partnerModules_id\` PRIMARY KEY(\`id\`))` },
  { table: "userFollows", createSql: `CREATE TABLE IF NOT EXISTS \`userFollows\` (\`id\` int AUTO_INCREMENT NOT NULL, \`followerUserId\` int NOT NULL, \`followingUserId\` int NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT (now()), CONSTRAINT \`userFollows_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`user_follows_pair_unique\`(\`followerUserId\`, \`followingUserId\`), INDEX \`user_follows_following_idx\`(\`followingUserId\`))` },
];

const DESIRED_COLUMNS: Array<{ table: string; column: string; definition: string }> = [
  { table: "companyOpportunities", column: "compensation", definition: "TEXT NULL" },
  { table: "jobs", column: "compensation", definition: "TEXT NULL" },
  { table: "referralRequests", column: "savedAt", definition: "TIMESTAMP NULL" },
  { table: "users", column: "suspended", definition: "BOOLEAN NOT NULL DEFAULT false" },
  // B2B monetization (0037). The profiles.accountType enum widening
  // (append 'employer') is intentionally NOT here: ADD COLUMN cannot widen an
  // existing ENUM, so it is applied by drizzle/0037_b2b_monetization.sql only.
  { table: "profiles", column: "anonymityOptIn", definition: "BOOLEAN NOT NULL DEFAULT false" },
  { table: "companyOpportunities", column: "sponsoredUntil", definition: "TIMESTAMP NULL" },
  { table: "companyOpportunities", column: "sponsoredTier", definition: "ENUM('standard','featured','spotlight') NULL" },
];

// The only DDL this module ever runs: the fixed ALTER/CREATE statements derived
// from DESIRED_COLUMNS + DESIRED_TABLES above. Nothing request-controlled is
// ever interpolated — the admin trigger just chooses WHEN the allowlist runs.
export type ReconcileStatementResult = { statement: string; ok: boolean; error?: string };

// Drizzle surfaces driver failures as DrizzleQueryError("Failed query: …
// params: …") with the real MySQL error on `cause` (code/errno/sqlState).
// Recording only err.message discards the diagnosis (missing table vs denied
// DDL vs no database selected vs lock timeout), so unwrap the cause chain.
export function describeReconcileError(err: unknown): string {
  const top = err instanceof Error ? err.message : String(err);
  const causes: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err instanceof Error ? (err as { cause?: unknown }).cause : undefined;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      const code = (current as { code?: unknown }).code;
      const errno = (current as { errno?: unknown }).errno;
      const sqlState = (current as { sqlState?: unknown }).sqlState;
      const qualifier = [typeof code === "string" && code ? code : null, typeof errno === "number" ? `errno ${errno}` : null, typeof sqlState === "string" && sqlState ? `sqlstate ${sqlState}` : null].filter(Boolean).join(" ");
      causes.push(qualifier ? `${qualifier}: ${current.message}` : current.message);
      current = (current as { cause?: unknown }).cause;
    } else {
      causes.push(String(current));
      break;
    }
  }
  return causes.length ? `${top} | cause: ${causes.join(" <- ")}` : top;
}

let reconciled = false;
let lastError: string | null = null;
let lastResults: ReconcileStatementResult[] = [];
let inFlight: Promise<{ applied: string[]; skipped: string[] }> | null = null;

export async function reconcileSchema(): Promise<{ applied: string[]; skipped: string[] }> {
  // Success is cached forever. A failed or deferred attempt (DB connection not
  // ready at boot) is retried on later calls — the information_schema probe
  // makes every run idempotent, so retrying is safe. Concurrent callers share
  // one in-flight attempt.
  if (reconciled) return { applied: [], skipped: [] };
  if (inFlight) return inFlight;
  const db = await getDb();
  if (!db) return { applied: [], skipped: [] };
  const run = (async () => {
  const applied: string[] = [];
  const skipped: string[] = [];
  const results: ReconcileStatementResult[] = [];
  // Each run reports only its own outcome: reset the per-statement results and
  // the first-error pointer so a successful retry clears a previous failure.
  lastError = null;
  lastResults = results;
  let failed = false;
  try {
    const result = await db.execute(sql`SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`);
    // mysql2's drizzle result HKT loses row typing on raw execute; cast like db.ts does.
    const rows = result[0] as unknown as Array<{ TABLE_NAME: string; COLUMN_NAME: string }>;
    if (rows.length === 0) {
      // Zero visible columns means the follow-on ALTERs will all fail: either
      // a genuinely fresh database (run the drizzle migrations) or the
      // connection sees no tables (DATABASE_URL database name / privileges).
      console.error("[schema-reconcile] information_schema probe returned 0 columns; check DATABASE_URL database selection and grants before trusting per-statement errors below");
    }
    const existing = new Set(rows.map(row => `${row.TABLE_NAME}.${row.COLUMN_NAME}`));
    const existingTables = new Set(rows.map(row => row.TABLE_NAME));
    for (const { table, column, definition } of DESIRED_COLUMNS) {
      if (existing.has(`${table}.${column}`)) { skipped.push(`${table}.${column}`); continue; }
      const stmt = `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`;
      try { await db.execute(sql.raw(stmt)); }
      catch (err) {
        // One failing statement must not hide the state of the rest: record it
        // and keep going so a single metadata lock (or privilege) gap cannot
        // leave the remaining DDL unattempted and unreported.
        const error = describeReconcileError(err);
        results.push({ statement: stmt, ok: false, error });
        if (!lastError) lastError = `[${stmt}] ${error}`;
        failed = true;
        console.error(`[schema-reconcile] statement failed (continuing): [${stmt}] ${error}`);
        continue;
      }
      results.push({ statement: stmt, ok: true });
      applied.push(`${table}.${column}`);
    }
    for (const { table, createSql } of DESIRED_TABLES) {
      if (existingTables.has(table)) { skipped.push(table); continue; }
      try { await db.execute(sql.raw(createSql)); }
      catch (err) {
        const error = describeReconcileError(err);
        results.push({ statement: createSql, ok: false, error });
        if (!lastError) lastError = `[${createSql.slice(0, 60)}…] ${error}`;
        failed = true;
        console.error(`[schema-reconcile] statement failed (continuing): [${createSql.slice(0, 60)}…] ${error}`);
        continue;
      }
      results.push({ statement: createSql, ok: true });
      applied.push(`table:${table}`);
    }
    // Only a run with zero statement failures counts as reconciled.
    if (!failed) {
      reconciled = true;
      console.log(`[schema-reconcile] applied=${applied.length} skipped=${skipped.length}${applied.length ? " -> " + applied.join(",") : ""}`);
    } else {
      console.error(`[schema-reconcile] incomplete: applied=${applied.length} failed=${results.filter(item => !item.ok).length} skipped=${skipped.length}; will retry on the next trigger`);
    }
  } catch (error) {
    // Never crash the server for reconcile failures; log and continue.
    lastError = describeReconcileError(error);
    console.error("[schema-reconcile] failed (non-fatal):", lastError);
  }
  return { applied, skipped };
  })();
  inFlight = run;
  try { return await run; } finally { if (inFlight === run) inFlight = null; }
}

export function isSchemaReconciled() { return reconciled; }
export function getLastReconcileError() { return lastError; }
// Per-statement outcome of the most recent run (empty until one has happened;
// the array is reset at the start of every run).
export function getLastReconcileResults() { return lastResults; }
