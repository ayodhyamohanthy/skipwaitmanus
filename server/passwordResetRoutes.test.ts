import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PASSWORD_RESET_PATHS, passwordResetConfirmResponseSchema, passwordResetSendResponseSchema, passwordResetStatusResponseSchema,
} from "@shared/passwordReset";

const dbMock = vi.hoisted(() => ({
  getDb: vi.fn(async (): Promise<object | null> => ({})),
  findUserByWorkosId: vi.fn(async (_id: string): Promise<{ userId: number; openId: string } | undefined> => ({ userId: 7, openId: "workemail_asha@wipro.com" })),
  revokeUserSessions: vi.fn(async (_openId: string) => undefined),
}));
vi.mock("./db", () => dbMock);
const workosSessions = vi.hoisted(() => ({
  listSessions: vi.fn(async (_userId: string) => ({ autoPagination: async () => [{ id: "session_live", status: "active" }, { id: "session_old", status: "revoked" }] })),
  revokeSession: vi.fn(async (_options: { sessionId: string }) => undefined),
}));
vi.mock("@workos-inc/node", () => ({ WorkOS: class { userManagement = { ...workosSessions, createPasswordReset: vi.fn(), resetPassword: vi.fn() }; } }));

import { classifyResetFailure, createWorkosPasswordResetDependencies, registerPasswordResetRoutes, sealResetLink, type PasswordResetDependencies, type RateLimitRule } from "./passwordResetRoutes";

const SECRET = "test-cookie-password-at-least-32-characters";
const NOW = Date.parse("2026-10-08T04:30:00.000Z");
const HOUR = 3_600_000;
type Harness = { deps: PasswordResetDependencies; tasks: Array<Promise<void>>; clock: { now: number }; rules: RateLimitRule[][]; app: express.Express };

function providerError(status: number, code = "", message = "") { return Object.assign(new Error(message), { status, code }); }

function harness(overrides: Partial<PasswordResetDependencies> = {}): Harness {
  const tasks: Array<Promise<void>> = [];
  const clock = { now: NOW };
  const rules: RateLimitRule[][] = [];
  const deps: PasswordResetDependencies = {
    userManagement: {
      createPasswordReset: vi.fn(async ({ email }: { email: string }) => {
        if (email !== "asha@wipro.com") throw providerError(404, "entity_not_found", "User not found");
        return { id: "password_reset_1", email: "asha@wipro.com", passwordResetToken: "workos-one-time-token", expiresAt: new Date(NOW + 24 * HOUR).toISOString() };
      }),
      resetPassword: vi.fn(async () => ({ user: { id: "user_workos_asha" } })),
    },
    linkSecret: SECRET,
    appOrigin: () => "https://skipwait.me",
    sendEmail: vi.fn(async () => ({ sent: true, reason: "sent" as const })),
    consumeRateLimit: vi.fn(async (input: readonly RateLimitRule[]) => { rules.push([...input]); return { ok: true as const }; }),
    revokeSessions: vi.fn(async () => true),
    clientIp: () => "203.0.113.9",
    now: () => clock.now,
    defer: task => { tasks.push(task()); },
    reportError: vi.fn(),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  registerPasswordResetRoutes(app, deps);
  return { deps, tasks, clock, rules, app };
}

async function linkToken(h: Harness): Promise<string> {
  await request(h.app).post(PASSWORD_RESET_PATHS.send).send({ email: "asha@wipro.com" });
  await Promise.all(h.tasks);
  const mail = vi.mocked(h.deps.sendEmail).mock.calls.at(-1)?.[0];
  const match = mail?.text.match(/https:\/\/skipwait\.me\/reset-password\?token=(\S+)/);
  if (!match) throw new Error("reset link missing from email");
  return decodeURIComponent(match[1]);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("POST send (forgot password)", () => {
  it("answers identically for existing and unknown accounts, and only emails the real one", async () => {
    const h = harness();
    const known = await request(h.app).post(PASSWORD_RESET_PATHS.send).send({ email: " Asha@Wipro.com " });
    const unknown = await request(h.app).post(PASSWORD_RESET_PATHS.send).send({ email: "nobody@wipro.com" });
    await Promise.all(h.tasks);
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(unknown.body).toEqual(known.body);
    expect(passwordResetSendResponseSchema.parse(known.body)).toEqual({ status: "sent" });
    expect(h.deps.sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(h.deps.sendEmail).mock.calls[0][0]).toMatchObject({ to: "asha@wipro.com", subject: "Reset your SkipWait password" });
    expect(vi.mocked(h.deps.sendEmail).mock.calls[0][0].text).toContain("It works for 1 hour, once.");
    expect(h.deps.reportError).not.toHaveBeenCalled();
  });

  it("rate limits per IP and per email with hashed keys, before any provider call", async () => {
    const h = harness({ consumeRateLimit: vi.fn(async () => ({ ok: false as const, reason: "limited" as const, retryAfterSeconds: 42 })) });
    const res = await request(h.app).post(PASSWORD_RESET_PATHS.send).send({ email: "asha@wipro.com" });
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBe("42");
    expect(res.body).toEqual({ status: "rate_limited", retryAfterSeconds: 42 });
    expect(h.deps.userManagement?.createPasswordReset).not.toHaveBeenCalled();
    const keys = vi.mocked(h.deps.consumeRateLimit).mock.calls[0][0].map(rule => rule.key);
    expect(keys.some(key => key.startsWith("pwr-ip10m:"))).toBe(true);
    expect(keys.some(key => key.startsWith("pwr-email1m:"))).toBe(true);
    expect(keys.join(" ")).not.toContain("asha");
    expect(keys.every(key => key.length <= 96)).toBe(true);
  });

  it("rejects malformed input and unknown fields without touching WorkOS", async () => {
    const h = harness();
    for (const body of [{}, { email: "not-an-email" }, { email: "asha@wipro.com", admin: true }]) {
      const res = await request(h.app).post(PASSWORD_RESET_PATHS.send).send(body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ status: "invalid_email" });
    }
    expect(h.deps.consumeRateLimit).not.toHaveBeenCalled();
  });

  it("is honest about an unconfigured provider or limiter", async () => {
    expect((await request(harness({ userManagement: null }).app).post(PASSWORD_RESET_PATHS.send).send({ email: "asha@wipro.com" })).status).toBe(503);
    expect((await request(harness({ appOrigin: () => null }).app).post(PASSWORD_RESET_PATHS.send).send({ email: "asha@wipro.com" })).status).toBe(503);
    const limiterDown = harness({ consumeRateLimit: vi.fn(async () => ({ ok: false as const, reason: "unavailable" as const })) });
    const res = await request(limiterDown.app).post(PASSWORD_RESET_PATHS.send).send({ email: "asha@wipro.com" });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "unavailable" });
  });

  it("reports (but never reveals) a failed delivery", async () => {
    const h = harness({ sendEmail: vi.fn(async () => ({ sent: false, reason: "delivery_failed" as const })) });
    const res = await request(h.app).post(PASSWORD_RESET_PATHS.send).send({ email: "asha@wipro.com" });
    await Promise.all(h.tasks);
    expect(res.status).toBe(202);
    expect(h.deps.reportError).toHaveBeenCalledWith(expect.any(Error), { stage: "password_reset_email" });
  });
});

