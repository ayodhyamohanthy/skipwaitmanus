import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DESIRED_COLUMNS, DESIRED_COLUMN_DEFINITIONS, DESIRED_INDEXES, DESIRED_TABLES } from "./schemaReconcile";

// Expectations derive from the live desired-schema lists so adding a column or
// table no longer rots this suite — only order inside those lists matters here.
const allColumns = () => DESIRED_COLUMNS.map(entry => `${entry.table}.${entry.column}`);
const allDefinitions = () => DESIRED_COLUMN_DEFINITIONS.map(entry => `definition:${entry.table}.${entry.column}`);
const allTables = () => DESIRED_TABLES.map(entry => `table:${entry.table}`);
const alterFor = (entry: { table: string; column: string; definition: string }) => `ALTER TABLE \`${entry.table}\` ADD COLUMN \`${entry.column}\` ${entry.definition}`;
const allIndexes = () => DESIRED_INDEXES.map(entry => `index:${entry.table}.${entry.name}`);
// The probe fixture below reports these indexes as already present,
// so reconcile skips them instead of recreating them.
const preExistingIndexes = ["index:workEmailOtpCodes.work_email_otp_active_idx", "index:resumeUploadSessions.resume_upload_sessions_owner_client_unique", "index:referralAttachments.referral_attachments_upload_session_unique"];
const createdIndexes = () => allIndexes().filter(key => !preExistingIndexes.includes(key));

// Fake drizzle db: answers the information_schema probe from `existingColumns`,
// records every ALTER TABLE, and is swappable per scenario (null / rejecting /
// failing one statement).
type FakeDb = { execute: (query: unknown) => Promise<unknown> };

let existingColumns: string[];
let executeCalls: number;
const alterStatements: string[] = [];
let dbRef: { current: FakeDb | null };

// Drizzle SQL objects expose their text as StringChunk query chunks.
const sqlText = (query: unknown): string => {
  const chunks = (query as { queryChunks?: Array<{ value?: string[] }> }).queryChunks ?? [];
  return chunks.map(chunk => (chunk?.value ?? []).join("")).join("");
};

const probeRows = (columns: string[]) => columns.map(column => {
  const [TABLE_NAME, COLUMN_NAME] = column.split(".");
  return { TABLE_NAME, COLUMN_NAME, COLUMN_TYPE: COLUMN_NAME === "status" && TABLE_NAME === "resumeUploadSessions" ? "enum(\'active\',\'finalizing\',\'completed\',\'failed\')" : null, INDEX_NAME: null };
});

const probeAnswer = (query: unknown) => {
  const text = sqlText(query);
  return text.startsWith("SELECT TABLE_NAME") ? [[...probeRows(existingColumns), { TABLE_NAME: "resumeUploadSessions", COLUMN_NAME: null, INDEX_NAME: "resume_upload_sessions_owner_client_unique" }, { TABLE_NAME: "referralAttachments", COLUMN_NAME: null, INDEX_NAME: "referral_attachments_upload_session_unique" }, { TABLE_NAME: "workEmailOtpCodes", COLUMN_NAME: null, INDEX_NAME: "work_email_otp_active_idx", NON_UNIQUE: 1 }], []] : null;
};

