import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";
import { publicAskRef } from "./askRef";

describe("authenticated work email OTP routes", () => {
  function setup(result: { sent: boolean; reason: string }) {
    const app = express();
    app.use(express.json());
    const sendWorkEmailOtp = vi.fn(async () => result);
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => req.header("x-test-user") ? { account: { id: 1, openId: "workos-test" } } : undefined,
      sendWorkEmailOtp,
    } as unknown as PrivateReferralRouteDeps);
    return { app, sendWorkEmailOtp };
  }

  it("passes a normalized email and trusted client IP to delivery", async () => {
    const { app, sendWorkEmailOtp } = setup({ sent: true, reason: "sent" });
    const response = await request(app).post("/api/work-email/otp/send").set("x-test-user", "employee").send({ email: " REF@ACME.COM " });
    expect(response.status).toBe(200);
    expect(sendWorkEmailOtp).toHaveBeenCalledWith({ email: "ref@acme.com", ip: "127.0.0.1" });
  });

  it.each([
    ["invalid_email", 400], ["invalid_domain", 400], ["not_configured", 503], ["delivery_failed", 502],
  ])("maps %s to HTTP %s", async (reason, status) => {
    const { app } = setup({ sent: false, reason: String(reason) });
    const response = await request(app).post("/api/work-email/otp/send").set("x-test-user", "employee").send({ email: "ref@acme.com" });
    expect(response.status).toBe(status);
  });

  it("matches the OTP login route retry guidance", async () => {
    const { app } = setup({ sent: false, reason: "rate_limited" });
    const response = await request(app).post("/api/work-email/otp/send").set("x-test-user", "employee").send({ email: "ref@acme.com" });
    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("600");
    expect(response.body.retryAfterSeconds).toBe(600);
  });

  it("requires authentication before sending", async () => {
    const { app, sendWorkEmailOtp } = setup({ sent: true, reason: "sent" });
    expect((await request(app).post("/api/work-email/otp/send").send({ email: "ref@acme.com" })).status).toBe(401);
    expect(sendWorkEmailOtp).not.toHaveBeenCalled();
  });
});