describe("POST status + confirm (reset password)", () => {
  it("a fresh emailed link is valid, and is expired one hour later even if WorkOS allows longer", async () => {
    const h = harness();
    const token = await linkToken(h);
    const fresh = await request(h.app).post(PASSWORD_RESET_PATHS.status).send({ token });
    expect(passwordResetStatusResponseSchema.parse(fresh.body)).toEqual({ status: "valid" });
    h.clock.now = NOW + HOUR + 1000;
    const later = await request(h.app).post(PASSWORD_RESET_PATHS.status).send({ token });
    expect(later.status).toBe(410);
    expect(later.body).toEqual({ status: "expired" });
    const confirm = await request(h.app).post(PASSWORD_RESET_PATHS.confirm).send({ token, password: "new-password-42" });
    expect(confirm.status).toBe(410);
    expect(h.deps.userManagement?.resetPassword).not.toHaveBeenCalled();
  });

  it("uses the shorter WorkOS expiry when the provider token dies first", async () => {
    const sealed = await sealResetLink(SECRET, { providerToken: "t", resetId: "r", nowMs: NOW, providerExpiresAt: new Date(NOW + 15 * 60_000).toISOString() });
    expect(sealed.expiresAtMs).toBe(NOW + 15 * 60_000);
  });

  it("treats forged, tampered and malformed links as invalid", async () => {
    const h = harness();
    const token = await linkToken(h);
    const forged = (await sealResetLink("another-secret-entirely-32-characters", { providerToken: "t", resetId: "r", nowMs: NOW, providerExpiresAt: "" })).token;
    const tampered = `${token.slice(0, -2)}${token.endsWith("AA") ? "BB" : "AA"}`;
    for (const candidate of [forged, tampered, "not-a-link"]) {
      const res = await request(h.app).post(PASSWORD_RESET_PATHS.status).send({ token: candidate });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ status: "invalid" });
    }
  });

  it("updates through WorkOS with the provider token and signs the person out everywhere", async () => {
    const h = harness();
    const token = await linkToken(h);
    const res = await request(h.app).post(PASSWORD_RESET_PATHS.confirm).send({ token, password: "new-password-42" });
    expect(res.status).toBe(200);
    expect(passwordResetConfirmResponseSchema.parse(res.body)).toEqual({ status: "updated", otherSessionsSignedOut: true });
    expect(h.deps.userManagement?.resetPassword).toHaveBeenCalledWith({ token: "workos-one-time-token", newPassword: "new-password-42" });
    expect(h.deps.revokeSessions).toHaveBeenCalledWith("user_workos_asha");
  });

  it("enforces the kit password rules at the edge", async () => {
    const h = harness();
    const token = await linkToken(h);
    for (const password of ["short1!", "onlyletterslong"]) {
      const res = await request(h.app).post(PASSWORD_RESET_PATHS.confirm).send({ token, password });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ status: "weak_password" });
    }
    expect((await request(h.app).post(PASSWORD_RESET_PATHS.confirm).send({ token, password: "new-password-42", extra: 1 })).body).toEqual({ status: "invalid" });
    expect(h.deps.userManagement?.resetPassword).not.toHaveBeenCalled();
  });

  it("maps a used token, a policy rejection and revocation failure to typed answers", async () => {
    const used = harness();
    const usedToken = await linkToken(used);
    vi.mocked(used.deps.userManagement?.resetPassword ?? vi.fn()).mockRejectedValueOnce(providerError(404, "entity_not_found", "Password reset token not found"));
    expect((await request(used.app).post(PASSWORD_RESET_PATHS.confirm).send({ token: usedToken, password: "new-password-42" })).body).toEqual({ status: "expired" });

    const policy = harness();
    const policyToken = await linkToken(policy);
    vi.mocked(policy.deps.userManagement?.resetPassword ?? vi.fn()).mockRejectedValueOnce(providerError(422, "password_strength_error", "Password is too weak"));
    const rejected = await request(policy.app).post(PASSWORD_RESET_PATHS.confirm).send({ token: policyToken, password: "new-password-42" });
    expect(rejected.status).toBe(422);
    expect(rejected.body).toEqual({ status: "password_rejected" });

    const revokeFails = harness({ revokeSessions: vi.fn(async () => { throw new Error("db down"); }) });
    const revokeToken = await linkToken(revokeFails);
    const res = await request(revokeFails.app).post(PASSWORD_RESET_PATHS.confirm).send({ token: revokeToken, password: "new-password-42" });
    expect(res.body).toEqual({ status: "updated", otherSessionsSignedOut: false });
    expect(revokeFails.deps.reportError).toHaveBeenCalledWith(expect.any(Error), { stage: "password_reset_revoke" });
  });

  it("classifies provider failures", () => {
    expect(classifyResetFailure(Object.assign(new Error("slow down"), { status: 429, retryAfter: 9 }))).toEqual({ status: "rate_limited", retryAfterSeconds: 9 });
    expect(classifyResetFailure(providerError(400, "password_reset_token_expired"))).toEqual({ status: "expired" });
    expect(classifyResetFailure(providerError(500))).toEqual({ status: "failed" });
    expect(classifyResetFailure("boom")).toEqual({ status: "failed" });
  });
});

