/**
 * Build step: write static HTML for the public policy/business pages so
 * crawlers that don't run JavaScript (payment-provider website reviews,
 * search engines) see the real text. The SPA still mounts over it.
 *
 * Output: dist/public/<route>.html (Cloudflare Pages serves these
 * before the SPA fallback). The home page gets a plain link list to them.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";

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
];

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function renderPublicPage(template: string, route: string, title: string, markup: string) {
  const fullTitle = `${title} — skipwait.me`;
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(fullTitle)}</title>`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="https://skipwait.me${route}" />`)
    .replace(/<div id="root">\s*<\/div>/, `<div id="root">${markup}</div>`);
}

export function homeLinks() {
  const items = PUBLIC_PAGES.map(p => `<li><a href="${p.route}">${escapeHtml(p.title)}</a></li>`).join("");
  return `<nav aria-label="skipwait.me policies"><ul>${items}<li><a href="/support">Support</a></li></ul></nav>`;
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
  writeFileSync(path.join(dist, "index.html"), template.replace(/<div id="root">\s*<\/div>/, `<div id="root">${homeLinks()}</div>`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main().catch(error => { console.error(error); process.exit(1); });
