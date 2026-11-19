import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planCreditGrants, tokenTransactions } from "../drizzle/schema";
import { CREDIT_GRANT_SOURCES, CREDIT_GRANT_STATUSES, TOKEN_LEDGER_KINDS } from "../shared/creditLedger";
import { DESIRED_COLUMNS, DESIRED_FOREIGN_KEYS, DESIRED_INDEXES, DESIRED_TABLES } from "./schemaReconcile";

// The ledger's enums are declared once in shared/creditLedger.ts; drizzle/schema.ts
// and migration 0089 must carry the same values in the same order (MySQL ENUM order
// is part of the column definition, so a reordered MODIFY would rewrite stored values).
const migration = readFileSync(new URL("../drizzle/deploy/0089_credit_ledger.sql", import.meta.url), "utf8");
const quoted = (values: readonly string[], quote: string) => values.map(value => `${quote}${value}${quote}`).join(",");

describe("credit ledger schema contract (0089)", () => {
  it("tokenTransactions.kind is the shared ledger kind list, existing values first and in order", () => {
    expect([...tokenTransactions.kind.enumValues]).toEqual([...TOKEN_LEDGER_KINDS]);
    expect(TOKEN_LEDGER_KINDS.slice(0, 11)).toEqual(["purchase", "direct_request", "admin_adjustment", "company_coverage_reward", "personal_referral_reward", "invite_reward_pending", "invite_reward_granted", "withdrawal_refund", "promo_grant", "promo_spend", "expiry_refund"]);
    // 0089 shipped the first sixteen kinds; its file is immutable (0091 appends trial_grant).
    expect(migration).toContain(`MODIFY \`kind\` ENUM(${quoted(TOKEN_LEDGER_KINDS.slice(0, 16), "''")}) NOT NULL`);
  });

  it("planCreditGrants source and status match the shared contract and the migration", () => {
    expect([...planCreditGrants.source.enumValues]).toEqual([...CREDIT_GRANT_SOURCES]);
    expect([...planCreditGrants.status.enumValues]).toEqual([...CREDIT_GRANT_STATUSES]);
    expect(migration).toContain(`\`source\` enum(${quoted(CREDIT_GRANT_SOURCES.slice(0, 2), "'")}) NOT NULL`);
    expect(migration).toContain(`\`status\` enum(${quoted(CREDIT_GRANT_STATUSES, "'")}) NOT NULL DEFAULT 'active'`);
  });

  it("is additive and guarded: no data writes, every ALTER/CREATE INDEX behind information_schema", () => {
    const body = migration.replace(/--.*$/gm, "");
    expect(body).not.toMatch(/\b(INSERT\s+INTO|DELETE\s+FROM|DROP|TRUNCATE|RENAME)\b|^\s*UPDATE\s/im);
    expect(body).toMatch(/CREATE TABLE IF NOT EXISTS `planCreditGrants`/);
    expect(body.match(/information_schema\./g)).toHaveLength(4);
  });

  it("boot reconcile requires exactly what 0089 creates", () => {
    const table = DESIRED_TABLES.find(item => item.table === "planCreditGrants");
    expect(table?.createSql).toContain("UNIQUE INDEX `plan_credit_grants_grant_key_unique`(`grantKey`)");
    expect(DESIRED_COLUMNS).toContainEqual({ table: "tokenTransactions", column: "creditGrantId", definition: "INT NULL" });
    for (const name of ["plan_credit_grants_grant_key_unique", "plan_credit_grants_user_status_idx", "plan_credit_grants_status_expiry_idx", "token_transactions_credit_grant_idx", "token_transactions_cycle_idx"]) {
      expect(DESIRED_INDEXES.some(index => index.name === name)).toBe(true);
      expect(migration).toContain(name);
    }
    expect(DESIRED_INDEXES.find(index => index.name === "plan_credit_grants_grant_key_unique")?.nonUnique).toBeUndefined();
    expect(DESIRED_FOREIGN_KEYS).toContainEqual({ table: "planCreditGrants", column: "userId", referencedTable: "users", referencedColumn: "id" });
  });
});
