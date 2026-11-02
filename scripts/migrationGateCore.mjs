// GATE-migration-apply (D-212, docs/plans/GATE-migration-apply.md): the pure
// half of the CI migration gate. scripts/e2e-server.mjs does the I/O (git show,
// drizzle-kit push, the deploy runs, the two information_schema reads); every
// decision about what those reads prove lives here, where it is testable without
// a database.
//
// What fails, what warns and what fails open are rulings 4 and 5 of the packet.
// A definite breach - a deploy run that errors, a second run that applies
// anything, a table or column the PR's schema.ts declares that the migrated
// database does not have - fails. A difference in type, nullability or default,
// a key with no column-set match and objects only in the migrated database
// warn. A tool that cannot run (unresolved base revision, a failed push) warns
// and keeps the run green.

/** The deploy ledger is not part of the schema either side declares. */
const LEDGER_TABLE = "schemaDeployMigrations";
const ZERO_SHA = /^0+$/;
const SUCCESS_LINES = [/Changes applied/i, /No changes/i];
const ASPECTS = ["type", "nullable", "default"];

/** Ruling 5: the revision a PR is compared against, or null when there is none. */
export function baseRevisionOf({ eventName, prBaseSha, before } = {}) {
  const raw = eventName === "push" ? before : prBaseSha;
  if (typeof raw !== "string") return null;
  const sha = raw.trim();
  return !sha || ZERO_SHA.test(sha) ? null : sha;
}

/**
 * Ruling 6: a push is judged by its output. drizzle-kit 0.31.5 exits 0 while
 * printing `Error: Identifier name '...' is too long` (ER_TOO_LONG_IDENT), so
 * the exit code alone is not evidence that the schema it pushed is complete.
 */
export function pushOutcome(output, exitOk) {
  const text = String(output ?? "");
  const lines = text.split("\n");
  if (!exitOk) return { ok: false, reason: lastMeaningful(lines) || "drizzle-kit push exited non-zero" };
  const errorLine = lines.find(line => /^\s*Error\b/.test(line));
  if (errorLine) return { ok: false, reason: errorLine.trim() };
  if (text.includes("sqlMessage")) return { ok: false, reason: lines.find(line => line.includes("sqlMessage")).trim() };
  if (SUCCESS_LINES.some(pattern => pattern.test(text))) return { ok: true, reason: "" };
  return { ok: false, reason: `no success line: ${lastMeaningful(lines) || "empty output"}` };
}

function lastMeaningful(lines) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (line) return line.slice(0, 300);
  }
  return "";
}

/** The information_schema reads, reduced to what a comparison needs. */
export function normalizeSnapshot({ tables = [], columns = [], indexes = [], foreignKeys = [] } = {}) {
  return {
    tables: new Set(tables.map(row => row.tableName).filter(name => name !== LEDGER_TABLE)),
    columns: new Map(
      columns
        .filter(row => row.tableName !== LEDGER_TABLE)
        .map(row => [`${row.tableName}.${row.columnName}`, {
          table: row.tableName,
          name: row.columnName,
          type: normType(row.columnType),
          nullable: normNullable(row.isNullable),
          default: normDefault(row.columnDefault),
        }]),
    ),
    indexes: indexes
      .filter(row => row.tableName !== LEDGER_TABLE)
      .map(row => ({ table: row.tableName, name: row.indexName, unique: Number(row.nonUnique) === 0, columns: ordered(row.columns, "seqInIndex") })),
    foreignKeys: foreignKeys
      .filter(row => row.tableName !== LEDGER_TABLE)
      .map(row => ({
        table: row.tableName,
        name: row.constraintName,
        columns: ordered(row.columns, "ordinalPosition"),
        referencedTable: row.referencedTable,
        referencedColumns: ordered(row.referencedColumns, "ordinalPosition"),
      })),
  };
}

function ordered(parts, key) {
  return [...(parts ?? [])].sort((a, b) => a[key] - b[key]).map(part => part.columnName);
}

const normType = value => String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const normNullable = value => /^(YES|1|true)$/i.test(String(value ?? ""));

/** §3: `now()` and `CURRENT_TIMESTAMP` are the same default, with or without parens. */
function normDefault(value) {
  if (value === null || value === undefined) return null;
  let text = String(value).trim().toLowerCase();
  while (text.startsWith("(") && text.endsWith(")")) text = text.slice(1, -1).trim();
  if (!text) return null;
  return /^(now\(\)|current_timestamp(?:\(\))?|localtime)$/.test(text) ? "current_timestamp" : text;
}

// Ruling 3: drizzle-kit generates its own names, so a key matches on its column
// set rather than on the name either side gave it.
const indexKey = key => `i|${key.table}|${key.columns.join(",")}|${key.unique ? "unique" : "plain"}`;
const fkKey = key => `f|${key.table}|${key.columns.join(",")}|${key.referencedTable}|${key.referencedColumns.join(",")}`;

function keySet(snapshot) {
  const keys = new Map();
  for (const key of snapshot.indexes) keys.set(indexKey(key), `${key.name || key.columns.join(",")} (index) on ${key.table}`);
  for (const key of snapshot.foreignKeys) keys.set(fkKey(key), `${key.name || key.columns.join(",")} (fk) on ${key.table} -> ${key.referencedTable}`);
  return keys;
}

