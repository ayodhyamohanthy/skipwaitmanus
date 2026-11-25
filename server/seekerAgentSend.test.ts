// SKIPPY-6 (D-290 (1), D-142): an agent may only *request* a send; the seeker
// approves every one in their own session. These tests pin the request route,
// the approve path's grant checks, caps, cost and company rules, the one-ask
// guarantee, and the referrer label.
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { askOrigins, assistantApprovals, seekerAgentControls, seekerAgentEvents, seekerAgentGrants } from "../drizzle/schema";
import { AGENT_SEND_DAILY_CAP } from "../shared/seekerAgents";
import { buildClaimedAskDetailView } from "./referrerAskView";
import { registerSeekerAgentRoutes } from "./seekerAgentRoutes";
import { decideAssistantApprovalWithAgentSend, type AgentSendApprovalDeps } from "./agentSendApproval";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();
const NOW = new Date("2026-11-24T09:00:00.000Z");
const HOUR = 60 * 60 * 1000;

type Table = typeof assistantApprovals | typeof seekerAgentGrants | typeof seekerAgentControls | typeof askOrigins | typeof seekerAgentEvents;
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

const nameFor = (table: Table): string => {
  if (table === assistantApprovals) return "assistantApprovals";
  if (table === seekerAgentGrants) return "seekerAgentGrants";
  if (table === seekerAgentControls) return "seekerAgentControls";
  if (table === askOrigins) return "askOrigins";
  return "seekerAgentEvents";
};
const rowsFor = (table: Table): Row[] => tables[nameFor(table)];

function sameValue(rowValue: unknown, param: unknown): boolean {
  if (rowValue instanceof Date && param instanceof Date) return rowValue.getTime() === param.getTime();
  if (param instanceof Date && typeof rowValue === "string") return new Date(rowValue).getTime() === param.getTime();
  return rowValue === param;
}

