import express from "express";
import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-for-password-reset-audit";

import {
  clearPasswordResetThrottleForTests,
  mintPasswordResetToken,
  passwordMeetsPolicy,
  registerPasswordResetRoutes,
} from "./passwordResetRoutes";

function appFor(overrides: Parameters<typeof registerPasswordResetRoutes>[1] = {}) {
  const app = express();
  app.use(express.json());
  registerPasswordResetRoutes(app, {
    findUserByEmail: async (email: string) =>
      email.toLowerCase() === "ada@example.com" ? { id: 7, openId: "open_7" } : undefined,
    revokeSessions: vi.fn(async () => undefined),
    sendResetEmail: vi.fn(async () => undefined),
    ...overrides,
  });
  return app;
}

describe("password reset recovery (v4 screens 31/32)", () => {
  beforeEach(() => clearPasswordResetThrottleForTests());

  it("is neutral for unknown emails (no enumeration)", async () => {
    const app = appFor();
    const response = await request(app).post("/api/auth/password/forgot").send({ email: "nobody@example.com" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it("rejects invalid email format", async () => {
    const app = appFor();
    expect((await request(app).post("/api/auth/password/forgot").send({ email: "not-an-email" })).status).toBe(400);
  });

  it("rate-limits forgot requests", async () => {
    const app = appFor();
    for (let i = 0; i < 5; i++) await request(app).post("/api/auth/password/forgot").send({ email: "ada@example.com" });
    const limited = await request(app).post("/api/auth/password/forgot").send({ email: "ada@example.com" });
    expect(limited.status).toBe(429);
  });

  it("verify accepts a fresh token and rejects garbage", async () => {
    const app = appFor();
    const token = await mintPasswordResetToken("ada@example.com");
    expect((await request(app).get(`/api/auth/password/reset/verify?token=${encodeURIComponent(token)}`)).body).toEqual({ valid: true });
    expect((await request(app).get("/api/auth/password/reset/verify?token=garbage")).body).toEqual({ valid: false });
  });

  it("enforces the kit password policy", () => {
    expect(passwordMeetsPolicy("short1!", "short1!")).toMatch(/10 characters/);
    expect(passwordMeetsPolicy("longpasswordwithoutdigit", "longpasswordwithoutdigit")).toMatch(/number or symbol/);
    expect(passwordMeetsPolicy("longpassword1!", "different2@")).toMatch(/match/);
    expect(passwordMeetsPolicy("longpassword1!", "longpassword1!")).toBeUndefined();
  });

  it("confirm revokes sessions and rejects reuse after rotation", async () => {
    const revoked: string[] = [];
    const app = appFor({ revokeSessions: async (openId: string) => void revoked.push(openId) });
    // Stub the live session check: first confirm sees no rotation, second sees one.
    const db = await import("./db");
    const spy = vi.spyOn(db, "getUserByOpenId").mockResolvedValue(undefined as never);
    const token = await mintPasswordResetToken("ada@example.com");
    const first = await request(app).post("/api/auth/password/reset/confirm").send({ token, password: "longpassword1!", confirm: "longpassword1!" });
    expect(first.status).toBe(200);
    expect(revoked).toEqual(["open_7"]);
    spy.mockResolvedValue({ sessionsValidAfter: new Date(Date.now() + 60_000) } as never);
    const second = await request(app).post("/api/auth/password/reset/confirm").send({ token, password: "longpassword1!", confirm: "longpassword1!" });
    expect(second.status).toBe(400);
    expect(second.body.code).toBe("consumed");
    spy.mockRestore();
  });

  it("confirm is neutral-expired for unknown accounts", async () => {
    const app = appFor();
    const token = await mintPasswordResetToken("ghost@example.com");
    const response = await request(app).post("/api/auth/password/reset/confirm").send({ token, password: "longpassword1!", confirm: "longpassword1!" });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("expired");
  });
});
