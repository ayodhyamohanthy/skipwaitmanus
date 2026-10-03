/**
 * Build step: write static HTML for the public pages and the landing page so
 * crawlers that don't run JavaScript (search engines, AI answer engines,
 * payment-provider website reviews) see the real text instead of an empty
 * shell. The SPA still mounts over it.
 *
 * Output: dist/public/<route>.html plus a rewritten index.html (Cloudflare
 * Pages serves those before the SPA fallback). Policy pages render from their
 * React components; public screens that need a session or live API data render
 * from @shared/landingContent instead, so the no-JavaScript text cannot drift
 * from the copy the product renders.
 *
 * Titles, descriptions, canonical URLs and sitemap metadata all come from
 * @shared/publicRoutes, so a route cannot be emitted with a missing or stale
 * description. This file owns page *content*; @scripts/prerenderSeo owns the
 * head and body rewriting.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { FREE_MONTHLY_ALLOWANCE, SUBSCRIPTION_PLANS } from "../shared/subscriptionPlans";
import { LANDING_COMMITMENTS, LANDING_EMPLOYEE_STEPS, LANDING_EMPLOYER_LINK, LANDING_EXPLORE, LANDING_FAQ, LANDING_FAQ_HEADING, LANDING_GUIDES, LANDING_H1, LANDING_SEEKER_STEPS, LANDING_SUMMARY, type LandingStep } from "../shared/landingContent";
import { publicRoute } from "../shared/publicRoutes";
import { GUIDES } from "../client/src/content/guides";
import { breadcrumbsHtml, escapeHtml, faqJsonLd, homeLinks, renderPublicPage } from "./prerenderSeo";

/** Route is declared here; its title and description come from @shared/publicRoutes. */
export type PublicPage = {
  route: string;
  load: () => Promise<{ default: React.ComponentType }>;
  /**
   * Extra schema.org blocks for the prerendered HTML. A component can only add
   * them from a useEffect, which `renderToStaticMarkup` never runs, so anything
   * a crawler is meant to read has to be listed here as well.
   */
  extraJsonLd?: () => readonly Record<string, unknown>[];
};

// Page modules use the classic JSX runtime (global React) under tsx, so they
// load lazily after React is on globalThis.
export const PUBLIC_PAGES: PublicPage[] = [
  { route: "/terms", load: () => import("../client/src/pages/Terms") },
  { route: "/privacy", load: () => import("../client/src/pages/TrustPrivacy") },
  { route: "/refunds", load: () => import("../client/src/pages/RefundPolicy") },
  { route: "/cancellations", load: () => import("../client/src/pages/CancellationPolicy") },
  { route: "/shipping", load: () => import("../client/src/pages/ShippingPolicy") },
  { route: "/about", load: () => import("../client/src/pages/About") },
  { route: "/contact", load: () => import("../client/src/pages/Contact") },
  { route: "/pricing", load: () => import("../client/src/pages/Pricing") },
  { route: "/support", load: () => import("../client/src/pages/Support") },
  // One component behind every guide; it reads its own path from the router.
  // Derived from the content module so a guide cannot exist without a page.
  ...GUIDES.map(guide => ({
    route: guide.route,
    load: () => import("../client/src/pages/GuidePage"),
    extraJsonLd: () => [faqJsonLd(guide.faq)],
  })),
];

function stepsSection(heading: string, steps: readonly LandingStep[]) {
  return `<h2>${escapeHtml(heading)}</h2><ol>${steps.map(step => `<li><strong>${escapeHtml(step.title)}</strong> ${escapeHtml(step.body)}</li>`).join("")}</ol>`;
}

/**
 * The landing page as plain HTML for crawlers that never run JavaScript. Every
 * string comes from @shared/landingContent, which the React landing page also
 * renders, so this snapshot cannot promise something the product does not show.
 */