describe("private referral HTTP routes", () => {
  it("keeps a resume private through upload, request creation, exclusive claim, and unrelated-user denial", async () => {
    const app = express();
    app.use(express.json());
    let claimedBy: number | undefined;
    let acceptedBy: number | undefined;
    let submittedCandidateMessage = "";
    let submittedCompensation: string | undefined;
    const activity: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
    const attachment = { id: 77, ownerId: 1, fileName: "resume.pdf", fileKey: "private/resume.pdf", mimeType: "application/pdf", fileSize: 3, referrerId: undefined as number | undefined };
    const identities = new Map([["seeker", { account: { id: 1, openId: "workos-seeker" }, primaryEmail: { emailAddress: "seeker@example.com", verification: { status: "verified" } } }], ["employee", { account: { id: 2, openId: "workos-employee" }, primaryEmail: { emailAddress: "employee@acme.com", verification: { status: "verified" } } }], ["outsider", { account: { id: 3, openId: "workos-outsider" }, primaryEmail: { emailAddress: "outsider@other.com", verification: { status: "verified" } } }]]);
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => identities.get(String(req.header("x-test-user"))),
      dataUrlToBuffer: () => Buffer.from("%PDF-test"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf",
      createReferralAttachment: async () => attachment,
      // db.getAccessibleReferralAttachment: the owner, or the referrer once they accepted (D-019(e)); never a claim alone.
      getAccessibleReferralAttachment: async (userId) => userId === 1 || userId === acceptedBy ? { ...attachment, referrerId: acceptedBy } : undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }),
      createCompanyReferralRequest: async (_userId, input) => { submittedCandidateMessage = input.personalPitch; submittedCompensation = input.compensation; return { requestId: 501, companyDomain: "acme.com", notifiedEmployees: 1 }; },
      listJobSeekerCompanyReferrals: async () => [{ id: 501 }, { id: 500 }, { id: 499 }],
      listCompanyReferralInbox: async () => [{ id: 501, companyDomain: "acme.com" }],
      getUnclaimedCompanyReferralPreview: async (userId, requestId) => userId === 2 && requestId === 501 && !claimedBy ? { id: requestId, candidateName: "Avery", candidateMessage: "I led a measurable product design launch.", companyDomain: "acme.com", targetRoleUrl: "https://careers.acme.com/jobs/design", attachments: [attachment] } : undefined,
      claimCompanyReferralRequest: async (userId, requestId) => { claimedBy = userId; return { requestId, claimed: true }; },
      // Hands the route MORE than db.ts returns before acceptance (the name, the storage key): the route's allow-list is under test.
      getClaimedCompanyReferralDetail: async (userId, requestId) => userId === claimedBy ? { id: requestId, title: "Product Designer", candidateName: "Avery", candidateMessage: "I led a measurable product design launch.", targetRoleUrl: "https://careers.acme.com/jobs/design", companyDomain: "acme.com", referrerId: userId, status: acceptedBy === userId ? "approved" : "pending", revision: acceptedBy === userId ? 3 : 2, documentAccessActive: acceptedBy === userId, attachments: [attachment] } : undefined,
      oneClickReviewReferralRequest: async (userId, input) => { if (input.decision === "approved") { claimedBy = userId; acceptedBy = userId; } return { status: input.decision, companyDomain: "acme.com" }; },
      listPublicCompanyOpportunities: async () => [{ id: 91, companyDomain: "acme.com", kind: "hiring_now", roleTitle: "Product Designer" }],
      publishCompanyOpportunity: async (_userId, input) => ({ id: 92, companyDomain: "acme.com", ...input }),
      recordActivity: async input => { activity.push(input); },
    });

    const upload = await request(app).post("/api/documents").set("x-test-user", "seeker").send({ fileName: "resume.pdf", mimeType: "application/pdf", dataUrl: "data:application/pdf;base64,cGRm" });
    expect(upload.status).toBe(201); expect(upload.body.url).toBe("/api/documents/77");
    const malformed = await request(app).post("/api/company-referrals").set("Idempotency-Key", "00000000-0000-4000-8000-000000000001").set("x-test-user", "seeker").send({ targetRoleUrl: "acme product designer", attachmentIds: [77] });
    expect(malformed.status).toBe(400); expect(malformed.body.error).toMatch(/complete job link/i);
    const created = await request(app).post("/api/company-referrals").set("Idempotency-Key", "00000000-0000-4000-8000-000000000001").set("x-test-user", "seeker").send({ targetRoleUrl: "https://careers.acme.com/jobs/design", attachmentIds: [77], candidateMessage: "I led a measurable product design launch.", compensation: "₹12–18 LPA" });
    expect(created.status).toBe(201); expect(created.body.companyDomain).toBe("acme.com"); expect(created.body.lifetimeRequestCount).toBe(3);
    expect(submittedCandidateMessage).toBe("I led a measurable product design launch.");
    expect(submittedCompensation).toBe("₹12–18 LPA");
    expect((await request(app).get("/api/documents/77").set("x-test-user", "outsider")).status).toBe(404);
    expect((await request(app).get("/api/company-referrals/501").set("x-test-user", "outsider")).status).toBe(404);
    expect((await request(app).get("/api/company-referrals/501/preview").set("x-test-user", "outsider")).status).toBe(404);
    const preview = await request(app).get("/api/company-referrals/501/preview").set("x-test-user", "employee");
    expect(preview.status).toBe(200); expect(preview.body.request).not.toHaveProperty("candidateName"); expect(JSON.stringify(preview.body)).not.toContain("Avery"); expect(preview.body.request).toMatchObject({ candidateMessage: "I led a measurable product design launch.", targetRoleUrl: "https://careers.acme.com/jobs/design" }); expect(preview.body.request.attachments).toEqual([{ mimeType: "application/pdf", fileSize: 3, availability: "after_claim" }]); expect(JSON.stringify(preview.body)).not.toContain("resume.pdf"); expect(JSON.stringify(preview.body)).not.toContain("signed.example");
    expect((await request(app).post("/api/company-referrals/501/claim").set("x-test-user", "employee")).status).toBe(200);
    expect((await request(app).get("/api/company-referrals/501/preview").set("x-test-user", "employee")).status).toBe(404);
    // D-019(e): a claim is not an acceptance. The claimed detail keeps the role and the note, but no name, file name or link.
    const lockedDetail = await request(app).get("/api/company-referrals/501").set("x-test-user", "employee");
    expect(lockedDetail.status).toBe(200); expect(lockedDetail.body.request).not.toHaveProperty("candidateName"); expect(JSON.stringify(lockedDetail.body)).not.toMatch(/Avery|resume\.pdf|\/api\/documents|signed\.example|fileKey/);
    expect(lockedDetail.body.request).toMatchObject({ status: "pending", title: "Product Designer", candidateMessage: "I led a measurable product design launch." });
    expect(lockedDetail.body.request.attachments).toEqual([{ mimeType: "application/pdf", fileSize: 3, availability: "after_claim" }]);
    expect((await request(app).get("/api/documents/77").set("x-test-user", "employee")).status).toBe(404);
    expect((await request(app).post("/api/company-referrals/501/one-click-review").set("x-test-user", "employee").send({ decision: "approved", ethicsConfirmed: true })).status).toBe(200);
    const detail = await request(app).get("/api/company-referrals/501").set("x-test-user", "employee");
    expect(detail.status).toBe(200); expect(detail.body.request.candidateName).toBe("Avery"); expect(detail.body.request.attachments[0].url).toBe("/api/documents/77"); expect(JSON.stringify(detail.body)).not.toContain("signed.example"); expect(detail.body.request.attachments[0]).not.toHaveProperty("fileKey");
    // D-019(d): the referrer who accepted the ask reads it with its role title and the seeker's note attached.
    expect(detail.body.request).toMatchObject({ status: "approved", title: "Product Designer", candidateMessage: "I led a measurable product design launch." });
    const securedDocument = await request(app).get("/api/documents/77").set("x-test-user", "employee");
    expect(securedDocument.status).toBe(307); expect(securedDocument.headers.location).toBe("https://signed.example/resume.pdf");
    expect(activity.map(item => item.action)).toEqual(expect.arrayContaining(["document.uploaded", "company_referral.created", "company_referral.claimed", "document.accessed"]));
    expect(activity.some(item => item.action === "workflow.request_completed" && item.metadata?.route === "/api/company-referrals" && item.metadata?.method === "POST" && item.metadata?.statusCode === 201)).toBe(true);
    expect(JSON.stringify(activity)).not.toContain("resume.pdf");
  });

  it("loads each matching employee's unclaimed request on inbox launch, then removes it after the first claim", async () => {
    const app = express(); app.use(express.json());
    let claimedBy: number | undefined;
    const identities = new Map([
      ["employee-a", { account: { id: 2, openId: "workos-employee-a" }, primaryEmail: { emailAddress: "a@acme.com", verification: { status: "verified" } } }],
      ["employee-b", { account: { id: 3, openId: "workos-employee-b" }, primaryEmail: { emailAddress: "b@acme.com", verification: { status: "verified" } } }],
      ["outsider", { account: { id: 4, openId: "workos-outsider" }, primaryEmail: { emailAddress: "employee@other.com", verification: { status: "verified" } } }],
    ]);
    const unclaimedRequest = { id: 701, companyDomain: "acme.com", status: "pending", referrerId: null };
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => identities.get(String(req.header("x-test-user"))), dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf", createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 701, companyDomain: "acme.com", notifiedEmployees: 2 }),
      listCompanyReferralInbox: async () => [], listCompanyReferralInboxByState: async (userId, scope) => scope === "new" && (userId === 2 || userId === 3) && !claimedBy ? [unclaimedRequest] : [],
      claimCompanyReferralRequest: async (userId, requestId) => { if (requestId !== 701 || claimedBy) throw new Error("Another verified employee already claimed this request"); claimedBy = userId; return { requestId, claimed: true }; },
      getClaimedCompanyReferralDetail: async () => undefined, listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
    });

    expect((await request(app).get("/api/company-referrals/inbox").set("x-test-user", "employee-a")).body).toMatchObject({ scope: "new", requests: [unclaimedRequest] });
    // Rows gain the directory's display identity (null outside the directory)
    // and a normalized job function (null when the ask has none).
    expect((await request(app).get("/api/company-referrals/inbox").set("x-test-user", "employee-b")).body.requests).toEqual([{ ...unclaimedRequest, companyName: null, companyInitials: null, jobFunction: null, publicRef: publicAskRef(701) }]);
    expect((await request(app).get("/api/company-referrals/inbox").set("x-test-user", "outsider")).body.requests).toEqual([]);
    expect((await request(app).post("/api/company-referrals/701/claim").set("x-test-user", "employee-a")).status).toBe(200);
    expect((await request(app).get("/api/company-referrals/inbox").set("x-test-user", "employee-b")).body.requests).toEqual([]);
    expect((await request(app).post("/api/company-referrals/701/claim").set("x-test-user", "employee-b")).status).toBe(409);
  });

  // D-038-A (§4.7): the 5-claim cap is a state conflict the referrer can act on, not a server fault.
  it("answers 409, with the cap copy, when the referrer already holds five claims", async () => {
    const app = express(); app.use(express.json());
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => req.header("x-test-user") === "employee-a" ? { account: { id: 2, openId: "workos-employee-a" }, primaryEmail: { emailAddress: "a@acme.com", verification: { status: "verified" } } } : undefined,
      dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf", createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 701, companyDomain: "acme.com", notifiedEmployees: 0 }),
      listCompanyReferralInbox: async () => [], listCompanyReferralInboxByState: async () => [],
      claimCompanyReferralRequest: async () => { const cap = new Error("You can hold 5 asks at once. Accept or pass one of them first."); cap.name = "ReferralTransitionConflict"; throw cap; },
      getClaimedCompanyReferralDetail: async () => undefined, listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
    });

    const response = await request(app).post("/api/company-referrals/701/claim").set("x-test-user", "employee-a");
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("You can hold 5 asks at once. Accept or pass one of them first.");
  });

  it("answers 409, not a server error, when a referrer who already passed or lapsed tries to claim again", async () => {
    const app = express(); app.use(express.json());
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => req.header("x-test-user") === "employee-a" ? { account: { id: 2, openId: "workos-employee-a" }, primaryEmail: { emailAddress: "a@acme.com", verification: { status: "verified" } } } : undefined,
      dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf", createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 701, companyDomain: "acme.com", notifiedEmployees: 0 }),
      listCompanyReferralInbox: async () => [], listCompanyReferralInboxByState: async () => [],
      claimCompanyReferralRequest: async () => { throw new Error("You already passed on this referral request"); },
      getClaimedCompanyReferralDetail: async () => undefined, listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
    });

    const response = await request(app).post("/api/company-referrals/701/claim").set("x-test-user", "employee-a");
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("You already passed on this referral request");
  });

  it("saves a no-coverage referral as waiting, reserves no Job Seeker credit and queues the coverage follow-up", async () => {
    const app = express(); app.use(express.json());
    const activity: Array<{ action: string; companyDomain?: string; metadata?: Record<string, unknown> }> = [];
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => req.header("x-test-user") === "seeker" ? { account: { id: 12, openId: "workos-seeker" }, primaryEmail: { emailAddress: "seeker@example.com", verification: { status: "verified" } } } : undefined,
      dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf", createReferralAttachment: async () => ({ id: 88, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 880, companyDomain: "acme.com", notifiedEmployees: 0, coverageStatus: "waiting_for_company_coverage", remainingTokens: 2, creditSummary: { totalAvailable: 2 } }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 880, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }), recordActivity: async entry => { activity.push(entry); },
    });

    const response = await request(app).post("/api/company-referrals").set("Idempotency-Key", "00000000-0000-4000-8000-000000000001").set("x-test-user", "seeker").send({ targetRoleUrl: "https://careers.acme.com/jobs/design", attachmentIds: [88] });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ requestId: 880, notifiedEmployees: 0, coverageStatus: "waiting_for_company_coverage", remainingTokens: 2 });
    // D-034: the credit is spent at first visibility, not at create, so nothing is reserved yet.
    expect(activity).toContainEqual(expect.objectContaining({ action: "company_referral.manual_follow_up_queued", companyDomain: "acme.com", metadata: { notifiedEmployees: 0, creditReserved: false } }));
  });

  it("opens only exact-company referral capacity with bounded slots and no Referrer identity in the Job Seeker-facing result", async () => {
    const app = express(); app.use(express.json());
    const activity: Array<{ action: string; companyDomain?: string; metadata?: Record<string, unknown> }> = [];
    const identities = new Map([
      ["employee", { account: { id: 21, openId: "workos-acme" }, primaryEmail: { emailAddress: "employee@acme.com", verification: { status: "verified" } } }],
      ["outsider", { account: { id: 22, openId: "workos-other" }, primaryEmail: { emailAddress: "employee@other.com", verification: { status: "verified" } } }],
    ]);
    let allocationOpenings = 0;
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => identities.get(String(req.header("x-test-user"))), dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf", createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      openCompanyReferralAvailability: async (userId, input) => {
        if (userId !== 21) throw new Error("Verify your company email before opening referral capacity");
        allocationOpenings += 1;
        return allocationOpenings === 1 ? { companyDomain: "acme.com", requestedSlotCount: input.slotCount ?? 1, allocatedRequestIds: [921], allocatedCount: 1 } : { companyDomain: "acme.com", requestedSlotCount: input.slotCount ?? 1, allocatedRequestIds: [], allocatedCount: 0 };
      },
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }), recordActivity: async entry => { activity.push(entry); },
    });
    expect((await request(app).post("/api/company-referrals/availability/open").send({ slotCount: 1 })).status).toBe(401);
    expect((await request(app).post("/api/company-referrals/availability/open").set("x-test-user", "employee").send({ slotCount: 4 })).status).toBe(400);
    expect((await request(app).post("/api/company-referrals/availability/open").set("x-test-user", "outsider").send({ slotCount: 1 })).status).toBe(403);
    const opened = await request(app).post("/api/company-referrals/availability/open").set("x-test-user", "employee").send({ slotCount: 1 });
    expect(opened.status).toBe(200); expect(opened.body.availability).toMatchObject({ companyDomain: "acme.com", allocatedRequestIds: [921], allocatedCount: 1 }); expect(JSON.stringify(opened.body)).not.toContain("employee@");
    const repeated = await request(app).post("/api/company-referrals/availability/open").set("x-test-user", "employee").send({ slotCount: 1 });
    expect(repeated.status).toBe(200); expect(repeated.body.availability).toMatchObject({ allocatedRequestIds: [], allocatedCount: 0 });
    expect(activity).toContainEqual(expect.objectContaining({ action: "company_referral.queue_opened", companyDomain: "acme.com", metadata: { requestedSlotCount: 1, allocatedCount: 1 } }));
  });

  it("returns only a verified Referrer’s aggregate private impact and never candidate or queue data", async () => {
    const app = express(); app.use(express.json());
    const identities = new Map([
      ["referrer", { account: { id: 71, openId: "workos-referrer" }, primaryEmail: { emailAddress: "employee@acme.com", verification: { status: "verified" } } }],
      ["outsider", { account: { id: 72, openId: "workos-outsider" }, primaryEmail: { emailAddress: "person@example.com", verification: { status: "verified" } } }],
    ]);
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => identities.get(String(req.header("x-test-user"))), dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf", createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      getPrivateReferrerImpactSummary: async userId => { if (userId !== 71) throw new Error("Verify your company email to view your private impact"); return { reviewed: 7, approved: 4, introductions: 3, interviews: 2, offers: 1 }; }, listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
    });
    expect((await request(app).get("/api/referrer-impact/me")).status).toBe(401);
    const ownImpact = await request(app).get("/api/referrer-impact/me").set("x-test-user", "referrer");
    expect(ownImpact.status).toBe(200); expect(ownImpact.body).toEqual({ summary: { reviewed: 7, approved: 4, introductions: 3, interviews: 2, offers: 1 } }); expect(JSON.stringify(ownImpact.body)).not.toMatch(/candidate|requestId|queue|email/i);
    expect((await request(app).get("/api/referrer-impact/me").set("x-test-user", "outsider")).status).toBe(403);
  });

  it("binds OTP enrollment receipts to one account and consumes them once", async () => {
    const app = express(); app.use(express.json());
    const identities = new Map([["one", { account: { id: 1, openId: "one" }, emailAddresses: [] }], ["two", { account: { id: 2, openId: "two" }, emailAddresses: [] }]]);
    const consumed = new Set<string>();
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => identities.get(String(req.header("x-test-user"))), dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "x" }), storageGetSignedUrl: async () => "x", createReferralAttachment: async () => ({ id: 1, fileName: "x", mimeType: "application/pdf", fileSize: 1 }), getAccessibleReferralAttachment: async () => undefined,
      sendWorkEmailOtp: async () => ({ sent: true, reason: "sent" }), verifyWorkEmailOtp: async () => true,
      issueWorkEmailEnrollmentReceipt: async ({ userId }) => ({ receipt: `receipt-${userId}`, expiresAt: new Date(Date.now() + 60_000) }),
      completeWorkEmailOtpEnrollment: async ({ receipt, email, userId }) => { const key = `${receipt}:${email}:${userId}`; if (receipt !== `receipt-${userId}` || consumed.has(key)) return undefined as never; consumed.add(key); return { workEmailDomain: "acme.com", reward: { rewarded: false }, replayed: false }; },
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({}),
    });
    const verify = await request(app).post("/api/work-email/otp/verify").set("x-test-user", "one").send({ email: "employee@acme.com", code: "123456" });
    expect(verify.body).toMatchObject({ verified: true, receipt: "receipt-1" });
    expect((await request(app).post("/api/company-referrals/verify-work-email").set("x-test-user", "two").send({ email: "employee@acme.com", receipt: "receipt-1" })).status).toBe(403);
    expect((await request(app).post("/api/company-referrals/verify-work-email").set("x-test-user", "one").send({ email: "employee@acme.com", receipt: "receipt-1" })).status).toBe(200);
    expect((await request(app).post("/api/company-referrals/verify-work-email").set("x-test-user", "one").send({ email: "employee@acme.com", receipt: "receipt-1" })).status).toBe(403);
  });

  it("lists anonymous opportunities publicly but only lets a verified employee publish one", async () => {
    const app = express();
    app.use(express.json());
    const identities = new Map([["employee", { account: { id: 2, openId: "workos-employee" }, primaryEmail: { emailAddress: "employee@acme.com", verification: { status: "verified" } }, emailAddresses: [{ emailAddress: "employee@acme.com", verification: { status: "verified" } }] }], ["personal", { account: { id: 4, openId: "workos-personal" }, primaryEmail: { emailAddress: "person@gmail.com", verification: { status: "verified" } }, emailAddresses: [{ emailAddress: "person@gmail.com", verification: { status: "verified" } }] }]]);
    let savedWorkEmail = false;
    let fulfilledInvite: { userId: number; inviteCode: string; workEmailDomain: string } | undefined;
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => identities.get(String(req.header("x-test-user"))), dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf", createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async (_userId, email) => { if (email.endsWith("@gmail.com")) throw new Error("Use a verified company email, not a personal email domain"); savedWorkEmail = true; return { workEmailDomain: "acme.com" }; }, getVerifiedWorkEmailAccess: async userId => userId === 2 ? { workEmailDomain: "acme.com" } : undefined, fulfillCompanyCoverageInvitation: async (userId, input) => { fulfilledInvite = { userId, ...input }; return { rewarded: true, tokenCount: 1 }; }, createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [{ id: 91, companyDomain: "acme.com", kind: "hiring_now", roleTitle: "Product Designer" }], publishCompanyOpportunity: async (_userId, input) => ({ id: 92, companyDomain: "acme.com", ...input }),
    });
    const listed = await request(app).get("/api/opportunities");
    expect(listed.status).toBe(200); expect(listed.body.opportunities[0]).not.toHaveProperty("ownerId");
    expect((await request(app).get("/api/company-referrals/access").set("x-test-user", "employee")).body).toEqual({ verifiedCompanyAccess: true, workEmailDomain: "acme.com", companyName: null, companyInitials: null });
    expect((await request(app).get("/api/company-referrals/access").set("x-test-user", "personal")).body).toEqual({ verifiedCompanyAccess: false, workEmailDomain: null, companyName: null, companyInitials: null });
    expect((await request(app).post("/api/opportunities").send({ kind: "hiring_now", roleTitle: "Product Designer" })).status).toBe(401);
    const personalEmailVerification = await request(app).post("/api/company-referrals/verify-work-email").set("x-test-user", "personal").send({ email: "person@gmail.com" });
    expect(personalEmailVerification.status).toBe(400); expect(personalEmailVerification.body.error).toMatch(/personal email domain/i);
    const otpVerifiedWorkEmail = await request(app).post("/api/company-referrals/verify-work-email").set("x-test-user", "employee").send({ email: "employee@acme.com", inviteCode: "verified-coverage-invite" });
    expect(otpVerifiedWorkEmail.status).toBe(200); expect(savedWorkEmail).toBe(true);
    expect(otpVerifiedWorkEmail.body.reward).toMatchObject({ rewarded: true, tokenCount: 1 });
    expect(fulfilledInvite).toEqual({ userId: 2, inviteCode: "verified-coverage-invite", workEmailDomain: "acme.com" });
    const published = await request(app).post("/api/opportunities").set("x-test-user", "employee").send({ kind: "hiring_now", roleTitle: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design", compensation: "₹12–18 LPA" });
    expect(published.status).toBe(201); expect(savedWorkEmail).toBe(true); expect(published.body.opportunity).toMatchObject({ companyDomain: "acme.com", roleTitle: "Product Designer", compensation: "₹12–18 LPA" });
  });

  it("issues a personal invite link and only forwards claims from a verified account email", async () => {
    const app = express(); app.use(express.json());
    const identities = new Map([
      ["inviter", { account: { id: 9, openId: "workos-inviter" }, primaryEmail: { emailAddress: "inviter@example.com", verification: { status: "verified" } } }],
      ["joiner", { account: { id: 10, openId: "workos-joiner" }, primaryEmail: { emailAddress: "joiner@example.com", verification: { status: "verified" } } }],
      ["unverified", { account: { id: 11, openId: "workos-unverified" }, primaryEmail: { emailAddress: "unverified@example.com", verification: { status: "unverified" } } }],
    ]);
    let claimed: { userId: number; inviteCode: string; verifiedEmail: string } | undefined;
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => identities.get(String(req.header("x-test-user"))), dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf", createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }), getOrCreatePersonalReferralInvite: async () => ({ inviteCode: "r9-abcdef12" }), claimPersonalReferralInvite: async (userId, input) => { claimed = { userId, ...input }; return { rewarded: true, tokenCount: 1 }; },
    });
    const personalLink = await request(app).get("/api/personal-invites/me").set("x-test-user", "inviter");
    expect(personalLink.status).toBe(200); expect(personalLink.body.invite.inviteCode).toBe("r9-abcdef12");
    const blocked = await request(app).post("/api/personal-invites/claim").set("x-test-user", "unverified").send({ inviteCode: "r9-abcdef12" });
    expect(blocked.status).toBe(403); expect(claimed).toBeUndefined();
    const claimedResponse = await request(app).post("/api/personal-invites/claim").set("x-test-user", "joiner").send({ inviteCode: "r9-abcdef12" });
    expect(claimedResponse.status).toBe(200); expect(claimedResponse.body.reward).toMatchObject({ rewarded: true, tokenCount: 1 });
    expect(claimed).toEqual({ userId: 10, inviteCode: "r9-abcdef12", verifiedEmail: "joiner@example.com" });
  });

  it("creates a private referral link (D-128 \"Your link\") only for the verified Referrer and resolves no employee identity publicly", async () => {
    const app = express(); app.use(express.json());
    const activity: Array<{ action: string; companyDomain?: string; metadata?: Record<string, unknown> }> = [];
    const identities = new Map([
      ["employee", { account: { id: 31, openId: "workos-acme" }, primaryEmail: { emailAddress: "employee@acme-corp.com", verification: { status: "verified" } } }],
      ["seeker", { account: { id: 32, openId: "workos-seeker" }, primaryEmail: { emailAddress: "seeker@example.com", verification: { status: "verified" } } }],
    ]);
    let receivedFastTrackCode: string | undefined;
    let receivedVanity: { companySlug?: string; alias?: string } | undefined;
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => identities.get(String(req.header("x-test-user"))), dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf", createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme-corp.com" }), createCompanyReferralRequest: async (_userId, input) => { receivedFastTrackCode = input.fastTrackCode; receivedVanity = { companySlug: input.fastTrackCompanySlug, alias: input.fastTrackAlias }; return { requestId: 802, companyDomain: "acme-corp.com", notifiedEmployees: 1, fastTrack: true }; }, listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 802, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
      getOrCreateReferrerFastTrackLink: async userId => { if (userId !== 31) throw new Error("Verify your company email before creating your link"); return { linkCode: "a".repeat(32), vanityAlias: "ref-a1b2c3d4e5", companyDomain: "acme-corp.com", isActive: true }; },
      getPublicReferrerFastTrackLink: async code => code === "a".repeat(32) ? { companyDomain: "acme-corp.com", isActive: true } : undefined,
      getPublicReferrerFastTrackVanityLink: async (companySlug, alias) => companySlug === "acme-corp" && alias === "ref-a1b2c3d4e5" ? { companyDomain: "acme-corp.com", isActive: true } : undefined,
      deactivateReferrerFastTrackLink: async userId => ({ deactivated: userId === 31 }), recordActivity: async entry => { activity.push(entry); },
    });

    expect((await request(app).get("/api/referrer-fast-track/me")).status).toBe(401);
    const owner = await request(app).get("/api/referrer-fast-track/me").set("x-test-user", "employee");
    expect(owner.status).toBe(200); expect(owner.body.link).toMatchObject({ companyDomain: "acme-corp.com", linkCode: "a".repeat(32), vanityAlias: "ref-a1b2c3d4e5", isActive: true }); expect(owner.body.link.url).toMatch(/\/fast\//); expect(owner.body.link.vanityUrl).toMatch(/\/refer\/acme-corp\/ref-a1b2c3d4e5$/); expect(JSON.stringify(owner.body)).not.toContain("employee@");
    const publicLink = await request(app).get(`/api/referrer-fast-track/${"a".repeat(32)}`);
    expect(publicLink.status).toBe(200); expect(publicLink.body).toEqual({ link: { companyDomain: "acme-corp.com", isActive: true } }); expect(JSON.stringify(publicLink.body)).not.toContain("referrerId");
    expect((await request(app).get("/api/referrer-fast-track/inactive-link")).status).toBe(404);
    const created = await request(app).post("/api/company-referrals").set("Idempotency-Key", "00000000-0000-4000-8000-000000000001").set("x-test-user", "seeker").send({ targetRoleUrl: "https://careers.acme-corp.com/jobs/design", attachmentIds: [1], fastTrackCode: "a".repeat(32) });
    expect(created.status).toBe(201); expect(created.body).toMatchObject({ requestId: 802, companyDomain: "acme-corp.com", fastTrack: true }); expect(receivedFastTrackCode).toBe("a".repeat(32)); expect(JSON.stringify(created.body)).not.toContain("workos-acme");
    const vanity = await request(app).get("/api/referrer-fast-track/vanity/acme-corp/ref-a1b2c3d4e5");
    expect(vanity.status).toBe(200); expect(vanity.body).toEqual({ link: { companyDomain: "acme-corp.com", isActive: true } }); expect(JSON.stringify(vanity.body)).not.toContain("referrerId");
    expect((await request(app).get("/api/referrer-fast-track/vanity/google/ref-a1b2c3d4e5")).status).toBe(404);
    const vanityCreated = await request(app).post("/api/company-referrals").set("Idempotency-Key", "00000000-0000-4000-8000-000000000001").set("x-test-user", "seeker").send({ targetRoleUrl: "https://careers.acme-corp.com/jobs/design", attachmentIds: [1], fastTrackCompanySlug: "acme-corp", fastTrackAlias: "ref-a1b2c3d4e5" });
    expect(vanityCreated.status).toBe(201); expect(receivedVanity).toEqual({ companySlug: "acme-corp", alias: "ref-a1b2c3d4e5" });
    expect((await request(app).post("/api/company-referrals").set("Idempotency-Key", "00000000-0000-4000-8000-000000000001").set("x-test-user", "seeker").send({ targetRoleUrl: "https://careers.acme-corp.com/jobs/design", attachmentIds: [1], fastTrackCompanySlug: "acme-corp" })).status).toBe(400);
    expect(activity).toContainEqual(expect.objectContaining({ action: "referrer_fast_track.link_accessed", companyDomain: "acme-corp.com" }));
  });

  it("canonicalizes the reported Wellfound mobile link before creating the company referral request", async () => {
    const app = express(); app.use(express.json());
    let receivedTargetRoleUrl = "";
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 12, openId: "workos-seeker" }, primaryEmail: { emailAddress: "seeker@example.com", verification: { status: "verified" } } }), dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf", createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async (_userId, input) => { receivedTargetRoleUrl = input.targetRoleUrl; return { requestId: 1, companyDomain: "chatfin.ai", notifiedEmployees: 0 }; }, listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
    });
    const created = await request(app).post("/api/company-referrals").set("Idempotency-Key", "00000000-0000-4000-8000-000000000001").send({ targetRoleUrl: "https://www.wellfound.com/jobs/3971835-account-executive/?source=mobile#details", attachmentIds: [1] });
    expect(created.status).toBe(201); expect(receivedTargetRoleUrl).toBe("https://wellfound.com/jobs/3971835-account-executive");
  });

  it("returns administrator activity only to a persisted administrator account", async () => {
    const app = express(); app.use(express.json());
    const identities = new Map([["admin", { account: { id: 7, openId: "workos-admin", role: "admin" as const } }], ["member", { account: { id: 8, openId: "workos-member", role: "user" as const } }]]);
    let activityQuery: Record<string, unknown> | undefined;
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => identities.get(String(req.header("x-test-user"))), dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf", createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }), listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }), listOperationalActivity: async input => { activityQuery = input; return [{ id: 9, action: "document.uploaded", outcome: "success" }]; },
    });
    expect((await request(app).get("/api/admin/activity").set("x-test-user", "member")).status).toBe(403);
    const adminFeed = await request(app).get("/api/admin/activity?action=document&query=avery&outcome=denied").set("x-test-user", "admin");
    expect(adminFeed.status).toBe(200); expect(adminFeed.body.events).toHaveLength(1); expect(adminFeed.body.events[0].action).toBe("document.uploaded");
    expect(activityQuery).toMatchObject({ action: "document", query: "avery", outcome: "denied" });
  });
});

