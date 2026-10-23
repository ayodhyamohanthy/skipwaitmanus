import express, { type Request } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ASK_INVITE_TTL_MS } from "../shared/askInvites";
import { AskInviteCapReachedError, AskInviteLinkActiveError, AskInviteNotFoundError, AskInviteNotWaitingError } from "./askInvites";
import { askInviteFeatureGateMiddleware, registerAskInviteRoutes } from "./askInviteRoutes";

const TOKEN = "a".repeat(43);
const NOW = Date.parse("2026-10-23T12:00:00.000Z");
const PUBLIC_INVITE = {
  state: "open",
  companyName: "Acme",
  roleTitle: "Product Designer",
  jobFunction: "design",
  workMode: "remote",
  location: "Remote",
  note: null,
  lockedFileCount: null,
};
const PRIVATE_INVITE = { ...PUBLIC_INVITE, note: "I led two launches.", lockedFileCount: 2 };

const codedError = (code: string) => Object.assign(new Error(code), { code });

afterEach(() => { vi.unstubAllEnvs(); });

describe("D-090 early feature gate", () => {
  it.each([
    ["GET", `/api/ask-invites/${TOKEN}`],
    ["POST", `/api/ask-invites/${TOKEN}/claim`],
    ["POST", "/api/company-referrals/12/invite-link"],
    ["POST", "/api/company-referrals/12/invite-link/revoke"],
  ])("short-circuits %s %s before downstream work when BYOR is disabled", async (method, path) => {
    vi.stubEnv("BYOR_LINK_ENABLED", "false");
    const app = express();
    const downstream = vi.fn();
    const identityReads = vi.fn(async () => undefined);
    app.use(askInviteFeatureGateMiddleware);
    app.use((_req, _res, next) => { downstream(); next(); });
    app.use(express.json());
    registerAskInviteRoutes(app, { resolveIdentity: identityReads } as never);

    const response = method === "GET" ? await request(app).get(path) : await request(app).post(path);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "This link is not available" });
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(downstream).not.toHaveBeenCalled();
    expect(identityReads).not.toHaveBeenCalled();
  });
});

function setup(over: {
  createAskInvite?: ReturnType<typeof vi.fn>;
  revokeAskInvite?: ReturnType<typeof vi.fn>;
  getAskInviteLanding?: ReturnType<typeof vi.fn>;
  claimAskInvite?: ReturnType<typeof vi.fn>;
  recordActivity?: ReturnType<typeof vi.fn>;
} = {}) {
  const app = express();
  app.use(express.json());
  const loggedPaths: string[] = [];
  app.use((req, res, next) => { res.on("finish", () => loggedPaths.push(req.path)); next(); });
  const identityReads = vi.fn(async (req: Request) => {
    const user = req.header("x-test-user");
    return user ? { account: { id: Number(user), openId: "test" } } : undefined;
  });
  const createAskInvite = over.createAskInvite ?? vi.fn(async () => ({ id: 31, token: TOKEN, createdAt: new Date(NOW), expiresAt: new Date(NOW + ASK_INVITE_TTL_MS) }));
  const revokeAskInvite = over.revokeAskInvite ?? vi.fn(async () => ({ revoked: true, linkId: 31 }));
  const getAskInviteLanding = over.getAskInviteLanding ?? vi.fn(async () => ({ invite: PUBLIC_INVITE, requestId: 12, linkId: 31 }));
  const claimAskInvite = over.claimAskInvite ?? vi.fn(async () => ({ outcome: "delivered", claimedNow: true, requestId: 12, linkId: 31 }));
  const recordActivity = over.recordActivity ?? vi.fn(async () => undefined);
  registerAskInviteRoutes(app, { resolveIdentity: identityReads, createAskInvite, revokeAskInvite, getAskInviteLanding, claimAskInvite, recordActivity } as never);
  return { app, identityReads, createAskInvite, revokeAskInvite, getAskInviteLanding, claimAskInvite, recordActivity, loggedPaths };
}

