import { createHash } from "node:crypto";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { normalizeTargetRoleUrl } from "../shared/referralUrl";
import { companyAskJobRow, companyReferralFingerprint, type CreateCompanyReferralInput } from "./db";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";
import { registerProfileRoutes, type ProfileRouteDeps } from "./profileRoutes";

// Asks carry a job function (jobs.jobFunction): set at creation from the
// seeker's choice or the classifier, and exposed on every request row the
// viewer may already see. Visibility rules are the existing ones; the field
// never widens who can read a request.
type Ask = { id: number; seekerId: number; companyDomain: string; jobFunction: string | null };
const asks: Ask[] = [
  { id: 601, seekerId: 11, companyDomain: "wipro.com", jobFunction: "Design" },
  { id: 602, seekerId: 12, companyDomain: "tcs.com", jobFunction: "Astrology" },
  { id: 603, seekerId: 11, companyDomain: "wipro.com", jobFunction: null },
];
const workDomain = new Map([[21, "wipro.com"], [22, "tcs.com"]]);
const attachments = [{ id: 5, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }];

function setup() {
  const app = express();
  app.use(express.json());
  const createCompanyReferralRequest = vi.fn(async (_userId: number, input: { targetRoleUrl: string; jobFunction?: string }) => ({ requestId: 700, companyDomain: "wipro.com", jobFunction: input.jobFunction ?? "Design", notifiedEmployees: 1, coverageStatus: "covered" as const, replayed: false }));
  const inboxFor = (userId: number) => asks.filter(ask => ask.companyDomain === workDomain.get(userId)).map(ask => ({ id: ask.id, companyDomain: ask.companyDomain, status: "pending", jobFunction: ask.jobFunction }));
  const deps = {
    resolveIdentity: async (req: express.Request) => (req.header("x-test-user") ? { account: { id: Number(req.header("x-test-user")), openId: "workos-test" } } : undefined),
    createCompanyReferralRequest,
    listJobSeekerCompanyReferrals: async (userId: number) => asks.filter(ask => ask.seekerId === userId).map(ask => ({ id: ask.id, companyDomain: ask.companyDomain, status: "pending", createdAt: "2026-10-10T00:00:00.000Z", jobFunction: ask.jobFunction })),
    listCompanyReferralInbox: async (userId: number) => inboxFor(userId),
    listCompanyReferralInboxByState: async (userId: number) => inboxFor(userId),
    getUnclaimedCompanyReferralPreview: async (userId: number, requestId: number) => {
      const ask = asks.find(item => item.id === requestId && item.companyDomain === workDomain.get(userId));
      return ask ? { id: ask.id, companyDomain: ask.companyDomain, jobFunction: ask.jobFunction, attachments } : undefined;
    },
    getClaimedCompanyReferralDetail: async (userId: number, requestId: number) => (userId === 21 && requestId === 601 ? { id: 601, companyDomain: "wipro.com", status: "approved", jobFunction: "Design", attachments } : undefined),
    resolveCompanyIdentities: async () => new Map(),
    getBlockedReferralRequestIds: async () => new Set<number>(),
  };
  registerPrivateReferralRoutes(app, deps as unknown as PrivateReferralRouteDeps);
  return { app, createCompanyReferralRequest };
}

const send = (app: express.Express, body: Record<string, unknown>, user = "11") =>
  request(app).post("/api/company-referrals").set("x-test-user", user).set("Idempotency-Key", "ask-key-0123456789abcdef").send({ expectedCost: 1, targetRoleUrl: "https://careers.wipro.com/job/product-designer-123", attachmentIds: [5], candidateMessage: "A specific note about the role.", ...body });

