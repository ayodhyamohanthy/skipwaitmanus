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
    expect(scrubSentryPath("/email-review/abc123")).toBe("/email-review/:token");
    expect(scrubSentryPath("/share-card/xyz?foo=1")).toBe("/share-card/:token");
    expect(scrubSentryPath("/fast/r12-34abcdef")).toBe("/fast/:token");
    expect(scrubSentryPath("/refer/acme/vanity1")).toBe("/refer/:token/:token");
    expect(scrubSentryPath(`/api/ask-invites/${"secret-token"}/claim?utm_source=private`)).toBe("/api/ask-invites/:token/claim");
    expect(scrubSentryPath("/api/company-referrals/mine")).toBe("/api/company-referrals/mine");
  });

  it("redacts single-use tokens in API paths (FND-4)", () => {
    expect(scrubSentryPath("/api/referrer-fast-track/r12-34abcdef")).toBe("/api/referrer-fast-track/:token");
    expect(scrubSentryPath("/api/referrer-fast-track/vanity/acme/jane")).toBe("/api/referrer-fast-track/vanity/acme/:token");
    expect(scrubSentryPath("/api/referral-share-cards/public/xyz/image.png?v=2")).toBe("/api/referral-share-cards/public/:token/image.png");
    expect(scrubSentryPath("/api/referrer-review-links/abc123/decision")).toBe("/api/referrer-review-links/:token/decision");
    expect(scrubSentryPath("/api/documents/by-key/resumes/7/cv.pdf")).toBe("/api/documents/by-key/:token");
  });

  it("captures the scrubbed API path in the error middleware (FND-4)", async () => {
    vi.resetModules();
    const captureException = vi.fn();
    vi.doMock("@sentry/node", () => ({ init: vi.fn(), captureException, flush: vi.fn() }));
    process.env.SENTRY_DSN = "https://public@example.invalid/1";
    try {
      const sentry = await import("./sentry");
      expect(sentry.initServerSentry()).toBe(true);
      const next = vi.fn();
      sentry.sentryErrorMiddleware(new Error("boom"), { method: "POST", path: "/api/referrer-review-links/abc123/decision" } as never, {} as never, next);
      expect(captureException).toHaveBeenCalledWith(expect.any(Error), { extra: { method: "POST", path: "/api/referrer-review-links/:token/decision" } });
      expect(JSON.stringify(captureException.mock.calls)).not.toContain("abc123");
    } finally {
      delete process.env.SENTRY_DSN;
      vi.doUnmock("@sentry/node");
      vi.resetModules();
    }
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

  // D-090-BYOR re-review findings F1-F4 (Hark · 6014, reviewed d9e589c5). Each case fails
  // until its own fix: the token must never reach an envelope, and ordinary prose must survive.
  it("redacts every occurrence of a single-use link in one string (F2)", async () => {
    const { scrubSentryText } = await import("./sentry");
    const token = "invite".padEnd(43, "x");
    expect(scrubSentryText(`a /r/${token} b /r/${token}`)).not.toContain(token);
    expect(scrubSentryText(`/api/ask-invites/${token} then /r/${token}`)).not.toContain(token);
  });

  it("keeps ordinary prose intact around a question mark (F4)", async () => {
    const { scrubSentryText } = await import("./sentry");
    expect(scrubSentryText("Why did it fail? because the token expired")).toBe("Why did it fail? because the token expired");
  });

  it("keeps the token out of sampled transactions, exception values and url data (F1, F3)", async () => {
    const previousDsn = process.env.SENTRY_DSN;
    process.env.SENTRY_DSN = "https://public@example.invalid/42";
    vi.resetModules();
    const fresh = await import("./sentry");
    const Sentry = await import("@sentry/node");
    expect(fresh.initServerSentry()).toBe(true);
    const client = Sentry.getClient();
    // Sample every transaction, so the 10% production rate cannot hide the leak.
    if (client) client.getOptions().tracesSampleRate = 1;
    const envelopes: string[] = [];
    client?.on("beforeEnvelope", envelope => { envelopes.push(JSON.stringify(envelope)); });

    const express = (await import("express")).default;
    const app = express();
    app.get("/api/ask-invites/:token", (req, res) => {
      fresh.captureServerError(new Error(`landing failed for ${req.originalUrl}`));
      res.status(500).end();
    });
    const server = app.listen(0);
    const token = "invite".padEnd(43, "x");
    try {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      expect(port).toBeGreaterThan(0);
      const response = await fetch(`http://127.0.0.1:${port}/api/ask-invites/${token}?x=1`, { headers: { referer: `https://skipwait.me/r/${token}` } });
      expect(response.status).toBe(500);
      await fresh.flushServerSentry(2000);
    } finally {
      await new Promise<void>(resolve => { server.close(() => resolve()); });
      if (previousDsn === undefined) delete process.env.SENTRY_DSN;
      else process.env.SENTRY_DSN = previousDsn;
    }

    const payload = envelopes.join("\n");
    expect(payload).toContain("landing failed for");
    expect(payload).toContain('"type":"transaction"');
    expect(payload).not.toContain(token);
  });
});
