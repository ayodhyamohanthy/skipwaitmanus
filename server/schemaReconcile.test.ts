import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fake drizzle db: answers the information_schema probe from `existingColumns`,
// records every ALTER TABLE, and is swappable per scenario (null / rejecting /
// failing one statement).
type FakeDb = { execute: (query: unknown) => Promise<unknown> };

let existingColumns: string[];
let existingIndexes: string[];
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

const indexProbeRows = (indexes: string[]) => indexes.map(index => {
  const [TABLE_NAME, INDEX_NAME] = index.split(".");
  return { TABLE_NAME, INDEX_NAME };
});

const probeAnswer = (query: unknown) => {
  const text = sqlText(query);
  if (!text.startsWith("SELECT TABLE_NAME")) return null;
  // BOTH probes select TABLE_NAME, so they are distinguished by which
  // information_schema view they read: COLUMNS for columns, STATISTICS for indexes.
  return text.includes("information_schema.STATISTICS")
    ? [indexProbeRows(existingIndexes), []]
    : [probeRows(existingColumns), []];
};

// The index reconciliation, in DESIRED_INDEXES order. These exist because
// `CREATE TABLE IF NOT EXISTS` never fixes an existing table, so a database built
// by an earlier version kept its missing (and load-bearing) unique keys forever.
const INDEX_APPLIED = [
  "employerAccounts.employer_accounts_user_unique",
  "profileUnlocks.profile_unlocks_employer_seeker_unique",
  "profileUnlocks.profile_unlocks_seeker_idx",
  "partnerModules.partner_modules_active_idx",
  "companyOpportunities.company_opportunities_sponsor_idx",
  "messages.messages_sender_idx",
  "referralRequests.referral_requests_job_idx",
  "profiles.profiles_work_email_domain_idx",
];

const INDEX_ALTERS = [
  "ALTER TABLE `employerAccounts` ADD UNIQUE INDEX `employer_accounts_user_unique`(`userId`)",
  "ALTER TABLE `profileUnlocks` ADD UNIQUE INDEX `profile_unlocks_employer_seeker_unique`(`employerUserId`, `seekerProfileUserId`)",
  "ALTER TABLE `profileUnlocks` ADD INDEX `profile_unlocks_seeker_idx`(`seekerProfileUserId`)",
  "ALTER TABLE `partnerModules` ADD INDEX `partner_modules_active_idx`(`isActive`, `createdAt`)",
  "ALTER TABLE `companyOpportunities` ADD INDEX `company_opportunities_sponsor_idx`(`sponsoredUntil`)",
  "ALTER TABLE `messages` ADD INDEX `messages_sender_idx`(`senderId`)",
  "ALTER TABLE `referralRequests` ADD INDEX `referral_requests_job_idx`(`jobId`)",
  "ALTER TABLE `profiles` ADD INDEX `profiles_work_email_domain_idx`(`workEmailDomain`)",
];

const indexAlters = () => alterStatements.filter(st => st.includes("ADD INDEX") || st.includes("ADD UNIQUE INDEX"));
const columnAlters = () => alterStatements.filter(st => st.includes("ADD COLUMN"));

