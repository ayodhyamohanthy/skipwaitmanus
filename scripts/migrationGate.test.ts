// GATE-migration-apply (D-212, docs/plans/GATE-migration-apply.md §7): fixtures
// only, no database. The gate these tests pin is the one that replaces today's
// `drizzle-kit push` of the PR's own schema: the e2e job must build the base
// revision's schema, apply the PR's deploy migrations to it twice and then prove
// the result holds every table and column the PR's schema.ts declares.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  baseRevisionOf,
  compareSchemas,
  gateVerdict,
  normalizeSnapshot,
  pushOutcome,
} from "./migrationGateCore.mjs";

const ZERO_SHA = "0000000000000000000000000000000000000000";
const PR_BASE = "1111111111111111111111111111111111111111";
const PUSH_BEFORE = "2222222222222222222222222222222222222222";

/** One table, fully described, in the shape the information_schema reads return. */
function snapshotOf({
  tables = ["users"],
  columns = [{ tableName: "users", columnName: "id", columnType: "int", isNullable: "NO", columnDefault: null }],
  indexes = [],
  foreignKeys = [],
} = {}) {
  return normalizeSnapshot({
    tables: tables.map(tableName => ({ tableName })),
    columns,
    indexes,
    foreignKeys,
  });
}

const INDEX = {
  tableName: "users",
  indexName: "users_email_unique",
  nonUnique: 0,
  columns: [{ columnName: "email", seqInIndex: 1 }],
};
const FOREIGN_KEY = {
  tableName: "referralRequests",
  constraintName: "referralRequests_user_id_users_id_fk",
  columns: [{ columnName: "userId", ordinalPosition: 1 }],
  referencedTable: "users",
  referencedColumns: [{ columnName: "id", ordinalPosition: 1 }],
};

describe("baseRevisionOf", () => {
  it("uses the pull request base sha on a pull_request event", () => {
    expect(baseRevisionOf({ eventName: "pull_request", prBaseSha: PR_BASE, before: PUSH_BEFORE })).toBe(PR_BASE);
  });

  it("uses the push event's before sha on a push", () => {
    expect(baseRevisionOf({ eventName: "push", prBaseSha: PR_BASE, before: PUSH_BEFORE })).toBe(PUSH_BEFORE);
  });

  it("returns null for an all-zero, empty or missing revision", () => {
    for (const before of [ZERO_SHA, "", undefined]) {
      expect(baseRevisionOf({ eventName: "push", before })).toBeNull();
    }
    expect(baseRevisionOf({ eventName: "pull_request", prBaseSha: ZERO_SHA })).toBeNull();
    expect(baseRevisionOf({})).toBeNull();
  });
});

describe("pushOutcome", () => {
  // The exact drizzle-kit 0.31.5 output that exits 0 while the schema it pushed
  // is missing a constraint (packet §3): judged by output, never by exit code alone.
  const TOO_LONG_IDENT = [
    "Pushing schema to database...",
    "Error: Identifier name 'companyCoverageInvitations_referralRequestId_referralRequests_id_fk' is too long",
    "sqlMessage: 'Identifier name ... is too long'",
  ].join("\n");

  it("fails on the ER_TOO_LONG_IDENT output even with a zero exit", () => {
    const outcome = pushOutcome(TOO_LONG_IDENT, true);
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toContain("too long");
  });

  it("passes on output ending with the applied line", () => {
    expect(pushOutcome("Pushing schema to database...\n[✓] Changes applied", true).ok).toBe(true);
  });

  it("passes on the no-changes message", () => {
    expect(pushOutcome("Pushing schema to database...\nNo changes applied", true).ok).toBe(true);
  });

  it("fails on a non-zero exit", () => {
    expect(pushOutcome("anything", false).ok).toBe(false);
  });

  it("fails on output that carries no success line", () => {
    expect(pushOutcome("Pushing schema to database...", true).ok).toBe(false);
  });
});

describe("compareSchemas", () => {
  it("reports nothing for two identical snapshots", () => {
    const migrated = snapshotOf({
      indexes: [INDEX],
      foreignKeys: [FOREIGN_KEY],
    });
    const reference = snapshotOf({
      indexes: [INDEX],
      foreignKeys: [FOREIGN_KEY],
    });
    expect(compareSchemas(migrated, reference)).toEqual({
      missingTables: [],
      missingColumns: [],
      differingColumns: [],
      keysMissing: [],
      extraTables: [],
      extraColumns: [],
      extraKeys: [],
    });
  });

  it("matches a foreign key and an index by column set, not by name", () => {
    const migrated = snapshotOf({
      indexes: [{ ...INDEX, indexName: "users_email_index_aaa111" }],
      foreignKeys: [{ ...FOREIGN_KEY, constraintName: "fk_referral_user_222" }],
    });
    const reference = snapshotOf({
      indexes: [{ ...INDEX, indexName: "users_email_unique_bbb222" }],
      foreignKeys: [{ ...FOREIGN_KEY, constraintName: "referralRequests_user_id_users_id_fk_generated" }],
    });
    expect(compareSchemas(migrated, reference).keysMissing).toEqual([]);
    expect(compareSchemas(migrated, reference).extraKeys).toEqual([]);
  });

  it("treats now() and CURRENT_TIMESTAMP as the same default", () => {
    const at = columnDefault => snapshotOf({ columns: [column("users", "createdAt", columnDefault)] });
    expect(compareSchemas(at("now()"), at("CURRENT_TIMESTAMP")).differingColumns).toEqual([]);
    expect(compareSchemas(at("CURRENT_TIMESTAMP"), at("now()")).differingColumns).toEqual([]);
  });

  it("reports one differing column for varchar(40) against varchar(80)", () => {
    const migrated = snapshotOf({ columns: [column("users", "name", null, "varchar(40)")] });
    const reference = snapshotOf({ columns: [column("users", "name", null, "varchar(80)")] });
    const result = compareSchemas(migrated, reference);
    expect(result.differingColumns).toEqual([
      expect.objectContaining({ column: "users.name", migrated: "varchar(40)", reference: "varchar(80)" }),
    ]);
  });

  it("reports a column that only the reference has as missing", () => {
    const migrated = snapshotOf({ columns: [] });
    const reference = snapshotOf({ columns: [column("users", "gateDriftProbe", null, "text")] });
    expect(compareSchemas(migrated, reference).missingColumns).toEqual(["users.gateDriftProbe"]);
  });

  it("reports a table that only the migrated base has as extra", () => {
    const migrated = snapshotOf({ tables: ["users", "gateProbeOnlyHere"] });
    const reference = snapshotOf({ tables: ["users"] });
    expect(compareSchemas(migrated, reference).extraTables).toEqual(["gateProbeOnlyHere"]);
  });

  it("ignores the deploy ledger table on the migrated side", () => {
    const migrated = snapshotOf({
      tables: ["users", "schemaDeployMigrations"],
      columns: [
        column("users", "id"),
        column("schemaDeployMigrations", "filename", null, "varchar(191)"),
      ],
    });
    const reference = snapshotOf({ tables: ["users"] });
    const result = compareSchemas(migrated, reference);
    expect(result.extraTables).toEqual([]);
    expect(result.extraColumns).toEqual([]);
  });
});

