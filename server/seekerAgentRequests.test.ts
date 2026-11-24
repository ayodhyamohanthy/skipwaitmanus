// D-178.read (D-290 R9 parity, D-019(e)): an agent reads the seeker's own
// referral requests over REST, with the fields the seeker's /requests page
// shows, and never a referrer's id, name or title. Another account's request is
// never listed: the route reads the token owner's rows, never a client-supplied
// user id.
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerSeekerAgentRoutes, resetAgentCallWindowsForTest, type GrantRow, type SeekerAgentRouteDeps } from "./seekerAgentRoutes";

const NOW = new Date("2026-11-24T09:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const KEY = "swa_" + "a".repeat(64);

const grantFor = (overrides: Partial<GrantRow> = {}): GrantRow => ({
  id: 1, userId: 7, name: "hunt-bot", keyPrefix: "swa_aaaa", canLookup: true, canDraft: true, canSend: true,
  maxCreditsPerAsk: 10, maxCreditsPerDay: 20, maxCreditsPerWeek: 50, maxAsksPerDay: 3,
  expiresAt: new Date(NOW.getTime() + HOUR), revokedAt: null, lastUsedAt: null, createdAt: NOW,
  ...overrides,
});

/** The source row carries referrer identity, exactly as listJobSeekerCompanyReferrals returns it. */
const sourceRow = (overrides: Record<string, unknown> = {}) => ({
  id: 31,
  title: "Senior Designer",
  targetRoleUrl: "https://jobs.wipro.com/role/123",
  companyDomain: "wipro.com",
  compensation: "₹18–24 LPA",
  status: "pending",
  referrerId: 88,
  referrerName: "Priya Sharma",
  referrerTitle: "Design Lead",
  referrerMessage: null,
  waitingForCoverage: false,
  coverageVisibleAt: null,
  coverageHeldAt: null,
  queueStatus: "available_for_review",
  unreadMessageCount: 2,
  attachmentCount: 1,
  createdAt: new Date("2026-11-20T10:00:00Z"),
  updatedAt: new Date("2026-11-21T10:00:00Z"),
  ...overrides,
});

type Deps = {
  listRequests: ReturnType<typeof vi.fn>;
  recordEvent: ReturnType<typeof vi.fn>;
};

function makeApp(options: { enabled?: boolean; grant?: GrantRow | undefined; rows?: Array<Record<string, unknown>> } = {}) {
  const deps: Deps = { listRequests: vi.fn(async () => options.rows ?? [sourceRow()]), recordEvent: vi.fn(async () => undefined) };
  const grant = "grant" in options ? options.grant : grantFor();
  const store = {
    findGrantByKeyHash: async () => grant,
    touchLastUsed: async () => undefined,
    isPaused: async () => false,
    recordEvent: deps.recordEvent,
  } as unknown as SeekerAgentRouteDeps["store"];
  const app = express();
  app.use(express.json());
  registerSeekerAgentRoutes(app, {
    enabled: () => options.enabled ?? true,
    allowedUserIds: () => new Set([7]),
    resolveIdentity: async () => ({ account: { id: 7 } }),
    store,
    listCompanies: async () => [],
    prices: async () => ({}) as never,
    quoteCost: () => ({ level: 1, cost: 1 }),
    getCompanyDirectoryEntry: async () => undefined,
    listResumes: async () => [],
    listRequests: deps.listRequests as unknown as SeekerAgentRouteDeps["listRequests"],
    notifySendRequest: async () => undefined,
    now: () => NOW.getTime(),
  });
  return { app, deps };
}

afterEach(() => resetAgentCallWindowsForTest());

describe("GET /api/agent/v1/requests (D-178.read)", () => {
  it("answers 404 while the agent switch is off", async () => {
    const { app, deps } = makeApp({ enabled: false });
    const res = await request(app).get("/api/agent/v1/requests").set("Authorization", `Bearer ${KEY}`);
    expect(res.status).toBe(404);
    expect(deps.listRequests).not.toHaveBeenCalled();
  });

  it("refuses a missing or malformed key without reading any request", async () => {
    const { app, deps } = makeApp();
    expect((await request(app).get("/api/agent/v1/requests")).status).toBe(401);
    expect((await request(app).get("/api/agent/v1/requests").set("Authorization", "Bearer nope")).status).toBe(401);
    expect(deps.listRequests).not.toHaveBeenCalled();
  });

  it("lists the token owner's own requests with the /requests page fields", async () => {
    const { app, deps } = makeApp();
    const res = await request(app).get("/api/agent/v1/requests").set("Authorization", `Bearer ${KEY}`);
    expect(res.status).toBe(200);
    expect(deps.listRequests).toHaveBeenCalledWith(7);
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0]).toEqual({
      id: 31,
      title: "Senior Designer",
      targetRoleUrl: "https://jobs.wipro.com/role/123",
      companyDomain: "wipro.com",
      compensation: "₹18–24 LPA",
      status: "pending",
      queueStatus: "available_for_review",
      waitingForCoverage: false,
      referrerMessage: null,
      unreadMessageCount: 2,
      attachmentCount: 1,
      createdAt: "2026-11-20T10:00:00.000Z",
      updatedAt: "2026-11-21T10:00:00.000Z",
    });
  });

  it("never returns a referrer's id, name or title, before or after acceptance", async () => {
    for (const status of ["pending", "approved", "intro_made", "declined", "closed"]) {
      const { app } = makeApp({ rows: [sourceRow({ status })] });
      const res = await request(app).get("/api/agent/v1/requests").set("Authorization", `Bearer ${KEY}`);
      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain("referrerId");
      expect(body).not.toContain("referrerName");
      expect(body).not.toContain("referrerTitle");
      expect(body).not.toContain("Priya Sharma");
      expect(body).not.toContain("Design Lead");
      expect(body).not.toContain("88");
    }
  });

  it("reads only the token owner's rows, never a client-supplied user id", async () => {
    const { app, deps } = makeApp();
    const res = await request(app).get("/api/agent/v1/requests?userId=999").set("Authorization", `Bearer ${KEY}`);
    expect(res.status).toBe(200);
    expect(deps.listRequests).toHaveBeenCalledTimes(1);
    expect(deps.listRequests).toHaveBeenCalledWith(7);
  });

  it("answers 503 with plain words when the request list cannot be read", async () => {
    const { app, deps } = makeApp();
    deps.listRequests.mockRejectedValueOnce(new Error("db down"));
    const res = await request(app).get("/api/agent/v1/requests").set("Authorization", `Bearer ${KEY}`);
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/unavailable right now/);
    expect(deps.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "agent.requests", outcome: "failure" }));
  });

  it("refuses a revoked or expired grant before reading any request", async () => {
    const revoked = makeApp({ grant: grantFor({ revokedAt: NOW }) });
    expect((await request(revoked.app).get("/api/agent/v1/requests").set("Authorization", `Bearer ${KEY}`)).status).toBe(401);
    expect(revoked.deps.listRequests).not.toHaveBeenCalled();
    const expired = makeApp({ grant: grantFor({ expiresAt: new Date(NOW.getTime() - HOUR) }) });
    expect((await request(expired.app).get("/api/agent/v1/requests").set("Authorization", `Bearer ${KEY}`)).status).toBe(401);
    expect(expired.deps.listRequests).not.toHaveBeenCalled();
  });

  it("refuses an account that is not on the allow-list", async () => {
    const { app, deps } = makeApp({ grant: grantFor({ userId: 8 }) });
    const res = await request(app).get("/api/agent/v1/requests").set("Authorization", `Bearer ${KEY}`);
    expect(res.status).toBe(404);
    expect(deps.listRequests).not.toHaveBeenCalled();
  });
});
