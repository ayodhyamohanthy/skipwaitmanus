#!/usr/bin/env node
// GATE-e2e-journeys (D-212): the real database and the real server the e2e
// journeys run against (docs/plans/GATE-delivery.md, steps 1 and 2).
//
//   node scripts/e2e-server.mjs prepare   base schema + deploy migrations twice + drift
//   node scripts/e2e-server.mjs start     seed the test accounts, then run dist/index.js
//
// `prepare` builds the schema the way production will get it (GATE-migration-apply,
// D-212): `drizzle-kit push` of the PR's BASE revision `schema.ts`, then
// scripts/apply-deploy-migrations.sh run twice. The second run must apply nothing
// (runner and ledger idempotence). Because the base is what `main` already has, a
// deploy file's `CREATE TABLE` executes for real instead of no-oping against a
// schema the PR itself just pushed. A second database, `skipwait_head`, is built
// from the PR's own `schema.ts` and compared with the migrated one: a table or
// column the PR declares that no deploy migration creates fails the job.
// The journal (`drizzle/*.sql`) is not applied: it cannot rebuild production
// (D-239, packet §3) and production never runs it.
//
// `start` never writes rows by hand: scripts/seed-test-accounts.ts creates the
// seeker, the verified referrer and the admin, and their session cookies are
// written to e2e/.auth/seed.json for the journeys. The server runs with
// NODE_ENV=test and no WorkOS keys, so the dev sign-in plane is on. Nothing here
// may point at a real database: it refuses any host other than localhost.
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { baseRevisionOf, compareSchemas, gateVerdict, normalizeSnapshot, pushOutcome } from "./migrationGateCore.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const E2E_PORT = Number(process.env.E2E_PORT || 3100);
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL || "mysql://root:e2e@127.0.0.1:3306/skipwait";
export const SEED_FILE = join(root, "e2e", ".auth", "seed.json");
/** The throwaway database the drift reference is built in (packet ruling 3). */
export const REFERENCE_DATABASE = "skipwait_head";
const BASE_SCHEMA_DIR = join(root, "e2e", ".results", "migration-base", "drizzle");

function log(message) { console.log(`[e2e-server] ${message}`); }
function summary(line) { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`); }

function database() {
  const url = new URL(E2E_DATABASE_URL);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error(`e2e refuses a non-local database host: ${url.hostname}`);
  return { url, name: url.pathname.replace(/^\//, ""), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), host: url.hostname, port: Number(url.port || 3306) };
}

async function resetDatabase(db, { drop }) {
  if (!/^[A-Za-z0-9_]+$/.test(db.name)) throw new Error(`unexpected e2e database name: ${db.name}`);
  const connection = await mysql.createConnection({ host: db.host, port: db.port, user: db.user, password: db.password });
  try {
    if (drop) await connection.query(`DROP DATABASE IF EXISTS \`${db.name}\``);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${db.name}\``);
  } finally { await connection.end(); }
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL, ...env }, encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { ok: result.status === 0, output };
}

/** A sha straight from the event is an argument, never a shell word or an option. */
function isSha(value) {
  return /^[0-9a-f]{40}$/.test(value) || /^[0-9a-f]{64}$/.test(value);
}

function urlFor(db, name) {
  const url = new URL(db.url);
  url.pathname = `/${name}`;
  return url.toString();
}

function connect(db, name) {
  return mysql.createConnection({ host: db.host, port: db.port, user: db.user, password: db.password, database: name });
}

function referenceDatabase(db) {
  if (!/^[A-Za-z0-9_]+$/.test(REFERENCE_DATABASE)) throw new Error(`unexpected reference database name: ${REFERENCE_DATABASE}`);
  return { ...db, name: REFERENCE_DATABASE, url: urlFor(db, REFERENCE_DATABASE) };
}

