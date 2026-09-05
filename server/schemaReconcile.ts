import { sql } from "drizzle-orm";
import { getDb } from "./db";

// Columns the running code expects. Each entry is applied idempotently at boot
// when missing (MySQL 8.0 has no ADD COLUMN IF NOT EXISTS, so check
// information_schema first). Add new columns here AND to drizzle/schema.ts.
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

let reconciled = false;

export async function reconcileSchema(): Promise<{ applied: string[]; skipped: string[] }> {
  // Success is cached forever. A failed or deferred attempt (DB connection not
  // ready at boot) is retried on later calls — the information_schema probe
  // makes every run idempotent, so retrying is safe.
  if (reconciled) return { applied: [], skipped: [] };
  const db = await getDb();
  if (!db) return { applied: [], skipped: [] };
  const applied: string[] = [];
  const skipped: string[] = [];
  try {
    const result = await db.execute(sql`SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`);
    // mysql2's drizzle result HKT loses row typing on raw execute; cast like db.ts does.
    const rows = result[0] as unknown as Array<{ TABLE_NAME: string; COLUMN_NAME: string }>;
    const existing = new Set(rows.map(row => `${row.TABLE_NAME}.${row.COLUMN_NAME}`));
    for (const { table, column, definition } of DESIRED_COLUMNS) {
      if (existing.has(`${table}.${column}`)) { skipped.push(`${table}.${column}`); continue; }
      await db.execute(sql.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`));
      applied.push(`${table}.${column}`);
    }
    reconciled = true;
    console.log(`[schema-reconcile] applied=${applied.length} skipped=${skipped.length}${applied.length ? " -> " + applied.join(",") : ""}`);
  } catch (error) {
    // Never crash the server for reconcile failures; log and continue.
    console.error("[schema-reconcile] failed (non-fatal):", error instanceof Error ? error.message : error);
  }
  return { applied, skipped };
}

export function isSchemaReconciled() { return reconciled; }
