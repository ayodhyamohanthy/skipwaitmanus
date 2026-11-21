import { describe, expect, it } from "vitest";
import { scrubTelemetryBreadcrumb, scrubTelemetryEvent } from "@shared/telemetryScrub";
import { scrubSentryText, scrubSentryUrlText } from "./sentry";

const EMAIL = "person@example.invalid";
const SECRET = "fixture-secret-value";

function scrub<T extends Parameters<typeof scrubTelemetryEvent>[0]>(event: T): T {
  return scrubTelemetryEvent(event, scrubSentryUrlText, scrubSentryText);
}

describe("Sentry telemetry scrubbing", () => {
  it("drops the request body, cookies, query and environment and allowlists headers", () => {
    const event = scrub({
      request: {
        url: "https://skipwait.me/api/referrer-review-links/private-link/decision?debug=fixture",
        data: JSON.stringify({ email: EMAIL, password: SECRET }),
        cookies: { app_session_id: SECRET },
        query_string: { token: SECRET },
        env: { REMOTE_ADDR: "203.0.113.9" },
        headers: {
          Cookie: `app_session_id=${SECRET}`,
          Authorization: `Bearer ${SECRET}`,
          "X-Forwarded-For": "203.0.113.9",
          "X-Email": EMAIL,
          "User-Agent": "Fixture browser",
          Referer: `https://skipwait.me/reset-password?token=${SECRET}#private`,
          "Content-Type": "application/json",
        },
      },
      user: { ip_address: "203.0.113.9", email: EMAIL, id: "fixture-id" },
    });
    expect(event.request).toEqual({
      url: "https://skipwait.me/api/referrer-review-links/:token/decision",
      headers: {
        "User-Agent": "Fixture browser",
        Referer: "https://skipwait.me/reset-password",
        "Content-Type": "application/json",
      },
    });
    expect(event.user).toEqual({ id: "fixture-id" });
  });

  it("scrubs reset URLs and credentials from breadcrumbs, spans, trace data and diagnostic fields", () => {
    const resetUrl = `/reset-password?token=${SECRET}#private`;
    const directoryUrl = `https://example.invalid/users?email=${encodeURIComponent(EMAIL)}`;
    const event = scrub({
      transaction: `POST ${resetUrl}`,
      sdkProcessingMetadata: { dynamicSamplingContext: { transaction: resetUrl, release: "fixture-release" } },
      breadcrumbs: [{ data: { from: resetUrl, to: "/sign-in", body: { password: SECRET }, "http.query": SECRET } }],
      spans: [
        { op: "http.client", description: `GET ${directoryUrl}`, data: {
          "url.full": directoryUrl, "url.query": EMAIL, "http.fragment": SECRET, "http.method": "GET",
          "http.request.header.authorization": [SECRET], "http.request.body.data": SECRET,
        } },
        { op: "db", description: "SELECT id FROM users WHERE id = ?", data: { "db.system": "mysql" } },
      ],
      contexts: { trace: { data: { "http.target": resetUrl, "http.method": "POST" } } },
      extra: { context: { email: EMAIL, newPassword: SECRET, passwordResetToken: SECRET, role: "job_seeker" } },
      exception: { values: [{ value: `Lookup failed for ${EMAIL}` }, { value: `Failed to open ${encodeURIComponent(resetUrl)}` }] },
    });
    expect(event.transaction).toBe("POST /reset-password");
    expect(event.sdkProcessingMetadata.dynamicSamplingContext).toEqual({ transaction: "/reset-password", release: "fixture-release" });
    expect(event.breadcrumbs).toEqual([{ data: { from: "/reset-password", to: "/sign-in" } }]);
    expect(event.spans).toEqual([
      { op: "http.client", description: "GET https://example.invalid/users", data: { "url.full": "https://example.invalid/users", "http.method": "GET" } },
      { op: "db", description: "SELECT id FROM users WHERE id = ?", data: { "db.system": "mysql" } },
    ]);
    expect(event.contexts.trace.data).toEqual({ "http.target": "/reset-password", "http.method": "POST" });
    expect(event.extra).toEqual({ context: { role: "job_seeker" } });
    expect(JSON.stringify(event)).not.toContain(SECRET);
    expect(JSON.stringify(event)).not.toContain(EMAIL);
  });

  it("preserves the existing link-path rules and ordinary diagnostics", () => {
    expect(scrub({ transaction: "GET /api/ask-invites/private-link/claim?debug=1" }).transaction).toBe("GET /api/ask-invites/:token/claim");
    expect(scrub({ transaction: "ask-expiry-sweep", message: "Why did it fail? Try again" })).toEqual({
      transaction: "ask-expiry-sweep", message: "Why did it fail? Try again",
    });
    const crumb = { data: { url: "/api/documents/by-key/users/private/cv.pdf?x=1" } };
    expect(scrubTelemetryBreadcrumb(crumb, scrubSentryUrlText, scrubSentryText).data).toEqual({ url: "/api/documents/by-key/:token" });
    const alreadyScrubbed = scrubTelemetryBreadcrumb(crumb, scrubSentryUrlText, scrubSentryText);
    expect(scrubTelemetryBreadcrumb(alreadyScrubbed, scrubSentryUrlText, scrubSentryText)).toEqual(alreadyScrubbed);
  });
});
