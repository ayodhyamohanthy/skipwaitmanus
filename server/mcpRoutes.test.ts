import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { hashBearer, registerMcpRoutes, type McpRouteDeps } from "./mcpRoutes";
import { MCP_TOOL_NAMES, MCP_TOOLS, shapeAlert, shapeJob, shapeRequest } from "./mcpServer";

const TOKEN = `sw_${"a".repeat(32)}`;

function setup(over: Partial<McpRouteDeps> = {}) {
  const activity: Array<Record<string, unknown>> = [];
  const deps: McpRouteDeps = {
    verifyBearer: async hash => (hash === hashBearer(TOKEN) ? { userId: 7, tokenId: 3 } : null),
    hasAccess: async () => true,
    recordActivity: async input => { activity.push(input); },
    searchJobs: async () => [{ id: 1, title: "Designer", company: "Wipro", location: "Pune", seniority: "Senior", compensation: "n/a", description: "secret long text", postedBy: "hr@wipro.com" }],
    listRequests: async () => [{ id: 9, jobTitle: "Designer", company: "Wipro", status: "pending", referrerId: 88, jobSeekerId: 7, personalPitch: "my private pitch", referrerMessage: "x", createdAt: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-02T00:00:00Z") }],
    listAlerts: async () => [{ id: 4, companyDomain: "acme.com", paused: false, notifiedAt: null, createdAt: new Date("2026-10-01T00:00:00Z"), userId: 7 }],
    listResumes: async () => [{ id: 21, fileName: "cv.pdf", createdAt: new Date("2026-10-02T00:00:00Z"), fileKey: "secret/key", ownerId: 7 }],
    proposeAsk: async () => ({ id: 55, status: "pending" as const, creditCost: 1, expiresAt: "2026-10-10T00:00:00.000Z" }),
    ...over,
  };
  const app = express();
  registerMcpRoutes(app, deps);
  return { app, activity };
}

const rpc = (app: express.Express, body: unknown, token: string | null = TOKEN) => {
  let r = request(app).post("/api/mcp");
  if (token) r = r.set("Authorization", `Bearer ${token}`);
  return r.send(body as object);
};

describe("MCP authentication", () => {
  it("rejects a missing, malformed, unknown or revoked token before doing any work", async () => {
    const { app } = setup();
    for (const token of [null, "nope", "sw_short", `sw_${"b".repeat(32)}`]) {
      const res = await rpc(app, { jsonrpc: "2.0", id: 1, method: "tools/list" }, token);
      expect(res.status).toBe(401);
      expect(res.headers["www-authenticate"]).toMatch(/Bearer/);
    }
  });
  it("does not accept a cookie or a query-string token", async () => {
    const { app } = setup();
    const res = await request(app).post(`/api/mcp?token=${TOKEN}`).set("Cookie", `session=${TOKEN}`).send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(401);
  });
  it("refuses an owner whose plan no longer includes assistants", async () => {
    const { app, activity } = setup({ hasAccess: async () => false });
    const res = await rpc(app, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(403);
    expect(activity[0]).toMatchObject({ action: "assistant.mcp.denied", outcome: "denied" });
  });
  it("rate limits per token", async () => {
    let t = 0;
    const { app } = setup({ limitPerMinute: 2, now: () => t });
    expect((await rpc(app, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);
    expect((await rpc(app, { jsonrpc: "2.0", id: 2, method: "ping" })).status).toBe(200);
    expect((await rpc(app, { jsonrpc: "2.0", id: 3, method: "ping" })).status).toBe(429);
    t = 61_000;
    expect((await rpc(app, { jsonrpc: "2.0", id: 4, method: "ping" })).status).toBe(200);
  });
  it("only accepts POST", async () => {
    const { app } = setup();
    expect((await request(app).get("/api/mcp")).status).toBe(405);
  });
});

describe("MCP protocol", () => {
  it("initializes and lists the tools", async () => {
    const { app } = setup();
    const init = await rpc(app, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    expect(init.body.result).toMatchObject({ serverInfo: { name: "skipwait" }, capabilities: { tools: {} } });
    const list = await rpc(app, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(list.body.result.tools.map((t: { name: string }) => t.name)).toEqual(["search_jobs", "list_my_requests", "list_my_alerts", "list_my_resumes", "propose_ask"]);
    for (const tool of MCP_TOOLS) if (tool.name !== "propose_ask") expect(tool.annotations.readOnlyHint).toBe(true);
  });
  it("offers no tool that sends, accepts, passes, spends or buys; propose_ask is the only non-read tool", () => {
    expect(MCP_TOOL_NAMES.join(" ")).not.toMatch(/send|accept|pass|approve|spend|buy|purchase|pay|credit|delete|create/i);
    expect(MCP_TOOLS.filter(t => !t.annotations.readOnlyHint).map(t => t.name)).toEqual(["propose_ask"]);
  });
  it("propose_ask only creates a pending approval and reports that nothing was sent or spent", async () => {
    const calls: unknown[] = [];
    const { app } = setup({ proposeAsk: async (userId, input) => { calls.push({ userId, input }); return { id: 55, status: "pending" as const, creditCost: 1, expiresAt: "2026-10-10T00:00:00.000Z" }; } });
    const res = await rpc(app, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "propose_ask", arguments: { targetRoleUrl: "https://boards.example.com/j/1", attachmentIds: [21], message: "hi", userId: 99, creditCost: 0 } } });
    const body = JSON.parse(res.body.result.content[0].text);
    expect(body).toMatchObject({ approvalId: 55, status: "pending", creditCostIfApproved: 1 });
    expect(body.nextStep).toMatch(/Nothing has been sent/);
    expect(calls).toEqual([{ userId: 7, input: { targetRoleUrl: "https://boards.example.com/j/1", attachmentIds: [21], message: "hi" } }]);
  });
  it("propose_ask surfaces validation errors as tool errors", async () => {
    const { app } = setup({ proposeAsk: async () => { throw new Error("Choose one to five of the member's own resume documents"); } });
    const res = await rpc(app, { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "propose_ask", arguments: {} } });
    expect(res.body.result.isError).toBe(true);
  });
  it("list_my_resumes returns only ids and file names", async () => {
    const { app } = setup();
    const res = await rpc(app, { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "list_my_resumes" } });
    expect(JSON.parse(res.body.result.content[0].text).resumes).toEqual([{ id: 21, fileName: "cv.pdf", uploadedAt: "2026-10-02T00:00:00.000Z" }]);
  });
  it("answers notifications with 202 and no body, and unknown methods with an error", async () => {
    const { app } = setup();
    const note = await rpc(app, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(note.status).toBe(202);
    const bad = await rpc(app, { jsonrpc: "2.0", id: 5, method: "resources/list" });
    expect(bad.body.error.code).toBe(-32601);
    expect((await rpc(app, [{ jsonrpc: "2.0", id: 1, method: "ping" }])).status).toBe(400);
  });
  it("refuses an unknown tool as a tool error, not a crash", async () => {
    const { app } = setup();
    const res = await rpc(app, { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "send_ask", arguments: {} } });
    expect(res.body.result.isError).toBe(true);
  });
});

describe("MCP data exposure", () => {
  it("returns only whitelisted job fields", async () => {
    const { app } = setup();
    const res = await rpc(app, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_jobs", arguments: { query: "design" } } });
    const text = res.body.result.content[0].text as string;
    expect(JSON.parse(text).jobs[0]).toEqual({ id: 1, title: "Designer", company: "Wipro", location: "Pune", seniority: "Senior", compensation: "n/a" });
    expect(text).not.toMatch(/secret long text|hr@wipro/);
  });
  it("never returns referrer identities, pitches or messages from the user's requests", async () => {
    const { app } = setup();
    const res = await rpc(app, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_my_requests", arguments: {} } });
    const text = res.body.result.content[0].text as string;
    expect(JSON.parse(text).requests[0]).toEqual({ id: 9, jobTitle: "Designer", company: "Wipro", status: "pending", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z" });
    expect(text).not.toMatch(/referrerId|88|private pitch|referrerMessage|jobSeekerId/);
  });
  it("scopes data by the token owner, never by an argument", async () => {
    const listRequests = vi.fn(async () => []);
    const listAlerts = vi.fn(async () => []);
    const { app } = setup({ listRequests, listAlerts });
    await rpc(app, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_my_requests", arguments: { userId: 999 } } });
    await rpc(app, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_my_alerts", arguments: { userId: 999 } } });
    expect(listRequests).toHaveBeenCalledWith(7);
    expect(listAlerts).toHaveBeenCalledWith(7);
  });
  it("shapes drop unknown columns", () => {
    expect(shapeJob({ id: 1, title: "t", extra: "x" })).not.toHaveProperty("extra");
    expect(shapeRequest({ id: 1, referrerId: 5 })).not.toHaveProperty("referrerId");
    expect(shapeAlert({ id: 1, userId: 5 })).not.toHaveProperty("userId");
  });
  it("records each tool call in the activity log with the tool name only", async () => {
    const { app, activity } = setup();
    await rpc(app, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_jobs", arguments: { query: "private words" } } });
    expect(activity[0]).toMatchObject({ actorUserId: 7, action: "assistant.mcp.tool", outcome: "success", metadata: { tool: "search_jobs" } });
    expect(JSON.stringify(activity)).not.toMatch(/private words/);
  });
});
