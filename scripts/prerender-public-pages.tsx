/**
 * Build step: write static HTML for the public pages and the landing page so
 * crawlers that don't run JavaScript (search engines, payment-provider website
 * reviews) see the real text instead of an empty shell. The SPA still mounts
 * over it.
 *
 * Output: dist/public/<route>.html plus a rewritten index.html (Cloudflare
 * Pages serves those before the SPA fallback). Policy pages render from their
 * React components; public screens that need a session or live API data render
 * from @shared/landingContent instead, so the no-JavaScript text cannot drift
 * from the copy the product renders.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { FREE_MONTHLY_ALLOWANCE, SUBSCRIPTION_PLANS } from "../shared/subscriptionPlans";
import { LANDING_COMMITMENTS, LANDING_EMPLOYEE_STEPS, LANDING_EXPLORE, LANDING_H1, LANDING_SEEKER_STEPS, LANDING_SUMMARY, LANDING_TITLE, type LandingStep } from "../shared/landingContent";

// Page modules use the classic JSX runtime (global React) under tsx, so they
// load lazily after React is on globalThis.
export const PUBLIC_PAGES: { route: string; title: string; load: () => Promise<{ default: React.ComponentType }> }[] = [
  { route: "/terms", title: "Terms of Service", load: () => import("../client/src/pages/Terms") },
  { route: "/privacy", title: "Privacy Policy", load: () => import("../client/src/pages/TrustPrivacy") },
  { route: "/refunds", title: "Refunds & Cancellation", load: () => import("../client/src/pages/RefundPolicy") },
  { route: "/cancellations", title: "Cancellation Policy", load: () => import("../client/src/pages/CancellationPolicy") },
  { route: "/shipping", title: "Shipping & Delivery", load: () => import("../client/src/pages/ShippingPolicy") },
  { route: "/about", title: "About Us", load: () => import("../client/src/pages/About") },
  { route: "/contact", title: "Contact Us", load: () => import("../client/src/pages/Contact") },
  { route: "/pricing", title: "Pricing", load: () => import("../client/src/pages/Pricing") },
  { route: "/support", title: "Support", load: () => import("../client/src/pages/Support") },
];

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Rewrite the SPA shell for one public route: title, canonical, share copy, and
 * the crawlable body. Replacements use functions so `$` inside rendered prices
 * ("$7/month") is never treated as a substitution pattern.
 */
