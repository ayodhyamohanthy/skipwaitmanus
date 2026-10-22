/*
 * Guarded reset of the SCRATCH QA database (skipwait_qa) so a definitions-only
 * schema sync (drizzle-kit push) starts from an empty schema and cannot hang on
 * interactive rename prompts caused by stale leftover tables.
 *
 * Guards (all must pass, else it refuses and exits non-zero):
 *  1. DATABASE_URL's database name is exactly "skipwait_qa".
 *  2. The connected session's DATABASE() is exactly "skipwait_qa".
 *  3. The connected login is the scoped QA login: its name contains "qa"
 *     (case-insensitive) and is never the server admin "skipwaitadmin".
 *  4. Tables are listed first; if a users table exists with more than 50 rows
 *     (prod-scale data, not fictional fixtures) it refuses.
 * FICTIONAL scratch data only. Never point this at prod.
 *
 * Run: DATABASE_URL=mysql://user:pass@host:3306/skipwait_qa npx tsx scripts/qa-reset-scratch.ts
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL ?? "";
const parsed = new URL(url);
const urlDb = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
if (urlDb !== "skipwait_qa") {
  console.error(`Refusing: DATABASE_URL database is "${urlDb}", not exactly "skipwait_qa".`);
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection({
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: urlDb,
    ssl: { rejectUnauthorized: false },
  });

  const [whoRows] = await conn.query("SELECT DATABASE() AS db, CURRENT_USER() AS cu");
  const who = (whoRows as Array<{ db: string | null; cu: string }>)[0];
  if (who.db !== "skipwait_qa") {
    console.error(`Refusing: connected DATABASE() is "${who.db}", not exactly "skipwait_qa".`);
    process.exit(1);
  }
  const login = who.cu.split("@")[0].replace(/^'|'$/g, "");
  if (login === "skipwaitadmin" || !/qa/i.test(login)) {
    console.error(`Refusing: connected as ${who.cu} - not the scoped QA login.`);
    process.exit(1);
  }
  console.log(`Guards 1-3 pass: database=${who.db}, login=${who.cu}`);

  const [tableRows] = await conn.query(
    "SELECT TABLE_NAME, TABLE_TYPE, TABLE_ROWS AS approx_rows FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'skipwait_qa' ORDER BY TABLE_NAME",
  );
  const tables = tableRows as Array<{ TABLE_NAME: string; TABLE_TYPE: string; approx_rows: number | null }>;
  console.log(`Guard 4: ${tables.length} existing tables/views in skipwait_qa:`);
  for (const t of tables) console.log(`  - ${t.TABLE_NAME} (${t.TABLE_TYPE}, ~${t.approx_rows ?? "?"} rows)`);
  const usersTable = tables.find((t) => t.TABLE_NAME === "users");
  if (usersTable && (usersTable.approx_rows ?? 0) > 50) {
    console.error(`Refusing: users table has ~${usersTable.approx_rows} rows - that is prod-scale data, not fictional fixtures.`);
    process.exit(1);
  }

  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const t of tables) {
    if (t.TABLE_TYPE === "VIEW") {
      await conn.query(`DROP VIEW IF EXISTS \`${t.TABLE_NAME}\``);
    } else {
      await conn.query(`DROP TABLE IF EXISTS \`${t.TABLE_NAME}\``);
    }
    console.log(`dropped ${t.TABLE_NAME}`);
  }
  await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  await conn.end();
  console.log("skipwait_qa reset complete: schema is empty, ready for definitions-only sync.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
