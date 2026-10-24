import { describe, expect, it } from "vitest";
import { CompanyLinkMismatchError, createCompanyReferralRequest } from "./db";

describe("company referral bound to the selected company", () => {
  const base = { personalPitch: "pitch", attachmentIds: [1], idempotencyKey: "0123456789abcdef" };
  it("rejects another company's job link before any credit moves", async () => {
    await expect(createCompanyReferralRequest(1, { ...base, targetRoleUrl: "https://careers.other.com/jobs/1", selectedCompany: { name: "Acme", domains: ["acme.com"] } })).rejects.toBeInstanceOf(CompanyLinkMismatchError);
  });
  it("names the company in the message", () => {
    expect(new CompanyLinkMismatchError("Acme").message).toContain("Acme");
  });
});

import express from "express";
import request from "supertest";
import { vi } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

describe("POST /api/company-referrals companySlug", () => {
  function setup() {
    const app = express(); app.use(express.json());
    const create = vi.fn(async () => ({ requestId: 1, companyDomain: "acme.com", notifiedEmployees: 0 }));
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 1, openId: "w" } }),
      getCompanyDirectoryEntry: async slug => slug === "acme" ? { name: "Acme", domains: ["acme.com"] } : undefined,
      createCompanyReferralRequest: create,
    } as unknown as PrivateReferralRouteDeps);
    return { app, create };
  }
  const send = (app: express.Express, extra: object) => request(app).post("/api/company-referrals").set("Idempotency-Key", "0123456789abcdef0123").send({ expectedCost: 1, targetRoleUrl: "https://careers.acme.com/jobs/1", attachmentIds: [1], ...extra });
  it("passes the directory domains of the selected company", async () => {
    const { app, create } = setup();
    expect((await send(app, { companySlug: "acme" })).status).toBe(201);
    expect(create).toHaveBeenCalledWith(1, expect.objectContaining({ selectedCompany: { name: "Acme", domains: ["acme.com"] } }));
  });
  it("rejects an unknown company", async () => {
    const { app, create } = setup();
    const response = await send(app, { companySlug: "nope" });
    expect(response.status).toBe(400); expect(create).not.toHaveBeenCalled();
  });
  it("sends no selected company when none was chosen", async () => {
    const { app, create } = setup();
    await send(app, {});
    expect(create.mock.calls[0][1]).not.toHaveProperty("selectedCompany");
  });
});

import { isDriverErrorMessage, GENERIC_SERVER_ERROR } from "./privateReferralRoutes";
describe("driver error hygiene", () => {
  it("withholds raw drizzle errors from any route response", async () => {
    const app = express(); app.use(express.json());
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 1, openId: "w" } }),
      withdrawCompanyReferralRequest: async () => { throw new Error("Failed query: update `referralRequests` set `status` = ? where id = ?\nparams: withdrawn,12"); },
    } as unknown as PrivateReferralRouteDeps);
    const response = await request(app).post("/api/company-referrals/12/withdraw");
    expect(response.status).toBe(500);
    expect(response.body.error).toBe(GENERIC_SERVER_ERROR);
    expect(JSON.stringify(response.body)).not.toMatch(/referralRequests|params:/);
  });
  it("keeps friendly messages", () => {
    expect(isDriverErrorMessage("This referral request is not in your account")).toBe(false);
    expect(isDriverErrorMessage("Failed query: select 1\nparams: ")).toBe(true);
  });
});
