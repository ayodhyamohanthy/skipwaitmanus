/**
 * DEVICE-SIGNIN-passkeys security/integration suite.
 * Gate: with the in-code flag off every route 404s and nothing is written.
 * Flag-on (test env): challenge single-use + expiry, RP/origin binding,
 * credential ownership, referrer exclusion, suspended accounts, and session
 * equivalence with the OTP sign-in are all load-bearing and pinned here.
 */
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
  listPasskeyCredentials: vi.fn(),
  savePasskeyChallenge: vi.fn(),
  consumePasskeyChallenge: vi.fn(),
  insertPasskeyCredential: vi.fn(),
  deletePasskeyCredential: vi.fn(),
  getPasskeyCredentialByCredentialId: vi.fn(),
  bumpPasskeyCounter: vi.fn(),
  getUserByOpenId: vi.fn(),
  getVerifiedWorkEmailAccess: vi.fn(),
  createSessionToken: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: mocks.generateRegistrationOptions,
  verifyRegistrationResponse: mocks.verifyRegistrationResponse,
  generateAuthenticationOptions: mocks.generateAuthenticationOptions,
  verifyAuthenticationResponse: mocks.verifyAuthenticationResponse,
}));
vi.mock("./passkeyStore", () => ({
  listPasskeyCredentials: mocks.listPasskeyCredentials,
  savePasskeyChallenge: mocks.savePasskeyChallenge,
  consumePasskeyChallenge: mocks.consumePasskeyChallenge,
  insertPasskeyCredential: mocks.insertPasskeyCredential,
  deletePasskeyCredential: mocks.deletePasskeyCredential,
  getPasskeyCredentialByCredentialId: mocks.getPasskeyCredentialByCredentialId,
  bumpPasskeyCounter: mocks.bumpPasskeyCounter,
}));
vi.mock("../db", () => ({
  getUserByOpenId: mocks.getUserByOpenId,
  getVerifiedWorkEmailAccess: mocks.getVerifiedWorkEmailAccess,
}));
vi.mock("@sentry/node", () => ({
  captureException: mocks.captureException,
}));
vi.mock("../sentry", () => ({
  isServerSentryActive: () => true,
}));
vi.mock("./sdk", () => ({ SESSION_ACCESS_TTL_MS: 30 * 24 * 60 * 60_000, sdk: { createSessionToken: mocks.createSessionToken } }));
vi.mock("./cookies", () => ({ getSessionCookieOptions: () => ({ httpOnly: true, sameSite: "lax", secure: false, path: "/" }) }));
import { registerPasskeyLoginRoutes, resetPasskeyRateLimits } from "./passkeyLogin";

const SEEKER = { account: { openId: "user_seeker1", email: "seeker@example.com", name: "Seeker", loginMethod: "google" } };
const REFERRER = { account: { openId: "workemail_emp@acme.com", email: "emp@acme.com", name: "Emp", loginMethod: "otp_work_email" } };

function app(identity: unknown = SEEKER) {
  const a = express();
  a.use(express.json());
  registerPasskeyLoginRoutes(a, { resolveIdentity: async () => identity as never });
  return a;
}

describe("passkey routes with the flag off", () => {
  beforeEach(() => {
    delete process.env.PASSKEY_SIGNIN_ENABLED;
    Object.values(mocks).forEach(m => m.mockReset());
    resetPasskeyRateLimits();
  });
  it.each([
    "/api/auth/passkey/register/options",
    "/api/auth/passkey/register/verify",
    "/api/auth/passkey/login/options",
    "/api/auth/passkey/login/verify",
    "/api/auth/passkey/list",
    "/api/auth/passkey/revoke",
  ])("POST %s -> 404, nothing written", async (path) => {
    const res = path === "/api/auth/passkey/list" ? await request(app()).get(path) : await request(app()).post(path).send({});
    expect(res.status).toBe(404);
    expect(mocks.savePasskeyChallenge).not.toHaveBeenCalled();
    expect(mocks.insertPasskeyCredential).not.toHaveBeenCalled();
  });
});

