import { setRetryAfter } from "./retryAfter";
import { createHash } from "node:crypto";
import express, { type Express, type Request } from "express";
import { handleMcpMessage, type McpDeps } from "./mcpServer";
import { agentCallLimited } from "./agentPortalAccess";

/** Tokens are `sw_` + 24 random bytes (base64url). Check the shape before any database lookup. */
export const ASSISTANT_BEARER_RE = /^sw_[A-Za-z0-9_-]{32}$/;
export const hashBearer = (token: string) => createHash("sha256").update(token).digest("hex");

export type BearerAuth = { userId: number; tokenId: number };

export type McpRouteDeps = McpDeps & {
  /** Looks up a non-revoked token by its hash and records last use. Returns null for unknown or revoked. */
  verifyBearer: (tokenHash: string) => Promise<BearerAuth | null>;
  /** D-178.gate (D-290 R2): the one agent switch. Off answers 404 on every method. */
  enabled: () => boolean;
  /** D-178.gate (D-290 R2): the switch plus the account allow-list, never a plan. */
  allowed: (userId: number) => boolean | Promise<boolean>;
  recordActivity?: (input: { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number; metadata?: Record<string, string | number | boolean | null | undefined> }) => Promise<void>;
  now?: () => number;
};

const bearerFrom = (req: Request): string | null => {
  const header = req.header("authorization") ?? "";
  const match = /^Bearer (\S+)$/.exec(header);
  return match ? match[1] : null;
};

export function registerMcpRoutes(app: Express, deps: McpRouteDeps) {
  const now = deps.now ?? Date.now;
  const record = (input: Parameters<NonNullable<typeof deps.recordActivity>>[0]) => { void deps.recordActivity?.(input).catch(() => undefined); };
  const closed = (res: express.Response) => res.status(404).json({ error: "Not found" });

  // Live address: skipwait.me/api/mcp (the API zone route covers /api/* only).
  app.post("/api/mcp", express.json({ limit: "64kb" }), async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!deps.enabled()) return closed(res);
    const token = bearerFrom(req);
    if (!token || !ASSISTANT_BEARER_RE.test(token)) {
      res.set("WWW-Authenticate", 'Bearer realm="skipwait", resource_metadata="https://skipwait.me/.well-known/oauth-protected-resource"');
      return res.status(401).json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Send your skipwait.me token as a Bearer token" } });
    }
    try {
      const auth = await deps.verifyBearer(hashBearer(token));
      if (!auth) {
        res.set("WWW-Authenticate", 'Bearer realm="skipwait", error="invalid_token", resource_metadata="https://skipwait.me/.well-known/oauth-protected-resource"');
        return res.status(401).json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "This token is not valid. It may have been revoked." } });
      }
      if (!(await deps.allowed(auth.userId))) {
        record({ actorUserId: auth.userId, action: "assistant.mcp.denied", outcome: "denied", resourceType: "assistant_token", resourceId: auth.tokenId });
        return closed(res);
      }
      if (agentCallLimited(auth.tokenId, now())) {
        setRetryAfter(res, 3600);
        return res.status(429).json({ jsonrpc: "2.0", id: null, error: { code: -32003, message: "Too many requests. Try again later." } });
      }
      const body: unknown = req.body;
      if (Array.isArray(body)) return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Send one request at a time" } });
      const reply = await handleMcpMessage(body, { userId: auth.userId }, deps);
      const method = body && typeof body === "object" ? (body as { method?: unknown; params?: { name?: unknown } }) : {};
      if (method.method === "tools/call") {
        const tool = typeof method.params?.name === "string" ? method.params.name.slice(0, 40) : "unknown";
        record({ actorUserId: auth.userId, action: "assistant.mcp.tool", outcome: reply && "error" in (reply ?? {}) ? "failure" : "success", resourceType: "assistant_token", resourceId: auth.tokenId, metadata: { tool } });
      }
      if (!reply) return res.status(202).end();
      res.json(reply);
    } catch {
      res.status(500).json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "We could not complete that" } });
    }
  });

  // Stateless server: no SSE stream to open, no session to close.
  const notAllowed = (_req: Request, res: express.Response) => {
    if (!deps.enabled()) return closed(res);
    res.set("Allow", "POST");
    res.status(405).json({ error: "Use POST" });
  };
  app.get("/api/mcp", notAllowed);
  app.delete("/api/mcp", notAllowed);
}
