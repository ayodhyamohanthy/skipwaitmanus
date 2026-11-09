// @ts-nocheck - adapted from the external W5 candidate (PR #967 comment 6579717344, sha256 d2d91279...); plain Node harness, no types.
// lane binding 10e9737e6426429dd6ef857c48ecb7896fb9dc27 (tree c28f6c76, identical
// to the original binding ebae61102aef12131d75afa017710d2546683b0b).
//
// What it pins: the DESIRED cleanup and error-preservation behaviour of
// `node scripts/e2e-server.mjs prepare` for the scratch reference database
// `skipwait_head`, as derived in CONTRACT.md (settled items only), plus the
// FT-* falsy-throw regressions: a thrown `false`, `0`, `""`, `null` or
// `undefined` at S1, S2, the summary write or the cleanup DROP must still
// reject `prepare` (non-zero exit, no "database ready"). No current callee
// throws a falsy value; FT-* pins a latent corner, not a live incident.
//
// How: the unmodified subject CLI is copied into a throwaway sandbox (so its
// `e2e/.results` write lands outside the repository) and run in a child Node
// process whose `mysql2/promise` and `node:child_process` imports resolve to
// in-memory fakes (module.register resolve hook); the falsy summary fault
// patches `fs.appendFileSync` for the step-summary path only. No database, no
// network (net.Socket#connect is trapped and recorded), no dependency install.
// The test runner is vitest (`test` from "vitest"); assertions use node:assert.
//
// Not in this file: the H-2 bound-blob check and the K-M1..M8 control mutants
// of the external candidate. They are external red-bound evidence (posted on
// #982, comment 6592139597), not committed CI tests, and nothing below reads
// their env switches.
//
// Run:  pnpm vitest run scripts/migrationGateCleanup.test.ts
// Env:  SUBJECT_ROOT        checkout holding scripts/e2e-server.mjs (default: cwd)
//       LANE_TMP            sandbox parent directory (default: os.tmpdir())
//       LANE_OBSERVATIONS_OUT  write the subject's raw per-run observations here
//       LANE_KEEP           "1" = keep sandboxes for inspection
import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SUBJECT_ROOT = path.resolve(process.env.SUBJECT_ROOT || process.cwd());
const LANE_TMP = path.resolve(process.env.LANE_TMP || os.tmpdir());
const SUBJECT_FILE = path.join(SUBJECT_ROOT, "scripts", "e2e-server.mjs");
const CORE_FILE = path.join(SUBJECT_ROOT, "scripts", "migrationGateCore.mjs");
/** Git blob ids of the two subject files at the lane binding (10e9737e == ebae6110 tree). */
const BOUND_BLOBS = {
  "scripts/e2e-server.mjs": "da21cb785aed5ccd148f0ffa4e75b98abbae695e",
  "scripts/migrationGateCore.mjs": "d221901d750bf810a0e7444b2dd9eb13f768aeb2",
};

const PRIMARY = "skipwait";
const REFERENCE = "skipwait_head";
const DATABASE_URL = `mysql://root:e2e@127.0.0.1:3306/${PRIMARY}`;
const BASE_SHA_FIXTURE = "a".repeat(40); // a well-formed sha, so the base-revision path is taken
const NEEDLE = {
  deployReason: "deploy migrations failed on run 1",
  driftReason: "users.gateDriftProbe",
  dropError: "LANE_INJECTED_DROP_FAILURE",
  s1Error: "LANE_INJECTED_S1_FAILURE",
  s2Error: "LANE_INJECTED_S2_FAILURE",
  summaryError: "EISDIR",
  ready: "database ready",
};

// ---------------------------------------------------------------------------
// Fakes. Each factory is serialised with Function#toString into the sandbox,
// so it must use only its parameters (no closure over this file's scope).
// ---------------------------------------------------------------------------

function laneFakeState(fs, proc) {
  const env = proc.env;
  const faults = new Set(String(env.LANE_FAULTS || "").split(",").filter(Boolean));
  const scenario = env.LANE_SCENARIO || "pass";
  const falsyValues = { false: false, zero: 0, empty: "", null: null, undefined: undefined };
  if (env.LANE_FALSY && !(env.LANE_FALSY in falsyValues)) throw new Error(`LANE_HARNESS: unknown falsy value ${env.LANE_FALSY}`);
  const falsy = falsyValues[env.LANE_FALSY];
  let seq = 0;
  const record = event => {
    seq += 1;
    fs.appendFileSync(env.LANE_TRACE, `${JSON.stringify({ seq, ...event })}\n`);
  };
  const databases = new Map();
  proc.on("exit", code => record({ ev: "exit", code, databases: [...databases.keys()].sort() }));
  const col = (columnName, columnType, isNullable = "NO", columnDefault = null) => ({ columnName, columnType, isNullable, columnDefault });
  const heads = {
    pass: { users: [col("id", "int")], gateProbe: [col("id", "int")] },
    warn: { users: [col("id", "bigint")], gateProbe: [col("id", "int")] },
    "fail-drift": { users: [col("id", "int"), col("gateDriftProbe", "varchar(40)", "YES")], gateProbe: [col("id", "int")] },
    "fail-deploy": { users: [col("id", "int")], gateProbe: [col("id", "int")] },
  };
  if (!heads[scenario]) throw new Error(`LANE_HARNESS: unknown scenario ${scenario}`);
  return {
    record,
    faults,
    scenario,
    falsy,
    PRIMARY: env.LANE_PRIMARY,
    REFERENCE: env.LANE_REFERENCE,
    databases,
    counters: { deployRuns: 0 },
    BASE: { users: [col("id", "int")] },
    DEPLOY: { gateProbe: [col("id", "int")] },
    HEAD: heads[scenario],
  };
}

