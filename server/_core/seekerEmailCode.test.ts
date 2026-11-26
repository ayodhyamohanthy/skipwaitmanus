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
import { registerSeekerEmailCodeRoutes, SEEKER_CODE_RETIRED_MESSAGE, SEEKER_CODE_VERIFY_UNTIL, SEEKER_USE_WORK_EMAIL_MESSAGE } from "./seekerEmailCode";

// Before the cutoff an already-emailed code still signs in (cached app versions); after it, nothing does.
const BEFORE_CUTOFF = () => SEEKER_CODE_VERIFY_UNTIL.getTime() - 60_000;
const app = (now: () => number = BEFORE_CUTOFF) => { const a = express(); a.use(express.json()); a.use(express.urlencoded({ extended: true })); registerSeekerEmailCodeRoutes(a, { now, enabled: false }); return a; };
/** A verify call from skipwait.me itself, as a cached app version sends it. */
const verify = (server: express.Express, body: object) => request(server).post("/api/auth/workos/email-code/verify").set("Sec-Fetch-Site", "same-origin").send(body);
beforeEach(() => {
  Object.values(m).forEach(f => f.mockReset());
  m.sendCode.mockResolvedValue({ sent: true, reason: "sent" }); m.verifyCode.mockResolvedValue(true);
  m.resolve.mockResolvedValue({ id: 7, openId: "workos_user_1", name: "asha", suspended: false }); m.createSessionToken.mockResolvedValue("tok");
});

