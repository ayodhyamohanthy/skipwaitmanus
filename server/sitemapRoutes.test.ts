import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerSitemapRoutes } from "./sitemapRoutes";

const appFor = (deps: Parameters<typeof registerSitemapRoutes>[1]) => { const app = express(); registerSitemapRoutes(app, deps); return app; };

describe("container sitemap (served from the DB, no cross-service fetch)", () => {
  it("lists static routes, live jobs with lastmod, and company pages, stamped from the container", async () => {
    const app = appFor({
      listJobs: async () => [{ id: 7, updatedAt: new Date("2026-10-20T00:00:00Z") }, { id: "bad" as never }, {}],
      listCompanySlugs: async () => [{ slug: "wipro" }, { slug: "" }, {}],
    });
    const res = await request(app).get("/sitemap.xml").set("Host", "skipwait.me");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/xml");
    expect(res.text).toContain("<!-- live: jobs=1 (db), companies=1 (db), source=api-container -->");
    expect(res.text).toContain("<loc>https://skipwait.me/</loc>");
    expect(res.text).toContain("<loc>https://skipwait.me/jobs?job=7</loc>");
    expect(res.text).toContain("<lastmod>2026-10-20</lastmod>");
    expect(res.text).toContain("<loc>https://skipwait.me/explore/wipro</loc>");
    expect(res.text.match(/<loc>/g)).toHaveLength(20 + 2);
  });

  it("a failing read is loud: error log, stamped note, static routes still served", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = appFor({
      listJobs: async () => { throw new Error("db down"); },
      listCompanySlugs: async () => [{ slug: "wipro" }],
    });
    const res = await request(app).get("/sitemap.xml").set("Host", "skipwait.me");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<!-- live: jobs=0 (error), companies=1 (db), source=api-container -->");
    expect(res.text).not.toContain("/jobs?job=");
    expect(res.text).toContain("<loc>https://skipwait.me/explore/wipro</loc>");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
