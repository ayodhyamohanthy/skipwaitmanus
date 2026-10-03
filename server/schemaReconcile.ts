import { sql } from "drizzle-orm";
import { getDb } from "./db";

// Columns and indexes the running code expects. Each entry is applied
// idempotently at boot when missing (MySQL 8.0 has no ADD COLUMN IF NOT
// EXISTS, so check information_schema first). Add new columns here AND to
// drizzle/schema.ts. Tables are NOT applied here: they come from the
// drizzle/deploy migrations, and server/schemaDeployGuard.test.ts fails if
// a required table has no CREATE TABLE there. Keep in sync with drizzle/schema.ts.
export const DESIRED_TABLES: Array<{ table: string }> = [
  { table: "referralRequestSaves" },
  { table: "referralRequestPasses" },
  { table: "workEmailOtpRateLimits" },
  { table: "employerPaymentFulfillments" },
  { table: "employerAccounts" },
  { table: "employerTalentRefs" },
  { table: "employerTalentIntroRequests" },
  { table: "profileUnlocks" },
  { table: "partnerModules" },
  { table: "userFollows" },
  { table: "promoCreditGrants" },
  { table: "giftSubscriptionFulfillments" },
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

// Centralized safe diagnostic serializer for failed reconciliation attempts.
// Built on describeReconcileError; adds error classification, attempt number,
// and backoff delay. Defensively redacts connection strings, credentials,
// tokens, and driver-echoed SQL params so logs never carry secrets or user data.
export function redactReconcileLogText(text: string): string {
  let out = text;
  const envUrl = process.env.DATABASE_URL;
  if (envUrl) {
    out = out.split(envUrl).join("[redacted-database-url]");
    try {
      const parsed = new URL(envUrl);
      if (parsed.password) out = out.split(parsed.password).join("[redacted]");
      if (parsed.username) out = out.split(parsed.username).join("[redacted-user]");
      if (parsed.hostname) out = out.split(parsed.hostname).join("[redacted-host]");
    } catch { /* non-URL value: exact-match redaction above suffices */ }
  }
  out = out.replace(/[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s'"]+/g, "[redacted-connection-string]");
  out = out.replace(/\bparams\s*:\s*\[[^\]]*\]/gi, "params: [redacted]");
  out = out.replace(/(password|passwd|pwd|secret|token|api[_-]?key|auth(?:orization)?|credential|DATABASE_URL|connection[_-]?string)\s*[:=]\s*('[^']*'|"[^"]*"|[^\s'";,]+)/gi, "$1=[redacted]");
  out = out.replace(/(\bpass(?:word)?\b\s*[:=]\s*)([^\s'";,]+)/gi, "$1[redacted]");
  out = out.replace(/Bearer\s+[A-Za-z0-9\-._~+/=]+/g, "Bearer [redacted]");
  return out.length > 2000 ? `${out.slice(0, 2000)}…[truncated]` : out;
}

export type ReconcileFailureReason = "validation_error" | "db_unavailable" | "db_error" | "schema_mismatch";

export function formatSafeReconcileDiagnostic(error: unknown, opts: { attempt: number; nextDelayMs?: number | null; reason: ReconcileFailureReason }): string {
  const code = reconcileErrorCode(error) ?? (opts.reason === "db_unavailable" ? "DB_UNAVAILABLE" : "UNKNOWN");
  const message = error instanceof Error ? error.message : String(error ?? opts.reason);
  const described = error === null || error === undefined ? opts.reason : describeReconcileError(error);
  return redactReconcileLogText(
    `attempt=${opts.attempt} reason=${opts.reason} code=${code} nextDelayMs=${opts.nextDelayMs ?? "none"} message=${message} detail=${described}`,
  );
}

let reconciled = false;
let lastError: string | null = null;
let lastResults: ReconcileStatementResult[] = [];
let inFlight: Promise<{ applied: string[]; skipped: string[] }> | null = null;
let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
let recoveryAttempts = 0;
let recoveryBaseDelayMs = 1000;
let recoveryMaxDelayMs = 30000;

function computeBackoffDelayMs(failedAttempt: number): number {
  return Math.min(recoveryBaseDelayMs * 2 ** Math.min(Math.max(failedAttempt - 1, 0), 5), recoveryMaxDelayMs);
}

function logFailedReconcileAttempt(error: unknown, reason: ReconcileFailureReason): void {
  recoveryAttempts += 1;
  console.error("[schema-validation]", formatSafeReconcileDiagnostic(error, { attempt: recoveryAttempts, nextDelayMs: computeBackoffDelayMs(recoveryAttempts), reason }));
}

export async function reconcileSchema(): Promise<{ applied: string[]; skipped: string[] }> {
  // Schema changes belong to versioned migrations. Runtime validation is
  // deliberately read-only so startup and public health traffic can never run DDL.
  if (reconciled) return { applied: [], skipped: [] };
  if (inFlight) return inFlight;
  let db: Awaited<ReturnType<typeof getDb>>;
  try {
    db = await getDb();
  } catch (error) {
    // Preserve the throw contract (admin trigger answers 500) while emitting
    // the single per-attempt diagnostic through the centralized serializer.
    // The recovery loop's catch skips re-logging via the marker below.
    logFailedReconcileAttempt(error, "db_error");
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { __reconcileLogged: true });
  }
  if (!db) {
    logFailedReconcileAttempt(null, "db_unavailable");
    console.error("[schema-validation] DB-unavailable: no database handle (DATABASE_URL unset or connect failed)");
    return { applied: [], skipped: [] };
  }
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
      logFailedReconcileAttempt(error, "validation_error");
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

// Boot-time recovery loop: retry read-only validation with backoff until it
// passes. Boot never blocks on the DB; /api/health/ready stays 503 meanwhile
// (validating/failed) and flips to 200 once reconciled. SELECT-only — the
// retry chooses WHEN validation runs, never WHAT it runs.
export function startSchemaReconcileRecovery(options?: { baseDelayMs?: number; maxDelayMs?: number }) {
  if (reconciled || recoveryTimer) return;
  recoveryBaseDelayMs = options?.baseDelayMs ?? 1000;
  recoveryMaxDelayMs = options?.maxDelayMs ?? 30000;
  const scheduleNext = () => {
    // Exception/null paths already counted this failure when they logged.
    // A silent mismatch (no exception) still backs off: count it here so the
    // delay grows instead of hot-looping.
    const before = recoveryAttempts;
    void reconcileSchema()
      .catch((error: unknown) => {
        if (!(error instanceof Error) || !(error as { __reconcileLogged?: unknown }).__reconcileLogged) {
          logFailedReconcileAttempt(error, "db_error");
        }
        return { applied: [], skipped: [] as string[] };
      })
      .then(() => {
        if (isSchemaReconciled()) {
          stopSchemaReconcileRecovery();
          return;
        }
        if (recoveryAttempts === before) recoveryAttempts += 1;
        const delayMs = computeBackoffDelayMs(recoveryAttempts);
        if (recoveryTimer) return;
        recoveryTimer = setTimeout(() => {
          recoveryTimer = null;
          scheduleNext();
        }, delayMs);
        if (typeof recoveryTimer.unref === "function") recoveryTimer.unref();
      });
  };
  scheduleNext();
}
export function stopSchemaReconcileRecovery() {
  if (recoveryTimer) {
    clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }
  recoveryAttempts = 0;
}
