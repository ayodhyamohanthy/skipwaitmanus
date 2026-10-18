import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { displayRef } from "./displayRef";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

// D-077(5): every ask a person sees carries the non-sequential display reference, computed on the server
// (the HMAC key never reaches the client). Admin screens keep Ref-{1000+id}.
const attachment = { id: 5, fileName: "resume.pdf", mimeType: "application/pdf", fileSize: 3, fileKey: "private/resume.pdf" };

function setup() {
  const app = express();
  app.use(express.json());
  const deps = {
    resolveIdentity: async (req: express.Request) => (req.header("x-test-user") ? { account: { id: Number(req.header("x-test-user")), openId: "workos-test" } } : undefined),
    listJobSeekerCompanyReferrals: async () => [{ id: 11, companyDomain: "example.com", status: "pending", createdAt: "2026-10-10T00:00:00.000Z" }],
    listCompanyReferralInbox: async () => [{ id: 21, companyDomain: "example.com", status: "pending" }],
    listCompanyReferralInboxByState: async () => [{ id: 21, companyDomain: "example.com", status: "pending" }],
    getVerifiedWorkEmailAccess: async () => ({ workEmailDomain: "example.com" }),
    getUnclaimedCompanyReferralPreview: async () => ({ id: 31, companyDomain: "example.com", attachments: [attachment] }),
    resolveCompanyIdentities: async () => new Map(),
  };
  registerPrivateReferralRoutes(app, deps as unknown as PrivateReferralRouteDeps);
  return app;
}

describe("display references on asks (D-077(5))", () => {
  it("adds the HMAC display reference to the seeker's asks", async () => {
    const response = await request(setup()).get("/api/company-referrals/mine").set("x-test-user", "1");
    expect(response.status).toBe(200);
    expect(response.body.requests[0].displayRef).toBe(displayRef(11));
    expect(response.body.requests[0].displayRef).toMatch(/^R-[0-9A-Z]{5}$/);
  });

  it("adds it to referrer inbox rows and the pre-accept preview", async () => {
    const app = setup();
    const inbox = await request(app).get("/api/company-referrals/inbox?scope=new").set("x-test-user", "3");
    expect(inbox.body.requests[0].displayRef).toBe(displayRef(21));
    const preview = await request(app).get("/api/company-referrals/31/preview").set("x-test-user", "3");
    expect(preview.body.request.displayRef).toBe(displayRef(31));
  });

  it("never sends the sequential Ref- form to a seeker or referrer", async () => {
    const app = setup();
    const bodies = [
      (await request(app).get("/api/company-referrals/mine").set("x-test-user", "1")).text,
      (await request(app).get("/api/company-referrals/inbox?scope=new").set("x-test-user", "3")).text,
      (await request(app).get("/api/company-referrals/31/preview").set("x-test-user", "3")).text,
    ];
    for (const body of bodies) expect(body).not.toMatch(/Ref-\d/);
  });
});
