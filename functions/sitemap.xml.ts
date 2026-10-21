// Dynamic sitemap for skipwait.me: public pages plus live jobs and
// opportunities, generated on each request from the API. Replaces the SPA
// HTML fallback that crawlers previously received at /sitemap.xml.
const DEFAULT_API_ORIGIN = "https://skipwait.me";

export const STATIC_ROUTES: Array<{ path: string; changefreq: string; priority: string }> = [
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

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[character] as string));
}

export const onRequest: PagesFunction<{ API_ORIGIN?: string }> = async (context) => {
  const origin = new URL(context.request.url).origin;
  const apiOrigin = context.env.API_ORIGIN || DEFAULT_API_ORIGIN;
  // Static routes omit <lastmod>: faking "today" on every request would make
  // crawlers re-validate static pages daily. Change dates only where the API
  // provides them; the sitemap stays honest and stable otherwise.
  const urls = STATIC_ROUTES.map(route => ({ loc: `${origin}${route.path}`, changefreq: route.changefreq, priority: route.priority }));

  // Live API reads must never fail silently: a sitemap that quietly drops
  // every job and company is worse than a loud one. Failures are logged and
  // stamped into the XML comment so a curl can see exactly what happened.
  const fetchJson = async (path: string, label: string): Promise<{ payload: Record<string, unknown> | null; note: string }> => {
    const url = `${apiOrigin}${path}`;
    try {
      const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "skipwait-sitemap/1.0 (+https://skipwait.me/sitemap.xml)" } });
      if (!response.ok) {
        console.error(`[sitemap] ${label} fetch failed: HTTP ${response.status} from ${url}`);
        return { payload: null, note: `http-${response.status}` };
      }
      return { payload: (await response.json()) as Record<string, unknown>, note: "ok" };
    } catch (error) {
      console.error(`[sitemap] ${label} fetch threw: ${error instanceof Error ? error.message : String(error)} (${url})`);
      return { payload: null, note: "threw" };
    }
  };

  // Only job detail URLs are listed. Opportunity Wall deep links
  // (/wall?opening=<id>) canonicalise back to /wall, so listing them would
  // spend crawl budget on near-duplicates of one page.
  const jobsRead = await fetchJson("/api/jobs", "jobs");
  let jobCount = 0;
  if (jobsRead.payload) {
    const payload = jobsRead.payload as { jobs?: Array<{ id?: number; updatedAt?: string }> };
    for (const job of payload.jobs ?? []) {
      if (typeof job.id !== "number") continue;
      const entry: { loc: string; changefreq: string; priority: string; lastmod?: string } = { loc: `${origin}/jobs?job=${job.id}`, changefreq: "weekly", priority: "0.6" };
      if (typeof job.updatedAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(job.updatedAt)) entry.lastmod = job.updatedAt.slice(0, 10);
      urls.push(entry);
      jobCount += 1;
    }
  }

  // Listed company pages (/explore/<slug>): each is a real, linkable page,
  // so every card in the directory is an anchor a crawler can follow.
  const companiesRead = await fetchJson("/api/companies", "companies");
  let companyCount = 0;
  if (companiesRead.payload) {
    const payload = companiesRead.payload as { companies?: Array<{ slug?: string }> };
    for (const company of payload.companies ?? []) {
      if (typeof company.slug !== "string" || company.slug.length === 0) continue;
      urls.push({ loc: `${origin}/explore/${encodeURIComponent(company.slug)}`, changefreq: "weekly", priority: "0.7" });
      companyCount += 1;
    }
  }

  const liveNote = `<!-- live: jobs=${jobCount} (${jobsRead.note}), companies=${companyCount} (${companiesRead.note}), api=${apiOrigin} -->\n`;
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n${liveNote}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(entry => `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n${entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>\n` : ""}    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`).join("\n")}\n</urlset>\n`;

  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
};
