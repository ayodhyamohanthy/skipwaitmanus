// D-022 referrer-posted roles: the REST edge (docs/KIT_V4_BUILD_PLAN.md section 3c).
// Covers the wall's expiry hiding, the publish gate, the poster's own list and
// renew/close controls, the ask-from-a-post hand-off, and the company page route.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { companyOpportunitiesResponseSchema, myOpportunitiesResponseSchema } from "../shared/companyOpportunities";
import type { PublicCompany } from "../shared/companies";
import { registerCompanyDirectoryRoutes } from "./companyDirectoryRoutes";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

const day = 86_400_000;
const key = (suffix: string) => `00000000-0000-4000-8000-0000000000${suffix}`;
const askBody = (extra: Record<string, unknown> = {}) => ({ targetRoleUrl: "https://careers.acme.com/jobs/design", attachmentIds: [88], ...extra });

type ActivityInput = { action: string; outcome?: string; resourceId?: string | number; metadata?: Record<string, unknown> };

const identities: Record<string, { account: { id: number; openId: string } }> = {
  seeker: { account: { id: 11, openId: "workos-seeker" } },
  poster: { account: { id: 22, openId: "workos-poster" } },
  staff: { account: { id: 33, openId: "workos-staff" } },
  plain: { account: { id: 44, openId: "workos-plain" } },
};

function opportunityApp(overrides: Record<string, unknown> = {}) {
  const app = express();
  const activity: ActivityInput[] = [];
  app.use(express.json());
  registerPrivateReferralRoutes(app, {
    resolveIdentity: async req => identities[String(req.header("x-test-user"))],
    dataUrlToBuffer: () => Buffer.from("pdf"),
    sanitizeDocumentName: value => value,
    storagePut: async () => ({ key: "private/resume.pdf" }),
    storageGetSignedUrl: async () => "https://signed.example/resume.pdf",
    createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }),
    getAccessibleReferralAttachment: async () => undefined,
    saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }),
    getVerifiedWorkEmailAccess: async userId => (userId === 33 ? { workEmailDomain: "acme.com" } : undefined),
    createCompanyReferralRequest: async () => ({ requestId: 601, companyDomain: "acme.com", notifiedEmployees: 1 }),
    listCompanyReferralInbox: async () => [],
    listJobSeekerCompanyReferrals: async () => [],
    claimCompanyReferralRequest: async () => ({ requestId: 601, claimed: true }),
    getClaimedCompanyReferralDetail: async () => undefined,
    listPublicCompanyOpportunities: async () => [],
    publishCompanyOpportunity: async () => ({ id: 91 }),
    recordActivity: async (input: ActivityInput) => { activity.push(input); },
    ...overrides,
  } as Parameters<typeof registerPrivateReferralRoutes>[1]);
  return { app, activity };
}

