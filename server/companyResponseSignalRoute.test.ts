import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerCompanyDirectoryRoutes } from "./companyDirectoryRoutes";

const company = { slug: "wipro", name: "Wipro", initials: "W", industry: "Tech", location: "Global", functions: ["Engineering"], blurb: "x", domains: ["wipro.com"], openToReferrals: true };
function build(enabled: boolean, signal: unknown = { state: "insufficient" }) {
  const app = express();
  const load = vi.fn(async () => signal as never);
  registerCompanyDirectoryRoutes(app, { resolveIdentity: async () => undefined, responseSignalEnabled: () => enabled, getCompanyDirectoryEntry: async slug => (slug === "wipro" ? company : undefined), loadResponseSignal: load });
  return { app, load };
}

describe("GET /api/companies/:slug/response-signal", () => {
  it("flag off: 404 and nothing is read", async () => {
    const { app, load } = build(false);
    expect((await request(app).get("/api/companies/wipro/response-signal")).status).toBe(404);
    expect(load).not.toHaveBeenCalled();
  });
  it("flag on: passes the company's domains and returns only the aggregate", async () => {
    const { app, load } = build(true, { state: "shown", usualFirstReplyDays: 2, answeredThisMonth: 12, referrersInside: 3 });
    const res = await request(app).get("/api/companies/wipro/response-signal");
    expect(res.status).toBe(200);
    expect(load).toHaveBeenCalledWith(["wipro.com"]);
    expect(res.body).toEqual({ signal: { state: "shown", usualFirstReplyDays: 2, answeredThisMonth: 12, referrersInside: 3 } });
    expect(JSON.stringify(res.body)).not.toMatch(/@|userId|email|name/i);
  });
  it("flag on: unknown company 404, bad slug 400", async () => {
    const { app } = build(true);
    expect((await request(app).get("/api/companies/nope/response-signal")).status).toBe(404);
    expect((await request(app).get("/api/companies/BAD_slug/response-signal")).status).toBe(400);
  });
});
