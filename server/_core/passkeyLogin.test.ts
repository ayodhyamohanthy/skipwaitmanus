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
  getPasskeyCredentialByCredentialId: vi.fn(),
  bumpPasskeyCounter: vi.fn(),
  getUserByOpenId: vi.fn(),
  createSessionToken: vi.fn(),
}));
vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: mocks.generateRegistrationOptions,
  verifyRegistrationResponse: mocks.verifyRegistrationResponse,
  generateAuthenticationOptions: mocks.generateAuthenticationOptions,
  verifyAuthenticationResponse: mocks.verifyAuthenticationResponse,
}));
vi.mock("../db", () => ({
  listPasskeyCredentials: mocks.listPasskeyCredentials,
  savePasskeyChallenge: mocks.savePasskeyChallenge,
  consumePasskeyChallenge: mocks.consumePasskeyChallenge,
  insertPasskeyCredential: mocks.insertPasskeyCredential,
  getPasskeyCredentialByCredentialId: mocks.getPasskeyCredentialByCredentialId,
  bumpPasskeyCounter: mocks.bumpPasskeyCounter,
  getUserByOpenId: mocks.getUserByOpenId,
}));
vi.mock("./sdk", () => ({ SESSION_ACCESS_TTL_MS: 30 * 24 * 60 * 60_000, sdk: { createSessionToken: mocks.createSessionToken } }));
vi.mock("./cookies", () => ({ getSessionCookieOptions: () => ({ httpOnly: true, sameSite: "lax", secure: false, path: "/" }) }));
import { registerPasskeyLoginRoutes } from "./passkeyLogin";

const SEEKER = { account: { openId: "user_seeker1", email: "seeker@example.com", name: "Seeker", loginMethod: "google" } };
const REFERRER = { account: { openId: "workemail_emp@acme.com", email: "emp@acme.com", name: "Emp", loginMethod: "otp_work_email" } };

function app(identity: unknown = SEEKER) {
  const a = express();
  a.use(express.json());
  registerPasskeyLoginRoutes(a, { resolveIdentity: async () => identity as never });
  return a;
}

describe("passkey routes with the flag off", () => {
  beforeEach(() => { delete process.env.PASSKEY_SIGNIN_ENABLED; Object.values(mocks).forEach(m => m.mockReset()); });
  it.each([
    "/api/auth/passkey/register/options",
    "/api/auth/passkey/register/verify",
    "/api/auth/passkey/login/options",
    "/api/auth/passkey/login/verify",
  ])("POST %s -> 404, nothing written", async (path) => {
    const res = await request(app()).post(path).send({});
    expect(res.status).toBe(404);
    expect(mocks.savePasskeyChallenge).not.toHaveBeenCalled();
    expect(mocks.insertPasskeyCredential).not.toHaveBeenCalled();
  });
});

describe("passkey routes with the flag on (test env)", () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset());
    process.env.PASSKEY_SIGNIN_ENABLED = "true";
    mocks.listPasskeyCredentials.mockResolvedValue([]);
    mocks.generateRegistrationOptions.mockResolvedValue({ challenge: "reg-challenge", rp: { name: "skipwait.me" } });
    mocks.generateAuthenticationOptions.mockResolvedValue({ challenge: "login-challenge" });
    mocks.createSessionToken.mockResolvedValue("signed-session");
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
  it("register/options excludes already-registered credentials and stores the challenge server-side", async () => {
    mocks.listPasskeyCredentials.mockResolvedValue([{ credentialId: "cred-1", transports: ["internal"] }]);
    const res = await request(app()).post("/api/auth/passkey/register/options").send({});
    expect(res.status).toBe(200);
    expect(mocks.generateRegistrationOptions).toHaveBeenCalledWith(expect.objectContaining({
      rpID: "skipwait.me",
      excludeCredentials: [{ id: "cred-1", transports: ["internal"] }],
    }));
    expect(mocks.savePasskeyChallenge).toHaveBeenCalledWith("user_seeker1", "reg-challenge", "registration", expect.any(Date));
    const expiry = mocks.savePasskeyChallenge.mock.calls[0][3] as Date;
    expect(expiry.getTime()).toBeGreaterThan(Date.now());
  });
  it("register/verify rejects when the challenge was already consumed or never existed (single-use)", async () => {
    mocks.consumePasskeyChallenge.mockResolvedValue(null);
    const res = await request(app()).post("/api/auth/passkey/register/verify").send({ id: "x" });
    expect(res.status).toBe(400);
    expect(mocks.verifyRegistrationResponse).not.toHaveBeenCalled();
    expect(mocks.insertPasskeyCredential).not.toHaveBeenCalled();
  });
  it("register/verify binds origin + RP ID and stores the credential under the session account only", async () => {
    mocks.consumePasskeyChallenge.mockResolvedValue("reg-challenge");
    mocks.verifyRegistrationResponse.mockResolvedValue({ verified: true, registrationInfo: { credential: { id: "cred-9", publicKey: new Uint8Array([1, 2, 3]), counter: 0 } } });
    const res = await request(app()).post("/api/auth/passkey/register/verify").send({ id: "cred-9", response: { transports: ["internal"] }, deviceName: "Pixel" });
    expect(res.status).toBe(200);
    expect(mocks.verifyRegistrationResponse).toHaveBeenCalledWith(expect.objectContaining({
      expectedChallenge: "reg-challenge",
      expectedOrigin: "https://skipwait.me",
      expectedRPID: "skipwait.me",
    }));
    expect(mocks.insertPasskeyCredential).toHaveBeenCalledWith(expect.objectContaining({ openId: "user_seeker1", credentialId: "cred-9", counter: 0 }));
  });
  it("login/options asks for discoverable credentials so the browser owns the account choice", async () => {
    const res = await request(app(null)).post("/api/auth/passkey/login/options").send({});
    expect(res.status).toBe(200);
    expect(mocks.generateAuthenticationOptions).toHaveBeenCalledWith(expect.objectContaining({ rpID: "skipwait.me", allowCredentials: [] }));
    expect(mocks.savePasskeyChallenge).toHaveBeenCalledWith(null, "login-challenge", "login", expect.any(Date));
  });
  it("login/verify rejects an unknown credential", async () => {
    mocks.getPasskeyCredentialByCredentialId.mockResolvedValue(null);
    const res = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "nope" });
    expect(res.status).toBe(400);
    expect(mocks.createSessionToken).not.toHaveBeenCalled();
  });
  it("login/verify rejects a referrer-bound credential even if one somehow exists", async () => {
    mocks.getPasskeyCredentialByCredentialId.mockResolvedValue({ id: 5, openId: "workemail_emp@acme.com", credentialId: "c", publicKey: "AAE", counter: 0, transports: null });
    const res = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "c" });
    expect(res.status).toBe(400);
    expect(mocks.verifyAuthenticationResponse).not.toHaveBeenCalled();
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
    const res = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "c" });
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
});

describe("migration 0063 matches the schema it ships", () => {
  it("creates both tables with the credential-unique and lookup indexes", () => {
    const sql = readFileSync(new URL("../../drizzle/0063_passkey_credentials.sql", import.meta.url), "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS `passkeyCredentials`");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS `passkeyChallenges`");
    expect(sql).toContain("UNIQUE INDEX `passkey_credential_id_unique` (`credentialId`)");
    expect(sql).toContain("INDEX `passkey_openid_idx` (`openId`)");
    expect(sql).toContain("`kind` ENUM('registration','login') NOT NULL");
    expect(sql).toContain("`publicKey` text NOT NULL");
    expect(sql).toContain("`counter` bigint NOT NULL DEFAULT 0");
  });
});
