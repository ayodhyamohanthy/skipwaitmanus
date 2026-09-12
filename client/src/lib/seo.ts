// Per-route SEO: titles, descriptions, canonical URLs, and structured data.
// Single-page apps ship one <head>; without this every route is titled the
// same and search engines index the shell instead of the page.
const SITE = "https://skipwait.me";
const SUFFIX = " · skipwait.me";

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

export function applySeo(input: { title?: string; description?: string; path?: string; jsonLd?: unknown }) {
  if (typeof document === "undefined") return;
  const path = input.path ?? (typeof location !== "undefined" ? location.pathname : "/");
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

  const existing = document.getElementById("route-jsonld");
  if (existing) existing.remove();
  if (input.jsonLd) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "route-jsonld";
    script.textContent = JSON.stringify(input.jsonLd);
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
