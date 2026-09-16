import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  return { TABLE_NAME, COLUMN_NAME, INDEX_NAME: null };
});

const probeAnswer = (query: unknown) => {
  const text = sqlText(query);
  return text.startsWith("SELECT TABLE_NAME") ? [[...probeRows(existingColumns), { TABLE_NAME: "resumeUploadSessions", COLUMN_NAME: null, INDEX_NAME: "resume_upload_sessions_owner_client_unique" }, { TABLE_NAME: "referralAttachments", COLUMN_NAME: null, INDEX_NAME: "referral_attachments_upload_session_unique" }], []] : null;
};

async function loadReconcileModule() {
  vi.resetModules();
  vi.doMock("./db", () => ({ getDb: async () => dbRef.current }));
  return import("./schemaReconcile");
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  existingColumns = ["companyOpportunities.compensation", "jobs.compensation", "referralRequests.savedAt", "users.suspended", "profiles.anonymityOptIn", "companyOpportunities.sponsoredUntil", "companyOpportunities.sponsoredTier", "resumeUploadSessions.clientUploadId", "resumeUploadSessions.finalizationOwner", "resumeUploadSessions.finalizationLeaseUntil", "resumeUploadSessions.permanentStorageKey", "referralAttachments.uploadSessionId"];
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
    existingColumns = ["companyOpportunities.compensation"];
    const { reconcileSchema, isSchemaReconciled, getLastReconcileResults } = await loadReconcileModule();

    const result = await reconcileSchema();

    expect(result).toEqual({
      applied: ["jobs.compensation", "referralRequests.savedAt", "users.suspended", "profiles.anonymityOptIn", "companyOpportunities.sponsoredUntil", "companyOpportunities.sponsoredTier", "resumeUploadSessions.clientUploadId", "resumeUploadSessions.finalizationOwner", "resumeUploadSessions.finalizationLeaseUntil", "resumeUploadSessions.permanentStorageKey", "referralAttachments.uploadSessionId", "table:employerAccounts", "table:employerTalentRefs", "table:employerTalentIntroRequests", "table:profileUnlocks", "table:partnerModules", "table:userFollows"],
      skipped: ["companyOpportunities.compensation", "index:resumeUploadSessions.resume_upload_sessions_owner_client_unique", "index:referralAttachments.referral_attachments_upload_session_unique"],
    });
    expect(alterStatements.filter(st => st.startsWith("ALTER"))).toEqual([
      "ALTER TABLE `jobs` ADD COLUMN `compensation` TEXT NULL",
      "ALTER TABLE `referralRequests` ADD COLUMN `savedAt` TIMESTAMP NULL",
      "ALTER TABLE `users` ADD COLUMN `suspended` BOOLEAN NOT NULL DEFAULT false",
      "ALTER TABLE `profiles` ADD COLUMN `anonymityOptIn` BOOLEAN NOT NULL DEFAULT false",
      "ALTER TABLE `companyOpportunities` ADD COLUMN `sponsoredUntil` TIMESTAMP NULL",
      "ALTER TABLE `companyOpportunities` ADD COLUMN `sponsoredTier` ENUM('standard','featured','spotlight') NULL",
      "ALTER TABLE `resumeUploadSessions` ADD COLUMN `clientUploadId` VARCHAR(64) NULL", "ALTER TABLE `resumeUploadSessions` ADD COLUMN `finalizationOwner` VARCHAR(64) NULL", "ALTER TABLE `resumeUploadSessions` ADD COLUMN `finalizationLeaseUntil` TIMESTAMP NULL", "ALTER TABLE `resumeUploadSessions` ADD COLUMN `permanentStorageKey` VARCHAR(1024) NULL", "ALTER TABLE `referralAttachments` ADD COLUMN `uploadSessionId` VARCHAR(64) NULL",
    ]);
    expect(alterStatements.filter(st => st.startsWith("CREATE TABLE IF NOT EXISTS"))).toHaveLength(6);
    expect(isSchemaReconciled()).toBe(true);
    expect(getLastReconcileResults()).toHaveLength(17);
    expect(getLastReconcileResults().every(entry => entry.ok)).toBe(true);
  });

  it("uses Azure-compatible CURRENT_TIMESTAMP clauses in generated CREATE DDL", async () => {
    const { reconcileSchema } = await loadReconcileModule();
    await reconcileSchema();
    const creates = alterStatements.filter(statement => statement.startsWith("CREATE TABLE IF NOT EXISTS"));
    expect(creates).toHaveLength(6);
    expect(creates.join("\n")).not.toContain("DEFAULT (now())");
    expect(creates.join("\n")).not.toContain("ON UPDATE NOW");
    expect(creates.every(statement => statement.includes("DEFAULT CURRENT_TIMESTAMP"))).toBe(true);
    expect(creates.filter(statement => statement.includes("`updatedAt`")).every(statement => statement.includes("ON UPDATE CURRENT_TIMESTAMP"))).toBe(true);
  });

  it("applies nothing when every desired column already exists", async () => {
    const { reconcileSchema, isSchemaReconciled, getLastReconcileResults } = await loadReconcileModule();

    const result = await reconcileSchema();

    expect(result).toEqual({
      applied: ["table:employerAccounts", "table:employerTalentRefs", "table:employerTalentIntroRequests", "table:profileUnlocks", "table:partnerModules", "table:userFollows"],
      skipped: ["companyOpportunities.compensation", "jobs.compensation", "referralRequests.savedAt", "users.suspended", "profiles.anonymityOptIn", "companyOpportunities.sponsoredUntil", "companyOpportunities.sponsoredTier", "resumeUploadSessions.clientUploadId", "resumeUploadSessions.finalizationOwner", "resumeUploadSessions.finalizationLeaseUntil", "resumeUploadSessions.permanentStorageKey", "referralAttachments.uploadSessionId", "index:resumeUploadSessions.resume_upload_sessions_owner_client_unique", "index:referralAttachments.referral_attachments_upload_session_unique"],
    });
    expect(alterStatements.filter(st => st.startsWith("ALTER"))).toEqual([]);
    expect(alterStatements.filter(st => st.startsWith("CREATE TABLE IF NOT EXISTS"))).toHaveLength(6);
    expect(isSchemaReconciled()).toBe(true);
    expect(getLastReconcileResults().map(entry => entry.ok)).toEqual([true, true, true, true, true, true]);
  });

  it("re-running after success is a silent no-op", async () => {
    existingColumns = ["companyOpportunities.compensation"];
    const { reconcileSchema, isSchemaReconciled } = await loadReconcileModule();

    await reconcileSchema();
    expect(alterStatements).toHaveLength(17);

    executeCalls = 0;
    const again = await reconcileSchema();
    expect(again).toEqual({ applied: [], skipped: [] });
    expect(executeCalls).toBe(0);
    expect(alterStatements).toHaveLength(17);
    expect(isSchemaReconciled()).toBe(true);
  });

  it("is a silent no-op when no database is configured", async () => {
    dbRef.current = null;
    const { reconcileSchema, isSchemaReconciled, getLastReconcileResults } = await loadReconcileModule();

    await expect(reconcileSchema()).resolves.toEqual({ applied: [], skipped: ["index:resumeUploadSessions.resume_upload_sessions_owner_client_unique", "index:referralAttachments.referral_attachments_upload_session_unique"] });
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
    existingColumns = ["companyOpportunities.compensation"];
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

    // Statements after the failure still ran and were applied.
    expect(result.applied).toEqual(["referralRequests.savedAt", "users.suspended", "profiles.anonymityOptIn", "companyOpportunities.sponsoredUntil", "companyOpportunities.sponsoredTier", "resumeUploadSessions.clientUploadId", "resumeUploadSessions.finalizationOwner", "resumeUploadSessions.finalizationLeaseUntil", "resumeUploadSessions.permanentStorageKey", "referralAttachments.uploadSessionId", "table:employerAccounts", "table:employerTalentRefs", "table:employerTalentIntroRequests", "table:profileUnlocks", "table:partnerModules", "table:userFollows"]);
    // The failed statement is captured with its error, not applied.
    const results = getLastReconcileResults();
    expect(results).toHaveLength(17);
    expect(results.filter(entry => entry.ok)).toHaveLength(16);
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
    existingColumns = ["companyOpportunities.compensation"];
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
    existingColumns = []; // nothing pre-exists, so all 7 ALTERs + 3 CREATEs are attempted
    dbRef.current = {
      execute: async (query: unknown) => {
        const probed = probeAnswer(query);
        if (probed) return probed;
        throw new Error("Command denied to user");
      },
    };
    const { reconcileSchema, isSchemaReconciled, getLastReconcileError, getLastReconcileResults } = await loadReconcileModule();

    await expect(reconcileSchema()).resolves.toEqual({ applied: [], skipped: [] });
    expect(isSchemaReconciled()).toBe(false);
    expect(getLastReconcileError()).toContain("ALTER TABLE `companyOpportunities` ADD COLUMN `compensation`");
    expect(getLastReconcileError()).toContain("Command denied to user");
    const results = getLastReconcileResults();
    expect(results).toHaveLength(18); // 12 columns + 6 tables attempted
    expect(results.every(entry => !entry.ok)).toBe(true);
  });

  it("clears the recorded failure when a re-run succeeds", async () => {
    existingColumns = ["companyOpportunities.compensation"];
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
