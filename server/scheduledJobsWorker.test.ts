import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { buildJobsTickRequest, JOBS_CRON, JOBS_TICK_HEADER, JOBS_TICK_PATH } from "../shared/jobsTick";
import { fetchContainerReplayingIdempotent } from "../src/containerRecovery";
import { verifyJobsTickToken } from "./jobsTickAuth";
import { SCHEDULED_JOBS } from "./scheduledJobRegistry";
import { registerScheduledJobsRoutes } from "./scheduledJobsRoutes";
import type { JobRunStore } from "./jobRunStore";

const config = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const worker = readFileSync(new URL("../src/worker.ts", import.meta.url), "utf8");
const stopped = "Error proxying request to container: The container is not running, consider calling start()";
const parsedConfig = JSON.parse(config.replace(/^\s*\/\/.*$/gm, "")) as { triggers?: { crons?: string[] } };

describe("Worker cron trigger configuration", () => {
  it("declares exactly the shared cron schedule", () => {
    expect(parsedConfig.triggers?.crons).toEqual([JOBS_CRON]);
  });

  it("gives every job a window that is a whole number of cron periods", () => {
    // "*/N * * * *" fires every N minutes; "0 * * * *" fires hourly.
    const every = /^\*\/(\d+) \* \* \* \*$/.exec(JOBS_CRON)?.[1];
    const period = (every ? Number(every) : JOBS_CRON === "0 * * * *" ? 60 : Number.NaN) * 60_000;
    expect(period).toBeGreaterThan(0);
    for (const job of SCHEDULED_JOBS) expect(job.windowMs % period).toBe(0);
  });
});

describe("Worker scheduled() and public boundary (src/worker.ts)", () => {
  it("signs the tick from the JWT_SECRET it already forwards to the container", () => {
    const keys = worker.slice(worker.indexOf("CONTAINER_ENV_KEYS = ["), worker.indexOf("] as const"));
    expect(keys).toContain('"JWT_SECRET"');
    const scheduled = worker.slice(worker.indexOf("async scheduled("));
    expect(scheduled).toContain("env.JWT_SECRET");
    expect(scheduled).toContain("fetchContainerReplayingIdempotent(container, () => buildJobsTickRequest(secret, Date.now()))");
    expect(scheduled).toMatch(/if \(!response\.ok\) throw/);
  });

  it("refuses public internal paths and strips the tick header before any container dispatch", () => {
    const fetchHandler = worker.slice(worker.indexOf("async fetch("), worker.indexOf("async scheduled("));
    const guard = fetchHandler.indexOf("isInternalApiPath(url.pathname)");
    const dispatch = fetchHandler.indexOf("fetchContainerWithStoppedRecovery(");
    expect(guard).toBeGreaterThan(0);
    expect(dispatch).toBeGreaterThan(guard);
    expect(fetchHandler).toContain("fetchContainerWithStoppedRecovery(container, withEdgeClientIp(withoutJobsTickHeader(request)))");
    expect(fetchHandler.match(/status: 404/g)).toHaveLength(3);
  });
});

describe("idempotent container dispatch for the tick", () => {
  it("starts a stopped container and sends a freshly built request once", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(stopped, { status: 500 })).mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const start = vi.fn().mockResolvedValue(undefined);
    const makeRequest = vi.fn(async () => new Request(`https://skipwait.me${JOBS_TICK_PATH}`, { method: "POST" }));
    const response = await fetchContainerReplayingIdempotent({ fetch, start }, makeRequest);
    expect(response.status).toBe(200);
    expect(start).toHaveBeenCalledWith(undefined, expect.objectContaining({ portToCheck: 3000 }));
    expect(makeRequest).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).not.toBe(fetch.mock.calls[1][0]);
  });

  it.each([[500, "internal server error"], [401, "Unauthorized"], [503, "busy"]])("returns a %i origin answer without starting or replaying", async (status, text) => {
    const fetch = vi.fn().mockResolvedValue(new Response(text, { status }));
    const start = vi.fn();
    const makeRequest = vi.fn(async () => new Request(`https://skipwait.me${JOBS_TICK_PATH}`, { method: "POST" }));
    const response = await fetchContainerReplayingIdempotent({ fetch, start }, makeRequest);
    expect(response.status).toBe(status);
    expect(start).not.toHaveBeenCalled();
    expect(makeRequest).toHaveBeenCalledTimes(1);
  });
});

describe("Worker tick request reaches the container route end to end", () => {
  const SECRET = "shared-jwt-secret";
  const NOW = Date.parse("2026-10-14T10:15:00.020Z");

  it("builds a POST to the tick path whose token the container accepts, even 300ms behind", async () => {
    const tick = await buildJobsTickRequest(SECRET, NOW);
    expect(tick.method).toBe("POST");
    expect(new URL(tick.url).pathname).toBe(JOBS_TICK_PATH);
    const presented = tick.headers.get(JOBS_TICK_HEADER) ?? undefined;
    expect(await verifyJobsTickToken(presented, SECRET, NOW - 300)).toBe(true);

    const store: JobRunStore = { insertRunning: async () => "inserted", find: async () => undefined, takeOver: async () => false, complete: async () => true, latest: async () => undefined };
    const run = vi.fn(async () => ({ processed: 0, failed: 0 }));
    const app = express();
    registerScheduledJobsRoutes(app, { resolveIdentity: async () => undefined, tickSecret: () => SECRET, now: () => NOW - 300, store, capture: vi.fn(), jobs: [{ ...SCHEDULED_JOBS[0], run }] });
    const response = await request(app).post(new URL(tick.url).pathname).set(JOBS_TICK_HEADER, presented ?? "");
    expect(response.status).toBe(200);
    expect(response.body.results[0]).toMatchObject({ job: "ask-expiry-sweep", windowKey: "2026-10-14T10:00Z", outcome: "ran" });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
