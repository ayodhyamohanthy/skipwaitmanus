import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STATIC_ROUTES } from "../functions/sitemap.xml";
import { PUBLIC_PAGES, publicSnapshots } from "../scripts/prerender-public-pages";

const robots = readFileSync(new URL("../client/public/robots.txt", import.meta.url), "utf8");
const sitemapFunction = readFileSync(new URL("../functions/sitemap.xml.ts", import.meta.url), "utf8");

describe("public crawl coverage", () => {
  const advertised = STATIC_ROUTES.map(route => route.path);
  const prerendered = new Set(["/", ...PUBLIC_PAGES.map(page => page.route), ...publicSnapshots().map(page => page.route)]);

  it("gives crawlers a static page for every public route the sitemap advertises", () => {
    for (const path of advertised) expect(prerendered.has(path), `${path} is advertised in the sitemap but has no prerendered HTML`).toBe(true);
  });

  it("advertises every prerendered public page exactly once", () => {
    for (const path of prerendered) expect(advertised).toContain(path);
    expect(new Set(advertised).size).toBe(advertised.length);
  });

  it("keeps the sitemap on the canonical origin and off the workers.dev fallback", () => {
    expect(sitemapFunction).toContain('const DEFAULT_API_ORIGIN = "https://skipwait.me"');
    expect(sitemapFunction).not.toContain("workers.dev");
    expect(STATIC_ROUTES[0]).toEqual({ path: "/", changefreq: "daily", priority: "1.0" });
  });

  it("keeps signed-in screens out of crawler reach", () => {
    for (const path of ["/admin/", "/api/", "/conversation/", "/inbox", "/messages", "/notifications", "/requests", "/settings"]) {
      expect(robots).toContain(`Disallow: ${path}`);
    }
    expect(robots).toContain("Sitemap: https://skipwait.me/sitemap.xml");
  });
});