async function loadReconcileModule() {
  vi.resetModules();
  vi.doMock("./db", () => ({ getDb: async () => dbRef.current }));
  return import("./schemaReconcile");
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  existingColumns = [...allColumns(), "resumeUploadSessions.status"];
  executeCalls = 0;
  alterStatements.length = 0;
  dbRef = {
    current: {
      execute: async (query: unknown) => {
        executeCalls += 1;
        const probed = probeAnswer(query);
        if (probed) return probed;
        const text = sqlText(query);
        alterStatements.push(text);
        return [{}, []];
      },
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("boot-time schema reconcile", () => {
  it("applies only the columns missing from information_schema", async () => {
    existingColumns = ["companyOpportunities.compensation", "resumeUploadSessions.status"];
    const { reconcileSchema, isSchemaReconciled, getLastReconcileResults } = await loadReconcileModule();

    const result = await reconcileSchema();

    const expectedApplied = [...DESIRED_COLUMNS.filter(entry => entry !== DESIRED_COLUMNS[0]).map(entry => `${entry.table}.${entry.column}`), ...createdIndexes(), ...allTables()];
    expect(result).toEqual({
      applied: expectedApplied,
      skipped: [...allDefinitions(), "companyOpportunities.compensation", ...preExistingIndexes],
    });
    expect(alterStatements.filter(st => st.startsWith("ALTER"))).toEqual(DESIRED_COLUMNS.slice(1).map(alterFor));
    expect(alterStatements.filter(st => st.startsWith("CREATE TABLE IF NOT EXISTS"))).toHaveLength(DESIRED_TABLES.length);
    expect(isSchemaReconciled()).toBe(true);
    expect(getLastReconcileResults()).toHaveLength(DESIRED_COLUMNS.length - 1 + createdIndexes().length + DESIRED_TABLES.length);
    expect(getLastReconcileResults().every(entry => entry.ok)).toBe(true);
  });

  it("uses Azure-compatible CURRENT_TIMESTAMP clauses in generated CREATE DDL", async () => {
    const { reconcileSchema } = await loadReconcileModule();
    await reconcileSchema();
    const creates = alterStatements.filter(statement => statement.startsWith("CREATE TABLE IF NOT EXISTS"));
    expect(creates).toHaveLength(DESIRED_TABLES.length);
    expect(creates.join("\n")).not.toContain("DEFAULT (now())");
    expect(creates.join("\n")).not.toContain("ON UPDATE NOW");
    expect(creates.every(statement => statement.includes("DEFAULT CURRENT_TIMESTAMP"))).toBe(true);
    expect(creates.filter(statement => statement.includes("`updatedAt`")).every(statement => statement.includes("ON UPDATE CURRENT_TIMESTAMP"))).toBe(true);
  });

  it("applies nothing when every desired column already exists", async () => {
    const { reconcileSchema, isSchemaReconciled, getLastReconcileResults } = await loadReconcileModule();

    const result = await reconcileSchema();

    expect(result).toEqual({
      applied: [...createdIndexes(), ...allTables()],
      skipped: [...allDefinitions(), ...allColumns(), ...preExistingIndexes],
    });
    expect(alterStatements.filter(st => st.startsWith("ALTER"))).toEqual([]);
    expect(alterStatements.filter(st => st.startsWith("CREATE TABLE IF NOT EXISTS"))).toHaveLength(DESIRED_TABLES.length);
    expect(isSchemaReconciled()).toBe(true);
    expect(getLastReconcileResults().map(entry => entry.ok)).toEqual(Array.from({ length: DESIRED_INDEXES.length - preExistingIndexes.length + DESIRED_TABLES.length }, () => true));
  });

  it.each([
    { table: "workEmailOtpCodes", name: "work_email_otp_active_idx", actualNonUnique: 0, unique: false },
    { table: "resumeUploadSessions", name: "resume_upload_sessions_owner_client_unique", actualNonUnique: 1, unique: true },
  ])("repairs mismatched uniqueness for $name", async ({ table, name, actualNonUnique, unique }) => {
    dbRef.current = {
      execute: async (query: unknown) => {
        const probed = probeAnswer(query);
        if (probed) {
          const rows = probed[0] as Array<{ INDEX_NAME: string | null; NON_UNIQUE?: number }>;
          const row = rows.find(entry => entry.INDEX_NAME === name);
          if (!row) throw new Error(`Missing probe fixture for ${name}`);
          row.NON_UNIQUE = actualNonUnique;
          return probed;
        }
        alterStatements.push(sqlText(query));
        return [{}, []];
      },
    };
    const { reconcileSchema, isSchemaReconciled } = await loadReconcileModule();
    const result = await reconcileSchema();
    const index = DESIRED_INDEXES.find(entry => entry.name === name)!;
    const drop = `DROP INDEX \`${name}\` ON \`${table}\``;
    const create = `CREATE ${unique ? "UNIQUE " : ""}INDEX \`${name}\` ON \`${table}\` (${index.columns})`;
    expect(alterStatements).toContain(drop);
    expect(alterStatements).toContain(create);
    expect(alterStatements.indexOf(drop)).toBeLessThan(alterStatements.indexOf(create));
    expect(result.applied).toContain(`index:${table}.${name}`);
    expect(isSchemaReconciled()).toBe(true);
  });

  it("re-running after success is a silent no-op", async () => {
    existingColumns = ["companyOpportunities.compensation", "resumeUploadSessions.status"];
    const { reconcileSchema, isSchemaReconciled } = await loadReconcileModule();

    await reconcileSchema();
    expect(alterStatements).toHaveLength(DESIRED_COLUMNS.length - 1 + createdIndexes().length + DESIRED_TABLES.length);

    executeCalls = 0;
    const again = await reconcileSchema();
    expect(again).toEqual({ applied: [], skipped: [] });
    expect(executeCalls).toBe(0);
    expect(alterStatements).toHaveLength(DESIRED_COLUMNS.length - 1 + createdIndexes().length + DESIRED_TABLES.length);
    expect(isSchemaReconciled()).toBe(true);
  });

  it("is a silent no-op when no database is configured", async () => {
    dbRef.current = null;
    const { reconcileSchema, isSchemaReconciled, getLastReconcileResults } = await loadReconcileModule();

    await expect(reconcileSchema()).resolves.toEqual({ applied: [], skipped: [] });
    expect(isSchemaReconciled()).toBe(false);
    expect(getLastReconcileResults()).toEqual([]);
  });

  it("never crashes when the database rejects the reconcile", async () => {
    dbRef.current = { execute: async () => { throw new Error("connection lost"); } };
    const { reconcileSchema, isSchemaReconciled, getLastReconcileError, getLastReconcileResults } = await loadReconcileModule();

    await expect(reconcileSchema()).resolves.toEqual({ applied: [], skipped: [] });
    expect(isSchemaReconciled()).toBe(false);
    expect(getLastReconcileError()).toContain("connection lost");
    expect(getLastReconcileResults()).toEqual([]);
    expect(vi.mocked(console.error).mock.calls[0]?.[0]).toBe("[schema-reconcile] failed (non-fatal):");
  });

  it("continues past a failing ALTER and reports per-statement results", async () => {
    existingColumns = ["companyOpportunities.compensation", "resumeUploadSessions.status"];
    dbRef.current = {
      execute: async (query: unknown) => {
        executeCalls += 1;
        const probed = probeAnswer(query);
        if (probed) return probed;
        const text = sqlText(query);
        if (text === "ALTER TABLE `jobs` ADD COLUMN `compensation` TEXT NULL") throw new Error("Lock wait timeout exceeded; try restarting transaction");
        alterStatements.push(text);
        return [{}, []];
      },
    };
    const { reconcileSchema, isSchemaReconciled, getLastReconcileError, getLastReconcileResults } = await loadReconcileModule();

    const result = await reconcileSchema();

    // Statements after the failed jobs ALTER still run; the failed column is not applied.
    expect(result.applied).toEqual([...DESIRED_COLUMNS.slice(2).map(entry => `${entry.table}.${entry.column}`), ...createdIndexes(), ...allTables()]);
    // The failed statement is captured with its error, not applied.
    const results = getLastReconcileResults();
    expect(results).toHaveLength(DESIRED_COLUMNS.length - 1 + createdIndexes().length + DESIRED_TABLES.length);
    expect(results.filter(entry => entry.ok)).toHaveLength(DESIRED_COLUMNS.length - 2 + createdIndexes().length + DESIRED_TABLES.length);
    expect(results.find(entry => !entry.ok)).toEqual({
      statement: "ALTER TABLE `jobs` ADD COLUMN `compensation` TEXT NULL",
      ok: false,
      error: "Lock wait timeout exceeded; try restarting transaction",
    });
    // firstError names the failing statement; the run does not count as reconciled.
    expect(getLastReconcileError()).toContain("ALTER TABLE `jobs` ADD COLUMN `compensation`");
    expect(getLastReconcileError()).toContain("Lock wait timeout exceeded");
    expect(isSchemaReconciled()).toBe(false);
  });

  it("treats duplicate-column races as idempotent skips", async () => {
    existingColumns = ["companyOpportunities.compensation", "resumeUploadSessions.status"];
    const duplicate = Object.assign(new Error("Duplicate column name 'compensation'"), { code: "ER_DUP_FIELDNAME", errno: 1060, sqlState: "42S21" });
    dbRef.current = {
      execute: async (query: unknown) => {
        const probed = probeAnswer(query);
        if (probed) return probed;
        const text = sqlText(query);
        if (text === "ALTER TABLE `jobs` ADD COLUMN `compensation` TEXT NULL") throw Object.assign(new Error("Failed query"), { cause: duplicate });
        alterStatements.push(text);
        return [{}, []];
      },
    };
    const { reconcileSchema, isSchemaReconciled, getLastReconcileError, getLastReconcileResults } = await loadReconcileModule();

    const result = await reconcileSchema();

    expect(result.skipped).toContain("jobs.compensation");
    expect(result.applied).not.toContain("jobs.compensation");
    expect(isSchemaReconciled()).toBe(true);
    expect(getLastReconcileError()).toBeNull();
    expect(getLastReconcileResults().find(item => item.statement.includes("`jobs`"))).toEqual({ statement: "ALTER TABLE `jobs` ADD COLUMN `compensation` TEXT NULL", ok: true });
  });

  it("keeps reconciled false and captures the first error when every statement fails", async () => {
    existingColumns = []; // nothing pre-exists, so all columns + tables + indexes are attempted
    dbRef.current = {
      execute: async (query: unknown) => {
        const probed = probeAnswer(query);
        if (probed) return probed;
        throw new Error("Command denied to user");
      },
    };
    const { reconcileSchema, isSchemaReconciled, getLastReconcileError, getLastReconcileResults } = await loadReconcileModule();

    await expect(reconcileSchema()).resolves.toEqual({ applied: [], skipped: [...preExistingIndexes] });
    expect(isSchemaReconciled()).toBe(false);
    expect(getLastReconcileError()).toContain("ALTER TABLE `resumeUploadSessions` MODIFY COLUMN `status`");
    expect(getLastReconcileError()).toContain("Command denied to user");
    const results = getLastReconcileResults();
    expect(results).toHaveLength(DESIRED_COLUMN_DEFINITIONS.length + DESIRED_COLUMNS.length + createdIndexes().length + DESIRED_TABLES.length); // every column, index, and table attempted
    expect(results.every(entry => !entry.ok)).toBe(true);
  });

  it("clears the recorded failure when a re-run succeeds", async () => {
    existingColumns = ["companyOpportunities.compensation", "resumeUploadSessions.status"];
    let jobsAlterFails = true;
    dbRef.current = {
      execute: async (query: unknown) => {
        const probed = probeAnswer(query);
        if (probed) return probed;
        const text = sqlText(query);
        if (text.includes("`jobs`") && jobsAlterFails) throw new Error("Lock wait timeout exceeded");
        return [{}, []];
      },
    };
    const { reconcileSchema, isSchemaReconciled, getLastReconcileError, getLastReconcileResults } = await loadReconcileModule();

    await reconcileSchema();
    expect(isSchemaReconciled()).toBe(false);
    expect(getLastReconcileError()).toContain("Lock wait timeout exceeded");

    jobsAlterFails = false;
    const retry = await reconcileSchema();
    expect(retry.applied).toContain("jobs.compensation");
    expect(getLastReconcileError()).toBeNull();
    expect(getLastReconcileResults().every(entry => entry.ok)).toBe(true);
    expect(isSchemaReconciled()).toBe(true);
  });

  it("unwraps the driver cause so missing-table failures stay diagnosable", async () => {
    existingColumns = [];
    const driverError = Object.assign(new Error("Table 'skipwait.companyOpportunities' doesn't exist"), { code: "ER_NO_SUCH_TABLE", errno: 1146, sqlState: "42S02" });
    const wrapped = Object.assign(new Error("Failed query: ALTER TABLE `companyOpportunities` ADD COLUMN `compensation` TEXT NULL\nparams: "), { cause: driverError });
    dbRef.current = {
      execute: async (query: unknown) => {
        const probed = probeAnswer(query);
        if (probed) return probed;
        throw wrapped;
      },
    };
    const { reconcileSchema, isSchemaReconciled, getLastReconcileError, getLastReconcileResults } = await loadReconcileModule();

    await reconcileSchema();

    expect(isSchemaReconciled()).toBe(false);
    const firstError = getLastReconcileError() ?? "";
    expect(firstError).toContain("ALTER TABLE `companyOpportunities` ADD COLUMN `compensation`");
    expect(firstError).toContain("ER_NO_SUCH_TABLE");
    expect(firstError).toContain("1146");
    expect(firstError).toContain("doesn't exist");
    expect(getLastReconcileResults().find(entry => !entry.ok)?.error).toContain("ER_NO_SUCH_TABLE");
  });

  it("describeReconcileError handles plain errors and non-errors without a cause", async () => {
    const { describeReconcileError } = await loadReconcileModule();
    expect(describeReconcileError(new Error("boom"))).toBe("boom");
    expect(describeReconcileError("plain string")).toBe("plain string");
  });
});
