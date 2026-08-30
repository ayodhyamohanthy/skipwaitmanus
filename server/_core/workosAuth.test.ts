import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const authUrl = vi.fn();
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
};

describe("role-aware WorkOS sign-in entries", () => {
  afterEach(() => { vi.restoreAllMocks(); authUrl.mockClear(); });

  it("sends the administrator gate to AuthKit with the admin state marker and login hint for the durable admin only", async () => {
    const { app, restore } = await buildApp({ ...baseEnv });
    const allowed = await request(app).get("/api/auth/workos/admin?email=ayodhya@skipwait.me");
    expect(allowed.status).toBe(302);
    expect(authUrl).toHaveBeenCalledWith(expect.objectContaining({ loginHint: "ayodhya@skipwait.me", screenHint: "sign-in", state: "skipwait-admin" }));
    const denied = await request(app).get("/api/auth/workos/admin?email=someone@gmail.com");
    expect(denied.status).toBe(403);
    const deniedNoEmail = await request(app).get("/api/auth/workos/admin");
    expect(deniedNoEmail.status).toBe(403);
    expect(authUrl).toHaveBeenCalledTimes(1);
    restore();
  });

  it("keeps general sign-in and sign-up open without a login hint", async () => {
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
