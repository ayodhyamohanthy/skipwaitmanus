import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ASK_INVITE_TTL_MS } from "../shared/askInvites";
import { AskInviteCapReachedError, AskInviteLinkActiveError, AskInviteNotFoundError, AskInviteNotWaitingError } from "./askInvites";
import { registerAskInviteRoutes } from "./askInviteRoutes";

const TOKEN = "a".repeat(43);
const NOW = Date.parse("2026-10-23T12:00:00.000Z");

afterEach(() => { vi.unstubAllEnvs(); });

function setup(over: {
  createAskInvite?: ReturnType<typeof vi.fn>;
  revokeAskInvite?: ReturnType<typeof vi.fn>;
  recordActivity?: ReturnType<typeof vi.fn>;
} = {}) {
  const app = express();
  app.use(express.json());
  const identityReads = vi.fn(async req => req.header("x-test-user") ? { account: { id: 7, openId: "test" } } : undefined);
  const createAskInvite = over.createAskInvite ?? vi.fn(async () => ({ id: 31, token: TOKEN, createdAt: new Date(NOW), expiresAt: new Date(NOW + ASK_INVITE_TTL_MS) }));
  const revokeAskInvite = over.revokeAskInvite ?? vi.fn(async () => ({ revoked: true, linkId: 31 }));
  const recordActivity = over.recordActivity ?? vi.fn(async () => undefined);
  registerAskInviteRoutes(app, { resolveIdentity: identityReads, createAskInvite, revokeAskInvite, recordActivity });
  return { app, identityReads, createAskInvite, revokeAskInvite, recordActivity };
}

describe("D-090 create/revoke HTTP routes", () => {
  it("returns 404 before identity or database work when the server flag is off", async () => {
    vi.stubEnv("BYOR_LINK_ENABLED", "false");
    const { app, identityReads, createAskInvite } = setup();
    const response = await request(app).post("/api/company-referrals/12/invite-link").set("x-test-user", "seeker");
    expect(response.status).toBe(404);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(identityReads).not.toHaveBeenCalled();
    expect(createAskInvite).not.toHaveBeenCalled();
  });

  it("returns a token and one-time URL exactly once with no-store and a token-free activity row", async () => {
    vi.stubEnv("BYOR_LINK_ENABLED", "true");
    const { app, createAskInvite, recordActivity } = setup();
    const response = await request(app).post("/api/company-referrals/12/invite-link").set("x-test-user", "seeker").set("Origin", "https://skipwait.me");
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
    const response = await request(app).post("/api/company-referrals/12/invite-link").set("x-test-user", "seeker");
    expect(response.status).toBe(status);
    expect(response.body.error).toBe(code);
    expect(JSON.stringify(response.body)).not.toContain(TOKEN);
  });

  it("maps the weekly cap to 429 with the next slot timestamp", async () => {
    vi.stubEnv("BYOR_LINK_ENABLED", "true");
    const nextSlotAt = new Date(NOW + ASK_INVITE_TTL_MS);
    const { app } = setup({ createAskInvite: vi.fn(async () => { throw new AskInviteCapReachedError(nextSlotAt); }) });
    const response = await request(app).post("/api/company-referrals/12/invite-link").set("x-test-user", "seeker");
    expect(response.status).toBe(429);
    expect(response.body).toEqual({ error: "weekly_link_cap", nextSlotAt: nextSlotAt.toISOString() });
  });

  it("revokes idempotently and records the link id without a token", async () => {
    vi.stubEnv("BYOR_LINK_ENABLED", "true");
    const { app, revokeAskInvite, recordActivity } = setup();
    const response = await request(app).post("/api/company-referrals/12/invite-link/revoke").set("x-test-user", "seeker");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.body).toEqual({ revoked: true });
    expect(revokeAskInvite).toHaveBeenCalledWith(7, 12);
    expect(JSON.stringify(recordActivity.mock.calls)).not.toContain(TOKEN);
    expect(JSON.stringify(recordActivity.mock.calls)).toContain("ask_invite.revoked");
  });
});
