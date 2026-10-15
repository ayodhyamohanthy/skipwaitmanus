import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { describeUserAgent, registerAccountSessionRoutes, type AccountSessionDeps, type SessionsApi } from "./accountSessions";

const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("describeUserAgent", () => {
  it("names browser and OS without exposing the raw string", () => {
    expect(describeUserAgent(CHROME_MAC)).toBe("Chrome on macOS");
    expect(describeUserAgent(SAFARI_IOS)).toBe("Safari on iOS");
    expect(describeUserAgent(null)).toBe("Unknown device");
    expect(describeUserAgent("curl/8")).toBe("Unknown device");
  });
});

function setup(over: { sid?: string | null; owned?: string[]; sessions?: Record<string, Array<{ id: string; status?: string; userAgent?: string }>>; revoke?: SessionsApi["revokeSession"] } = {}) {
  const revokeSession = vi.fn(over.revoke ?? (async () => undefined));
  const sessions = over.sessions ?? { user_a: [{ id: "session_cur", userAgent: CHROME_MAC }, { id: "session_two", userAgent: SAFARI_IOS }, { id: "session_dead", status: "revoked" }], user_b: [{ id: "session_three" }] };
  const api: SessionsApi = { listSessions: vi.fn(async (userId: string) => ({ data: sessions[userId] ?? [] })), revokeSession };
  const deps: AccountSessionDeps = {
    resolveIdentity: async req => req.header("x-test-user") ? { account: { id: 7 } } : undefined,
    listWorkosSubjects: async () => over.owned ?? ["user_a", "user_b"],
    api: () => api,
    currentSessionId: async () => (over.sid === undefined ? "session_cur" : over.sid),
    record: vi.fn(),
  };
  const app = express(); app.use(express.json()); registerAccountSessionRoutes(app, deps);
  return { app, revokeSession, api };
}
const as = (r: request.Test) => r.set("x-test-user", "1");

describe("account session routes", () => {
  it("requires sign-in", async () => {
    const { app } = setup();
    expect((await request(app).get("/api/account/sessions")).status).toBe(401);
    expect((await request(app).delete("/api/account/sessions/session_two")).status).toBe(401);
    expect((await request(app).post("/api/account/sessions/revoke-others")).status).toBe(401);
  });
  it("lists only active sessions of the caller's own WorkOS users, current first, no raw ip or user agent", async () => {
    const { app, api } = setup();
    const res = await as(request(app).get("/api/account/sessions"));
    expect(res.status).toBe(200);
    expect(res.body.sessions.map((s: { id: string }) => s.id)).toEqual(["session_cur", "session_two", "session_three"]);
    expect(res.body.sessions[0]).toMatchObject({ device: "Chrome on macOS", current: true });
    expect(res.body.currentKnown).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/Mozilla|ipAddress/);
    expect(api.listSessions).toHaveBeenCalledTimes(2);
    expect(res.headers["cache-control"]).toBe("private, no-store");
  });
  it("revokes one of the caller's own other sessions, but never a foreign id or the current one", async () => {
    const { app, revokeSession } = setup();
    expect((await as(request(app).delete("/api/account/sessions/session_two"))).status).toBe(200);
    expect(revokeSession).toHaveBeenCalledWith({ sessionId: "session_two" });
    expect((await as(request(app).delete("/api/account/sessions/session_someone_else"))).status).toBe(404);
    expect((await as(request(app).delete("/api/account/sessions/session_cur"))).status).toBe(409);
    expect((await as(request(app).delete("/api/account/sessions/session_dead"))).status).toBe(404);
    expect(revokeSession).toHaveBeenCalledTimes(1);
  });
  it("signs out everywhere else without touching the current session", async () => {
    const { app, revokeSession } = setup();
    const res = await as(request(app).post("/api/account/sessions/revoke-others"));
    expect(res.status).toBe(200); expect(res.body).toMatchObject({ revoked: 2, failed: 0 });
    expect(revokeSession.mock.calls.map(c => (c[0] as { sessionId: string }).sessionId).sort()).toEqual(["session_three", "session_two"]);
  });
  it("revokes nothing when the current session is unknown", async () => {
    const { app, revokeSession } = setup({ sid: null });
    const res = await as(request(app).post("/api/account/sessions/revoke-others"));
    expect(res.status).toBe(409); expect(revokeSession).not.toHaveBeenCalled();
    const list = await as(request(app).get("/api/account/sessions"));
    expect(list.body.currentKnown).toBe(false);
  });
  it("refuses a single revoke when the current session is unknown (cannot self-revoke)", async () => {
    const { app, revokeSession } = setup({ sid: null });
    expect((await as(request(app).delete("/api/account/sessions/session_two"))).status).toBe(409);
    expect(revokeSession).not.toHaveBeenCalled();
  });
  it("revokes nothing when the current session id is not among the caller's own", async () => {
    const { app, revokeSession } = setup({ sid: "session_unrelated" });
    expect((await as(request(app).post("/api/account/sessions/revoke-others"))).status).toBe(409);
    expect(revokeSession).not.toHaveBeenCalled();
  });
  it("reports partial failure honestly and a total failure as an error", async () => {
    const some = setup({ revoke: vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined) });
    expect((await as(request(some.app).post("/api/account/sessions/revoke-others"))).body).toMatchObject({ revoked: 1, failed: 1 });
    const none = setup({ revoke: async () => { throw new Error("x"); } });
    expect((await as(request(none.app).post("/api/account/sessions/revoke-others"))).status).toBe(502);
  });
  it("returns 503 when WorkOS is not configured and an empty list for non-WorkOS accounts", async () => {
    const app = express(); registerAccountSessionRoutes(app, { resolveIdentity: async () => ({ account: { id: 1 } }), listWorkosSubjects: async () => [], api: () => undefined, currentSessionId: async () => null });
    expect((await request(app).get("/api/account/sessions")).status).toBe(503);
    const { app: app2 } = setup({ owned: [] });
    expect((await as(request(app2).get("/api/account/sessions"))).body.sessions).toEqual([]);
  });
});
