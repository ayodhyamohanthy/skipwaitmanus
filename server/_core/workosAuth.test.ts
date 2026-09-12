import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const authUrl = vi.fn();
const authenticateWithCode = vi.fn();
const registrarFactory = vi.hoisted(() => ({
  registrar: undefined as unknown as (app: import("express").Express) => void,
}));

vi.mock("@workos-inc/node", () => {
  return {
    WorkOS: class {
      userManagement = {
        getAuthorizationUrl: (options: { screenHint?: string; loginHint?: string; redirectUri: string }) => {
          authUrl(options);
          return `https://api.workos.com/user_management/authorize?screen=${options.screenHint ?? ""}&login=${options.loginHint ?? ""}&redirect=${encodeURIComponent(options.redirectUri)}`;
        },
        authenticateWithCode: (options: { code: string }) => authenticateWithCode(options),
      };
    },
  };
});

async function buildApp(env: Record<string, string | undefined>) {
  vi.resetModules();
  const previous = Object.entries(env).map(([key, value]) => [key, process.env[key]] as const);
  Object.entries(env).forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  const { createWorkosAuthRoutesRegistrar } = await import("./workosAuth");
  const app = express();
  registrarFactory.registrar = createWorkosAuthRoutesRegistrar({ workos: undefined });
  registrarFactory.registrar(app);
  return { app, restore: () => previous.forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; }) };
}

const baseEnv = {
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_API_KEY: "sk_test_key",
  WORKOS_COOKIE_PASSWORD: "c".repeat(32),
  SKIPWAIT_ADMIN_EMAIL: undefined,
  JWT_SECRET: "test-secret-that-is-long-enough-for-hs256",
  VITE_APP_ID: "skipwait",
};

