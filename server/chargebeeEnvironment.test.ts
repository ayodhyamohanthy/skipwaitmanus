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
});