export function renderPublicPage(template: string, route: string, title: string, markup: string, description?: string) {
  const fullTitle = `${title} — skipwait.me`;
  const canonical = `https://skipwait.me${route === "/" ? "/" : route}`;
  let html = template
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(fullTitle)}</title>`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, () => `<link rel="canonical" href="${canonical}" />`)
    .replace(/<div id="root">\s*<\/div>/, () => `<div id="root">${markup}</div>`);
  if (description) {
    html = html
      .replace(/<meta name="description" content="[^"]*"\s*\/?>/, () => `<meta name="description" content="${escapeHtml(description)}" />`)
      .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, () => `<meta property="og:title" content="${escapeHtml(fullTitle)}" />`)
      .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, () => `<meta property="og:description" content="${escapeHtml(description)}" />`)
      .replace(/<meta property="og:url" content="[^"]*"\s*\/?>/, () => `<meta property="og:url" content="${canonical}" />`)
      .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/, () => `<meta name="twitter:title" content="${escapeHtml(fullTitle)}" />`)
      .replace(/<meta name="twitter:description" content="[^"]*"\s*\/?>/, () => `<meta name="twitter:description" content="${escapeHtml(description)}" />`);
  }
  return html;
}

export function homeLinks() {
  const items = PUBLIC_PAGES.map(p => `<li><a href="${p.route}">${escapeHtml(p.title)}</a></li>`).join("");
  return `<nav aria-label="skipwait.me policies"><ul>${items}</ul></nav>`;
}

function stepsSection(heading: string, steps: readonly LandingStep[]) {
  return `<h2>${escapeHtml(heading)}</h2><ol>${steps.map(step => `<li><strong>${escapeHtml(step.title)}</strong> ${escapeHtml(step.body)}</li>`).join("")}</ol>`;
}

/**
 * The landing page as plain HTML for crawlers that never run JavaScript. Every
 * string comes from @shared/landingContent, which the React landing page also
 * renders, so this snapshot cannot promise something the product does not show.
 */
export function landingSnapshot() {
  return `<main data-skipwait-snapshot="landing"><h1>${escapeHtml(LANDING_H1)}</h1><p>${escapeHtml(LANDING_SUMMARY)}</p><p><a href="/start">Request a private job referral</a> · <a href="/referrer">I work at a company and can help someone</a></p>${stepsSection("How job seekers use skipwait.me", LANDING_SEEKER_STEPS)}${stepsSection("How verified employees help", LANDING_EMPLOYEE_STEPS)}<h2>Private by default</h2><ul>${LANDING_COMMITMENTS.map(item => `<li><strong>${escapeHtml(item.title)}</strong> ${escapeHtml(item.body)}</li>`).join("")}</ul><h2>Explore skipwait.me</h2><ul>${LANDING_EXPLORE.map(item => `<li><a href="${item.href}">${escapeHtml(item.label)}</a> — ${escapeHtml(item.summary)}</li>`).join("")}</ul>${homeLinks()}</main>`;
}

export type PublicSnapshot = { route: string; title: string; description: string; markup: string };

/**
 * Public screens whose React component needs a live session or API data, so
 * they are written here as plain text instead of being server-rendered.
 *
 * Nothing in a snapshot may list a live role, a count, or a person: real
 * listings reach crawlers through /sitemap.xml and the rendered page.
 */
export function publicSnapshots(): PublicSnapshot[] {
  const { pro, max } = SUBSCRIPTION_PLANS;
  return [
    {
      route: "/jobs",
      title: "Browse roles worth a referral",
      description: "Search published roles, save the ones you like, and request a private referral from a verified employee at that company.",
      markup: `<main data-skipwait-snapshot="jobs"><h1>Browse roles worth a referral.</h1><p>Search published roles, save the ones you like, and request a private referral from a verified employee at the company. Referrers stay anonymous.</p><p><a href="/jobs">Open the role search</a> · <a href="/start">Request a referral for a role link you already have</a></p></main>`,
    },
    {
      route: "/wall",
      title: "Internal openings shared by verified employees",
      description: "Hiring-now roles and walk-in events published privately by verified employees, with the company domain and the role details.",
      markup: `<main data-skipwait-snapshot="wall"><h1>Internal openings shared by verified employees.</h1><p>Employees who verified a company email can publish a hiring signal for their own company: hiring now, or a walk-in event. Each opening shows the company domain, the role, and any shared details — never an employee name, a candidate name, or a resume.</p><p><a href="/wall">Open the Opportunity Wall</a> · <a href="/referrer">Verify a work email to publish one</a></p></main>`,
    },
    {
      route: "/premium",
      title: "Buy referral credits for $1 each",
      description: "Every account gets free referral requests each month. Extra credits cost $1 each (₹99 in India), never expire, and are used only when an employee accepts a request.",
      markup: `<main data-skipwait-snapshot="premium"><h1>Credits for $1 each. Never expire.</h1><p>Every account gets ${FREE_MONTHLY_ALLOWANCE} free referral requests every month. Extra credits cost $1 each (₹99 in India), never expire, and are only used when an employee accepts your request. Reviewing and accepting requests is always free for employees.</p><p><a href="/premium">Buy credits</a> · <a href="/plans">See monthly plans</a> · <a href="/pricing">See all prices</a></p></main>`,
    },
    {
      route: "/plans",
      title: "Monthly referral plans",
      description: "Pro and Max monthly plans add referral credits each month on top of the free allowance. Cancel any time.",
      markup: `<main data-skipwait-snapshot="plans"><h1>Referral credits every month.</h1><p>The free plan keeps ${FREE_MONTHLY_ALLOWANCE} referral requests every month. ${escapeHtml(pro.label)} includes ${pro.monthlyAllowance} credits each month for ${escapeHtml(pro.prices.INR.display)} or ${escapeHtml(pro.prices.USD.display)}. ${escapeHtml(max.label)} includes ${max.monthlyAllowance} credits each month for ${escapeHtml(max.prices.INR.display)} or ${escapeHtml(max.prices.USD.display)}. Plans renew monthly until cancelled; access continues to the end of the paid month.</p><p><a href="/plans">Open plans</a> · <a href="/pricing">See all prices</a> · <a href="/refunds">Refunds &amp; cancellation</a></p></main>`,
    },
    {
      route: "/referrer",
      title: "Verify a work email to review private referrals",
      description: "Employees verify a company email once, then review private referral requests for their own company and choose whether to help.",
      markup: `<main data-skipwait-snapshot="referrer"><h1>Verify a work email to review private referrals.</h1><p>Employees verify a company email with a one-time code, then see private referral requests for their own company only. Review the role, the resume, and the candidate’s note together, and choose whether to help. Reviewing and accepting are always free, and your identity stays hidden from the Job Seeker unless you accept.</p><p><a href="/referrer">Verify a work email</a> · <a href="/wall">See openings shared by verified employees</a> · <a href="/support">Support</a></p></main>`,
    },
    {
      route: "/employer",
      title: "Hire on skipwait.me",
      description: "Sponsor roles to opt-in job seekers, unlock anonymized opt-in talent, and manage a self-serve promotion budget.",
      markup: `<main data-skipwait-snapshot="employer"><h1>Hire without the noise.</h1><p>Employer accounts sponsor open roles to the top of seeker feeds, unlock anonymized opt-in talent with credits, and manage a self-serve promotion budget. The job-seeker and employee referral loop stays free.</p><p><a href="/employer">Open the employer workspace</a> · <a href="/pricing">See prices</a> · <a href="/contact">Contact us</a></p></main>`,
    },
  ];
}

async function main() {
  (globalThis as { React?: typeof React }).React = React;
  const dist = path.resolve(import.meta.dirname, "../dist/public");
  const template = readFileSync(path.join(dist, "index.html"), "utf8");
  if (!/<div id="root">\s*<\/div>/.test(template)) throw new Error("prerender: #root placeholder not found in index.html");
  for (const { route, title, load } of PUBLIC_PAGES) {
    const { default: Component } = await load();
    const markup = renderToStaticMarkup(<Router ssrPath={route}><Component /></Router>);
    // Cloudflare Pages serves /terms from terms.html (a terms/index.html would 308 to /terms/).
    writeFileSync(path.join(dist, `${route.slice(1)}.html`), renderPublicPage(template, route, title, markup));
    console.log(`prerendered ${route} (${markup.length} chars)`);
  }
  for (const snapshot of publicSnapshots()) {
    writeFileSync(path.join(dist, `${snapshot.route.slice(1)}.html`), renderPublicPage(template, snapshot.route, snapshot.title, snapshot.markup, snapshot.description));
    console.log(`prerendered ${snapshot.route} (${snapshot.markup.length} chars)`);
  }
  const landing = landingSnapshot();
  writeFileSync(path.join(dist, "index.html"), renderPublicPage(template, "/", LANDING_TITLE, landing, LANDING_SUMMARY));
  console.log(`prerendered / (${landing.length} chars)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main().catch(error => { console.error(error); process.exit(1); });