describe("passkey routes with the flag on (test env)", () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset());
    resetPasskeyRateLimits();
    process.env.PASSKEY_SIGNIN_ENABLED = "true";
    mocks.listPasskeyCredentials.mockResolvedValue([]);
    mocks.generateRegistrationOptions.mockResolvedValue({ challenge: "reg-challenge", rp: { name: "skipwait.me" } });
    mocks.generateAuthenticationOptions.mockResolvedValue({ challenge: "login-challenge" });
    mocks.createSessionToken.mockResolvedValue("signed-session");
    mocks.getUserByOpenId.mockResolvedValue({ id: 11, openId: "user_seeker1", name: "Seeker", role: "user", suspended: false });
    mocks.getVerifiedWorkEmailAccess.mockResolvedValue(undefined);
  });
  afterEach(() => { delete process.env.PASSKEY_SIGNIN_ENABLED; });

  it("register/options refuses an unauthenticated caller", async () => {
    const res = await request(app(null)).post("/api/auth/passkey/register/options").send({});
    expect(res.status).toBe(403);
    expect(mocks.generateRegistrationOptions).not.toHaveBeenCalled();
  });

  it("register/options refuses a referrer identity (D-209 (4)(a) default)", async () => {
    const res = await request(app(REFERRER)).post("/api/auth/passkey/register/options").send({});
    expect(res.status).toBe(403);
    expect(mocks.generateRegistrationOptions).not.toHaveBeenCalled();
  });

  it("register/options and register/verify refuse an account with verified work-email access (D-057 personal login referrer)", async () => {
    mocks.getUserByOpenId.mockResolvedValue({ id: 42, openId: "user_seeker1", role: "user" });
    mocks.getVerifiedWorkEmailAccess.mockResolvedValue({ workEmailDomain: "acme.com" });
    const resOpt = await request(app()).post("/api/auth/passkey/register/options").send({});
    expect(resOpt.status).toBe(403);
    expect(mocks.generateRegistrationOptions).not.toHaveBeenCalled();

    const resVer = await request(app()).post("/api/auth/passkey/register/verify").send({});
    expect(resVer.status).toBe(403);
    expect(mocks.consumePasskeyChallenge).not.toHaveBeenCalled();
  });

  it("register/options excludes already-registered credentials and stores the challenge server-side", async () => {
    mocks.listPasskeyCredentials.mockResolvedValue([{ credentialId: "cred-1", transports: ["internal"] }]);
    const res = await request(app()).post("/api/auth/passkey/register/options").send({});
    expect(res.status).toBe(200);
    expect(mocks.generateRegistrationOptions).toHaveBeenCalledWith(expect.objectContaining({
      excludeCredentials: [{ id: "cred-1", transports: ["internal"] }],
      rpID: "skipwait.me",
    }));
    expect(mocks.savePasskeyChallenge).toHaveBeenCalledWith("user_seeker1", "reg-challenge", "registration", expect.any(Date));
  });

  it("register/verify rejects an unverified attestation without persisting", async () => {
    mocks.consumePasskeyChallenge.mockResolvedValue("reg-challenge");
    mocks.verifyRegistrationResponse.mockResolvedValue({ verified: false });
    const res = await request(app()).post("/api/auth/passkey/register/verify").send({ response: {} });
    expect(res.status).toBe(400);
    expect(mocks.insertPasskeyCredential).not.toHaveBeenCalled();
  });

  it("register/verify binds the credential to the authenticated account and stores public key + counter", async () => {
    mocks.consumePasskeyChallenge.mockResolvedValue("reg-challenge");
    mocks.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: "cred-9",
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
      },
    });
    const res = await request(app()).post("/api/auth/passkey/register/verify").send({
      response: { transports: ["internal"] },
      deviceName: "Chrome on macOS",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ registered: true });
    expect(mocks.verifyRegistrationResponse).toHaveBeenCalledWith(expect.objectContaining({
      expectedChallenge: "reg-challenge",
      expectedOrigin: "https://skipwait.me",
      expectedRPID: "skipwait.me",
    }));
    expect(mocks.insertPasskeyCredential).toHaveBeenCalledWith(expect.objectContaining({
      openId: "user_seeker1",
      credentialId: "cred-9",
      counter: 0,
      deviceName: "Chrome on macOS",
    }));
  });

  it("login/options asks for discoverable credentials and returns ceremonyId", async () => {
    mocks.savePasskeyChallenge.mockResolvedValue(101);
    const res = await request(app(null)).post("/api/auth/passkey/login/options").send({});
    expect(res.status).toBe(200);
    expect(res.body.ceremonyId).toBe(101);
    expect(mocks.generateAuthenticationOptions).toHaveBeenCalledWith(expect.objectContaining({ rpID: "skipwait.me", allowCredentials: [] }));
    expect(mocks.savePasskeyChallenge).toHaveBeenCalledWith(null, "login-challenge", "login", expect.any(Date));
  });

  it("login/verify rejects an unknown credential", async () => {
    mocks.getPasskeyCredentialByCredentialId.mockResolvedValue(null);
    const res = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "nope" });
    expect(res.status).toBe(400);
    expect(mocks.createSessionToken).not.toHaveBeenCalled();
  });

  it("login/verify rejects a referrer-bound credential even if one somehow exists (mocked challenge and account)", async () => {
    mocks.getPasskeyCredentialByCredentialId.mockResolvedValue({ id: 5, openId: "workemail_emp@acme.com", credentialId: "c", publicKey: "AAE", counter: 0, transports: null });
    mocks.consumePasskeyChallenge.mockResolvedValue("login-challenge");
    mocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 1 } });
    mocks.getUserByOpenId.mockResolvedValue({ id: 11, openId: "workemail_emp@acme.com", name: "Emp", role: "referrer", suspended: false });
    const res = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "c" });
    expect(res.status).toBe(400);
    expect(mocks.createSessionToken).not.toHaveBeenCalled();
  });

  it("login/verify rejects an account with verified work-email access", async () => {
    mocks.getPasskeyCredentialByCredentialId.mockResolvedValue({ id: 5, openId: "user_seeker1", credentialId: "c", publicKey: "AAE", counter: 0, transports: null });
    mocks.consumePasskeyChallenge.mockResolvedValue("login-challenge");
    mocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 1 } });
    mocks.getUserByOpenId.mockResolvedValue({ id: 42, openId: "user_seeker1", name: "User", role: "user", suspended: false });
    mocks.getVerifiedWorkEmailAccess.mockResolvedValue({ workEmailDomain: "acme.com" });
    const res = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "c" });
    expect(res.status).toBe(400);
    expect(mocks.createSessionToken).not.toHaveBeenCalled();
  });

  it("login/verify rejects when the login challenge is consumed or expired", async () => {
    mocks.getPasskeyCredentialByCredentialId.mockResolvedValue({ id: 5, openId: "user_seeker1", credentialId: "c", publicKey: "AAE", counter: 0, transports: null });
    mocks.consumePasskeyChallenge.mockResolvedValue(null);
    const res = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "c" });
    expect(res.status).toBe(400);
    expect(mocks.verifyAuthenticationResponse).not.toHaveBeenCalled();
  });

  it("login/verify binds origin + RP, bumps the counter, and mints the same app_session_id cookie as OTP", async () => {
    mocks.getPasskeyCredentialByCredentialId.mockResolvedValue({ id: 5, openId: "user_seeker1", credentialId: "c", publicKey: "AAE", counter: 7, transports: null });
    mocks.consumePasskeyChallenge.mockResolvedValue("login-challenge");
    mocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 8 } });
    mocks.getUserByOpenId.mockResolvedValue({ id: 11, openId: "user_seeker1", name: "Seeker", role: "user", suspended: false });
    const res = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "c", ceremonyId: 101 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ signedIn: true });
    expect(mocks.verifyAuthenticationResponse).toHaveBeenCalledWith(expect.objectContaining({
      expectedChallenge: "login-challenge",
      expectedOrigin: "https://skipwait.me",
      expectedRPID: "skipwait.me",
      credential: expect.objectContaining({ id: "c", counter: 7 }),
    }));
    expect(mocks.bumpPasskeyCounter).toHaveBeenCalledWith(5, 8);
    expect(mocks.createSessionToken).toHaveBeenCalledWith("user_seeker1", expect.anything());
    expect(res.headers["set-cookie"]?.join(";")).toContain("app_session_id=signed-session");
  });

  it("login/verify never issues a session for a suspended account", async () => {
    mocks.getPasskeyCredentialByCredentialId.mockResolvedValue({ id: 5, openId: "user_seeker1", credentialId: "c", publicKey: "AAE", counter: 0, transports: null });
    mocks.consumePasskeyChallenge.mockResolvedValue("login-challenge");
    mocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 1 } });
    mocks.getUserByOpenId.mockResolvedValue({ id: 11, openId: "user_seeker1", name: "Seeker", role: "user", suspended: true });
    const res = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "c" });
    expect(res.status).toBe(403);
    expect(res.headers["set-cookie"]?.join(";") ?? "").not.toContain("app_session_id=");
  });

  it("concurrent login ceremonies do not collide (F4)", async () => {
    mocks.savePasskeyChallenge.mockResolvedValueOnce(101).mockResolvedValueOnce(102);
    mocks.generateAuthenticationOptions.mockResolvedValueOnce({ challenge: "chal-A" }).mockResolvedValueOnce({ challenge: "chal-B" });

    const optA = await request(app(null)).post("/api/auth/passkey/login/options").send({});
    expect(optA.status).toBe(200);
    expect(optA.body.ceremonyId).toBe(101);

    const optB = await request(app(null)).post("/api/auth/passkey/login/options").send({});
    expect(optB.status).toBe(200);
    expect(optB.body.ceremonyId).toBe(102);

    mocks.getPasskeyCredentialByCredentialId.mockResolvedValue({ id: 5, openId: "user_seeker1", credentialId: "credA", publicKey: "AAE", counter: 0, transports: null });
    mocks.consumePasskeyChallenge.mockImplementation(async (_openId, _kind, ceremonyId) => {
      if (ceremonyId === 101) return "chal-A";
      if (ceremonyId === 102) return "chal-B";
      return null;
    });
    mocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 1 } });

    const verA = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "credA", ceremonyId: 101 });
    expect(verA.status).toBe(200);
    expect(verA.body.signedIn).toBe(true);
    expect(mocks.consumePasskeyChallenge).toHaveBeenCalledWith(null, "login", 101);
  });

  it("enforces rate limits on credential endpoints (F3)", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app(null)).post("/api/auth/passkey/login/options").send({});
      expect(res.status).toBe(200);
    }
    const limitedRes = await request(app(null)).post("/api/auth/passkey/login/options").send({});
    expect(limitedRes.status).toBe(429);
    expect(limitedRes.body).toMatchObject({ error: expect.stringContaining("Too many requests") });
  });

  it("captures unexpected store errors in Sentry and returns 500 with scrubbed message (F5)", async () => {
    mocks.savePasskeyChallenge.mockRejectedValue(new Error("DB connection pool timeout"));
    const res = await request(app(null)).post("/api/auth/passkey/login/options").send({});
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "We could not start passkey sign-in" });
    expect(mocks.captureException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ tags: { route: "passkey_login_options" } }));
  });

  it("supports list and revoke credentials for authenticated seekers (F7)", async () => {
    mocks.listPasskeyCredentials.mockResolvedValue([
      { credentialId: "cred-1", deviceName: "MacBook Pro", createdAt: new Date("2026-10-26T00:00:00Z"), lastUsedAt: null },
    ]);
    const listRes = await request(app()).get("/api/auth/passkey/list");
    expect(listRes.status).toBe(200);
    expect(listRes.body.credentials).toEqual([
      expect.objectContaining({ id: "cred-1", deviceName: "MacBook Pro" }),
    ]);

    const revokeRes = await request(app()).post("/api/auth/passkey/revoke").send({ credentialId: "cred-1" });
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body).toEqual({ revoked: true });
    expect(mocks.deletePasskeyCredential).toHaveBeenCalledWith("user_seeker1", "cred-1");
  });
});

describe("deploy migration 0115 matches the schema it ships", () => {
  it("creates both tables with the credential-unique and lookup indexes", () => {
    const sql = readFileSync(new URL("../../drizzle/deploy/0115_passkey_credentials.sql", import.meta.url), "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS `passkeyCredentials`");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS `passkeyChallenges`");
    expect(sql).toContain("UNIQUE INDEX `passkey_credential_id_unique` (`credentialId`)");
    expect(sql).toContain("INDEX `passkey_openid_idx` (`openId`)");
    expect(sql).toContain("`kind` ENUM('registration','login') NOT NULL");
    expect(sql).toContain("`publicKey` text NOT NULL");
    expect(sql).toContain("`counter` bigint NOT NULL DEFAULT 0");
  });
});