function laneFakeMysql(state) {
  const fail = (code, message) => Object.assign(new Error(message), { code });
  const tablesOf = name => state.databases.get(name)?.tables ?? new Map();
  async function createConnection(options = {}) {
    const database = options.database ?? null;
    state.record({ ev: "connect", host: options.host, database });
    if (database !== null && !state.databases.has(database)) {
      state.record({ ev: "connect-refused", database });
      throw fail("ER_BAD_DB_ERROR", `Unknown database '${database}'`);
    }
    let open = true;
    return {
      async query(sql, params = []) {
        if (!open) throw fail("LANE_CLOSED", "LANE_HARNESS: query on an ended connection");
        const text = String(sql);
        const ddl = /^(DROP|CREATE) DATABASE IF (?:NOT )?EXISTS `([^`]+)`$/.exec(text);
        if (ddl) {
          const [, verb, name] = ddl;
          if (verb === "CREATE") {
            if (!state.databases.has(name)) state.databases.set(name, { tables: new Map() });
            state.record({ ev: "create", database: name });
            return [{ affectedRows: 1 }, undefined];
          }
          const existed = state.databases.has(name);
          state.record({ ev: "drop", database: name, existed });
          if (name === state.REFERENCE && existed && state.faults.has("cleanup-drop-throws-falsy")) {
            state.record({ ev: "fault", fault: "cleanup-drop-throws-falsy" });
            throw state.falsy;
          }
          if (name === state.REFERENCE && existed && state.faults.has("cleanup-drop-throws")) {
            state.record({ ev: "fault", fault: "cleanup-drop-throws" });
            throw fail("ER_LOCK_WAIT_TIMEOUT", `${"LANE_INJECTED_DROP_FAILURE"}: DROP DATABASE ${name} did not complete`);
          }
          state.databases.delete(name);
          return [{ affectedRows: 0 }, undefined];
        }
        const schema = params[0];
        if (/information_schema\.TABLES/.test(text)) {
          state.record({ ev: "snapshot-read", database: schema });
          if (schema === state.PRIMARY && state.faults.has("s1-throws-falsy")) {
            state.record({ ev: "fault", fault: "s1-throws-falsy" });
            throw state.falsy;
          }
          if (schema === state.REFERENCE && state.faults.has("s2-throws-falsy")) {
            state.record({ ev: "fault", fault: "s2-throws-falsy" });
            throw state.falsy;
          }
          if (schema === state.PRIMARY && state.faults.has("s1-throws")) {
            state.record({ ev: "fault", fault: "s1-throws" });
            throw fail("PROTOCOL_CONNECTION_LOST", "LANE_INJECTED_S1_FAILURE: migrated-base snapshot read failed");
          }
          if (schema === state.REFERENCE && state.faults.has("s2-throws")) {
            state.record({ ev: "fault", fault: "s2-throws" });
            throw fail("PROTOCOL_CONNECTION_LOST", "LANE_INJECTED_S2_FAILURE: reference snapshot read failed");
          }
          return [[...tablesOf(schema).keys()].map(tableName => ({ tableName })), undefined];
        }
        if (/information_schema\.COLUMNS/.test(text)) {
          const rows = [];
          for (const [tableName, columns] of tablesOf(schema)) for (const column of columns) rows.push({ tableName, ...column });
          return [rows, undefined];
        }
        if (/information_schema\.(STATISTICS|KEY_COLUMN_USAGE)/.test(text)) return [[], undefined];
        state.record({ ev: "unexpected-sql", sql: text.slice(0, 120) });
        throw fail("LANE_UNEXPECTED_SQL", `LANE_HARNESS: unexpected SQL ${text.slice(0, 80)}`);
      },
      async end() {
        open = false;
        state.record({ ev: "end", database });
      },
    };
  }
  return { createConnection };
}

function laneFakeChildProcess(state) {
  const done = (status, stdout, stderr = "") => ({ pid: 0, status, signal: null, stdout, stderr, output: [null, stdout, stderr] });
  const dbNameOf = url => {
    try { return decodeURIComponent(new URL(url).pathname.replace(/^\//, "")); } catch { return null; }
  };
  const load = (name, spec) => {
    const db = state.databases.get(name);
    if (!db) return false;
    db.tables = new Map(Object.entries(spec).map(([table, columns]) => [table, columns.map(column => ({ ...column }))]));
    return true;
  };
  function spawnSync(command, args = [], options = {}) {
    const argv = [...args].map(String);
    state.record({ ev: "spawn", command, args: argv.map(arg => arg.slice(0, 120)) });
    if (command === "git" && argv[0] === "show") return done(0, "// lane fake base schema.ts\n");
    if (command === "pnpm" && argv.includes("drizzle-kit") && argv.includes("push")) {
      const name = dbNameOf(argv[argv.indexOf("--url") + 1]);
      const schemaPath = argv[argv.indexOf("--schema") + 1] || "";
      if (name === state.REFERENCE && state.faults.has("reference-push-fails")) {
        state.record({ ev: "fault", fault: "reference-push-fails" });
        return done(0, "Error: LANE_INJECTED_REFERENCE_PUSH_FAILURE\n");
      }
      const isBase = schemaPath.includes("migration-base");
      if (!load(name, isBase ? state.BASE : state.HEAD)) return done(1, "", `Error: Unknown database '${name}'\n`);
      state.record({ ev: "push", database: name, schema: isBase ? "base" : "head" });
      return done(0, "[✓] Pulling schema from database...\n[✓] Changes applied\n");
    }
    if (command === "bash" && argv[0] === "scripts/apply-deploy-migrations.sh") {
      state.counters.deployRuns += 1;
      const run = state.counters.deployRuns;
      const db = state.databases.get((options.env || {}).DB_NAME);
      if (state.scenario === "fail-deploy" && run === 1) {
        state.record({ ev: "deploy", run, ok: false });
        return done(1, "", "ERROR 3734 (HY000) at line 4: Failed to add the foreign key constraint. Missing column 'noSuchColumn' for constraint 'gate_probe_user_fk' in the referenced table 'users'\n");
      }
      if (!db) return done(1, "", "LANE_HARNESS: deploy against a missing database\n");
      let applied = 0;
      if (run === 1) {
        for (const [table, columns] of Object.entries(state.DEPLOY)) {
          if (!db.tables.has(table)) { db.tables.set(table, columns.map(column => ({ ...column }))); applied += 1; }
        }
      }
      state.record({ ev: "deploy", run, ok: true, applied });
      return done(0, `migration gate passed: ${applied} applied\n`);
    }
    state.record({ ev: "unexpected-command", command });
    return done(127, "", `LANE_HARNESS: unexpected command ${command}\n`);
  }
  function spawn(command) {
    state.record({ ev: "unexpected-command", command: `spawn ${command}` });
    throw new Error("LANE_HARNESS: spawn is not faked (prepare does not use it)");
  }
  return { spawnSync, spawn };
}

const FAKE_FILES = {
  "state.mjs": `import fs from "node:fs";\nconst api = (${laneFakeState})(fs, process);\nexport default api;\n`,
  "mysql2-promise.mjs": `import state from "./state.mjs";\nconst api = (${laneFakeMysql})(state);\nexport const createConnection = api.createConnection;\nexport default api;\n`,
  "child_process.mjs": `import state from "./state.mjs";\nconst api = (${laneFakeChildProcess})(state);\nexport const spawnSync = api.spawnSync;\nexport const spawn = api.spawn;\nexport default api;\n`,
  "hooks.mjs": [
    `const FAKE_DIR = new URL("./", import.meta.url).href;`,
    `const SUBJECT_DIR = new URL("../scripts/", import.meta.url).href;`,
    `export async function resolve(specifier, context, next) {`,
    `  if (specifier === "mysql2/promise") return { url: FAKE_DIR + "mysql2-promise.mjs", shortCircuit: true };`,
    `  if (specifier.startsWith("mysql2")) throw new Error("LANE_HARNESS: unfaked mysql2 import " + specifier);`,
    `  if ((specifier === "node:child_process" || specifier === "child_process") && String(context.parentURL || "").startsWith(SUBJECT_DIR)) return { url: FAKE_DIR + "child_process.mjs", shortCircuit: true };`,
    `  return next(specifier, context);`,
    `}`,
    ``,
  ].join("\n"),
  "preload.mjs": [
    `import { register, syncBuiltinESMExports } from "node:module";`,
    `import fs from "node:fs";`,
    `import net from "node:net";`,
    `import state from "./state.mjs";`,
    `register("./hooks.mjs", import.meta.url);`,
    `if (state.faults.has("summary-throws-falsy")) {`,
    `  const realAppend = fs.appendFileSync;`,
    `  fs.appendFileSync = function laneSummaryAppend(file, ...rest) {`,
    `    if (String(file) === process.env.GITHUB_STEP_SUMMARY) {`,
    `      state.record({ ev: "fault", fault: "summary-throws-falsy" });`,
    `      throw state.falsy;`,
    `    }`,
    `    return realAppend.call(this, file, ...rest);`,
    `  };`,
    `  syncBuiltinESMExports();`,
    `}`,
    `net.Socket.prototype.connect = function laneNoNetwork() {`,
    `  state.record({ ev: "net-connect" });`,
    `  throw new Error("LANE_HARNESS: network is forbidden in this harness");`,
    `};`,
    ``,
  ].join("\n"),
};

// ---------------------------------------------------------------------------
// Runs: one scenario (what the gate verdict would be) plus injected faults.
// ---------------------------------------------------------------------------

const RUNS = {
  R01: { scenario: "pass", faults: [], note: "normal path, verdict pass" },
  R02: { scenario: "warn", faults: [], note: "normal path, verdict warn (differing column type)" },
  R03: { scenario: "fail-drift", faults: [], note: "normal path, verdict fail (head column no deploy file creates)" },
  R04: { scenario: "fail-deploy", faults: [], note: "normal path, verdict fail (deploy run 1 ERROR 3734)" },
  R05: { scenario: "pass", faults: ["reference-push-fails"], note: "reference push fails (ruling 5: drift skipped, warn)" },
  R06: { scenario: "pass", faults: ["s1-throws"], note: "S1 (migrated-base snapshot) throws after the reference exists" },
  R07: { scenario: "pass", faults: ["s2-throws"], note: "S2 (reference snapshot) throws after the reference exists" },
  R08: { scenario: "pass", faults: ["summary-eisdir"], note: "step-summary write throws (EISDIR), verdict pass" },
  R09: { scenario: "fail-deploy", faults: ["summary-eisdir"], note: "step-summary write throws (EISDIR), verdict fail" },
  R10: { scenario: "pass", faults: ["cleanup-drop-throws"], note: "cleanup DROP throws, verdict pass" },
  R11: { scenario: "warn", faults: ["cleanup-drop-throws"], note: "cleanup DROP throws, verdict warn" },
  R12: { scenario: "fail-deploy", faults: ["cleanup-drop-throws"], note: "cleanup DROP throws, verdict fail (deploy)" },
  R13: { scenario: "fail-drift", faults: ["cleanup-drop-throws"], note: "cleanup DROP throws, verdict fail (drift)" },
  R14: { scenario: "pass", faults: ["s1-throws", "cleanup-drop-throws"], note: "S1 throws, then the cleanup DROP throws" },
  R15: { scenario: "fail-deploy", faults: ["s2-throws"], note: "OBSERVE ONLY (U9): deploy failed, then S2 throws" },
  // FT-*: falsy thrown values (latent corner: no current callee throws one).
  "F-S1-false": { scenario: "pass", faults: ["s1-throws-falsy"], falsy: "false", note: "S1 throws a falsy value (false), verdict pass" },
  "F-S1-zero": { scenario: "pass", faults: ["s1-throws-falsy"], falsy: "zero", note: "S1 throws a falsy value (zero), verdict pass" },
  "F-S1-empty": { scenario: "pass", faults: ["s1-throws-falsy"], falsy: "empty", note: "S1 throws a falsy value (empty), verdict pass" },
  "F-S1-null": { scenario: "pass", faults: ["s1-throws-falsy"], falsy: "null", note: "S1 throws a falsy value (null), verdict pass" },
  "F-S1-undefined": { scenario: "pass", faults: ["s1-throws-falsy"], falsy: "undefined", note: "S1 throws a falsy value (undefined), verdict pass" },
  "F-S2-false": { scenario: "pass", faults: ["s2-throws-falsy"], falsy: "false", note: "S2 throws a falsy value (false), verdict pass" },
  "F-S2-zero": { scenario: "pass", faults: ["s2-throws-falsy"], falsy: "zero", note: "S2 throws a falsy value (zero), verdict pass" },
  "F-S2-empty": { scenario: "pass", faults: ["s2-throws-falsy"], falsy: "empty", note: "S2 throws a falsy value (empty), verdict pass" },
  "F-S2-null": { scenario: "pass", faults: ["s2-throws-falsy"], falsy: "null", note: "S2 throws a falsy value (null), verdict pass" },
  "F-S2-undefined": { scenario: "pass", faults: ["s2-throws-falsy"], falsy: "undefined", note: "S2 throws a falsy value (undefined), verdict pass" },
  "F-SUM-false": { scenario: "pass", faults: ["summary-throws-falsy"], falsy: "false", note: "SUM throws a falsy value (false), verdict pass" },
  "F-SUM-zero": { scenario: "pass", faults: ["summary-throws-falsy"], falsy: "zero", note: "SUM throws a falsy value (zero), verdict pass" },
  "F-SUM-empty": { scenario: "pass", faults: ["summary-throws-falsy"], falsy: "empty", note: "SUM throws a falsy value (empty), verdict pass" },
  "F-SUM-null": { scenario: "pass", faults: ["summary-throws-falsy"], falsy: "null", note: "SUM throws a falsy value (null), verdict pass" },
  "F-SUM-undefined": { scenario: "pass", faults: ["summary-throws-falsy"], falsy: "undefined", note: "SUM throws a falsy value (undefined), verdict pass" },
  "F-DROP-false": { scenario: "pass", faults: ["cleanup-drop-throws-falsy"], falsy: "false", note: "DROP throws a falsy value (false), verdict pass" },
  "F-DROP-zero": { scenario: "pass", faults: ["cleanup-drop-throws-falsy"], falsy: "zero", note: "DROP throws a falsy value (zero), verdict pass" },
  "F-DROP-empty": { scenario: "pass", faults: ["cleanup-drop-throws-falsy"], falsy: "empty", note: "DROP throws a falsy value (empty), verdict pass" },
  "F-DROP-null": { scenario: "pass", faults: ["cleanup-drop-throws-falsy"], falsy: "null", note: "DROP throws a falsy value (null), verdict pass" },
  "F-DROP-undefined": { scenario: "pass", faults: ["cleanup-drop-throws-falsy"], falsy: "undefined", note: "DROP throws a falsy value (undefined), verdict pass" },
  "F-S1DROP-false": { scenario: "pass", faults: ["s1-throws-falsy", "cleanup-drop-throws"], falsy: "false", note: "S1 throws a falsy value (false), then the cleanup DROP throws an Error" },
  "F-S1DROP-zero": { scenario: "pass", faults: ["s1-throws-falsy", "cleanup-drop-throws"], falsy: "zero", note: "S1 throws a falsy value (zero), then the cleanup DROP throws an Error" },
  "F-S1DROP-empty": { scenario: "pass", faults: ["s1-throws-falsy", "cleanup-drop-throws"], falsy: "empty", note: "S1 throws a falsy value (empty), then the cleanup DROP throws an Error" },
  "F-S1DROP-null": { scenario: "pass", faults: ["s1-throws-falsy", "cleanup-drop-throws"], falsy: "null", note: "S1 throws a falsy value (null), then the cleanup DROP throws an Error" },
  "F-S1DROP-undefined": { scenario: "pass", faults: ["s1-throws-falsy", "cleanup-drop-throws"], falsy: "undefined", note: "S1 throws a falsy value (undefined), then the cleanup DROP throws an Error" },
};

function writeSandbox(subjectSource, coreSource, run) {
  fs.mkdirSync(LANE_TMP, { recursive: true });
  const dir = fs.mkdtempSync(path.join(LANE_TMP, "gate967-"));
  fs.mkdirSync(path.join(dir, "scripts"));
  fs.mkdirSync(path.join(dir, "fake"));
  fs.writeFileSync(path.join(dir, "scripts", "e2e-server.mjs"), subjectSource);
  fs.writeFileSync(path.join(dir, "scripts", "migrationGateCore.mjs"), coreSource);
  for (const [name, source] of Object.entries(FAKE_FILES)) fs.writeFileSync(path.join(dir, "fake", name), source);
  const trace = path.join(dir, "trace.jsonl");
  fs.writeFileSync(trace, "");
  const summaryPath = run.faults.includes("summary-eisdir") ? path.join(dir, "step-summary.d") : path.join(dir, "step-summary.md");
  if (run.faults.includes("summary-eisdir")) fs.mkdirSync(summaryPath);
  else fs.writeFileSync(summaryPath, "");
  return { dir, trace, summaryPath };
}

/** Runs the subject CLI once and reduces what happened to plain facts. */
function runSubject(subjectSource, coreSource, runId) {
  const run = RUNS[runId];
  const box = writeSandbox(subjectSource, coreSource, run);
  const child = spawnSync(process.execPath, ["--import", pathToFileURL(path.join(box.dir, "fake", "preload.mjs")).href, path.join(box.dir, "scripts", "e2e-server.mjs"), "prepare"], {
    cwd: box.dir,
    encoding: "utf8",
    timeout: 30_000,
    env: {
      PATH: process.env.PATH || "/usr/bin:/bin",
      HOME: box.dir,
      E2E_DATABASE_URL: DATABASE_URL,
      MIGRATION_BASE_SHA: BASE_SHA_FIXTURE,
      GITHUB_STEP_SUMMARY: box.summaryPath,
      LANE_TRACE: box.trace,
      LANE_SCENARIO: run.scenario,
      LANE_FAULTS: run.faults.join(","),
      LANE_FALSY: run.falsy ?? "",
      LANE_PRIMARY: PRIMARY,
      LANE_REFERENCE: REFERENCE,
    },
  });
  const events = fs.readFileSync(box.trace, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
  const summary = fs.statSync(box.summaryPath).isFile() ? fs.readFileSync(box.summaryPath, "utf8") : null;
  if (process.env.LANE_KEEP !== "1") fs.rmSync(box.dir, { recursive: true, force: true });
  return factsOf(runId, { status: child.status, signal: child.signal, stdout: child.stdout ?? "", stderr: child.stderr ?? "", summary, events });
}

/** Pure reduction of one run; also used on synthetic runs by the oracle self-tests. */
function factsOf(runId, { status, signal = null, stdout, stderr, summary, events }) {
  const refCreate = events.find(event => event.ev === "create" && event.database === REFERENCE);
  const refCreateSeq = refCreate ? refCreate.seq : null;
  const after = event => refCreateSeq !== null && event.seq > refCreateSeq;
  const exit = [...events].reverse().find(event => event.ev === "exit");
  return {
    runId,
    status,
    signal,
    stdout,
    stderr,
    summary,
    refCreateSeq,
    cleanupDrops: events.filter(event => event.ev === "drop" && event.database === REFERENCE && after(event)),
    primaryDropsAfterRef: events.filter(event => event.ev === "drop" && event.database === PRIMARY && after(event)),
    finalDbs: exit ? exit.databases : null,
    faultsFired: events.filter(event => event.ev === "fault").map(event => event.fault),
    netConnects: events.filter(event => event.ev === "net-connect").length,
    unexpected: events.filter(event => event.ev.startsWith("unexpected")),
  };
}

// ---------------------------------------------------------------------------
// Oracle: each check returns the list of violations (empty = holds).
// ---------------------------------------------------------------------------

const out = facts => `${facts.stdout}\n${facts.stderr}`;
const V = {
  fired: (facts, fault) => (facts.faultsFired.includes(fault) ? [] : [`precondition: injected fault ${fault} never fired`]),
  shows: (facts, needle, what) => (out(facts).includes(needle) ? [] : [`${what} is not visible on stdout or stderr (${needle})`]),
  refCreated: facts => (facts.refCreateSeq === null ? [`precondition: ${REFERENCE} was never created`] : []),
  cleanupAttempted: facts => (facts.refCreateSeq !== null && facts.cleanupDrops.length === 0 ? [`no DROP of ${REFERENCE} after it was created (cleanup not attempted)`] : []),
  cleanupExactlyOnce: facts => (facts.cleanupDrops.length === 1 ? [] : [`expected exactly one cleanup DROP of ${REFERENCE}, saw ${facts.cleanupDrops.length}`]),
  referenceGone: facts => (facts.finalDbs === null ? ["no exit record"] : facts.finalDbs.includes(REFERENCE) ? [`${REFERENCE} still exists when the process exits`] : []),
  primaryKept: facts => [
    ...(facts.primaryDropsAfterRef.length ? [`primary ${PRIMARY} dropped ${facts.primaryDropsAfterRef.length} time(s) after the reference was created`] : []),
    ...(facts.finalDbs !== null && !facts.finalDbs.includes(PRIMARY) ? [`primary ${PRIMARY} missing at exit`] : []),
  ],
  succeeded: facts => (facts.status === 0 && facts.stdout.includes(NEEDLE.ready) ? [] : [`expected exit 0 with "${NEEDLE.ready}", got exit ${facts.status}`]),
  noFalseSuccess: facts => [
    ...(facts.status === 0 ? ["exit status 0 after a definite breach (false success)"] : []),
    ...(facts.stdout.includes(NEEDLE.ready) ? [`"${NEEDLE.ready}" printed after a definite breach`] : []),
  ],
  raisedVerdict: (facts, reason) => (facts.stderr.includes(reason) && /fail/i.test(facts.stderr) ? [] : [`the raised error (stderr) does not carry the original failed verdict (${reason}); stderr was: ${facts.stderr.trim().slice(0, 200)}`]),
  verdictLogged: (facts, reason) => [
    ...(facts.stdout.includes(reason) && facts.stdout.includes("FAILED") ? [] : [`the FAILED verdict line (${reason}) is not on stdout`]),
    ...(facts.summary !== null && facts.summary.includes(reason) && facts.summary.includes("FAILED") ? [] : [`the FAILED verdict line (${reason}) is not in the step summary`]),
  ],
};

const SETTLED_CASES = [
  // Cleanup after a created reference (CONTRACT.md CL-*).
  { id: "CL-1", run: "R06", title: "S1 throws after the reference exists: one cleanup attempt drops skipwait_head; primary kept", check: f => [...V.fired(f, "s1-throws"), ...V.refCreated(f), ...V.cleanupAttempted(f), ...V.referenceGone(f), ...V.primaryKept(f)] },
  { id: "CL-2", run: "R07", title: "S2 throws after the reference exists: cleanup drops skipwait_head; primary kept", check: f => [...V.fired(f, "s2-throws"), ...V.refCreated(f), ...V.cleanupAttempted(f), ...V.referenceGone(f), ...V.primaryKept(f)] },
  { id: "CL-3a", run: "R08", title: "summary write throws (verdict pass): cleanup drops skipwait_head; primary kept", check: f => [...V.shows(f, NEEDLE.summaryError, "precondition: the summary fault"), ...V.refCreated(f), ...V.cleanupAttempted(f), ...V.referenceGone(f), ...V.primaryKept(f)] },
  { id: "CL-3b", run: "R09", title: "summary write throws (verdict fail): cleanup drops skipwait_head; primary kept", check: f => [...V.shows(f, NEEDLE.summaryError, "precondition: the summary fault"), ...V.refCreated(f), ...V.cleanupAttempted(f), ...V.referenceGone(f), ...V.primaryKept(f)] },
  { id: "CL-3c", run: "R14", title: "S1 throws and the cleanup DROP throws: cleanup attempted, both errors visible, primary kept", check: f => [...V.fired(f, "s1-throws"), ...V.refCreated(f), ...V.cleanupAttempted(f), ...V.primaryKept(f), ...V.shows(f, NEEDLE.s1Error, "the S1 error"), ...V.shows(f, NEEDLE.dropError, "the cleanup failure")] },
  { id: "CL-4", run: "*", title: "every run: cleanup never drops the primary database after the reference exists; primary present at exit", check: f => V.primaryKept(f) },
  ...["R01", "R02", "R03", "R04", "R05"].map((run, index) => ({ id: `CL-5${"abcde"[index]}`, run, title: `normal path (${RUNS[run].note}): exactly one cleanup DROP, skipwait_head gone at exit`, check: f => [...V.refCreated(f), ...V.cleanupExactlyOnce(f), ...V.referenceGone(f), ...V.primaryKept(f)] })),
  // Gate outcome and error preservation (CONTRACT.md ER-*).
  { id: "ER-1a", run: "R01", title: "verdict pass: exit 0 and database ready", check: f => V.succeeded(f) },
  { id: "ER-1b", run: "R02", title: "verdict warn: exit 0 and database ready", check: f => V.succeeded(f) },
  { id: "ER-1c", run: "R03", title: "verdict fail (drift): non-zero exit, no success line, raised error carries the verdict", check: f => [...V.noFalseSuccess(f), ...V.raisedVerdict(f, NEEDLE.driftReason)] },
  { id: "ER-1d", run: "R04", title: "verdict fail (deploy): non-zero exit, no success line, raised error carries the verdict", check: f => [...V.noFalseSuccess(f), ...V.raisedVerdict(f, NEEDLE.deployReason)] },
  { id: "ER-1e", run: "R05", title: "reference push fails (ruling 5): warns and stays green", check: f => [...V.fired(f, "reference-push-fails"), ...V.succeeded(f)] },
  { id: "ER-2a", run: "R12", title: "verdict fail (deploy) + cleanup DROP throws: no false success", check: f => [...V.fired(f, "cleanup-drop-throws"), ...V.noFalseSuccess(f)] },
  { id: "ER-2b", run: "R13", title: "verdict fail (drift) + cleanup DROP throws: no false success", check: f => [...V.fired(f, "cleanup-drop-throws"), ...V.noFalseSuccess(f)] },
  { id: "ER-3a", run: "R12", title: "verdict fail (deploy) + cleanup DROP throws: the raised error still carries the original FAILED verdict", check: f => [...V.fired(f, "cleanup-drop-throws"), ...V.raisedVerdict(f, NEEDLE.deployReason)] },
  { id: "ER-3b", run: "R13", title: "verdict fail (drift) + cleanup DROP throws: the raised error still carries the original FAILED verdict", check: f => [...V.fired(f, "cleanup-drop-throws"), ...V.raisedVerdict(f, NEEDLE.driftReason)] },
  { id: "ER-4a", run: "R12", title: "verdict fail (deploy) + cleanup DROP throws: FAILED line still on stdout and in the step summary", check: f => [...V.fired(f, "cleanup-drop-throws"), ...V.verdictLogged(f, NEEDLE.deployReason)] },
  { id: "ER-4b", run: "R13", title: "verdict fail (drift) + cleanup DROP throws: FAILED line still on stdout and in the step summary", check: f => [...V.fired(f, "cleanup-drop-throws"), ...V.verdictLogged(f, NEEDLE.driftReason)] },
  ...["R10", "R11", "R12", "R13"].map((run, index) => ({ id: `ER-5${"abcd"[index]}`, run, title: `cleanup DROP throws (${RUNS[run].note}): the cleanup failure is visible`, check: f => [...V.fired(f, "cleanup-drop-throws"), ...V.shows(f, NEEDLE.dropError, "the cleanup failure")] })),
  { id: "ER-6a", run: "R06", title: "S1 exception is visible (not swallowed)", check: f => [...V.fired(f, "s1-throws"), ...V.shows(f, NEEDLE.s1Error, "the S1 error")] },
  { id: "ER-6b", run: "R07", title: "S2 exception is visible (not swallowed)", check: f => [...V.fired(f, "s2-throws"), ...V.shows(f, NEEDLE.s2Error, "the S2 error")] },
  { id: "ER-6c", run: "R08", title: "summary-write exception is visible (not swallowed)", check: f => V.shows(f, NEEDLE.summaryError, "the summary-write error") },
  { id: "ER-7", run: "R09", title: "verdict fail + summary write throws: no false success, failed verdict visible", check: f => [...V.noFalseSuccess(f), ...V.shows(f, NEEDLE.deployReason, "the failed verdict")] },
];

// FT-*: a falsy thrown value must reject `prepare` like any other throw. Each case
// asserts the fault fired, a handled rejection (exit status exactly 1 from the CLI's
// own catch, no TypeError or unhandled rejection), no "database ready", one cleanup
// attempt and the primary kept. FT-P* also pins gate precedence: when the gate threw
// (even a falsy value) and the cleanup DROP throws an Error, the cleanup failure is
// logged as the secondary line and the gate's value is what is raised.
const FALSY_VALUES = ["false", "zero", "empty", "null", "undefined"];
const FT_SITES = [
  { tag: "S1", fault: "s1-throws-falsy", what: "S1 (migrated-base snapshot)" },
  { tag: "S2", fault: "s2-throws-falsy", what: "S2 (reference snapshot)" },
  { tag: "SUM", fault: "summary-throws-falsy", what: "step-summary write" },
  { tag: "DROP", fault: "cleanup-drop-throws-falsy", what: "cleanup DROP" },
];
V.rejected = facts => [
  ...(facts.status === 1 ? [] : [`expected the CLI's handled rejection (exit 1), got exit ${facts.status} signal ${facts.signal}`]),
  ...(/TypeError|Unhandled|unhandled/.test(facts.stderr) ? [`the rejection was not handled cleanly; stderr: ${facts.stderr.trim().slice(0, 200)}`] : []),
  ...V.noFalseSuccess(facts),
];
V.secondaryCleanupLogged = facts => (facts.stderr.includes(`cleanup of ${REFERENCE} also failed`) && facts.stderr.includes(NEEDLE.dropError) ? [] : [`the cleanup failure is not logged as the secondary failure; stderr: ${facts.stderr.trim().slice(0, 200)}`]);
V.gateValueRaised = facts => {
  // No trim: a raised "" prints as "[e2e-server] " and trimming would drop that last line.
  const last = facts.stderr.split("\n").filter(line => line.startsWith("[e2e-server]")).pop() ?? "";
  return last.includes(NEEDLE.dropError) || last.includes("also failed") ? [`the cleanup error replaced the gate's own failure as the raised value; last line: ${last}`] : [];
};
for (const site of FT_SITES) {
  for (const value of FALSY_VALUES) {
    const run = `F-${site.tag}-${value}`;
    SETTLED_CASES.push({ id: `FT-${site.tag}-${value}`, run, title: `${site.what} throws ${value === "empty" ? '""' : value === "zero" ? "0" : value}: prepare rejects, exit 1, no "database ready", one cleanup attempt, primary kept`, check: f => [...V.fired(f, site.fault), ...V.refCreated(f), ...V.cleanupExactlyOnce(f), ...V.primaryKept(f), ...V.rejected(f), ...(site.tag === "DROP" ? [] : V.referenceGone(f))] });
  }
}
for (const value of FALSY_VALUES) {
  SETTLED_CASES.push({ id: `FT-P-${value}`, run: `F-S1DROP-${value}`, title: `S1 throws ${value} and the cleanup DROP throws an Error: rejects, gate value wins, cleanup failure logged as secondary, one DROP, primary kept`, check: f => [...V.fired(f, "s1-throws-falsy"), ...V.fired(f, "cleanup-drop-throws"), ...V.cleanupExactlyOnce(f), ...V.primaryKept(f), ...V.rejected(f), ...V.secondaryCleanupLogged(f), ...V.gateValueRaised(f)] });
}

/** Direction each settled case is expected to take against the bound head, and why (see CONTRACT.md). */
const EXPECTED_ON_BOUND_HEAD = {
  "CL-1": "red: head has no cleanup on the S1 exception path (drop is only reached after the verdict loop)",
  "CL-2": "red: same, S2 path",
  "CL-3a": "red: the summary write throws before the drop line",
  "CL-3b": "red: same, verdict fail",
  "CL-3c": "red: no cleanup attempt, so the cleanup failure never occurs or shows",
  "CL-4": "green: head never drops the primary after the reference exists",
  "CL-5a": "green: preserved normal-path drop (once)", "CL-5b": "green: preserved normal-path drop (once)", "CL-5c": "green: preserved normal-path drop (once)", "CL-5d": "green: preserved normal-path drop (once)", "CL-5e": "green: preserved normal-path drop (once)",
  "ER-1a": "green: preserved gate outcome", "ER-1b": "green: preserved gate outcome", "ER-1c": "green: preserved gate outcome", "ER-1d": "green: preserved gate outcome", "ER-1e": "green: preserved ruling 5 outcome",
  "ER-2a": "green: head exits 1", "ER-2b": "green: head exits 1",
  "ER-3a": "red: head raises the drop error in place of the FAILED verdict", "ER-3b": "red: same, drift verdict",
  "ER-4a": "green: head writes the verdict lines before the drop", "ER-4b": "green: same",
  "ER-5a": "green: head raises the drop error", "ER-5b": "green", "ER-5c": "green", "ER-5d": "green",
  "ER-6a": "green: head raises the S1 error", "ER-6b": "green: head raises the S2 error", "ER-6c": "green: head raises EISDIR",
  "ER-7": "green: head exits 1 and logs the FAILED line before the summary write throws",
};

function violationsByCase(runFacts) {
  const result = {};
  for (const item of SETTLED_CASES) {
    const runs = item.run === "*" ? Object.keys(RUNS) : [item.run];
    result[item.id] = runs.flatMap(runId => item.check(runFacts[runId]).map(problem => (item.run === "*" ? `${runId}: ${problem}` : problem)));
  }
  return result;
}

function runAll(subjectSource, coreSource) {
  return Object.fromEntries(Object.keys(RUNS).map(runId => [runId, runSubject(subjectSource, coreSource, runId)]));
}

// ---------------------------------------------------------------------------
// The subject: settled cases against it (intended reds included).
// ---------------------------------------------------------------------------

const gitBlobId = buffer => createHash("sha1").update(`blob ${buffer.length}\0`).update(buffer).digest("hex");
const subjectSource = fs.readFileSync(SUBJECT_FILE, "utf8");
const coreSource = fs.readFileSync(CORE_FILE, "utf8");
const subjectBlobs = {
  "scripts/e2e-server.mjs": gitBlobId(fs.readFileSync(SUBJECT_FILE)),
  "scripts/migrationGateCore.mjs": gitBlobId(fs.readFileSync(CORE_FILE)),
};
const isBound = Object.entries(BOUND_BLOBS).every(([file, blob]) => subjectBlobs[file] === blob);
const subjectRuns = runAll(subjectSource, coreSource);
const subjectViolations = violationsByCase(subjectRuns);
if (process.env.LANE_OBSERVATIONS_OUT) {
  fs.writeFileSync(process.env.LANE_OBSERVATIONS_OUT, JSON.stringify({ subjectRoot: SUBJECT_ROOT, subjectBlobs, boundBlobs: BOUND_BLOBS, isBound, node: process.version, runs: RUNS, expectedOnBoundHead: EXPECTED_ON_BOUND_HEAD, facts: subjectRuns, violations: subjectViolations }, null, 2));
}

for (const item of SETTLED_CASES) {
  test(`[${item.id}] ${item.title}`, () => {
    assert.deepEqual(subjectViolations[item.id], [], `${item.id} violated:\n- ${subjectViolations[item.id].join("\n- ")}`);
  });
}

test("[H-1] harness: no network, no unexpected SQL or command, an exit record on every run", () => {
  const problems = [];
  for (const [runId, facts] of Object.entries(subjectRuns)) {
    if (facts.netConnects) problems.push(`${runId}: ${facts.netConnects} network connect attempt(s)`);
    if (facts.unexpected.length) problems.push(`${runId}: unexpected ${JSON.stringify(facts.unexpected)}`);
    if (facts.finalDbs === null) problems.push(`${runId}: no exit record (signal ${facts.signal})`);
  }
  assert.deepEqual(problems, []);
});

test("[H-3] harness determinism: a second run of R01, R04 and R12 gives the same violations and exit codes", () => {
  for (const runId of ["R01", "R04", "R12"]) {
    const again = runSubject(subjectSource, coreSource, runId);
    assert.equal(again.status, subjectRuns[runId].status, runId);
    assert.deepEqual(again.cleanupDrops.length, subjectRuns[runId].cleanupDrops.length, runId);
    assert.deepEqual(again.finalDbs, subjectRuns[runId].finalDbs, runId);
    assert.equal(again.stderr, subjectRuns[runId].stderr, runId);
  }
});

// ---------------------------------------------------------------------------
// Oracle self-tests on synthetic observations (no subject involved): the
// settled checks are jointly satisfiable, and each one rejects its violation.
// ---------------------------------------------------------------------------

function syntheticFacts(runId, overrides = {}) {
  const run = RUNS[runId];
  const has = fault => run.faults.includes(fault);
  const failed = run.scenario.startsWith("fail");
  const reason = run.scenario === "fail-drift" ? NEEDLE.driftReason : NEEDLE.deployReason;
  const events = [{ seq: 1, ev: "create", database: PRIMARY }, { seq: 2, ev: "create", database: REFERENCE }];
  for (const fault of run.faults.filter(name => name !== "summary-eisdir" && name !== "cleanup-drop-throws" && name !== "cleanup-drop-throws-falsy")) events.push({ seq: events.length + 1, ev: "fault", fault });
  events.push({ seq: events.length + 1, ev: "drop", database: REFERENCE, existed: true });
  for (const fault of ["cleanup-drop-throws", "cleanup-drop-throws-falsy"].filter(has)) events.push({ seq: events.length + 1, ev: "fault", fault });
  const dbs = has("cleanup-drop-throws") || has("cleanup-drop-throws-falsy") ? [PRIMARY, REFERENCE] : [PRIMARY];
  events.push({ seq: events.length + 1, ev: "exit", code: 0, databases: dbs.sort() });
  const errors = [has("s1-throws") && NEEDLE.s1Error, has("s2-throws") && NEEDLE.s2Error, has("summary-eisdir") && NEEDLE.summaryError, has("cleanup-drop-throws") && NEEDLE.dropError].filter(Boolean);
  const verdictLine = failed ? `- Migration gate: **FAILED** - ${reason}.` : "- Migration gate: passed.";
  const falsyFault = run.faults.some(name => name.endsWith("-falsy"));
  const hardFail = failed || falsyFault || has("s1-throws") || has("s2-throws") || has("summary-eisdir") || has("cleanup-drop-throws");
  // A gate-side throw with a failed cleanup: the cleanup line is secondary, the gate's value is raised last.
  const errorLines = falsyFault && has("cleanup-drop-throws")
    ? [`[e2e-server] cleanup of ${REFERENCE} also failed: ${NEEDLE.dropError}`, `[e2e-server] ${run.falsy}`]
    : [...errors.map(text => `[e2e-server] ${text}`), ...(falsyFault ? [`[e2e-server] ${run.falsy}`] : [])];
  return factsOf(runId, {
    status: hardFail ? 1 : 0,
    stdout: `${verdictLine}\n${hardFail ? "" : NEEDLE.ready}\n`,
    stderr: [failed ? `[e2e-server] ${verdictLine} (FAILED)` : "", ...errorLines].join("\n"),
    summary: has("summary-eisdir") ? null : `${verdictLine}\n`,
    events,
    ...overrides,
  });
}

test("[O-1] oracle: one synthetic behaviour satisfies every settled case at once (the contract is consistent)", () => {
  const facts = Object.fromEntries(Object.keys(RUNS).map(runId => [runId, syntheticFacts(runId)]));
  const violations = violationsByCase(facts);
  assert.deepEqual(Object.entries(violations).filter(([, list]) => list.length), []);
});

test("[O-2] oracle: each check rejects its own violation", () => {
  const ok = syntheticFacts("R12");
  const noDrop = factsOf("R06", { status: 1, stdout: "", stderr: NEEDLE.s1Error, summary: "", events: [{ seq: 1, ev: "create", database: PRIMARY }, { seq: 2, ev: "create", database: REFERENCE }, { seq: 3, ev: "fault", fault: "s1-throws" }, { seq: 4, ev: "exit", code: 1, databases: [PRIMARY, REFERENCE] }] });
  assert.ok(V.cleanupAttempted(noDrop).length && V.referenceGone(noDrop).length, "a run with no cleanup is rejected");
  const twice = factsOf("R01", { status: 0, stdout: NEEDLE.ready, stderr: "", summary: "", events: [{ seq: 1, ev: "create", database: REFERENCE }, { seq: 2, ev: "drop", database: REFERENCE }, { seq: 3, ev: "drop", database: REFERENCE }, { seq: 4, ev: "exit", code: 0, databases: [PRIMARY] }] });
  assert.ok(V.cleanupExactlyOnce(twice).length, "a double drop is rejected");
  const primaryGone = factsOf("R01", { status: 0, stdout: NEEDLE.ready, stderr: "", summary: "", events: [{ seq: 1, ev: "create", database: REFERENCE }, { seq: 2, ev: "drop", database: PRIMARY }, { seq: 3, ev: "exit", code: 0, databases: [REFERENCE] }] });
  assert.ok(V.primaryKept(primaryGone).length && V.referenceGone(primaryGone).length, "a wrong-target drop is rejected");
  assert.ok(V.raisedVerdict({ ...ok, stderr: `[e2e-server] ${NEEDLE.dropError}` }, NEEDLE.deployReason).length, "a masked verdict is rejected");
  assert.ok(V.noFalseSuccess({ ...ok, status: 0 }).length, "a false success is rejected");
  assert.ok(V.shows({ ...ok, stdout: "", stderr: "" }, NEEDLE.dropError, "x").length, "a silent cleanup failure is rejected");
  assert.ok(V.fired({ ...ok, faultsFired: [] }, "cleanup-drop-throws").length, "a fault that never fired is a precondition failure, not a pass");
  assert.ok(V.verdictLogged({ ...ok, summary: "" }, NEEDLE.deployReason).length, "a verdict missing from the step summary is rejected");
});