describe("ask creation takes an optional job function", () => {
  it("passes the seeker's listed choice through and returns the stored function", async () => {
    const { app, createCompanyReferralRequest } = setup();
    const response = await send(app, { jobFunction: "Product" });
    expect(response.status).toBe(201);
    expect(createCompanyReferralRequest.mock.calls[0]?.[1]).toMatchObject({ jobFunction: "Product" });
    expect(response.body.jobFunction).toBe("Product");
  });

  it("lets the server infer when the function is absent or null, from the link as submitted", async () => {
    const { app, createCompanyReferralRequest } = setup();
    expect((await send(app, {})).status).toBe(201);
    expect((await send(app, { jobFunction: null, targetRoleUrl: " https://www.linkedin.com/jobs/view/senior-product-designer-at-wipro-3912345 " })).status).toBe(201);
    for (const call of createCompanyReferralRequest.mock.calls) expect(call[1]).not.toHaveProperty("jobFunction");
    expect(createCompanyReferralRequest.mock.calls[1]?.[1]).toMatchObject({ targetRoleUrl: "https://linkedin.com/jobs/view/3912345", submittedTargetRoleUrl: "https://www.linkedin.com/jobs/view/senior-product-designer-at-wipro-3912345" });
  });

  it.each(["design", "Astrology", 5, ["Design"], ""])("rejects %j before anything is reserved", async jobFunction => {
    const { app, createCompanyReferralRequest } = setup();
    const response = await send(app, { jobFunction });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Choose a function from the list");
    expect(createCompanyReferralRequest).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller without reading the function", async () => {
    const { app, createCompanyReferralRequest } = setup();
    expect((await request(app).post("/api/company-referrals").send({ jobFunction: "Design" })).status).toBe(401);
    expect(createCompanyReferralRequest).not.toHaveBeenCalled();
  });
});

describe("request rows expose a normalized jobFunction", () => {
  it("on the seeker's own asks only", async () => {
    const { app } = setup();
    const mine = await request(app).get("/api/company-referrals/mine").set("x-test-user", "11");
    expect(mine.body.requests.map((row: Ask) => [row.id, row.jobFunction])).toEqual([[601, "Design"], [603, null]]);
    const other = await request(app).get("/api/company-referrals/mine").set("x-test-user", "12");
    expect(other.body.requests.map((row: Ask) => [row.id, row.jobFunction])).toEqual([[602, null]]);
  });

  it("on the inbox, preview and claimed detail of a verified referrer at that company", async () => {
    const { app } = setup();
    const inbox = await request(app).get("/api/company-referrals/inbox?scope=new").set("x-test-user", "21");
    expect(inbox.body.requests.map((row: Ask) => [row.id, row.jobFunction])).toEqual([[601, "Design"], [603, null]]);
    expect((await request(app).get("/api/company-referrals/601/preview").set("x-test-user", "21")).body.request.jobFunction).toBe("Design");
    expect((await request(app).get("/api/company-referrals/601").set("x-test-user", "21")).body.request.jobFunction).toBe("Design");
  });

  it("never to a referrer at another company or an anonymous caller", async () => {
    const { app } = setup();
    const inbox = await request(app).get("/api/company-referrals/inbox?scope=new").set("x-test-user", "22");
    expect(inbox.body.requests.map((row: Ask) => row.id)).toEqual([602]);
    for (const path of ["/api/company-referrals/601/preview", "/api/company-referrals/601"]) {
      const denied = await request(app).get(path).set("x-test-user", "22");
      expect(denied.status).toBe(404);
      expect(JSON.stringify(denied.body)).not.toContain("Design");
      expect((await request(app).get(path)).status).toBe(401);
    }
  });
});

