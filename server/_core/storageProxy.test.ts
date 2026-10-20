import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { normalizeStorageKey, registerStorageProxy } from "./storageProxy";

describe("normalizeStorageKey", () => {
  it.each([
    "",
    "skipwait//private-referrals/alice/resume.pdf",
    "./skipwait/private-referrals/alice/resume.pdf",
    "skipwait/a/../private-referrals/alice/resume.pdf",
    "skipwait\\private-referrals\\alice\\resume.pdf",
    "private-referrals/alice/resume.pdf",
    "skipwait/private-referrals/alice/resume.pdf",
    "skipwait/avatars/alice.png\0.png",
  ])("rejects %s", raw => {
    expect(normalizeStorageKey(raw)).toBeNull();
  });

  it.each([
    ["skipwait/avatars/alice.png", "skipwait/avatars/alice.png"],
    ["skipwait//avatars/./alice.png", "skipwait/avatars/alice.png"],
    ["skipwait/private-referrals-archive/x", "skipwait/private-referrals-archive/x"],
  ])("normalizes %s to %s", (raw, want) => {
    expect(normalizeStorageKey(raw)).toBe(want);
  });
});

function appWith(fetchImpl: ReturnType<typeof vi.fn>) {
  const app = express();
  registerStorageProxy(app, { forgeUrl: "https://forge.example", forgeKey: "test-key", fetchImpl: fetchImpl as unknown as typeof fetch });
  return app;
}

describe("GET /manus-storage/*", () => {
  it.each([
    "/manus-storage/skipwait//private-referrals/alice/resume.pdf",
    "/manus-storage/./skipwait/private-referrals/alice/resume.pdf",
    "/manus-storage/skipwait/a/../private-referrals/alice/resume.pdf",
    "/manus-storage/skipwait/%2e%2e/private-referrals/alice/resume.pdf",
    "/manus-storage/skipwait%5Cprivate-referrals%5Calice%5Cresume.pdf",
  ])("404s %s before any provider call", async path => {
    const fetchImpl = vi.fn();
    const response = await request(appWith(fetchImpl)).get(path);
    expect(response.status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("presigns the normalized key for a safe path", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ url: "https://signed.example/file" }), { status: 200 }));
    const response = await request(appWith(fetchImpl)).get("/manus-storage/skipwait//avatars/./alice.png");
    expect(response.status).toBe(307);
    expect(response.headers.location).toBe("https://signed.example/file");
    const requested = String(fetchImpl.mock.calls[0]?.[0]);
    expect(requested).toContain("path=skipwait%2Favatars%2Falice.png");
  });

  it("400s a missing key", async () => {
    const fetchImpl = vi.fn();
    const response = await request(appWith(fetchImpl)).get("/manus-storage/");
    expect(response.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
