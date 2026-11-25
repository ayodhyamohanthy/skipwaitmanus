import { describe, expect, it } from "vitest";
import {
  DEMO_TEST_BILLING_EMAIL,
  canonicalEmailOf,
  demoTestBillingEnabled,
  demoTestReference,
  isDemoTestBillingAccount,
  isDemoTestReference,
  resolveBillingRuntimeForAccount,
  resolveDemoTestWebhookSecret,
} from "./demoTestBilling";

/**
 * QA-demo-test-billing (D-393): identity alone selects the TEST runtime. These
 * tests pin the gate, the fail-closed path and the ledger marker.
 */
const LIVE = {
  BILLING_ENV: "live",
  CHARGEBEE_LIVE_SITE: "skipwait",
  CHARGEBEE_LIVE_API_KEY: "live-key",
  CHARGEBEE_LIVE_WEBHOOK_SECRET: "live-secret",
  CHARGEBEE_SITE: "skipwait-test",
  CHARGEBEE_API_KEY: "test-key",
  CHARGEBEE_WEBHOOK_SECRET: "test-secret",
} as const;

const demo = { email: DEMO_TEST_BILLING_EMAIL };
const other = { email: "someone@example.com" };

describe("demo test billing identity gate (D-393)", () => {
  it("switch off: the demo account keeps today's live runtime", () => {
    const runtime = resolveBillingRuntimeForAccount(demo, { ...LIVE });
    expect(runtime).toEqual({ environment: "live", site: "skipwait", apiKey: "live-key" });
    expect(isDemoTestBillingAccount(demo, { ...LIVE })).toBe(false);
  });

  it("switch on: only the demo account gets the TEST runtime", () => {
    const env = { ...LIVE, DEMO_TEST_BILLING_ENABLED: "true" };
    expect(resolveBillingRuntimeForAccount(demo, env)).toEqual({ environment: "test", site: "skipwait-test", apiKey: "test-key" });
    expect(resolveBillingRuntimeForAccount(other, env)).toEqual({ environment: "live", site: "skipwait", apiKey: "live-key" });
    expect(resolveBillingRuntimeForAccount(null, env)).toEqual({ environment: "live", site: "skipwait", apiKey: "live-key" });
  });

  it("matches the canonical email only, trimmed and case-insensitive", () => {
    const env = { ...LIVE, DEMO_TEST_BILLING_ENABLED: "true" };
    expect(isDemoTestBillingAccount({ email: "  SEEKER@Reviewer.SkipWait.me " }, env)).toBe(true);
    expect(canonicalEmailOf({ email: "  SEEKER@Reviewer.SkipWait.me " })).toBe(DEMO_TEST_BILLING_EMAIL);
    // A look-alike address on the same domain is not the demo account.
    expect(isDemoTestBillingAccount({ email: "seeker+1@reviewer.skipwait.me" }, env)).toBe(false);
    expect(isDemoTestBillingAccount({ email: "referrer@reviewer.skipwait.me" }, env)).toBe(false);
  });

  it("fails closed when the TEST keys are missing instead of falling back to live", () => {
    const env = { BILLING_ENV: "live", CHARGEBEE_LIVE_SITE: "skipwait", CHARGEBEE_LIVE_API_KEY: "live-key", DEMO_TEST_BILLING_ENABLED: "true" };
    expect(() => resolveBillingRuntimeForAccount(demo, env)).toThrow(/TEST API key\/site is not configured/);
  });

  it("reads the switch only from the exact value true", () => {
    expect(demoTestBillingEnabled({ DEMO_TEST_BILLING_ENABLED: "true" })).toBe(true);
    expect(demoTestBillingEnabled({ DEMO_TEST_BILLING_ENABLED: " TRUE " })).toBe(true);
    expect(demoTestBillingEnabled({ DEMO_TEST_BILLING_ENABLED: "1" })).toBe(false);
    expect(demoTestBillingEnabled({})).toBe(false);
  });

  it("uses the TEST webhook secret for the demo endpoint", () => {
    expect(resolveDemoTestWebhookSecret({ ...LIVE })).toBe("test-secret");
    expect(resolveDemoTestWebhookSecret({ BILLING_ENV: "live" })).toBeUndefined();
  });

  it("marks and recognises TEST-site ledger references", () => {
    const marked = demoTestReference("payment-credit-42");
    expect(marked).toBe("demo-test:payment-credit-42");
    expect(isDemoTestReference(marked)).toBe(true);
    expect(isDemoTestReference("payment-credit-42")).toBe(false);
    expect(isDemoTestReference(null)).toBe(false);
  });
});
