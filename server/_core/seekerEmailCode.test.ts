import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ consumeLimits: vi.fn(), activeLockUntil: vi.fn(), recordVerifyFailure: vi.fn(), completeWorkosLogin: vi.fn(), createMagicAuth: vi.fn(), authenticateWithMagicAuth: vi.fn(), sendEmail: vi.fn() }));
vi.mock("../db", () => ({ getDb: async () => ({}) }));
vi.mock("../emailDelivery", () => ({ sendTransactionalEmail: m.sendEmail }));
vi.mock("../workEmailOtp", () => ({ consumeLimits: m.consumeLimits, activeLockUntil: m.activeLockUntil, recordVerifyFailure: m.recordVerifyFailure, limiterKey: (k: string, v: string) => `${k}:${v}` }));
vi.mock("./workosSession", () => ({ completeWorkosLogin: m.completeWorkosLogin }));
vi.mock("./trustedClientIp", () => ({ resolveTrustedClientIp: () => "203.0.113.9" }));
import { registerSeekerEmailCodeRoutes } from "./seekerEmailCode";

function app() {
  const a = express(); a.use(express.json());
  registerSeekerEmailCodeRoutes(a, { workos: { userManagement: { createMagicAuth: m.createMagicAuth, authenticateWithMagicAuth: m.authenticateWithMagicAuth } } as never, clientId: "client_x" });
  return a;
}
beforeEach(() => {
  Object.values(m).forEach(f => f.mockReset());
  m.consumeLimits.mockResolvedValue(undefined); m.activeLockUntil.mockResolvedValue(null);
  m.createMagicAuth.mockResolvedValue({ code: "482913" }); m.sendEmail.mockResolvedValue({ sent: true });
  m.authenticateWithMagicAuth.mockResolvedValue({ user: { id: "user_1", email: "asha@gmail.com" }, accessToken: "t", sealedSession: "s" });
  m.completeWorkosLogin.mockResolvedValue({ status: "signed_in", openId: "workos_user_1" });
});

describe("job-seeker email code sign-in", () => {
  it("creates a WorkOS magic-auth code, emails it from our sender and answers {sent:true}", async () => {
    const res = await request(app()).post("/api/auth/workos/email-code/send").send({ email: " Asha@Gmail.com " });
    expect(res.status).toBe(200); expect(res.body).toEqual({ sent: true });
    expect(m.createMagicAuth).toHaveBeenCalledWith(expect.objectContaining({ email: "asha@gmail.com" }));
    expect(m.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "asha@gmail.com", text: expect.stringContaining("482913") }));
    expect(JSON.stringify(res.body)).not.toContain("482913");
  });
  it("rate limits sends per IP, address, cooldown and globally, and rejects bad addresses", async () => {
    await request(app()).post("/api/auth/workos/email-code/send").send({ email: "asha@gmail.com" });
    const keys = (m.consumeLimits.mock.calls[0][1] as Array<{ key: string; limit: number }>).map(l => l.key.split(":")[0]);
    expect(keys).toEqual(["seeker-ip10m", "seeker-email10m", "seeker-email-cooldown", "seeker-global1h"]);
    m.consumeLimits.mockRejectedValueOnce(Object.assign(new Error("OTP_RATE_LIMITED"), { retryAfterSeconds: 20 }));
    const limited = await request(app()).post("/api/auth/workos/email-code/send").send({ email: "asha@gmail.com" });
    expect(limited.status).toBe(429); expect(limited.headers["retry-after"]).toBe("20");
    expect((await request(app()).post("/api/auth/workos/email-code/send").send({ email: "nope" })).status).toBe(400);
    expect(m.createMagicAuth).toHaveBeenCalledTimes(1);
  });
  it("signs in through the one WorkOS identity path on a correct code", async () => {
    const res = await request(app()).post("/api/auth/workos/email-code/verify").send({ email: "asha@gmail.com", code: "482913" });
    expect(res.status).toBe(200); expect(res.body).toEqual({ signedIn: true });
    expect(m.authenticateWithMagicAuth).toHaveBeenCalledWith(expect.objectContaining({ clientId: "client_x", code: "482913", email: "asha@gmail.com" }));
    expect(m.completeWorkosLogin).toHaveBeenCalledTimes(1);
  });
  it("wrong code: generic 400, failure counted, no session", async () => {
    m.authenticateWithMagicAuth.mockRejectedValue(new Error("invalid"));
    const res = await request(app()).post("/api/auth/workos/email-code/verify").send({ email: "asha@gmail.com", code: "000000" });
    expect(res.status).toBe(400); expect(m.recordVerifyFailure).toHaveBeenCalled(); expect(m.completeWorkosLogin).not.toHaveBeenCalled();
  });
  it("a locked pair is refused before WorkOS is called; suspended accounts get no session", async () => {
    m.activeLockUntil.mockResolvedValueOnce(new Date(Date.now() + 60_000));
    const locked = await request(app()).post("/api/auth/workos/email-code/verify").send({ email: "asha@gmail.com", code: "482913" });
    expect(locked.status).toBe(429); expect(m.authenticateWithMagicAuth).not.toHaveBeenCalled();
    m.completeWorkosLogin.mockResolvedValue({ status: "blocked", code: "ACCOUNT_NOT_ACTIVE" });
    const blocked = await request(app()).post("/api/auth/workos/email-code/verify").send({ email: "asha@gmail.com", code: "482913" });
    expect(blocked.status).toBe(403);
  });
});
