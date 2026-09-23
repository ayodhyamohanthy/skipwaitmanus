// Served-HTML SEO for SPA routes (#96). Every client route used to get the
// homepage shell with canonical=/ and HTTP 200, including paths that do not
// exist. Crawlers read the served HTML, not what JS changes later, so each
// route's canonical, title and robots must be right before the app runs.
// Copy reuses what the rendered pages already say.
const SITE = "https://skipwait.me";

type RouteMeta = { title: string; description: string };

/** Public, indexable SPA routes. Keys are exact paths. */
export const INDEXABLE_ROUTES: Record<string, RouteMeta> = {
  "/jobs": { title: "Browse roles worth a referral · skipwait.me", description: "Search published roles and request a private referral from a verified employee. Referrers stay anonymous." },
  "/referrer": { title: "Become a verified referrer · skipwait.me", description: "Help people at your company get referred, privately. Verify your work email and choose which requests you help with." },
  "/plans": { title: "Plans · skipwait.me", description: "Free monthly referral credits, plus Pro and Max plans for more private referral requests." },
  "/wall": { title: "Opportunity Wall · skipwait.me", description: "Hiring signals shared by verified employees without exposing their identity." },
  "/support": { title: "Support · skipwait.me", description: "Get help with skipwait.me private job referrals, credits and your account." },
};

/** Real routes that must not be indexed (private, per-user or transactional). */
const NOINDEX_EXACT = new Set(["/start", "/request", "/requests", "/notifications", "/messages", "/share", "/inbox", "/settings", "/offline", "/premium", "/employer", "/post-opportunity", "/referrer/impact"]);
const NOINDEX_PREFIXES = ["/conversation/", "/email-review/", "/employer/", "/admin/"];

/** Paths another handler owns: the homepage, prerendered pages, share links, API, assets. */
const PASS_THROUGH_EXACT = new Set(["/", "/terms", "/privacy", "/refunds", "/cancellations", "/shipping", "/about", "/contact", "/pricing", "/sitemap.xml"]);
const PASS_THROUGH_PREFIXES = ["/api/", "/assets/", "/fast/", "/refer/", "/share-card/"];

export type RouteDecision = { kind: "pass" } | { kind: "index"; meta: RouteMeta } | { kind: "noindex" } | { kind: "not_found" };

export function classifyRoute(pathname: string): RouteDecision {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (PASS_THROUGH_EXACT.has(path) || PASS_THROUGH_PREFIXES.some(p => path.startsWith(p))) return { kind: "pass" };
  if (/\.[a-z0-9]{2,12}$/i.test(path)) return { kind: "pass" }; // static files
  const meta = INDEXABLE_ROUTES[path];
  if (meta) return { kind: "index", meta };
  if (NOINDEX_EXACT.has(path) || NOINDEX_PREFIXES.some(p => path.startsWith(p))) return { kind: "noindex" };
  return { kind: "not_found" };
}

const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const put = (html: string, re: RegExp, tag: string) => (re.test(html) ? html.replace(re, tag) : html.replace("</head>", `${tag}\n</head>`));

export function applyRouteSeo(html: string, pathname: string, decision: RouteDecision): string {
  if (decision.kind === "pass") return html;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (decision.kind === "index") {
    const t = esc(decision.meta.title), d = esc(decision.meta.description), u = esc(`${SITE}${path}`);
    let out = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`);
    out = put(out, /<meta name="description"[^>]*>/, `<meta name="description" content="${d}" />`);
    out = put(out, /<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${u}" />`);
    out = put(out, /<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${t}" />`);
    out = put(out, /<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${d}" />`);
    out = put(out, /<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${u}" />`);
    return out;
  }
  // noindex and not_found: drop the homepage canonical and add robots noindex.
  return put(html.replace(/<link rel="canonical"[^>]*>\s*/, ""), /<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex" />');
}
