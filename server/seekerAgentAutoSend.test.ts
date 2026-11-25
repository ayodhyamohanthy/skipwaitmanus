import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import {
  AGENT_ERROR,
  AGENT_KEY_PREFIX,
  AGENT_SEND_DAILY_CAP,
  setAgentAutoSendInputSchema,
  type AgentGrantView,
  type AgentSendRequestView,
} from "../shared/seekerAgents";
import { buildClaimedAskDetailView } from "./referrerAskView";
import {
  registerSeekerAgentRoutes,
  resetAgentCallWindowsForTest,
  type DraftRow,
  type EventRow,
  type GrantRow,
  type SeekerAgentStore,
} from "./seekerAgentRoutes";
import { AgentSendRefusal } from "./agentSendApproval";

const NOW = new Date("2026-11-24T10:00:00.000Z");

function fakeStore() {
  let seq = 1;
  const grants: GrantRow[] = [];
  const drafts: DraftRow[] = [];
  const events: EventRow[] = [];
  const pausedUsers = new Set<number>();
  const sendRequests: Array<{ id: number; userId: number; grantId: number; draftId: number; expiresAt: Date }> = [];

  const store: SeekerAgentStore = {
    createGrant: async input => {
      const row: GrantRow = {
        id: seq++,
        userId: input.userId,
        name: input.name,
        keyPrefix: input.keyPrefix,
        canLookup: input.canLookup,
        canDraft: input.canDraft,
        canSend: input.canSend,
        autoSend: false,
        maxCreditsPerAsk: input.limits.creditsPerAsk,
        maxCreditsPerDay: input.limits.creditsPerDay,
        maxCreditsPerWeek: input.limits.creditsPerWeek,
        maxAsksPerDay: input.limits.asksPerDay,
        expiresAt: input.expiresAt,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(NOW),
      };
      grants.push(row);
      return row;
    },
    listGrants: async userId => grants.filter(g => g.userId === userId),
    getGrantForUser: async (userId, id) => grants.find(g => g.userId === userId && g.id === id),
    findGrantByKeyHash: async () => undefined,
    revokeGrant: async (userId, id) => {
      const g = grants.find(x => x.userId === userId && x.id === id);
      if (g) g.revokedAt = new Date(NOW);
      return Boolean(g);
    },
    setAutoSend: async (userId, id, enabled) => {
      const g = grants.find(x => x.userId === userId && x.id === id);
      if (g) g.autoSend = enabled;
      return Boolean(g);
    },
    touchLastUsed: async (id, now) => {
      const g = grants.find(x => x.id === id);
      if (g) g.lastUsedAt = now;
    },
    isPaused: async userId => pausedUsers.has(userId),
    setPaused: async (userId, paused) => {
      if (paused) pausedUsers.add(userId);
      else pausedUsers.delete(userId);
    },
    createDraft: async input => {
      const row: DraftRow = { id: seq++, status: "draft", createdAt: new Date(NOW), ...input };
      drafts.push(row);
      return row;
    },
    listDraftsByGrant: async grantId => drafts.filter(d => d.grantId === grantId),
    getDraftForGrant: async (grantId, draftId) => drafts.find(d => d.grantId === grantId && d.id === draftId),
    createSendRequest: async input => {
      const id = seq++;
      const expiresAt = input.expiresAt;
      sendRequests.push({ id, userId: input.userId, grantId: input.grantId, draftId: input.draft.id, expiresAt });
      return { id, expiresAt };
    },
    sumDraftCreditsSince: async (grantId, since) =>
      drafts.filter(d => d.grantId === grantId && d.createdAt >= since && d.status === "draft").reduce((n, d) => n + d.creditCost, 0),
    countDraftsSince: async (grantId, since) =>
      drafts.filter(d => d.grantId === grantId && d.createdAt >= since && d.status === "draft").length,
    listEvents: async (userId, grantId) => events.filter(e => e.grantId === grantId),
    recordEvent: async input => {
      events.push({ id: seq++, createdAt: new Date(NOW), detail: null, ...input });
    },
  };

  const byHash = new Map<string, GrantRow>();
  const origCreate = store.createGrant;
  store.createGrant = async input => {
    const row = await origCreate(input);
    byHash.set(input.keyHash, row);
    return row;
  };
  store.findGrantByKeyHash = async hash => byHash.get(hash);

  return { store, grants, drafts, events, pausedUsers, sendRequests };
}

