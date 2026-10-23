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
import { askCostLanding, ASK_COST_SENTENCE, CREDIT_RULE, FREE_ASKS_CHIP, REFERRER_MONEY_SENTENCE } from "../shared/moneyCopy";
import { FREE_PLAN } from "../shared/planCatalog";
import { GOAL_LANDING_BAND_H2, GOAL_LANDING_BAND_LEAD, GOAL_LANDING_COMPARE_H2, GOAL_LANDING_COMPARE_ROWS, GOAL_LANDING_EMPLOYEE_H2, GOAL_LANDING_EMPLOYEE_LEAD, GOAL_LANDING_EXPLORE_NOTE, GOAL_LANDING_FAIR_H2, GOAL_LANDING_FIGURES_TEXT, GOAL_LANDING_H1, GOAL_LANDING_HERO_LEAD, GOAL_LANDING_QUOTE, GOAL_LANDING_STEPS_H2, GOAL_LANDING_TRUST_H2, goalLandingFairRules, goalLandingSteps, goalLandingTrust, LANDING_EMPLOYER_LINK, LANDING_EXPLORE, LANDING_GUIDES } from "../shared/landingContent";
import { publicRoute } from "../shared/publicRoutes";
import { GUIDES } from "../client/src/content/guides";
import { LAUNCH_COMPANY_SEED } from "../shared/companyDirectorySeed";
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

/**
 * The landing page as plain HTML for crawlers that never run JavaScript. Every
 * string comes from @shared/landingContent, which the React landing page also
 * renders, so this snapshot cannot promise something the product does not show.
 */
