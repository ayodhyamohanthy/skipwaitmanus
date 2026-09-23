#!/usr/bin/env node
/**
 * Provisions the throwaway MySQL sandbox used by `server/mysqlTest/`.
 *
 * The schema is generated from `drizzle/schema.ts` with `drizzle-kit export`,
 * so the sandbox is always the exact shape the application code is typed
 * against. Nothing here reads `drizzle/meta/_journal.json` and nothing here can
 * reach a real database: the deploy migration path stays out of test scope.
 *
 * Usage: MYSQL_TEST_URL=mysql://user:pass@127.0.0.1:3306/skipwait_test \
 *          node scripts/prepare-mysql-test-schema.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import mysql from "mysql2/promise";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEST_DB_NAME = /^skipwait_test[0-9a-z_]*$/i;
const DDL_START = /^(CREATE TABLE|CREATE INDEX|CREATE UNIQUE INDEX|ALTER TABLE)\b/;
const CREATE_TABLE = /^CREATE TABLE `([^`]+)`/;
const MIN_MYSQL = { major: 8, minor: 0, patch: 13 };

/** Unique indexes the concurrency specs reason about. Drift here is a hard
 * failure: which invariants InnoDB can enforce is exactly what a race test
 * claims, so a silently missing UNIQUE would turn a real bug into a "pass". */
const REQUIRED_UNIQUE_INDEXES = [
  "users.users_openId_unique",
  "tokenBalances.token_balances_user_role_unique",
  "tokenTransactions.token_transactions_debit_reference_unique",
  "tokenTransactions.token_transactions_idempotency_kind_unique",
  "tokenTransactions.token_transactions_reversal_unique",
  "referralRequests.referral_requests_seeker_idempotency_unique",
  "referralTransitionEvents.referral_transition_operation_unique",
  "referralTransitionEvents.referral_transition_revision_unique",
  "companyCoverageInvitations.coverage_invite_code_unique",
  "companyCoverageInvitations.coverage_invite_request_unique",
  "companyCoverageRewards.coverage_reward_invitation_unique",
  "companyCoverageRewards.coverage_reward_joiner_unique",
  "notifications.notifications_event_key_unique",
];

class SandboxError extends Error {}

function parseTestUrl() {
  const raw = process.env.MYSQL_TEST_URL;
  if (!raw) throw new SandboxError("MYSQL_TEST_URL is required (mysql://user:pass@host:port/skipwait_test)");
  const url = new URL(raw);
  const database = url.pathname.replace(/^\//, "");
  if (!TEST_DB_NAME.test(database)) {
    throw new SandboxError(`refusing to rebuild "${database}": the sandbox name must match ${TEST_DB_NAME}`);
  }
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

function exportedDdl() {
  const result = spawnSync(
    "npx",
    ["--no-install", "drizzle-kit", "export", "--config=drizzle.config.ts", "--sql"],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, DATABASE_URL: process.env.MYSQL_TEST_URL ?? "" } },
  );
  if (result.status !== 0) {
    throw new SandboxError(`drizzle-kit export failed (${result.status}): ${result.stderr?.trim() || result.stdout?.trim() || "no output"}`);
  }
  const lines = (result.stdout ?? "").split("\n");
  const start = lines.findIndex(line => DDL_START.test(line.trim()));
  if (start === -1) throw new SandboxError(`no DDL in drizzle-kit export output:\n${lines.slice(0, 20).join("\n")}`);
  const statements = lines.slice(start).join("\n").split(";").map(line => line.trim()).filter(Boolean);
  const unexpected = statements.find(statement => !DDL_START.test(statement));
  if (unexpected) throw new SandboxError(`unclassifiable DDL statement:\n${unexpected.slice(0, 400)}`);
  const tables = statements.flatMap(statement => {
    const match = statement.match(CREATE_TABLE);
    if (!statement.startsWith("CREATE TABLE")) return [];
    if (!match) throw new SandboxError(`CREATE TABLE name could not be parsed:\n${statement.slice(0, 200)}`);
    return [match[1]];
  });
  console.log(`[sandbox] ${statements.length} DDL statements for ${tables.length} tables, generated from drizzle/schema.ts`);
  return { statements, tables };
}