describe("D-090 create/revoke HTTP routes", () => {
  it("returns 404 before identity or database work when the server flag is off", async () => {
    vi.stubEnv("BYOR_LINK_ENABLED", "false");
    const { app, identityReads, createAskInvite } = setup();
    const response = await request(app).post("/api/company-referrals/12/invite-link").set("x-test-user", "7");
    expect(response.status).toBe(404);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(identityReads).not.toHaveBeenCalled();
    expect(createAskInvite).not.toHaveBeenCalled();
  });

  it("returns a token and one-time URL exactly once with no-store and a token-free activity row", async () => {
    vi.stubEnv("BYOR_LINK_ENABLED", "true");
    const { app, createAskInvite, recordActivity } = setup();
    const response = await request(app).post("/api/company-referrals/12/invite-link").set("x-test-user", "7").set("Origin", "https://skipwait.me");
    expect(response.status).toBe(201);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.body).toEqual({ token: TOKEN, url: expect.stringMatching(new RegExp(`/r/${TOKEN}$`)), expiresAt: new Date(NOW + ASK_INVITE_TTL_MS).toISOString() });
    expect(new URL(response.body.url).pathname).toBe(`/r/${TOKEN}`);
    expect(createAskInvite).toHaveBeenCalledWith(7, 12);
    expect(JSON.stringify(recordActivity.mock.calls)).not.toContain(TOKEN);
    expect(JSON.stringify(recordActivity.mock.calls)).toContain("ask_invite.created");
  });

  it.each([
    [new AskInviteNotFoundError(), 404, "This link is not available"],
    [new AskInviteNotWaitingError(), 409, "ask_not_waiting"],
    [new AskInviteLinkActiveError(), 409, "link_active"],
  ])("maps create failures safely", async (failure, status, code) => {
    vi.stubEnv("BYOR_LINK_ENABLED", "true");
    const { app } = setup({ createAskInvite: vi.fn(async () => { throw failure; }) });
    const response = await request(app).post("/api/company-referrals/12/invite-link").set("x-test-user", "7");
    expect(response.status).toBe(status);
    expect(response.body.error).toBe(code);
    expect(JSON.stringify(response.body)).not.toContain(TOKEN);
  });

  it("maps the weekly cap to 429 with the next slot timestamp", async () => {
    vi.stubEnv("BYOR_LINK_ENABLED", "true");
    const nextSlotAt = new Date(NOW + ASK_INVITE_TTL_MS);
    const { app } = setup({ createAskInvite: vi.fn(async () => { throw new AskInviteCapReachedError(nextSlotAt); }) });
    const response = await request(app).post("/api/company-referrals/12/invite-link").set("x-test-user", "7");
    expect(response.status).toBe(429);
    expect(response.body).toEqual({ error: "weekly_link_cap", nextSlotAt: nextSlotAt.toISOString() });
  });

  it("revokes idempotently and records the link id without a token", async () => {
    vi.stubEnv("BYOR_LINK_ENABLED", "true");
    const { app, revokeAskInvite, recordActivity } = setup();
    const response = await request(app).post("/api/company-referrals/12/invite-link/revoke").set("x-test-user", "7");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.body).toEqual({ revoked: true });
    expect(revokeAskInvite).toHaveBeenCalledWith(7, 12);
    expect(JSON.stringify(recordActivity.mock.calls)).not.toContain(TOKEN);
    expect(JSON.stringify(recordActivity.mock.calls)).toContain("ask_invite.revoked");
  });
});

