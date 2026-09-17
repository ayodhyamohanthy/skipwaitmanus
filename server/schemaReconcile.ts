import { sql } from "drizzle-orm";
import { getDb } from "./db";

// Columns the running code expects. Each entry is applied idempotently at boot
// when missing (MySQL 8.0 has no ADD COLUMN IF NOT EXISTS, so check
// information_schema first). Add new columns here AND to drizzle/schema.ts.
// New tables are created idempotently (IF NOT EXISTS) so a drifted live DB
// self-heals without manual migration runs. Keep in sync with drizzle/schema.ts.
export const DESIRED_TABLES: Array<{ table: string; createSql: string }> = [
  { table: "referralRequestSaves", createSql: `CREATE TABLE IF NOT EXISTS \`referralRequestSaves\` (\`id\` int AUTO_INCREMENT NOT NULL, \`referralRequestId\` int NOT NULL, \`referrerId\` int NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`referralRequestSaves_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`referral_request_save_request_referrer_unique\`(\`referralRequestId\`,\`referrerId\`), INDEX \`referral_request_save_referrer_idx\`(\`referrerId\`,\`createdAt\`), INDEX \`referral_request_save_request_idx\`(\`referralRequestId\`))` },
  { table: "referralRequestPasses", createSql: `CREATE TABLE IF NOT EXISTS \`referralRequestPasses\` (\`id\` int AUTO_INCREMENT NOT NULL, \`referralRequestId\` int NOT NULL, \`referrerId\` int NOT NULL, \`reason\` ENUM('role_not_a_fit','cannot_support','timing') NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`referralRequestPasses_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`referral_request_pass_request_referrer_unique\`(\`referralRequestId\`,\`referrerId\`), INDEX \`referral_request_pass_referrer_idx\`(\`referrerId\`,\`createdAt\`))` },
  { table: "workEmailOtpRateLimits", createSql: `CREATE TABLE IF NOT EXISTS \`workEmailOtpRateLimits\` (\`id\` int AUTO_INCREMENT NOT NULL, \`limiterKey\` varchar(96) NOT NULL, \`windowStart\` timestamp NOT NULL, \`hitCount\` int NOT NULL DEFAULT 1, \`expiresAt\` timestamp NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`workEmailOtpRateLimits_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`work_email_otp_rate_window_unique\`(\`limiterKey\`,\`windowStart\`), INDEX \`work_email_otp_rate_expiry_idx\`(\`expiresAt\`))` },
  { table: "employerPaymentFulfillments", createSql: `CREATE TABLE IF NOT EXISTS \`employerPaymentFulfillments\` (\`id\` int AUTO_INCREMENT NOT NULL, \`provider\` varchar(32) NOT NULL, \`providerOrderId\` varchar(255) NOT NULL, \`providerPaymentId\` varchar(255), \`userId\` int NOT NULL, \`pack\` ENUM('starter','growth','scale') NOT NULL, \`amount\` int NOT NULL, \`currency\` varchar(3) NOT NULL, \`status\` ENUM('pending','processing','credited','requires_review') NOT NULL DEFAULT 'pending', \`attemptCount\` int NOT NULL DEFAULT 0, \`lastError\` varchar(500), \`creditedAt\` timestamp NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`employerPaymentFulfillments_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`employer_payment_provider_order_unique\`(\`provider\`,\`providerOrderId\`), UNIQUE INDEX \`employer_payment_provider_payment_unique\`(\`provider\`,\`providerPaymentId\`), INDEX \`employer_payment_user_status_idx\`(\`userId\`,\`status\`))` },
  { table: "employerAccounts", createSql: `CREATE TABLE IF NOT EXISTS \`employerAccounts\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`companyName\` varchar(160) NOT NULL, \`billingEmail\` varchar(320) NOT NULL, \`credits\` int NOT NULL DEFAULT 0, \`budgetMonthlyUsdCents\` int NOT NULL DEFAULT 0, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`employerAccounts_id\` PRIMARY KEY(\`id\`))` },
  { table: "employerTalentRefs", createSql: `CREATE TABLE IF NOT EXISTS \`employerTalentRefs\` (\`id\` int AUTO_INCREMENT NOT NULL, \`employerUserId\` int NOT NULL, \`seekerProfileUserId\` int NOT NULL, \`publicRef\` varchar(64) NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`employerTalentRefs_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`employer_talent_refs_public_unique\` UNIQUE(\`publicRef\`), CONSTRAINT \`employer_talent_refs_pair_unique\` UNIQUE(\`employerUserId\`,\`seekerProfileUserId\`), INDEX \`employer_talent_refs_scope_idx\` (\`employerUserId\`,\`publicRef\`))` },
  { table: "employerTalentIntroRequests", createSql: `CREATE TABLE IF NOT EXISTS \`employerTalentIntroRequests\` (\`id\` int AUTO_INCREMENT NOT NULL, \`employerUserId\` int NOT NULL, \`seekerProfileUserId\` int NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`employerTalentIntroRequests_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`employer_talent_intro_pair_unique\` UNIQUE(\`employerUserId\`,\`seekerProfileUserId\`))` },
  { table: "profileUnlocks", createSql: `CREATE TABLE IF NOT EXISTS \`profileUnlocks\` (\`id\` int AUTO_INCREMENT NOT NULL, \`employerUserId\` int NOT NULL, \`seekerProfileUserId\` int NOT NULL, \`unlockedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`creditsSpent\` int NOT NULL, CONSTRAINT \`profileUnlocks_id\` PRIMARY KEY(\`id\`))` },
  { table: "partnerModules", createSql: `CREATE TABLE IF NOT EXISTS \`partnerModules\` (\`id\` int AUTO_INCREMENT NOT NULL, \`partnerName\` varchar(160) NOT NULL, \`category\` ENUM('interview_prep','resume_vetting','skill_assessment','other') NOT NULL, \`headline\` varchar(255) NOT NULL, \`description\` text NOT NULL, \`targetRoles\` text, \`ctaLabel\` varchar(80) NOT NULL, \`ctaUrl\` varchar(1024) NOT NULL, \`isActive\` boolean NOT NULL DEFAULT true, \`impressions\` int NOT NULL DEFAULT 0, \`clicks\` int NOT NULL DEFAULT 0, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`partnerModules_id\` PRIMARY KEY(\`id\`))` },
  { table: "userFollows", createSql: `CREATE TABLE IF NOT EXISTS \`userFollows\` (\`id\` int AUTO_INCREMENT NOT NULL, \`followerUserId\` int NOT NULL, \`followingUserId\` int NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`userFollows_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`user_follows_pair_unique\`(\`followerUserId\`, \`followingUserId\`), INDEX \`user_follows_following_idx\`(\`followingUserId\`))` },
];

