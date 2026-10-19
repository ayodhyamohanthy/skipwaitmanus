import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

describe("referral operating-system routes", () => {
  it("returns role-scoped homes, records only a claimed referrer decision, and protects aggregate admin health", async () => {
    const app = express(); app.use(express.json());
    const identities = new Map([
      ["seeker", { account: { id: 1, openId: "seeker", role: "user" as const } }],
      ["employee", { account: { id: 2, openId: "employee", role: "user" as const } }],
      ["member", { account: { id: 3, openId: "member", role: "user" as const } }],
      ["admin", { account: { id: 4, openId: "admin", role: "admin" as const } }],
    ]);
    const savedRequests: Array<{ requestId: number; saved: boolean }> = [];
    const activities: any[] = [];
    const reviews: Array<{ userId: number; requestId: number; decision: string; message?: string }> = [];
    let diagnosticFails = false;
    const listInboxByState = vi.fn(async (_userId: number, state: string) => [{ id: 18, companyDomain: "acme.com", status: state === "completed" ? "approved" : "pending", inboxState: state }]);
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => identities.get(String(req.header("x-test-user"))),
      dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value, storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf",
      createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 18, companyDomain: "acme.com", notifiedEmployees: 1 }),
      listCompanyReferralInbox: async () => [], listCompanyReferralInboxByState: listInboxByState, listJobSeekerCompanyReferrals: async userId => userId === 1 ? [{ id: 18, companyDomain: "acme.com", status: "pending", referrerId: null, attachmentCount: 1 }] : [],
      saveCompanyReferralRequest: async (_userId, requestId, saved) => { savedRequests.push({ requestId, saved }); return { requestId, saved }; }, claimCompanyReferralRequest: async requestId => ({ requestId, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      reviewReferralRequest: async (userId, input) => { reviews.push({ userId, requestId: input.requestId, decision: input.decision, message: input.message }); return { status: input.decision }; },
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
      getDomainIntegrity: async () => { if (diagnosticFails) throw new Error("diagnostic failed"); return ({ affectedCount: 2, aggregates: { public_suffix_only: 1, malformed_ip_localhost: 1 }, affectedRows: [{ table: "jobs", rowId: "9", storedDomain: "co.uk", classification: "public_suffix_only" }], evidence: { affectedCount: 0, aggregates: {}, affectedRows: [] } }); },
      recordActivity: async input => { activities.push(input); },
      getReferralFlowHealth: async () => ({ funnel: { requestsCreated: 5, requestsClaimed: 3, decisionsRecorded: 2, waitingForCoverage: 2 }, coverageGaps: [{ companyDomain: "acme.com", waitingRequests: 2, verifiedCoverage: 0 }], instrumentation: { uploadedDocuments: 5, recordedFailures: 1 } }),
    });

    const seekerHome = await request(app).get("/api/company-referrals/mine").set("x-test-user", "seeker");
    expect(seekerHome.status).toBe(200); expect(seekerHome.body.requests).toHaveLength(1); expect(seekerHome.body.requests[0]).not.toHaveProperty("personalPitch");
    expect((await request(app).get("/api/company-referrals/mine")).status).toBe(401);

    const inbox = await request(app).get("/api/company-referrals/inbox?scope=saved").set("x-test-user", "employee");
    expect(inbox.status).toBe(200); expect(inbox.body.scope).toBe("saved"); expect(listInboxByState).toHaveBeenCalledWith(2, "saved");
    const saved = await request(app).post("/api/company-referrals/18/save").set("x-test-user", "employee").send({ saved: true });
    expect(saved.status).toBe(200); expect(savedRequests).toEqual([{ requestId: 18, saved: true }]);

    const reviewed = await request(app).post("/api/company-referrals/18/review").set("x-test-user", "employee").send({ decision: "approved", message: "I can help." });
    expect(reviewed.status).toBe(200); expect(reviews).toEqual([{ userId: 2, requestId: 18, decision: "approved", message: "I can help." }]);
    expect((await request(app).post("/api/company-referrals/18/review").set("x-test-user", "employee").send({ decision: "maybe" })).status).toBe(400);

    expect((await request(app).get("/api/admin/flow-health").set("x-test-user", "member")).status).toBe(403);
    const signedOutDiagnostic = await request(app).get("/api/admin/domain-integrity");
    expect(signedOutDiagnostic.status).toBe(403); expect(signedOutDiagnostic.header["cache-control"]).toBe("private, no-store");
    const memberDiagnostic = await request(app).get("/api/admin/domain-integrity").set("x-test-user", "member");
    expect(memberDiagnostic.status).toBe(403); expect(memberDiagnostic.header["cache-control"]).toBe("private, no-store");
    const diagnostic = await request(app).get("/api/admin/domain-integrity").set("x-test-user", "admin");
    expect(diagnostic.status).toBe(200); expect(diagnostic.header["cache-control"]).toBe("private, no-store"); expect(diagnostic.body.diagnostic).toMatchObject({ affectedCount: 2, affectedRows: [{ table: "jobs", rowId: "9", storedDomain: "co.uk", classification: "public_suffix_only" }] });
    diagnosticFails = true;
    const failedDiagnostic = await request(app).get("/api/admin/domain-integrity").set("x-test-user", "admin");
    expect(failedDiagnostic.status).toBe(500); expect(failedDiagnostic.header["cache-control"]).toBe("private, no-store");
    const health = await request(app).get("/api/admin/flow-health").set("x-test-user", "admin");
    expect(health.status).toBe(200); expect(activities.map(item => item.action)).toContain("admin.domain_integrity_viewed"); expect(health.body.health.funnel).toMatchObject({ requestsCreated: 5, waitingForCoverage: 2 }); expect(health.body.health.coverageGaps[0]).toMatchObject({ companyDomain: "acme.com", verifiedCoverage: 0 });
  });
});