describe("the opportunity wall hides lapsed posts", () => {
  it("keeps live posts, hides expired ones, and records one expired_hidden batch", async () => {
    const rows = [
      { id: 91, expiresAt: new Date(Date.now() + 5 * day) },
      { id: 92, createdAt: new Date(Date.now() - 2 * day) },
      { id: 93, expiresAt: new Date(Date.now() - 1000) },
      { id: 94, createdAt: new Date(Date.now() - 31 * day) },
      { id: 95 },
    ];
    const { app, activity } = opportunityApp({ listPublicCompanyOpportunities: async () => rows });
    const response = await request(app).get("/api/opportunities");
    expect(response.status).toBe(200);
    expect(response.body.opportunities.map((row: { id: number }) => row.id)).toEqual([91, 92, 95]);
    expect(activity.filter(entry => entry.action === "opportunity.expired_hidden")).toEqual([
      expect.objectContaining({ outcome: "success", metadata: { hiddenCount: 2 } }),
    ]);
  });

  it("carries the poster projection and never leaks owner identity fields", async () => {
    const rows = [{ id: 91, companyDomain: "acme.com", kind: "hiring_now", roleTitle: "Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", location: null, compensation: null, walkInAt: null, walkInEndsAt: null, createdAt: new Date(), isSponsored: false, poster: { kind: "firstName", firstName: "Ravi" }, ownerName: "Ravi Kumar", ownerEmail: "ravi@acme.com", showPosterFirstName: true }];
    const { app } = opportunityApp({ listPublicCompanyOpportunities: async () => rows });
    const response = await request(app).get("/api/opportunities");
    expect(response.status).toBe(200);
    const [row] = response.body.opportunities;
    expect(row.poster).toEqual({ kind: "firstName", firstName: "Ravi" });
    expect(row.ownerName).toBeUndefined();
    expect(row.ownerEmail).toBeUndefined();
    expect(row.showPosterFirstName).toBeUndefined();
  });

  it("records nothing while every post is live", async () => {
    const { app, activity } = opportunityApp({ listPublicCompanyOpportunities: async () => [{ id: 91, expiresAt: new Date(Date.now() + day) }] });
    expect((await request(app).get("/api/opportunities")).status).toBe(200);
    expect(activity.filter(entry => entry.action === "opportunity.expired_hidden")).toHaveLength(0);
  });
});

describe("publishing a posted role", () => {
  it("requires the server's verified work-email verdict, not the sign-in email", async () => {
    const publish = vi.fn(async () => ({ id: 91 }));
    const { app, activity } = opportunityApp({ publishCompanyOpportunity: publish });
    expect((await request(app).post("/api/opportunities").send({ kind: "hiring_now", roleTitle: "Designer" })).status).toBe(401);
    const denied = await request(app).post("/api/opportunities").set("x-test-user", "plain").send({ kind: "hiring_now", roleTitle: "Designer" });
    expect(denied.status).toBe(403);
    expect(publish).not.toHaveBeenCalled();
    const created = await request(app).post("/api/opportunities").set("x-test-user", "staff").send({ kind: "walk_in", roleTitle: "Store Associate", location: "Pune", walkInAt: "2026-10-20T09:00:00.000Z", walkInEndsAt: "2026-10-20T13:00:00.000Z" });
    expect(created.status).toBe(201);
    expect(publish).toHaveBeenCalledWith(33, expect.objectContaining({ kind: "walk_in", showPosterFirstName: false }));
    expect(activity).toContainEqual(expect.objectContaining({ action: "opportunity.published", metadata: expect.objectContaining({ posterNamed: false }) }));
  });

  it("shows a first name only for the exact boolean true", async () => {
    const publish = vi.fn(async () => ({ id: 91 }));
    const { app } = opportunityApp({ publishCompanyOpportunity: publish });
    const created = await request(app).post("/api/opportunities").set("x-test-user", "staff").send({ kind: "hiring_now", roleTitle: "Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", showPosterFirstName: true });
    expect(created.status).toBe(201);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(33, expect.objectContaining({ showPosterFirstName: true }));
    await request(app).post("/api/opportunities").set("x-test-user", "staff").send({ kind: "hiring_now", roleTitle: "Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", showPosterFirstName: "yes" });
    expect(publish).toHaveBeenLastCalledWith(33, expect.objectContaining({ showPosterFirstName: false }));
  });
});

