import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fake drizzle db: answers the information_schema probe from `existingColumns`,
// records every ALTER TABLE, and is swappable per scenario (null / rejecting).
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

async function loadReconcileModule() {
  vi.resetModules();
  vi.doMock("./db", () => ({ getDb: async () => dbRef.current }));
  return import("./schemaReconcile");
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  existingColumns = ["companyOpportunities.compensation", "jobs.compensation", "referralRequests.savedAt", "users.suspended", "profiles.anonymityOptIn", "companyOpportunities.sponsoredUntil", "companyOpportunities.sponsoredTier"];
  executeCalls = 0;
  alterStatements.length = 0;
  dbRef = {
    current: {
      execute: async (query: unknown) => {
        executeCalls += 1;
        const text = sqlText(query);
        if (text.startsWith("SELECT TABLE_NAME")) {
          return [existingColumns.map(column => {
            const [TABLE_NAME, COLUMN_NAME] = column.split(".");
            return { TABLE_NAME, COLUMN_NAME };
          }), []];
        }
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
    const { reconcileSchema, isSchemaReconciled } = await loadReconcileModule();

    const result = await reconcileSchema();

    expect(result).toEqual({
      applied: ["jobs.compensation", "referralRequests.savedAt", "users.suspended", "profiles.anonymityOptIn", "companyOpportunities.sponsoredUntil", "companyOpportunities.sponsoredTier", "table:employerAccounts", "table:profileUnlocks", "table:partnerModules"],
      skipped: ["companyOpportunities.compensation"],
    });
    expect(alterStatements.filter(st => st.startsWith("ALTER"))).toEqual([
      "ALTER TABLE `jobs` ADD COLUMN `compensation` TEXT NULL",
      "ALTER TABLE `referralRequests` ADD COLUMN `savedAt` TIMESTAMP NULL",
      "ALTER TABLE `users` ADD COLUMN `suspended` BOOLEAN NOT NULL DEFAULT false",
      "ALTER TABLE `profiles` ADD COLUMN `anonymityOptIn` BOOLEAN NOT NULL DEFAULT false",
      "ALTER TABLE `companyOpportunities` ADD COLUMN `sponsoredUntil` TIMESTAMP NULL",
      "ALTER TABLE `companyOpportunities` ADD COLUMN `sponsoredTier` ENUM('standard','featured','spotlight') NULL",
    ]);
    expect(alterStatements.filter(st => st.startsWith("CREATE TABLE IF NOT EXISTS"))).toHaveLength(3);
    expect(isSchemaReconciled()).toBe(true);
  });

  it("applies nothing when every desired column already exists", async () => {
    const { reconcileSchema, isSchemaReconciled } = await loadReconcileModule();

    const result = await reconcileSchema();

    expect(result).toEqual({
      applied: ["table:employerAccounts", "table:profileUnlocks", "table:partnerModules"],
      skipped: ["companyOpportunities.compensation", "jobs.compensation", "referralRequests.savedAt", "users.suspended", "profiles.anonymityOptIn", "companyOpportunities.sponsoredUntil", "companyOpportunities.sponsoredTier"],
    });
    expect(alterStatements.filter(st => st.startsWith("ALTER"))).toEqual([]);
    expect(alterStatements.filter(st => st.startsWith("CREATE TABLE IF NOT EXISTS"))).toHaveLength(3);
    expect(isSchemaReconciled()).toBe(true);
  });

  it("re-running after success is a silent no-op", async () => {
    existingColumns = ["companyOpportunities.compensation"];
    const { reconcileSchema, isSchemaReconciled } = await loadReconcileModule();

    await reconcileSchema();
    expect(alterStatements).toHaveLength(9);

    executeCalls = 0;
    const again = await reconcileSchema();
    expect(again).toEqual({ applied: [], skipped: [] });
    expect(executeCalls).toBe(0);
    expect(alterStatements).toHaveLength(9);
    expect(isSchemaReconciled()).toBe(true);
  });

  it("is a silent no-op when no database is configured", async () => {
    dbRef.current = null;
    const { reconcileSchema, isSchemaReconciled } = await loadReconcileModule();

    await expect(reconcileSchema()).resolves.toEqual({ applied: [], skipped: [] });
    expect(isSchemaReconciled()).toBe(false);
  });

  it("never crashes when the database rejects the reconcile", async () => {
    dbRef.current = { execute: async () => { throw new Error("connection lost"); } };
    const { reconcileSchema, isSchemaReconciled } = await loadReconcileModule();

    await expect(reconcileSchema()).resolves.toEqual({ applied: [], skipped: [] });
    expect(isSchemaReconciled()).toBe(false);
    expect(vi.mocked(console.error).mock.calls[0]?.[0]).toBe("[schema-reconcile] failed (non-fatal):");
  });
});
