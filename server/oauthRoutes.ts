import express, { type Express, type Request } from "express";
import { randomBytes } from "node:crypto";
import type { OAuthClient } from "./oauthStore";

const ISSUER = "https://skipwait.me";
export const OAUTH_RESOURCE = `${ISSUER}/api/mcp`;
export const OAUTH_RESOURCE_METADATA_URL = `${ISSUER}/.well-known/oauth-protected-resource`;
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;

export type OAuthRouteDeps = {
  resolveIdentity: (req: Request) => Promise<{ account: { id: number } } | undefined>;
  registerClient: (input: { clientName?: unknown; redirectUris?: unknown }) => Promise<OAuthClient>;
  getClient: (clientId: unknown) => Promise<OAuthClient | null>;
  issueCode: (userId: number, input: { clientId: string; redirectUri: string; codeChallenge: string }) => Promise<string>;
  consumeCode: (code: string, input: { clientId: string; redirectUri: string; codeVerifier: string }) => Promise<{ userId: number } | null>;
  /** Mints a normal assistant bearer (same table and checks as a pasted token). Throws when the owner has no assistant access. */
  mintToken: (userId: number, name: string) => Promise<{ token: string }>;
  recordActivity?: (input: { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number; metadata?: Record<string, string | number | boolean | null> }) => Promise<unknown>;
  now?: () => number;
};

