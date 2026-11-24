import { describe, expect, it, vi } from "vitest";
import { JOB_SOURCE_SEED } from "../../shared/jobSourceSeed";
import { createJobCatalogSync, type CatalogSyncStore } from "./sync";

// The catalog switch is off on main; these tests read it on (D-394 turns it on in the release row).
vi.mock("../../shared/jobCatalog", async importOriginal => ({ ...await importOriginal<typeof import("../../shared/jobCatalog")>(), JOB_CATALOG_ENABLED: true }));

function store(overrides: Partial<CatalogSyncStore> = {}) {
  const order: string[] = [];
  const base: CatalogSyncStore = {
    async ensureSeedSources(seed, now) { order.push(`seed:${seed.length}:${now.toISOString()}`); return { inserted: seed.length, missingCompanies: [] }; },
    async loadSources() { order.push("load"); return []; },
    async upsertJobs() { /* no jobs */ },
    async closeMissing() { return 0; },
    async markFetchOk() { /* unused */ },
    async markFetchFailed() { /* unused */ },
  };
  return { order, store: { ...base, ...overrides } };
}

describe("job-catalog-sync seeds the reviewed boards (SEARCH-job-sources, D-394)", () => {
  it("ensures the seed sources before it loads the sources to fetch", async () => {
    const { order, store: s } = store();
    await createJobCatalogSync(s)({ nowMs: Date.parse("2026-11-25T00:05:00Z"), windowKey: "2026-11-25T00:00Z" });
    expect(order).toEqual([`seed:${JOB_SOURCE_SEED.length}:2026-11-25T00:05:00.000Z`, "load"]);
  });

  it("a seeding failure is reported and the run still fetches the sources it has", async () => {
    const { order, store: s } = store({ async ensureSeedSources() { throw new Error("db down"); } });
    const out = await createJobCatalogSync(s)({ nowMs: Date.parse("2026-11-25T00:05:00Z"), windowKey: "2026-11-25T00:00Z" });
    expect(order).toEqual(["load"]);
    expect(out).toMatchObject({ processed: 0, failed: 1 });
  });
});