describe("gateVerdict", () => {
  const clean = {
    missingTables: [],
    missingColumns: [],
    differingColumns: [],
    keysMissing: [],
    extraTables: [],
    extraColumns: [],
    extraKeys: [],
  };
  const runsOk = [{ pass: 1, ok: true, applied: 49 }, { pass: 2, ok: true, applied: 0 }];
  const okPush = { ok: true, reason: "" };

  it("fails on a missing table or column", () => {
    expect(gateVerdict({ baseSha: PR_BASE, basePush: okPush, deployRuns: runsOk, referencePush: okPush, comparison: { ...clean, missingTables: ["users"] } }).status).toBe("fail");
    expect(gateVerdict({ baseSha: PR_BASE, basePush: okPush, deployRuns: runsOk, referencePush: okPush, comparison: { ...clean, missingColumns: ["users.gateDriftProbe"] } }).status).toBe("fail");
  });

  it("fails when a deploy run fails", () => {
    const runs = [{ pass: 1, ok: false, applied: 0 }, { pass: 2, ok: true, applied: 0 }];
    expect(gateVerdict({ baseSha: PR_BASE, basePush: okPush, deployRuns: runs, referencePush: okPush, comparison: clean }).status).toBe("fail");
  });

  it("fails when the second deploy run applies anything", () => {
    const runs = [{ pass: 1, ok: true, applied: 49 }, { pass: 2, ok: true, applied: 1 }];
    expect(gateVerdict({ baseSha: PR_BASE, basePush: okPush, deployRuns: runs, referencePush: okPush, comparison: clean }).status).toBe("fail");
  });

  it("warns, and does not fail, on differing columns, missing keys and extras", () => {
    for (const comparison of [
      { ...clean, differingColumns: [{ column: "users.name", migrated: "varchar(40)", reference: "varchar(80)" }] },
      { ...clean, keysMissing: ["referralRequests -> users (userId)"] },
      { ...clean, extraTables: ["gateProbeOnlyHere"], extraColumns: [], extraKeys: [] },
    ]) {
      const verdict = gateVerdict({ baseSha: PR_BASE, basePush: okPush, deployRuns: runsOk, referencePush: okPush, comparison });
      expect(verdict.status).toBe("warn");
    }
  });

  it("warns with the fallback line when the base revision is unresolved", () => {
    const verdict = gateVerdict({ baseSha: null, basePush: null, deployRuns: runsOk, referencePush: null, comparison: null });
    expect(verdict.status).toBe("warn");
    expect(verdict.summaryLines.join("\n")).toMatch(/fall(ing)? back|fallback/i);
  });

  it("warns with the fallback line when the base push fails", () => {
    const verdict = gateVerdict({
      baseSha: PR_BASE,
      basePush: { ok: false, reason: "Identifier name ... is too long" },
      deployRuns: runsOk,
      referencePush: null,
      comparison: null,
    });
    expect(verdict.status).toBe("warn");
    expect(verdict.summaryLines.join("\n")).toMatch(/fall(ing)? back|fallback/i);
  });

  it("passes with a no-drift line on empty results", () => {
    const verdict = gateVerdict({ baseSha: PR_BASE, basePush: okPush, deployRuns: runsOk, referencePush: okPush, comparison: clean });
    expect(verdict.status).toBe("pass");
    expect(verdict.summaryLines.join("\n")).toMatch(/no drift/i);
  });
});

describe("ci.yml e2e prepare step", () => {
  const ci = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "ci.yml"), "utf8");
  const job = ci.slice(ci.indexOf("  e2e:"));

  it("passes the base revision into the prepare step and still runs prepare", () => {
    expect(job).toContain("MIGRATION_BASE_SHA: ${{ github.event_name == 'pull_request' && github.event.pull_request.base.sha || github.event.before }}");
    expect(job).toContain("run: node scripts/e2e-server.mjs prepare");
  });

  it("keeps the full history the base revision is read from", () => {
    expect(job).toContain("fetch-depth: 0");
  });
});

function column(tableName, columnName, columnDefault = null, columnType = "int") {
  return { tableName, columnName, columnType, isNullable: "YES", columnDefault };
}
