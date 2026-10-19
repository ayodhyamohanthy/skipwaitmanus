import express from "express";
import request from "supertest";
import { SignJWT, decodeJwt } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HOSTED_LINK_COOKIE } from "./hostedAccountSwitch";

const authUrl = vi.fn();
const authenticate = vi.fn(async () => ({ user: { id: "user_test", email: "test@example.com", firstName: "Test", lastName: "User" } }));
const account = { id: 1, openId: "workos_user_test", name: "Test User", email: "test@example.com", loginMethod: "workos", role: "user", suspended: false, sessionsValidAfter: new Date(0), createdAt: new Date(0), updatedAt: new Date(0), lastSignedIn: new Date(0) };
const accounts = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const resolveLoginIdentity = vi.hoisted(() => vi.fn());
const hosted = vi.hoisted(() => ({ list: vi.fn(async () => ({ data: [{ id: "session_live", status: "active" }] })), revoke: vi.fn(async () => {}) }));
vi.mock("../db", () => ({
  upsertUser: vi.fn(),
  getDb: vi.fn(async () => ({})),
  getUserByOpenId: vi.fn(async (openId: string) => openId === account.openId ? account : accounts.get(openId)),
  revokeUserSessions: vi.fn(async (openId: string) => { const row = openId === account.openId ? account : accounts.get(openId); if (row) row.sessionsValidAfter = new Date(Date.now() + 1000); }),
  resolveLoginIdentity,
  listWorkosSubjectsForUser: vi.fn(async (userId: number) => userId === 1 ? ["user_test"] : []),
}));
function defaultResolve(input: { openId: string; name: string; email: string }) {
  if (input.openId === account.openId) return account;
  const row = accounts.get(input.openId) ?? { ...account, id: accounts.size + 2, openId: input.openId, name: input.name, email: input.email };
  accounts.set(input.openId, row);
  return row;
}
resolveLoginIdentity.mockImplementation(async (input: { openId: string; name: string; email: string }) => defaultResolve(input));
const registrarFactory = vi.hoisted(() => ({
  registrar: undefined as unknown as (app: import("express").Express) => void,
}));