export function registerOAuthRoutes(app: Express, deps: OAuthRouteDeps) {
  const now = deps.now ?? Date.now;
  const record = (input: Parameters<NonNullable<typeof deps.recordActivity>>[0]) => { void deps.recordActivity?.(input).catch(() => undefined); };
  const hits = new Map<string, { start: number; count: number }>();
  const limited = (key: string, max: number) => {
    const t = now(); const h = hits.get(key);
    if (!h || t - h.start >= 3_600_000) { hits.set(key, { start: t, count: 1 }); return false; }
    h.count += 1; return h.count > max;
  };
  const oauthError = (res: express.Response, status: number, error: string, description: string) => res.set("Cache-Control", "no-store").status(status).json({ error, error_description: description });

  app.get("/api/oauth/authorization-server", (_req, res) => {
    res.set("Cache-Control", "public, max-age=300").json({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/connect-assistant`,
      token_endpoint: `${ISSUER}/api/oauth/token`,
      registration_endpoint: `${ISSUER}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["read", "draft"],
    });
  });
  app.get("/api/oauth/protected-resource", (_req, res) => {
    res.set("Cache-Control", "public, max-age=300").json({ resource: OAUTH_RESOURCE, authorization_servers: [ISSUER], bearer_methods_supported: ["header"], scopes_supported: ["read", "draft"] });
  });

  // Dynamic client registration (RFC 7591), public clients only. Registering grants nothing: every connection still needs the owner's Allow.
  app.post("/api/oauth/register", express.json({ limit: "8kb" }), async (req, res) => {
    if (limited(`reg:${req.ip ?? "?"}`, 20)) return oauthError(res, 429, "temporarily_unavailable", "Too many registrations. Try again later.");
    try {
      const client = await deps.registerClient({ clientName: req.body?.client_name, redirectUris: req.body?.redirect_uris });
      res.set("Cache-Control", "no-store").status(201).json({ client_id: client.clientId, client_name: client.clientName, redirect_uris: client.redirectUris, grant_types: ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: "none" });
    } catch (error) {
      oauthError(res, 400, "invalid_client_metadata", error instanceof Error ? error.message.slice(0, 200) : "Invalid registration");
    }
  });

  // The consent screen asks who is connecting. Only the name is returned, and only for an exactly registered redirect.
  app.get("/api/oauth/client", async (req, res) => {
    const client = await deps.getClient(req.query.client_id);
    const redirect = typeof req.query.redirect_uri === "string" ? req.query.redirect_uri : "";
    if (!client || !client.redirectUris.includes(redirect)) return res.set("Cache-Control", "no-store").status(404).json({ error: "This connection link is not valid" });
    res.set("Cache-Control", "no-store").json({ clientName: client.clientName });
  });

  // The signed-in owner's decision from the consent screen. Never callable without their own session.
  app.post("/api/oauth/authorize", express.json({ limit: "4kb" }), async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to connect an assistant" });
      const client = await deps.getClient(req.body?.client_id);
      const redirectUri = typeof req.body?.redirect_uri === "string" ? req.body.redirect_uri : "";
      if (!client || !client.redirectUris.includes(redirectUri)) return res.status(400).json({ error: "This connection link is not valid" });
      const state = typeof req.body?.state === "string" ? req.body.state.slice(0, 512) : "";
      const target = new URL(redirectUri);
      if (state) target.searchParams.set("state", state);
      if (req.body?.decision === "deny") {
        target.searchParams.set("error", "access_denied");
        record({ actorUserId: identity.account.id, action: "assistant.oauth_denied", outcome: "success", resourceType: "oauth_client", resourceId: client.clientId, metadata: { client: client.clientName } });
        return res.set("Cache-Control", "no-store").json({ redirectTo: target.toString() });
      }
      if (req.body?.decision !== "approve") return res.status(400).json({ error: "Choose allow or deny" });
      if (req.body?.code_challenge_method !== "S256" || typeof req.body?.code_challenge !== "string" || !CHALLENGE_RE.test(req.body.code_challenge)) return res.status(400).json({ error: "This connection link is missing its security check (PKCE)" });
      // Fail before issuing a code when the owner has no assistant access.
      const code = await deps.issueCode(identity.account.id, { clientId: client.clientId, redirectUri, codeChallenge: req.body.code_challenge });
      target.searchParams.set("code", code);
      record({ actorUserId: identity.account.id, action: "assistant.oauth_allowed", outcome: "success", resourceType: "oauth_client", resourceId: client.clientId, metadata: { client: client.clientName } });
      res.set("Cache-Control", "no-store").json({ redirectTo: target.toString() });
    } catch { res.status(500).json({ error: "We could not connect this assistant" }); }
  });

  app.post("/api/oauth/token", express.urlencoded({ extended: false, limit: "4kb" }), express.json({ limit: "4kb" }), async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (limited(`tok:${req.ip ?? "?"}`, 120)) return oauthError(res, 429, "temporarily_unavailable", "Too many requests.");
    if (b.grant_type !== "authorization_code") return oauthError(res, 400, "unsupported_grant_type", "Only authorization_code is supported");
    const { code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier } = b;
    if (typeof code !== "string" || typeof redirectUri !== "string" || typeof clientId !== "string" || typeof verifier !== "string" || !VERIFIER_RE.test(verifier)) return oauthError(res, 400, "invalid_request", "Missing or malformed parameters");
    try {
      const exchanged = await deps.consumeCode(code, { clientId, redirectUri, codeVerifier: verifier });
      if (!exchanged) return oauthError(res, 400, "invalid_grant", "This code is invalid, expired or already used");
      const client = await deps.getClient(clientId);
      let minted: { token: string };
      try { minted = await deps.mintToken(exchanged.userId, `${(client?.clientName ?? "Assistant").slice(0, 100)} (OAuth ${randomBytes(3).toString("hex")})`); }
      catch { return oauthError(res, 403, "access_denied", "This account no longer has assistant access"); }
      record({ actorUserId: exchanged.userId, action: "assistant.oauth_token_issued", outcome: "success", resourceType: "oauth_client", resourceId: clientId });
      res.set({ "Cache-Control": "no-store", Pragma: "no-cache" }).json({ access_token: minted.token, token_type: "Bearer", scope: "read draft" });
    } catch { oauthError(res, 500, "server_error", "We could not complete that"); }
  });
}