describe("withdrawal activity reports only authoritative credit movement", () => {
  function setup(creditRefunded?: boolean, failure?: string) {
    const app = express(); app.use(express.json());
    const wireResult = { withdrawn: true, requestId: 501, status: "withdrawn", revision: 4, creditSummary: { totalAvailable: 2 } };
    const withdrawCompanyReferralRequest = vi.fn(async (userId: number, requestId: number) => {
      if (userId !== 7) throw new Error("This referral request is not in your account");
      if (failure) throw new Error(failure);
      return { ...wireResult, requestId, ...(creditRefunded === undefined ? {} : { creditRefunded }) };
    });
    const recordActivity = vi.fn<NonNullable<PrivateReferralRouteDeps["recordActivity"]>>(async () => {});
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => req.header("x-test-user") ? { account: { id: req.header("x-test-user") === "seeker" ? 7 : 8, openId: "test-user" } } : undefined,
      dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async key => ({ key }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf",
      createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }),
      getAccessibleReferralAttachment: async () => undefined, saveVerifiedWorkEmail: async () => undefined,
      createCompanyReferralRequest: async () => ({ requestId: 501, companyDomain: "acme.com", notifiedEmployees: 0 }),
      listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 501, claimed: true }),
      getClaimedCompanyReferralDetail: async () => undefined, listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({}),
      withdrawCompanyReferralRequest, recordActivity,
    });
    const withdrawalEvents = () => recordActivity.mock.calls.map(([event]) => event).filter(event => event.action === "referral_request.withdrawn");
    return { app, wireResult, withdrawCompanyReferralRequest, withdrawalEvents };
  }

  it.each([
    ["free ask", false], ["previous pickup", false], ["replay", false], ["eligible refund", true],
  ] as const)("records the operation's refund outcome for %s without changing the wire response", async (_scenario, creditRefunded) => {
    const { app, wireResult, withdrawCompanyReferralRequest, withdrawalEvents } = setup(creditRefunded);
    const response = await request(app).post("/api/company-referrals/501/withdraw").set("x-test-user", "seeker");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toEqual(wireResult);
    expect(withdrawCompanyReferralRequest).toHaveBeenCalledWith(7, 501);
    expect(withdrawalEvents()).toEqual([{ actorUserId: 7, action: "referral_request.withdrawn", outcome: "success", resourceType: "referral_request", resourceId: 501, metadata: { creditRefunded } }]);
  });

  it("omits unknown refund metadata for an older dependency instead of inventing a boolean", async () => {
    const { app, wireResult, withdrawalEvents } = setup();
    const response = await request(app).post("/api/company-referrals/501/withdraw").set("x-test-user", "seeker");
    expect(response.status).toBe(200); expect(response.body).toEqual(wireResult);
    expect(withdrawalEvents()).toHaveLength(1);
    expect(withdrawalEvents()[0].metadata).toBeUndefined();
  });

  it.each([[undefined, 401], ["outsider", 404]] as const)("never records a successful withdrawal for identity %s", async (identity, status) => {
    const { app, withdrawCompanyReferralRequest, withdrawalEvents } = setup(false);
    const call = request(app).post("/api/company-referrals/501/withdraw");
    if (identity) call.set("x-test-user", identity);
    expect((await call).status).toBe(status);
    expect(withdrawalEvents()).toEqual([]);
    if (!identity) expect(withdrawCompanyReferralRequest).not.toHaveBeenCalled();
  });

  it.each([["not-a-number", 400], ["0", 400]] as const)("rejects invalid reference %s before the operation", async (reference, status) => {
    const { app, withdrawCompanyReferralRequest, withdrawalEvents } = setup(false);
    expect((await request(app).post(`/api/company-referrals/${reference}/withdraw`).set("x-test-user", "seeker")).status).toBe(status);
    expect(withdrawCompanyReferralRequest).not.toHaveBeenCalled(); expect(withdrawalEvents()).toEqual([]);
  });

  it.each([
    ["This request was already claimed by a verified employee and can no longer be withdrawn", 409],
    ["This ask has already closed, so it can no longer be withdrawn", 409],
    ["Database unavailable", 500],
  ] as const)("does not emit a successful refund claim when the operation fails with %s", async (failure, status) => {
    const { app, withdrawalEvents } = setup(false, failure);
    expect((await request(app).post("/api/company-referrals/501/withdraw").set("x-test-user", "seeker")).status).toBe(status);
    expect(withdrawalEvents()).toEqual([]);
  });
});

