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
import { registerSeekerEmailCodeRoutes, SEEKER_CODE_RETIRED_MESSAGE, SEEKER_CODE_VERIFY_UNTIL } from "./seekerEmailCode";

// Before the cutoff an already-emailed code still signs in (cached app versions); after it, nothing does.
const BEFORE_CUTOFF = () => SEEKER_CODE_VERIFY_UNTIL.getTime() - 60_000;
const app = (now: () => number = BEFORE_CUTOFF) => { const a = express(); a.use(express.json()); registerSeekerEmailCodeRoutes(a, { now }); return a; };
beforeEach(() => {
  Object.values(m).forEach(f => f.mockReset());
  m.sendCode.mockResolvedValue({ sent: true, reason: "sent" }); m.verifyCode.mockResolvedValue(true);
  m.resolve.mockResolvedValue({ id: 7, openId: "workos_user_1", name: "asha", suspended: false }); m.createSessionToken.mockResolvedValue("tok");
});

// D-049 / D-078 ruling 1: the paid six-digit seeker code is retired. Send never emails anything again; verify keeps
// working only until SEEKER_CODE_VERIFY_UNTIL so a code already in someone's inbox can finish, then answers 410.
describe("the retired seeker email code (D-049, D-078 ruling 1)", () => {
  it("the cutoff is one exported instant, defaulting to 2026-10-22T00:00:00Z", () => {
    expect(SEEKER_CODE_VERIFY_UNTIL.toISOString()).toBe("2026-10-22T00:00:00.000Z");
    expect(SEEKER_CODE_RETIRED_MESSAGE).toBe("Email codes are retired. Sign in with your password, or use Forgot password.");
  });

  it("send answers 410 for every caller and never sends a code", async () => {
    for (const body of [{ email: " Asha@Gmail.com " }, { email: "nope" }, {}]) {
      for (const now of [BEFORE_CUTOFF, () => SEEKER_CODE_VERIFY_UNTIL.getTime() + 1]) {
        const res = await request(app(now)).post("/api/auth/workos/email-code/send").send(body);
        expect(res.status).toBe(410);
        expect(res.body).toEqual({ error: SEEKER_CODE_RETIRED_MESSAGE });
        expect(res.headers["set-cookie"]).toBeUndefined();
      }
    }
    expect(m.sendCode).not.toHaveBeenCalled();
  });

  it("verify answers 410 from the cutoff on, without checking the code or signing anyone in", async () => {
    for (const now of [() => SEEKER_CODE_VERIFY_UNTIL.getTime(), () => SEEKER_CODE_VERIFY_UNTIL.getTime() + 86_400_000]) {
      const res = await request(app(now)).post("/api/auth/workos/email-code/verify").send({ email: "asha@gmail.com", code: "482913" });
      expect(res.status).toBe(410);
      expect(res.body).toEqual({ error: SEEKER_CODE_RETIRED_MESSAGE });
      expect(res.headers["set-cookie"]).toBeUndefined();
    }
    expect(m.verifyCode).not.toHaveBeenCalled();
    expect(m.resolve).not.toHaveBeenCalled();
    expect(m.createSessionToken).not.toHaveBeenCalled();
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
