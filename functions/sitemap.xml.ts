// Dynamic sitemap for skipwait.me: public pages plus live jobs and
// opportunities, generated on each request from the API. Replaces the SPA
// HTML fallback that crawlers previously received at /sitemap.xml.
const DEFAULT_API_ORIGIN = "https://skipwait.me";

const STATIC_ROUTES: Array<{ path: string; changefreq: string; priority: string }> = [
  // Only URLs that serve their own canonical and content (#96).
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/wall", changefreq: "hourly", priority: "0.9" },
  { path: "/jobs", changefreq: "daily", priority: "0.9" },
  { path: "/referrer", changefreq: "weekly", priority: "0.8" },
  { path: "/pricing", changefreq: "weekly", priority: "0.7" },
  { path: "/plans", changefreq: "weekly", priority: "0.6" },
  { path: "/about", changefreq: "monthly", priority: "0.4" },
  { path: "/contact", changefreq: "monthly", priority: "0.4" },
  { path: "/support", changefreq: "monthly", priority: "0.3" },
  { path: "/privacy", changefreq: "monthly", priority: "0.3" },
  { path: "/terms", changefreq: "monthly", priority: "0.3" },
  { path: "/refunds", changefreq: "monthly", priority: "0.3" },
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
  // /wall is listed only while it has openings: an empty wall is not worth crawling (#98).
  let wallHasOpenings = false;
  try {
    const response = await fetch(`${apiOrigin}/api/opportunities`, { headers: { accept: "application/json" } });
    if (response.ok) wallHasOpenings = (((await response.json()) as { opportunities?: unknown[] }).opportunities ?? []).length > 0;
  } catch { /* treat as empty */ }
  const urls = STATIC_ROUTES.filter(route => route.path !== "/wall" || wallHasOpenings).map(route => ({ loc: `${origin}${route.path}`, changefreq: route.changefreq, priority: route.priority }));

  // Per-job URLs return once jobs have crawlable pages of their own (#96, #100).

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(entry => `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n${entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>\n` : ""}    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`).join("\n")}\n</urlset>\n`;

  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
};
