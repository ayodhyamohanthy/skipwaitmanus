import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL as SQLQuery } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { assistantApprovals, assistantConnections, assistantTokens, developerApps, operationalActivityLogs, tokenBalances } from "../drizzle/schema";
import {
  connectAssistant, createAssistantApproval, createAssistantToken, createDeveloperApp,
  decideAssistantApproval, disconnectAssistant, editAssistantApproval, getAssistantAccessPlan,
  getDeveloperApp, listAssistantApprovals, listAssistantConnections, listAssistantTokens,
  listDeveloperApps, revokeAssistantToken, submitDeveloperAppForReview, updateDeveloperAppWebhook,
} from "./db";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();
const NOW = new Date("2026-10-09T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

type Table = typeof assistantConnections | typeof assistantTokens | typeof developerApps | typeof assistantApprovals | typeof tokenBalances | typeof operationalActivityLogs;
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

function rowsFor(table: Table): Row[] {
  if (table === assistantConnections) return tables.connections;
  if (table === assistantTokens) return tables.tokens;
  if (table === developerApps) return tables.apps;
  if (table === assistantApprovals) return tables.approvals;
  if (table === tokenBalances) return tables.wallets;
  if (table === operationalActivityLogs) return tables.activity;
  throw new Error("Unexpected table");
}

function sameValue(rowValue: unknown, param: unknown): boolean {
  if (rowValue instanceof Date && param instanceof Date) return rowValue.getTime() === param.getTime();
  if (param instanceof Date && typeof rowValue === "string") return new Date(rowValue).getTime() === param.getTime();
  return rowValue === param;
}

function matches(condition: SQLQuery, row: Row): boolean {
  const query = dialect.sqlToQuery(condition);
  const tokens = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)`\s*(=|<|>|is null|is not null)/gi)];
  let i = 0;
  for (const token of tokens) {
    const col = token[1];
    const op = token[2].toLowerCase();
    if (op === "is null") {
      if (row[col] !== null && row[col] !== undefined) return false;
      continue;
    }
    if (op === "is not null") {
      if (row[col] === null || row[col] === undefined) return false;
      continue;
    }
    const param = query.params[i++];
    const rowValue = row[col];
    if (op === "=" && !sameValue(rowValue, param)) return false;
    if (op === "<" && !(rowValue instanceof Date && param instanceof Date ? rowValue.getTime() < param.getTime() : false)) return false;
    if (op === ">" && !(rowValue instanceof Date && param instanceof Date ? rowValue.getTime() > param.getTime() : false)) return false;
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
        selected.forEach(row => {
          for (const [key, value] of Object.entries(patch)) row[key] = structuredClone(value);
        });
        return [{ affectedRows: selected.length }];
      },
    }),
  });
  const insert = (table: Table) => ({
    values: (row: Row | Row[]) => {
      const input = (Array.isArray(row) ? row[0] : row) as Row;
      if (table === assistantTokens && rowsFor(table).some(existing => existing.userId === input.userId && existing.name === input.name)) {
        throw Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
      }
      const rows = rowsFor(table);
      const id = rows.length + 1;
      rows.push({ id, createdAt: new Date(), ...structuredClone(input) });
      return Promise.resolve([{ affectedRows: 1, insertId: id }]);
    },
  });
  return { select, update, insert };
}

const walletRow = (plan: string) => ({ id: 1, userId: 7, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 3, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan, subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, updatedAt: NOW });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  tables = {
    connections: [],
    tokens: [],
    apps: [],
    approvals: [],
    wallets: [walletRow("max")],
    activity: [],
  };
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("assistant connections", () => {
  it("reports the plan and connects on max", async () => {
    expect(await getAssistantAccessPlan(7)).toBe("max");
    const connection = await connectAssistant(7, { provider: "chatgpt", appName: "ChatGPT", scopes: ["read", "draft"] });
    expect(connection).toMatchObject({ provider: "chatgpt", appName: "ChatGPT", status: "connected", scopes: ["read", "draft"] });
    expect(await listAssistantConnections(7)).toHaveLength(1);
  });

  it("rejects a second active connection of the same provider", async () => {
    await connectAssistant(7, { provider: "claude", scopes: ["read"] });
    await expect(connectAssistant(7, { provider: "claude", scopes: ["read"] })).rejects.toThrow(/already connected/);
  });

  it("gates connections on the max plan", async () => {
    tables.wallets = [walletRow("free")];
    await expect(connectAssistant(7, { provider: "chatgpt" })).rejects.toThrow(/max plan/);
    expect(await listAssistantConnections(7)).toEqual([]);
  });

  it("revokes with ownership enforcement", async () => {
    const connection = await connectAssistant(7, { provider: "chatgpt" });
    const result = await disconnectAssistant(7, connection!.id);
    expect(result).toEqual({ revoked: true, id: connection!.id });
    const remaining = await listAssistantConnections(7);
    expect(remaining[0].status).toBe("revoked");
    await expect(disconnectAssistant(8, connection!.id)).rejects.toThrow(/not connected/);
  });
});

describe("assistant tokens", () => {
  it("creates a once-only token and revokes it", async () => {
    const token = await createAssistantToken(7, { name: "Notion tracker" });
    expect(token.token).toMatch(/^sw_/);
    expect(token.prefix).toBe(token.token.slice(0, 10));
    const listed = await listAssistantTokens(7);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("token");
    expect(listed[0].name).toBe("Notion tracker");
    await expect(createAssistantToken(7, { name: "Notion tracker" })).rejects.toThrow(/already have a token/);
    await expect(revokeAssistantToken(7, token.id)).resolves.toEqual({ revoked: true, id: token.id });
    await expect(revokeAssistantToken(8, token.id)).rejects.toThrow(/not in your account/);
  });

  it("validates token names and gates on plan", async () => {
    await expect(createAssistantToken(7, { name: "x" })).rejects.toThrow(/Give the token a name/);
    tables.wallets = [walletRow("pro")];
    await expect(createAssistantToken(7, { name: "OK name" })).rejects.toThrow(/max plan/);
  });
});

describe("assistant approvals", () => {
  it("creates a pending approval that expires 24 hours later", async () => {
    const approval = await createAssistantApproval(7, { kind: "ask_send", provider: "ChatGPT", companyDomain: "wipro.com", role: "Designer", note: "Hi", slotCount: 3 });
    expect(approval.status).toBe("pending");
    expect(Math.abs(new Date(approval.expiresAt).getTime() - (Date.now() + DAY))).toBeLessThan(1000);
    const listed = await listAssistantApprovals(7);
    expect(listed[0]).toMatchObject({ kind: "ask_send", status: "pending", companyDomain: "wipro.com" });
  });

  it("rejects invalid approval input", async () => {
    await expect(createAssistantApproval(7, { kind: "nope" })).rejects.toThrow(/ask or a credit spend/);
    await expect(createAssistantApproval(7, { kind: "ask_send", note: "   " })).rejects.toThrow(/Enter the ask note/);
  });

  it("approves once, then refuses a second decision", async () => {
    const approval = await createAssistantApproval(7, { kind: "ask_send", provider: "ChatGPT", note: "Hi" });
    expect(await decideAssistantApproval(7, approval!.id, "approved")).toEqual({ id: approval!.id, status: "approved" });
    await expect(decideAssistantApproval(7, approval!.id, "declined")).rejects.toThrow(/already handled/);
    const listed = await listAssistantApprovals(7);
    expect(listed[0].status).toBe("approved");
  });

  it("edits the note while pending only", async () => {
    const approval = await createAssistantApproval(7, { kind: "ask_send", provider: "ChatGPT", note: "Original" });
    expect((await editAssistantApproval(7, approval!.id, { note: "Edited note" })).note).toBe("Edited note");
    await decideAssistantApproval(7, approval!.id, "approved");
    await expect(editAssistantApproval(7, approval!.id, { note: "Late" })).rejects.toThrow(/already handled/);
  });

  it("expires stale pending approvals on read and refuses late decisions", async () => {
    const stale = await createAssistantApproval(7, { kind: "credit_spend", provider: "ChatGPT", creditCount: 3 });
    tables.approvals = tables.approvals.map(row => row.id === stale!.id ? { ...row, expiresAt: new Date(Date.now() - 1000) } : row);
    const listed = await listAssistantApprovals(7);
    expect(listed[0].status).toBe("expired");
    await expect(decideAssistantApproval(7, stale!.id, "approved")).rejects.toThrow(/expired/);
    await expect(editAssistantApproval(7, stale!.id, { note: "x".repeat(10) })).rejects.toThrow(/expired/);
  });
});

describe("developer apps", () => {
  it("registers a test-mode app with a generated client id", async () => {
    const app = await createDeveloperApp(7, {
      name: "Instinct", kind: "agent_mcp", description: "AI agent for job seekers",
      website: "https://instinct.app", redirectUrls: ["https://instinct.app/cb"],
      scopes: ["companies:read", "asks:send"], agreeToTerms: true,
    });
    expect(app).toMatchObject({ name: "Instinct", kind: "agent_mcp", status: "test", website: "https://instinct.app", redirectUrls: ["https://instinct.app/cb"], scopes: ["companies:read", "asks:send"] });
    expect(app!.clientId).toMatch(/^sw_app_[0-9a-f]{16}$/);
    const listed = await listDeveloperApps(7);
    expect(listed).toHaveLength(1);
    expect(await getDeveloperApp(7, app!.id)).toMatchObject({ id: app!.id });
    expect(await getDeveloperApp(8, app!.id)).toBeNull();
  });

  it("validates every registration field", async () => {
    const base = { name: "Instinct", kind: "agent_mcp" as const, description: "d", redirectUrls: ["https://a.app/cb"], scopes: ["companies:read"], agreeToTerms: true };
    await expect(createDeveloperApp(7, { ...base, name: "x" })).rejects.toThrow(/name/);
    await expect(createDeveloperApp(7, { ...base, kind: "ats" as unknown as string })).rejects.toThrow(/what you are building/);
    await expect(createDeveloperApp(7, { ...base, description: "" })).rejects.toThrow(/Describe/);
    await expect(createDeveloperApp(7, { ...base, website: "nope" })).rejects.toThrow(/website URL/);
    await expect(createDeveloperApp(7, { ...base, redirectUrls: [] })).rejects.toThrow(/redirect URLs/);
    await expect(createDeveloperApp(7, { ...base, scopes: ["bogus:read"] })).rejects.toThrow(/listed permissions/);
    await expect(createDeveloperApp(7, { ...base, agreeToTerms: false })).rejects.toThrow(/developer terms/);
  });

  it("gates registration on the max plan and updates webhooks", async () => {
    tables.wallets = [walletRow("free")];
    await expect(createDeveloperApp(7, { name: "Instinct", kind: "web_app", description: "d", redirectUrls: ["https://a.app/cb"], scopes: ["companies:read"], agreeToTerms: true })).rejects.toThrow(/max plan/);
    tables.wallets = [walletRow("max")];
    const app = await createDeveloperApp(7, { name: "Instinct", kind: "web_app", description: "d", redirectUrls: ["https://a.app/cb"], scopes: ["companies:read"], agreeToTerms: true });
    expect(await updateDeveloperAppWebhook(7, app!.id, { webhookUrl: "https://instinct.app/hooks" })).toEqual({ id: app!.id, webhookUrl: "https://instinct.app/hooks" });
    expect(await updateDeveloperAppWebhook(7, app!.id, { webhookUrl: "" })).toEqual({ id: app!.id, webhookUrl: null });
    await expect(updateDeveloperAppWebhook(8, app!.id, { webhookUrl: "https://x.app/h" })).rejects.toThrow(/not in your console/);
    await expect(updateDeveloperAppWebhook(7, app!.id, { webhookUrl: "bad" })).rejects.toThrow(/webhook URL/);
  });

  it("submits test and rejected apps for review only", async () => {
    tables.wallets = [walletRow("max")];
    const app = await createDeveloperApp(7, { name: "Instinct", kind: "web_app", description: "d", redirectUrls: ["https://a.app/cb"], scopes: ["companies:read"], agreeToTerms: true });
    expect(await submitDeveloperAppForReview(7, app!.id)).toEqual({ id: app!.id, status: "in_review" });
    await expect(submitDeveloperAppForReview(7, app!.id)).rejects.toThrow(/Only test apps/);
    await expect(submitDeveloperAppForReview(8, app!.id)).rejects.toThrow(/not in your console/);
  });
});
