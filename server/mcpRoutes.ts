import { setRetryAfter } from "./retryAfter";
import express, { type Express, type Request } from "express";
import { handleMcpMessage, type McpDeps } from "./mcpServer";
import { agentCallLimited } from "./agentPortalAccess";
import type { AgentAuthResult } from "./agentGrantAuth";

/** Tokens are a D-141 `swa_` grant key or a legacy `sw_` bearer. Check the shape before any store read. */
export const ASSISTANT_BEARER_RE = /^(?:swa_[0-9a-f]{64}|sw_[A-Za-z0-9_-]{32})$/;

export type McpRouteDeps = McpDeps & {
  /** D-178.grant (D-290 R1): one verifier for a grant key and a legacy token; scope, expiry and pause-all live there. */
  resolveBearer: (token: string) => Promise<AgentAuthResult>;
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
      const auth = await deps.resolveBearer(token);
      if (!auth.ok) {
        if (auth.status === 401) {
          res.set("WWW-Authenticate", 'Bearer realm="skipwait", error="invalid_token", resource_metadata="https://skipwait.me/.well-known/oauth-protected-resource"');
          return res.status(401).json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: auth.error } });
        }
        if (auth.status === 403) return res.status(403).json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: auth.error } });
        return closed(res);
      }
      const userId = auth.principal.userId;
      if (!(await deps.allowed(userId))) {
        record({ actorUserId: userId, action: "assistant.mcp.denied", outcome: "denied", resourceType: "assistant_token", resourceId: auth.capKey });
        return closed(res);
      }
      if (agentCallLimited(auth.capKey, now())) {
        setRetryAfter(res, 3600);
        return res.status(429).json({ jsonrpc: "2.0", id: null, error: { code: -32003, message: "Too many requests. Try again later." } });
      }
      const body: unknown = req.body;
      if (Array.isArray(body)) return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Send one request at a time" } });
      const reply = await handleMcpMessage(body, { userId }, deps);
      const method = body && typeof body === "object" ? (body as { method?: unknown; params?: { name?: unknown } }) : {};
      if (method.method === "tools/call") {
        const tool = typeof method.params?.name === "string" ? method.params.name.slice(0, 40) : "unknown";
        record({ actorUserId: userId, action: "assistant.mcp.tool", outcome: reply && "error" in (reply ?? {}) ? "failure" : "success", resourceType: "assistant_token", resourceId: auth.capKey, metadata: { tool } });
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
