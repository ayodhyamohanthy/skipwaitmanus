import { describe, expect, it } from "vitest";
import { DdlError, applyIdentifierLimit, canonicalRule, groupForeignKeys, parseExportedDdl } from "./mysqlTestSchemaDdl.mjs";

/** Reproduces the shape `drizzle-kit export` actually emits: a preamble, then
 * semi-colon terminated statements, then drizzle's derived FK label that is 67
 * characters long and therefore rejected by MySQL. */
const OVER_LONG_FK = "companyCoverageInvitations_referralRequestId_referralRequests_id_fk";
const EXPORT_OUTPUT = `Reading schema files:
  drizzle/schema.ts

CREATE TABLE \`referralRequests\` (
	\`id\` int AUTO_INCREMENT NOT NULL,
	PRIMARY KEY (\`id\`)
);
CREATE TABLE \`companyCoverageInvitations\` (
	\`id\` int AUTO_INCREMENT NOT NULL,
	\`referralRequestId\` int
);
ALTER TABLE \`companyCoverageInvitations\` ADD CONSTRAINT \`${OVER_LONG_FK}\` FOREIGN KEY (\`referralRequestId\`) REFERENCES \`referralRequests\`(\`id\`) ON DELETE cascade;
CREATE UNIQUE INDEX \`token_balances_user_role_unique\` ON \`tokenBalances\` (\`userId\`,\`role\`);
`;

function declared(statements) {
  return applyIdentifierLimit(statements);
}

describe("mysql sandbox exported-DDL reader", () => {
  it("drops the exporter preamble and keeps every DDL statement", () => {
    const { statements, tables } = parseExportedDdl(EXPORT_OUTPUT);
    expect(tables).toEqual(["referralRequests", "companyCoverageInvitations"]);
    expect(statements).toHaveLength(4);
    expect(statements.every(statement => /^(CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE)/.test(statement))).toBe(true);
  });

  it("fails loudly when the export carries no DDL or an unclassified statement", () => {
    expect(() => parseExportedDdl("No schema files found.")).toThrowError(DdlError);
    expect(() => parseExportedDdl("CREATE TABLE `a` (`id` int);\nsome generator trailer\n")).toThrowError(/unclassifiable DDL/);
  });

  it("removes only the over-budget foreign key label and records the relationship", () => {
    const { applied, declared: keys, unnamedForeignKeys } = declared(parseExportedDdl(EXPORT_OUTPUT).statements);
    const fkStatement = applied.find(statement => statement.startsWith("ALTER TABLE"));
    expect(unnamedForeignKeys).toBe(1);
    expect(fkStatement).toContain("ADD FOREIGN KEY (`referralRequestId`) REFERENCES `referralRequests`(`id`) ON DELETE cascade");
    expect(fkStatement).not.toContain(OVER_LONG_FK);
    expect(keys).toEqual([{ key: "companyCoverageInvitations(referralRequestId)->referralRequests(id) CASCADE", name: OVER_LONG_FK }]);
  });

  it("never renames an over-long UNIQUE or index name, because specs assert on it", () => {
    const statements = ["CREATE UNIQUE INDEX `" + "u".repeat(65) + "` ON `tokenBalances` (`userId`)"];
    expect(() => declared(statements)).toThrowError(/over MySQL's 64 limit: give it a shorter explicit name in drizzle\/schema\.ts/);
  });

  it("parses multi-word and omitted referential actions into one canonical form", () => {
    const statement = table => `ALTER TABLE \`b\` ADD FOREIGN KEY (\`aId\`,\`tenantId\`) REFERENCES \`${table}\`(\`id\`,\`tenantId\`)`;
    const rules = [`ON DELETE set null`, `ON DELETE restrict`, ``].map(suffix => {
      const { declared: keys } = declared([`${statement("a")} ${suffix}`.trim()]);
      return keys[0].key;
    });
    expect(rules).toEqual([
      "b(aId,tenantId)->a(id,tenantId) SET NULL",
      "b(aId,tenantId)->a(id,tenantId) NO ACTION",
      "b(aId,tenantId)->a(id,tenantId) NO ACTION",
    ]);
  });

  it("counts a composite foreign key once when read back from information_schema", () => {
    const rows = [
      { constraintName: "b_ibfk_1", tableName: "b", referencedTable: "a", deleteRule: "RESTRICT", columnName: "aId", referencedColumn: "id" },
      { constraintName: "b_ibfk_1", tableName: "b", referencedTable: "a", deleteRule: "RESTRICT", columnName: "tenantId", referencedColumn: "tenantId" },
    ];
    expect(Array.from(groupForeignKeys(rows).entries())).toEqual([["b(aId,tenantId)->a(id,tenantId) NO ACTION", 1]]);
  });

  it("makes the declared key and the read-back key the same string", () => {
    const { applied, declared: keys } = declared(parseExportedDdl(EXPORT_OUTPUT).statements);
    const created = groupForeignKeys([
      {
        constraintName: "companyCoverageInvitations_ibfk_1",
        tableName: "companyCoverageInvitations",
        referencedTable: "referralRequests",
        deleteRule: "CASCADE",
        columnName: "referralRequestId",
        referencedColumn: "id",
      },
    ]);
    expect(applied.some(statement => statement.includes(OVER_LONG_FK))).toBe(false);
    expect(Array.from(created.keys())).toEqual(keys.map(entry => entry.key));
  });

  it("folds RESTRICT onto the rule InnoDB enforces for it", () => {
    expect(canonicalRule("RESTRICT")).toBe("NO ACTION");
    expect(canonicalRule("CASCADE")).toBe("CASCADE");
  });
});
