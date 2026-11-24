import { describe, expect, it } from "vitest";
import { seedJobSourcesIfMissing, type SeedJobSourcesDb } from "./seed";
import { type JobSourceSeed } from "../../shared/jobSourceSeed";
import { companies, companyJobSources } from "../../drizzle/schema";

type MockCompany = { id: number; slug: string };
type MockSource = {
  id: number;
  companyId: number;
  provider: string;
  boardToken: string;
  evidenceUrl: string;
  status: "verified" | "unverified" | "failing";
};

function createMockDb(initial: {
  companies?: MockCompany[];
  sources?: MockSource[];
}) {
  const companyRows = [...(initial.companies ?? [])];
  const sourceRows = [...(initial.sources ?? [])];
  const inserted: Array<Record<string, unknown>> = [];

  const db: any = {
    select: (_fields: unknown) => ({
      from: (table: unknown) => ({
        where: (_condition: unknown) => ({
          limit: async (_n: number) => {
            if (table === companies) {
              return companyRows;
            }
            if (table === companyJobSources) {
              return sourceRows;
            }
            return [];
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        if (table === companyJobSources) {
          inserted.push(values);
          sourceRows.push({
            id: sourceRows.length + 1,
            companyId: values.companyId as number,
            provider: values.provider as string,
            boardToken: values.boardToken as string,
            evidenceUrl: values.evidenceUrl as string,
            status: values.status as "verified",
          });
        }
        return [{ insertId: sourceRows.length }];
      },
    }),
    inserted,
    sourceRows,
  };

  return db as SeedJobSourcesDb & { inserted: Array<Record<string, unknown>>; sourceRows: MockSource[] };
}

describe("seedJobSourcesIfMissing (SEARCH-job-sources / D-394)", () => {
  const testSeed: JobSourceSeed[] = [
    {
      companySlug: "stripe",
      provider: "greenhouse",
      boardToken: "stripe",
      evidenceUrl: "https://stripe.com/jobs",
      verifiedAt: "2026-11-24T00:00:00.000Z",
      status: "verified",
    },
    {
      companySlug: "openai",
      provider: "ashby",
      boardToken: "openai",
      evidenceUrl: "https://openai.com/careers",
      verifiedAt: "2026-11-24T00:00:00.000Z",
      status: "verified",
    },
  ];

  it("inserts verified source when company exists and no source registered", async () => {
    // stripe exists, no sources exist
    const db = createMockDb({
      companies: [{ id: 42, slug: "stripe" }],
      sources: [],
    });

    const result = await seedJobSourcesIfMissing(db, [testSeed[0]!]);
    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]).toMatchObject({
      companyId: 42,
      provider: "greenhouse",
      boardToken: "stripe",
      evidenceUrl: "https://stripe.com/jobs",
      status: "verified",
    });
  });

  it("skips insertion when source already exists", async () => {
    const db = createMockDb({
      companies: [{ id: 42, slug: "stripe" }],
      sources: [
        {
          id: 1,
          companyId: 42,
          provider: "greenhouse",
          boardToken: "stripe",
          evidenceUrl: "https://stripe.com/jobs",
          status: "verified",
        },
      ],
    });

    const result = await seedJobSourcesIfMissing(db, [testSeed[0]!]);
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(db.inserted).toHaveLength(0);
  });

  it("skips when company is not found in database", async () => {
    const db = createMockDb({
      companies: [],
      sources: [],
    });

    const result = await seedJobSourcesIfMissing(db, [testSeed[0]!]);
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(db.inserted).toHaveLength(0);
  });
});