describe("the poster's own openings", () => {
  it("lists them owner-scoped and never cached", async () => {
    const mine = vi.fn(async () => [ownerPost()]);
    const { app } = opportunityApp({ listMyCompanyOpportunities: mine });
    expect((await request(app).get("/api/opportunities/mine")).status).toBe(401);
    const response = await request(app).get("/api/opportunities/mine").set("x-test-user", "poster");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(myOpportunitiesResponseSchema.parse(response.body)).toEqual({ opportunities: [ownerPost()] });
    expect(mine).toHaveBeenCalledWith(22, expect.any(Number));
  });

  it("answers 503 without the service and 500 on a malformed row instead of leaking it", async () => {
    const { app } = opportunityApp();
    expect((await request(app).get("/api/opportunities/mine").set("x-test-user", "poster")).status).toBe(503);
    const malformed = opportunityApp({ listMyCompanyOpportunities: async () => [{ id: 91, roleTitle: "Designer" }] });
    const response = await request(malformed.app).get("/api/opportunities/mine").set("x-test-user", "poster");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: "We could not load your openings" });
  });

  it("renews and closes only the owner's own opening", async () => {
    const renew = vi.fn(async (userId: number, id: number) => (userId === 22 && id === 91 ? { id, renewed: true as const, expiresAt: new Date("2026-11-16T12:00:00.000Z") } : undefined));
    const close = vi.fn(async (userId: number, id: number) => (userId === 22 && id === 92 ? { id, closed: true as const } : undefined));
    const { app, activity } = opportunityApp({ renewCompanyOpportunity: renew, closeCompanyOpportunity: close });
    expect((await request(app).post("/api/opportunities/91/renew")).status).toBe(401);
    expect((await request(app).post("/api/opportunities/abc/renew").set("x-test-user", "poster")).status).toBe(400);
    expect((await request(app).post("/api/opportunities/0/renew").set("x-test-user", "poster")).status).toBe(400);
    expect((await request(app).post("/api/opportunities/91/renew").set("x-test-user", "seeker")).status).toBe(404);
    const renewed = await request(app).post("/api/opportunities/91/renew").set("x-test-user", "poster");
    expect(renewed.status).toBe(200);
    expect(renewed.body).toEqual({ renewed: true, id: 91, expiresAt: "2026-11-16T12:00:00.000Z" });
    expect((await request(app).post("/api/opportunities/92/close").set("x-test-user", "seeker")).status).toBe(404);
    const closed = await request(app).post("/api/opportunities/92/close").set("x-test-user", "poster");
    expect(closed.status).toBe(200);
    expect(closed.body).toEqual({ closed: true, id: 92 });
    expect(activity.filter(entry => entry.action === "opportunity.renewed")).toHaveLength(1);
    expect(activity).toContainEqual(expect.objectContaining({ action: "opportunity.renewed", outcome: "success", resourceId: 91 }));
    expect(activity).toContainEqual(expect.objectContaining({ action: "opportunity.closed", outcome: "success", resourceId: 92 }));
  });
});