function matches(condition: SQLQuery, row: Row): boolean {
  const query = dialect.sqlToQuery(condition);
  const tokens = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)`\s*(>=|<=|=|<|>|is null|is not null)/gi)];
  let i = 0;
  for (const token of tokens) {
    const col = token[1];
    const op = token[2].toLowerCase();
    if (op === "is null") { if (row[col] !== null && row[col] !== undefined) return false; continue; }
    if (op === "is not null") { if (row[col] === null || row[col] === undefined) return false; continue; }
    const param = query.params[i++];
    const rowValue = row[col];
    const asMs = (value: unknown) => (value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : NaN);
    if (op === "=" && !sameValue(rowValue, param)) return false;
    if (op === "<" && !(asMs(rowValue) < asMs(param))) return false;
    if (op === ">" && !(asMs(rowValue) > asMs(param))) return false;
    if (op === ">=" && !(asMs(rowValue) >= asMs(param))) return false;
    if (op === "<=" && !(asMs(rowValue) <= asMs(param))) return false;
  }
  return true;
}

function chainable(selected: () => Row[]) {
  const slice = (n: number) => structuredClone(selected().slice(0, n));
  const base: Record<string, unknown> = {
    limit: (n: number) => ({ for: async () => slice(n), then: (resolve: (v: unknown) => unknown) => Promise.resolve(slice(n)).then(resolve) }),
    for: async (_mode: string) => structuredClone(selected()),
    orderBy: () => base,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(structuredClone(selected())).then(resolve),
  };
  return base;
}

function fixtureDatabase() {
  const select = (projection?: Row) => ({
    from: (table: Table) => ({
      where: (condition: SQLQuery) => {
        const run = () => {
          const selected = rowsFor(table).filter(row => matches(condition, row));
          if (projection) return selected.map(row => Object.fromEntries(Object.entries(projection).map(([key, column]) => [key, row[(column as { name: string }).name]])));
          return selected;
        };
        return chainable(run);
      },
    }),
  });
  const update = (table: Table) => ({
    set: (patch: Row) => ({
      where: async (condition: SQLQuery) => {
        const selected = rowsFor(table).filter(row => matches(condition, row));
        selected.forEach(row => { for (const [key, value] of Object.entries(patch)) row[key] = structuredClone(value); });
        return [{ affectedRows: selected.length }];
      },
    }),
  });
  const insert = (table: Table) => ({
    values: (row: Row | Row[]) => {
      const input = (Array.isArray(row) ? row[0] : row) as Row;
      const rows = rowsFor(table);
      const id = rows.length + 1;
      rows.push({ id, createdAt: new Date(), ...structuredClone(input) });
      const result = Promise.resolve([{ affectedRows: 1, insertId: id }]);
      return Object.assign(result, { onDuplicateKeyUpdate: async () => [{ affectedRows: 1 }] });
    },
  });
  const db = { select, update, insert, transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(db) };
  return db;
}

const grantRow = (overrides: Row = {}): Row => ({
  id: 11, userId: 7, name: "hunt-bot", keyPrefix: "swa_abcd1234", keyHash: "hash",
  canLookup: true, canDraft: true, canSend: true,
  maxCreditsPerAsk: 10, maxCreditsPerDay: 20, maxCreditsPerWeek: 50, maxAsksPerDay: 3,
  expiresAt: new Date(NOW.getTime() + 7 * 24 * HOUR), revokedAt: null, lastUsedAt: null, createdAt: NOW,
  ...overrides,
});

const approvalRow = (overrides: Row = {}): Row => ({
  id: 21, userId: 7, connectionId: null, grantId: 11, kind: "ask_send", status: "pending", provider: "agent",
  companyDomain: "wipro.com", role: null, note: "Please refer me.", creditCount: 1, slotCount: null,
  targetRoleUrl: "https://jobs.wipro.com/role/123", attachmentIds: null, idempotencyKey: "agent-draft-31",
  executedRequestId: null, expiresAt: new Date(NOW.getTime() + 24 * HOUR), decidedAt: null, createdAt: NOW,
  ...overrides,
});

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  tables = { assistantApprovals: [], seekerAgentGrants: [], seekerAgentControls: [], askOrigins: [], seekerAgentEvents: [] };
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); });

async function loadApprover() {
  const created: Array<{ userId: number; input: Record<string, unknown> }> = [];
  const deps: AgentSendApprovalDeps = {
    getDb: async () => fixtureDatabase() as never,
    quoteCost: () => ({ level: 1, cost: 1 }),
    createRequest: async (userId: number, input: Record<string, unknown>) => { created.push({ userId, input }); return { requestId: 501 }; },
    listCompanies: async () => ({ companies: [{ slug: "wipro", name: "Wipro", domains: ["wipro.com"] }] }),
    listResumes: async () => [{ id: 41, fileName: "cv.pdf", createdAt: NOW }],
    decidePlain: async () => ({ id: 21, status: "declined" as const }),
    now: () => NOW.getTime(),
  } as never;
  return { module: { decideAssistantApprovalWithAgentSend }, deps, created };
}

describe("SKIPPY-6 agent send approval", () => {
  it("approves once, records the ask origin and the request on the approval", async () => {
    tables.seekerAgentGrants = [grantRow()];
    tables.assistantApprovals = [approvalRow()];
    const { module, deps, created } = await loadApprover();
    const result = await module.decideAssistantApprovalWithAgentSend(7, 21, "approved", { attachmentIds: [41] }, deps);
    expect(result).toMatchObject({ id: 21, status: "approved", requestId: 501 });
    expect(created).toHaveLength(1);
    expect(created[0].input).toMatchObject({
      selectedCompany: { name: "Wipro", domains: ["wipro.com"] },
      targetRoleUrl: "https://jobs.wipro.com/role/123",
      attachmentIds: [41],
      idempotencyKey: "agent-draft-31",
    });
    expect(tables.askOrigins).toHaveLength(1);
    expect(tables.askOrigins[0]).toMatchObject({ referralRequestId: 501, channel: "agent", agentGrantId: 11 });
    expect(tables.assistantApprovals[0]).toMatchObject({ status: "approved", executedRequestId: 501 });
    expect(tables.seekerAgentEvents.at(-1)).toMatchObject({ action: "agent.send_approved", outcome: "success" });
  });

  it("refuses when the grant lost its send scope, and spends nothing", async () => {
    tables.seekerAgentGrants = [grantRow({ canSend: false })];
    tables.assistantApprovals = [approvalRow()];
    const { module, deps, created } = await loadApprover();
    await expect(module.decideAssistantApprovalWithAgentSend(7, 21, "approved", {}, deps)).rejects.toMatchObject({ code: "grant" });
    expect(created).toHaveLength(0);
    expect(tables.assistantApprovals[0].status).toBe("pending");
  });

  it("refuses a revoked grant and a paused seeker", async () => {
    tables.seekerAgentGrants = [grantRow({ revokedAt: NOW })];
    tables.assistantApprovals = [approvalRow()];
    let loaded = await loadApprover();
    await expect(loaded.module.decideAssistantApprovalWithAgentSend(7, 21, "approved", {}, loaded.deps)).rejects.toMatchObject({ code: "grant" });

    tables.seekerAgentGrants = [grantRow()];
    tables.seekerAgentControls = [{ id: 1, userId: 7, pausedAt: NOW }];
    loaded = await loadApprover();
    await expect(loaded.module.decideAssistantApprovalWithAgentSend(7, 21, "approved", {}, loaded.deps)).rejects.toMatchObject({ code: "grant" });
    expect(loaded.created).toHaveLength(0);
  });

  it("refuses a changed cost before anything moves", async () => {
    tables.seekerAgentGrants = [grantRow()];
    tables.assistantApprovals = [approvalRow({ creditCount: 1 })];
    const { module, deps, created } = await loadApprover();
    deps.quoteCost = () => ({ level: 5, cost: 5 });
    await expect(module.decideAssistantApprovalWithAgentSend(7, 21, "approved", {}, deps)).rejects.toMatchObject({ code: "cost" });
    expect(created).toHaveLength(0);
    expect(tables.assistantApprovals[0].status).toBe("pending");
  });

  it("refuses a link outside the company's domains", async () => {
    tables.seekerAgentGrants = [grantRow()];
    tables.assistantApprovals = [approvalRow({ companyDomain: "other.com" })];
    const { module, deps, created } = await loadApprover();
    await expect(module.decideAssistantApprovalWithAgentSend(7, 21, "approved", {}, deps)).rejects.toMatchObject({ code: "company" });
    expect(created).toHaveLength(0);
  });

  it("refuses over the daily cap", async () => {
    tables.seekerAgentGrants = [grantRow()];
    tables.assistantApprovals = [
      approvalRow(),
      ...Array.from({ length: AGENT_SEND_DAILY_CAP }, (_, index) => approvalRow({ id: 100 + index, status: "approved", decidedAt: new Date(NOW.getTime() - HOUR) })),
    ];
    const { module, deps, created } = await loadApprover();
    await expect(module.decideAssistantApprovalWithAgentSend(7, 21, "approved", {}, deps)).rejects.toMatchObject({ code: "limit" });
    expect(created).toHaveLength(0);
    expect(tables.assistantApprovals[0].status).toBe("pending");
  });

  it("a retried approve gives one ask", async () => {
    tables.seekerAgentGrants = [grantRow()];
    tables.assistantApprovals = [approvalRow()];
    const { module, deps, created } = await loadApprover();
    await module.decideAssistantApprovalWithAgentSend(7, 21, "approved", {}, deps);
    await expect(module.decideAssistantApprovalWithAgentSend(7, 21, "approved", {}, deps)).rejects.toThrow(/already handled/);
    expect(created).toHaveLength(1);
  });

  it("a shortfall leaves the row waiting with needs referrals", async () => {
    tables.seekerAgentGrants = [grantRow()];
    tables.assistantApprovals = [approvalRow()];
    const { module, deps } = await loadApprover();
    deps.createRequest = async () => { throw new Error("No referral credit available"); };
    await expect(module.decideAssistantApprovalWithAgentSend(7, 21, "approved", {}, deps)).rejects.toMatchObject({ code: "needs_referrals" });
    expect(tables.assistantApprovals[0].status).toBe("pending");
    expect(tables.seekerAgentEvents.at(-1)).toMatchObject({ action: "agent.send_approved", outcome: "failure" });
  });

  it("declines and seeker-initiated approvals keep the plain path", async () => {
    tables.seekerAgentGrants = [grantRow()];
    tables.assistantApprovals = [approvalRow(), approvalRow({ id: 22, grantId: null })];
    const { module, deps, created } = await loadApprover();
    const decline = await module.decideAssistantApprovalWithAgentSend(7, 21, "declined", {}, deps);
    expect(decline).toMatchObject({ status: "declined" });
    const plain = await module.decideAssistantApprovalWithAgentSend(7, 22, "approved", {}, deps);
    expect(plain).toMatchObject({ status: "declined" });
    expect(created).toHaveLength(0);
  });
});

describe("SKIPPY-6 referrer label", () => {
  const row = (sentViaAssistant: boolean) => ({
    id: 9, title: "Engineer", targetRoleUrl: "https://jobs.wipro.com/role/1", companyDomain: "wipro.com",
    jobFunction: null, candidateMessage: "hi", status: "pending", referrerId: 7, revision: 1,
    candidateName: "Seeker", documentAccessActive: false, sentViaAssistant, attachments: [],
  });

  it("says so only for an agent ask", () => {
    const agent = buildClaimedAskDetailView(row(true));
    const page = buildClaimedAskDetailView(row(false));
    expect(agent.ok && agent.view.sentViaAssistant).toBe(true);
    expect(page.ok && page.view.sentViaAssistant).toBeUndefined();
  });
});

describe("SKIPPY-6 send request route", () => {
  const companies = [{ slug: "wipro", name: "Wipro", initials: "WI", industry: "IT", location: "Bengaluru", functions: ["engineering"], blurb: "b", domains: ["wipro.com"] }];

  function makeApp(opts: { canSend: boolean }) {
    const app = express(); app.use(express.json());
    const grants: Array<Record<string, unknown>> = [];
    const drafts: Array<Record<string, unknown>> = [];
    const requests: Array<Record<string, unknown>> = [];
    const events: Array<Record<string, unknown>> = [];
    const store = {
      createGrant: async (input: Record<string, unknown>) => { const row = { id: 1, revokedAt: null, lastUsedAt: null, createdAt: NOW, ...input }; grants.push(row); return row; },
      listGrants: async () => grants,
      getGrantForUser: async () => grants[0],
      findGrantByKeyHash: async () => grants[0],
      revokeGrant: async () => true,
      touchLastUsed: async () => undefined,
      isPaused: async () => false,
      setPaused: async () => undefined,
      createDraft: async () => drafts[0],
      listDraftsByGrant: async () => drafts,
      getDraftForGrant: async (grantId: number, draftId: number) => drafts.find(draft => draft.grantId === grantId && draft.id === draftId),
      createSendRequest: async (input: Record<string, unknown>) => { const id = 90 + requests.length; requests.push({ id, ...input }); return { id, expiresAt: new Date(NOW.getTime() + HOUR) }; },
      sumDraftCreditsSince: async () => 0,
      countDraftsSince: async () => 0,
      listEvents: async () => events,
      recordEvent: async (input: Record<string, unknown>) => { events.push(input); },
    };
    registerSeekerAgentRoutes(app, {
      enabled: () => true,
      autoSendEnabled: () => false,
      allowedUserIds: () => new Set([7]),
      resolveIdentity: async () => ({ account: { id: 7 } }),
      store: store as never,
      listCompanies: async () => companies as never,
      prices: async () => ({}) as never,
      quoteCost: () => ({ level: 1, cost: 1 }),
      getCompanyDirectoryEntry: async (slug: string) => (slug === "wipro" ? { name: "Wipro", domains: ["wipro.com"] } : undefined),
      listResumes: async () => [{ id: 41, fileName: "cv.pdf", createdAt: NOW }],
      notifySendRequest: async () => undefined,
      now: () => NOW.getTime(),
    });
    return { app, grants, drafts, requests, events };
  }

  it("refuses a send request without the send scope", async () => {
    const { app, grants, drafts, requests } = makeApp({ canSend: false });
    grants.push({ id: 1, userId: 7, name: "hunt-bot", keyPrefix: "swa_x", canLookup: true, canDraft: true, canSend: false, maxCreditsPerAsk: 10, maxCreditsPerDay: 20, maxCreditsPerWeek: 50, maxAsksPerDay: 3, expiresAt: new Date(NOW.getTime() + HOUR), revokedAt: null, lastUsedAt: null, createdAt: NOW });
    drafts.push({ id: 31, grantId: 1, userId: 7, companySlug: "wipro", targetRoleUrl: "https://jobs.wipro.com/role/123", note: "hi", jobLevel: 1, creditCost: 1, status: "draft", createdAt: NOW });
    const res = await request(app).post("/api/agent/v1/drafts/31/send-request").set("Authorization", "Bearer swa_" + "a".repeat(64));
    expect(res.status).toBe(403);
    expect(requests).toHaveLength(0);
  });

  it("writes one request row for a draft the grant owns", async () => {
    const { app, grants, drafts, requests } = makeApp({ canSend: true });
    grants.push({ id: 1, userId: 7, name: "hunt-bot", keyPrefix: "swa_x", canLookup: true, canDraft: true, canSend: true, maxCreditsPerAsk: 10, maxCreditsPerDay: 20, maxCreditsPerWeek: 50, maxAsksPerDay: 3, expiresAt: new Date(NOW.getTime() + HOUR), revokedAt: null, lastUsedAt: null, createdAt: NOW });
    drafts.push({ id: 31, grantId: 1, userId: 7, companySlug: "wipro", targetRoleUrl: "https://jobs.wipro.com/role/123", note: "hi", jobLevel: 1, creditCost: 1, status: "draft", createdAt: NOW });
    const res = await request(app).post("/api/agent/v1/drafts/31/send-request").set("Authorization", "Bearer swa_" + "a".repeat(64));
    expect(res.status).toBe(201);
    expect(res.body.request).toMatchObject({ approvalId: 90, status: "pending", creditCost: 1 });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ grantId: 1, companyDomain: "wipro.com" });
  });

  it("a legacy sw_ token cannot request a send", async () => {
    const { app, requests } = makeApp({ canSend: true });
    const res = await request(app).post("/api/agent/v1/drafts/31/send-request").set("Authorization", "Bearer sw_" + "a".repeat(64));
    expect(res.status).toBe(401);
    expect(requests).toHaveLength(0);
  });
});
