// Per-route SEO: titles, descriptions, canonical URLs, and structured data.
// Single-page apps ship one <head>; without this every route is titled the
// same and search engines index the shell instead of the page.
//
// Titles, descriptions and canonical URLs are declared per route in
// @shared/publicRoutes so the <head> a crawler reads cannot drift from the
// no-JavaScript HTML the build writes.
import { breadcrumbJsonLd } from "@shared/publicRoutes";

const SITE = "https://skipwait.me";
const SUFFIX = " · skipwait.me";
const JSON_LD_MARKER = "data-skipwait-jsonld";

/**
 * The path whose <head> was last written by a PAGE, not by the route-level
 * fallback.
 *
 * A page that owns dynamic metadata -- a company page naming the company, a job
 * list carrying JobPosting structured data -- must win over the registry's
 * static entry. React runs child effects before parent effects, so the route
 * handler always runs AFTER the page and would otherwise overwrite it. Recording
 * which path a page claimed lets the handler tell "nobody set this" apart from
 * "the page already set it", without either side needing to know about the
 * other.
 */
let claimedPath: string | null = null;

/** True when a page component has already written the head for this path. */
export function seoClaimedByPage(path: string): boolean {
  return claimedPath === path;
}

function upsertMeta(attribute: "name" | "property", key: string, content: string) {
  if (typeof document === "undefined") return;
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!tag) { tag = document.createElement("meta"); tag.setAttribute(attribute, key); document.head.appendChild(tag); }
  tag.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  if (typeof document === "undefined") return;
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
  link.href = href;
}

export function applySeo(input: { title?: string; description?: string; path?: string; jsonLd?: unknown; noindex?: boolean; claim?: boolean }) {
  if (typeof document === "undefined") return;
  const path = input.path ?? (typeof location !== "undefined" ? location.pathname : "/");
  // A page calling this with its own metadata claims the path, so the
  // route-level handler leaves it alone. Pass claim:false from the handler.
  if (input.claim !== false) claimedPath = path;
  const url = `${SITE}${path}`;
  const title = input.title ? `${input.title}${SUFFIX}` : "skipwait.me — Job Referrals";
  document.title = title;
  if (input.description) {
    upsertMeta("name", "description", input.description);
    upsertMeta("property", "og:description", input.description);
  }
  upsertMeta("property", "og:title", title);
  upsertMeta("property", "og:url", url);
  upsertCanonical(url);

  // A path absent from PUBLIC_ROUTES is an app or internal screen, and the
  // registry's own contract is that it is "not a page we ask a crawler to
  // index". Saying that in the document is what makes it true: without the tag,
  // a crawler that reaches /settings or /admin through a link indexes whatever
  // the shell rendered. Set explicitly rather than by omission, and CLEARED on
  // the way back out -- a stale noindex left on a public page is worse than
  // none, because it de-indexes a page we do want found.
  upsertMeta("name", "robots", input.noindex ? "noindex,nofollow" : "index,follow");

  // Every script this module owns is tagged so a route change clears all of
  // them. A route's own structured data and its breadcrumb trail are separate
  // blocks, so a shared id would leave a stale duplicate in the head.
  document.querySelectorAll(`script[${JSON_LD_MARKER}]`).forEach(stale => stale.remove());
  const crumbs = breadcrumbJsonLd(path);
  const blocks: Array<{ id: string; data: unknown }> = [
    ...(crumbs ? [{ id: "route-breadcrumb-jsonld", data: crumbs }] : []),
    ...(input.jsonLd ? [{ id: "route-jsonld", data: input.jsonLd }] : []),
  ];
  for (const block of blocks) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = block.id;
    script.setAttribute(JSON_LD_MARKER, block.id);
    script.textContent = JSON.stringify(block.data);
    document.head.appendChild(script);
  }
}

/** Structured data for a list of publicly listed roles. */
export function jobsJsonLd(jobs: Array<{ id: number; title: string; company: string; location?: string; seniority?: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: jobs.slice(0, 50).map((job, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "JobPosting",
        title: job.title,
        hiringOrganization: { "@type": "Organization", name: job.company },
        jobLocation: job.location ? { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.location } } : undefined,
        employmentType: job.seniority || undefined,
        url: `${SITE}/jobs?job=${job.id}`,
        datePosted: new Date().toISOString().slice(0, 10),
      },
    })),
  };
}

/**
 * FAQ structured data. Only pass entries that are rendered as visible page
 * copy; search engines reject FAQ markup for questions a visitor cannot read.
 */
export function faqJsonLd(entries: ReadonlyArray<{ question: string; answer: string }>) {
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
