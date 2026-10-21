import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeStorageKey } from "./storageProxy";

const previous = { BUILT_IN_FORGE_API_URL: process.env.BUILT_IN_FORGE_API_URL, BUILT_IN_FORGE_API_KEY: process.env.BUILT_IN_FORGE_API_KEY };
beforeEach(() => { process.env.BUILT_IN_FORGE_API_URL = "https://forge.example/api/"; process.env.BUILT_IN_FORGE_API_KEY = "forge-key"; vi.resetModules(); });
afterEach(() => {
  for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  vi.unstubAllGlobals(); vi.resetModules();
});

async function appFor() {
  const { registerStorageProxy } = await import("./storageProxy");
  const app = express(); registerStorageProxy(app); return app;
}

describe("normalizeStorageKey", () => {
  it.each([
    ["skipwait//private-referrals/u/1.pdf", "skipwait/private-referrals/u/1.pdf"],
    ["./skipwait/private-referrals/u/1.pdf", "skipwait/private-referrals/u/1.pdf"],
    ["public/./brand/logo.png", "public/brand/logo.png"],
    ["public//brand//logo.png", "public/brand/logo.png"],
  ])("normalizes %s to %s", (raw, expected) => { expect(normalizeStorageKey(raw)).toBe(expected); });
  it.each([
    ["public/../skipwait/private-referrals/u/1.pdf"],
    [".."],
    ["skipwait\\private-referrals\\u\\1.pdf"],
    ["skipwait/private-referrals/u\0/1.pdf"],
  ])("rejects %s", raw => { expect(normalizeStorageKey(raw)).toBeNull(); });
});

describe("storage proxy private-document guard", () => {
  it.each([
    "/manus-storage/skipwait//private-referrals/u/1.pdf",
    "/manus-storage/./skipwait/private-referrals/u/1.pdf",
    "/manus-storage/public/../skipwait/private-referrals/u/1.pdf",
    "/manus-storage/skipwait/private-referrals/u/1.pdf",
    "/manus-storage/skipwait%2Fprivate-referrals%2Fu%2F1.pdf",
  ])("answers 404 and never calls the presign backend for %s", async path => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const res = await request(await appFor()).get(path);
    expect(res.status).toBe(404); expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("presigns only the normalized public key", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { seen.push(new URL(url).searchParams.get("path") ?? ""); return { ok: true, json: async () => ({ url: "https://signed.example/object" }) }; }));
    const res = await request(await appFor()).get("/manus-storage/public//brand/./logo.png");
    expect(res.status).toBe(307); expect(seen).toEqual(["public/brand/logo.png"]);
  });
});
