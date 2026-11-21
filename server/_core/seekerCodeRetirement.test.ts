import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { SEEKER_CODE_GRACE_MS, SEEKER_PASSWORD_RELEASE_HEADER, withSeekerPasswordRelease } from "../../shared/seekerPasswordRelease";
import type { JobRunClaim, JobRunRecord, JobRunStore } from "../jobRunStore";
import { createSeekerCodeRetirement, seekerPasswordActivationMiddleware, verifiedActivationTime } from "./seekerCodeRetirement";

vi.mock("../sentry", () => ({ captureServerError: vi.fn() }));
const SHA = "a".repeat(40);
const NEXT_SHA = "b".repeat(40);
const SECRET = "synthetic-worker-release-secret";
const NOW = Date.parse("2026-11-21T12:00:00.731Z");
function store() {
  let receipt: JobRunRecord | undefined;
  const value: Pick<JobRunStore, "find" | "insertRunning"> = {
    find: async () => receipt,
    insertRunning: async (claim: JobRunClaim) => {
      if (receipt) return "duplicate";
      receipt = { ...claim, id: 1, status: "running", attempt: 1, processedCount: 0, failedCount: 0, finishedAt: null, error: null };
      return "inserted";
    },
  };
  return value;
}

describe("canonical password release receipt", () => {
  it("has no guessed cutoff before activation and never extends on restart, redeploy or concurrency", async () => {
    const durable = store();
    const first = createSeekerCodeRetirement(durable);
    expect(await first.cutoff()).toBeNull();
    await Promise.all([first.activate(SHA, NOW), first.activate(SHA, NOW)]);
    expect(await first.cutoff()).toBe(NOW + SEEKER_CODE_GRACE_MS);
    const restarted = createSeekerCodeRetirement(durable);
    await restarted.activate(NEXT_SHA, NOW + 2 * SEEKER_CODE_GRACE_MS);
    expect(await restarted.cutoff()).toBe(NOW + SEEKER_CODE_GRACE_MS);
  });

  it("replaces a caller header and accepts only a fresh signed signal for its own baked release", async () => {
    const original = new Request("https://skipwait.me/api/health/ready", { headers: { [SEEKER_PASSWORD_RELEASE_HEADER]: "forged" } });
    const marked = await withSeekerPasswordRelease(original, SECRET, SHA, NOW);
    const header = marked.headers.get(SEEKER_PASSWORD_RELEASE_HEADER) ?? undefined;
    expect(original.headers.get(SEEKER_PASSWORD_RELEASE_HEADER)).toBe("forged");
    expect(verifiedActivationTime(header, SECRET, SHA, NOW)).toBe(NOW);
    expect(verifiedActivationTime(header, SECRET, NEXT_SHA, NOW)).toBeNull();
    expect(verifiedActivationTime(header, "wrong-secret", SHA, NOW)).toBeNull();
    expect(verifiedActivationTime(header, SECRET, SHA, NOW + 60_001)).toBeNull();
    expect(verifiedActivationTime("forged", SECRET, SHA, NOW)).toBeNull();
    expect((await withSeekerPasswordRelease(original, "", SHA, NOW)).headers.has(SEEKER_PASSWORD_RELEASE_HEADER)).toBe(false);
  });

  it("records only a ready canonical activation, and refuses a failed durable write", async () => {
    const durable = store();
    const retirement = createSeekerCodeRetirement(durable);
    let ready = false;
    const app = express();
    app.use(seekerPasswordActivationMiddleware({ isReady: () => ready, sha: async () => SHA, secret: () => SECRET, now: () => NOW, retirement }));
    app.get("/api/health/ready", (_req, res) => res.json({ ready }));
    const signed = await withSeekerPasswordRelease(new Request("https://skipwait.me/api/health/ready"), SECRET, SHA, NOW);
    const header = signed.headers.get(SEEKER_PASSWORD_RELEASE_HEADER) ?? "";
    expect((await request(app).get("/api/health/ready").set(SEEKER_PASSWORD_RELEASE_HEADER, header)).status).toBe(200);
    expect(await retirement.cutoff()).toBeNull();
    ready = true;
    await request(app).get("/api/health/ready").set(SEEKER_PASSWORD_RELEASE_HEADER, "forged");
    expect(await retirement.cutoff()).toBeNull();
    await request(app).get("/api/health/ready").set(SEEKER_PASSWORD_RELEASE_HEADER, header);
    expect(await retirement.cutoff()).toBe(NOW + SEEKER_CODE_GRACE_MS);
    const failed = express();
    failed.use(seekerPasswordActivationMiddleware({ isReady: () => true, sha: async () => SHA, secret: () => SECRET, now: () => NOW,
      retirement: createSeekerCodeRetirement({ ...durable, insertRunning: async () => { throw new Error("store unavailable"); } }) }));
    expect((await request(failed).get("/api/health/ready").set(SEEKER_PASSWORD_RELEASE_HEADER, header)).status).toBe(503);
  });
});