async function loadReconcileModule() {
  vi.resetModules();
  vi.doMock("./db", () => ({ getDb: async () => dbRef.current }));
  return import("./schemaReconcile");
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  existingColumns = ["companyOpportunities.compensation", "jobs.compensation", "referralRequests.savedAt", "users.suspended", "profiles.anonymityOptIn", "companyOpportunities.sponsoredUntil", "companyOpportunities.sponsoredTier", "workEmailOtpCodes.verifiedByUserId"];
  existingIndexes = [];
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
      applied: ["jobs.compensation", "referralRequests.savedAt", "users.suspended", "profiles.anonymityOptIn", "companyOpportunities.sponsoredUntil", "companyOpportunities.sponsoredTier", "workEmailOtpCodes.verifiedByUserId", "table:employerAccounts", "table:profileUnlocks", "table:partnerModules", "table:userFollows", ...INDEX_APPLIED],
      skipped: ["companyOpportunities.compensation"],
    });
    expect(columnAlters()).toEqual([
      "ALTER TABLE `jobs` ADD COLUMN `compensation` TEXT NULL",
      "ALTER TABLE `referralRequests` ADD COLUMN `savedAt` TIMESTAMP NULL",
      "ALTER TABLE `users` ADD COLUMN `suspended` BOOLEAN NOT NULL DEFAULT false",
      "ALTER TABLE `profiles` ADD COLUMN `anonymityOptIn` BOOLEAN NOT NULL DEFAULT false",
      "ALTER TABLE `companyOpportunities` ADD COLUMN `sponsoredUntil` TIMESTAMP NULL",
      "ALTER TABLE `companyOpportunities` ADD COLUMN `sponsoredTier` ENUM('standard','featured','spotlight') NULL",
      "ALTER TABLE `workEmailOtpCodes` ADD COLUMN `verifiedByUserId` INT NULL",
    ]);
    expect(indexAlters()).toEqual(INDEX_ALTERS);
    expect(alterStatements.filter(st => st.startsWith("CREATE TABLE IF NOT EXISTS"))).toHaveLength(4);
    expect(isSchemaReconciled()).toBe(true);
    expect(getLastReconcileResults()).toHaveLength(19);
    expect(getLastReconcileResults().every(entry => entry.ok)).toBe(true);
  });

  it("applies nothing when every desired column already exists", async () => {
    const { reconcileSchema, isSchemaReconciled, getLastReconcileResults } = await loadReconcileModule();

    const result = await reconcileSchema();

    expect(result).toEqual({
      applied: ["table:employerAccounts", "table:profileUnlocks", "table:partnerModules", "table:userFollows", ...INDEX_APPLIED],
      skipped: ["companyOpportunities.compensation", "jobs.compensation", "referralRequests.savedAt", "users.suspended", "profiles.anonymityOptIn", "companyOpportunities.sponsoredUntil", "companyOpportunities.sponsoredTier", "workEmailOtpCodes.verifiedByUserId"],
    });
    expect(columnAlters()).toEqual([]);
    expect(indexAlters()).toEqual(INDEX_ALTERS);
    expect(alterStatements.filter(st => st.startsWith("CREATE TABLE IF NOT EXISTS"))).toHaveLength(4);
    expect(isSchemaReconciled()).toBe(true);
    expect(getLastReconcileResults().map(entry => entry.ok)).toEqual(Array(12).fill(true));
  });

  it("adds a missing index to an existing table, and skips one already present", async () => {
    // The whole point of reconciling indexes separately: `CREATE TABLE IF NOT
    // EXISTS` is a no-op on an existing table, so a database created before the
    // unique keys were declared kept their absence forever.
    existingIndexes = ["employerAccounts.employer_accounts_user_unique"];
    const { reconcileSchema } = await loadReconcileModule();

    const result = await reconcileSchema();

    // The duplicate-unlock guard is added to the existing table...
    expect(indexAlters()).toContain("ALTER TABLE `profileUnlocks` ADD UNIQUE INDEX `profile_unlocks_employer_seeker_unique`(`employerUserId`, `seekerProfileUserId`)");
    // ...and the one that is already there is not re-added.
    expect(indexAlters()).not.toContain("ALTER TABLE `employerAccounts` ADD UNIQUE INDEX `employer_accounts_user_unique`(`userId`)");
    expect(result.skipped).toContain("employerAccounts.employer_accounts_user_unique");
  });

  it("re-running after success is a silent no-op", async () => {
    existingColumns = ["companyOpportunities.compensation"];
    const { reconcileSchema, isSchemaReconciled } = await loadReconcileModule();

    await reconcileSchema();
    expect(alterStatements).toHaveLength(19);

    executeCalls = 0;
    const again = await reconcileSchema();
    expect(again).toEqual({ applied: [], skipped: [] });
    expect(executeCalls).toBe(0);
    expect(alterStatements).toHaveLength(19);
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
    expect(result.applied).toEqual(["referralRequests.savedAt", "users.suspended", "profiles.anonymityOptIn", "companyOpportunities.sponsoredUntil", "companyOpportunities.sponsoredTier", "workEmailOtpCodes.verifiedByUserId", "table:employerAccounts", "table:profileUnlocks", "table:partnerModules", "table:userFollows", ...INDEX_APPLIED]);
    // The failed statement is captured with its error, not applied.
    const results = getLastReconcileResults();
    expect(results).toHaveLength(19);
    expect(results.filter(entry => entry.ok)).toHaveLength(18);
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
    expect(results).toHaveLength(20); // 8 columns + 4 tables + 8 indexes attempted
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
