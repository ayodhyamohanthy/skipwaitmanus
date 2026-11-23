import { describe, expect, it, vi } from "vitest";
import { onRequest } from "../functions/_middleware";
import { CSP_ENFORCED } from "./securityHeaders";

const ENFORCED = "Content-Security-Policy";
const REPORT_ONLY = "Content-Security-Policy-Report-Only";
const COLLECTED_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://cdn.usefathom.com https://static.cloudflareinsights.com",
  "connect-src 'self' https://api.workos.com https://*.chargebee.com https://api.razorpay.com https://cdn.usefathom.com https://o4511355895676928.ingest.de.sentry.io",
  "frame-src 'self' https://*.chargebee.com https://api.razorpay.com https://*.razorpay.com",
  "report-uri /api/csp-report",
].join("; ");

describe("Pages CSP enforcement after collection (D-350)", () => {
  it.each([
    { name: "home HTML", path: "/", status: 200, expectedStatus: 200, type: "text/html", body: "<html>Home</html>" },
    { name: "sign-in HTML", path: "/sign-in", status: 200, expectedStatus: 200, type: "text/html", body: "<html>Sign in</html>" },
    { name: "unknown HTML", path: "/unrouted-csp-test", status: 200, expectedStatus: 404, type: "text/html", body: "<html>Not found</html>" },
    { name: "JavaScript asset", path: "/assets/app.js", status: 200, expectedStatus: 200, type: "application/javascript", body: "console.log('app')" },
    { name: "missing asset", path: "/assets/missing.js", status: 404, expectedStatus: 404, type: "text/plain", body: "Not found" },
    { name: "HTML error", path: "/sign-in", status: 500, expectedStatus: 500, type: "text/html", body: "<html>Retry</html>" },
    { name: "API error", path: "/api/example", status: 503, expectedStatus: 503, type: "application/json", body: '{"error":"unavailable"}' },
    { name: "upstream redirect", path: "/sign-in", status: 302, expectedStatus: 302, type: "text/plain", body: "Redirecting" },
  ])("enforces the collected policy on $name and preserves response behavior", async ({ path, status, expectedStatus, type, body }) => {
    const upstream = new Response(body, {
      status,
      statusText: "Upstream status",
      headers: {
        "content-type": type,
        "cache-control": "private, no-store",
        "set-cookie": "test_session=fixture; Secure; HttpOnly",
        "x-request-id": "csp-fixture",
        "access-control-allow-origin": "https://example.test",
        location: "/next",
        [ENFORCED]: "default-src 'none'; report-uri /old-enforcing-report",
        [REPORT_ONLY]: "default-src 'none'; report-uri /old-report",
      },
    });
    const next = vi.fn(async () => upstream);
    const response = await onRequest({ request: new Request(`https://skipwait.me${path}`), next });

    expect(next).toHaveBeenCalledOnce();
    expect(response.headers.get(ENFORCED)).toBe(COLLECTED_POLICY);
    expect(response.headers.has(REPORT_ONLY)).toBe(false);
    expect(response.status).toBe(expectedStatus);
    expect(response.statusText).toBe("Upstream status");
    expect(await response.text()).toBe(body);
    for (const name of ["content-type", "cache-control", "set-cookie", "x-request-id", "location"]) {
      expect(response.headers.get(name), name).toBe(upstream.headers.get(name));
    }
    expect(response.headers.get("access-control-allow-origin")).toBe(type === "text/html" ? null : "https://example.test");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Strict-Transport-Security")).toBe("max-age=15552000; includeSubDomains");
    expect(response.headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(upstream.headers.get(ENFORCED)).toBe("default-src 'none'; report-uri /old-enforcing-report");
    expect(upstream.headers.get(REPORT_ONLY)).toBe("default-src 'none'; report-uri /old-report");
  });

  it("keeps a bodyless report acknowledgement bodyless", async () => {
    const response = await onRequest({
      request: new Request("https://skipwait.me/api/csp-report", { method: "POST" }),
      next: async () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } }),
    });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get(ENFORCED)).toBe(COLLECTED_POLICY);
    expect(response.headers.has(REPORT_ONLY)).toBe(false);
  });

  it("preserves the canonical-host redirect before upstream handling", async () => {
    const next = vi.fn(async () => new Response("must not be used"));
    const response = await onRequest({ request: new Request("https://www.skipwait.me/sign-in?next=%2Frequests"), next });
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://skipwait.me/sign-in?next=%2Frequests");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(await response.text()).toBe("");
  });

  it("enforces after the completed collection interval", () => {
    expect(CSP_ENFORCED).toBe(true);
  });
});
