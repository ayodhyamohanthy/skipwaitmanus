import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";

describe("private referral HTTP routes", () => {
  it("keeps a resume private through upload, request creation, exclusive claim, and unrelated-user denial", async () => {
    const app = express();
    app.use(express.json());
    let claimedBy: number | undefined;
    let submittedCandidateMessage = "";
    const activity: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
    const attachment = { id: 77, ownerId: 1, fileName: "resume.pdf", fileKey: "private/resume.pdf", mimeType: "application/pdf", fileSize: 3, referrerId: undefined as number | undefined };
    const identities = new Map([["seeker", { account: { id: 1, openId: "clerk-seeker" }, primaryEmail: { emailAddress: "seeker@example.com", verification: { status: "verified" } } }], ["employee", { account: { id: 2, openId: "clerk-employee" }, primaryEmail: { emailAddress: "employee@acme.com", verification: { status: "verified" } } }], ["outsider", { account: { id: 3, openId: "clerk-outsider" }, primaryEmail: { emailAddress: "outsider@other.com", verification: { status: "verified" } } }]]);
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => identities.get(String(req.header("x-test-user"))),
      dataUrlToBuffer: () => Buffer.from("%PDF-test"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf",
      createReferralAttachment: async () => attachment,
      getAccessibleReferralAttachment: async (userId) => userId === 1 || userId === claimedBy ? { ...attachment, referrerId: claimedBy } : undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }),
      createCompanyReferralRequest: async (_userId, input) => { submittedCandidateMessage = input.personalPitch; return { requestId: 501, companyDomain: "acme.com", notifiedEmployees: 1 }; },
      listJobSeekerCompanyReferrals: async () => [{ id: 501 }, { id: 500 }, { id: 499 }],
      listCompanyReferralInbox: async () => [{ id: 501, companyDomain: "acme.com" }],
      getUnclaimedCompanyReferralPreview: async (userId, requestId) => userId === 2 && requestId === 501 && !claimedBy ? { id: requestId, candidateName: "Avery", candidateMessage: "I led a measurable product design launch.", companyDomain: "acme.com", targetRoleUrl: "https://careers.acme.com/jobs/design", attachments: [attachment] } : undefined,
      claimCompanyReferralRequest: async (userId, requestId) => { claimedBy = userId; return { requestId, claimed: true }; },
      getClaimedCompanyReferralDetail: async (userId, requestId) => userId === claimedBy ? { id: requestId, candidateName: "Avery", targetRoleUrl: "https://careers.acme.com/jobs/design", attachments: [attachment] } : undefined,
      listPublicCompanyOpportunities: async () => [{ id: 91, companyDomain: "acme.com", kind: "hiring_now", roleTitle: "Product Designer" }],
      publishCompanyOpportunity: async (_userId, input) => ({ id: 92, companyDomain: "acme.com", ...input }),
      recordActivity: async input => { activity.push(input); },
    });

    const upload = await request(app).post("/api/documents").set("x-test-user", "seeker").send({ fileName: "resume.pdf", mimeType: "application/pdf", dataUrl: "data:application/pdf;base64,cGRm" });
    expect(upload.status).toBe(201); expect(upload.body.url).toBe("/api/documents/77");
    const malformed = await request(app).post("/api/company-referrals").set("x-test-user", "seeker").send({ targetRoleUrl: "acme product designer", attachmentIds: [77] });
    expect(malformed.status).toBe(400); expect(malformed.body.error).toMatch(/complete job link/i);
    const created = await request(app).post("/api/company-referrals").set("x-test-user", "seeker").send({ targetRoleUrl: "https://careers.acme.com/jobs/design", attachmentIds: [77], candidateMessage: "I led a measurable product design launch." });
    expect(created.status).toBe(201); expect(created.body.companyDomain).toBe("acme.com"); expect(created.body.lifetimeRequestCount).toBe(3);
    expect(submittedCandidateMessage).toBe("I led a measurable product design launch.");
    expect((await request(app).get("/api/documents/77").set("x-test-user", "outsider")).status).toBe(404);
    expect((await request(app).get("/api/company-referrals/501").set("x-test-user", "outsider")).status).toBe(404);
    expect((await request(app).get("/api/company-referrals/501/preview").set("x-test-user", "outsider")).status).toBe(404);
    const preview = await request(app).get("/api/company-referrals/501/preview").set("x-test-user", "employee");
    expect(preview.status).toBe(200); expect(preview.body.request).toMatchObject({ candidateName: "Avery", candidateMessage: "I led a measurable product design launch.", targetRoleUrl: "https://careers.acme.com/jobs/design" }); expect(preview.body.request.attachments[0].url).toBe("https://signed.example/resume.pdf"); expect(preview.body.request.attachments[0]).not.toHaveProperty("fileKey");
    expect((await request(app).post("/api/company-referrals/501/claim").set("x-test-user", "employee")).status).toBe(200);
    expect((await request(app).get("/api/company-referrals/501/preview").set("x-test-user", "employee")).status).toBe(404);
    const detail = await request(app).get("/api/company-referrals/501").set("x-test-user", "employee");
    expect(detail.status).toBe(200); expect(detail.body.request.attachments[0].url).toBe("https://signed.example/resume.pdf"); expect(detail.body.request.attachments[0]).not.toHaveProperty("fileKey");
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
      ["employee-a", { account: { id: 2, openId: "clerk-employee-a" }, primaryEmail: { emailAddress: "a@acme.com", verification: { status: "verified" } } }],
      ["employee-b", { account: { id: 3, openId: "clerk-employee-b" }, primaryEmail: { emailAddress: "b@acme.com", verification: { status: "verified" } } }],
      ["outsider", { account: { id: 4, openId: "clerk-outsider" }, primaryEmail: { emailAddress: "employee@other.com", verification: { status: "verified" } } }],
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
    expect((await request(app).get("/api/company-referrals/inbox").set("x-test-user", "employee-b")).body.requests).toEqual([unclaimedRequest]);
    expect((await request(app).get("/api/company-referrals/inbox").set("x-test-user", "outsider")).body.requests).toEqual([]);
    expect((await request(app).post("/api/company-referrals/701/claim").set("x-test-user", "employee-a")).status).toBe(200);
    expect((await request(app).get("/api/company-referrals/inbox").set("x-test-user", "employee-b")).body.requests).toEqual([]);
    expect((await request(app).post("/api/company-referrals/701/claim").set("x-test-user", "employee-b")).status).toBe(409);
  });

  it("lists anonymous opportunities publicly but only lets a verified employee publish one", async () => {
    const app = express();
    app.use(express.json());
    const identities = new Map([["employee", { account: { id: 2, openId: "clerk-employee" }, primaryEmail: { emailAddress: "employee@acme.com", verification: { status: "verified" } }, emailAddresses: [{ emailAddress: "employee@acme.com", verification: { status: "verified" } }] }], ["personal", { account: { id: 4, openId: "clerk-personal" }, primaryEmail: { emailAddress: "person@gmail.com", verification: { status: "verified" } }, emailAddresses: [{ emailAddress: "person@gmail.com", verification: { status: "verified" } }] }]]);
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
    expect((await request(app).get("/api/company-referrals/access").set("x-test-user", "employee")).body).toEqual({ verifiedCompanyAccess: true, workEmailDomain: "acme.com" });
    expect((await request(app).get("/api/company-referrals/access").set("x-test-user", "personal")).body).toEqual({ verifiedCompanyAccess: false, workEmailDomain: null });
    expect((await request(app).post("/api/opportunities").send({ kind: "hiring_now", roleTitle: "Product Designer" })).status).toBe(401);
    const personalEmailVerification = await request(app).post("/api/company-referrals/verify-work-email").set("x-test-user", "personal").send({ email: "person@gmail.com" });
    expect(personalEmailVerification.status).toBe(400); expect(personalEmailVerification.body.error).toMatch(/personal email domain/i);
    const otpVerifiedWorkEmail = await request(app).post("/api/company-referrals/verify-work-email").set("x-test-user", "employee").send({ email: "employee@acme.com", inviteCode: "verified-coverage-invite" });
    expect(otpVerifiedWorkEmail.status).toBe(200); expect(savedWorkEmail).toBe(true);
    expect(otpVerifiedWorkEmail.body.reward).toMatchObject({ rewarded: true, tokenCount: 1 });
    expect(fulfilledInvite).toEqual({ userId: 2, inviteCode: "verified-coverage-invite", workEmailDomain: "acme.com" });
    const published = await request(app).post("/api/opportunities").set("x-test-user", "employee").send({ kind: "hiring_now", roleTitle: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design" });
    expect(published.status).toBe(201); expect(savedWorkEmail).toBe(true); expect(published.body.opportunity).toMatchObject({ companyDomain: "acme.com", roleTitle: "Product Designer" });
  });

  it("issues a personal invite link and only forwards claims from a verified account email", async () => {
    const app = express(); app.use(express.json());
    const identities = new Map([
      ["inviter", { account: { id: 9, openId: "clerk-inviter" }, primaryEmail: { emailAddress: "inviter@example.com", verification: { status: "verified" } } }],
      ["joiner", { account: { id: 10, openId: "clerk-joiner" }, primaryEmail: { emailAddress: "joiner@example.com", verification: { status: "verified" } } }],
      ["unverified", { account: { id: 11, openId: "clerk-unverified" }, primaryEmail: { emailAddress: "unverified@example.com", verification: { status: "unverified" } } }],
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

  it("canonicalizes the reported Wellfound mobile link before creating the company referral request", async () => {
    const app = express(); app.use(express.json());
    let receivedTargetRoleUrl = "";
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 12, openId: "clerk-seeker" }, primaryEmail: { emailAddress: "seeker@example.com", verification: { status: "verified" } } }), dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf", createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme.com" }), createCompanyReferralRequest: async (_userId, input) => { receivedTargetRoleUrl = input.targetRoleUrl; return { requestId: 1, companyDomain: "chatfin.ai", notifiedEmployees: 0 }; }, listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
    });
    const created = await request(app).post("/api/company-referrals").send({ targetRoleUrl: "https://www.wellfound.com/jobs/3971835-account-executive/?source=mobile#details", attachmentIds: [1] });
    expect(created.status).toBe(201); expect(receivedTargetRoleUrl).toBe("https://wellfound.com/jobs/3971835-account-executive");
  });

  it("returns administrator activity only to a persisted administrator account", async () => {
    const app = express(); app.use(express.json());
    const identities = new Map([["admin", { account: { id: 7, openId: "clerk-admin", role: "admin" as const } }], ["member", { account: { id: 8, openId: "clerk-member", role: "user" as const } }]]);
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
