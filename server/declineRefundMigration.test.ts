// Contract for migration 0083: production only runs drizzle/deploy/*.sql, so
// the ledger enum there must equal the drizzle schema's enum exactly, keep
// every earlier value in its original position (MODIFY ENUM rewrites the
// whole list) and stay guarded/idempotent.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tokenTransactions } from "../drizzle/schema";

const read = (name: string) => readFileSync(new URL(`../drizzle/deploy/${name}`, import.meta.url), "utf8");
const migration = read("0083_token_kind_decline_refund.sql");
const previous = read("0068_request_expiry_refund.sql");

function enumValues(sql: string): string[] {
  const match = /MODIFY `kind` ENUM\(([^)]*)\)/.exec(sql);
  if (!match) throw new Error("migration has no MODIFY `kind` ENUM(...) statement");
  return match[1].split(",").map(value => value.trim().replace(/^''|''$/g, ""));
}

describe("0083 tokenTransactions.kind gains decline_refund", () => {
  it("matches the drizzle schema enum exactly", () => {
    expect(enumValues(migration)).toEqual([...tokenTransactions.kind.enumValues]);
    expect(tokenTransactions.kind.enumValues).toContain("decline_refund");
  });

  it("only appends: every value from 0068 keeps its position", () => {
    const before = enumValues(previous);
    expect(enumValues(migration).slice(0, before.length)).toEqual(before);
    expect(enumValues(migration).slice(before.length)).toEqual(["decline_refund"]);
  });

  it("is guarded by information_schema and runs through PREPARE", () => {
    expect(migration).toContain("information_schema.COLUMNS");
    expect(migration).toContain("COLUMN_TYPE LIKE '%decline_refund%'");
    expect(migration).toMatch(/PREPARE stmt FROM @ddl;\s*EXECUTE stmt;\s*DEALLOCATE PREPARE stmt;/);
    expect(migration).toContain("NOT NULL");
  });
});
