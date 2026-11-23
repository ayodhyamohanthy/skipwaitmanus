import { afterEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { DESIRED_COLUMNS, DESIRED_FOREIGN_KEYS, DESIRED_INDEXES, DESIRED_TABLES } from "./schemaReconcile";

const walletEnum = "enum('free','pro','max','start','momentum','land_100','land_200','land_500','keep_warm','land_focus','land_sprint','land_concierge','early_to_mid','mid_to_senior','senior_to_executive')";
const intentEnum = walletEnum.replace("'free',", "");
const checks = [
  ["bandedReferralBalances", "banded_balances_included_cycle"],
  ["bandedFoundingCounters", "banded_founding_counter_cap"],
  ["bandedFoundingMemberships", "banded_founding_sequence_cap"],
  ["bandedFoundingMemberships", "banded_founding_state"],
  ["bandedCheckoutIntents", "banded_intents_expected_total_positive"],
] as const;
const columns = () => [
  { TABLE_NAME: "tokenBalances", COLUMN_NAME: "plan", COLUMN_TYPE: walletEnum, IS_NULLABLE: "NO", COLUMN_DEFAULT: "free" },
  { TABLE_NAME: "subscriptionCheckoutIntents", COLUMN_NAME: "plan", COLUMN_TYPE: intentEnum, IS_NULLABLE: "NO", COLUMN_DEFAULT: null },
];
type IndexMetadata = { TABLE_NAME: string; INDEX_NAME: string; COLUMN_NAME: string; SEQ_IN_INDEX: number | string; NON_UNIQUE: number | string; SUB_PART: number | string | null };
const indexes = (): IndexMetadata[] => DESIRED_INDEXES.filter(index => index.table.startsWith("banded")).flatMap(index =>
  index.columns.replaceAll("`", "").split(",").map((column, position) => ({ TABLE_NAME: index.table, INDEX_NAME: index.name, COLUMN_NAME: column, SEQ_IN_INDEX: position + 1, NON_UNIQUE: index.nonUnique ? 1 : 0, SUB_PART: null })),
);
const constraints = () => checks.map(([table, name]) => ({ TABLE_NAME: table, CONSTRAINT_NAME: name, ENFORCED: "YES" }));
const baseRows = () => [
  ...DESIRED_COLUMNS.map(column => ({ TABLE_NAME: column.table, COLUMN_NAME: column.column, INDEX_NAME: null, NON_UNIQUE: null })),
  ...DESIRED_TABLES.map(table => ({ TABLE_NAME: table.table, COLUMN_NAME: "id", INDEX_NAME: null, NON_UNIQUE: null })),
  ...DESIRED_INDEXES.map(index => ({ TABLE_NAME: index.table, COLUMN_NAME: null, INDEX_NAME: index.name, NON_UNIQUE: index.nonUnique ? 1 : 0 })),
];
const foreignKeys = DESIRED_FOREIGN_KEYS.map(key => ({ TABLE_NAME: key.table, COLUMN_NAME: key.column, REFERENCED_TABLE_NAME: key.referencedTable, REFERENCED_COLUMN_NAME: key.referencedColumn }));
async function reconcile(overrides: { columns?: ReturnType<typeof columns>; indexes?: ReturnType<typeof indexes>; constraints?: ReturnType<typeof constraints> } = {}) {
  const calls: string[] = [];
  vi.resetModules();
  vi.doMock("./db", () => ({ getDb: async () => ({ execute: async (query: Parameters<MySqlDialect["sqlToQuery"]>[0]) => {
    const text = new MySqlDialect().sqlToQuery(query).sql;
    calls.push(text);
    if (text.includes("UNION ALL")) return [baseRows(), []];
    if (text.includes("KEY_COLUMN_USAGE")) return [foreignKeys, []];
    if (text.includes("TABLE_CONSTRAINTS")) return [overrides.constraints ?? constraints(), []];
    if (text.includes("STATISTICS")) return [overrides.indexes ?? indexes(), []];
    if (text.includes("COLUMNS")) return [overrides.columns ?? columns(), []];
    throw new Error(`Unexpected validation query: ${text}`);
  } }) }));
  const module = await import("./schemaReconcile");
  await module.reconcileSchema();
  return { module, calls };
}
afterEach(() => vi.restoreAllMocks());

describe("banded storage readiness", () => {
  it("accepts the migrated definitions with SELECT-only traffic", async () => {
    const { module, calls } = await reconcile();
    expect(module.isSchemaReconciled()).toBe(true);
    expect(calls.every(query => query.trimStart().startsWith("SELECT"))).toBe(true);
    expect(calls.some(query => query.includes("ENFORCED"))).toBe(true);
  });
  it.each(["tokenBalances", "subscriptionCheckoutIntents"])("rejects the pre-migration %s plan enum", async table => {
    const rows = columns().map(column => column.TABLE_NAME === table ? { ...column, COLUMN_TYPE: column.COLUMN_TYPE.replace(",'early_to_mid','mid_to_senior','senior_to_executive'", "") } : column);
    const { module } = await reconcile({ columns: rows });
    expect(module.isSchemaReconciled()).toBe(false);
    expect(module.getLastReconcileResults()).toContainEqual({ statement: `definition:${table}.plan`, ok: false, errorCode: "SCHEMA_MISMATCH" });
  });
  it("rejects reordered enum ordinals", async () => {
    const rows = columns().map(column => ({ ...column, COLUMN_TYPE: column.COLUMN_TYPE.replace("'pro','max'", "'max','pro'") }));
    expect((await reconcile({ columns: rows })).module.isSchemaReconciled()).toBe(false);
  });
  it("rejects a changed wallet default or nullable intent plan", async () => {
    expect((await reconcile({ columns: columns().map(column => ({ ...column, COLUMN_DEFAULT: "early_to_mid" })) })).module.isSchemaReconciled()).toBe(false);
    expect((await reconcile({ columns: columns().map(column => ({ ...column, IS_NULLABLE: "YES" })) })).module.isSchemaReconciled()).toBe(false);
  });
  it.each(DESIRED_INDEXES.filter(index => index.table.startsWith("banded")))("rejects wrong columns under the existing $name index name", async index => {
    const rows = indexes().map(row => row.INDEX_NAME === index.name && row.TABLE_NAME === index.table ? { ...row, COLUMN_NAME: "id" } : row);
    const { module } = await reconcile({ indexes: rows });
    expect(module.isSchemaReconciled()).toBe(false);
    expect(module.getLastReconcileResults()).toContainEqual({ statement: `definition:${index.table}.${index.name}`, ok: false, errorCode: "SCHEMA_MISMATCH" });
  });
  it("rejects a nonunique or prefix-only sequence index", async () => {
    for (const change of [{ NON_UNIQUE: 1 }, { SUB_PART: 4 }]) {
      const rows = indexes().map(row => row.INDEX_NAME === "banded_founding_sequence_unique" ? { ...row, ...change } : row);
      expect((await reconcile({ indexes: rows })).module.isSchemaReconciled()).toBe(false);
    }
  });
  it.each(checks)("rejects missing enforced CHECK %s.%s", async (table, name) => {
    const { module } = await reconcile({ constraints: constraints().filter(row => row.CONSTRAINT_NAME !== name) });
    expect(module.isSchemaReconciled()).toBe(false);
    expect(module.getLastReconcileResults()).toContainEqual({ statement: `check:${table}.${name}`, ok: false, errorCode: "SCHEMA_MISMATCH" });
  });
  it.each(checks)("rejects NOT ENFORCED CHECK %s.%s", async (_table, name) => {
    const rows = constraints().map(row => row.CONSTRAINT_NAME === name ? { ...row, ENFORCED: "NO" } : row);
    expect((await reconcile({ constraints: rows })).module.isSchemaReconciled()).toBe(false);
  });
  it("accepts lowercase identifiers and numeric metadata returned as strings", async () => {
    const { module } = await reconcile({
      columns: columns().map(row => ({ ...row, TABLE_NAME: row.TABLE_NAME.toLowerCase(), COLUMN_NAME: row.COLUMN_NAME.toUpperCase() })),
      indexes: indexes().map(row => ({ ...row, TABLE_NAME: row.TABLE_NAME.toLowerCase(), SEQ_IN_INDEX: String(row.SEQ_IN_INDEX), NON_UNIQUE: String(row.NON_UNIQUE) })),
      constraints: constraints().map(row => ({ ...row, TABLE_NAME: row.TABLE_NAME.toLowerCase() })),
    });
    expect(module.isSchemaReconciled()).toBe(true);
  });
});