export const DESIRED_COLUMN_DEFINITIONS: Array<{ table: string; column: string; columnType: string; definition: string }> = [
  { table: "resumeUploadSessions", column: "status", columnType: "enum('active','finalizing','completed','failed')", definition: "ENUM('active','finalizing','completed','failed') NOT NULL DEFAULT 'active'" },
];

export const DESIRED_COLUMNS: Array<{ table: string; column: string; definition: string }> = [
  { table: "companyOpportunities", column: "compensation", definition: "TEXT NULL" },
  { table: "jobs", column: "compensation", definition: "TEXT NULL" },
  { table: "referralRequests", column: "savedAt", definition: "TIMESTAMP NULL" },
  { table: "notifications", column: "eventKey", definition: "VARCHAR(120) NULL" },
  { table: "users", column: "suspended", definition: "BOOLEAN NOT NULL DEFAULT false" },
  { table: "users", column: "sessionsValidAfter", definition: "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" },
  // B2B monetization (0037). The profiles.accountType enum widening
  // (append 'employer') is intentionally NOT here: ADD COLUMN cannot widen an
  // existing ENUM, so it is applied by drizzle/0037_b2b_monetization.sql only.
  { table: "profiles", column: "anonymityOptIn", definition: "BOOLEAN NOT NULL DEFAULT false" },
  { table: "companyOpportunities", column: "sponsoredUntil", definition: "TIMESTAMP NULL" },
  { table: "companyOpportunities", column: "sponsoredTier", definition: "ENUM('standard','featured','spotlight') NULL" },
  { table: "resumeUploadSessions", column: "clientUploadId", definition: "VARCHAR(64) NULL" },
  { table: "resumeUploadSessions", column: "finalizationOwner", definition: "VARCHAR(64) NULL" },
  { table: "resumeUploadSessions", column: "finalizationLeaseUntil", definition: "TIMESTAMP NULL" },
  { table: "resumeUploadSessions", column: "permanentStorageKey", definition: "VARCHAR(1024) NULL" },
  { table: "referralAttachments", column: "uploadSessionId", definition: "VARCHAR(64) NULL" },
  { table: "referralRequests", column: "idempotencyKey", definition: "VARCHAR(64) NULL" },
  { table: "referralRequests", column: "requestFingerprint", definition: "VARCHAR(64) NULL" },
  { table: "referralRequests", column: "debitTransactionId", definition: "INT NULL" },
  { table: "tokenTransactions", column: "source", definition: "VARCHAR(40) NULL" },
  { table: "tokenTransactions", column: "sourceCycleKey", definition: "VARCHAR(16) NULL" },
  { table: "tokenTransactions", column: "referenceType", definition: "VARCHAR(40) NULL" },
  { table: "tokenTransactions", column: "referenceId", definition: "VARCHAR(80) NULL" },
  { table: "tokenTransactions", column: "idempotencyKey", definition: "VARCHAR(64) NULL" },
  { table: "tokenTransactions", column: "reversesTransactionId", definition: "INT NULL" },
  { table: "tokenTransactions", column: "rewardStatus", definition: "ENUM('pending','granted') NULL" },
  { table: "tokenTransactions", column: "qualifiedByType", definition: "VARCHAR(40) NULL" },
  { table: "tokenTransactions", column: "qualifiedById", definition: "VARCHAR(80) NULL" },
  { table: "tokenTransactions", column: "qualifiedAt", definition: "TIMESTAMP NULL" },
  { table: "tokenTransactions", column: "balanceAfter", definition: "INT NULL" },
  { table: "tokenTransactions", column: "monthlyCreditsAfter", definition: "INT NULL" },
  { table: "companyCoverageInvitations", column: "referralRequestId", definition: "INT NULL" },
];