/** Ruling 5: the base `schema.ts` is read with `git show`, never written by hand. */
function baseSchemaFile(sha) {
  const shown = spawnSync("git", ["show", `${sha}:drizzle/schema.ts`], { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (shown.status !== 0) return { ok: false, reason: `git show ${sha}:drizzle/schema.ts: ${(shown.stderr || "").trim().slice(0, 200)}` };
  mkdirSync(BASE_SCHEMA_DIR, { recursive: true });
  const file = join(BASE_SCHEMA_DIR, "schema.ts");
  writeFileSync(file, shown.stdout);
  return { ok: true, file };
}

/** Ruling 6: judged by output, because drizzle-kit can print an Error and exit 0. */
function pushSchema(db, schemaPath) {
  const args = ["exec", "drizzle-kit", "push", "--dialect", "mysql", "--schema", schemaPath, "--url", db.url, "--force"];
  const result = run("pnpm", args, { DATABASE_URL: db.url });
  return pushOutcome(result.output, result.ok);
}

async function snapshot(db, name) {
  const connection = await connect(db, name);
  try {
    const [tables] = await connection.query("SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'", [name]);
    const [columns] = await connection.query("SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, COLUMN_TYPE AS columnType, IS_NULLABLE AS isNullable, COLUMN_DEFAULT AS columnDefault FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION", [name]);
    const [indexRows] = await connection.query("SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique, COLUMN_NAME AS columnName, SEQ_IN_INDEX AS seqInIndex FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX", [name]);
    const [foreignKeyRows] = await connection.query("SELECT CONSTRAINT_NAME AS constraintName, TABLE_NAME AS tableName, COLUMN_NAME AS columnName, ORDINAL_POSITION AS ordinalPosition, REFERENCED_TABLE_NAME AS referencedTable, REFERENCED_COLUMN_NAME AS referencedColumn FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL", [name]);
    const indexes = new Map();
    for (const row of indexRows) {
      const id = `${row.tableName}|${row.indexName}`;
      const entry = indexes.get(id) ?? { tableName: row.tableName, indexName: row.indexName, nonUnique: row.nonUnique, columns: [] };
      entry.columns.push({ columnName: row.columnName, seqInIndex: row.seqInIndex });
      indexes.set(id, entry);
    }
    const foreignKeys = new Map();
    for (const row of foreignKeyRows) {
      const entry = foreignKeys.get(row.constraintName) ?? { constraintName: row.constraintName, tableName: row.tableName, columns: [], referencedTable: row.referencedTable, referencedColumns: [] };
      entry.columns.push({ columnName: row.columnName, ordinalPosition: row.ordinalPosition });
      entry.referencedColumns.push({ columnName: row.referencedColumn, ordinalPosition: row.ordinalPosition });
      foreignKeys.set(row.constraintName, entry);
    }
    return normalizeSnapshot({ tables, columns, indexes: [...indexes.values()], foreignKeys: [...foreignKeys.values()] });
  } finally {
    await connection.end();
  }
}

async function prepare() {
  const db = database();
  const baseSha = baseRevisionOf({ prBaseSha: process.env.MIGRATION_BASE_SHA, before: process.env.MIGRATION_BASE_SHA });
  await resetDatabase(db, { drop: true });

  let basePush = null;
  if (baseSha && isSha(baseSha)) {
    const written = baseSchemaFile(baseSha);
    basePush = written.ok ? pushSchema(db, written.file) : { ok: false, reason: written.reason };
    if (!basePush.ok) console.log(`::warning title=Base schema push failed::${basePush.reason}. Falling back to push of the head schema (GATE-migration-apply §4 ruling 5).`);
  } else if (baseSha) {
    basePush = { ok: false, reason: `refusing a revision that is not a sha: ${String(baseSha).slice(0, 40)}` };
  }
  if (!basePush?.ok) {
    // Ruling 5: a broken tool warns and keeps the run green, and the journeys still get a schema.
    await resetDatabase(db, { drop: true });
    const headPush = pushSchema(db, join(root, "drizzle", "schema.ts"));
    if (!headPush.ok) {
      console.error(headPush.reason);
      throw new Error("drizzle-kit push of the head schema failed");
    }
  }

  const deployEnv = { DB_HOST: db.host, DB_PORT: String(db.port), DB_USER: db.user, DB_NAME: db.name, MYSQL_PWD: db.password, GITHUB_STEP_SUMMARY: "" };
  const deployRuns = [];
  for (const pass of [1, 2]) {
    log(`deploy migrations, run ${pass}`);
    const apply = run("bash", ["scripts/apply-deploy-migrations.sh"], deployEnv);
    console.log(apply.output.split("\n").filter(line => line && !line.startsWith("WARNING")).join("\n"));
    const applied = Number(apply.output.match(/migration gate passed: (\d+) applied/)?.[1] ?? NaN);
    deployRuns.push({ pass, ok: apply.ok, applied });
    if (!apply.ok) break;
  }

  let referencePush = null;
  let comparison = null;
  const reference = referenceDatabase(db);
  await resetDatabase(reference, { drop: true });
  referencePush = pushSchema(reference, join(root, "drizzle", "schema.ts"));
  if (referencePush.ok) comparison = compareSchemas(await snapshot(db, db.name), await snapshot(reference, reference.name));
  else console.log(`::warning title=Reference schema push failed::${referencePush.reason}. Drift check skipped (GATE-migration-apply §4 ruling 5).`);

  const verdict = gateVerdict({ baseSha, basePush, deployRuns, referencePush, comparison });
  for (const line of verdict.summaryLines) {
    log(line.replace(/^- /, ""));
    summary(line);
  }
  await resetDatabase(reference, { drop: true });
  if (verdict.status === "fail") throw new Error(verdict.summaryLines.find(line => line.includes("FAILED")) ?? "the migration gate failed");
}

function serverEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("WORKOS_")) delete env[key];
  return {
    ...env,
    NODE_ENV: "test",
    PORT: String(E2E_PORT),
    DATABASE_URL: E2E_DATABASE_URL,
    JWT_SECRET: process.env.E2E_JWT_SECRET || "e2e-only-session-secret-not-used-anywhere-else",
    VITE_APP_ID: "skipwait",
    BILLING_ENV: "test",
    // Placeholders only: the journeys never reach checkout, and startup refuses
    // an incomplete test billing config.
    CHARGEBEE_SITE: "e2e-placeholder",
    CHARGEBEE_API_KEY: "e2e-placeholder",
    CHARGEBEE_WEBHOOK_SECRET: "e2e-placeholder",
  };
}

