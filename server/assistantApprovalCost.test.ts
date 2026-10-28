import express from "express";
import request from "supertest";
import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeTargetRoleUrl } from "../shared/referralUrl";
import { askCreditCost, companyAskJobRow, getDb } from "./db";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";
import { approvalCostsFromRows, quoteApprovalCost, readApprovalCosts, type ApprovalCostRow } from "./assistantApprovalCost";

vi.mock("./db", async importOriginal => ({ ...(await importOriginal<typeof import("./db")>()), getDb: vi.fn() }));

afterEach(() => { vi.unstubAllEnvs(); vi.mocked(getDb).mockReset(); });

const LINKS = [
  "https://acme.com/careers/senior-frontend-engineer",
  "https://acme.com/jobs/12345",
  "https://boards.greenhouse.io/acme/jobs/123",
  "https://jobs.lever.co/acme/staff-engineer-l7",
  "https://careers.google.com/jobs/results/1234-principal-engineer/",
  "https://www.amazon.jobs/en/jobs/2456/sde-ii",
  "https://careers.microsoft.com/us/en/job/1700/Senior-Director-Engineering",
  "https://jobs.ashbyhq.com/acme/intern-software-2026",
];

function quoteApp() {
  const app = express();
  app.use(express.json());
  const deps = {
    resolveIdentity: async (req: express.Request) => (req.header("x-test-user") ? { account: { id: 7, openId: "workos-test" } } : undefined),
    getCreditSummary: async () => ({ totalAvailable: 3 }),
  };
  registerPrivateReferralRoutes(app, deps as unknown as PrivateReferralRouteDeps);
  return app;
}

describe("quoteApprovalCost: the compose screen's quote, never a second formula (#644)", () => {
  for (const flag of ["false", "true"]) {
    it(`matches GET /api/company-referrals/quote for the same link (ASK_LEVEL_COST=${flag})`, async () => {
      vi.stubEnv("ASK_LEVEL_COST", flag);
      const app = quoteApp();
      for (const link of LINKS) {
        const quoted = await request(app).get(`/api/company-referrals/quote?url=${encodeURIComponent(link)}`).set("x-test-user", "7");
        expect(quoted.status, link).toBe(200);
        expect(quoteApprovalCost(link), link).toEqual({ level: quoted.body.level, cost: quoted.body.cost });
      }
    });

    it(`charges what the executor charges for the same link (ASK_LEVEL_COST=${flag})`, () => {
      vi.stubEnv("ASK_LEVEL_COST", flag);
      for (const link of LINKS) {
        // The executor's exact call (server/db.ts createCompanyReferralRequest): the job row's title and description, url = its targetRoleUrl.
        const jobRow = companyAskJobRow({ companyDomain: "acme.com", targetRoleUrl: normalizeTargetRoleUrl(link), compensation: null, publishedAt: new Date() });
        expect(quoteApprovalCost(link).cost, link).toBe(askCreditCost({ title: jobRow.title, description: jobRow.description, url: jobRow.targetRoleUrl }));
      }
    });
  }

  it("prices by level only while ASK_LEVEL_COST is on", () => {
    vi.stubEnv("ASK_LEVEL_COST", "false");
    expect(quoteApprovalCost("https://acme.com/careers/senior-frontend-engineer")).toEqual({ level: 5, cost: 1 });
    vi.stubEnv("ASK_LEVEL_COST", "true");
    expect(quoteApprovalCost("https://acme.com/careers/senior-frontend-engineer")).toEqual({ level: 5, cost: 5 });
  });
});

const NOW = Date.parse("2026-10-27T12:00:00.000Z");
const row = (patch: Partial<ApprovalCostRow> = {}): ApprovalCostRow => ({
  id: 5, userId: 7, kind: "ask_send", status: "pending", expiresAt: new Date(NOW + 60_000),
  targetRoleUrl: "https://acme.com/careers/senior-frontend-engineer", idempotencyKey: "fixture-idempotency-key-0001", ...patch,
});

describe("approvalCostsFromRows: only an approval that would charge on approve gets a cost", () => {
  it("prices a pending, unexpired, own ask_send that carries its job link and key", () => {
    vi.stubEnv("ASK_LEVEL_COST", "true");
    expect(approvalCostsFromRows(7, [row()], NOW)).toEqual(new Map([[5, { level: 5, cost: 5 }]]));
  });

  it("leaves out everything decideAssistantApproval would not charge for", () => {
    const rows = [
      row({ id: 1, status: "approved" }),
      row({ id: 2, status: "declined" }),
      row({ id: 3, expiresAt: new Date(NOW - 1) }),
      row({ id: 4, kind: "credit_spend" }),
      row({ id: 6, targetRoleUrl: null }),
      row({ id: 8, idempotencyKey: null }),
    ];
    expect(approvalCostsFromRows(7, rows, NOW).size).toBe(0);
  });

  it("never prices another person's approval, even if a read returned it", () => {
    expect(approvalCostsFromRows(7, [row({ userId: 8 })], NOW).size).toBe(0);
  });
});

describe("readApprovalCosts: one owner-scoped read", () => {
  const dialect = new MySqlDialect();

  it("reads only the signed-in owner's approvals with the asked ids", async () => {
    vi.stubEnv("ASK_LEVEL_COST", "false");
    let where: SQL | undefined;
    vi.mocked(getDb).mockResolvedValue({
      select: () => ({ from: () => ({ where: async (condition: SQL) => { where = condition; return [row({ id: 5 }), row({ id: 9, userId: 8 })]; } }) }),
    } as unknown as Awaited<ReturnType<typeof getDb>>);
    const costs = await readApprovalCosts(7, [5, 9], NOW);
    expect(costs).toEqual(new Map([[5, { level: 5, cost: 1 }]]));
    const query = dialect.sqlToQuery(where as SQL);
    expect(query.sql).toMatch(/`assistantApprovals`\.`userId` = \?/);
    expect(query.sql).toMatch(/`assistantApprovals`\.`id` in \(\?, \?\)/);
    expect(query.params).toEqual(expect.arrayContaining([7, 5, 9]));
  });

  it("does not read at all for no ids, and fails closed without a database", async () => {
    expect(await readApprovalCosts(7, [], NOW)).toEqual(new Map());
    expect(getDb).not.toHaveBeenCalled();
    vi.mocked(getDb).mockResolvedValue(null as unknown as Awaited<ReturnType<typeof getDb>>);
    await expect(readApprovalCosts(7, [5], NOW)).rejects.toThrow("Database unavailable");
  });
});
