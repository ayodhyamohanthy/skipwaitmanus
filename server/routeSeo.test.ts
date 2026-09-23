import { describe, expect, it } from "vitest";
import { applyRouteSeo, classifyRoute, INDEXABLE_ROUTES } from "../functions/_lib/routeSeo";

const shell = `<html><head><title>skipwait.me — Job Referrals</title>
<meta name="description" content="generic" />
<link rel="canonical" href="https://skipwait.me/" />
<meta property="og:title" content="generic" />
<meta property="og:description" content="generic" />
<meta property="og:url" content="https://skipwait.me/" />
</head><body><div id="root"></div></body></html>`;

const serve = (path: string) => { const d = classifyRoute(path); return { kind: d.kind, html: applyRouteSeo(shell, path, d) }; };

describe("served-HTML SEO for SPA routes (#96)", () => {
  it("no public route other than / serves the homepage canonical", () => {
    for (const path of Object.keys(INDEXABLE_ROUTES)) {
      const { kind, html } = serve(path);
      expect(kind).toBe("index");
      expect(html).toContain(`<link rel="canonical" href="https://skipwait.me${path}" />`);
      expect(html).not.toContain('href="https://skipwait.me/"');
      expect(html).not.toContain("skipwait.me — Job Referrals");
    }
  });
  it("private routes are noindex with no homepage canonical", () => {
    for (const path of ["/start", "/requests", "/conversation/12", "/admin/users", "/premium", "/employer/billing"]) {
      const { kind, html } = serve(path);
      expect(kind).toBe("noindex");
      expect(html).toContain('<meta name="robots" content="noindex" />');
      expect(html).not.toContain('rel="canonical"');
    }
  });
  it("unknown paths are 404s", () => {
    expect(classifyRoute("/nonexistent-xyz").kind).toBe("not_found");
    expect(classifyRoute("/referral-at/google").kind).toBe("not_found");
    expect(serve("/nonexistent-xyz").html).toContain("noindex");
  });
  it("leaves the homepage, prerendered pages, share links, API and files alone", () => {
    for (const path of ["/", "/terms", "/pricing", "/about", "/fast/abc", "/refer/google/a", "/share-card/x", "/api/health", "/assets/index.js", "/manifest.webmanifest", "/sitemap.xml", "/robots.txt"]) expect(classifyRoute(path).kind).toBe("pass");
  });
  it("tolerates a trailing slash", () => {
    expect(classifyRoute("/jobs/").kind).toBe("index");
  });
});
