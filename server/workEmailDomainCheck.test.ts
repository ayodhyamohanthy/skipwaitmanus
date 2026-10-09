/**
 * /api/work-email/domain-check — kit v4 `/verify` company step for companies
 * outside the launch list. Parse at the edge (Zod), then answer from the same
 * validators that gate OTP sending: consumer-domain blocklist first, MX/A
 * deliverability second. Never sends a code; never discloses other accounts.
 */
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

vi.mock("node:dns/promises", () => ({
  resolveMx: vi.fn(async (domain: string) => (domain === "acme.com" ? [{ exchange: "mail.acme.com", priority: 10 }] : [])),
  resolve4: vi.fn(async () => { throw new Error("no record"); }),
}));

describe("work-email domain check route", () => {
  function setup() {
    const app = express();
    app.use(express.json());
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async req => req.header("x-test-user") ? { account: { id: 1, openId: "workos-test" } } : undefined,
    } as unknown as PrivateReferralRouteDeps);
    return app;
  }

  it("confirms a deliverable company domain without sending a code", async () => {
    const response = await request(setup()).post("/api/work-email/domain-check").set("x-test-user", "employee").send({ domain: " ACME.com " });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ domain: "acme.com", workDomain: true });
  });

  it("labels consumer inboxes as personal, never work domains", async () => {
    const response = await request(setup()).post("/api/work-email/domain-check").set("x-test-user", "employee").send({ domain: "gmail.com" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ domain: "gmail.com", workDomain: false, reason: "personal" });
  });

  it("labels MX-less domains undeliverable and rejects malformed input", async () => {
    const app = setup();
    const missing = await request(app).post("/api/work-email/domain-check").set("x-test-user", "employee").send({ domain: "no-such-domain-xyz.invalid" });
    expect(missing.status).toBe(200);
    expect(missing.body).toEqual({ domain: "no-such-domain-xyz.invalid", workDomain: false, reason: "undeliverable" });
    expect((await request(app).post("/api/work-email/domain-check").set("x-test-user", "employee").send({ domain: "not a domain" })).status).toBe(400);
    expect((await request(app).post("/api/work-email/domain-check").set("x-test-user", "employee").send({})).status).toBe(400);
  });

  it("requires authentication and never exposes the check anonymously", async () => {
    expect((await request(setup()).post("/api/work-email/domain-check").send({ domain: "acme.com" })).status).toBe(401);
  });
});
