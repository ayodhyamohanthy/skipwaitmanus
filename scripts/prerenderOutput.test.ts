// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { main } from "./prerender-public-pages";
import { PUBLIC_ROUTES } from "../shared/publicRoutes";

/**
 * The prerender step had no test that ran it. A refactor of the file-writing
 * helper started writing the landing page to `dist/public/.html` instead of
 * `index.html`, and every other test still passed because they all exercised
 * the pure helpers — never the files Cloudflare Pages actually serves.
 *
 * These assertions run the real step against a scratch directory and read the
 * files back, because the deliverable is the file, not the string.
 */
const SHELL = [
  "<!doctype html><html lang=\"en\"><head>",
  '<title>shell</title>',
  '<meta name="description" content="shell" />',
  '<link rel="canonical" href="https://skipwait.me/" />',
  '<meta property="og:title" content="shell" />',
  '<meta property="og:description" content="shell" />',
  '<meta property="og:url" content="https://skipwait.me/" />',
  '<meta name="twitter:title" content="shell" />',
  '<meta name="twitter:description" content="shell" />',
  "</head><body><div id=\"root\"></div></body></html>",
].join("");

/** Cloudflare Pages serves `/` from index.html and `/about` from about.html. */
const fileFor = (routePath: string): string => (routePath === "/" ? "index.html" : `${routePath.slice(1)}.html`);

let dist: string;

beforeAll(async () => {
  dist = mkdtempSync(path.join(tmpdir(), "skipwait-prerender-"));
  writeFileSync(path.join(dist, "index.html"), SHELL);
  await main(dist);
}, 60_000);

afterAll(() => {
  if (dist) rmSync(dist, { recursive: true, force: true });
});

describe("the prerender step writes a file Cloudflare Pages can serve for every route", () => {
  it("writes the home page to index.html, not a file whose name is derived from the path", () => {
    // "/" must never become ".html". Doing so leaves index.html as the empty
    // shell, which is a home page with no H1 and no text for a crawler.
    const written = readdirSync(dist);
    expect(written).not.toContain(".html");
    const home = readFileSync(path.join(dist, "index.html"), "utf8");
    expect(home).toContain("<h1>");
    expect(home).toContain('data-skipwait-snapshot="landing"');
  });

  it("writes one <route>.html per public route and nothing extra", () => {
    const written = readdirSync(dist).filter(name => name.endsWith(".html")).sort();
    expect(written).toEqual(PUBLIC_ROUTES.map(route => fileFor(route.route)).sort());
  });

  it("replaces the empty shell placeholder in every file", () => {
    for (const name of readdirSync(dist).filter(entry => entry.endsWith(".html"))) {
      const html = readFileSync(path.join(dist, name), "utf8");
      expect(html, `${name} still has the empty SPA shell`).not.toMatch(/<div id="root">\s*<\/div>/);
    }
  });

  it("gives the home page the FAQ answers it prints, and exactly one H1", () => {
    const home = readFileSync(path.join(dist, "index.html"), "utf8");
    expect(home).toContain('"@type":"FAQPage"');
    expect(home.match(/<h1/g)?.length).toBe(1);
  });

  it("gives every page a description, a canonical and a breadcrumb", () => {
    for (const route of PUBLIC_ROUTES) {
      const name = route.route === "/" ? "index.html" : `${route.route.slice(1)}.html`;
      expect(existsSync(path.join(dist, name)), `${route.route} was not prerendered`).toBe(true);
      const html = readFileSync(path.join(dist, name), "utf8");
      expect(html, `${route.route} has no description`).toContain(`<meta name="description" content="${route.description.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" />`);
      expect(html, `${route.route} has the wrong canonical`).toContain(`<link rel="canonical" href="https://skipwait.me${route.route}" />`);
      expect(html, `${route.route} has no WebPage markup`).toContain('"@type":"WebPage"');
      // The home page has nothing above it in the trail, and "Home" on its own
      // is not a breadcrumb, so it is the one page that must not carry one.
      expect(html.includes('aria-label="Breadcrumb"'), `${route.route} should ${route.route === "/" ? "not " : ""}have a breadcrumb`).toBe(route.route !== "/");
    }
  });
});

/**
 * A page no other page links to is an orphan: it is in the sitemap but nothing
 * on the site points a crawler at it. `/employer` was one for several deploys
 * because the React footer linked it while the no-JavaScript snapshot did not,
 * and only the snapshot is what a crawler reads.
 *
 * The graph is measured from the written files, not from the source that made
 * them, because the snapshot is allowed to drift from the React page — and it
 * did. Three unique source pages is the floor: not a Google-published rule, but
 * the point at which a route stops depending on the home page alone.
 */
const MIN_INBOUND_SOURCES = 3;

/** Every internal path the written page links to, trailing slashes normalized. */
function outboundTargets(routePath: string): Set<string> {
  const html = readFileSync(path.join(dist, fileFor(routePath)), "utf8");
  return new Set([...html.matchAll(/href="(\/[^"#?]*)"/g)].map(match => match[1].replace(/\/$/, "") || "/"));
}

/** Unique source pages linking to `target`, ignoring self-links. */
function inboundSources(target: string): string[] {
  return PUBLIC_ROUTES.map(route => route.route).filter(source => source !== target && outboundTargets(source).has(target)).sort();
}

describe("every public route is reachable from the rest of the site", () => {
  it("leaves no public page an orphan or a one-link page", () => {
    const thin = PUBLIC_ROUTES
      .map(route => ({ route: route.route, sources: inboundSources(route.route) }))
      .filter(entry => entry.sources.length < MIN_INBOUND_SOURCES)
      .map(entry => `${entry.route} (${entry.sources.length}: ${entry.sources.join(", ") || "nothing"})`);
    expect(thin, `linked from fewer than ${MIN_INBOUND_SOURCES} pages`).toEqual([]);
  });

  it("links each public route to at least two others, so nothing is a dead end", () => {
    const deadEnds = PUBLIC_ROUTES
      .map(route => {
        const others = outboundTargets(route.route);
        others.delete(route.route);
        return { route: route.route, others: others.size };
      })
      .filter(entry => entry.others < 2);
    expect(deadEnds).toEqual([]);
  });
});