/**
 * §3 normalization: tables and columns by name, indexes and foreign keys by
 * column set, `now()` and `CURRENT_TIMESTAMP` equal, the ledger table ignored.
 */
export function compareSchemas(migrated, reference) {
  const missingTables = [...reference.tables].filter(name => !migrated.tables.has(name)).sort();
  const extraTables = [...migrated.tables].filter(name => !reference.tables.has(name)).sort();
  const missingColumns = [];
  const differingColumns = [];
  for (const [label, headColumn] of reference.columns) {
    if (!reference.tables.has(headColumn.table) || missingTables.includes(headColumn.table)) continue;
    const migratedColumn = migrated.columns.get(label);
    if (!migratedColumn) {
      missingColumns.push(label);
      continue;
    }
    for (const aspect of ASPECTS) {
      if (migratedColumn[aspect] !== headColumn[aspect]) {
        differingColumns.push({ column: label, aspect, migrated: display(migratedColumn[aspect]), reference: display(headColumn[aspect]) });
      }
    }
  }
  const extraColumns = [...migrated.columns]
    .filter(([, column]) => reference.tables.has(column.table) && !reference.columns.has(`${column.table}.${column.name}`))
    .map(([label]) => label)
    .sort();
  const migratedKeys = keySet(migrated);
  const headKeys = keySet(reference);
  return {
    missingTables,
    missingColumns: missingColumns.sort(),
    differingColumns,
    keysMissing: [...headKeys].filter(([id]) => !migratedKeys.has(id)).map(([, label]) => label).sort(),
    extraTables,
    extraColumns,
    extraKeys: [...migratedKeys].filter(([id]) => !headKeys.has(id)).map(([, label]) => label).sort(),
  };
}

const display = value => (value === null ? "null" : String(value));

const EMPTY_COMPARISON = { missingTables: [], missingColumns: [], differingColumns: [], keysMissing: [], extraTables: [], extraColumns: [], extraKeys: [] };

/**
 * Rulings 4 and 5: the lines the CI step summary shows and the status the
 * process acts on. `deployRuns` holds each pass once; a null `basePush`,
 * `referencePush` or `comparison` means that step did not run.
 */
export function gateVerdict({ baseSha, basePush, deployRuns = [], referencePush, comparison } = {}) {
  const summaryLines = [];
  const failures = [];
  const warnings = [];

  if (baseSha && basePush?.ok) summaryLines.push(`- Base revision schema pushed: \`${baseSha.slice(0, 12)}\`.`);
  else {
    const reason = baseSha ? `could not be pushed (${basePush.reason})` : "is not in this event";
    warnings.push("base-revision path not proven this run");
    summaryLines.push(`- Base revision \`${baseSha ? baseSha.slice(0, 12) : ""}\` ${reason}; falling back to the head schema for the journeys.`);
  }

  for (const run of deployRuns) {
    if (!run.ok) {
      failures.push(`deploy migrations failed on run ${run.pass}${run.reason ? `: ${run.reason}` : ""}`);
      summaryLines.push(`- Deploy migrations, run ${run.pass}: **failed**.`);
    } else {
      summaryLines.push(`- Deploy migrations, run ${run.pass}: ${run.applied} applied.`);
    }
  }
  const secondRun = deployRuns.find(run => run.pass === 2 && run.ok);
  if (secondRun && secondRun.applied !== 0) failures.push(`the second deploy run applied ${secondRun.applied} file(s); it must apply none`);

  if (referencePush && !referencePush.ok) {
    warnings.push("drift check skipped");
    summaryLines.push(`- Reference schema push failed (${referencePush.reason}); the drift check is skipped.`);
  }

  const diff = comparison ?? EMPTY_COMPARISON;
  const lists = [
    ["fail", "columns the head schema declares are missing", diff.missingColumns],
    ["fail", "tables the head schema declares are missing", diff.missingTables],
    ["warn", "differing columns", diff.differingColumns.map(entry => `${entry.column} ${entry.aspect}: migrated ${entry.migrated}, head ${entry.reference}`)],
    ["warn", "head keys with no column-set match", diff.keysMissing],
    ["warn", "tables only in the migrated base", diff.extraTables],
    ["warn", "columns only in the migrated base", diff.extraColumns],
    ["warn", "keys only in the migrated base", diff.extraKeys],
  ];
  for (const [level, label, entries] of lists) {
    if (!entries.length) continue;
    summaryLines.push(`- ${label}: ${entries.join("; ")}.`);
    (level === "fail" ? failures : warnings).push(`${label}: ${entries.join(", ")}`);
  }
  if (comparison && !failures.length && !warnings.length) summaryLines.push("- Drift check: no drift between the migrated base and the head schema.");

  const status = failures.length ? "fail" : warnings.length ? "warn" : "pass";
  if (failures.length) summaryLines.unshift(`- Migration gate: **FAILED** - ${failures.join("; ")}.`);
  else if (status === "warn") summaryLines.unshift("- Migration gate: passed with warnings.");
  return { status, summaryLines };
}
