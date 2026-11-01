import { describe, expect, it } from "vitest";
import { catalogJobSchema } from "../../shared/jobCatalog";
import {
  LEVER_API_HOST,
  LEVER_EU_API_HOST,
  LEVER_CRAWL_DELAY_MS,
  fetchLeverJobBoard,
  parseLeverJobs,
  waitLeverCrawlDelay,
} from "./lever";
import {
  statusAfterSuccessfulFetch,
  syncOneSource,
  type CatalogSourceRow,
  type CatalogSyncStore,
} from "./sync";

describe("lever source fetch (D-174-job-sources-more)", () => {
  it("allows Lever API hosts (api.lever.co and api.eu.lever.co)", () => {
    expect(LEVER_API_HOST).toBe("api.lever.co");
    expect(LEVER_EU_API_HOST).toBe("api.eu.lever.co");
  });

  it("the EU host works", async () => {
    const sample = [
      {
        id: "eu-job-1",
        text: "EU Software Engineer",
        hostedUrl: "https://jobs.eu.lever.co/company/eu-job-1",
        createdAt: 1700000000000,
        categories: { location: "Berlin, Germany", department: "Engineering" },
      },
    ];
    let requestedUrl = "";
    const result = await fetchLeverJobBoard(
      { provider: "lever", boardToken: "eutest" },
      {
        host: LEVER_EU_API_HOST,
        fetchImpl: async (url) => {
          requestedUrl = String(url);
          return new Response(JSON.stringify(sample), { status: 200 });
        },
        skipCrawlDelay: true,
      }
    );
    expect(result.ok).toBe(true);
    expect(requestedUrl).toContain("https://api.eu.lever.co/v0/postings/eutest?mode=json");
    if (result.ok) {
      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].externalId).toBe("eu-job-1");
    }
  });

  it("a non-allowlisted host is refused", async () => {
    const result = await fetchLeverJobBoard(
      { provider: "lever", boardToken: "palantir" },
      { host: "evil.com", skipCrawlDelay: true }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("refused_host");
  });

  it("refuses an invalid boardToken before fetching", async () => {
    const result = await fetchLeverJobBoard(
      { provider: "lever", boardToken: "evil.com/x" },
      { skipCrawlDelay: true }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_input");
  });

  it("[] from Lever stays unverified", async () => {
    // 1. Fetching an unknown or empty Lever board returns ok: true with empty jobs []
    const result = await fetchLeverJobBoard(
      { provider: "lever", boardToken: "unknown-site" },
      { fetchImpl: async () => new Response("[]", { status: 200 }), skipCrawlDelay: true }
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.jobs).toHaveLength(0);

    // 2. An unverified source that returns [] stays unverified in statusAfterSuccessfulFetch
    const row: CatalogSourceRow = {
      id: 99,
      companyId: 10,
      provider: "lever",
      boardToken: "unknown-site",
      status: "unverified",
    };
    const store: CatalogSyncStore = {
      async loadSources() { return [row]; },
      async upsertJobs() {},
      async closeMissing() { return 0; },
      async markFetchOk(...a) {
        row.status = statusAfterSuccessfulFetch(row.status);
      },
      async markFetchFailed() {},
    };
    const outcome = await syncOneSource(row, store, new Date(), (async () => new Response("[]", { status: 200 })) as never);
    expect(outcome.ok).toBe(true);
    expect(outcome.count).toBe(0);
    expect(row.status).toBe("unverified");
  });

  it("respects Lever's Crawl-delay (1000ms)", async () => {
    expect(LEVER_CRAWL_DELAY_MS).toBe(1000);
    const sleeps: number[] = [];
    const fakeSleep = async (ms: number) => { sleeps.push(ms); };
    let clock = 10000;
    // First request
    await waitLeverCrawlDelay(clock, fakeSleep);
    // 200ms later (too fast for 1000ms crawl delay)
    clock += 200;
    await waitLeverCrawlDelay(clock, fakeSleep);
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBe(800);
  });

  it("a response over the 25 MB cap is over_cap", async () => {
    const big = new Response(new Uint8Array(25 * 1024 * 1024 + 1), { status: 200 });
    const result = await fetchLeverJobBoard(
      { provider: "lever", boardToken: "palantir" },
      { fetchImpl: async () => big, skipCrawlDelay: true }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("over_cap");
  });

  it("a payload failing the Zod contract is invalid_payload", async () => {
    const result = await fetchLeverJobBoard(
      { provider: "lever", boardToken: "palantir" },
      { fetchImpl: async () => new Response(JSON.stringify([{ id: 123 }]), { status: 200 }), skipCrawlDelay: true }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_payload");
  });
});

describe("lever job payload parsing (fixtures from real Lever boards)", () => {
  it("normalizes a Lever posting fixture and extracts clean snippet and locations", () => {
    const payload = [
      {
        id: "lever-123",
        text: "Deployment Strategist",
        hostedUrl: "https://jobs.lever.co/palantir/lever-123",
        applyUrl: "https://jobs.lever.co/palantir/lever-123/apply",
        createdAt: 1729000000000,
        categories: {
          location: "New York, NY",
          department: "Deployment",
          commitment: "Full-time",
          allLocations: ["New York, NY", "London, UK"],
        },
        workplaceType: "hybrid",
        descriptionPlain: "Palantir is growing. Deploy mission-critical solutions.",
      },
    ];
    const jobs = parseLeverJobs(payload);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].externalId).toBe("lever-123");
    expect(jobs[0].title).toBe("Deployment Strategist");
    expect(jobs[0].locations).toEqual(["New York, NY", "London, UK"]);
    expect(jobs[0].workMode).toBe("hybrid");
    expect(jobs[0].department).toBe("Deployment");
    expect(jobs[0].applyUrl).toBe("https://jobs.lever.co/palantir/lever-123/apply");
    expect(jobs[0].snippet).toBe("Palantir is growing. Deploy mission-critical solutions.");
    expect(jobs[0].publishedAt).toBe(new Date(1729000000000).toISOString());
    expect(
      catalogJobSchema.safeParse({
        ...jobs[0],
        id: 1,
        companyId: 2,
        sourceId: 3,
        jobFunction: "Operations",
        level: 5,
      }).success
    ).toBe(true);
  });
});
