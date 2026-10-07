import { describe, expect, it } from "vitest";
import { landingSnapshot, PUBLIC_PAGES, publicSnapshots } from "./prerender-public-pages";
import { breadcrumbsHtml, faqJsonLd, homeLinks, renderPublicPage } from "./prerenderSeo";
import { LANDING_EXPLORE, LANDING_FAQ, LANDING_FAQ_HEADING, LANDING_H1, LANDING_SUMMARY } from "../shared/landingContent";
import { breadcrumbsFor, canonicalUrl, PUBLIC_ROUTES, publicRoute } from "../shared/publicRoutes";

const template =
  '<html><head><title>skipwait.me — Job Referrals</title><meta name="description" content="previous copy" /><link rel="canonical" href="https://skipwait.me/" /><meta property="og:title" content="previous og title" /><meta property="og:description" content="previous og copy" /><meta property="og:url" content="https://skipwait.me/" /><meta name="twitter:title" content="previous twitter title" /><meta name="twitter:description" content="previous twitter copy" /></head><body><div id="root"></div></body></html>';

const policyLinks = PUBLIC_PAGES.map(page => ({ route: page.route, title: publicRoute(page.route)!.title }));
const route = (path: string) => publicRoute(path)!;

describe("static public pages for crawlers (Razorpay website review)", () => {
  it("covers every page Razorpay asks for", () => {
    expect(PUBLIC_PAGES.map(page => page.route)).toEqual(expect.arrayContaining(["/terms", "/privacy", "/refunds", "/cancellations", "/shipping", "/about", "/contact", "/pricing"]));
  });

  it("gives the home page plain links to every policy page", () => {
    for (const link of policyLinks) expect(homeLinks(policyLinks)).toContain(`href="${link.route}"`);
  });
});

describe("every public page carries its own title, description and canonical", () => {
  const html = renderPublicPage(template, route("/terms"), "<main>terms text</main>");

  it("replaces the shared shell head instead of inheriting it", () => {
    expect(html).toContain("<title>Terms of Service — skipwait.me</title>");
    expect(html).toContain(`<meta name="description" content="${route("/terms").description}" />`);
    expect(html).toContain('<link rel="canonical" href="https://skipwait.me/terms" />');
    expect(html).not.toContain("previous copy");
    expect(html).not.toContain("previous og title");
  });

  it("gives each page a distinct og:url so shares do not all collapse to the home page", () => {
    expect(html).toContain('<meta property="og:url" content="https://skipwait.me/terms" />');
    expect(html).toContain('<meta property="og:title" content="Terms of Service — skipwait.me" />');
    expect(html).toContain(`<meta name="twitter:description" content="${route("/terms").description}" />`);
  });

  it("keeps a rendered price from being read as a substitution pattern", () => {
    const priced = renderPublicPage(template, route("/premium"), "<main>$7/month and $1 each</main>");
    expect(priced).toContain("<main>$7/month and $1 each</main>");
  });

  it("describes every indexable route in its own words", () => {
    const descriptions = new Set(PUBLIC_ROUTES.map(entry => entry.description));
    expect(descriptions.size).toBe(PUBLIC_ROUTES.length);
    for (const entry of PUBLIC_ROUTES) {
      expect(entry.description.length, `${entry.route} description is too long for a search result`).toBeLessThanOrEqual(160);
      expect(entry.title.trim().length).toBeGreaterThan(0);
    }
  });

  it("uses the home page canonical only for the home page", () => {
    for (const entry of PUBLIC_ROUTES) {
      const built = renderPublicPage(template, entry, "<main>x</main>");
      expect(built).toContain(`<link rel="canonical" href="${canonicalUrl(entry.route)}" />`);
    }
  });
});

