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
  { table: "employerPaymentFulfillments", createSql: `CREATE TABLE IF NOT EXISTS \`employerPaymentFulfillments\` (\`id\` int AUTO_INCREMENT NOT NULL, \`provider\` varchar(32) NOT NULL, \`providerOrderId\` varchar(255) NOT NULL, \`providerPaymentId\` varchar(255), \`userId\` int NOT NULL, \`pack\` ENUM('starter','growth','scale') NOT NULL, \`amount\` int NOT NULL, \`currency\` varchar(3) NOT NULL, \`status\` ENUM('creating','provider_create_in_progress','pending','processing','credited','requires_review','expired','canceled') NOT NULL DEFAULT 'creating', \`attemptCount\` int NOT NULL DEFAULT 0, \`lastError\` varchar(500), \`creditedAt\` timestamp NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`employerPaymentFulfillments_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`employer_payment_provider_order_unique\`(\`provider\`,\`providerOrderId\`), UNIQUE INDEX \`employer_payment_provider_payment_unique\`(\`provider\`,\`providerPaymentId\`), INDEX \`employer_payment_user_status_idx\`(\`userId\`,\`status\`))` },
  { table: "employerAccounts", createSql: `CREATE TABLE IF NOT EXISTS \`employerAccounts\` (\`id\` int AUTO_INCREMENT NOT NULL, \`userId\` int NOT NULL, \`companyName\` varchar(160) NOT NULL, \`billingEmail\` varchar(320) NOT NULL, \`credits\` int NOT NULL DEFAULT 0, \`budgetMonthlyUsdCents\` int NOT NULL DEFAULT 0, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`employerAccounts_id\` PRIMARY KEY(\`id\`))` },
  { table: "employerTalentRefs", createSql: `CREATE TABLE IF NOT EXISTS \`employerTalentRefs\` (\`id\` int AUTO_INCREMENT NOT NULL, \`employerUserId\` int NOT NULL, \`seekerProfileUserId\` int NOT NULL, \`publicRef\` varchar(64) NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`employerTalentRefs_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`employer_talent_refs_public_unique\` UNIQUE(\`publicRef\`), CONSTRAINT \`employer_talent_refs_pair_unique\` UNIQUE(\`employerUserId\`,\`seekerProfileUserId\`), INDEX \`employer_talent_refs_scope_idx\` (\`employerUserId\`,\`publicRef\`))` },
  { table: "employerTalentIntroRequests", createSql: `CREATE TABLE IF NOT EXISTS \`employerTalentIntroRequests\` (\`id\` int AUTO_INCREMENT NOT NULL, \`employerUserId\` int NOT NULL, \`seekerProfileUserId\` int NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`employerTalentIntroRequests_id\` PRIMARY KEY(\`id\`), CONSTRAINT \`employer_talent_intro_pair_unique\` UNIQUE(\`employerUserId\`,\`seekerProfileUserId\`))` },
  { table: "profileUnlocks", createSql: `CREATE TABLE IF NOT EXISTS \`profileUnlocks\` (\`id\` int AUTO_INCREMENT NOT NULL, \`employerUserId\` int NOT NULL, \`seekerProfileUserId\` int NOT NULL, \`unlockedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`creditsSpent\` int NOT NULL, CONSTRAINT \`profileUnlocks_id\` PRIMARY KEY(\`id\`))` },
  { table: "partnerModules", createSql: `CREATE TABLE IF NOT EXISTS \`partnerModules\` (\`id\` int AUTO_INCREMENT NOT NULL, \`partnerName\` varchar(160) NOT NULL, \`category\` ENUM('interview_prep','resume_vetting','skill_assessment','other') NOT NULL, \`headline\` varchar(255) NOT NULL, \`description\` text NOT NULL, \`targetRoles\` text, \`ctaLabel\` varchar(80) NOT NULL, \`ctaUrl\` varchar(1024) NOT NULL, \`isActive\` boolean NOT NULL DEFAULT true, \`impressions\` int NOT NULL DEFAULT 0, \`clicks\` int NOT NULL DEFAULT 0, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, CONSTRAINT \`partnerModules_id\` PRIMARY KEY(\`id\`))` },
  { table: "userFollows", createSql: `CREATE TABLE IF NOT EXISTS \`userFollows\` (\`id\` int AUTO_INCREMENT NOT NULL, \`followerUserId\` int NOT NULL, \`followingUserId\` int NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT \`userFollows_id\` PRIMARY KEY(\`id\`), UNIQUE INDEX \`user_follows_pair_unique\`(\`followerUserId\`, \`followingUserId\`), INDEX \`user_follows_following_idx\`(\`followingUserId\`))` },
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
  // Schema changes belong to versioned migrations. Runtime validation is
  // deliberately read-only so startup and public health traffic can never run DDL.
  if (reconciled) return { applied: [], skipped: [] };
  if (inFlight) return inFlight;
  const db = await getDb();
  if (!db) return { applied: [], skipped: [] };
  const run = (async () => {
    const results: ReconcileStatementResult[] = [];
    lastError = null;
    try {
      const result = await db.execute(sql`SELECT TABLE_NAME, COLUMN_NAME, NULL AS INDEX_NAME, NULL AS NON_UNIQUE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() UNION ALL SELECT TABLE_NAME, NULL AS COLUMN_NAME, INDEX_NAME, NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()`);
      const rows = result[0] as unknown as Array<{ TABLE_NAME: string; COLUMN_NAME: string | null; INDEX_NAME?: string | null; NON_UNIQUE?: number | string | null }>;
      // Azure MySQL can return table identifiers folded to lowercase when
      // lower_case_table_names is enabled. Compare identifiers case-insensitively
      // while keeping the public validation keys in their canonical source form.
      const schemaKey = (...parts: Array<string | null | undefined>) => parts.map(part => part?.toLowerCase() ?? "").join(".");
      const columns = new Set(rows.filter(row => row.COLUMN_NAME).map(row => schemaKey(row.TABLE_NAME, row.COLUMN_NAME)));
      const tables = new Set(rows.map(row => row.TABLE_NAME.toLowerCase()));
      const indexes = new Map(rows.filter(row => row.INDEX_NAME).map(row => [schemaKey(row.TABLE_NAME, row.INDEX_NAME), Number(row.NON_UNIQUE ?? 0)]));
      const checks: Array<{ key: string; ok: boolean }> = [
        ...DESIRED_COLUMNS.map(item => ({ key: `column:${item.table}.${item.column}`, ok: columns.has(schemaKey(item.table, item.column)) })),
        ...DESIRED_TABLES.map(item => ({ key: `table:${item.table}`, ok: tables.has(item.table.toLowerCase()) })),
        ...DESIRED_INDEXES.map(item => ({ key: `index:${item.table}.${item.name}`, ok: indexes.get(schemaKey(item.table, item.name)) === (item.nonUnique ? 1 : 0) })),
      ];
      const fkResult = await db.execute(sql`SELECT TABLE_NAME,COLUMN_NAME,CONSTRAINT_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`);
      const foreignKeys = new Set((fkResult[0] as unknown as Array<{ TABLE_NAME:string; COLUMN_NAME:string; REFERENCED_TABLE_NAME:string; REFERENCED_COLUMN_NAME:string }>).map(row => `${schemaKey(row.TABLE_NAME, row.COLUMN_NAME)}->${schemaKey(row.REFERENCED_TABLE_NAME, row.REFERENCED_COLUMN_NAME)}`));
      checks.push(
        { key: "fk:referralAttachments.uploadSessionId", ok: foreignKeys.has(`${schemaKey("referralAttachments", "uploadSessionId")}->${schemaKey("resumeUploadSessions", "id")}`) },
        { key: "fk:resumeUploadChunks.acceptedAttemptId", ok: foreignKeys.has(`${schemaKey("resumeUploadChunks", "acceptedAttemptId")}->${schemaKey("resumeUploadAttempts", "id")}`) },
      );
      for (const check of checks) results.push({ statement: check.key, ok: check.ok, ...(!check.ok ? { errorCode: "SCHEMA_MISMATCH" } : {}) });
      const failed = checks.filter(check => !check.ok);
      if (failed.length) lastError = `Schema validation failed (${failed.length} checks)`;
      else reconciled = true;
      lastResults = results;
      return { applied: [], skipped: checks.filter(check => check.ok).map(check => check.key) };
    } catch (error) {
      lastError = "Schema validation unavailable";
      lastResults = [];
      console.error("[schema-validation] unavailable", reconcileErrorCode(error) ?? "UNKNOWN");
      return { applied: [], skipped: [] };
    }
  })();
  inFlight = run;
  try { return await run; } finally { if (inFlight === run) inFlight = null; }
}
export function isSchemaReconciled() { return reconciled; }
export function getLastReconcileError() { return lastError; }
// Per-statement outcome of the most recent run (empty until one has happened;
// the array is reset at the start of every run).
export function getLastReconcileResults() { return lastResults; }