describe("the private jobs row behind an ask", () => {
  const base = { companyDomain: "wipro.com", targetRoleUrl: "https://careers.wipro.com/job/product-designer-123", compensation: null, publishedAt: new Date("2026-10-14T00:00:00.000Z") };
  it("stores the seeker's choice as seeker, otherwise the classifier's guess as inferred", () => {
    expect(companyAskJobRow({ ...base, jobFunction: "Product" })).toMatchObject({ company: "wipro.com", jobFunction: "Product", jobFunctionSource: "seeker" });
    expect(companyAskJobRow(base)).toMatchObject({ jobFunction: "Design", jobFunctionSource: "inferred" });
    expect(companyAskJobRow({ ...base, targetRoleUrl: "https://careers.wipro.com/jobs/123" })).toMatchObject({ jobFunction: null, jobFunctionSource: "inferred" });
    // A normalized LinkedIn link keeps only the job id; the guess reads the link as submitted.
    const linkedIn = { ...base, targetRoleUrl: "https://linkedin.com/jobs/view/3912345" };
    expect(companyAskJobRow(linkedIn)).toMatchObject({ targetRoleUrl: "https://linkedin.com/jobs/view/3912345", jobFunction: null });
    expect(companyAskJobRow({ ...linkedIn, roleLinkUrl: "https://www.linkedin.com/jobs/view/senior-product-designer-at-wipro-3912345" })).toMatchObject({ targetRoleUrl: "https://linkedin.com/jobs/view/3912345", jobFunction: "Design", jobFunctionSource: "inferred" });
  });

  it("keeps the idempotency fingerprint of an ask without a chosen function unchanged", () => {
    const input: CreateCompanyReferralInput = { targetRoleUrl: base.targetRoleUrl, personalPitch: "Note", attachmentIds: [9, 5, 9], idempotencyKey: "ask-key-0123456789abcdef" };
    const legacy = createHash("sha256").update(JSON.stringify({ targetRoleUrl: normalizeTargetRoleUrl(base.targetRoleUrl), attachmentIds: [5, 9], pitchHash: createHash("sha256").update("Note").digest("hex"), companyDomain: "wipro.com", confirmedCompanyDomain: null, compensation: null, fastTrackCode: null, fastTrackCompanySlug: null, fastTrackAlias: null })).digest("hex");
    expect(companyReferralFingerprint(input, "wipro.com")).toBe(legacy);
    expect(companyReferralFingerprint({ ...input, jobFunction: "Design" }, "wipro.com")).not.toBe(legacy);
  });
});

describe("referrer job areas are validated against the shared taxonomy", () => {
  function profileApp() {
    const app = express();
    app.use(express.json());
    const save = vi.fn(async (_userId: number, input: { preferAreas?: unknown; preferLevels?: unknown }) => ({ referralCapacity: 3, preferAreas: Array.isArray(input.preferAreas) ? input.preferAreas.map(String) : [], preferLevels: Array.isArray(input.preferLevels) ? input.preferLevels.map(String) : [], referrerVisibility: "anon" as const, notifyNewAsk: true, notifyDigest: false, paused: false }));
    const deps: ProfileRouteDeps = { resolveIdentity: async req => (req.header("x-test-user") ? { account: { id: Number(req.header("x-test-user")), openId: "workos-test" } } : undefined), updateReferrerPreferences: save };
    registerProfileRoutes(app, deps);
    return { app, save };
  }

  it.each([[["Design", "Astrology"]], [["Design", "Design"]], [["Other"]], ["Design"]])("rejects job areas %j without saving", async preferAreas => {
    const { app, save } = profileApp();
    const response = await request(app).put("/api/referrer-preferences").set("x-test-user", "21").send({ preferAreas });
    expect(response.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects unknown levels and saves listed areas and levels", async () => {
    const { app, save } = profileApp();
    expect((await request(app).put("/api/referrer-preferences").set("x-test-user", "21").send({ preferLevels: ["Principal"] })).status).toBe(400);
    const saved = await request(app).put("/api/referrer-preferences").set("x-test-user", "21").send({ preferAreas: ["Data", "Design"], preferLevels: ["Senior"] });
    expect(saved.status).toBe(200);
    expect(saved.body.preferences).toMatchObject({ preferAreas: ["Data", "Design"], preferLevels: ["Senior"] });
    expect(save).toHaveBeenCalledTimes(1);
  });
});
