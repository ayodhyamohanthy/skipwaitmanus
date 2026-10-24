import { describe, expect, it, vi } from "vitest";
import { landingSnapshot, PUBLIC_PAGES, publicSnapshots } from "./prerender-public-pages";
import { breadcrumbsHtml, homeLinks, renderPublicPage } from "./prerenderSeo";
import { GOAL_LANDING_H1, GOAL_LANDING_HERO_LEAD, LANDING_EXPLORE, LANDING_SUMMARY } from "../shared/landingContent";
import { breadcrumbsFor, canonicalUrl, PUBLIC_ROUTES, publicRoute } from "../shared/publicRoutes";
import { LAUNCH_COMPANY_SEED } from "../shared/companyDirectorySeed";

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
    const html = renderPublicPage(template, route("/"), landingSnapshot(policyLinks));
    expect(html).not.toContain('"@type":"BreadcrumbList"');
  });

  it("prints no FAQ on the goal landing and marks none up (D-048-fix-landing-load-flash)", () => {
    const body = landingSnapshot(policyLinks);
    expect(body).not.toContain("<dt>");
    const html = renderPublicPage(template, route("/"), body);
    expect(html).not.toContain('"@type":"FAQPage"');
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
  it("writes the goal landing's headline, hero, role entry points, and every explore link", () => {
    const html = landingSnapshot(policyLinks);
    // The h1 carries the goal page's display classes; pin the text, not the bare tag.
    expect(html).toContain(`>${GOAL_LANDING_H1}</h1>`);
    expect(html).toContain(GOAL_LANDING_HERO_LEAD);
    expect(html).toContain('href="/explore"');
    expect(html).toContain('href="/sign-in?intent=referrer"');
    expect(html).toContain('href="/referrer"');
    for (const link of ["/jobs", "/wall", "/premium", "/pricing", "/plans", "/about", "/contact", "/support"]) expect(html).toContain(`href="${link}"`);
    expect(html).toContain(homeLinks(policyLinks));
  });

  it("keeps the landing title, description, and canonical honest in the shell it rewrites", () => {
    const html = renderPublicPage(template, route("/"), landingSnapshot(policyLinks));
    expect(html).toContain(`<title>${route("/").title} — skipwait.me</title>`);
    expect(html).toContain(`<meta name="description" content="${LANDING_SUMMARY}" />`);
    expect(html).toContain('<meta property="og:description" content="' + LANDING_SUMMARY + '" />');
    expect(html).toContain('<meta property="og:url" content="https://skipwait.me/" />');
    expect(html).not.toContain("previous copy");
    expect(html).not.toContain("previous og title");
  });

  it("prepares one snapshot per public screen that needs a session or API data", () => {
    const snapshots = publicSnapshots();
    expect(snapshots.map(snapshot => snapshot.route)).toEqual(["/jobs", "/explore", "/wall", "/premium", "/plans", "/referrer", "/employer"]);
    for (const snapshot of snapshots) {
      expect(snapshot.markup).toContain("<h1>");
      expect(snapshot.title).toBe(publicRoute(snapshot.route)!.title);
      expect(snapshot.description).toBe(publicRoute(snapshot.route)!.description);
      expect(snapshot.description.length).toBeLessThanOrEqual(160);
    }
  });

  it("describes /explore with the launch companies the page lists, and links every company page", () => {
    const explore = publicSnapshots().find(snapshot => snapshot.route === "/explore")!;
    const names = new Intl.ListFormat("en-US", { type: "conjunction" }).format(LAUNCH_COMPANY_SEED.map(company => company.name));
    expect(explore.description).toBe(`Find people open to referral requests at ${names}.`);
    expect(explore.markup).toContain("<h1>Where would you love to work next?</h1>");
    for (const company of LAUNCH_COMPANY_SEED) expect(explore.markup).toContain(`href="/explore/${company.slug}"`);
    expect(landingSnapshot(policyLinks)).toContain('href="/explore"');
  });

  it("never publishes a person, an address, or a fabricated claim in a snapshot", () => {
    const serialized = JSON.stringify(publicSnapshots());
    expect(serialized).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(serialized).not.toMatch(/\bRef-\d+/i);
    expect(serialized).not.toMatch(/Sarah was just|fast-tracked|hiring guarantee|just got hired/i);
  });
});

// D-067: the monthly Pro and Max plans are removed completely, and /plans now
// shows Free and credits (the D-046 passes are 30/90-day, not monthly plans).
describe("D-067: no crawlable copy names a removed plan", () => {
  const RETIRED_NAME = /\bPro\b|\bMax\b|₹599|₹1,299|\$7\b|\$15\b/;
  const MONTHLY_PLANS = /\bmonthly (?:referral )?plans?\b/i;

  it("the landing snapshot, every public snapshot, route title and description, and the landing links", () => {
    const copy = [
      landingSnapshot(policyLinks),
      ...publicSnapshots().flatMap(snapshot => [snapshot.markup, snapshot.title, snapshot.description]),
      ...PUBLIC_ROUTES.flatMap(entry => [entry.title, entry.description]),
      ...LANDING_EXPLORE.flatMap(link => [link.label, link.summary]),
    ];
    for (const line of copy) {
      expect(line).not.toMatch(RETIRED_NAME);
      expect(line).not.toMatch(MONTHLY_PLANS);
    }
  });

  it("titles /plans as the page does, and the /cancellations description keeps the page's paid-plan section", () => {
    expect(route("/plans").title).toBe("Plans and credits");
    expect(LANDING_EXPLORE.find(link => link.href === "/plans")?.label).toBe("Plans and credits");
    expect(route("/cancellations").description).toBe("How to cancel a referral request, a paid plan, or a credit purchase, and when any money comes back.");
  });
});

// D-048-F-static-frame: the prerender path never fetches, with every goal
// surface id forced on (VITE_GOAL_SURFACES=all), and each page still renders
// its own text. A page that starts fetching during prerender fails here
// before it can ship in the flags-on CI build.
describe("goal static frame: prerender fetches nothing with every surface on", () => {
  it("every PUBLIC_PAGES module and public snapshot renders fetch-free", async () => {
    vi.stubEnv("VITE_GOAL_SURFACES", "all");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { Router } = await import("wouter");
    const React = await import("react");
    for (const page of PUBLIC_PAGES) {
      const { default: Component } = await page.load();
      const markup = renderToStaticMarkup(React.createElement(Router, { ssrPath: page.route }, React.createElement(Component)));
      expect(markup.length, `${page.route} rendered empty`).toBeGreaterThan(200);
    }
    for (const snapshot of publicSnapshots()) {
      expect(snapshot.markup).toContain("<h1>");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
