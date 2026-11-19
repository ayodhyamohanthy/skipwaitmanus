import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
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
describe("sitemap.xml function at runtime", () => {
  const contextFor = (url: string, env: Record<string, string> = {}) => ({ request: new Request(url), env } as never);

  it("lists live jobs and companies, stamped with the read outcome", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/jobs")) return new Response(JSON.stringify({ jobs: [{ id: 7, updatedAt: "2026-10-20T00:00:00Z" }] }), { status: 200 });
      if (url.endsWith("/api/companies")) return new Response(JSON.stringify({ companies: [{ slug: "wipro" }] }), { status: 200 });
      throw new Error(`unexpected fetch ${url}`);
    }));
    const { onRequest } = await import("../functions/sitemap.xml");
    const body = await (await onRequest(contextFor("https://skipwait.me/sitemap.xml"))).text();
    expect(body).toContain("<loc>https://skipwait.me/jobs?job=7</loc>");
    expect(body).toContain("<lastmod>2026-10-20</lastmod>");
    expect(body).toContain("<loc>https://skipwait.me/explore/wipro</loc>");
    expect(body).toContain("<!-- live: jobs=1 (ok), companies=1 (ok), api=https://skipwait.me -->");
    vi.unstubAllGlobals();
  });

  it("a failed API read is loud: logged and stamped, never a silent drop", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("blocked", { status: 403 })));
    const { onRequest } = await import("../functions/sitemap.xml");
    const body = await (await onRequest(contextFor("https://skipwait.me/sitemap.xml"))).text();
    expect(body).toContain("<!-- live: jobs=0 (http-403), companies=0 (http-403)");
    expect(body).not.toContain("/jobs?job=");
    expect(errorSpy).toHaveBeenCalled();
    vi.unstubAllGlobals();
    errorSpy.mockRestore();
  });
});
