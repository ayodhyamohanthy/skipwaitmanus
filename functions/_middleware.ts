import { applyRouteSeo, classifyRoute } from "./_lib/routeSeo";
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
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY);
  const contentType = headers.get("content-type") || "";
  if (contentType.includes("text/html")) headers.delete("Access-Control-Allow-Origin");
  // SPA shell routes get their own canonical/robots, and unknown paths a real 404 (#96).
  if (contentType.includes("text/html") && context.request.method === "GET" && response.status === 200) {
    const pathname = new URL(context.request.url).pathname;
    const decision = classifyRoute(pathname);
    if (decision.kind !== "pass") {
      headers.delete("content-length");
      const html = applyRouteSeo(await response.text(), pathname, decision);
      return new Response(html, { status: decision.kind === "not_found" ? 404 : 200, headers });
    }
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