// Indexes for OTP lookup and idempotency/atomic-spend contracts. Applied
// idempotently at boot: missing indexes are created, matching uniqueness is
// skipped, and mismatched uniqueness is dropped and recreated.
// Keep in sync with drizzle/schema.ts.
export const DESIRED_INDEXES: Array<{ table: string; name: string; columns: string; nonUnique?: boolean }> = [
  { table: "workEmailOtpCodes", name: "work_email_otp_active_idx", columns: "`email`,`consumedAt`,`expiresAt`,`createdAt`", nonUnique: true },
  { table: "resumeUploadSessions", name: "resume_upload_sessions_owner_client_unique", columns: "`ownerId`,`clientUploadId`" },
  { table: "referralAttachments", name: "referral_attachments_upload_session_unique", columns: "`uploadSessionId`" },
  { table: "referralRequests", name: "referral_requests_seeker_idempotency_unique", columns: "`jobSeekerId`,`idempotencyKey`" },
  { table: "tokenTransactions", name: "token_transactions_debit_reference_unique", columns: "`userId`,`role`,`kind`,`referenceType`,`referenceId`" },
  { table: "tokenTransactions", name: "token_transactions_idempotency_kind_unique", columns: "`userId`,`role`,`idempotencyKey`,`kind`" },
  { table: "tokenTransactions", name: "token_transactions_reversal_unique", columns: "`reversesTransactionId`" },
  { table: "notifications", name: "notifications_event_key_unique", columns: "`eventKey`" },
  { table: "companyCoverageInvitations", name: "coverage_invite_request_unique", columns: "`referralRequestId`" },
];

