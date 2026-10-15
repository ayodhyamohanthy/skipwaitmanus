import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";
import { isReferrerLinkRefusal, isReferrerLinkUnusableError, REFERRER_ALIAS_INVALID_ERROR, REFERRER_LINK_INACTIVE_ERROR, REFERRER_LINK_INVALID_ERROR, REFERRER_LINK_OTHER_COMPANY_ERROR } from "../shared/referrerLink";

// /ask offers "send to the company instead" only on these exact errors (D-017),
// so the route must answer with the shared copy, never a drifted string.
function setup(createCompanyReferralRequest: PrivateReferralRouteDeps["createCompanyReferralRequest"]) {
  const app = express();
  app.use(express.json());
  registerPrivateReferralRoutes(app, {
    resolveIdentity: async req => req.header("x-test-user") ? { account: { id: 32, openId: "workos-seeker" } } : undefined,
    dataUrlToBuffer: () => Buffer.from("pdf"), sanitizeDocumentName: value => value,
    storagePut: async () => ({ key: "private/resume.pdf" }), storageGetSignedUrl: async () => "https://signed.example/resume.pdf",
    createReferralAttachment: async () => ({ id: 1, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3 }), getAccessibleReferralAttachment: async () => undefined,
    saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme-corp.com" }), createCompanyReferralRequest,
    listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
    listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
  });
  return (body: Record<string, unknown>) => request(app).post("/api/company-referrals").set("Idempotency-Key", "00000000-0000-4000-8000-000000000009").set("x-test-user", "seeker")
    .send({ targetRoleUrl: "https://careers.acme-corp.com/jobs/design", attachmentIds: [1], candidateMessage: "I led the design system rebuild used by 40 product teams.", ...body });
}

describe("personal referrer link errors on POST /api/company-referrals", () => {
  it("answers a malformed code or alias with the shared copy before anything is created", async () => {
    let calls = 0;
    const send = setup(async () => { calls += 1; return { requestId: 1, companyDomain: "acme-corp.com", notifiedEmployees: 1 }; });
    const badCode = await send({ fastTrackCode: "short" });
    expect(badCode.status).toBe(400);
    expect(badCode.body.error).toBe(REFERRER_LINK_INVALID_ERROR);
    const badAlias = await send({ fastTrackCompanySlug: "acme-corp" });
    expect(badAlias.status).toBe(400);
    expect(badAlias.body.error).toBe(REFERRER_ALIAS_INVALID_ERROR);
    expect(calls).toBe(0);
    expect(isReferrerLinkUnusableError(badCode.body.error)).toBe(true);
    expect(isReferrerLinkUnusableError(badAlias.body.error)).toBe(true);
  });

  it("answers a paused or deleted link with the shared copy as a 400", async () => {
    const send = setup(async () => { throw new Error(REFERRER_LINK_INACTIVE_ERROR); });
    const response = await send({ fastTrackCode: "a".repeat(32) });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe(REFERRER_LINK_INACTIVE_ERROR);
    expect(isReferrerLinkUnusableError(response.body.error)).toBe(true);
  });

  it("does not treat a wrong-company job link as an unusable referrer link, but as a refusal of the link", async () => {
    const send = setup(async () => { throw new Error(REFERRER_LINK_OTHER_COMPANY_ERROR); });
    const response = await send({ fastTrackCode: "a".repeat(32) });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe(REFERRER_LINK_OTHER_COMPANY_ERROR);
    expect(isReferrerLinkUnusableError(response.body.error)).toBe(false);
    expect(isReferrerLinkRefusal(response.body.error)).toBe(true);
  });

  it("never offers the company fallback for errors that are not about the link", () => {
    for (const message of ["You have used this month’s included credits. Add a credit pack or choose Pro or Max to send another referral.", "This submission key was already used for a different referral request", "One or more resume documents are unavailable or already attached", "We could not send this private referral request", ""]) {
      expect(isReferrerLinkRefusal(message)).toBe(false);
    }
    for (const message of [REFERRER_LINK_INACTIVE_ERROR, REFERRER_LINK_INVALID_ERROR, REFERRER_ALIAS_INVALID_ERROR]) expect(isReferrerLinkRefusal(message)).toBe(true);
  });
});