describe("/api/company-referrals/mine hasEverAsked (sample empty states)", () => {
  function setup(hasEver: ((userId: number) => Promise<boolean>) | undefined) {
    const app = express();
    app.use(express.json());
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => req.header("x-test-user") ? { account: { id: 1, openId: "workos-test" } } : undefined,
      listJobSeekerCompanyReferrals: async () => [],
      hasEverCreatedReferralRequest: hasEver,
    } as unknown as PrivateReferralRouteDeps);
    return app;
  }

  it("passes a first-timer's false through to the payload", async () => {
    const app = setup(async () => false);
    const response = await request(app).get("/api/company-referrals/mine").set("x-test-user", "seeker");
    expect(response.status).toBe(200);
    expect(response.body.hasEverAsked).toBe(false);
  });

  it("fails closed to true when the durable check throws", async () => {
    const app = setup(async () => { throw new Error("db down"); });
    const response = await request(app).get("/api/company-referrals/mine").set("x-test-user", "seeker");
    expect(response.status).toBe(200);
    expect(response.body.hasEverAsked).toBe(true);
  });

  it("fails closed to true when the dep is absent (old wiring)", async () => {
    const app = setup(undefined);
    const response = await request(app).get("/api/company-referrals/mine").set("x-test-user", "seeker");
    expect(response.status).toBe(200);
    expect(response.body.hasEverAsked).toBe(true);
  });
});