// The only DDL this module ever runs: the fixed ALTER/CREATE statements derived
// from DESIRED_COLUMNS + DESIRED_TABLES above. Nothing request-controlled is
// ever interpolated — the admin trigger just chooses WHEN the allowlist runs.
export type ReconcileStatementResult = { statement: string; ok: boolean; error?: string; errorCode?: string };

// Drizzle surfaces driver failures as DrizzleQueryError("Failed query: …
// params: …") with the real MySQL error on `cause` (code/errno/sqlState).
// Recording only err.message discards the diagnosis (missing table vs denied
// DDL vs no database selected vs lock timeout), so unwrap the cause chain.
export function isDuplicateColumnError(err: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (typeof current === "object") {
      const typed = current as { code?: unknown; errno?: unknown; sqlState?: unknown; cause?: unknown };
      if (typed.code === "ER_DUP_FIELDNAME" || typed.errno === 1060 || typed.sqlState === "42S21") return true;
      current = typed.cause;
    } else break;
  }
  return false;
}

export function isDuplicateEntryError(err: unknown): boolean {
  const seen = new Set<unknown>(); let current: unknown = err;
  while (current && !seen.has(current)) { seen.add(current); if (typeof current === "object") { const typed=current as {code?:unknown;errno?:unknown;sqlState?:unknown;cause?:unknown}; if (typed.code === "ER_DUP_ENTRY" || typed.errno === 1062 || typed.sqlState === "23000") return true; current=typed.cause; } else break; }
  return false;
}