export function landingSnapshot(policyLinks: ReadonlyArray<{ route: string; title: string }>): string {
  const employer = `<p><a href="${LANDING_EMPLOYER_LINK.href}">${escapeHtml(LANDING_EMPLOYER_LINK.label)}</a> — ${escapeHtml(LANDING_EMPLOYER_LINK.summary)}</p>`;
  const guides = `<h2>Guides</h2><ul>${LANDING_GUIDES.map(item => `<li><a href="${item.href}">${escapeHtml(item.label)}</a> — ${escapeHtml(item.summary)}</li>`).join("")}</ul>`;
  return `<main data-skipwait-snapshot="landing"><h1>${escapeHtml(LANDING_H1)}</h1><p>${escapeHtml(LANDING_SUMMARY)}</p><p><a href="/start">Request a private job referral</a> · <a href="/referrer">I work at a company and can help someone</a></p>${stepsSection("How job seekers use skipwait.me", LANDING_SEEKER_STEPS)}${stepsSection("How verified employees help", LANDING_EMPLOYEE_STEPS)}<h2>Private by default</h2><ul>${LANDING_COMMITMENTS.map(item => `<li><strong>${escapeHtml(item.title)}</strong> ${escapeHtml(item.body)}</li>`).join("")}</ul><h2>${escapeHtml(LANDING_FAQ_HEADING)}</h2><dl>${LANDING_FAQ.map(entry => `<dt>${escapeHtml(entry.question)}</dt><dd>${escapeHtml(entry.answer)}</dd>`).join("")}</dl><h2>Explore skipwait.me</h2><ul>${LANDING_EXPLORE.map(item => `<li><a href="${item.href}">${escapeHtml(item.label)}</a> — ${escapeHtml(item.summary)}</li>`).join("")}</ul>${guides}${employer}${homeLinks(policyLinks)}</main>`;
}

export type PublicSnapshot = { route: string; title: string; description: string; markup: string };

/**
 * Public screens whose React component needs a live session or API data, so
 * they are written here as plain text instead of being server-rendered.
 *
 * Nothing in a snapshot may list a live role, a count, or a person: real
 * listings reach crawlers through /sitemap.xml and the rendered page. These
 * pages have no React component to carry a breadcrumb trail, so the build
 * prepends one.
 *
 * The outbound links below are load-bearing, not decoration: they are what stops
 * a screen from being reachable only from the home page. The link graph in
 * `prerenderOutput.test.ts` fails the build if any public route drops below
 * three unique inbound sources.
 */
export function publicSnapshots(): PublicSnapshot[] {
  const { pro, max } = SUBSCRIPTION_PLANS;
  return [
    {
      route: "/jobs",
      markup: `<main data-skipwait-snapshot="jobs"><h1>Browse roles worth a referral.</h1><p>Search published roles, save the ones you like, and request a private referral from a verified employee at the company. Referrers stay anonymous.</p><p><a href="/jobs">Open the role search</a> · <a href="/start">Request a referral for a role link you already have</a> · <a href="/wall">See openings employees published themselves</a></p></main>`,
    },
    {
      route: "/wall",
      markup: `<main data-skipwait-snapshot="wall"><h1>Internal openings shared by verified employees.</h1><p>Employees who verified a company email can publish a hiring signal for their own company: hiring now, or a walk-in event. Each opening shows the company domain, the role, and any shared details — never an employee name, a candidate name, or a resume.</p><p><a href="/wall">Open the Opportunity Wall</a> · <a href="/referrer">Verify a work email to publish one</a> · <a href="/jobs">Browse roles posted through a normal job board</a></p></main>`,
    },
    {
      route: "/premium",
      markup: `<main data-skipwait-snapshot="premium"><h1>Credits for $1 each. Never expire.</h1><p>Every account gets ${FREE_MONTHLY_ALLOWANCE} free referral requests every month. Extra credits cost $1 each (₹99 in India), never expire, and are only used when an employee accepts your request. Reviewing and accepting requests is always free for employees.</p><p><a href="/premium">Buy credits</a> · <a href="/plans">See monthly plans</a> · <a href="/pricing">See all prices</a> · <a href="/referrer">Employees review for free — verify a work email</a></p></main>`,
    },
    {
      route: "/plans",
      markup: `<main data-skipwait-snapshot="plans"><h1>Referral credits every month.</h1><p>The free plan keeps ${FREE_MONTHLY_ALLOWANCE} referral requests every month. ${escapeHtml(pro.label)} includes ${pro.monthlyAllowance} credits each month for ${escapeHtml(pro.prices.INR.display)} or ${escapeHtml(pro.prices.USD.display)}. ${escapeHtml(max.label)} includes ${max.monthlyAllowance} credits each month for ${escapeHtml(max.prices.INR.display)} or ${escapeHtml(max.prices.USD.display)}. Plans renew monthly until cancelled; access continues to the end of the paid month.</p><p><a href="/plans">Open plans</a> · <a href="/pricing">See all prices</a> · <a href="/refunds">Refunds &amp; cancellation</a></p></main>`,
    },
    {
      route: "/referrer",
      markup: `<main data-skipwait-snapshot="referrer"><h1>Verify a work email to review private referrals.</h1><p>Employees verify a company email with a one-time code, then see private referral requests for their own company only. Review the role, the resume, and the candidate’s note together, and choose whether to help. Reviewing and accepting are always free, and your identity stays hidden from the Job Seeker unless you accept.</p><p><a href="/referrer">Verify a work email</a> · <a href="/wall">See openings shared by verified employees</a> · <a href="/support">Support</a></p></main>`,
    },
    {
      route: "/employer",
      markup: `<main data-skipwait-snapshot="employer"><h1>Hire without the noise.</h1><p>Employer accounts sponsor open roles to the top of seeker feeds, unlock anonymized opt-in talent with credits, and manage a self-serve promotion budget. The job-seeker and employee referral loop stays free.</p><p><a href="/employer">Open the employer workspace</a> · <a href="/jobs">See the seeker side of the product</a> · <a href="/pricing">See prices</a> · <a href="/contact">Contact us</a></p></main>`,
    },
  ].map(snapshot => {
    const route = publicRoute(snapshot.route);
    if (!route) throw new Error(`prerender: ${snapshot.route} is not declared in @shared/publicRoutes`);
    return { ...snapshot, title: route.title, description: route.description };
  });
}

