/**
 * The sitemap's single source of truth. Two surfaces serve it:
 *  - the API container (skipwait.me/sitemap.xml, direct DB reads), and
 *  - the Pages Function fallback (functions/sitemap.xml.ts, API fetch).
 * Both build the XML through buildSitemapXml so they can never drift.
 */
export const SITEMAP_STATIC_ROUTES: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/wall", changefreq: "hourly", priority: "0.9" },
  { path: "/jobs", changefreq: "daily", priority: "0.9" },
  { path: "/explore", changefreq: "weekly", priority: "0.7" },
  { path: "/premium", changefreq: "weekly", priority: "0.7" },
  { path: "/plans", changefreq: "weekly", priority: "0.6" },
  { path: "/pricing", changefreq: "weekly", priority: "0.6" },
  { path: "/referrer", changefreq: "weekly", priority: "0.6" },
  { path: "/employer", changefreq: "monthly", priority: "0.4" },
  { path: "/job-referral-platforms", changefreq: "monthly", priority: "0.6" },
  { path: "/choosing-a-job-referral-platform", changefreq: "monthly", priority: "0.6" },
  { path: "/how-employees-refer-candidates", changefreq: "monthly", priority: "0.6" },
  { path: "/about", changefreq: "monthly", priority: "0.4" },
  { path: "/contact", changefreq: "monthly", priority: "0.4" },
  { path: "/privacy", changefreq: "monthly", priority: "0.3" },
  { path: "/terms", changefreq: "monthly", priority: "0.3" },
  { path: "/refunds", changefreq: "monthly", priority: "0.3" },
  { path: "/cancellations", changefreq: "monthly", priority: "0.3" },
  { path: "/shipping", changefreq: "monthly", priority: "0.3" },
  { path: "/support", changefreq: "monthly", priority: "0.3" },
];

export type SitemapEntry = { loc: string; changefreq: string; priority: string; lastmod?: string };

export function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[character] as string));
}

/**
 * The live note keeps the dynamic reads honest: one curl shows exactly how
 * many jobs/companies were listed and from where, instead of a silent drop.
 */
export function buildSitemapXml(entries: SitemapEntry[], liveNote: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- live: ${liveNote} -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(entry => `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n${entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>\n` : ""}    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`).join("\n")}\n</urlset>\n`;
}

/** Job detail entries; only URLs with a numeric id, lastmod when the row has one. */
export function jobSitemapEntries(origin: string, jobs: Array<{ id?: number; updatedAt?: string | Date | null }>): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  for (const job of jobs) {
    if (typeof job.id !== "number") continue;
    const entry: SitemapEntry = { loc: `${origin}/jobs?job=${job.id}`, changefreq: "weekly", priority: "0.6" };
    const updatedAt = job.updatedAt instanceof Date ? job.updatedAt.toISOString() : typeof job.updatedAt === "string" ? job.updatedAt : null;
    if (updatedAt && /^\d{4}-\d{2}-\d{2}/.test(updatedAt)) entry.lastmod = updatedAt.slice(0, 10);
    entries.push(entry);
  }
  return entries;
}

/** Listed company pages (/explore/<slug>): every card is an anchor a crawler can follow. */
export function companySitemapEntries(origin: string, companies: Array<{ slug?: string }>): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  for (const company of companies) {
    if (typeof company.slug !== "string" || company.slug.length === 0) continue;
    entries.push({ loc: `${origin}/explore/${encodeURIComponent(company.slug)}`, changefreq: "weekly", priority: "0.7" });
  }
  return entries;
}
