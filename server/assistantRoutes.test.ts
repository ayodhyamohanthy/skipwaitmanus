import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerAssistantRoutes, type AssistantRouteDeps } from "./assistantRoutes";
import { AssistantPlanRequiredError, OpenAskSlotCapError } from "./planGates";
import { assistantAccessSchema } from "../shared/assistant";
import { openAskSlots, slotCapReachedSchema } from "../shared/openAskSlots";
import { resolvePlanEntitlements } from "../shared/planEntitlements";
import { approvalCostChangedSchema, type ApprovalCost } from "../shared/assistantApprovalCost";

function setup(deps: Partial<AssistantRouteDeps>) {
  const app = express();
  app.use(express.json());
  registerAssistantRoutes(app, {
    resolveIdentity: async req => (req.header("x-test-user") ? { account: { id: 7, openId: "workos-seeker" } } : undefined),
    // Default: no approval in these fixtures would charge on approve (#644 tests below override it).
    readApprovalCosts: async () => new Map(),
    ...deps,
  } as unknown as AssistantRouteDeps);
  return app;
}

// supertest 7: request(app) returns method factories; the
// header goes on the Test each method returns.
const authed = (app: express.Express) => {
  const base = request(app);
  return {
    get: (url: string) => base.get(url).set("x-test-user", "seeker"),
    post: (url: string) => base.post(url).set("x-test-user", "seeker"),
    patch: (url: string) => base.patch(url).set("x-test-user", "seeker"),
    put: (url: string) => base.put(url).set("x-test-user", "seeker"),
    delete: (url: string) => base.delete(url).set("x-test-user", "seeker"),
  };
};

