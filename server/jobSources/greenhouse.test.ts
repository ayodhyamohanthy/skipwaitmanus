import { describe, expect, it } from "vitest";
import { catalogJobSchema } from "../../shared/jobCatalog";
import {
  GREENHOUSE_API_HOST,
  fetchJobBoard,
  parseGreenhouseJobs,
  parseGreenhouseLocation,
} from "./greenhouse";

describe("greenhouse source fetch (D-174-job-catalog)", () => {
  it("allows exactly the Greenhouse board API host", () => {
    expect(GREENHOUSE_API_HOST).toBe("boards-api.greenhouse.io");
  });

  it("refuses any other host before a request is made", async () => {
    const result = await fetchJobBoard({ provider: "greenhouse", boardToken: "evil.com/x" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_input");
  });

  it("a 404 board is not_ok and never reads as 0 jobs", async () => {
    const result = await fetchJobBoard(
      { provider: "greenhouse", boardToken: "no-such-board-zzz" },
      { fetchImpl: async () => new Response("not found", { status: 404 }) }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("http_error");
      expect((result as { jobs?: unknown[] }).jobs).toBeUndefined();
    }
  });

  it("a response over the 25 MB cap is over_cap, never a truncated list", async () => {
    const big = new Response(new Uint8Array(25 * 1024 * 1024 + 1), { status: 200 });
    const result = await fetchJobBoard(
      { provider: "greenhouse", boardToken: "stripe" },
      { fetchImpl: async () => big }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("over_cap");
  });

  it("a declared content-length over the cap is rejected before reading", async () => {
    const res = new Response("{}", { status: 200, headers: { "content-length": String(26 * 1024 * 1024) } });
    const result = await fetchJobBoard(
      { provider: "greenhouse", boardToken: "stripe" },
      { fetchImpl: async () => res }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("over_cap");
  });

  it("a redirect is not followed", async () => {
    const result = await fetchJobBoard(
      { provider: "greenhouse", boardToken: "stripe" },
      { fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://evil.example/x" } }) }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("redirect_refused");
  });

  it("a payload failing the Zod contract is invalid, never a partial list", async () => {
    const result = await fetchJobBoard(
      { provider: "greenhouse", boardToken: "stripe" },
      { fetchImpl: async () => new Response(JSON.stringify({ jobs: [{ id: "not-a-number" }] }), { status: 200 }) }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_payload");
  });
});

describe("greenhouse location parser (fixtures from real board strings)", () => {
  it("splits multi-city strings", () => {
    expect(parseGreenhouseLocation("San Francisco / New York")).toEqual({
      locations: ["San Francisco", "New York"],
      workMode: "onsite",
    });
    expect(parseGreenhouseLocation("Berlin; Munich")).toEqual({
      locations: ["Berlin", "Munich"],
      workMode: "onsite",
    });
  });

  it("detects Remote and Hybrid", () => {
    expect(parseGreenhouseLocation("Remote - US")).toEqual({ locations: ["US"], workMode: "remote" });
    expect(parseGreenhouseLocation("London (Hybrid)")).toEqual({ locations: ["London"], workMode: "hybrid" });
    expect(parseGreenhouseLocation("Remote")).toEqual({ locations: ["Remote"], workMode: "remote" });
  });

  it("aliases known names", () => {
    expect(parseGreenhouseLocation("Bangalore")).toEqual({ locations: ["Bengaluru"], workMode: "onsite" });
    expect(parseGreenhouseLocation("NYC")).toEqual({ locations: ["New York"], workMode: "onsite" });
  });

  it("empty or missing location is unknown, never invented", () => {
    expect(parseGreenhouseLocation("")).toEqual({ locations: [], workMode: "unknown" });
    expect(parseGreenhouseLocation(null)).toEqual({ locations: [], workMode: "unknown" });
  });
});

describe("greenhouse job payload parsing", () => {
  it("normalizes a real board response shape and strips HTML from content", () => {
    const payload = {
      jobs: [
        {
          id: 123,
          title: "Software Engineer, Payments",
          location: { name: "Bangalore" },
          absolute_url: "https://boards.greenhouse.io/stripe/jobs/123",
          content: "<p>Build <b>payments</b>.</p>",
          updated_at: "2026-10-20T10:00:00.000Z",
          departments: [{ name: "Engineering" }],
        },
      ],
    };
    const jobs = parseGreenhouseJobs(payload);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].externalId).toBe("123");
    expect(jobs[0].title).toBe("Software Engineer, Payments");
    expect(jobs[0].locations).toEqual(["Bengaluru"]);
    expect(jobs[0].snippet).toBe("Build payments.");
    expect(jobs[0].applyUrl).toBe("https://boards.greenhouse.io/stripe/jobs/123");
    expect(jobs[0].department).toBe("Engineering");
  });
});

describe("greenhouse real-board hardening (PR #650 review findings)", () => {
  it("normalizes an offset updated_at to the Z-only shared contract", () => {
    const [job] = parseGreenhouseJobs({
      jobs: [{ id: 9, title: "Software Engineer", absolute_url: "https://boards.greenhouse.io/stripe/jobs/9", updated_at: "2026-10-22T09:17:09-04:00", location: { name: "Seattle" }, content: "" }],
    });
    expect(job.publishedAt).toBe("2026-10-22T13:17:09.000Z");
    expect(catalogJobSchema.safeParse({ ...job, companyId: 1, sourceId: 1, jobFunction: null, level: 5 }).success).toBe(true);
  });

  it("splits comma-joined multi-city labels", () => {
    expect(parseGreenhouseLocation("Seattle, San Francisco, New York City")).toEqual({
      locations: ["Seattle", "San Francisco", "New York"],
      workMode: "onsite",
    });
  });

  it("keeps a single-comma city-country label whole", () => {
    expect(parseGreenhouseLocation("London, UK")).toEqual({ locations: ["London, UK"], workMode: "onsite" });
  });

  it("drops the 'from the' qualifier after Remote", () => {
    expect(parseGreenhouseLocation("Remote from the US")).toEqual({ locations: ["US"], workMode: "remote" });
  });

  it("uses office cities when the location label is only a work-mode word", () => {
    const [job] = parseGreenhouseJobs({
      jobs: [{ id: 10, title: "Software Engineer", absolute_url: "https://boards.greenhouse.io/cloudflare/jobs/10", location: { name: "Hybrid" }, offices: [{ name: "Austin" }, { name: "London" }], content: "" }],
    });
    expect(job.workMode).toBe("hybrid");
    expect(job.locations).toEqual(["Austin", "London"]);
  });
});

describe("city-state labels (PR #650 re-review regression)", () => {
  it("honors semicolons between city-state labels", () => {
    expect(parseGreenhouseLocation("New York, NY; Pittsburgh, PA")).toEqual({
      locations: ["New York, NY", "Pittsburgh, PA"],
      workMode: "onsite",
    });
    expect(parseGreenhouseLocation("San Francisco, CA; Chicago, IL; Seattle, WA; New York, NY")).toEqual({
      locations: ["San Francisco, CA", "Chicago, IL", "Seattle, WA", "New York, NY"],
      workMode: "onsite",
    });
    expect(parseGreenhouseLocation("Los Angeles, CA; San Francisco, CA")).toEqual({
      locations: ["Los Angeles, CA", "San Francisco, CA"],
      workMode: "onsite",
    });
  });

  it("keeps a hierarchical city-region-country label whole", () => {
    expect(parseGreenhouseLocation("Los Angeles, California, United States")).toEqual({
      locations: ["Los Angeles, California, United States"],
      workMode: "onsite",
    });
  });

  it("still splits a true comma-joined multi-city label", () => {
    expect(parseGreenhouseLocation("Seattle, San Francisco, New York City")).toEqual({
      locations: ["Seattle", "San Francisco", "New York"],
      workMode: "onsite",
    });
    expect(parseGreenhouseLocation("London, UK")).toEqual({ locations: ["London, UK"], workMode: "onsite" });
  });
});
