import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";
import { PlanLimitError } from "./planGates";

/*
 * Queue task 13, slice A at the HTTP boundary: the showcase pieces a seeker pins
 * ride along with the ask, the plan's pin cap answers as the same typed 409 the
 * showcase routes use, and a verified referrer reads the pinned work on the
 * unclaimed preview. The persistence rules (ownership, cap, first-copy-wins
 * order) are pinned in db.askPinnedWork.test.ts; this file pins what the route
 * refuses, forwards and records.
 */

type Deps = PrivateReferralRouteDeps;
type ActivityRow = Parameters<NonNullable<Deps["recordActivity"]>>[0];
type AskInput = Parameters<Deps["createCompanyReferralRequest"]>[1];

const JOB_URL = "https://careers.acme.com/jobs/design";
const IDEMPOTENCY_KEY = "00000000-0000-4000-8000-000000000001";
const attachment = { id: 77, ownerId: 1, fileName: "resume.pdf", fileKey: "private/resume.pdf", mimeType: "application/pdf", fileSize: 3 };

function setup(overrides: Partial<Deps> = {}) {
  const app = express();
  app.use(express.json());
  const activity: ActivityRow[] = [];
  const identities = new Map<string, Awaited<ReturnType<Deps["resolveIdentity"]>>>([
    ["seeker", { account: { id: 1, openId: "workos-seeker" }, primaryEmail: { emailAddress: "seeker@example.com", verification: { status: "verified" } } }],
    ["employee", { account: { id: 2, openId: "workos-employee" }, primaryEmail: { emailAddress: "employee@acme.com", verification: { status: "verified" } } }],
  ]);
  const createCompanyReferralRequest = vi.fn(async (_userId: number, _input: AskInput) => ({ requestId: 501, companyDomain: "acme.com", notifiedEmployees: 1 }));
  registerPrivateReferralRoutes(app, {
    resolveIdentity: async req => identities.get(String(req.header("x-test-user"))),
    dataUrlToBuffer: () => Buffer.from("%PDF-test"), sanitizeDocumentName: value => value,
    storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf",
    createReferralAttachment: async () => attachment,
    getAccessibleReferralAttachment: async () => undefined,
    saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }),
    createCompanyReferralRequest,
    listCompanyReferralInbox: async () => [],
    getUnclaimedCompanyReferralPreview: async () => undefined,
    claimCompanyReferralRequest: async (_userId, requestId) => ({ requestId, claimed: true }),
    getClaimedCompanyReferralDetail: async () => undefined,
    listPublicCompanyOpportunities: async () => [],
    publishCompanyOpportunity: async (userId, input) => ({ id: 92, userId, ...input }),
    recordActivity: async input => { activity.push(input); },
    ...overrides,
  });
  return { app, activity, createCompanyReferralRequest };
}

const sendAsk = (app: express.Express, body: Record<string, unknown>) =>
  request(app).post("/api/company-referrals").set("Idempotency-Key", IDEMPOTENCY_KEY).set("x-test-user", "seeker")
    .send({ expectedCost: 1, targetRoleUrl: JOB_URL, attachmentIds: [77], ...body });