const companies = [
  { slug: "wipro", name: "Wipro", initials: "WI", industry: "IT", location: "Bengaluru", functions: ["engineering"], blurb: "b", domains: ["wipro.com"], openToReferrals: true },
];

function makeApp(opts: {
  userId?: number;
  enabled?: boolean;
  autoSendEnabled?: boolean;
  allowed?: ReadonlySet<number>;
  decideApproval?: (userId: number, approvalId: number, decision: "approved" | "declined", options?: any, deps?: any) => Promise<any>;
} = {}) {
  const { store, grants, drafts, events, sendRequests } = fakeStore();
  const app = express();
  app.use(express.json());
  registerSeekerAgentRoutes(app, {
    enabled: () => opts.enabled ?? true,
    autoSendEnabled: () => opts.autoSendEnabled ?? true,
    allowedUserIds: () => opts.allowed ?? new Set([7, 8]),
    resolveIdentity: async () => (opts.userId ? { account: { id: opts.userId } } : undefined),
    store,
    listCompanies: async () => companies as any,
    prices: async (_req, region) => ({ region, currency: "USD", free: { openRequests: 3, creditsPerMonth: 3 }, plans: [], packs: [], sessions: [] } as any),
    quoteCost: () => ({ level: 1, cost: 1 }),
    getCompanyDirectoryEntry: async slug => (slug === "wipro" ? { name: "Wipro", domains: ["wipro.com"] } : undefined),
    listResumes: async () => [{ id: 41, fileName: "cv.pdf", createdAt: NOW }],
    notifySendRequest: async () => undefined,
    decideApproval: opts.decideApproval,
    now: () => NOW.getTime(),
  });
  return { app, store, grants, drafts, events, sendRequests };
}

beforeEach(() => resetAgentCallWindowsForTest());

describe("SKIPPY-7: contract and storage", () => {
  it("AgentGrantView carries autoSend and defaults to false for a grant created without it", () => {
    const grant: AgentGrantView = {
      id: 1,
      name: "helper",
      keyPrefix: "swa_1234",
      scopes: ["lookup", "draft"],
      limits: { creditsPerAsk: 10, creditsPerDay: 20, creditsPerWeek: 50, asksPerDay: 3 },
      autoSend: false,
      status: "active",
      expiresAt: NOW.toISOString(),
      lastUsedAt: null,
      createdAt: NOW.toISOString(),
    };
    expect(grant.autoSend).toBe(false);
  });

  it("setAgentAutoSendInputSchema rejects an unknown field and a non-boolean", () => {
    expect(setAgentAutoSendInputSchema.parse({ enabled: true })).toEqual({ enabled: true });
    expect(setAgentAutoSendInputSchema.parse({ enabled: false })).toEqual({ enabled: false });
    expect(() => setAgentAutoSendInputSchema.parse({ enabled: true, extra: "field" })).toThrow();
    expect(() => setAgentAutoSendInputSchema.parse({ enabled: "true" as any })).toThrow();
    expect(() => setAgentAutoSendInputSchema.parse({ enabled: 1 as any })).toThrow();
  });
});

