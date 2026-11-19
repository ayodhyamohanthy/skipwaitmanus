import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ sendCode: vi.fn(), verifyCode: vi.fn(), resolve: vi.fn(), createSessionToken: vi.fn() }));
vi.mock("../db", () => ({ resolveLoginIdentity: m.resolve }));
vi.mock("../workEmailOtp", () => ({ workEmailOtpService: { sendCode: m.sendCode, verifyCode: m.verifyCode } }));
vi.mock("./sdk", () => ({ sdk: { createSessionToken: m.createSessionToken }, SESSION_ACCESS_TTL_MS: 1000 }));
vi.mock("./cookies", () => ({ getSessionCookieOptions: () => ({}) }));
vi.mock("./trustedClientIp", () => ({ resolveTrustedClientIp: () => "203.0.113.9" }));
import { OtpLockedError } from "../otpPolicy";
import { registerSeekerEmailCodeRoutes } from "./seekerEmailCode";

const app = () => { const a = express(); a.use(express.json()); registerSeekerEmailCodeRoutes(a); return a; };
beforeEach(() => {
  Object.values(m).forEach(f => f.mockReset());
  m.sendCode.mockResolvedValue({ sent: true, reason: "sent" }); m.verifyCode.mockResolvedValue(true);
  m.resolve.mockResolvedValue({ id: 7, openId: "workos_user_1", name: "asha", suspended: false }); m.createSessionToken.mockResolvedValue("tok");
});

describe("job-seeker email code sign-in (own code, no WorkOS Magic Auth)", () => {
  it("sends through our own code store with the seeker limits and never echoes the code", async () => {
    const res = await request(app()).post("/api/auth/workos/email-code/send").send({ email: " Asha@Gmail.com " });
    expect(res.status).toBe(200); expect(res.body).toEqual({ sent: true });
    expect(m.sendCode).toHaveBeenCalledWith("asha@gmail.com", { ip: "203.0.113.9", seeker: true });
  });
  it("maps rate limit, bad address and delivery failure", async () => {
    m.sendCode.mockResolvedValueOnce({ sent: false, reason: "rate_limited", retryAfterSeconds: 20 });
    const limited = await request(app()).post("/api/auth/workos/email-code/send").send({ email: "asha@gmail.com" });
    expect(limited.status).toBe(429); expect(limited.headers["retry-after"]).toBe("20");
    expect((await request(app()).post("/api/auth/workos/email-code/send").send({ email: "nope" })).status).toBe(400);
    m.sendCode.mockResolvedValueOnce({ sent: false, reason: "delivery_failed" });
    expect((await request(app()).post("/api/auth/workos/email-code/send").send({ email: "asha@gmail.com" })).status).toBe(502);
  });
  it("correct code resolves the canonical account and sets the session cookie; no work email is enrolled", async () => {
    const res = await request(app()).post("/api/auth/workos/email-code/verify").send({ email: "asha@gmail.com", code: "482913" });
    expect(res.status).toBe(200); expect(res.body).toEqual({ signedIn: true });
    expect(m.verifyCode).toHaveBeenCalledWith("asha@gmail.com", "482913", expect.objectContaining({ seeker: true }));
    expect(m.resolve).toHaveBeenCalledWith(expect.objectContaining({ provider: "email_code", email: "asha@gmail.com", emailVerified: true }));
    expect(m.createSessionToken).toHaveBeenCalledWith("workos_user_1", expect.anything());
    expect(res.headers["set-cookie"]?.[0]).toContain("tok");
  });
  it("wrong code: generic 400 and no session", async () => {
    m.verifyCode.mockResolvedValue(false);
    const res = await request(app()).post("/api/auth/workos/email-code/verify").send({ email: "asha@gmail.com", code: "000000" });
    expect(res.status).toBe(400); expect(m.createSessionToken).not.toHaveBeenCalled();
  });
  it("locked pair gets 429; suspended or blocked accounts get no session", async () => {
    m.verifyCode.mockRejectedValueOnce(new OtpLockedError(new Date(Date.now() + 60_000), 60));
    expect((await request(app()).post("/api/auth/workos/email-code/verify").send({ email: "asha@gmail.com", code: "482913" })).status).toBe(429);
    m.resolve.mockResolvedValueOnce({ id: 7, openId: "x", suspended: true });
    expect((await request(app()).post("/api/auth/workos/email-code/verify").send({ email: "asha@gmail.com", code: "482913" })).status).toBe(403);
    m.resolve.mockRejectedValueOnce(new Error("ACCOUNT_NOT_ACTIVE"));
    expect((await request(app()).post("/api/auth/workos/email-code/verify").send({ email: "asha@gmail.com", code: "482913" })).status).toBe(403);
    expect(m.createSessionToken).not.toHaveBeenCalled();
  });
});
