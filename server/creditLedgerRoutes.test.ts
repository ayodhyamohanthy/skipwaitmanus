import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { creditLedgerResponseSchema, type CreditLedgerEntry } from "../shared/creditLedger";
import { PLAN_CREDIT_CYCLE_BATCH, createPlanCreditCycleJob } from "./planCreditCycleJob";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";
import { SCHEDULED_JOBS } from "./scheduledJobRegistry";

const entry = (id: number, userId: number): CreditLedgerEntry => ({ id, kind: "plan_grant", credits: 10 + userId, bucket: "cycle", reference: { type: "plan_cycle", id: `2026-10:${userId}` }, createdAt: "2026-10-06T00:00:00.000Z" });

function setup() {
  const app = express();
  app.use(express.json());
  const listCreditLedger = vi.fn(async (userId: number, _role: string, _limit: number) => [entry(2, userId), entry(1, userId)]);
  const deps = {
    resolveIdentity: async (req: express.Request) => (req.header("x-test-user") ? { account: { id: Number(req.header("x-test-user")), openId: "workos-test" } } : undefined),
    listCreditLedger,
  };
  registerPrivateReferralRoutes(app, deps as unknown as PrivateReferralRouteDeps);
  return { app, listCreditLedger };
}

describe("GET /api/credits/ledger", () => {
  it("needs a signed-in caller", async () => {
    const { app, listCreditLedger } = setup();
    expect((await request(app).get("/api/credits/ledger")).status).toBe(401);
    expect(listCreditLedger).not.toHaveBeenCalled();
  });

  it("reads only the caller's own ledger, never a requested user, and is never cached", async () => {
    const { app, listCreditLedger } = setup();
    const response = await request(app).get("/api/credits/ledger?userId=8&limit=20").set("x-test-user", "7");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(creditLedgerResponseSchema.parse(response.body)).toEqual({ entries: [entry(2, 7), entry(1, 7)] });
    expect(listCreditLedger).toHaveBeenCalledWith(7, "job_seeker", 20);
    await request(app).get("/api/credits/ledger?role=referrer").set("x-test-user", "8");
    expect(listCreditLedger).toHaveBeenLastCalledWith(8, "referrer", 50);
  });

  it("rejects a bad role or page size before reading", async () => {
    const { app, listCreditLedger } = setup();
    expect((await request(app).get("/api/credits/ledger?limit=500").set("x-test-user", "7")).status).toBe(400);
    expect((await request(app).get("/api/credits/ledger?role=admin").set("x-test-user", "7")).status).toBe(400);
    expect(listCreditLedger).not.toHaveBeenCalled();
  });

  it("answers 500 without details when the read fails", async () => {
    const { app, listCreditLedger } = setup();
    listCreditLedger.mockRejectedValueOnce(new Error("pool exhausted"));
    const response = await request(app).get("/api/credits/ledger").set("x-test-user", "7");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "We could not load your credit history" });
  });
});

describe("plan-credit-cycles scheduled job", () => {
  const context = { nowMs: Date.parse("2026-11-01T00:00:00.000Z"), windowKey: "2026-11-01T00:00Z" };

  it("is registered hourly with a lease shorter than its window", () => {
    const job = SCHEDULED_JOBS.find(candidate => candidate.name === "plan-credit-cycles");
    expect(job).toMatchObject({ windowMs: 60 * 60_000 });
    expect(job && job.leaseMs < job.windowMs).toBe(true);
  });

  it("reconciles each due wallet as its own owner, counts real changes and keeps going past a failure", async () => {
    const cause = new Error("lock wait timeout");
    const listDue = vi.fn(async () => [7, 8, 9]);
    const reconcile = vi.fn(async (userId: number) => { if (userId === 8) throw cause; return { changed: userId === 7 }; });
    expect(await createPlanCreditCycleJob({ listDue, reconcile })(context)).toEqual({ processed: 1, failed: 1, firstError: cause });
    expect(listDue).toHaveBeenCalledWith(new Date(context.nowMs), PLAN_CREDIT_CYCLE_BATCH);
    expect(reconcile.mock.calls).toEqual([[7, new Date(context.nowMs)], [8, new Date(context.nowMs)], [9, new Date(context.nowMs)]]);
  });

  it("is idempotent per wallet per cycle because reconcile is", async () => {
    const done = new Set<number>();
    const job = createPlanCreditCycleJob({ listDue: async () => [7], reconcile: async userId => { const fresh = !done.has(userId); done.add(userId); return { changed: fresh }; } });
    expect((await job(context)).processed).toBe(1);
    expect((await job(context)).processed).toBe(0);
  });
});
