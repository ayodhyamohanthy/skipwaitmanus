import express from "express";
import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

const mocks = vi.hoisted(() => ({
  jwks: vi.fn(),
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(), resolveLoginIdentity: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("jose", async importOriginal => ({ ...await importOriginal<typeof import("jose")>(), createRemoteJWKSet: mocks.jwks }));
vi.mock("../db", () => ({ getUserByOpenId: mocks.getUserByOpenId, upsertUser: mocks.upsertUser, resolveLoginIdentity: mocks.resolveLoginIdentity }));
vi.mock("@workos-inc/node", () => ({ WorkOS: class { userManagement = { getUser: mocks.getUser }; } }));
import { resolveWorkosIdentity } from "./workosAuth";

let keys: Awaited<ReturnType<typeof generateKeyPair>>;
const account = { id: 1, openId: "workos_user_test", name: "Test User", email: "test@example.com", loginMethod: "workos", suspended: false, createdAt: new Date(0), sessionsValidAfter: new Date(0) };
const providerUser = { id: "user_test", email: "test@example.com", emailVerified: true, firstName: "Test", lastName: "User" };
const app = express();
app.get("/private", async (req, res) => {
  const identity = await resolveWorkosIdentity(req);
  if (!identity) return res.sendStatus(401);
  res.json({ id: identity.account.id, email: identity.primaryEmail });
});

async function signIn() {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ client_id: "client_test", sid: "session_test" })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer("https://api.workos.com")
    .setSubject("user_test")
    .setJti("test-session")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(keys.privateKey);
}

beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  const jwk = await exportJWK(keys.publicKey);
  mocks.jwks.mockReturnValue(createLocalJWKSet({ keys: [{ ...jwk, kid: "test", alg: "RS256" }] }));
});
beforeEach(() => {
  vi.stubEnv("WORKOS_CLIENT_ID", "client_test");
  vi.stubEnv("WORKOS_API_KEY", "test-key");
  mocks.getUserByOpenId.mockReset().mockResolvedValue({ ...account });
  mocks.upsertUser.mockReset().mockResolvedValue(undefined); mocks.resolveLoginIdentity.mockReset().mockImplementation(async () => mocks.getUserByOpenId());
  mocks.getUser.mockReset().mockResolvedValue(providerUser);
});
afterEach(() => vi.unstubAllEnvs());

describe("WorkOS bearer authentication at the HTTP boundary", () => {
  it("rejects the same signed access token after account sessions are revoked", async () => {
    const token = await signIn();
    expect((await request(app).get("/private").auth(token, { type: "bearer" })).status).toBe(200);
    mocks.getUserByOpenId.mockResolvedValue({ ...account, sessionsValidAfter: new Date(Date.now() + 1000) });
    expect((await request(app).get("/private").auth(token, { type: "bearer" })).status).toBe(401);
  });

  it("resolves the provider profile when the documented access token has no email claims", async () => {
    const response = await request(app).get("/private").auth(await signIn(), { type: "bearer" });
    expect(response.status).toBe(200);
    expect(response.body.email).toMatchObject({ emailAddress: "test@example.com", verification: { status: "verified" } });
    expect(mocks.resolveLoginIdentity).toHaveBeenCalledWith(expect.objectContaining({ provider: "workos", subject: "user_test", name: "Test User", email: "test@example.com", emailVerified: true }));
  });

  it("does not mistake the first account creation timestamp for a revocation", async () => {
    const token = await signIn();
    const createdAt = new Date(Date.now() + 1000);
    mocks.getUserByOpenId.mockResolvedValueOnce(undefined).mockResolvedValue({ ...account, createdAt, sessionsValidAfter: createdAt });
    expect((await request(app).get("/private").auth(token, { type: "bearer" })).status).toBe(200);
  });

  it("rechecks revocation after the provider lookup", async () => {
    mocks.getUserByOpenId.mockResolvedValueOnce(account).mockResolvedValue({ ...account, sessionsValidAfter: new Date(Date.now() + 1000) });
    expect((await request(app).get("/private").auth(await signIn(), { type: "bearer" })).status).toBe(401);
  });

  it("preserves the provider's unverified email status", async () => {
    mocks.getUser.mockResolvedValue({ ...providerUser, emailVerified: false });
    const response = await request(app).get("/private").auth(await signIn(), { type: "bearer" });
    expect(response.status).toBe(200);
    expect(response.body.email.verification.status).toBe("unverified");
  });

  it("rejects suspended accounts before provider access", async () => {
    mocks.getUserByOpenId.mockResolvedValue({ ...account, suspended: true });
    expect((await request(app).get("/private").auth(await signIn(), { type: "bearer" })).status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("rejects a mismatched provider identity without updating the account", async () => {
    mocks.getUser.mockResolvedValue({ ...providerUser, id: "user_other" });
    expect((await request(app).get("/private").auth(await signIn(), { type: "bearer" })).status).toBe(401);
    expect(mocks.resolveLoginIdentity).not.toHaveBeenCalled();
  });
});
