import { describe, expect, it } from "vitest";
import { catalogJobSchema } from "../../shared/jobCatalog";
import {
  ASHBY_API_HOST,
  fetchAshbyJobBoard,
  parseAshbyJobs,
} from "./ashby";

describe("ashby source fetch (D-174-job-sources-more)", () => {
  it("allows exactly the Ashby board API host", () => {
    expect(ASHBY_API_HOST).toBe("api.ashbyhq.com");
  });

  it("refuses any other host before a request is made", async () => {
    const result = await fetchAshbyJobBoard({ provider: "ashby", boardToken: "evil.com/x" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_input");
  });

  it("refuses a host override that is not allowlisted", async () => {
    const result = await fetchAshbyJobBoard(
      { provider: "ashby", boardToken: "openai" },
      { host: "evil.com" }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("refused_host");
  });

  it("a 404 board is not_ok and never reads as 0 jobs", async () => {
    const result = await fetchAshbyJobBoard(
      { provider: "ashby", boardToken: "no-such-board-zzz" },
      { fetchImpl: async () => new Response("not found", { status: 404 }) }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("http_error");
      expect((result as { jobs?: unknown[] }).jobs).toBeUndefined();
    }
  });

  it("a response over the 25 MB cap is over_cap", async () => {
    const big = new Response(new Uint8Array(25 * 1024 * 1024 + 1), { status: 200 });
    const result = await fetchAshbyJobBoard(
      { provider: "ashby", boardToken: "openai" },
      { fetchImpl: async () => big }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("over_cap");
  });

  it("a payload failing the Zod contract is invalid_payload", async () => {
    const result = await fetchAshbyJobBoard(
      { provider: "ashby", boardToken: "openai" },
      { fetchImpl: async () => new Response(JSON.stringify({ jobs: [{ id: 123 }] }), { status: 200 }) }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_payload");
  });
});

describe("ashby job payload parsing (fixtures from real Ashby boards)", () => {
  it("normalizes an Ashby board response shape and extracts clean snippet and locations", () => {
    const payload = {
      jobs: [
        {
          id: "febe5d7f-25c9-4d77-a184-0f99e748fe7f",
          title: "Senior Commercial Account Executive",
          department: "GTM",
          team: "Account Executive",
          employmentType: "FullTime",
          location: "United States",
          secondaryLocations: [
            { location: "San Francisco, CA" },
            { location: "Bangalore" },
          ],
          publishedAt: "2026-10-29T16:56:07.691+00:00",
          isListed: true,
          isRemote: true,
          workplaceType: "Remote",
          jobUrl: "https://jobs.ashbyhq.com/1password/febe5d7f-25c9-4d77-a184-0f99e748fe7f",
          applyUrl: "https://jobs.ashbyhq.com/1password/febe5d7f-25c9-4d77-a184-0f99e748fe7f/application",
          descriptionPlain: "1Password is growing. Build things with us.",
          descriptionHtml: "<p>1Password is growing. Build things with us.</p>",
        },
      ],
    };
    const jobs = parseAshbyJobs(payload);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].externalId).toBe("febe5d7f-25c9-4d77-a184-0f99e748fe7f");
    expect(jobs[0].title).toBe("Senior Commercial Account Executive");
    expect(jobs[0].locations).toEqual(["United States", "San Francisco, CA", "Bengaluru"]);
    expect(jobs[0].workMode).toBe("remote");
    expect(jobs[0].department).toBe("GTM");
    expect(jobs[0].applyUrl).toBe("https://jobs.ashbyhq.com/1password/febe5d7f-25c9-4d77-a184-0f99e748fe7f/application");
    expect(jobs[0].snippet).toBe("1Password is growing. Build things with us.");
    expect(jobs[0].publishedAt).toBe("2026-10-29T16:56:07.691Z");
    expect(
      catalogJobSchema.safeParse({
        ...jobs[0],
        id: 1,
        companyId: 19,
        sourceId: 5,
        jobFunction: "Sales",
        level: 5,
      }).success
    ).toBe(true);
  });

  it("handles Hybrid workplaceType and strips HTML when descriptionPlain is missing", () => {
    const payload = {
      jobs: [
        {
          id: "ashby-2",
          title: "Engineering Manager",
          location: "London, UK",
          workplaceType: "Hybrid",
          jobUrl: "https://jobs.ashbyhq.com/openai/ashby-2",
          descriptionHtml: "<p>Lead <b>teams</b> at scale.</p>",
        },
      ],
    };
    const jobs = parseAshbyJobs(payload);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].workMode).toBe("hybrid");
    expect(jobs[0].locations).toEqual(["London, UK"]);
    expect(jobs[0].snippet).toBe("Lead teams at scale.");
    expect(jobs[0].applyUrl).toBe("https://jobs.ashbyhq.com/openai/ashby-2");
  });
});
