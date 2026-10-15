import { randomBytes } from "node:crypto";
import express from "express";
import request from "supertest";
import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { EXPORT_MAX_BYTES, buildExportZip, createDataExportSweep, type DataExportSweepDeps } from "./dataExport";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

describe("buildExportZip", () => {
  it("writes one JSON file per section plus a README, and nothing from keys it does not recognise", () => {
    const zip = buildExportZip({ generatedAt: "2026-10-15T00:00:00.000Z", format: "v1", account: { id: 1 }, referralRequests: [{ id: 2 }], profile: null, "../evil": { x: 1 }, "a b": 1 });
    const files = unzipSync(new Uint8Array(zip));
    expect(Object.keys(files).sort()).toEqual(["README.txt", "account.json", "profile.json", "referralRequests.json"]);
    expect(JSON.parse(strFromU8(files["account.json"]))).toEqual({ id: 1 });
    expect(JSON.parse(strFromU8(files["profile.json"]))).toBeNull();
    expect(strFromU8(files["README.txt"])).toContain("account.json");
  });
  it("refuses to build past the 10 MB cap", () => {
    const noise = randomBytes(12 * 1024 * 1024).toString("base64");
    expect(() => buildExportZip({ big: noise })).toThrow(RangeError);
    expect(EXPORT_MAX_BYTES).toBe(10 * 1024 * 1024);
  });
});

function sweepDeps(over: Partial<DataExportSweepDeps> = {}): DataExportSweepDeps {
  return { listRequested: vi.fn(async () => [{ id: 1, userId: 11 }, { id: 2, userId: 12 }]), build: vi.fn(async () => Buffer.from("zip")), markReady: vi.fn(async () => undefined), markFailed: vi.fn(async () => undefined), expireOld: vi.fn(async () => 0), ...over };
}

describe("data-export-sweep", () => {
  it("builds each request, stores it and expires old ones", async () => {
    const deps = sweepDeps();
    const out = await createDataExportSweep(deps)({ nowMs: Date.parse("2026-10-15T10:00:00Z"), windowKey: "w" });
    expect(out).toEqual({ processed: 2, failed: 0 });
    expect(deps.expireOld).toHaveBeenCalled();
    expect(deps.markReady).toHaveBeenCalledWith(1, expect.any(Buffer), "skipwait-personal-data-2026-10-15.zip", expect.any(Number));
  });
  it("marks an oversized export failed so it does not retry forever", async () => {
    const deps = sweepDeps({ listRequested: vi.fn(async () => [{ id: 1, userId: 11 }]), build: vi.fn(async () => { throw new RangeError("big"); }) });
    const out = await createDataExportSweep(deps)({ nowMs: 1, windowKey: "w" });
    expect(deps.markFailed).toHaveBeenCalledWith(1, expect.stringMatching(/larger than the size limit/));
    expect(out.failed).toBe(1);
  });
  it("leaves the request pending on a transient failure and keeps going", async () => {
    const build = vi.fn().mockRejectedValueOnce(new Error("db blip")).mockResolvedValueOnce(Buffer.from("z"));
    const deps = sweepDeps({ build });
    const out = await createDataExportSweep(deps)({ nowMs: 1, windowKey: "w" });
    expect(deps.markFailed).not.toHaveBeenCalled();
    expect(deps.markReady).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ processed: 1, failed: 1 });
  });
});

describe("export request routes", () => {
  const base = { dataUrlToBuffer: () => Buffer.from(""), sanitizeDocumentName: (v: string) => v } as unknown as PrivateReferralRouteDeps;
  function app(extra: Partial<PrivateReferralRouteDeps>) {
    const a = express(); a.use(express.json());
    registerPrivateReferralRoutes(a, { ...base, resolveIdentity: async req => req.header("x-test-user") ? ({ account: { id: Number(req.header("x-test-user")), openId: "u", role: undefined }, primaryEmail: { emailAddress: "u@example.com", verification: { status: "verified" as const } } } as never) : undefined, ...extra } as PrivateReferralRouteDeps);
    return a;
  }
  it("requires sign-in on all three routes", async () => {
    const a = app({});
    expect((await request(a).post("/api/privacy/export-requests")).status).toBe(401);
    expect((await request(a).get("/api/privacy/export-requests/latest")).status).toBe(401);
    expect((await request(a).get("/api/privacy/export-requests/1/download")).status).toBe(401);
  });
  it("creates, reports the 24h cooldown with Retry-After, and scopes the download to the owner", async () => {
    const requestDataExport = vi.fn().mockResolvedValueOnce({ kind: "created", id: 5 }).mockResolvedValueOnce({ kind: "cooldown", id: 5, retryAfterSeconds: 3600 });
    const getDataExportFile = vi.fn(async (userId: number, id: number) => userId === 7 && id === 5 ? { data: Buffer.from("PK"), fileName: "x.zip" } : null);
    const a = app({ requestDataExport, getDataExportFile });
    expect((await request(a).post("/api/privacy/export-requests").set("x-test-user", "7")).status).toBe(201);
    const again = await request(a).post("/api/privacy/export-requests").set("x-test-user", "7");
    expect(again.status).toBe(429); expect(again.headers["retry-after"]).toBe("3600");
    const ok = await request(a).get("/api/privacy/export-requests/5/download").set("x-test-user", "7");
    expect(ok.status).toBe(200); expect(ok.headers["content-type"]).toContain("application/zip"); expect(ok.headers["cache-control"]).toBe("private, no-store");
    expect((await request(a).get("/api/privacy/export-requests/5/download").set("x-test-user", "8")).status).toBe(404);
    expect((await request(a).get("/api/privacy/export-requests/abc/download").set("x-test-user", "7")).status).toBe(404);
  });
});