export function landingSnapshot(policyLinks: ReadonlyArray<{ route: string; title: string }>): string {
  // The released landing is the goal page (goalSurfaces RELEASED: "home"), so
  // the snapshot shows ITS copy: on a slow or blocked bundle the reveal
  // failsafe paints this snapshot, and painting the pre-goal landing is the
  // D-048-fix-landing-load-flash bug. Cost wording is pinned to the released
  // build's flag state (VITE_ASK_LEVEL_COST unset); if D-132 ever releases
  // level cost, this line and the deployed flag flip together.
  const costCopy = askCostLanding(false);
  const employer = `<p><a href="${LANDING_EMPLOYER_LINK.href}">${escapeHtml(LANDING_EMPLOYER_LINK.label)}</a> — ${escapeHtml(LANDING_EMPLOYER_LINK.summary)}</p>`;
  const guides = `<h2>Guides</h2><ul>${LANDING_GUIDES.map(item => `<li><a href="${item.href}">${escapeHtml(item.label)}</a> — ${escapeHtml(item.summary)}</li>`).join("")}</ul>`;
  const compare = GOAL_LANDING_COMPARE_ROWS.map(([label, mass, referral]) => `<p><strong>${escapeHtml(label)}</strong> Mass applying: ${escapeHtml(mass)} A referral on skipwait.me: ${escapeHtml(referral)}</p>`).join("");
  const steps = goalLandingSteps(costCopy).map(step => `<li><strong>${escapeHtml(step.title)}</strong> ${escapeHtml(step.body)}</li>`).join("");
  const trust = goalLandingTrust(costCopy).map(item => `<li><strong>${escapeHtml(item.title)}</strong> ${escapeHtml(item.body)}</li>`).join("");
  const fairRules = goalLandingFairRules(costCopy).map(rule => `<li>${escapeHtml(rule)}</li>`).join("");
  // Explore links are label-only: their summaries carry stale money wording
  // (an unverified "never expire", the paid-plans sentence) that the released
  // landing does not print and the D-132 audit has not cleared.
  const exploreLinks = `<h2>Explore skipwait.me</h2><ul>${LANDING_EXPLORE.map(item => `<li><a href="${item.href}">${escapeHtml(item.label)}</a></li>`).join("")}</ul>`;
  return `<main data-skipwait-snapshot="landing"><h1>${escapeHtml(GOAL_LANDING_H1)}</h1><p>${escapeHtml(GOAL_LANDING_HERO_LEAD)}</p><p><a href="/explore">Find your company</a> · <a href="/sign-in?intent=referrer">Join as a referrer</a> · <a href="/sign-in">Sign in</a></p><p>${escapeHtml(GOAL_LANDING_EXPLORE_NOTE)}</p><h2>${escapeHtml(GOAL_LANDING_BAND_H2)}</h2><p>${escapeHtml(GOAL_LANDING_BAND_LEAD)}</p><h2>${escapeHtml(GOAL_LANDING_COMPARE_H2)}</h2>${compare}<p>${escapeHtml(GOAL_LANDING_FIGURES_TEXT)}</p><h2>${escapeHtml(GOAL_LANDING_STEPS_H2)}</h2><ol>${steps}</ol><blockquote><p>${escapeHtml(GOAL_LANDING_QUOTE)}</p></blockquote><h2>${escapeHtml(GOAL_LANDING_TRUST_H2)}</h2><ul>${trust}</ul><h2>${escapeHtml(GOAL_LANDING_EMPLOYEE_H2)}</h2><p>${escapeHtml(GOAL_LANDING_EMPLOYEE_LEAD)}</p><p><a href="/referrer">Join as a referrer</a></p><h2>${escapeHtml(GOAL_LANDING_FAIR_H2)}</h2><ul>${fairRules}</ul>${exploreLinks}${guides}${employer}${homeLinks(policyLinks)}</main>`;
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
  return [
    {
      route: "/jobs",
      markup: `<main data-skipwait-snapshot="jobs"><h1>Browse roles worth a referral.</h1><p>Search published roles, save the ones you like, and request a private referral from a verified employee at the company. Referrers stay anonymous.</p><p><a href="/jobs">Open the role search</a> · <a href="/start">Request a referral for a role link you already have</a> · <a href="/wall">See openings employees published themselves</a> · <a href="/explore">Explore companies</a></p></main>`,
    },
    {
      // Kit /explore copy and the company directory's deterministic launch
      // seed (names and approved descriptors only, the rows migration 0076
      // inserts): no count, no availability, no role, no person, no address.
      // The live page then renders the server directory.
      route: "/explore",
      markup: `<main data-skipwait-snapshot="explore"><h1>Where would you love to work next?</h1><p>Start with a company. We’ll help you make a thoughtful ask.</p><ul>${LAUNCH_COMPANY_SEED.map(company => `<li><a href="/explore/${company.slug}">${escapeHtml(company.name)}</a> — ${escapeHtml(company.blurb)}</li>`).join("")}</ul><h2>Work at one of these companies?</h2><p>Open another door. You control every request you accept. <a href="/referrer">I can refer</a></p><p><a href="/jobs">Browse roles worth a referral</a> · <a href="/start">Request a referral for a role link you already have</a></p></main>`,
    },
    {
      route: "/wall",
      markup: `<main data-skipwait-snapshot="wall"><h1>Internal openings shared by verified employees.</h1><p>Employees who verified a company email can publish a hiring signal for their own company: hiring now, or a walk-in event. Each opening shows the company domain, the role, and any shared details — never an employee name, a candidate name, or a resume.</p><p><a href="/wall">Open the Opportunity Wall</a> · <a href="/referrer">Verify a work email to publish one</a> · <a href="/jobs">Browse roles posted through a normal job board</a> · <a href="/explore">Explore companies</a></p></main>`,
    },
    {
      route: "/premium",
      markup: `<main data-skipwait-snapshot="premium"><h1>Credits for $1 each. Never expire.</h1><p>${ASK_COST_SENTENCE} Extra credits cost $1 each (₹99 in India) and never expire. ${CREDIT_RULE} ${REFERRER_MONEY_SENTENCE}</p><p><a href="/premium">Buy credits</a> · <a href="/plans">See plans and credits</a> · <a href="/pricing">See all prices</a> · <a href="/referrer">Employees: verify a work email to review requests</a></p></main>`,
    },
    {
      route: "/plans",
      markup: `<main data-skipwait-snapshot="plans"><h1>Plans and credits.</h1><p>${FREE_PLAN.creditsPerMonth} referral requests are free every month, and up to ${FREE_PLAN.openRequests} can be open at once. More credits are sold on the credits page, and a credit you buy never expires. ${CREDIT_RULE} ${REFERRER_MONEY_SENTENCE}</p><p><a href="/plans">Open plans</a> · <a href="/premium">Buy credits</a> · <a href="/pricing">See all prices</a> · <a href="/refunds">Refunds &amp; cancellation</a></p></main>`,
    },
    {
      route: "/referrer",
      markup: `<main data-skipwait-snapshot="referrer"><h1>Verify a work email to review private referrals.</h1><p>Employees verify a company email with a one-time code, then see private referral requests for their own company only. Review the role, the resume, and the candidate’s note together, and choose whether to help. Reviewing and accepting never cost you anything, and your identity stays hidden from the Job Seeker unless you accept.</p><p><a href="/referrer">Verify a work email</a> · <a href="/wall">See openings shared by verified employees</a> · <a href="/explore">See the companies you can refer into</a> · <a href="/support">Support</a></p></main>`,
    },
    {
      route: "/employer",
      markup: `<main data-skipwait-snapshot="employer"><h1>Hire without the noise.</h1><p>Employer accounts feature open roles as a clearly labeled listing, unlock anonymized opt-in talent with credits, and manage a self-serve promotion budget. Employers never buy referrals: seekers get ${FREE_ASKS_CHIP} and use credits for more, and referrers are never paid.</p><p><a href="/employer">Open the employer workspace</a> · <a href="/jobs">See the seeker side of the product</a> · <a href="/pricing">See prices</a> · <a href="/contact">Contact us</a></p></main>`,
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
  // The goal landing prints no FAQ, so the home page carries no FAQPage markup
  // either: structured data may only describe text a visitor can actually read.
  write("/", renderPublicPage(template, home, landing), landing.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main().catch(error => { console.error(error); process.exit(1); });