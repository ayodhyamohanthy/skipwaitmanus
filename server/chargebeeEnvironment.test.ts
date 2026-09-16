import { afterEach, describe, expect, it } from "vitest";
import { billingHost, isLiveChargebeeRequest, resolveChargebeeRuntime, resolveChargebeeWebhookSecret } from "./chargebeeEnvironment";

describe("Chargebee environment boundary", () => {
  const env = {
    CHARGEBEE_SITE: "skipwait-test",
    CHARGEBEE_API_KEY: "test-key",
    CHARGEBEE_WEBHOOK_SECRET: "test-webhook",
    CHARGEBEE_LIVE_ENABLED: "true",
    CHARGEBEE_LIVE_DOMAIN: "skipwait.me",
    CHARGEBEE_LIVE_SITE: "skipwait",
    CHARGEBEE_LIVE_API_KEY: "live-key",
    CHARGEBEE_LIVE_WEBHOOK_SECRET: "live-webhook",
  };

  it("uses live credentials only for the explicitly enabled live domain", () => {
    expect(resolveChargebeeRuntime("skipwait.me:443", env)).toEqual({ environment: "live", site: "skipwait", apiKey: "live-key" });
    expect(resolveChargebeeWebhookSecret("skipwait.me", env)).toBe("live-webhook");
    expect(resolveChargebeeRuntime("bridgeref-ybuthfmw.manus.space", env)).toEqual({ environment: "test", site: "skipwait-test", apiKey: "test-key" });
    expect(resolveChargebeeWebhookSecret("bridgeref-ybuthfmw.manus.space", env)).toBe("test-webhook");
    expect(resolveChargebeeRuntime("3000-im5hmgawqc67j45jjlcss-a6a715a0.us3.manus.computer", env)).toEqual({ environment: "test", site: "skipwait-test", apiKey: "test-key" });
    expect(resolveChargebeeWebhookSecret("3000-im5hmgawqc67j45jjlcss-a6a715a0.us3.manus.computer", env)).toBe("test-webhook");
  });

  it("uses the managed domain only while it is the one explicit temporary live host", () => {
    const rollout = { ...env, CHARGEBEE_LIVE_DOMAIN: "bridgeref-ybuthfmw.manus.space" };
    expect(resolveChargebeeRuntime("bridgeref-ybuthfmw.manus.space", rollout)).toEqual({ environment: "live", site: "skipwait", apiKey: "live-key" });
    expect(resolveChargebeeWebhookSecret("bridgeref-ybuthfmw.manus.space", rollout)).toBe("live-webhook");
    expect(resolveChargebeeRuntime("skipwait.me", rollout)).toEqual({ environment: "test", site: "skipwait-test", apiKey: "test-key" });
  });

  it("does not route lookalike or disabled hosts to live billing", () => {
    expect(isLiveChargebeeRequest("www.skipwait.me", env)).toBe(false);
    expect(isLiveChargebeeRequest("skipwait.me", { ...env, CHARGEBEE_LIVE_ENABLED: "false" })).toBe(false);
    expect(isLiveChargebeeRequest("skipwait.me", { ...env, CHARGEBEE_LIVE_DOMAIN: undefined })).toBe(false);
  });

  it("fails closed when a live host is enabled without a separate live API key", () => {
    expect(() => resolveChargebeeRuntime("skipwait.me", { ...env, CHARGEBEE_LIVE_API_KEY: undefined })).toThrow("Live Chargebee API key is not configured");
  });

  // The public host drives which secret validates a webhook and which API
  // key/site a checkout uses, so it must not be steerable by a request header.
  //
  // Production reaches the API through a Cloudflare Pages Function that CANNOT set
  // `Host` (Cloudflare forbids it on an outbound fetch), so it forwards the
  // browser's host as `X-Forwarded-Host`. That host is honoured — reading the raw
  // `Host` instead meant live billing silently ran on the test site — but only on
  // evidence the request came from the proxy: `PROXY_SHARED_SECRET` plus a matching
  // `x-skipwait-proxy` marker. Without that proof the raw `Host` is used.
  describe("public host resolution", () => {
    const originalSecret = process.env.PROXY_SHARED_SECRET;
    afterEach(() => {
      if (originalSecret === undefined) delete process.env.PROXY_SHARED_SECRET;
      else process.env.PROXY_SHARED_SECRET = originalSecret;
    });

    it("uses the proxy-forwarded host when the proxy proves it forwarded the request", () => {
      process.env.PROXY_SHARED_SECRET = "s3cret";
      const proxied = { headers: { host: "skipwaitmanus.ayodhya-711.workers.dev", "x-forwarded-host": "skipwait.me", "x-skipwait-proxy": "s3cret" } };
      expect(billingHost(proxied)).toBe("skipwait.me");
      expect(isLiveChargebeeRequest(billingHost(proxied), env)).toBe(true);
      expect(resolveChargebeeWebhookSecret(billingHost(proxied), env)).toBe("live-webhook");
    });

    it("ignores an unmarked forwarded host, so a caller cannot pick the webhook secret", () => {
      process.env.PROXY_SHARED_SECRET = "s3cret";
      const spoofed = { headers: { host: "skipwaitmanus.ayodhya-711.workers.dev", "x-forwarded-host": "skipwait.me" } };
      expect(billingHost(spoofed)).toBe("skipwaitmanus.ayodhya-711.workers.dev");
      expect(resolveChargebeeWebhookSecret(billingHost(spoofed), env)).toBe("test-webhook");
      expect(resolveChargebeeRuntime(billingHost(spoofed), env).environment).toBe("test");
    });

    it("rejects a forged proxy marker", () => {
      process.env.PROXY_SHARED_SECRET = "s3cret";
      const forged = { headers: { host: "skipwaitmanus.ayodhya-711.workers.dev", "x-forwarded-host": "skipwait.me", "x-skipwait-proxy": "wrong" } };
      expect(billingHost(forged)).toBe("skipwaitmanus.ayodhya-711.workers.dev");
      expect(isLiveChargebeeRequest(billingHost(forged), env)).toBe(false);
    });

    it("cannot downgrade the live webhook secret to the test secret", () => {
      process.env.PROXY_SHARED_SECRET = "s3cret";
      const spoofed = { headers: { host: "skipwait.me", "x-forwarded-host": "not-skipwait.me", "x-skipwait-proxy": "s3cret" } };
      // The proxy-forwarded host wins, so a delivery signed with the test secret is rejected.
      expect(resolveChargebeeWebhookSecret(billingHost(spoofed), env)).toBe("test-webhook");
    });

    it("falls back to the forwarded host when no secret is configured (documented default)", () => {
      delete process.env.PROXY_SHARED_SECRET;
      const proxied = { headers: { host: "skipwaitmanus.ayodhya-711.workers.dev", "x-forwarded-host": "skipwait.me" } };
      expect(billingHost(proxied)).toBe("skipwait.me");
      expect(isLiveChargebeeRequest(billingHost(proxied), env)).toBe(true);
    });

    it("treats a missing or repeated Host header as unknown and falls back to test", () => {
      delete process.env.PROXY_SHARED_SECRET;
      expect(billingHost({ headers: {} })).toBeUndefined();
      expect(billingHost({ headers: { host: ["a.example", "b.example"] } })).toBeUndefined();
      expect(resolveChargebeeWebhookSecret(billingHost({ headers: {} }), env)).toBe("test-webhook");
      expect(isLiveChargebeeRequest(billingHost({ headers: {} }), env)).toBe(false);
    });
  });
});
