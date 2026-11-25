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
import { createInMemoryDrizzle } from "../inMemoryDrizzle.testkit";
import { passkeyChallenges, passkeyCredentials } from "../../drizzle/schema";

const mocks = vi.hoisted(() => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
  listPasskeyCredentials: vi.fn(),
  savePasskeyChallenge: vi.fn(),
  consumePasskeyChallenge: vi.fn(),
  readPasskeyLoginChallenge: vi.fn(),
  commitPasskeyChallenge: vi.fn(),
  insertPasskeyCredential: vi.fn(),
  deletePasskeyCredential: vi.fn(),
  getPasskeyCredentialByCredentialId: vi.fn(),
  bumpPasskeyCounter: vi.fn(),
  getUserByOpenId: vi.fn(),
  getVerifiedWorkEmailAccess: vi.fn(),
  createSessionToken: vi.fn(),
  captureException: vi.fn(),
  getDb: vi.fn(),
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
  readPasskeyLoginChallenge: mocks.readPasskeyLoginChallenge,
  commitPasskeyChallenge: mocks.commitPasskeyChallenge,
  insertPasskeyCredential: mocks.insertPasskeyCredential,
  deletePasskeyCredential: mocks.deletePasskeyCredential,
  getPasskeyCredentialByCredentialId: mocks.getPasskeyCredentialByCredentialId,
  bumpPasskeyCounter: mocks.bumpPasskeyCounter,
}));
vi.mock("../db", () => ({
  getDb: mocks.getDb,
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
import { checkPasskeyRateLimit, passkeyRateLimitEntriesForTests, registerPasskeyLoginRoutes, resetPasskeyRateLimits } from "./passkeyLogin";

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
  it("reports disabled availability without touching identity or storage", async () => {
    const res = await request(app()).get("/api/auth/passkey/availability");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(mocks.getUserByOpenId).not.toHaveBeenCalled();
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
    mocks.deletePasskeyCredential.mockResolvedValue(true);
  });
  afterEach(() => { delete process.env.PASSKEY_SIGNIN_ENABLED; });

  it("reports enabled availability", async () => {
    expect((await request(app(null)).get("/api/auth/passkey/availability")).body).toEqual({ enabled: true });
  });

  it.each([undefined, null, "", "bad", 0, -1, 1.5, {}, []])("refuses invalid login ceremony %j before consuming a challenge", async ceremonyId => {
    mocks.getPasskeyCredentialByCredentialId.mockResolvedValue({ openId: "user_seeker1" });
    mocks.consumePasskeyChallenge.mockResolvedValue("must-not-consume");
    mocks.readPasskeyLoginChallenge.mockResolvedValue({ id: 101, challenge: "must-not-read" });
    const res = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "c", ceremonyId });
    expect(res.status).toBe(400);
    expect(mocks.consumePasskeyChallenge).not.toHaveBeenCalled();
    expect(mocks.verifyAuthenticationResponse).not.toHaveBeenCalled();
  });

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
    mocks.readPasskeyLoginChallenge.mockResolvedValue({ id: 101, challenge: "login-challenge" });
    mocks.commitPasskeyChallenge.mockResolvedValue(true);
    mocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 1 } });
    mocks.getUserByOpenId.mockResolvedValue({ id: 11, openId: "workemail_emp@acme.com", name: "Emp", role: "referrer", suspended: false });
    const res = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "c", ceremonyId: 101 });
    expect(res.status).toBe(400);
    expect(mocks.createSessionToken).not.toHaveBeenCalled();
  });

  it("login/verify rejects an account with verified work-email access", async () => {
    mocks.getPasskeyCredentialByCredentialId.mockResolvedValue({ id: 5, openId: "user_seeker1", credentialId: "c", publicKey: "AAE", counter: 0, transports: null });
    mocks.readPasskeyLoginChallenge.mockResolvedValue({ id: 101, challenge: "login-challenge" });
    mocks.commitPasskeyChallenge.mockResolvedValue(true);
    mocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 1 } });
    mocks.getUserByOpenId.mockResolvedValue({ id: 42, openId: "user_seeker1", name: "User", role: "user", suspended: false });
    mocks.getVerifiedWorkEmailAccess.mockResolvedValue({ workEmailDomain: "acme.com" });
    const res = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "c" });
    expect(res.status).toBe(400);
    expect(mocks.createSessionToken).not.toHaveBeenCalled();
  });

  it("login/verify rejects when the login challenge is consumed or expired", async () => {
    mocks.getPasskeyCredentialByCredentialId.mockResolvedValue({ id: 5, openId: "user_seeker1", credentialId: "c", publicKey: "AAE", counter: 0, transports: null });
    mocks.readPasskeyLoginChallenge.mockResolvedValue(null);
    const res = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "c" });
    expect(res.status).toBe(400);
    expect(mocks.verifyAuthenticationResponse).not.toHaveBeenCalled();
  });

  it("login/verify binds origin + RP, bumps the counter, and mints the same app_session_id cookie as OTP", async () => {
    mocks.getPasskeyCredentialByCredentialId.mockResolvedValue({ id: 5, openId: "user_seeker1", credentialId: "c", publicKey: "AAE", counter: 7, transports: null });
    mocks.readPasskeyLoginChallenge.mockResolvedValue({ id: 101, challenge: "login-challenge" });
    mocks.commitPasskeyChallenge.mockResolvedValue(true);
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
    mocks.readPasskeyLoginChallenge.mockResolvedValue({ id: 101, challenge: "login-challenge" });
    mocks.commitPasskeyChallenge.mockResolvedValue(true);
    mocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 1 } });
    mocks.getUserByOpenId.mockResolvedValue({ id: 11, openId: "user_seeker1", name: "Seeker", role: "user", suspended: true });
    const res = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "c", ceremonyId: 101 });
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
    mocks.readPasskeyLoginChallenge.mockImplementation(async (ceremonyId: number) => {
      if (ceremonyId === 101) return { id: 101, challenge: "chal-A" };
      if (ceremonyId === 102) return { id: 102, challenge: "chal-B" };
      return null;
    });
    mocks.commitPasskeyChallenge.mockResolvedValue(true);
    mocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 1 } });

    const verA = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "credA", ceremonyId: 101 });
    expect(verA.status).toBe(200);
    expect(verA.body.signedIn).toBe(true);
    expect(mocks.readPasskeyLoginChallenge).toHaveBeenCalledWith(101);
    expect(mocks.commitPasskeyChallenge).toHaveBeenCalledWith(null, "login", 101, "chal-A");
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
    expect(listRes.headers["cache-control"]).toBe("private, no-store");
    expect(listRes.body.credentials).toEqual([
      expect.objectContaining({ id: "cred-1", deviceName: "MacBook Pro" }),
    ]);

    const revokeRes = await request(app()).post("/api/auth/passkey/revoke").send({ credentialId: "cred-1" });
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body).toEqual({ revoked: true });
    expect(mocks.deletePasskeyCredential).toHaveBeenCalledWith("user_seeker1", "cred-1");
  });

  it("does not report another account's missing credential as revoked", async () => {
    mocks.deletePasskeyCredential.mockResolvedValue(false);
    const res = await request(app()).post("/api/auth/passkey/revoke").send({ credentialId: "other-account" });
    expect(res.status).toBe(404);
    expect(res.body.revoked).toBeUndefined();
  });
  it.each([null, REFERRER])("refuses list and revoke for an unauthenticated or referrer caller %j", async identity => {
    expect((await request(app(identity)).get("/api/auth/passkey/list")).status).toBe(403);
    expect((await request(app(identity)).post("/api/auth/passkey/revoke").send({ credentialId: "owned" })).status).toBe(403);
    expect(mocks.listPasskeyCredentials).not.toHaveBeenCalled();
    expect(mocks.deletePasskeyCredential).not.toHaveBeenCalled();
  });
  it("refuses list and revoke for a personal login with verified work-email access", async () => {
    mocks.getVerifiedWorkEmailAccess.mockResolvedValue({ workEmailDomain: "acme.com" });
    expect((await request(app()).get("/api/auth/passkey/list")).status).toBe(403);
    expect((await request(app()).post("/api/auth/passkey/revoke").send({ credentialId: "owned" })).status).toBe(403);
    expect(mocks.listPasskeyCredentials).not.toHaveBeenCalled();
    expect(mocks.deletePasskeyCredential).not.toHaveBeenCalled();
  });
});

