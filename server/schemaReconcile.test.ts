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
  return { TABLE_NAME, COLUMN_NAME };
});

const probeAnswer = (query: unknown) => {
  const text = sqlText(query);
  return text.startsWith("SELECT TABLE_NAME") ? [probeRows(existingColumns), []] : null;
};

async function loadReconcileModule() {
  vi.resetModules();
  vi.doMock("./db", () => ({ getDb: async () => dbRef.current }));
  return import("./schemaReconcile");
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  existingColumns = ["companyOpportunities.compensation", "jobs.compensation", "referralRequests.savedAt", "users.suspended", "profiles.anonymityOptIn", "companyOpportunities.sponsoredUntil", "companyOpportunities.sponsoredTier", "workEmailOtpCodes.verifiedByUserId"];
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
      applied: ["jobs.compensation", "referralRequests.savedAt", "users.suspended", "profiles.anonymityOptIn", "companyOpportunities.sponsoredUntil", "companyOpportunities.sponsoredTier", "workEmailOtpCodes.verifiedByUserId", "table:employerAccounts", "table:profileUnlocks", "table:partnerModules", "table:userFollows"],
      skipped: ["companyOpportunities.compensation"],
    });
    expect(alterStatements.filter(st => st.startsWith("ALTER"))).toEqual([
      "ALTER TABLE `jobs` ADD COLUMN `compensation` TEXT NULL",
      "ALTER TABLE `referralRequests` ADD COLUMN `savedAt` TIMESTAMP NULL",
      "ALTER TABLE `users` ADD COLUMN `suspended` BOOLEAN NOT NULL DEFAULT false",
      "ALTER TABLE `profiles` ADD COLUMN `anonymityOptIn` BOOLEAN NOT NULL DEFAULT false",
      "ALTER TABLE `companyOpportunities` ADD COLUMN `sponsoredUntil` TIMESTAMP NULL",
      "ALTER TABLE `companyOpportunities` ADD COLUMN `sponsoredTier` ENUM('standard','featured','spotlight') NULL",
      "ALTER TABLE `workEmailOtpCodes` ADD COLUMN `verifiedByUserId` INT NULL",
    ]);
    expect(alterStatements.filter(st => st.startsWith("CREATE TABLE IF NOT EXISTS"))).toHaveLength(4);
    expect(isSchemaReconciled()).toBe(true);
    expect(getLastReconcileResults()).toHaveLength(11);
    expect(getLastReconcileResults().every(entry => entry.ok)).toBe(true);
  });

  it("applies nothing when every desired column already exists", async () => {
    const { reconcileSchema, isSchemaReconciled, getLastReconcileResults } = await loadReconcileModule();

    const result = await reconcileSchema();

    expect(result).toEqual({
      applied: ["table:employerAccounts", "table:profileUnlocks", "table:partnerModules", "table:userFollows"],
      skipped: ["companyOpportunities.compensation", "jobs.compensation", "referralRequests.savedAt", "users.suspended", "profiles.anonymityOptIn", "companyOpportunities.sponsoredUntil", "companyOpportunities.sponsoredTier", "workEmailOtpCodes.verifiedByUserId"],
    });
    expect(alterStatements.filter(st => st.startsWith("ALTER"))).toEqual([]);
    expect(alterStatements.filter(st => st.startsWith("CREATE TABLE IF NOT EXISTS"))).toHaveLength(4);
    expect(isSchemaReconciled()).toBe(true);
    expect(getLastReconcileResults().map(entry => entry.ok)).toEqual([true, true, true, true]);
  });

  it("re-running after success is a silent no-op", async () => {
    existingColumns = ["companyOpportunities.compensation"];
    const { reconcileSchema, isSchemaReconciled } = await loadReconcileModule();

    await reconcileSchema();
    expect(alterStatements).toHaveLength(11);

    executeCalls = 0;
    const again = await reconcileSchema();
    expect(again).toEqual({ applied: [], skipped: [] });
    expect(executeCalls).toBe(0);
    expect(alterStatements).toHaveLength(11);
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
    expect(result.applied).toEqual(["referralRequests.savedAt", "users.suspended", "profiles.anonymityOptIn", "companyOpportunities.sponsoredUntil", "companyOpportunities.sponsoredTier", "workEmailOtpCodes.verifiedByUserId", "table:employerAccounts", "table:profileUnlocks", "table:partnerModules", "table:userFollows"]);
    // The failed statement is captured with its error, not applied.
    const results = getLastReconcileResults();
    expect(results).toHaveLength(11);
    expect(results.filter(entry => entry.ok)).toHaveLength(10);
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

  it("keeps reconciled false and captures the first error when every statement fails", async () => {
    existingColumns = []; // nothing pre-exists, so all 8 ALTERs + 4 CREATEs are attempted
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
    expect(results).toHaveLength(12); // 8 columns + 4 tables attempted
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

  it("reports the underlying driver error, not just drizzle's wrapper", async () => {
    existingColumns = [];
    dbRef.current = {
      execute: async (query: unknown) => {
        const probed = probeAnswer(query);
        if (probed) return probed;
        // What drizzle-orm actually throws: the actionable MySQL error is on
        // `.cause`, while `.message` is only "Failed query: ...\nparams: ".
        const driver = new Error("ALTER command denied to user 'skipwait'@'%' for table 'companyOpportunities'");
        const wrapped = new Error("Failed query: ALTER TABLE `companyOpportunities` ADD COLUMN `compensation` TEXT NULL\nparams: ");
        (wrapped as { cause?: unknown }).cause = driver;
        throw wrapped;
      },
    };
    const { reconcileSchema, getLastReconcileError, getLastReconcileResults } = await loadReconcileModule();

    await reconcileSchema();

    // Without the cause chain this was an undiagnosable "Failed query: ... params: ".
    expect(getLastReconcileError()).toContain("ALTER command denied to user");
    const failure = getLastReconcileResults().find(entry => !entry.ok);
    expect(failure?.error).toContain("ALTER command denied to user");
  });
});

describe("describeError", () => {
  it("joins every distinct message in the cause chain", async () => {
    const { describeError } = await loadReconcileModule();
    const driver = new Error("Lock wait timeout exceeded; try restarting transaction");
    const wrapped = new Error("Failed query: ALTER TABLE `x` ADD COLUMN `y` INT NULL\nparams: ");
    (wrapped as { cause?: unknown }).cause = driver;

    const described = describeError(wrapped);
    expect(described).toContain("Failed query");
    expect(described).toContain("Lock wait timeout exceeded");
    expect(described.indexOf("Failed query")).toBeLessThan(described.indexOf("Lock wait timeout"));
  });

  it("does not repeat an identical nested message and terminates on cycles", async () => {
    const { describeError } = await loadReconcileModule();
    const error = new Error("same");
    (error as { cause?: unknown }).cause = error;
    expect(describeError(error)).toBe("same");
  });

  it("handles non-Error throwables and nullish input", async () => {
    const { describeError } = await loadReconcileModule();
    expect(describeError("boom")).toBe("boom");
    expect(describeError(undefined)).toBe("Unknown error");
    expect(describeError(null)).toBe("Unknown error");
  });
});
