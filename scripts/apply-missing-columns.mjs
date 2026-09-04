/**
 * Idempotent live-DB column reconciler.
 * MySQL 8.0 (Azure) does not support `ADD COLUMN IF NOT EXISTS`, so this
 * checks information_schema before altering. Safe to run repeatedly.
 *
 * Usage:
 *   DATABASE_URL='mysql://user:pass@host:3306/db' node scripts/apply-missing-columns.mjs
 * (falls back to .env when DATABASE_URL is not in the environment)
 */
import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

function loadDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(repoRoot, ".env"), "utf8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
    if (line && line.slice(13).trim()) return line.slice(13).trim();
  } catch {}
  throw new Error("DATABASE_URL not set in env or .env");
}

const DESIRED = {
  companyOpportunities: { compensation: "TEXT NULL" },
  jobs: { compensation: "TEXT NULL" },
  referralRequests: { savedAt: "TIMESTAMP NULL" },
};

const url = new URL(loadDbUrl());
const dbName = url.pathname.replace(/^\//, "");
const conn = await createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username || "root"),
  password: decodeURIComponent(url.password || ""),
  database: dbName,
  ssl: { rejectUnauthorized: false },
});

let applied = 0, skipped = 0;
for (const [table, columns] of Object.entries(DESIRED)) {
  const [rows] = await conn.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
    [dbName, table]
  );
  const existing = new Set(rows.map((r) => r.COLUMN_NAME));
  for (const [column, def] of Object.entries(columns)) {
    if (existing.has(column)) {
      console.log(`SKIP  \`${table}\`.\`${column}\` already present`);
      skipped++;
    } else {
      await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${def}`);
      console.log(`APPLY \`${table}\`.\`${column}\` ${def}`);
      applied++;
    }
  }
}
console.log(`\nDone: ${applied} column(s) added, ${skipped} already present.`);
await conn.end();
