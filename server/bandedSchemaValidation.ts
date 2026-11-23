import { sql } from "drizzle-orm";
import { z } from "zod";
import { INTENT_PLAN_IDS, WALLET_PLAN_IDS } from "../shared/billingCatalog";
import type { getDb } from "./db";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type RequiredIndex = { table: string; name: string; columns: string; nonUnique?: boolean };
export type SchemaDefinitionCheck = { key: string; ok: boolean };

export const BANDED_PLAN_COLUMNS = [
  { table: "tokenBalances", column: "plan", values: WALLET_PLAN_IDS, defaultValue: "free" },
  { table: "subscriptionCheckoutIntents", column: "plan", values: INTENT_PLAN_IDS, defaultValue: null },
] as const;
export const BANDED_CHECK_CONSTRAINTS = [
  { table: "bandedReferralBalances", name: "banded_balances_included_cycle" },
  { table: "bandedFoundingCounters", name: "banded_founding_counter_cap" },
  { table: "bandedFoundingMemberships", name: "banded_founding_sequence_cap" },
  { table: "bandedFoundingMemberships", name: "banded_founding_state" },
  { table: "bandedCheckoutIntents", name: "banded_intents_expected_total_positive" },
] as const;

const metadataInteger = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/).transform(Number)]);
const columnRow = z.object({
  TABLE_NAME: z.string(), COLUMN_NAME: z.string(), COLUMN_TYPE: z.string(),
  IS_NULLABLE: z.enum(["YES", "NO"]), COLUMN_DEFAULT: z.string().nullable(),
}).strict();
const indexRow = z.object({
  TABLE_NAME: z.string(), INDEX_NAME: z.string(), COLUMN_NAME: z.string().nullable(),
  SEQ_IN_INDEX: metadataInteger, NON_UNIQUE: metadataInteger, SUB_PART: metadataInteger.nullable(),
}).strict();
const constraintRow = z.object({
  TABLE_NAME: z.string(), CONSTRAINT_NAME: z.string(), ENFORCED: z.enum(["YES", "NO"]),
}).strict();
const sameIdentifier = (actual: string, expected: string) => actual.toLowerCase() === expected.toLowerCase();

// Names alone do not establish the migrated money contract. These SELECTs
// validate the ENUM order/defaults, complete ordered keys and enforced CHECKs.
// The actual cap expressions are exercised against 0123 by the MySQL tests.
export async function validateBandedSchema(db: Pick<Database, "execute">, requiredIndexes: readonly RequiredIndex[]): Promise<SchemaDefinitionCheck[]> {
  const [columnRows] = await db.execute(sql`SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME='plan' AND LOWER(TABLE_NAME) IN ('tokenbalances','subscriptioncheckoutintents')`);
  const columns = z.array(columnRow).parse(columnRows);
  const [indexRows] = await db.execute(sql`SELECT TABLE_NAME,INDEX_NAME,COLUMN_NAME,SEQ_IN_INDEX,NON_UNIQUE,SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND LOWER(TABLE_NAME) IN ('bandedreferralbalances','bandedfoundingcounters','bandedfoundingmemberships','bandedcheckoutintents')`);
  const indexes = z.array(indexRow).parse(indexRows);
  const [constraintRows] = await db.execute(sql`SELECT TABLE_NAME,CONSTRAINT_NAME,ENFORCED FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND CONSTRAINT_TYPE='CHECK' AND LOWER(TABLE_NAME) IN ('bandedreferralbalances','bandedfoundingcounters','bandedfoundingmemberships','bandedcheckoutintents')`);
  const constraints = z.array(constraintRow).parse(constraintRows);

  return [
    ...BANDED_PLAN_COLUMNS.map(expected => {
      const matches = columns.filter(row => sameIdentifier(row.TABLE_NAME, expected.table) && sameIdentifier(row.COLUMN_NAME, expected.column));
      const [actual] = matches;
      return {
        key: `definition:${expected.table}.${expected.column}`,
        ok: matches.length === 1 && actual !== undefined
          && actual.COLUMN_TYPE === `enum(${expected.values.map(value => `'${value}'`).join(",")})`
          && actual.IS_NULLABLE === "NO" && actual.COLUMN_DEFAULT === expected.defaultValue,
      };
    }),
    ...requiredIndexes.filter(index => index.table.startsWith("banded")).map(expected => {
      const actual = indexes.filter(row => sameIdentifier(row.TABLE_NAME, expected.table) && sameIdentifier(row.INDEX_NAME, expected.name)).sort((left, right) => left.SEQ_IN_INDEX - right.SEQ_IN_INDEX);
      const expectedColumns = expected.columns.replaceAll("`", "").split(",");
      return {
        key: `definition:${expected.table}.${expected.name}`,
        ok: actual.length === expectedColumns.length && expectedColumns.every((column, position) => {
          const row = actual[position];
          return row !== undefined && row.COLUMN_NAME !== null && sameIdentifier(row.COLUMN_NAME, column)
            && row.SEQ_IN_INDEX === position + 1 && row.NON_UNIQUE === (expected.nonUnique ? 1 : 0) && row.SUB_PART === null;
        }),
      };
    }),
    ...BANDED_CHECK_CONSTRAINTS.map(expected => ({
      key: `check:${expected.table}.${expected.name}`,
      ok: constraints.some(row => sameIdentifier(row.TABLE_NAME, expected.table) && sameIdentifier(row.CONSTRAINT_NAME, expected.name) && row.ENFORCED === "YES"),
    })),
  ];
}
