import { describe, expect, it } from "vitest";
import { captureClientError, initClientSentry, isClientSentryActive, scrubSentryUrl } from "./sentry";

describe("client Sentry wiring", () => {
  it("stays inactive without VITE_SENTRY_DSN and never throws", () => {
    expect(initClientSentry()).toBe(false);
    expect(isClientSentryActive()).toBe(false);
    expect(() => captureClientError(new Error("boom"))).not.toThrow();
  });

  it("redacts single-use link tokens and query strings from event URLs", () => {
    expect(scrubSentryUrl("https://skipwait.me/email-review/abc123", "https://skipwait.me")).toBe("/email-review/[redacted]");
    expect(scrubSentryUrl("https://skipwait.me/share-card/xyz?x=1#y", "https://skipwait.me")).toBe("/share-card/[redacted]");
    expect(scrubSentryUrl("https://skipwait.me/fast/r12-34abcdef", "https://skipwait.me")).toBe("/fast/[redacted]");
    expect(scrubSentryUrl("https://skipwait.me/premium?role=job_seeker", "https://skipwait.me")).toBe("/premium");
  });
});
