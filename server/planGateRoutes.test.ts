import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { openAskSlots, openAskSlotsSchema, slotCapReachedSchema, type OpenAskSlots } from "../shared/openAskSlots";
import { resolvePlanEntitlements } from "../shared/planEntitlements";
import { companyCapReachedSchema } from "../shared/openAskSlots";
import { CompanyCapReachedError, OpenAskSlotCapError } from "./planGates";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

// Open-ask slots ride on the seeker's own requests and credits payloads, and the
// ask-time cap answers with a typed 409. Every value comes from the caller's
// own asks and plan: the deps are asked about the signed-in id only.
const FREE = resolvePlanEntitlements(null);
const slotsFor = (userId: number): OpenAskSlots => openAskSlots(FREE, userId === 11 ? 2 : 3);
const summary = { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 1, purchasedCreditsRemaining: 0, totalAvailable: 1, cycleKey: "2026-10", subscriptionStatus: null, subscriptionCurrentTermEnd: null };

function setup(over: Partial<Record<keyof PrivateReferralRouteDeps, unknown>> = {}) {
  const app = express();
  app.use(express.json());
  const calls: string[] = [];
  const activity: Array<Record<string, unknown>> = [];
  const getOpenAskSlots = vi.fn(async (userId: number) => { calls.push(`slots:${userId}`); return slotsFor(userId); });
  const deps = {
    resolveIdentity: async (req: express.Request) => (req.header("x-test-user") ? { account: { id: Number(req.header("x-test-user")), openId: "workos-test" } } : undefined),
    createCompanyReferralRequest: async () => ({ requestId: 700, companyDomain: "wipro.com", jobFunction: "Design", notifiedEmployees: 1, coverageStatus: "covered" as const, slots: openAskSlots(FREE, 3), replayed: false }),
    reconcileExpiredPendingReferrals: async (userId: number) => { calls.push(`reconcile:${userId}`); return { expiredRequestIds: [] }; },
    listJobSeekerCompanyReferrals: async () => [],
    getCreditSummary: async () => summary,
    getOpenAskSlots,
    resolveCompanyIdentities: async () => new Map(),
    getBlockedReferralRequestIds: async () => new Set<number>(),
    recordActivity: async (input: Record<string, unknown>) => { activity.push(input); },
    ...over,
  };
  registerPrivateReferralRoutes(app, deps as unknown as PrivateReferralRouteDeps);
  return { app, calls, activity, getOpenAskSlots };
}

const send = (app: express.Express, user = "11") =>
  request(app).post("/api/company-referrals").set("x-test-user", user).set("Idempotency-Key", "ask-key-0123456789abcdef").send({ expectedCost: 1, targetRoleUrl: "https://careers.wipro.com/job/product-designer-123", attachmentIds: [5], candidateMessage: "A specific note about the role." });

describe("open-ask slot routes", () => {
  it("answers a send at the cap with 409 and the typed slots body, and logs the refusal", async () => {
    const full = openAskSlots(FREE, 3);
    const { app, activity } = setup({ createCompanyReferralRequest: async () => { throw new OpenAskSlotCapError(full); } });
    const response = await send(app);
    expect(response.status).toBe(409);
    const body = slotCapReachedSchema.parse(response.body);
    expect(body).toEqual({ error: "All 3 slots are in use. Wait for an answer or withdraw an ask.", code: "slot_cap_reached", slots: full });
    expect(activity).toContainEqual(expect.objectContaining({ actorUserId: 11, action: "company_referral.slot_cap_reached", outcome: "denied", metadata: { open: 3, cap: 3, plan: "free" } }));
  });

  it("answers a send at the per-company cap with 409 and the typed body, and logs the refusal (D-006)", async () => {
    const { app, activity } = setup({ createCompanyReferralRequest: async () => { throw new CompanyCapReachedError("wipro.com", 2); } });
    const response = await send(app);
    expect(response.status).toBe(409);
    const body = companyCapReachedSchema.parse(response.body);
    expect(body).toEqual({ error: "You already have 2 open asks at wipro.com. Wait for an answer or withdraw one before asking there again. This limit is the same on every plan.", code: "company_cap_reached", companyDomain: "wipro.com", open: 2, cap: 2 });
    expect(activity).toContainEqual(expect.objectContaining({ actorUserId: 11, action: "company_referral.company_cap_reached", outcome: "denied", companyDomain: "wipro.com", metadata: { open: 2, cap: 2 } }));
  });

  it("returns the caller's slots with a created ask", async () => {
    const response = await send(setup().app);
    expect(response.status).toBe(201);
    expect(openAskSlotsSchema.parse(response.body.slots)).toMatchObject({ open: 3, cap: 3, full: true });
  });

  it("adds the caller's own slots to the seeker credit summary, never cached", async () => {
    const { app, getOpenAskSlots } = setup();
    const response = await request(app).get("/api/credits/summary?role=job_seeker&userId=12").set("x-test-user", "11");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.summary).toMatchObject({ ...summary, slots: slotsFor(11) });
    expect(getOpenAskSlots.mock.calls.map(call => call[0])).toEqual([11]);
  });

  it("leaves slots off the referrer summary, and keeps the credits when the count fails", async () => {
    const referrer = setup();
    const asReferrer = await request(referrer.app).get("/api/credits/summary?role=referrer").set("x-test-user", "11");
    expect(asReferrer.body.summary.slots).toBeUndefined();
    expect(referrer.getOpenAskSlots).not.toHaveBeenCalled();
    const failing = setup({ getOpenAskSlots: async () => { throw new Error("db down"); } });
    const degraded = await request(failing.app).get("/api/credits/summary?role=job_seeker").set("x-test-user", "11");
    expect(degraded.status).toBe(200);
    expect(degraded.body.summary).toEqual(summary);
  });

  it("counts the requests-page slots after the expiry reconcile, for the caller only", async () => {
    const { app, calls } = setup();
    const response = await request(app).get("/api/company-referrals/mine").set("x-test-user", "12");
    expect(response.status).toBe(200);
    expect(response.body.slots).toEqual(slotsFor(12));
    expect(calls).toEqual(["reconcile:12", "slots:12"]);
  });

  it("requires sign-in for every slot surface", async () => {
    const { app, getOpenAskSlots } = setup();
    expect((await request(app).get("/api/credits/summary?role=job_seeker")).status).toBe(401);
    expect((await request(app).get("/api/company-referrals/mine")).status).toBe(401);
    expect(getOpenAskSlots).not.toHaveBeenCalled();
  });
});