describe("admin flow-health baseline block (D-018)", () => {
  const app = (deps: Parameters<typeof registerPrivateReferralRoutes>[1]) => { const server = express(); server.use(express.json()); registerPrivateReferralRoutes(server, deps); return server; };
  const identities = {
    member: { account: { id: 3, openId: "member", role: "user" as const } },
    admin: { account: { id: 4, openId: "admin", role: "admin" as const } },
  };
  const baseline = {
    windowDays: 28,
    generatedAt: "2026-10-16T12:00:00.000Z",
    weeks: [{ weekStart: "2026-10-12", asks: 5, accepted: 1, passed: 1, expired: 1, declined: 1, withdrawn: 0, waiting: 1, uncovered: 2 }],
    expiries: { total: 1, last7Days: 1 },
    decisionLatency: { sampleSize: 2, medianHours: 40, p90Hours: 50 },
    coverage: [{ companyDomain: "acme.com", verifiedReferrers: 2, availableReferrers: 1, pausedOrFull: 1, waitingAsks: 1 }],
    demand: [{ companyDomain: "acme.com", waitingAsks: 1, oldestWaitingDays: 3, verifiedReferrers: 2 }],
    externalReferrers: { activeLast7Days: 1, activeInWindow: 2, excludedOperatorDomains: ["skipwait.me"] },
    subscribers: { paid: 3, trialing: 1, byPlan: [{ plan: "momentum", count: 2 }] },
    dataQuality: [{ id: "asks_without_transition", label: "Asks with no state-machine record", count: 2, hint: "Audit the ask." }],
  };

  it("returns the aggregate baseline to an administrator only, and never fakes it without a database", async () => {
    const activities: Array<{ action: string }> = [];
    const wired = app({ resolveIdentity: async req => identities[String(req.header("x-test-user")) as keyof typeof identities], recordActivity: async input => { activities.push({ action: String((input as { action?: string }).action ?? "") }); }, getReferralFlowBaseline: async () => baseline } as Parameters<typeof registerPrivateReferralRoutes>[1]);

    expect((await request(wired).get("/api/admin/flow-health")).status).toBe(403);
    expect((await request(wired).get("/api/admin/flow-health").set("x-test-user", "member")).status).toBe(403);
    const response = await request(wired).get("/api/admin/flow-health").set("x-test-user", "admin");
    expect(response.status).toBe(200);
    expect(response.header["cache-control"]).toBe("private, no-store");
    expect(response.body.baseline).toEqual(baseline);
    expect(response.body.health.funnel).toBeDefined();
    expect(activities.map(item => item.action)).toContain("admin.flow_health_viewed");
    // Counts only: no identity or address may reach the response.
    expect(JSON.stringify(response.body.baseline)).not.toMatch(/userId|actorUserId|email|candidateName/);

    const unwired = app({ resolveIdentity: async req => identities[String(req.header("x-test-user")) as keyof typeof identities], recordActivity: async () => {} } as Parameters<typeof registerPrivateReferralRoutes>[1]);
    const withoutBaseline = await request(unwired).get("/api/admin/flow-health").set("x-test-user", "admin");
    expect(withoutBaseline.status).toBe(200);
    expect(withoutBaseline.body.baseline).toBeNull();
  });
});
