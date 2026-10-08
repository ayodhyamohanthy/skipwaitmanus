import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerAssistantRoutes, type AssistantRouteDeps } from "./assistantRoutes";

function setup(deps: Partial<AssistantRouteDeps>) {
  const app = express();
  app.use(express.json());
  registerAssistantRoutes(app, {
    resolveIdentity: async req => (req.header("x-test-user") ? { account: { id: 7, openId: "workos-seeker" } } : undefined),
    ...deps,
  } as unknown as AssistantRouteDeps);
  return app;
}

const authed = (app: express.Express) => request.agent(app).set("x-test-user", "seeker");

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

  it("reports plan access honestly", async () => {
    const app = setup({ getAssistantAccessPlan: async () => "pro" });
    const free = await authed(app).get("/api/assistants/access");
    expect(free.body).toEqual({ plan: "pro", hasAccess: false });
    const paid = setup({ getAssistantAccessPlan: async () => "max" });
    expect((await authed(paid).get("/api/assistants/access")).body).toEqual({ plan: "max", hasAccess: true });
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
    const plan = setup({ connectAssistant: async () => { throw new Error("Assistants are part of the max plan. Upgrade to connect."); } });
    const gated = await authed(plan).post("/api/assistants/connections").send({ provider: "chatgpt" });
    expect(gated.status).toBe(402);
    expect(gated.body.error).toMatch(/max plan/);
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