describe("assistant access routes", () => {
  it("requires sign-in for every operation", async () => {
    const app = setup({ listAssistantConnections: async () => [] });
    const paths = [
      ["get", "/api/assistants/access"],
      ["get", "/api/assistants/connections"],
      ["post", "/api/assistants/connections"],
      ["delete", "/api/assistants/connections/1"],
      ["get", "/api/assistants/tokens"],
      ["post", "/api/assistants/tokens"],
      ["delete", "/api/assistants/tokens/1"],
      ["get", "/api/assistants/approvals"],
      ["post", "/api/assistants/approvals"],
      ["patch", "/api/assistants/approvals/1"],
      ["post", "/api/assistants/approvals/1/decision"],
      ["get", "/api/assistants/activity"],
      ["get", "/api/developer-apps"],
      ["post", "/api/developer-apps"],
      ["get", "/api/developer-apps/1"],
      ["put", "/api/developer-apps/1/webhook"],
    ] as const;
    for (const [method, path] of paths) {
      const response = await (request(app) as unknown as Record<string, (path: string) => request.Test>)[method](path);
      expect(response.status).toBe(401);
    }
  });

  it("reports the plan entitlement honestly and never caches it", async () => {
    const app = setup({ getAssistantAccess: async () => ({ plan: "start", planLabel: "Start", tier: "start", hasAccess: false }) });
    const start = await authed(app).get("/api/assistants/access");
    expect(start.body).toEqual({ plan: "start", planLabel: "Start", tier: "start", hasAccess: false });
    expect(start.headers["cache-control"]).toBe("private, no-store");
    expect(assistantAccessSchema.safeParse(start.body).success).toBe(true);
    // D-067: a retired plan id is not an entitled plan, so it can never be reported as one.
    expect(assistantAccessSchema.safeParse({ ...start.body, plan: "max" }).success).toBe(false);
    const paid = setup({ getAssistantAccess: async () => ({ plan: "land_focus", planLabel: "Land Focus", tier: "land", hasAccess: true }) });
    expect((await authed(paid).get("/api/assistants/access")).body).toEqual({ plan: "land_focus", planLabel: "Land Focus", tier: "land", hasAccess: true });
  });

  it("asks the access check about the signed-in caller only", async () => {
    const access = vi.fn(async (userId: number) => ({ plan: "land_focus" as const, planLabel: "Land Focus", tier: "land" as const, hasAccess: userId === 7 }));
    const app = setup({ getAssistantAccess: access });
    expect((await authed(app).get("/api/assistants/access?userId=8")).body.hasAccess).toBe(true);
    expect(access).toHaveBeenCalledWith(7);
    expect(access).not.toHaveBeenCalledWith(8);
  });

  it("connects, lists, and disconnects through injected deps", async () => {
    const connections = [{ id: 1, provider: "chatgpt", appName: "ChatGPT", scopes: ["read", "draft"], status: "connected", lastUsedAt: null, connectedAt: "2026-10-09T00:00:00.000Z" }];
    const disconnect = vi.fn(async () => ({ revoked: true, id: 1 }));
    const app = setup({
      listAssistantConnections: async () => connections,
      connectAssistant: async (_userId, input) => ({ id: 2, provider: input.provider, appName: input.appName, scopes: input.scopes, status: "connected", lastUsedAt: null, connectedAt: "2026-10-09T00:00:00.000Z" }),
      disconnectAssistant: disconnect,
    });
    const listed = await authed(app).get("/api/assistants/connections");
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({ connections });
    const created = await authed(app).post("/api/assistants/connections").send({ provider: "claude", appName: "Claude", scopes: ["read"] });
    expect(created.status).toBe(201);
    expect(created.body.connection.provider).toBe("claude");
    const removed = await authed(app).delete("/api/assistants/connections/1");
    expect(removed.body).toEqual({ revoked: true, id: 1 });
    expect(disconnect).toHaveBeenCalledWith(7, 1);
  });

  it("maps validation, ownership and plan failures honestly", async () => {
    const validation = setup({ connectAssistant: async () => { throw new Error("Choose ChatGPT, Claude, or another assistant"); } });
    expect((await authed(validation).post("/api/assistants/connections").send({})).status).toBe(400);
    const ownership = setup({ disconnectAssistant: async () => { throw new Error("This assistant is not connected to your account"); } });
    expect((await authed(ownership).delete("/api/assistants/connections/9")).status).toBe(404);
    const plan = setup({ connectAssistant: async () => { throw new AssistantPlanRequiredError(); } });
    const gated = await authed(plan).post("/api/assistants/connections").send({ provider: "chatgpt" });
    expect(gated.status).toBe(402);
    expect(gated.body.error).toBe("Assistants are part of Land and Concierge, which are not on sale yet, so ChatGPT, Claude and your own tools cannot connect to this account.");
    const tokens = setup({ createAssistantToken: async () => { throw new AssistantPlanRequiredError(); } });
    expect((await authed(tokens).post("/api/assistants/tokens").send({ name: "Tracker" })).status).toBe(402);
  });

  it("returns the typed slot-cap body when an approved ask would pass the plan's open-ask cap", async () => {
    const slots = openAskSlots(resolvePlanEntitlements(null), 3);
    const app = setup({ decideAssistantApproval: async () => { throw new OpenAskSlotCapError(slots); } });
    const response = await authed(app).post("/api/assistants/approvals/1/decision").send({ decision: "approved" });
    expect(response.status).toBe(409);
    expect(slotCapReachedSchema.parse(response.body)).toMatchObject({ code: "slot_cap_reached", slots: { open: 3, cap: 3, full: true, planLabel: "Free", nextPlan: null } });
    expect(response.body.error).toBe("All 3 slots are in use. Wait for an answer or withdraw an ask.");
  });

  it("creates tokens and shows the plaintext once", async () => {
    const createToken = vi.fn(async () => ({ id: 3, name: "Notion tracker", prefix: "sw_AbCd", token: "sw_full-secret-once", createdAt: "2026-10-09T00:00:00.000Z" }));
    const app = setup({
      createAssistantToken: createToken,
      listAssistantTokens: async () => [{ id: 3, name: "Notion tracker", prefix: "sw_AbCd", lastUsedAt: null, createdAt: "2026-10-09T00:00:00.000Z" }],
    });
    const created = await authed(app).post("/api/assistants/tokens").send({ name: "Notion tracker" });
    expect(created.status).toBe(201);
    expect(created.body.token.token).toBe("sw_full-secret-once");
    const listed = await authed(app).get("/api/assistants/tokens");
    expect(listed.body.tokens[0]).not.toHaveProperty("token");
    expect(createToken).toHaveBeenCalledWith(7, { name: "Notion tracker" });
  });

  it("lists, creates, edits, and decides approvals", async () => {
    const approval = { id: 5, kind: "ask_send", status: "pending", provider: "ChatGPT", companyDomain: "wipro.com", role: "Senior Product Designer", note: "Hi — I'd love a referral.", creditCount: null, slotCount: 3, createdAt: "2026-10-09T00:00:00.000Z", expiresAt: "2026-10-10T00:00:00.000Z" };
    const decide = vi.fn(async () => ({ id: 5, status: "approved" }));
    const app = setup({
      listAssistantApprovals: async () => [approval],
      createAssistantApproval: async () => approval,
      editAssistantApproval: async (_userId, id, input) => ({ id, note: input.note }),
      decideAssistantApproval: decide,
    });
    const listed = await authed(app).get("/api/assistants/approvals");
    expect(listed.body.approvals[0].kind).toBe("ask_send");
    const created = await authed(app).post("/api/assistants/approvals").send({ kind: "ask_send", provider: "ChatGPT", note: "Hi" });
    expect(created.status).toBe(201);
    const edited = await authed(app).patch("/api/assistants/approvals/5").send({ note: "Edited note" });
    expect(edited.body.approval.note).toBe("Edited note");
    const decided = await authed(app).post("/api/assistants/approvals/5/decision").send({ decision: "approved" });
    expect(decided.body.approval).toEqual({ id: 5, status: "approved" });
    expect(decide).toHaveBeenCalledWith(7, 5, "approved");
    expect((await authed(app).post("/api/assistants/approvals/5/decision").send({ decision: "maybe" })).status).toBe(400);
  });

  it("rejects an approval decision for an already-handled request", async () => {
    const app = setup({ decideAssistantApproval: async () => { throw new Error("This approval was already handled"); } });
    expect((await authed(app).post("/api/assistants/approvals/5/decision").send({ decision: "approved" })).status).toBe(404);
  });

  it("lists assistant activity from the operational log", async () => {
    const app = setup({ listAssistantActivity: async () => [{ action: "assistant.connected", outcome: "success", resourceType: "assistant_connection", metadata: {}, createdAt: "2026-10-09T00:00:00.000Z" }] });
    const response = await authed(app).get("/api/assistants/activity");
    expect(response.status).toBe(200);
    expect(response.body.activity[0].action).toBe("assistant.connected");
  });

  it("registers developer apps with validation and terms", async () => {
    const app = setup({
      createDeveloperApp: async (_userId, input) => ({ id: 1, name: input.name, kind: input.kind, description: input.description, website: input.website, redirectUrls: input.redirectUrls, scopes: input.scopes, status: "test", rejectReasons: [], webhookUrl: null, clientId: "sw_app_abc123", createdAt: "2026-10-09T00:00:00.000Z" }),
      listDeveloperApps: async () => [],
      getDeveloperApp: async () => null,
      updateDeveloperAppWebhook: async (_userId, id, input) => ({ id, webhookUrl: input.webhookUrl }),
    });
    const created = await authed(app).post("/api/developer-apps").send({ name: "Instinct", kind: "agent_mcp", description: "AI agent", redirectUrls: ["https://instinct.app/cb"], scopes: ["companies:read"], agreeToTerms: true });
    expect(created.status).toBe(201);
    expect(created.body.app.status).toBe("test");
    expect((await authed(app).get("/api/developer-apps/1")).status).toBe(404);
    const hooked = await authed(app).put("/api/developer-apps/1/webhook").send({ webhookUrl: "https://instinct.app/hooks" });
    expect(hooked.body).toEqual({ id: 1, webhookUrl: "https://instinct.app/hooks" });
    const missingTerms = setup({ createDeveloperApp: async () => { throw new Error("Agree to the developer terms to register an app"); } });
    expect((await authed(missingTerms).post("/api/developer-apps").send({ name: "X", kind: "web_app", description: "d", redirectUrls: ["https://a.app/cb"], scopes: ["companies:read"] })).status).toBe(400);
  });

  it("submits a test app for review", async () => {
    const submit = vi.fn(async () => ({ id: 1, status: "in_review" }));
    const app = setup({ submitDeveloperAppForReview: submit });
    const response = await authed(app).post("/api/developer-apps/1/submit");
    expect(response.status).toBe(200);
    expect(response.body.app.status).toBe("in_review");
    expect(submit).toHaveBeenCalledWith(7, 1);
    const blocked = setup({ submitDeveloperAppForReview: async () => { throw new Error("Only test apps can be submitted for review"); } });
    expect((await authed(blocked).post("/api/developer-apps/1/submit")).status).toBe(400);
  });
});

