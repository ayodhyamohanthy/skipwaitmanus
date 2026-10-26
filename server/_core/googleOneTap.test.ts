/**
 * Phase C security suite: token verification (aud/iss), Google-verified-email
 * bar, identity linking through the existing canonical-person mechanism,
 * session minted with the RESOLVED account's openId, referrer refusal,
 * suspended refusal, flag gate.
 */
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jwtVerify: vi.fn(),
  resolveLoginIdentity: vi.fn(),
  createSessionToken: vi.fn(),
}));
vi.mock("jose", () => ({ createRemoteJWKSet: () => "jwks", jwtVerify: mocks.jwtVerify }));
vi.mock("../db", () => ({ resolveLoginIdentity: mocks.resolveLoginIdentity }));
vi.mock("./sdk", () => ({ SESSION_ACCESS_TTL_MS: 30 * 24 * 60 * 60_000, sdk: { createSessionToken: mocks.createSessionToken } }));
vi.mock("./cookies", () => ({ getSessionCookieOptions: () => ({ httpOnly: true, sameSite: "lax", secure: false, path: "/" }) }));
import { registerGoogleOneTapRoutes } from "./googleOneTap";

function app() { const a = express(); a.use(express.json()); registerGoogleOneTapRoutes(a); return a; }
const VALID_PAYLOAD = { sub: "goog-123", email: "priya@example.com", email_verified: true, name: "Priya" };

describe("google one tap verify route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach(m => m.mockReset());
    process.env.GOOGLE_ONE_TAP_ENABLED = "true";
    process.env.GOOGLE_ONE_TAP_CLIENT_ID = "test-client.apps.googleusercontent.com";
    mocks.jwtVerify.mockResolvedValue({ payload: VALID_PAYLOAD });
    mocks.resolveLoginIdentity.mockResolvedValue({ id: 3, openId: "user_canonical1", name: "Priya", role: "user", suspended: false });
    mocks.createSessionToken.mockResolvedValue("signed-session");
  });
  afterEach(() => { delete process.env.GOOGLE_ONE_TAP_ENABLED; delete process.env.GOOGLE_ONE_TAP_CLIENT_ID; });

  it("404s while the flag is off", async () => {
    delete process.env.GOOGLE_ONE_TAP_ENABLED;
    const res = await request(app()).post("/api/auth/google-one-tap/verify").send({ credential: "x" });
    expect(res.status).toBe(404);
    expect(mocks.jwtVerify).not.toHaveBeenCalled();
  });
  it("verifies the token against Google JWKS with the configured audience and issuers", async () => {
    await request(app()).post("/api/auth/google-one-tap/verify").send({ credential: "tok" });
    expect(mocks.jwtVerify).toHaveBeenCalledWith("tok", "jwks", {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: "test-client.apps.googleusercontent.com",
    });
  });
  it("rejects when the token fails verification", async () => {
    mocks.jwtVerify.mockRejectedValue(new Error("bad signature"));
    const res = await request(app()).post("/api/auth/google-one-tap/verify").send({ credential: "tok" });
    expect(res.status).toBe(400);
    expect(mocks.resolveLoginIdentity).not.toHaveBeenCalled();
  });
  it("rejects a token whose email Google has not verified", async () => {
    mocks.jwtVerify.mockResolvedValue({ payload: { ...VALID_PAYLOAD, email_verified: false } });
    const res = await request(app()).post("/api/auth/google-one-tap/verify").send({ credential: "tok" });
    expect(res.status).toBe(400);
    expect(mocks.resolveLoginIdentity).not.toHaveBeenCalled();
  });
  it("links identity via the canonical-person mechanism with the Google-verified email", async () => {
    await request(app()).post("/api/auth/google-one-tap/verify").send({ credential: "tok" });
    expect(mocks.resolveLoginIdentity).toHaveBeenCalledWith(expect.objectContaining({
      provider: "google_one_tap", subject: "goog-123", email: "priya@example.com", emailVerified: true, loginMethod: "google_one_tap",
    }));
  });
  it("mints the session with the RESOLVED account openId and sets the same cookie as OTP", async () => {
    const res = await request(app()).post("/api/auth/google-one-tap/verify").send({ credential: "tok" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ signedIn: true, email: "priya@example.com" });
    expect(mocks.createSessionToken).toHaveBeenCalledWith("user_canonical1", expect.anything());
    expect(res.headers["set-cookie"]?.join(";")).toContain("app_session_id=signed-session");
  });
  it("never signs in a work-email (referrer) account through the chooser", async () => {
    mocks.resolveLoginIdentity.mockResolvedValue({ id: 9, openId: "workemail_emp@acme.com", name: "Emp", role: "user", suspended: false });
    const res = await request(app()).post("/api/auth/google-one-tap/verify").send({ credential: "tok" });
    expect(res.status).toBe(403);
    expect(mocks.createSessionToken).not.toHaveBeenCalled();
  });
  it("refuses suspended identities and identity-review cases without a session", async () => {
    mocks.resolveLoginIdentity.mockRejectedValue(new Error("ACCOUNT_NOT_ACTIVE"));
    const res = await request(app()).post("/api/auth/google-one-tap/verify").send({ credential: "tok" });
    expect(res.status).toBe(403);
    expect(mocks.createSessionToken).not.toHaveBeenCalled();
  });
  it("503s when the client id is not configured", async () => {
    delete process.env.GOOGLE_ONE_TAP_CLIENT_ID;
    const res = await request(app()).post("/api/auth/google-one-tap/verify").send({ credential: "tok" });
    expect(res.status).toBe(503);
  });
});
