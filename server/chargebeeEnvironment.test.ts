import { describe, expect, it } from "vitest";
import { isLiveChargebeeRequest, resolveChargebeeRuntime, resolveChargebeeWebhookSecret } from "./chargebeeEnvironment";

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
  });

  it("does not route lookalike or disabled hosts to live billing", () => {
    expect(isLiveChargebeeRequest("www.skipwait.me", env)).toBe(false);
    expect(isLiveChargebeeRequest("skipwait.me", { ...env, CHARGEBEE_LIVE_ENABLED: "false" })).toBe(false);
  });

  it("fails closed when a live host is enabled without a separate live API key", () => {
    expect(() => resolveChargebeeRuntime("skipwait.me", { ...env, CHARGEBEE_LIVE_API_KEY: undefined })).toThrow("Live Chargebee API key is not configured");
  });
});
