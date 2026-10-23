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
import { GOAL_FOOTER_COLS, GOAL_LANDING_BAND_H2, GOAL_LANDING_BAND_LEAD, GOAL_LANDING_COMPARE_H2, GOAL_LANDING_COMPARE_ROWS, GOAL_LANDING_EMPLOYEE_H2, GOAL_LANDING_EMPLOYEE_LEAD, GOAL_LANDING_EXPLORE_NOTE, GOAL_LANDING_FAIR_H2, GOAL_LANDING_FIGURES_HREF, GOAL_LANDING_FIGURES_TEXT, GOAL_LANDING_H1, GOAL_LANDING_HERO_LEAD, GOAL_LANDING_QUOTE, GOAL_LANDING_QUOTE_LEAD, GOAL_LANDING_QUOTE_REST, GOAL_LANDING_STEPS_H2, GOAL_LANDING_TRUST_H2_PARTS, goalLandingFairRules, goalLandingSteps, goalLandingTrust, LANDING_EMPLOYER_LINK, LANDING_EXPLORE, LANDING_GUIDES } from "../shared/landingContent";
import { publicRoute } from "../shared/publicRoutes";
import { GUIDES } from "../client/src/content/guides";
import { LAUNCH_COMPANY_SEED } from "../shared/companyDirectorySeed";
import { breadcrumbsHtml, escapeHtml, faqJsonLd, homeLinks, renderPublicPage } from "./prerenderSeo";
import { BETA_BADGE_LABEL, BETA_NOTICE_LINE, BETA_NOTICE_LINK } from "../client/src/lib/betaNotice";

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
 *
 * The snapshot mirrors the released goal landing (GoalLandingV9) section by
 * section - same DOM shape and the same goal utility classes: on a slow or
 * blocked bundle the reveal failsafe paints this markup, and an unstyled text
 * wall swapping into the styled page is the D-048-fix-landing-load-flash bug.
 * The compiled goal stylesheet loads in the shell's <head>, so these classes
 * resolve before the bundle runs. The hero form is a real GET form, so the
 * company search also works with JavaScript disabled.
 */
