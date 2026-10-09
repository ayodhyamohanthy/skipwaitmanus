import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerOAuthRoutes, type OAuthRouteDeps } from "./oauthRoutes";
import { isAllowedRedirectUri, pkceChallengeFor } from "./oauthStore";

const VERIFIER = "a".repeat(43);
const CHALLENGE = pkceChallengeFor(VERIFIER);
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const client = { clientId: "swc_" + "x".repeat(24), clientName: "Claude", redirectUris: [REDIRECT] };

function setup(over: Partial<OAuthRouteDeps> = {}, signedIn = true) {
  const codes = new Map<string, { clientId: string; redirectUri: string; challenge: string; userId: number }>();
  const minted: Array<{ userId: number; name: string }> = [];
  const activity: Array<Record<string, unknown>> = [];
  const deps: OAuthRouteDeps = {
    resolveIdentity: async () => (signedIn ? { account: { id: 7 } } : undefined),
    registerClient: async input => ({ clientId: client.clientId, clientName: String(input.clientName), redirectUris: input.redirectUris as string[] }),
    getClient: async id => (id === client.clientId ? client : null),
    issueCode: async (userId, input) => { const code = `code${codes.size}`; codes.set(code, { clientId: input.clientId, redirectUri: input.redirectUri, challenge: input.codeChallenge, userId }); return code; },
    consumeCode: async (code, input) => {
      const row = codes.get(code); codes.delete(code);
      if (!row || row.clientId !== input.clientId || row.redirectUri !== input.redirectUri || pkceChallengeFor(input.codeVerifier) !== row.challenge) return null;
      return { userId: row.userId };
    },
    mintToken: async (userId, name) => { minted.push({ userId, name }); return { token: "sw_" + "t".repeat(32) }; },
    recordActivity: async input => { activity.push(input); },
    ...over,
  };
  const app = express();
  registerOAuthRoutes(app, deps);
  return { app, minted, activity };
}

describe("oauth redirect rules", () => {
  it("accepts https and loopback http only, no fragments or credentials", () => {
    expect(isAllowedRedirectUri("https://claude.ai/cb")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:3000/cb")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1/cb")).toBe(true);
    for (const bad of ["http://evil.com/cb", "javascript:alert(1)", "https://a.com/cb#x", "https://u:p@a.com/cb", "ftp://a.com", "not a url"]) expect(isAllowedRedirectUri(bad)).toBe(false);
  });
});

describe("oauth discovery", () => {
  it("advertises PKCE S256 and public clients only", async () => {
    const { app } = setup();
    const meta = (await request(app).get("/api/oauth/authorization-server")).body;
    expect(meta).toMatchObject({ issuer: "https://skipwait.me", token_endpoint: "https://skipwait.me/api/oauth/token", code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], grant_types_supported: ["authorization_code"] });
    const resource = (await request(app).get("/api/oauth/protected-resource")).body;
    expect(resource).toMatchObject({ resource: "https://skipwait.me/api/mcp", authorization_servers: ["https://skipwait.me"] });
  });
});

