/*
 * Diagnostic: run the runtime schema validation (DESIRED_TABLES / COLUMNS /
 * INDEXES / FOREIGN_KEYS from server/schemaReconcile.ts) directly against the
 * scratch QA database and print the failing check keys. The runtime health
 * endpoint only exposes a count; this names the drift.
 *
 * Guarded exactly like qa-reset-scratch.ts (scratch DB + non-admin login).
 * Run: DATABASE_URL=mysql://user:pass@host:3306/skipwait_qa npx tsx scripts/qa-schema-check.ts
 */
import mysql from "mysql2/promise";
import {
  DESIRED_TABLES,
  DESIRED_COLUMNS,
  DESIRED_INDEXES,
  DESIRED_FOREIGN_KEYS,
} from "../server/schemaReconcile";

const url = process.env.DATABASE_URL ?? "";
const parsed = new URL(url);
const urlDb = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
if (urlDb !== "skipwait_qa") {
  console.error(`Refusing: DATABASE_URL database is "${urlDb}", not exactly "skipwait_qa".`);
  process.exit(1);
}
if ((parsed.username || "").toLowerCase().includes("admin")) {
  console.error("Refusing: admin login. Use the scoped QA login.");
  process.exit(1);
}

const key = (...parts: Array<string | null | undefined>) =>
  parts.map((p) => (p ?? "").toLowerCase()).join(".");

async function main() {
  const conn = await mysql.createConnection({
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: urlDb,
    ssl: { rejectUnauthorized: false },
  });
  const [colRows] = await conn.query(
    `SELECT TABLE_NAME, COLUMN_NAME, NULL AS INDEX_NAME, NULL AS NON_UNIQUE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
     UNION ALL
     SELECT TABLE_NAME, NULL AS COLUMN_NAME, INDEX_NAME, NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()`,
  );
  const rows = colRows as Array<{ TABLE_NAME: string; COLUMN_NAME: string | null; INDEX_NAME?: string | null; NON_UNIQUE?: number | string | null }>;
  const columns = new Set(rows.filter((r) => r.COLUMN_NAME).map((r) => key(r.TABLE_NAME, r.COLUMN_NAME)));
  const tables = new Set(rows.map((r) => r.TABLE_NAME.toLowerCase()));
  const indexes = new Map(
    rows.filter((r) => r.INDEX_NAME).map((r) => [key(r.TABLE_NAME, r.INDEX_NAME), Number(r.NON_UNIQUE ?? 0)]),
  );
  const [fkRows] = await conn.query(
    `SELECT TABLE_NAME,COLUMN_NAME,CONSTRAINT_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME
     FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`,
  );
  const fks = new Set(
    (fkRows as Array<{ TABLE_NAME: string; COLUMN_NAME: string; REFERENCED_TABLE_NAME: string; REFERENCED_COLUMN_NAME: string }>).map(
      (r) => `${key(r.TABLE_NAME, r.COLUMN_NAME)}->${key(r.REFERENCED_TABLE_NAME, r.REFERENCED_COLUMN_NAME)}`,
    ),
  );

  const failing: string[] = [];
  for (const t of DESIRED_TABLES) if (!tables.has(t.table.toLowerCase())) failing.push(`table:${t.table}`);
  for (const c of DESIRED_COLUMNS) if (!columns.has(key(c.table, c.column))) failing.push(`column:${c.table}.${c.column}`);
  for (const i of DESIRED_INDEXES) {
    const actual = indexes.get(key(i.table, i.name));
    if (actual !== (i.nonUnique ? 1 : 0)) failing.push(`index:${i.table}.${i.name} (want nonUnique=${i.nonUnique ? 1 : 0}, got ${actual ?? "missing"})`);
  }
  for (const f of DESIRED_FOREIGN_KEYS) {
    const want = `${key(f.table, f.column)}->${key(f.referencedTable, f.referencedColumn)}`;
    if (!fks.has(want)) failing.push(`fk:${f.table}.${f.column}->${f.referencedTable}.${f.referencedColumn}`);
  }

  console.log(`checked ${DESIRED_TABLES.length} tables, ${DESIRED_COLUMNS.length} columns, ${DESIRED_INDEXES.length} indexes, ${DESIRED_FOREIGN_KEYS.length} fks`);
  console.log(`tables present in DB: ${tables.size}`);
  if (failing.length === 0) {
    console.log("ALL CHECKS PASS");
  } else {
    console.log(`FAILING CHECKS (${failing.length}):`);
    for (const f of failing) console.log(`  ${f}`);
  }
  await conn.end();
  process.exit(failing.length ? 2 : 0);
}

main().catch((e) => {
  console.error("check error:", e instanceof Error ? e.message : e);
  process.exit(1);
});