describe("/api/company-referrals/inbox hasEverReviewed (sample empty states)", () => {
  function setup(hasEver: ((userId: number) => Promise<boolean>) | undefined) {
    const app = express();
    app.use(express.json());
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => req.header("x-test-user") ? { account: { id: 1, openId: "workos-test" } } : undefined,
      listCompanyReferralInboxByState: async () => [],
      hasEverReviewedReferral: hasEver,
    } as unknown as PrivateReferralRouteDeps);
    return app;
  }

  it("passes a first-timer's false through to the payload", async () => {
    const app = setup(async () => false);
    const response = await request(app).get("/api/company-referrals/inbox?scope=new").set("x-test-user", "referrer");
    expect(response.status).toBe(200);
    expect(response.body.hasEverReviewed).toBe(false);
  });

  it("fails closed to true when the durable check throws", async () => {
    const app = setup(async () => { throw new Error("db down"); });
    const response = await request(app).get("/api/company-referrals/inbox?scope=new").set("x-test-user", "referrer");
    expect(response.status).toBe(200);
    expect(response.body.hasEverReviewed).toBe(true);
  });

  it("fails closed to true when the dep is absent (old wiring)", async () => {
    const app = setup(undefined);
    const response = await request(app).get("/api/company-referrals/inbox?scope=new").set("x-test-user", "referrer");
    expect(response.status).toBe(200);
    expect(response.body.hasEverReviewed).toBe(true);
  });
});

