import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountPreferences, referralRequests, users } from "../drizzle/schema";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";

/*
 * D-093.metrics §5.2 red-first tests. The endpoint does not exist yet; these
 * pin the contract: admin-only, private no-store, 404 while the capture switch
 * is off, windows 7d/30d/all, per-signupLanguage signups and first-request
 * counts, visible-code chosen counts, and no identifying field in the payload.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

import { registerLanguageFunnelRoutes } from "./languageFunnel";

const ADMIN = { account: { id: 1, openId: "admin-open", role: "admin" } };
const MEMBER = { account: { id: 2, openId: "member-open", role: "user" } };
const store = createInMemoryDrizzle();

const DAY_MS = 86_400_000;
const NOW = new Date("2026-11-10T12:00:00.000Z");
const SIGNUP_CODES = ["en", "hi", "te", "or", "ta", "kn", "other"] as const;

function setup() {
  const app = express();
  app.use(express.json());
  registerLanguageFunnelRoutes(app, {
    resolveIdentity: async (req: express.Request) => (req.header("x-test-user") === "admin" ? ADMIN : req.header("x-test-user") === "member" ? MEMBER : undefined),
    enabled: () => true,
    now: () => NOW,
  });
  return app;
}

const seededRows: Row[] = [
  { id: 101, name: "Ann", createdAt: new Date(NOW.getTime() - 2 * DAY_MS) },
  { id: 102, name: "Bob", createdAt: new Date(NOW.getTime() - 20 * DAY_MS) },
  { id: 103, name: "Cat", createdAt: new Date(NOW.getTime() - 400 * DAY_MS) },
  { id: 104, name: "Dan", createdAt: new Date(NOW.getTime() - 60 * DAY_MS) },
  { id: 105, name: "Eve", createdAt: new Date(NOW.getTime() + 5 * DAY_MS) },
];
const seededPreferences: Row[] = [
  { userId: 101, signupLanguage: "en", language: "en" },
  { userId: 102, signupLanguage: "hi", language: "hi" },
  { userId: 103, signupLanguage: "en", language: "en" },
  { userId: 104, signupLanguage: "other", language: null },
  { userId: 105, signupLanguage: "ta", language: "ta" },
];
const seededRequests: Row[] = [
  { id: 9001, jobId: 11, jobSeekerId: 101, referrerId: 2, status: "pending", revision: 1, personalPitch: null, referrerMessage: null, debitTransactionId: null, firstLookReferrerId: null, firstLookUntil: null, createdAt: new Date(NOW.getTime() - 1 * DAY_MS) },
  { id: 9002, jobId: 11, jobSeekerId: 103, referrerId: null, status: "pending", revision: 1, personalPitch: null, referrerMessage: null, debitTransactionId: null, firstLookReferrerId: null, firstLookUntil: null, createdAt: new Date(NOW.getTime() - 300 * DAY_MS) },
  { id: 9003, jobId: 11, jobSeekerId: 101, referrerId: null, status: "pending", revision: 1, personalPitch: null, referrerMessage: null, debitTransactionId: null, firstLookReferrerId: null, firstLookUntil: null, createdAt: new Date(NOW.getTime() - 6 * DAY_MS) },
  { id: 9004, jobId: 11, jobSeekerId: 105, referrerId: null, status: "pending", revision: 1, personalPitch: null, referrerMessage: null, debitTransactionId: null, firstLookReferrerId: null, firstLookUntil: null, createdAt: new Date(NOW.getTime() + 4 * DAY_MS) },
];

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  store.reset([
    [users, seededRows],
    [accountPreferences, seededPreferences],
    [referralRequests, seededRequests],
  ]);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("GET /api/admin/language-funnel", () => {
  it("answers 404 for everyone while the capture switch is off", async () => {
    const app = express();
    app.use(express.json());
    registerLanguageFunnelRoutes(app, {
      resolveIdentity: async () => ADMIN,
      enabled: () => false,
      now: () => NOW,
    });
    for (const header of ["admin", "member"]) {
      const response = await request(app).get("/api/admin/language-funnel").set("x-test-user", header);
      expect(response.status).toBe(404);
      expect(response.headers["cache-control"]).toBe("private, no-store");
    }
  });

  it("answers 401 signed out and 403 for a non-admin member, and sets private no-store", async () => {
    const app = setup();
    const signedOut = await request(app).get("/api/admin/language-funnel");
    expect(signedOut.status).toBe(401);
    expect(signedOut.headers["cache-control"]).toBe("private, no-store");
    const member = await request(app).get("/api/admin/language-funnel").set("x-test-user", "member");
    expect(member.status).toBe(403);
    expect(member.headers["cache-control"]).toBe("private, no-store");
  });

  it("counts signups and first requests per signup language per window", async () => {
    const response = await request(setup()).get("/api/admin/language-funnel").set("x-test-user", "admin");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");

    const shape = Object.fromEntries(SIGNUP_CODES.map(code => [code, { signups: 0, firstRequest: 0 }]));
    expect(response.body.windows["7d"]).toEqual({
      ...shape,
      en: { signups: 1, firstRequest: 1 },
    });
    expect(response.body.windows["30d"]).toEqual({
      ...shape,
      en: { signups: 1, firstRequest: 1 },
      hi: { signups: 1, firstRequest: 0 },
    });
    expect(response.body.windows.all).toEqual({
      ...shape,
      en: { signups: 2, firstRequest: 2 },
      hi: { signups: 1, firstRequest: 0 },
      other: { signups: 1, firstRequest: 0 },
    });
    // A first request made before the window still counts; a future signup does not.
  });

  it("reports chosen counts for the visible codes only, across every account", async () => {
    const response = await request(setup()).get("/api/admin/language-funnel").set("x-test-user", "admin");
    expect(response.status).toBe(200);
    // Only reviewed (visible) codes appear: English. No hi/te/or/ta/kn or "other".
    expect(response.body.chosen).toEqual({ en: 2 });
  });

  it("contains no identifying field anywhere in the payload", async () => {
    const response = await request(setup()).get("/api/admin/language-funnel").set("x-test-user", "admin");
    expect(response.status).toBe(200);
    const allow = new Set(["generatedAt", "captureEnabled", "windows", "chosen", "7d", "30d", "all", "signups", "firstRequest", ...SIGNUP_CODES, "en"]);
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) { for (const item of value) walk(item); return; }
      if (value && typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) { expect(allow.has(key)).toBe(true); walk(nested); }
      }
    };
    walk(response.body);
    expect(JSON.stringify(response.body)).not.toMatch(/userId|jobSeekerId|email|createdAt|openId|\d{4}-\d{2}-\d{2}T.*nanoseconds/i);
  });

  it("an empty store answers zeroed windows and empty chosen at 200", async () => {
    store.reset([[referralRequests, []], [accountPreferences, []], [users, []]]);
    const response = await request(setup()).get("/api/admin/language-funnel").set("x-test-user", "admin");
    expect(response.status).toBe(200);
    const shape = Object.fromEntries(SIGNUP_CODES.map(code => [code, { signups: 0, firstRequest: 0 }]));
    expect(response.body.windows["7d"]).toEqual(shape);
    expect(response.body.windows["30d"]).toEqual(shape);
    expect(response.body.windows.all).toEqual(shape);
    expect(response.body.chosen).toEqual({});
  });

  it("answers 503 when the database is unavailable", async () => {
    mocks.createPool.mockRejectedValue(new Error("fixture pool down"));
    const response = await request(setup()).get("/api/admin/language-funnel").set("x-test-user", "admin");
    expect(response.status).toBe(503);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toEqual({ error: "Database unavailable" });
  });
});
