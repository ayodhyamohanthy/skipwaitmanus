import { sql } from "drizzle-orm";
import { getDb } from "./db";

// Columns the running code expects. Each entry is applied idempotently at boot
// when missing (MySQL 8.0 has no ADD COLUMN IF NOT EXISTS, so check
// information_schema first). Add new columns here AND to drizzle/schema.ts.
// New tables are created idempotently (IF NOT EXISTS) so a drifted live DB
// self-heals without manual migration runs. Keep in sync with drizzle/schema.ts.
const DESIRED_TABLES: Array<{ table: string; createSql: string }> = [
  // The UNIQUE keys below are load-bearing, not decorative. Without
  // `employer_accounts_user_unique` one user can accumulate duplicate billing
  // accounts; without `profile_unlocks_employer_seeker_unique` the same
  // (employer, seeker) unlock can be inserted twice and the employer charged
  // twice. drizzle/0037 creates them, but this module exists precisely for the
  // case where that migration never ran — so it must create them too.
  { table: "employerAccounts", createSql: `CREATE TABLE IF NOT EXISTS \`employerAccounts\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`companyName\` varchar(160) NOT NULL, \`billingEmail\` varchar(320) NOT NULL, \`credits\` int NOT NULL DEFAULT 0, \`budgetMonthlyUsdCents\` int NOT NULL DEFAULT 0, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE NOW, CONSTRAINT \`employerAccounts_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`employer_accounts_user_unique\`(\`userId\`))` },
  { table: "profileUnlocks", createSql: `CREATE TABLE IF NOT EXISTS \`profileUnlocks\` (\`id\` int AUTO_INCREMENT NOT NULL, \`employerUserId\` int NOT NULL, \`seekerProfileUserId\` int NOT NULL, \`unlockedAt\` timestamp NOT NULL DEFAULT (now()), \`creditsSpent\` int NOT NULL, CONSTRAINT \`profileUnlocks_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`profile_unlocks_employer_seeker_unique\`(\`employerUserId\`, \`seekerProfileUserId\`), INDEX \`profile_unlocks_seeker_idx\`(\`seekerProfileUserId\`))` },
  // Column widths/nullability here must match drizzle/schema.ts. They did not:
  // `description` was NOT NULL here but nullable in the schema, so a module with
  // no description failed with MySQL 1048, and `ctaUrl` was 1024 here vs 2048 in
  // the schema, so a longer URL failed with 1406.
  { table: "partnerModules", createSql: `CREATE TABLE IF NOT EXISTS \`partnerModules\` (\`id\` int AUTO_INCREMENT NOT NULL, \`partnerName\` varchar(120) NOT NULL, \`category\` ENUM('interview_prep','resume_vetting','skill_assessment','other') NOT NULL, \`headline\` varchar(180) NOT NULL, \`description\` text, \`targetRoles\` text, \`ctaLabel\` varchar(80) NOT NULL, \`ctaUrl\` varchar(2048) NOT NULL, \`isActive\` boolean NOT NULL DEFAULT true, \`impressions\` int NOT NULL DEFAULT 0, \`clicks\` int NOT NULL DEFAULT 0, \`createdAt\` timestamp NOT NULL DEFAULT (now()), \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE NOW, CONSTRAINT \`partnerModules_id\` PRIMARY KEY(\`id\`), INDEX \`partner_modules_active_idx\`(\`isActive\`, \`createdAt\`))` },
  { table: "userFollows", createSql: `CREATE TABLE IF NOT EXISTS \`userFollows\` (\`id\` int AUTO_INCREMENT NOT NULL, \`followerUserId\` int NOT NULL, \`followingUserId\` int NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT (now()), CONSTRAINT \`userFollows_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`user_follows_pair_unique\`(\`followerUserId\`, \`followingUserId\`), INDEX \`user_follows_following_idx\`(\`followingUserId\`))` },
];

/**
 * Indexes the running code expects, reconciled separately from the tables.
 *
 * `CREATE TABLE IF NOT EXISTS` is a no-op on a table that already exists, so a
 * database built by an earlier version of DESIRED_TABLES (or by a migration that
 * was never applied) kept its missing keys forever. These are applied
 * idempotently by probing information_schema.STATISTICS.
 *
 * A UNIQUE index on a table that already holds duplicates will fail — correctly.
 * That is a data problem an operator has to see, not something to swallow, so the
 * failure is recorded and leaves the run "incomplete" rather than reconciled.
 */