/** Pull `skipwait_oauth_state=<nonce>` out of a Set-Cookie header list. */
function stateNonceFrom(response: request.Response): string | undefined {
  const cookies = (response.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
  const match = cookies.map(cookie => /skipwait_oauth_state=([^;]+)/.exec(cookie)).find(Boolean);
  return match?.[1];
}

function stateFromLastAuthorizationCall(): string {
  const call = authUrl.mock.calls.at(-1)?.[0] as { state?: string } | undefined;
  return call?.state ?? "";
}

describe("role-aware WorkOS sign-in entries", () => {
  afterEach(() => { vi.restoreAllMocks(); authUrl.mockClear(); authenticateWithCode.mockClear(); });

  it("sends the administrator gate to AuthKit with the admin state marker and login hint for the durable admin only", { timeout: 20000 }, async () => {
    const { app, restore } = await buildApp({ ...baseEnv });
    const allowed = await request(app).get("/api/auth/workos/admin?email=ayodhya@skipwait.me");
    expect(allowed.status).toBe(302);
    // The state now carries a per-flow nonce, so match the shape not the literal.
    expect(authUrl).toHaveBeenCalledWith(expect.objectContaining({ loginHint: "ayodhya@skipwait.me", screenHint: "sign-in", state: expect.stringMatching(/^skipwait-admin\.[0-9a-f]{32}$/) }));
    const denied = await request(app).get("/api/auth/workos/admin?email=someone@gmail.com");
    expect(denied.status).toBe(403);
    const deniedNoEmail = await request(app).get("/api/auth/workos/admin");
    expect(deniedNoEmail.status).toBe(403);
    expect(authUrl).toHaveBeenCalledTimes(1);
    restore();
  });

  it("keeps general sign-in and sign-up open without a login hint", { timeout: 20000 }, async () => {
    const { app, restore } = await buildApp({ ...baseEnv });
    const signIn = await request(app).get("/api/auth/workos/sign-in");
    expect(signIn.status).toBe(302);
    const signInCall = authUrl.mock.calls.at(-1)?.[0] as { screenHint?: string; loginHint?: string };
    expect(signInCall.screenHint).toBe("sign-in");
    expect(signInCall.loginHint).toBeUndefined();
    const signUp = await request(app).get("/api/auth/workos/sign-up");
    expect(signUp.status).toBe(302);
    expect(authUrl).toHaveBeenLastCalledWith(expect.objectContaining({ screenHint: "sign-up" }));
    restore();
  });
});

describe("OAuth state nonce binding", () => {
  afterEach(() => { vi.restoreAllMocks(); authUrl.mockClear(); authenticateWithCode.mockClear(); });

  it("sets an httpOnly nonce cookie that matches the state sent to the provider", { timeout: 20000 }, async () => {
    const { app, restore } = await buildApp({ ...baseEnv });
    const started = await request(app).get("/api/auth/workos/sign-in");
    const nonce = stateNonceFrom(started);
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(stateFromLastAuthorizationCall()).toBe(`skipwait-auth.${nonce}`);
    const cookies = (started.headers["set-cookie"] as unknown as string[]) ?? [];
    expect(cookies.some(cookie => /skipwait_oauth_state=.*HttpOnly/i.test(cookie))).toBe(true);
    restore();
  });

  it("rejects a callback whose state does not match the initiating browser's nonce", { timeout: 20000 }, async () => {
    const { app, restore } = await buildApp({ ...baseEnv });
    // Simulates the login-CSRF attack: the attacker's own state, presented in a
    // browser that never started that flow.
    const response = await request(app).get("/api/auth/workos/callback?code=attacker_code&state=skipwait-auth." + "a".repeat(32));
    expect(response.status).toBe(400);
    // Crucially, the code is never exchanged, so no session is ever issued.
    expect(authenticateWithCode).not.toHaveBeenCalled();
    restore();
  });

  it("rejects a callback with no state at all or a malformed one", { timeout: 20000 }, async () => {
    const { app, restore } = await buildApp({ ...baseEnv });
    expect((await request(app).get("/api/auth/workos/callback?code=x")).status).toBe(400);
    expect((await request(app).get("/api/auth/workos/callback?code=x&state=skipwait-auth")).status).toBe(400);
    expect((await request(app).get("/api/auth/workos/callback?code=x&state=skipwait-auth.nothex")).status).toBe(400);
    expect(authenticateWithCode).not.toHaveBeenCalled();
    restore();
  });

  it("accepts a callback that echoes the nonce it was issued, and consumes the cookie", { timeout: 20000 }, async () => {
    const { app, restore } = await buildApp({ ...baseEnv });
    authenticateWithCode.mockResolvedValue({
      user: { id: "user_123", email: "seeker@example.com", firstName: "Sea", lastName: "Ker" },
      sealedSession: undefined,
    });
    const started = await request(app).get("/api/auth/workos/sign-in");
    const nonce = stateNonceFrom(started);
    const response = await request(app)
      .get(`/api/auth/workos/callback?code=good_code&state=skipwait-auth.${nonce}`)
      .set("Cookie", `skipwait_oauth_state=${nonce}`);
    expect(response.status).toBe(302);
    expect(authenticateWithCode).toHaveBeenCalledWith(expect.objectContaining({ code: "good_code" }));
    // Nonce is single-use: the cookie is cleared on the way through.
    const cookies = (response.headers["set-cookie"] as unknown as string[]) ?? [];
    expect(cookies.some(cookie => /skipwait_oauth_state=;/.test(cookie))).toBe(true);
    restore();
  });

  it("will not let a replayed callback reuse a consumed nonce", { timeout: 20000 }, async () => {
    const { app, restore } = await buildApp({ ...baseEnv });
    authenticateWithCode.mockResolvedValue({
      user: { id: "user_123", email: "seeker@example.com", firstName: "Sea", lastName: "Ker" },
      sealedSession: undefined,
    });
    const started = await request(app).get("/api/auth/workos/sign-in");
    const nonce = stateNonceFrom(started);
    const first = await request(app)
      .get(`/api/auth/workos/callback?code=good_code&state=skipwait-auth.${nonce}`)
      .set("Cookie", `skipwait_oauth_state=${nonce}`);
    expect(first.status).toBe(302);
    // The browser no longer holds the nonce, so a replay cannot pass the check.
    const replay = await request(app).get(`/api/auth/workos/callback?code=good_code&state=skipwait-auth.${nonce}`);
    expect(replay.status).toBe(400);
    expect(authenticateWithCode).toHaveBeenCalledTimes(1);
    restore();
  });

  it("still refuses an administrator-domain mismatch on a nonce-valid admin flow", { timeout: 20000 }, async () => {
    const { app, restore } = await buildApp({ ...baseEnv });
    authenticateWithCode.mockResolvedValue({
      user: { id: "user_456", email: "someone@notskipwait.example", firstName: "S", lastName: "N" },
      sealedSession: undefined,
    });
    const started = await request(app).get("/api/auth/workos/admin?email=ayodhya@skipwait.me");
    const nonce = stateNonceFrom(started);
    const response = await request(app)
      .get(`/api/auth/workos/callback?code=good_code&state=skipwait-admin.${nonce}`)
      .set("Cookie", `skipwait_oauth_state=${nonce}`);
    expect(response.status).toBe(403);
    restore();
  });
});