describe("an ask written from a post", () => {
  it("passes a validated post selection through and records fromPost and firstLook", async () => {
    const created: Array<Record<string, unknown>> = [];
    const { app, activity } = opportunityApp({
      createCompanyReferralRequest: async (_userId: number, input: Record<string, unknown>) => { created.push(input); return { requestId: 601, companyDomain: "acme.com", notifiedEmployees: 1, fromPost: true, firstLook: true }; },
    });
    const response = await request(app).post("/api/company-referrals").set("Idempotency-Key", key("01")).set("x-test-user", "seeker").send(askBody({ opportunityId: 55 }));
    expect(response.status).toBe(201);
    expect(created[0]).toMatchObject({ opportunityId: 55 });
    expect(activity).toContainEqual(expect.objectContaining({ action: "company_referral.created", metadata: expect.objectContaining({ fromPost: true, firstLook: true }) }));
  });

  it("refuses a malformed post selection before any create", async () => {
    const create = vi.fn(async () => ({ requestId: 601, companyDomain: "acme.com", notifiedEmployees: 1 }));
    const { app } = opportunityApp({ createCompanyReferralRequest: create });
    for (const opportunityId of ["55", 0, -3, 1.5]) {
      const response = await request(app).post("/api/company-referrals").set("Idempotency-Key", key("02")).set("x-test-user", "seeker").send(askBody({ opportunityId }));
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/no longer available/i);
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("a plain ask never carries a post selection", async () => {
    const created: Array<Record<string, unknown>> = [];
    const { app, activity } = opportunityApp({
      createCompanyReferralRequest: async (_userId: number, input: Record<string, unknown>) => { created.push(input); return { requestId: 602, companyDomain: "acme.com", notifiedEmployees: 1 }; },
    });
    expect((await request(app).post("/api/company-referrals").set("Idempotency-Key", key("03")).set("x-test-user", "seeker").send(askBody())).status).toBe(201);
    expect((await request(app).post("/api/company-referrals").set("Idempotency-Key", key("04")).set("x-test-user", "seeker").send(askBody({ opportunityId: null }))).status).toBe(201);
    expect(created).toHaveLength(2);
    for (const input of created) expect(input).not.toHaveProperty("opportunityId");
    expect(activity).toContainEqual(expect.objectContaining({ action: "company_referral.created", metadata: expect.objectContaining({ fromPost: false, firstLook: false }) }));
  });

  it("maps a lapsed or cross-company post to 400, not 500", async () => {
    const { app } = opportunityApp({ createCompanyReferralRequest: async () => { throw new Error("This opening is no longer available. Refresh the company page and choose again."); } });
    const response = await request(app).post("/api/company-referrals").set("Idempotency-Key", key("05")).set("x-test-user", "seeker").send(askBody({ opportunityId: 55 }));
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/no longer available/i);
  });
});

const acme: PublicCompany = { slug: "acme", name: "Acme", initials: "A", industry: "Retail", location: "Global", functions: ["Engineering"], blurb: "Build retail tools.", domains: ["acme.com"], openToReferrals: true };

function directoryApp(overrides: Record<string, unknown> = {}) {
  const app = express();
  registerCompanyDirectoryRoutes(app, {
    resolveIdentity: async () => undefined,
    getCompanyDirectoryEntry: async (slug: string) => (slug === "acme" ? acme : undefined),
    listCompanyOpportunities: async () => [publicPost()],
    ...overrides,
  } as Parameters<typeof registerCompanyDirectoryRoutes>[1]);
  return { app };
}

describe("the company page openings route", () => {
  it("serves a company's live openings publicly and cached, scoped to its domains", async () => {
    const list = vi.fn(async () => [publicPost()]);
    const { app } = directoryApp({ listCompanyOpportunities: list });
    const response = await request(app).get("/api/companies/acme/opportunities");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=60");
    expect(companyOpportunitiesResponseSchema.parse(response.body)).toEqual({ opportunities: [publicPost()] });
    expect(list).toHaveBeenCalledWith(["acme.com"], expect.any(Number));
  });

  it("404s an unknown company and 400s a malformed slug without any lookup", async () => {
    const list = vi.fn(async () => []);
    const { app } = directoryApp({ listCompanyOpportunities: list });
    expect((await request(app).get("/api/companies/other/opportunities")).status).toBe(404);
    expect((await request(app).get("/api/companies/Acme/opportunities")).status).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });

  it("never renders a row that fails the public contract", async () => {
    const { app } = directoryApp({ listCompanyOpportunities: async () => [{ id: 91, roleTitle: "Designer", ownerId: 7 }] });
    const response = await request(app).get("/api/companies/acme/opportunities");
    expect(response.status).toBe(500);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(response.body)).not.toMatch(/ownerId/i);
  });
});

function publicPost(over: Record<string, unknown> = {}) {
  return {
    id: 91, companyDomain: "acme.com", kind: "hiring_now", roleTitle: "Product Designer",
    targetRoleUrl: "https://careers.acme.com/jobs/design", location: "Bengaluru", compensation: null,
    walkInAt: null, walkInEndsAt: null, postedAt: "2026-10-10T09:00:00.000Z", expiresAt: "2026-11-09T09:00:00.000Z",
    poster: { kind: "anonymous" }, ...over,
  };
}

function ownerPost(over: Record<string, unknown> = {}) {
  return { ...publicPost(), isActive: true, expired: false, renewable: false, ...over };
}
