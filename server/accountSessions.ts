// "Where you're signed in" (queue task 7b). Sessions are the caller's own hosted AuthKit sessions, listed live
// from WorkOS for the WorkOS user ids linked to the caller's account. Nothing is stored here, and no raw IP or
// precise location is returned. Every id the client sends is checked against the caller's own list first.
import type { Express, Request, Response } from "express";

export type HostedSession = { id: string; status?: string; userAgent?: string | null; createdAt?: string | null; updatedAt?: string | null; expiresAt?: string | null };
export type SessionsApi = {
  listSessions: (userId: string) => Promise<{ data?: HostedSession[] }>;
  revokeSession: (payload: { sessionId: string }) => Promise<unknown>;
};
export type SessionRow = { id: string; device: string; lastActive: string | null; signedInAt: string | null; current: boolean };

/** Plain "Chrome on macOS" style label from a User-Agent. Falls back to "Unknown device". */
export function describeUserAgent(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : null;
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}

export async function listOwnSessions(api: SessionsApi, workosUserIds: readonly string[], currentSid: string | null): Promise<SessionRow[]> {
  const rows: SessionRow[] = [];
  for (const userId of workosUserIds) {
    const page = await api.listSessions(userId);
    for (const session of Array.isArray(page.data) ? page.data : []) {
      if (session.status && session.status !== "active") continue;
      rows.push({ id: session.id, device: describeUserAgent(session.userAgent), lastActive: session.updatedAt ?? session.createdAt ?? null, signedInAt: session.createdAt ?? null, current: currentSid !== null && session.id === currentSid });
    }
  }
  return rows.sort((a, b) => Number(b.current) - Number(a.current) || (Date.parse(b.lastActive ?? "") || 0) - (Date.parse(a.lastActive ?? "") || 0));
}

export type AccountSessionDeps = {
  resolveIdentity: (req: Request) => Promise<{ account: { id: number } } | undefined>;
  listWorkosSubjects: (userId: number) => Promise<string[]>;
  api: () => SessionsApi | undefined;
  currentSessionId: (req: Request) => Promise<string | null>;
  record?: (input: { actorUserId: number; action: string; outcome: "success" | "denied" | "failure"; resourceType: string; metadata?: Record<string, unknown> }) => void;
};

const UNAVAILABLE = "Session management is unavailable right now";
export const LAG_NOTE = "A device you sign out may stay signed in for up to 30 minutes.";

export function registerAccountSessionRoutes(app: Express, deps: AccountSessionDeps) {
  async function context(req: Request, res: Response) {
    const identity = await deps.resolveIdentity(req);
    if (!identity) { res.status(401).json({ error: "Sign in to manage your sessions" }); return null; }
    const api = deps.api();
    if (!api) { res.status(503).json({ error: UNAVAILABLE }); return null; }
    res.set("Cache-Control", "private, no-store");
    const userIds = await deps.listWorkosSubjects(identity.account.id);
    const currentSid = await deps.currentSessionId(req);
    return { identity, api, userIds, currentSid };
  }

  app.get("/api/account/sessions", async (req, res) => {
    try {
      const ctx = await context(req, res); if (!ctx) return;
      const sessions = await listOwnSessions(ctx.api, ctx.userIds, ctx.currentSid);
      res.json({ sessions, currentKnown: ctx.currentSid !== null && sessions.some(row => row.current), note: LAG_NOTE });
    } catch { res.status(502).json({ error: "We could not load your sessions" }); }
  });

  app.delete("/api/account/sessions/:id", async (req, res) => {
    try {
      const ctx = await context(req, res); if (!ctx) return;
      const id = String(req.params.id);
      const owned = (await listOwnSessions(ctx.api, ctx.userIds, ctx.currentSid)).find(row => row.id === id);
      if (!owned) return res.status(404).json({ error: "That session is not available" });
      if (owned.current) return res.status(409).json({ error: "This is the device you are using. Use Sign out instead." });
      await ctx.api.revokeSession({ sessionId: id });
      deps.record?.({ actorUserId: ctx.identity.account.id, action: "account.session_revoked", outcome: "success", resourceType: "hosted_session" });
      res.json({ revoked: 1, note: LAG_NOTE });
    } catch { res.status(502).json({ error: "We could not sign out that device" }); }
  });

  app.post("/api/account/sessions/revoke-others", async (req, res) => {
    try {
      const ctx = await context(req, res); if (!ctx) return;
      const sessions = await listOwnSessions(ctx.api, ctx.userIds, ctx.currentSid);
      // Without a known current session we cannot tell which one to keep, so we revoke nothing.
      if (!ctx.currentSid || !sessions.some(row => row.current)) return res.status(409).json({ error: "We could not tell which device you are on, so nothing was signed out. Sign in again and retry." });
      let revoked = 0; let failed = 0;
      for (const row of sessions) {
        if (row.current) continue;
        try { await ctx.api.revokeSession({ sessionId: row.id }); revoked += 1; } catch { failed += 1; }
      }
      deps.record?.({ actorUserId: ctx.identity.account.id, action: "account.sessions_revoked_others", outcome: failed ? "failure" : "success", resourceType: "hosted_session", metadata: { revoked, failed } });
      if (failed && !revoked) return res.status(502).json({ error: "We could not sign out your other devices" });
      res.json({ revoked, failed, note: LAG_NOTE });
    } catch { res.status(502).json({ error: "We could not sign out your other devices" }); }
  });
}
