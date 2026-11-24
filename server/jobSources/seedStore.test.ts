import { getTableColumns } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { companies, companyJobSources } from "../../drizzle/schema";
import type { JobSourceSeedEntry } from "../../shared/jobSourceSeed";
import { createInMemoryDrizzle, type Row } from "../inMemoryDrizzle.testkit";
import { createDrizzleCatalogSyncStore } from "./sync";

// SEARCH-job-sources (D-394): the drizzle seeding inserts missing boards and never touches one already there.
const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const store = createInMemoryDrizzle();
const full = (table: MySqlTable, values: Row): Row => ({ ...Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, null])), ...values });
const company = (id: number, slug: string): Row => full(companies, { id, slug, name: slug, initials: "X", industry: "Technology", location: "Global", functions: "[]", blurb: "", status: "listed", sortOrder: id });
const NOW = new Date("2026-11-25T00:05:00.000Z");

const stripe: JobSourceSeedEntry = { companySlug: "stripe", provider: "greenhouse", boardToken: "stripe", evidenceUrl: "https://stripe.com/jobs/search", evidence: "job-id-match", verified: true };
const coinbase: JobSourceSeedEntry = { companySlug: "coinbase", provider: "greenhouse", boardToken: "coinbase", evidenceUrl: "https://www.coinbase.com/careers/positions/8289787", evidence: "needs-review", verified: false };
const ghost: JobSourceSeedEntry = { companySlug: "not-listed", provider: "ashby", boardToken: "ghost", evidenceUrl: "https://example.com/careers", evidence: "direct-link", verified: true };

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
});

describe("ensureSeedSources (drizzle)", () => {
  it("inserts each missing board with its seeded status and reports companies not in the directory", async () => {
    store.reset([[companies, [company(1, "stripe"), company(2, "coinbase")]], [companyJobSources, []]]);
    const sync = await createDrizzleCatalogSyncStore();
    const out = await sync.ensureSeedSources?.([stripe, coinbase, ghost], NOW);
    expect(out).toEqual({ inserted: 2, missingCompanies: ["not-listed"] });
    const rows = store.rows(companyJobSources).map(row => ({ companyId: row.companyId, provider: row.provider, boardToken: row.boardToken, status: row.status, verifiedAt: row.verifiedAt }));
    expect(rows).toEqual([
      { companyId: 1, provider: "greenhouse", boardToken: "stripe", status: "verified", verifiedAt: NOW },
      { companyId: 2, provider: "greenhouse", boardToken: "coinbase", status: "unverified", verifiedAt: null },
    ]);
  });

  it("leaves a board already there exactly as it is (a failing or human-set status stands) and is idempotent", async () => {
    const existing = full(companyJobSources, { id: 7, companyId: 1, provider: "greenhouse", boardToken: "stripe", evidenceUrl: "https://stripe.com/jobs/search", status: "failing", verifiedAt: new Date("2026-11-01T00:00:00.000Z"), lastCount: 768 });
    store.reset([[companies, [company(1, "stripe"), company(2, "coinbase")]], [companyJobSources, [existing]]]);
    const sync = await createDrizzleCatalogSyncStore();
    expect(await sync.ensureSeedSources?.([stripe, coinbase], NOW)).toEqual({ inserted: 1, missingCompanies: [] });
    expect(await sync.ensureSeedSources?.([stripe, coinbase], NOW)).toEqual({ inserted: 0, missingCompanies: [] });
    const rows = store.rows(companyJobSources);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(existing);
  });

  it("only verified seeds are read by the daily fetch; the unverified one waits for a person", async () => {
    store.reset([[companies, [company(1, "stripe"), company(2, "coinbase")]], [companyJobSources, []]]);
    const sync = await createDrizzleCatalogSyncStore();
    await sync.ensureSeedSources?.([stripe, coinbase], NOW);
    expect((await sync.loadSources()).map(source => source.boardToken)).toEqual(["stripe"]);
  });
});
