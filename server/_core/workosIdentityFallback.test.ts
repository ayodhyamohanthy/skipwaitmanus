import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";
import { resolveWorkosIdentity } from "./workosAuth";

const identity = (id: number) => ({ account: { id, openId: `user_${id}`, role: "user" as const, name: "Test", email: "test@acme.com", loginMethod: "workos" }, primaryEmail: null, emailAddresses: [] });
function request(input: { authorization?: string; cookie?: string; origin?: string; secFetchSite?: string; host?: string; protocol?: string } = {}) {
  const headers: Record<string, string | undefined> = {
    authorization: input.authorization,
    cookie: input.cookie,
    origin: input.origin,
    "sec-fetch-site": input.secFetchSite,
    host: input.host ?? "skipwait.me",
  };
  return {
    headers,
    protocol: input.protocol ?? "https",
    get: (name: string) => headers[name.toLowerCase()],
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

describe("WorkOS bearer and app-cookie precedence", () => {
  it("uses a valid bearer without consulting the cookie session", async () => {
    const bearerIdentity = identity(1), resolveCookieIdentity = vi.fn(async () => identity(2));
    await expect(resolveWorkosIdentity(request({ authorization: "Bearer a.b.c", cookie: "app_session_id=cookie", origin: "https://skipwait.me" }), { identityFromBearer: async () => bearerIdentity, resolveCookieIdentity })).resolves.toBe(bearerIdentity);
    expect(resolveCookieIdentity).not.toHaveBeenCalled();
  });

  it.each(["expired", "malformed", "wrong-audience"])("falls back from a %s bearer to an independently valid cookie on the same origin", async kind => {
    const resolveCookieIdentity = vi.fn(async () => identity(2));
    const authorization = kind === "malformed" ? "Bearer stale" : "Bearer a.b.c";
    const identityFromBearer = vi.fn(async () => { throw new Error(kind); });
    await expect(resolveWorkosIdentity(request({ authorization, cookie: "other=1; app_session_id=valid-cookie", origin: "https://skipwait.me" }), { identityFromBearer, resolveCookieIdentity })).resolves.toEqual(identity(2));
    expect(resolveCookieIdentity).toHaveBeenCalledTimes(1);
  });

  it("accepts the browser same-origin signal when Origin is omitted", async () => {
    const resolveCookieIdentity = vi.fn(async () => identity(2));
    await expect(resolveWorkosIdentity(request({ authorization: "Bearer stale", cookie: "app_session_id=valid-cookie", secFetchSite: "same-origin" }), { identityFromBearer: async () => undefined, resolveCookieIdentity })).resolves.toEqual(identity(2));
  });

  it.each([
    ["cross-origin", { origin: "https://attacker.example", cookie: "app_session_id=valid-cookie" }],
    ["no app cookie", { origin: "https://skipwait.me", cookie: "other=1" }],
    ["no browser-origin evidence", { cookie: "app_session_id=valid-cookie" }],
  ])("keeps a failed bearer terminal for %s", async (_name, input) => {
    const resolveCookieIdentity = vi.fn(async () => identity(2));
    await expect(resolveWorkosIdentity(request({ authorization: "Bearer a.b.c", ...input }), { identityFromBearer: async () => undefined, resolveCookieIdentity })).resolves.toBeUndefined();
    expect(resolveCookieIdentity).not.toHaveBeenCalled();
  });

  it("does not turn an invalid cookie into an identity", async () => {
    await expect(resolveWorkosIdentity(request({ authorization: "Bearer a.b.c", cookie: "app_session_id=invalid", origin: "https://skipwait.me" }), { identityFromBearer: async () => undefined, resolveCookieIdentity: async () => undefined })).resolves.toBeUndefined();
  });
});
