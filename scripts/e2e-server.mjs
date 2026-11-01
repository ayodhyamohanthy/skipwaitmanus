#!/usr/bin/env node
// GATE-e2e-journeys (D-212): the real database and the real server the e2e
// journeys run against (docs/plans/GATE-delivery.md, steps 1 and 2).
//
//   node scripts/e2e-server.mjs prepare   schema + deploy migrations, applied twice
//   node scripts/e2e-server.mjs start     seed the test accounts, then run dist/index.js
//
// `prepare` builds the schema the way production has it: `drizzle-kit migrate`
// for drizzle/*.sql, then scripts/apply-deploy-migrations.sh run twice. The
// second run must apply nothing (runner and ledger idempotence). When the
// journal migrations cannot apply from an empty database, it says so loudly,
// resets the database and uses `drizzle-kit push`, as the packet allows; the
// GATE-migration-apply row then stays open.
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

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const E2E_PORT = Number(process.env.E2E_PORT || 3100);
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL || "mysql://root:e2e@127.0.0.1:3306/skipwait";
export const SEED_FILE = join(root, "e2e", ".auth", "seed.json");

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

async function prepare() {
  const db = database();
  // Always from an empty database: that is what the check proves.
  await resetDatabase(db, { drop: true });
  log("drizzle-kit migrate (drizzle/*.sql)");
  const migrate = run("pnpm", ["exec", "drizzle-kit", "migrate"]);
  if (migrate.ok) {
    summary("- `drizzle-kit migrate` applied every journal migration from an empty database.");
  } else {
    const reason = (migrate.output.match(/sqlMessage: (?:'([^']+)'|"([^"]+)")/)?.slice(1).find(Boolean) ?? migrate.output.trim().split("\n").slice(-3).join(" ")).slice(0, 300);
    console.log(`::warning title=Journal migrations do not apply from empty::${reason}. Falling back to drizzle-kit push (GATE-migration-apply stays open).`);
    summary(`- **\`drizzle-kit migrate\` cannot apply from an empty database:** ${reason}. Schema built with \`drizzle-kit push\` instead (GATE-migration-apply stays open).`);
    await resetDatabase(db, { drop: true });
    const push = run("pnpm", ["exec", "drizzle-kit", "push", "--force"]);
    if (!push.ok) { console.error(push.output); throw new Error("drizzle-kit push failed"); }
  }
  const deployEnv = { DB_HOST: db.host, DB_PORT: String(db.port), DB_USER: db.user, DB_NAME: db.name, MYSQL_PWD: db.password, GITHUB_STEP_SUMMARY: "" };
  for (const pass of [1, 2]) {
    log(`deploy migrations, run ${pass}`);
    const apply = run("bash", ["scripts/apply-deploy-migrations.sh"], deployEnv);
    console.log(apply.output.split("\n").filter(line => line && !line.startsWith("WARNING")).join("\n"));
    if (!apply.ok) throw new Error(`deploy migrations failed on run ${pass}`);
    const applied = Number(apply.output.match(/migration gate passed: (\d+) applied/)?.[1] ?? NaN);
    if (pass === 2 && applied !== 0) throw new Error(`the second deploy-migration run applied ${applied} file(s); it must apply none`);
    summary(`- Deploy migrations, run ${pass}: ${applied} applied.`);
  }
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
