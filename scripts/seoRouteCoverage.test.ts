import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isKnownRoute, KNOWN_ROUTE_PATTERNS } from "../functions/_middleware";
import { STATIC_ROUTES } from "../functions/sitemap.xml";
import { PUBLIC_ROUTES } from "../shared/publicRoutes";
import { PUBLIC_PAGES, publicSnapshots } from "./prerender-public-pages";

/**
 * The route tables are the contract that keeps skipwait.me from advertising an
 * unbounded set of duplicate URLs. Three lists have to agree:
 *
 * - `client/src/App.tsx` — the screens the single-page app can actually render.
 * - `functions/_middleware.ts` — which of those paths report 200 instead of 404.
 * - `shared/publicRoutes.ts` / `functions/sitemap.xml.ts` — which of them we ask
 *   a crawler to index.
 *
 * A route added to one list and not the others is a bug in whichever direction
 * it points: a screen that 404s for a visitor, or a sitemap URL with no page
 * behind it. Both fail here.
 */
const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
const appRoutes = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)].map(match => match[1]!);

describe("route tables agree with the screens the app renders", () => {
  it("finds every routed screen in App.tsx", () => {
    expect(appRoutes.length).toBeGreaterThan(30);
    expect(appRoutes).toContain("/");
  });

  it("serves 200 for every screen the router declares", () => {
    for (const route of appRoutes) {
      expect(KNOWN_ROUTE_PATTERNS, `${route} is routed in App.tsx but missing from functions/_middleware.ts`).toContain(route);
    }
  });

  it("does not claim screens the router does not declare", () => {
    for (const pattern of KNOWN_ROUTE_PATTERNS) {
      expect(appRoutes, `${pattern} is served by the middleware but not routed in App.tsx`).toContain(pattern);
    }
  });
});

describe("isKnownRoute answers the way the status rule needs", () => {
  it("accepts real screens, including parameterised ones", () => {
    for (const path of ["/", "/jobs", "/wall", "/start", "/settings", "/share-card/tok_123", "/fast/abc", "/admin/users", "/conversation/42"]) {
      expect(isKnownRoute(path), `${path} should be a real route`).toBe(true);
    }
  });

  it("rejects the near-miss URLs that used to answer 200", () => {
    for (const path of ["/home", "/Wall", "/ABOUT", "/this-page-does-not-exist", "/sitemap.xml.gz", "/favicon.ico2", "/job", "//", "/start/extra"]) {
      expect(isKnownRoute(path), `${path} should not be indexable`).toBe(false);
    }
  });

  it("passes a trailing slash through so Pages can still 308 it to the canonical path", () => {
    // Load-bearing: this middleware runs *before* Cloudflare Pages normalises
    // `/about/` to `/about`. Reporting 404 here would replace the existing
    // single-hop 308 with a dead end and add a redirect hop to every such link.
    for (const path of ["/jobs/", "/about/", "/wall/"]) {
      expect(isKnownRoute(path), `${path} must reach Pages so its 308 to the canonical path still happens`).toBe(true);
    }
  });

  it("rejects paths that merely start with a real route name", () => {
    expect(isKnownRoute("/jobss")).toBe(false);
    expect(isKnownRoute("/start-over")).toBe(false);
    expect(isKnownRoute("/administrator")).toBe(false);
  });
});

describe("the indexable surface stays inside the screens that exist", () => {
  it("only advertises paths the app can render", () => {
    for (const { route } of PUBLIC_ROUTES) {
      expect(isKnownRoute(route), `${route} is advertised for indexing but is not a real screen`).toBe(true);
    }
  });

  it("keeps the sitemap and the route registry identical", () => {
    // Order is not part of the contract — a crawler reads the sitemap as a set.
    // The per-path metadata is, because changefreq and priority are the signals
    // we are deliberately making a claim about.
    expect([...STATIC_ROUTES].map(entry => entry.path).sort()).toEqual(PUBLIC_ROUTES.map(route => route.route).sort());
    for (const entry of STATIC_ROUTES) {
      const declared = PUBLIC_ROUTES.find(route => route.route === entry.path);
      expect(declared, `${entry.path} is in the sitemap but not in shared/publicRoutes.ts`).toBeDefined();
      expect(entry.changefreq).toBe(declared!.changefreq);
      expect(entry.priority).toBe(declared!.priority);
    }
  });

  it("still gives every sitemap URL a prerendered page for crawlers", () => {
    const prerendered = new Set(["/", ...PUBLIC_PAGES.map(page => page.route), ...publicSnapshots().map(page => page.route)]);
    for (const entry of STATIC_ROUTES) {
      expect(prerendered.has(entry.path), `${entry.path} is in the sitemap but has no prerendered HTML`).toBe(true);
    }
    expect(prerendered.size).toBe(PUBLIC_ROUTES.length);
  });
});

describe("a change to the crawlable output still reaches production", () => {
  // The Sep 24 stall started because a deploy failed silently, and the reason a
  // copy-only edit can never ship is a path filter missing a build input. Both
  // are cheap to assert here and expensive to discover in a Search Console report.
  it("keeps every deploy workflow watching the files its build reads", () => {
    const script = path.resolve(import.meta.dirname, "check-deploy-triggers.mjs");
    expect(() => execFileSync(process.execPath, [script], { stdio: "pipe" })).not.toThrow();
  });
});