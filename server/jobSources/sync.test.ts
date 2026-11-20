import { describe, expect, it, vi } from "vitest";
import { JOB_CATALOG_ENABLED } from "../../shared/jobCatalog";
import { assignJobLevel } from "../../shared/jobLevel";
import {
  SYNCABLE_SOURCE_STATUSES,
  createJobCatalogSync,
  statusAfterSuccessfulFetch,
  syncOneSource,
  type CatalogSourceRow,
  type CatalogSyncStore,
} from "./sync";

const verified: CatalogSourceRow = { id: 7, companyId: 3, provider: "greenhouse", boardToken: "stripe", status: "verified" };
const unverified: CatalogSourceRow = { id: 8, companyId: 4, provider: "greenhouse", boardToken: "missing", status: "unverified" };

function fakeStore(): CatalogSyncStore & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = { loadSources: [], upsertJobs: [], closeMissing: [], markFetchOk: [], markFetchFailed: [] };
  return {
    calls,
    async loadSources() { calls.loadSources.push([]); return [verified]; },
    async upsertJobs(...a: unknown[]) { calls.upsertJobs.push(a); },
    async closeMissing(...a: unknown[]) { calls.closeMissing.push(a); return 2; },
    async markFetchOk(...a: unknown[]) { calls.markFetchOk.push(a); },
    async markFetchFailed(...a: unknown[]) { calls.markFetchFailed.push(a); },
  };
}

const boardPayload = {
  jobs: [
    { id: 1, title: "Software Engineer", location: { name: "Bengaluru" }, absolute_url: "https://boards.greenhouse.io/stripe/jobs/1", content: "<p>Build things.</p>", updated_at: "2026-10-20T10:00:00.000Z", departments: [{ name: "Engineering" }] },
    { id: 2, title: "Product Manager", location: { name: "Remote" }, absolute_url: "https://boards.greenhouse.io/stripe/jobs/2", content: "", updated_at: "2026-10-19T10:00:00.000Z", departments: [] },
  ],
};
const okFetch = async () => new Response(JSON.stringify(boardPayload), { status: 200 });

describe("catalog refresh (D-174-job-catalog)", () => {
  it("does nothing while the switch is off (D-097)", async () => {
    expect(JOB_CATALOG_ENABLED).toBe(false);
    const store = fakeStore();
    const run = createJobCatalogSync(store);
    const out = await run({ nowMs: Date.now(), windowKey: "2026-10-25T11" });
    expect(out).toEqual({ processed: 0, failed: 0, skipped: "flag_off" });
    expect(store.calls.loadSources).toHaveLength(0);
  });

  it("a successful full fetch upserts every job and closes the missing", async () => {
    const store = fakeStore();
    const outcome = await syncOneSource(verified, store, new Date("2026-10-25T11:00:00Z"), okFetch as never);
    expect(outcome.ok).toBe(true);
    const [jobs] = store.calls.upsertJobs[0] as [Array<{ externalId: string; level: number; locations: string[]; snippet: string }>];
    expect(jobs.map((j) => j.externalId)).toEqual(["1", "2"]);
    expect(jobs[0].level).toBe(assignJobLevel({ title: "Software Engineer", description: "Build things.", url: "https://boards.greenhouse.io/stripe/jobs/1" }).level);
    expect(jobs[0].snippet).toBe("Build things.");
    expect(jobs[1].locations).toEqual(["Remote"]);
    expect(jobs[1].workMode).toBe("remote");
    const [sourceId, seen] = store.calls.closeMissing[0] as [number, string[]];
    expect(sourceId).toBe(7);
    expect(seen.sort()).toEqual(["1", "2"]);
    expect(store.calls.markFetchOk[0]).toEqual([verified, 2, new Date("2026-10-25T11:00:00Z")]);
  });

  it("keeps a failing source in the daily load set - one timeout is not permanent (F3)", () => {
    expect(SYNCABLE_SOURCE_STATUSES).toContain("verified");
    expect(SYNCABLE_SOURCE_STATUSES).toContain("failing");
    expect(SYNCABLE_SOURCE_STATUSES).not.toContain("unverified");
  });

  it("restores a failing source after the next successful fetch (F3)", async () => {
    const row: CatalogSourceRow = { ...verified };
    const okCalls: unknown[][] = [];
    const store: CatalogSyncStore = {
      async loadSources() { return [row]; },
      async upsertJobs() {},
      async closeMissing() { return 0; },
      async markFetchOk(...a: unknown[]) {
        okCalls.push([{ ...(a[0] as CatalogSourceRow) }, a[1], a[2]]);
        row.status = statusAfterSuccessfulFetch(row.status);
      },
      async markFetchFailed(source) { if (source.status === "verified") row.status = "failing"; },
    };
    const fail = async () => new Response("nope", { status: 500 });
    const failed = await syncOneSource(row, store, new Date("2026-10-25T11:00:00Z"), fail as never);
    expect(failed.ok).toBe(false);
    expect(row.status).toBe("failing");
    const recovered = await syncOneSource(row, store, new Date("2026-10-26T11:00:00Z"), okFetch as never);
    expect(recovered.ok).toBe(true);
    expect(row.status).toBe("verified");
    expect(okCalls).toHaveLength(1);
    expect(okCalls[0][0]).toMatchObject({ id: 7, status: "failing" });
  });

  it("never promotes an unverified source on a successful fetch (F3)", () => {
    expect(statusAfterSuccessfulFetch("failing")).toBe("verified");
    expect(statusAfterSuccessfulFetch("verified")).toBe("verified");
    expect(statusAfterSuccessfulFetch("unverified")).toBe("unverified");
  });

  it("a failed fetch changes no job and only marks the source", async () => {
    const store = fakeStore();
    const notFound = async () => new Response("nope", { status: 404 });
    const outcome = await syncOneSource(verified, store, new Date(), notFound as never);
    expect(outcome.ok).toBe(false);
    expect(store.calls.upsertJobs).toHaveLength(0);
    expect(store.calls.closeMissing).toHaveLength(0);
    expect(store.calls.markFetchOk).toHaveLength(0);
    expect(store.calls.markFetchFailed).toHaveLength(1);
  });

  it("a 404 on an unverified board never becomes a 0-job list", async () => {
    const store = fakeStore();
    const notFound = async () => new Response("nope", { status: 404 });
    await syncOneSource(unverified, store, new Date(), notFound as never);
    expect(store.calls.upsertJobs).toHaveLength(0);
    expect(store.calls.markFetchFailed).toHaveLength(1);
    expect(store.calls.markFetchFailed[0][0]).toMatchObject({ id: 8, status: "unverified" });
  });
});