/** Public route -> the file Cloudflare Pages serves it from. `/` is index.html. */
function outputFileFor(dist: string, routePath: string): string {
  // Not `routePath.slice(1)`: for "/" that is "", which silently wrote a stray
  // dist/public/.html and left index.html as the empty shell.
  return routePath === "/" ? path.join(dist, "index.html") : path.join(dist, `${routePath.slice(1)}.html`);
}

export async function main(dist = path.resolve(import.meta.dirname, "../dist/public")) {
  (globalThis as { React?: typeof React }).React = React;
  const template = readFileSync(path.join(dist, "index.html"), "utf8");
  if (!/<div id="root">\s*<\/div>/.test(template)) throw new Error("prerender: #root placeholder not found in index.html");

  // Cloudflare Pages serves /terms from terms.html. A terms/index.html would
  // 308 to /terms/ instead, which is a redirect hop on every policy link.
  const write = (routePath: string, html: string, size: number) => {
    writeFileSync(outputFileFor(dist, routePath), html);
    console.log(`prerendered ${routePath} (${size} chars)`);
  };
  const require = (routePath: string) => {
    const route = publicRoute(routePath);
    if (!route) throw new Error(`prerender: ${routePath} is not declared in @shared/publicRoutes`);
    return route;
  };

  for (const page of PUBLIC_PAGES) {
    const { route: routePath, load, extraJsonLd } = page;
    const route = require(routePath);
    const { default: Component } = await load();
    // These components render their own breadcrumb trail (see PolicyPageShell).
    const markup = renderToStaticMarkup(<Router ssrPath={routePath}><Component /></Router>);
    write(routePath, renderPublicPage(template, route, markup, { extraJsonLd: extraJsonLd?.() }), markup.length);
  }

  for (const snapshot of publicSnapshots()) {
    const route = require(snapshot.route);
    write(snapshot.route, renderPublicPage(template, route, snapshot.markup, { prependBody: breadcrumbsHtml(route) }), snapshot.markup.length);
  }

  const policyLinks = PUBLIC_PAGES.map(page => ({ route: page.route, title: require(page.route).title }));
  const home = require("/");
  const landing = landingSnapshot(policyLinks);
  // The FAQ answers are printed in the snapshot above, so the markup describes
  // text a visitor can actually read on the page.
  write("/", renderPublicPage(template, home, landing, { extraJsonLd: [faqJsonLd(LANDING_FAQ)] }), landing.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main().catch(error => { console.error(error); process.exit(1); });