export function reconcileErrorCode(err: unknown): string | undefined {
  const seen=new Set<unknown>(); let current:unknown=err;
  while(current&&!seen.has(current)){seen.add(current);if(typeof current==="object"){const typed=current as {code?:unknown;errno?:unknown;cause?:unknown};if(typeof typed.code==="string"&&typed.code.startsWith("ER_"))return typed.code;if(typeof typed.errno==="number")return `MYSQL_${typed.errno}`;current=typed.cause;}else break;}
  return undefined;
}

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
  let failed = false;
  try {
    const result = await db.execute(sql`SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, NULL AS INDEX_NAME, NULL AS NON_UNIQUE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() UNION ALL SELECT TABLE_NAME, NULL AS COLUMN_NAME, INDEX_NAME, NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()`);
    // mysql2's drizzle result HKT loses row typing on raw execute; cast like db.ts does.
    const rows = result[0] as unknown as Array<{ TABLE_NAME: string; COLUMN_NAME: string | null; COLUMN_TYPE?: string | null; INDEX_NAME?: string | null; NON_UNIQUE?: number | string | null }>;
    if (rows.length === 0) {
      // Zero visible columns means the follow-on ALTERs will all fail: either
      // a genuinely fresh database (run the drizzle migrations) or the
      // connection sees no tables (DATABASE_URL database name / privileges).
      console.error("[schema-reconcile] information_schema probe returned 0 columns; check DATABASE_URL database selection and grants before trusting per-statement errors below");
    }
    const existing = new Set(rows.filter(row => row.COLUMN_NAME).map(row => `${row.TABLE_NAME}.${row.COLUMN_NAME}`));
    const columnTypes = new Map(rows.filter(row => row.COLUMN_NAME).map(row => [`${row.TABLE_NAME}.${row.COLUMN_NAME}`, String(row.COLUMN_TYPE || "").toLowerCase()]));
    const existingIndexes = new Map(rows.filter(row => row.INDEX_NAME).map(row => [`${row.TABLE_NAME}.${row.INDEX_NAME}`, Number(row.NON_UNIQUE ?? 0)]));
    const existingTables = new Set(rows.map(row => row.TABLE_NAME));
    for (const { table, column, columnType, definition } of DESIRED_COLUMN_DEFINITIONS) {
      const key = `${table}.${column}`;
      if (columnTypes.get(key) === columnType.toLowerCase()) { skipped.push(`definition:${key}`); continue; }
      const stmt = `ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${definition}`;
      try { await db.execute(sql.raw(stmt)); results.push({ statement: stmt, ok: true }); applied.push(`definition:${key}`); }
      catch (err) { const error = describeReconcileError(err); results.push({ statement: stmt, ok: false, error }); if (!lastError) lastError = `[${stmt}] ${error}`; failed = true; console.error(`[schema-reconcile] definition failed: [${stmt}] ${error}`); }
    }
    for (const { table, column, definition } of DESIRED_COLUMNS) {
      if (existing.has(`${table}.${column}`)) { skipped.push(`${table}.${column}`); continue; }
      const stmt = `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`;
      try { await db.execute(sql.raw(stmt)); }
      catch (err) {
        // Another instance may add the column between the information_schema
        // probe and ALTER. MySQL duplicate-column is the successful end state.
        if (isDuplicateColumnError(err)) {
          results.push({ statement: stmt, ok: true });
          skipped.push(`${table}.${column}`);
          continue;
        }
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
    for (const index of DESIRED_INDEXES) {
      const key = `${index.table}.${index.name}`;
      const expectedNonUnique = index.nonUnique ? 1 : 0;
      if (existingIndexes.get(key) === expectedNonUnique) { skipped.push(`index:${key}`); continue; }
      const stmt = `CREATE ${index.nonUnique ? "" : "UNIQUE "}INDEX \`${index.name}\` ON \`${index.table}\` (${index.columns})`;
      try {
        const dedupe = index.name === "resume_upload_sessions_owner_client_unique"
          ? "UPDATE `resumeUploadSessions` s JOIN (SELECT ownerId,clientUploadId,MIN(id) canonicalId FROM (SELECT id,ownerId,clientUploadId FROM `resumeUploadSessions`) source WHERE clientUploadId IS NOT NULL GROUP BY ownerId,clientUploadId HAVING COUNT(*)>1) duplicates ON duplicates.ownerId=s.ownerId AND duplicates.clientUploadId=s.clientUploadId SET s.clientUploadId=NULL WHERE s.id<>duplicates.canonicalId"
          : index.name === "referral_attachments_upload_session_unique" ? "UPDATE `referralAttachments` a JOIN (SELECT uploadSessionId,MIN(id) canonicalId FROM (SELECT id,uploadSessionId FROM `referralAttachments`) source WHERE uploadSessionId IS NOT NULL GROUP BY uploadSessionId HAVING COUNT(*)>1) duplicates ON duplicates.uploadSessionId=a.uploadSessionId SET a.uploadSessionId=NULL WHERE a.id<>duplicates.canonicalId" : null;
        let created = false;
        if (existingIndexes.has(key)) await db.execute(sql.raw(`DROP INDEX \`${index.name}\` ON \`${index.table}\``));
        for (let attempt=1; attempt<=3 && !created; attempt++) {
          if (dedupe) await db.execute(sql.raw(dedupe));
          try { await db.execute(sql.raw(stmt)); created=true; }
          catch (err) {
            const code=reconcileErrorCode(err);
            if (code === "ER_DUP_KEYNAME" && attempt===1) { await db.execute(sql.raw(`DROP INDEX \`${index.name}\` ON \`${index.table}\``)); continue; }
            if (!isDuplicateEntryError(err) || attempt===3) throw err;
          }
        }
        results.push({ statement: stmt, ok: true }); applied.push(`index:${key}`);
      }
      catch (err) { const error = describeReconcileError(err); results.push({ statement: stmt, ok: false, error, errorCode: reconcileErrorCode(err) }); if (!lastError) lastError = `[${stmt}] ${error}`; failed = true; console.error(`[schema-reconcile] index failed: [${stmt}] ${error}`); }
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
  lastResults = results;
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