describe("structured data reaches crawlers that never run JavaScript", () => {
  it("marks up the page and its breadcrumb trail", () => {
    const html = renderPublicPage(template, route("/about"), "<main>about</main>");
    expect(html).toContain('"@type":"WebPage"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('"name":"About skipwait.me"');
    expect(html).toMatch(/<script type="application\/ld\+json" data-skipwait-jsonld="prerender">.*<\/script><\/head>/);
  });

  it("tags the block so applySeo can replace it instead of duplicating it", () => {
    // @client/src/lib/seo.ts removes every script carrying this marker when the
    // route changes. An untagged block survives hydration, and the head ends up
    // holding two BreadcrumbList blocks for the same page.
    const html = renderPublicPage(template, route("/about"), "<main>about</main>");
    const marked = html.match(/<script type="application\/ld\+json" data-skipwait-jsonld="[^"]+">/g) ?? [];
    const all = html.match(/<script type="application\/ld\+json"/g) ?? [];
    expect(all.length).toBe(marked.length);
  });

  it("leaves the home page without a pointless one-item breadcrumb", () => {
    const html = renderPublicPage(template, route("/"), landingSnapshot(policyLinks), { extraJsonLd: [faqJsonLd(LANDING_FAQ)] });
    expect(html).not.toContain('"@type":"BreadcrumbList"');
  });

  it("marks up only FAQ entries that are printed on the page", () => {
    const html = renderPublicPage(template, route("/"), landingSnapshot(policyLinks), { extraJsonLd: [faqJsonLd(LANDING_FAQ)] });
    const body = landingSnapshot(policyLinks);
    expect(html).toContain('"@type":"FAQPage"');
    for (const entry of LANDING_FAQ) {
      expect(body).toContain(`<dt>${entry.question}</dt>`);
      expect(html).toContain(JSON.stringify(entry.question).slice(1, -1));
    }
  });
});

describe("breadcrumbs point at real pages", () => {
  it("renders Home then the page, with the current page marked", () => {
    const html = breadcrumbsHtml(route("/terms"));
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('<li><a href="/">Home</a></li>');
    expect(html).toContain('<li aria-current="page">Terms of Service</li>');
  });

  it("renders nothing for the home page", () => {
    expect(breadcrumbsHtml(route("/"))).toBe("");
    expect(breadcrumbsFor(route("/"))).toEqual([]);
  });

  it("only ever links to paths the site actually serves", () => {
    for (const entry of PUBLIC_ROUTES) {
      for (const crumb of breadcrumbsFor(entry)) {
        expect(PUBLIC_ROUTES.map(item => item.route), `${crumb.path} is not a public route`).toContain(crumb.path);
      }
    }
  });
});

describe("crawlable landing and public snapshots", () => {
  it("writes the landing heading, summary, both role entry points, and every explore link", () => {
    const html = landingSnapshot(policyLinks);
    expect(html).toContain(`<h1>${LANDING_H1}</h1>`);
    expect(html).toContain(LANDING_SUMMARY);
    // Both role entry points, as the v4 landing page presents them.
    expect(html).toContain('href="/explore"');
    expect(html).toContain('href="/referrer"');
    // Derived from the shared source, so the snapshot cannot drift from the
    // page: every explore link must come from LANDING_EXPLORE.
    for (const item of LANDING_EXPLORE) expect(html).toContain(`href="${item.href}"`);
    // NOT asserted here: the absence of /start, /jobs, /wall and /premium. The
    // landing section no longer emits them, but PUBLIC_PAGES and
    // shared/publicRoutes.ts still list those routes, so homeLinks() prints
    // them into the same document. Retiring those two tables is the next step;
    // until then an absence assertion would fail for a reason that has nothing
    // to do with the landing page.
    expect(html).toContain(homeLinks(policyLinks));
  });

  it("prints the same questions the landing page shows, so FAQ markup has visible answers", () => {
    const html = landingSnapshot(policyLinks);
    expect(html).toContain(`<h2>${LANDING_FAQ_HEADING}</h2>`);
    for (const entry of LANDING_FAQ) {
      expect(html).toContain(`<dt>${entry.question}</dt>`);
      expect(html).toContain(`<dd>${entry.answer}</dd>`);
    }
  });

  it("keeps the landing title, description, and canonical honest in the shell it rewrites", () => {
    const html = renderPublicPage(template, route("/"), landingSnapshot(policyLinks), { extraJsonLd: [faqJsonLd(LANDING_FAQ)] });
    expect(html).toContain(`<title>${route("/").title} — skipwait.me</title>`);
    expect(html).toContain(`<meta name="description" content="${LANDING_SUMMARY}" />`);
    expect(html).toContain('<meta property="og:description" content="' + LANDING_SUMMARY + '" />');
    expect(html).toContain('<meta property="og:url" content="https://skipwait.me/" />');
    expect(html).not.toContain("previous copy");
    expect(html).not.toContain("previous og title");
  });

  it("prepares one snapshot per public screen that needs a session or API data", () => {
    const snapshots = publicSnapshots();
    expect(snapshots.map(snapshot => snapshot.route)).toEqual(["/jobs", "/wall", "/premium", "/plans", "/referrer", "/employer"]);
    for (const snapshot of snapshots) {
      expect(snapshot.markup).toContain("<h1>");
      expect(snapshot.title).toBe(publicRoute(snapshot.route)!.title);
      expect(snapshot.description).toBe(publicRoute(snapshot.route)!.description);
      expect(snapshot.description.length).toBeLessThanOrEqual(160);
    }
  });

  it("never publishes a person, an address, or a fabricated claim in a snapshot", () => {
    const serialized = JSON.stringify(publicSnapshots());
    expect(serialized).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(serialized).not.toMatch(/\bRef-\d+/i);
    expect(serialized).not.toMatch(/Sarah was just|fast-tracked|hiring guarantee|just got hired/i);
  });
});