describe("an approved assistant ask charges exactly the cost shown, or nothing (#644)", () => {
  const SHOWN: ApprovalCost = { level: 5, cost: 5 };
  const pricedAt = (cost: ApprovalCost | null) => vi.fn(async (_userId: number, ids: number[]) => new Map(cost ? ids.map(id => [id, cost] as const) : []));
  const ask = { id: 5, kind: "ask_send", status: "pending", provider: "ChatGPT", companyDomain: "acme.com", role: null, note: "Hi", creditCount: 1, slotCount: 2, createdAt: "2026-10-27T00:00:00.000Z", expiresAt: "2026-10-28T00:00:00.000Z" };

  it("lists each pending ask with the cost it would charge now, priced by one owner-scoped read", async () => {
    const spend = { ...ask, id: 6, kind: "credit_spend", creditCount: 3 };
    const handled = { ...ask, id: 4, status: "approved" };
    const readApprovalCosts = vi.fn(async () => new Map([[5, SHOWN]]));
    const app = setup({ listAssistantApprovals: async () => [ask, spend, handled] as never, readApprovalCosts });
    const listed = await authed(app).get("/api/assistants/approvals");
    expect(listed.status).toBe(200);
    expect(readApprovalCosts).toHaveBeenCalledWith(7, [5]);
    expect(listed.body.approvals[0]).toEqual({ ...ask, cost: SHOWN });
    expect(listed.body.approvals[1]).not.toHaveProperty("cost");
    expect(listed.body.approvals[2]).not.toHaveProperty("cost");
  });

  it("sends when the shown cost is still the cost", async () => {
    const decide = vi.fn(async () => ({ id: 5, status: "approved" as const, requestId: 41 }));
    const readApprovalCosts = pricedAt(SHOWN);
    const app = setup({ decideAssistantApproval: decide, readApprovalCosts });
    const response = await authed(app).post("/api/assistants/approvals/5/decision").send({ decision: "approved", kind: "ask_send", expectedCost: SHOWN });
    expect(response.status).toBe(200);
    expect(readApprovalCosts).toHaveBeenCalledWith(7, [5]);
    expect(decide).toHaveBeenCalledWith(7, 5, "approved");
  });

  it("answers 409 cost_changed with the current cost, and never runs the charge, when the shown cost is missing or different", async () => {
    for (const expectedCost of [undefined, null, 5, { cost: 5 }, { level: 5, cost: 1 }, { level: 4, cost: 5 }, { ...SHOWN, spendSource: "free" }]) {
      const decide = vi.fn(async () => ({ id: 5, status: "approved" as const }));
      const recordActivity = vi.fn(async () => undefined);
      const app = setup({ decideAssistantApproval: decide, readApprovalCosts: pricedAt(SHOWN), recordActivity });
      const response = await authed(app).post("/api/assistants/approvals/5/decision").send({ decision: "approved", kind: "ask_send", expectedCost });
      expect(response.status, JSON.stringify(expectedCost)).toBe(409);
      expect(approvalCostChangedSchema.parse(response.body)).toEqual({ code: "cost_changed", cost: SHOWN, error: "This referral request now costs 5 referrals. Approve again to send it at that cost." });
      expect(decide).not.toHaveBeenCalled();
      expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "assistant.approval_cost_changed", outcome: "denied", resourceId: 5 }));
    }
  });

  it("re-approval at the new cost goes through, so the owner is never stuck in a loop", async () => {
    const decide = vi.fn(async () => ({ id: 5, status: "approved" as const }));
    const app = setup({ decideAssistantApproval: decide, readApprovalCosts: pricedAt(SHOWN) });
    const first = await authed(app).post("/api/assistants/approvals/5/decision").send({ decision: "approved", kind: "ask_send", expectedCost: { level: 5, cost: 1 } });
    expect(first.status).toBe(409);
    const again = await authed(app).post("/api/assistants/approvals/5/decision").send({ decision: "approved", kind: "ask_send", expectedCost: first.body.cost });
    expect(again.status).toBe(200);
    expect(decide).toHaveBeenCalledOnce();
  });

  it("a decline needs no cost and reads none", async () => {
    const decide = vi.fn(async () => ({ id: 5, status: "declined" as const }));
    const readApprovalCosts = pricedAt(SHOWN);
    const app = setup({ decideAssistantApproval: decide, readApprovalCosts });
    const response = await authed(app).post("/api/assistants/approvals/5/decision").send({ decision: "declined", kind: "ask_send" });
    expect(response.status).toBe(200);
    expect(readApprovalCosts).not.toHaveBeenCalled();
    expect(decide).toHaveBeenCalledWith(7, 5, "declined");
  });

  it("an approval that charges nothing on approve (paid-tool marker, handled, expired, not yours) is decided as before", async () => {
    const decide = vi.fn(async () => ({ id: 6, status: "approved" as const }));
    const app = setup({ decideAssistantApproval: decide, readApprovalCosts: pricedAt(null) });
    const response = await authed(app).post("/api/assistants/approvals/6/decision").send({ decision: "approved", kind: "credit_spend" });
    expect(response.status).toBe(200);
    expect(decide).toHaveBeenCalledWith(7, 6, "approved");
  });

  it("fails closed when the current cost cannot be read: nothing is charged", async () => {
    const decide = vi.fn(async () => ({ id: 5, status: "approved" as const }));
    const app = setup({ decideAssistantApproval: decide, readApprovalCosts: async () => { throw new Error("Database unavailable"); } });
    const response = await authed(app).post("/api/assistants/approvals/5/decision").send({ decision: "approved", kind: "ask_send", expectedCost: SHOWN });
    expect(response.status).toBe(500);
    expect(decide).not.toHaveBeenCalled();
  });
});
