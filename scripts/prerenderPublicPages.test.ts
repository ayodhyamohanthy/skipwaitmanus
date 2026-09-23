import { describe, expect, it } from "vitest";
import { homeLinks, landingSnapshot, PUBLIC_PAGES, publicSnapshots, renderPublicPage } from "./prerender-public-pages";
import { LANDING_EXPLORE, LANDING_FAQ, LANDING_FAQ_HEADING, LANDING_H1, LANDING_SUMMARY, LANDING_TITLE } from "../shared/landingContent";

const template = '<html><head><title>skipwait.me — Job Referrals</title><meta name="description" content="previous copy" /><link rel="canonical" href="https://skipwait.me/" /><meta property="og:title" content="previous og title" /><meta property="og:description" content="previous og copy" /><meta property="og:url" content="https://skipwait.me/" /><meta name="twitter:title" content="previous twitter title" /><meta name="twitter:description" content="previous twitter copy" /></head><body><div id="root"></div></body></html>';

describe("static public pages for crawlers (Razorpay website review)", () => {
  it("covers every page Razorpay asks for", () => {
    expect(PUBLIC_PAGES.map(p => p.route)).toEqual(expect.arrayContaining(["/terms", "/privacy", "/refunds", "/cancellations", "/shipping", "/about", "/contact", "/pricing"]));
  });
  it("injects the page text, title and canonical into the SPA shell", () => {
    const html = renderPublicPage(template, "/refunds", "Refunds & Cancellation", "<main>refund text</main>");
    expect(html).toContain('<div id="root"><main>refund text</main></div>');
    expect(html).toContain("<title>Refunds &amp; Cancellation — skipwait.me</title>");
    expect(html).toContain('href="https://skipwait.me/refunds"');
  });
  it("gives the home page plain links to every policy page", () => {
    for (const { route } of PUBLIC_PAGES) expect(homeLinks()).toContain(`href="${route}"`);
  });
});

describe("crawlable landing and public snapshots", () => {
  it("writes the landing heading, summary, both role entry points, and every explore link", () => {
    const html = landingSnapshot();
    expect(html).toContain(`<h1>${LANDING_H1}</h1>`);
    expect(html).toContain(LANDING_SUMMARY);
    expect(html).toContain('href="/start"');
    expect(html).toContain('href="/referrer"');
    for (const link of LANDING_EXPLORE) expect(html).toContain(`href="${link.href}"`);
    expect(html).toContain(homeLinks());
  });

  it("prints the same questions the landing page shows, so FAQ markup has visible answers", () => {
    const html = landingSnapshot();
    expect(html).toContain(`<h2>${LANDING_FAQ_HEADING}</h2>`);
    for (const entry of LANDING_FAQ) {
      expect(html).toContain(`<dt>${entry.question}</dt>`);
      expect(html).toContain(`<dd>${entry.answer}</dd>`);
    }
  });

  it("keeps the landing title, description, and canonical honest in the shell it rewrites", () => {
    const html = renderPublicPage(template, "/", LANDING_TITLE, landingSnapshot(), LANDING_SUMMARY);
    expect(html).toContain(`<title>${LANDING_TITLE} — skipwait.me</title>`);
    expect(html).toContain(`<meta name="description" content="${LANDING_SUMMARY}" />`);
    expect(html).toContain(`<meta property="og:description" content="${LANDING_SUMMARY}" />`);
    expect(html).toContain(`<meta name="twitter:description" content="${LANDING_SUMMARY}" />`);
    expect(html).toContain('<meta property="og:url" content="https://skipwait.me/" />');
    expect(html).not.toContain("previous copy");
    expect(html).not.toContain("previous og title");
  });

  it("prepares one snapshot per public screen that needs a session or API data", () => {
    const snapshots = publicSnapshots();
    expect(snapshots.map(snapshot => snapshot.route)).toEqual(["/jobs", "/wall", "/premium", "/plans", "/referrer", "/employer"]);
    for (const snapshot of snapshots) {
      expect(snapshot.markup).toContain("<h1>");
      expect(snapshot.title.length).toBeGreaterThan(0);
      expect(snapshot.description.length).toBeLessThanOrEqual(200);
    }
  });

  it("never publishes a person, an address, or a fabricated claim in a snapshot", () => {
    const serialized = JSON.stringify(publicSnapshots());
    expect(serialized).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(serialized).not.toMatch(/\bRef-\d+/i);
    expect(serialized).not.toMatch(/Sarah was just|fast-tracked|hiring guarantee|just got hired/i);
  });
});
