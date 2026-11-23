// The one scrubber both Sentry clients run on every event, transaction and breadcrumb (shared/telemetryScrub.ts).
// It lives under server/ because vitest does not collect shared/**; the client wiring is pinned in
// client/src/lib/sentry.test.ts and the end-to-end server path in server/sentryPrivacy.test.ts.
import { describe, expect, it } from "vitest";
import { scrubTelemetryBreadcrumb, scrubTelemetryEvent, stripUrlQuery, type ScrubbableEvent } from "@shared/telemetryScrub";
import { scrubServerUrl } from "./sentry";

describe("telemetry scrubber", () => {
  it("keeps only allowlisted request headers and never a body, cookie, query string or environment", () => {
    const event: ScrubbableEvent = {
      request: {
        url: "https://skipwait.me/api/referrer-review-links/tok_123/decision?code=9",
        data: '{"email":"asha@gmail.com","password":"secret"}',
        cookies: { app_session_id: "s3ss10n" },
        query_string: "code=9",
        env: { REMOTE_ADDR: "203.0.113.9" },
        headers: { Cookie: "app_session_id=s3ss10n", Authorization: "Bearer t0ken", "X-Forwarded-For": "203.0.113.9", "User-Agent": "Mozilla/5.0", Referer: "https://skipwait.me/reset-password?token=wos_reset", "Content-Type": "application/json" },
      },
      user: { ip_address: "203.0.113.9", email: "asha@gmail.com" },
    };
    scrubTelemetryEvent(event, scrubServerUrl);
    expect(event.request).toEqual({
      url: "https://skipwait.me/api/referrer-review-links/[redacted]/decision",
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://skipwait.me/reset-password", "Content-Type": "application/json" },
    });
    expect(event.user).toEqual({});
  });

  it("removes query strings, bodies and headers from breadcrumbs, spans and the trace context", () => {
    const event: ScrubbableEvent = {
      breadcrumbs: [
        { data: { url: "https://api.workos.com/user_management/users?email=asha%40gmail.com", "http.query": "email=asha%40gmail.com", "http.fragment": "x", "http.method": "GET", status_code: 200 } },
        { data: { from: "/reset-password?token=wos_reset", to: "/reset-password" } },
      ],
      spans: [
        { op: "http.client", description: "GET https://api.workos.com/user_management/users?email=asha%40gmail.com", data: { "url.full": "https://api.workos.com/user_management/users?email=x", "url.query": "email=x", "http.request.header.authorization": "Bearer sk_live", "http.request.body.data": "{}" } },
        { op: "db", description: "SELECT * FROM users WHERE id = ?", data: { "db.system": "mysql" } },
      ],
      contexts: { trace: { data: { "http.target": "/api/auth/password/sign-in?debug=1", "http.method": "POST" } } },
    };
    scrubTelemetryEvent(event, scrubServerUrl);
    expect(event.breadcrumbs).toEqual([
      { data: { url: "https://api.workos.com/user_management/users", "http.method": "GET", status_code: 200 } },
      { data: { from: "/reset-password", to: "/reset-password" } },
    ]);
    expect(event.spans).toEqual([
      { op: "http.client", description: "GET https://api.workos.com/user_management/users", data: { "url.full": "https://api.workos.com/user_management/users" } },
      { op: "db", description: "SELECT * FROM users WHERE id = ?", data: { "db.system": "mysql" } },
    ]);
    expect(event.contexts?.trace?.data).toEqual({ "http.target": "/api/auth/password/sign-in", "http.method": "POST" });
  });

  it("redacts single-use link paths in transaction names and breadcrumbs recorded later", () => {
    const named: ScrubbableEvent = { transaction: "GET /api/referrer-fast-track/r12-34abcdef?x=1" };
    expect(scrubTelemetryEvent(named, scrubServerUrl).transaction).toBe("GET /api/referrer-fast-track/[redacted]");
    expect(scrubTelemetryEvent({ transaction: "ask-expiry-sweep" }, scrubServerUrl).transaction).toBe("ask-expiry-sweep");
    expect(scrubTelemetryBreadcrumb({ data: { url: "/email-review/abc123?y=2" } }, scrubServerUrl).data).toEqual({ url: "/email-review/[redacted]" });
  });

  it("server URLs keep their origin, lose query and fragment, and a malformed one is fully redacted", () => {
    expect(scrubServerUrl("http://127.0.0.1:3000/api/auth/password/forgot?email=a%40b.c#frag")).toBe("http://127.0.0.1:3000/api/auth/password/forgot");
    expect(scrubServerUrl("/api/auth/workos/callback?code=abc&state=xyz")).toBe("/api/auth/workos/callback");
    expect(scrubServerUrl("http://[bad")).toBe("[redacted]");
    expect(stripUrlQuery("/a?b#c")).toBe("/a");
    expect(stripUrlQuery("/a#c?b")).toBe("/a");
  });
});