vi.mock("@workos-inc/node", () => {
  return {
    WorkOS: class {
      userManagement = {
        authenticateWithCode: authenticate,
        listSessions: hosted.list,
        revokeSession: hosted.revoke,
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

  it("a provider-less or unknown-provider start never reaches hosted AuthKit (D-030, D-049)", { timeout: 20000 }, async () => {
    const { app, restore } = await buildApp({ ...baseEnv });
    try {
      for (const route of ["sign-in", "sign-up"]) {
        for (const provider of [undefined, "AppleOAuth", "apple", "authkit", "constructor", "__proto__", "toString"]) {
          authUrl.mockClear();
          const response = await request(app).get(`/api/auth/workos/${route}`).query(provider === undefined ? { returnTo: "/plans" } : { returnTo: "/plans", provider });
          expect(response.status, `${route} provider=${String(provider)}`).toBe(302);
          expect(response.headers.location).toBe("/sign-in?returnTo=%2Fplans");
          expect(response.headers["cache-control"]).toBe("no-store");
          expect(response.headers["set-cookie"]).toBeUndefined();
          expect(authUrl).not.toHaveBeenCalled();
        }
      }
      expect((await request(app).get("/api/auth/workos/sign-in")).headers.location).toBe("/sign-in");
      for (const unsafe of ["https://evil.example/plans", "//evil.example", "/api/auth/workos/sign-in", "/sign-in"]) {
        expect((await request(app).get("/api/auth/workos/sign-in").query({ returnTo: unsafe })).headers.location).toBe("/sign-in");
      }
      const google = await request(app).get("/api/auth/workos/sign-in").query({ returnTo: "/plans", provider: "google" });
      expect(google.status).toBe(302);
      expect(google.headers.location).toContain("https://api.workos.com/user_management/authorize");
      expect(authUrl).toHaveBeenCalledTimes(1);
      expect(authUrl).toHaveBeenLastCalledWith(expect.objectContaining({ provider: "GoogleOAuth" }));
    } finally { restore(); }
  });

  it("forwards a valid typed email as the provider login hint and drops anything else", { timeout: 20000 }, async () => {
    const { app, restore } = await buildApp({ ...baseEnv });
    await request(app).get("/api/auth/workos/sign-in").query({ provider: "google", login_hint: "  Asha@Example.com " });
    expect((authUrl.mock.calls.at(-1)?.[0] as { loginHint?: string }).loginHint).toBe("asha@example.com");
    for (const bad of ["not-an-email", `${"a".repeat(320)}@example.com`, "a b@example.com"]) {
      await request(app).get("/api/auth/workos/sign-in").query({ provider: "google", login_hint: bad });
      expect((authUrl.mock.calls.at(-1)?.[0] as { loginHint?: string }).loginHint).toBeUndefined();
    }
    restore();
  });
});

describe("state-bound authentication return", () => {
  afterEach(() => { vi.useRealTimers(); authenticate.mockClear(); });

  it.each(["/premium?role=referrer&quantity=7&currency=INR", "/plans?role=job_seeker&plan=max&currency=USD", "https://skipwait.me/premium?role=job_seeker"]) ("restores %s after provider authentication, including an existing session", async returnTo => {
    const { app, restore } = await buildApp(baseEnv);
    try {
      const agent = request.agent(app);
      const entry = await agent.get("/api/auth/workos/sign-in").set("Cookie", "app_session_id=existing-session").query({ returnTo, provider: "google" });
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
      await agent.get("/api/auth/workos/sign-up").query({ returnTo, provider: "google" });
      const state = authUrl.mock.calls.at(-1)![0].state;
      const callback = await agent.get("/api/auth/workos/callback").query({ code: "provider-code", state });
      expect(callback.status).toBe(302);
      expect(callback.headers.location).toBe("/");
    } finally { restore(); }
  });

  it.each(["missing", "mismatched", "tampered", "expired", "raw-return"]) ("rejects %s state binding before contacting the provider", async failure => {
    const { app, restore } = await buildApp(baseEnv);
    try {
      const entry = await request(app).get("/api/auth/workos/sign-in").query({ returnTo: "/premium?role=referrer", provider: "google" });
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

describe("canonical WorkOS callback session", () => {
  afterEach(() => { authenticate.mockClear(); resolveLoginIdentity.mockClear(); resolveLoginIdentity.mockImplementation(async (input: { openId: string; name: string; email: string }) => defaultResolve(input)); accounts.clear(); account.sessionsValidAfter = new Date(0); });

  async function signIn(app: import("express").Express) {
    const agent = request.agent(app);
    await agent.get("/api/auth/workos/sign-in").query({ returnTo: "/premium", provider: "google" });
    const state = authUrl.mock.calls.at(-1)![0].state;
    return agent.get("/api/auth/workos/callback").query({ code: "provider-code", state });
  }

  it("resolves through the canonical resolver with the provider's verified-email evidence", async () => {
    const { app, restore } = await buildApp(baseEnv);
    try {
      authenticate.mockResolvedValueOnce({ user: { id: "user_test", email: "Test@Example.com", emailVerified: true, firstName: "Test", lastName: "User" } });
      expect((await signIn(app)).status).toBe(302);
      expect(resolveLoginIdentity).toHaveBeenCalledWith({ provider: "workos", subject: "user_test", openId: "workos_user_test", email: "Test@Example.com", emailVerified: true, name: "Test User", loginMethod: "workos" });
      authenticate.mockResolvedValueOnce({ user: { id: "user_test", email: "test@example.com", firstName: "Test", lastName: "User" } });
      await signIn(app);
      expect(resolveLoginIdentity.mock.calls.at(-1)![0].emailVerified).toBe(false);
    } finally { restore(); }
  });

  // S-11: an email's local part next to a company name rebuilds the address (P0-referrer-exposure), so a new
  // account takes no name from the email when WorkOS has none.
  it("a WorkOS user with no first or last name creates an unnamed account, never one named after the email", async () => {
    const { app, restore } = await buildApp(baseEnv);
    try {
      for (const names of [{}, { firstName: null, lastName: null }, { firstName: "", lastName: "" }]) {
        authenticate.mockResolvedValueOnce({ user: { id: "user_noname", email: "asha.k@corp.example", emailVerified: true, ...names } } as never);
        const callback = await signIn(app);
        expect(callback.status).toBe(302);
        expect(resolveLoginIdentity.mock.calls.at(-1)![0]).toEqual(expect.objectContaining({ subject: "user_noname", name: null }));
        const cookie = callback.headers["set-cookie"].find((value: string) => value.startsWith("app_session_id="))!.split(";")[0];
        expect(JSON.stringify(decodeJwt(cookie.slice("app_session_id=".length)))).not.toContain("asha.k");
      }
      authenticate.mockResolvedValueOnce({ user: { id: "user_named", email: "asha.k@corp.example", emailVerified: true, firstName: "Asha", lastName: null } } as never);
      await signIn(app);
      expect(resolveLoginIdentity.mock.calls.at(-1)![0]).toEqual(expect.objectContaining({ name: "Asha" }));
    } finally { restore(); }
  });

  it("mints the session for the canonical account, not the provider openId", async () => {
    const { app, restore } = await buildApp(baseEnv);
    try {
      authenticate.mockResolvedValueOnce({ user: { id: "user_second_provider", email: "test@example.com", emailVerified: true, firstName: "Test", lastName: "User" } });
      resolveLoginIdentity.mockResolvedValueOnce(account);
      const callback = await signIn(app);
      expect(callback.status).toBe(302);
      const cookie = callback.headers["set-cookie"].find((value: string) => value.startsWith("app_session_id="))!.split(";")[0];
      const proof = await request(app).get("/session-proof").set("Cookie", cookie);
      expect(proof.status).toBe(200);
      expect(proof.body).toEqual({ openId: "workos_user_test" });
      expect(accounts.has("workos_user_second_provider")).toBe(false);
    } finally { restore(); }
  });

  it("links a hosted sign-in's session id into the app session and a hosted-link cookie", async () => {
    const { app, restore } = await buildApp(baseEnv);
    try {
      // A real WorkOS access token always verifies with WorkOS's keys; the helper
      // only reads the payload, so an unsigned-body JWT is enough here.
      const accessToken = await new SignJWT({ sid: "session_live" }).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode("workos-test"));
      authenticate.mockResolvedValueOnce({ user: { id: "user_test", email: "test@example.com", emailVerified: true, firstName: "Test", lastName: "User" }, accessToken, sealedSession: "sealed" });
      const callback = await signIn(app);
      expect(callback.status).toBe(302);
      const cookies: string[] = callback.headers["set-cookie"];
      expect(decodeJwt(cookies.find(value => value.startsWith("app_session_id="))!.split(";")[0].slice("app_session_id=".length)).sid).toBe("session_live");
      const hostedCookie = cookies.find(value => value.startsWith(`${HOSTED_LINK_COOKIE}=`));
      expect(hostedCookie).toBeDefined();
      expect(hostedCookie).toContain("Path=/api/auth/workos");
      expect(hostedCookie).toContain("HttpOnly");
    } finally { restore(); }
  });

  it("sets no hosted-link cookie when the access token carries no session id", async () => {
    const { app, restore } = await buildApp(baseEnv);
    try {
      authenticate.mockResolvedValueOnce({ user: { id: "user_test", email: "test@example.com", emailVerified: true, firstName: "Test", lastName: "User" }, accessToken: "not-a-jwt" });
      const callback = await signIn(app);
      expect(callback.status).toBe(302);
      const cookies: string[] = callback.headers["set-cookie"];
      expect(cookies.some(value => value.startsWith(`${HOSTED_LINK_COOKIE}=`))).toBe(false);
      expect(decodeJwt(cookies.find(value => value.startsWith("app_session_id="))!.split(";")[0].slice("app_session_id=".length)).sid).toBeUndefined();
    } finally { restore(); }
  });

  it.each([["IDENTITY_REVIEW_REQUIRED", /review/], ["ACCOUNT_NOT_ACTIVE", /not active/]]) ("returns 403 without a session cookie when the resolver reports %s", async (code, message) => {
    const { app, restore } = await buildApp(baseEnv);
    try {
      resolveLoginIdentity.mockRejectedValueOnce(new Error(code));
      const callback = await signIn(app);
      expect(callback.status).toBe(403);
      expect(callback.text).toMatch(message);
      expect((callback.headers["set-cookie"] ?? []).some((value: string) => value.startsWith("app_session_id="))).toBe(false);
    } finally { restore(); }
  });

  it("does not mint a session for an account suspended between resolve and signing", async () => {
    const { app, restore } = await buildApp(baseEnv);
    try {
      resolveLoginIdentity.mockResolvedValueOnce({ ...account, openId: "workos_gone" });
      const callback = await signIn(app);
      expect(callback.status).toBe(502);
      expect((callback.headers["set-cookie"] ?? []).some((value: string) => value.startsWith("app_session_id="))).toBe(false);
    } finally { restore(); }
  });

  it("rejects the session cookie after logout (replay fails)", async () => {
    const { app, restore } = await buildApp(baseEnv);
    try {
      const callback = await signIn(app);
      const cookie = callback.headers["set-cookie"].find((value: string) => value.startsWith("app_session_id="))!.split(";")[0];
      expect((await request(app).get("/session-proof").set("Cookie", cookie)).status).toBe(200);
      expect((await request(app).post("/api/auth/workos/logout").set("Cookie", cookie)).body).toEqual({ signedOut: true });
      expect((await request(app).get("/session-proof").set("Cookie", cookie)).status).toBe(401);
    } finally { restore(); }
  });

  it("ends the signed-out person's hosted AuthKit sessions, only with a valid session of their own", async () => {
    const { app, restore } = await buildApp(baseEnv);
    try {
      hosted.list.mockClear(); hosted.revoke.mockClear();
      expect((await request(app).post("/api/auth/workos/logout")).body).toEqual({ signedOut: true });
      expect(hosted.list).not.toHaveBeenCalled();
      const callback = await signIn(app);
      const cookie = callback.headers["set-cookie"].find((value: string) => value.startsWith("app_session_id="))!.split(";")[0];
      expect((await request(app).post("/api/auth/workos/logout").set("Cookie", cookie)).body).toEqual({ signedOut: true });
      expect(hosted.list).toHaveBeenCalledWith("user_test");
      expect(hosted.revoke).toHaveBeenCalledWith({ sessionId: "session_live" });
    } finally { restore(); }
  });

  it("still signs out when WorkOS cannot list or revoke hosted sessions", async () => {
    const { app, restore } = await buildApp(baseEnv);
    try {
      hosted.list.mockRejectedValueOnce(new Error("workos down"));
      const callback = await signIn(app);
      const cookie = callback.headers["set-cookie"].find((value: string) => value.startsWith("app_session_id="))!.split(";")[0];
      expect((await request(app).post("/api/auth/workos/logout").set("Cookie", cookie)).body).toEqual({ signedOut: true });
      expect((await request(app).get("/session-proof").set("Cookie", cookie)).status).toBe(401);
    } finally { restore(); }
  });

  it("starts a listed social provider and sends anything else to the skipwait.me sign-in", { timeout: 20000 }, async () => {
    const { app, restore } = await buildApp({ ...baseEnv });
    authUrl.mockClear();
    const providerFor = async (provider: string) => { await request(app).get("/api/auth/workos/sign-in").query({ provider }); return (authUrl.mock.calls.at(-1)?.[0] as { provider?: string; screenHint?: string }); };
    expect((await providerFor("google")).provider).toBe("GoogleOAuth");
    expect((await providerFor("microsoft")).provider).toBe("MicrosoftOAuth");
    expect((await providerFor("github")).provider).toBe("GitHubOAuth");
    expect((await providerFor("linkedin")).provider).toBe("LinkedInOAuth");
    expect((await providerFor("slack")).provider).toBe("SlackOAuth");
    expect(authUrl.mock.calls.every(([options]) => (options as { screenHint?: string }).screenHint === undefined)).toBe(true);
    const callsBefore = authUrl.mock.calls.length;
    const unknown = await request(app).get("/api/auth/workos/sign-in").query({ provider: "AppleOAuth" });
    expect(unknown.status).toBe(302);
    expect(unknown.headers.location).toBe("/sign-in");
    expect(authUrl.mock.calls.length).toBe(callsBefore);
    restore();
  });
});
