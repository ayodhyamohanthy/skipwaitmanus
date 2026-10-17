/**
 * Turns `drizzle-kit export --sql` output into statements MySQL 8 accepts.
 *
 * The exported DDL is the schema the application code is typed against, so the
 * concurrency sandbox builds itself from it rather than from a migration file.
 * Two things stop that output from running verbatim: the exporter prefixes a
 * "Reading schema files:" preamble, and drizzle derives foreign key labels from
 * table + column + referenced table + column, which overflows MySQL's 64-char
 * identifier limit for 11 keys in `drizzle/schema.ts`.
 *
 * Only the label is over budget, so the label is dropped and InnoDB names the
 * constraint. `prepare-mysql-test-schema.mjs` then reads the created constraints
 * back out of information_schema and compares them to `declared`, which is what
 * makes dropping a name safe. An over-long UNIQUE or index name is a hard
 * failure instead, because those names are what the specs assert on and only
 * `drizzle/schema.ts` can change them.
 */
export const IDENTIFIER_LIMIT = 64;
const DDL_START = /^(CREATE TABLE|CREATE INDEX|CREATE UNIQUE INDEX|ALTER TABLE)\b/;
const CREATE_TABLE = /^CREATE TABLE `([^`]+)`/;
const NAMED_IDENTIFIER = /CONSTRAINT `([^`]+)`|CREATE (?:UNIQUE )?INDEX `([^`]+)`/g;
const FOREIGN_KEY =
  /^ALTER TABLE `([^`]+)` ADD (?:CONSTRAINT `([^`]+)` )?FOREIGN KEY \(([^)]+)\) REFERENCES `([^`]+)`\(([^)]+)\)([\s\S]*)$/;

export class DdlError extends Error {}

function columns(columnList) {
  return Array.from(columnList.matchAll(/`([^`]+)`/g)).map(match => match[1]).join(",");
}

/**
 * InnoDB enforces RESTRICT and NO ACTION identically, and the two spellings are
 * not interchangeable between DDL text and information_schema, so compare
 * through one canonical form instead of reporting a distinction the engine does
 * not make.
 */
export function canonicalRule(rule) {
  return rule === "RESTRICT" ? "NO ACTION" : rule;
}

function deleteRuleOf(actions) {
  return canonicalRule(actions.match(/ON DELETE ((?:SET |NO )?\w+)/i)?.[1]?.toUpperCase() ?? "NO ACTION");
}

function parseForeignKey(statement) {
  const match = statement.match(FOREIGN_KEY);
  if (!match) return undefined;
  const [, table, name, foreignColumns, referencedTable, referencedColumns, actions] = match;
  return {
    key: `${table}(${columns(foreignColumns)})->${referencedTable}(${columns(referencedColumns)}) ${deleteRuleOf(actions)}`,
    name,
  };
}

/**
 * Splits exported DDL into whole statements and drops the exporter's preamble.
 * Every statement must be classifiable: an unrecognised leading keyword means
 * the exporter changed shape, and silently skipping it would build a sandbox
 * that is missing constraints the specs reason about.
 */
export function parseExportedDdl(raw) {
  const lines = String(raw).split("\n");
  const start = lines.findIndex(line => DDL_START.test(line.trim()));
  if (start === -1) throw new DdlError(`no DDL in drizzle-kit export output:\n${lines.slice(0, 20).join("\n")}`);
  const statements = lines
    .slice(start)
    .join("\n")
    .split(";")
    .map(statement => statement.trim())
    .filter(Boolean);
  const unexpected = statements.find(statement => !DDL_START.test(statement));
  if (unexpected) throw new DdlError(`unclassifiable DDL statement:\n${unexpected.slice(0, 400)}`);
  const tables = statements.flatMap(statement => {
    if (!statement.startsWith("CREATE TABLE")) return [];
    const match = statement.match(CREATE_TABLE);
    if (!match) throw new DdlError(`CREATE TABLE name could not be parsed:\n${statement.slice(0, 200)}`);
    return [match[1]];
  });
  return { statements, tables };
}

/**
 * Rewrites over-long foreign key labels away and records every declared
 * relationship so it can be verified after the DDL runs.
 */
export function applyIdentifierLimit(statements) {
  let unnamedForeignKeys = 0;
  const declared = [];
  const applied = statements.map(statement => {
    for (const [, constraintName, indexName] of Array.from(statement.matchAll(NAMED_IDENTIFIER))) {
      const name = constraintName ?? indexName;
      if (name.length > IDENTIFIER_LIMIT && !FOREIGN_KEY.test(statement)) {
        throw new DdlError(`identifier "${name}" is ${name.length} characters, over MySQL's ${IDENTIFIER_LIMIT} limit: give it a shorter explicit name in drizzle/schema.ts`);
      }
    }
    const declaredKey = parseForeignKey(statement);
    if (declaredKey) declared.push(declaredKey);
    if (!declaredKey?.name || declaredKey.name.length <= IDENTIFIER_LIMIT) return statement;
    unnamedForeignKeys += 1;
    return statement.replace(`CONSTRAINT \`${declaredKey.name}\` `, "");
  });
  return { applied, declared, unnamedForeignKeys };
}

/**
 * Collapses `information_schema` constraint rows into one entry per foreign key
 * so a composite key counts once: REFERENTIAL_CONSTRAINTS joins to one
 * KEY_COLUMN_USAGE row per column. Callers must order by constraint name and
 * ordinal position so the column lists keep their declared order.
 */
export function groupForeignKeys(rows) {
  const byConstraint = new Map();
  for (const row of rows) {
    const parts = byConstraint.get(row.constraintName) ?? {
      tableName: row.tableName,
      referencedTable: row.referencedTable,
      deleteRule: row.deleteRule,
      columns: [],
      referencedColumns: [],
    };
    parts.columns.push(row.columnName);
    parts.referencedColumns.push(row.referencedColumn);
    byConstraint.set(row.constraintName, parts);
  }
  const relationships = new Map();
  for (const parts of byConstraint.values()) {
    const key = `${parts.tableName}(${parts.columns.join(",")})->${parts.referencedTable}(${parts.referencedColumns.join(",")}) ${canonicalRule(String(parts.deleteRule))}`;
    relationships.set(key, (relationships.get(key) ?? 0) + 1);
  }
  return relationships;
}
