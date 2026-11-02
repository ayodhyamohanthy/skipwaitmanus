import { describe, expect, it } from "vitest";
import { captureClientError, initClientSentry, isClientSentryActive, scrubSentryUrl } from "./sentry";

describe("client Sentry wiring", () => {
  it("stays inactive without VITE_SENTRY_DSN and never throws", () => {
    expect(initClientSentry()).toBe(false);
    expect(isClientSentryActive()).toBe(false);
    expect(() => captureClientError(new Error("boom"))).not.toThrow();
  });

  it("redacts single-use link tokens and query strings from event URLs", () => {
    expect(scrubSentryUrl("https://skipwait.me/email-review/abc123", "https://skipwait.me")).toBe("/email-review/:token");
    expect(scrubSentryUrl("https://skipwait.me/share-card/xyz?x=1#y", "https://skipwait.me")).toBe("/share-card/:token");
    expect(scrubSentryUrl("https://skipwait.me/fast/r12-34abcdef", "https://skipwait.me")).toBe("/fast/:token");
    expect(scrubSentryUrl("https://skipwait.me/premium?role=job_seeker", "https://skipwait.me")).toBe("/premium");
  });

  it("redacts single-use tokens in API URLs (FND-4)", () => {
    expect(scrubSentryUrl("https://skipwait.me/api/referrer-review-links/abc123/decision", "https://skipwait.me")).toBe("/api/referrer-review-links/:token/decision");
    expect(scrubSentryUrl("/api/referral-share-cards/public/xyz?x=1", "https://skipwait.me")).toBe("/api/referral-share-cards/public/:token");
    expect(scrubSentryUrl("https://skipwait.me/refer/acme/jane", "https://skipwait.me")).toBe("/refer/:token/:token");
  });
});
