import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerJobLinkPreviewRoutes } from "./jobLinkPreviewRoutes";

const base = { canonicalUrl: "https://careers.acme.dev/jobs/1", status: "fresh" as const, employerConfidence: "direct-domain" as const, companyDomain: "acme.dev", reason: "", recoveryAction: "" };
function app(coverageState?: (d: string) => Promise<"covered" | "waiting">, preview = base) {
  const a = express(); a.set("trust proxy", false);
  registerJobLinkPreviewRoutes(a, { resolveEmployerDomainFromTargetUrl: async () => "acme.dev", preview: async () => ({ ...preview }), coverageState });
  return a;
}

describe("job-link preview coverage (#99)", () => {
  it("adds the coarse coverage state for an identified employer", async () => {
    const coverage = vi.fn(async () => "waiting" as const);
    const res = await request(app(coverage)).post("/api/job-link/preview").send({ url: "https://careers.acme.dev/jobs/1" });
    expect(res.body.coverage).toBe("waiting");
    expect(coverage).toHaveBeenCalledWith("acme.dev");
    expect(Object.keys(res.body)).not.toContain("count");
  });
  it("skips coverage when the employer is ambiguous", async () => {
    const coverage = vi.fn(async () => "covered" as const);
    const res = await request(app(coverage, { ...base, employerConfidence: "ambiguous" as never })).post("/api/job-link/preview").send({ url: "https://careers.acme.dev/jobs/1" });
    expect(res.body.coverage).toBeUndefined();
    expect(coverage).not.toHaveBeenCalled();
  });
  it("never fails the preview when the coverage lookup fails", async () => {
    const res = await request(app(async () => { throw new Error("db down"); })).post("/api/job-link/preview").send({ url: "https://careers.acme.dev/jobs/1" });
    expect(res.status).toBe(200);
    expect(res.body.companyDomain).toBe("acme.dev");
    expect(res.body.coverage).toBeUndefined();
  });
});