// G1 (PR #697 review 6923438650): the login route is wired to the REAL store on
// the in-memory database, so the test watches the challenge row itself. A
// sign-in attempt that fails verification must not consume anyone's ceremony:
// ceremony ids are sequential, so consuming before verifying let any passkey
// holder cancel other people's sign-ins.
describe("a failed sign-in never cancels another person's ceremony (G1)", () => {
  const memory = createInMemoryDrizzle();
  let actual: typeof import("./passkeyStore");
  const CREDS: Record<string, { id: number; openId: string; credentialId: string; publicKey: string; counter: number; transports: null }> = {
    credA: { id: 1, openId: "user_attacker", credentialId: "credA", publicKey: "AAE", counter: 0, transports: null },
    credB: { id: 2, openId: "user_victim", credentialId: "credB", publicKey: "AAE", counter: 0, transports: null },
  };
  beforeEach(async () => {
    Object.values(mocks).forEach(m => m.mockReset());
    resetPasskeyRateLimits();
    process.env.PASSKEY_SIGNIN_ENABLED = "true";
    actual = await vi.importActual<typeof import("./passkeyStore")>("./passkeyStore");
    mocks.getDb.mockResolvedValue(memory.db);
    memory.reset([[passkeyChallenges, [
      { id: 201, openId: null, kind: "login", challenge: "chal-B", expiresAt: new Date(Date.now() + 60000) },
    ]]]);
    // Every challenge call goes to the real store; credentials and accounts stay mocked.
    mocks.consumePasskeyChallenge.mockImplementation((...args: Parameters<typeof actual.consumePasskeyChallenge>) => actual.consumePasskeyChallenge(...args));
    mocks.readPasskeyLoginChallenge.mockImplementation((...args: Parameters<typeof actual.readPasskeyLoginChallenge>) => actual.readPasskeyLoginChallenge(...args));
    mocks.commitPasskeyChallenge.mockImplementation((...args: Parameters<typeof actual.commitPasskeyChallenge>) => actual.commitPasskeyChallenge(...args));
    mocks.getPasskeyCredentialByCredentialId.mockImplementation(async (id: string) => CREDS[id] ?? null);
    mocks.getUserByOpenId.mockImplementation(async (openId: string) => ({ id: openId === "user_victim" ? 22 : 21, openId, name: openId, role: "user", suspended: false }));
    mocks.getVerifiedWorkEmailAccess.mockResolvedValue(undefined);
    mocks.createSessionToken.mockImplementation(async (openId: string) => `session-${openId}`);
    // Only the victim's own authenticator can sign the victim's challenge.
    mocks.verifyAuthenticationResponse.mockImplementation(async ({ response, expectedChallenge }: { response: { id: string }; expectedChallenge: string }) =>
      response.id === "credB" && expectedChallenge === "chal-B"
        ? { verified: true, authenticationInfo: { newCounter: 1 } }
        : { verified: false, authenticationInfo: { newCounter: 0 } });
  });
  afterEach(() => { delete process.env.PASSKEY_SIGNIN_ENABLED; });

  const loginRows = () => memory.rows(passkeyChallenges).filter(row => (row as { kind: string }).kind === "login");

  it("an attacker's unverifiable assertion against the victim's ceremony leaves it intact, and the victim still signs in", async () => {
    const attack = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "credA", ceremonyId: 201 });
    expect(attack.status).toBe(400);
    expect(attack.headers["set-cookie"]?.join(";") ?? "").not.toContain("app_session_id=");
    expect(loginRows()).toHaveLength(1);

    const genuine = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "credB", ceremonyId: 201 });
    expect(genuine.status).toBe(200);
    expect(genuine.body).toMatchObject({ signedIn: true });
    expect(genuine.headers["set-cookie"]?.join(";")).toContain("app_session_id=session-user_victim");
    expect(loginRows()).toHaveLength(0);
  });

  it("an assertion that makes verification throw also leaves the ceremony intact", async () => {
    mocks.verifyAuthenticationResponse.mockRejectedValueOnce(new Error("malformed assertion"));
    const attack = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "credA", ceremonyId: 201 });
    expect(attack.status).toBeGreaterThanOrEqual(400);
    expect(loginRows()).toHaveLength(1);
    const genuine = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "credB", ceremonyId: 201 });
    expect(genuine.status).toBe(200);
  });

  it("a consumed ceremony cannot be replayed, even with a valid assertion", async () => {
    const first = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "credB", ceremonyId: 201 });
    expect(first.status).toBe(200);
    const replay = await request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "credB", ceremonyId: 201 });
    expect(replay.status).toBe(400);
    expect(replay.headers["set-cookie"]?.join(";") ?? "").not.toContain("app_session_id=");
    expect(mocks.createSessionToken).toHaveBeenCalledTimes(1);
  });

  it("concurrent valid assertions for one ceremony issue exactly one session", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () =>
      request(app(null)).post("/api/auth/passkey/login/verify").send({ id: "credB", ceremonyId: 201 })));
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(results.filter(r => r.status === 400)).toHaveLength(5);
    expect(mocks.createSessionToken).toHaveBeenCalledTimes(1);
    expect(mocks.bumpPasskeyCounter).toHaveBeenCalledTimes(1);
  });
});

