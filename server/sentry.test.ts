import { describe, expect, it, vi } from "vitest";
import { captureServerError, initServerSentry, isServerSentryActive, scrubSentryPath, sentryErrorMiddleware } from "./sentry";

describe("server Sentry wiring", () => {
  it("stays inactive without SENTRY_DSN and never throws", () => {
    delete process.env.SENTRY_DSN;
    expect(initServerSentry()).toBe(false);
    expect(isServerSentryActive()).toBe(false);
    expect(() => captureServerError(new Error("boom"))).not.toThrow();
    const next = vi.fn();
    const error = new Error("route failure");
    sentryErrorMiddleware(error, { method: "GET", path: "/api/x" } as never, {} as never, next);
    expect(next).toHaveBeenCalledWith(error);
  });

  it("redacts single-use link tokens from captured paths", () => {
    expect(scrubSentryPath("/email-review/abc123")).toBe("/email-review/[redacted]");
    expect(scrubSentryPath("/share-card/xyz?foo=1")).toBe("/share-card/[redacted]");
    expect(scrubSentryPath("/fast/r12-34abcdef")).toBe("/fast/[redacted]");
    expect(scrubSentryPath("/refer/acme/vanity1")).toBe("/refer/[redacted]");
    expect(scrubSentryPath(`/api/ask-invites/${"secret-token"}/claim?utm_source=private`)).toBe("/api/ask-invites/[redacted]/claim");
    expect(scrubSentryPath("/api/company-referrals/mine")).toBe("/api/company-referrals/mine");
  });

  // D-090-BYOR review finding H1 (P1, privacy §4.3.16): the server SDK attaches the
  // incoming request to every event captured inside it, so the invite token reached
  // Sentry in `transaction`, `request.url` and the `referer` header even though the
  // middleware scrubbed `extra.path`. This fails until init() installs the scrubbers.
  it("keeps a one-time invite token out of the server SDK's own request scope", async () => {
    const previousDsn = process.env.SENTRY_DSN;
    process.env.SENTRY_DSN = "https://public@example.invalid/42";
    vi.resetModules();
    const fresh = await import("./sentry");
    const Sentry = await import("@sentry/node");
    expect(fresh.initServerSentry()).toBe(true);
    const envelopes: string[] = [];
    Sentry.getClient()?.on("beforeEnvelope", envelope => { envelopes.push(JSON.stringify(envelope)); });

    const express = (await import("express")).default;
    const app = express();
    app.get("/api/ask-invites/:token", (_req, res) => {
      fresh.captureServerError(new Error("invite landing failed"));
      res.status(500).end();
    });
    app.get("/api/ask-invites/:token/claim", (_req, res) => {
      fresh.captureServerError(new Error("invite claim failed"));
      res.status(500).end();
    });
    const server = app.listen(0);
    const token = "invite".padEnd(43, "x");
    try {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      expect(port).toBeGreaterThan(0);
      for (const path of [`/api/ask-invites/${token}`, `/api/ask-invites/${token}/claim`]) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { referer: `https://skipwait.me/r/${token}` } });
        expect(response.status).toBe(500);
      }
      await fresh.flushServerSentry(2000);
    } finally {
      await new Promise<void>(resolve => { server.close(() => resolve()); });
      if (previousDsn === undefined) delete process.env.SENTRY_DSN;
      else process.env.SENTRY_DSN = previousDsn;
    }

    const payload = envelopes.join("\n");
    // The event must really have been captured, or "no token" would prove nothing.
    expect(payload).toContain("invite landing failed");
    expect(payload).not.toContain(token);
  });
});
