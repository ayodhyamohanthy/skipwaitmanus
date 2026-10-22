import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerCompanyClaimRoutes } from "./companyClaimRoutes";
import { CompanyClaimError } from "./companyClaim";
const token = "a".repeat(64);
function setup(opts: { enabled?: boolean; signedIn?: boolean } = {}) {
  const app = express(); app.use(express.json());
  const send = vi.fn(async () => ({ sent: true as const }));
  const confirm = vi.fn(async () => ({ slug: "quillmint" }));
  const dashboard = vi.fn(async () => ({ company: { name: "Quillmint", slug: "quillmint", domain: "quillmint.com", openToReferrals: true }, signal: { state: "insufficient" as const } }));
  registerCompanyClaimRoutes(app, { enabled: () => opts.enabled !== false, resolveIdentity: async () => opts.signedIn === false ? undefined : { account: { id: 7 } }, send, confirm, dashboard });
  return { app, send, confirm, dashboard };
}
describe("company claim aggregate routes", () => {
  it("flag off hides all endpoints before dependencies", async () => {
    const { app, send, dashboard } = setup({ enabled: false });
    expect((await request(app).post("/api/company-claim/send").send({ email: "person@quillmint.com" })).status).toBe(404);
    expect((await request(app).get("/api/company-claim/dashboard/quillmint")).status).toBe(404);
    expect(send).not.toHaveBeenCalled(); expect(dashboard).not.toHaveBeenCalled();
  });
  it("all actions require the server's signed-in identity", async () => {
    const { app, send, confirm, dashboard } = setup({ signedIn: false });
    for (const path of ["send", "confirm"]) expect((await request(app).post(`/api/company-claim/${path}`).send({ email: "a@quillmint.com", token })).status).toBe(401);
    expect((await request(app).get("/api/company-claim/dashboard/quillmint")).status).toBe(401);
    expect(send).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled(); expect(dashboard).not.toHaveBeenCalled();
  });
  it("binds send/confirm to the server identity, rejecting injected owner or domain", async () => {
    const { app, send, confirm } = setup();
    expect((await request(app).post("/api/company-claim/send").send({ email: "a@quillmint.com", userId: 9 })).status).toBe(400);
    expect((await request(app).post("/api/company-claim/send").send({ email: "a@quillmint.com" })).status).toBe(200);
    expect(send).toHaveBeenCalledWith(7, "a@quillmint.com");
    expect((await request(app).post("/api/company-claim/confirm").send({ token })).status).toBe(200);
    expect(confirm).toHaveBeenCalledWith(7, token);
  });
  it("GET never consumes an emailed token", async () => {
    const { app, confirm } = setup();
    expect((await request(app).get(`/api/company-claim/confirm?token=${token}`)).status).toBe(404);
    expect(confirm).not.toHaveBeenCalled();
  });
  it("denies cross-company access and never returns raw errors", async () => {
    const { app, dashboard } = setup();
    dashboard.mockRejectedValueOnce(new CompanyClaimError(403, "Verify a work email for this company first"));
    expect((await request(app).get("/api/company-claim/dashboard/quillmint")).status).toBe(403);
    dashboard.mockRejectedValueOnce(new Error("mysql private credentials"));
    const res = await request(app).get("/api/company-claim/dashboard/quillmint");
    expect(res.status).toBe(503); expect(res.text).not.toContain("mysql");
    expect(res.headers["cache-control"]).toBe("private, no-store");
  });
  it("logs an unexpected 503 with a [CompanyClaim] tag and still leaks nothing", async () => {
    const { app, dashboard } = setup();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failure = new Error("mysql private credentials");
      dashboard.mockRejectedValueOnce(failure);
      const res = await request(app).get("/api/company-claim/dashboard/quillmint");
      expect(res.status).toBe(503);
      expect(res.text).not.toContain("mysql");
      expect(res.headers["cache-control"]).toBe("private, no-store");
      expect(logged).toHaveBeenCalledWith("[CompanyClaim]", failure);
    } finally {
      logged.mockRestore();
    }
  });
});