// D-049 / D-078 ruling 1: the paid six-digit seeker code is retired. Send never emails anything again; verify keeps
// working only until SEEKER_CODE_VERIFY_UNTIL so a code already in someone's inbox can finish, then answers 410.
describe("the retired seeker email code (D-049, D-078 ruling 1)", () => {
  it("the cutoff is one exported instant, set to release plus 24 hours", () => {
    expect(SEEKER_CODE_VERIFY_UNTIL.toISOString()).toBe("2026-11-25T00:00:00.000Z");
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

  // Review F3: until the cutoff, verify still signs people in, so a cross-site form must not log a victim into an
  // attacker's account (the global urlencoded parser would accept it). Same origin guard as every auth POST.
  it("refuses a cross-site or non-JSON verify before checking the code", async () => {
    const evilForm = await request(app()).post("/api/auth/workos/email-code/verify").set("Origin", "https://evil.example").type("form").send("email=attacker%40gmail.com&code=482913");
    expect(evilForm.status).toBe(403);
    expect(evilForm.headers["set-cookie"]).toBeUndefined();
    const evilJson = await request(app()).post("/api/auth/workos/email-code/verify").set("Origin", "https://evil.example").send({ email: "attacker@gmail.com", code: "482913" });
    expect(evilJson.status).toBe(403);
    const noOrigin = await request(app()).post("/api/auth/workos/email-code/verify").send({ email: "attacker@gmail.com", code: "482913" });
    expect(noOrigin.status).toBe(403);
    expect(m.verifyCode).not.toHaveBeenCalled();
    expect(m.createSessionToken).not.toHaveBeenCalled();
  });

  it("correct code resolves the canonical account and sets the session cookie; no work email is enrolled", async () => {
    const res = await verify(app(), { email: "asha@gmail.com", code: "482913" });
    expect(res.status).toBe(200); expect(res.body).toEqual({ signedIn: true });
    expect(m.verifyCode).toHaveBeenCalledWith("asha@gmail.com", "482913", expect.objectContaining({ seeker: true }));
    expect(m.resolve).toHaveBeenCalledWith(expect.objectContaining({ provider: "email_code", email: "asha@gmail.com", emailVerified: true }));
    expect(m.createSessionToken).toHaveBeenCalledWith("workos_user_1", expect.anything());
    expect(res.headers["set-cookie"]?.[0]).toContain("tok");
  });
  it("wrong code: generic 400 and no session", async () => {
    m.verifyCode.mockResolvedValue(false);
    const res = await verify(app(), { email: "asha@gmail.com", code: "000000" });
    expect(res.status).toBe(400); expect(m.createSessionToken).not.toHaveBeenCalled();
  });
  it("locked pair gets 429; suspended or blocked accounts get no session", async () => {
    m.verifyCode.mockRejectedValueOnce(new OtpLockedError(new Date(Date.now() + 60_000), 60));
    expect((await verify(app(), { email: "asha@gmail.com", code: "482913" })).status).toBe(429);
    m.resolve.mockResolvedValueOnce({ id: 7, openId: "x", suspended: true });
    expect((await verify(app(), { email: "asha@gmail.com", code: "482913" })).status).toBe(403);
    m.resolve.mockRejectedValueOnce(new Error("ACCOUNT_NOT_ACTIVE"));
    expect((await verify(app(), { email: "asha@gmail.com", code: "482913" })).status).toBe(403);
    expect(m.createSessionToken).not.toHaveBeenCalled();
  });
});

// D-406 (owner, Nov 25 2026): with the switch on, anyone enters an email and gets one email with a code and a link.
describe("email link + code sign-in for seekers (D-406)", () => {
  const AFTER_CUTOFF = () => SEEKER_CODE_VERIFY_UNTIL.getTime() + 86_400_000;
  const standing = vi.fn(async (_email: string) => "unknown" as const);
  const onApp = (overrides: { standing?: typeof standing } = {}) => {
    const a = express(); a.use(express.json());
    registerSeekerEmailCodeRoutes(a, { now: AFTER_CUTOFF, enabled: true, standing: overrides.standing ?? standing });
    return a;
  };
  const send = (server: express.Express, body: object) => request(server).post("/api/auth/workos/email-code/send").set("Sec-Fetch-Site", "same-origin").send(body);
  beforeEach(() => standing.mockClear());

  it("sends one code email on the seeker plane and says so", async () => {
    const res = await send(onApp(), { email: " Asha@Gmail.com " });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: true });
    expect(m.sendCode).toHaveBeenCalledWith("asha@gmail.com", expect.objectContaining({ seeker: true }));
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("refuses a cross-site send before emailing anything", async () => {
    const res = await request(onApp()).post("/api/auth/workos/email-code/send").set("Origin", "https://evil.example").send({ email: "asha@gmail.com" });
    expect(res.status).toBe(403);
    expect(m.sendCode).not.toHaveBeenCalled();
  });

  it("rejects a malformed address with 400 and sends nothing", async () => {
    const res = await send(onApp(), { email: "nope" });
    expect(res.status).toBe(400);
    expect(m.sendCode).not.toHaveBeenCalled();
  });

  it("sends a referrer's work email to the work-email code instead, on send and on verify (D-081)", async () => {
    const referrer = vi.fn(async () => "referrer_work_email" as const);
    const sent = await send(onApp({ standing: referrer }), { email: "ref@acme.com" });
    expect(sent.status).toBe(403);
    expect(sent.body).toEqual({ error: SEEKER_USE_WORK_EMAIL_MESSAGE, code: "use_work_email_code" });
    const verified = await verify(onApp({ standing: referrer }), { email: "ref@acme.com", code: "482913" });
    expect(verified.status).toBe(403);
    expect(m.sendCode).not.toHaveBeenCalled();
    expect(m.verifyCode).not.toHaveBeenCalled();
    expect(verified.headers["set-cookie"]).toBeUndefined();
  });

  it("answers a rate limit with 429 and Retry-After", async () => {
    m.sendCode.mockResolvedValue({ sent: false, reason: "rate_limited", retryAfterSeconds: 30 });
    const res = await send(onApp(), { email: "asha@gmail.com" });
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBe("30");
  });

  it("answers a delivery failure plainly, never as sent", async () => {
    m.sendCode.mockResolvedValue({ sent: false, reason: "delivery_failed" });
    const res = await send(onApp(), { email: "asha@gmail.com" });
    expect(res.status).toBe(502);
    expect(res.body.sent).toBeUndefined();
  });

  it("verify signs in after the old cutoff while the switch is on, and a wrong code still fails", async () => {
    const ok = await verify(onApp(), { email: "asha@gmail.com", code: "482913" });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ signedIn: true });
    expect(ok.headers["set-cookie"]?.[0]).toContain("tok");
    m.verifyCode.mockResolvedValue(false);
    const wrong = await verify(onApp(), { email: "asha@gmail.com", code: "000000" });
    expect(wrong.status).toBe(400);
    expect(wrong.headers["set-cookie"]).toBeUndefined();
  });
});
