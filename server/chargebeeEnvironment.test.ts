import { describe, expect, it } from "vitest";
import { isLiveChargebeeRequest, resolveBillingEnvironment, resolveChargebeeRuntime, resolveChargebeeRuntimeForAccount, resolveChargebeeWebhookSecret, validateBillingEnvironment } from "./chargebeeEnvironment";

describe("Chargebee environment boundary", () => {
  const env = {
    BILLING_ENV: "live",
    CHARGEBEE_SITE: "skipwait-test",
    CHARGEBEE_API_KEY: "test-key",
    CHARGEBEE_WEBHOOK_SECRET: "test-webhook",
    CHARGEBEE_LIVE_SITE: "skipwait",
    CHARGEBEE_LIVE_API_KEY: "live-key",
    CHARGEBEE_LIVE_WEBHOOK_SECRET: "live-webhook",
  };

  it("uses one immutable live environment regardless of Host", () => {
    for (const host of ["skipwait.me", "attacker.example", undefined]) {
      expect(resolveChargebeeRuntime(host, env)).toEqual({ environment: "live", site: "skipwait", apiKey: "live-key" });
      expect(resolveChargebeeWebhookSecret(host, env)).toBe("live-webhook");
      expect(isLiveChargebeeRequest(host, env)).toBe(true);
    }
  });

  it("uses one immutable test environment regardless of Host", () => {
    const test = { ...env, BILLING_ENV: "test" };
    expect(resolveChargebeeRuntime("skipwait.me", test)).toEqual({ environment: "test", site: "skipwait-test", apiKey: "test-key" });
    expect(resolveChargebeeWebhookSecret("skipwait.me", test)).toBe("test-webhook");
  });

  it.each([undefined, "", "staging", "production"]) ("rejects invalid BILLING_ENV %s", value => {
    expect(() => resolveBillingEnvironment({ ...env, BILLING_ENV: value })).toThrow(/BILLING_ENV/);
  });

  it("fails startup validation when the selected environment is incomplete", () => {
    expect(() => validateBillingEnvironment({ ...env, CHARGEBEE_LIVE_WEBHOOK_SECRET: undefined })).toThrow(/CHARGEBEE_LIVE_WEBHOOK_SECRET/);
    expect(validateBillingEnvironment(env)).toBe("live");
  });
});

describe("resolveChargebeeRuntimeForAccount (REVIEWER-ISOLATION-1)", () => {
  const env = { BILLING_ENV: "live", CHARGEBEE_LIVE_SITE: "skipwait", CHARGEBEE_LIVE_API_KEY: "live-key", CHARGEBEE_TEST_SITE: "skipwait-test", CHARGEBEE_TEST_API_KEY: "test-key" };
  it("routes demo review accounts to the test site even in live mode", () => {
    const runtime = resolveChargebeeRuntimeForAccount("skipwait.me", "reviewer_seeker", env);
    expect(runtime).toEqual({ environment: "test", site: "skipwait-test", apiKey: "test-key" });
  });
  it("fails closed for demo review accounts when the test environment is not configured", () => {
    const { CHARGEBEE_TEST_SITE: _s, CHARGEBEE_TEST_API_KEY: _k, ...noTest } = env;
    expect(() => resolveChargebeeRuntimeForAccount("skipwait.me", "reviewer_seeker", noTest)).toThrow(/test environment/i);
  });
  it("leaves real members on the live site", () => {
    const runtime = resolveChargebeeRuntimeForAccount("skipwait.me", "workos_member", env);
    expect(runtime).toEqual({ environment: "live", site: "skipwait", apiKey: "live-key" });
  });
  it("live webhook secret resolution never returns a test secret", () => {
    expect(resolveChargebeeWebhookSecret("skipwait.me", { ...env, BILLING_ENV: "live", CHARGEBEE_LIVE_WEBHOOK_SECRET: "live-secret", CHARGEBEE_WEBHOOK_SECRET: "test-secret" })).toBe("live-secret");
  });
});
