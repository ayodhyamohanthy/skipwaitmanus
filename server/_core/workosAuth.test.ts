import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const authUrl = vi.fn();
const authenticate = vi.fn(async () => ({ user: { id: "user_test", email: "test@example.com", firstName: "Test", lastName: "User" } }));
const account = { id: 1, openId: "workos_user_test", name: "Test User", email: "test@example.com", loginMethod: "workos", role: "user", suspended: false, sessionsValidAfter: new Date(0), createdAt: new Date(0), updatedAt: new Date(0), lastSignedIn: new Date(0) };
vi.mock("../db", () => ({ upsertUser: vi.fn(), getDb: vi.fn(async () => ({})), getUserByOpenId: vi.fn(async (openId: string) => openId === account.openId ? account : undefined) }));
const registrarFactory = vi.hoisted(() => ({
  registrar: undefined as unknown as (app: import("express").Express) => void,
}));

vi.mock("@workos-inc/node", () => {
  return {
    WorkOS: class {
      userManagement = {
        authenticateWithCode: authenticate,
        getAuthorizationUrl: (options: { screenHint?: string; loginHint?: string; redirectUri: string }) => {
          authUrl(options);
          return `https://api.workos.com/user_management/authorize?screen=${options.screenHint ?? ""}&login=${options.loginHint ?? ""}&redirect=${encodeURIComponent(options.redirectUri)}`;
        },
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
  app.get("/session-proof", async (req, res) => {
    const { resolveWorkosIdentity } = await import("./workosAuth");
    const identity = await resolveWorkosIdentity(req);
    return identity ? res.json({ openId: identity.account.openId }) : res.status(401).json({ error: "Unauthorized" });
  });
  return { app, restore: () => previous.forEach(([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; }) };
}

const baseEnv = {
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_API_KEY: "sk_test_key",
  WORKOS_COOKIE_PASSWORD: "c".repeat(32),
  JWT_SECRET: "test-secret-at-least-32-characters-long",
  VITE_APP_ID: "skipwait",
  SKIPWAIT_ADMIN_EMAIL: "ayodhyamohanthy@gmail.com",
  ENABLE_ADMIN_BOOTSTRAP: undefined,
  WORKOS_REDIRECT_URI: "https://skipwait.me/api/auth/workos/callback",
  WORKOS_POST_SIGNIN_PATH: undefined,
};

describe("role-aware WorkOS sign-in entries", () => {
  afterEach(() => { vi.restoreAllMocks(); authUrl.mockClear(); });

  it("sends the administrator gate to AuthKit with the admin state marker and login hint for the durable admin only", { timeout: 20000 }, async () => {
    const { app, restore } = await buildApp({ ...baseEnv });
    const allowed = await request(app).get("/api/auth/workos/admin?email=ayodhyamohanthy@gmail.com");
    expect(allowed.status).toBe(302);
    expect(authUrl).toHaveBeenCalledWith(expect.objectContaining({ loginHint: "ayodhyamohanthy@gmail.com", screenHint: "sign-in", state: "skipwait-admin" }));
    const denied = await request(app).get("/api/auth/workos/admin?email=someone@gmail.com");
    expect(denied.status).toBe(403);
    const deniedNoEmail = await request(app).get("/api/auth/workos/admin");
    expect(deniedNoEmail.status).toBe(403);
    const wrongLocalPart = await request(app).get("/api/auth/workos/admin?email=someone@skipwait.me");
    expect(wrongLocalPart.status).toBe(403);
    expect(authUrl).toHaveBeenCalledTimes(1);
    restore();
  });


  it("uses sign-in while the one-time bootstrap flag is explicitly enabled", { timeout: 20000 }, async () => {
    const { app, restore } = await buildApp({ ...baseEnv, ENABLE_ADMIN_BOOTSTRAP: "true" });
    expect((await request(app).get("/api/auth/workos/admin?email=ayodhyamohanthy@gmail.com")).status).toBe(302);
    expect(authUrl).toHaveBeenLastCalledWith(expect.objectContaining({ screenHint: "sign-in", state: "skipwait-admin-bootstrap", loginHint: "ayodhyamohanthy@gmail.com" }));
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

describe("state-bound authentication return", () => {
  afterEach(() => { vi.useRealTimers(); authenticate.mockClear(); });

  it.each(["/premium?role=referrer&quantity=7&currency=INR", "/plans?role=job_seeker&plan=max&currency=USD", "https://skipwait.me/premium?role=job_seeker"]) ("restores %s after provider authentication, including an existing session", async returnTo => {
    const { app, restore } = await buildApp(baseEnv);
    try {
      const agent = request.agent(app);
      const entry = await agent.get("/api/auth/workos/sign-in").set("Cookie", "app_session_id=existing-session").query({ returnTo });
      const state = authUrl.mock.calls.at(-1)![0].state;
      expect(entry.headers["set-cookie"][0]).toContain("HttpOnly");
      expect(entry.headers["set-cookie"][0]).toContain("SameSite=Lax");
      expect(state).not.toBe("skipwait-auth");
      const callback = await agent.get("/api/auth/workos/callback").set("X-Forwarded-Proto", "https").query({ code: "provider-code", state, returnTo: "/" });
      expect(callback.status).toBe(302);
      expect(callback.headers.location).toBe(returnTo.replace("https://skipwait.me", ""));
      const sessionCookie = callback.headers["set-cookie"].find((value: string) => value.startsWith("app_session_id="));
      expect(sessionCookie).toContain("Path=/");
      expect(sessionCookie).toContain("HttpOnly");
      expect(sessionCookie).toContain("Secure");
      expect(sessionCookie).toContain("SameSite=Lax");
      const authenticated = await request(app).get("/session-proof").set("Cookie", sessionCookie!.split(";")[0]);
      expect(authenticated.status).toBe(200);
      expect(authenticated.body).toMatchObject({ openId: "workos_user_test" });
      expect((await agent.get("/api/auth/workos/callback").query({ code: "provider-code", state })).status).toBe(400);
    } finally { restore(); }
  });

  it.each(["https://other.example/premium", "//other.example", "/\\\\other.example", "/api/auth/workos/sign-in", "/..//other.example"]) ("does not redirect outside the app for %s", async returnTo => {
    const { app, restore } = await buildApp(baseEnv);
    try {
      const agent = request.agent(app);
      await agent.get("/api/auth/workos/sign-up").query({ returnTo });
      const state = authUrl.mock.calls.at(-1)![0].state;
      const callback = await agent.get("/api/auth/workos/callback").query({ code: "provider-code", state });
      expect(callback.status).toBe(302);
      expect(callback.headers.location).toBe("/");
    } finally { restore(); }
  });

  it.each(["missing", "mismatched", "tampered", "expired", "raw-return"]) ("rejects %s state binding before contacting the provider", async failure => {
    const { app, restore } = await buildApp(baseEnv);
    try {
      const entry = await request(app).get("/api/auth/workos/sign-in").query({ returnTo: "/premium?role=referrer" });
      let state = authUrl.mock.calls.at(-1)![0].state;
      let cookie = entry.headers["set-cookie"][0].split(";")[0];
      if (failure === "mismatched") state = "wrong-state";
      if (failure === "raw-return") state = "return=%2Fpremium";
      if (failure === "tampered") cookie += "x";
      if (failure === "expired") { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() + 11 * 60_000); }
      const callback = await request(app).get("/api/auth/workos/callback").set("Cookie", failure === "missing" ? "" : cookie).query({ code: "provider-code", state });
      expect(callback.status).toBe(400);
      expect(authenticate).not.toHaveBeenCalled();
    } finally { restore(); }
  });

  it("retains the admin destination and exact-email check", async () => {
    const { app, restore } = await buildApp(baseEnv);
    try {
      authenticate.mockResolvedValueOnce({ user: { id: "user_admin", email: baseEnv.SKIPWAIT_ADMIN_EMAIL, firstName: "Admin", lastName: "User" } });
      const allowed = await request(app).get("/api/auth/workos/callback").query({ code: "provider-code", state: "skipwait-admin", returnTo: "/premium" });
      expect(allowed.headers.location).toBe("/admin/users");
      expect((await request(app).get("/api/auth/workos/callback").query({ code: "provider-code", state: "skipwait-admin" })).status).toBe(403);
    } finally { restore(); }
  });
});

describe("administrator callback equality",()=>{
 it("accepts only the provider-returned exact configured address",async()=>{const {adminCallbackAllowed}=await import("./workosAuth");expect(adminCallbackAllowed({email:"ayodhya@skipwait.me",state:"skipwait-admin",configuredEmail:"ayodhya@skipwait.me"})).toBe(true);expect(adminCallbackAllowed({email:"someone@skipwait.me",state:"skipwait-admin",configuredEmail:"ayodhya@skipwait.me"})).toBe(false);expect(adminCallbackAllowed({email:"ayodhya@gmail.com",state:"skipwait-admin",configuredEmail:"ayodhya@skipwait.me"})).toBe(false)});
 it("rejects a stale bootstrap callback after the flag is removed",async()=>{const {adminCallbackAllowed}=await import("./workosAuth");expect(adminCallbackAllowed({email:"ayodhya@skipwait.me",state:"skipwait-admin-bootstrap",configuredEmail:"ayodhya@skipwait.me",bootstrapEnabled:false})).toBe(false);expect(adminCallbackAllowed({email:"ayodhya@skipwait.me",state:"skipwait-admin-bootstrap",configuredEmail:"ayodhya@skipwait.me",bootstrapEnabled:true})).toBe(true)});
});