describe("SKIPPY-7: turning it on", () => {
  it("a seeker turns auto-send on for their own grant with send; row reads autoSend: true and one grant.auto_send event exists", async () => {
    const { app, grants, events } = makeApp({ userId: 7 });
    const createRes = await request(app).post("/api/seeker/agents").send({ name: "send-bot", scopes: ["lookup", "draft", "send"] });
    expect(createRes.status).toBe(201);
    const grantId = grants[0].id;
    expect(grants[0].autoSend).toBe(false);

    const toggleRes = await request(app).post(`/api/seeker/agents/${grantId}/auto-send`).send({ enabled: true });
    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body).toEqual({ ok: true, autoSend: true });
    expect(grants[0].autoSend).toBe(true);

    const autoSendEvent = events.find(e => e.action === "grant.auto_send");
    expect(autoSendEvent).toBeDefined();
    expect(autoSendEvent?.outcome).toBe("success");
    expect(autoSendEvent?.detail).toBe("on");
  });

  it("a grant without send refuses enabled: true with autoSendScope and changes nothing", async () => {
    const { app, grants } = makeApp({ userId: 7 });
    await request(app).post("/api/seeker/agents").send({ name: "draft-only", scopes: ["lookup", "draft"] });
    const grantId = grants[0].id;

    const res = await request(app).post(`/api/seeker/agents/${grantId}/auto-send`).send({ enabled: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(AGENT_ERROR.autoSendScope);
    expect(grants[0].autoSend).toBe(false);
  });

  it("another seeker's grant id is 404 and nothing changes", async () => {
    const { app } = makeApp({ userId: 8 });
    // Seeker 7 creates a grant
    const { app: app7, grants: grants7 } = makeApp({ userId: 7 });
    await request(app7).post("/api/seeker/agents").send({ name: "seeker-7-bot", scopes: ["send"] });
    const grant7Id = grants7[0].id;

    // Seeker 8 tries to enable auto-send on Seeker 7's grant
    const res = await request(app).post(`/api/seeker/agents/${grant7Id}/auto-send`).send({ enabled: true });
    expect(res.status).toBe(404);
  });

  it("turning it off works on a revoked grant", async () => {
    const { app, grants, events } = makeApp({ userId: 7 });
    await request(app).post("/api/seeker/agents").send({ name: "bot", scopes: ["send"] });
    const grantId = grants[0].id;
    await request(app).post(`/api/seeker/agents/${grantId}/auto-send`).send({ enabled: true });
    expect(grants[0].autoSend).toBe(true);

    // Revoke the grant
    await request(app).post(`/api/seeker/agents/${grantId}/revoke`);
    expect(grants[0].revokedAt).not.toBeNull();

    // Turn auto-send off on the revoked grant
    const offRes = await request(app).post(`/api/seeker/agents/${grantId}/auto-send`).send({ enabled: false });
    expect(offRes.status).toBe(200);
    expect(offRes.body).toEqual({ ok: true, autoSend: false });
    expect(grants[0].autoSend).toBe(false);

    const offEvent = events.filter(e => e.action === "grant.auto_send").at(-1);
    expect(offEvent?.detail).toBe("off");
  });

  it("with SKIPPIE_AGENT_AUTOSEND_ENABLED off, the route is 404 and the stored value is unchanged", async () => {
    const { app, grants } = makeApp({ userId: 7, autoSendEnabled: false });
    await request(app).post("/api/seeker/agents").send({ name: "bot", scopes: ["send"] });
    const grantId = grants[0].id;

    const res = await request(app).post(`/api/seeker/agents/${grantId}/auto-send`).send({ enabled: true });
    expect(res.status).toBe(404);
    expect(grants[0].autoSend).toBe(false);

    // Grant view also reports autoSend: false when flag is off
    const listRes = await request(app).get("/api/seeker/agents");
    expect(listRes.body.agents[0].autoSend).toBe(false);
    expect(listRes.body.autoSendAvailable).toBe(false);
  });
});

describe("SKIPPY-7: the auto-send execution", () => {
  it("with the flag on and autoSend on, a send request returns status: approved with a requestId and agent_auto actor", async () => {
    let capturedActor: string | undefined;
    const decideApproval = async (userId: number, approvalId: number, decision: string, options: any) => {
      // The route passes the actor in the options argument (4th), exactly as the seeker's own approve does.
      capturedActor = options?.actor;
      return { id: approvalId, status: "approved", requestId: 99 };
    };

    const { app, grants, events } = makeApp({ userId: 7, decideApproval });
    const grantRes = await request(app).post("/api/seeker/agents").send({ name: "send-bot", scopes: ["lookup", "draft", "send"] });
    const key = grantRes.body.key;
    const grantId = grants[0].id;

    // Enable auto-send
    await request(app).post(`/api/seeker/agents/${grantId}/auto-send`).send({ enabled: true });

    // Create a draft
    const draftRes = await request(app)
      .post("/api/agent/v1/drafts")
      .set("Authorization", `Bearer ${key}`)
      .send({ companySlug: "wipro", targetRoleUrl: "https://jobs.wipro.com/role/1", note: "Please refer me" });
    const draftId = draftRes.body.draft.id;

    // Trigger send-request
    const sendRes = await request(app)
      .post(`/api/agent/v1/drafts/${draftId}/send-request`)
      .set("Authorization", `Bearer ${key}`);

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.request.status).toBe("approved");
    expect(sendRes.body.request.requestId).toBe(99);
    expect(capturedActor).toBe("agent_auto");

    const autoSendEvent = events.find(e => e.action === "agent.auto_send");
    expect(autoSendEvent).toBeDefined();
    expect(autoSendEvent?.outcome).toBe("success");
    expect(autoSendEvent?.detail).toContain("99");
  });

  it("with autoSend off, the same request returns status: pending and does not call approve", async () => {
    let calledApprove = false;
    const decideApproval = async () => {
      calledApprove = true;
      return { status: "approved" };
    };

    const { app, grants } = makeApp({ userId: 7, decideApproval });
    const grantRes = await request(app).post("/api/seeker/agents").send({ name: "manual-bot", scopes: ["draft", "send"] });
    const key = grantRes.body.key;
    expect(grants[0].autoSend).toBe(false);

    // Create a draft
    const draftRes = await request(app)
      .post("/api/agent/v1/drafts")
      .set("Authorization", `Bearer ${key}`)
      .send({ companySlug: "wipro", targetRoleUrl: "https://jobs.wipro.com/role/1" });

    const sendRes = await request(app)
      .post(`/api/agent/v1/drafts/${draftRes.body.draft.id}/send-request`)
      .set("Authorization", `Bearer ${key}`);

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.request.status).toBe("pending");
    expect(sendRes.body.request.requestId).toBeUndefined();
    expect(calledApprove).toBe(false);
  });

  it("a shortfall (no referral available) parks the row: status: pending, note present, and denied event with needs_referrals", async () => {
    const decideApproval = async () => {
      throw new AgentSendRefusal(AGENT_ERROR.needsReferrals, "needs_referrals");
    };

    const { app, grants, events } = makeApp({ userId: 7, decideApproval });
    const grantRes = await request(app).post("/api/seeker/agents").send({ name: "bot", scopes: ["draft", "send"] });
    const key = grantRes.body.key;
    await request(app).post(`/api/seeker/agents/${grants[0].id}/auto-send`).send({ enabled: true });

    const draftRes = await request(app)
      .post("/api/agent/v1/drafts")
      .set("Authorization", `Bearer ${key}`)
      .send({ companySlug: "wipro", targetRoleUrl: "https://jobs.wipro.com/role/1" });

    const sendRes = await request(app)
      .post(`/api/agent/v1/drafts/${draftRes.body.draft.id}/send-request`)
      .set("Authorization", `Bearer ${key}`);

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.request.status).toBe("pending");
    expect(sendRes.body.request.note).toBe(AGENT_ERROR.needsReferrals);

    const autoSendEvent = events.find(e => e.action === "agent.auto_send");
    expect(autoSendEvent?.outcome).toBe("denied");
    expect(autoSendEvent?.detail).toBe("needs_referrals");
  });

  it("a changed cost between draft and auto-send refuses with cost and parks the row", async () => {
    const decideApproval = async () => {
      throw new AgentSendRefusal("The cost changed. Nothing was spent.", "cost");
    };

    const { app, grants, events } = makeApp({ userId: 7, decideApproval });
    const grantRes = await request(app).post("/api/seeker/agents").send({ name: "bot", scopes: ["draft", "send"] });
    const key = grantRes.body.key;
    await request(app).post(`/api/seeker/agents/${grants[0].id}/auto-send`).send({ enabled: true });

    const draftRes = await request(app)
      .post("/api/agent/v1/drafts")
      .set("Authorization", `Bearer ${key}`)
      .send({ companySlug: "wipro", targetRoleUrl: "https://jobs.wipro.com/role/1" });

    const sendRes = await request(app)
      .post(`/api/agent/v1/drafts/${draftRes.body.draft.id}/send-request`)
      .set("Authorization", `Bearer ${key}`);

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.request.status).toBe("pending");
    expect(sendRes.body.request.note).toBe("The cost changed. Nothing was spent.");

    const autoSendEvent = events.find(e => e.action === "agent.auto_send");
    expect(autoSendEvent?.outcome).toBe("denied");
    expect(autoSendEvent?.detail).toBe("cost");
  });

  it("revoking the grant refuses with grant and sends nothing", async () => {
    const decideApproval = async () => {
      throw new AgentSendRefusal(AGENT_ERROR.revoked, "grant");
    };

    const { app, grants, events } = makeApp({ userId: 7, decideApproval });
    const grantRes = await request(app).post("/api/seeker/agents").send({ name: "bot", scopes: ["draft", "send"] });
    const key = grantRes.body.key;
    await request(app).post(`/api/seeker/agents/${grants[0].id}/auto-send`).send({ enabled: true });

    const draftRes = await request(app)
      .post("/api/agent/v1/drafts")
      .set("Authorization", `Bearer ${key}`)
      .send({ companySlug: "wipro", targetRoleUrl: "https://jobs.wipro.com/role/1" });

    const sendRes = await request(app)
      .post(`/api/agent/v1/drafts/${draftRes.body.draft.id}/send-request`)
      .set("Authorization", `Bearer ${key}`);

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.request.status).toBe("pending");
    expect(sendRes.body.request.note).toBe(AGENT_ERROR.revoked);

    const autoSendEvent = events.find(e => e.action === "agent.auto_send");
    expect(autoSendEvent?.outcome).toBe("denied");
    expect(autoSendEvent?.detail).toBe("grant");
  });

  it("pause-all refuses with grant and sends nothing", async () => {
    const decideApproval = async () => {
      throw new AgentSendRefusal(AGENT_ERROR.paused, "grant");
    };

    const { app, grants, events } = makeApp({ userId: 7, decideApproval });
    const grantRes = await request(app).post("/api/seeker/agents").send({ name: "bot", scopes: ["draft", "send"] });
    const key = grantRes.body.key;
    await request(app).post(`/api/seeker/agents/${grants[0].id}/auto-send`).send({ enabled: true });

    const draftRes = await request(app)
      .post("/api/agent/v1/drafts")
      .set("Authorization", `Bearer ${key}`)
      .send({ companySlug: "wipro", targetRoleUrl: "https://jobs.wipro.com/role/1" });

    const sendRes = await request(app)
      .post(`/api/agent/v1/drafts/${draftRes.body.draft.id}/send-request`)
      .set("Authorization", `Bearer ${key}`);

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.request.status).toBe("pending");
    expect(sendRes.body.request.note).toBe(AGENT_ERROR.paused);

    const autoSendEvent = events.find(e => e.action === "agent.auto_send");
    expect(autoSendEvent?.outcome).toBe("denied");
    expect(autoSendEvent?.detail).toBe("grant");
  });

  it("an over-limit refusal parks the row with limit", async () => {
    const decideApproval = async () => {
      throw new AgentSendRefusal(AGENT_ERROR.sendLimit, "limit");
    };

    const { app, grants, events } = makeApp({ userId: 7, decideApproval });
    const grantRes = await request(app).post("/api/seeker/agents").send({ name: "bot", scopes: ["draft", "send"] });
    const key = grantRes.body.key;
    await request(app).post(`/api/seeker/agents/${grants[0].id}/auto-send`).send({ enabled: true });

    const draftRes = await request(app)
      .post("/api/agent/v1/drafts")
      .set("Authorization", `Bearer ${key}`)
      .send({ companySlug: "wipro", targetRoleUrl: "https://jobs.wipro.com/role/1" });

    const sendRes = await request(app)
      .post(`/api/agent/v1/drafts/${draftRes.body.draft.id}/send-request`)
      .set("Authorization", `Bearer ${key}`);

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.request.status).toBe("pending");
    expect(sendRes.body.request.note).toBe(AGENT_ERROR.sendLimit);

    const autoSendEvent = events.find(e => e.action === "agent.auto_send");
    expect(autoSendEvent?.outcome).toBe("denied");
    expect(autoSendEvent?.detail).toBe("limit");
  });

  it("an agent key reaches no checkout, plan or purchase route", async () => {
    const { app } = makeApp({ userId: 7 });
    const grantRes = await request(app).post("/api/seeker/agents").send({ name: "bot", scopes: ["send"] });
    const key = grantRes.body.key;

    // Check purchase/checkout endpoints
    const p1 = await request(app).post("/api/checkout/create").set("Authorization", `Bearer ${key}`).send({});
    expect([401, 404]).toContain(p1.status);

    const p2 = await request(app).post("/api/plans/checkout").set("Authorization", `Bearer ${key}`).send({});
    expect([401, 404]).toContain(p2.status);
  });

  it("the referrer sees Sent via the seeker's assistant on an auto-sent ask", () => {
    const askWithAssistant = {
      id: 10,
      title: "Senior Engineer",
      targetRoleUrl: "https://jobs.wipro.com/role/1",
      companyDomain: "wipro.com",
      jobFunction: null,
      candidateMessage: "auto-sent pitch",
      status: "pending" as const,
      referrerId: 4,
      revision: 1,
      candidateName: "Seeker",
      documentAccessActive: false,
      sentViaAssistant: true,
      attachments: [],
    };
    const result = buildClaimedAskDetailView(askWithAssistant);
    expect(result.ok && result.view.sentViaAssistant).toBe(true);
  });
});
