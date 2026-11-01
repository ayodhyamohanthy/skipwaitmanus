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
});
