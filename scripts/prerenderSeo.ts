/**
 * Head and body rewriting for the no-JavaScript HTML the build writes.
 *
 * The SPA ships one `index.html`, so without this every route would carry the
 * home page's title, description, and `og:url`. Google, and every chat engine
 * that fetches a URL to answer a question, read this file rather than running
 * the bundle — which is why the structured data is written here as literal
 * markup instead of being left to `client/src/lib/seo.ts`.
 *
 * Every value comes from the route's own `PublicRoute`, so a route cannot be
 * emitted with a missing or stale description.
 */
import { breadcrumbsFor, canonicalUrl, type PublicRoute } from "../shared/publicRoutes";

export const escapeHtml = (value: string): string => value.replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!);

/** The policy cross-links the home page and every snapshot ends on. */
export function homeLinks(routes: ReadonlyArray<{ route: string; title: string }>): string {
  const items = routes.map(route => `<li><a href="${route.route}">${escapeHtml(route.title)}</a></li>`).join("");
  return `<nav aria-label="skipwait.me policies"><ul>${items}</ul></nav>`;
}

/** Visible `Home > Page` trail. The public tree is flat, so two levels is all. */
export function breadcrumbsHtml(route: PublicRoute): string {
  const trail = breadcrumbsFor(route);
  if (trail.length < 2) return "";
  const items = trail
    .map((crumb, index) => {
      const label = escapeHtml(crumb.label);
      if (index === trail.length - 1) return `<li aria-current="page">${label}</li>`;
      return `<li><a href="${crumb.path}">${label}</a></li>`;
    })
    .join("");
  return `<nav aria-label="Breadcrumb"><ol style="display:flex;gap:.5rem;flex-wrap:wrap;list-style:none;margin:0 0 1rem;padding:0;font-size:.8125rem">${items}</ol></nav>`;
}

export function breadcrumbJsonLd(route: PublicRoute): Record<string, unknown> | undefined {
  const trail = breadcrumbsFor(route);
  if (trail.length < 2) return undefined;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.label,
      item: canonicalUrl(crumb.path),
    })),
  };
}

export function faqJsonLd(entries: ReadonlyArray<{ question: string; answer: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map(entry => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

/**
 * Structured data for one public route. `WebPage` names the page itself so the
 * breadcrumb trail and the page agree on identity.
 */
export function pageJsonLd(route: PublicRoute, extra: ReadonlyArray<Record<string, unknown>>): Record<string, unknown>[] {
  const graph: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${canonicalUrl(route.route)}#webpage`,
      url: canonicalUrl(route.route),
      name: route.title,
      description: route.description,
      isPartOf: { "@id": "https://skipwait.me/#website" },
      inLanguage: "en",
    },
  ];
  const crumbs = breadcrumbJsonLd(route);
  if (crumbs) graph.push(crumbs);
  graph.push(...extra);
  return graph;
}

/**
 * `data-skipwait-jsonld` is the marker @client/src/lib/seo.ts owns: its route
 * change removes every script carrying it before adding the current route's.
 * Tagging the prerendered block is what stops the head holding two
 * BreadcrumbList blocks after hydration — one written here, one written by
 * applySeo — and lets the client own the markup from then on.
 */
function jsonLdScript(data: ReadonlyArray<Record<string, unknown>>): string {
  return `<script type="application/ld+json" data-skipwait-jsonld="prerender">${JSON.stringify(data)}</script>`;
}

/**
 * Rewrite the SPA shell for one public route: title, description, canonical,
 * share copy, page structured data, and the crawlable body.
 *
 * Replacements use functions so a `$` inside rendered prices ("$7/month") is
 * never treated as a substitution pattern.
 */
export function renderPublicPage(
  template: string,
  route: PublicRoute,
  markup: string,
  options: { prependBody?: string; extraJsonLd?: ReadonlyArray<Record<string, unknown>> } = {},
): string {
  const fullTitle = `${route.title} — skipwait.me`;
  const canonical = canonicalUrl(route.route);
  const description = escapeHtml(route.description);
  const escapedTitle = escapeHtml(fullTitle);

  let html = template
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapedTitle}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, () => `<meta name="description" content="${description}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, () => `<link rel="canonical" href="${canonical}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, () => `<meta property="og:title" content="${escapedTitle}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, () => `<meta property="og:description" content="${description}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/?>/, () => `<meta property="og:url" content="${canonical}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/, () => `<meta name="twitter:title" content="${escapedTitle}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/?>/, () => `<meta name="twitter:description" content="${description}" />`)
    .replace(/<div id="root">\s*<\/div>/, () => `<div id="root">${options.prependBody ?? ""}${markup}</div>`)
    .replace("</head>", () => `${jsonLdScript(pageJsonLd(route, options.extraJsonLd ?? []))}</head>`);

  return html;
}