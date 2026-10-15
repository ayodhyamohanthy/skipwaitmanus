import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";
import { isReferrerLinkRefusal, isReferrerLinkUnusableError, REFERRER_ALIAS_INVALID_ERROR, REFERRER_LINK_INACTIVE_ERROR, REFERRER_LINK_INVALID_ERROR, REFERRER_LINK_OTHER_COMPANY_ERROR, referrerLinkRefusalReason } from "../shared/referrerLink";
import { askSendBodySchema, readReferrerLinkFallback } from "../shared/askSend";

type Recorded = Parameters<NonNullable<PrivateReferralRouteDeps["recordActivity"]>>[0];
let recorded: Recorded[] = [];

// /ask offers "send to the company instead" only on these exact errors (D-017),
// so the route must answer with the shared copy, never a drifted string.
function setup(createCompanyReferralRequest: PrivateReferralRouteDeps["createCompanyReferralRequest"]) {
  recorded = [];
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
    recordActivity: async input => { recorded.push(input); },
    getPublicReferrerFastTrackLink: async () => undefined, getPublicReferrerFastTrackVanityLink: async () => undefined,
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

  it("records each refused link with its reason only, never the code or alias (D-017 analytics)", async () => {
    const refusals = () => recorded.filter(entry => entry.action === "company_referral.referrer_link_refused");
    await setup(async () => { throw new Error("unreachable"); })({ fastTrackCode: "short" });
    expect(refusals()).toEqual([expect.objectContaining({ actorUserId: 32, outcome: "failure", resourceType: "referral_request", metadata: { reason: "invalid" } })]);
    await setup(async () => { throw new Error("unreachable"); })({ fastTrackCompanySlug: "acme-corp" });
    expect(refusals()).toEqual([expect.objectContaining({ metadata: { reason: "alias_invalid" } })]);
    await setup(async () => { throw new Error(REFERRER_LINK_INACTIVE_ERROR); })({ fastTrackCode: "a".repeat(32) });
    expect(refusals()).toEqual([expect.objectContaining({ metadata: { reason: "inactive" } })]);
    expect(JSON.stringify(recorded)).not.toContain("a".repeat(32));
    await setup(async () => { throw new Error(REFERRER_LINK_OTHER_COMPANY_ERROR); })({ fastTrackCode: "a".repeat(32) });
    expect(refusals()).toEqual([expect.objectContaining({ metadata: { reason: "other_company" } })]);
    await setup(async () => { throw new Error("You have used this month’s included credits."); })({ fastTrackCode: "a".repeat(32) });
    expect(refusals()).toEqual([]);
  });

  it("marks a send to the company after a link fallback, and only a send with no link", async () => {
    const created = () => recorded.find(entry => entry.action === "company_referral.created")?.metadata?.referrerLinkFallback;
    const send = setup(async () => ({ requestId: 7, companyDomain: "acme-corp.com", notifiedEmployees: 2, replayed: false }));
    expect((await send({ referrerLinkFallback: "refused" })).status).toBe(201);
    expect(created()).toBe("refused");
    await setup(async () => ({ requestId: 8, companyDomain: "acme-corp.com", notifiedEmployees: 2, replayed: false }))({ referrerLinkFallback: "opted_out" });
    expect(created()).toBe("opted_out");
    await setup(async () => ({ requestId: 9, companyDomain: "acme-corp.com", notifiedEmployees: 1, fastTrack: true, replayed: false }))({ referrerLinkFallback: "refused", fastTrackCode: "a".repeat(32) });
    expect(created()).toBeNull();
    await setup(async () => ({ requestId: 10, companyDomain: "acme-corp.com", notifiedEmployees: 2, replayed: false }))({ referrerLinkFallback: "because" });
    expect(created()).toBeNull();
  });

  it("records a personal link that no longer opens, without the code", async () => {
    const app = express();
    recorded = [];
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async () => undefined, dataUrlToBuffer: () => Buffer.from(""), sanitizeDocumentName: value => value,
      storagePut: async () => ({ key: "k" }), storageGetSignedUrl: async () => "https://signed.example/x",
      createReferralAttachment: async () => ({ id: 1, fileName: "r.pdf", mimeType: "application/pdf", fileSize: 1 }), getAccessibleReferralAttachment: async () => undefined,
      saveVerifiedWorkEmail: async () => ({ workEmailDomain: "acme-corp.com" }), createCompanyReferralRequest: async () => { throw new Error("unreachable"); },
      listCompanyReferralInbox: async () => [], claimCompanyReferralRequest: async () => ({ requestId: 1, claimed: true }), getClaimedCompanyReferralDetail: async () => undefined,
      listPublicCompanyOpportunities: async () => [], publishCompanyOpportunity: async () => ({ id: 1 }),
      recordActivity: async input => { recorded.push(input); },
      getPublicReferrerFastTrackLink: async () => undefined, getPublicReferrerFastTrackVanityLink: async () => undefined,
    });
    expect((await request(app).get(`/api/referrer-fast-track/${"b".repeat(32)}`)).status).toBe(404);
    expect((await request(app).get("/api/referrer-fast-track/vanity/acme-corp/asha-k")).status).toBe(404);
    expect(recorded).toEqual([
      expect.objectContaining({ action: "referrer_fast_track.link_resolved", outcome: "failure", metadata: { public: true } }),
      expect.objectContaining({ action: "referrer_fast_track.vanity_resolved", outcome: "failure", metadata: { public: true } }),
    ]);
    expect(JSON.stringify(recorded)).not.toMatch(/b{32}|asha-k/);
  });
});

describe("shared ask send contract", () => {
  it("maps every link error to one refusal reason", () => {
    expect([REFERRER_LINK_INACTIVE_ERROR, REFERRER_LINK_INVALID_ERROR, REFERRER_ALIAS_INVALID_ERROR, REFERRER_LINK_OTHER_COMPANY_ERROR].map(referrerLinkRefusalReason)).toEqual(["inactive", "invalid", "alias_invalid", "other_company"]);
    expect(referrerLinkRefusalReason("We could not send this private referral request")).toBeNull();
  });

  it("accepts the bodies the app builds and refuses mixed or half links", () => {
    const base = { targetRoleUrl: "https://careers.acme-corp.com/jobs/design", attachmentIds: [1], candidateMessage: "Strong fit." };
    expect(askSendBodySchema.safeParse(base).success).toBe(true);
    expect(askSendBodySchema.safeParse({ ...base, fastTrackCode: "a".repeat(32) }).success).toBe(true);
    expect(askSendBodySchema.safeParse({ ...base, fastTrackCompanySlug: "acme-corp", fastTrackAlias: "asha-k" }).success).toBe(true);
    expect(askSendBodySchema.safeParse({ ...base, referrerLinkFallback: "refused" }).success).toBe(true);
    expect(askSendBodySchema.safeParse({ ...base, fastTrackCode: "a".repeat(32), fastTrackCompanySlug: "acme-corp", fastTrackAlias: "asha-k" }).success).toBe(false);
    expect(askSendBodySchema.safeParse({ ...base, fastTrackCompanySlug: "acme-corp" }).success).toBe(false);
    expect(askSendBodySchema.safeParse({ ...base, fastTrackCode: "a".repeat(32), referrerLinkFallback: "refused" }).success).toBe(false);
    expect(askSendBodySchema.safeParse({ ...base, extra: true }).success).toBe(false);
    expect(readReferrerLinkFallback({ referrerLinkFallback: "opted_out" })).toBe("opted_out");
    expect(readReferrerLinkFallback({})).toBeNull();
  });
});