describe("personal invite link route (D-155)", () => {
  function setup(state: { status: "locked" } | { status: "unlocked"; inviteCode: string } | undefined) {
    const app = express();
    app.use(express.json());
    const getPersonalReferralInviteState = vi.fn(async () => state);
    const getOrCreatePersonalReferralInvite = vi.fn(async () => ({ inviteCode: "r1-legacy" }));
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => req.header("x-test-user") ? { account: { id: 7, openId: "workos-test" } } : undefined,
      getPersonalReferralInviteState: state === undefined ? undefined : getPersonalReferralInviteState,
      getOrCreatePersonalReferralInvite,
    } as unknown as PrivateReferralRouteDeps);
    return { app, getPersonalReferralInviteState, getOrCreatePersonalReferralInvite };
  }

  it("returns locked with no invite and never creates one before the first paid invoice", async () => {
    const { app, getOrCreatePersonalReferralInvite } = setup({ status: "locked" });
    const response = await request(app).get("/api/personal-invites/me").set("x-test-user", "seeker");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ invite: null, locked: true });
    expect(getOrCreatePersonalReferralInvite).not.toHaveBeenCalled();
  });

  it("returns the invite unlocked after a paid invoice", async () => {
    const { app } = setup({ status: "unlocked", inviteCode: "r7-abc12345" });
    const response = await request(app).get("/api/personal-invites/me").set("x-test-user", "seeker");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ invite: { inviteCode: "r7-abc12345" }, locked: false });
  });

  it("falls back to legacy get-or-create when the gated dep is absent", async () => {
    const { app, getOrCreatePersonalReferralInvite } = setup(undefined);
    const response = await request(app).get("/api/personal-invites/me").set("x-test-user", "seeker");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ invite: { inviteCode: "r1-legacy" }, locked: false });
    expect(getOrCreatePersonalReferralInvite).toHaveBeenCalledWith(7);
  });

  it("requires sign-in", async () => {
    const { app } = setup({ status: "locked" });
    expect((await request(app).get("/api/personal-invites/me")).status).toBe(401);
  });
});
