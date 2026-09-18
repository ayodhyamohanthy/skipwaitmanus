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
    expect(scrubSentryPath("/api/company-referrals/mine")).toBe("/api/company-referrals/mine");
  });
});