// The seeder prints every session and then keeps its database pool open, so it
// never exits on its own: read its output until the last line it prints, then
// stop it.
function seed(env) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["exec", "tsx", "scripts/seed-test-accounts.ts"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { process.kill(-child.pid, "SIGTERM"); } catch { /* already gone */ }
      if (error) { reject(error); return; }
      try { resolve(writeSeed(stdout)); } catch (problem) { reject(problem); }
    };
    const timer = setTimeout(() => finish(new Error(`the seeder did not finish in 120s: ${stderr.slice(0, 300)}`)), 120_000);
    child.stdout.on("data", chunk => { stdout += chunk; if (/Cookies expire/.test(stdout)) finish(); });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("exit", code => finish(code === 0 || /Cookies expire/.test(stdout) ? undefined : new Error(`the seeder failed: ${(stderr || stdout).slice(0, 500)}`)));
  });
}

function writeSeed(stdout) {
  const accounts = {};
  let email = null;
  for (const line of stdout.split("\n")) {
    const head = line.match(/^--- .+ \((.+)\) ---$/);
    if (head) email = head[1];
    const cookie = line.match(/^cookie: app_session_id=(.+)$/);
    if (cookie && email) accounts[email] = cookie[1].trim();
  }
  if (Object.keys(accounts).length < 3) throw new Error("the seeder printed fewer than three sessions");
  mkdirSync(dirname(SEED_FILE), { recursive: true });
  writeFileSync(SEED_FILE, JSON.stringify({ seededAt: new Date().toISOString(), accounts }, null, 2));
  log(`seeded ${Object.keys(accounts).length} accounts`);
}

async function start() {
  database();
  const env = serverEnv();
  await seed(env);
  const server = spawn("node", ["dist/index.js"], { cwd: root, env, stdio: "inherit" });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
  server.on("exit", code => process.exit(code ?? 0));
}

const mode = process.argv[2];
if (mode === "prepare") {
  prepare().then(() => log("database ready")).catch(error => { console.error(`[e2e-server] ${error.message}`); process.exit(1); });
} else if (mode === "start") {
  start().catch(error => { console.error(`[e2e-server] ${error.message}`); process.exit(1); });
} else if (mode) {
  console.error("usage: node scripts/e2e-server.mjs prepare|start");
  process.exit(2);
}