export function landingSnapshot(policyLinks: ReadonlyArray<{ route: string; title: string }>): string {
  // The released landing is the goal page (goalSurfaces RELEASED: "home"), so
  // the snapshot shows ITS copy and layout. Cost wording is pinned to the
  // released build's flag state (VITE_ASK_LEVEL_COST unset); if D-132 ever
  // releases level cost, this line and the deployed flag flip together.
  const costCopy = askCostLanding(false);
  const h2Cls = "mt-4 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em] gdesk:text-[44px]";
  const wrapCls = "mx-auto max-w-[1120px] px-5 py-14 gdesk:px-8 gdesk:py-24";
  const kicker = (text: string) =>
    `<p class="flex items-center gap-2 font-g-mono text-[11px] font-medium uppercase tracking-[0.14em] text-g-ink-3"><span aria-hidden="true" class="inline-block size-1.5 rounded-full bg-g-ink"></span>${escapeHtml(text)}</p>`;
  const [noticePre, noticePost] = BETA_NOTICE_LINE.split(BETA_NOTICE_LINK.word);
  const header = `<header class="border-b border-g-hairline"><div class="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5 gdesk:px-8"><div class="flex items-center gap-2.5"><a href="/" aria-label="skipwait.me home" class="inline-flex items-center"><img src="/brand/lockup.svg" alt="SkipWait.me" class="h-[26px] w-auto" /></a><span class="inline-flex items-center rounded-[3px] border border-g-ink px-1.5 py-px text-[10px] uppercase tracking-[0.14em] text-g-ink" data-testid="beta-badge">${escapeHtml(BETA_BADGE_LABEL)}</span></div><nav class="hidden items-center gap-7 gdesk:flex" aria-label="Landing"><a href="#how" class="text-g-small font-medium text-g-ink-2 hover:text-g-ink">How it goes</a><a href="#rules" class="text-g-small font-medium text-g-ink-2 hover:text-g-ink">Fair rules</a><a href="/sign-in?intent=referrer" class="text-g-small font-medium text-g-ink-2 hover:text-g-ink">Join as a referrer</a><a href="/sign-in" class="text-g-small font-medium text-g-ink hover:underline underline-offset-4">Sign in</a></nav><a href="/sign-in" class="text-g-small font-medium gdesk:hidden">Sign in</a></div></header>`;
  const hero = `<section class="border-b border-g-hairline"><div class="mx-auto max-w-[1120px] px-5 pb-16 pt-14 gdesk:px-8 gdesk:pb-24 gdesk:pt-24">${kicker("Private job referrals")}<h1 class="mt-5 text-[56px] font-semibold leading-[0.98] tracking-[-0.045em] gdesk:text-[96px]">${escapeHtml(GOAL_LANDING_H1)}</h1><p class="mt-5 max-w-[520px] text-g-body leading-[1.6] text-g-ink-2">${escapeHtml(GOAL_LANDING_HERO_LEAD)}</p><form action="/explore" method="get" class="mt-8 flex max-w-[560px] flex-col gap-2 rounded-[14px] border border-g-hairline p-1.5 gdesk:flex-row gdesk:items-center" data-testid="goal-next-step"><label class="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] bg-g-surface-hover px-4"><svg viewBox="0 0 20 20" class="h-4 w-4 shrink-0 text-g-ink-3" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="9" r="6" /><path d="m14 14 3.5 3.5" stroke-linecap="round" /></svg><span class="sr-only">Search companies</span><input name="q" type="search" placeholder="Search companies" autocomplete="off" class="w-full min-w-0 bg-transparent text-g-small text-g-ink outline-none placeholder:text-g-ink-3" /></label><button type="submit" class="h-12 w-full shrink-0 rounded-[10px] bg-g-ink px-5 text-g-small font-semibold text-g-ink-inverse hover:bg-g-primary-hover gdesk:h-11 gdesk:w-auto">Find your company <span aria-hidden="true">&rarr;</span></button></form><p class="mt-3 text-[13px] text-g-ink-3">${escapeHtml(GOAL_LANDING_EXPLORE_NOTE)}</p><script>(function(){var i=document.querySelector('[data-skipwait-snapshot="landing"] input[name="q"]');if(!i)return;var sync=function(){window.__swLandingQuery=i.value;};i.addEventListener("input",sync);i.addEventListener("focus",function(){window.__swLandingFocus=true;});i.addEventListener("blur",function(){if(document.activeElement&&document.activeElement!==document.body)window.__swLandingFocus=false;});sync();var sc=function(){window.__swLandingScrollY=window.scrollY||window.pageYOffset||0;};window.addEventListener("scroll",sc,{passive:true});sc();})();</script><div class="mt-3"><p class="mt-3 text-g-meta text-g-ink-3" data-testid="beta-notice-line">${escapeHtml(noticePre)}<a href="${BETA_NOTICE_LINK.href}" class="underline decoration-g-control-edge underline-offset-[3px]">${escapeHtml(BETA_NOTICE_LINK.word)}</a>${escapeHtml(noticePost)}</p></div></div></section>`;
  const band = `<section class="bg-g-ink text-g-ink-inverse"><div class="mx-auto grid max-w-[1120px] items-center gap-10 px-5 py-14 gdesk:grid-cols-2 gdesk:px-8 gdesk:py-20"><div><p class="font-g-mono text-[11px] uppercase tracking-[0.14em] opacity-60">What you gain</p><h2 class="${h2Cls}">${escapeHtml(GOAL_LANDING_BAND_H2)}</h2><p class="mt-4 max-w-[440px] text-g-body leading-[1.6] opacity-70">${escapeHtml(GOAL_LANDING_BAND_LEAD)}</p></div><div class="justify-self-center"><img src="/brand/banner-take-d.jpg" alt="A new joiner shaking hands across a table" class="w-full max-w-[520px] rounded-[16px] object-cover" data-testid="goal-v9-banner" /></div></div></section>`;
  const compareRows = GOAL_LANDING_COMPARE_ROWS.map(([label, mass, referral]) =>
    `<div class="border-t border-g-hairline py-5"><div class="grid gap-3 gdesk:grid-cols-[140px_1fr_1fr] gdesk:gap-6"><span class="font-g-mono text-[13px] text-g-ink-3">${escapeHtml(label)}</span><p class="text-g-small leading-[1.6] text-g-ink-2"><span class="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3 gdesk:hidden">Mass applying: </span>${escapeHtml(mass)}</p><p class="text-g-small font-semibold leading-[1.6]"><span class="font-g-mono text-[11px] font-medium uppercase tracking-[0.14em] text-g-ink-3 gdesk:hidden">Referral: </span>${escapeHtml(referral)}</p></div></div>`
  ).join("");
  const figuresText = escapeHtml(GOAL_LANDING_FIGURES_TEXT).replace(
    "jobvite.com",
    `<a href="${GOAL_LANDING_FIGURES_HREF}" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">jobvite.com</a>`,
  );
  const compare = `<section class="border-b border-g-hairline"><div class="${wrapCls}">${kicker("Why not just apply?")}<h2 class="${h2Cls}">${escapeHtml(GOAL_LANDING_COMPARE_H2)}</h2><div class="mt-10"><div class="hidden grid-cols-[140px_1fr_1fr] gap-6 pb-3 gdesk:grid" aria-hidden="true"><span></span><span class="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">Mass applying</span><span class="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">One referral on skipwait.me</span></div>${compareRows}</div><div class="mt-10"><p class="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">The wait, to scale</p><div class="mt-4 space-y-3"><div><div class="h-3 rounded-full bg-g-hairline" style="width:100%"></div><p class="mt-1.5 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">39-55 days - job boards &amp; career sites</p></div><div><div class="h-3 rounded-full bg-g-ink" style="width:52.7%"></div><p class="mt-1.5 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink">About 29 days - referred candidates</p></div></div></div><div><p class="mt-8 text-g-small leading-[1.6] text-g-ink-3">${figuresText}</p><p class="mt-4 text-g-body font-semibold">${escapeHtml(GOAL_LANDING_QUOTE)}</p></div></div></section>`;
  const steps = goalLandingSteps(costCopy).map((step, index) =>
    `<li><div class="border-t-2 border-g-ink pt-6"><span class="font-g-mono text-[13px] text-g-ink-3" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><h3 class="mt-3 text-[17px] font-semibold">${escapeHtml(step.title)}</h3><p class="mt-2 text-g-small leading-[1.6] text-g-ink-2">${escapeHtml(step.body)}</p></div></li>`
  ).join("");
  const stepsSection = `<section id="how" class="border-b border-g-hairline"><div class="${wrapCls}">${kicker("How it goes")}<h2 class="${h2Cls}">${escapeHtml(GOAL_LANDING_STEPS_H2)}</h2><ol class="mt-10 grid gap-8 gdesk:grid-cols-3 gdesk:gap-10">${steps}</ol></div></section>`;
  const quote = `<section class="border-b border-g-hairline"><div class="mx-auto max-w-[760px] px-5 py-16 text-center gdesk:py-28"><blockquote class="text-[26px] font-semibold leading-[1.25] tracking-[-0.02em] gdesk:text-[36px]">&ldquo;${escapeHtml(GOAL_LANDING_QUOTE_LEAD)} <span class="text-g-ink-3">${escapeHtml(GOAL_LANDING_QUOTE_REST)}&rdquo;</span></blockquote><p class="mt-6 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">The honest deal &mdash; on every page, in every flow</p></div></section>`;
  const trust = goalLandingTrust(costCopy).map(item =>
    `<div class="rounded-[12px] border border-g-hairline p-5">` +
    (item.blue
      ? `<span data-testid="goal-verified-mark" class="flex items-center gap-1.5 text-g-meta text-g-trust text-g-small font-semibold"><svg aria-hidden="true" class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.5 2.5 4.5-4.5" /></svg>${escapeHtml(item.title)}</span>`
      : `<span class="mt-1 block h-1.5 w-1.5 rounded-full bg-g-ink" aria-hidden="true"></span><h3 class="mt-3 text-[15px] font-semibold">${escapeHtml(item.title)}</h3>`) +
    `<p class="mt-1.5 text-g-small leading-[1.6] text-g-ink-2">${escapeHtml(item.body)}</p></div>`
  ).join("");
  const trustSection = `<section class="border-b border-g-hairline"><div class="${wrapCls}">${kicker("Why you can trust it")}<h2 class="${h2Cls}">${escapeHtml(GOAL_LANDING_TRUST_H2_PARTS[0])}<br />${escapeHtml(GOAL_LANDING_TRUST_H2_PARTS[1])}</h2><div class="mt-10 grid gap-4 gdesk:grid-cols-3">${trust}</div></div></section>`;
  const askCardArt = `<div aria-hidden="true" class="rounded-g-sheet border border-g-control-edge p-5"><div class="flex items-center gap-3"><svg viewBox="0 0 24 24" class="size-6" focusable="false"><circle cx="12" cy="8" r="4" fill="#0A0A0A" /><path d="M4 21 a8 6 0 0 1 16 0 Z" fill="#0A0A0A" /></svg><div class="flex-1"><div class="h-2 w-3/4 rounded-full bg-g-ink"></div><div class="mt-2 h-2 w-1/2 rounded-full bg-g-ink-3"></div></div></div><div class="mt-4 flex items-center gap-2"><span class="rounded-[3px] bg-g-ink px-3 py-1 font-g-mono text-[11px] font-medium text-g-on-primary">Accept</span><span class="rounded-[3px] border border-g-control-edge px-3 py-1 font-g-mono text-[11px] font-medium text-g-ink-2">Pass</span></div><p class="mt-3 text-center font-g-mono text-[10px] uppercase tracking-[0.14em] text-g-ink-3">Always free for referrers</p></div>`;
  const employee = `<section class="border-b border-g-hairline"><div class="mx-auto grid max-w-[1120px] items-center gap-10 px-5 py-14 gdesk:grid-cols-2 gdesk:px-8 gdesk:py-24"><div>${kicker("For employees")}<h2 class="${h2Cls}">${escapeHtml(GOAL_LANDING_EMPLOYEE_H2)}</h2><p class="mt-4 max-w-[440px] text-g-body leading-[1.6] text-g-ink-2">${escapeHtml(GOAL_LANDING_EMPLOYEE_LEAD)}</p><a href="/referrer" class="mt-6 inline-flex h-11 items-center gap-2 rounded-full border border-g-ink px-5 text-g-small font-semibold hover:bg-g-surface-hover">Join as a referrer <span aria-hidden="true">&rarr;</span></a></div><div class="justify-self-center">${askCardArt}</div></div></section>`;
  const fairRules = goalLandingFairRules(costCopy).map((rule, index) =>
    `<div class="flex items-baseline gap-6 border-t border-g-hairline py-5"><span class="font-g-mono text-[13px] text-g-ink-3">${String(index + 1).padStart(2, "0")}</span><p class="text-g-body leading-[1.6] text-g-ink-2">${escapeHtml(rule)}</p></div>`
  ).join("");
  const fair = `<section id="rules" class="border-b border-g-hairline"><div class="${wrapCls}">${kicker("Fair rules")}<h2 class="${h2Cls}">${escapeHtml(GOAL_LANDING_FAIR_H2)}</h2><div class="mt-10">${fairRules}</div></div></section>`;
  const footerCols = GOAL_FOOTER_COLS.map(col =>
    `<nav aria-label="${escapeHtml(col.title)}"><h3 class="font-g-mono text-[11px] uppercase tracking-[0.14em] opacity-60">${escapeHtml(col.title)}</h3><ul class="mt-4 space-y-2.5">${col.links.map(([href, label]) => `<li><a href="${href}" class="text-g-small opacity-70 hover:opacity-100">${escapeHtml(label)}</a></li>`).join("")}</ul></nav>`
  ).join("");
  const footer = `<footer class="bg-g-ink text-g-ink-inverse"><div class="mx-auto grid max-w-[1120px] gap-10 px-5 py-12 gdesk:grid-cols-[1.4fr_1fr_1fr_1fr] gdesk:px-8 gdesk:py-16"><div><img src="/brand/lockup-dark.svg" alt="SkipWait.me" class="h-[22px] w-auto" /><p class="mt-4 max-w-[260px] text-g-small leading-[1.6] opacity-70">A warmer way in. Private job referrals from verified employees. skipwait.me is in beta.</p></div>${footerCols}</div><div class="border-t border-g-ink-3/30"><div class="mx-auto flex max-w-[1120px] items-center justify-between px-5 py-5 text-[13px] opacity-60 gdesk:px-8"><span>skipwait.me</span><span>Made with care, in beta.</span></div></div></footer>`;
  // Crawler-only link graph: routes the goal landing does not render visually
  // (the explore directory, the guides, the employer pitch, the policy index).
  // Screen-reader-only so the first paint matches the live page; the links
  // stay readable to crawlers and assistive tech. Explore summaries stay out
  // (stale money wording pending the D-132 audit); guide summaries are clean.
  const exploreLinks = LANDING_EXPLORE.map(item => `<li><a href="${item.href}">${escapeHtml(item.label)}</a></li>`).join("");
  const guides = LANDING_GUIDES.map(item => `<li><a href="${item.href}">${escapeHtml(item.label)}</a> — ${escapeHtml(item.summary)}</li>`).join("");
  const crawlerLinks = `<nav aria-label="More of skipwait.me" class="sr-only"><h2>Explore skipwait.me</h2><ul>${exploreLinks}</ul><h2>Guides</h2><ul>${guides}</ul><p><a href="${LANDING_EMPLOYER_LINK.href}">${escapeHtml(LANDING_EMPLOYER_LINK.label)}</a> — ${escapeHtml(LANDING_EMPLOYER_LINK.summary)}</p></nav><div class="sr-only">${homeLinks(policyLinks)}</div>`;
  return `<main data-skipwait-snapshot="landing" class="min-h-screen bg-white font-g-sans text-g-ink">${header}${hero}${band}${compare}${stepsSection}${quote}${trustSection}${employee}${fair}${footer}${crawlerLinks}</main>`;
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