async function openSandboxConnection(testUrl) {
  // Connect without a database first: the sandbox may not exist yet, and the
  // server rejects a CREATE DATABASE while a client has it selected.
  const connection = await mysql.createConnection({
    host: testUrl.host,
    port: testUrl.port,
    user: testUrl.user,
    password: testUrl.password,
    multipleStatements: false,
  });
  const [present] = await connection.query("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?", [testUrl.database]);
  if (present.length === 0) await connection.query(`CREATE DATABASE \`${testUrl.database}\``);
  await connection.query(`USE \`${testUrl.database}\``);
  return connection;
}

async function assertSupportedServer(connection) {
  const [versionRows] = await connection.query("SELECT VERSION() AS version");
  const version = String(versionRows[0]?.version ?? "");
  if (/mariadb/i.test(version)) {
    throw new SandboxError(`unsupported sandbox server "${version}": MariaDB locks differently, so results would not describe production InnoDB`);
  }
  const [major, minor, patch] = version.split("-")[0].split(".").map(Number);
  const tooOld =
    major < MIN_MYSQL.major ||
    (major === MIN_MYSQL.major && (minor < MIN_MYSQL.minor || (minor === MIN_MYSQL.minor && patch < MIN_MYSQL.patch)));
  if (tooOld) {
    throw new SandboxError(`unsupported sandbox server "${version}": expression column defaults need MySQL ${MIN_MYSQL.major}.${MIN_MYSQL.minor}.${MIN_MYSQL.patch}+`);
  }
  const [isolationRows] = await connection.query("SELECT @@transaction_isolation AS isolationLevel, @@innodb_lock_wait_timeout AS lockWaitTimeout, @@collation_database AS collation");
  const isolation = isolationRows[0];
  console.log(`[sandbox] server ${version} · isolation ${isolation.isolationLevel} · lock wait ${isolation.lockWaitTimeout}s · collation ${isolation.collation}`);
}

async function rebuild(connection, ddl) {
  await connection.query("SET FOREIGN_KEY_CHECKS = 0");
  const [existing] = await connection.query(
    "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'",
  );
  for (const row of existing) await connection.query(`DROP TABLE IF EXISTS \`${row.name}\``);
  if (existing.length) console.log(`[sandbox] dropped ${existing.length} pre-existing tables`);
  for (const statement of ddl.statements) {
    try {
      await connection.query(statement);
    } catch (error) {
      throw new SandboxError(`DDL rejected by the sandbox: ${error.sqlMessage ?? error.message}\n${statement.slice(0, 400)}`);
    }
  }
  await connection.query("SET FOREIGN_KEY_CHECKS = 1");
}

async function verify(connection, ddl) {
  const [rows] = await connection.query(
    "SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'",
  );
  const engineByName = new Map(rows.map(row => [row.name, row.engine]));
  const missing = ddl.tables.filter(table => !engineByName.has(table));
  if (missing.length) throw new SandboxError(`sandbox is missing tables: ${missing.join(", ")}`);
  const notInnoDB = [...engineByName.entries()].filter(([, engine]) => engine !== "InnoDB");
  if (notInnoDB.length) {
    throw new SandboxError(`sandbox tables are not InnoDB, so row and gap locks do not apply: ${notInnoDB.map(([name, engine]) => `${name}=${engine}`).join(", ")}`);
  }
  const [indexes] = await connection.query(
    "SELECT DISTINCT TABLE_NAME AS tableName, INDEX_NAME AS indexName FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'",
  );
  const present = new Set(indexes.map(row => `${row.tableName}.${row.indexName}`));
  const missingIndexes = REQUIRED_UNIQUE_INDEXES.filter(index => !present.has(index));
  if (missingIndexes.length) throw new SandboxError(`sandbox is missing UNIQUE constraints: ${missingIndexes.join(", ")}`);
  console.log(`[sandbox] ready: ${engineByName.size} InnoDB tables, ${REQUIRED_UNIQUE_INDEXES.length} required UNIQUE constraints verified`);
}

async function main() {
  const testUrl = parseTestUrl();
  const ddl = exportedDdl();
  const connection = await openSandboxConnection(testUrl);
  try {
    await assertSupportedServer(connection);
    await rebuild(connection, ddl);
    await verify(connection, ddl);
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(`[sandbox] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