describe("authorize + token", () => {
  const authorize = (app: express.Express, body: Record<string, unknown>) => request(app).post("/api/oauth/authorize").send({ client_id: client.clientId, redirect_uri: REDIRECT, state: "s1", code_challenge: CHALLENGE, code_challenge_method: "S256", decision: "approve", ...body });

  it("needs the signed-in owner and an exactly registered redirect", async () => {
    expect((await authorize(setup({}, false).app, {})).status).toBe(401);
    expect((await authorize(setup().app, { redirect_uri: "https://evil.example/cb" })).status).toBe(400);
    expect((await authorize(setup().app, { client_id: "swc_unknown" })).status).toBe(400);
  });
  it("requires PKCE S256", async () => {
    const { app } = setup();
    expect((await authorize(app, { code_challenge_method: "plain" })).status).toBe(400);
    expect((await authorize(app, { code_challenge: "short" })).status).toBe(400);
  });
  it("deny returns access_denied and issues no code", async () => {
    const { app, activity } = setup();
    const res = await authorize(app, { decision: "deny" });
    const url = new URL(res.body.redirectTo);
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("code")).toBeNull();
    expect(url.searchParams.get("state")).toBe("s1");
    expect(activity.map(a => a.action)).toEqual(["assistant.oauth_denied"]);
  });
  it("approve then exchange gives a bearer once, bound to the verifier", async () => {
    const { app, minted } = setup();
    const approved = await authorize(app, {});
    const code = new URL(approved.body.redirectTo).searchParams.get("code")!;
    expect(new URL(approved.body.redirectTo).searchParams.get("state")).toBe("s1");
    const wrong = await request(app).post("/api/oauth/token").type("form").send({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: client.clientId, code_verifier: "b".repeat(43) });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe("invalid_grant");
    // the failed attempt already burned the code
    const approved2 = await authorize(app, {});
    const code2 = new URL(approved2.body.redirectTo).searchParams.get("code")!;
    const ok = await request(app).post("/api/oauth/token").type("form").send({ grant_type: "authorization_code", code: code2, redirect_uri: REDIRECT, client_id: client.clientId, code_verifier: VERIFIER });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ token_type: "Bearer" });
    expect(ok.body.access_token).toMatch(/^sw_/);
    expect(ok.headers["cache-control"]).toBe("no-store");
    expect(minted).toHaveLength(1);
    expect(minted[0].userId).toBe(7);
    const replay = await request(app).post("/api/oauth/token").type("form").send({ grant_type: "authorization_code", code: code2, redirect_uri: REDIRECT, client_id: client.clientId, code_verifier: VERIFIER });
    expect(replay.status).toBe(400);
  });
  it("rejects other grants, bad verifiers and a lapsed plan at exchange", async () => {
    const { app } = setup({ mintToken: async () => { throw new Error("plan"); } });
    expect((await request(app).post("/api/oauth/token").type("form").send({ grant_type: "password" })).body.error).toBe("unsupported_grant_type");
    expect((await request(app).post("/api/oauth/token").type("form").send({ grant_type: "authorization_code", code: "c", redirect_uri: REDIRECT, client_id: client.clientId, code_verifier: "short" })).body.error).toBe("invalid_request");
    const code = new URL((await authorize(app, {})).body.redirectTo).searchParams.get("code")!;
    const res = await request(app).post("/api/oauth/token").type("form").send({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: client.clientId, code_verifier: VERIFIER });
    expect(res.status).toBe(403);
  });
});

describe("registration and client lookup", () => {
  it("registers a public client and shows only the name for a registered redirect", async () => {
    const { app } = setup();
    const reg = await request(app).post("/api/oauth/register").send({ client_name: "Claude", redirect_uris: [REDIRECT] });
    expect(reg.status).toBe(201);
    expect(reg.body).toMatchObject({ token_endpoint_auth_method: "none", client_name: "Claude" });
    expect(reg.body.client_secret).toBeUndefined();
    const ok = await request(app).get("/api/oauth/client").query({ client_id: client.clientId, redirect_uri: REDIRECT });
    expect(ok.body).toEqual({ clientName: "Claude" });
    expect((await request(app).get("/api/oauth/client").query({ client_id: client.clientId, redirect_uri: "https://evil.example/cb" })).status).toBe(404);
  });
  it("rate limits registration", async () => {
    const { app } = setup();
    let last = 201;
    for (let i = 0; i < 22; i++) last = (await request(app).post("/api/oauth/register").send({ client_name: "C", redirect_uris: [REDIRECT] })).status;
    expect(last).toBe(429);
  });
});

describe("static discovery files", () => {
  it("match what the API serves (Pages cannot proxy to the API Worker, so these are static)", async () => {
    const { readFileSync } = await import("node:fs");
    const { app } = setup();
    const auth = JSON.parse(readFileSync(new URL("../client/public/.well-known/oauth-authorization-server", import.meta.url), "utf8"));
    const res = JSON.parse(readFileSync(new URL("../client/public/.well-known/oauth-protected-resource", import.meta.url), "utf8"));
    expect(auth).toEqual((await request(app).get("/api/oauth/authorization-server")).body);
    expect(res).toEqual((await request(app).get("/api/oauth/protected-resource")).body);
  });
});
