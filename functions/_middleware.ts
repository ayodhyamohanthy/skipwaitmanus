/**
 * Pages middleware: one canonical host, security headers, and an honest status
 * code for URLs that are not part of the product.
 *
 * 1. `www.skipwait.me` 301s to `skipwait.me`. Both hosts answered 200 with
 *    identical content, which split ranking signals and let the same page be
 *    indexed twice.
 * 2. An unknown path must not report 200. The single-page app matches every
 *    path, so before this rule `/home`, `/Wall`, and `/anything` all answered
 *    200 with the home page's HTML and canonical URL — an unbounded set of
 *    duplicate URLs for a crawler to walk. Only a 200 HTML response is
 *    downgraded, so a real 500, a redirect, or a non-HTML asset is untouched,
 *    and a route this list has not caught up with still renders for the
 *    visitor (it only carries a 404 status).
 *
 * Route patterns here are checked against the router by
 * @scripts/seoRouteCoverage.test.ts, which fails if @client/src/App.tsx and
 * this file disagree. Keep that test green when adding a route.
 */

/** `:name` matches exactly one path segment; a trailing `/*` matches the rest. */
export const KNOWN_ROUTE_PATTERNS: readonly string[] = [
  "/",
  "/about",
  "/cancellations",
  "/choosing-a-job-referral-platform",
  "/components",
  "/contact",
  "/conversation/:requestId",
  "/email-review/:linkToken",
  "/employer",
  "/employer/billing",
  "/employer/opportunities",
  "/employer/talent",
  "/fast/:linkCode",
  "/how-employees-refer-candidates",
  "/inbox",
  "/job-referral-platforms",
  "/jobs",
  "/messages",
  "/notifications",
  "/offline",
  "/plans",
  "/post-opportunity",
  "/premium",
  "/pricing",
  "/privacy",
  "/refer/:companySlug/:vanityAlias",
  "/referrer",
  "/referrer/impact",
  "/refunds",
  "/request",
  "/requests",
  "/settings",
  "/share",
  "/share-card/:token",
  "/shipping",
  "/start",
  "/support",
  "/terms",
  "/wall",
  "/admin/activity",
  "/admin/approvals",
  "/admin/approvals/:kind/:id",
  "/admin/flow-health",
  "/admin/partners",
  "/admin/payments",
  "/admin/privacy-requests",
  "/admin/schema",
  "/admin/smoke",
  "/admin/token-recovery",
  "/admin/users",
  "/admin",
  "/app-states",
  "/connect-assistant",
  "/developers",
  "/emails",
  "/explore",
  "/explore/:slug",
  "/guidelines",
  "/help",
  "/report",
  "/safety",
  "/sign-in",
  "/verify",
];

/**
 * `/` stays exact; every other pattern tolerates one trailing slash so Pages
 * can still answer `/about/` with its own 308 to `/about`.
 */
const KNOWN_ROUTE_RE = new RegExp(
  `^(?:${KNOWN_ROUTE_PATTERNS.map(pattern => {
    const body = pattern
      .split("/")
      .map(segment => {
        if (segment === "*") return "[^/]+(?:/[^/]+)*";
        if (segment.startsWith(":")) return "[^/]+";
        return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("/");
    return pattern === "/" ? "/" : `${body}/?`;
  }).join("|")})$`,
);

/** True when the single-page app has a real screen for this path. */
export function isKnownRoute(pathname: string): boolean {
  // Empty path segments (`//`, `/about//`) are never a real screen. They are also
  // the shape a protocol-relative redirect target takes, so they must not be
  // treated as a match here.
  if (pathname.includes("//")) return false;
  const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return KNOWN_ROUTE_RE.test(normalized);
}

const CANONICAL_HOST = "skipwait.me";
const REDIRECTED_HOSTS = new Set([`www.${CANONICAL_HOST}`]);

/** Same-origin browser security policy for Pages, assets, errors, and API proxy responses. */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://cdn.usefathom.com",
  "connect-src 'self' https://api.workos.com https://*.chargebee.com https://api.razorpay.com https://cdn.usefathom.com",
  "frame-src 'self' https://*.chargebee.com https://api.razorpay.com https://*.razorpay.com",
].join("; ");

export const onRequest: PagesFunction = async context => {
  const url = new URL(context.request.url);

  // One host, permanently, so ranking signals and share links agree.
  if (REDIRECTED_HOSTS.has(url.hostname)) {
    const target = `${url.protocol}//${CANONICAL_HOST}${url.pathname}${url.search}`;
    return new Response(null, {
      status: 301,
      headers: { location: target, "cache-control": "public, max-age=3600" },
    });
  }

  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY);
  const contentType = headers.get("content-type") || "";
  const isHtml = contentType.includes("text/html");
  if (isHtml) headers.delete("Access-Control-Allow-Origin");

  // Only a successful HTML page for an unrouted path becomes a 404. Anything
  // already non-200 keeps its own status so real failures stay visible.
  const status = response.status === 200 && isHtml && !isKnownRoute(url.pathname) ? 404 : response.status;
  return new Response(response.body, { status, statusText: response.statusText, headers });
};