describe("production wiring", () => {
  it("revokes the canonical person's app sessions and every active WorkOS session", async () => {
    vi.stubEnv("WORKOS_CLIENT_ID", "client_TEST123");
    vi.stubEnv("WORKOS_API_KEY", "sk_test_123");
    vi.stubEnv("WORKOS_COOKIE_PASSWORD", SECRET);
    const deps = createWorkosPasswordResetDependencies();
    expect(deps.userManagement).not.toBeNull();
    await expect(deps.revokeSessions("user_workos_asha")).resolves.toBe(true);
    expect(dbMock.findUserByWorkosId).toHaveBeenCalledWith("user_workos_asha");
    expect(dbMock.revokeUserSessions).toHaveBeenCalledWith("workemail_asha@wipro.com");
    expect(workosSessions.revokeSession).toHaveBeenCalledTimes(1);
    expect(workosSessions.revokeSession).toHaveBeenCalledWith({ sessionId: "session_live" });
  });

  it("builds links on the configured canonical origin, not the request Host", () => {
    vi.stubEnv("WORKOS_REDIRECT_URI", "https://skipwait.me/api/auth/workos/callback");
    const deps = createWorkosPasswordResetDependencies();
    const fakeReq = { protocol: "http", get: () => "evil.example" } as unknown as express.Request;
    expect(deps.appOrigin(fakeReq)).toBe("https://skipwait.me");
  });

  it("does not claim sign-out when the database is unavailable", async () => {
    vi.stubEnv("WORKOS_CLIENT_ID", "client_TEST123");
    vi.stubEnv("WORKOS_API_KEY", "sk_test_123");
    vi.stubEnv("WORKOS_COOKIE_PASSWORD", SECRET);
    dbMock.getDb.mockResolvedValueOnce(null);
    await expect(createWorkosPasswordResetDependencies().revokeSessions("user_workos_asha")).resolves.toBe(false);
    expect(dbMock.revokeUserSessions).not.toHaveBeenCalled();
    // The provider sessions still end, so a stolen WorkOS session cannot outlive the reset.
    expect(workosSessions.revokeSession).toHaveBeenCalledWith({ sessionId: "session_live" });
  });
});