describe("D-090 public landing route", () => {
  it("returns 404 before identity or database access when BYOR is disabled", async () => {
    vi.stubEnv("BYOR_LINK_ENABLED", "false");
    const { app, identityReads, getAskInviteLanding } = setup();
    const response = await request(app).get(`/api/ask-invites/${TOKEN}`);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "This link is not available" });
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(identityReads).not.toHaveBeenCalled();
    expect(getAskInviteLanding).not.toHaveBeenCalled();
  });

  it("returns only public ask facts to a signed-out visitor and never logs the token", async () => {
    vi.stubEnv("BYOR_LINK_ENABLED", "true");
    const { app, getAskInviteLanding, recordActivity, loggedPaths } = setup();
    const response = await request(app).get(`/api/ask-invites/${TOKEN}`);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.body).toEqual({ invite: PUBLIC_INVITE });
    expect(Object.keys(response.body.invite).sort()).toEqual(["companyName", "jobFunction", "location", "lockedFileCount", "note", "roleTitle", "state", "workMode"]);
    expect(JSON.stringify(response.body)).not.toMatch(/seekerUserId|claimer|email|userId|attachment|wallet|plan|hash|token/);
    expect(getAskInviteLanding).toHaveBeenCalledWith(TOKEN, undefined);
    expect(JSON.stringify(recordActivity.mock.calls)).not.toContain(TOKEN);
    expect(loggedPaths.join(" ")).not.toContain(TOKEN);
  });

  it("returns the private note and locked-file count only for a verified same-domain employee", async () => {
    vi.stubEnv("BYOR_LINK_ENABLED", "true");
    const { app, getAskInviteLanding, recordActivity } = setup({ getAskInviteLanding: vi.fn(async () => ({ invite: PRIVATE_INVITE, requestId: 12, linkId: 31 })) });
    const response = await request(app).get(`/api/ask-invites/${TOKEN}`).set("x-test-user", "9");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ invite: PRIVATE_INVITE });
    expect(getAskInviteLanding).toHaveBeenCalledWith(TOKEN, 9);
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "ask_invite.opened", outcome: "success", metadata: { requestId: 12, linkId: 31 } }));
    expect(JSON.stringify(recordActivity.mock.calls)).not.toMatch(/token|email|name/);
  });

  it.each(["unknown", "blocked"]) ("uses the same neutral 404 body for %s tokens/viewers", async reason => {
    vi.stubEnv("BYOR_LINK_ENABLED", "true");
    const { app } = setup({ getAskInviteLanding: vi.fn(async () => undefined) });
    const response = await request(app).get(`/api/ask-invites/${TOKEN}`).set("x-test-user", reason === "blocked" ? "9" : "");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "This link is not available" });
    expect(response.headers["cache-control"]).toContain("no-store");
  });

  it("never returns the internal ask/link ids, including when the claimer opens their reservation", async () => {
    vi.stubEnv("BYOR_LINK_ENABLED", "true");
    const { app } = setup({ getAskInviteLanding: vi.fn(async () => ({ invite: { ...PRIVATE_INVITE, state: "claimed_by_you" }, requestId: 12, linkId: 31 })) });
    const response = await request(app).get(`/api/ask-invites/${TOKEN}`).set("x-test-user", "9");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ invite: { ...PRIVATE_INVITE, state: "claimed_by_you" } });
    expect(JSON.stringify(response.body)).not.toMatch(/requestId|linkId|userId|claimer/);
  });
});

describe("D-090 authenticated claim route", () => {
  it("returns 404 before identity or database access when BYOR is disabled", async () => {
    vi.stubEnv("BYOR_LINK_ENABLED", "false");
    const { app, identityReads, claimAskInvite } = setup();
    const response = await request(app).post(`/api/ask-invites/${TOKEN}/claim`).set("x-test-user", "9");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "This link is not available" });
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(identityReads).not.toHaveBeenCalled();
    expect(claimAskInvite).not.toHaveBeenCalled();
  });

  it("returns the real delivery outcome without echoing the raw token", async () => {
    vi.stubEnv("BYOR_LINK_ENABLED", "true");
    const { app, claimAskInvite, recordActivity, loggedPaths } = setup({ claimAskInvite: vi.fn(async () => ({ outcome: "delivered", claimedNow: true, requestId: 12, linkId: 31 })) });
    const response = await request(app).post(`/api/ask-invites/${TOKEN}/claim`).set("x-test-user", "9");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.body).toEqual({ outcome: "delivered" });
    expect(claimAskInvite).toHaveBeenCalledWith(TOKEN, 9);
    expect(recordActivity).not.toHaveBeenCalled();
    expect(loggedPaths.join(" ")).not.toContain(TOKEN);
  });

  it("requires authentication before attempting a claim", async () => {
    vi.stubEnv("BYOR_LINK_ENABLED", "true");
    const { app, claimAskInvite } = setup();
    const response = await request(app).post(`/api/ask-invites/${TOKEN}/claim`);
    expect(response.status).toBe(401);
    expect(claimAskInvite).not.toHaveBeenCalled();
  });

  it.each([
    ["not_available", 404],
    ["company_email_required", 403],
    ["referrer_unavailable", 403],
    ["link_used", 409],
    ["link_expired", 409],
    ["link_revoked", 409],
    ["ask_unavailable", 409],
  ])("maps claim error %s to %i without revealing the token", async (code, status) => {
    vi.stubEnv("BYOR_LINK_ENABLED", "true");
    const { app } = setup({ claimAskInvite: vi.fn(async () => { throw codedError(code); }) });
    const response = await request(app).post(`/api/ask-invites/${TOKEN}/claim`).set("x-test-user", "9");
    expect(response.status).toBe(status);
    expect(response.body.error).toBe(code === "not_available" ? "This link is not available" : code);
    expect(JSON.stringify(response.body)).not.toContain(TOKEN);
    expect(response.headers["cache-control"]).toContain("no-store");
  });
});
