import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { billingInvoices, planCreditGrants, subscriptionCheckoutIntents, tokenBalances, tokenTransactions } from "../drizzle/schema";
import { BILLING_PERIODS, INTENT_PLAN_IDS, RESERVED_PLAN_IDS, WALLET_PLAN_IDS } from "../shared/billingCatalog";
import { CREDIT_GRANT_SOURCES, TOKEN_LEDGER_KINDS } from "../shared/creditLedger";
import { CATALOG_PLAN_IDS } from "../shared/planCatalog";
import { DESIRED_COLUMNS, DESIRED_TABLES } from "./schemaReconcile";

// Migration 0091 (the Oct 14 2026 pricing model). Every ENUM it widens keeps
// the values already stored first and in order (MySQL stores the index), and
// the shared contracts, drizzle/schema.ts and the migration carry one list.
const migration = readFileSync(new URL("../drizzle/deploy/0091_pricing_model.sql", import.meta.url), "utf8");
// 0112 (D-132 plan-family checkout) appends fast_track/insider to the intent
// enum; 0091 keeps its historical 11-value set and the latest widening carries
// the full list.
const migration0112 = readFileSync(new URL("../drizzle/deploy/0112_v2_plan_family_intents.sql", import.meta.url), "utf8");
// 0113 owns the wallet plan enum's v2 widening; 0091 keeps its historical
// 12-value set and the latest widening carries the full WALLET_PLAN_IDS list.
const migration0113 = readFileSync(new URL("../drizzle/deploy/0113_v2_plan_family_wallets.sql", import.meta.url), "utf8");
const quoted = (values: readonly string[]) => values.map(value => `''${value}''`).join(",");

describe("pricing model schema contract (0091)", () => {
  it("plan enums append Keep warm and the renamed Land levels after 0090's values; every catalog plan is storable", () => {
    expect(WALLET_PLAN_IDS.slice(0, 8)).toEqual(["free", "pro", "max", "start", "momentum", "land_100", "land_200", "land_500"]);
    expect(INTENT_PLAN_IDS.slice(0, 7)).toEqual(["pro", "max", "start", "momentum", "land_100", "land_200", "land_500"]);
    for (const plan of CATALOG_PLAN_IDS) {
      expect(WALLET_PLAN_IDS).toContain(plan);
      expect(INTENT_PLAN_IDS).toContain(plan);
    }
    expect(RESERVED_PLAN_IDS.some(plan => (CATALOG_PLAN_IDS as readonly string[]).includes(plan))).toBe(false);
    expect([...tokenBalances.plan.enumValues]).toEqual([...WALLET_PLAN_IDS]);
    expect([...subscriptionCheckoutIntents.plan.enumValues]).toEqual([...INTENT_PLAN_IDS]);
    expect(migration).toContain(`MODIFY \`plan\` ENUM(${quoted(WALLET_PLAN_IDS.slice(0, 12))}) NOT NULL DEFAULT ''free''`);
    expect(migration0113).toContain(`MODIFY \`plan\` ENUM(${quoted(WALLET_PLAN_IDS)}) NOT NULL DEFAULT ''free''`);
    expect(INTENT_PLAN_IDS.slice(11)).toEqual(["fast_track", "insider"]);
    expect(migration).toContain(`MODIFY \`plan\` ENUM(${quoted(INTENT_PLAN_IDS.slice(0, 11))}) NOT NULL`);
    expect(migration0112).toContain(`MODIFY \`plan\` ENUM(${quoted(INTENT_PLAN_IDS)}) NOT NULL`);
  });

  it("billing periods append the 30- and 90-day passes after monthly and yearly, on every period column", () => {
    expect(BILLING_PERIODS).toEqual(["monthly", "yearly", "30d", "90d"]);
    for (const column of [tokenBalances.subscriptionBillingPeriod, tokenBalances.pendingBillingPeriod, subscriptionCheckoutIntents.billingPeriod, billingInvoices.billingPeriod]) expect([...column.enumValues]).toEqual([...BILLING_PERIODS]);
    expect(migration).toContain(`MODIFY \`subscriptionBillingPeriod\` ENUM(${quoted(BILLING_PERIODS)}) NULL, MODIFY \`pendingBillingPeriod\` ENUM(${quoted(BILLING_PERIODS)}) NULL`);
    expect(migration).toContain(`MODIFY \`billingPeriod\` ENUM(${quoted(BILLING_PERIODS)}) NOT NULL DEFAULT ''monthly''`);
    expect(migration).toContain(`ALTER TABLE \`billingInvoices\` MODIFY \`billingPeriod\` ENUM(${quoted(BILLING_PERIODS)}) NULL`);
  });

  it("the ledger gains the trial grant source and kind, appended", () => {
    expect([...planCreditGrants.source.enumValues]).toEqual([...CREDIT_GRANT_SOURCES]);
    expect(CREDIT_GRANT_SOURCES).toEqual(["carryover", "welcome", "trial"]);
    expect([...tokenTransactions.kind.enumValues]).toEqual([...TOKEN_LEDGER_KINDS]);
    expect(TOKEN_LEDGER_KINDS.at(-1)).toBe("trial_grant");
    expect(migration).toContain(`MODIFY \`source\` ENUM(${quoted(CREDIT_GRANT_SOURCES)}) NOT NULL`);
    expect(migration).toContain(`MODIFY \`kind\` ENUM(${quoted(TOKEN_LEDGER_KINDS)}) NOT NULL`);
  });

  it("is additive and guarded: no data writes, every ALTER behind information_schema", () => {
    const body = migration.replace(/--.*$/gm, "");
    expect(body).not.toMatch(/\b(INSERT\s+INTO|DELETE\s+FROM|DROP|TRUNCATE|RENAME)\b|^\s*UPDATE\s/im);
    expect(body).not.toMatch(/^\s*ALTER TABLE/im);
    expect(body.match(/information_schema\./g)).toHaveLength(8);
    expect(body.match(/PREPARE stmt FROM @ddl;/g)).toHaveLength(8);
  });

  it("boot reconcile requires the trial columns and creates widened enums for a fresh database", () => {
    for (const column of ["trialStartedAt", "trialEndsAt"]) {
      expect(DESIRED_COLUMNS).toContainEqual({ table: "tokenBalances", column, definition: "TIMESTAMP NULL" });
      expect(Object.keys(tokenBalances)).toContain(column);
      expect(migration).toContain(`\`${column}\` TIMESTAMP NULL`);
    }
    for (const column of ["subscriptionBillingPeriod", "pendingBillingPeriod"]) expect(DESIRED_COLUMNS).toContainEqual({ table: "tokenBalances", column, definition: "ENUM('monthly','yearly','30d','90d') NULL" });
    expect(DESIRED_COLUMNS).toContainEqual({ table: "subscriptionCheckoutIntents", column: "billingPeriod", definition: "ENUM('monthly','yearly','30d','90d') NOT NULL DEFAULT 'monthly'" });
    expect(DESIRED_TABLES.find(item => item.table === "planCreditGrants")?.createSql).toContain("`source` enum('carryover','welcome','trial') NOT NULL");
    expect(DESIRED_TABLES.find(item => item.table === "billingInvoices")?.createSql).toContain("`billingPeriod` enum('monthly','yearly','30d','90d') NULL");
  });
});
