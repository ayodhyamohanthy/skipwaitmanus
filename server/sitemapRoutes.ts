// Sitemap from the source of truth: the API container reads its own DB, so
// skipwait.me/sitemap.xml never depends on a Pages-to-Worker same-zone fetch
// (those loop back into the Pages project and 404 - the silent failure QA
// found). The Pages Function stays as the fallback shape; both build through
// shared/sitemap.ts. Failures here are loud: error log + the live note.
import type { Express, Request, Response } from "express";
import { SITEMAP_STATIC_ROUTES, buildSitemapXml, companySitemapEntries, jobSitemapEntries, type SitemapEntry } from "../shared/sitemap";

export type SitemapRouteDeps = {
  listJobs: (input: { query?: string }) => Promise<Array<{ id?: number; updatedAt?: string | Date | null }>>;
  listCompanySlugs: () => Promise<Array<{ slug?: string }>>;
};

export function registerSitemapRoutes(app: Express, deps: SitemapRouteDeps) {
  app.get("/sitemap.xml", async (req: Request, res: Response) => {
    // The container always sits behind the Worker on https; req.protocol is
    // the internal hop, never the public scheme.
    const origin = `https://${req.get("host") ?? "skipwait.me"}`;
    const entries: SitemapEntry[] = SITEMAP_STATIC_ROUTES.map(route => ({ loc: `${origin}${route.path}`, changefreq: route.changefreq, priority: route.priority }));
    let jobCount = 0;
    let companyCount = 0;
    let jobsNote = "db";
    let companiesNote = "db";
    try {
      const jobs = await deps.listJobs({});
      const jobEntries = jobSitemapEntries(origin, jobs);
      entries.push(...jobEntries);
      jobCount = jobEntries.length;
    } catch (error) {
      jobsNote = "error";
      console.error("[sitemap] jobs read failed:", error instanceof Error ? error.message : error);
    }
    try {
      const companies = await deps.listCompanySlugs();
      const companyEntries = companySitemapEntries(origin, companies);
      entries.push(...companyEntries);
      companyCount = companyEntries.length;
    } catch (error) {
      companiesNote = "error";
      console.error("[sitemap] companies read failed:", error instanceof Error ? error.message : error);
    }
    res.set("content-type", "application/xml; charset=utf-8").set("cache-control", "public, max-age=3600");
    res.send(buildSitemapXml(entries, `jobs=${jobCount} (${jobsNote}), companies=${companyCount} (${companiesNote}), source=api-container`));
  });
}
