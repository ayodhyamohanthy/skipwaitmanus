import { describe, expect, it } from "vitest";
import { homeLinks, PUBLIC_PAGES, renderPublicPage } from "./prerender-public-pages";

const template = '<html><head><title>skipwait.me — Job Referrals</title><link rel="canonical" href="https://skipwait.me/" /></head><body><div id="root"></div></body></html>';

describe("static public pages for crawlers (Razorpay website review)", () => {
  it("covers every page Razorpay asks for", () => {
    expect(PUBLIC_PAGES.map(p => p.route)).toEqual(expect.arrayContaining(["/terms", "/privacy-policy", "/refunds", "/shipping", "/about", "/contact", "/pricing"]));
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
