// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
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
    // D-090 BYOR: the one-time bring-your-own-referrer token must never reach Sentry.
    expect(scrubSentryUrl("https://skipwait.me/r/abc123?x=1", "https://skipwait.me")).toBe("/r/[redacted]");
    expect(scrubSentryUrl("https://skipwait.me/premium?role=job_seeker", "https://skipwait.me")).toBe("/premium");
  });
  it("redacts the one-time invite API token and keeps the action suffix", () => {
    const token = "Q".repeat(43);
    expect(scrubSentryUrl(`https://skipwait.me/api/ask-invites/${token}`, "https://skipwait.me")).toBe("/api/ask-invites/[redacted]");
    expect(scrubSentryUrl(`https://skipwait.me/api/ask-invites/${token}/claim?x=1`, "https://skipwait.me")).toBe("/api/ask-invites/[redacted]/claim");
  });
});

// D-090 re-review F2 (P1): breadcrumbs (navigation and fetch) went out with the
// raw one-time token because only event.request.url was scrubbed. Synthetic
// token, a fake DSN and an intercepted envelope hook: nothing leaves the test.
describe("client Sentry breadcrumbs never carry a one-time token", () => {
  const TOKEN = "Q".repeat(43);
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

  async function captureEnvelopes(run: () => Promise<void> | void): Promise<string> {
    vi.stubEnv("VITE_SENTRY_DSN", "https://examplekey@sentry.invalid/1");
    // The SDK only instruments a fetch that looks native, so the stub says it is.
    const stub = vi.fn(async () => new Response("{}", { status: 200 }));
    stub.toString = () => "function fetch() { [native code] }";
    vi.stubGlobal("fetch", stub);
    vi.resetModules();
    const Sentry = await import("@sentry/react");
    const fresh = await import("./sentry");
    expect(fresh.initClientSentry()).toBe(true);
    const envelopes: string[] = [];
    Sentry.getClient()?.on("beforeEnvelope", envelope => { envelopes.push(JSON.stringify(envelope)); });
    await run();
    fresh.captureClientError(new Error("synthetic"));
    await Sentry.flush(2000);
    return envelopes.join("\n");
  }

  // One run covers both: the SDK keeps its fetch/history instrumentation on a
  // process-wide carrier, so a second init in the same file would not re-wrap.
  it("scrubs navigation and fetch breadcrumbs for /r/<token> and /api/ask-invites/<token>, and keeps ordinary ones", async () => {
    const sent = await captureEnvelopes(async () => {
      window.history.pushState({}, "", `/r/${TOKEN}`);
      await fetch(`/api/ask-invites/${TOKEN}`);
      await fetch(`/api/ask-invites/${TOKEN}/claim`, { method: "POST" });
      window.history.pushState({}, "", "/explore");
      await fetch("/api/companies");
    });
    expect(sent).toContain("synthetic");
    expect(sent).not.toContain(TOKEN);
    expect(sent).toContain("/api/companies");
  });
});

// D-090 post-fix regression round: request headers, error context and encoded
// or malformed route variants carried the token past the first scrub. Same
// synthetic token and intercepted envelope: nothing leaves the test.
describe("client Sentry event fields never carry a one-time token", () => {
  const TOKEN = "Q".repeat(43);
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

  async function captureEvent(event: Record<string, unknown>): Promise<string> {
    vi.stubEnv("VITE_SENTRY_DSN", "https://examplekey@sentry.invalid/1");
    vi.resetModules();
    const Sentry = await import("@sentry/react");
    const fresh = await import("./sentry");
    expect(fresh.initClientSentry()).toBe(true);
    const envelopes: string[] = [];
    Sentry.getClient()?.on("beforeEnvelope", envelope => { envelopes.push(JSON.stringify(envelope)); });
    Sentry.captureEvent(event as Parameters<typeof Sentry.captureEvent>[0]);
    await Sentry.flush(2000);
    expect(envelopes.length).toBeGreaterThan(0);
    return envelopes.join("\n");
  }

  it("scrubs request headers, query, body, context, tags, message and exception text for /r/<token>", async () => {
    const sent = await captureEvent({
      message: `failed to load /api/ask-invites/${TOKEN}/claim`,
      transaction: `/r/${TOKEN}`,
      tags: { route: `/r/${TOKEN}`, healthy: "yes" },
      extra: { nested: { url: `/r/${TOKEN}` }, list: [`/api/ask-invites/${TOKEN}`], count: 2 },
      contexts: { app: { path: `/r/${TOKEN}`, plain: "/explore" } },
      request: {
        url: `https://skipwait.me/r/${TOKEN}`,
        headers: { Referer: `https://skipwait.me/r/${TOKEN}`, "x-page": `/api/ask-invites/${TOKEN}/claim` },
        query_string: `returnTo=${encodeURIComponent(`/r/${TOKEN}`)}`,
        data: { returnTo: `/r/${TOKEN}`, role: "job_seeker" },
      },
      exception: { values: [{ type: "Error", value: `Load failed /api/ask-invites/${TOKEN}` }] },
      breadcrumbs: [{ category: "navigation", data: { from: `/r/${TOKEN}`, to: "/explore" } }],
    });
    expect(sent).not.toContain(TOKEN);
    // Ordinary telemetry survives.
    expect(sent).toContain("/explore");
    expect(sent).toContain("job_seeker");
    expect(sent).toContain("healthy");
    expect(sent).toContain("count\":2");
  });

  it("scrubs encoded and malformed route variants without throwing", async () => {
    const variants = [
      `/R/${TOKEN}`,
      `/r%2F${TOKEN}`,
      `%2Fr%2F${TOKEN}`,
      `%252Fr%252F${TOKEN}`,
      `/%72%2F${TOKEN}`,
      `/api%2Fask-invites%2F${TOKEN}`,
      `/API/ASK-INVITES/${TOKEN}`,
      `/api/ask-invites/${TOKEN}%ZZ`,
      `/r/${TOKEN}%E0%A4%A`,
    ];
    const sent = await captureEvent({
      message: "encoded route variants",
      extra: { variants },
      tags: { route: variants[0] },
      request: { url: `https://skipwait.me${variants[1]}`, headers: { Referer: variants[2] } },
      breadcrumbs: [
        { category: "navigation", data: { from: variants[1], to: variants[2] } },
        { category: "fetch", data: { url: variants[5] } },
      ],
    });
    for (const variant of variants) expect(sent, variant).not.toContain(TOKEN);
    expect(sent).toContain("encoded route variants");
  });

  it("keeps ordinary URLs, tags and text untouched", async () => {
    const sent = await captureEvent({
      message: "boom",
      transaction: "/explore",
      tags: { route: "/explore", note: "100% healthy" },
      extra: { url: "/api/companies", count: 2 },
      request: { url: "https://skipwait.me/explore?tab=jobs", headers: { Referer: "https://skipwait.me/explore" } },
    });
    expect(sent).toContain("/explore");
    expect(sent).toContain("/api/companies");
    expect(sent).toContain("boom");
    expect(sent).toContain("100% healthy");
  });
});