const DESIRED_INDEXES: Array<{ table: string; index: string; createSql: string }> = [
  { table: "employerAccounts", index: "employer_accounts_user_unique", createSql: "ALTER TABLE `employerAccounts` ADD UNIQUE INDEX `employer_accounts_user_unique`(`userId`)" },
  { table: "profileUnlocks", index: "profile_unlocks_employer_seeker_unique", createSql: "ALTER TABLE `profileUnlocks` ADD UNIQUE INDEX `profile_unlocks_employer_seeker_unique`(`employerUserId`, `seekerProfileUserId`)" },
  { table: "profileUnlocks", index: "profile_unlocks_seeker_idx", createSql: "ALTER TABLE `profileUnlocks` ADD INDEX `profile_unlocks_seeker_idx`(`seekerProfileUserId`)" },
  { table: "partnerModules", index: "partner_modules_active_idx", createSql: "ALTER TABLE `partnerModules` ADD INDEX `partner_modules_active_idx`(`isActive`, `createdAt`)" },
  { table: "companyOpportunities", index: "company_opportunities_sponsor_idx", createSql: "ALTER TABLE `companyOpportunities` ADD INDEX `company_opportunities_sponsor_idx`(`sponsoredUntil`)" },
  // Missing indexes on hot query paths: every message list filters on senderId,
  // nearly every referral query joins on jobId, and the slot-opened alert
  // recipients filter on workEmailDomain.
  { table: "messages", index: "messages_sender_idx", createSql: "ALTER TABLE `messages` ADD INDEX `messages_sender_idx`(`senderId`)" },
  { table: "referralRequests", index: "referral_requests_job_idx", createSql: "ALTER TABLE `referralRequests` ADD INDEX `referral_requests_job_idx`(`jobId`)" },
  { table: "profiles", index: "profiles_work_email_domain_idx", createSql: "ALTER TABLE `profiles` ADD INDEX `profiles_work_email_domain_idx`(`workEmailDomain`)" },
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
  // 0039: binds a consumed work-email OTP to the account that consumed it.
  { table: "workEmailOtpCodes", column: "verifiedByUserId", definition: "INT NULL" },
];

// The only DDL this module ever runs: the fixed ALTER/CREATE statements derived
// from DESIRED_COLUMNS + DESIRED_TABLES above. Nothing request-controlled is
// ever interpolated — the admin trigger just chooses WHEN the allowlist runs.
export type ReconcileStatementResult = { statement: string; ok: boolean; error?: string };

/**
 * Human-readable description of a failed statement.
 *
 * Drizzle wraps driver failures in a `DrizzleQueryError` whose own message is
 * just "Failed query: <sql>\nparams: " — the actionable MySQL error (privilege
 * denial, lock wait timeout, duplicate column) lives on `.cause`. Reporting only
 * the wrapper is why a failed reconcile surfaced as an undiagnosable
 * "Failed query" with no cause, both in the logs and on /api/health. Walk the
 * cause chain and keep every distinct message.
 */
export function describeError(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth += 1) {
    const message = current instanceof Error ? current.message : String(current);
    if (message && !messages.includes(message)) messages.push(message);
    current = current instanceof Error ? (current as { cause?: unknown }).cause : undefined;
  }
  return messages.join(" | ") || "Unknown error";
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
    const existing = new Set(rows.map(row => `${row.TABLE_NAME}.${row.COLUMN_NAME}`));
    const existingTables = new Set(rows.map(row => row.TABLE_NAME));
    // Index names live in STATISTICS, not COLUMNS. Probed in the same run so a
    // table created moments ago gets its indexes added immediately.
    const indexResult = await db.execute(sql`SELECT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()`);
    const indexRows = indexResult[0] as unknown as Array<{ TABLE_NAME: string; INDEX_NAME: string }>;
    const existingIndexes = new Set(indexRows.map(row => `${row.TABLE_NAME}.${row.INDEX_NAME}`));
    for (const { table, column, definition } of DESIRED_COLUMNS) {
      if (existing.has(`${table}.${column}`)) { skipped.push(`${table}.${column}`); continue; }
      const stmt = `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`;
      try { await db.execute(sql.raw(stmt)); }
      catch (err) {
        // One failing statement must not hide the state of the rest: record it
        // and keep going so a single metadata lock (or privilege) gap cannot
        // leave the remaining DDL unattempted and unreported.
        const error = describeError(err);
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
        const error = describeError(err);
        results.push({ statement: createSql, ok: false, error });
        if (!lastError) lastError = `[${createSql.slice(0, 60)}…] ${error}`;
        failed = true;
        console.error(`[schema-reconcile] statement failed (continuing): [${createSql.slice(0, 60)}…] ${error}`);
        continue;
      }
      results.push({ statement: createSql, ok: true });
      applied.push(`table:${table}`);
    }
    for (const { table, index, createSql } of DESIRED_INDEXES) {
      if (existingIndexes.has(`${table}.${index}`)) { skipped.push(`${table}.${index}`); continue; }
      try { await db.execute(sql.raw(createSql)); }
      catch (err) {
        const error = describeError(err);
        results.push({ statement: createSql, ok: false, error });
        if (!lastError) lastError = `[${createSql}] ${error}`;
        failed = true;
        console.error(`[schema-reconcile] statement failed (continuing): [${createSql}] ${error}`);
        continue;
      }
      results.push({ statement: createSql, ok: true });
      applied.push(`${table}.${index}`);
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
    lastError = describeError(error);
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