describe("real passkey store query contracts", () => {
  const memory = createInMemoryDrizzle();
  let store: typeof import("./passkeyStore");
  beforeEach(async () => {
    store = await vi.importActual<typeof import("./passkeyStore")>("./passkeyStore");
    mocks.getDb.mockResolvedValue(memory.db);
    memory.reset([[passkeyChallenges, [
      { id: 101, openId: null, kind: "login", challenge: "login-A", expiresAt: new Date(Date.now() + 60000) },
      { id: 102, openId: "owner", kind: "registration", challenge: "register-A", expiresAt: new Date(Date.now() + 60000) },
      { id: 103, openId: null, kind: "login", challenge: "expired", expiresAt: new Date(Date.now() - 60000) },
    ]], [passkeyCredentials, [{ id: 1, openId: "owner", credentialId: "owned" }]]]);
  });
  it.each(["login", "registration"] as const)("returns a %s challenge to exactly one concurrent consumer", async kind => {
    const openId = kind === "login" ? null : "owner";
    const id = kind === "login" ? 101 : 102;
    const challenge = kind === "login" ? "login-A" : "register-A";
    const results = await Promise.all(Array.from({ length: 8 }, () => store.consumePasskeyChallenge(openId, kind, id)));
    expect(results.filter(value => value === challenge)).toHaveLength(1);
    expect(results.filter(value => value === null)).toHaveLength(7);
    expect(await store.consumePasskeyChallenge(openId, kind, id)).toBeNull();
  });
  it("binds explicit IDs to account and ceremony kind without consuming mismatches", async () => {
    expect(await store.consumePasskeyChallenge("intruder", "registration", 102)).toBeNull();
    expect(await store.consumePasskeyChallenge(null, "registration", 102)).toBeNull();
    expect(await store.consumePasskeyChallenge("owner", "login", 102)).toBeNull();
    expect(await store.consumePasskeyChallenge("owner", "registration", 102)).toBe("register-A");
  });
  it.each([undefined, null, "", "bad", 0, -1, 1.5])("never falls back to a global login challenge for %j", async id => {
    expect(await store.consumePasskeyChallenge(null, "login", id)).toBeNull();
    expect(await store.consumePasskeyChallenge(null, "login", 101)).toBe("login-A");
  });
  it("rejects expired challenges and permits the authenticated registration lookup", async () => {
    expect(await store.consumePasskeyChallenge(null, "login", 103)).toBeNull();
    expect(await store.consumePasskeyChallenge("owner", "registration")).toBe("register-A");
  });
  it("reads a login ceremony without consuming it, and refuses wrong kinds, owners and expired rows", async () => {
    expect(await store.readPasskeyLoginChallenge(101)).toEqual({ id: 101, challenge: "login-A" });
    expect(await store.readPasskeyLoginChallenge(101)).toEqual({ id: 101, challenge: "login-A" });
    expect(memory.rows(passkeyChallenges).some(row => (row as { id: number }).id === 101)).toBe(true);
    expect(await store.readPasskeyLoginChallenge(102)).toBeNull();
    expect(await store.readPasskeyLoginChallenge(103)).toBeNull();
    expect(await store.readPasskeyLoginChallenge(0)).toBeNull();
    expect(await store.readPasskeyLoginChallenge(1.5)).toBeNull();
  });
  it("commits a ceremony for exactly one of several concurrent callers", async () => {
    const wins = await Promise.all(Array.from({ length: 8 }, () => store.commitPasskeyChallenge(null, "login", 101, "login-A")));
    expect(wins.filter(Boolean)).toHaveLength(1);
    expect(await store.commitPasskeyChallenge(null, "login", 101, "login-A")).toBe(false);
    expect(await store.readPasskeyLoginChallenge(101)).toBeNull();
  });
  it("never commits a row through the wrong owner, kind or challenge", async () => {
    expect(await store.commitPasskeyChallenge("owner", "login", 101, "login-A")).toBe(false);
    expect(await store.commitPasskeyChallenge(null, "registration", 101, "login-A")).toBe(false);
    expect(await store.commitPasskeyChallenge(null, "login", 101, "other")).toBe(false);
    expect(await store.readPasskeyLoginChallenge(101)).toEqual({ id: 101, challenge: "login-A" });
  });
  it("revokes only credentials owned by the current account and reports actual removal", async () => {
    expect(await store.deletePasskeyCredential("intruder", "owned")).toBe(false);
    expect(memory.rows(passkeyCredentials)).toHaveLength(1);
    expect(await store.deletePasskeyCredential("owner", "owned")).toBe(true);
    expect(await store.deletePasskeyCredential("owner", "owned")).toBe(false);
  });
});

describe("passkey rate-limit memory stays bounded", () => {
  beforeEach(() => resetPasskeyRateLimits());
  it("drops ended windows once the map is large, and keeps live ones", () => {
    const start = 1_000_000;
    for (let i = 0; i < 10_000; i++) checkPasskeyRateLimit(`198.51.100.${i}`, start);
    expect(passkeyRateLimitEntriesForTests()).toBe(10_000);
    expect(checkPasskeyRateLimit("203.0.113.1", start + 61_000)).toBe(true);
    expect(passkeyRateLimitEntriesForTests()).toBe(1);
  });
  it("still limits an address whose window is live", () => {
    for (let i = 0; i < 10; i++) expect(checkPasskeyRateLimit("203.0.113.9", 5_000)).toBe(true);
    expect(checkPasskeyRateLimit("203.0.113.9", 5_001)).toBe(false);
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