describe("POST /api/company-referrals pinned work", () => {
  it("forwards the pinned ids in the order the seeker tapped and records how many travel", async () => {
    const { app, activity, createCompanyReferralRequest } = setup();
    const response = await sendAsk(app, { workItemIds: [12, 11] });
    expect(response.status).toBe(201);
    expect(createCompanyReferralRequest.mock.calls[0][1]).toMatchObject({ workItemIds: [12, 11] });
    const created = activity.find(item => item.action === "company_referral.created");
    expect(created?.metadata?.pinnedWorkCount).toBe(2);
  });

  it("folds a repeated id before forwarding and counting, so the analytics match what rides along", async () => {
    // [12,12] is one piece of work, not two. The route is the only place that
    // knows both the forwarded list and the recorded count, so it folds there:
    // a duplicate can never make the ask look richer than it is (D-088).
    const { app, activity, createCompanyReferralRequest } = setup();
    const response = await sendAsk(app, { workItemIds: [12, 12] });
    expect(response.status).toBe(201);
    expect(createCompanyReferralRequest.mock.calls[0][1]).toMatchObject({ workItemIds: [12] });
    expect(activity.find(item => item.action === "company_referral.created")?.metadata?.pinnedWorkCount).toBe(1);
  });

  it.each([[undefined], [[]]])("sends no pinned-work field at all when nothing is picked", async (workItemIds) => {
    const { app, activity, createCompanyReferralRequest } = setup();
    const response = await sendAsk(app, workItemIds === undefined ? {} : { workItemIds });
    expect(response.status).toBe(201);
    expect(createCompanyReferralRequest.mock.calls[0][1]).not.toHaveProperty("workItemIds");
    expect(activity.find(item => item.action === "company_referral.created")?.metadata?.pinnedWorkCount).toBe(0);
  });

  it.each([
    ["a non-numeric id", ["abc"]],
    ["a zero id", [0]],
    ["a fractional id", [1.5]],
    ["more than one request can carry", [1, 2, 3, 4, 5, 6, 7]],
    ["a list that is not an array", "12"],
    ["an id map rather than a list", { 0: 12 }],
  ])("refuses %s before the ask exists instead of sending it without the work", async (_label, workItemIds) => {
    const { app, createCompanyReferralRequest } = setup();
    const response = await sendAsk(app, { workItemIds });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/pin work from your showcase/i);
    expect(createCompanyReferralRequest).not.toHaveBeenCalled();
  });

  it("answers a pin cap the plan does not include with the showcase routes' typed 409", async () => {
    const message = "Your Free plan puts 1 piece of work in front of a referrer. Choose the one that best proves this role.";
    const { app, activity } = setup({
      createCompanyReferralRequest: async () => { throw new PlanLimitError("showcase_pins", 1, message); },
    });
    const response = await sendAsk(app, { workItemIds: [12, 11] });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: message, code: "plan_limit", limit: "showcase_pins", cap: 1 });
    const denial = activity.find(item => item.action === "company_referral.pinned_work_limit_reached");
    expect(denial).toMatchObject({ outcome: "denied", metadata: { limit: "showcase_pins", cap: 1 } });
    expect(activity.some(item => item.action === "company_referral.created")).toBe(false);
  });

  it("refuses a piece that left the seeker's showcase with the words the composer shows", async () => {
    // Matched by name, like the other db-thrown classes: importing @server/db here
    // would boot the persistence plane for a message-string assertion.
    const message = "That work is no longer in your showcase. Add it again, or choose a piece you still have.";
    const { app, activity } = setup({
      createCompanyReferralRequest: async () => { throw Object.assign(new Error(message), { name: "AskWorkItemNotInShowcaseError" }); },
    });
    const response = await sendAsk(app, { workItemIds: [12] });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe(message);
    expect(activity.some(item => item.action === "company_referral.created")).toBe(false);
  });

  it("sends no ask for a pinned work list when the seeker is not signed in", async () => {
    const { app, createCompanyReferralRequest } = setup();
    const response = await request(app).post("/api/company-referrals").set("Idempotency-Key", IDEMPOTENCY_KEY)
      .send({ expectedCost: 1, targetRoleUrl: JOB_URL, attachmentIds: [77], workItemIds: [12] });
    expect(response.status).toBe(401);
    expect(createCompanyReferralRequest).not.toHaveBeenCalled();
  });
});

describe("GET /api/company-referrals/:requestId/preview pinned work", () => {
  const workItems = [
    { title: "Shipped the mobile PWA", kind: "case_study", source: "IIT Bombay hackathon", url: "https://example.com/pwa" },
    { title: "Approvals redesign", kind: "code", source: null, url: null },
  ];

  it("hands the referrer the seeker's pinned work and records that it was shown", async () => {
    const { app, activity } = setup({
      getUnclaimedCompanyReferralPreview: async () => ({
        id: 501, candidateName: "Avery", candidateMessage: "I led a measurable product design launch.",
        companyDomain: "acme.com", targetRoleUrl: JOB_URL, attachments: [attachment], workItems,
      }),
    });
    const response = await request(app).get("/api/company-referrals/501/preview").set("x-test-user", "employee");
    expect(response.status).toBe(200);
    expect(response.body.request.workItems).toEqual(workItems);
    // Privacy holds with the new section: the name stays withheld and the resume
    // stays metadata-only, so pinned work is the only extra the referrer gains.
    expect(JSON.stringify(response.body)).not.toContain("Avery");
    expect(JSON.stringify(response.body)).not.toContain("signed.example");
    expect(response.body.request.attachments[0]).toMatchObject({ availability: "after_claim" });
    expect(activity.find(item => item.action === "company_referral.preview_viewed")?.metadata).toMatchObject({ pinnedWorkCount: 2, resumeAccess: "metadata_only" });
  });

  it("still previews an ask whose pinned work the API predates, and records none shown", async () => {
    const { app, activity } = setup({
      getUnclaimedCompanyReferralPreview: async () => ({
        id: 501, candidateMessage: "I led a measurable product design launch.", companyDomain: "acme.com", targetRoleUrl: JOB_URL, attachments: [attachment],
      }),
    });
    const response = await request(app).get("/api/company-referrals/501/preview").set("x-test-user", "employee");
    expect(response.status).toBe(200);
    expect(response.body.request).not.toHaveProperty("workItems");
    expect(activity.find(item => item.action === "company_referral.preview_viewed")?.metadata?.pinnedWorkCount).toBe(0);
  });
});
