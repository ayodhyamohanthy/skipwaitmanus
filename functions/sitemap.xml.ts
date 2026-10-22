// Dynamic sitemap for skipwait.me: public pages plus live jobs and
// opportunities, generated on each request from the API. Replaces the SPA
// HTML fallback that crawlers previously received at /sitemap.xml.
import { SITEMAP_STATIC_ROUTES, buildSitemapXml, companySitemapEntries, jobSitemapEntries } from "../shared/sitemap";

const DEFAULT_API_ORIGIN = "https://skipwait.me";

export const STATIC_ROUTES = SITEMAP_STATIC_ROUTES;


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
    const jobEntries = jobSitemapEntries(origin, payload.jobs ?? []);
    urls.push(...jobEntries);
    jobCount = jobEntries.length;
  }

  // Listed company pages (/explore/<slug>): each is a real, linkable page,
  // so every card in the directory is an anchor a crawler can follow.
  const companiesRead = await fetchJson("/api/companies", "companies");
  let companyCount = 0;
  if (companiesRead.payload) {
    const payload = companiesRead.payload as { companies?: Array<{ slug?: string }> };
    const companyEntries = companySitemapEntries(origin, payload.companies ?? []);
    urls.push(...companyEntries);
    companyCount = companyEntries.length;
  }

  const body = buildSitemapXml(urls, `jobs=${jobCount} (${jobsRead.note}), companies=${companyCount} (${companiesRead.note}), api=${apiOrigin}`);
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
};
